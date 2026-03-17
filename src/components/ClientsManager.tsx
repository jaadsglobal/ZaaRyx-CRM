import React, { useEffect, useState } from 'react';
import {
  Plus,
  Search,
  Filter,
  Building2,
  Briefcase,
  ChevronRight,
  Globe,
  ShieldCheck,
  Clock3,
  CheckCircle2,
  AlertCircle,
  Archive,
  RotateCcw,
  Trash2,
  FolderOpen,
  Receipt,
  FileText,
  KeyRound,
  UserRound,
  Mail,
  Phone,
  Download,
} from 'lucide-react';
import { AnimatePresence, motion } from 'motion/react';
import {
  Client,
  ClientManagementOverview,
  ClientOnboardingDocument,
  ClientOnboarding,
  ClientOnboardingStep,
  Lead,
  Project,
  cn,
} from '../types';
import { triggerClientDownload } from '../lib/download';
import { CollapsibleSection } from './CollapsibleSection';
import { InteractiveSummaryCard } from './InteractiveSummaryCard';

type ClientStatusFilter = 'all' | Client['status'];

interface ClientFormState {
  company: string;
  industry: string;
  budget: string;
  status: Client['status'];
  lead_id: string;
}

const createInitialClientForm = (): ClientFormState => ({
  company: '',
  industry: '',
  budget: '',
  status: 'active',
  lead_id: '',
});

const getResponseJson = async <T,>(response: Response): Promise<T> => {
  if (!response.ok) {
    const errorData = (await response.json().catch(() => null)) as { error?: string } | null;
    throw new Error(errorData?.error || `Request failed with status ${response.status}`);
  }

  return response.json() as Promise<T>;
};

const getClientStatusClasses = (status: Client['status']) =>
  status === 'active'
    ? 'bg-green-500/10 text-green-400 border-green-500/20'
    : 'bg-white/10 text-white/60 border-white/10';

const getClientStatusLabel = (status: Client['status']) =>
  status === 'active' ? 'Activo' : 'Inactivo';

const getOnboardingStatusLabel = (status: ClientOnboarding['status']) => {
  switch (status) {
    case 'pending':
      return 'Pendiente';
    case 'in_progress':
      return 'En marcha';
    case 'blocked':
      return 'Bloqueado';
    case 'completed':
      return 'Completado';
    default:
      return status;
  }
};

const getOnboardingStatusClasses = (status: ClientOnboarding['status']) => {
  switch (status) {
    case 'pending':
      return 'bg-white/10 text-white/60 border-white/10';
    case 'in_progress':
      return 'bg-brand-blue/20 text-brand-blue border-brand-blue/20';
    case 'blocked':
      return 'bg-red-500/10 text-red-400 border-red-500/20';
    case 'completed':
      return 'bg-green-500/10 text-green-400 border-green-500/20';
    default:
      return 'bg-white/10 text-white/60 border-white/10';
  }
};

const getOnboardingStepStatusLabel = (status: ClientOnboardingStep['status']) => {
  switch (status) {
    case 'pending':
      return 'Pendiente';
    case 'in_progress':
      return 'En curso';
    case 'completed':
      return 'Hecho';
    default:
      return status;
  }
};

const getOnboardingStepStatusIcon = (status: ClientOnboardingStep['status']) => {
  switch (status) {
    case 'completed':
      return <CheckCircle2 className="w-4 h-4 text-green-400" />;
    case 'in_progress':
      return <Clock3 className="w-4 h-4 text-brand-blue" />;
    case 'pending':
    default:
      return <AlertCircle className="w-4 h-4 text-white/30" />;
  }
};

