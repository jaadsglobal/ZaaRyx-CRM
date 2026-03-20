import React, { useEffect, useState } from 'react';
import {
  ArrowRight,
  Clock,
  AlertCircle,
  CheckCircle2,
  Briefcase,
  Flag,
  Plus,
  Filter,
  Search,
  MoreVertical,
  Calendar,
  Archive,
  RotateCcw,
  Trash2,
} from 'lucide-react';
import { AnimatePresence, motion } from 'motion/react';
import { CalendarEvent, Project, Task, TaskAssigneeOption, cn } from '../types';
import { CollapsibleSection } from './CollapsibleSection';
import { InteractiveSummaryCard } from './InteractiveSummaryCard';

type TaskStatusFilter = 'all' | Task['status'];
type TaskPriorityFilter = 'all' | Task['priority'];
type TaskSummaryFilter = 'all' | 'pending' | 'review' | 'done' | 'due';

interface TaskFormState {
  title: string;
  description: string;
  priority: Task['priority'];
  due_date: string;
  project_id: string;
  assigned_to: string;
}

const taskStatusOrder: Task['status'][] = ['todo', 'in_progress', 'review', 'done'];

const getResponseJson = async <T,>(response: Response): Promise<T> => {
  if (!response.ok) {
    const errorData = (await response.json().catch(() => null)) as { error?: string } | null;
    throw new Error(errorData?.error || `Request failed with status ${response.status}`);
  }

  return response.json() as Promise<T>;
};

const getDefaultDueDate = () => {
  const date = new Date();
  date.setDate(date.getDate() + 7);
  return date.toISOString().slice(0, 10);
};

const createInitialTaskForm = (projectId?: number): TaskFormState => ({
  title: '',
  description: '',
  priority: 'medium',
  due_date: getDefaultDueDate(),
  project_id: projectId ? String(projectId) : '',
  assigned_to: '',
});

const getPriorityColor = (priority: Task['priority']) => {
  switch (priority) {
    case 'high':
      return 'bg-red-500/20 text-red-400';
    case 'medium':
      return 'bg-yellow-500/20 text-yellow-400';
    case 'low':
      return 'bg-blue-500/20 text-blue-400';
    default:
      return 'bg-white/10 text-white/60';
  }
};

const getPriorityLabel = (priority: Task['priority']) => {
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

const getStatusLabel = (status: Task['status']) => {
  switch (status) {
    case 'todo':
      return 'Pendiente';
    case 'in_progress':
      return 'En progreso';
    case 'review':
      return 'En revisión';
    case 'done':
      return 'Completada';
    default:
      return status;
  }
};

const getStatusIcon = (status: Task['status']) => {
  switch (status) {
    case 'done':
      return <CheckCircle2 className="w-5 h-5 text-green-400" />;
    case 'in_progress':
      return <Clock className="w-5 h-5 text-brand-blue" />;
    case 'review':
      return <AlertCircle className="w-5 h-5 text-yellow-400" />;
    case 'todo':
      return <div className="w-5 h-5 rounded-full border-2 border-white/20" />;
    default:
      return <AlertCircle className="w-5 h-5 text-white/20" />;
  }
};

const isTaskInNextWeek = (dueDate: string) => {
  const parsedDate = new Date(dueDate);

  if (Number.isNaN(parsedDate.getTime())) {
    return false;
  }

  const start = new Date();
  start.setHours(0, 0, 0, 0);

  const end = new Date(start);
  end.setDate(end.getDate() + 7);

  return parsedDate >= start && parsedDate <= end;
};

const getTaskUrgencyState = (task: Task) => {
  const dueDate = new Date(task.due_date);

  if (Number.isNaN(dueDate.getTime())) {
    return 'unscheduled' as const;
  }

  const today = new Date();
  today.setHours(0, 0, 0, 0);

  if (dueDate < today && task.status !== 'done') {
    return 'overdue' as const;
  }

  if (isTaskInNextWeek(task.due_date) && task.status !== 'done') {
    return 'soon' as const;
  }

  return 'scheduled' as const;
};

const getTaskUrgencyLabel = (task: Task) => {
  const urgency = getTaskUrgencyState(task);

  switch (urgency) {
    case 'overdue':
      return 'Vencida';
    case 'soon':
      return 'Próxima';
    case 'scheduled':
      return task.status === 'done' ? 'Cerrada' : 'Planificada';
    case 'unscheduled':
    default:
      return 'Sin fecha válida';
  }
};

const getTaskUrgencyClass = (task: Task) => {
  const urgency = getTaskUrgencyState(task);

  switch (urgency) {
    case 'overdue':
      return 'bg-red-500/10 text-red-300 border-red-500/20';
    case 'soon':
      return 'bg-amber-500/10 text-amber-300 border-amber-500/20';
    case 'scheduled':
      return task.status === 'done'
        ? 'bg-emerald-500/10 text-emerald-300 border-emerald-500/20'
        : 'bg-brand-cyan/20 text-brand-cyan border-brand-cyan/20';
    case 'unscheduled':
    default:
      return 'bg-white/10 text-white/60 border-white/10';
  }
};

const getAssigneeInitials = (task: Task) => {
  const source = task.assigned_name || '';
  const parts = source
    .split(' ')
    .map((part) => part.trim())
    .filter(Boolean);

  if (parts.length === 0) {
    return task.assigned_to ? 'A' : 'U';
  }

  return parts
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase() || '')
    .join('');
};

const getTaskRecommendedMove = (task: Task) => {
  switch (task.status) {
    case 'todo':
      return 'Iniciar ejecución y confirmar bloqueos antes de moverla.';
    case 'in_progress':
      return 'Cerrar entregable principal y preparar validación interna.';
    case 'review':
      return 'Resolver feedback y dejar lista para cierre.';
    case 'done':
      return 'Monitorizar si requiere reapertura o dependencia adicional.';
    default:
      return 'Revisar el estado operativo de la tarea.';
  }
};

