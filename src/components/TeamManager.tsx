import React, { useEffect, useState } from 'react';
import {
  Users,
  UserPlus,
  Mail,
  Copy,
  Shield,
  MoreHorizontal,
  Search,
  Filter,
  CheckCircle2,
  Clock3,
  Power,
  Send,
  ListChecks,
} from 'lucide-react';
import { AnimatePresence, motion } from 'motion/react';
import { TeamMember, TeamOnboardingStep, cn } from '../types';
import { CollapsibleSection } from './CollapsibleSection';
import { InteractiveSummaryCard } from './InteractiveSummaryCard';
import { openMailDraft } from '../lib/communication';

type TeamStatusFilter = 'all' | TeamMember['status'];
type TeamOnboardingStatus = NonNullable<TeamMember['onboarding']>['status'];

interface TeamFormState {
  name: string;
  email: string;
  role: string;
  status: TeamMember['status'];
}

const createInitialTeamForm = (): TeamFormState => ({
  name: '',
  email: '',
  role: 'Project Manager',
  status: 'offline',
});

const supportedRoles = [
  'Administrador',
  'Project Manager',
  'Media Buyer',
  'AI Specialist',
  'Account Manager',
  'Finance',
];

const getResponseJson = async <T,>(response: Response): Promise<T> => {
  if (!response.ok) {
    const errorData = (await response.json().catch(() => null)) as { error?: string } | null;
    throw new Error(errorData?.error || `Request failed with status ${response.status}`);
  }

  return response.json() as Promise<T>;
};

const formatShortDate = (value?: string | null) => {
  if (!value) {
    return 'Sin fecha';
  }

  const parsedDate = new Date(value);

  if (Number.isNaN(parsedDate.getTime())) {
    return value;
  }

  return parsedDate.toLocaleDateString('es-ES', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
  });
};

const getStatusLabel = (status: TeamMember['status']) => {
  switch (status) {
    case 'online':
      return 'Online';
    case 'meeting':
      return 'En reunión';
    case 'offline':
      return 'Offline';
    default:
      return status;
  }
};

const getStatusColor = (status: TeamMember['status']) => {
  switch (status) {
    case 'online':
      return 'bg-green-500/10 text-green-400 border-green-500/20';
    case 'meeting':
      return 'bg-yellow-500/10 text-yellow-400 border-yellow-500/20';
    case 'offline':
      return 'bg-white/10 text-white/60 border-white/10';
    default:
      return 'bg-white/10 text-white/60 border-white/10';
  }
};

const getStatusDotColor = (status: TeamMember['status']) => {
  switch (status) {
    case 'online':
      return 'bg-green-500';
    case 'meeting':
      return 'bg-yellow-500';
    case 'offline':
      return 'bg-white/20';
    default:
      return 'bg-white/20';
  }
};

const getAccessStatusLabel = (status: TeamMember['access_status']) => {
  switch (status) {
    case 'invited':
      return 'Invitado';
    case 'active':
    default:
      return 'Activo';
  }
};

const getAccessStatusColor = (status: TeamMember['access_status']) => {
  switch (status) {
    case 'invited':
      return 'bg-amber-500/10 text-amber-300 border-amber-500/20';
    case 'active':
    default:
      return 'bg-emerald-500/10 text-emerald-300 border-emerald-500/20';
  }
};

const getOnboardingStatusLabel = (status?: TeamOnboardingStatus) => {
  switch (status) {
    case 'completed':
      return 'Completado';
    case 'in_progress':
      return 'En progreso';
    case 'pending':
    default:
      return 'Pendiente';
  }
};

const getOnboardingStatusColor = (status?: TeamOnboardingStatus) => {
  switch (status) {
    case 'completed':
      return 'bg-emerald-500/10 text-emerald-300 border-emerald-500/20';
    case 'in_progress':
      return 'bg-blue-500/10 text-blue-300 border-blue-500/20';
    case 'pending':
    default:
      return 'bg-white/10 text-white/60 border-white/10';
  }
};

const getOnboardingStepStatusLabel = (status: TeamOnboardingStep['status']) => {
  switch (status) {
    case 'in_progress':
      return 'En progreso';
    case 'completed':
      return 'Completado';
    case 'pending':
    default:
      return 'Pendiente';
  }
};

