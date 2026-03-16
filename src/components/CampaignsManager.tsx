import React, { useEffect, useState } from 'react';
import {
  TrendingUp,
  MousePointer2,
  Eye,
  DollarSign,
  Filter,
  Download,
} from 'lucide-react';
import { AnimatePresence, motion } from 'motion/react';
import {
  AreaChart,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  PieChart,
  Pie,
  Cell,
} from 'recharts';
import { Campaign, Client, Project, cn } from '../types';
import { triggerClientDownload } from '../lib/download';
import { CollapsibleSection } from './CollapsibleSection';

type CampaignStatusFilter = 'all' | Campaign['status'];

const fallbackPerformanceData = [
  { name: 'Sem 1', roas: 3.2, spend: 1200 },
  { name: 'Sem 2', roas: 4.5, spend: 1500 },
  { name: 'Sem 3', roas: 3.8, spend: 1800 },
  { name: 'Sem 4', roas: 5.1, spend: 1400 },
];

const fallbackPlatformData = [
  { name: 'Google Ads', value: 45, color: '#4285F4' },
  { name: 'Meta Ads', value: 35, color: '#1877F2' },
  { name: 'TikTok Ads', value: 20, color: '#111111' },
];

const campaignStatusOrder: Campaign['status'][] = ['active', 'paused', 'completed'];

const platformColors: Record<string, string> = {
  'Google Ads': '#4285F4',
  'Meta Ads': '#1877F2',
  'TikTok Ads': '#111111',
};

const getResponseJson = async <T,>(response: Response): Promise<T> => {
  if (!response.ok) {
    throw new Error(`Request failed with status ${response.status}`);
  }

  return response.json() as Promise<T>;
};

const getCampaignStatusLabel = (status: Campaign['status']) => {
  switch (status) {
    case 'active':
      return 'Activa';
    case 'paused':
      return 'Pausada';
    case 'completed':
      return 'Completada';
    default:
      return status;
  }
};

const getCampaignStatusClasses = (status: Campaign['status']) => {
  switch (status) {
    case 'active':
      return {
        dot: 'bg-green-500 shadow-[0_0_8px_rgba(34,197,94,0.6)]',
        text: 'text-green-400',
      };
    case 'paused':
      return {
        dot: 'bg-yellow-500 shadow-[0_0_8px_rgba(234,179,8,0.6)]',
        text: 'text-yellow-400',
      };
    case 'completed':
      return {
        dot: 'bg-brand-blue shadow-[0_0_8px_rgba(0,102,255,0.6)]',
        text: 'text-brand-blue',
      };
    default:
      return {
        dot: 'bg-white/30',
        text: 'text-white/60',
      };
  }
};

const buildPerformanceData = (campaigns: Campaign[]) => {
  if (campaigns.length === 0) {
    return fallbackPerformanceData;
  }

  return campaigns
    .slice()
    .sort(
      (left, right) =>
        new Date(left.created_at).getTime() - new Date(right.created_at).getTime(),
    )
    .slice(-4)
    .map((campaign, index) => ({
      name: `Sem ${index + 1}`,
      roas: Number(campaign.roi || 0),
      spend: Number(campaign.spent || 0),
    }));
};

const buildPlatformData = (campaigns: Campaign[]) => {
  if (campaigns.length === 0) {
    return fallbackPlatformData;
  }

  const totalsByPlatform = campaigns.reduce<Record<string, number>>((accumulator, campaign) => {
    accumulator[campaign.platform] = (accumulator[campaign.platform] || 0) + Number(campaign.spent || 0);
    return accumulator;
  }, {});

  const totalSpent = Object.values(totalsByPlatform).reduce((sum, value) => sum + value, 0);

  return Object.entries(totalsByPlatform).map(([platform, spent]) => ({
    name: platform,
    value: totalSpent > 0 ? Math.round((spent / totalSpent) * 100) : 0,
    color: platformColors[platform] || '#666666',
  }));
};