const formatCalendarSlot = (startAt: string, endAt?: string | null) => {
  const startValue = new Date(startAt);

  if (Number.isNaN(startValue.getTime())) {
    return 'Sin fecha';
  }

  const startText = startValue.toLocaleString('es-ES', {
    day: '2-digit',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
  });

  if (!endAt) {
    return startText;
  }

  const endValue = new Date(endAt);

  if (Number.isNaN(endValue.getTime())) {
    return startText;
  }

  return `${startText} - ${endValue.toLocaleTimeString('es-ES', {
    hour: '2-digit',
    minute: '2-digit',
  })}`;
};

const getCalendarStatusClass = (status: CalendarEvent['status']) => {
  switch (status) {
    case 'completed':
      return 'bg-green-500/20 text-green-400';
    case 'cancelled':
      return 'bg-white/10 text-white/60';
    case 'scheduled':
    default:
      return 'bg-brand-blue/20 text-brand-cyan';
  }
};

export const TasksManager: React.FC = () => {
  const [tasks, setTasks] = useState<Task[]>([]);
  const [projects, setProjects] = useState<Project[]>([]);
  const [calendarEvents, setCalendarEvents] = useState<CalendarEvent[]>([]);
  const [assignees, setAssignees] = useState<TaskAssigneeOption[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState<TaskStatusFilter>('all');
  const [priorityFilter, setPriorityFilter] = useState<TaskPriorityFilter>('all');
  const [summaryFilter, setSummaryFilter] = useState<TaskSummaryFilter>('all');
  const [showFilters, setShowFilters] = useState(false);
  const [showArchived, setShowArchived] = useState(false);
  const [showNewTaskForm, setShowNewTaskForm] = useState(false);
  const [showUpcomingOnly, setShowUpcomingOnly] = useState(false);
  const [expandedTaskId, setExpandedTaskId] = useState<number | null>(null);
  const [updatingTaskId, setUpdatingTaskId] = useState<number | null>(null);
  const [updatingAssignmentTaskId, setUpdatingAssignmentTaskId] = useState<number | null>(null);
  const [creatingTask, setCreatingTask] = useState(false);
  const [archivingTaskId, setArchivingTaskId] = useState<number | null>(null);
  const [deletingTaskId, setDeletingTaskId] = useState<number | null>(null);
  const [feedbackMessage, setFeedbackMessage] = useState<string | null>(null);
  const [feedbackTone, setFeedbackTone] = useState<'success' | 'error'>('success');
  const [taskForm, setTaskForm] = useState<TaskFormState>(createInitialTaskForm());

  const loadTasksData = async () => {
    try {
      const archiveQuery = showArchived ? '?include_archived=true' : '';
      const [tasksResponse, projectsResponse, calendarEventsResponse, assigneesResponse] = await Promise.all([
        fetch(`/api/tasks${archiveQuery}`),
        fetch(`/api/projects${archiveQuery}`),
        fetch('/api/calendar-events?tab=tasks&limit=24'),
        fetch('/api/task-assignees'),
      ]);

      const [tasksData, projectsData, calendarEventsData, assigneesData] = await Promise.all([
        getResponseJson<Task[]>(tasksResponse),
        getResponseJson<Project[]>(projectsResponse),
        getResponseJson<CalendarEvent[]>(calendarEventsResponse),
        getResponseJson<TaskAssigneeOption[]>(assigneesResponse),
      ]);

      setTasks(tasksData);
      setProjects(projectsData);
      setCalendarEvents(calendarEventsData.filter((event) => event.source_type === 'task'));
      setAssignees(assigneesData);
      setTaskForm((currentForm) =>
        currentForm.project_id || projectsData.length === 0
          ? currentForm
          : { ...currentForm, project_id: String(projectsData[0].id) },
      );
    } catch (error) {
      console.error('Error fetching tasks:', error);
      setFeedbackTone('error');
      setFeedbackMessage('No se pudieron cargar las tareas.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void loadTasksData();
  }, [showArchived]);

  const filteredTasks = tasks
    .filter((task) => {
      const query = searchQuery.trim().toLowerCase();
      const matchesQuery =
        query.length === 0 ||
        task.title.toLowerCase().includes(query) ||
        task.description.toLowerCase().includes(query);
      const matchesStatus = statusFilter === 'all' || task.status === statusFilter;
      const matchesPriority =
        priorityFilter === 'all' || task.priority === priorityFilter;
      const matchesDate = !showUpcomingOnly || isTaskInNextWeek(task.due_date);
      const matchesArchive = showArchived ? Boolean(task.archived_at) : !task.archived_at;
      const matchesSummary =
        summaryFilter === 'all' ||
        (summaryFilter === 'pending' && task.status !== 'done') ||
        (summaryFilter === 'review' && task.status === 'review') ||
        (summaryFilter === 'done' && task.status === 'done') ||
        (summaryFilter === 'due' && isTaskInNextWeek(task.due_date));

      return matchesQuery && matchesStatus && matchesPriority && matchesDate && matchesArchive && matchesSummary;
    })
    .sort(
      (left, right) =>
        new Date(left.due_date).getTime() - new Date(right.due_date).getTime(),
    );

  const visibleCalendarEvents = calendarEvents
    .filter((event) => event.status !== 'cancelled')
    .slice(0, 12);
  const operationalTasks = tasks.filter((task) => !task.archived_at);
  const pendingTasks = operationalTasks.filter((task) => task.status !== 'done');
  const reviewTasks = operationalTasks.filter((task) => task.status === 'review');
  const completedTasks = operationalTasks.filter((task) => task.status === 'done');
  const tasksDueSoon = operationalTasks.filter((task) => isTaskInNextWeek(task.due_date));

  const scrollToBacklog = () => {
    document.getElementById('tasks-backlog-section')?.scrollIntoView({
      behavior: 'smooth',
      block: 'start',
    });
  };

  const handleSummaryAction = (
    nextSummaryFilter: TaskSummaryFilter,
    nextStatus: TaskStatusFilter = 'all',
    upcomingOnly = false,
  ) => {
    setShowArchived(false);
    setSummaryFilter(nextSummaryFilter);
    setShowUpcomingOnly(upcomingOnly);
    setStatusFilter(nextStatus);
    setShowFilters(nextStatus !== 'all' || priorityFilter !== 'all');
    scrollToBacklog();
  };
  const projectNameById = projects.reduce<Record<number, string>>((accumulator, project) => {
    accumulator[project.id] = project.name;
    return accumulator;
  }, {});
  const assigneeById = assignees.reduce<Record<number, TaskAssigneeOption>>((accumulator, assignee) => {
    accumulator[assignee.id] = assignee;
    return accumulator;
  }, {});

  const setMessage = (message: string, tone: 'success' | 'error' = 'success') => {
    setFeedbackTone(tone);
    setFeedbackMessage(message);
  };

  const handleUpdateTaskStatus = async (
    taskId: number,
    status: Task['status'],
    successMessage?: string,
  ) => {
    setUpdatingTaskId(taskId);

    try {
      const response = await fetch(`/api/tasks/${taskId}/status`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ status }),
      });

      const updatedTask = await getResponseJson<Task>(response);

      setTasks((currentTasks) =>
        currentTasks.map((task) => (task.id === updatedTask.id ? updatedTask : task)),
      );
      void loadTasksData();
      setMessage(successMessage || 'Estado de tarea actualizado.');
    } catch (error) {
      console.error('Error updating task status:', error);
      setMessage('No se pudo actualizar el estado de la tarea.', 'error');
    } finally {
      setUpdatingTaskId(null);
    }
  };

  const handleCycleTaskStatus = async (task: Task) => {
    const currentIndex = taskStatusOrder.indexOf(task.status);
    const nextStatus = taskStatusOrder[(currentIndex + 1) % taskStatusOrder.length];
    await handleUpdateTaskStatus(
      task.id,
      nextStatus,
      `Tarea movida a ${getStatusLabel(nextStatus).toLowerCase()}.`,
    );
  };

  const handleCreateTask = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setCreatingTask(true);

    try {
      const response = await fetch('/api/tasks', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          title: taskForm.title,
          description: taskForm.description,
          priority: taskForm.priority,
          due_date: taskForm.due_date,
          project_id: taskForm.project_id ? Number(taskForm.project_id) : undefined,
          assigned_to: taskForm.assigned_to ? Number(taskForm.assigned_to) : null,
        }),
      });

      const createdTask = await getResponseJson<Task>(response);

      setTasks((currentTasks) =>
        [...currentTasks, createdTask].sort(
          (left, right) =>
            new Date(left.due_date).getTime() - new Date(right.due_date).getTime(),
        ),
      );
      void loadTasksData();
      setTaskForm(createInitialTaskForm(projects[0]?.id));
      setShowNewTaskForm(false);
      setMessage('Tarea creada correctamente.');
    } catch (error) {
      console.error('Error creating task:', error);
      setMessage('No se pudo crear la tarea.', 'error');
    } finally {
      setCreatingTask(false);
    }
  };

  const toggleExpandedTask = (taskId: number) => {
    setExpandedTaskId((currentId) => (currentId === taskId ? null : taskId));
  };

  const handleUpdateTaskAssignment = async (task: Task, assignedTo: string) => {
    setUpdatingAssignmentTaskId(task.id);

    try {
      const response = await fetch(`/api/tasks/${task.id}/assignment`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          assigned_to: assignedTo ? Number(assignedTo) : null,
        }),
      });

      const updatedTask = await getResponseJson<Task>(response);
      setTasks((currentTasks) =>
        currentTasks.map((currentTask) => (currentTask.id === updatedTask.id ? updatedTask : currentTask)),
      );
      setMessage(
        assignedTo
          ? `Tarea asignada a ${assigneeById[Number(assignedTo)]?.name || 'usuario seleccionado'}.`
          : 'Tarea desasignada correctamente.',
      );
    } catch (error) {
      console.error('Error updating task assignment:', error);
      setMessage(
        error instanceof Error ? error.message : 'No se pudo actualizar la asignacion de la tarea.',
        'error',
      );
    } finally {
      setUpdatingAssignmentTaskId(null);
    }
  };

  const handleToggleNewTaskForm = () => {
    if (!showNewTaskForm && projects.length === 0) {
      setMessage('Necesitas al menos un proyecto para crear tareas.', 'error');
      return;
    }

    setShowNewTaskForm((current) => !current);
  };

  const handleArchiveTask = async (task: Task) => {
    setArchivingTaskId(task.id);

    try {
      const response = await fetch(`/api/tasks/${task.id}/archive`, {
        method: 'POST',
      });

      await getResponseJson<Task>(response);
      await loadTasksData();
      setExpandedTaskId((currentId) => (currentId === task.id ? null : currentId));
      setMessage(`Tarea archivada: ${task.title}.`);
    } catch (error) {
      console.error('Error archiving task:', error);
      setMessage(
        error instanceof Error ? error.message : 'No se pudo archivar la tarea.',
        'error',
      );
    } finally {
      setArchivingTaskId(null);
    }
  };

  const handleRestoreTask = async (task: Task) => {
    setArchivingTaskId(task.id);

    try {
      const response = await fetch(`/api/tasks/${task.id}/restore`, {
        method: 'POST',
      });

      await getResponseJson<Task>(response);
      await loadTasksData();
      setExpandedTaskId((currentId) => (currentId === task.id ? null : currentId));
      setMessage(`Tarea restaurada: ${task.title}.`);
    } catch (error) {
      console.error('Error restoring task:', error);
      setMessage(
        error instanceof Error ? error.message : 'No se pudo restaurar la tarea.',
        'error',
      );
    } finally {
      setArchivingTaskId(null);
    }
  };

  const handleDeleteTask = async (task: Task) => {
    if (
      !window.confirm(
        `Vas a eliminar permanentemente la tarea ${task.title}. Esta acción no se puede deshacer.`,
      )
    ) {
      return;
    }

    setDeletingTaskId(task.id);

    try {
      const response = await fetch(`/api/tasks/${task.id}`, {
        method: 'DELETE',
      });

      await getResponseJson<{ deleted: boolean; id: number }>(response);
      await loadTasksData();
      setExpandedTaskId((currentId) => (currentId === task.id ? null : currentId));
      setMessage(`Tarea eliminada: ${task.title}.`);
    } catch (error) {
      console.error('Error deleting task:', error);
      setMessage(
        error instanceof Error ? error.message : 'No se pudo eliminar la tarea.',
        'error',
      );
    } finally {
      setDeletingTaskId(null);
    }
  };

  return (
    <div className="space-y-6">
      <header className="flex justify-between items-center">
        <div>
          <h2 className="text-3xl font-bold">Tareas</h2>
          <p className="text-white/50">Organiza el trabajo diario de tu equipo.</p>
        </div>
        <div className="flex gap-3">
          <button
            type="button"
            onClick={() => setShowUpcomingOnly((current) => !current)}
            className={cn(
              'glass-button-secondary',
              showUpcomingOnly && 'bg-brand-blue/20 border-brand-blue/20 text-brand-blue',
            )}
          >
            <Calendar className="w-5 h-5" />
            Calendario
          </button>
          <button
            type="button"
            onClick={() => {
              setShowArchived((current) => !current);
              setShowNewTaskForm(false);
              setExpandedTaskId(null);
              setShowUpcomingOnly(false);
            }}
            className={cn(
              'glass-button-secondary',
              showArchived && 'bg-brand-blue/20 border-brand-blue/20 text-brand-blue',
            )}
          >
            <Archive className="w-5 h-5" />
            {showArchived ? 'Viendo Archivadas' : 'Ver Archivadas'}
          </button>
          {!showArchived ? (
            <button
              type="button"
              onClick={handleToggleNewTaskForm}
              className="glass-button-primary"
            >
              <Plus className="w-5 h-5" />
              Nueva Tarea
            </button>
          ) : null}
        </div>
      </header>

      {feedbackMessage ? (
        <div
          className={cn(
            'glass-panel p-3 text-sm',
            feedbackTone === 'success' ? 'text-green-400' : 'text-red-400',
          )}
        >
          {feedbackMessage}
        </div>
      ) : null}

      <CollapsibleSection
        title="Resumen operativo"
        description="Visión rápida de carga, revisión y vencimientos del equipo."
        icon={<Clock className="w-5 h-5" />}
        storageKey="tasks-summary"
      >
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-4">
          {[
            {
              key: 'pending' as TaskSummaryFilter,
              label: 'Pendientes',
              value: pendingTasks.length,
              hint: 'Tareas aún abiertas',
              icon: Clock,
            },
            {
              key: 'review' as TaskSummaryFilter,
              label: 'En revisión',
              value: reviewTasks.length,
              hint: 'Bloqueando QA o feedback',
              icon: AlertCircle,
              status: 'review' as TaskStatusFilter,
            },
            {
              key: 'done' as TaskSummaryFilter,
              label: 'Completadas',
              value: completedTasks.length,
              hint: 'Entregables cerrados',
              icon: CheckCircle2,
              status: 'done' as TaskStatusFilter,
            },
            {
              key: 'due' as TaskSummaryFilter,
              label: 'Próximas 7 días',
              value: tasksDueSoon.length,
              hint: 'Vencimientos cercanos',
              icon: Calendar,
              upcomingOnly: true,
            },
          ].map((item) => (
            <InteractiveSummaryCard
              key={item.label}
              label={item.label}
              value={item.value}
              hint={item.hint}
              icon={item.icon}
              active={summaryFilter === item.key}
              onClick={() =>
                handleSummaryAction(item.key, item.status || 'all', Boolean(item.upcomingOnly))
              }
            />
          ))}
        </div>
      </CollapsibleSection>

      {showUpcomingOnly ? (
        <CollapsibleSection
          title="Agenda de tareas"
          description="Hitos operativos sincronizados desde el calendario interno."
          icon={<Calendar className="w-5 h-5" />}
          summary={`Próximos ${visibleCalendarEvents.length}`}
          storageKey="tasks-agenda"
        >
          {visibleCalendarEvents.length === 0 ? (
            <div className="glass-card p-4 text-sm text-white/45">
              No hay tareas con eventos de agenda pendientes.
            </div>
          ) : (
            <div className="grid grid-cols-1 xl:grid-cols-2 gap-4">
              {visibleCalendarEvents.map((event) => (
                <div key={event.id} className="glass-card p-4 space-y-3">
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <p className="font-semibold">{event.title}</p>
                      <p className="text-sm text-white/50 mt-1">
                        {event.description || 'Sin contexto adicional.'}
                      </p>
                    </div>
                    <span
                      className={cn(
                        'px-2 py-1 rounded-full text-xs font-medium',
                        getCalendarStatusClass(event.status),
                      )}
                    >
                      {event.status}
                    </span>
                  </div>

                  <div className="text-sm text-white/45">
                    {formatCalendarSlot(event.start_at, event.end_at)}
                  </div>
                </div>
              ))}
            </div>
          )}
        </CollapsibleSection>
      ) : null}

      <AnimatePresence>
        {showNewTaskForm ? (
          <motion.form
            initial={{ opacity: 0, y: -8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -8 }}
            onSubmit={handleCreateTask}
            className="glass-panel p-6 grid grid-cols-1 md:grid-cols-2 gap-4"
          >
            {projects.length === 0 ? (
              <div className="md:col-span-2 text-sm text-yellow-400">
                Crea primero un proyecto para poder registrar tareas.
              </div>
            ) : null}
            <div className="md:col-span-2">
              <label className="block text-xs font-bold uppercase tracking-wider text-white/40 mb-2">
                Título
              </label>
              <input
                required
                value={taskForm.title}
                onChange={(event) =>
                  setTaskForm((currentForm) => ({
                    ...currentForm,
                    title: event.target.value,
                  }))
                }
                className="w-full glass-input"
                placeholder="Ej. Configurar automatización de onboarding"
              />
            </div>

            <div>
              <label className="block text-xs font-bold uppercase tracking-wider text-white/40 mb-2">
                Proyecto
              </label>
              <select
                required
                value={taskForm.project_id}
                onChange={(event) =>
                  setTaskForm((currentForm) => ({
                    ...currentForm,
                    project_id: event.target.value,
                  }))
                }
                className="w-full glass-input"
              >
                {projects.length === 0 ? (
                  <option value="">Sin proyectos disponibles</option>
                ) : null}
                {projects.map((project) => (
                  <option key={project.id} value={project.id}>
                    {project.name}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-xs font-bold uppercase tracking-wider text-white/40 mb-2">
                Prioridad
              </label>
              <select
                value={taskForm.priority}
                onChange={(event) =>
                  setTaskForm((currentForm) => ({
                    ...currentForm,
                    priority: event.target.value as Task['priority'],
                  }))
                }
                className="w-full glass-input"
              >
                <option value="low">Baja</option>
                <option value="medium">Media</option>
                <option value="high">Alta</option>
              </select>
            </div>

            <div>
              <label className="block text-xs font-bold uppercase tracking-wider text-white/40 mb-2">
                Responsable
              </label>
              <select
                value={taskForm.assigned_to}
                onChange={(event) =>
                  setTaskForm((currentForm) => ({
                    ...currentForm,
                    assigned_to: event.target.value,
                  }))
                }
                className="w-full glass-input"
              >
                <option value="">Sin asignar</option>
                {assignees.map((assignee) => (
                  <option key={assignee.id} value={assignee.id}>
                    {assignee.name} · {assignee.role}
                    {assignee.access_status === 'invited' ? ' · Invitado' : ''}
                  </option>
                ))}
              </select>
            </div>

            <div className="md:col-span-2">
              <label className="block text-xs font-bold uppercase tracking-wider text-white/40 mb-2">
                Descripción
              </label>
              <textarea
                value={taskForm.description}
                onChange={(event) =>
                  setTaskForm((currentForm) => ({
                    ...currentForm,
                    description: event.target.value,
                  }))
                }
                className="w-full glass-input min-h-28"
                placeholder="Describe el alcance y el entregable esperado"
              />
            </div>

            <div>
              <label className="block text-xs font-bold uppercase tracking-wider text-white/40 mb-2">
                Vencimiento
              </label>
              <input
                required
                type="date"
                value={taskForm.due_date}
                onChange={(event) =>
                  setTaskForm((currentForm) => ({
                    ...currentForm,
                    due_date: event.target.value,
                  }))
                }
                className="w-full glass-input"
              />
            </div>

            <div className="md:col-span-2 flex justify-end gap-3">
              <button
                type="button"
                onClick={() => setShowNewTaskForm(false)}
                className="glass-button-secondary"
              >
                Cancelar
              </button>
              <button
                type="submit"
                disabled={creatingTask || projects.length === 0}
                className="glass-button-primary disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {creatingTask ? 'Creando...' : 'Guardar Tarea'}
              </button>
            </div>
          </motion.form>
        ) : null}
      </AnimatePresence>

      <CollapsibleSection
        title="Backlog operativo"
        description="Búsqueda, filtros y seguimiento de ejecución por tarea."
        icon={<Search className="w-5 h-5" />}
        summary={`${filteredTasks.length} visibles`}
        storageKey="tasks-backlog"
        bodyClassName="p-0"
        actions={
          summaryFilter !== 'all' || statusFilter !== 'all' || priorityFilter !== 'all' || showUpcomingOnly ? (
            <button
              type="button"
              onClick={() => {
                setSummaryFilter('all');
                setStatusFilter('all');
                setPriorityFilter('all');
                setShowUpcomingOnly(false);
              }}
              className="glass-button-secondary"
            >
              Restablecer vista
            </button>
          ) : null
        }
      >
        <div id="tasks-backlog-section" />
        <div className="p-6 space-y-6">
          <div className="flex gap-4">
            <div className="flex-1 relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-white/30" />
              <input
                value={searchQuery}
                onChange={(event) => setSearchQuery(event.target.value)}
                type="text"
                placeholder="Buscar tareas..."
                className="w-full glass-input pl-10"
              />
            </div>
            <button
              type="button"
              onClick={() => setShowFilters((current) => !current)}
              className={cn(
                'glass-button-secondary',
                showFilters && 'bg-brand-blue/20 border-brand-blue/20 text-brand-blue',
              )}
            >
              <Filter className="w-5 h-5" />
              Filtros
            </button>
          </div>

          <AnimatePresence>
            {showFilters ? (
              <motion.div
                initial={{ opacity: 0, y: -8 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -8 }}
                className="glass-panel p-4 grid grid-cols-1 md:grid-cols-3 gap-4"
              >
                <select
                  value={statusFilter}
                  onChange={(event) =>
                    setStatusFilter(event.target.value as TaskStatusFilter)
                  }
                  className="glass-input"
                >
                  <option value="all">Todos los estados</option>
                  <option value="todo">Pendiente</option>
                  <option value="in_progress">En progreso</option>
                  <option value="review">En revisión</option>
                  <option value="done">Completada</option>
                </select>

                <select
                  value={priorityFilter}
                  onChange={(event) =>
                    setPriorityFilter(event.target.value as TaskPriorityFilter)
                  }
                  className="glass-input"
                >
                  <option value="all">Todas las prioridades</option>
                  <option value="high">Alta</option>
                  <option value="medium">Media</option>
                  <option value="low">Baja</option>
                </select>

                <button
                  type="button"
                  onClick={() => {
                    setStatusFilter('all');
                    setPriorityFilter('all');
                    setShowUpcomingOnly(false);
                  }}
                  className="glass-button-secondary"
                >
                  Limpiar filtros
                </button>
              </motion.div>
            ) : null}
          </AnimatePresence>
        </div>

        <div className="border-t border-white/10">
          <div className="glass-panel overflow-hidden border-0 rounded-none">
            <div className="divide-y divide-white/5">
              {loading ? (
                [1, 2, 3].map((item) => <div key={item} className="h-20 bg-white/5 animate-pulse" />)
              ) : filteredTasks.length === 0 ? (
                <div className="p-8 text-center text-white/40">
                  {showArchived
                    ? 'No hay tareas archivadas que coincidan con los filtros actuales.'
                    : 'No hay tareas que coincidan con los filtros actuales.'}
                </div>
              ) : (
                filteredTasks.map((task) => {
                  const isArchived = Boolean(task.archived_at);

                  return (
                  <div key={task.id} className="group">
                    <motion.div
                      initial={{ opacity: 0 }}
                      animate={{ opacity: 1 }}
                      className={cn(
                        'p-4 flex items-center gap-4 hover:bg-white/5 transition-all',
                        isArchived && 'opacity-70',
                      )}
                    >
                  <button
                    type="button"
                    disabled={isArchived || updatingTaskId === task.id}
                    onClick={() => void handleCycleTaskStatus(task)}
                    className="transition-transform hover:scale-110 disabled:opacity-50"
                    title={
                      isArchived
                        ? 'La tarea está archivada'
                        : `Cambiar a ${getStatusLabel(
                            taskStatusOrder[
                              (taskStatusOrder.indexOf(task.status) + 1) % taskStatusOrder.length
                            ],
                          ).toLowerCase()}`
                    }
                  >
                    {getStatusIcon(task.status)}
                  </button>

                  <div className="flex-1">
                    <div className="flex items-center gap-3">
                      <h4
                        className={cn(
                          'font-bold text-sm',
                          task.status === 'done' && 'text-white/30 line-through',
                        )}
                      >
                        {task.title}
                      </h4>
                      <span className="text-[10px] uppercase tracking-wider text-white/30">
                        {isArchived ? 'Archivada' : getStatusLabel(task.status)}
                      </span>
                    </div>
                    <p className="text-xs text-white/40 mt-0.5">{task.description}</p>
                  </div>

                  <div className="flex items-center gap-6">
                    <div className="flex items-center gap-2 text-xs text-white/40">
                      <Calendar className="w-3 h-3" />
                      {new Date(task.due_date).toLocaleDateString('es-ES')}
                    </div>

                    <span
                      className={cn(
                        'text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-full',
                        getPriorityColor(task.priority),
                      )}
                    >
                      {getPriorityLabel(task.priority)}
                    </span>

                    <div className="flex -space-x-2">
                      <div
                        className="w-7 h-7 rounded-full border-2 border-[#050505] bg-brand-blue flex items-center justify-center text-[10px] font-bold"
                        title={task.assigned_name || 'Sin asignar'}
                      >
                        {getAssigneeInitials(task)}
                      </div>
                    </div>

                    <button
                      type="button"
                      onClick={() => toggleExpandedTask(task.id)}
                      className={cn(
                        'p-2 hover:bg-white/10 rounded-lg transition-colors opacity-0 group-hover:opacity-100',
                        expandedTaskId === task.id && 'opacity-100 bg-white/10',
                      )}
                    >
                      <MoreVertical className="w-4 h-4 text-white/40" />
                    </button>
                  </div>
                </motion.div>

                <AnimatePresence>
                  {expandedTaskId === task.id ? (
                    <motion.div
                      initial={{ opacity: 0, height: 0 }}
                      animate={{ opacity: 1, height: 'auto' }}
                      exit={{ opacity: 0, height: 0 }}
                      className="px-4 pb-4"
                    >
                      <div className="glass-card p-4 flex flex-col gap-3">
                        {isArchived ? (
                          <div className="glass-panel p-4 space-y-4">
                            <div className="text-xs text-white/40 flex flex-wrap gap-4">
                              <span>
                                Archivada el{' '}
                                {task.archived_at
                                  ? new Date(task.archived_at).toLocaleDateString('es-ES')
                                  : 'sin fecha'}
                              </span>
                              <span>
                                Proyecto {projectNameById[task.project_id] || `#${task.project_id}`}
                              </span>
                              <span>
                                Vencía {new Date(task.due_date).toLocaleDateString('es-ES')}
                              </span>
                            </div>

                            <div className="flex flex-wrap gap-2">
                              <button
                                type="button"
                                disabled={archivingTaskId === task.id}
                                onClick={() => void handleRestoreTask(task)}
                                className="glass-button-secondary disabled:opacity-50 disabled:cursor-not-allowed"
                              >
                                <RotateCcw className="w-4 h-4" />
                                {archivingTaskId === task.id ? 'Restaurando...' : 'Restaurar'}
                              </button>
                              <button
                                type="button"
                                disabled={deletingTaskId === task.id}
                                onClick={() => void handleDeleteTask(task)}
                                className="glass-button-secondary disabled:opacity-50 disabled:cursor-not-allowed"
                              >
                                <Trash2 className="w-4 h-4" />
                                {deletingTaskId === task.id
                                  ? 'Eliminando...'
                                  : 'Eliminar definitivamente'}
                              </button>
                            </div>
                          </div>
                        ) : (
                          <>
                            <div className="flex flex-wrap items-center justify-between gap-3">
                              <div className="flex flex-wrap gap-2">
                                {taskStatusOrder.map((status) => (
                                  <button
                                    key={status}
                                    type="button"
                                    disabled={updatingTaskId === task.id}
                                    onClick={() =>
                                      void handleUpdateTaskStatus(
                                        task.id,
                                        status,
                                        `Tarea movida a ${getStatusLabel(status).toLowerCase()}.`,
                                      )
                                    }
                                    className={cn(
                                      'px-3 py-1.5 rounded-lg text-xs font-bold uppercase tracking-wider transition-all',
                                      task.status === status
                                        ? 'bg-brand-blue/20 text-brand-blue border border-brand-blue/20'
                                        : 'bg-white/5 text-white/60 border border-white/10 hover:bg-white/10',
                                    )}
                                  >
                                    {getStatusLabel(status)}
                                  </button>
                                ))}
                              </div>

                              <button
                                type="button"
                                disabled={archivingTaskId === task.id}
                                onClick={() => void handleArchiveTask(task)}
                                className="glass-button-secondary disabled:opacity-50 disabled:cursor-not-allowed"
                              >
                                <Archive className="w-4 h-4" />
                                {archivingTaskId === task.id ? 'Archivando...' : 'Archivar'}
                              </button>
                            </div>

                            <div className="text-xs text-white/40 flex flex-wrap gap-4">
                              <span>
                                Proyecto {projectNameById[task.project_id] || `#${task.project_id}`}
                              </span>
                              <span>
                                Vence {new Date(task.due_date).toLocaleDateString('es-ES')}
                              </span>
                              <span>
                                Prioridad {getPriorityLabel(task.priority).toLowerCase()}
                              </span>
                            </div>

                            <div className="rounded-2xl border border-white/10 bg-black/20 p-4 space-y-3">
                              <div className="flex flex-wrap items-center justify-between gap-3">
                                <div>
                                  <p className="text-[10px] font-bold uppercase tracking-[0.22em] text-white/35">
                                    Asignacion
                                  </p>
                                  <p className="mt-2 text-sm text-white/60">
                                    {task.assigned_name
                                      ? `${task.assigned_name}${task.assignee_access_status === 'invited' ? ' · invitado' : ''}`
                                      : 'Todavia no hay un responsable asignado.'}
                                  </p>
                                </div>

                                <select
                                  value={task.assigned_to ? String(task.assigned_to) : ''}
                                  onChange={(event) =>
                                    void handleUpdateTaskAssignment(task, event.target.value)
                                  }
                                  disabled={updatingAssignmentTaskId === task.id}
                                  className="glass-input min-w-[240px] disabled:opacity-50"
                                >
                                  <option value="">Sin asignar</option>
                                  {assignees.map((assignee) => (
                                    <option key={assignee.id} value={assignee.id}>
                                      {assignee.name} · {assignee.role}
                                      {assignee.access_status === 'invited' ? ' · Invitado' : ''}
                                    </option>
                                  ))}
                                </select>
                              </div>
                            </div>

                            <div className="rounded-2xl border border-white/10 bg-black/20 p-4 space-y-4">
                              <div className="flex flex-wrap items-start justify-between gap-3">
                                <div>
                                  <p className="text-[10px] font-bold uppercase tracking-[0.22em] text-white/35">
                                    Panel operativo
                                  </p>
                                  <p className="mt-2 text-lg font-semibold">
                                    Siguiente movimiento: {getTaskRecommendedMove(task)}
                                  </p>
                                </div>
                                <span
                                  className={cn(
                                    'rounded-full border px-3 py-1 text-[10px] font-bold uppercase tracking-wider',
                                    getTaskUrgencyClass(task),
                                  )}
                                >
                                  {getTaskUrgencyLabel(task)}
                                </span>
                              </div>

                              <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-3">
                                {taskStatusOrder.map((status, index) => {
                                  const taskStatusIndex = taskStatusOrder.indexOf(task.status);
                                  const isCurrent = task.status === status;
                                  const isCompleted = taskStatusIndex > index;

                                  return (
                                    <button
                                      key={status}
                                      type="button"
                                      disabled={updatingTaskId === task.id || isCurrent}
                                      onClick={() =>
                                        void handleUpdateTaskStatus(
                                          task.id,
                                          status,
                                          `Tarea movida a ${getStatusLabel(status).toLowerCase()}.`,
                                        )
                                      }
                                      className={cn(
                                        'rounded-2xl border p-3 text-left transition-all',
                                        isCurrent &&
                                          'border-brand-blue/30 bg-brand-blue/10 shadow-[0_0_20px_rgba(0,102,255,0.08)]',
                                        isCompleted &&
                                          !isCurrent &&
                                          'border-emerald-500/20 bg-emerald-500/10',
                                        !isCompleted &&
                                          !isCurrent &&
                                          'border-white/10 bg-white/5 hover:bg-white/8',
                                      )}
                                    >
                                      <div className="flex items-center justify-between gap-3">
                                        <span className="text-[10px] font-bold uppercase tracking-wider text-white/35">
                                          Fase {index + 1}
                                        </span>
                                        {isCompleted ? (
                                          <CheckCircle2 className="h-4 w-4 text-emerald-300" />
                                        ) : isCurrent ? (
                                          <Clock className="h-4 w-4 text-brand-cyan" />
                                        ) : (
                                          <ArrowRight className="h-4 w-4 text-white/25" />
                                        )}
                                      </div>
                                      <p className="mt-3 text-sm font-semibold">
                                        {getStatusLabel(status)}
                                      </p>
                                      <p className="mt-1 text-[11px] leading-relaxed text-white/45">
                                        {status === 'todo'
                                          ? 'Pendiente de arranque operativo.'
                                          : status === 'in_progress'
                                            ? 'Trabajo en ejecución y producción.'
                                            : status === 'review'
                                              ? 'Validación o QA pendiente.'
                                              : 'Entrega cerrada y lista.'}
                                      </p>
                                    </button>
                                  );
                                })}
                              </div>

                              <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-3 text-xs text-white/45">
                                <div className="glass-card p-3">
                                  <div className="flex items-center justify-between gap-3">
                                    <p className="font-bold text-white/70">Urgencia</p>
                                    <AlertCircle className="h-4 w-4 text-brand-cyan" />
                                  </div>
                                  <p className="mt-2 text-sm font-semibold text-white">
                                    {getTaskUrgencyLabel(task)}
                                  </p>
                                  <p className="mt-1">
                                    {getTaskUrgencyState(task) === 'overdue'
                                      ? 'Necesita actuación inmediata.'
                                      : getTaskUrgencyState(task) === 'soon'
                                        ? 'Conviene moverla esta semana.'
                                        : 'No hay presión crítica ahora mismo.'}
                                  </p>
                                </div>
                                <div className="glass-card p-3">
                                  <div className="flex items-center justify-between gap-3">
                                    <p className="font-bold text-white/70">Prioridad</p>
                                    <Flag className="h-4 w-4 text-brand-cyan" />
                                  </div>
                                  <p className="mt-2 text-sm font-semibold text-white">
                                    {getPriorityLabel(task.priority)}
                                  </p>
                                  <p className="mt-1">
                                    {task.priority === 'high'
                                      ? 'Impacta directamente en entregas o bloqueos.'
                                      : task.priority === 'medium'
                                        ? 'Forma parte del flujo operativo normal.'
                                        : 'Puede moverse cuando se libere capacidad.'}
                                  </p>
                                </div>
                                <div className="glass-card p-3">
                                  <div className="flex items-center justify-between gap-3">
                                    <p className="font-bold text-white/70">Proyecto</p>
                                    <Briefcase className="h-4 w-4 text-brand-cyan" />
                                  </div>
                                  <p className="mt-2 text-sm font-semibold text-white">
                                    {projectNameById[task.project_id] || `#${task.project_id}`}
                                  </p>
                                  <p className="mt-1">
                                    Contexto operativo al que pertenece esta tarea.
                                  </p>
                                </div>
                                <div className="glass-card p-3">
                                  <div className="flex items-center justify-between gap-3">
                                    <p className="font-bold text-white/70">Próximo paso</p>
                                    <ArrowRight className="h-4 w-4 text-brand-cyan" />
                                  </div>
                                  <p className="mt-2 text-sm font-semibold text-white">
                                    {task.status === 'todo'
                                      ? 'Poner en progreso'
                                      : task.status === 'in_progress'
                                        ? 'Enviar a revisión'
                                        : task.status === 'review'
                                          ? 'Cerrar tarea'
                                          : 'Reabrir si hace falta'}
                                  </p>
                                  <p className="mt-1">{getTaskRecommendedMove(task)}</p>
                                </div>
                              </div>

                              <div className="flex flex-wrap gap-2">
                                {task.status !== 'in_progress' ? (
                                  <button
                                    type="button"
                                    disabled={updatingTaskId === task.id}
                                    onClick={() =>
                                      void handleUpdateTaskStatus(
                                        task.id,
                                        'in_progress',
                                        'Tarea movida a en progreso.',
                                      )
                                    }
                                    className="glass-button-secondary disabled:opacity-50 disabled:cursor-not-allowed"
                                  >
                                    <Clock className="w-4 h-4" />
                                    Poner en progreso
                                  </button>
                                ) : null}
                                {task.status !== 'review' ? (
                                  <button
                                    type="button"
                                    disabled={updatingTaskId === task.id}
                                    onClick={() =>
                                      void handleUpdateTaskStatus(
                                        task.id,
                                        'review',
                                        'Tarea enviada a revisión.',
                                      )
                                    }
                                    className="glass-button-secondary disabled:opacity-50 disabled:cursor-not-allowed"
                                  >
                                    <AlertCircle className="w-4 h-4" />
                                    Enviar a revisión
                                  </button>
                                ) : null}
                                {task.status !== 'done' ? (
                                  <button
                                    type="button"
                                    disabled={updatingTaskId === task.id}
                                    onClick={() =>
                                      void handleUpdateTaskStatus(
                                        task.id,
                                        'done',
                                        'Tarea marcada como completada.',
                                      )
                                    }
                                    className="glass-button-secondary disabled:opacity-50 disabled:cursor-not-allowed"
                                  >
                                    <CheckCircle2 className="w-4 h-4" />
                                    Completar
                                  </button>
                                ) : (
                                  <button
                                    type="button"
                                    disabled={updatingTaskId === task.id}
                                    onClick={() =>
                                      void handleUpdateTaskStatus(
                                        task.id,
                                        'todo',
                                        'Tarea reabierta como pendiente.',
                                      )
                                    }
                                    className="glass-button-secondary disabled:opacity-50 disabled:cursor-not-allowed"
                                  >
                                    <RotateCcw className="w-4 h-4" />
                                    Reabrir
                                  </button>
                                )}
                              </div>
                            </div>
                          </>
                        )}
                      </div>
                    </motion.div>
                  ) : null}
                </AnimatePresence>
                  </div>
                  );
                })
              )}
            </div>
          </div>
        </div>
      </CollapsibleSection>
    </div>
  );
};
