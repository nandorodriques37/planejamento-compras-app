import React from 'react';
import { AlertTriangle, RefreshCcw } from 'lucide-react';
import { ErrorBoundary as ReactErrorBoundary, FallbackProps } from 'react-error-boundary';

function ErrorFallback({ error, resetErrorBoundary }: FallbackProps) {
  return (
    <div className="flex flex-col items-center justify-center p-6 m-4 border border-destructive/20 bg-destructive/5 rounded-xl text-center">
      <div className="h-10 w-10 bg-destructive/10 text-destructive rounded-full flex items-center justify-center mb-3">
        <AlertTriangle className="h-5 w-5" />
      </div>
      <h3 className="text-sm font-semibold text-foreground mb-1">Falha Crítica na Visualização</h3>
      <p className="text-xs text-muted-foreground max-w-[280px] mb-4">
        {error instanceof Error ? error.message : 'Ocorreu um erro interno ao renderizar este gráfico ou tabela. O resto da aplicação continua operando normalmente.'}
      </p>
      <button
        onClick={resetErrorBoundary}
        className="flex items-center gap-1.5 px-3 py-1.5 bg-background border border-border shadow-sm rounded-md text-xs font-medium hover:bg-muted transition-colors"
      >
        <RefreshCcw className="h-3 w-3" />
        Tentar Novamente
      </button>
    </div>
  );
}

export function ErrorBoundary({ children }: { children: React.ReactNode }) {
  return (
    <ReactErrorBoundary FallbackComponent={ErrorFallback}>
      {children}
    </ReactErrorBoundary>
  );
}