const getOnboardingStepStatusColor = (status: TeamOnboardingStep['status']) => {
  switch (status) {
    case 'in_progress':
      return 'bg-blue-500/10 text-blue-300 border-blue-500/20';
    case 'completed':
      return 'bg-emerald-500/10 text-emerald-300 border-emerald-500/20';
    case 'pending':
    default:
      return 'bg-white/10 text-white/60 border-white/10';
  }
};

const getNextOnboardingStepStatus = (
  status: TeamOnboardingStep['status'],
): TeamOnboardingStep['status'] => {
  switch (status) {
    case 'pending':
      return 'in_progress';
    case 'in_progress':
      return 'completed';
    case 'completed':
    default:
      return 'pending';
  }
};

const isSystemManagedTeamOnboardingStep = (step: TeamOnboardingStep) => step.sort_order === 1;

const getTeamOnboardingStepLockReason = (
  onboarding: NonNullable<TeamMember['onboarding']>,
  step: TeamOnboardingStep,
) => {
  if (isSystemManagedTeamOnboardingStep(step)) {
    return 'Se completa automáticamente cuando el miembro activa su cuenta por primera vez.';
  }

  const stepIndex = onboarding.steps.findIndex((candidate) => candidate.id === step.id);

  if (stepIndex <= 0) {
    return null;
  }

  const blockingStep = onboarding.steps
    .slice(0, stepIndex)
    .find((candidate) => candidate.status !== 'completed');

  if (!blockingStep) {
    return null;
  }

  return `Bloqueado hasta completar "${blockingStep.title}".`;
};

