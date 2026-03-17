import React, { useEffect, useState } from 'react';
import {
  AlertTriangle,
  BrainCircuit,
  Check,
  Copy,
  FileText,
  ClipboardList,
  History,
  Loader2,
  RefreshCcw,
  Send,
  Sparkles,
  Target,
  BarChart3,
  Zap,
  Bot,
  Workflow,
  Users,
  Briefcase,
} from 'lucide-react';
import { AnimatePresence, motion } from 'motion/react';
import ReactMarkdown from 'react-markdown';
import {
  AIAutomationRun,
  AIAutomationResponse,
  AIResponse,
  Client,
  Lead,
  Project,
  cn,
} from '../types';
import { AppSection } from '../permissions';
import {
  clearAIAutomationRunFilterPreset,
  loadAIAutomationRunFilterPreset,
  type AiTriggerSettingKey,
} from '../lib/aiRunFilters';

type AIFeatureId = 'proposal' | 'strategy' | 'analysis' | 'content';
type AIAutomationId = AIAutomationResponse['automation'];

const formatAutomationRunDate = (value: string) => {
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

const getAutomationRunLabel = (automationId: AIAutomationId) =>
  automationDefinitions.find((automation) => automation.id === automationId)?.label || automationId;

const getAutomationRunStatusLabel = (status: AIAutomationRun['status']) => {
  switch (status) {
    case 'success':
      return 'Éxito';
    case 'error':
      return 'Error';
    case 'skipped':
    default:
      return 'Omitido';
  }
};

const getAutomationRunStatusColor = (status: AIAutomationRun['status']) => {
  switch (status) {
    case 'success':
      return 'bg-green-500/10 text-green-400 border-green-500/20';
    case 'error':
      return 'bg-red-500/10 text-red-400 border-red-500/20';
    case 'skipped':
    default:
      return 'bg-white/10 text-white/60 border-white/10';
  }
};

const getAutomationRunModeLabel = (mode: AIAutomationRun['mode']) =>
  mode === 'trigger' ? 'Trigger' : 'Manual';

const getAutomationTriggerLabel = (triggerKey: AIAutomationRun['trigger_key']) => {
  switch (triggerKey) {
    case 'ai_trigger_new_lead':
      return 'Nuevo lead';
    case 'ai_trigger_client_report':
      return 'Conversión a cliente';
    case 'ai_trigger_project_task_pack':
      return 'Nuevo proyecto';
    default:
      return null;
  }
};

const triggerFilterOptions: Array<{
  value: AiTriggerSettingKey;
  label: string;
}> = [
  { value: 'ai_trigger_new_lead', label: 'Nuevo lead' },
  { value: 'ai_trigger_client_report', label: 'Conversión a cliente' },
  { value: 'ai_trigger_project_task_pack', label: 'Nuevo proyecto' },
];

interface AIFeature {
  id: AIFeatureId;
  label: string;
  icon: typeof FileText;
  placeholder: string;
  example: string;
}

interface AutomationDefinition {
  id: AIAutomationId;
  label: string;
  icon: typeof Bot;
  description: string;
  entityType: 'lead' | 'client' | 'project';
  placeholder: string;
  requiredSections: AppSection[];
}

const aiFeatures: AIFeature[] = [
  {
    id: 'proposal',
    label: 'Redactar Propuesta',
    icon: FileText,
    placeholder: 'Ej. clínica dental premium en Madrid que quiere captar primeras visitas',
    example: 'una clínica dental premium en Madrid que quiere captar primeras visitas con Google Ads y automatización de seguimiento',
  },
  {
    id: 'strategy',
    label: 'Generar Estrategia',
    icon: Target,
    placeholder: 'Ej. ecommerce de cosmética natural con ticket medio de 55€',
    example: 'un ecommerce de cosmética natural con ticket medio de 55€ que necesita escalar Meta Ads y email marketing',
  },
  {
    id: 'analysis',
    label: 'Analizar Campaña',
    icon: BarChart3,
    placeholder: 'Ej. CTR 1.2%, CPC 1.95€, CVR 2.1%, CPA 92€',
    example: 'CTR 1.2%, CPC 1.95€, CPM 14€, tasa de conversión 2.1%, CPA 92€, ROAS 1.8 y frecuencia 3.7',
  },
  {
    id: 'content',
    label: 'Ideas de Contenido',
    icon: Sparkles,
    placeholder: 'Ej. marca personal para asesor financiero B2B',
    example: 'una marca personal de un asesor financiero B2B orientada a directivos y fundadores',
  },
];

const automationDefinitions: AutomationDefinition[] = [
  {
    id: 'lead_followup',
    label: 'Seguimiento de Lead',
    icon: Users,
    description:
      'Actualiza la próxima acción comercial, deja nota operativa y, si procede, crea una tarea.',
    entityType: 'lead',
    placeholder: 'Ej. priorizar propuesta con foco en captación local y cerrar llamada esta semana',
    requiredSections: ['leads'],
  },
  {
    id: 'client_report',
    label: 'Reporte de Cliente',
    icon: ClipboardList,
    description:
      'Genera un reporte operativo real para el cliente seleccionado con lectura ejecutiva.',
    entityType: 'client',
    placeholder: 'Ej. destacar cuello de botella en seguimiento comercial y rentabilidad por canal',
    requiredSections: ['clients', 'reports'],
  },
  {
    id: 'project_tasks',
    label: 'Tareas de Proyecto',
    icon: Briefcase,
    description:
      'Desglosa el proyecto en tareas reales alineadas con su fase actual y el contexto indicado.',
    entityType: 'project',
    placeholder: 'Ej. priorizar optimización creativa y control de pacing para esta semana',
    requiredSections: ['projects', 'tasks'],
  },
];

const getResponseJson = async <T,>(response: Response): Promise<T> => {
  if (!response.ok) {
    const errorData = (await response.json().catch(() => null)) as { error?: string } | null;
    throw new Error(errorData?.error || `Request failed with status ${response.status}`);
  }

  return response.json() as Promise<T>;
};

interface JaaDsGlobalAIProps {
  accessibleSections?: AppSection[];
}

export const JaaDsGlobalAI: React.FC<JaaDsGlobalAIProps> = ({
  accessibleSections = ['dashboard'],
}) => {
  const [input, setInput] = useState('');
  const [response, setResponse] = useState('');
  const [source, setSource] = useState<AIResponse['source'] | null>(null);
  const [loading, setLoading] = useState(false);
  const [copied, setCopied] = useState(false);
  const [feedbackMessage, setFeedbackMessage] = useState<string | null>(null);
  const [feedbackTone, setFeedbackTone] = useState<'success' | 'error'>('success');
  const [activeFeature, setActiveFeature] = useState<AIFeature>(aiFeatures[0]);
  const [leads, setLeads] = useState<Lead[]>([]);
  const [clients, setClients] = useState<Client[]>([]);
  const [projects, setProjects] = useState<Project[]>([]);
  const [automationLoading, setAutomationLoading] = useState(false);
  const [automationOptionsLoading, setAutomationOptionsLoading] = useState(false);
  const [automationContext, setAutomationContext] = useState('');
  const [automationResponse, setAutomationResponse] = useState<AIAutomationResponse | null>(null);
  const [automationRuns, setAutomationRuns] = useState<AIAutomationRun[]>([]);
  const [automationRunsLoading, setAutomationRunsLoading] = useState(true);
  const [automationRunsRefreshing, setAutomationRunsRefreshing] = useState(false);
  const [activeAutomationId, setActiveAutomationId] = useState<AIAutomationId | null>(null);
  const [selectedEntityId, setSelectedEntityId] = useState('');
  const [runStatusFilter, setRunStatusFilter] = useState<'all' | AIAutomationRun['status']>('all');
  const [runModeFilter, setRunModeFilter] = useState<'all' | AIAutomationRun['mode']>('all');
  const [runAutomationFilter, setRunAutomationFilter] = useState<'all' | AIAutomationId>('all');
  const [runTriggerFilter, setRunTriggerFilter] = useState<'all' | AiTriggerSettingKey>('all');

  const setMessage = (message: string, tone: 'success' | 'error' = 'success') => {
    setFeedbackTone(tone);
    setFeedbackMessage(message);
  };

  const availableAutomations = automationDefinitions.filter((automation) =>
    automation.requiredSections.every((section) => accessibleSections.includes(section)),
  );
  const activeAutomation =
    availableAutomations.find((automation) => automation.id === activeAutomationId) ||
    availableAutomations[0] ||
    null;

  const loadAutomationRuns = async ({
    background = false,
    silent = false,
  }: {
    background?: boolean;
    silent?: boolean;
  } = {}) => {
    if (background) {
      setAutomationRunsRefreshing(true);
    } else {
      setAutomationRunsLoading(true);
    }

    try {
      const searchParams = new URLSearchParams({ limit: '24' });

      if (runStatusFilter !== 'all') {
        searchParams.set('status', runStatusFilter);
      }

      if (runModeFilter !== 'all') {
        searchParams.set('mode', runModeFilter);
      }

      if (runAutomationFilter !== 'all') {
        searchParams.set('automation', runAutomationFilter);
      }

      if (runTriggerFilter !== 'all') {
        searchParams.set('trigger_key', runTriggerFilter);
      }

      const response = await fetch(`/api/ai/runs?${searchParams.toString()}`);
      const data = await getResponseJson<AIAutomationRun[]>(response);
      setAutomationRuns(data);

      if (background && !silent) {
        setMessage('Historial IA actualizado.');
      }
    } catch (error) {
      console.error('Error loading AI automation runs:', error);

      if (!silent) {
        setMessage('No se pudo cargar el historial de ejecuciones IA.', 'error');
      }
    } finally {
      if (background) {
        setAutomationRunsRefreshing(false);
      } else {
        setAutomationRunsLoading(false);
      }
    }
  };

  useEffect(() => {
    setActiveAutomationId((currentId) => {
      if (currentId && availableAutomations.some((automation) => automation.id === currentId)) {
        return currentId;
      }

      return availableAutomations[0]?.id || null;
    });
  }, [availableAutomations]);

  useEffect(() => {
    const loadAutomationOptions = async () => {
      const shouldLoadLeads = accessibleSections.includes('leads');
      const shouldLoadClients = accessibleSections.includes('clients');
      const shouldLoadProjects = accessibleSections.includes('projects');

      if (!shouldLoadLeads && !shouldLoadClients && !shouldLoadProjects) {
        setLeads([]);
        setClients([]);
        setProjects([]);
        return;
      }

      setAutomationOptionsLoading(true);

      try {
        const [leadsResponse, clientsResponse, projectsResponse] = await Promise.all([
          shouldLoadLeads ? fetch('/api/leads') : Promise.resolve(null),
          shouldLoadClients ? fetch('/api/clients') : Promise.resolve(null),
          shouldLoadProjects ? fetch('/api/projects') : Promise.resolve(null),
        ]);

        setLeads(
          leadsResponse && leadsResponse.ok ? await getResponseJson<Lead[]>(leadsResponse) : [],
        );
        setClients(
          clientsResponse && clientsResponse.ok
            ? await getResponseJson<Client[]>(clientsResponse)
            : [],
        );
        setProjects(
          projectsResponse && projectsResponse.ok
            ? await getResponseJson<Project[]>(projectsResponse)
            : [],
        );
      } catch (error) {
        console.error('Error loading automation options:', error);
        setMessage('No se pudieron cargar las entidades para automatizaciones.', 'error');
      } finally {
        setAutomationOptionsLoading(false);
      }
    };

    void loadAutomationOptions();
  }, [accessibleSections]);

  useEffect(() => {
    void loadAutomationRuns({ silent: true });
  }, [runStatusFilter, runModeFilter, runAutomationFilter, runTriggerFilter]);

  useEffect(() => {
    const preset = loadAIAutomationRunFilterPreset();

    if (!preset) {
      return;
    }

    if (preset.status) {
      setRunStatusFilter(preset.status);
    }

    if (preset.mode) {
      setRunModeFilter(preset.mode);
    }

    if (preset.automation) {
      setRunAutomationFilter(preset.automation);
    }

    if (preset.trigger_key) {
      setRunTriggerFilter(preset.trigger_key);
    }

    clearAIAutomationRunFilterPreset();
  }, []);

  const activeAutomationOptions = activeAutomation
    ? activeAutomation.entityType === 'lead'
      ? leads.map((lead) => ({
          id: String(lead.id),
          label: `${lead.company || lead.name} · ${lead.name}`,
        }))
      : activeAutomation.entityType === 'client'
        ? clients.map((client) => ({
            id: String(client.id),
            label: `${client.company} · ${client.status}`,
          }))
        : projects.map((project) => ({
            id: String(project.id),
            label: `${project.name} · ${project.status}`,
          }))
    : [];

  const automationRunStats = {
    success: automationRuns.filter((run) => run.status === 'success').length,
    error: automationRuns.filter((run) => run.status === 'error').length,
    skipped: automationRuns.filter((run) => run.status === 'skipped').length,
  };

  useEffect(() => {
    if (!activeAutomation) {
      setSelectedEntityId('');
      return;
    }

    if (activeAutomationOptions.length === 0) {
      setSelectedEntityId('');
      return;
    }

    setSelectedEntityId((currentId) =>
      activeAutomationOptions.some((option) => option.id === currentId)
        ? currentId
        : activeAutomationOptions[0].id,
    );
  }, [activeAutomation, activeAutomationOptions]);

  const handleGenerate = async () => {
    if (!input.trim()) {
      setMessage('Añade contexto antes de ejecutar JaaDs Global AI.', 'error');
      return;
    }

    setLoading(true);
    setResponse('');
    setSource(null);
    setCopied(false);
    setAutomationResponse(null);

    try {
      const apiResponse = await fetch('/api/ai/generate', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          feature: activeFeature.id,
          input,
        }),
      });

      const data = await getResponseJson<AIResponse>(apiResponse);
      setResponse(data.text || 'No se pudo generar una respuesta.');
      setSource(data.source);
      setMessage(
        data.source === 'gemini'
          ? 'Respuesta generada con Gemini.'
          : 'Respuesta generada con el motor local de respaldo.',
      );
    } catch (error) {
      console.error('AI Error:', error);
      setMessage('No se pudo generar la respuesta de IA.', 'error');
    } finally {
      setLoading(false);
    }
  };

  const handleCopy = async () => {
    if (!response) {
      return;
    }

    try {
      await navigator.clipboard.writeText(response);
      setCopied(true);
      setMessage('Respuesta copiada al portapapeles.');
    } catch (error) {
      console.error('Copy error:', error);
      setMessage('No se pudo copiar la respuesta.', 'error');
    }
  };

  const handleLoadExample = () => {
    setInput(activeFeature.example);
    setMessage('Ejemplo cargado en el prompt.');
  };

  const handleClear = () => {
    setInput('');
    setResponse('');
    setSource(null);
    setCopied(false);
    setFeedbackMessage(null);
  };

  const handleRunAutomation = async () => {
    if (!activeAutomation) {
      setMessage('No hay automatizaciones disponibles para tu rol.', 'error');
      return;
    }

    if (!selectedEntityId) {
      setMessage('Selecciona una entidad antes de ejecutar la automatización.', 'error');
      return;
    }

    setAutomationLoading(true);
    setAutomationResponse(null);
    setCopied(false);

    try {
      const apiResponse = await fetch('/api/ai/automations/run', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          automation: activeAutomation.id,
          entity_id: Number(selectedEntityId),
          input: automationContext,
        }),
      });

      const data = await getResponseJson<AIAutomationResponse>(apiResponse);
      setAutomationResponse(data);
      setMessage('Automatización ejecutada correctamente.');
      void loadAutomationRuns({ background: true, silent: true });
    } catch (error) {
      console.error('Automation error:', error);
      setMessage(
        error instanceof Error
          ? error.message
          : 'No se pudo ejecutar la automatización de IA.',
        'error',
      );
      void loadAutomationRuns({ background: true, silent: true });
    } finally {
      setAutomationLoading(false);
    }
  };

  return (
    <div className="max-w-5xl mx-auto space-y-8">
      <header className="text-center space-y-4">
        <div className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-brand-blue/10 border border-brand-blue/20 text-brand-blue text-sm font-bold">
          <BrainCircuit className="w-4 h-4" />
          IA Generativa de Próxima Generación
        </div>
        <h2 className="text-5xl font-bold tracking-tight">
          JaaDs Global <span className="text-brand-blue">AI</span> Engine
        </h2>
        <p className="text-white/50 max-w-2xl mx-auto">
          Potencia tu agencia con inteligencia aplicada. Genera propuestas, estrategias y análisis sin salir del CRM.
        </p>
      </header>

      {feedbackMessage ? (
        <div
          className={cn(
            'glass-panel p-3 text-sm max-w-3xl mx-auto',
            feedbackTone === 'success' ? 'text-green-400' : 'text-red-400',
          )}
        >
          {feedbackMessage}
        </div>
      ) : null}

      <div className="grid grid-cols-1 lg:grid-cols-4 gap-6">
        <div className="lg:col-span-1 space-y-3">
          <h3 className="text-xs font-bold uppercase tracking-widest text-white/30 px-2">
            Herramientas IA
          </h3>
          {aiFeatures.map((feature) => (
            <button
              key={feature.id}
              type="button"
              onClick={() => {
                setActiveFeature(feature);
                setCopied(false);
              }}
              className={cn(
                'w-full flex items-center gap-3 px-4 py-3 rounded-xl transition-all duration-300',
                activeFeature.id === feature.id
                  ? 'bg-brand-blue text-white shadow-[0_0_20px_rgba(0,102,255,0.3)]'
                  : 'bg-white/5 text-white/50 hover:bg-white/10',
              )}
            >
              <feature.icon className="w-5 h-5" />
              <span className="text-sm font-medium">{feature.label}</span>
            </button>
          ))}
        </div>

        <div className="lg:col-span-3 space-y-6">
          <div className="glass-panel p-6 space-y-4">
            <div className="flex items-center gap-3 mb-2">
              <div className="p-2 rounded-lg bg-brand-blue/20 text-brand-blue">
                <activeFeature.icon className="w-5 h-5" />
              </div>
              <div className="flex-1">
                <h4 className="font-bold">{activeFeature.label}</h4>
                <p className="text-sm text-white/40">
                  Añade contexto suficiente para obtener una salida más útil.
                </p>
              </div>
              {source ? (
                <span
                  className={cn(
                    'text-[10px] px-2 py-1 rounded-full font-bold uppercase tracking-wider border',
                    source === 'gemini'
                      ? 'bg-green-500/10 text-green-400 border-green-500/20'
                      : 'bg-yellow-500/10 text-yellow-400 border-yellow-500/20',
                  )}
                >
                  {source === 'gemini' ? 'Gemini' : 'Local'}
                </span>
              ) : null}
            </div>

            <textarea
              value={input}
              onChange={(event) => setInput(event.target.value)}
              placeholder={activeFeature.placeholder}
              className="w-full h-32 glass-input resize-none p-4"
            />

            <div className="flex flex-wrap justify-between gap-3">
              <div className="flex gap-3">
                <button
                  type="button"
                  onClick={handleLoadExample}
                  className="glass-button-secondary"
                >
                  <Sparkles className="w-5 h-5" />
                  Cargar Ejemplo
                </button>
                <button
                  type="button"
                  onClick={handleClear}
                  className="glass-button-secondary"
                >
                  <RefreshCcw className="w-5 h-5" />
                  Limpiar
                </button>
              </div>

              <button
                type="button"
                onClick={handleGenerate}
                disabled={loading || !input.trim()}
                className="glass-button-primary disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {loading ? (
                  <>
                    <Loader2 className="w-5 h-5 animate-spin" />
                    Generando...
                  </>
                ) : (
                  <>
                    <Zap className="w-5 h-5 fill-white" />
                    Ejecutar JaaDs Global AI
                  </>
                )}
              </button>
            </div>
          </div>

          <AnimatePresence>
            {response ? (
              <motion.div
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -20 }}
                className="glass-panel p-8 relative overflow-hidden"
              >
                <div className="absolute top-0 right-0 p-4 flex gap-2">
                  <button
                    type="button"
                    onClick={handleCopy}
                    className="p-2 hover:bg-white/10 rounded-lg transition-colors text-white/40 hover:text-white"
                  >
                    {copied ? <Check className="w-5 h-5 text-green-400" /> : <Copy className="w-5 h-5" />}
                  </button>
                  <button
                    type="button"
                    onClick={handleGenerate}
                    disabled={loading}
                    className="p-2 hover:bg-white/10 rounded-lg transition-colors text-white/40 hover:text-white"
                  >
                    <Send className="w-5 h-5" />
                  </button>
                </div>
                <div className="prose prose-invert max-w-none">
                  <ReactMarkdown>{response}</ReactMarkdown>
                </div>
              </motion.div>
            ) : null}
          </AnimatePresence>
        </div>
      </div>

      <div className="glass-panel p-6 space-y-6">
        <div className="flex items-center gap-3">
          <div className="p-2 rounded-lg bg-brand-cyan/20 text-brand-cyan">
            <Workflow className="w-5 h-5" />
          </div>
          <div>
            <h3 className="font-bold text-lg">Automatizaciones Operativas</h3>
            <p className="text-sm text-white/40">
              Ejecuta acciones reales sobre leads, clientes y proyectos desde el CRM.
            </p>
          </div>
        </div>

        {availableAutomations.length === 0 ? (
          <div className="glass-card p-5 text-sm text-white/40">
            Tu rol actual no tiene automatizaciones operativas disponibles en este módulo.
          </div>
        ) : (
          <>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
              {availableAutomations.map((automation) => (
                <button
                  key={automation.id}
                  type="button"
                  onClick={() => {
                    setActiveAutomationId(automation.id);
                    setAutomationResponse(null);
                  }}
                  className={cn(
                    'w-full text-left rounded-xl p-4 transition-all border',
                    activeAutomation?.id === automation.id
                      ? 'bg-brand-blue/10 border-brand-blue/20 text-white'
                      : 'bg-white/5 border-white/10 text-white/60 hover:bg-white/10',
                  )}
                >
                  <div className="flex items-center gap-3 mb-2">
                    <automation.icon className="w-5 h-5" />
                    <span className="font-medium">{automation.label}</span>
                  </div>
                  <p className="text-sm text-white/45">{automation.description}</p>
                </button>
              ))}
            </div>

            {activeAutomation ? (
              <div className="grid grid-cols-1 xl:grid-cols-[320px_1fr] gap-6">
                <div className="glass-card p-5 space-y-4">
                  <div>
                    <p className="text-xs uppercase tracking-wider text-white/35 font-bold">
                      Automatización activa
                    </p>
                    <h4 className="font-semibold mt-2">{activeAutomation.label}</h4>
                    <p className="text-sm text-white/45 mt-1">{activeAutomation.description}</p>
                  </div>

                  <div>
                    <label className="block text-xs font-bold uppercase tracking-wider text-white/35 mb-2">
                      Entidad objetivo
                    </label>
                    <select
                      value={selectedEntityId}
                      onChange={(event) => setSelectedEntityId(event.target.value)}
                      disabled={automationOptionsLoading || activeAutomationOptions.length === 0}
                      className="w-full glass-input"
                    >
                      {activeAutomationOptions.length === 0 ? (
                        <option value="">
                          {automationOptionsLoading
                            ? 'Cargando entidades...'
                            : 'No hay entidades disponibles'}
                        </option>
                      ) : (
                        activeAutomationOptions.map((option) => (
                          <option key={option.id} value={option.id}>
                            {option.label}
                          </option>
                        ))
                      )}
                    </select>
                  </div>

                  <div>
                    <label className="block text-xs font-bold uppercase tracking-wider text-white/35 mb-2">
                      Contexto adicional
                    </label>
                    <textarea
                      value={automationContext}
                      onChange={(event) => setAutomationContext(event.target.value)}
                      placeholder={activeAutomation.placeholder}
                      rows={5}
                      className="w-full glass-input resize-none p-4"
                    />
                  </div>

                  <button
                    type="button"
                    onClick={handleRunAutomation}
                    disabled={
                      automationLoading ||
                      automationOptionsLoading ||
                      activeAutomationOptions.length === 0 ||
                      !selectedEntityId
                    }
                    className="glass-button-primary w-full justify-center disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    {automationLoading ? (
                      <>
                        <Loader2 className="w-5 h-5 animate-spin" />
                        Ejecutando...
                      </>
                    ) : (
                      <>
                        <Bot className="w-5 h-5" />
                        Ejecutar automatización
                      </>
                    )}
                  </button>
                </div>

                <div className="glass-card p-5 space-y-4">
                  <div className="flex items-center justify-between gap-3">
                    <div>
                      <p className="text-xs uppercase tracking-wider text-white/35 font-bold">
                        Resultado operativo
                      </p>
                      <h4 className="font-semibold mt-2">
                        {automationResponse
                          ? 'Acciones aplicadas sobre datos reales'
                          : 'Listo para ejecutar'}
                      </h4>
                    </div>
                    {automationResponse ? (
                      <span className="text-[10px] px-2 py-1 rounded-full font-bold uppercase tracking-wider border bg-yellow-500/10 text-yellow-400 border-yellow-500/20">
                        {automationResponse.source}
                      </span>
                    ) : null}
                  </div>

                  {automationResponse ? (
                    <motion.div
                      initial={{ opacity: 0, y: 12 }}
                      animate={{ opacity: 1, y: 0 }}
                      className="space-y-4"
                    >
                      <div className="glass-panel p-4">
                        <p className="text-sm text-white/85">{automationResponse.summary}</p>
                      </div>

                      <div className="space-y-3">
                        {automationResponse.applied_actions.map((action, index) => (
                          <div
                            key={`${action.type}-${action.target_id || index}`}
                            className="glass-panel p-4 space-y-2"
                          >
                            <div className="flex flex-wrap items-center justify-between gap-3">
                              <div className="flex items-center gap-2">
                                <span
                                  className={cn(
                                    'text-[10px] px-2 py-1 rounded-full font-bold uppercase tracking-wider border',
                                    action.status === 'created'
                                      ? 'bg-green-500/10 text-green-400 border-green-500/20'
                                      : action.status === 'updated'
                                        ? 'bg-blue-500/10 text-blue-400 border-blue-500/20'
                                        : 'bg-white/10 text-white/60 border-white/10',
                                  )}
                                >
                                  {action.status}
                                </span>
                                <p className="font-medium">{action.label}</p>
                              </div>
                              {action.target_id ? (
                                <span className="text-xs text-white/35">ID #{action.target_id}</span>
                              ) : null}
                            </div>
                            <p className="text-sm text-white/55">{action.details}</p>
                          </div>
                        ))}
                      </div>
                    </motion.div>
                  ) : (
                    <div className="glass-panel p-6 text-sm text-white/40">
                      Selecciona una automatización, elige una entidad y ejecútala para crear
                      acciones reales sobre datos del CRM.
                    </div>
                  )}
                </div>
              </div>
            ) : null}
          </>
        )}
      </div>

      <div className="glass-panel p-6 space-y-5">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="p-2 rounded-lg bg-fuchsia-500/15 text-fuchsia-300">
              <History className="w-5 h-5" />
            </div>
            <div>
              <h3 className="font-bold text-lg">Monitor de Ejecuciones IA</h3>
              <p className="text-sm text-white/40">
                Historial reciente de automatizaciones manuales y disparadores automáticos.
              </p>
            </div>
          </div>

          <button
            type="button"
            onClick={() => void loadAutomationRuns({ background: true })}
            disabled={automationRunsRefreshing}
            className="glass-button-secondary"
          >
            <RefreshCcw className="w-5 h-5" />
            {automationRunsRefreshing ? 'Actualizando...' : 'Actualizar'}
          </button>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-4">
          <select
            value={runAutomationFilter}
            onChange={(event) =>
              setRunAutomationFilter(event.target.value as 'all' | AIAutomationId)
            }
            className="w-full glass-input"
          >
            <option value="all">Todas las automatizaciones</option>
            {automationDefinitions.map((automation) => (
              <option key={automation.id} value={automation.id}>
                {automation.label}
              </option>
            ))}
          </select>

          <select
            value={runModeFilter}
            onChange={(event) => setRunModeFilter(event.target.value as 'all' | AIAutomationRun['mode'])}
            className="w-full glass-input"
          >
            <option value="all">Todos los orígenes</option>
            <option value="manual">Manual</option>
            <option value="trigger">Trigger</option>
          </select>

          <select
            value={runStatusFilter}
            onChange={(event) =>
              setRunStatusFilter(event.target.value as 'all' | AIAutomationRun['status'])
            }
            className="w-full glass-input"
          >
            <option value="all">Todos los estados</option>
            <option value="success">Éxito</option>
            <option value="error">Error</option>
            <option value="skipped">Omitido</option>
          </select>

          <select
            value={runTriggerFilter}
            onChange={(event) =>
              setRunTriggerFilter(event.target.value as 'all' | AiTriggerSettingKey)
            }
            className="w-full glass-input"
          >
            <option value="all">Todos los triggers</option>
            {triggerFilterOptions.map((trigger) => (
              <option key={trigger.value} value={trigger.value}>
                {trigger.label}
              </option>
            ))}
          </select>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          {[
            { label: 'Éxito', value: automationRunStats.success, tone: 'text-green-400' },
            { label: 'Error', value: automationRunStats.error, tone: 'text-red-400' },
            { label: 'Omitido', value: automationRunStats.skipped, tone: 'text-white/70' },
          ].map((stat) => (
            <div key={stat.label} className="glass-card p-4">
              <p className="text-xs uppercase tracking-wider text-white/35 font-bold">
                {stat.label}
              </p>
              <p className={cn('text-2xl font-bold mt-2', stat.tone)}>{stat.value}</p>
            </div>
          ))}
        </div>

        {automationRunsLoading ? (
          <div className="glass-panel p-6 text-center text-white/40">
            Cargando historial de automatizaciones IA...
          </div>
        ) : automationRuns.length === 0 ? (
          <div className="glass-panel p-6 text-center text-white/40">
            No hay ejecuciones IA que coincidan con los filtros actuales.
          </div>
        ) : (
          <div className="space-y-3">
            {automationRuns.map((run) => (
              <div key={run.id} className="glass-card p-4 space-y-4">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="space-y-3">
                    <div className="flex flex-wrap items-center gap-2">
                      <span
                        className={cn(
                          'text-[10px] px-2 py-1 rounded-full font-bold uppercase tracking-wider border',
                          getAutomationRunStatusColor(run.status),
                        )}
                      >
                        {getAutomationRunStatusLabel(run.status)}
                      </span>
                      <span className="text-[10px] px-2 py-1 rounded-full font-bold uppercase tracking-wider border bg-blue-500/10 text-blue-300 border-blue-500/20">
                        {getAutomationRunModeLabel(run.mode)}
                      </span>
                      <span className="text-[10px] px-2 py-1 rounded-full font-bold uppercase tracking-wider border bg-white/5 text-white/60 border-white/10">
                        {getAutomationRunLabel(run.automation)}
                      </span>
                      {run.trigger_key ? (
                        <span className="text-[10px] px-2 py-1 rounded-full font-bold uppercase tracking-wider border bg-fuchsia-500/10 text-fuchsia-300 border-fuchsia-500/20">
                          {getAutomationTriggerLabel(run.trigger_key)}
                        </span>
                      ) : null}
                    </div>

                    <div>
                      <p className="font-medium">
                        {run.error_message || run.summary || 'Ejecución IA sin resumen adicional.'}
                      </p>
                      <p className="text-sm text-white/45 mt-1">
                        {run.actor_name}
                        {run.actor_email ? ` · ${run.actor_email}` : ''}
                        {run.entity_id ? ` · ${run.entity_type} #${run.entity_id}` : ''}
                      </p>
                    </div>
                  </div>

                  <p className="text-xs text-white/40">{formatAutomationRunDate(run.created_at)}</p>
                </div>

                {run.actions.length > 0 ? (
                  <div className="flex flex-wrap gap-2">
                    {run.actions.map((action, index) => (
                      <span
                        key={`${run.id}-${action.type}-${action.target_id || index}`}
                        className={cn(
                          'text-[11px] px-2 py-1 rounded-full border',
                          action.status === 'created'
                            ? 'bg-green-500/10 text-green-300 border-green-500/20'
                            : action.status === 'updated'
                              ? 'bg-blue-500/10 text-blue-300 border-blue-500/20'
                              : 'bg-white/5 text-white/55 border-white/10',
                        )}
                      >
                        {action.label}
                      </span>
                    ))}
                  </div>
                ) : run.status === 'error' ? (
                  <div className="glass-panel p-4 flex items-center gap-3 text-sm text-red-300">
                    <AlertTriangle className="w-4 h-4" />
                    <span>{run.error_message || 'La ejecución falló sin detalle adicional.'}</span>
                  </div>
                ) : null}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
};
