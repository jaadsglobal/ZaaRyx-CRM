import React from 'react';
import {
  LayoutDashboard, 
  Users, 
  UserCheck, 
  Briefcase, 
  ClipboardList,
  CheckSquare, 
  BarChart3, 
  Settings, 
  LogOut,
  Zap,
  MessageSquare,
  TrendingUp,
  CreditCard,
  Workflow,
  FileText
} from 'lucide-react';
import { cn } from '../types';
import { AppSection, getRoleKey } from '../permissions';
import { BrandMark } from './BrandMark';

interface SidebarProps {
  activeTab: string;
  setActiveTab: (tab: string) => void;
  onLogout: () => void;
  accessibleSections: AppSection[];
  currentUserRole: string;
}

const menuItems = [
  { id: 'dashboard', label: 'Dashboard', icon: LayoutDashboard },
  { id: 'leads', label: 'Leads', icon: Users },
  { id: 'clients', label: 'Clientes', icon: UserCheck },
  { id: 'contracts', label: 'Contratos', icon: FileText },
  { id: 'onboarding', label: 'Onboarding', icon: ClipboardList },
  { id: 'projects', label: 'Proyectos', icon: Briefcase },
  { id: 'tasks', label: 'Tareas', icon: CheckSquare },
  { id: 'campaigns', label: 'Campañas', icon: TrendingUp },
  { id: 'reports', label: 'Reportes', icon: BarChart3 },
  { id: 'billing', label: 'Facturación', icon: CreditCard },
  { id: 'integrations', label: 'Integraciones', icon: Workflow },
  { id: 'ai', label: 'JaaDs Global AI', icon: Zap },
  { id: 'team', label: 'Equipo', icon: MessageSquare },
  { id: 'settings', label: 'Ajustes', icon: Settings },
];

export const Sidebar: React.FC<SidebarProps> = ({
  activeTab,
  setActiveTab,
  onLogout,
  accessibleSections,
  currentUserRole,
}) => {
  const currentUserRoleKey = getRoleKey(currentUserRole);

  const handleLogout = () => {
    if (window.confirm('¿Quieres cerrar la sesión actual?')) {
      onLogout();
    }
  };

  const visibleMenuItems = menuItems
    .filter((item) => accessibleSections.includes(item.id as AppSection))
    .map((item) => ({
      ...item,
      label:
        currentUserRoleKey === 'freelancer' && item.id === 'billing'
          ? 'Cobros'
          : (currentUserRoleKey === 'client' || currentUserRoleKey === 'freelancer') &&
              item.id === 'settings'
            ? 'Cuenta'
            : item.label,
    }));

  return (
    <aside className="w-64 h-screen fixed left-0 top-0 glass-panel rounded-none border-y-0 border-l-0 flex flex-col z-50">
      <div className="p-6 flex items-center gap-3">
        <BrandMark
          className="w-10 h-10 rounded-xl shadow-[0_0_15px_rgba(0,102,255,0.5)]"
          iconClassName="w-[2.25rem] h-[2.25rem]"
        />
        <div>
          <h1 className="font-bold text-xl tracking-tight bg-gradient-to-r from-white to-white/60 bg-clip-text text-transparent">
            JaaDs Global
          </h1>
          <p className="text-[10px] uppercase tracking-[0.2em] text-brand-cyan font-semibold">CRM</p>
        </div>
      </div>

      <nav className="flex-1 px-4 py-4 space-y-1 overflow-y-auto">
        {visibleMenuItems.map((item) => (
          <button
            key={item.id}
            onClick={() => setActiveTab(item.id)}
            className={cn(
              "w-full flex items-center gap-3 px-4 py-3 rounded-xl transition-all duration-300 group",
              activeTab === item.id 
                ? "bg-brand-blue/20 text-brand-blue border border-brand-blue/20 shadow-[0_0_20px_rgba(0,102,255,0.1)]" 
                : "text-white/50 hover:text-white hover:bg-white/5"
            )}
          >
            <item.icon className={cn(
              "w-5 h-5 transition-transform duration-300 group-hover:scale-110",
              activeTab === item.id ? "text-brand-blue" : "text-white/40"
            )} />
            <span className="font-medium text-sm">{item.label}</span>
            {activeTab === item.id && (
              <div className="ml-auto w-1.5 h-1.5 rounded-full bg-brand-blue shadow-[0_0_8px_rgba(0,102,255,0.8)]" />
            )}
          </button>
        ))}
      </nav>

      <div className="p-4 border-t border-white/10">
        <button
          type="button"
          onClick={handleLogout}
          className="w-full flex items-center gap-3 px-4 py-3 rounded-xl text-white/50 hover:text-red-400 hover:bg-red-400/10 transition-all duration-300"
        >
          <LogOut className="w-5 h-5" />
          <span className="font-medium text-sm">Cerrar Sesión</span>
        </button>
      </div>
    </aside>
  );
};
