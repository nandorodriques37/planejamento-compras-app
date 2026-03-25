import React, { useState, useMemo, useCallback } from 'react';
import { useLocation } from 'wouter';
import { CalendarDays, CalendarClock } from 'lucide-react';
import { toast } from 'sonner';

import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from '@/components/ui/dialog';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { Label } from '@/components/ui/label';
import { Checkbox } from '@/components/ui/checkbox';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';

import { usePedidosAprovacao } from '../hooks/usePedidosAprovacao';
import type { PedidoItem, PedidoKPIs, PedidoAprovacao } from '../lib/types';
import type { DadosCompletos, SKUCadastro, ProjecaoSKU, WeekDistribution, PedidoPendente, SemanaInfo } from '../lib/calculationEngine';
import {
  calcularSemanasComLT,
  parseMesAno,
  distribuirPedidoMultiMes,
  getStatusSKU,
  hasShelfLifeRisk,
  agruparPendenciasPorMes,
  calcularPendenciaAteData
} from '../lib/calculationEngine';
import { diasNoMes } from '../lib/engine/utils/dates';
import { buildFluxoPassivos, invalidateDataLakeCache } from '../lib/api/mockDataLake';
import { syncPedidosProjetados } from '../lib/dataAdapter';

interface SendOrderDialogProps {
  isOpen: boolean;
  onOpenChange: (open: boolean) => void;
  dados: DadosCompletos | null;
  cadastroMap: Map<string, SKUCadastro>;
  estoqueLojaMap: Map<string, number>;
  dadosFiltrados: ProjecaoSKU[];
  projecoesComEdicoes: ProjecaoSKU[];
  mesesVisiveis: string[];
  semanasInfo: SemanaInfo[];
  selectedWeeks: Set<number>;
  weeklyEdits: Map<string, number[]>;
  coverageWeeklyEdits: Map<string, number[]>;
  onSuccess: () => void;
}

