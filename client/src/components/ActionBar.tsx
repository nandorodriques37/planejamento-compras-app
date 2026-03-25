/**
 * Barra de ação flutuante no rodapé
 * Design: Pharma Enterprise - aparece quando o usuário faz edições ou seleciona semanas
 * Contém: contador de edições, semanas selecionadas, botão enviar para aprovação, botão recalcular, botão salvar, botão limpar
 */

import { RotateCcw, Save, Trash2, Download, Send } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { exportarParaExcel } from '../lib/dataAdapter';
import type { DadosCompletos, SemanaInfo } from '../lib/calculationEngine';

interface ActionBarProps {
  totalEdicoes: number;
  onLimpar: () => void;
  dados: DadosCompletos | null;
  selectedWeeks: Set<number>;
  semanasInfo: SemanaInfo[];
  onEnviarParaAprovacao: () => void;
}

export default function ActionBar({ totalEdicoes, onLimpar, dados, selectedWeeks, semanasInfo, onEnviarParaAprovacao }: ActionBarProps) {
  const handleExportCSV = () => {
    if (dados) exportarParaExcel(dados);
  };

  const isVisible = totalEdicoes > 0 || selectedWeeks.size > 0;

  const semanasSelecionadasLabels = [...selectedWeeks]
    .sort()
    .map(i => semanasInfo[i]?.label)
    .filter(Boolean)
    .join(', ');

  return (
    <div className={`
      fixed bottom-0 left-0 right-0 z-50
      transition-all duration-300 ease-in-out
      ${isVisible ? 'translate-y-0 opacity-100' : 'translate-y-full opacity-0 pointer-events-none'}
    `}>
      <div className="bg-white/95 dark:bg-card/95 backdrop-blur-md border-t border-slate-200 dark:border-border shadow-[0_-8px_30px_rgba(0,0,0,0.04)]">
        <div className="max-w-[1920px] mx-auto px-6 py-3 flex flex-col md:flex-row items-center justify-between gap-3">
          {/* Left: info */}
          <div className="flex items-center gap-3">
            <div className="w-2 h-2 rounded-full bg-primary animate-pulse" />
            {totalEdicoes > 0 && (
              <span className="text-sm text-foreground">
                <strong>{totalEdicoes}</strong> {totalEdicoes === 1 ? 'pedido ajustado' : 'pedidos ajustados'}
              </span>
            )}
            {selectedWeeks.size > 0 && (
              <span className="text-sm text-emerald-600 dark:text-emerald-400 font-medium">
                {semanasSelecionadasLabels} {selectedWeeks.size === 1 ? 'selecionada' : 'selecionadas'} para envio
              </span>
            )}
            {totalEdicoes > 0 && selectedWeeks.size === 0 && (
              <span className="text-xs text-muted-foreground">
                Os valores foram recalculados automaticamente
              </span>
            )}
          </div>

          {/* Right: actions */}
          <div className="flex flex-wrap items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={onLimpar}
              className="text-[11px] font-medium text-slate-600 bg-white hover:bg-red-50 hover:text-red-700 hover:border-red-200 shadow-sm gap-1.5 transition-all"
            >
              <Trash2 className="w-3.5 h-3.5" />
              Limpar Edições
            </Button>

            <Button
              variant="outline"
              size="sm"
              onClick={handleExportCSV}
              className="text-[11px] font-medium text-slate-600 bg-white hover:bg-slate-50 hover:text-slate-900 border-slate-200 shadow-sm gap-1.5 transition-all"
            >
              <Download className="w-3.5 h-3.5" />
              Exportar Excel
            </Button>

            <div className="w-px h-6 bg-slate-200 dark:bg-border mx-1 hidden md:block" />

            <Button
              size="sm"
              disabled={selectedWeeks.size === 0}
              onClick={onEnviarParaAprovacao}
              className="text-[11px] font-semibold text-emerald-700 bg-emerald-50 hover:bg-emerald-100 border border-emerald-200 shadow-sm gap-1.5 disabled:opacity-50 transition-all"
            >
              <Send className="w-3.5 h-3.5 text-emerald-600" />
              Enviar para Aprovação
            </Button>

            <Button
              size="sm"
              className="text-[11px] font-semibold text-slate-700 bg-white hover:bg-slate-50 border border-slate-200 shadow-sm gap-1.5 transition-all"
            >
              <Save className="w-3.5 h-3.5 text-slate-500" />
              Salvar Cenário
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}
