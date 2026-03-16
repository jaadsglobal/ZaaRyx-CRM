import React, { useEffect, useState } from 'react';
import {
  FileText,
  Download,
  Eye,
  Filter,
  Search,
  BarChart3,
  TrendingUp,
  PieChart as PieChartIcon,
} from 'lucide-react';
import { AnimatePresence, motion } from 'motion/react';
import { Client, Report, cn } from '../types';
import { triggerClientDownload } from '../lib/download';
import { CollapsibleSection } from './CollapsibleSection';

interface ReportsManagerProps {
  readOnly?: boolean;
}

interface ReportFormState {
  client_id: string;
  title: string;
  type: string;
}

const createInitialReportForm = (clientId?: number): ReportFormState => ({
  client_id: clientId ? String(clientId) : '',
  title: '',
  type: 'Performance',
});

const getResponseJson = async <T,>(response: Response): Promise<T> => {
  if (!response.ok) {
    throw new Error(`Request failed with status ${response.status}`);
  }

  return response.json() as Promise<T>;
};

const decodeReportContent = (url?: string) => {
  if (!url || !url.startsWith('data:text/plain')) {
    return 'No hay vista previa disponible para este reporte.';
  }

  const [, encodedContent = ''] = url.split(',');
  return decodeURIComponent(encodedContent);
};

const getTemplateTitle = (type: string, clientName?: string) => {
  const name = clientName || 'Cliente';
  switch (type) {
    case 'Performance':
      return `Reporte Mensual - ${name}`;
    case 'Audience':
      return `Análisis de Audiencia - ${name}`;
    case 'SEO':
      return `Reporte SEO - ${name}`;
    case 'Strategy':
      return `Análisis Estratégico - ${name}`;
    default:
      return `Reporte - ${name}`;
  }
};