const getNextOnboardingStepStatus = (
  status: ClientOnboardingStep['status'],
): ClientOnboardingStep['status'] => {
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

const normalizeClientOnboardingStepTitle = (title: string) => title.trim().toLowerCase();

const isClientManagedOnboardingStep = (step: ClientOnboardingStep) =>
  ['firma de contrato digital', 'formulario de onboarding'].includes(
    normalizeClientOnboardingStepTitle(step.title),
  );

const getClientOnboardingStepOwnerLabel = (step: ClientOnboardingStep) =>
  isClientManagedOnboardingStep(step) ? 'Cliente' : 'Agencia';

const getClientOnboardingStepLockReason = (
  onboarding: ClientOnboarding,
  step: ClientOnboardingStep,
) => {
  const normalizedTitle = normalizeClientOnboardingStepTitle(step.title);

  if (normalizedTitle === 'firma de contrato digital') {
    return 'Se actualiza desde el portal cliente cuando se firma el contrato.';
  }

  if (normalizedTitle === 'formulario de onboarding') {
    return 'Se actualiza desde el portal cliente cuando se guarda o envía el briefing.';
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

const formatCurrency = (
  amount: number,
  currency: ClientManagementOverview['currency'] = 'EUR',
) =>
  new Intl.NumberFormat('es-ES', {
    style: 'currency',
    currency,
    maximumFractionDigits: 0,
  }).format(amount || 0);

const getProjectStatusLabel = (status: Project['status']) => {
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

const getTaskStatusLabel = (status: ClientManagementOverview['team_tasks'][number]['status']) => {
  switch (status) {
    case 'todo':
      return 'Pendiente';
    case 'in_progress':
      return 'En curso';
    case 'review':
      return 'En revisión';
    case 'done':
      return 'Completada';
    default:
      return status;
  }
};

const getTaskPriorityLabel = (
  priority: ClientManagementOverview['team_tasks'][number]['priority'],
) => {
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

const getTaskPriorityClasses = (
  priority: ClientManagementOverview['team_tasks'][number]['priority'],
) => {
  switch (priority) {
    case 'high':
      return 'bg-red-500/10 text-red-300 border-red-500/20';
    case 'medium':
      return 'bg-amber-500/10 text-amber-300 border-amber-500/20';
    case 'low':
    default:
      return 'bg-white/10 text-white/60 border-white/10';
  }
};

const formatFileSize = (size: number) => {
  if (size < 1024) {
    return `${size} B`;
  }

  if (size < 1024 * 1024) {
    return `${(size / 1024).toFixed(1)} KB`;
  }

  return `${(size / (1024 * 1024)).toFixed(1)} MB`;
};

const getContractStatusLabel = (
  status: ClientManagementOverview['contracts']['recent'][number]['status'],
) => {
  switch (status) {
    case 'draft':
      return 'Borrador';
    case 'review':
      return 'Revisión';
    case 'ready':
      return 'Listo';
    case 'sent':
      return 'Enviado';
    case 'signed':
      return 'Firmado';
    case 'archived':
      return 'Archivado';
    default:
      return status;
  }
};

const getIntegrationStatusLabel = (
  status: ClientManagementOverview['accesses']['items'][number]['status'],
) => {
  switch (status) {
    case 'connected':
      return 'Conectado';
    case 'attention':
      return 'Revisión';
    case 'disconnected':
      return 'Sin conectar';
    default:
      return status;
  }
};

export const ClientsManager: React.FC = () => {
  const [clients, setClients] = useState<Client[]>([]);
  const [projects, setProjects] = useState<Project[]>([]);
  const [leads, setLeads] = useState<Lead[]>([]);
  const [onboardings, setOnboardings] = useState<ClientOnboarding[]>([]);
  const [clientOverviewById, setClientOverviewById] = useState<
    Record<number, ClientManagementOverview>
  >({});
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState<ClientStatusFilter>('all');
  const [industryFilter, setIndustryFilter] = useState('all');
  const [showFilters, setShowFilters] = useState(false);
  const [showArchived, setShowArchived] = useState(false);
  const [showNewClientForm, setShowNewClientForm] = useState(false);
  const [expandedClientId, setExpandedClientId] = useState<number | null>(null);
  const [creatingClient, setCreatingClient] = useState(false);
  const [updatingClientId, setUpdatingClientId] = useState<number | null>(null);
  const [startingOnboardingClientId, setStartingOnboardingClientId] = useState<number | null>(null);
  const [updatingOnboardingId, setUpdatingOnboardingId] = useState<number | null>(null);
  const [updatingOnboardingStepId, setUpdatingOnboardingStepId] = useState<number | null>(null);
  const [downloadingDocumentId, setDownloadingDocumentId] = useState<number | null>(null);
  const [archivingClientId, setArchivingClientId] = useState<number | null>(null);
  const [deletingClientId, setDeletingClientId] = useState<number | null>(null);
  const [feedbackMessage, setFeedbackMessage] = useState<string | null>(null);
  const [feedbackTone, setFeedbackTone] = useState<'success' | 'error'>('success');
  const [clientForm, setClientForm] = useState<ClientFormState>(createInitialClientForm());

  const loadClientsData = async () => {
    try {
      const archiveQuery = showArchived ? '?include_archived=true' : '';
      const [
        clientsResponse,
        projectsResponse,
        leadsResponse,
        onboardingsResponse,
        overviewResponse,
      ] =
        await Promise.all([
          fetch(`/api/clients${archiveQuery}`),
          fetch(`/api/projects${archiveQuery}`),
          fetch(`/api/leads${archiveQuery}`),
          fetch('/api/client-onboardings'),
          fetch(`/api/clients/overview${archiveQuery}`),
        ]);

      const clientsData = await getResponseJson<Client[]>(clientsResponse);
      const projectsData = projectsResponse.ok
        ? await getResponseJson<Project[]>(projectsResponse)
        : [];
      const leadsData = leadsResponse.ok
        ? await getResponseJson<Lead[]>(leadsResponse)
        : [];
      const onboardingsData = onboardingsResponse.ok
        ? await getResponseJson<ClientOnboarding[]>(onboardingsResponse)
        : [];
      const overviewData = overviewResponse.ok
        ? await getResponseJson<ClientManagementOverview[]>(overviewResponse)
        : [];

      setClients(clientsData);
      setProjects(projectsData);
      setLeads(leadsData);
      setOnboardings(onboardingsData);
      setClientOverviewById(
        overviewData.reduce<Record<number, ClientManagementOverview>>((accumulator, overview) => {
          accumulator[overview.client_id] = overview;
          return accumulator;
        }, {}),
      );
    } catch (error) {
      console.error('Error fetching clients:', error);
      setFeedbackTone('error');
      setFeedbackMessage('No se pudieron cargar los clientes.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void loadClientsData();
  }, [showArchived]);

  const setMessage = (message: string, tone: 'success' | 'error' = 'success') => {
    setFeedbackTone(tone);
    setFeedbackMessage(message);
  };

  const industryOptions = Array.from(
    new Set(clients.map((client) => client.industry).filter(Boolean)),
  ).sort();

  const projectCountByClient = projects.reduce<Record<number, number>>(
    (accumulator, project) => {
      accumulator[project.client_id] = (accumulator[project.client_id] || 0) + 1;
      return accumulator;
    },
    {},
  );

  const leadNameById = leads.reduce<Record<number, string>>((accumulator, lead) => {
    accumulator[lead.id] = lead.name;
    return accumulator;
  }, {});

  const onboardingByClientId = onboardings.reduce<Record<number, ClientOnboarding>>(
    (accumulator, onboarding) => {
      accumulator[onboarding.client_id] = onboarding;
      return accumulator;
    },
    {},
  );

  const filteredClients = clients.filter((client) => {
    const query = searchQuery.trim().toLowerCase();
    const matchesQuery =
      query.length === 0 ||
      client.company.toLowerCase().includes(query) ||
      (client.industry || '').toLowerCase().includes(query);
    const matchesStatus = statusFilter === 'all' || client.status === statusFilter;
    const matchesIndustry = industryFilter === 'all' || client.industry === industryFilter;
    const matchesArchive = showArchived ? Boolean(client.archived_at) : !client.archived_at;

    return matchesQuery && matchesStatus && matchesIndustry && matchesArchive;
  });

  const activeOperationalClients = clients.filter((client) => !client.archived_at);
  const activeOperationalProjects = projects.filter((project) => !project.archived_at);
  const activeClients = activeOperationalClients.filter(
    (client) => client.status === 'active',
  ).length;
  const retentionRate =
    activeOperationalClients.length === 0
      ? 0
      : (activeClients / activeOperationalClients.length) * 100;
  const industriesCount = new Set(
    activeOperationalClients.map((client) => client.industry).filter(Boolean),
  ).size;
  const projectsPerClient =
    activeOperationalClients.length === 0
      ? 0
      : activeOperationalProjects.length / activeOperationalClients.length;

  const scrollToClientList = () => {
    document.getElementById('clients-list-section')?.scrollIntoView({
      behavior: 'smooth',
      block: 'start',
    });
  };

  const handleCreateClient = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setCreatingClient(true);

    try {
      const response = await fetch('/api/clients', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          company: clientForm.company,
          industry: clientForm.industry,
          budget: Number(clientForm.budget || 0),
          status: clientForm.status,
          lead_id: clientForm.lead_id ? Number(clientForm.lead_id) : undefined,
        }),
      });

      const createdClient = await getResponseJson<Client>(response);

      setClients((currentClients) => [createdClient, ...currentClients]);
      setClientForm(createInitialClientForm());
      setShowNewClientForm(false);
      setMessage('Cliente creado correctamente.');
    } catch (error) {
      console.error('Error creating client:', error);
      setMessage('No se pudo crear el cliente.', 'error');
    } finally {
      setCreatingClient(false);
    }
  };

  const handleUpdateClientStatus = async (
    clientId: number,
    status: Client['status'],
    successMessage?: string,
  ) => {
    setUpdatingClientId(clientId);

    try {
      const response = await fetch(`/api/clients/${clientId}/status`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ status }),
      });

      const updatedClient = await getResponseJson<Client>(response);

      setClients((currentClients) =>
        currentClients.map((client) =>
          client.id === updatedClient.id ? updatedClient : client,
        ),
      );
      setMessage(successMessage || 'Estado del cliente actualizado.');
    } catch (error) {
      console.error('Error updating client status:', error);
      setMessage('No se pudo actualizar el estado del cliente.', 'error');
    } finally {
      setUpdatingClientId(null);
    }
  };

  const handleLeadSelection = (leadId: string) => {
    const selectedLead = leads.find((lead) => String(lead.id) === leadId);

    setClientForm((currentForm) => ({
      ...currentForm,
      lead_id: leadId,
      company: selectedLead?.company || currentForm.company,
      budget:
        selectedLead && !currentForm.budget
          ? String(selectedLead.budget || 0)
          : currentForm.budget,
    }));
  };

  const upsertOnboarding = (nextOnboarding: ClientOnboarding) => {
    setOnboardings((currentOnboardings) => {
      const existingIndex = currentOnboardings.findIndex(
        (onboarding) => onboarding.id === nextOnboarding.id,
      );

      if (existingIndex === -1) {
        return [nextOnboarding, ...currentOnboardings];
      }

      return currentOnboardings.map((onboarding) =>
        onboarding.id === nextOnboarding.id ? nextOnboarding : onboarding,
      );
    });
  };

  const handleStartOnboarding = async (client: Client) => {
    setStartingOnboardingClientId(client.id);

    try {
      const response = await fetch(`/api/clients/${client.id}/onboarding/start`, {
        method: 'POST',
      });

      const onboarding = await getResponseJson<ClientOnboarding>(response);
      upsertOnboarding(onboarding);
      await loadClientsData();
      setMessage(`Onboarding iniciado para ${client.company}.`);
    } catch (error) {
      console.error('Error starting onboarding:', error);
      setMessage('No se pudo iniciar el onboarding del cliente.', 'error');
    } finally {
      setStartingOnboardingClientId(null);
    }
  };

  const handleUpdateOnboarding = async (
    onboardingId: number,
    payload: Partial<
      Pick<ClientOnboarding, 'status' | 'kickoff_date' | 'target_launch_date'>
    >,
    successMessage: string,
  ) => {
    setUpdatingOnboardingId(onboardingId);

    try {
      const response = await fetch(`/api/client-onboardings/${onboardingId}`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(payload),
      });

      const onboarding = await getResponseJson<ClientOnboarding>(response);
      upsertOnboarding(onboarding);
      await loadClientsData();
      setMessage(successMessage);
    } catch (error) {
      console.error('Error updating onboarding:', error);
      setMessage('No se pudo actualizar el onboarding.', 'error');
    } finally {
      setUpdatingOnboardingId(null);
    }
  };

  const handleCycleOnboardingStep = async (
    onboarding: ClientOnboarding,
    step: ClientOnboardingStep,
  ) => {
    setUpdatingOnboardingStepId(step.id);

    try {
      const response = await fetch(`/api/client-onboarding-steps/${step.id}/status`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ status: getNextOnboardingStepStatus(step.status) }),
      });

      const nextOnboarding = await getResponseJson<ClientOnboarding>(response);
      upsertOnboarding(nextOnboarding);
      await loadClientsData();
      setMessage(
        `Paso actualizado en onboarding de ${
          clients.find((client) => client.id === onboarding.client_id)?.company || 'cliente'
        }.`,
      );
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

  const handleDownloadOnboardingDocument = async (documentId: number) => {
    setDownloadingDocumentId(documentId);

    try {
      const response = await fetch(`/api/client-onboarding-documents/${documentId}`);
      const document = await getResponseJson<ClientOnboardingDocument>(response);
      triggerClientDownload(document.file_data_url, document.file_name);
      setMessage(`Descarga iniciada para ${document.file_name}.`);
    } catch (error) {
      console.error('Error downloading onboarding document:', error);
      setMessage(
        error instanceof Error
          ? error.message
          : 'No se pudo descargar la documentación del onboarding.',
        'error',
      );
    } finally {
      setDownloadingDocumentId(null);
    }
  };

  const handleArchiveClient = async (client: Client) => {
    setArchivingClientId(client.id);

    try {
      const response = await fetch(`/api/clients/${client.id}/archive`, {
        method: 'POST',
      });

      await getResponseJson<Client>(response);
      await loadClientsData();
      setExpandedClientId((currentId) => (currentId === client.id ? null : currentId));
      setMessage(`Cliente archivado: ${client.company}.`);
    } catch (error) {
      console.error('Error archiving client:', error);
      setMessage(
        error instanceof Error ? error.message : 'No se pudo archivar el cliente.',
        'error',
      );
    } finally {
      setArchivingClientId(null);
    }
  };

  const handleRestoreClient = async (client: Client) => {
    setArchivingClientId(client.id);

    try {
      const response = await fetch(`/api/clients/${client.id}/restore`, {
        method: 'POST',
      });

      await getResponseJson<Client>(response);
      await loadClientsData();
      setExpandedClientId((currentId) => (currentId === client.id ? null : currentId));
      setMessage(`Cliente restaurado: ${client.company}.`);
    } catch (error) {
      console.error('Error restoring client:', error);
      setMessage(
        error instanceof Error ? error.message : 'No se pudo restaurar el cliente.',
        'error',
      );
    } finally {
      setArchivingClientId(null);
    }
  };

  const handleDeleteClient = async (client: Client) => {
    if (
      !window.confirm(
        `Vas a eliminar permanentemente el cliente ${client.company}. Esta acción no se puede deshacer.`,
      )
    ) {
      return;
    }

    setDeletingClientId(client.id);

    try {
      const response = await fetch(`/api/clients/${client.id}`, {
        method: 'DELETE',
      });

      await getResponseJson<{ deleted: boolean; id: number }>(response);
      await loadClientsData();
      setExpandedClientId((currentId) => (currentId === client.id ? null : currentId));
      setMessage(`Cliente eliminado: ${client.company}.`);
    } catch (error) {
      console.error('Error deleting client:', error);
      setMessage(
        error instanceof Error ? error.message : 'No se pudo eliminar el cliente.',
        'error',
      );
    } finally {
      setDeletingClientId(null);
    }
  };

  const handleToggleClientDetails = (clientId: number) => {
    setExpandedClientId((currentId) => (currentId === clientId ? null : clientId));
  };

  return (
    <div className="space-y-6">
      <header className="flex justify-between items-center">
        <div>
          <h2 className="text-3xl font-bold">Clientes</h2>
          <p className="text-white/50">Gestiona tu cartera de clientes activos y su facturación.</p>
        </div>
        <div className="flex gap-3">
          <button
            type="button"
            onClick={() => {
              setShowArchived((current) => !current);
              setShowNewClientForm(false);
              setExpandedClientId(null);
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
              onClick={() => setShowNewClientForm((current) => !current)}
              className="glass-button-primary"
            >
              <Plus className="w-5 h-5" />
              Nuevo Cliente
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
        {showNewClientForm ? (
          <motion.form
            initial={{ opacity: 0, y: -8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -8 }}
            onSubmit={handleCreateClient}
            className="glass-panel p-6 grid grid-cols-1 md:grid-cols-2 gap-4"
          >
            <div>
              <label className="block text-xs font-bold uppercase tracking-wider text-white/40 mb-2">
                Lead origen
              </label>
              <select
                value={clientForm.lead_id}
                onChange={(event) => handleLeadSelection(event.target.value)}
                className="w-full glass-input"
              >
                <option value="">Sin lead asociado</option>
                {leads.map((lead) => (
                  <option key={lead.id} value={lead.id}>
                    {lead.name} · {lead.company || 'Sin empresa'}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-xs font-bold uppercase tracking-wider text-white/40 mb-2">
                Empresa
              </label>
              <input
                required
                value={clientForm.company}
                onChange={(event) =>
                  setClientForm((currentForm) => ({
                    ...currentForm,
                    company: event.target.value,
                  }))
                }
                className="w-full glass-input"
                placeholder="Nombre de la empresa"
              />
            </div>

            <div>
              <label className="block text-xs font-bold uppercase tracking-wider text-white/40 mb-2">
                Industria
              </label>
              <input
                value={clientForm.industry}
                onChange={(event) =>
                  setClientForm((currentForm) => ({
                    ...currentForm,
                    industry: event.target.value,
                  }))
                }
                className="w-full glass-input"
                placeholder="Retail, Tecnología, Logística..."
              />
            </div>

            <div>
              <label className="block text-xs font-bold uppercase tracking-wider text-white/40 mb-2">
                Presupuesto
              </label>
              <input
                type="number"
                min="0"
                step="100"
                value={clientForm.budget}
                onChange={(event) =>
                  setClientForm((currentForm) => ({
                    ...currentForm,
                    budget: event.target.value,
                  }))
                }
                className="w-full glass-input"
                placeholder="5000"
              />
            </div>

            <div>
              <label className="block text-xs font-bold uppercase tracking-wider text-white/40 mb-2">
                Estado
              </label>
              <select
                value={clientForm.status}
                onChange={(event) =>
                  setClientForm((currentForm) => ({
                    ...currentForm,
                    status: event.target.value as Client['status'],
                  }))
                }
                className="w-full glass-input"
              >
                <option value="active">Activo</option>
                <option value="inactive">Inactivo</option>
              </select>
            </div>

            <div className="md:col-span-2 flex justify-end gap-3">
              <button
                type="button"
                onClick={() => setShowNewClientForm(false)}
                className="glass-button-secondary"
              >
                Cancelar
              </button>
              <button
                type="submit"
                disabled={creatingClient}
                className="glass-button-primary disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {creatingClient ? 'Creando...' : 'Guardar Cliente'}
              </button>
            </div>
          </motion.form>
        ) : null}
      </AnimatePresence>

      <CollapsibleSection
        title="Resumen de cartera"
        description="Indicadores rápidos de retención, industria y carga operativa."
        icon={<Building2 className="w-5 h-5" />}
        storageKey="clients-summary"
      >
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          <InteractiveSummaryCard
            label="Tasa de Retención"
            value={`${retentionRate.toFixed(1)}%`}
            hint="Filtra la cartera activa"
            icon={ShieldCheck}
            iconClassName="text-green-400"
            active={statusFilter === 'active'}
            onClick={() => {
              setStatusFilter('active');
              setShowFilters(true);
              scrollToClientList();
            }}
          />
          <InteractiveSummaryCard
            label="Industrias"
            value={industriesCount}
            hint="Abre filtros por vertical"
            icon={Globe}
            iconClassName="text-brand-blue"
            active={industryFilter !== 'all'}
            onClick={() => {
              setShowFilters(true);
              scrollToClientList();
            }}
          />
          <InteractiveSummaryCard
            label="Proyectos Promedio"
            value={projectsPerClient.toFixed(1)}
            hint="Vuelve al listado completo"
            icon={Briefcase}
            iconClassName="text-brand-purple"
            active={statusFilter === 'all' && industryFilter === 'all'}
            onClick={() => {
              setStatusFilter('all');
              setIndustryFilter('all');
              setShowFilters(false);
              scrollToClientList();
            }}
          />
        </div>
      </CollapsibleSection>

      <CollapsibleSection
        title="Cartera de clientes"
        description="Búsqueda, filtros y fichas operativas de cada cuenta."
        icon={<Search className="w-5 h-5" />}
        storageKey="clients-list"
        actions={
          statusFilter !== 'all' || industryFilter !== 'all' ? (
            <button
              type="button"
              onClick={() => {
                setStatusFilter('all');
                setIndustryFilter('all');
              }}
              className="glass-button-secondary"
            >
              Ver todos
            </button>
          ) : null
        }
      >
        <div id="clients-list-section" />
        <div className="space-y-6">
          <div className="flex gap-4">
            <div className="flex-1 relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-white/30" />
              <input
                value={searchQuery}
                onChange={(event) => setSearchQuery(event.target.value)}
                type="text"
                placeholder="Buscar clientes por nombre o industria..."
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
                    setStatusFilter(event.target.value as ClientStatusFilter)
                  }
                  className="glass-input"
                >
                  <option value="all">Todos los estados</option>
                  <option value="active">Activos</option>
                  <option value="inactive">Inactivos</option>
                </select>

                <select
                  value={industryFilter}
                  onChange={(event) => setIndustryFilter(event.target.value)}
                  className="glass-input"
                >
                  <option value="all">Todas las industrias</option>
                  {industryOptions.map((industry) => (
                    <option key={industry} value={industry}>
                      {industry}
                    </option>
                  ))}
                </select>

                <button
                  type="button"
                  onClick={() => {
                    setStatusFilter('all');
                    setIndustryFilter('all');
                  }}
                  className="glass-button-secondary"
                >
                  Limpiar filtros
                </button>
              </motion.div>
            ) : null}
          </AnimatePresence>

          <div className="grid grid-cols-1 gap-6">
        {loading ? (
          [1, 2].map((item) => <div key={item} className="h-48 glass-panel animate-pulse" />)
        ) : filteredClients.length === 0 ? (
          <div className="glass-panel p-8 text-center text-white/40">
            {showArchived
              ? 'No hay clientes archivados que coincidan con los filtros actuales.'
              : 'No hay clientes que coincidan con los filtros actuales.'}
          </div>
        ) : (
          filteredClients.map((client) => {
            const isArchived = Boolean(client.archived_at);
            const onboarding = onboardingByClientId[client.id];
            const clientOverview = clientOverviewById[client.id];

            return (
              <div key={client.id} className="space-y-3">
                <motion.div
                  initial={{ opacity: 0, scale: 0.95 }}
                  animate={{ opacity: 1, scale: 1 }}
                  className={cn(
                    'glass-panel p-6 hover:border-brand-blue/30 transition-all group',
                    isArchived && 'opacity-70',
                  )}
                >
                  <div className="flex justify-between items-start mb-6">
                    <div className="flex items-center gap-4">
                      <div className="w-14 h-14 rounded-2xl bg-white/5 border border-white/10 flex items-center justify-center">
                        <Building2 className="w-8 h-8 text-brand-blue" />
                      </div>
                      <div>
                        <h3 className="text-xl font-bold">{client.company}</h3>
                        <p className="text-sm text-white/40">
                          {client.industry || 'Sin industria'}
                        </p>
                      </div>
                    </div>
                    <span
                      className={cn(
                        'px-3 py-1 rounded-full text-[10px] font-bold uppercase tracking-wider border',
                        isArchived
                          ? 'bg-white/10 text-white/60 border-white/10'
                          : getClientStatusClasses(client.status),
                      )}
                    >
                      {isArchived ? 'Archivado' : getClientStatusLabel(client.status)}
                    </span>
                  </div>

                  <div className="grid grid-cols-3 gap-4 py-4 border-y border-white/5 mb-6">
                    <div className="flex flex-wrap gap-2">
                      <p className="text-[10px] text-white/30 uppercase font-bold mb-1">
                        Presupuesto
                      </p>
                      <p className="font-bold">${client.budget.toLocaleString()}</p>
                    </div>
                    <div>
                      <p className="text-[10px] text-white/30 uppercase font-bold mb-1">
                        Proyectos
                      </p>
                      <p className="font-bold">
                        {projectCountByClient[client.id] || 0} {isArchived ? 'registrados' : 'Activos'}
                      </p>
                    </div>
                    <div>
                      <p className="text-[10px] text-white/30 uppercase font-bold mb-1">
                        Miembro desde
                      </p>
                      <p className="font-bold">
                        {new Date(client.created_at).toLocaleDateString('es-ES')}
                      </p>
                    </div>
                  </div>

                  <div className="flex justify-between items-center">
                    <div className="flex -space-x-2">
                      {Array.from({
                        length: Math.max(1, Math.min(3, projectCountByClient[client.id] || 1)),
                      }).map((_, index) => (
                        <div
                          key={index}
                          className="w-8 h-8 rounded-full border-2 border-[#050505] bg-brand-purple flex items-center justify-center text-xs font-bold"
                        >
                          {String.fromCharCode(65 + index)}
                        </div>
                      ))}
                      {(projectCountByClient[client.id] || 0) > 3 ? (
                        <div className="w-8 h-8 rounded-full border-2 border-[#050505] bg-white/10 flex items-center justify-center text-[10px] font-bold">
                          +{(projectCountByClient[client.id] || 0) - 3}
                        </div>
                      ) : null}
                    </div>
                    <button
                      type="button"
                      onClick={() => handleToggleClientDetails(client.id)}
                      className="flex items-center gap-2 text-brand-blue font-bold text-sm group-hover:gap-3 transition-all"
                    >
                      Ver Detalles <ChevronRight className="w-4 h-4" />
                    </button>
                  </div>
                </motion.div>

                <AnimatePresence>
                  {expandedClientId === client.id ? (
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
                              {client.archived_at
                                ? new Date(client.archived_at).toLocaleDateString('es-ES')
                                : 'sin fecha'}
                            </span>
                            <span>
                              Lead asociado:{' '}
                              {client.lead_id
                                ? leadNameById[client.lead_id] || `#${client.lead_id}`
                                : 'Ninguno'}
                            </span>
                            <span>
                              Alta {new Date(client.created_at).toLocaleDateString('es-ES')}
                            </span>
                          </div>

                          <div className="flex flex-wrap gap-2">
                            <button
                              type="button"
                              disabled={archivingClientId === client.id}
                              onClick={() => void handleRestoreClient(client)}
                              className="glass-button-secondary disabled:opacity-50 disabled:cursor-not-allowed"
                            >
                              <RotateCcw className="w-4 h-4" />
                              {archivingClientId === client.id ? 'Restaurando...' : 'Restaurar'}
                            </button>
                            <button
                              type="button"
                              disabled={deletingClientId === client.id}
                              onClick={() => void handleDeleteClient(client)}
                              className="glass-button-secondary disabled:opacity-50 disabled:cursor-not-allowed"
                            >
                              <Trash2 className="w-4 h-4" />
                              {deletingClientId === client.id
                                ? 'Eliminando...'
                                : 'Eliminar definitivamente'}
                            </button>
                          </div>
                        </div>
                      ) : (
                        <>
                          <div className="flex flex-wrap items-center justify-between gap-3">
                            <div className="flex flex-wrap gap-2">
                              {(['active', 'inactive'] as Client['status'][]).map((status) => (
                                <button
                                  key={status}
                                  type="button"
                                  disabled={updatingClientId === client.id}
                                  onClick={() =>
                                    void handleUpdateClientStatus(
                                      client.id,
                                      status,
                                      `Cliente marcado como ${getClientStatusLabel(status).toLowerCase()}.`,
                                    )
                                  }
                                  className={cn(
                                    'px-3 py-1.5 rounded-lg text-xs font-bold uppercase tracking-wider transition-all',
                                    client.status === status
                                      ? 'bg-brand-blue/20 text-brand-blue border border-brand-blue/20'
                                      : 'bg-white/5 text-white/60 border border-white/10 hover:bg-white/10',
                                  )}
                                >
                                  {getClientStatusLabel(status)}
                                </button>
                              ))}
                            </div>

                            <button
                              type="button"
                              disabled={archivingClientId === client.id}
                              onClick={() => void handleArchiveClient(client)}
                              className="glass-button-secondary disabled:opacity-50 disabled:cursor-not-allowed"
                            >
                              <Archive className="w-4 h-4" />
                              {archivingClientId === client.id ? 'Archivando...' : 'Archivar'}
                            </button>
                          </div>

                          <div className="text-xs text-white/40 flex flex-wrap gap-4">
                            <span>
                              Lead asociado:{' '}
                              {client.lead_id
                                ? leadNameById[client.lead_id] || `#${client.lead_id}`
                                : 'Ninguno'}
                            </span>
                            <span>Proyectos activos: {projectCountByClient[client.id] || 0}</span>
                            <span>Budget ${client.budget.toLocaleString()}</span>
                          </div>

                          {clientOverview ? (
                            <>
                              <div className="grid grid-cols-1 xl:grid-cols-2 gap-4">
                                <CollapsibleSection
                                  title="Ficha del cliente"
                                  description="Contacto principal, contexto comercial y servicios visibles."
                                  icon={<UserRound className="w-5 h-5" />}
                                  summary={clientOverview.contact.name || 'Sin contacto'}
                                  storageKey={`client-${client.id}-profile-panel`}
                                  defaultOpen={false}
                                  className="self-start"
                                  bodyClassName="space-y-4"
                                >
                                  <div className="grid grid-cols-1 md:grid-cols-2 gap-3 text-sm">
                                    <div className="rounded-xl border border-white/10 bg-white/5 px-4 py-3 space-y-2">
                                      <p className="text-[10px] text-white/30 uppercase font-bold tracking-wider">
                                        Contacto
                                      </p>
                                      <p>{clientOverview.contact.name || 'Sin nombre asignado'}</p>
                                      <p className="flex items-center gap-2 text-white/60">
                                        <Mail className="w-4 h-4 text-white/35" />
                                        {clientOverview.contact.email || 'Sin email'}
                                      </p>
                                      <p className="flex items-center gap-2 text-white/60">
                                        <Phone className="w-4 h-4 text-white/35" />
                                        {clientOverview.contact.phone || 'Sin teléfono'}
                                      </p>
                                    </div>

                                    <div className="rounded-xl border border-white/10 bg-white/5 px-4 py-3 space-y-2">
                                      <p className="text-[10px] text-white/30 uppercase font-bold tracking-wider">
                                        Contexto comercial
                                      </p>
                                      <p>Industria: {client.industry || 'Sin industria'}</p>
                                      <p>Origen: {clientOverview.contact.source || 'No registrado'}</p>
                                      <p>
                                        Presupuesto:{' '}
                                        {formatCurrency(client.budget, clientOverview.currency)}
                                      </p>
                                    </div>
                                  </div>

                                  <div className="space-y-2">
                                    <p className="text-[10px] text-white/30 uppercase font-bold tracking-wider">
                                      Servicios contratados o previstos
                                    </p>
                                    {clientOverview.services.length > 0 ? (
                                      <div className="flex flex-wrap gap-2">
                                        {clientOverview.services.map((service) => (
                                          <span
                                            key={service}
                                            className="px-3 py-1.5 rounded-full border border-white/10 bg-white/5 text-xs text-white/75"
                                          >
                                            {service}
                                          </span>
                                        ))}
                                      </div>
                                    ) : (
                                      <div className="glass-input text-sm text-white/40">
                                        Todavía no hay servicios vinculados en contratos o lead.
                                      </div>
                                    )}
                                  </div>
                                </CollapsibleSection>

                                <CollapsibleSection
                                  title="Setup operativo"
                                  description="Proyecto inicial, onboarding y carga actual del equipo."
                                  icon={<FolderOpen className="w-5 h-5" />}
                                  summary={
                                    clientOverview.setup.has_project_folder
                                      ? `${clientOverview.projects.length} proyectos`
                                      : 'Pendiente'
                                  }
                                  storageKey={`client-${client.id}-setup-panel`}
                                  defaultOpen={false}
                                  className="self-start"
                                  bodyClassName="space-y-4"
                                >
                                  <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                                    <div className="glass-input">
                                      <p className="text-[10px] text-white/30 uppercase font-bold tracking-wider">
                                        Proyectos
                                      </p>
                                      <p className="text-xl font-bold mt-2">
                                        {clientOverview.projects.length}
                                      </p>
                                    </div>
                                    <div className="glass-input">
                                      <p className="text-[10px] text-white/30 uppercase font-bold tracking-wider">
                                        Onboarding
                                      </p>
                                      <p className="text-xl font-bold mt-2">
                                        {clientOverview.setup.onboarding_progress}%
                                      </p>
                                    </div>
                                    <div className="glass-input">
                                      <p className="text-[10px] text-white/30 uppercase font-bold tracking-wider">
                                        Tareas abiertas
                                      </p>
                                      <p className="text-xl font-bold mt-2">
                                        {clientOverview.setup.team_tasks_open}
                                      </p>
                                    </div>
                                    <div className="glass-input">
                                      <p className="text-[10px] text-white/30 uppercase font-bold tracking-wider">
                                        Tareas cerradas
                                      </p>
                                      <p className="text-xl font-bold mt-2">
                                        {clientOverview.setup.team_tasks_completed}
                                      </p>
                                    </div>
                                  </div>

                                  <div className="space-y-3">
                                    <p className="text-[10px] text-white/30 uppercase font-bold tracking-wider">
                                      Carpeta de proyectos
                                    </p>
                                    {clientOverview.projects.length === 0 ? (
                                      <div className="glass-input text-sm text-white/40">
                                        Aún no existe carpeta operativa para este cliente.
                                      </div>
                                    ) : (
                                      clientOverview.projects.slice(0, 3).map((project) => (
                                        <div
                                          key={project.id}
                                          className="rounded-xl border border-white/10 bg-white/5 px-4 py-3 flex flex-wrap items-center justify-between gap-3"
                                        >
                                          <div>
                                            <p className="font-bold">{project.name}</p>
                                            <p className="text-xs text-white/40 mt-1">
                                              {project.open_tasks} abiertas · {project.completed_tasks}{' '}
                                              completadas
                                            </p>
                                          </div>
                                          <span className="px-3 py-1 rounded-full border border-white/10 bg-white/5 text-[10px] uppercase tracking-wider text-white/65 font-bold">
                                            {getProjectStatusLabel(project.status)}
                                          </span>
                                        </div>
                                      ))
                                    )}
                                  </div>
                                </CollapsibleSection>

                                <CollapsibleSection
                                  title="Contratos y facturación"
                                  description="Estado económico, deuda viva y contratos recientes."
                                  icon={<Receipt className="w-5 h-5" />}
                                  summary={`${clientOverview.contracts.total} contratos`}
                                  storageKey={`client-${client.id}-billing-panel`}
                                  defaultOpen={false}
                                  className="self-start"
                                  bodyClassName="space-y-4"
                                >
                                  <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                                    <div className="glass-input">
                                      <p className="text-[10px] text-white/30 uppercase font-bold tracking-wider">
                                        Facturado
                                      </p>
                                      <p className="text-lg font-bold mt-2">
                                        {formatCurrency(
                                          clientOverview.billing.total_invoiced,
                                          clientOverview.currency,
                                        )}
                                      </p>
                                    </div>
                                    <div className="glass-input">
                                      <p className="text-[10px] text-white/30 uppercase font-bold tracking-wider">
                                        Pendiente
                                      </p>
                                      <p className="text-lg font-bold mt-2">
                                        {formatCurrency(
                                          clientOverview.billing.pending_amount,
                                          clientOverview.currency,
                                        )}
                                      </p>
                                    </div>
                                    <div className="glass-input">
                                      <p className="text-[10px] text-white/30 uppercase font-bold tracking-wider">
                                        Vencido
                                      </p>
                                      <p className="text-lg font-bold mt-2">
                                        {formatCurrency(
                                          clientOverview.billing.overdue_amount,
                                          clientOverview.currency,
                                        )}
                                      </p>
                                    </div>
                                    <div className="glass-input">
                                      <p className="text-[10px] text-white/30 uppercase font-bold tracking-wider">
                                        Firmados
                                      </p>
                                      <p className="text-lg font-bold mt-2">
                                        {clientOverview.contracts.signed}
                                      </p>
                                    </div>
                                  </div>

                                  <div className="space-y-3">
                                    <p className="text-[10px] text-white/30 uppercase font-bold tracking-wider">
                                      Contratos recientes
                                    </p>
                                    {clientOverview.contracts.recent.length === 0 ? (
                                      <div className="glass-input text-sm text-white/40">
                                        Este cliente todavía no tiene contratos registrados.
                                      </div>
                                    ) : (
                                      clientOverview.contracts.recent.map((contract) => (
                                        <div
                                          key={contract.id}
                                          className="rounded-xl border border-white/10 bg-white/5 px-4 py-3 flex flex-wrap items-center justify-between gap-3"
                                        >
                                          <div>
                                            <p className="font-bold">{contract.contract_number}</p>
                                            <p className="text-xs text-white/40 mt-1">
                                              Inicio {new Date(contract.start_date).toLocaleDateString('es-ES')}
                                            </p>
                                          </div>
                                          <div className="text-right">
                                            <p className="font-bold">
                                              {formatCurrency(
                                                contract.total_amount,
                                                contract.currency,
                                              )}
                                            </p>
                                            <p className="text-[11px] text-white/35 uppercase tracking-wider">
                                              {getContractStatusLabel(contract.status)}
                                            </p>
                                          </div>
                                        </div>
                                      ))
                                    )}
                                  </div>
                                </CollapsibleSection>

                                <CollapsibleSection
                                  title="Accesos del cliente"
                                  description="Ads, analítica y cuentas operativas documentadas."
                                  icon={<KeyRound className="w-5 h-5" />}
                                  summary={`${clientOverview.accesses.connected} conectados`}
                                  storageKey={`client-${client.id}-accesses-panel`}
                                  defaultOpen={false}
                                  className="self-start"
                                  bodyClassName="space-y-4"
                                >
                                  <div className="grid grid-cols-3 gap-3">
                                    <div className="glass-input">
                                      <p className="text-[10px] text-white/30 uppercase font-bold tracking-wider">
                                        Totales
                                      </p>
                                      <p className="text-xl font-bold mt-2">
                                        {clientOverview.accesses.total}
                                      </p>
                                    </div>
                                    <div className="glass-input">
                                      <p className="text-[10px] text-white/30 uppercase font-bold tracking-wider">
                                        OK
                                      </p>
                                      <p className="text-xl font-bold mt-2">
                                        {clientOverview.accesses.connected}
                                      </p>
                                    </div>
                                    <div className="glass-input">
                                      <p className="text-[10px] text-white/30 uppercase font-bold tracking-wider">
                                        Pendientes
                                      </p>
                                      <p className="text-xl font-bold mt-2">
                                        {clientOverview.accesses.disconnected}
                                      </p>
                                    </div>
                                  </div>

                                  <div className="space-y-3">
                                    {clientOverview.accesses.items.length === 0 ? (
                                      <div className="glass-input text-sm text-white/40">
                                        Todavía no hay accesos documentados para este cliente.
                                      </div>
                                    ) : (
                                      clientOverview.accesses.items.map((access) => (
                                        <div
                                          key={access.id}
                                          className="rounded-xl border border-white/10 bg-white/5 px-4 py-3 flex flex-wrap items-center justify-between gap-3"
                                        >
                                          <div>
                                            <p className="font-bold">{access.integration_name}</p>
                                            <p className="text-xs text-white/40 mt-1">
                                              {access.account_label || 'Cuenta pendiente de documentar'}
                                            </p>
                                          </div>
                                          <span
                                            className={cn(
                                              'px-3 py-1 rounded-full border text-[10px] uppercase tracking-wider font-bold',
                                              access.status === 'connected'
                                                ? 'bg-green-500/10 text-green-300 border-green-500/20'
                                                : access.status === 'attention'
                                                  ? 'bg-amber-500/10 text-amber-300 border-amber-500/20'
                                                  : 'bg-white/10 text-white/60 border-white/10',
                                            )}
                                          >
                                            {getIntegrationStatusLabel(access.status)}
                                          </span>
                                        </div>
                                      ))
                                    )}
                                  </div>
                                </CollapsibleSection>
                              </div>

                              <CollapsibleSection
                                title="Tareas del equipo"
                                description="Próximos movimientos internos para esta cuenta."
                                icon={<FileText className="w-5 h-5" />}
                                summary={`${clientOverview.setup.team_tasks_open}/${clientOverview.setup.team_tasks_total}`}
                                storageKey={`client-${client.id}-team-tasks-panel`}
                                defaultOpen={false}
                                bodyClassName="space-y-4"
                              >
                                {clientOverview.team_tasks.length === 0 ? (
                                  <div className="glass-input text-sm text-white/40">
                                    Aún no hay tareas vinculadas a esta cuenta.
                                  </div>
                                ) : (
                                  <div className="space-y-3">
                                    {clientOverview.team_tasks.map((task) => (
                                      <div
                                        key={task.id}
                                        className="rounded-xl border border-white/10 bg-white/5 px-4 py-3 flex flex-wrap items-center justify-between gap-3"
                                      >
                                        <div className="space-y-1">
                                          <p className="font-bold">{task.title}</p>
                                          <p className="text-xs text-white/40">
                                            {task.project_name} · vence{' '}
                                            {new Date(task.due_date).toLocaleDateString('es-ES')}
                                          </p>
                                          <p className="text-[11px] text-white/30">
                                            Responsable:{' '}
                                            {task.assigned_name || 'Sin asignar'}
                                          </p>
                                        </div>
                                        <div className="flex flex-wrap gap-2 justify-end">
                                          <span
                                            className={cn(
                                              'px-3 py-1 rounded-full border text-[10px] uppercase tracking-wider font-bold',
                                              getTaskPriorityClasses(task.priority),
                                            )}
                                          >
                                            Prioridad {getTaskPriorityLabel(task.priority)}
                                          </span>
                                          <span className="px-3 py-1 rounded-full border border-white/10 bg-white/5 text-[10px] uppercase tracking-wider text-white/65 font-bold">
                                            {getTaskStatusLabel(task.status)}
                                          </span>
                                        </div>
                                      </div>
                                    ))}
                                  </div>
                                )}
                              </CollapsibleSection>
                            </>
                          ) : (
                            <div className="glass-panel p-4 text-sm text-white/40">
                              Cargando resumen operativo y comercial del cliente...
                            </div>
                          )}

                          <CollapsibleSection
                            title="Onboarding del cliente"
                            description="Controla el avance del portal cliente y del trabajo operativo de la agencia sin forzar pasos fuera de orden."
                            icon={<CheckCircle2 className="w-5 h-5" />}
                            summary={
                              onboarding
                                ? `${onboarding.progress}% · ${onboarding.completed_steps}/${onboarding.total_steps}`
                                : 'Pendiente'
                            }
                            storageKey={`client-${client.id}-onboarding-panel`}
                            defaultOpen={!onboarding}
                            bodyClassName="space-y-5"
                          >
                            <div className="flex flex-wrap items-center justify-between gap-3">
                              <div className="space-y-1">
                                <p className="font-bold">
                                  {onboarding
                                    ? `${onboarding.completed_steps}/${onboarding.total_steps} pasos completados`
                                    : 'Todavía no iniciado'}
                                </p>
                                <p className="text-xs text-white/40">
                                  {onboarding
                                    ? `Progreso actual: ${onboarding.progress}%`
                                    : 'Lanza un onboarding operativo para este cliente.'}
                                </p>
                              </div>

                              {onboarding ? (
                                <span
                                  className={cn(
                                    'px-3 py-1 rounded-full text-[10px] font-bold uppercase tracking-wider border',
                                    getOnboardingStatusClasses(onboarding.status),
                                  )}
                                >
                                  {getOnboardingStatusLabel(onboarding.status)}
                                </span>
                              ) : (
                                <button
                                  type="button"
                                  disabled={startingOnboardingClientId === client.id}
                                  onClick={() => void handleStartOnboarding(client)}
                                  className="glass-button-secondary disabled:opacity-50 disabled:cursor-not-allowed"
                                >
                                  {startingOnboardingClientId === client.id
                                    ? 'Iniciando...'
                                    : 'Iniciar Onboarding'}
                                </button>
                              )}
                            </div>

                            {onboarding ? (
                              <>
                                <div className="grid grid-cols-1 lg:grid-cols-[minmax(0,0.78fr)_minmax(0,1.22fr)] gap-4">
                                  <div className="space-y-4">
                                    <CollapsibleSection
                                      title="Planificación y estado"
                                      description="Kickoff, fecha objetivo y control global del onboarding."
                                      summary={`${onboarding.progress}%`}
                                      storageKey={`client-${client.id}-onboarding-planning-panel`}
                                      defaultOpen={false}
                                      bodyClassName="space-y-4"
                                    >
                                      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                        <div>
                                          <label className="block text-[10px] text-white/30 uppercase font-bold tracking-wider mb-2">
                                            Kickoff
                                          </label>
                                          <input
                                            type="date"
                                            value={onboarding.kickoff_date || ''}
                                            onChange={(event) =>
                                              void handleUpdateOnboarding(
                                                onboarding.id,
                                                { kickoff_date: event.target.value },
                                                'Fecha de kickoff actualizada.',
                                              )
                                            }
                                            className="w-full glass-input"
                                          />
                                        </div>

                                        <div>
                                          <label className="block text-[10px] text-white/30 uppercase font-bold tracking-wider mb-2">
                                            Fecha objetivo
                                          </label>
                                          <input
                                            type="date"
                                            value={onboarding.target_launch_date || ''}
                                            onChange={(event) =>
                                              void handleUpdateOnboarding(
                                                onboarding.id,
                                                { target_launch_date: event.target.value },
                                                'Fecha objetivo actualizada.',
                                              )
                                            }
                                            className="w-full glass-input"
                                          />
                                        </div>
                                      </div>

                                      <div className="rounded-2xl border border-white/10 bg-white/5 p-4 space-y-4">
                                        <div className="space-y-2">
                                          <p className="text-[10px] text-white/30 uppercase font-bold tracking-wider">
                                            Estado global
                                          </p>
                                          <div className="flex flex-wrap gap-2">
                                            {(
                                              [
                                                'pending',
                                                'in_progress',
                                                'blocked',
                                                'completed',
                                              ] as ClientOnboarding['status'][]
                                            ).map((status) => (
                                              <button
                                                key={status}
                                                type="button"
                                                disabled={updatingOnboardingId === onboarding.id}
                                                onClick={() =>
                                                  void handleUpdateOnboarding(
                                                    onboarding.id,
                                                    { status },
                                                    `Onboarding marcado como ${getOnboardingStatusLabel(status).toLowerCase()}.`,
                                                  )
                                                }
                                                className={cn(
                                                  'px-3 py-1.5 rounded-lg text-xs font-bold uppercase tracking-wider transition-all border',
                                                  onboarding.status === status
                                                    ? getOnboardingStatusClasses(status)
                                                    : 'bg-white/5 text-white/60 border-white/10 hover:bg-white/10',
                                                )}
                                              >
                                                {getOnboardingStatusLabel(status)}
                                              </button>
                                            ))}
                                          </div>
                                        </div>

                                        <div className="space-y-3">
                                          <div className="h-2 rounded-full overflow-hidden bg-white/5">
                                            <div
                                              className="h-full rounded-full bg-gradient-to-r from-brand-blue via-brand-cyan to-emerald-400 transition-all"
                                              style={{ width: `${onboarding.progress}%` }}
                                            />
                                          </div>
                                          <div className="text-xs text-white/35 flex flex-wrap gap-4">
                                            <span>
                                              Proyecto vinculado:{' '}
                                              {onboarding.project_name || 'Sin proyecto'}
                                            </span>
                                            <span>
                                              Tareas generadas:{' '}
                                              {onboarding.steps.filter((step) => step.task_id).length}
                                            </span>
                                            <span>
                                              Estado global{' '}
                                              {getOnboardingStatusLabel(onboarding.status).toLowerCase()}
                                            </span>
                                          </div>
                                        </div>
                                      </div>
                                    </CollapsibleSection>

                                    <CollapsibleSection
                                      title="Documentación compartida"
                                      description="Briefings, accesos y material enviado por el cliente."
                                      summary={`${clientOverview.documents.total} archivos`}
                                      storageKey={`client-${client.id}-onboarding-documents-panel`}
                                      defaultOpen={false}
                                      bodyClassName="space-y-4"
                                    >
                                      {!clientOverview ? (
                                        <div className="glass-input text-sm text-white/40">
                                          Cargando documentación del onboarding...
                                        </div>
                                      ) : clientOverview.documents.recent.length === 0 ? (
                                        <div className="glass-input text-sm text-white/40">
                                          Todavía no hay documentación subida por este cliente.
                                        </div>
                                      ) : (
                                        <div className="space-y-3">
                                          {clientOverview.documents.recent.map((document) => (
                                            <div
                                              key={document.id}
                                              className="rounded-xl border border-white/10 bg-black/20 px-4 py-3 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between"
                                            >
                                              <div className="min-w-0">
                                                <p className="font-semibold">{document.title}</p>
                                                <p className="text-xs text-white/45 mt-1">
                                                  {document.step_title || 'Documento general'} ·{' '}
                                                  {formatFileSize(document.file_size)}
                                                </p>
                                                <p className="text-[11px] text-white/30 mt-1">
                                                  {document.uploaded_by_name || 'Cliente'} ·{' '}
                                                  {new Date(document.created_at).toLocaleDateString('es-ES')}
                                                </p>
                                              </div>

                                              <button
                                                type="button"
                                                onClick={() =>
                                                  void handleDownloadOnboardingDocument(document.id)
                                                }
                                                disabled={downloadingDocumentId === document.id}
                                                className="glass-button-secondary w-full justify-center sm:w-auto"
                                              >
                                                <Download className="w-4 h-4" />
                                                {downloadingDocumentId === document.id
                                                  ? 'Preparando...'
                                                  : 'Descargar'}
                                              </button>
                                            </div>
                                          ))}
                                        </div>
                                      )}
                                    </CollapsibleSection>
                                  </div>

                                  <div className="space-y-3 min-w-0">
                                    <CollapsibleSection
                                      title="Pasos del onboarding"
                                      description="Secuencia de trabajo cliente-agencia paso a paso."
                                      summary={`${onboarding.completed_steps}/${onboarding.total_steps}`}
                                      storageKey={`client-${client.id}-onboarding-steps-panel`}
                                      defaultOpen={false}
                                      bodyClassName="space-y-3"
                                    >
                                      {onboarding.steps.map((step, stepIndex) => {
                                        const lockReason = getClientOnboardingStepLockReason(
                                          onboarding,
                                          step,
                                        );
                                        const ownerLabel = getClientOnboardingStepOwnerLabel(step);

                                        return (
                                          <div
                                            key={step.id}
                                            className="rounded-2xl border border-white/10 bg-white/5 p-4 min-w-0"
                                          >
                                            <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
                                              <div className="flex min-w-0 items-start gap-3">
                                                <div className="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-2xl border border-white/10 bg-black/20 text-xs font-bold text-white/65">
                                                  {stepIndex + 1}
                                                </div>
                                                <div className="min-w-0 space-y-2">
                                                  <div className="flex flex-wrap items-center gap-2">
                                                    <div className="pt-0.5">
                                                      {getOnboardingStepStatusIcon(step.status)}
                                                    </div>
                                                    <p className="text-sm font-bold">{step.title}</p>
                                                    <span className="px-2 py-1 rounded-full border border-white/10 bg-black/20 text-[10px] uppercase tracking-wider text-white/55 font-bold">
                                                      {ownerLabel}
                                                    </span>
                                                  </div>
                                                  <p className="text-xs text-white/40">
                                                    {step.description || 'Sin descripción'}
                                                  </p>
                                                  <p className="text-[11px] text-white/30">
                                                    Entrega objetivo{' '}
                                                    {new Date(step.due_date).toLocaleDateString('es-ES')}
                                                  </p>
                                                  <p className="text-[11px] text-white/35">
                                                    {lockReason ||
                                                      `Paso gestionado por ${ownerLabel.toLowerCase()} y habilitado para avanzar.`}
                                                  </p>
                                                </div>
                                              </div>

                                              <button
                                                type="button"
                                                disabled={
                                                  Boolean(lockReason) ||
                                                  updatingOnboardingStepId === step.id
                                                }
                                                onClick={() =>
                                                  void handleCycleOnboardingStep(onboarding, step)
                                                }
                                                className="glass-button-secondary w-full justify-center disabled:opacity-50 disabled:cursor-not-allowed lg:w-auto"
                                              >
                                                {updatingOnboardingStepId === step.id
                                                  ? 'Actualizando...'
                                                  : getOnboardingStepStatusLabel(step.status)}
                                              </button>
                                            </div>
                                          </div>
                                        );
                                      })}
                                    </CollapsibleSection>
                                  </div>
                                </div>
                              </>
                            ) : null}
                          </CollapsibleSection>

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
      </CollapsibleSection>
    </div>
  );
};
