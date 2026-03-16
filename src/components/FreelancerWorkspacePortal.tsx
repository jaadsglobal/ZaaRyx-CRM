import React, { useEffect, useState } from 'react';
import {
  Briefcase,
  ClipboardList,
  Download,
  Mail,
  Megaphone,
  Phone,
  RefreshCw,
  Users,
} from 'lucide-react';
import { FreelancerWorkspacePortal as FreelancerWorkspacePortalData, cn } from '../types';
import { triggerClientDownload } from '../lib/download';
import { CollapsibleSection } from './CollapsibleSection';
import { InteractiveSummaryCard } from './InteractiveSummaryCard';

const getResponseJson = async <T,>(response: Response): Promise<T> => {
  if (!response.ok) {
    const errorData = (await response.json().catch(() => null)) as { error?: string } | null;
    throw new Error(errorData?.error || `Request failed with status ${response.status}`);
  }

  return response.json() as Promise<T>;
};

const formatCurrency = (amount: number, currency = 'EUR') =>
  new Intl.NumberFormat('es-ES', {
    style: 'currency',
    currency,
    maximumFractionDigits: 2,
  }).format(Number(amount || 0));

const formatDate = (value?: string | null) => {
  if (!value) {
    return 'Sin fecha';
  }

  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? value : date.toLocaleDateString('es-ES');
};

const getProjectStatusLabel = (status: string) => {
  switch (status) {
    case 'strategy':
      return 'Estrategia';
    case 'setup':
      return 'Setup';
    case 'execution':
      return 'Ejecución';
    case 'optimization':
      return 'Optimización';
    case 'reporting':
      return 'Reporting';
    case 'completed':
      return 'Completado';
    default:
      return status;
  }
};