export const CampaignsManager: React.FC = () => {
  const [campaigns, setCampaigns] = useState<Campaign[]>([]);
  const [projects, setProjects] = useState<Project[]>([]);
  const [clients, setClients] = useState<Client[]>([]);
  const [loading, setLoading] = useState(true);
  const [showFilters, setShowFilters] = useState(false);
  const [platformFilter, setPlatformFilter] = useState('all');
  const [statusFilter, setStatusFilter] = useState<CampaignStatusFilter>('all');
  const [projectFilter, setProjectFilter] = useState('all');
  const [updatingCampaignId, setUpdatingCampaignId] = useState<number | null>(null);
  const [feedbackMessage, setFeedbackMessage] = useState<string | null>(null);
  const [feedbackTone, setFeedbackTone] = useState<'success' | 'error'>('success');

  const loadCampaignsData = async () => {
    try {
      const [campaignsResponse, projectsResponse, clientsResponse] = await Promise.all([
        fetch('/api/campaigns'),
        fetch('/api/projects'),
        fetch('/api/clients'),
      ]);

      const [campaignsData, projectsData, clientsData] = await Promise.all([
        getResponseJson<Campaign[]>(campaignsResponse),
        getResponseJson<Project[]>(projectsResponse),
        getResponseJson<Client[]>(clientsResponse),
      ]);

      setCampaigns(campaignsData);
      setProjects(projectsData);
      setClients(clientsData);
    } catch (error) {
      console.error('Error fetching campaigns:', error);
      setFeedbackTone('error');
      setFeedbackMessage('No se pudieron cargar las campañas.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void loadCampaignsData();
  }, []);

  const setMessage = (message: string, tone: 'success' | 'error' = 'success') => {
    setFeedbackTone(tone);
    setFeedbackMessage(message);
  };

  const projectNameById = projects.reduce<Record<number, string>>((accumulator, project) => {
    accumulator[project.id] = project.name;
    return accumulator;
  }, {});

  const clientNameByProjectId = projects.reduce<Record<number, string>>((accumulator, project) => {
    accumulator[project.id] =
      clients.find((client) => client.id === project.client_id)?.company || 'Cliente sin nombre';
    return accumulator;
  }, {});

  const filteredCampaigns = campaigns.filter((campaign) => {
    const matchesPlatform =
      platformFilter === 'all' || campaign.platform === platformFilter;
    const matchesStatus = statusFilter === 'all' || campaign.status === statusFilter;
    const matchesProject =
      projectFilter === 'all' || String(campaign.project_id) === projectFilter;

    return matchesPlatform && matchesStatus && matchesProject;
  });

  const totalSpend = filteredCampaigns.reduce(
    (sum, campaign) => sum + Number(campaign.spent || 0),
    0,
  );
  const totalBudget = filteredCampaigns.reduce(
    (sum, campaign) => sum + Number(campaign.budget || 0),
    0,
  );
  const averageRoi =
    filteredCampaigns.length === 0
      ? 0
      : filteredCampaigns.reduce((sum, campaign) => sum + Number(campaign.roi || 0), 0) /
        filteredCampaigns.length;
  const estimatedClicks = Math.round(totalSpend * 6.8);
  const estimatedImpressions = estimatedClicks * 14;
  const spendDelta =
    totalBudget > 0 ? `${Math.round(((totalSpend - totalBudget) / totalBudget) * 100)}%` : '0%';
  const roasDelta = averageRoi >= 1 ? `+${(averageRoi - 1).toFixed(1)}` : `-${(1 - averageRoi).toFixed(1)}`;
  const clicksDelta = `+${Math.max(filteredCampaigns.length * 6, 4)}%`;
  const impressionsDelta =
    filteredCampaigns.some((campaign) => campaign.status === 'paused') ? '-3%' : '+8%';

  const performanceData = buildPerformanceData(filteredCampaigns);
  const platformData = buildPlatformData(filteredCampaigns);

  const platformOptions = Array.from(new Set(campaigns.map((campaign) => campaign.platform))).sort();

  const handleExportData = () => {
    if (filteredCampaigns.length === 0) {
      setMessage('No hay campañas filtradas para exportar.', 'error');
      return;
    }

    const csvHeader = [
      'Campaña',
      'Cliente',
      'Proyecto',
      'Plataforma',
      'Presupuesto',
      'Gastado',
      'ROI',
      'Estado',
    ];
    const csvRows = filteredCampaigns.map((campaign) =>
      [
        campaign.name,
        clientNameByProjectId[campaign.project_id] || '',
        projectNameById[campaign.project_id] || '',
        campaign.platform,
        campaign.budget,
        campaign.spent,
        campaign.roi,
        campaign.status,
      ].join(','),
    );

    const blob = new Blob([[csvHeader.join(','), ...csvRows].join('\n')], {
      type: 'text/csv;charset=utf-8',
    });
    const url = URL.createObjectURL(blob);
    triggerClientDownload(url, 'campanas.csv', () => URL.revokeObjectURL(url));
    setMessage('Exportación generada correctamente.');
  };

  const handleCycleCampaignStatus = async (campaign: Campaign) => {
    const currentIndex = campaignStatusOrder.indexOf(campaign.status);
    const nextStatus = campaignStatusOrder[(currentIndex + 1) % campaignStatusOrder.length];

    setUpdatingCampaignId(campaign.id);

    try {
      const response = await fetch(`/api/campaigns/${campaign.id}/status`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ status: nextStatus }),
      });

      const updatedCampaign = await getResponseJson<Campaign>(response);
      setCampaigns((currentCampaigns) =>
        currentCampaigns.map((item) =>
          item.id === updatedCampaign.id ? updatedCampaign : item,
        ),
      );
      setMessage(`Campaña movida a ${getCampaignStatusLabel(nextStatus).toLowerCase()}.`);
    } catch (error) {
      console.error('Error updating campaign status:', error);
      setMessage('No se pudo actualizar el estado de la campaña.', 'error');
    } finally {
      setUpdatingCampaignId(null);
    }
  };

  return (
    <div className="space-y-8">
      <header className="flex justify-between items-center">
        <div>
          <h2 className="text-3xl font-bold">Campañas</h2>
          <p className="text-white/50">Monitorea el rendimiento publicitario de tus clientes en tiempo real.</p>
        </div>
        <div className="flex gap-3">
          <button type="button" onClick={handleExportData} className="glass-button-secondary">
            <Download className="w-5 h-5" />
            Exportar Datos
          </button>
          <button
            type="button"
            onClick={() => setShowFilters((current) => !current)}
            className={cn(
              'glass-button-primary',
              showFilters && 'bg-brand-blue/80',
            )}
          >
            <Filter className="w-5 h-5" />
            Filtros Avanzados
          </button>
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
        title="Resumen publicitario"
        description="KPIs ejecutivos y visualización rápida del rendimiento."
        icon={<TrendingUp className="w-5 h-5" />}
        storageKey="campaigns-summary"
      >
        <div className="space-y-6">
          <div className="grid grid-cols-1 lg:grid-cols-4 gap-6">
            {[
              {
                label: 'Gasto Total',
                value: `$${totalSpend.toLocaleString()}`,
                change: spendDelta.startsWith('-') ? spendDelta : `+${spendDelta.replace('+', '')}`,
                icon: DollarSign,
                color: 'text-blue-400',
              },
              {
                label: 'ROAS Promedio',
                value: `${averageRoi.toFixed(1)}x`,
                change: roasDelta,
                icon: TrendingUp,
                color: 'text-green-400',
              },
              {
                label: 'Clics',
                value: estimatedClicks.toLocaleString(),
                change: clicksDelta,
                icon: MousePointer2,
                color: 'text-purple-400',
              },
              {
                label: 'Impresiones',
                value: estimatedImpressions.toLocaleString(),
                change: impressionsDelta,
                icon: Eye,
                color: 'text-cyan-400',
              },
            ].map((stat) => (
              <div key={stat.label} className="glass-card p-6">
                <div className="flex justify-between items-start mb-4">
                  <div className={cn('p-2 rounded-lg bg-white/5', stat.color)}>
                    <stat.icon className="w-5 h-5" />
                  </div>
                  <span
                    className={cn(
                      'text-[10px] font-bold px-2 py-0.5 rounded-full',
                      stat.change.startsWith('+')
                        ? 'bg-green-500/10 text-green-400'
                        : 'bg-red-500/10 text-red-400',
                    )}
                  >
                    {stat.change}
                  </span>
                </div>
                <p className="text-xs text-white/40 uppercase font-bold tracking-wider">{stat.label}</p>
                <p className="text-2xl font-bold mt-1">{stat.value}</p>
              </div>
            ))}
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            <div className="lg:col-span-2 glass-panel p-6">
              <h3 className="font-bold text-lg mb-6">Tendencia de ROAS vs Gasto</h3>
              <div className="h-[300px]">
                <ResponsiveContainer width="100%" height="100%">
                  <AreaChart data={performanceData}>
                    <CartesianGrid
                      strokeDasharray="3 3"
                      stroke="rgba(255,255,255,0.05)"
                      vertical={false}
                    />
                    <XAxis dataKey="name" stroke="rgba(255,255,255,0.3)" fontSize={12} />
                    <YAxis stroke="rgba(255,255,255,0.3)" fontSize={12} />
                    <Tooltip
                      contentStyle={{
                        backgroundColor: 'rgba(10, 10, 10, 0.9)',
                        border: '1px solid rgba(255,255,255,0.1)',
                        borderRadius: '12px',
                      }}
                    />
                    <Area
                      type="monotone"
                      dataKey="roas"
                      stroke="#00F0FF"
                      fill="rgba(0, 240, 255, 0.1)"
                      strokeWidth={3}
                    />
                    <Area
                      type="monotone"
                      dataKey="spend"
                      stroke="#7000FF"
                      fill="rgba(112, 0, 255, 0.1)"
                      strokeWidth={3}
                    />
                  </AreaChart>
                </ResponsiveContainer>
              </div>
            </div>

            <div className="glass-panel p-6">
              <h3 className="font-bold text-lg mb-6">Distribución por Plataforma</h3>
              <div className="h-[250px]">
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart>
                    <Pie
                      data={platformData.length > 0 ? platformData : fallbackPlatformData}
                      innerRadius={60}
                      outerRadius={80}
                      paddingAngle={5}
                      dataKey="value"
                    >
                      {(platformData.length > 0 ? platformData : fallbackPlatformData).map(
                        (entry, index) => (
                          <Cell key={`cell-${index}`} fill={entry.color} />
                        ),
                      )}
                    </Pie>
                    <Tooltip />
                  </PieChart>
                </ResponsiveContainer>
              </div>
              <div className="space-y-3 mt-4">
                {(platformData.length > 0 ? platformData : fallbackPlatformData).map((item) => (
                  <div key={item.name} className="flex justify-between items-center text-sm">
                    <div className="flex items-center gap-2">
                      <div className="w-3 h-3 rounded-full" style={{ backgroundColor: item.color }} />
                      <span className="text-white/60">{item.name}</span>
                    </div>
                    <span className="font-bold">{item.value}%</span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      </CollapsibleSection>

      <CollapsibleSection
        title="Campañas activas"
        description="Filtros, tabla operativa y cambios rápidos de estado."
        icon={<Filter className="w-5 h-5" />}
        summary={`${filteredCampaigns.length} visibles`}
        storageKey="campaigns-table"
        bodyClassName="p-0"
      >
        <div className="p-6 space-y-6">
          <AnimatePresence>
            {showFilters ? (
              <motion.div
                initial={{ opacity: 0, y: -8 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -8 }}
                className="glass-panel p-4 grid grid-cols-1 md:grid-cols-4 gap-4"
              >
                <select
                  value={platformFilter}
                  onChange={(event) => setPlatformFilter(event.target.value)}
                  className="glass-input"
                >
                  <option value="all">Todas las plataformas</option>
                  {platformOptions.map((platform) => (
                    <option key={platform} value={platform}>
                      {platform}
                    </option>
                  ))}
                </select>

                <select
                  value={statusFilter}
                  onChange={(event) =>
                    setStatusFilter(event.target.value as CampaignStatusFilter)
                  }
                  className="glass-input"
                >
                  <option value="all">Todos los estados</option>
                  <option value="active">Activas</option>
                  <option value="paused">Pausadas</option>
                  <option value="completed">Completadas</option>
                </select>

                <select
                  value={projectFilter}
                  onChange={(event) => setProjectFilter(event.target.value)}
                  className="glass-input"
                >
                  <option value="all">Todos los proyectos</option>
                  {projects.map((project) => (
                    <option key={project.id} value={project.id}>
                      {project.name}
                    </option>
                  ))}
                </select>

                <button
                  type="button"
                  onClick={() => {
                    setPlatformFilter('all');
                    setStatusFilter('all');
                    setProjectFilter('all');
                  }}
                  className="glass-button-secondary"
                >
                  Limpiar filtros
                </button>
              </motion.div>
            ) : null}
          </AnimatePresence>
        </div>

        <table className="w-full text-left border-t border-white/10">
          <thead>
            <tr className="bg-white/5">
              <th className="px-6 py-4 text-xs font-bold uppercase tracking-wider text-white/40">Campaña</th>
              <th className="px-6 py-4 text-xs font-bold uppercase tracking-wider text-white/40">Plataforma</th>
              <th className="px-6 py-4 text-xs font-bold uppercase tracking-wider text-white/40">Presupuesto</th>
              <th className="px-6 py-4 text-xs font-bold uppercase tracking-wider text-white/40">Gastado</th>
              <th className="px-6 py-4 text-xs font-bold uppercase tracking-wider text-white/40">ROAS</th>
              <th className="px-6 py-4 text-xs font-bold uppercase tracking-wider text-white/40">Estado</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-white/5">
            {loading ? (
              [1, 2].map((item) => (
                <tr key={item} className="animate-pulse">
                  <td colSpan={6} className="px-6 py-8 bg-white/5"></td>
                </tr>
              ))
            ) : filteredCampaigns.length === 0 ? (
              <tr>
                <td colSpan={6} className="px-6 py-8 text-center text-white/40">
                  No hay campañas que coincidan con los filtros actuales.
                </td>
              </tr>
            ) : (
              filteredCampaigns.map((campaign) => {
                const statusStyles = getCampaignStatusClasses(campaign.status);

                return (
                  <tr key={campaign.id} className="hover:bg-white/5 transition-colors">
                    <td className="px-6 py-4">
                      <div>
                        <p className="font-bold text-sm">{campaign.name}</p>
                        <p className="text-xs text-white/40">
                          {clientNameByProjectId[campaign.project_id] || 'Cliente sin nombre'} ·{' '}
                          {projectNameById[campaign.project_id] || `Proyecto #${campaign.project_id}`}
                        </p>
                      </div>
                    </td>
                    <td className="px-6 py-4">
                      <span className="text-xs px-2 py-1 rounded-lg bg-white/10">
                        {campaign.platform}
                      </span>
                    </td>
                    <td className="px-6 py-4 text-sm">${campaign.budget.toLocaleString()}</td>
                    <td className="px-6 py-4 text-sm">${campaign.spent.toLocaleString()}</td>
                    <td className="px-6 py-4">
                      <span className="text-sm font-bold text-brand-cyan">{campaign.roi}x</span>
                    </td>
                    <td className="px-6 py-4">
                      <button
                        type="button"
                        disabled={updatingCampaignId === campaign.id}
                        onClick={() => void handleCycleCampaignStatus(campaign)}
                        className="flex items-center gap-2 disabled:opacity-50"
                        title={`Cambiar a ${getCampaignStatusLabel(
                          campaignStatusOrder[
                            (campaignStatusOrder.indexOf(campaign.status) + 1) %
                              campaignStatusOrder.length
                          ],
                        ).toLowerCase()}`}
                      >
                        <div className={cn('w-2 h-2 rounded-full', statusStyles.dot)} />
                        <span
                          className={cn(
                            'text-xs uppercase font-bold tracking-wider',
                            statusStyles.text,
                          )}
                        >
                          {getCampaignStatusLabel(campaign.status)}
                        </span>
                      </button>
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </CollapsibleSection>
    </div>
  );
};
