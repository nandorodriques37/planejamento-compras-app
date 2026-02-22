/**
 * Sidebar de navegação do S&OP
 * Design: Pharma Enterprise - Navy dark sidebar com ícones teal
 */

import {
  BarChart3,
  ShoppingCart,
  Package,
  TrendingUp,
  LayoutDashboard,
  ClipboardCheck,
  ChevronLeft,
  ChevronRight,
  Moon,
  Sun,
  Menu
} from 'lucide-react';
import { useState } from 'react';
import { useLocation, Link } from 'wouter';
import { useTheme } from '../contexts/ThemeContext';
import { Sheet, SheetContent, SheetTrigger } from './ui/sheet';

const navItems = [
  { icon: LayoutDashboard, label: 'Dashboard', href: '/', soon: true },
  { icon: TrendingUp, label: 'Previsão de Demanda', href: '/demanda', soon: true },
  { icon: Package, label: 'Planej. de Estoque', href: '/estoque', soon: false, badgeKey: 'estoque' as const },
  { icon: ShoppingCart, label: 'Planej. de Compras', href: '/compras', soon: false },
  { icon: ClipboardCheck, label: 'Aprovação de Pedidos', href: '/aprovacao', soon: false, badgeKey: 'aprovacao' as const },
  { icon: BarChart3, label: 'KPIs & Diagnósticos', href: '/kpis', soon: true },
];

interface AppSidebarProps {
  /** Contagem de SKUs críticos (exibida como badge vermelho no item Estoque). */
  skusCriticos?: number;
  /** Contagem de pedidos pendentes (exibida como badge âmbar no item Aprovação). */
  pedidosPendentes?: number;
}

