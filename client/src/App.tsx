import { Toaster } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import NotFound from "@/pages/NotFound";
import { Route, Switch } from "wouter";
import { Suspense, lazy } from "react";
import ErrorBoundary from "./components/ErrorBoundary";
import { ThemeProvider } from "./contexts/ThemeContext";
import LoadingSpinner from "./components/LoadingSpinner";

// Lazy load pages for code-splitting
const Home = lazy(() => import("./pages/Home"));
const EstoquePlanning = lazy(() => import("./pages/EstoquePlanning"));
const AprovacaoPedidos = lazy(() => import("./pages/AprovacaoPedidos"));

function Router() {
  return (
    <Switch>
      <Route path="/" component={Home} />
      <Route path="/compras" component={Home} />
      <Route path="/estoque">
        {() => (
          <Suspense fallback={<LoadingSpinner />}>
            <EstoquePlanning />
          </Suspense>
        )}
      </Route>
      <Route path="/aprovacao">
        {() => (
          <Suspense fallback={<LoadingSpinner />}>
            <AprovacaoPedidos />
          </Suspense>
        )}
      </Route>
      <Route path="/404" component={NotFound} />
      <Route component={NotFound} />
    </Switch>
  );
}

function App() {
  return (
    <ErrorBoundary>
      <ThemeProvider defaultTheme="light" switchable={true}>
        <TooltipProvider>
          <Toaster />
          <Router />
        </TooltipProvider>
      </ThemeProvider>
    </ErrorBoundary>
  );
}

export default App;