export const FreelancerWorkspacePortal: React.FC = () => {
  const [portal, setPortal] = useState<FreelancerWorkspacePortalData | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [feedbackMessage, setFeedbackMessage] = useState<string | null>(null);
  const [feedbackTone, setFeedbackTone] = useState<'success' | 'error'>('success');

  const setMessage = (message: string, tone: 'success' | 'error' = 'success') => {
    setFeedbackTone(tone);
    setFeedbackMessage(message);
  };

  const loadPortal = async (background = false) => {
    if (background) {
      setRefreshing(true);
    } else {
      setLoading(true);
    }

    try {
      const response = await fetch('/api/freelancer-portal/workspace');
      const data = await getResponseJson<FreelancerWorkspacePortalData>(response);
      setPortal(data);
    } catch (error) {
      console.error('Error loading freelancer workspace portal:', error);
      setPortal(null);
      setMessage(
        error instanceof Error ? error.message : 'No se pudo cargar tu workspace.',
        'error',
      );
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  useEffect(() => {
    void loadPortal();
  }, []);

  const handleDownloadJson = () => {
    if (!portal) {
      return;
    }

    const blob = new Blob([JSON.stringify(portal, null, 2)], {
      type: 'application/json',
    });
    const url = URL.createObjectURL(blob);
    triggerClientDownload(url, 'freelancer-workspace.json', () => URL.revokeObjectURL(url));
    setMessage('Workspace descargado en JSON.');
  };

  const projects = portal?.projects || [];
  const clients = portal?.clients || [];
  const campaigns = portal?.campaigns || [];
  const upcomingTasks = portal?.upcoming_tasks || [];
  const totalBudget = projects.reduce((sum, project) => sum + Number(project.total_budget || 0), 0);
  const totalSpend = projects.reduce((sum, project) => sum + Number(project.total_spend || 0), 0);
  const openTasks = projects.reduce((sum, project) => sum + Number(project.open_tasks || 0), 0);

  const scrollToSection = (sectionId: string) => {
    document.getElementById(sectionId)?.scrollIntoView({
      behavior: 'smooth',
      block: 'start',
    });
  };

  return (
    <div className="space-y-8">
      <header className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h2 className="text-3xl font-bold">Workspace</h2>
          <p className="text-white/50">
            Todo tu contexto de trabajo en un solo lugar: clientes, proyectos, campañas y agenda
            operativa.
          </p>
        </div>

        <div className="flex flex-wrap gap-3">
          <button
            type="button"
            onClick={handleDownloadJson}
            className="glass-button-secondary"
            disabled={!portal}
          >
            <Download className="w-4 h-4" />
            JSON
          </button>
          <button
            type="button"
            onClick={() => void loadPortal(true)}
            className="glass-button-secondary"
            disabled={refreshing}
          >
            <RefreshCw className={cn('w-4 h-4', refreshing && 'animate-spin')} />
            Refrescar
          </button>
        </div>
      </header>

      {feedbackMessage ? (
        <div
          className={cn(
            'glass-panel p-3 text-sm',
            feedbackTone === 'success' ? 'text-emerald-300' : 'text-red-300',
          )}
        >
          {feedbackMessage}
        </div>
      ) : null}

      <CollapsibleSection
        title="Resumen del workspace"
        description="Visión rápida de cartera, carga operativa y presupuesto."
        icon={<Briefcase className="w-5 h-5" />}
        storageKey="freelancer-workspace-summary"
      >
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-5 gap-6">
          {[
            {
              label: 'Clientes activos',
              value: clients.length,
              icon: Users,
              hint: 'Abre las cuentas asignadas',
              sectionId: 'freelancer-workspace-clients-section',
            },
            {
              label: 'Proyectos',
              value: projects.length,
              icon: Briefcase,
              hint: 'Abre tus proyectos en curso',
              sectionId: 'freelancer-workspace-projects-section',
            },
            {
              label: 'Campañas visibles',
              value: campaigns.length,
              icon: Megaphone,
              hint: 'Abre las campañas conectadas',
              sectionId: 'freelancer-workspace-campaigns-section',
            },
            {
              label: 'Tareas abiertas',
              value: openTasks,
              icon: ClipboardList,
              hint: 'Abre la agenda inmediata',
              sectionId: 'freelancer-workspace-agenda-section',
            },
            {
              label: 'Presupuesto gestionado',
              value: formatCurrency(totalBudget),
              icon: Briefcase,
              hint: `Spend visible ${formatCurrency(totalSpend)}`,
              sectionId: 'freelancer-workspace-projects-section',
            },
          ].map((item) => (
            <InteractiveSummaryCard
              key={item.label}
              label={item.label}
              value={loading ? '...' : item.value}
              hint={item.hint}
              icon={item.icon}
              onClick={() => scrollToSection(item.sectionId)}
            />
          ))}
        </div>
      </CollapsibleSection>

      <div className="grid grid-cols-1 xl:grid-cols-[0.92fr_1.08fr] gap-6">
        <CollapsibleSection
          title="Clientes asignados"
          description="Base de cuentas sobre las que estás colaborando ahora mismo."
          icon={<Users className="w-5 h-5" />}
          summary={`${clients.length} cuentas`}
          storageKey="freelancer-workspace-clients"
        >
          <div id="freelancer-workspace-clients-section" />
          <div>
            <h3 className="font-bold text-lg sr-only">Clientes asignados</h3>
          </div>

          <div className="space-y-4">
            {loading ? (
              Array.from({ length: 2 }).map((_, index) => (
                <div
                  key={`freelancer-client-skeleton-${index}`}
                  className="h-40 rounded-2xl bg-white/5 animate-pulse"
                />
              ))
            ) : clients.length === 0 ? (
              <div className="rounded-2xl border border-white/10 bg-white/5 p-6 text-white/45">
                Aún no tienes clientes asignados.
              </div>
            ) : (
              clients.map((client) => (
                <div key={client.id} className="rounded-2xl border border-white/10 bg-white/5 p-5">
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div>
                      <p className="font-semibold text-lg">{client.company}</p>
                      <p className="text-sm text-white/45 mt-1">
                        {client.industry || 'Industria no definida'}
                      </p>
                    </div>
                    <span className="text-xs uppercase tracking-wider text-brand-cyan font-bold">
                      {client.status}
                    </span>
                  </div>

                  <div className="mt-4 grid grid-cols-2 xl:grid-cols-4 gap-3 text-sm">
                    <div className="rounded-xl bg-white/5 px-3 py-3">
                      <p className="text-white/35 text-[11px] uppercase tracking-wider font-bold">
                        Proyectos
                      </p>
                      <p className="font-semibold mt-2">{client.project_count}</p>
                    </div>
                    <div className="rounded-xl bg-white/5 px-3 py-3">
                      <p className="text-white/35 text-[11px] uppercase tracking-wider font-bold">
                        Campañas activas
                      </p>
                      <p className="font-semibold mt-2">{client.active_campaigns}</p>
                    </div>
                    <div className="rounded-xl bg-white/5 px-3 py-3">
                      <p className="text-white/35 text-[11px] uppercase tracking-wider font-bold">
                        Tareas abiertas
                      </p>
                      <p className="font-semibold mt-2">{client.pending_tasks}</p>
                    </div>
                    <div className="rounded-xl bg-white/5 px-3 py-3">
                      <p className="text-white/35 text-[11px] uppercase tracking-wider font-bold">
                        Budget base
                      </p>
                      <p className="font-semibold mt-2">{formatCurrency(client.budget)}</p>
                    </div>
                  </div>

                  <div className="mt-4 grid grid-cols-1 md:grid-cols-2 gap-3 text-sm">
                    <div className="rounded-xl bg-white/5 px-4 py-3">
                      <p className="text-white/35 text-[11px] uppercase tracking-wider font-bold">
                        Contacto principal
                      </p>
                      <p className="font-medium mt-2 truncate">
                        {client.contact_name || 'Sin contacto definido'}
                      </p>
                    </div>
                    <div className="rounded-xl bg-white/5 px-4 py-3 flex items-center gap-3">
                      <Mail className="w-4 h-4 text-brand-cyan" />
                      <span className="truncate">{client.contact_email || 'Sin email de contacto'}</span>
                    </div>
                    <div className="rounded-xl bg-white/5 px-4 py-3 flex items-center gap-3">
                      <Phone className="w-4 h-4 text-brand-cyan" />
                      <span className="truncate">{client.contact_phone || 'Sin teléfono'}</span>
                    </div>
                  </div>
                </div>
              ))
            )}
          </div>
        </CollapsibleSection>

        <CollapsibleSection
          title="Agenda inmediata"
          description="Lo siguiente que requiere movimiento dentro de tu cartera."
          icon={<ClipboardList className="w-5 h-5" />}
          summary={`${upcomingTasks.length} pendientes`}
          storageKey="freelancer-workspace-agenda"
        >
          <div id="freelancer-workspace-agenda-section" />
          <div>
            <h3 className="font-bold text-lg sr-only">Agenda inmediata</h3>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="rounded-2xl border border-white/10 bg-white/5 p-5">
              <p className="text-xs uppercase tracking-wider text-white/40 font-bold">
                Gasto visible
              </p>
              <p className="text-3xl font-bold mt-3">{formatCurrency(totalSpend)}</p>
              <p className="text-sm text-white/45 mt-2">
                Gasto acumulado dentro de los proyectos que tienes asignados.
              </p>
            </div>

            <div className="rounded-2xl border border-white/10 bg-white/5 p-5">
              <p className="text-xs uppercase tracking-wider text-white/40 font-bold">
                Tareas proximas
              </p>
              <p className="text-3xl font-bold mt-3">{upcomingTasks.length}</p>
              <p className="text-sm text-white/45 mt-2">
                Pendientes visibles en tu agenda de ejecucion.
              </p>
            </div>
          </div>

          <div className="space-y-3">
            {loading ? (
              Array.from({ length: 3 }).map((_, index) => (
                <div
                  key={`freelancer-agenda-skeleton-${index}`}
                  className="h-24 rounded-2xl bg-white/5 animate-pulse"
                />
              ))
            ) : upcomingTasks.length === 0 ? (
              <div className="rounded-2xl border border-white/10 bg-white/5 p-6 text-white/45">
                No hay entregas pendientes en este momento.
              </div>
            ) : (
              upcomingTasks.map((task) => (
                <div key={task.id} className="rounded-2xl border border-white/10 bg-white/5 p-4">
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div>
                      <p className="font-semibold">{task.title}</p>
                      <p className="text-sm text-white/45 mt-1">
                        {task.client_name || 'Cliente sin asignar'} · {task.project_name}
                      </p>
                    </div>
                    <span className="text-xs uppercase tracking-wider text-brand-cyan font-bold">
                      {task.status === 'in_progress'
                        ? 'En curso'
                        : task.status === 'review'
                          ? 'Revisión'
                          : task.status === 'done'
                            ? 'Completada'
                            : 'Por hacer'}
                    </span>
                  </div>
                  <div className="mt-4 flex items-center justify-between gap-3 text-sm">
                    <span className="text-white/55">
                      Prioridad {task.priority === 'high' ? 'alta' : task.priority === 'medium' ? 'media' : 'baja'}
                    </span>
                    <span className="text-white/40">{formatDate(task.due_date)}</span>
                  </div>
                </div>
              ))
            )}
          </div>
        </CollapsibleSection>
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-[1.08fr_0.92fr] gap-6">
        <CollapsibleSection
          title="Proyectos en curso"
          description="Resumen operativo de cada proyecto bajo tu responsabilidad."
          icon={<Briefcase className="w-5 h-5" />}
          summary={`${projects.length} proyectos`}
          storageKey="freelancer-workspace-projects"
        >
          <div id="freelancer-workspace-projects-section" />
          <div>
            <h3 className="font-bold text-lg sr-only">Proyectos en curso</h3>
          </div>

          <div className="space-y-4">
            {loading ? (
              Array.from({ length: 3 }).map((_, index) => (
                <div
                  key={`freelancer-project-skeleton-${index}`}
                  className="h-44 rounded-2xl bg-white/5 animate-pulse"
                />
              ))
            ) : projects.length === 0 ? (
              <div className="rounded-2xl border border-white/10 bg-white/5 p-6 text-white/45">
                Aún no hay proyectos publicados en tu workspace.
              </div>
            ) : (
              projects.map((project) => (
                <div key={project.id} className="rounded-2xl border border-white/10 bg-white/5 p-5">
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div>
                      <p className="font-semibold text-lg">{project.name}</p>
                      <p className="text-sm text-white/45 mt-1">
                        {project.client_name}
                        {project.role_label ? ` · ${project.role_label}` : ''}
                      </p>
                    </div>
                    <span className="text-xs uppercase tracking-wider text-brand-cyan font-bold">
                      {getProjectStatusLabel(project.status)}
                    </span>
                  </div>

                  {project.notes ? (
                    <p className="text-sm text-white/50 mt-4 rounded-xl bg-white/5 px-4 py-3">
                      {project.notes}
                    </p>
                  ) : null}

                  <div className="mt-4 grid grid-cols-2 xl:grid-cols-4 gap-3 text-sm">
                    <div className="rounded-xl bg-white/5 px-3 py-3">
                      <p className="text-white/35 text-[11px] uppercase tracking-wider font-bold">
                        Tareas
                      </p>
                      <p className="font-semibold mt-2">
                        {project.open_tasks} abiertas / {project.total_tasks} totales
                      </p>
                    </div>
                    <div className="rounded-xl bg-white/5 px-3 py-3">
                      <p className="text-white/35 text-[11px] uppercase tracking-wider font-bold">
                        Mis tareas
                      </p>
                      <p className="font-semibold mt-2">{project.my_tasks}</p>
                    </div>
                    <div className="rounded-xl bg-white/5 px-3 py-3">
                      <p className="text-white/35 text-[11px] uppercase tracking-wider font-bold">
                        Budget / spend
                      </p>
                      <p className="font-semibold mt-2">
                        {formatCurrency(project.total_budget)} / {formatCurrency(project.total_spend)}
                      </p>
                    </div>
                    <div className="rounded-xl bg-white/5 px-3 py-3">
                      <p className="text-white/35 text-[11px] uppercase tracking-wider font-bold">
                        Siguiente fecha
                      </p>
                      <p className="font-semibold mt-2">{formatDate(project.next_due_date)}</p>
                    </div>
                  </div>
                </div>
              ))
            )}
          </div>
        </CollapsibleSection>

        <CollapsibleSection
          title="Campañas visibles"
          description="Vista rápida de las campañas conectadas a tus proyectos."
          icon={<Megaphone className="w-5 h-5" />}
          summary={`${campaigns.length} campañas`}
          storageKey="freelancer-workspace-campaigns"
        >
          <div id="freelancer-workspace-campaigns-section" />
          <div>
            <h3 className="font-bold text-lg sr-only">Campañas visibles</h3>
          </div>

          <div className="space-y-3">
            {loading ? (
              Array.from({ length: 3 }).map((_, index) => (
                <div
                  key={`freelancer-campaign-skeleton-${index}`}
                  className="h-28 rounded-2xl bg-white/5 animate-pulse"
                />
              ))
            ) : campaigns.length === 0 ? (
              <div className="rounded-2xl border border-white/10 bg-white/5 p-6 text-white/45">
                No hay campañas activas o visibles en este momento.
              </div>
            ) : (
              campaigns.map((campaign) => (
                <div key={campaign.id} className="rounded-2xl border border-white/10 bg-white/5 p-4">
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div>
                      <p className="font-semibold">{campaign.name}</p>
                      <p className="text-sm text-white/45 mt-1">
                        {campaign.client_name} · {campaign.project_name}
                      </p>
                    </div>
                    <span className="text-xs uppercase tracking-wider text-brand-cyan font-bold">
                      {campaign.status}
                    </span>
                  </div>

                  <div className="mt-4 grid grid-cols-2 gap-3 text-sm">
                    <div className="rounded-xl bg-white/5 px-3 py-3">
                      <p className="text-white/35 text-[11px] uppercase tracking-wider font-bold">
                        Plataforma
                      </p>
                      <p className="font-semibold mt-2">{campaign.platform}</p>
                    </div>
                    <div className="rounded-xl bg-white/5 px-3 py-3">
                      <p className="text-white/35 text-[11px] uppercase tracking-wider font-bold">
                        ROI
                      </p>
                      <p className="font-semibold mt-2">{Number(campaign.roi || 0).toFixed(2)}x</p>
                    </div>
                    <div className="rounded-xl bg-white/5 px-3 py-3">
                      <p className="text-white/35 text-[11px] uppercase tracking-wider font-bold">
                        Budget
                      </p>
                      <p className="font-semibold mt-2">{formatCurrency(campaign.budget)}</p>
                    </div>
                    <div className="rounded-xl bg-white/5 px-3 py-3">
                      <p className="text-white/35 text-[11px] uppercase tracking-wider font-bold">
                        Spend
                      </p>
                      <p className="font-semibold mt-2">{formatCurrency(campaign.spent)}</p>
                    </div>
                  </div>
                </div>
              ))
            )}
          </div>
        </CollapsibleSection>
      </div>
    </div>
  );
};
