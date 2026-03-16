import React, { useEffect, useState } from 'react';
import {
  Plus,
  MoreVertical,
  Calendar,
  CheckCircle2,
  MessageSquare,
  Archive,
  RotateCcw,
  Trash2,
} from 'lucide-react';
import { AnimatePresence, motion } from 'motion/react';
import { Campaign, Client, Project, Task, cn } from '../types';

type ProjectColumnId = Exclude<Project['status'], 'completed'> | 'completed';

interface ProjectFormState {
  client_id: string;
  name: string;
  status: Project['status'];
}

interface ProjectBoardCard {
  project: Project;
  clientName: string;
  priority: 'Alta' | 'Media' | 'Baja';
  priorityTone: string;
  team: number;
  tasksSummary: string;
  campaignsCount: number;
  nextDueDate: string | null;
}

const columns: Array<{ id: ProjectColumnId; title: string; color: string }> = [
  { id: 'strategy', title: 'Estrategia', color: 'border-t-blue-500' },
  { id: 'setup', title: 'Configuración', color: 'border-t-purple-500' },
  { id: 'execution', title: 'En Ejecución', color: 'border-t-cyan-500' },
  { id: 'optimization', title: 'Optimización', color: 'border-t-pink-500' },
  { id: 'reporting', title: 'Reporte', color: 'border-t-green-500' },
  { id: 'completed', title: 'Completado', color: 'border-t-white/30' },
];

const createInitialProjectForm = (clientId?: number): ProjectFormState => ({
  client_id: clientId ? String(clientId) : '',
  name: '',
  status: 'strategy',
});

const getResponseJson = async <T,>(response: Response): Promise<T> => {
  if (!response.ok) {
    const errorData = (await response.json().catch(() => null)) as { error?: string } | null;
    throw new Error(errorData?.error || `Request failed with status ${response.status}`);
  }

  return response.json() as Promise<T>;
};

const isNextWeek = (dateString: string) => {
  const parsedDate = new Date(dateString);

  if (Number.isNaN(parsedDate.getTime())) {
    return false;
  }

  const start = new Date();
  start.setHours(0, 0, 0, 0);

  const end = new Date(start);
  end.setDate(end.getDate() + 7);

  return parsedDate >= start && parsedDate <= end;
};

const getPriorityFromTasks = (tasks: Task[]) => {
  if (tasks.some((task) => task.priority === 'high' && task.status !== 'done')) {
    return {
      label: 'Alta' as const,
      tone: 'bg-red-500/20 text-red-400',
    };
  }

  if (tasks.some((task) => task.priority === 'medium' && task.status !== 'done')) {
    return {
      label: 'Media' as const,
      tone: 'bg-yellow-500/20 text-yellow-400',
    };
  }

  return {
    label: 'Baja' as const,
    tone: 'bg-blue-500/20 text-blue-400',
  };
};

