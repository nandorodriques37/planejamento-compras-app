import { useState } from 'react';
import { 
  Table, 
  TableBody, 
  TableCell, 
  TableHead, 
  TableHeader, 
  TableRow 
} from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import type { DashboardDetailItem } from '../../hooks/useDashboardData';
import { formatCurrency, formatNumber } from '../../lib/calculationEngine';

interface DashboardDetailTableProps {
  data: DashboardDetailItem[];
}

const ITEMS_PER_PAGE = 30;

export default function DashboardDetailTable({ data }: DashboardDetailTableProps) {
  const [currentPage, setCurrentPage] = useState(1);

  if (data.length === 0) {
    return (
      <div className="bg-card border border-border rounded-lg p-5">
        <h2 className="text-sm font-semibold text-foreground mb-4">Detalhamento de SKUs</h2>
        <div className="flex items-center justify-center h-32 text-muted-foreground text-sm">
          Nenhum dado encontrado com os filtros atuais.
        </div>
      </div>
    );
  }

  const totalPages = Math.ceil(data.length / ITEMS_PER_PAGE);
  const startIndex = (currentPage - 1) * ITEMS_PER_PAGE;
  const currentData = data.slice(startIndex, startIndex + ITEMS_PER_PAGE);

  const getStatusBadge = (status: 'ok' | 'warning' | 'critical') => {
    switch (status) {
      case 'ok':
        return <Badge variant="outline" className="text-emerald-600 bg-emerald-50 dark:bg-emerald-950/30 border-emerald-200">OK</Badge>;
      case 'warning':
        return <Badge variant="outline" className="text-amber-600 bg-amber-50 dark:bg-amber-950/30 border-amber-200">Atenção</Badge>;
      case 'critical':
        return <Badge variant="outline" className="text-red-600 bg-red-50 dark:bg-red-950/30 border-red-200">Crítico/Ruptura</Badge>;
    }
  };

  return (
    <div className="bg-card border border-border rounded-lg p-5 flex flex-col">
      <div className="mb-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <h2 className="text-sm font-semibold text-foreground">Detalhamento de SKUs</h2>
          <p className="text-xs text-muted-foreground mt-0.5">
            Mostrando {data.length} itens correspondentes aos filtros ativos.
          </p>
        </div>
        
        {totalPages > 1 && (
          <div className="flex items-center gap-2">
            <span className="text-xs text-muted-foreground">
              Página {currentPage} de {totalPages}
            </span>
            <div className="flex items-center gap-1">
              <Button
                variant="outline"
                size="icon"
                className="h-7 w-7"
                onClick={() => setCurrentPage(p => Math.max(1, p - 1))}
                disabled={currentPage === 1}
              >
                <ChevronLeft className="h-4 w-4" />
              </Button>
              <Button
                variant="outline"
                size="icon"
                className="h-7 w-7"
                onClick={() => setCurrentPage(p => Math.min(totalPages, p + 1))}
                disabled={currentPage === totalPages}
              >
                <ChevronRight className="h-4 w-4" />
              </Button>
            </div>
          </div>
        )}
      </div>

      <div className="border border-border rounded-md overflow-x-auto min-h-[400px]">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="w-[100px] text-xs">SKU</TableHead>
              <TableHead className="min-w-[200px] text-xs">Produto</TableHead>
              <TableHead className="min-w-[150px] text-xs">Fornecedor</TableHead>
              <TableHead className="text-right text-xs">Estoque Atual</TableHead>
              <TableHead className="text-right text-xs">Cobertura (Dias)</TableHead>
              <TableHead className="text-right text-xs">Perda Diária Est.</TableHead>
              <TableHead className="w-[120px] text-center text-xs">Status</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {currentData.map((item) => (
              <TableRow key={item.sku} className="text-xs hover:bg-muted/50">
                <TableCell className="font-mono text-muted-foreground">{item.sku}</TableCell>
                <TableCell className="font-medium max-w-[200px] truncate" title={item.produto}>
                  {item.produto}
                </TableCell>
                <TableCell className="max-w-[150px] truncate" title={item.fornecedor}>
                  {item.fornecedor}
                </TableCell>
                <TableCell className="text-right font-mono">
                  {formatNumber(item.estoque)}
                </TableCell>
                <TableCell className="text-right font-mono">
                  {item.coberturaDias === 999 ? '∞' : formatNumber(Math.round(item.coberturaDias))}
                </TableCell>
                <TableCell className="text-right font-mono font-medium text-red-600 dark:text-red-400">
                  {item.perdaDiaria > 0 ? formatCurrency(item.perdaDiaria) : '-'}
                </TableCell>
                <TableCell className="text-center">
                  {getStatusBadge(item.status)}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
      
      {totalPages > 1 && (
        <div className="mt-4 flex items-center justify-between sm:justify-end gap-4">
          <span className="text-xs text-muted-foreground sm:hidden">
             Pág. {currentPage} / {totalPages}
          </span>
          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={() => setCurrentPage(p => Math.max(1, p - 1))}
              disabled={currentPage === 1}
            >
              Anterior
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={() => setCurrentPage(p => Math.min(totalPages, p + 1))}
              disabled={currentPage === totalPages}
            >
              Próxima
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