export default function SendOrderDialog({
  isOpen,
  onOpenChange,
  dados,
  cadastroMap,
  estoqueLojaMap,
  dadosFiltrados,
  projecoesComEdicoes,
  mesesVisiveis,
  semanasInfo,
  selectedWeeks,
  weeklyEdits,
  coverageWeeklyEdits,
  onSuccess
}: SendOrderDialogProps) {
  const [, navigate] = useLocation();
  const { adicionarPedido } = usePedidosAprovacao();

  const [mesesProgramar, setMesesProgramar] = useState(0);
  const [prazoPagamentoOverride, setPrazoPagamentoOverride] = useState<number | null>(null);

  // Prazo de pagamento padrão do fornecedor (lookup)
  const prazoPagamentoPadrao = useMemo(() => {
    if (!dados || !dados.fornecedores?.length) return null;
    const fornecedoresUnicos = [...new Set(
      dadosFiltrados.flatMap(proj => {
        const cad = cadastroMap.get(proj.CHAVE);
        return cad ? [cad['fornecedor comercial']] : [];
      })
    )];
    for (const nome of fornecedoresUnicos) {
      const forn = dados.fornecedores.find(f => f.nome === nome);
      if (forn) return forn.PRAZO_PAGAMENTO;
    }
    return null;
  }, [dados, dadosFiltrados, cadastroMap]);

  const prazoPagamentoEfetivo = prazoPagamentoOverride ?? prazoPagamentoPadrao;

  // Reseta estados locais ao abrir
  React.useEffect(() => {
    if (isOpen) {
      setMesesProgramar(0);
      setPrazoPagamentoOverride(null);
    }
  }, [isOpen]);

  const pendenciasSKUMap = useMemo(() => {
    const map = new Map<string, PedidoPendente[]>();
    if (dados?.pedidos_pendentes) {
      dados.pedidos_pendentes.forEach(p => {
        if (!map.has(p.chave)) map.set(p.chave, []);
        map.get(p.chave)!.push(p);
      });
    }
    return map;
  }, [dados?.pedidos_pendentes]);

  const getPendenciaRelevante = useCallback((chave: string, ltDias: number, pendenciaTotal: number) => {
    const pedidos = pendenciasSKUMap.get(chave);
    if (!pedidos || pedidos.length === 0) return pendenciaTotal;
    const dataCorte = new Date();
    dataCorte.setDate(dataCorte.getDate() + ltDias);
    return calcularPendenciaAteData(pedidos, dataCorte);
  }, [pendenciasSKUMap]);

  const confirmarEnvioAprovacao = useCallback(() => {
    if (selectedWeeks.size === 0 || !dados) return;
    const mesAtual = mesesVisiveis[0];
    const { ano: anoMesAt, mes: numMesAt } = parseMesAno(mesAtual);
    const diasReaisMesAtual = diasNoMes(anoMesAt, numMesAt);

    // ── Montagem dos Itens do Pedido ─────────────────────────────────────────
    const itens: PedidoItem[] = dadosFiltrados.flatMap(proj => {
      const cad = cadastroMap.get(proj.CHAVE);
      if (!cad) return [];

      const ltDias = cad.LT ?? 0;

      // Resolução de prioridade: weeklyEdits → coverageWeeklyEdits → distribuição LT-aware
      let distribuicao: WeekDistribution[];
      const manual = weeklyEdits.get(proj.CHAVE);
      if (manual && manual.length === semanasInfo.length) {
        distribuicao = manual.map(val => ({
          valor: val,
          mesOrigem: mesAtual,
          isCurrentMonth: true
        }));
      } else {
        const coverage = coverageWeeklyEdits.get(proj.CHAVE);
        if (coverage && coverage.length === semanasInfo.length) {
          distribuicao = coverage.map(val => ({
            valor: val,
            mesOrigem: mesAtual,
            isCurrentMonth: true
          }));
        } else {
          // Distribuição LT-aware
          const refDate = new Date(dados.metadata.data_referencia + 'T00:00:00');
          const { ano, mes } = parseMesAno(mesAtual);
          const semanasComLT = calcularSemanasComLT(ano, mes, refDate.getDate(), ltDias);

          const pedidoPorMes: Record<string, number> = {};
          pedidoPorMes[mesAtual] = proj.meses[mesAtual]?.PEDIDO || 0;
          for (const sem of semanasComLT) {
            if (sem.mesChegada && sem.mesChegada !== mesAtual && !(sem.mesChegada in pedidoPorMes)) {
              pedidoPorMes[sem.mesChegada] = proj.meses[sem.mesChegada]?.PEDIDO || 0;
            }
          }

          distribuicao = distribuirPedidoMultiMes(mesAtual, pedidoPorMes, semanasComLT);
        }
      }

      const entregas: Record<string, number> = {};
      let totalQuantidade = 0;

      // Somar semanas selecionadas
      for (const i of selectedWeeks) {
        const dist = distribuicao[i];
        if (!dist || dist.valor === 0) continue;
        const targetMonth = mesAtual;
        entregas[targetMonth] = (entregas[targetMonth] ?? 0) + dist.valor;
      }
      totalQuantidade = Object.values(entregas).reduce((a, b) => a + b, 0);

      // Programação para meses futuros
      for (let m = 1; m <= mesesProgramar; m++) {
        const proxMes = mesesVisiveis[m];
        if (proxMes) {
          const proxMesPedido = proj.meses[proxMes]?.PEDIDO || 0;
          const jaContribuido = entregas[proxMes] ?? 0;
          const adicional = Math.max(0, proxMesPedido - jaContribuido);
          if (adicional > 0) {
            entregas[proxMes] = jaContribuido + adicional;
            totalQuantidade += adicional;
          }
        }
      }

      if (totalQuantidade === 0) return [];

      const qtdCompradaMes1 = entregas[mesAtual] ?? 0;
      const sellOut = proj.meses[mesAtual]?.SELL_OUT ?? 0;
      const demandaDiaria = sellOut > 0 ? sellOut / diasReaisMesAtual : 0;
      const coberturaDiasHoje = demandaDiaria > 0 ? Math.round(cad.ESTOQUE / demandaDiaria) : null;

      const consumoAteLT = demandaDiaria * ltDias;
      const pendenciaRelevante = getPendenciaRelevante(proj.CHAVE, ltDias, cad.PENDENCIA ?? 0);
      const estoqueProjetadoChegada = Math.round(Math.max(0, cad.ESTOQUE - consumoAteLT + pendenciaRelevante) + qtdCompradaMes1);
      const coberturaDiasChegada = demandaDiaria > 0 ? Math.round(estoqueProjetadoChegada / demandaDiaria) : null;

      const shelfLifeRisk = cad.SHELF_LIFE > 0 && sellOut > 0 && hasShelfLifeRisk(estoqueProjetadoChegada, sellOut, diasReaisMesAtual, cad.SHELF_LIFE);

      return [{
        chave: proj.CHAVE,
        nomeProduto: cad['nome produto'],
        fornecedor: cad['fornecedor comercial'],
        cd: cad.codigo_deposito_pd,
        entregas,
        totalQuantidade,
        estoqueAtual: cad.ESTOQUE,
        estoqueSeguranca: cad.EST_SEGURANCA,
        pendencias: cad.PENDENCIA ?? 0,
        sellOutMes: sellOut,
        coberturaDiasHoje,
        estoqueProjetadoChegada,
        coberturaDiasChegada,
        estoqueLojaAtual: estoqueLojaMap.get(proj.CHAVE) ?? 0,
        custoLiquido: cad.CUSTO_LIQUIDO,
        shelfLifeRisk,
        shelfLifeDias: cad.SHELF_LIFE,
      }];
    });

    if (itens.length === 0) {
      toast.error('Nenhum SKU com quantidade nas semanas selecionadas');
      return;
    }

    // ── Cálculo de KPIs ─────────────────────────────────────────────────────
    const fornecedoresNoPedido = new Set(itens.map(it => it.fornecedor));
    const projecaoMap = new Map(projecoesComEdicoes.map(p => [p.CHAVE, p]));

    let totalSkusFornecedorGlobais = 0;
    Array.from(cadastroMap.values()).forEach(cad => {
      if (fornecedoresNoPedido.has(cad['fornecedor comercial'])) {
        totalSkusFornecedorGlobais++;
      }
    });

    let somaPonderadaFornHoje = 0;
    let somaVolumesFornHoje = 0;
    let somaPonderadaFornChegada = 0;
    let somaVolumesFornChegada = 0;
    let somaPonderadaFornLoja = 0;
    let somaVolumesFornLoja = 0;

    const itensPedidoMap = new Map(itens.map(it => [it.chave, it]));

    projecoesComEdicoes.forEach(proj => {
      const cad = cadastroMap.get(proj.CHAVE);
      if (!cad || !fornecedoresNoPedido.has(cad['fornecedor comercial'])) return;

      const sellOutAtual = proj.meses[mesAtual]?.SELL_OUT ?? 0;
      if (sellOutAtual <= 0) return;
      const demandaDiaria = sellOutAtual / diasReaisMesAtual;

      const cobHoje = cad.ESTOQUE / demandaDiaria;
      somaPonderadaFornHoje += cobHoje * sellOutAtual;
      somaVolumesFornHoje += sellOutAtual;

      const lt = cad.LT ?? 0;
      const consumoAteLT = demandaDiaria * lt;
      const itemPedido = itensPedidoMap.get(proj.CHAVE);
      const qtdComprada = itemPedido ? (itemPedido.entregas[mesAtual] ?? 0) : 0;
      const pendRelevante = getPendenciaRelevante(proj.CHAVE, lt, cad.PENDENCIA ?? 0);
      const estoqueNaChegada = Math.round(Math.max(0, cad.ESTOQUE - consumoAteLT + pendRelevante) + qtdComprada);
      const cobChegada = estoqueNaChegada / demandaDiaria;
      somaPonderadaFornChegada += cobChegada * sellOutAtual;
      somaVolumesFornChegada += sellOutAtual;

      const estoqueLojaForn = estoqueLojaMap.get(proj.CHAVE) ?? 0;
      somaPonderadaFornLoja += (estoqueLojaForn / demandaDiaria) * sellOutAtual;
      somaVolumesFornLoja += sellOutAtual;
    });

    const coberturaFornecedorDiasHojeGlobais: number | null = somaVolumesFornHoje > 0
      ? Math.round(somaPonderadaFornHoje / somaVolumesFornHoje) : null;
    const coberturaFornecedorDiasChegadaGlobais: number | null = somaVolumesFornChegada > 0
      ? Math.round(somaPonderadaFornChegada / somaVolumesFornChegada) : null;

    let somaPonderadaPedHoje = 0;
    let somaVolumesPedHoje = 0;
    let skusOk = 0;
    let skusAtencao = 0;
    let skusCriticos = 0;
    let skusCriticosHojeGlobais = 0;
    let estoqueObjetivoUnidadesGlobais = 0;
    let estoqueChegadaUnidadesGlobais = 0;
    let skusCompradosSemNecessidadeGlobais = 0;
    let skusShelfLifeRiskGlobais = 0;
    let somaPonderadaPedChegada = 0;
    let somaVolumesPedChegada = 0;

    itens.forEach(item => {
      const cad = cadastroMap.get(item.chave);
      const proj = projecaoMap.get(item.chave);
      if (!cad || !proj) return;

      const quantidadeMesAtual = item.entregas[mesAtual] || 0;

      if (quantidadeMesAtual > 0) {
        const s = getStatusSKU(proj.meses, [mesAtual], cad);
        if (s === 'ok') skusOk++;
        else if (s === 'warning') skusAtencao++;
        else skusCriticos++;
      }

      if (cad.ESTOQUE <= cad.EST_SEGURANCA) {
        skusCriticosHojeGlobais++;
        item.motivoCompraCEO = 'urgente';
      }

      const objetivoMes = proj.meses[mesAtual]?.ESTOQUE_OBJETIVO ?? 0;
      estoqueObjetivoUnidadesGlobais += objetivoMes;

      const estoqueNaChegada = item.estoqueProjetadoChegada ?? 0;
      estoqueChegadaUnidadesGlobais += estoqueNaChegada;

      const sellOut = proj.meses[mesAtual]?.SELL_OUT ?? 0;
      const demandaDiaria = sellOut > 0 ? sellOut / diasReaisMesAtual : 0;
      const lt = cad.LT ?? 0;
      const consumoAteLT = demandaDiaria * lt;
      const pendRelevantePed = getPendenciaRelevante(item.chave, lt, cad.PENDENCIA ?? 0);
      const estoqueSemPedido = Math.max(0, Math.round((cad.ESTOQUE || 0) - consumoAteLT + pendRelevantePed));

      if (estoqueSemPedido > 0 && estoqueSemPedido >= objetivoMes && objetivoMes > 0) {
        skusCompradosSemNecessidadeGlobais++;
        item.motivoCompraCEO = 'excesso';
      } else if (item.motivoCompraCEO !== 'urgente') {
        item.motivoCompraCEO = 'normal';
      }

      if (sellOut > 0) {
        const cobHoje = cad.ESTOQUE / demandaDiaria;
        somaPonderadaPedHoje += cobHoje * sellOut;
        somaVolumesPedHoje += sellOut;

        const cobChegadaCD = estoqueNaChegada / demandaDiaria;
        somaPonderadaPedChegada += cobChegadaCD * sellOut;
        somaVolumesPedChegada += sellOut;
      }

      if (item.shelfLifeRisk) {
        skusShelfLifeRiskGlobais++;
      }
    });

    const coberturaPedidoDiasHojeGlobais: number | null = somaVolumesPedHoje > 0
      ? Math.round(somaPonderadaPedHoje / somaVolumesPedHoje) : null;
    const coberturaDataChegadaDiasGlobais: number | null = somaVolumesPedChegada > 0
      ? Math.round(somaPonderadaPedChegada / somaVolumesPedChegada) : null;

    let somaLTPonderado = 0;
    let somaVolumeLT = 0;
    itens.forEach(item => {
      const cad = cadastroMap.get(item.chave);
      if (!cad || !cad.LT || cad.LT <= 0) return;
      somaLTPonderado += cad.LT * item.totalQuantidade;
      somaVolumeLT += item.totalQuantidade;
    });
    const ltMedioPonderado = somaVolumeLT > 0 ? Math.round(somaLTPonderado / somaVolumeLT) : null;
    let dataChegadaPrevistaPrimeiroLote: string | null = null;
    if (ltMedioPonderado !== null) {
      const dataEnvio = new Date();
      dataEnvio.setDate(dataEnvio.getDate() + ltMedioPonderado);
      dataChegadaPrevistaPrimeiroLote = dataEnvio.toISOString();
    }

    const mesesParaAprovacao = [mesAtual];
    for (let m = 1; m <= mesesProgramar; m++) {
      if (mesesVisiveis[m]) mesesParaAprovacao.push(mesesVisiveis[m]);
    }

    // Pendencias aggregadas por mes / SKU para não onerar o loop
    // Recuperar todos os pedidos pendentes
    const pendenciasBrutas = dados.pedidos_pendentes || [];
    const _pendenciasSKUMap = new Map<string, PedidoPendente[]>();
    pendenciasBrutas.forEach((p: PedidoPendente) => {
        if (!_pendenciasSKUMap.has(p.chave)) _pendenciasSKUMap.set(p.chave, []);
        _pendenciasSKUMap.get(p.chave)!.push(p);
    });

    const arrivalDataMap = new Map<string, Map<string, { estoqueNaChegada: number; estoqueSemPedido: number }>>();

    projecoesComEdicoes.forEach(proj => {
      const cad = cadastroMap.get(proj.CHAVE);
      if (!cad || !fornecedoresNoPedido.has(cad['fornecedor comercial'])) return;

      const monthData = new Map<string, { estoqueNaChegada: number; estoqueSemPedido: number }>();
      const itemPed = itensPedidoMap.get(proj.CHAVE);
      const lt = cad.LT ?? 0;

      const pedidosSKU = _pendenciasSKUMap.get(proj.CHAVE) || [];
      const pendAgregadas = pedidosSKU.length > 0
        ? agruparPendenciasPorMes(pedidosSKU, mesesParaAprovacao)
        : null;
      
      const estoqueInicialEvol = cad.ESTOQUE || 0;

      for (let mi = 0; mi < mesesParaAprovacao.length; mi++) {
        const mes = mesesParaAprovacao[mi];
        const sellOutMes = proj.meses[mes]?.SELL_OUT ?? 0;
        const { ano: anoM, mes: numM } = parseMesAno(mes);
        const diasReaisM = diasNoMes(anoM, numM);
        const dd = sellOutMes > 0 ? sellOutMes / diasReaisM : 0;
        const qtdComprada = itemPed ? (itemPed.entregas[mes] ?? 0) : 0;
        const consumo = dd * lt;

        if (mi === 0) {
          const pendRel = getPendenciaRelevante(proj.CHAVE, lt, cad.PENDENCIA ?? 0);
          const baseEstoqueMomentoChegada = Math.max(0, estoqueInicialEvol - consumo + pendRel);
          monthData.set(mes, {
            estoqueNaChegada: Math.round(baseEstoqueMomentoChegada + qtdComprada),
            estoqueSemPedido: Math.round(baseEstoqueMomentoChegada),
          });
        } else {
          const mesAnterior = mesesParaAprovacao[mi - 1];
          const estoqueFinalMesAnterior = proj.meses[mesAnterior]?.ESTOQUE_PROJETADO ?? 0;
          const pendenciasMes = pendAgregadas ? (pendAgregadas[mes] || 0) : 0;
          
          monthData.set(mes, {
            estoqueNaChegada: Math.max(0, Math.round(estoqueFinalMesAnterior + qtdComprada - sellOutMes + pendenciasMes)),
            estoqueSemPedido: Math.max(0, Math.round(estoqueFinalMesAnterior - sellOutMes + pendenciasMes)),
          });
        }
      }
      arrivalDataMap.set(proj.CHAVE, monthData);
    });

    const kpisMensais: Record<string, any> = {};

    mesesParaAprovacao.forEach((mesTarget) => {
      let somaPonderadaPedMes = 0;
      let somaVolumesPedMes = 0;
      let okMes = 0;
      let atencaoMes = 0;
      let criticosMes = 0;
      let estoqueObjetivoMesTarget = 0;
      let estoqueChegadaMesTarget = 0;
      let skusCriticosHojeMesTarget = 0;
      let skusCompradosSemNecessidadeMesTarget = 0;
      let skusShelfLifeRiskMesTarget = 0;

      let somaPondFornHojeMes = 0;
      let somaVolFornHojeMes = 0;
      let somaPondFornChegMes = 0;
      let somaVolFornChegMes = 0;

      let somaPondPedHojeMes = 0;
      let somaVolPedHojeMes = 0;
      let demandaDiariaTotalMes = 0;
      let estoqueChegadaMes = 0;

      projecoesComEdicoes.forEach(proj => {
        const cad = cadastroMap.get(proj.CHAVE);
        if (!cad || !fornecedoresNoPedido.has(cad['fornecedor comercial'])) return;

        const sellOutMes = proj.meses[mesTarget]?.SELL_OUT ?? 0;
        const { ano: anoMT2, mes: numMT2 } = parseMesAno(mesTarget);
        const diasReaisMT2 = diasNoMes(anoMT2, numMT2);
        const demandaDiariaMes = sellOutMes > 0 ? sellOutMes / diasReaisMT2 : 0;

        if (sellOutMes > 0) {
          const cobHojeF = cad.ESTOQUE / demandaDiariaMes;
          somaPondFornHojeMes += cobHojeF * sellOutMes;
          somaVolFornHojeMes += sellOutMes;

          const arrDataItemForn = arrivalDataMap.get(proj.CHAVE)?.get(mesTarget);
          if (arrDataItemForn) {
            const cobChegA = arrDataItemForn.estoqueNaChegada / demandaDiariaMes;
            somaPondFornChegMes += cobChegA * sellOutMes;
            somaVolFornChegMes += sellOutMes;
          }
        }
      });

      itens.forEach(item => {
        const cad = cadastroMap.get(item.chave);
        const proj = projecaoMap.get(item.chave);
        if (!cad || !proj) return;

        const quantidadeCompradaMes = item.entregas[mesTarget] || 0;
        const sellOutMes = proj.meses[mesTarget]?.SELL_OUT ?? 0;
        const { ano: anoMT, mes: numMT } = parseMesAno(mesTarget);
        const diasReaisMesAtualTemp = diasNoMes(anoMT, numMT);

        const s = getStatusSKU(proj.meses, [mesTarget], cad);
        if (s === 'ok') okMes++;
        else if (s === 'warning') atencaoMes++;
        else criticosMes++;

        if (quantidadeCompradaMes > 0 && cad.ESTOQUE <= cad.EST_SEGURANCA) {
          skusCriticosHojeMesTarget++;
        }

        if (sellOutMes > 0 && quantidadeCompradaMes > 0) {
          somaPonderadaPedMes += (cad.ESTOQUE / (sellOutMes / diasReaisMesAtualTemp)) * sellOutMes;
          somaVolumesPedMes += sellOutMes;
        }

        const objetivoMesTarget = proj.meses[mesTarget]?.ESTOQUE_OBJETIVO ?? 0;
        estoqueObjetivoMesTarget += objetivoMesTarget;

        const demandaDiaria = sellOutMes > 0 ? sellOutMes / diasReaisMesAtualTemp : 0;
        const arrDataItem = arrivalDataMap.get(item.chave)?.get(mesTarget);
        const estoqueNaChegadaMes = arrDataItem?.estoqueNaChegada ?? 0;
        estoqueChegadaMesTarget += estoqueNaChegadaMes;

        const estoqueSemPedido = arrDataItem?.estoqueSemPedido ?? 0;
        if (quantidadeCompradaMes > 0 || item.totalQuantidade > 0) {
          if (estoqueSemPedido > 0 && estoqueSemPedido >= objetivoMesTarget && objetivoMesTarget > 0) {
            skusCompradosSemNecessidadeMesTarget++;
          }
        }

        if (demandaDiaria > 0) {
          estoqueChegadaMes += estoqueNaChegadaMes;
          demandaDiariaTotalMes += demandaDiaria;

          somaPondPedHojeMes += (cad.ESTOQUE / demandaDiaria) * sellOutMes;
          somaVolPedHojeMes += sellOutMes;
        }

        if (cad.SHELF_LIFE > 0 && sellOutMes > 0 && hasShelfLifeRisk(estoqueNaChegadaMes, sellOutMes, 30, cad.SHELF_LIFE)) {
          skusShelfLifeRiskMesTarget++;
        }
      });

      const coberturaPedidoDiasMes = somaVolumesPedMes > 0 ? Math.round(somaPonderadaPedMes / somaVolumesPedMes) : null;
      const coberturaDataChegadaDiasMes = demandaDiariaTotalMes > 0 ? Math.round(estoqueChegadaMes / demandaDiariaTotalMes) : null;

      kpisMensais[mesTarget] = {
        coberturaPedidoDias: coberturaPedidoDiasMes,
        coberturaDataChegadaDias: coberturaDataChegadaDiasMes,
        skusOk: okMes,
        skusAtencao: atencaoMes,
        skusCriticos: criticosMes,
        estoqueObjetivoUnidades: estoqueObjetivoMesTarget,
        estoqueChegadaUnidades: estoqueChegadaMesTarget,
        skusCriticosHoje: skusCriticosHojeMesTarget,
        skusCompradosSemNecessidade: skusCompradosSemNecessidadeMesTarget,
        skusShelfLifeRisk: skusShelfLifeRiskMesTarget,
        totalSkusFornecedor: totalSkusFornecedorGlobais,
        coberturaFornecedorDiasHoje: somaVolFornHojeMes > 0 ? Math.round(somaPondFornHojeMes / somaVolFornHojeMes) : null,
        coberturaFornecedorDiasChegada: somaVolFornChegMes > 0 ? Math.round(somaPondFornChegMes / somaVolFornChegMes) : null,
        coberturaPedidoDiasHoje: somaVolPedHojeMes > 0 ? Math.round(somaPondPedHojeMes / somaVolPedHojeMes) : null,
      };
    });

    const fornecedoresUnicos = [...new Set(itens.map(it => it.fornecedor))];
    const fornecedorNome = fornecedoresUnicos.join(', ');

    let somaLivreAPagar = 0;
    const fluxosGlobais = buildFluxoPassivos(dados as any);
    fluxosGlobais.forEach(p => {
      if (p.origem !== 'pedidos_projetados' && fornecedoresUnicos.includes(p.fornecedor)) {
        somaLivreAPagar += p.valor;
      }
    });

    const valorTotalPedido = itens.reduce((acc, it) => acc + (it.totalQuantidade * (it.custoLiquido || 0)), 0);
    const totalAPagarR$ = somaLivreAPagar + valorTotalPedido;

    let sellOutDiarioRS = 0;
    projecoesComEdicoes.forEach(proj => {
      const cad = cadastroMap.get(proj.CHAVE);
      if (!cad || !fornecedoresUnicos.includes(cad['fornecedor comercial'])) return;
      
      const sellOutAtual = proj.meses[mesAtual]?.SELL_OUT ?? 0;
      if (sellOutAtual > 0) {
        const demandaDiaria = sellOutAtual / diasReaisMesAtual;
        sellOutDiarioRS += demandaDiaria * (cad.CUSTO_LIQUIDO || 0);
      }
    });

    const pmpProjetado = sellOutDiarioRS > 0 ? Math.round(totalAPagarR$ / sellOutDiarioRS) : undefined;

    const kpis: PedidoKPIs = {
      coberturaFornecedorDiasGlobais: coberturaFornecedorDiasHojeGlobais,
      coberturaPedidoDiasGlobais: coberturaPedidoDiasHojeGlobais,
      dataChegadaPrevistaPrimeiroLote,
      coberturaDataChegadaDiasGlobais,
      skusOkGlobais: skusOk,
      skusAtencaoGlobais: skusAtencao,
      skusCriticosGlobais: skusCriticos,
      estoqueObjetivoUnidadesGlobais,
      estoqueChegadaUnidadesGlobais,
      skusCriticosHojeGlobais,
      skusCompradosSemNecessidadeGlobais,
      skusShelfLifeRiskGlobais,
      totalSkusFornecedorGlobais,
      coberturaFornecedorDiasHojeGlobais,
      coberturaFornecedorDiasChegadaGlobais,
      coberturaPedidoDiasHojeGlobais,
      pmpProjetado,
      pmeLojaGlobais: somaVolumesFornLoja > 0 ? Math.round(somaPonderadaFornLoja / somaVolumesFornLoja) : null,
      meses: kpisMensais
    };

    const pedido: PedidoAprovacao = {
      id: crypto.randomUUID(),
      criadoEm: new Date().toISOString(),
      mesesProgramados: mesesParaAprovacao,
      status: 'pendente',
      itens,
      totalSkus: itens.length,
      totalQuantidade: itens.reduce((acc, it) => acc + it.totalQuantidade, 0),
      totalValorPedidos: itens.reduce((acc, it) => acc + (it.totalQuantidade * (it.custoLiquido || 0)), 0),
      fornecedorNome,
      kpis,
      prazoPagamentoPadrao: prazoPagamentoPadrao ?? undefined,
      prazoPagamento: prazoPagamentoEfetivo ?? undefined,
    };

    adicionarPedido(pedido);
    syncPedidosProjetados(projecoesComEdicoes, cadastroMap, mesesParaAprovacao).then(() => {
      invalidateDataLakeCache();
    });
    onOpenChange(false);
    onSuccess();
    
    toast.success('Pedido enviado para aprovação', {
      description: `${itens.length} SKUs · Programado para ${mesesParaAprovacao.length} ${mesesParaAprovacao.length === 1 ? 'mês' : 'meses'}`
    });
    
    navigate('/aprovacao');
  }, [
    selectedWeeks, dados, mesesVisiveis, semanasInfo, dadosFiltrados,
    cadastroMap, projecoesComEdicoes, weeklyEdits, coverageWeeklyEdits,
    estoqueLojaMap, mesesProgramar, prazoPagamentoPadrao, prazoPagamentoEfetivo,
    adicionarPedido, onOpenChange, onSuccess, navigate
  ]);

  return (
    <Dialog open={isOpen} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[425px]">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <CalendarDays className="w-5 h-5 text-primary" />
            Programar Compras
          </DialogTitle>
          <DialogDescription>
            Você está prestes a enviar os pedidos das semanas selecionadas para aprovação. Deseja estender essas compras para meses futuros de forma programada?
          </DialogDescription>
        </DialogHeader>
        <div className="py-4">
          <RadioGroup
            value={String(mesesProgramar)}
            onValueChange={(val) => setMesesProgramar(Number(val))}
            className="flex flex-col gap-3 max-h-[40vh] overflow-y-auto pr-2 custom-scrollbar"
          >
            <div className="flex items-start space-x-3 border rounded-lg p-3 cursor-pointer hover:bg-muted/50 transition-colors min-h-[4rem]">
              <RadioGroupItem value="0" id="r0" className="mt-1" />
              <Label htmlFor="r0" className="flex flex-col flex-1 cursor-pointer gap-1">
                <div className="font-semibold text-foreground text-sm">
                  Apenas Mês Atual ({mesesVisiveis[0] ? mesesVisiveis[0].replace('_', '-').split('-').reverse().join('/') : ''})
                </div>
                <div className="text-xs text-muted-foreground font-normal leading-relaxed">
                  Soma apenas as semanas selecionadas
                </div>
              </Label>
            </div>

            {mesesVisiveis.slice(1).map((_, index) => {
              const addMonths = index + 1;
              if (addMonths > 11) return null;

              return (
                <div key={addMonths} className="flex items-start space-x-3 border rounded-lg p-3 cursor-pointer hover:bg-muted/50 transition-colors min-h-[4rem]">
                  <RadioGroupItem value={String(addMonths)} id={`r${addMonths}`} className="mt-1" />
                  <Label htmlFor={`r${addMonths}`} className="flex flex-col flex-1 cursor-pointer gap-1">
                    <div className="font-semibold text-foreground text-sm">
                      +{addMonths} {addMonths === 1 ? 'Mês Programado' : 'Meses Programados'}
                    </div>
                    <div className="text-xs text-muted-foreground font-normal leading-relaxed">
                      Inclui o total projetado para {addMonths === 1 ? 'o próximo mês inteiro' : `os próximos ${addMonths} meses`}
                    </div>
                  </Label>
                </div>
              );
            })}
          </RadioGroup>

          {prazoPagamentoPadrao !== null && (
            <div className="border-t pt-4 mt-3">
              <div className="flex items-center gap-2 mb-2">
                <CalendarClock className="w-4 h-4 text-primary" />
                <span className="text-sm font-medium text-foreground">Prazo de Pagamento</span>
              </div>
              <div className="text-xs text-muted-foreground mb-3">
                Padrão do fornecedor: <strong>{prazoPagamentoPadrao} dias</strong>
              </div>
              <div className="flex items-center gap-2">
                <Checkbox
                  id="alterarPrazo"
                  checked={prazoPagamentoOverride !== null}
                  onCheckedChange={(checked) => {
                    if (checked) {
                      setPrazoPagamentoOverride(prazoPagamentoPadrao);
                    } else {
                      setPrazoPagamentoOverride(null);
                    }
                  }}
                />
                <Label htmlFor="alterarPrazo" className="text-xs cursor-pointer">
                  Alterar prazo de pagamento
                </Label>
              </div>
              {prazoPagamentoOverride !== null && (
                <div className="flex items-center gap-2 mt-2 ml-6">
                  <Input
                    type="number"
                    min={0}
                    value={prazoPagamentoOverride}
                    onChange={(e) => setPrazoPagamentoOverride(Number(e.target.value))}
                    className="w-24 h-8 text-sm"
                  />
                  <span className="text-xs text-muted-foreground">dias</span>
                </div>
              )}
            </div>
          )}
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancelar
          </Button>
          <Button onClick={confirmarEnvioAprovacao} className="bg-primary hover:bg-primary/90">
            Confirmar Compra ({selectedWeeks.size} {selectedWeeks.size === 1 ? 'semana' : 'semanas'})
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