export const ProjectsKanban: React.FC = () => {
  const [projects, setProjects] = useState<Project[]>([]);
  const [clients, setClients] = useState<Client[]>([]);
  const [tasks, setTasks] = useState<Task[]>([]);
  const [campaigns, setCampaigns] = useState<Campaign[]>([]);
  const [loading, setLoading] = useState(true);
  const [showCalendarView, setShowCalendarView] = useState(false);
  const [showArchived, setShowArchived] = useState(false);
  const [showNewProjectForm, setShowNewProjectForm] = useState(false);
  const [expandedProjectId, setExpandedProjectId] = useState<number | null>(null);
  const [creatingProject, setCreatingProject] = useState(false);
  const [updatingProjectId, setUpdatingProjectId] = useState<number | null>(null);
  const [archivingProjectId, setArchivingProjectId] = useState<number | null>(null);
  const [deletingProjectId, setDeletingProjectId] = useState<number | null>(null);
  const [feedbackMessage, setFeedbackMessage] = useState<string | null>(null);
  const [feedbackTone, setFeedbackTone] = useState<'success' | 'error'>('success');
  const [projectForm, setProjectForm] = useState<ProjectFormState>(createInitialProjectForm());

  const loadProjectsData = async () => {
    try {
      const archiveQuery = showArchived ? '?include_archived=true' : '';
      const [projectsResponse, clientsResponse, tasksResponse, campaignsResponse] =
        await Promise.all([
          fetch(`/api/projects${archiveQuery}`),
          fetch(`/api/clients${archiveQuery}`),
          fetch(`/api/tasks${archiveQuery}`),
          fetch(`/api/campaigns${archiveQuery}`),
        ]);

      const [projectsData, clientsData, tasksData, campaignsData] = await Promise.all([
        getResponseJson<Project[]>(projectsResponse),
        getResponseJson<Client[]>(clientsResponse),
        getResponseJson<Task[]>(tasksResponse),
        getResponseJson<Campaign[]>(campaignsResponse),
      ]);

      setProjects(projectsData);
      setClients(clientsData);
      setTasks(tasksData);
      setCampaigns(campaignsData);
      setProjectForm((currentForm) =>
        currentForm.client_id || clientsData.length === 0
          ? currentForm
          : { ...currentForm, client_id: String(clientsData[0].id) },
      );
    } catch (error) {
      console.error('Error fetching projects:', error);
      setFeedbackTone('error');
      setFeedbackMessage('No se pudieron cargar los proyectos.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void loadProjectsData();
  }, [showArchived]);

  const setMessage = (message: string, tone: 'success' | 'error' = 'success') => {
    setFeedbackTone(tone);
    setFeedbackMessage(message);
  };

  const visibleProjects = projects.filter((project) =>
    showArchived ? Boolean(project.archived_at) : !project.archived_at,
  );

  const projectCards: ProjectBoardCard[] = visibleProjects.map((project) => {
    const relatedTasks = tasks.filter((task) => task.project_id === project.id);
    const relatedCampaigns = campaigns.filter(
      (campaign) => campaign.project_id === project.id,
    );
    const doneTasks = relatedTasks.filter((task) => task.status === 'done').length;
    const nextDueDate = relatedTasks
      .map((task) => task.due_date)
      .filter(Boolean)
      .sort((left, right) => new Date(left).getTime() - new Date(right).getTime())[0];
    const { label, tone } = getPriorityFromTasks(relatedTasks);
    const assignedUsers = new Set(
      relatedTasks
        .map((task) => task.assigned_to)
        .filter((assignedTo): assignedTo is number => typeof assignedTo === 'number'),
    );

    return {
      project,
      clientName:
        clients.find((client) => client.id === project.client_id)?.company || 'Cliente sin nombre',
      priority: label,
      priorityTone: tone,
      team: Math.max(1, assignedUsers.size || 1),
      tasksSummary: `${doneTasks}/${relatedTasks.length || 0}`,
      campaignsCount: relatedCampaigns.length,
      nextDueDate: nextDueDate || null,
    };
  });

  const visibleCards = showCalendarView
    ? projectCards.filter(
        (card) => card.nextDueDate && isNextWeek(card.nextDueDate),
      )
    : projectCards;

  const handleCreateProject = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setCreatingProject(true);

    try {
      const response = await fetch('/api/projects', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          client_id: Number(projectForm.client_id),
          name: projectForm.name,
          status: projectForm.status,
        }),
      });

      const createdProject = await getResponseJson<Project>(response);
      setProjects((currentProjects) => [createdProject, ...currentProjects]);
      setProjectForm(createInitialProjectForm(clients[0]?.id));
      setShowNewProjectForm(false);
      setMessage('Proyecto creado correctamente.');
    } catch (error) {
      console.error('Error creating project:', error);
      setMessage('No se pudo crear el proyecto.', 'error');
    } finally {
      setCreatingProject(false);
    }
  };

  const handleUpdateProjectStatus = async (
    projectId: number,
    status: Project['status'],
    successMessage?: string,
  ) => {
    setUpdatingProjectId(projectId);

    try {
      const response = await fetch(`/api/projects/${projectId}/status`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ status }),
      });

      const updatedProject = await getResponseJson<Project>(response);

      setProjects((currentProjects) =>
        currentProjects.map((project) =>
          project.id === updatedProject.id ? updatedProject : project,
        ),
      );
      setMessage(successMessage || 'Estado del proyecto actualizado.');
    } catch (error) {
      console.error('Error updating project status:', error);
      setMessage('No se pudo actualizar el estado del proyecto.', 'error');
    } finally {
      setUpdatingProjectId(null);
    }
  };

  const handleToggleNewProjectForm = () => {
    if (!showNewProjectForm && clients.length === 0) {
      setMessage('Necesitas al menos un cliente para crear proyectos.', 'error');
      return;
    }

    setShowNewProjectForm((current) => !current);
  };

  const handleArchiveProject = async (project: Project) => {
    setArchivingProjectId(project.id);

    try {
      const response = await fetch(`/api/projects/${project.id}/archive`, {
        method: 'POST',
      });

      await getResponseJson<Project>(response);
      await loadProjectsData();
      setExpandedProjectId((currentId) => (currentId === project.id ? null : currentId));
      setMessage(`Proyecto archivado: ${project.name}.`);
    } catch (error) {
      console.error('Error archiving project:', error);
      setMessage(
        error instanceof Error ? error.message : 'No se pudo archivar el proyecto.',
        'error',
      );
    } finally {
      setArchivingProjectId(null);
    }
  };

  const handleRestoreProject = async (project: Project) => {
    setArchivingProjectId(project.id);

    try {
      const response = await fetch(`/api/projects/${project.id}/restore`, {
        method: 'POST',
      });

      await getResponseJson<Project>(response);
      await loadProjectsData();
      setExpandedProjectId((currentId) => (currentId === project.id ? null : currentId));
      setMessage(`Proyecto restaurado: ${project.name}.`);
    } catch (error) {
      console.error('Error restoring project:', error);
      setMessage(
        error instanceof Error ? error.message : 'No se pudo restaurar el proyecto.',
        'error',
      );
    } finally {
      setArchivingProjectId(null);
    }
  };

  const handleDeleteProject = async (project: Project) => {
    if (
      !window.confirm(
        `Vas a eliminar permanentemente el proyecto ${project.name}. Esta acción no se puede deshacer.`,
      )
    ) {
      return;
    }

    setDeletingProjectId(project.id);

    try {
      const response = await fetch(`/api/projects/${project.id}`, {
        method: 'DELETE',
      });

      await getResponseJson<{ deleted: boolean; id: number }>(response);
      await loadProjectsData();
      setExpandedProjectId((currentId) => (currentId === project.id ? null : currentId));
      setMessage(`Proyecto eliminado: ${project.name}.`);
    } catch (error) {
      console.error('Error deleting project:', error);
      setMessage(
        error instanceof Error ? error.message : 'No se pudo eliminar el proyecto.',
        'error',
      );
    } finally {
      setDeletingProjectId(null);
    }
  };

  return (
    <div className="space-y-6 h-full flex flex-col">
      <header className="flex justify-between items-center">
        <div>
          <h2 className="text-3xl font-bold">Proyectos</h2>
          <p className="text-white/50">Gestiona el flujo de trabajo de tus clientes.</p>
        </div>
        <div className="flex gap-3">
          <button
            type="button"
            onClick={() => setShowCalendarView((current) => !current)}
            className={cn(
              'glass-button-secondary',
              showCalendarView && 'bg-brand-blue/20 border-brand-blue/20 text-brand-blue',
            )}
          >
            <Calendar className="w-5 h-5" />
            Vista Calendario
          </button>
          <button
            type="button"
            onClick={() => {
              setShowArchived((current) => !current);
              setShowNewProjectForm(false);
              setExpandedProjectId(null);
              setShowCalendarView(false);
            }}
            className={cn(
              'glass-button-secondary',
              showArchived && 'bg-brand-blue/20 border-brand-blue/20 text-brand-blue',
            )}
          >
            <Archive className="w-5 h-5" />
            {showArchived ? 'Viendo Archivados' : 'Ver Archivados'}
          </button>
          {!showArchived ? (
            <button
              type="button"
              onClick={handleToggleNewProjectForm}
              className="glass-button-primary"
            >
              <Plus className="w-5 h-5" />
              Nuevo Proyecto
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

      <AnimatePresence>
        {showNewProjectForm ? (
          <motion.form
            initial={{ opacity: 0, y: -8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -8 }}
            onSubmit={handleCreateProject}
            className="glass-panel p-6 grid grid-cols-1 md:grid-cols-3 gap-4"
          >
            {clients.length === 0 ? (
              <div className="md:col-span-3 text-sm text-yellow-400">
                Crea primero un cliente para poder registrar proyectos.
              </div>
            ) : null}
            <div>
              <label className="block text-xs font-bold uppercase tracking-wider text-white/40 mb-2">
                Cliente
              </label>
              <select
                required
                value={projectForm.client_id}
                onChange={(event) =>
                  setProjectForm((currentForm) => ({
                    ...currentForm,
                    client_id: event.target.value,
                  }))
                }
                className="w-full glass-input"
              >
                {clients.length === 0 ? (
                  <option value="">Sin clientes disponibles</option>
                ) : null}
                {clients.map((client) => (
                  <option key={client.id} value={client.id}>
                    {client.company}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-xs font-bold uppercase tracking-wider text-white/40 mb-2">
                Nombre del proyecto
              </label>
              <input
                required
                value={projectForm.name}
                onChange={(event) =>
                  setProjectForm((currentForm) => ({
                    ...currentForm,
                    name: event.target.value,
                  }))
                }
                className="w-full glass-input"
                placeholder="Ej. Lanzamiento Performance Q2"
              />
            </div>

            <div>
              <label className="block text-xs font-bold uppercase tracking-wider text-white/40 mb-2">
                Estado inicial
              </label>
              <select
                value={projectForm.status}
                onChange={(event) =>
                  setProjectForm((currentForm) => ({
                    ...currentForm,
                    status: event.target.value as Project['status'],
                  }))
                }
                className="w-full glass-input"
              >
                {columns.map((column) => (
                  <option key={column.id} value={column.id}>
                    {column.title}
                  </option>
                ))}
              </select>
            </div>

            <div className="md:col-span-3 flex justify-end gap-3">
              <button
                type="button"
                onClick={() => setShowNewProjectForm(false)}
                className="glass-button-secondary"
              >
                Cancelar
              </button>
              <button
                type="submit"
                disabled={creatingProject || clients.length === 0}
                className="glass-button-primary disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {creatingProject ? 'Creando...' : 'Guardar Proyecto'}
              </button>
            </div>
          </motion.form>
        ) : null}
      </AnimatePresence>

      <div className="flex gap-4 overflow-x-auto pb-6 flex-1 min-h-0">
        {columns.map((column) => {
          const cardsInColumn = visibleCards
            .filter((card) => card.project.status === column.id)
            .sort((left, right) => {
              if (!left.nextDueDate && !right.nextDueDate) {
                return 0;
              }

              if (!left.nextDueDate) {
                return 1;
              }

              if (!right.nextDueDate) {
                return -1;
              }

              return (
                new Date(left.nextDueDate).getTime() - new Date(right.nextDueDate).getTime()
              );
            });

          return (
            <div key={column.id} className="min-w-[300px] flex flex-col gap-4">
              <div
                className={cn(
                  'glass-panel p-4 border-t-4 flex justify-between items-center',
                  column.color,
                )}
              >
                <h3 className="font-bold text-sm uppercase tracking-wider">{column.title}</h3>
                <span className="bg-white/10 px-2 py-0.5 rounded text-xs font-bold">
                  {cardsInColumn.length}
                </span>
              </div>

              <div className="flex-1 space-y-4 overflow-y-auto pr-2">
                {loading ? (
                  [1, 2].map((item) => (
                    <div key={item} className="h-40 glass-card animate-pulse" />
                  ))
                ) : cardsInColumn.length === 0 ? (
                  <div className="glass-card p-4 text-xs text-white/40">
                    {showArchived
                      ? 'No hay proyectos archivados en esta etapa.'
                      : 'No hay proyectos en esta etapa.'}
                  </div>
                ) : (
                  cardsInColumn.map((card) => {
                    const isArchived = Boolean(card.project.archived_at);

                    return (
                    <div key={card.project.id} className="space-y-3">
                      <motion.div
                        layoutId={String(card.project.id)}
                        className={cn('glass-card p-4', isArchived && 'opacity-70')}
                        whileHover={{ y: -4 }}
                      >
                        <div className="flex justify-between items-start mb-3">
                          <span
                            className={cn(
                              'text-[10px] px-2 py-0.5 rounded-full font-bold uppercase',
                              card.priorityTone,
                            )}
                          >
                            {card.priority}
                          </span>
                          <button
                            type="button"
                            onClick={() =>
                              setExpandedProjectId((currentId) =>
                                currentId === card.project.id ? null : card.project.id,
                              )
                            }
                            className="text-white/20 hover:text-white"
                          >
                            <MoreVertical className="w-4 h-4" />
                          </button>
                        </div>

                        <h4 className="font-bold text-sm mb-1">{card.project.name}</h4>
                        <p className="text-xs text-white/40 mb-4">{card.clientName}</p>
                        {isArchived ? (
                          <p className="text-[10px] uppercase tracking-wider text-white/35 mb-4">
                            Archivado {card.project.archived_at
                              ? new Date(card.project.archived_at).toLocaleDateString('es-ES')
                              : 'sin fecha'}
                          </p>
                        ) : null}

                        <div className="flex items-center justify-between pt-4 border-t border-white/5">
                          <div className="flex -space-x-2">
                            {Array.from({ length: Math.max(1, Math.min(4, card.team)) }).map(
                              (_, index) => (
                                <div
                                  key={index}
                                  className="w-6 h-6 rounded-full border-2 border-[#050505] bg-brand-blue flex items-center justify-center text-[10px] font-bold"
                                >
                                  {String.fromCharCode(65 + index)}
                                </div>
                              ),
                            )}
                          </div>
                          <div className="flex items-center gap-3 text-white/40">
                            <div className="flex items-center gap-1 text-[10px]">
                              <CheckCircle2 className="w-3 h-3" /> {card.tasksSummary}
                            </div>
                            <div className="flex items-center gap-1 text-[10px]">
                              <MessageSquare className="w-3 h-3" /> {card.campaignsCount}
                            </div>
                          </div>
                        </div>
                      </motion.div>

                      <AnimatePresence>
                        {expandedProjectId === card.project.id ? (
                          <motion.div
                            initial={{ opacity: 0, y: -8 }}
                            animate={{ opacity: 1, y: 0 }}
                            exit={{ opacity: 0, y: -8 }}
                            className="glass-card p-4 space-y-4"
                          >
                            {isArchived ? (
                              <div className="glass-panel p-4 space-y-4">
                                <div className="text-xs text-white/40 flex flex-wrap gap-4">
                                  <span>
                                    Archivado el{' '}
                                    {card.project.archived_at
                                      ? new Date(card.project.archived_at).toLocaleDateString('es-ES')
                                      : 'sin fecha'}
                                  </span>
                                  <span>Tareas {card.tasksSummary}</span>
                                  <span>Campañas {card.campaignsCount}</span>
                                </div>

                                <div className="flex flex-wrap gap-2">
                                  <button
                                    type="button"
                                    disabled={archivingProjectId === card.project.id}
                                    onClick={() => void handleRestoreProject(card.project)}
                                    className="glass-button-secondary disabled:opacity-50 disabled:cursor-not-allowed"
                                  >
                                    <RotateCcw className="w-4 h-4" />
                                    {archivingProjectId === card.project.id
                                      ? 'Restaurando...'
                                      : 'Restaurar'}
                                  </button>
                                  <button
                                    type="button"
                                    disabled={deletingProjectId === card.project.id}
                                    onClick={() => void handleDeleteProject(card.project)}
                                    className="glass-button-secondary disabled:opacity-50 disabled:cursor-not-allowed"
                                  >
                                    <Trash2 className="w-4 h-4" />
                                    {deletingProjectId === card.project.id
                                      ? 'Eliminando...'
                                      : 'Eliminar definitivamente'}
                                  </button>
                                </div>
                              </div>
                            ) : (
                              <>
                                <div className="flex flex-wrap items-center justify-between gap-3">
                                  <div className="flex flex-wrap gap-2">
                                    {columns.map((targetColumn) => (
                                      <button
                                        key={targetColumn.id}
                                        type="button"
                                        disabled={updatingProjectId === card.project.id}
                                        onClick={() =>
                                          void handleUpdateProjectStatus(
                                            card.project.id,
                                            targetColumn.id,
                                            `Proyecto movido a ${targetColumn.title.toLowerCase()}.`,
                                          )
                                        }
                                        className={cn(
                                          'px-3 py-1.5 rounded-lg text-xs font-bold uppercase tracking-wider transition-all',
                                          card.project.status === targetColumn.id
                                            ? 'bg-brand-blue/20 text-brand-blue border border-brand-blue/20'
                                            : 'bg-white/5 text-white/60 border border-white/10 hover:bg-white/10',
                                        )}
                                      >
                                        {targetColumn.title}
                                      </button>
                                    ))}
                                  </div>

                                  <button
                                    type="button"
                                    disabled={archivingProjectId === card.project.id}
                                    onClick={() => void handleArchiveProject(card.project)}
                                    className="glass-button-secondary disabled:opacity-50 disabled:cursor-not-allowed"
                                  >
                                    <Archive className="w-4 h-4" />
                                    {archivingProjectId === card.project.id
                                      ? 'Archivando...'
                                      : 'Archivar'}
                                  </button>
                                </div>

                                <div className="text-xs text-white/40 flex flex-wrap gap-4">
                                  <span>
                                    Próximo vencimiento:{' '}
                                    {card.nextDueDate
                                      ? new Date(card.nextDueDate).toLocaleDateString('es-ES')
                                      : 'Sin fecha'}
                                  </span>
                                  <span>Tareas {card.tasksSummary}</span>
                                  <span>Campañas {card.campaignsCount}</span>
                                </div>
                              </>
                            )}
                          </motion.div>
                        ) : null}
                      </AnimatePresence>
                    </div>
                    );
                  })
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
};
