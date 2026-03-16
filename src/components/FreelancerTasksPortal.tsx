import React, { useEffect, useState } from 'react';
import {
  CheckCircle2,
  ClipboardList,
  Clock3,
  Filter,
  RefreshCw,
  Search,
} from 'lucide-react';
import { FreelancerTasksPortal as FreelancerTasksPortalData, FreelancerWorkspaceTask, cn } from '../types';
import { CollapsibleSection } from './CollapsibleSection';
import { InteractiveSummaryCard } from './InteractiveSummaryCard';

type FreelancerTaskSummaryFilter = 'all' | 'assigned' | 'due' | 'review' | 'done';

const getResponseJson = async <T,>(response: Response): Promise<T> => {
  if (!response.ok) {
    const errorData = (await response.json().catch(() => null)) as { error?: string } | null;
    throw new Error(errorData?.error || `Request failed with status ${response.status}`);
  }

  return response.json() as Promise<T>;
};

const formatDate = (value?: string | null) => {
  if (!value) {
    return 'Sin fecha';
  }

  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? value : date.toLocaleDateString('es-ES');
};

const isDueThisWeek = (value?: string | null) => {
  if (!value) {
    return false;
  }

  const dueDate = new Date(value);

  if (Number.isNaN(dueDate.getTime())) {
    return false;
  }

  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const nextWeek = new Date(today);
  nextWeek.setDate(today.getDate() + 7);

  return dueDate >= today && dueDate <= nextWeek;
};

const getStatusLabel = (status: FreelancerWorkspaceTask['status']) => {
  switch (status) {
    case 'todo':
      return 'Por hacer';
    case 'in_progress':
      return 'En curso';
    case 'review':
      return 'Revisión';
    case 'done':
      return 'Completada';
    default:
      return status;
  }
};

const getPriorityLabel = (priority: FreelancerWorkspaceTask['priority']) => {
  switch (priority) {
    case 'high':
      return 'Alta';
    case 'medium':
      return 'Media';
    case 'low':
      return 'Baja';
    default:
      return priority;
  }
};

const getStatusClasses = (status: FreelancerWorkspaceTask['status']) => {
  switch (status) {
    case 'done':
      return 'bg-emerald-500/10 text-emerald-300 border-emerald-500/20';
    case 'review':
      return 'bg-amber-500/10 text-amber-300 border-amber-500/20';
    case 'in_progress':
      return 'bg-brand-cyan/20 text-brand-cyan border-brand-cyan/20';
    case 'todo':
    default:
      return 'bg-white/10 text-white/65 border-white/10';
  }
};

const getPriorityClasses = (priority: FreelancerWorkspaceTask['priority']) => {
  switch (priority) {
    case 'high':
      return 'bg-red-500/10 text-red-300 border-red-500/20';
    case 'medium':
      return 'bg-amber-500/10 text-amber-300 border-amber-500/20';
    case 'low':
    default:
      return 'bg-emerald-500/10 text-emerald-300 border-emerald-500/20';
  }
};

