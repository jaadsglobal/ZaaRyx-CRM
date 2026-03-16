import React, { useEffect, useState } from 'react';
import {
  Activity,
  Building2,
  Copy,
  Link2,
  RefreshCw,
  Save,
  Search,
  Shield,
  Workflow,
} from 'lucide-react';
import {
  ClientIntegration,
  Integration,
  IntegrationClientOption,
  IntegrationEvent,
  cn,
} from '../types';
import { CollapsibleSection } from './CollapsibleSection';

interface IntegrationDraft {
  account_label: string;
  endpoint_url: string;
  api_key: string;
  access_token: string;
  email: string;
  account_id: string;
  notes: string;
  sync_enabled: boolean;
  auto_capture_leads: boolean;
  scopes_text: string;
}

interface ClientConnectionDraft {
  client_id: string;
  integration_key: Integration['key'] | '';
  account_label: string;
  endpoint_url: string;
  api_key: string;
  access_token: string;
  email: string;
  account_id: string;
  notes: string;
  sync_enabled: boolean;
}

const getResponseJson = async <T,>(response: Response): Promise<T> => {
  if (!response.ok) {
    const errorData = (await response.json().catch(() => null)) as { error?: string } | null;
    throw new Error(errorData?.error || `Request failed with status ${response.status}`);
  }

  return response.json() as Promise<T>;
};

const formatDate = (value?: string | null) => {
  if (!value) {
    return 'Sin registro';
  }

  const parsedDate = new Date(value);

  if (Number.isNaN(parsedDate.getTime())) {
    return value;
  }

  return parsedDate.toLocaleString('es-ES', {
    day: '2-digit',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
  });
};

const getStatusLabel = (status: Integration['status']) => {
  switch (status) {
    case 'connected':
      return 'Conectada';
    case 'attention':
      return 'Revisión';
    case 'disconnected':
    default:
      return 'Desconectada';
  }
};

const getStatusClass = (status: Integration['status']) => {
  switch (status) {
    case 'connected':
      return 'bg-emerald-500/10 text-emerald-300 border-emerald-500/20';
    case 'attention':
      return 'bg-amber-500/10 text-amber-300 border-amber-500/20';
    case 'disconnected':
    default:
      return 'bg-white/10 text-white/55 border-white/10';
  }
};

const getCategoryLabel = (category: Integration['category']) => {
  switch (category) {
    case 'automation':
      return 'Automatización';
    case 'communication':
      return 'Comunicación';
    case 'ads':
      return 'Ads';
    case 'social':
      return 'Social';
    case 'landing':
      return 'Landing';
    case 'crm':
      return 'CRM';
    case 'ops':
      return 'Operaciones';
    case 'payments':
      return 'Pagos';
    case 'documents':
      return 'Documentos';
    default:
      return 'Operaciones';
  }
};

const getDirectionLabel = (direction: Integration['direction']) => {
  switch (direction) {
    case 'inbound':
      return 'Entrada';
    case 'outbound':
      return 'Salida';
    case 'bidirectional':
    default:
      return 'Bidireccional';
  }
};

const getModeLabel = (mode: Integration['connection_mode']) => {
  switch (mode) {
    case 'api_key':
      return 'API Key';
    case 'oauth':
      return 'OAuth';
    case 'webhook':
      return 'Webhook';
    case 'manual':
    default:
      return 'Manual';
  }
};

const getEventStatusClass = (status: IntegrationEvent['status']) => {
  switch (status) {
    case 'success':
      return 'bg-emerald-500/10 text-emerald-300 border-emerald-500/20';
    case 'error':
      return 'bg-red-500/10 text-red-300 border-red-500/20';
    case 'ignored':
    default:
      return 'bg-white/10 text-white/55 border-white/10';
  }
};

const buildDraftFromIntegration = (integration: Integration): IntegrationDraft => ({
  account_label: integration.account_label || '',
  endpoint_url: integration.endpoint_url || '',
  api_key: integration.api_key || '',
  access_token: integration.access_token || '',
  email: integration.email || '',
  account_id: integration.account_id || '',
  notes: integration.notes || '',
  sync_enabled: integration.sync_enabled,
  auto_capture_leads: integration.auto_capture_leads,
  scopes_text: integration.scopes.join(', '),
});

const buildWebhookUrl = (pathValue?: string | null) => {
  if (!pathValue || typeof window === 'undefined') {
    return '';
  }

  return `${window.location.origin}${pathValue}`;
};

const createEmptyClientConnectionDraft = (): ClientConnectionDraft => ({
  client_id: '',
  integration_key: '',
  account_label: '',
  endpoint_url: '',
  api_key: '',
  access_token: '',
  email: '',
  account_id: '',
  notes: '',
  sync_enabled: true,
});

const buildDraftFromClientConnection = (connection: ClientIntegration): ClientConnectionDraft => ({
  client_id: String(connection.client_id),
  integration_key: connection.integration_key,
  account_label: connection.account_label || '',
  endpoint_url: connection.endpoint_url || '',
  api_key: connection.api_key || '',
  access_token: connection.access_token || '',
  email: connection.email || '',
  account_id: connection.account_id || '',
  notes: connection.notes || '',
  sync_enabled: connection.sync_enabled,
});

