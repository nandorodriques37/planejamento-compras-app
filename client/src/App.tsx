import { Toaster } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import NotFound from "@/pages/NotFound";
import { Route, Switch } from "wouter";
import ErrorBoundary from "./components/ErrorBoundary";
import { ThemeProvider } from "./contexts/ThemeContext";
import Home from "./pages/Home";
import EstoquePlanning from "./pages/EstoquePlanning";
import AprovacaoPedidos from "./pages/AprovacaoPedidos";

function Router() {
  return (
    <Switch>
      <Route path="/" component={Home} />
      <Route path="/compras" component={Home} />
      <Route path="/estoque" component={EstoquePlanning} />
      <Route path="/aprovacao" component={AprovacaoPedidos} />
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