export const FreelancerTasksPortal: React.FC = () => {
  const [portal, setPortal] = useState<FreelancerTasksPortalData | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [updatingTaskId, setUpdatingTaskId] = useState<number | null>(null);
  const [statusFilter, setStatusFilter] = useState<'all' | FreelancerWorkspaceTask['status']>('all');
  const [priorityFilter, setPriorityFilter] = useState<'all' | FreelancerWorkspaceTask['priority']>('all');
  const [summaryFilter, setSummaryFilter] = useState<FreelancerTaskSummaryFilter>('all');
  const [search, setSearch] = useState('');
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
      const response = await fetch('/api/freelancer-portal/tasks');
      const data = await getResponseJson<FreelancerTasksPortalData>(response);
      setPortal(data);
    } catch (error) {
      console.error('Error loading freelancer tasks portal:', error);
      setPortal(null);
      setMessage(
        error instanceof Error ? error.message : 'No se pudieron cargar tus tareas.',
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

  const handleStatusUpdate = async (
    taskId: number,
    status: FreelancerWorkspaceTask['status'],
  ) => {
    setUpdatingTaskId(taskId);

    try {
      const response = await fetch(`/api/freelancer-portal/tasks/${taskId}/status`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ status }),
      });

      if (!response.ok) {
        const errorData = (await response.json().catch(() => null)) as { error?: string } | null;
        throw new Error(errorData?.error || `Request failed with status ${response.status}`);
      }

      await loadPortal(true);
      setMessage('Estado de la tarea actualizado.');
    } catch (error) {
      console.error('Error updating freelancer task status:', error);
      setMessage(
        error instanceof Error ? error.message : 'No se pudo actualizar la tarea.',
        'error',
      );
    } finally {
      setUpdatingTaskId(null);
    }
  };

  const tasks = portal?.tasks || [];
  const normalizedSearch = search.trim().toLowerCase();
  const filteredTasks = tasks.filter((task) => {
    const matchesStatus = statusFilter === 'all' || task.status === statusFilter;
    const matchesPriority = priorityFilter === 'all' || task.priority === priorityFilter;
    const matchesSearch =
      normalizedSearch.length === 0 ||
      task.title.toLowerCase().includes(normalizedSearch) ||
      task.project_name.toLowerCase().includes(normalizedSearch) ||
      (task.client_name || '').toLowerCase().includes(normalizedSearch);
    const matchesSummary =
      summaryFilter === 'all' ||
      (summaryFilter === 'assigned' && task.is_assigned_to_me) ||
      (summaryFilter === 'due' && isDueThisWeek(task.due_date)) ||
      (summaryFilter === 'review' && task.status === 'review') ||
      (summaryFilter === 'done' && task.status === 'done');

    return matchesStatus && matchesPriority && matchesSearch && matchesSummary;
  });

  const scrollToTaskBoard = () => {
    document.getElementById('freelancer-tasks-board-section')?.scrollIntoView({
      behavior: 'smooth',
      block: 'start',
    });
  };

  return (
    <div className="space-y-8">
      <header className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h2 className="text-3xl font-bold">Tareas</h2>
          <p className="text-white/50">
            Gestiona tus tareas asignadas y el estado operativo de cada entrega desde el portal.
          </p>
        </div>

        <button
          type="button"
          onClick={() => void loadPortal(true)}
          className="glass-button-secondary"
          disabled={refreshing}
        >
          <RefreshCw className={cn('w-4 h-4', refreshing && 'animate-spin')} />
          Refrescar
        </button>
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
        title="Resumen de tareas"
        description="KPIs rápidos para leer tu carga operativa antes de entrar al detalle."
        icon={<ClipboardList className="w-5 h-5" />}
        summary={`${portal?.summary.total_tasks || 0} tareas`}
        storageKey="freelancer-tasks-summary"
      >
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-5 gap-6">
          {[
            {
              label: 'Total tareas',
              value: portal?.summary.total_tasks || 0,
              icon: ClipboardList,
              key: 'all' as const,
              hint: 'Vuelve al tablero completo',
            },
            {
              label: 'Asignadas a mí',
              value: portal?.summary.assigned_tasks || 0,
              icon: CheckCircle2,
              key: 'assigned' as const,
              hint: 'Filtra tu carga directa',
            },
            {
              label: 'Vencen esta semana',
              value: portal?.summary.due_this_week || 0,
              icon: Clock3,
              key: 'due' as const,
              hint: 'Prioriza entregas con fecha',
            },
            {
              label: 'En revisión',
              value: portal?.summary.in_review || 0,
              icon: Filter,
              key: 'review' as const,
              hint: 'Muestra tareas en validación',
              status: 'review' as const,
            },
            {
              label: 'Completadas',
              value: portal?.summary.completed_tasks || 0,
              icon: CheckCircle2,
              key: 'done' as const,
              hint: 'Muestra entregas cerradas',
              status: 'done' as const,
            },
          ].map((item) => (
            <InteractiveSummaryCard
              key={item.label}
              label={item.label}
              value={loading ? '...' : item.value}
              hint={item.hint}
              icon={item.icon}
              active={summaryFilter === item.key}
              onClick={() => {
                setSummaryFilter(item.key);
                setStatusFilter(item.status || 'all');
                scrollToTaskBoard();
              }}
            />
          ))}
        </div>
      </CollapsibleSection>

      <CollapsibleSection
        title="Filtros operativos"
        description="Encuentra rápido lo que tienes que mover hoy."
        icon={<Filter className="w-5 h-5" />}
        summary={`${filteredTasks.length} visibles`}
        storageKey="freelancer-tasks-filters"
        defaultOpen={false}
        actions={
          summaryFilter !== 'all' || statusFilter !== 'all' || priorityFilter !== 'all' ? (
            <button
              type="button"
              onClick={() => {
                setSummaryFilter('all');
                setStatusFilter('all');
                setPriorityFilter('all');
              }}
              className="glass-button-secondary"
            >
              Restablecer vista
            </button>
          ) : null
        }
      >
        <div className="grid grid-cols-1 md:grid-cols-[1.2fr_0.6fr_0.6fr] gap-4">
          <label className="rounded-2xl border border-white/10 bg-white/5 px-4 py-3 flex items-center gap-3">
            <Search className="w-4 h-4 text-white/35" />
            <input
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder="Buscar por tarea, cliente o proyecto"
              className="bg-transparent outline-none w-full text-sm"
            />
          </label>

          <label className="rounded-2xl border border-white/10 bg-white/5 px-4 py-3">
            <span className="text-[11px] uppercase tracking-wider text-white/35 font-bold block mb-2">
              Estado
            </span>
            <select
              value={statusFilter}
              onChange={(event) =>
                setStatusFilter(event.target.value as 'all' | FreelancerWorkspaceTask['status'])
              }
              className="bg-transparent outline-none w-full text-sm"
            >
              <option value="all">Todos</option>
              <option value="todo">Por hacer</option>
              <option value="in_progress">En curso</option>
              <option value="review">Revisión</option>
              <option value="done">Completadas</option>
            </select>
          </label>

          <label className="rounded-2xl border border-white/10 bg-white/5 px-4 py-3">
            <span className="text-[11px] uppercase tracking-wider text-white/35 font-bold block mb-2">
              Prioridad
            </span>
            <select
              value={priorityFilter}
              onChange={(event) =>
                setPriorityFilter(event.target.value as 'all' | FreelancerWorkspaceTask['priority'])
              }
              className="bg-transparent outline-none w-full text-sm"
            >
              <option value="all">Todas</option>
              <option value="high">Alta</option>
              <option value="medium">Media</option>
              <option value="low">Baja</option>
            </select>
          </label>
        </div>
      </CollapsibleSection>

      <CollapsibleSection
        title="Tablero operativo"
        description="Actualiza el estado solo en las tareas que tienes asignadas o que siguen sin responsable."
        icon={<CheckCircle2 className="w-5 h-5" />}
        summary={`${filteredTasks.length} tareas`}
        storageKey="freelancer-tasks-board"
        className="scroll-mt-6"
      >
        <div id="freelancer-tasks-board-section" />
        <div className="space-y-4">
          {loading ? (
            Array.from({ length: 4 }).map((_, index) => (
              <div
                key={`freelancer-task-skeleton-${index}`}
                className="h-44 rounded-2xl bg-white/5 animate-pulse"
              />
            ))
          ) : filteredTasks.length === 0 ? (
            <div className="rounded-2xl border border-white/10 bg-white/5 p-6 text-white/45">
              No hay tareas que coincidan con los filtros actuales.
            </div>
          ) : (
            filteredTasks.map((task) => (
              <div key={task.id} className="rounded-2xl border border-white/10 bg-white/5 p-5">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <p className="font-semibold text-lg">{task.title}</p>
                    <p className="text-sm text-white/45 mt-1">
                      {task.client_name || 'Cliente sin asignar'} · {task.project_name}
                    </p>
                  </div>

                  <div className="flex flex-wrap items-center gap-2">
                    <span
                      className={cn(
                        'text-[10px] px-2 py-1 rounded-full font-bold uppercase tracking-wider border',
                        getPriorityClasses(task.priority),
                      )}
                    >
                      {getPriorityLabel(task.priority)}
                    </span>
                    <span
                      className={cn(
                        'text-[10px] px-2 py-1 rounded-full font-bold uppercase tracking-wider border',
                        getStatusClasses(task.status),
                      )}
                    >
                      {getStatusLabel(task.status)}
                    </span>
                  </div>
                </div>

                {task.description ? (
                  <p className="text-sm text-white/55 mt-4 rounded-xl bg-white/5 px-4 py-3">
                    {task.description}
                  </p>
                ) : null}

                <div className="mt-4 grid grid-cols-1 md:grid-cols-3 gap-3 text-sm">
                  <div className="rounded-xl bg-white/5 px-4 py-3">
                    <p className="text-white/35 text-[11px] uppercase tracking-wider font-bold">
                      Vencimiento
                    </p>
                    <p className="font-semibold mt-2">{formatDate(task.due_date)}</p>
                  </div>

                  <div className="rounded-xl bg-white/5 px-4 py-3">
                    <p className="text-white/35 text-[11px] uppercase tracking-wider font-bold">
                      Asignacion
                    </p>
                    <p className="font-semibold mt-2">
                      {task.is_assigned_to_me ? 'Asignada a mí' : task.assigned_to ? 'Asignada a equipo' : 'Sin asignar'}
                    </p>
                  </div>

                  <div className="rounded-xl bg-white/5 px-4 py-3">
                    <p className="text-white/35 text-[11px] uppercase tracking-wider font-bold">
                      Estado
                    </p>
                    <div className="mt-2">
                      <select
                        value={task.status}
                        onChange={(event) =>
                          void handleStatusUpdate(
                            task.id,
                            event.target.value as FreelancerWorkspaceTask['status'],
                          )
                        }
                        disabled={!task.can_update_status || updatingTaskId === task.id}
                        className="bg-transparent outline-none w-full text-sm disabled:text-white/30"
                      >
                        <option value="todo">Por hacer</option>
                        <option value="in_progress">En curso</option>
                        <option value="review">Revisión</option>
                        <option value="done">Completada</option>
                      </select>
                    </div>
                  </div>
                </div>

                {!task.can_update_status ? (
                  <p className="text-xs text-white/35 mt-4">
                    Esta tarea está asignada a otro miembro del equipo. La ves por contexto, pero no
                    puedes cambiar su estado.
                  </p>
                ) : null}
              </div>
            ))
          )}
        </div>
      </CollapsibleSection>
    </div>
  );
};