export const TeamManager: React.FC = () => {
  const [members, setMembers] = useState<TeamMember[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState<TeamStatusFilter>('all');
  const [roleFilter, setRoleFilter] = useState('all');
  const [showFilters, setShowFilters] = useState(false);
  const [showInviteForm, setShowInviteForm] = useState(false);
  const [expandedMemberId, setExpandedMemberId] = useState<number | null>(null);
  const [creatingMember, setCreatingMember] = useState(false);
  const [updatingMemberId, setUpdatingMemberId] = useState<number | null>(null);
  const [resendingInviteId, setResendingInviteId] = useState<number | null>(null);
  const [updatingOnboardingStepId, setUpdatingOnboardingStepId] = useState<number | null>(null);
  const [feedbackMessage, setFeedbackMessage] = useState<string | null>(null);
  const [feedbackTone, setFeedbackTone] = useState<'success' | 'error'>('success');
  const [teamForm, setTeamForm] = useState<TeamFormState>(createInitialTeamForm());

  const loadTeam = async () => {
    try {
      const response = await fetch('/api/team');
      const data = await getResponseJson<TeamMember[]>(response);
      setMembers(data);
    } catch (error) {
      console.error('Error fetching team:', error);
      setFeedbackTone('error');
      setFeedbackMessage('No se pudo cargar el equipo.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void loadTeam();
  }, []);

  const setMessage = (message: string, tone: 'success' | 'error' = 'success') => {
    setFeedbackTone(tone);
    setFeedbackMessage(message);
  };

  const roleOptions = Array.from(
    new Set(members.map((member) => member.role).filter(Boolean)),
  ).sort((left, right) => left.localeCompare(right));

  const filteredMembers = members.filter((member) => {
    const query = searchQuery.trim().toLowerCase();
    const matchesQuery =
      query.length === 0 ||
      member.name.toLowerCase().includes(query) ||
      member.email.toLowerCase().includes(query) ||
      member.role.toLowerCase().includes(query);
    const matchesStatus = statusFilter === 'all' || member.status === statusFilter;
    const matchesRole = roleFilter === 'all' || member.role === roleFilter;

    return matchesQuery && matchesStatus && matchesRole;
  });

  const totalProjects = members.reduce((sum, member) => sum + member.projects, 0);
  const activeMembers = members.filter((member) => member.status === 'online').length;
  const uniqueRoles = new Set(members.map((member) => member.role).filter(Boolean)).size;

  const scrollToDirectory = () => {
    document.getElementById('team-directory-section')?.scrollIntoView({
      behavior: 'smooth',
      block: 'start',
    });
  };

  const handleCreateMember = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setCreatingMember(true);

    try {
      const response = await fetch('/api/team', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(teamForm),
      });

      const createdMember = await getResponseJson<TeamMember>(response);

      setMembers((currentMembers) => [...currentMembers, createdMember]);
      setTeamForm(createInitialTeamForm());
      setShowInviteForm(false);
      setMessage('Invitación creada correctamente.');
    } catch (error) {
      console.error('Error creating team member:', error);
      setMessage(
        error instanceof Error ? error.message : 'No se pudo crear el miembro del equipo.',
        'error',
      );
    } finally {
      setCreatingMember(false);
    }
  };

  const handleUpdateMemberStatus = async (
    memberId: number,
    status: TeamMember['status'],
    successMessage?: string,
  ) => {
    setUpdatingMemberId(memberId);

    try {
      const response = await fetch(`/api/team/${memberId}/status`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ status }),
      });

      const updatedMember = await getResponseJson<TeamMember>(response);

      setMembers((currentMembers) =>
        currentMembers.map((member) =>
          member.id === updatedMember.id ? updatedMember : member,
        ),
      );
      setMessage(successMessage || 'Estado del miembro actualizado.');
    } catch (error) {
      console.error('Error updating member status:', error);
      setMessage('No se pudo actualizar el estado del miembro.', 'error');
    } finally {
      setUpdatingMemberId(null);
    }
  };

  const handleCopyInvite = async (member: TeamMember) => {
    if (!member.activation_token) {
      setMessage('Este miembro ya no tiene una invitación pendiente.', 'error');
      return;
    }

    const inviteUrl = `${window.location.origin}/?invite=${member.activation_token}`;

    try {
      if (!navigator.clipboard) {
        throw new Error('Clipboard API not available');
      }

      await navigator.clipboard.writeText(inviteUrl);
      setMessage(`Enlace de invitación copiado para ${member.name}.`);
    } catch (error) {
      console.error('Error copying invite link:', error);
      setMessage('No se pudo copiar el enlace de invitación.', 'error');
    }
  };

  const handleResendInvite = async (memberId: number) => {
    setResendingInviteId(memberId);

    try {
      const response = await fetch(`/api/team/${memberId}/resend-invite`, {
        method: 'POST',
      });
      const updatedMember = await getResponseJson<TeamMember>(response);

      setMembers((currentMembers) =>
        currentMembers.map((member) =>
          member.id === updatedMember.id ? updatedMember : member,
        ),
      );
      setMessage('Invitación regenerada correctamente.');
    } catch (error) {
      console.error('Error resending invite:', error);
      setMessage(
        error instanceof Error ? error.message : 'No se pudo reenviar la invitación.',
        'error',
      );
    } finally {
      setResendingInviteId(null);
    }
  };

  const handleCycleOnboardingStep = async (
    member: TeamMember,
    step: TeamOnboardingStep,
  ) => {
    setUpdatingOnboardingStepId(step.id);

    try {
      const response = await fetch(`/api/team-onboarding-steps/${step.id}/status`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          status: getNextOnboardingStepStatus(step.status),
        }),
      });
      const updatedMember = await getResponseJson<TeamMember>(response);

      setMembers((currentMembers) =>
        currentMembers.map((currentMember) =>
          currentMember.id === updatedMember.id ? updatedMember : currentMember,
        ),
      );
      setMessage(`Onboarding actualizado para ${member.name}.`);
    } catch (error) {
      console.error('Error updating onboarding step:', error);
      setMessage(
        error instanceof Error
          ? error.message
          : 'No se pudo actualizar el paso del onboarding.',
        'error',
      );
    } finally {
      setUpdatingOnboardingStepId(null);
    }
  };

  const handleMailMember = (member: TeamMember) => {
    if (!member.email) {
      setMessage('Este miembro no tiene email configurado.', 'error');
      return;
    }

    openMailDraft({
      to: member.email,
      subject: `Seguimiento interno · ${member.name}`,
      body: [
        `Hola ${member.name},`,
        '',
        'Te escribo para revisar próximos pasos, coordinación operativa y cualquier bloqueo que tengamos pendiente.',
        'Cuando puedas, lo vemos y cerramos prioridades.',
      ].join('\n'),
    });
  };

  const toggleExpandedMember = (memberId: number) => {
    setExpandedMemberId((currentId) => (currentId === memberId ? null : memberId));
  };

  return (
    <div className="space-y-8">
      <header className="flex justify-between items-center">
        <div>
          <h2 className="text-3xl font-bold">Equipo</h2>
          <p className="text-white/50">Gestiona los miembros de tu agencia y sus permisos.</p>
        </div>
        <button
          type="button"
          onClick={() => setShowInviteForm((current) => !current)}
          className="glass-button-primary"
        >
          <UserPlus className="w-5 h-5" />
          Invitar Miembro
        </button>
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
        {showInviteForm ? (
          <motion.form
            initial={{ opacity: 0, y: -8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -8 }}
            onSubmit={handleCreateMember}
            className="glass-panel p-6 grid grid-cols-1 md:grid-cols-2 gap-4"
          >
            <div>
              <label className="block text-xs font-bold uppercase tracking-wider text-white/40 mb-2">
                Nombre
              </label>
              <input
                required
                value={teamForm.name}
                onChange={(event) =>
                  setTeamForm((currentForm) => ({
                    ...currentForm,
                    name: event.target.value,
                  }))
                }
                className="w-full glass-input"
                placeholder="Nombre del miembro"
              />
            </div>

            <div>
              <label className="block text-xs font-bold uppercase tracking-wider text-white/40 mb-2">
                Email
              </label>
              <input
                required
                type="email"
                value={teamForm.email}
                onChange={(event) =>
                  setTeamForm((currentForm) => ({
                    ...currentForm,
                    email: event.target.value,
                  }))
                }
                className="w-full glass-input"
                placeholder="persona@zaaryx.com"
              />
            </div>

            <div>
              <label className="block text-xs font-bold uppercase tracking-wider text-white/40 mb-2">
                Rol
              </label>
              <select
                value={teamForm.role}
                onChange={(event) =>
                  setTeamForm((currentForm) => ({
                    ...currentForm,
                    role: event.target.value,
                  }))
                }
                className="w-full glass-input"
              >
                {supportedRoles.map((role) => (
                  <option key={role} value={role}>
                    {role}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-xs font-bold uppercase tracking-wider text-white/40 mb-2">
                Estado inicial
              </label>
              <select
                value={teamForm.status}
                onChange={(event) =>
                  setTeamForm((currentForm) => ({
                    ...currentForm,
                    status: event.target.value as TeamMember['status'],
                  }))
                }
                className="w-full glass-input"
              >
                <option value="online">Online</option>
                <option value="meeting">En reunión</option>
                <option value="offline">Offline</option>
              </select>
            </div>

            <div className="md:col-span-2 flex justify-end gap-3">
              <button
                type="button"
                onClick={() => setShowInviteForm(false)}
                className="glass-button-secondary"
              >
                Cancelar
              </button>
              <button type="submit" disabled={creatingMember} className="glass-button-primary">
                <UserPlus className="w-5 h-5" />
                {creatingMember ? 'Invitando...' : 'Crear Miembro'}
              </button>
            </div>
          </motion.form>
        ) : null}
      </AnimatePresence>

      <CollapsibleSection
        title="Resumen del equipo"
        description="Métricas operativas para seguimiento de capacidad y estructura."
        icon={<Users className="w-5 h-5" />}
        storageKey="team-summary"
      >
        <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
          {[
            {
              label: 'Total Miembros',
              value: members.length,
              icon: Users,
              color: 'text-blue-400',
              active: statusFilter === 'all' && roleFilter === 'all',
              onClick: () => {
                setStatusFilter('all');
                setRoleFilter('all');
                setShowFilters(false);
                scrollToDirectory();
              },
            },
            {
              label: 'Activos Ahora',
              value: activeMembers,
              icon: CheckCircle2,
              color: 'text-green-400',
              active: statusFilter === 'online',
              onClick: () => {
                setStatusFilter('online');
                setShowFilters(true);
                scrollToDirectory();
              },
            },
            {
              label: 'Proyectos Asignados',
              value: totalProjects,
              icon: Shield,
              color: 'text-brand-purple',
              active: false,
              onClick: scrollToDirectory,
            },
            {
              label: 'Roles Definidos',
              value: uniqueRoles,
              icon: Filter,
              color: 'text-brand-cyan',
              active: roleFilter !== 'all',
              onClick: () => {
                setShowFilters(true);
                scrollToDirectory();
              },
            },
          ].map((stat) => (
            <InteractiveSummaryCard
              key={stat.label}
              label={stat.label}
              value={stat.value}
              icon={stat.icon}
              iconClassName={stat.color}
              active={stat.active}
              onClick={stat.onClick}
            />
          ))}
        </div>
      </CollapsibleSection>

      <CollapsibleSection
        title="Directorio del equipo"
        description="Búsqueda, filtros y detalle operativo de cada miembro."
        icon={<Search className="w-5 h-5" />}
        summary={`${filteredMembers.length} visibles`}
        storageKey="team-directory"
        actions={
          statusFilter !== 'all' || roleFilter !== 'all' ? (
            <button
              type="button"
              onClick={() => {
                setStatusFilter('all');
                setRoleFilter('all');
              }}
              className="glass-button-secondary"
            >
              Ver todos
            </button>
          ) : null
        }
      >
        <div id="team-directory-section" />
        <div className="space-y-6">
          <div className="flex gap-4">
            <div className="flex-1 relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-white/30" />
              <input
                type="text"
                value={searchQuery}
                onChange={(event) => setSearchQuery(event.target.value)}
                placeholder="Buscar por nombre, rol o email..."
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
                className="glass-panel p-4 grid grid-cols-1 md:grid-cols-2 gap-4"
              >
                <div>
                  <label className="block text-xs font-bold uppercase tracking-wider text-white/40 mb-2">
                    Estado
                  </label>
                  <select
                    value={statusFilter}
                    onChange={(event) =>
                      setStatusFilter(event.target.value as TeamStatusFilter)
                    }
                    className="w-full glass-input"
                  >
                    <option value="all">Todos</option>
                    <option value="online">Online</option>
                    <option value="meeting">En reunión</option>
                    <option value="offline">Offline</option>
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-bold uppercase tracking-wider text-white/40 mb-2">
                    Rol
                  </label>
                  <select
                    value={roleFilter}
                    onChange={(event) => setRoleFilter(event.target.value)}
                    className="w-full glass-input"
                  >
                    <option value="all">Todos</option>
                    {roleOptions.map((role) => (
                      <option key={role} value={role}>
                        {role}
                      </option>
                    ))}
                  </select>
                </div>
              </motion.div>
            ) : null}
          </AnimatePresence>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {loading
              ? [1, 2, 3, 4].map((item) => (
                  <div key={item} className="glass-panel p-6 h-40 animate-pulse bg-white/5" />
                ))
              : filteredMembers.length === 0
                ? (
                  <div className="glass-panel p-8 text-center text-white/40 lg:col-span-2">
                    No hay miembros que coincidan con los filtros actuales.
                  </div>
                )
                : filteredMembers.map((member) => (
                    <motion.div
                      key={member.id}
                      initial={{ opacity: 0, y: 20 }}
                      animate={{ opacity: 1, y: 0 }}
                      className="glass-panel p-6 group hover:border-brand-blue/30 transition-all"
                    >
                  <div className="flex items-center gap-6">
                    <div className="relative">
                      <div className="w-16 h-16 rounded-2xl bg-gradient-to-br from-brand-blue to-brand-purple flex items-center justify-center text-xl font-bold">
                        {member.name
                          .split(' ')
                          .map((namePart) => namePart[0])
                          .join('')
                          .slice(0, 2)}
                      </div>
                      <div
                        className={cn(
                          'absolute -bottom-1 -right-1 w-4 h-4 rounded-full border-2 border-[#050505]',
                          getStatusDotColor(member.status),
                        )}
                      />
                    </div>

                    <div className="flex-1">
                      <div className="flex justify-between items-start gap-4">
                        <div>
                          <h3 className="font-bold text-lg">{member.name}</h3>
                          <p className="text-sm text-brand-cyan font-medium">{member.role}</p>
                        </div>

                        <button
                          type="button"
                          onClick={() => toggleExpandedMember(member.id)}
                          className="p-2 hover:bg-white/10 rounded-lg transition-colors text-white/20 hover:text-white"
                        >
                          <MoreHorizontal className="w-5 h-5" />
                        </button>
                      </div>

                      <div className="mt-4 flex flex-wrap items-center gap-3">
                        <span
                          className={cn(
                            'text-[10px] px-2 py-1 rounded-full font-bold uppercase tracking-wider border',
                            getStatusColor(member.status),
                          )}
                        >
                          {getStatusLabel(member.status)}
                        </span>
                        <span
                          className={cn(
                            'text-[10px] px-2 py-1 rounded-full font-bold uppercase tracking-wider border',
                            getAccessStatusColor(member.access_status),
                          )}
                        >
                          {getAccessStatusLabel(member.access_status)}
                        </span>
                        <div className="flex items-center gap-2 text-xs text-white/40">
                          <Mail className="w-3 h-3" />
                          {member.email}
                        </div>
                        <div className="flex items-center gap-2 text-xs text-white/40">
                          <Shield className="w-3 h-3" />
                          {member.projects} proyectos
                        </div>
                        <div className="flex items-center gap-2 text-xs text-white/35">
                          <Clock3 className="w-3 h-3" />
                          {member.access_status === 'invited'
                            ? `Invitado ${formatShortDate(member.invited_at)}`
                            : `Activo desde ${formatShortDate(member.activated_at)}`}
                        </div>
                      </div>
                    </div>
                  </div>

                  <AnimatePresence>
                    {expandedMemberId === member.id ? (
                      <motion.div
                        initial={{ opacity: 0, y: -8 }}
                        animate={{ opacity: 1, y: 0 }}
                        exit={{ opacity: 0, y: -8 }}
                        className="mt-5 pt-5 border-t border-white/10 space-y-4"
                      >
                        <div className="flex flex-wrap gap-3">
                          <button
                            type="button"
                            onClick={() => handleMailMember(member)}
                            className="glass-button-secondary"
                          >
                            <Mail className="w-4 h-4" />
                            Email
                          </button>

                          {member.access_status === 'invited' ? (
                            <>
                              <button
                                type="button"
                                onClick={() => handleCopyInvite(member)}
                                className="glass-button-secondary"
                              >
                                <Copy className="w-4 h-4" />
                                Copiar invitación
                              </button>
                              <button
                                type="button"
                                disabled={resendingInviteId === member.id}
                                onClick={() => handleResendInvite(member.id)}
                                className="glass-button-secondary"
                              >
                                <Send className="w-4 h-4" />
                                {resendingInviteId === member.id
                                  ? 'Regenerando...'
                                  : 'Regenerar invitación'}
                              </button>
                            </>
                          ) : null}

                          {[
                            { status: 'online', label: 'Poner online', icon: CheckCircle2 },
                            { status: 'meeting', label: 'Marcar reunión', icon: Clock3 },
                            { status: 'offline', label: 'Poner offline', icon: Power },
                          ].map((action) => (
                            <button
                              key={action.status}
                              type="button"
                              disabled={
                                updatingMemberId === member.id || member.status === action.status
                              }
                              onClick={() =>
                                handleUpdateMemberStatus(
                                  member.id,
                                  action.status as TeamMember['status'],
                                  `${member.name} está ahora ${getStatusLabel(
                                    action.status as TeamMember['status'],
                                  ).toLowerCase()}.`,
                                )
                              }
                              className={cn(
                                'glass-button-secondary',
                                member.status === action.status &&
                                  'bg-brand-blue/20 border-brand-blue/20 text-brand-blue',
                              )}
                            >
                              <action.icon className="w-4 h-4" />
                              {updatingMemberId === member.id && member.status !== action.status
                                ? 'Guardando...'
                                : action.label}
                            </button>
                          ))}
                        </div>

                        <div className="glass-card p-4 space-y-4">
                          <div className="flex flex-wrap items-start justify-between gap-3">
                            <div>
                              <div className="flex items-center gap-2">
                                <ListChecks className="w-4 h-4 text-brand-cyan" />
                                <h4 className="font-semibold">Onboarding</h4>
                              </div>
                              <p className="text-xs text-white/45 mt-1">
                                {member.onboarding
                                  ? `Objetivo: ${formatShortDate(member.onboarding.target_ready_date)}`
                                  : 'Este miembro todavía no tiene onboarding generado.'}
                              </p>
                            </div>

                            {member.onboarding ? (
                              <div className="text-right space-y-2">
                                <span
                                  className={cn(
                                    'inline-flex text-[10px] px-2 py-1 rounded-full font-bold uppercase tracking-wider border',
                                    getOnboardingStatusColor(member.onboarding.status),
                                  )}
                                >
                                  {getOnboardingStatusLabel(member.onboarding.status)}
                                </span>
                                <p className="text-xs text-white/50">
                                  {member.onboarding.completed_steps}/{member.onboarding.total_steps}{' '}
                                  pasos completados
                                </p>
                              </div>
                            ) : null}
                          </div>

                          {member.onboarding ? (
                            <>
                              <div className="h-2 rounded-full bg-white/5 overflow-hidden">
                                <div
                                  className="h-full bg-gradient-to-r from-brand-blue to-brand-cyan transition-all"
                                  style={{ width: `${member.onboarding.progress}%` }}
                                />
                              </div>

                              <div className="space-y-2">
                                {member.onboarding.steps.map((step, stepIndex) => {
                                  const lockReason = getTeamOnboardingStepLockReason(
                                    member.onboarding!,
                                    step,
                                  );

                                  return (
                                    <div
                                      key={step.id}
                                      className="glass-panel p-3 space-y-3"
                                    >
                                      <div className="flex flex-wrap items-start justify-between gap-3">
                                        <div className="min-w-0">
                                          <div className="flex flex-wrap items-center gap-2">
                                            <span className="flex h-7 w-7 items-center justify-center rounded-full border border-white/10 bg-black/20 text-[11px] font-bold text-white/60">
                                              {stepIndex + 1}
                                            </span>
                                            <p className="font-medium text-sm">{step.title}</p>
                                            <span className="text-[10px] px-2 py-1 rounded-full font-bold uppercase tracking-wider border border-white/10 bg-black/20 text-white/55">
                                              {isSystemManagedTeamOnboardingStep(step)
                                                ? 'Sistema'
                                                : 'Equipo'}
                                            </span>
                                          </div>
                                          <p className="text-xs text-white/45 mt-2">
                                            {step.description || 'Sin descripción adicional.'}
                                          </p>
                                          <p className="text-[11px] text-white/35 mt-2">
                                            {lockReason ||
                                              'Paso habilitado para avanzar en secuencia.'}
                                          </p>
                                        </div>
                                        <span
                                          className={cn(
                                            'text-[10px] px-2 py-1 rounded-full font-bold uppercase tracking-wider border',
                                            getOnboardingStepStatusColor(step.status),
                                          )}
                                        >
                                          {updatingOnboardingStepId === step.id
                                            ? 'Guardando...'
                                            : getOnboardingStepStatusLabel(step.status)}
                                        </span>
                                      </div>

                                      <button
                                        type="button"
                                        onClick={() => handleCycleOnboardingStep(member, step)}
                                        disabled={
                                          Boolean(lockReason) ||
                                          updatingOnboardingStepId === step.id
                                        }
                                        className="glass-button-secondary w-full justify-center disabled:opacity-60"
                                      >
                                        {updatingOnboardingStepId === step.id
                                          ? 'Guardando...'
                                          : `Marcar ${getNextOnboardingStepStatus(step.status) === 'in_progress'
                                              ? 'en progreso'
                                              : getNextOnboardingStepStatus(step.status) === 'completed'
                                                ? 'completado'
                                                : 'pendiente'}`}
                                      </button>
                                    </div>
                                  );
                                })}
                              </div>
                            </>
                          ) : (
                            <div className="glass-panel p-3 text-sm text-white/45">
                              El onboarding se crea automáticamente cuando el miembro es invitado
                              con el nuevo flujo.
                            </div>
                          )}
                        </div>
                      </motion.div>
                    ) : null}
                  </AnimatePresence>
                    </motion.div>
                  ))}
          </div>
        </div>
      </CollapsibleSection>
    </div>
  );
};
