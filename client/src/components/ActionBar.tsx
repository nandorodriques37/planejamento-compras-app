/**
 * Barra de ação flutuante no rodapé
 * Design: Pharma Enterprise - aparece quando o usuário faz edições ou seleciona semanas
 * Contém: contador de edições, semanas selecionadas, botão enviar para aprovação, botão recalcular, botão salvar, botão limpar
 */

import { RotateCcw, Save, Trash2, Download, Send } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { exportarParaCSV } from '../lib/dataAdapter';
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
    if (dados) exportarParaCSV(dados);
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
      <div className="bg-card/95 backdrop-blur-sm border-t border-border shadow-lg">
        <div className="max-w-[1920px] mx-auto px-6 py-3 flex items-center justify-between">
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
          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={onLimpar}
              className="text-xs gap-1.5"
            >
              <Trash2 className="w-3.5 h-3.5" />
              Limpar Edições
            </Button>

            <Button
              variant="outline"
              size="sm"
              onClick={handleExportCSV}
              className="text-xs gap-1.5"
            >
              <Download className="w-3.5 h-3.5" />
              Exportar CSV
            </Button>

            <Button
              size="sm"
              disabled={selectedWeeks.size === 0}
              onClick={onEnviarParaAprovacao}
              className="text-xs gap-1.5 bg-emerald-600 hover:bg-emerald-700 text-white disabled:opacity-50"
            >
              <Send className="w-3.5 h-3.5" />
              Enviar para Aprovação
            </Button>

            <Button
              size="sm"
              className="text-xs gap-1.5 bg-primary hover:bg-primary/90"
            >
              <Save className="w-3.5 h-3.5" />
              Salvar Cenário
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}