export default function AppSidebar({ skusCriticos, pedidosPendentes }: AppSidebarProps = {}) {
  const [collapsed, setCollapsed] = useState(false);
  const [location] = useLocation();
  const { theme, toggleTheme, switchable } = useTheme();

  // Determine active item based on current route
  const getIsActive = (href: string) => {
    if (href === '/compras') return location === '/' || location === '/compras';
    return location === href;
  };

  const renderNavItems = (isMobileNav = false) => (
    <nav className={`flex-1 py-4 px-2 space-y-1 ${isMobileNav ? 'flex-none' : ''}`}>
      {navItems.map((item) => {
        const isActive = getIsActive(item.href);

        if (item.soon) {
          return (
            <button
              key={item.label}
              className={`
                w-full flex items-center gap-3 px-3 py-2.5 rounded-md text-sm font-medium
                transition-all duration-150
                text-sidebar-foreground/70 hover:bg-sidebar-accent/50 hover:text-sidebar-foreground
              `}
              title={!isMobileNav && collapsed ? item.label : undefined}
            >
              <item.icon className="w-4 h-4 flex-shrink-0" />
              {(isMobileNav || !collapsed) && (
                <span className="whitespace-nowrap">{item.label}</span>
              )}
              {(isMobileNav || !collapsed) && (
                <span className="ml-auto text-[9px] px-1.5 py-0.5 rounded bg-sidebar-border text-sidebar-foreground/50">
                  Em breve
                </span>
              )}
            </button>
          );
        }

        return (
          <Link
            key={item.label}
            href={item.href}
            className={`
              w-full flex items-center gap-3 px-3 py-2.5 rounded-md text-sm font-medium
              transition-all duration-150
              ${isActive
                ? 'bg-sidebar-accent text-sidebar-accent-foreground'
                : 'text-sidebar-foreground/70 hover:bg-sidebar-accent/50 hover:text-sidebar-foreground hover:border-l-2 hover:border-l-primary/50'
              }
            `}
            title={!isMobileNav && collapsed ? item.label : undefined}
          >
            <span className="relative flex-shrink-0">
              <item.icon className={`w-4 h-4 ${isActive ? 'text-primary' : ''}`} />
              {/* Badge dinâmico: SKUs críticos no estoque */}
              {item.badgeKey === 'estoque' && skusCriticos !== undefined && skusCriticos > 0 && (
                <span className="absolute -top-1 -right-1 min-w-[14px] h-3.5 rounded-full bg-destructive text-[8px] text-white font-bold flex items-center justify-center px-0.5">
                  {skusCriticos > 99 ? '99+' : skusCriticos}
                </span>
              )}
              {/* Badge dinâmico: pedidos pendentes na aprovação */}
              {item.badgeKey === 'aprovacao' && pedidosPendentes !== undefined && pedidosPendentes > 0 && (
                <span className="absolute -top-1 -right-1 min-w-[14px] h-3.5 rounded-full bg-amber-500 text-[8px] text-white font-bold flex items-center justify-center px-0.5">
                  {pedidosPendentes > 99 ? '99+' : pedidosPendentes}
                </span>
              )}
            </span>
            {(isMobileNav || !collapsed) && (
              <span className="whitespace-nowrap">{item.label}</span>
            )}
          </Link>
        );
      })}
    </nav>
  );

  return (
    <>
      {/* Desktop sidebar */}
      <aside
        className={`
          ${collapsed ? 'w-16' : 'w-64'}
          hidden md:flex
          bg-gradient-to-b from-sidebar via-sidebar to-[oklch(0.14_0.03_260)]
          text-sidebar-foreground
          flex-col h-screen sticky top-0
          transition-all duration-300 ease-in-out
          border-r border-sidebar-border
        `}
      >
        {/* Logo / Brand */}
        <div className="px-4 py-5 flex items-center gap-3 border-b border-sidebar-border">
          <div className="w-8 h-8 rounded-lg bg-primary flex items-center justify-center flex-shrink-0">
            <Package className="w-4 h-4 text-primary-foreground" />
          </div>
          {!collapsed && (
            <div className="overflow-hidden">
              <h1 className="text-sm font-bold text-sidebar-accent-foreground tracking-tight leading-tight">
                S&OP
              </h1>
              <p className="text-[10px] text-sidebar-foreground/60 leading-tight">
                Supply Chain Planning
              </p>
            </div>
          )}
        </div>

        {/* Navigation */}
        {renderNavItems()}

        {/* Footer: theme toggle + collapse */}
        <div className="px-2 py-3 border-t border-sidebar-border space-y-1">
          {switchable && (
            <button
              onClick={toggleTheme}
              className="w-full flex items-center justify-center gap-2 px-3 py-2 rounded-md text-xs text-sidebar-foreground/50 hover:text-sidebar-foreground hover:bg-sidebar-accent/50 transition-colors"
              title={theme === 'dark' ? 'Modo Claro' : 'Modo Escuro'}
            >
              {theme === 'dark' ? <Sun className="w-4 h-4" /> : <Moon className="w-4 h-4" />}
              {!collapsed && <span>{theme === 'dark' ? 'Modo Claro' : 'Modo Escuro'}</span>}
            </button>
          )}
          <button
            onClick={() => setCollapsed(!collapsed)}
            className="w-full flex items-center justify-center gap-2 px-3 py-2 rounded-md text-xs text-sidebar-foreground/50 hover:text-sidebar-foreground hover:bg-sidebar-accent/50 transition-colors"
          >
            {collapsed ? <ChevronRight className="w-4 h-4" /> : <ChevronLeft className="w-4 h-4" />}
            {!collapsed && <span>Recolher</span>}
          </button>
        </div>
      </aside>

      {/* Mobile bottom-sheet navigation */}
      <div className="md:hidden fixed top-3 left-3 z-50">
        <Sheet>
          <SheetTrigger asChild>
            <button className="p-2 bg-sidebar text-sidebar-foreground rounded-lg shadow-lg">
              <Menu className="w-5 h-5" />
            </button>
          </SheetTrigger>
          <SheetContent side="bottom" className="bg-sidebar text-sidebar-foreground rounded-t-2xl border-t border-sidebar-border">
            <div className="px-2 py-4">
              <div className="flex items-center gap-3 px-3 mb-4">
                <div className="w-8 h-8 rounded-lg bg-primary flex items-center justify-center">
                  <Package className="w-4 h-4 text-primary-foreground" />
                </div>
                <div>
                  <h1 className="text-sm font-bold text-sidebar-accent-foreground">S&OP</h1>
                  <p className="text-[10px] text-sidebar-foreground/60">Supply Chain Planning</p>
                </div>
              </div>
              {renderNavItems(true)}
              {switchable && (
                <button
                  onClick={toggleTheme}
                  className="w-full flex items-center gap-2 px-3 py-2.5 rounded-md text-sm text-sidebar-foreground/50 hover:text-sidebar-foreground hover:bg-sidebar-accent/50 transition-colors mt-2"
                >
                  {theme === 'dark' ? <Sun className="w-4 h-4" /> : <Moon className="w-4 h-4" />}
                  <span>{theme === 'dark' ? 'Modo Claro' : 'Modo Escuro'}</span>
                </button>
              )}
            </div>
          </SheetContent>
        </Sheet>
      </div>
    </>
  );
}