export const ReportsManager: React.FC<ReportsManagerProps> = ({ readOnly = false }) => {
  const [reports, setReports] = useState<Report[]>([]);
  const [clients, setClients] = useState<Client[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [showFilters, setShowFilters] = useState(false);
  const [showNewReportForm, setShowNewReportForm] = useState(false);
  const [creatingReport, setCreatingReport] = useState(false);
  const [typeFilter, setTypeFilter] = useState('all');
  const [clientFilter, setClientFilter] = useState('all');
  const [feedbackMessage, setFeedbackMessage] = useState<string | null>(null);
  const [feedbackTone, setFeedbackTone] = useState<'success' | 'error'>('success');
  const [previewReportId, setPreviewReportId] = useState<number | null>(null);
  const [reportForm, setReportForm] = useState<ReportFormState>(createInitialReportForm());

  const loadReportsData = async () => {
    try {
      const reportsResponse = await fetch('/api/reports');
      const reportsData = await getResponseJson<Report[]>(reportsResponse);
      let clientsData: Client[] = [];

      if (!readOnly) {
        const clientsResponse = await fetch('/api/clients');
        clientsData = await getResponseJson<Client[]>(clientsResponse);
      }

      setReports(reportsData);
      setClients(clientsData);
      setReportForm((currentForm) =>
        currentForm.client_id || clientsData.length === 0
          ? currentForm
          : { ...currentForm, client_id: String(clientsData[0].id) },
      );
    } catch (error) {
      console.error('Error fetching reports:', error);
      setFeedbackTone('error');
      setFeedbackMessage('No se pudieron cargar los reportes.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void loadReportsData();
  }, []);

  const setMessage = (message: string, tone: 'success' | 'error' = 'success') => {
    setFeedbackTone(tone);
    setFeedbackMessage(message);
  };

  const clientNameById = clients.reduce<Record<number, string>>((accumulator, client) => {
    accumulator[client.id] = client.company;
    return accumulator;
  }, {});
  const getClientLabel = (report: Report) =>
    clientNameById[report.client_id || 0] || report.client_name || 'Sin cliente';

  const filteredReports = reports.filter((report) => {
    const query = searchQuery.trim().toLowerCase();
    const matchesQuery =
      query.length === 0 ||
      report.title.toLowerCase().includes(query) ||
      getClientLabel(report).toLowerCase().includes(query) ||
      report.type.toLowerCase().includes(query);
    const matchesType = typeFilter === 'all' || report.type === typeFilter;
    const matchesClient =
      clientFilter === 'all' || String(report.client_id || '') === clientFilter;

    return matchesQuery && matchesType && matchesClient;
  });

  const selectedPreviewReport =
    reports.find((report) => report.id === previewReportId) || null;

  const reportTypes = Array.from(new Set(reports.map((report) => report.type))).sort();

  const handleCreateReport = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();

    if (readOnly) {
      setMessage('Esta cuenta solo puede consultar reportes compartidos.', 'error');
      return;
    }

    setCreatingReport(true);

    try {
      const response = await fetch('/api/reports', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          client_id: Number(reportForm.client_id),
          title: reportForm.title,
          type: reportForm.type,
        }),
      });

      const createdReport = await getResponseJson<Report>(response);
      setReports((currentReports) => [createdReport, ...currentReports]);
      setPreviewReportId(createdReport.id);
      setShowNewReportForm(false);
      setReportForm(createInitialReportForm(clients[0]?.id));
      setMessage('Reporte generado correctamente.');
    } catch (error) {
      console.error('Error creating report:', error);
      setMessage('No se pudo generar el reporte.', 'error');
    } finally {
      setCreatingReport(false);
    }
  };

  const handleDownloadReport = (report: Report) => {
    if (!report.url) {
      setMessage('Este reporte no tiene archivo disponible para descargar.', 'error');
      return;
    }

    triggerClientDownload(report.url, `${report.title}.txt`);
    setMessage(`Descarga iniciada para ${report.title}.`);
  };

  const handleTemplateAction = (type: string, message: string) => {
    if (readOnly) {
      setMessage('Esta cuenta solo puede consultar reportes compartidos.', 'error');
      return;
    }

    if (clients.length === 0) {
      setMessage('Necesitas al menos un cliente para generar reportes.', 'error');
      return;
    }

    const firstClient = clients[0];
    setShowNewReportForm(true);
    setReportForm({
      client_id: firstClient ? String(firstClient.id) : '',
      title: getTemplateTitle(type, firstClient?.company),
      type,
    });
    setMessage(message);
  };

  const handleToggleNewReportForm = () => {
    if (readOnly) {
      return;
    }

    if (!showNewReportForm && clients.length === 0) {
      setMessage('Necesitas al menos un cliente para generar reportes.', 'error');
      return;
    }

    setShowNewReportForm((current) => !current);
  };

  return (
    <div className="space-y-8">
      <header className="flex justify-between items-center">
        <div>
          <h2 className="text-3xl font-bold">Reportes</h2>
          <p className="text-white/50">
            {readOnly
              ? 'Consulta los informes compartidos contigo en tu espacio cliente.'
              : 'Genera y comparte informes detallados con tus clientes.'}
          </p>
        </div>
        {!readOnly ? (
          <button
            type="button"
            onClick={handleToggleNewReportForm}
            className="glass-button-primary"
          >
            <BarChart3 className="w-5 h-5" />
            Generar Nuevo Reporte
          </button>
        ) : null}
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
        {!readOnly && showNewReportForm ? (
          <motion.form
            initial={{ opacity: 0, y: -8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -8 }}
            onSubmit={handleCreateReport}
            className="glass-panel p-6 grid grid-cols-1 md:grid-cols-3 gap-4"
          >
            {clients.length === 0 ? (
              <div className="md:col-span-3 text-sm text-yellow-400">
                Crea primero un cliente para desbloquear la generación de reportes.
              </div>
            ) : null}
            <div>
              <label className="block text-xs font-bold uppercase tracking-wider text-white/40 mb-2">
                Cliente
              </label>
              <select
                required
                value={reportForm.client_id}
                onChange={(event) => {
                  const selectedClient = clients.find(
                    (client) => String(client.id) === event.target.value,
                  );
                  setReportForm((currentForm) => ({
                    ...currentForm,
                    client_id: event.target.value,
                    title: getTemplateTitle(currentForm.type, selectedClient?.company),
                  }));
                }}
                className="w-full glass-input"
              >
                {clients.length === 0 ? <option value="">Sin clientes disponibles</option> : null}
                {clients.map((client) => (
                  <option key={client.id} value={client.id}>
                    {client.company}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-xs font-bold uppercase tracking-wider text-white/40 mb-2">
                Tipo
              </label>
              <select
                value={reportForm.type}
                onChange={(event) => {
                  const selectedClient = clients.find(
                    (client) => String(client.id) === reportForm.client_id,
                  );
                  setReportForm((currentForm) => ({
                    ...currentForm,
                    type: event.target.value,
                    title: getTemplateTitle(event.target.value, selectedClient?.company),
                  }));
                }}
                className="w-full glass-input"
              >
                <option value="Performance">Performance</option>
                <option value="Audience">Audience</option>
                <option value="SEO">SEO</option>
                <option value="Strategy">Strategy</option>
              </select>
            </div>

            <div>
              <label className="block text-xs font-bold uppercase tracking-wider text-white/40 mb-2">
                Título
              </label>
              <input
                required
                value={reportForm.title}
                onChange={(event) =>
                  setReportForm((currentForm) => ({
                    ...currentForm,
                    title: event.target.value,
                  }))
                }
                className="w-full glass-input"
                placeholder="Título del reporte"
              />
            </div>

            <div className="md:col-span-3 flex justify-end gap-3">
              <button
                type="button"
                onClick={() => setShowNewReportForm(false)}
                className="glass-button-secondary"
              >
                Cancelar
              </button>
              <button
                type="submit"
                disabled={creatingReport || clients.length === 0}
                className="glass-button-primary disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {creatingReport ? 'Generando...' : 'Guardar Reporte'}
              </button>
            </div>
          </motion.form>
        ) : null}
      </AnimatePresence>

      {!readOnly ? (
        <CollapsibleSection
          title="Biblioteca de plantillas"
          description="Atajos para lanzar tipos de reportes frecuentes sin saturar la vista principal."
          icon={<BarChart3 className="w-5 h-5" />}
          storageKey="reports-templates"
          defaultOpen={false}
        >
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            <div className="glass-card p-6 border-l-4 border-l-brand-blue">
              <div className="flex items-center gap-3 mb-4 text-brand-blue">
                <TrendingUp className="w-6 h-6" />
                <h3 className="font-bold">Reportes de Rendimiento</h3>
              </div>
              <p className="text-sm text-white/50 mb-4">Informes automáticos de KPIs, conversiones y ROI publicitario.</p>
              <button
                type="button"
                onClick={() =>
                  handleTemplateAction(
                    'Performance',
                    'Plantilla de automatización cargada para reportes de rendimiento.',
                  )
                }
                className="text-xs font-bold text-brand-blue hover:underline"
              >
                Configurar Automatización →
              </button>
            </div>
            <div className="glass-card p-6 border-l-4 border-l-brand-purple">
              <div className="flex items-center gap-3 mb-4 text-brand-purple">
                <PieChartIcon className="w-6 h-6" />
                <h3 className="font-bold">Análisis de Audiencia</h3>
              </div>
              <p className="text-sm text-white/50 mb-4">Desglose demográfico y comportamiento de usuarios por canal.</p>
              <button
                type="button"
                onClick={() =>
                  handleTemplateAction(
                    'Audience',
                    'Plantilla de análisis de audiencia preparada para un nuevo reporte.',
                  )
                }
                className="text-xs font-bold text-brand-purple hover:underline"
              >
                Ver Plantillas →
              </button>
            </div>
            <div className="glass-card p-6 border-l-4 border-l-brand-cyan">
              <div className="flex items-center gap-3 mb-4 text-brand-cyan">
                <FileText className="w-6 h-6" />
                <h3 className="font-bold">Reportes de SEO</h3>
              </div>
              <p className="text-sm text-white/50 mb-4">Seguimiento de rankings, tráfico orgánico y salud técnica.</p>
              <button
                type="button"
                onClick={() =>
                  handleTemplateAction(
                    'SEO',
                    'Plantilla SEO preparada. Puedes generar el reporte cuando quieras.',
                  )
                }
                className="text-xs font-bold text-brand-cyan hover:underline"
              >
                Sincronizar Search Console →
              </button>
            </div>
          </div>
        </CollapsibleSection>
      ) : null}

      <CollapsibleSection
        title="Biblioteca de reportes"
        description="Búsqueda, filtros, vista previa y descarga de informes."
        icon={<Search className="w-5 h-5" />}
        storageKey="reports-library"
        bodyClassName="p-0"
      >
        <div className="p-6 space-y-6">
          <div className="flex gap-4">
            <div className="flex-1 relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-white/30" />
              <input
                value={searchQuery}
                onChange={(event) => setSearchQuery(event.target.value)}
                type="text"
                placeholder="Buscar reportes..."
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
                  value={typeFilter}
                  onChange={(event) => setTypeFilter(event.target.value)}
                  className="glass-input"
                >
                  <option value="all">Todos los tipos</option>
                  {reportTypes.map((type) => (
                    <option key={type} value={type}>
                      {type}
                    </option>
                  ))}
                </select>

                {!readOnly ? (
                  <select
                    value={clientFilter}
                    onChange={(event) => setClientFilter(event.target.value)}
                    className="glass-input"
                  >
                    <option value="all">Todos los clientes</option>
                    {clients.map((client) => (
                      <option key={client.id} value={client.id}>
                        {client.company}
                      </option>
                    ))}
                  </select>
                ) : (
                  <div className="glass-panel px-4 py-3 text-sm text-white/45">
                    Vista cliente en solo lectura
                  </div>
                )}

                <button
                  type="button"
                  onClick={() => {
                    setTypeFilter('all');
                    setClientFilter('all');
                  }}
                  className="glass-button-secondary"
                >
                  Limpiar filtros
                </button>
              </motion.div>
            ) : null}
          </AnimatePresence>

          <AnimatePresence>
            {selectedPreviewReport ? (
              <motion.div
                initial={{ opacity: 0, y: -8 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -8 }}
                className="glass-panel p-6"
              >
                <div className="flex justify-between items-center mb-4">
                  <h3 className="font-bold text-lg">Vista previa: {selectedPreviewReport.title}</h3>
                  <button
                    type="button"
                    onClick={() => setPreviewReportId(null)}
                    className="glass-button-secondary"
                  >
                    Cerrar
                  </button>
                </div>
                <pre className="whitespace-pre-wrap text-sm text-white/70 font-sans">
                  {decodeReportContent(selectedPreviewReport.url)}
                </pre>
              </motion.div>
            ) : null}
          </AnimatePresence>
        </div>

        <table className="w-full text-left border-t border-white/10">
          <thead>
            <tr className="bg-white/5">
              <th className="px-6 py-4 text-xs font-bold uppercase tracking-wider text-white/40">Reporte</th>
              <th className="px-6 py-4 text-xs font-bold uppercase tracking-wider text-white/40">Cliente</th>
              <th className="px-6 py-4 text-xs font-bold uppercase tracking-wider text-white/40">Tipo</th>
              <th className="px-6 py-4 text-xs font-bold uppercase tracking-wider text-white/40">Fecha</th>
              <th className="px-6 py-4 text-xs font-bold uppercase tracking-wider text-white/40">Acciones</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-white/5">
            {loading ? (
              [1, 2].map((item) => (
                <tr key={item} className="animate-pulse">
                  <td colSpan={5} className="px-6 py-8 bg-white/5"></td>
                </tr>
              ))
            ) : filteredReports.length === 0 ? (
              <tr>
                <td colSpan={5} className="px-6 py-8 text-center text-white/40">
                  No hay reportes que coincidan con los filtros actuales.
                </td>
              </tr>
            ) : (
              filteredReports.map((report) => (
                <tr key={report.id} className="hover:bg-white/5 transition-colors group">
                  <td className="px-6 py-4">
                    <div className="flex items-center gap-3">
                      <div className="p-2 rounded-lg bg-white/5 text-white/40 group-hover:text-brand-blue transition-colors">
                        <FileText className="w-5 h-5" />
                      </div>
                      <span className="font-bold text-sm">{report.title}</span>
                    </div>
                  </td>
                  <td className="px-6 py-4 text-sm text-white/60">
                    {getClientLabel(report)}
                  </td>
                  <td className="px-6 py-4">
                    <span className="text-[10px] px-2 py-1 rounded-lg bg-white/10 font-bold uppercase tracking-wider">
                      {report.type}
                    </span>
                  </td>
                  <td className="px-6 py-4 text-sm text-white/40">
                    {new Date(report.created_at).toLocaleDateString('es-ES', {
                      year: 'numeric',
                      month: 'long',
                      day: 'numeric',
                    })}
                  </td>
                  <td className="px-6 py-4">
                    <div className="flex items-center gap-2">
                      <button
                        type="button"
                        onClick={() => setPreviewReportId(report.id)}
                        className="p-2 hover:bg-white/10 rounded-lg transition-colors text-white/40 hover:text-white"
                      >
                        <Eye className="w-4 h-4" />
                      </button>
                      <button
                        type="button"
                        onClick={() => handleDownloadReport(report)}
                        className="p-2 hover:bg-white/10 rounded-lg transition-colors text-white/40 hover:text-white"
                      >
                        <Download className="w-4 h-4" />
                      </button>
                    </div>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </CollapsibleSection>
    </div>
  );
};