export const IntegrationsManager: React.FC = () => {
  const [integrations, setIntegrations] = useState<Integration[]>([]);
  const [events, setEvents] = useState<IntegrationEvent[]>([]);
  const [clientOptions, setClientOptions] = useState<IntegrationClientOption[]>([]);
  const [clientConnections, setClientConnections] = useState<ClientIntegration[]>([]);
  const [drafts, setDrafts] = useState<Record<number, IntegrationDraft>>({});
  const [selectedIntegrationId, setSelectedIntegrationId] = useState<number | null>(null);
  const [selectedClientConnectionId, setSelectedClientConnectionId] = useState<number | null>(null);
  const [clientConnectionDraft, setClientConnectionDraft] = useState<ClientConnectionDraft>(
    createEmptyClientConnectionDraft(),
  );
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [savingId, setSavingId] = useState<number | null>(null);
  const [actingId, setActingId] = useState<number | null>(null);
  const [clientSaving, setClientSaving] = useState(false);
  const [clientActingId, setClientActingId] = useState<number | null>(null);
  const [query, setQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState<'all' | Integration['status']>('all');
  const [categoryFilter, setCategoryFilter] = useState<'all' | Integration['category']>('all');
  const [message, setMessage] = useState<string | null>(null);
  const [messageTone, setMessageTone] = useState<'success' | 'error'>('success');

  const setFeedback = (nextMessage: string, tone: 'success' | 'error' = 'success') => {
    setMessage(nextMessage);
    setMessageTone(tone);
  };

  const loadData = async ({
    background = false,
    silent = false,
  }: {
    background?: boolean;
    silent?: boolean;
  } = {}) => {
    if (background) {
      setRefreshing(true);
    } else {
      setLoading(true);
    }

    try {
      const results = await Promise.allSettled([
        fetch('/api/integrations'),
        fetch('/api/integration-events?limit=80'),
        fetch('/api/integration-clients'),
        fetch('/api/client-integrations'),
      ]);
      const [
        integrationsResult,
        eventsResult,
        clientOptionsResult,
        clientConnectionsResult,
      ] = results;

      if (integrationsResult.status !== 'fulfilled') {
        throw integrationsResult.reason;
      }

      const integrationsData = await getResponseJson<Integration[]>(integrationsResult.value);
      const eventsData =
        eventsResult.status === 'fulfilled'
          ? await getResponseJson<IntegrationEvent[]>(eventsResult.value).catch(() => [])
          : [];
      const clientOptionsData =
        clientOptionsResult.status === 'fulfilled'
          ? await getResponseJson<IntegrationClientOption[]>(clientOptionsResult.value).catch(
              () => [],
            )
          : [];
      const clientConnectionsData =
        clientConnectionsResult.status === 'fulfilled'
          ? await getResponseJson<ClientIntegration[]>(clientConnectionsResult.value).catch(
              () => [],
            )
          : [];
      const partialFailures = [
        eventsResult.status === 'fulfilled' ? !eventsResult.value.ok : true,
        clientOptionsResult.status === 'fulfilled' ? !clientOptionsResult.value.ok : true,
        clientConnectionsResult.status === 'fulfilled' ? !clientConnectionsResult.value.ok : true,
      ].some(Boolean);

      setIntegrations(integrationsData);
      setEvents(eventsData);
      setClientOptions(clientOptionsData);
      setClientConnections(clientConnectionsData);
      setDrafts((currentDrafts) => {
        const nextDrafts: Record<number, IntegrationDraft> = {};

        integrationsData.forEach((integration) => {
          nextDrafts[integration.id] =
            currentDrafts[integration.id] || buildDraftFromIntegration(integration);
        });

        return nextDrafts;
      });

      setSelectedIntegrationId((currentId) => {
        if (currentId && integrationsData.some((integration) => integration.id === currentId)) {
          return currentId;
        }

        return integrationsData[0]?.id || null;
      });

      setSelectedClientConnectionId((currentId) => {
        if (
          currentId &&
          clientConnectionsData.some((connection) => connection.id === currentId)
        ) {
          return currentId;
        }

        return clientConnectionsData[0]?.id || null;
      });

      if (background && !silent) {
        setFeedback(
          partialFailures
            ? 'Integraciones actualizadas con incidencias parciales en eventos o conexiones de cliente.'
            : 'Integraciones actualizadas.',
        );
      } else if (partialFailures && !silent) {
        setFeedback(
          'Se cargó el catálogo de integraciones, pero falló parte de eventos o conexiones de cliente.',
          'error',
        );
      }
    } catch (error) {
      console.error('Error loading integrations:', error);

      if (!silent) {
        setFeedback('No se pudieron cargar las integraciones.', 'error');
      }
    } finally {
      if (background) {
        setRefreshing(false);
      } else {
        setLoading(false);
      }
    }
  };

  useEffect(() => {
    void loadData({ silent: true });
  }, []);

  const filteredIntegrations = integrations.filter((integration) => {
    const matchesQuery =
      query.trim().length === 0 ||
      integration.name.toLowerCase().includes(query.trim().toLowerCase()) ||
      integration.description.toLowerCase().includes(query.trim().toLowerCase()) ||
      integration.key.toLowerCase().includes(query.trim().toLowerCase());
    const matchesStatus = statusFilter === 'all' || integration.status === statusFilter;
    const matchesCategory = categoryFilter === 'all' || integration.category === categoryFilter;

    return matchesQuery && matchesStatus && matchesCategory;
  });

  const selectedIntegration =
    integrations.find((integration) => integration.id === selectedIntegrationId) ||
    filteredIntegrations[0] ||
    null;
  const selectedClientConnection =
    clientConnections.find((connection) => connection.id === selectedClientConnectionId) || null;
  const selectedDraft = selectedIntegration ? drafts[selectedIntegration.id] : null;
  const selectedWebhookUrl = selectedIntegration
    ? buildWebhookUrl(selectedIntegration.webhook_path)
    : '';
  const selectedEvents = selectedIntegration
    ? events.filter((event) => event.integration_id === selectedIntegration.id)
    : events;

  useEffect(() => {
    if (selectedClientConnection) {
      setClientConnectionDraft(buildDraftFromClientConnection(selectedClientConnection));
      return;
    }

    setClientConnectionDraft((currentDraft) => {
      if (
        currentDraft.client_id ||
        currentDraft.integration_key ||
        currentDraft.account_label ||
        currentDraft.endpoint_url ||
        currentDraft.api_key ||
        currentDraft.access_token ||
        currentDraft.email ||
        currentDraft.account_id ||
        currentDraft.notes
      ) {
        return currentDraft;
      }

      return {
        ...createEmptyClientConnectionDraft(),
        client_id: clientOptions[0] ? String(clientOptions[0].id) : '',
        integration_key:
          (integrations.find((integration) => integration.category !== 'landing')?.key as
            | Integration['key']
            | undefined) || '',
      };
    });
  }, [clientOptions, integrations, selectedClientConnection]);

  const stats = [
    {
      label: 'Conectadas',
      value: integrations.filter((integration) => integration.status === 'connected').length,
      description: 'integraciones activas',
    },
    {
      label: 'En revisión',
      value: integrations.filter((integration) => integration.status === 'attention').length,
      description: 'requieren ajuste',
    },
    {
      label: 'Con webhook',
      value: integrations.filter((integration) => integration.supports_webhook).length,
      description: 'puertas de entrada',
    },
    {
      label: 'Clientes conectados',
      value: clientConnections.filter((connection) => connection.status === 'connected').length,
      description: 'cuentas manuales por cliente',
    },
  ];
  const clientConnectionIntegrations = integrations.filter(
    (integration) => integration.key !== 'landing_pages',
  );

  const updateDraft = (
    integrationId: number,
    field: keyof IntegrationDraft,
    value: string | boolean,
  ) => {
    setDrafts((currentDrafts) => ({
      ...currentDrafts,
      [integrationId]: {
        ...currentDrafts[integrationId],
        [field]: value,
      },
    }));
  };

  const updateClientConnectionDraft = (
    field: keyof ClientConnectionDraft,
    value: string | boolean,
  ) => {
    setSelectedClientConnectionId(null);
    setClientConnectionDraft((currentDraft) => ({
      ...currentDraft,
      [field]: value,
    }));
  };

  const handleSave = async () => {
    if (!selectedIntegration || !selectedDraft) {
      return;
    }

    setSavingId(selectedIntegration.id);

    try {
      const response = await fetch(`/api/integrations/${selectedIntegration.id}`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          account_label: selectedDraft.account_label,
          endpoint_url: selectedDraft.endpoint_url,
          api_key: selectedDraft.api_key,
          access_token: selectedDraft.access_token,
          email: selectedDraft.email,
          account_id: selectedDraft.account_id,
          notes: selectedDraft.notes,
          sync_enabled: selectedDraft.sync_enabled,
          auto_capture_leads: selectedDraft.auto_capture_leads,
          scopes: selectedDraft.scopes_text
            .split(',')
            .map((value) => value.trim())
            .filter(Boolean),
        }),
      });

      const updatedIntegration = await getResponseJson<Integration>(response);

      setIntegrations((currentIntegrations) =>
        currentIntegrations.map((integration) =>
          integration.id === updatedIntegration.id ? updatedIntegration : integration,
        ),
      );
      setDrafts((currentDrafts) => ({
        ...currentDrafts,
        [updatedIntegration.id]: buildDraftFromIntegration(updatedIntegration),
      }));
      setFeedback(`Configuración guardada para ${updatedIntegration.name}.`);
      void loadData({ background: true, silent: true });
    } catch (error) {
      console.error('Error saving integration:', error);
      setFeedback(
        error instanceof Error ? error.message : 'No se pudo guardar la integración.',
        'error',
      );
    } finally {
      setSavingId(null);
    }
  };

  const handleSaveClientConnection = async () => {
    if (!clientConnectionDraft.client_id || !clientConnectionDraft.integration_key) {
      setFeedback('Selecciona cliente e integración antes de guardar.', 'error');
      return;
    }

    setClientSaving(true);

    try {
      const response = await fetch('/api/client-integrations', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          client_id: Number(clientConnectionDraft.client_id),
          integration_key: clientConnectionDraft.integration_key,
          account_label: clientConnectionDraft.account_label,
          endpoint_url: clientConnectionDraft.endpoint_url,
          api_key: clientConnectionDraft.api_key,
          access_token: clientConnectionDraft.access_token,
          email: clientConnectionDraft.email,
          account_id: clientConnectionDraft.account_id,
          notes: clientConnectionDraft.notes,
          sync_enabled: clientConnectionDraft.sync_enabled,
        }),
      });

      const savedConnection = await getResponseJson<ClientIntegration>(response);

      setClientConnections((currentConnections) => {
        const exists = currentConnections.some((connection) => connection.id === savedConnection.id);

        if (exists) {
          return currentConnections.map((connection) =>
            connection.id === savedConnection.id ? savedConnection : connection,
          );
        }

        return [savedConnection, ...currentConnections];
      });
      setSelectedClientConnectionId(savedConnection.id);
      setClientConnectionDraft(buildDraftFromClientConnection(savedConnection));
      setFeedback(`Conexión manual guardada para ${savedConnection.client_name}.`);
    } catch (error) {
      console.error('Error saving client connection:', error);
      setFeedback(
        error instanceof Error ? error.message : 'No se pudo guardar la conexión del cliente.',
        'error',
      );
    } finally {
      setClientSaving(false);
    }
  };

  const handleClientConnectionAction = async (
    connection: ClientIntegration,
    action: 'connect' | 'disconnect' | 'test',
  ) => {
    setClientActingId(connection.id);

    try {
      const response = await fetch(`/api/client-integrations/${connection.id}/${action}`, {
        method: 'POST',
      });

      if (!response.ok) {
        const errorData = (await response.json().catch(() => null)) as { error?: string } | null;
        throw new Error(errorData?.error || `Request failed with status ${response.status}`);
      }

      const data = (await response.json()) as
        | ClientIntegration
        | {
            connection: ClientIntegration;
            result?: {
              summary?: string;
            };
          };
      const updatedConnection = 'connection' in data ? data.connection : data;

      setClientConnections((currentConnections) =>
        currentConnections.map((item) =>
          item.id === updatedConnection.id ? updatedConnection : item,
        ),
      );
      setSelectedClientConnectionId(updatedConnection.id);
      setClientConnectionDraft(buildDraftFromClientConnection(updatedConnection));
      setFeedback(
        'result' in data
          ? data.result?.summary || `Conexión probada para ${updatedConnection.client_name}.`
          : action === 'connect'
            ? `Conexión activada para ${updatedConnection.client_name}.`
            : `Conexión desactivada para ${updatedConnection.client_name}.`,
      );
    } catch (error) {
      console.error(`Error running client connection ${action}:`, error);
      setFeedback(
        error instanceof Error
          ? error.message
          : 'No se pudo ejecutar la acción de conexión del cliente.',
        'error',
      );
    } finally {
      setClientActingId(null);
    }
  };

  const handleAction = async (
    integration: Integration,
    action: 'connect' | 'disconnect' | 'test' | 'simulate' | 'regenerate-webhook',
  ) => {
    setActingId(integration.id);

    try {
      const endpoint =
        action === 'connect'
          ? `/api/integrations/${integration.id}/connect`
          : action === 'disconnect'
            ? `/api/integrations/${integration.id}/disconnect`
            : action === 'test'
              ? `/api/integrations/${integration.id}/test`
              : action === 'simulate'
                ? `/api/integrations/${integration.id}/simulate`
                : `/api/integrations/${integration.id}/webhook/regenerate`;
      const response = await fetch(endpoint, {
        method: 'POST',
      });
      const data = await getResponseJson<
        | Integration
        | {
            integration?: Integration;
            result?: {
              status: 'success' | 'error' | 'ignored';
              summary: string;
            };
          }
      >(response);

      const maybeIntegration =
        'integration' in data && data.integration ? data.integration : ('id' in data ? data : null);

      if (maybeIntegration) {
        setIntegrations((currentIntegrations) =>
          currentIntegrations.map((item) => (item.id === maybeIntegration.id ? maybeIntegration : item)),
        );
        setDrafts((currentDrafts) => ({
          ...currentDrafts,
          [maybeIntegration.id]: buildDraftFromIntegration(maybeIntegration),
        }));
      }

      const actionMessage =
        'result' in data && data.result?.summary
          ? data.result.summary
          : action === 'connect'
            ? `${integration.name} conectada.`
            : action === 'disconnect'
              ? `${integration.name} desconectada.`
              : action === 'regenerate-webhook'
                ? `Webhook regenerado para ${integration.name}.`
                : `${integration.name} actualizada.`;

      setFeedback(actionMessage);
      void loadData({ background: true, silent: true });
    } catch (error) {
      console.error(`Error running ${action}:`, error);
      setFeedback(
        error instanceof Error ? error.message : 'No se pudo ejecutar la acción de integración.',
        'error',
      );
    } finally {
      setActingId(null);
    }
  };

  const handleCopyWebhook = async () => {
    if (!selectedWebhookUrl) {
      return;
    }

    try {
      await navigator.clipboard.writeText(selectedWebhookUrl);
      setFeedback('URL webhook copiada.');
    } catch (error) {
      console.error('Error copying webhook URL:', error);
      setFeedback('No se pudo copiar la URL webhook.', 'error');
    }
  };

  const focusPanelOnMobile = (panelId: string) => {
    if (typeof window === 'undefined' || window.innerWidth >= 1280) {
      return;
    }

    window.requestAnimationFrame(() => {
      document.getElementById(panelId)?.scrollIntoView({
        behavior: 'smooth',
        block: 'start',
      });
    });
  };

  if (loading) {
    return <div className="glass-panel p-8 text-center text-white/40">Cargando integraciones...</div>;
  }

  return (
    <div className="space-y-6">
      <CollapsibleSection
        title="Estado del hub"
        description="Resumen de conectores, estado de salud y accesos activos."
        icon={<Activity className="w-5 h-5" />}
        storageKey="integrations-overview"
      >
        <div className="space-y-5">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
          <div className="space-y-2">
            <p className="text-xs uppercase tracking-[0.2em] text-white/30 font-bold">
              Hub de Integraciones
            </p>
            <h2 className="text-3xl font-bold">Automatizaciones, canales y fuentes externas</h2>
            <p className="text-white/50 max-w-3xl">
              Gestiona conectores para Google Calendar, Calendly, n8n, Zapier, Make, Gmail,
              Slack, Ads, redes sociales, landings y CRMs externos desde una sola sesión.
            </p>
          </div>

          <div className="flex flex-wrap gap-3">
            <button
              type="button"
              onClick={() => void loadData({ background: true })}
              disabled={refreshing}
              className="glass-button-secondary disabled:opacity-50"
            >
              <RefreshCw className={cn('w-4 h-4', refreshing && 'animate-spin')} />
              {refreshing ? 'Actualizando...' : 'Actualizar'}
            </button>
          </div>
        </div>

        {message ? (
          <div
            className={cn(
              'glass-panel p-3 text-sm',
              messageTone === 'success'
                ? 'border-emerald-500/20 text-emerald-300 bg-emerald-500/10'
                : 'border-red-500/20 text-red-300 bg-red-500/10',
            )}
          >
            {message}
          </div>
        ) : null}

        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-4">
          {stats.map((stat) => (
            <div key={stat.label} className="glass-card p-5 space-y-2">
              <p className="text-xs uppercase tracking-[0.2em] text-white/30 font-bold">
                {stat.label}
              </p>
              <p className="text-3xl font-bold">{stat.value}</p>
              <p className="text-sm text-white/45">{stat.description}</p>
            </div>
          ))}
        </div>
        </div>
      </CollapsibleSection>

      <CollapsibleSection
        title="Catálogo y configuración"
        description="Filtro de conectores y editor operativo de la integración seleccionada."
        icon={<Workflow className="w-5 h-5" />}
        summary={`${filteredIntegrations.length} integraciones`}
        storageKey="integrations-catalog"
      >
        <div className="space-y-6">
          <section className="glass-panel p-6 space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <label className="space-y-2">
                <span className="text-xs uppercase tracking-[0.2em] text-white/30 font-bold">
                  Buscar
                </span>
                <div className="relative">
                  <Search className="w-4 h-4 text-white/30 absolute left-4 top-1/2 -translate-y-1/2" />
                  <input
                    value={query}
                    onChange={(event) => setQuery(event.target.value)}
                    placeholder="Google Calendar, Calendly, n8n..."
                    className="w-full bg-white/5 border border-white/10 rounded-xl pl-11 pr-4 py-3 text-white placeholder:text-white/25 focus:outline-none focus:border-brand-blue/40"
                  />
                </div>
              </label>

              <label className="space-y-2">
                <span className="text-xs uppercase tracking-[0.2em] text-white/30 font-bold">
                  Estado
                </span>
                <select
                  value={statusFilter}
                  onChange={(event) => setStatusFilter(event.target.value as typeof statusFilter)}
                  className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-white focus:outline-none focus:border-brand-blue/40"
                >
                  <option value="all">Todos</option>
                  <option value="connected">Conectadas</option>
                  <option value="attention">En revisión</option>
                  <option value="disconnected">Desconectadas</option>
                </select>
              </label>

              <label className="space-y-2">
                <span className="text-xs uppercase tracking-[0.2em] text-white/30 font-bold">
                  Categoría
                </span>
                <select
                  value={categoryFilter}
                  onChange={(event) => setCategoryFilter(event.target.value as typeof categoryFilter)}
                  className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-white focus:outline-none focus:border-brand-blue/40"
                >
                  <option value="all">Todas</option>
                  <option value="automation">Automatización</option>
                  <option value="communication">Comunicación</option>
                  <option value="ads">Ads</option>
                  <option value="social">Social</option>
                  <option value="landing">Landing</option>
                  <option value="crm">CRM</option>
                  <option value="ops">Operaciones</option>
                  <option value="payments">Pagos</option>
                  <option value="documents">Documentos</option>
                </select>
              </label>
            </div>
          </section>

          <div className="grid grid-cols-1 xl:grid-cols-[360px_minmax(0,1fr)] gap-6 items-start">
        <aside className="space-y-4 xl:sticky xl:top-24">
          <div className="glass-panel p-4 space-y-2">
            <p className="text-xs uppercase tracking-[0.2em] text-white/30 font-bold">
              Selector lateral
            </p>
            <h3 className="text-lg font-semibold">Elige una integración</h3>
            <p className="text-sm text-white/45">
              Haz click en la herramienta y el panel de la derecha cargará su configuración.
            </p>
          </div>

          {filteredIntegrations.length === 0 ? (
            <div className="glass-panel p-8 text-center text-white/40">
              No hay integraciones que coincidan con el filtro actual.
            </div>
          ) : (
            <div className="glass-panel p-3 space-y-3 xl:max-h-[960px] xl:overflow-y-auto">
              {filteredIntegrations.map((integration) => (
                <button
                  key={integration.id}
                  type="button"
                  onClick={() => {
                    setSelectedIntegrationId(integration.id);
                    focusPanelOnMobile('integration-config-editor');
                  }}
                  className={cn(
                    'w-full text-left rounded-2xl border p-4 space-y-3 transition-all hover:border-brand-blue/30 hover:bg-white/5',
                    selectedIntegration?.id === integration.id
                      ? 'border-brand-blue/40 bg-brand-blue/10 shadow-[0_0_28px_rgba(0,102,255,0.08)]'
                      : 'border-white/10 bg-white/5',
                  )}
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-2">
                        <h3 className="text-lg font-semibold">{integration.name}</h3>
                        <span
                          className={cn(
                            'text-[10px] px-2 py-1 rounded-full border uppercase tracking-[0.2em] font-bold',
                            getStatusClass(integration.status),
                          )}
                        >
                          {getStatusLabel(integration.status)}
                        </span>
                      </div>
                      <p className="text-xs text-white/40 mt-2">
                        {getCategoryLabel(integration.category)} · {getModeLabel(integration.connection_mode)} ·{' '}
                        {getDirectionLabel(integration.direction)}
                      </p>
                    </div>

                    {selectedIntegration?.id === integration.id ? (
                      <span className="text-[10px] px-2 py-1 rounded-full border border-brand-cyan/30 bg-brand-cyan/10 text-brand-cyan uppercase tracking-[0.2em] font-bold">
                        Activa
                      </span>
                    ) : null}
                  </div>

                  <p className="text-sm text-white/50 line-clamp-2">{integration.description}</p>

                  <div className="grid grid-cols-1 gap-2 text-xs text-white/40">
                    <span>Última prueba: {formatDate(integration.last_tested_at)}</span>
                    <span>Última sync: {formatDate(integration.last_synced_at)}</span>
                  </div>

                  <div className="flex flex-wrap gap-2">
                    {integration.scopes.slice(0, 3).map((scope) => (
                      <span
                        key={scope}
                        className="text-[11px] px-2 py-1 rounded-full bg-white/5 border border-white/10 text-white/45"
                      >
                        {scope}
                      </span>
                    ))}
                    {integration.scopes.length > 3 ? (
                      <span className="text-[11px] px-2 py-1 rounded-full bg-white/5 border border-white/10 text-white/35">
                        +{integration.scopes.length - 3}
                      </span>
                    ) : null}
                  </div>
                </button>
              ))}
            </div>
          )}
        </aside>

        <section id="integration-config-editor" className="glass-panel p-6 space-y-5">
          {!selectedIntegration || !selectedDraft ? (
            <div className="text-center text-white/40 py-10">
              Selecciona una integración para editar su configuración.
            </div>
          ) : (
            <>
              <div className="space-y-3">
                <div className="flex items-center gap-3">
                  <div className="w-12 h-12 rounded-2xl bg-brand-blue/15 border border-brand-blue/20 flex items-center justify-center">
                    <Workflow className="w-6 h-6 text-brand-blue" />
                  </div>
                  <div>
                    <p className="text-xs uppercase tracking-[0.2em] text-white/30 font-bold">
                      Conexión manual de agencia
                    </p>
                    <h3 className="text-2xl font-bold">{selectedIntegration.name}</h3>
                  </div>
                </div>

                <div className="flex flex-wrap gap-3 text-xs text-white/45">
                  <span>{getCategoryLabel(selectedIntegration.category)}</span>
                  <span>{getModeLabel(selectedIntegration.connection_mode)}</span>
                  <span>{getDirectionLabel(selectedIntegration.direction)}</span>
                </div>
              </div>

              <div className="grid grid-cols-1 gap-4">
                <label className="space-y-2">
                  <span className="text-xs uppercase tracking-[0.2em] text-white/30 font-bold">
                    Nombre de cuenta
                  </span>
                  <input
                    value={selectedDraft.account_label}
                    onChange={(event) =>
                      updateDraft(selectedIntegration.id, 'account_label', event.target.value)
                    }
                    className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-white placeholder:text-white/25 focus:outline-none focus:border-brand-blue/40"
                    placeholder="Ej: Agencia Principal / BM ES"
                  />
                </label>

                <label className="space-y-2">
                  <span className="text-xs uppercase tracking-[0.2em] text-white/30 font-bold">
                    Endpoint / URL base
                  </span>
                  <input
                    value={selectedDraft.endpoint_url}
                    onChange={(event) =>
                      updateDraft(selectedIntegration.id, 'endpoint_url', event.target.value)
                    }
                    className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-white placeholder:text-white/25 focus:outline-none focus:border-brand-blue/40"
                    placeholder="https://api.tu-sistema.com"
                  />
                </label>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <label className="space-y-2">
                    <span className="text-xs uppercase tracking-[0.2em] text-white/30 font-bold">
                      API Key
                    </span>
                    <input
                      value={selectedDraft.api_key}
                      onChange={(event) =>
                        updateDraft(selectedIntegration.id, 'api_key', event.target.value)
                      }
                      className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-white placeholder:text-white/25 focus:outline-none focus:border-brand-blue/40"
                      placeholder="sk_live_xxx"
                    />
                  </label>

                  <label className="space-y-2">
                    <span className="text-xs uppercase tracking-[0.2em] text-white/30 font-bold">
                      Access Token
                    </span>
                    <input
                      value={selectedDraft.access_token}
                      onChange={(event) =>
                        updateDraft(selectedIntegration.id, 'access_token', event.target.value)
                      }
                      className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-white placeholder:text-white/25 focus:outline-none focus:border-brand-blue/40"
                      placeholder="token_xxx"
                    />
                  </label>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <label className="space-y-2">
                    <span className="text-xs uppercase tracking-[0.2em] text-white/30 font-bold">
                      Email técnico
                    </span>
                    <input
                      value={selectedDraft.email}
                      onChange={(event) =>
                        updateDraft(selectedIntegration.id, 'email', event.target.value)
                      }
                      className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-white placeholder:text-white/25 focus:outline-none focus:border-brand-blue/40"
                      placeholder="ops@tuagencia.com"
                    />
                  </label>

                  <label className="space-y-2">
                    <span className="text-xs uppercase tracking-[0.2em] text-white/30 font-bold">
                      ID de cuenta
                    </span>
                    <input
                      value={selectedDraft.account_id}
                      onChange={(event) =>
                        updateDraft(selectedIntegration.id, 'account_id', event.target.value)
                      }
                      className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-white placeholder:text-white/25 focus:outline-none focus:border-brand-blue/40"
                      placeholder="act_123 / sheet_456 / bm_789"
                    />
                  </label>
                </div>

                <label className="space-y-2">
                  <span className="text-xs uppercase tracking-[0.2em] text-white/30 font-bold">
                    Scopes activos
                  </span>
                  <input
                    value={selectedDraft.scopes_text}
                    onChange={(event) =>
                      updateDraft(selectedIntegration.id, 'scopes_text', event.target.value)
                    }
                    className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-white placeholder:text-white/25 focus:outline-none focus:border-brand-blue/40"
                    placeholder="lead_capture, reporting, alerts"
                  />
                </label>

                <label className="space-y-2">
                  <span className="text-xs uppercase tracking-[0.2em] text-white/30 font-bold">
                    Notas operativas
                  </span>
                  <textarea
                    value={selectedDraft.notes}
                    onChange={(event) =>
                      updateDraft(selectedIntegration.id, 'notes', event.target.value)
                    }
                    rows={4}
                    className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-white placeholder:text-white/25 focus:outline-none focus:border-brand-blue/40 resize-none"
                    placeholder="Canal, equipo responsable, pipeline conectado, restricciones..."
                  />
                </label>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <button
                    type="button"
                    onClick={() =>
                      updateDraft(selectedIntegration.id, 'sync_enabled', !selectedDraft.sync_enabled)
                    }
                    className={cn(
                      'glass-card p-4 text-left border transition-colors',
                      selectedDraft.sync_enabled
                        ? 'border-brand-blue/30 text-white'
                        : 'border-white/10 text-white/55',
                    )}
                  >
                    <div className="flex items-center gap-3">
                      <Link2 className="w-5 h-5" />
                      <div>
                        <p className="font-medium">Sincronización activa</p>
                        <p className="text-sm text-white/45">
                          Procesa flujos de entrada y salida para esta integración.
                        </p>
                      </div>
                    </div>
                  </button>

                  <button
                    type="button"
                    onClick={() =>
                      updateDraft(
                        selectedIntegration.id,
                        'auto_capture_leads',
                        !selectedDraft.auto_capture_leads,
                      )
                    }
                    disabled={!selectedIntegration.supports_lead_capture}
                    className={cn(
                      'glass-card p-4 text-left border transition-colors disabled:opacity-50',
                      selectedDraft.auto_capture_leads
                        ? 'border-brand-cyan/30 text-white'
                        : 'border-white/10 text-white/55',
                    )}
                  >
                    <div className="flex items-center gap-3">
                      <Building2 className="w-5 h-5" />
                      <div>
                        <p className="font-medium">Captura automática</p>
                        <p className="text-sm text-white/45">
                          Crea leads o clientes desde landings y CRMs externos.
                        </p>
                      </div>
                    </div>
                  </button>
                </div>

                {selectedIntegration.supports_webhook ? (
                  <div className="glass-card p-4 space-y-4">
                    <div className="flex items-center gap-3">
                      <Shield className="w-5 h-5 text-brand-cyan" />
                      <div>
                        <p className="font-medium">URL webhook activa</p>
                        <p className="text-sm text-white/45">
                          Úsala para recibir eventos desde landings, n8n, Make o un CRM externo.
                        </p>
                      </div>
                    </div>

                    <div className="bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-sm break-all text-white/70">
                      {selectedWebhookUrl || 'No disponible'}
                    </div>

                    <div className="flex flex-wrap gap-3">
                      <button
                        type="button"
                        onClick={() => void handleCopyWebhook()}
                        disabled={!selectedWebhookUrl}
                        className="glass-button-secondary disabled:opacity-50"
                      >
                        <Copy className="w-4 h-4" />
                        Copiar URL
                      </button>
                      <button
                        type="button"
                        onClick={() => void handleAction(selectedIntegration, 'regenerate-webhook')}
                        disabled={actingId === selectedIntegration.id}
                        className="glass-button-secondary disabled:opacity-50"
                      >
                        Regenerar webhook
                      </button>
                    </div>
                  </div>
                ) : null}

                <div className="flex flex-wrap gap-3">
                  <button
                    type="button"
                    onClick={() => void handleSave()}
                    disabled={savingId === selectedIntegration.id}
                    className="glass-button-primary disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    <Save className="w-4 h-4" />
                    {savingId === selectedIntegration.id ? 'Guardando...' : 'Guardar'}
                  </button>

                  <button
                    type="button"
                    onClick={() => void handleAction(selectedIntegration, 'test')}
                    disabled={actingId === selectedIntegration.id}
                    className="glass-button-secondary disabled:opacity-50"
                  >
                    <Activity className="w-4 h-4" />
                    Probar integración
                  </button>

                  {selectedIntegration.supports_webhook ? (
                    <button
                      type="button"
                      onClick={() => void handleAction(selectedIntegration, 'simulate')}
                      disabled={actingId === selectedIntegration.id}
                      className="glass-button-secondary disabled:opacity-50"
                    >
                      Simular webhook
                    </button>
                  ) : null}
                </div>
              </div>
            </>
          )}
        </section>
          </div>
        </div>
      </CollapsibleSection>

      <CollapsibleSection
        title="Conexiones por cliente"
        description="Accesos manuales y cuentas específicas de cada cliente."
        icon={<Building2 className="w-5 h-5" />}
        summary={`${clientConnections.length} conexiones`}
        storageKey="integrations-client-connections"
        defaultOpen={false}
      >
        <section className="space-y-5">
        <div className="flex flex-col gap-2 lg:flex-row lg:items-center lg:justify-between">
          <div>
            <p className="text-xs uppercase tracking-[0.2em] text-white/30 font-bold">
              Conexiones Manuales por Cliente
            </p>
            <h3 className="text-2xl font-bold">Cuentas específicas de cada cliente</h3>
            <p className="text-white/45 text-sm mt-1 max-w-3xl">
              Guarda y gestiona aquí los accesos manuales de Google Ads, Meta Ads, TikTok,
              Instagram, HubSpot, Gmail, Slack o cualquier otra herramienta que pertenezca al
              cliente.
            </p>
          </div>

          <div className="flex flex-wrap gap-3">
            <button
              type="button"
              onClick={() => {
                setSelectedClientConnectionId(null);
                setClientConnectionDraft({
                  ...createEmptyClientConnectionDraft(),
                  client_id: clientOptions[0] ? String(clientOptions[0].id) : '',
                  integration_key: clientConnectionIntegrations[0]?.key || '',
                });
              }}
              className="glass-button-secondary"
            >
              Nueva conexión cliente
            </button>
          </div>
        </div>

        {clientOptions.length === 0 ? (
          <div className="glass-panel p-6 text-center text-white/40">
            No hay clientes disponibles todavía. Crea un cliente primero y luego podrás guardar
            sus conexiones manuales.
          </div>
        ) : (
          <div className="grid grid-cols-1 xl:grid-cols-[360px_minmax(0,1fr)] gap-6 items-start">
            <aside className="space-y-4 xl:sticky xl:top-24">
              <div className="glass-panel p-4 space-y-3">
                <div className="space-y-2">
                  <p className="text-xs uppercase tracking-[0.2em] text-white/30 font-bold">
                    Selector lateral
                  </p>
                  <h4 className="text-lg font-semibold">Conexiones guardadas</h4>
                  <p className="text-sm text-white/45">
                    Toca una conexión para cargarla en el editor y ajustar sus accesos.
                  </p>
                </div>

                <button
                  type="button"
                  onClick={() => {
                    setSelectedClientConnectionId(null);
                    setClientConnectionDraft({
                      ...createEmptyClientConnectionDraft(),
                      client_id: clientOptions[0] ? String(clientOptions[0].id) : '',
                      integration_key: clientConnectionIntegrations[0]?.key || '',
                    });
                    focusPanelOnMobile('client-connection-editor');
                  }}
                  className="glass-button-secondary w-full justify-center"
                >
                  Nueva conexión cliente
                </button>
              </div>

              {clientConnections.length === 0 ? (
                <div className="glass-panel p-6 text-center text-white/40">
                  Todavía no hay conexiones manuales guardadas para clientes.
                </div>
              ) : (
                <div className="glass-panel p-3 space-y-3 xl:max-h-[960px] xl:overflow-y-auto">
                  {clientConnections.map((connection) => (
                    <button
                      key={connection.id}
                      type="button"
                      onClick={() => {
                        setSelectedClientConnectionId(connection.id);
                        setClientConnectionDraft(buildDraftFromClientConnection(connection));
                        focusPanelOnMobile('client-connection-editor');
                      }}
                      className={cn(
                        'w-full text-left rounded-2xl border p-4 space-y-3 transition-all hover:border-brand-blue/30 hover:bg-white/5',
                        selectedClientConnection?.id === connection.id
                          ? 'border-brand-blue/40 bg-brand-blue/10 shadow-[0_0_28px_rgba(0,102,255,0.08)]'
                          : 'border-white/10 bg-white/5',
                      )}
                    >
                      <div className="flex items-start justify-between gap-3">
                        <div className="min-w-0">
                          <p className="font-semibold">{connection.client_name}</p>
                          <p className="text-sm text-white/45 mt-1">{connection.integration_name}</p>
                        </div>
                        <span
                          className={cn(
                            'text-[10px] px-2 py-1 rounded-full border uppercase tracking-[0.2em] font-bold',
                            getStatusClass(connection.status),
                          )}
                        >
                          {getStatusLabel(connection.status)}
                        </span>
                      </div>

                      <div className="grid grid-cols-1 gap-2 text-xs text-white/40">
                        <span>Cuenta: {connection.account_label || 'Sin nombre'}</span>
                        <span>ID: {connection.account_id || 'Sin id'}</span>
                        <span>Email: {connection.email || 'Sin email'}</span>
                        <span>Última prueba: {formatDate(connection.last_tested_at)}</span>
                      </div>
                    </button>
                  ))}
                </div>
              )}
            </aside>

            <div id="client-connection-editor" className="glass-card p-5 space-y-4">
              <div className="flex items-center gap-3">
                <Building2 className="w-5 h-5 text-brand-cyan" />
                <div>
                  <h4 className="font-semibold">Editor de conexión cliente</h4>
                  <p className="text-sm text-white/45">
                    Selecciona un cliente y la herramienta que quieres conectar manualmente.
                  </p>
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <label className="space-y-2">
                  <span className="text-xs uppercase tracking-[0.2em] text-white/30 font-bold">
                    Cliente
                  </span>
                  <select
                    value={clientConnectionDraft.client_id}
                    onChange={(event) =>
                      updateClientConnectionDraft('client_id', event.target.value)
                    }
                    className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-white focus:outline-none focus:border-brand-blue/40"
                  >
                    <option value="">Selecciona cliente</option>
                    {clientOptions.map((client) => (
                      <option key={client.id} value={client.id}>
                        {client.company}
                      </option>
                    ))}
                  </select>
                </label>

                <label className="space-y-2">
                  <span className="text-xs uppercase tracking-[0.2em] text-white/30 font-bold">
                    Herramienta
                  </span>
                  <select
                    value={clientConnectionDraft.integration_key}
                    onChange={(event) =>
                      updateClientConnectionDraft(
                        'integration_key',
                        event.target.value as ClientConnectionDraft['integration_key'],
                      )
                    }
                    className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-white focus:outline-none focus:border-brand-blue/40"
                  >
                    <option value="">Selecciona integración</option>
                    {clientConnectionIntegrations.map((integration) => (
                      <option key={integration.id} value={integration.key}>
                        {integration.name}
                      </option>
                    ))}
                  </select>
                </label>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <label className="space-y-2">
                  <span className="text-xs uppercase tracking-[0.2em] text-white/30 font-bold">
                    Nombre de cuenta
                  </span>
                  <input
                    value={clientConnectionDraft.account_label}
                    onChange={(event) =>
                      updateClientConnectionDraft('account_label', event.target.value)
                    }
                    className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-white placeholder:text-white/25 focus:outline-none focus:border-brand-blue/40"
                    placeholder="Ej: BM Cliente / MCC / Workspace"
                  />
                </label>

                <label className="space-y-2">
                  <span className="text-xs uppercase tracking-[0.2em] text-white/30 font-bold">
                    ID de cuenta
                  </span>
                  <input
                    value={clientConnectionDraft.account_id}
                    onChange={(event) =>
                      updateClientConnectionDraft('account_id', event.target.value)
                    }
                    className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-white placeholder:text-white/25 focus:outline-none focus:border-brand-blue/40"
                    placeholder="act_123 / ads_456 / hub_789"
                  />
                </label>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <label className="space-y-2">
                  <span className="text-xs uppercase tracking-[0.2em] text-white/30 font-bold">
                    Email
                  </span>
                  <input
                    value={clientConnectionDraft.email}
                    onChange={(event) =>
                      updateClientConnectionDraft('email', event.target.value)
                    }
                    className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-white placeholder:text-white/25 focus:outline-none focus:border-brand-blue/40"
                    placeholder="marketing@cliente.com"
                  />
                </label>

                <label className="space-y-2">
                  <span className="text-xs uppercase tracking-[0.2em] text-white/30 font-bold">
                    Endpoint / URL
                  </span>
                  <input
                    value={clientConnectionDraft.endpoint_url}
                    onChange={(event) =>
                      updateClientConnectionDraft('endpoint_url', event.target.value)
                    }
                    className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-white placeholder:text-white/25 focus:outline-none focus:border-brand-blue/40"
                    placeholder="https://business.tucliente.com"
                  />
                </label>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <label className="space-y-2">
                  <span className="text-xs uppercase tracking-[0.2em] text-white/30 font-bold">
                    API Key
                  </span>
                  <input
                    value={clientConnectionDraft.api_key}
                    onChange={(event) =>
                      updateClientConnectionDraft('api_key', event.target.value)
                    }
                    className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-white placeholder:text-white/25 focus:outline-none focus:border-brand-blue/40"
                    placeholder="api_xxx"
                  />
                </label>

                <label className="space-y-2">
                  <span className="text-xs uppercase tracking-[0.2em] text-white/30 font-bold">
                    Access Token
                  </span>
                  <input
                    value={clientConnectionDraft.access_token}
                    onChange={(event) =>
                      updateClientConnectionDraft('access_token', event.target.value)
                    }
                    className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-white placeholder:text-white/25 focus:outline-none focus:border-brand-blue/40"
                    placeholder="token_xxx"
                  />
                </label>
              </div>

              <label className="space-y-2">
                <span className="text-xs uppercase tracking-[0.2em] text-white/30 font-bold">
                  Notas
                </span>
                <textarea
                  value={clientConnectionDraft.notes}
                  onChange={(event) =>
                    updateClientConnectionDraft('notes', event.target.value)
                  }
                  rows={4}
                  className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-white placeholder:text-white/25 focus:outline-none focus:border-brand-blue/40 resize-none"
                  placeholder="Accesos compartidos, responsable del cliente, restricciones..."
                />
              </label>

              <button
                type="button"
                onClick={() =>
                  updateClientConnectionDraft(
                    'sync_enabled',
                    !clientConnectionDraft.sync_enabled,
                  )
                }
                className={cn(
                  'glass-card p-4 text-left border transition-colors',
                  clientConnectionDraft.sync_enabled
                    ? 'border-brand-blue/30 text-white'
                    : 'border-white/10 text-white/55',
                )}
              >
                <div className="flex items-center gap-3">
                  <Link2 className="w-5 h-5" />
                  <div>
                    <p className="font-medium">Sincronización manual activa</p>
                    <p className="text-sm text-white/45">
                      Marca esta conexión como operativa para el cliente.
                    </p>
                  </div>
                </div>
              </button>

              {selectedClientConnection ? (
                <div className="glass-panel p-4 text-sm text-white/45 space-y-1">
                  <p>Última prueba: {formatDate(selectedClientConnection.last_tested_at)}</p>
                  <p>Última actualización: {formatDate(selectedClientConnection.updated_at)}</p>
                </div>
              ) : (
                <div className="glass-panel p-4 text-sm text-white/45">
                  Guarda primero la ficha manual y luego podrás probarla o conectarla.
                </div>
              )}

              <div className="flex flex-wrap gap-3">
                <button
                  type="button"
                  onClick={() => void handleSaveClientConnection()}
                  disabled={clientSaving}
                  className="glass-button-primary disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  <Save className="w-4 h-4" />
                  {clientSaving ? 'Guardando...' : 'Guardar conexión cliente'}
                </button>

                <button
                  type="button"
                  onClick={() =>
                    selectedClientConnection
                      ? void handleClientConnectionAction(selectedClientConnection, 'test')
                      : void handleSaveClientConnection()
                  }
                  disabled={clientActingId === selectedClientConnection?.id}
                  className="glass-button-secondary disabled:opacity-50"
                >
                  Probar
                </button>

                {selectedClientConnection ? (
                  <button
                    type="button"
                    onClick={() =>
                      void handleClientConnectionAction(
                        selectedClientConnection,
                        selectedClientConnection.status === 'connected' ? 'disconnect' : 'connect',
                      )
                    }
                    disabled={clientActingId === selectedClientConnection.id}
                    className="glass-button-secondary disabled:opacity-50"
                  >
                    {selectedClientConnection.status === 'connected' ? 'Desconectar' : 'Conectar'}
                  </button>
                ) : null}
              </div>
            </div>
          </div>
        )}
        </section>
      </CollapsibleSection>

      <CollapsibleSection
        title="Actividad de integraciones"
        description="Timeline técnico de pruebas, webhooks y sincronizaciones."
        icon={<RefreshCw className="w-5 h-5" />}
        summary={`${selectedEvents.length} eventos`}
        storageKey="integrations-events"
        defaultOpen={false}
      >
        <section className="space-y-5">
        <div className="flex flex-col gap-2 lg:flex-row lg:items-center lg:justify-between">
          <div>
            <p className="text-xs uppercase tracking-[0.2em] text-white/30 font-bold">
              Actividad de integraciones
            </p>
            <h3 className="text-2xl font-bold">
              {selectedIntegration ? `Eventos de ${selectedIntegration.name}` : 'Timeline general'}
            </h3>
          </div>
          <div className="text-sm text-white/45">
            {selectedEvents.length} eventos visibles
          </div>
        </div>

        {selectedEvents.length === 0 ? (
          <div className="glass-panel p-6 text-center text-white/40">
            No hay eventos registrados todavía para esta integración.
          </div>
        ) : (
          <div className="space-y-3">
            {selectedEvents.slice(0, 14).map((event) => (
              <div key={event.id} className="glass-card p-4 space-y-3">
                <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
                  <div className="space-y-2">
                    <div className="flex flex-wrap items-center gap-3">
                      <p className="font-medium">{event.summary}</p>
                      <span
                        className={cn(
                          'text-[10px] px-2 py-1 rounded-full border uppercase tracking-[0.2em] font-bold',
                          getEventStatusClass(event.status),
                        )}
                      >
                        {event.status}
                      </span>
                    </div>
                    <div className="flex flex-wrap gap-3 text-xs text-white/40">
                      <span>{event.integration_name}</span>
                      <span>{event.event_type}</span>
                      <span>{event.direction === 'inbound' ? 'Entrante' : 'Saliente'}</span>
                    </div>
                  </div>
                  <div className="text-xs text-white/35">{formatDate(event.created_at)}</div>
                </div>

                {event.payload ? (
                  <pre className="bg-black/20 border border-white/5 rounded-xl p-3 text-xs text-white/55 overflow-x-auto whitespace-pre-wrap">
                    {JSON.stringify(event.payload, null, 2)}
                  </pre>
                ) : null}
              </div>
            ))}
          </div>
        )}
        </section>
      </CollapsibleSection>
    </div>
  );
};
