import React, { useEffect, useRef, useState } from 'react';
import { motion } from 'motion/react';
import {
  Activity,
  Users,
  UserCheck,
  Briefcase,
  TrendingUp,
  ArrowUpRight,
  ArrowDownRight,
  Calendar,
  Clock,
  Bell,
  ShieldCheck,
  Settings,
  LogOut,
  UserPlus,
  ClipboardList,
  AlertTriangle,
  Bot,
  Workflow,
  Sparkles,
  Gift,
  DollarSign,
  FileText,
} from 'lucide-react';
import {
  AreaChart,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  BarChart,
  Bar,
  Cell,
} from 'recharts';
import {
  AdminOverview,
  AppNotification,
  CalendarEvent,
  Campaign,
  Client,
  ClientReferralPortal,
  cn,
  ContractsOverview,
  DashboardStats,
  FreelancerReferralPortal,
  FreelancerTasksPortal,
  FreelancerWorkspacePortal,
  Integration,
  Invoice,
  Lead,
  PartnerReferralOverview,
  Project,
  Report,
  ReferralOverview,
  Task,
  TeamMember,
} from '../types';
import { AppSection, getRoleKey } from '../permissions';
import {
  saveAIAutomationRunFilterPreset,
  type AIAutomationRunFilterPreset,
} from '../lib/aiRunFilters';
import { CollapsibleSection } from './CollapsibleSection';

type DashboardRange = '7d' | '30d';

interface DashboardProps {
  stats: DashboardStats | null;
  onNavigate: (tab: string) => void;
  onRefreshStats: () => Promise<void>;
  accessibleSections: AppSection[];
  currentUserName: string;
  currentUserRole: string;
}

interface StatCardProps {
  title: string;
  value: string | number;
  change: string;
  isPositive: boolean;
  icon: React.ElementType;
  color: string;
  onClick: () => void;
}

interface ActivityItem {
  id: string;
  title: string;
  subtitle: string;
  tab: string;
  timestamp: number;
}

interface AdminMetricCardProps {
  title: string;
  value: string | number;
  hint: string;
  icon: React.ElementType;
  color: string;
  onClick: () => void;
}

type DisabledAITrigger = AdminOverview['ai']['disabled_triggers'][number];

const featuredIntegrationOrder: Integration['key'][] = [
  'google_calendar',
  'calendly',
  'google_ads',
  'meta_ads',
  'instagram',
  'tiktok_ads',
  'n8n',
  'make',
  'zapier',
  'slack',
  'gmail',
  'landing_pages',
  'external_crm',
  'hubspot',
];

const pipelineColors = {
  nuevos: '#0066FF',
  contactados: '#7000FF',
  reunion: '#00F0FF',
  propuesta: '#FF00E5',
  cerrados: '#00FF66',
};

const adminPipelineColors = {
  nuevos: '#0066FF',
  contactados: '#4F7CFF',
  reunion: '#00C8FF',
  diagnostico: '#00F0FF',
  propuesta: '#7C4DFF',
  negociacion: '#FF00E5',
  cerrados: '#00FF66',
  perdidos: '#FF5C7A',
};

const fallbackTrendWeights = {
  '7d': [0.11, 0.13, 0.1, 0.15, 0.14, 0.17, 0.2],
  '30d': [0.14, 0.18, 0.21, 0.19, 0.28],
};

const fallbackActivity: ActivityItem[] = [
  {
    id: 'fallback-lead',
    title: 'Nuevo lead registrado: Tech Solutions Inc.',
    subtitle: 'Hace 15 minutos • Captado desde IA',
    tab: 'leads',
    timestamp: Date.now(),
  },
  {
    id: 'fallback-client',
    title: 'Cliente activado: FashionHub',
    subtitle: 'Hace 1 hora • Industria retail',
    tab: 'clients',
    timestamp: Date.now() - 3_600_000,
  },
  {
    id: 'fallback-project',
    title: 'Proyecto creado: SEO Optimization Q1',
    subtitle: 'Hace 3 horas • Estado execution',
    tab: 'projects',
    timestamp: Date.now() - 10_800_000,
  },
  {
    id: 'fallback-campaign',
    title: 'Campaña actualizada: Google Search Ads - Tech',
    subtitle: 'Ayer • Plataforma Google Ads',
    tab: 'campaigns',
    timestamp: Date.now() - 86_400_000,
  },
];

const getResponseJson = async <T,>(response: Response): Promise<T> => {
  if (!response.ok) {
    throw new Error(`Request failed with status ${response.status}`);
  }

  return response.json() as Promise<T>;
};

const normalizeLabel = (label: string) => {
  const cleaned = label.replace('.', '');
  return cleaned.charAt(0).toUpperCase() + cleaned.slice(1);
};

const createBuckets = (range: DashboardRange) => {
  const now = new Date();
  const bucketCount = range === '7d' ? 7 : 5;
  const spanDays = range === '7d' ? 1 : 6;

  return Array.from({ length: bucketCount }, (_, index) => {
    const start = new Date(now);
    start.setDate(
      now.getDate() - (((bucketCount - 1 - index) * spanDays) + (spanDays - 1)),
    );
    start.setHours(0, 0, 0, 0);

    const end = new Date(start);
    end.setDate(start.getDate() + spanDays);

    return {
      label:
        range === '7d'
          ? normalizeLabel(start.toLocaleDateString('es-ES', { weekday: 'short' }))
          : normalizeLabel(
              start.toLocaleDateString('es-ES', { day: '2-digit', month: 'short' }),
            ),
      start,
      end,
      revenue: 0,
    };
  });
};

const buildRevenueTrend = (
  range: DashboardRange,
  totalRevenue: number,
  leads: Lead[],
  campaigns: Campaign[],
) => {
  const buckets = createBuckets(range);

  const assignRevenue = (dateString: string, amount: number) => {
    if (!dateString || amount <= 0) {
      return;
    }

    const createdAt = new Date(dateString);
    const bucket = buckets.find(
      (entry) => createdAt >= entry.start && createdAt < entry.end,
    );

    if (bucket) {
      bucket.revenue += amount;
    }
  };

  leads.forEach((lead) => {
    if (lead.status === 'closed') {
      assignRevenue(lead.created_at, Number(lead.budget) || 0);
    }
  });

  campaigns.forEach((campaign) => {
    const estimatedRevenue = Number(campaign.spent || 0) * Math.max(Number(campaign.roi || 0), 1);
    assignRevenue(campaign.created_at, estimatedRevenue);
  });

  const totalDerivedRevenue = buckets.reduce((sum, bucket) => sum + bucket.revenue, 0);
  const nonZeroBuckets = buckets.filter((bucket) => bucket.revenue > 0).length;

  if (totalDerivedRevenue > 0 && totalRevenue > 0 && nonZeroBuckets >= 2) {
    return buckets.map((bucket) => ({
      name: bucket.label,
      revenue: Math.round((bucket.revenue / totalDerivedRevenue) * totalRevenue),
    }));
  }

  if (totalRevenue > 0) {
    const weights = fallbackTrendWeights[range];

    return buckets.map((bucket, index) => ({
      name: bucket.label,
      revenue: Math.round(totalRevenue * weights[index]),
    }));
  }

  return buckets.map((bucket) => ({
    name: bucket.label,
    revenue: Math.round(bucket.revenue),
  }));
};

const buildInvoiceRevenueTrend = (
  range: DashboardRange,
  invoices: Invoice[],
  fallbackTotalRevenue: number,
  leads: Lead[],
  campaigns: Campaign[],
) => {
  const paidInvoices = invoices.filter((invoice) => invoice.status === 'paid');

  if (paidInvoices.length === 0) {
    return buildRevenueTrend(range, fallbackTotalRevenue, leads, campaigns);
  }

  const buckets = createBuckets(range);

  paidInvoices.forEach((invoice) => {
    const referenceDate = invoice.due_date || invoice.created_at;
    const paidAt = new Date(referenceDate);

    if (Number.isNaN(paidAt.getTime())) {
      return;
    }

    const bucket = buckets.find((entry) => paidAt >= entry.start && paidAt < entry.end);

    if (bucket) {
      bucket.revenue += Number(invoice.amount || 0);
    }
  });

  const hasValues = buckets.some((bucket) => bucket.revenue > 0);

  if (!hasValues) {
    return buildRevenueTrend(range, fallbackTotalRevenue, leads, campaigns);
  }

  return buckets.map((bucket) => ({
    name: bucket.label,
    revenue: Math.round(bucket.revenue),
  }));
};

const formatCurrency = (value: number) =>
  `€${Math.round(value || 0).toLocaleString('es-ES')}`;

const isDateInCurrentMonth = (value?: string | null) => {
  if (!value) {
    return false;
  }

  const parsedDate = new Date(value);
  const now = new Date();

  return (
    !Number.isNaN(parsedDate.getTime()) &&
    parsedDate.getMonth() === now.getMonth() &&
    parsedDate.getFullYear() === now.getFullYear()
  );
};

const isPastDueDate = (value?: string | null) => {
  if (!value) {
    return false;
  }

  const parsedDate = new Date(value);

  if (Number.isNaN(parsedDate.getTime())) {
    return false;
  }

  const today = new Date();
  today.setHours(0, 0, 0, 0);
  parsedDate.setHours(0, 0, 0, 0);

  return parsedDate < today;
};

const formatRelativeTime = (dateString: string) => {
  const timestamp = new Date(dateString).getTime();

  if (Number.isNaN(timestamp)) {
    return 'Reciente';
  }

  const elapsedMinutes = Math.round((timestamp - Date.now()) / 60_000);
  const formatter = new Intl.RelativeTimeFormat('es', { numeric: 'auto' });

  if (Math.abs(elapsedMinutes) < 60) {
    return formatter.format(elapsedMinutes, 'minute');
  }

  const elapsedHours = Math.round(elapsedMinutes / 60);
  if (Math.abs(elapsedHours) < 24) {
    return formatter.format(elapsedHours, 'hour');
  }

  const elapsedDays = Math.round(elapsedHours / 24);
  return formatter.format(elapsedDays, 'day');
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

const getTeamMemberStatusLabel = (status: TeamMember['status']) => {
  switch (status) {
    case 'online':
      return 'Disponible';
    case 'meeting':
      return 'En reunión';
    case 'offline':
    default:
      return 'Offline';
  }
};

const getTeamMemberStatusClass = (status: TeamMember['status']) => {
  switch (status) {
    case 'online':
      return 'bg-emerald-500/10 text-emerald-300 border-emerald-500/20';
    case 'meeting':
      return 'bg-amber-500/10 text-amber-300 border-amber-500/20';
    case 'offline':
    default:
      return 'bg-white/10 text-white/60 border-white/10';
  }
};

const getPriorityClass = (priority: Task['priority']) => {
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

const formatShortDateTime = (value?: string | null) => {
  if (!value) {
    return 'Sin fecha';
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

const getAuditActionBadgeClass = (action: string) => {
  if (action.startsWith('auth.') || action.startsWith('admin.')) {
    return 'bg-blue-500/10 text-blue-300 border-blue-500/20';
  }

  if (action.startsWith('ai.')) {
    return 'bg-fuchsia-500/10 text-fuchsia-300 border-fuchsia-500/20';
  }

  if (action.startsWith('team.')) {
    return 'bg-cyan-500/10 text-cyan-300 border-cyan-500/20';
  }

  if (action.startsWith('client.') || action.startsWith('lead.')) {
    return 'bg-emerald-500/10 text-emerald-300 border-emerald-500/20';
  }

  if (action.startsWith('settings.')) {
    return 'bg-amber-500/10 text-amber-300 border-amber-500/20';
  }

  return 'bg-white/10 text-white/60 border-white/10';
};

const getAdminAutomationLabel = (automation: AdminOverview['ai']['top_automations'][number]['automation']) => {
  switch (automation) {
    case 'lead_followup':
      return 'Seguimiento de Lead';
    case 'client_report':
      return 'Reporte de Cliente';
    case 'project_tasks':
      return 'Tareas de Proyecto';
    default:
      return automation;
  }
};

const getAdminTriggerLabel = (trigger: AdminOverview['ai']['top_triggers'][number]['trigger_key']) => {
  switch (trigger) {
    case 'ai_trigger_new_lead':
      return 'Nuevo lead';
    case 'ai_trigger_client_report':
      return 'Conversión a cliente';
    case 'ai_trigger_project_task_pack':
      return 'Nuevo proyecto';
    default:
      return trigger;
  }
};

const getAdminAIAlertClass = (severity: AdminOverview['ai']['alerts'][number]['severity']) =>
  severity === 'critical'
    ? 'bg-red-500/10 text-red-300 border-red-500/20'
    : 'bg-yellow-500/10 text-yellow-300 border-yellow-500/20';

const getDisabledSinceLabel = (value?: string | null) => {
  if (!value) {
    return 'Tiempo desactivado no disponible';
  }

  return `Apagado ${formatRelativeTime(value)}`;
};

const getDisabledTriggerRecoveryLabel = (item: DisabledAITrigger) => {
  const parts: string[] = [];

  if (item.consecutive_error_streak > 0) {
    parts.push(
      `Racha: ${item.consecutive_error_streak} ${
        item.consecutive_error_streak === 1 ? 'fallo consecutivo' : 'fallos consecutivos'
      }`,
    );
  }

  if (item.last_error_at) {
    parts.push(`ultimo fallo ${formatRelativeTime(item.last_error_at)}`);
  }

  if (item.last_success_at) {
    parts.push(`ultimo exito ${formatRelativeTime(item.last_success_at)}`);
  }

  if (parts.length === 0) {
    return 'Sin historial de ejecuciones registrado';
  }

  return parts.join(' · ');
};

const getIntegrationStatusClass = (status: Integration['status']) => {
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

const getIntegrationStatusLabel = (status: Integration['status']) => {
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

const getIntegrationModeLabel = (mode: Integration['connection_mode']) => {
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

const getFreelancerProjectStatusLabel = (status: string) => {
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

const getFreelancerTaskStatusLabel = (status: string) => {
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

const getNotificationSeverityClass = (severity: AppNotification['severity']) => {
  switch (severity) {
    case 'critical':
      return 'bg-red-500/10 text-red-300 border-red-500/20';
    case 'warning':
      return 'bg-amber-500/10 text-amber-300 border-amber-500/20';
    case 'success':
      return 'bg-emerald-500/10 text-emerald-300 border-emerald-500/20';
    case 'info':
    default:
      return 'bg-blue-500/10 text-blue-300 border-blue-500/20';
  }
};

const getCalendarEventKindLabel = (eventKind: CalendarEvent['event_kind']) => {
  switch (eventKind) {
    case 'deadline':
      return 'Deadline';
    case 'followup':
      return 'Seguimiento';
    case 'launch':
      return 'Launch';
    case 'meeting':
    default:
      return 'Reunión';
  }
};

const getCalendarEventStatusClass = (status: CalendarEvent['status']) => {
  switch (status) {
    case 'completed':
      return 'bg-emerald-500/10 text-emerald-300 border-emerald-500/20';
    case 'cancelled':
      return 'bg-white/10 text-white/55 border-white/10';
    case 'scheduled':
    default:
      return 'bg-brand-blue/10 text-brand-cyan border-brand-cyan/20';
  }
};

const formatCalendarRange = (startAt: string, endAt?: string | null) => {
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

const integrationHasConnectionData = (integration: Integration) =>
  Boolean(
    (integration.endpoint_url && integration.endpoint_url.trim()) ||
      (integration.api_key && integration.api_key.trim()) ||
      (integration.access_token && integration.access_token.trim()) ||
      (integration.email && integration.email.trim()) ||
      (integration.account_id && integration.account_id.trim()) ||
      integration.webhook_path,
  );

const StatCard: React.FC<StatCardProps> = ({
  title,
  value,
  change,
  isPositive,
  icon: Icon,
  color,
  onClick,
}) => (
  <motion.button
    type="button"
    initial={{ opacity: 0, y: 20 }}
    animate={{ opacity: 1, y: 0 }}
    onClick={onClick}
    className="glass-card h-full w-full min-w-0 overflow-hidden p-6 text-left"
  >
    <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
      <div className={cn('p-3 rounded-xl', color)}>
        <Icon className="w-6 h-6 text-white" />
      </div>
      <div
        className={cn(
          'shrink-0 rounded-full px-2 py-1 text-xs font-medium',
          'flex items-center gap-1',
          isPositive ? 'bg-green-500/10 text-green-400' : 'bg-red-500/10 text-red-400',
        )}
      >
        {isPositive ? <ArrowUpRight className="w-3 h-3" /> : <ArrowDownRight className="w-3 h-3" />}
        {change}
      </div>
    </div>
    <h3 className="break-words text-sm font-medium text-white/60">{title}</h3>
    <p className="mt-1 break-words text-2xl font-bold">{value}</p>
  </motion.button>
);

const AdminMetricCard: React.FC<AdminMetricCardProps> = ({
  title,
  value,
  hint,
  icon: Icon,
  color,
  onClick,
}) => (
  <button
    type="button"
    onClick={onClick}
    className="glass-card flex h-full min-h-[118px] min-w-0 flex-col justify-between gap-3 p-4 text-left transition-colors hover:bg-white/8"
  >
    <div className="flex items-start justify-between gap-3">
      <div className={cn('rounded-xl p-2', color)}>
        <Icon className="h-4 w-4 text-white" />
      </div>
      <ArrowUpRight className="h-3 w-3 text-white/25" />
    </div>
    <div className="space-y-1">
      <p className="text-[10px] font-bold uppercase tracking-[0.18em] text-white/35">{title}</p>
      <p className="break-words text-[1.55rem] font-bold leading-none">{value}</p>
      <p className="text-xs leading-snug text-white/45">{hint}</p>
    </div>
  </button>
);

export const Dashboard: React.FC<DashboardProps> = ({
  stats,
  onNavigate,
  onRefreshStats,
  accessibleSections,
  currentUserName,
  currentUserRole,
}) => {
  const [range, setRange] = useState<DashboardRange>('7d');
  const [leads, setLeads] = useState<Lead[]>([]);
  const [clients, setClients] = useState<Client[]>([]);
  const [projects, setProjects] = useState<Project[]>([]);
  const [reports, setReports] = useState<Report[]>([]);
  const [tasks, setTasks] = useState<Task[]>([]);
  const [campaigns, setCampaigns] = useState<Campaign[]>([]);
  const [invoices, setInvoices] = useState<Invoice[]>([]);
  const [teamMembers, setTeamMembers] = useState<TeamMember[]>([]);
  const [integrations, setIntegrations] = useState<Integration[]>([]);
  const [notifications, setNotifications] = useState<AppNotification[]>([]);
  const [calendarEvents, setCalendarEvents] = useState<CalendarEvent[]>([]);
  const [adminOverview, setAdminOverview] = useState<AdminOverview | null>(null);
  const [referralOverview, setReferralOverview] = useState<ReferralOverview | null>(null);
  const [partnerReferralOverview, setPartnerReferralOverview] =
    useState<PartnerReferralOverview | null>(null);
  const [clientReferralPortal, setClientReferralPortal] = useState<ClientReferralPortal | null>(
    null,
  );
  const [freelancerReferralPortal, setFreelancerReferralPortal] =
    useState<FreelancerReferralPortal | null>(null);
  const [freelancerWorkspacePortal, setFreelancerWorkspacePortal] =
    useState<FreelancerWorkspacePortal | null>(null);
  const [freelancerTasksPortal, setFreelancerTasksPortal] =
    useState<FreelancerTasksPortal | null>(null);
  const [contractsOverview, setContractsOverview] = useState<ContractsOverview | null>(null);
  const [adminLoading, setAdminLoading] = useState(false);
  const [integrationsLoading, setIntegrationsLoading] = useState(false);
  const [integrationActionId, setIntegrationActionId] = useState<number | null>(null);
  const [integrationMessage, setIntegrationMessage] = useState<string | null>(null);
  const [integrationMessageTone, setIntegrationMessageTone] = useState<'success' | 'error'>(
    'success',
  );
  const [revokingSessionId, setRevokingSessionId] = useState<number | null>(null);
  const [disablingTriggerKey, setDisablingTriggerKey] = useState<string | null>(null);
  const [enablingTriggerKey, setEnablingTriggerKey] = useState<string | null>(null);
  const [confirmEnableTriggerKey, setConfirmEnableTriggerKey] = useState<string | null>(null);
  const [confirmBulkEnable, setConfirmBulkEnable] = useState(false);
  const [enablingAllTriggers, setEnablingAllTriggers] = useState(false);
  const [adminMessage, setAdminMessage] = useState<string | null>(null);
  const [adminMessageTone, setAdminMessageTone] = useState<'success' | 'error'>('success');
  const [currentTime, setCurrentTime] = useState(() =>
    new Date().toLocaleTimeString('es-ES', {
      hour: '2-digit',
      minute: '2-digit',
    }),
  );
  const [updatingTaskId, setUpdatingTaskId] = useState<number | null>(null);
  const [updatingCalendarEventId, setUpdatingCalendarEventId] = useState<number | null>(null);
  const [markingNotificationId, setMarkingNotificationId] = useState<number | null>(null);
  const [markingAllNotifications, setMarkingAllNotifications] = useState(false);
  const [showNotificationsPanel, setShowNotificationsPanel] = useState(false);
  const [showCalendarPanel, setShowCalendarPanel] = useState(false);

  const activityRef = useRef<HTMLDivElement | null>(null);
  const tasksRef = useRef<HTMLDivElement | null>(null);
  const canAccessLeads = accessibleSections.includes('leads');
  const canAccessClients = accessibleSections.includes('clients');
  const canAccessProjects = accessibleSections.includes('projects');
  const canAccessTasks = accessibleSections.includes('tasks');
  const canAccessCampaigns = accessibleSections.includes('campaigns');
  const canAccessBilling = accessibleSections.includes('billing');
  const canAccessTeam = accessibleSections.includes('team');
  const canAccessReferrals = accessibleSections.includes('referrals');
  const canAccessClientReferrals = accessibleSections.includes('client_referrals');
  const canAccessFreelancerReferrals = accessibleSections.includes('freelancer_referrals');
  const canAccessContracts = accessibleSections.includes('contracts');
  const canAccessReports = accessibleSections.includes('reports');
  const canAccessIntegrations = accessibleSections.includes('integrations');
  const canAccessSettings = accessibleSections.includes('settings');
  const isClientPortalUser = getRoleKey(currentUserRole) === 'client';
  const isFreelancerPortalUser = getRoleKey(currentUserRole) === 'freelancer';
  const isExternalPortalUser = isClientPortalUser || isFreelancerPortalUser;

  const loadSectionData = async <T,>(enabled: boolean, url: string): Promise<T> => {
    if (!enabled) {
      return [] as T;
    }

    const response = await fetch(url);

    if (response.status === 401 || response.status === 403) {
      return [] as T;
    }

    return getResponseJson<T>(response);
  };

  const loadOperationalInbox = async () => {
    if (isExternalPortalUser) {
      setNotifications([]);
      setCalendarEvents([]);
      return;
    }

    const [notificationsData, calendarEventsData] = await Promise.all([
      loadSectionData<AppNotification[]>(true, '/api/notifications?limit=8'),
      loadSectionData<CalendarEvent[]>(true, '/api/calendar-events?limit=8'),
    ]);

    setNotifications(notificationsData);
    setCalendarEvents(calendarEventsData);
  };

  const loadAdminOverview = async () => {
    if (!canAccessSettings) {
      setAdminOverview(null);
      return;
    }

    setAdminLoading(true);

    try {
      const response = await fetch('/api/admin/overview');

      if (response.status === 401 || response.status === 403) {
        setAdminOverview(null);
        return;
      }

      const data = await getResponseJson<AdminOverview>(response);
      setAdminOverview(data);
    } catch (error) {
      console.error('Error fetching admin overview:', error);
      setAdminMessageTone('error');
      setAdminMessage('No se pudo cargar el panel total de administrador.');
    } finally {
      setAdminLoading(false);
    }
  };

  const loadIntegrations = async () => {
    if (!canAccessIntegrations) {
      setIntegrations([]);
      return;
    }

    setIntegrationsLoading(true);

    try {
      const response = await fetch('/api/integrations');

      if (response.status === 401 || response.status === 403) {
        setIntegrations([]);
        return;
      }

      const data = await getResponseJson<Integration[]>(response);
      setIntegrations(data);
    } catch (error) {
      console.error('Error fetching integrations:', error);
      setIntegrationMessageTone('error');
      setIntegrationMessage('No se pudo cargar el panel de integraciones.');
    } finally {
      setIntegrationsLoading(false);
    }
  };

  const loadDashboardData = async () => {
    try {
      const [
        leadsData,
        clientsData,
        projectsData,
        reportsData,
        tasksData,
        campaignsData,
        referralOverviewData,
        partnerReferralOverviewData,
        clientReferralPortalData,
        freelancerReferralPortalData,
        freelancerWorkspacePortalData,
        freelancerTasksPortalData,
        contractsOverviewData,
        invoicesData,
        teamMembersData,
        integrationsData,
        notificationsData,
        calendarEventsData,
      ] = await Promise.all([
        loadSectionData<Lead[]>(canAccessLeads, '/api/leads'),
        loadSectionData<Client[]>(canAccessClients, '/api/clients'),
        loadSectionData<Project[]>(canAccessProjects, '/api/projects'),
        loadSectionData<Report[]>(canAccessReports, '/api/reports'),
        loadSectionData<Task[]>(canAccessTasks, '/api/tasks'),
        loadSectionData<Campaign[]>(canAccessCampaigns, '/api/campaigns'),
        canAccessReferrals
          ? fetch('/api/referral-overview').then(async (response) => {
              if (response.status === 401 || response.status === 403) {
                return null;
              }

              return getResponseJson<ReferralOverview>(response);
            })
          : Promise.resolve(null),
        canAccessReferrals
          ? fetch('/api/partner-referral-overview').then(async (response) => {
              if (response.status === 401 || response.status === 403) {
                return null;
              }

              return getResponseJson<PartnerReferralOverview>(response);
            })
          : Promise.resolve(null),
        canAccessClientReferrals
          ? fetch('/api/client-portal/referrals').then(async (response) => {
              if (response.status === 401 || response.status === 403) {
                return null;
              }

              return getResponseJson<ClientReferralPortal>(response);
            })
          : Promise.resolve(null),
        canAccessFreelancerReferrals
          ? fetch('/api/freelancer-portal/referrals').then(async (response) => {
              if (response.status === 401 || response.status === 403) {
                return null;
              }

              return getResponseJson<FreelancerReferralPortal>(response);
            })
          : Promise.resolve(null),
        isFreelancerPortalUser && canAccessProjects
          ? fetch('/api/freelancer-portal/workspace').then(async (response) => {
              if (response.status === 401 || response.status === 403) {
                return null;
              }

              return getResponseJson<FreelancerWorkspacePortal>(response);
            })
          : Promise.resolve(null),
        isFreelancerPortalUser && canAccessTasks
          ? fetch('/api/freelancer-portal/tasks').then(async (response) => {
              if (response.status === 401 || response.status === 403) {
                return null;
              }

              return getResponseJson<FreelancerTasksPortal>(response);
            })
          : Promise.resolve(null),
        canAccessContracts
          ? fetch('/api/contracts/overview').then(async (response) => {
              if (response.status === 401 || response.status === 403) {
                return null;
              }

              return getResponseJson<ContractsOverview>(response);
            })
          : Promise.resolve(null),
        loadSectionData<Invoice[]>(
          canAccessBilling && !isFreelancerPortalUser,
          '/api/invoices',
        ),
        loadSectionData<TeamMember[]>(
          canAccessTeam && !isExternalPortalUser,
          '/api/team',
        ),
        loadSectionData<Integration[]>(
          canAccessIntegrations && !isExternalPortalUser,
          '/api/integrations',
        ),
        loadSectionData<AppNotification[]>(
          !isExternalPortalUser,
          '/api/notifications?limit=8',
        ),
        loadSectionData<CalendarEvent[]>(
          !isExternalPortalUser,
          '/api/calendar-events?limit=8',
        ),
      ]);

      setLeads(leadsData);
      setClients(clientsData);
      setProjects(projectsData);
      setReports(reportsData);
      setTasks(tasksData);
      setCampaigns(campaignsData);
      setInvoices(invoicesData);
      setTeamMembers(teamMembersData);
      setReferralOverview(referralOverviewData);
      setPartnerReferralOverview(partnerReferralOverviewData);
      setClientReferralPortal(clientReferralPortalData);
      setFreelancerReferralPortal(freelancerReferralPortalData);
      setFreelancerWorkspacePortal(freelancerWorkspacePortalData);
      setFreelancerTasksPortal(freelancerTasksPortalData);
      setContractsOverview(contractsOverviewData);
      setIntegrations(integrationsData);
      setNotifications(notificationsData);
      setCalendarEvents(calendarEventsData);

      if (canAccessSettings && !isExternalPortalUser) {
        await loadAdminOverview();
      } else {
        setAdminOverview(null);
      }
    } catch (error) {
      console.error('Error fetching dashboard data:', error);
    }
  };

  useEffect(() => {
    void loadDashboardData();
  }, [
    canAccessCampaigns,
    canAccessBilling,
    canAccessClients,
    canAccessClientReferrals,
    canAccessContracts,
    canAccessFreelancerReferrals,
    canAccessIntegrations,
    canAccessLeads,
    canAccessProjects,
    canAccessReports,
    canAccessReferrals,
    canAccessSettings,
    canAccessTeam,
    canAccessTasks,
    isExternalPortalUser,
    isFreelancerPortalUser,
  ]);

  useEffect(() => {
    const intervalId = window.setInterval(() => {
      setCurrentTime(
        new Date().toLocaleTimeString('es-ES', {
          hour: '2-digit',
          minute: '2-digit',
        }),
      );
    }, 30_000);

    return () => window.clearInterval(intervalId);
  }, []);

  const revenueTrend = buildRevenueTrend(range, stats?.revenue || 0, leads, campaigns);
  const adminRevenueTrend = buildInvoiceRevenueTrend(
    range,
    invoices,
    stats?.revenue || 0,
    leads,
    campaigns,
  );
  const isAdminDashboard = canAccessSettings && !isExternalPortalUser;

  if (isClientPortalUser) {
    const recentReports = reports.slice(0, 5);

    return (
      <div className="mx-auto w-full max-w-[1580px] min-w-0 space-y-10">
        <header className="flex flex-col gap-4 xl:flex-row xl:items-center xl:justify-between">
          <div>
            <h2 className="text-3xl font-bold">Bienvenido, {currentUserName.split(' ')[0]}</h2>
            <p className="text-white/50">Aquí tienes el resumen de tu espacio cliente.</p>
          </div>
          <div className="glass-panel flex items-center gap-3 px-4 py-2">
            <Clock className="w-4 h-4 text-brand-cyan" />
            <span className="text-sm font-medium">{currentTime}</span>
          </div>
        </header>

        <CollapsibleSection
          title="Resumen de cliente"
          description="Accesos directos a reportes, contratos, facturación y onboarding compartidos contigo."
          summary="Vista principal"
          storageKey="dashboard-client-summary"
          defaultOpen
        >
          <div className="grid grid-cols-1 gap-8 md:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-5">
            <StatCard
              title="Reportes Disponibles"
              value={reports.length}
              change="Compartidos contigo"
              isPositive={true}
              icon={FileText}
              color="bg-brand-blue/20"
              onClick={() => onNavigate('reports')}
            />
            <StatCard
              title="Contratos Visibles"
              value={contractsOverview?.summary.total_contracts || 0}
              change="Compartidos contigo"
              isPositive={true}
              icon={FileText}
              color="bg-brand-purple/20"
              onClick={() => onNavigate('contracts')}
            />
            <StatCard
              title="Facturación Pagada"
              value={`€${(stats?.revenue || 0).toLocaleString()}`}
              change="Histórico asociado"
              isPositive={true}
              icon={DollarSign}
              color="bg-brand-cyan/20"
              onClick={() => onNavigate('billing')}
            />
            <StatCard
              title="Onboarding"
              value="Checklist"
              change="Documentación y entregables"
              isPositive={true}
              icon={ClipboardList}
              color="bg-emerald-500/20"
              onClick={() => onNavigate('onboarding')}
            />
            {canAccessClientReferrals ? (
              <StatCard
                title="Referidos"
                value={clientReferralPortal?.summary.total_referrals || 0}
                change={`${clientReferralPortal?.summary.paid_commissions || 0}€ pagados`}
                isPositive={true}
                icon={Gift}
                color="bg-amber-500/20"
                onClick={() => onNavigate('client_referrals')}
              />
            ) : null}
          </div>
        </CollapsibleSection>

        <CollapsibleSection
          title="Accesos rápidos"
          description="Tu espacio está organizado para revisar contratos, facturación, onboarding y reportes sin ruido interno."
          icon={<ArrowUpRight className="w-5 h-5" />}
          summary="Modo cliente"
          storageKey="dashboard-client-shortcuts"
        >
          <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-5">
            {[
              {
                title: 'Contratos',
                description: 'Acuerdos, alcance y estados de firma',
                tab: 'contracts',
              },
              {
                title: 'Facturación',
                description: 'Facturas, vencimientos y descargas',
                tab: 'billing',
              },
              {
                title: 'Onboarding',
                description: 'Checklist y documentación pendiente',
                tab: 'onboarding',
              },
              {
                title: 'Reportes',
                description: 'Informes compartidos por la agencia',
                tab: 'reports',
              },
              ...(canAccessSettings
                ? [
                    {
                      title: 'Cuenta',
                      description: 'Contraseña, 2FA y sesiones activas de tu acceso',
                      tab: 'settings',
                    },
                  ]
                : []),
              ...(canAccessClientReferrals
                ? [
                    {
                      title: 'Referidos',
                      description: 'Base, enlaces activos y ganancias del programa',
                      tab: 'client_referrals',
                    },
                  ]
                : []),
            ].map((item) => (
              <button
                key={item.tab}
                type="button"
                onClick={() => onNavigate(item.tab)}
                className="rounded-2xl border border-white/10 bg-white/5 p-5 text-left hover:bg-white/8 transition-colors"
              >
                <p className="font-semibold">{item.title}</p>
                <p className="text-sm text-white/45 mt-2">{item.description}</p>
              </button>
            ))}
          </div>
        </CollapsibleSection>

        <CollapsibleSection
          title="Centro de reportes"
          description="Consulta los informes que tu agencia ha compartido contigo desde un espacio limpio y acotado."
          icon={<FileText className="w-5 h-5" />}
          storageKey="dashboard-client-reports"
          actions={
            <button
              type="button"
              onClick={() => onNavigate('reports')}
              className="glass-button-secondary"
            >
              <ArrowUpRight className="w-4 h-4" />
              Abrir Reportes
            </button>
          }
        >
          {recentReports.length > 0 ? (
            <div className="grid grid-cols-1 xl:grid-cols-2 gap-4">
              {recentReports.map((report) => (
                <div key={report.id} className="glass-card p-5 space-y-3">
                  <div className="flex items-center justify-between gap-3">
                    <div>
                      <p className="font-semibold">{report.title}</p>
                      <p className="text-xs text-white/40">
                        {new Date(report.created_at).toLocaleDateString('es-ES', {
                          year: 'numeric',
                          month: 'long',
                          day: 'numeric',
                        })}
                      </p>
                    </div>
                    <span className="text-[10px] px-2 py-1 rounded-lg bg-white/10 font-bold uppercase tracking-wider">
                      {report.type}
                    </span>
                  </div>
                  <p className="text-sm text-white/45">
                    Disponible para consulta y descarga desde tu panel de reportes.
                  </p>
                </div>
              ))}
            </div>
          ) : (
            <div className="glass-card p-5 text-sm text-white/45">
              Aún no hay reportes compartidos para esta cuenta.
            </div>
          )}
        </CollapsibleSection>
      </div>
    );
  }

  if (isFreelancerPortalUser) {
    const recentContracts = contractsOverview?.recent_contracts.slice(0, 5) || [];
    const workspaceClients = freelancerWorkspacePortal?.clients || [];
    const workspaceProjects = freelancerWorkspacePortal?.projects || [];
    const workspaceCampaigns = freelancerWorkspacePortal?.campaigns || [];
    const upcomingTasks = freelancerWorkspacePortal?.upcoming_tasks || [];
    const taskSummary = freelancerTasksPortal?.summary;
    const openTasksCount = Math.max(
      (taskSummary?.total_tasks || 0) - (taskSummary?.completed_tasks || 0),
      0,
    );
    const payoutMethod =
      freelancerReferralPortal?.partner?.payment_method ||
      freelancerReferralPortal?.freelancer.payment_method ||
      'Pendiente';
    const payoutReference =
      freelancerReferralPortal?.partner?.payout_reference ||
      freelancerReferralPortal?.freelancer.payout_reference ||
      'La agencia todavía no ha configurado una referencia de cobro.';
    const quickActions = [
      {
        title: 'Clientes y proyectos',
        description: 'Cartera activa, campañas y visibilidad de lo que tienes asignado',
        tab: 'projects',
      },
      {
        title: 'Tareas',
        description: 'Checklist operativo, prioridades y cambios de estado',
        tab: 'tasks',
      },
      {
        title: 'Contratos',
        description: 'Acuerdos con la agencia, importes y trazabilidad',
        tab: 'contracts',
      },
      {
        title: 'Cobros',
        description: 'Volumen generado, método de cobro y seguimiento de pagos',
        tab: 'billing',
      },
      ...(canAccessSettings
        ? [
            {
              title: 'Cuenta',
              description: 'Contraseña, 2FA y control de sesiones de tu acceso',
              tab: 'settings',
            },
          ]
        : []),
      ...(canAccessFreelancerReferrals
        ? [
            {
              title: 'Referidos',
              description: 'Base atribuida, códigos y comisiones aprobadas o pagadas',
              tab: 'freelancer_referrals',
            },
          ]
        : []),
    ];

    return (
      <div className="mx-auto w-full max-w-[1580px] min-w-0 space-y-10">
        <header className="flex flex-col gap-4 xl:flex-row xl:items-center xl:justify-between">
          <div>
            <h2 className="text-3xl font-bold">Panel freelance, {currentUserName.split(' ')[0]}</h2>
            <p className="text-white/50">
              Revisa clientes, proyectos, tareas, contratos, cobros y cuenta desde tu espacio
              profesional.
            </p>
          </div>
          <div className="glass-panel flex items-center gap-3 px-4 py-2">
            <Clock className="w-4 h-4 text-brand-cyan" />
            <span className="text-sm font-medium">{currentTime}</span>
          </div>
        </header>

        <CollapsibleSection
          title="Resumen freelance"
          description="Vista principal de cartera, carga operativa, cobros y accesos clave del colaborador."
          summary="Vista principal"
          storageKey="dashboard-freelancer-summary"
          defaultOpen
        >
          <div className="grid grid-cols-1 gap-8 md:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-5">
            <StatCard
              title="Clientes activos"
              value={workspaceClients.length}
              change="Cartera asignada"
              isPositive={true}
              icon={Users}
              color="bg-brand-blue/20"
              onClick={() => onNavigate('projects')}
            />
            <StatCard
              title="Proyectos"
              value={workspaceProjects.length}
              change={`${workspaceCampaigns.length} campañas visibles`}
              isPositive={true}
              icon={Briefcase}
              color="bg-amber-500/20"
              onClick={() => onNavigate('projects')}
            />
            <StatCard
              title="Tareas abiertas"
              value={openTasksCount}
              change={`${taskSummary?.due_this_week || 0} vencen esta semana`}
              isPositive={true}
              icon={ClipboardList}
              color="bg-brand-cyan/20"
              onClick={() => onNavigate('tasks')}
            />
            <StatCard
              title="Pendiente de cobro"
              value={`€${(stats?.mrr || 0).toLocaleString()}`}
              change="Contratos y comisiones pendientes"
              isPositive={true}
              icon={DollarSign}
              color="bg-emerald-500/20"
              onClick={() => onNavigate('billing')}
            />
            {canAccessFreelancerReferrals ? (
              <StatCard
                title="Referidos"
                value={freelancerReferralPortal?.summary.total_referrals || 0}
                change={`${freelancerReferralPortal?.summary.active_codes || 0} códigos activos`}
                isPositive={true}
                icon={Gift}
                color="bg-purple-500/20"
                onClick={() => onNavigate('freelancer_referrals')}
              />
            ) : null}
          </div>
        </CollapsibleSection>

        <CollapsibleSection
          title="Accesos rápidos"
          description="Todo tu trabajo se concentra en un flujo claro: clientes, proyectos, tareas, contratos y cobros."
          icon={<ArrowUpRight className="w-5 h-5" />}
          summary="Modo freelance"
          storageKey="dashboard-freelancer-shortcuts"
        >
          <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-5">
            {quickActions.map((item) => (
              <button
                key={item.tab}
                type="button"
                onClick={() => onNavigate(item.tab)}
                className="rounded-2xl border border-white/10 bg-white/5 p-5 text-left hover:bg-white/8 transition-colors"
              >
                <p className="font-semibold">{item.title}</p>
                <p className="text-sm text-white/45 mt-2">{item.description}</p>
              </button>
            ))}
          </div>
        </CollapsibleSection>

        <div className="grid grid-cols-1 xl:grid-cols-[1.08fr_0.92fr] gap-6">
          <CollapsibleSection
            title="Clientes y proyectos activos"
            description="Base operativa con el contexto de cada cuenta y lo que tienes asignado ahora mismo."
            icon={<Briefcase className="w-5 h-5" />}
            summary={`${workspaceProjects.length} proyectos`}
            storageKey="dashboard-freelancer-projects"
            actions={
              <button
                type="button"
                onClick={() => onNavigate('projects')}
                className="glass-button-secondary"
              >
                <ArrowUpRight className="w-4 h-4" />
                Abrir workspace
              </button>
            }
          >
            {workspaceProjects.length === 0 ? (
              <div className="rounded-2xl border border-white/10 bg-white/5 p-6 text-white/45">
                Todavía no tienes proyectos asignados en tu workspace.
              </div>
            ) : (
              <div className="space-y-4">
                {workspaceProjects.slice(0, 4).map((project) => (
                  <button
                    key={project.id}
                    type="button"
                    onClick={() => onNavigate('projects')}
                    className="w-full rounded-2xl border border-white/10 bg-white/5 p-5 text-left hover:bg-white/8 transition-colors"
                  >
                    <div className="flex flex-wrap items-start justify-between gap-3">
                      <div>
                        <p className="font-semibold">{project.name}</p>
                        <p className="text-sm text-white/45 mt-1">
                          {project.client_name}
                          {project.role_label ? ` · ${project.role_label}` : ''}
                        </p>
                      </div>
                      <span className="text-xs uppercase tracking-wider text-brand-cyan font-bold">
                        {getFreelancerProjectStatusLabel(project.status)}
                      </span>
                    </div>

                    <div className="mt-4 grid grid-cols-2 xl:grid-cols-4 gap-3 text-sm">
                      <div className="rounded-xl bg-white/5 px-3 py-3">
                        <p className="text-white/35 text-[11px] uppercase tracking-wider font-bold">
                          Tareas abiertas
                        </p>
                        <p className="font-semibold mt-2">{project.open_tasks}</p>
                      </div>
                      <div className="rounded-xl bg-white/5 px-3 py-3">
                        <p className="text-white/35 text-[11px] uppercase tracking-wider font-bold">
                          Mis tareas
                        </p>
                        <p className="font-semibold mt-2">{project.my_tasks}</p>
                      </div>
                      <div className="rounded-xl bg-white/5 px-3 py-3">
                        <p className="text-white/35 text-[11px] uppercase tracking-wider font-bold">
                          Campañas activas
                        </p>
                        <p className="font-semibold mt-2">{project.active_campaigns}</p>
                      </div>
                      <div className="rounded-xl bg-white/5 px-3 py-3">
                        <p className="text-white/35 text-[11px] uppercase tracking-wider font-bold">
                          Siguiente entrega
                        </p>
                        <p className="font-semibold mt-2">
                          {project.next_due_date
                            ? new Date(project.next_due_date).toLocaleDateString('es-ES')
                            : 'Sin fecha'}
                        </p>
                      </div>
                    </div>
                  </button>
                ))}
              </div>
            )}
          </CollapsibleSection>

          <CollapsibleSection
            title="Agenda operativa"
            description="Lo siguiente que deberías mover para mantener tus entregas al día."
            icon={<ClipboardList className="w-5 h-5" />}
            summary={`${upcomingTasks.length} pendientes`}
            storageKey="dashboard-freelancer-agenda"
          >
            {upcomingTasks.length === 0 ? (
              <div className="rounded-2xl border border-white/10 bg-white/5 p-6 text-white/45">
                No hay tareas operativas pendientes ahora mismo.
              </div>
            ) : (
              <div className="space-y-3">
                {upcomingTasks.slice(0, 5).map((task) => (
                  <button
                    key={task.id}
                    type="button"
                    onClick={() => onNavigate('tasks')}
                    className="w-full rounded-2xl border border-white/10 bg-white/5 p-4 text-left hover:bg-white/8 transition-colors"
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <p className="font-semibold">{task.title}</p>
                        <p className="text-sm text-white/45 mt-1">
                          {task.client_name || 'Cliente sin asignar'} · {task.project_name}
                        </p>
                      </div>
                      <span className="text-xs uppercase tracking-wider text-brand-cyan font-bold">
                        {getFreelancerTaskStatusLabel(task.status)}
                      </span>
                    </div>
                    <div className="mt-4 flex items-center justify-between gap-3 text-sm">
                      <span className="text-white/55">
                        Prioridad {task.priority === 'high' ? 'alta' : task.priority === 'medium' ? 'media' : 'baja'}
                      </span>
                      <span className="text-white/40">
                        {new Date(task.due_date).toLocaleDateString('es-ES')}
                      </span>
                    </div>
                  </button>
                ))}
              </div>
            )}
          </CollapsibleSection>
        </div>

        <div className="grid grid-cols-1 xl:grid-cols-[0.92fr_1.08fr] gap-6">
          <CollapsibleSection
            title="Perfil de colaboración"
            description="Datos de payout, especialidad y contexto general para trabajar con la agencia."
            icon={<Users className="w-5 h-5" />}
            storageKey="dashboard-freelancer-profile"
            defaultOpen={false}
          >
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="rounded-2xl border border-white/10 bg-white/5 p-5">
                <p className="text-xs uppercase tracking-wider text-white/40 font-bold">
                  Método de pago
                </p>
                <p className="text-xl font-semibold mt-3">{payoutMethod}</p>
                <p className="text-sm text-white/45 mt-2">{payoutReference}</p>
              </div>

              <div className="rounded-2xl border border-white/10 bg-white/5 p-5">
                <p className="text-xs uppercase tracking-wider text-white/40 font-bold">
                  Especialidad
                </p>
                <p className="text-xl font-semibold mt-3">
                  {freelancerReferralPortal?.freelancer.specialty || 'Freelance'}
                </p>
                <p className="text-sm text-white/45 mt-2">
                  Divisa base {freelancerReferralPortal?.freelancer.currency || 'EUR'}
                </p>
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="rounded-2xl border border-white/10 bg-white/5 p-5">
                <p className="text-xs uppercase tracking-wider text-white/40 font-bold">
                  Clientes activos
                </p>
                <p className="text-3xl font-bold mt-3">{workspaceClients.length}</p>
                <p className="text-sm text-white/45 mt-2">
                  {workspaceProjects.length} proyectos visibles en tu cartera.
                </p>
              </div>

              <div className="rounded-2xl border border-white/10 bg-white/5 p-5">
                <p className="text-xs uppercase tracking-wider text-white/40 font-bold">
                  Tareas asignadas
                </p>
                <p className="text-3xl font-bold mt-3">{taskSummary?.assigned_tasks || 0}</p>
                <p className="text-sm text-white/45 mt-2">
                  {taskSummary?.in_review || 0} en revisión y {taskSummary?.completed_tasks || 0} completadas.
                </p>
              </div>
            </div>

            {canAccessFreelancerReferrals ? (
              <div className="rounded-2xl border border-brand-cyan/20 bg-brand-cyan/10 p-5">
                <div className="flex items-center justify-between gap-3">
                  <p className="font-semibold">Programa de referidos</p>
                  <Gift className="w-5 h-5 text-brand-cyan" />
                </div>
                <p className="text-sm text-white/55 mt-3">
                  {freelancerReferralPortal?.summary.converted_referrals || 0} conversiones y €
                  {(freelancerReferralPortal?.summary.paid_commissions || 0).toLocaleString()} ya
                  pagados.
                </p>
              </div>
            ) : null}
          </CollapsibleSection>

          <CollapsibleSection
            title="Contratos recientes"
            description="Últimos acuerdos compartidos contigo por la agencia."
            icon={<FileText className="w-5 h-5" />}
            summary={`${recentContracts.length} visibles`}
            storageKey="dashboard-freelancer-contracts"
            actions={
              <button
                type="button"
                onClick={() => onNavigate('contracts')}
                className="glass-button-secondary"
              >
                <ArrowUpRight className="w-4 h-4" />
                Ver contratos
              </button>
            }
          >
            <div className="space-y-3">
              {recentContracts.length === 0 ? (
                <div className="rounded-2xl border border-white/10 bg-white/5 p-6 text-white/45">
                  Todavía no tienes contratos visibles.
                </div>
              ) : (
                recentContracts.map((contract) => (
                  <button
                    key={contract.id}
                    type="button"
                    onClick={() => onNavigate('contracts')}
                    className="w-full rounded-2xl border border-white/10 bg-white/5 p-4 text-left hover:bg-white/8 transition-colors"
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <p className="font-semibold">{contract.contract_number}</p>
                        <p className="text-sm text-white/45 mt-1">
                          {contract.counterparty_name}
                        </p>
                      </div>
                      <span className="text-xs uppercase tracking-wider text-brand-cyan font-bold">
                        {contract.status}
                      </span>
                    </div>
                    <div className="mt-4 flex items-center justify-between gap-3 text-sm">
                      <span className="text-white/55">
                        €{Number(contract.total_amount || 0).toLocaleString()} {contract.currency}
                      </span>
                      <span className="text-white/40">
                        Inicio {new Date(contract.start_date).toLocaleDateString('es-ES')}
                      </span>
                    </div>
                  </button>
                ))
              )}
            </div>
          </CollapsibleSection>
        </div>
      </div>
    );
  }

  const pipelineData = canAccessLeads
    ? [
        {
          name: 'Nuevos',
          value: leads.filter((lead) => lead.status === 'new').length,
          color: pipelineColors.nuevos,
        },
        {
          name: 'Contactados',
          value: leads.filter((lead) => lead.status === 'contacted').length,
          color: pipelineColors.contactados,
        },
        {
          name: 'Reunión',
          value: leads.filter((lead) => lead.status === 'meeting').length,
          color: pipelineColors.reunion,
        },
        {
          name: 'Propuesta',
          value: leads.filter((lead) =>
            ['diagnosis', 'proposal', 'negotiation'].includes(lead.status),
          ).length,
          color: pipelineColors.propuesta,
        },
        {
          name: 'Cerrados',
          value: leads.filter((lead) => lead.status === 'closed').length,
          color: pipelineColors.cerrados,
        },
      ]
    : [];

  const adminPipelineData = canAccessLeads
    ? [
        {
          name: 'Nuevo lead',
          value: leads.filter((lead) => lead.status === 'new').length,
          color: adminPipelineColors.nuevos,
        },
        {
          name: 'Contactado',
          value: leads.filter((lead) => lead.status === 'contacted').length,
          color: adminPipelineColors.contactados,
        },
        {
          name: 'Reunión',
          value: leads.filter((lead) => lead.status === 'meeting').length,
          color: adminPipelineColors.reunion,
        },
        {
          name: 'Diagnóstico',
          value: leads.filter((lead) => lead.status === 'diagnosis').length,
          color: adminPipelineColors.diagnostico,
        },
        {
          name: 'Propuesta',
          value: leads.filter((lead) => lead.status === 'proposal').length,
          color: adminPipelineColors.propuesta,
        },
        {
          name: 'Negociación',
          value: leads.filter((lead) => lead.status === 'negotiation').length,
          color: adminPipelineColors.negociacion,
        },
        {
          name: 'Cliente cerrado',
          value: leads.filter((lead) => lead.status === 'closed').length,
          color: adminPipelineColors.cerrados,
        },
        {
          name: 'Perdido',
          value: leads.filter((lead) => lead.status === 'lost').length,
          color: adminPipelineColors.perdidos,
        },
      ]
    : [];

  const hasPipelineData = pipelineData.some((item) => item.value > 0);
  const hasAdminPipelineData = adminPipelineData.some((item) => item.value > 0);

  const activityItems = [
    ...(canAccessLeads
      ? leads.map((lead) => ({
          id: `lead-${lead.id}`,
          title: `Nuevo lead registrado: ${lead.company || lead.name}`,
          subtitle: `${formatRelativeTime(lead.created_at)} • ${lead.source || 'Captado desde CRM'}`,
          tab: 'leads',
          timestamp: new Date(lead.created_at).getTime(),
        }))
      : []),
    ...(canAccessClients
      ? clients.map((client) => ({
          id: `client-${client.id}`,
          title: `Cliente activado: ${client.company}`,
          subtitle: `${formatRelativeTime(client.created_at)} • ${client.industry || 'Sin industria'}`,
          tab: 'clients',
          timestamp: new Date(client.created_at).getTime(),
        }))
      : []),
    ...(canAccessProjects
      ? projects.map((project) => ({
          id: `project-${project.id}`,
          title: `Proyecto creado: ${project.name}`,
          subtitle: `${formatRelativeTime(project.created_at)} • Estado ${project.status}`,
          tab: 'projects',
          timestamp: new Date(project.created_at).getTime(),
        }))
      : []),
    ...(canAccessCampaigns
      ? campaigns.map((campaign) => ({
          id: `campaign-${campaign.id}`,
          title: `Campaña actualizada: ${campaign.name}`,
          subtitle: `${formatRelativeTime(campaign.created_at)} • Plataforma ${campaign.platform}`,
          tab: 'campaigns',
          timestamp: new Date(campaign.created_at).getTime(),
        }))
      : []),
  ]
    .filter((item) => !Number.isNaN(item.timestamp))
    .sort((left, right) => right.timestamp - left.timestamp)
    .slice(0, 4);

  const pendingTasks = canAccessTasks
    ? tasks
        .filter((task) => task.status !== 'done')
        .sort(
          (left, right) =>
            new Date(left.due_date).getTime() - new Date(right.due_date).getTime(),
        )
        .slice(0, 4)
    : [];

  const unreadNotificationsCount = notifications.filter((notification) => !notification.is_read).length;
  const visibleCalendarEvents = calendarEvents
    .filter((calendarEvent) => calendarEvent.status !== 'cancelled')
    .slice(0, 8);

  const visibleActivityItems =
    activityItems.length > 0
      ? activityItems
      : canAccessLeads || canAccessClients || canAccessProjects || canAccessCampaigns
        ? fallbackActivity.filter((item) =>
            accessibleSections.includes(item.tab as AppSection),
          )
        : [];

  const activeClientsCount = canAccessClients
    ? clients.filter((client) => client.status === 'active').length
    : stats?.clients.count || 0;
  const monthlyRevenue = invoices.length
    ? invoices
        .filter((invoice) => invoice.status === 'paid' && isDateInCurrentMonth(invoice.due_date))
        .reduce((sum, invoice) => sum + Number(invoice.amount || 0), 0)
    : stats?.revenue || 0;
  const recurringRevenue =
    stats?.mrr ||
    clients
      .filter((client) => client.status === 'active')
      .reduce((sum, client) => sum + Number(client.budget || 0), 0);
  const overdueTasksCount = canAccessTasks
    ? tasks.filter((task) => task.status !== 'done' && isPastDueDate(task.due_date)).length
    : adminOverview?.kpis.overdue_tasks || 0;
  const projectById = new Map(projects.map((project) => [project.id, project]));
  const activeCampaigns = campaigns
    .filter((campaign) => campaign.status === 'active')
    .slice()
    .sort((left, right) => Number(right.spent || 0) - Number(left.spent || 0));
  const pendingInvoices = canAccessBilling
    ? invoices
        .filter((invoice) => invoice.status !== 'paid')
        .slice()
        .sort(
          (left, right) =>
            new Date(left.due_date).getTime() - new Date(right.due_date).getTime(),
        )
    : [];
  const teamPerformanceRows = teamMembers
    .filter((member) => member.access_status === 'active')
    .map((member) => {
      const assignedTasks = tasks.filter((task) => task.assigned_to === member.id);
      const completedTasks = assignedTasks.filter((task) => task.status === 'done').length;
      const completionRate = assignedTasks.length
        ? Math.round((completedTasks / assignedTasks.length) * 100)
        : 0;
      const overdueAssignedTasks = assignedTasks.filter(
        (task) => task.status !== 'done' && isPastDueDate(task.due_date),
      ).length;

      return {
        member,
        assignedTasks: assignedTasks.length,
        completedTasks,
        completionRate,
        overdueAssignedTasks,
      };
    })
    .sort((left, right) => {
      if (right.completionRate !== left.completionRate) {
        return right.completionRate - left.completionRate;
      }

      return right.completedTasks - left.completedTasks;
    })
    .slice(0, 5);
  const teamPerformanceAverage = teamPerformanceRows.length
    ? Math.round(
        teamPerformanceRows.reduce((sum, item) => sum + item.completionRate, 0) /
          teamPerformanceRows.length,
      )
    : 0;
  const upcomingMeetings = calendarEvents
    .filter((calendarEvent) => {
      if (calendarEvent.event_kind !== 'meeting' || calendarEvent.status !== 'scheduled') {
        return false;
      }

      const eventTime = new Date(calendarEvent.start_at).getTime();
      return !Number.isNaN(eventTime) && eventTime >= Date.now();
    })
    .slice()
    .sort(
      (left, right) =>
        new Date(left.start_at).getTime() - new Date(right.start_at).getTime(),
    )
    .slice(0, 5);
  const importantAlerts = [
    ...(overdueTasksCount > 0
      ? [
          {
            id: 'dashboard-overdue-tasks',
            title: 'Tareas vencidas',
            description: `${overdueTasksCount} tareas requieren seguimiento inmediato.`,
            severity: 'warning' as const,
            tab: 'tasks' as AppSection,
          },
        ]
      : []),
    ...(pendingInvoices.filter((invoice) => invoice.status === 'overdue').length > 0
      ? [
          {
            id: 'dashboard-overdue-invoices',
            title: 'Facturas vencidas',
            description: `${pendingInvoices.filter((invoice) => invoice.status === 'overdue').length} cobros fuera de fecha.`,
            severity: 'critical' as const,
            tab: 'billing' as AppSection,
          },
        ]
      : []),
    ...(adminOverview?.ai.alerts.map((alert) => ({
      id: `dashboard-ai-${alert.id}`,
      title: alert.title,
      description: alert.description,
      severity: alert.severity,
      tab: alert.tab,
    })) || []),
    ...notifications
      .filter((notification) => ['critical', 'warning'].includes(notification.severity))
      .map((notification) => ({
        id: `dashboard-notification-${notification.id}`,
        title: notification.title,
        description: notification.message,
        severity: notification.severity === 'critical' ? 'critical' : 'warning',
        tab: notification.action_tab,
      })),
  ].slice(0, 6);
  const adminMetricCards = [
    {
      title: 'Leads nuevos',
      value: leads.filter((lead) => lead.status === 'new').length,
      hint: 'Entradas listas para primer contacto.',
      icon: Users,
      color: 'bg-brand-blue/20',
      onClick: () => onNavigate('leads'),
    },
    {
      title: 'En negociación',
      value: leads.filter((lead) => lead.status === 'negotiation').length,
      hint: 'Oportunidades activas en cierre.',
      icon: TrendingUp,
      color: 'bg-fuchsia-500/20',
      onClick: () => onNavigate('leads'),
    },
    {
      title: 'Clientes activos',
      value: activeClientsCount,
      hint: 'Base viva de cuentas operativas.',
      icon: UserCheck,
      color: 'bg-brand-purple/20',
      onClick: () => onNavigate('clients'),
    },
    {
      title: 'Ingresos del mes',
      value: formatCurrency(monthlyRevenue),
      hint: 'Cobrado dentro del mes actual.',
      icon: DollarSign,
      color: 'bg-brand-cyan/20',
      onClick: () => onNavigate('billing'),
    },
    {
      title: 'Ingresos recurrentes',
      value: formatCurrency(recurringRevenue),
      hint: 'Base mensual activa de clientes.',
      icon: Activity,
      color: 'bg-emerald-500/20',
      onClick: () => onNavigate('billing'),
    },
    {
      title: 'Proyectos en curso',
      value: projects.filter((project) => project.status !== 'completed').length,
      hint: 'Operaciones abiertas en marcha.',
      icon: Briefcase,
      color: 'bg-amber-500/20',
      onClick: () => onNavigate('projects'),
    },
    {
      title: 'Campañas activas',
      value: activeCampaigns.length,
      hint: 'Campañas vivas bajo gestión.',
      icon: Workflow,
      color: 'bg-sky-500/20',
      onClick: () => onNavigate('campaigns'),
    },
    {
      title: 'Tareas vencidas',
      value: overdueTasksCount,
      hint: 'Bloque operativo fuera de fecha.',
      icon: AlertTriangle,
      color: 'bg-red-500/20',
      onClick: () => onNavigate('tasks'),
    },
    {
      title: 'Rendimiento equipo',
      value: `${teamPerformanceAverage}%`,
      hint: 'Media de cumplimiento asignado.',
      icon: ClipboardList,
      color: 'bg-violet-500/20',
      onClick: () => onNavigate('team'),
    },
    {
      title: 'Próximas reuniones',
      value: upcomingMeetings.length,
      hint: 'Meetings programadas a corto plazo.',
      icon: Calendar,
      color: 'bg-teal-500/20',
      onClick: () => {
        setShowCalendarPanel(true);
        setShowNotificationsPanel(false);
        void loadOperationalInbox();
      },
    },
    {
      title: 'Alertas importantes',
      value: importantAlerts.length,
      hint: 'Riesgos que conviene mover hoy.',
      icon: Bell,
      color: 'bg-orange-500/20',
      onClick: () => onNavigate('settings'),
    },
  ];

  const adminQuickActions = [
    {
      label: 'Equipo',
      description: 'Invitaciones, roles y onboarding de trabajadores',
      tab: 'team',
      icon: UserPlus,
      enabled: accessibleSections.includes('team'),
    },
    {
      label: 'Clientes',
      description: 'Onboarding y estado operativo de cuentas',
      tab: 'clients',
      icon: ClipboardList,
      enabled: accessibleSections.includes('clients'),
    },
    {
      label: 'Ajustes',
      description: 'Seguridad, auditoría y configuración global',
      tab: 'settings',
      icon: Settings,
      enabled: accessibleSections.includes('settings'),
    },
    {
      label: 'Reportes',
      description: 'Visión ejecutiva de rendimiento y entregables',
      tab: 'reports',
      icon: Activity,
      enabled: accessibleSections.includes('reports'),
    },
    {
      label: 'IA',
      description: 'Automatizaciones, monitor y control operativo',
      tab: 'ai',
      icon: Bot,
      enabled: accessibleSections.includes('ai'),
    },
  ].filter((action) => action.enabled);

  const featuredIntegrations = integrations
    .slice()
    .sort((left, right) => {
      const leftIndex = featuredIntegrationOrder.indexOf(left.key);
      const rightIndex = featuredIntegrationOrder.indexOf(right.key);

      return (leftIndex === -1 ? 999 : leftIndex) - (rightIndex === -1 ? 999 : rightIndex);
    })
    .slice(0, 8);

  const integrationSummary = {
    connected: integrations.filter((integration) => integration.status === 'connected').length,
    attention: integrations.filter((integration) => integration.status === 'attention').length,
    webhookReady: integrations.filter((integration) => integration.supports_webhook).length,
  };

  const handleNotificationsClick = async () => {
    const nextState = !showNotificationsPanel;
    setShowNotificationsPanel(nextState);
    setShowCalendarPanel(false);

    if (nextState) {
      await Promise.all([loadOperationalInbox(), onRefreshStats()]);
    }
  };

  const openAIFilteredHistory = (preset?: AIAutomationRunFilterPreset | null) => {
    if (preset) {
      saveAIAutomationRunFilterPreset(preset);
    }

    onNavigate('ai');
  };

  const handleCalendarClick = () => {
    const nextState = !showCalendarPanel;
    setShowCalendarPanel(nextState);
    setShowNotificationsPanel(false);

    if (nextState) {
      void loadOperationalInbox();
    }
  };

  const handleRefreshIntegrations = async () => {
    await loadIntegrations();
    setIntegrationMessageTone('success');
    setIntegrationMessage('Panel de integraciones actualizado.');
  };

  const handleIntegrationAction = async (
    integration: Integration,
    action: 'connect' | 'test',
  ) => {
    setIntegrationActionId(integration.id);

    try {
      const response = await fetch(
        action === 'connect'
          ? `/api/integrations/${integration.id}/connect`
          : `/api/integrations/${integration.id}/test`,
        {
          method: 'POST',
        },
      );

      if (!response.ok) {
        const errorData = (await response.json().catch(() => null)) as { error?: string } | null;
        throw new Error(errorData?.error || `Request failed with status ${response.status}`);
      }

      const data = (await response.json()) as
        | Integration
        | {
            integration: Integration;
            result?: {
              summary?: string;
            };
          };
      const updatedIntegration =
        'integration' in data ? data.integration : data;

      setIntegrations((currentIntegrations) =>
        currentIntegrations.map((item) =>
          item.id === updatedIntegration.id ? updatedIntegration : item,
        ),
      );
      setIntegrationMessageTone('success');
      setIntegrationMessage(
        'result' in data
          ? data.result?.summary || `${updatedIntegration.name} validada correctamente.`
          : `${updatedIntegration.name} conectada correctamente.`,
      );
    } catch (error) {
      console.error('Error handling integration action:', error);
      setIntegrationMessageTone('error');
      setIntegrationMessage(
        error instanceof Error
          ? error.message
          : 'No se pudo ejecutar la acción de integración.',
      );
    } finally {
      setIntegrationActionId(null);
    }
  };

  const handleTaskToggle = async (taskId: number, currentStatus: Task['status']) => {
    const nextStatus = currentStatus === 'done' ? 'todo' : 'done';

    setUpdatingTaskId(taskId);

    try {
      const response = await fetch(`/api/tasks/${taskId}/status`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ status: nextStatus }),
      });

      const updatedTask = await getResponseJson<Task>(response);

      setTasks((currentTasks) =>
        currentTasks.map((task) => (task.id === updatedTask.id ? updatedTask : task)),
      );
      await loadOperationalInbox();
    } catch (error) {
      console.error('Error updating task status:', error);
    } finally {
      setUpdatingTaskId(null);
    }
  };

  const handleMarkNotificationRead = async (notificationId: number) => {
    setMarkingNotificationId(notificationId);

    try {
      const response = await fetch(`/api/notifications/${notificationId}/read`, {
        method: 'POST',
      });
      const updatedNotification = await getResponseJson<AppNotification>(response);

      setNotifications((currentNotifications) =>
        currentNotifications.map((notification) =>
          notification.id === updatedNotification.id ? updatedNotification : notification,
        ),
      );
    } catch (error) {
      console.error('Error marking notification as read:', error);
    } finally {
      setMarkingNotificationId(null);
    }
  };

  const handleMarkAllNotificationsRead = async () => {
    setMarkingAllNotifications(true);

    try {
      const response = await fetch('/api/notifications/read-all', {
        method: 'POST',
      });

      await getResponseJson<{ updated: number }>(response);
      setNotifications((currentNotifications) =>
        currentNotifications.map((notification) => ({
          ...notification,
          is_read: true,
        })),
      );
    } catch (error) {
      console.error('Error marking notifications as read:', error);
    } finally {
      setMarkingAllNotifications(false);
    }
  };

  const handleOpenNotification = async (notification: AppNotification) => {
    if (!notification.is_read) {
      await handleMarkNotificationRead(notification.id);
    }

    setShowNotificationsPanel(false);
    onNavigate(notification.action_tab);
  };

  const handleCalendarEventComplete = async (calendarEvent: CalendarEvent) => {
    if (calendarEvent.source_type === 'task' && calendarEvent.action_entity_id) {
      const linkedTask = tasks.find((task) => task.id === calendarEvent.action_entity_id);
      await handleTaskToggle(calendarEvent.action_entity_id, linkedTask?.status || 'todo');
      return;
    }

    setUpdatingCalendarEventId(calendarEvent.id);

    try {
      const response = await fetch(`/api/calendar-events/${calendarEvent.id}/status`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ status: 'completed' }),
      });

      const updatedEvent = await getResponseJson<CalendarEvent>(response);

      setCalendarEvents((currentEvents) =>
        currentEvents.map((event) => (event.id === updatedEvent.id ? updatedEvent : event)),
      );
      await loadOperationalInbox();
    } catch (error) {
      console.error('Error completing calendar event:', error);
    } finally {
      setUpdatingCalendarEventId(null);
    }
  };

  const handleOpenCalendarEvent = (calendarEvent: CalendarEvent) => {
    setShowCalendarPanel(false);
    onNavigate(calendarEvent.action_tab);
  };

  const handleDisableAITrigger = async (
    triggerKey: NonNullable<AdminOverview['ai']['alerts'][number]['trigger_key']>,
  ) => {
    setDisablingTriggerKey(triggerKey);

    try {
      const response = await fetch(`/api/settings/ai-triggers/${triggerKey}/disable`, {
        method: 'POST',
      });

      if (!response.ok) {
        throw new Error(`Request failed with status ${response.status}`);
      }

      setAdminMessageTone('success');
      setAdminMessage('Trigger IA desactivado correctamente.');
      await loadAdminOverview();
    } catch (error) {
      console.error('Error disabling AI trigger:', error);
      setAdminMessageTone('error');
      setAdminMessage('No se pudo desactivar el trigger IA desde el dashboard.');
    } finally {
      setDisablingTriggerKey(null);
    }
  };

  const handleEnableAITrigger = async (
    triggerKey: AdminOverview['ai']['disabled_triggers'][number]['trigger_key'],
  ) => {
    setEnablingTriggerKey(triggerKey);

    try {
      const response = await fetch(`/api/settings/ai-triggers/${triggerKey}/enable`, {
        method: 'POST',
      });

      if (!response.ok) {
        throw new Error(`Request failed with status ${response.status}`);
      }

      setAdminMessageTone('success');
      setAdminMessage('Trigger IA reactivado correctamente.');
      await loadAdminOverview();
      setConfirmEnableTriggerKey(null);
      setConfirmBulkEnable(false);
    } catch (error) {
      console.error('Error enabling AI trigger:', error);
      setAdminMessageTone('error');
      setAdminMessage('No se pudo reactivar el trigger IA desde el dashboard.');
    } finally {
      setEnablingTriggerKey(null);
    }
  };

  const handleEnableAllAITriggers = async () => {
    setEnablingAllTriggers(true);

    try {
      const response = await fetch('/api/settings/ai-triggers/enable-all', {
        method: 'POST',
      });

      if (!response.ok) {
        throw new Error(`Request failed with status ${response.status}`);
      }

      setAdminMessageTone('success');
      setAdminMessage('Todos los triggers IA desactivados fueron reactivados.');
      await loadAdminOverview();
      setConfirmBulkEnable(false);
      setConfirmEnableTriggerKey(null);
    } catch (error) {
      console.error('Error enabling all AI triggers:', error);
      setAdminMessageTone('error');
      setAdminMessage('No se pudieron reactivar todos los triggers IA.');
    } finally {
      setEnablingAllTriggers(false);
    }
  };

  const handleSessionRevoke = async (sessionId: number) => {
    setRevokingSessionId(sessionId);
    setAdminMessage(null);

    try {
      const response = await fetch(`/api/admin/sessions/${sessionId}/revoke`, {
        method: 'POST',
      });

      await getResponseJson<{ revoked: boolean }>(response);
      await loadAdminOverview();
      setAdminMessageTone('success');
      setAdminMessage('Sesión revocada correctamente.');
    } catch (error) {
      console.error('Error revoking session:', error);
      setAdminMessageTone('error');
      setAdminMessage('No se pudo revocar la sesión seleccionada.');
    } finally {
      setRevokingSessionId(null);
    }
  };

  return (
    <div className="mx-auto w-full max-w-[1580px] min-w-0 space-y-10">
      <header className="flex flex-col gap-4 xl:flex-row xl:items-start xl:justify-between">
        <div>
          <h2 className="text-3xl font-bold">Bienvenido, {currentUserName.split(' ')[0]}</h2>
          <p className="text-white/50">
            {isAdminDashboard
              ? 'Aquí tienes el control ejecutivo de la agencia hoy.'
              : 'Aquí tienes el resumen de tu agencia hoy.'}
          </p>
        </div>
        <div className="relative flex flex-wrap items-center gap-3 xl:justify-end">
          <button
            type="button"
            onClick={() => void handleNotificationsClick()}
            className="glass-panel p-2 hover:bg-white/10 transition-colors relative"
            aria-label="Abrir centro de notificaciones"
            title="Abrir centro de notificaciones"
          >
            <Bell className="w-5 h-5 text-white/70" />
            {unreadNotificationsCount > 0 ? (
              <span className="absolute -right-1 -top-1 min-w-5 h-5 px-1 rounded-full bg-red-500 text-white text-[10px] font-bold flex items-center justify-center">
                {unreadNotificationsCount}
              </span>
            ) : null}
          </button>
          <button
            type="button"
            onClick={handleCalendarClick}
            className="glass-panel p-2 hover:bg-white/10 transition-colors relative"
            aria-label="Abrir agenda operativa"
            title="Abrir agenda operativa"
          >
            <Calendar className="w-5 h-5 text-white/70" />
            {visibleCalendarEvents.length > 0 ? (
              <span className="absolute -right-1 -top-1 min-w-5 h-5 px-1 rounded-full bg-brand-blue text-white text-[10px] font-bold flex items-center justify-center">
                {visibleCalendarEvents.length}
              </span>
            ) : null}
          </button>
          <div className="glass-panel flex items-center gap-3 px-4 py-2">
            <Clock className="w-4 h-4 text-brand-cyan" />
            <span className="text-sm font-medium">{currentTime}</span>
          </div>

          {showNotificationsPanel ? (
            <div className="absolute right-0 top-14 z-20 w-[min(380px,calc(100vw-2rem))] max-w-[calc(100vw-2rem)] glass-panel p-4 space-y-4">
              <div className="flex items-center justify-between gap-3">
                <div>
                  <h3 className="font-semibold">Notificaciones</h3>
                  <p className="text-xs text-white/45">
                    {unreadNotificationsCount > 0
                      ? `${unreadNotificationsCount} sin leer`
                      : 'Todo al día'}
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => void handleMarkAllNotificationsRead()}
                  disabled={markingAllNotifications || unreadNotificationsCount === 0}
                  className="glass-button-secondary disabled:opacity-50"
                >
                  {markingAllNotifications ? 'Marcando...' : 'Marcar todo'}
                </button>
              </div>

              {notifications.length === 0 ? (
                <div className="glass-card p-4 text-sm text-white/45">
                  No hay notificaciones registradas ahora mismo.
                </div>
              ) : (
                <div className="space-y-3 max-h-[420px] overflow-y-auto pr-1">
                  {notifications.map((notification) => (
                    <div key={notification.id} className="glass-card p-4 space-y-3">
                      <div className="flex items-start justify-between gap-3">
                        <div className="space-y-2">
                          <div className="flex items-center gap-2 flex-wrap">
                            <span
                              className={cn(
                                'text-[10px] px-2 py-1 rounded-full border uppercase tracking-wider font-bold',
                                getNotificationSeverityClass(notification.severity),
                              )}
                            >
                              {notification.severity}
                            </span>
                            {!notification.is_read ? (
                              <span className="text-[10px] px-2 py-1 rounded-full border border-white/10 bg-white/5 text-white/60 uppercase tracking-wider font-bold">
                                Nueva
                              </span>
                            ) : null}
                          </div>
                          <div>
                            <p className="font-medium">{notification.title}</p>
                            <p className="text-sm text-white/50 mt-1">{notification.message}</p>
                          </div>
                        </div>
                        <span className="text-xs text-white/35 whitespace-nowrap">
                          {formatRelativeTime(notification.created_at)}
                        </span>
                      </div>

                      <div className="flex gap-2">
                        <button
                          type="button"
                          onClick={() => void handleOpenNotification(notification)}
                          className="glass-button-secondary"
                        >
                          Abrir
                        </button>
                        <button
                          type="button"
                          onClick={() => void handleMarkNotificationRead(notification.id)}
                          disabled={notification.is_read || markingNotificationId === notification.id}
                          className="glass-button-secondary disabled:opacity-50"
                        >
                          {markingNotificationId === notification.id ? 'Guardando...' : 'Leída'}
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          ) : null}

          {showCalendarPanel ? (
            <div className="absolute right-0 top-14 z-20 w-[min(420px,calc(100vw-2rem))] max-w-[calc(100vw-2rem)] glass-panel p-4 space-y-4">
              <div>
                <h3 className="font-semibold">Agenda Operativa</h3>
                <p className="text-xs text-white/45">
                  Próximos hitos de tareas, seguimiento y onboarding.
                </p>
              </div>

              {visibleCalendarEvents.length === 0 ? (
                <div className="glass-card p-4 text-sm text-white/45">
                  No hay eventos programados en la agenda.
                </div>
              ) : (
                <div className="space-y-3 max-h-[420px] overflow-y-auto pr-1">
                  {visibleCalendarEvents.map((calendarEvent) => (
                    <div key={calendarEvent.id} className="glass-card p-4 space-y-3">
                      <div className="flex items-start justify-between gap-3">
                        <div className="space-y-2">
                          <div className="flex flex-wrap items-center gap-2">
                            <span
                              className={cn(
                                'text-[10px] px-2 py-1 rounded-full border uppercase tracking-wider font-bold',
                                getCalendarEventStatusClass(calendarEvent.status),
                              )}
                            >
                              {calendarEvent.status}
                            </span>
                            <span className="text-[10px] px-2 py-1 rounded-full border border-white/10 bg-white/5 text-white/60 uppercase tracking-wider font-bold">
                              {getCalendarEventKindLabel(calendarEvent.event_kind)}
                            </span>
                          </div>
                          <div>
                            <p className="font-medium">{calendarEvent.title}</p>
                            <p className="text-sm text-white/50 mt-1">
                              {calendarEvent.description || 'Sin descripción adicional.'}
                            </p>
                          </div>
                        </div>
                        <span className="text-xs text-white/35 whitespace-nowrap">
                          {formatCalendarRange(calendarEvent.start_at, calendarEvent.end_at)}
                        </span>
                      </div>

                      <div className="flex gap-2">
                        <button
                          type="button"
                          onClick={() => handleOpenCalendarEvent(calendarEvent)}
                          className="glass-button-secondary"
                        >
                          Abrir
                        </button>
                        {calendarEvent.status !== 'completed' ? (
                          <button
                            type="button"
                            onClick={() => void handleCalendarEventComplete(calendarEvent)}
                            disabled={updatingCalendarEventId === calendarEvent.id}
                            className="glass-button-secondary disabled:opacity-50"
                          >
                            {updatingCalendarEventId === calendarEvent.id ? 'Guardando...' : 'Completar'}
                          </button>
                        ) : null}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          ) : null}
        </div>
      </header>

      {isAdminDashboard ? (
        <>
          <CollapsibleSection
            title="Resumen ejecutivo"
            description="KPIs principales de captación, facturación, operación y seguimiento del equipo."
            icon={<ShieldCheck className="w-5 h-5" />}
            summary={`${importantAlerts.length} alertas · ${upcomingMeetings.length} reuniones`}
            storageKey="dashboard-admin-summary-v2"
          >
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 2xl:grid-cols-5">
              {adminMetricCards.map((metric) => (
                <AdminMetricCard
                  key={metric.title}
                  title={metric.title}
                  value={metric.value}
                  hint={metric.hint}
                  icon={metric.icon}
                  color={metric.color}
                  onClick={metric.onClick}
                />
              ))}
            </div>
          </CollapsibleSection>

          <CollapsibleSection
            title="Ventas y pipeline"
            description="Seguimiento comercial agrupado para que la lectura sea rápida y limpia."
            icon={<TrendingUp className="w-5 h-5" />}
            storageKey="dashboard-admin-sales-v2"
          >
            <div className="grid grid-cols-1 gap-6 xl:grid-cols-[1.12fr_0.88fr]">
              <div className="glass-panel min-w-0 p-6">
                <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
                  <div>
                    <h3 className="text-lg font-bold">Gráfico de ventas</h3>
                    <p className="mt-1 text-sm text-white/45">
                      Ingresos cobrados en el periodo seleccionado.
                    </p>
                  </div>
                  <select
                    value={range}
                    onChange={(event) => setRange(event.target.value as DashboardRange)}
                    className="glass-input py-1 text-xs"
                    aria-label="Seleccionar rango del gráfico de ventas"
                  >
                    <option value="7d">Últimos 7 días</option>
                    <option value="30d">Últimos 30 días</option>
                  </select>
                </div>
                <div className="h-[280px] w-full">
                  <ResponsiveContainer width="100%" height="100%">
                    <AreaChart data={adminRevenueTrend}>
                      <defs>
                        <linearGradient id="colorAdminRevenue" x1="0" y1="0" x2="0" y2="1">
                          <stop offset="5%" stopColor="#00F0FF" stopOpacity={0.3} />
                          <stop offset="95%" stopColor="#00F0FF" stopOpacity={0} />
                        </linearGradient>
                      </defs>
                      <CartesianGrid
                        strokeDasharray="3 3"
                        stroke="rgba(255,255,255,0.05)"
                        vertical={false}
                      />
                      <XAxis
                        dataKey="name"
                        stroke="rgba(255,255,255,0.3)"
                        fontSize={12}
                        tickLine={false}
                        axisLine={false}
                      />
                      <YAxis
                        stroke="rgba(255,255,255,0.3)"
                        fontSize={12}
                        tickLine={false}
                        axisLine={false}
                      />
                      <Tooltip
                        formatter={(value: number) => [formatCurrency(Number(value)), 'Ingresos']}
                        contentStyle={{
                          backgroundColor: 'rgba(10, 10, 10, 0.9)',
                          border: '1px solid rgba(255,255,255,0.1)',
                          borderRadius: '12px',
                        }}
                        itemStyle={{ color: '#fff' }}
                      />
                      <Area
                        type="monotone"
                        dataKey="revenue"
                        stroke="#00F0FF"
                        strokeWidth={3}
                        fillOpacity={1}
                        fill="url(#colorAdminRevenue)"
                      />
                    </AreaChart>
                  </ResponsiveContainer>
                </div>
              </div>

              <div className="glass-panel min-w-0 p-6">
                <div className="mb-5">
                  <h3 className="text-lg font-bold">Conversión por etapas</h3>
                  <p className="mt-1 text-sm text-white/45">
                    Estado del embudo desde lead nuevo hasta cierre o pérdida.
                  </p>
                </div>
                {canAccessLeads && hasAdminPipelineData ? (
                  <>
                    <div className="h-[280px] w-full">
                      <ResponsiveContainer width="100%" height="100%">
                        <BarChart data={adminPipelineData} layout="vertical" margin={{ left: 8 }}>
                          <XAxis type="number" hide />
                          <YAxis
                            dataKey="name"
                            type="category"
                            stroke="rgba(255,255,255,0.5)"
                            fontSize={11}
                            width={104}
                            tickLine={false}
                            axisLine={false}
                          />
                          <Tooltip
                            cursor={{ fill: 'rgba(255,255,255,0.05)' }}
                            formatter={(value: number) => [`${value} leads`, 'Volumen']}
                            contentStyle={{
                              backgroundColor: 'rgba(10, 10, 10, 0.9)',
                              border: '1px solid rgba(255,255,255,0.1)',
                              borderRadius: '12px',
                            }}
                          />
                          <Bar dataKey="value" radius={[0, 4, 4, 0]} barSize={16}>
                            {adminPipelineData.map((entry, index) => (
                              <Cell key={`admin-pipeline-${index}`} fill={entry.color} />
                            ))}
                          </Bar>
                        </BarChart>
                      </ResponsiveContainer>
                    </div>
                    <div className="mt-4 space-y-2">
                      {adminPipelineData.map((item) => (
                        <div key={item.name} className="flex items-center justify-between gap-3 text-xs">
                          <span className="text-white/50">{item.name}</span>
                          <span className="font-bold">{item.value} leads</span>
                        </div>
                      ))}
                    </div>
                  </>
                ) : (
                  <div className="flex h-[280px] items-center justify-center rounded-2xl border border-white/10 bg-white/5 text-sm text-white/40">
                    Todavía no hay datos suficientes para construir el embudo.
                  </div>
                )}
              </div>
            </div>
          </CollapsibleSection>

          <CollapsibleSection
            title="Operación diaria"
            description="Widgets operativos agrupados para gestionar campañas, equipo, tareas, cobros y actividad."
            icon={<Activity className="w-5 h-5" />}
            storageKey="dashboard-admin-operations-v2"
          >
            <div className="grid grid-cols-1 gap-6 xl:grid-cols-2">
              <div className="glass-panel min-w-0 p-6">
                <div className="mb-5 flex items-center justify-between gap-3">
                  <div>
                    <h3 className="text-lg font-bold">Campañas activas</h3>
                    <p className="mt-1 text-sm text-white/45">
                      Campañas en marcha con más gasto y tracción.
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={() => onNavigate('campaigns')}
                    className="glass-button-secondary"
                  >
                    <ArrowUpRight className="w-4 h-4" />
                    Abrir campañas
                  </button>
                </div>
                {activeCampaigns.length === 0 ? (
                  <div className="rounded-2xl border border-white/10 bg-white/5 p-5 text-sm text-white/40">
                    No hay campañas activas visibles.
                  </div>
                ) : (
                  <div className="space-y-3">
                    {activeCampaigns.slice(0, 4).map((campaign) => (
                      <button
                        key={campaign.id}
                        type="button"
                        onClick={() => onNavigate('campaigns')}
                        className="w-full rounded-2xl border border-white/10 bg-white/5 p-4 text-left transition-colors hover:bg-white/8"
                      >
                        <div className="flex flex-wrap items-start justify-between gap-3">
                          <div>
                            <p className="font-semibold">{campaign.name}</p>
                            <p className="mt-1 text-xs text-white/45">
                              {campaign.platform}
                              {projectById.get(campaign.project_id)
                                ? ` · ${projectById.get(campaign.project_id)?.name}`
                                : ''}
                            </p>
                          </div>
                          <span className="rounded-full border border-emerald-500/20 bg-emerald-500/10 px-2.5 py-1 text-[10px] font-bold uppercase tracking-wider text-emerald-300">
                            Activa
                          </span>
                        </div>
                        <div className="mt-3 flex flex-wrap items-center justify-between gap-3 text-sm">
                          <span className="font-semibold">{formatCurrency(campaign.spent)}</span>
                          <span className="text-white/40">
                            ROI {Number(campaign.roi || 0).toFixed(1)}x
                          </span>
                        </div>
                      </button>
                    ))}
                  </div>
                )}
              </div>

              <div className="glass-panel min-w-0 p-6">
                <div className="mb-5 flex items-center justify-between gap-3">
                  <div>
                    <h3 className="text-lg font-bold">Productividad del equipo</h3>
                    <p className="mt-1 text-sm text-white/45">
                      Rendimiento por tareas asignadas y cumplimiento.
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={() => onNavigate('team')}
                    className="glass-button-secondary"
                  >
                    <ArrowUpRight className="w-4 h-4" />
                    Abrir equipo
                  </button>
                </div>
                {teamPerformanceRows.length === 0 ? (
                  <div className="rounded-2xl border border-white/10 bg-white/5 p-5 text-sm text-white/40">
                    Aún no hay datos suficientes de equipo y tareas asignadas.
                  </div>
                ) : (
                  <div className="space-y-3">
                    {teamPerformanceRows.map((item) => (
                      <button
                        key={item.member.id}
                        type="button"
                        onClick={() => onNavigate('team')}
                        className="w-full rounded-2xl border border-white/10 bg-white/5 p-4 text-left transition-colors hover:bg-white/8"
                      >
                        <div className="flex flex-wrap items-start justify-between gap-3">
                          <div>
                            <p className="font-semibold">{item.member.name}</p>
                            <p className="mt-1 text-xs text-white/45">{item.member.role}</p>
                          </div>
                          <span
                            className={cn(
                              'rounded-full border px-2.5 py-1 text-[10px] font-bold uppercase tracking-wider',
                              getTeamMemberStatusClass(item.member.status),
                            )}
                          >
                            {getTeamMemberStatusLabel(item.member.status)}
                          </span>
                        </div>
                        <div className="mt-3 h-2 overflow-hidden rounded-full bg-white/5">
                          <div
                            className="h-full bg-gradient-to-r from-brand-blue to-brand-cyan"
                            style={{ width: `${Math.min(item.completionRate, 100)}%` }}
                          />
                        </div>
                        <div className="mt-3 flex flex-wrap items-center justify-between gap-3 text-xs text-white/45">
                          <span>{item.completionRate}% completado</span>
                          <span>{item.assignedTasks} asignadas</span>
                          <span>{item.overdueAssignedTasks} vencidas</span>
                        </div>
                      </button>
                    ))}
                  </div>
                )}
              </div>

              <div className="glass-panel min-w-0 p-6">
                <div className="mb-5 flex items-center justify-between gap-3">
                  <div>
                    <h3 className="text-lg font-bold">Tareas pendientes</h3>
                    <p className="mt-1 text-sm text-white/45">
                      Cola priorizada de entregas y pendientes abiertos.
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={() => onNavigate('tasks')}
                    className="glass-button-secondary"
                  >
                    <ArrowUpRight className="w-4 h-4" />
                    Abrir tareas
                  </button>
                </div>
                {!canAccessTasks ? (
                  <div className="rounded-2xl border border-white/10 bg-white/5 p-5 text-sm text-white/40">
                    No tienes acceso al módulo de tareas.
                  </div>
                ) : pendingTasks.length === 0 ? (
                  <div className="rounded-2xl border border-white/10 bg-white/5 p-5 text-sm text-white/40">
                    No hay tareas pendientes.
                  </div>
                ) : (
                  <div className="space-y-3">
                    {pendingTasks.map((task) => (
                      <div
                        key={task.id}
                        onClick={() => onNavigate('tasks')}
                        onKeyDown={(event) => {
                          if (event.key === 'Enter' || event.key === ' ') {
                            event.preventDefault();
                            onNavigate('tasks');
                          }
                        }}
                        role="button"
                        tabIndex={0}
                        className="flex items-center gap-4 rounded-2xl border border-white/10 bg-white/5 p-4 transition-colors hover:bg-white/8"
                      >
                        <button
                          type="button"
                          disabled={updatingTaskId === task.id}
                          onClick={(event) => {
                            event.stopPropagation();
                            void handleTaskToggle(task.id, task.status);
                          }}
                          className="h-5 w-5 rounded border border-white/20 flex items-center justify-center disabled:opacity-50"
                          aria-label={`Marcar tarea ${task.title} como completada`}
                          title="Marcar como completada"
                        >
                          {updatingTaskId === task.id ? (
                            <div className="h-2 w-2 rounded-full bg-white/50" />
                          ) : null}
                        </button>
                        <div className="flex-1 min-w-0">
                          <p className="truncate text-sm font-medium">{task.title}</p>
                          <div className="mt-2 flex flex-wrap items-center gap-3 text-[11px] text-white/40">
                            <span
                              className={cn(
                                'rounded-full px-2 py-0.5',
                                getPriorityClass(task.priority),
                              )}
                            >
                              {getPriorityLabel(task.priority)}
                            </span>
                            <span>{new Date(task.due_date).toLocaleDateString('es-ES')}</span>
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              <div className="glass-panel min-w-0 p-6">
                <div className="mb-5 flex items-center justify-between gap-3">
                  <div>
                    <h3 className="text-lg font-bold">Facturas pendientes</h3>
                    <p className="mt-1 text-sm text-white/45">
                      Cobros abiertos y vencimientos próximos.
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={() => onNavigate('billing')}
                    className="glass-button-secondary"
                  >
                    <ArrowUpRight className="w-4 h-4" />
                    Abrir facturación
                  </button>
                </div>
                {!canAccessBilling ? (
                  <div className="rounded-2xl border border-white/10 bg-white/5 p-5 text-sm text-white/40">
                    No tienes acceso al módulo de facturación.
                  </div>
                ) : pendingInvoices.length === 0 ? (
                  <div className="rounded-2xl border border-white/10 bg-white/5 p-5 text-sm text-white/40">
                    No hay facturas pendientes.
                  </div>
                ) : (
                  <div className="space-y-3">
                    {pendingInvoices.slice(0, 4).map((invoice) => (
                      <button
                        key={invoice.id}
                        type="button"
                        onClick={() => onNavigate('billing')}
                        className="w-full rounded-2xl border border-white/10 bg-white/5 p-4 text-left transition-colors hover:bg-white/8"
                      >
                        <div className="flex flex-wrap items-start justify-between gap-3">
                          <div>
                            <p className="font-semibold">{invoice.invoice_number}</p>
                            <p className="mt-1 text-xs text-white/45">
                              {invoice.client_name || 'Cliente sin nombre'}
                            </p>
                          </div>
                          <span
                            className={cn(
                              'rounded-full border px-2.5 py-1 text-[10px] font-bold uppercase tracking-wider',
                              invoice.status === 'overdue'
                                ? 'bg-red-500/10 text-red-300 border-red-500/20'
                                : 'bg-amber-500/10 text-amber-300 border-amber-500/20',
                            )}
                          >
                            {invoice.status === 'overdue' ? 'Vencida' : 'Pendiente'}
                          </span>
                        </div>
                        <div className="mt-3 flex flex-wrap items-center justify-between gap-3 text-sm">
                          <span className="font-semibold">{formatCurrency(invoice.amount)}</span>
                          <span className="text-white/40">
                            {new Date(invoice.due_date).toLocaleDateString('es-ES')}
                          </span>
                        </div>
                      </button>
                    ))}
                  </div>
                )}
              </div>

              <div className="glass-panel min-w-0 p-6">
                <div className="mb-5">
                  <h3 className="text-lg font-bold">Actividad reciente</h3>
                  <p className="mt-1 text-sm text-white/45">
                    Últimos movimientos comerciales y operativos visibles.
                  </p>
                </div>
                {visibleActivityItems.length === 0 ? (
                  <div className="rounded-2xl border border-white/10 bg-white/5 p-5 text-sm text-white/40">
                    No hay actividad reciente para mostrar.
                  </div>
                ) : (
                  <div className="space-y-3">
                    {visibleActivityItems.map((item) => (
                      <button
                        key={item.id}
                        type="button"
                        onClick={() => onNavigate(item.tab)}
                        className="w-full text-left flex items-center gap-4 rounded-2xl border border-white/10 bg-white/5 p-4 transition-colors hover:bg-white/8"
                      >
                        <div className="w-10 h-10 rounded-full bg-brand-blue/20 flex items-center justify-center text-brand-blue">
                          <TrendingUp className="w-5 h-5" />
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className="truncate text-sm font-medium">{item.title}</p>
                          <p className="text-xs text-white/40 mt-1">{item.subtitle}</p>
                        </div>
                        <ArrowUpRight className="w-4 h-4 text-white/20" />
                      </button>
                    ))}
                  </div>
                )}
              </div>

              <div className="space-y-6">
                <div className="glass-panel min-w-0 p-6">
                  <div className="mb-5">
                    <h3 className="text-lg font-bold">Próximas reuniones</h3>
                    <p className="mt-1 text-sm text-white/45">
                      Agenda operativa y comercial inmediata.
                    </p>
                  </div>
                  {upcomingMeetings.length === 0 ? (
                    <div className="rounded-2xl border border-white/10 bg-white/5 p-5 text-sm text-white/40">
                      No hay reuniones programadas próximamente.
                    </div>
                  ) : (
                    <div className="space-y-3">
                      {upcomingMeetings.map((meeting) => (
                        <button
                          key={meeting.id}
                          type="button"
                          onClick={() => onNavigate(meeting.action_tab)}
                          className="w-full rounded-2xl border border-white/10 bg-white/5 p-4 text-left transition-colors hover:bg-white/8"
                        >
                          <div className="flex items-start justify-between gap-3">
                            <div>
                              <p className="font-semibold">{meeting.title}</p>
                              <p className="mt-1 text-xs text-white/45">
                                {meeting.description || 'Sin detalle adicional.'}
                              </p>
                            </div>
                            <span className="rounded-full border border-brand-cyan/20 bg-brand-cyan/10 px-2.5 py-1 text-[10px] font-bold uppercase tracking-wider text-brand-cyan">
                              Meeting
                            </span>
                          </div>
                          <p className="mt-3 text-xs text-white/40">
                            {formatCalendarRange(meeting.start_at, meeting.end_at)}
                          </p>
                        </button>
                      ))}
                    </div>
                  )}
                </div>

                <div className="glass-panel min-w-0 p-6">
                  <div className="mb-5">
                    <h3 className="text-lg font-bold">Alertas importantes</h3>
                    <p className="mt-1 text-sm text-white/45">
                      Riesgos críticos y avisos prioritarios.
                    </p>
                  </div>
                  {importantAlerts.length === 0 ? (
                    <div className="rounded-2xl border border-white/10 bg-white/5 p-5 text-sm text-white/40">
                      No hay alertas críticas abiertas.
                    </div>
                  ) : (
                    <div className="space-y-3">
                      {importantAlerts.map((alert) => (
                        <button
                          key={alert.id}
                          type="button"
                          onClick={() => onNavigate(alert.tab)}
                          className="w-full rounded-2xl border border-white/10 bg-white/5 p-4 text-left transition-colors hover:bg-white/8"
                        >
                          <div className="flex items-start justify-between gap-3">
                            <div>
                              <span
                                className={cn(
                                  'rounded-full border px-2.5 py-1 text-[10px] font-bold uppercase tracking-wider',
                                  alert.severity === 'critical'
                                    ? 'bg-red-500/10 text-red-300 border-red-500/20'
                                    : 'bg-amber-500/10 text-amber-300 border-amber-500/20',
                                )}
                              >
                                {alert.severity === 'critical' ? 'Crítica' : 'Vigilancia'}
                              </span>
                              <p className="mt-3 font-semibold">{alert.title}</p>
                              <p className="mt-1 text-sm text-white/45">{alert.description}</p>
                            </div>
                            <ArrowUpRight className="w-4 h-4 text-white/20" />
                          </div>
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            </div>
          </CollapsibleSection>
        </>
      ) : (
        <div className="grid grid-cols-1 gap-8 md:grid-cols-2 lg:grid-cols-4">
          <StatCard
            title="Leads Generados"
            value={stats?.leads.count || 0}
            change="+12.5%"
            isPositive={true}
            icon={Users}
            color="bg-brand-blue/20"
            onClick={() => onNavigate('leads')}
          />
          <StatCard
            title="Clientes Activos"
            value={stats?.clients.count || 0}
            change="+5.2%"
            isPositive={true}
            icon={UserCheck}
            color="bg-brand-purple/20"
            onClick={() => onNavigate('clients')}
          />
          <StatCard
            title="Ingresos Mensuales"
            value={`$${(stats?.revenue || 0).toLocaleString()}`}
            change="+18.3%"
            isPositive={true}
            icon={TrendingUp}
            color="bg-brand-cyan/20"
            onClick={() => onNavigate('billing')}
          />
          <StatCard
            title="Proyectos Activos"
            value={stats?.projects.count || 0}
            change="-2.1%"
            isPositive={false}
            icon={Briefcase}
            color="bg-pink-500/20"
            onClick={() => onNavigate('projects')}
          />
        </div>
      )}

      {canAccessReferrals ? (
        <CollapsibleSection
          title="Programa de referidos"
          description="Controla enlaces, clientes referidores, conversiones y payouts sin salir del dashboard."
          icon={<Gift className="w-5 h-5" />}
          storageKey="dashboard-referrals-v2"
          defaultOpen={false}
          actions={
            <button
              type="button"
              onClick={() => onNavigate('referrals')}
              className="glass-button-secondary"
            >
              <ArrowUpRight className="w-4 h-4" />
              Abrir Referidos
            </button>
          }
        >
          <div className="grid auto-rows-fr grid-cols-1 gap-4 md:grid-cols-2 2xl:grid-cols-4">
            <div className="glass-card h-full p-5">
              <p className="text-xs uppercase tracking-[0.2em] text-white/30 font-bold">
                Códigos activos
              </p>
              <p className="text-3xl font-bold mt-2">
                {referralOverview?.summary.active_codes || 0}
              </p>
            </div>
            <div className="glass-card h-full p-5">
              <p className="text-xs uppercase tracking-[0.2em] text-white/30 font-bold">
                Referidos
              </p>
              <p className="text-3xl font-bold mt-2">
                {referralOverview?.summary.total_referrals || 0}
              </p>
            </div>
            <div className="glass-card h-full p-5">
              <p className="text-xs uppercase tracking-[0.2em] text-white/30 font-bold">
                Convertidos
              </p>
              <p className="text-3xl font-bold mt-2">
                {referralOverview?.summary.converted_referrals || 0}
              </p>
              <p className="text-xs text-white/35 mt-2">
                {referralOverview?.summary.conversion_rate || 0}% de conversión
              </p>
            </div>
            <div className="glass-card h-full p-5">
              <p className="text-xs uppercase tracking-[0.2em] text-white/30 font-bold">
                Comisión pendiente
              </p>
              <p className="text-3xl font-bold mt-2">
                €
                {(
                  (referralOverview?.summary.pending_commissions || 0) +
                  (referralOverview?.summary.approved_commissions || 0) +
                  (partnerReferralOverview?.summary.pending_commissions || 0) +
                  (partnerReferralOverview?.summary.approved_commissions || 0)
                ).toLocaleString()}
              </p>
              <p className="text-xs text-white/35 mt-2">
                <DollarSign className="w-3.5 h-3.5 inline mr-1" />
                Pendiente de payout
              </p>
            </div>
          </div>

          <div className="grid grid-cols-1 xl:grid-cols-2 gap-4">
            <div className="glass-card p-4 space-y-3">
              <p className="text-sm font-bold">Top clientes referidores</p>
              {referralOverview?.top_clients.length ? (
                referralOverview.top_clients.slice(0, 4).map((client) => (
                  <div key={client.client_id} className="flex items-center justify-between gap-3">
                    <div>
                      <p className="font-medium">{client.client_name}</p>
                      <p className="text-xs text-white/40">
                        {client.converted_referrals} convertidos · {client.total_referrals} referidos
                      </p>
                    </div>
                    <p className="text-sm text-brand-cyan font-bold">
                      €{client.pending_commissions.toLocaleString()}
                    </p>
                  </div>
                ))
              ) : (
                <p className="text-sm text-white/40">
                  Aún no hay actividad suficiente en referidos.
                </p>
              )}
            </div>

            <div className="glass-card p-4 space-y-3">
              <p className="text-sm font-bold">Últimos referidos</p>
              {referralOverview?.recent_referrals.length || partnerReferralOverview?.recent_referrals.length ? (
                [
                  ...(referralOverview?.recent_referrals.map((referral) => ({
                    id: `client-${referral.id}`,
                    name: referral.referred_name,
                    owner: referral.referrer_client_name,
                    payout_status: referral.payout_status,
                    code: referral.code,
                  })) || []),
                  ...(partnerReferralOverview?.recent_referrals.map((referral) => ({
                    id: `partner-${referral.id}`,
                    name: referral.referred_name,
                    owner: referral.partner_name,
                    payout_status: referral.payout_status,
                    code: referral.code,
                  })) || []),
                ]
                  .slice(0, 4)
                  .map((referral) => (
                  <div key={referral.id} className="flex items-center justify-between gap-3">
                    <div>
                      <p className="font-medium">{referral.name}</p>
                      <p className="text-xs text-white/40">
                        {referral.owner} · {referral.code}
                      </p>
                    </div>
                    <span
                      className={cn(
                        'px-2.5 py-1 rounded-full text-[10px] font-bold uppercase tracking-wider border',
                        referral.payout_status === 'paid'
                          ? 'bg-green-500/10 text-green-400 border-green-500/20'
                          : referral.payout_status === 'approved'
                            ? 'bg-brand-cyan/20 text-brand-cyan border-brand-cyan/20'
                            : 'bg-yellow-500/10 text-yellow-400 border-yellow-500/20',
                      )}
                    >
                      {referral.payout_status}
                    </span>
                  </div>
                ))
              ) : (
                <p className="text-sm text-white/40">Todavía no hay referidos registrados.</p>
              )}
            </div>
          </div>
        </CollapsibleSection>
      ) : null}

      {canAccessContracts ? (
        <CollapsibleSection
          title="Contratos y tarifas"
          description="Controla contratos de clientes y freelancers, base de precios y firmas pendientes."
          icon={<FileText className="w-5 h-5" />}
          storageKey="dashboard-contracts-v2"
          defaultOpen={false}
          actions={
            <button
              type="button"
              onClick={() => onNavigate('contracts')}
              className="glass-button-secondary"
            >
              <ArrowUpRight className="w-4 h-4" />
              Abrir Contratos
            </button>
          }
        >
          <div className="grid auto-rows-fr grid-cols-1 gap-4 md:grid-cols-2 2xl:grid-cols-4">
            <div className="glass-card h-full p-5">
              <p className="text-xs uppercase tracking-[0.2em] text-white/30 font-bold">Contratos</p>
              <p className="text-3xl font-bold mt-2">{contractsOverview?.summary.total_contracts || 0}</p>
            </div>
            <div className="glass-card h-full p-5">
              <p className="text-xs uppercase tracking-[0.2em] text-white/30 font-bold">Pend. firma</p>
              <p className="text-3xl font-bold mt-2">{contractsOverview?.summary.pending_signature || 0}</p>
            </div>
            <div className="glass-card h-full p-5">
              <p className="text-xs uppercase tracking-[0.2em] text-white/30 font-bold">Freelancers</p>
              <p className="text-3xl font-bold mt-2">{contractsOverview?.summary.active_freelancers || 0}</p>
            </div>
            <div className="glass-card h-full p-5">
              <p className="text-xs uppercase tracking-[0.2em] text-white/30 font-bold">Servicios</p>
              <p className="text-3xl font-bold mt-2">{contractsOverview?.summary.active_services || 0}</p>
            </div>
          </div>

          <div className="grid grid-cols-1 xl:grid-cols-2 gap-4">
            <div className="glass-card p-4 space-y-3">
              <p className="text-sm font-bold">Contratos recientes</p>
              {contractsOverview?.recent_contracts.length ? (
                contractsOverview.recent_contracts.slice(0, 4).map((contract) => (
                  <div key={contract.id} className="flex items-center justify-between gap-3">
                    <div>
                      <p className="font-medium">{contract.contract_number}</p>
                      <p className="text-xs text-white/40">
                        {contract.client_name || contract.freelancer_name || contract.counterparty_name}
                      </p>
                    </div>
                    <span
                      className={cn(
                        'px-2.5 py-1 rounded-full text-[10px] font-bold uppercase tracking-wider border',
                        contract.status === 'signed'
                          ? 'bg-green-500/10 text-green-400 border-green-500/20'
                          : contract.status === 'ready' || contract.status === 'sent'
                            ? 'bg-brand-cyan/20 text-brand-cyan border-brand-cyan/20'
                            : 'bg-white/10 text-white/50 border-white/10',
                      )}
                    >
                      {contract.status}
                    </span>
                  </div>
                ))
              ) : (
                <p className="text-sm text-white/40">Todavía no hay contratos creados.</p>
              )}
            </div>

            <div className="glass-card p-4 space-y-3">
              <p className="text-sm font-bold">Valor total gestionado</p>
              <p className="text-3xl font-bold">
                €{(contractsOverview?.summary.monthly_value || 0).toLocaleString()}
              </p>
              <p className="text-sm text-white/40">
                Incluye contratos en borrador, revisión y firmados para mantener visibilidad operativa.
              </p>
            </div>
          </div>
        </CollapsibleSection>
      ) : null}

      {canAccessIntegrations ? (
        <CollapsibleSection
          title="Panel de integraciones"
          description="Conecta Google Calendar, Calendly, Ads, automatizaciones, landings y CRMs externos desde el dashboard."
          icon={<Workflow className="w-5 h-5" />}
          storageKey="dashboard-integrations-v2"
          defaultOpen={false}
          actions={
            <div className="flex flex-wrap gap-3">
              <button
                type="button"
                onClick={() => void handleRefreshIntegrations()}
                disabled={integrationsLoading}
                className="glass-button-secondary disabled:opacity-50"
              >
                <Sparkles className="w-4 h-4" />
                {integrationsLoading ? 'Actualizando...' : 'Actualizar panel'}
              </button>
              <button
                type="button"
                onClick={() => onNavigate('integrations')}
                className="glass-button-secondary"
              >
                <ArrowUpRight className="w-4 h-4" />
                Abrir Integraciones
              </button>
            </div>
          }
        >
          {integrationMessage ? (
            <div
              className={cn(
                'glass-panel p-3 text-sm',
                integrationMessageTone === 'success'
                  ? 'text-green-400'
                  : 'text-red-400',
              )}
            >
              {integrationMessage}
            </div>
          ) : null}

          <div className="grid auto-rows-fr grid-cols-1 gap-4 lg:grid-cols-3">
            <div className="glass-card h-full p-5">
              <p className="text-xs uppercase tracking-[0.2em] text-white/30 font-bold">
                Conectadas
              </p>
              <p className="text-3xl font-bold mt-2">{integrationSummary.connected}</p>
              <p className="text-sm text-white/45 mt-2">herramientas activas ahora</p>
            </div>
            <div className="glass-card h-full p-5">
              <p className="text-xs uppercase tracking-[0.2em] text-white/30 font-bold">
                En revisión
              </p>
              <p className="text-3xl font-bold mt-2">{integrationSummary.attention}</p>
              <p className="text-sm text-white/45 mt-2">conexiones que piden ajuste</p>
            </div>
            <div className="glass-card h-full p-5">
              <p className="text-xs uppercase tracking-[0.2em] text-white/30 font-bold">
                Webhooks listos
              </p>
              <p className="text-3xl font-bold mt-2">{integrationSummary.webhookReady}</p>
              <p className="text-sm text-white/45 mt-2">fuentes listas para entrada externa</p>
            </div>
          </div>

          {featuredIntegrations.length === 0 ? (
            <div className="glass-panel p-6 text-center text-white/40">
              No hay integraciones disponibles para tu rol actual.
            </div>
          ) : (
            <div className="grid auto-rows-fr grid-cols-1 gap-4 md:grid-cols-2 2xl:grid-cols-3">
              {featuredIntegrations.map((integration) => (
                <div key={integration.id} className="glass-card flex h-full flex-col p-5 space-y-4">
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div className="min-w-0">
                      <h4 className="break-words font-semibold">{integration.name}</h4>
                      <p className="text-xs text-white/45 mt-1">
                        {getIntegrationModeLabel(integration.connection_mode)}
                      </p>
                    </div>
                    <span
                      className={cn(
                        'shrink-0 rounded-full border px-2 py-1 text-[10px] font-bold uppercase tracking-wider',
                        getIntegrationStatusClass(integration.status),
                      )}
                    >
                      {getIntegrationStatusLabel(integration.status)}
                    </span>
                  </div>

                  <p className="min-h-[72px] flex-1 text-sm text-white/45">
                    {integration.description}
                  </p>

                  <div className="flex flex-wrap gap-2 text-[11px] text-white/40">
                    {integration.supports_webhook ? (
                      <span className="px-2 py-1 rounded-full border border-white/10 bg-white/5">
                        Webhook
                      </span>
                    ) : null}
                    {integration.supports_lead_capture ? (
                      <span className="px-2 py-1 rounded-full border border-white/10 bg-white/5">
                        Captura
                      </span>
                    ) : null}
                    {integration.sync_enabled ? (
                      <span className="px-2 py-1 rounded-full border border-white/10 bg-white/5">
                        Sync on
                      </span>
                    ) : null}
                  </div>

                  <div className="mt-auto flex flex-wrap gap-3">
                    <button
                      type="button"
                      onClick={() => {
                        if (
                          integration.connection_mode !== 'webhook' &&
                          !integrationHasConnectionData(integration)
                        ) {
                          onNavigate('integrations');
                          return;
                        }

                        void handleIntegrationAction(integration, 'connect');
                      }}
                      disabled={integrationActionId === integration.id}
                      className="glass-button-secondary disabled:opacity-50"
                    >
                      {integration.connection_mode !== 'webhook' &&
                      !integrationHasConnectionData(integration)
                        ? 'Configurar'
                        : integrationActionId === integration.id
                          ? 'Procesando...'
                          : integration.status === 'connected'
                            ? 'Reconectar'
                            : 'Conectar'}
                    </button>

                    <button
                      type="button"
                      onClick={() => void handleIntegrationAction(integration, 'test')}
                      disabled={integrationActionId === integration.id}
                      className="glass-button-secondary disabled:opacity-50"
                    >
                      Probar
                    </button>

                    <button
                      type="button"
                      onClick={() => onNavigate('integrations')}
                      className="glass-button-secondary"
                    >
                      Abrir
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </CollapsibleSection>
      ) : null}

      {canAccessSettings ? (
        <CollapsibleSection
          title="Panel total de administrador"
          description="Control global de sesiones, actividad y operaciones pendientes."
          icon={<ShieldCheck className="w-5 h-5" />}
          storageKey="dashboard-admin-v2"
          defaultOpen={false}
          actions={
            <div className="flex flex-wrap gap-3">
              {adminQuickActions.map((action) => (
                <button
                  key={action.tab}
                  type="button"
                  onClick={() => onNavigate(action.tab)}
                  className="glass-button-secondary"
                >
                  <action.icon className="w-4 h-4" />
                  {action.label}
                </button>
              ))}
            </div>
          }
        >
          {adminMessage ? (
            <div
              className={cn(
                'glass-panel p-3 text-sm',
                adminMessageTone === 'success' ? 'text-green-400' : 'text-red-400',
              )}
            >
              {adminMessage}
            </div>
          ) : null}

          {adminLoading && !adminOverview ? (
            <div className="glass-panel p-6 text-center text-white/40">
              Cargando panel administrativo...
            </div>
          ) : adminOverview ? (
            <>
              <div className="grid auto-rows-fr grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-2 2xl:grid-cols-3">
                {[
                  {
                    label: 'Invitaciones pendientes',
                    value: adminOverview.kpis.pending_invites,
                    hint: 'Miembros aún sin activar',
                    icon: UserPlus,
                  },
                  {
                    label: 'Onboardings equipo',
                    value: adminOverview.kpis.team_onboardings_open,
                    hint: 'Procesos internos abiertos',
                    icon: Users,
                  },
                  {
                    label: 'Onboardings cliente',
                    value: adminOverview.kpis.client_onboardings_open,
                    hint: 'Implementaciones activas',
                    icon: ClipboardList,
                  },
                  {
                    label: 'Sesiones activas',
                    value: adminOverview.kpis.active_sessions,
                    hint: 'Accesos vigentes ahora',
                    icon: ShieldCheck,
                  },
                  {
                    label: 'Tareas vencidas',
                    value: adminOverview.kpis.overdue_tasks,
                    hint: 'Pendientes fuera de fecha',
                    icon: AlertTriangle,
                  },
                  {
                    label: 'Facturas vencidas',
                    value: adminOverview.kpis.overdue_invoices,
                    hint: 'Cobros que requieren revisión',
                    icon: Briefcase,
                  },
                ].map((item) => (
                  <div key={item.label} className="glass-card h-full p-4">
                    <div className="flex items-center gap-3">
                      <div className="w-10 h-10 rounded-xl bg-white/5 flex items-center justify-center">
                        <item.icon className="w-5 h-5 text-brand-cyan" />
                      </div>
                      <div>
                        <p className="text-xs uppercase tracking-wider text-white/35 font-bold">
                          {item.label}
                        </p>
                        <p className="text-2xl font-bold mt-1">{item.value}</p>
                      </div>
                    </div>
                    <p className="text-xs text-white/40 mt-3">{item.hint}</p>
                  </div>
                ))}
              </div>

              {adminOverview.ai.alerts.length > 0 ? (
                <div className="glass-card p-5 space-y-4">
                  <div className="flex items-center gap-3">
                    <AlertTriangle className="w-5 h-5 text-yellow-300" />
                    <div>
                      <h4 className="font-semibold">Alertas automáticas de IA</h4>
                      <p className="text-sm text-white/45 mt-1">
                        Riesgos detectados a partir de errores y fallos repetidos recientes.
                      </p>
                    </div>
                  </div>

                  <div className="space-y-3">
                    {adminOverview.ai.alerts.map((alert) => (
                      <div
                        key={alert.id}
                        className={cn(
                          'glass-panel p-4 flex flex-wrap items-start justify-between gap-4 border',
                          getAdminAIAlertClass(alert.severity),
                        )}
                      >
                        <div>
                          <div className="flex flex-wrap items-center gap-2">
                            <span className="text-[10px] px-2 py-1 rounded-full border border-current/20 uppercase tracking-wider font-bold">
                              {alert.severity === 'critical' ? 'Crítica' : 'Vigilancia'}
                            </span>
                            <p className="font-medium">{alert.title}</p>
                          </div>
                          <p className="text-sm mt-2 text-white/80">{alert.description}</p>
                        </div>

                        <div className="flex flex-wrap gap-3">
                          {alert.run_filters ? (
                            <button
                              type="button"
                              onClick={() => openAIFilteredHistory(alert.run_filters || undefined)}
                              className="glass-button-secondary"
                            >
                              Ver fallos
                            </button>
                          ) : null}

                          {alert.trigger_key ? (
                            <button
                              type="button"
                              onClick={() => void handleDisableAITrigger(alert.trigger_key!)}
                              disabled={disablingTriggerKey === alert.trigger_key}
                              className="glass-button-secondary disabled:opacity-50"
                            >
                              {disablingTriggerKey === alert.trigger_key
                                ? 'Desactivando...'
                                : 'Desactivar trigger'}
                            </button>
                          ) : null}

                          {!alert.run_filters && !alert.trigger_key ? (
                            <button
                              type="button"
                              onClick={() => onNavigate(alert.tab)}
                              className="glass-button-secondary"
                            >
                              {alert.tab === 'settings' ? 'Abrir ajustes' : 'Abrir IA'}
                            </button>
                          ) : null}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              ) : null}

              <div className="grid grid-cols-1 xl:grid-cols-[1.2fr_0.8fr] gap-6">
                <div className="glass-card p-5 space-y-4">
                  <div className="flex items-center justify-between gap-3">
                    <div>
                      <h4 className="font-semibold">Salud de IA</h4>
                      <p className="text-sm text-white/45 mt-1">
                        Resumen de automatizaciones de los ultimos 7 dias.
                      </p>
                    </div>
                    <button
                      type="button"
                      onClick={() => onNavigate('ai')}
                      className="text-xs text-brand-cyan hover:text-white transition-colors"
                    >
                      Abrir IA
                    </button>
                  </div>

                  <div className="grid grid-cols-2 xl:grid-cols-4 gap-4">
                    {[
                      {
                        label: 'Ejecuciones',
                        value: adminOverview.ai.total_runs_7d,
                        tone: 'text-white',
                        icon: Sparkles,
                      },
                      {
                        label: 'Exitosas',
                        value: adminOverview.ai.success_runs_7d,
                        tone: 'text-green-400',
                        icon: Bot,
                      },
                      {
                        label: 'Errores',
                        value: adminOverview.ai.error_runs_7d,
                        tone: 'text-red-400',
                        icon: AlertTriangle,
                      },
                      {
                        label: 'Triggers',
                        value: adminOverview.ai.trigger_runs_7d,
                        tone: 'text-brand-cyan',
                        icon: Workflow,
                      },
                    ].map((item) => (
                      <div key={item.label} className="glass-panel p-4">
                        <div className="flex items-center gap-3">
                          <div className="w-10 h-10 rounded-xl bg-white/5 flex items-center justify-center">
                            <item.icon className={cn('w-5 h-5', item.tone)} />
                          </div>
                          <div>
                            <p className="text-xs uppercase tracking-wider text-white/35 font-bold">
                              {item.label}
                            </p>
                            <p className={cn('text-2xl font-bold mt-1', item.tone)}>{item.value}</p>
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>

                  <div className="glass-panel p-4 flex items-center justify-between gap-3">
                    <div>
                      <p className="text-xs uppercase tracking-wider text-white/35 font-bold">
                        Ratio de error 7d
                      </p>
                      <p className="text-2xl font-bold mt-1">
                        {adminOverview.ai.error_rate_7d}%
                      </p>
                    </div>
                    <span
                      className={cn(
                        'text-[10px] px-2 py-1 rounded-full border uppercase tracking-wider font-bold',
                        adminOverview.ai.error_rate_7d === 0
                          ? 'bg-green-500/10 text-green-300 border-green-500/20'
                          : adminOverview.ai.error_rate_7d <= 15
                            ? 'bg-yellow-500/10 text-yellow-300 border-yellow-500/20'
                            : 'bg-red-500/10 text-red-300 border-red-500/20',
                      )}
                    >
                      {adminOverview.ai.error_rate_7d === 0
                        ? 'Estable'
                        : adminOverview.ai.error_rate_7d <= 15
                          ? 'Vigilar'
                          : 'Atencion'}
                    </span>
                  </div>
                </div>

                <div className="glass-card p-5 space-y-5">
                  <div>
                    <h4 className="font-semibold">Uso IA</h4>
                    <p className="text-sm text-white/45 mt-1">
                      Automatizaciones y triggers mas utilizados en 7 dias.
                    </p>
                  </div>

                  <div className="space-y-3">
                    <div className="flex items-center justify-between gap-3">
                      <p className="text-xs uppercase tracking-wider text-white/35 font-bold">
                        Automatizaciones top
                      </p>
                      <span className="text-[10px] px-2 py-1 rounded-full border border-white/10 bg-white/5 text-white/60 uppercase tracking-wider font-bold">
                        7d
                      </span>
                    </div>

                    {adminOverview.ai.top_automations.length === 0 ? (
                      <div className="glass-panel p-4 text-sm text-white/40">
                        Sin ejecuciones IA recientes.
                      </div>
                    ) : (
                      <div className="space-y-3">
                        {adminOverview.ai.top_automations.map((item) => (
                          <button
                            key={item.automation}
                            type="button"
                            onClick={() => onNavigate('ai')}
                            className="w-full text-left glass-panel p-3 hover:border-brand-blue/20 transition-colors"
                          >
                            <div className="flex items-center justify-between gap-3">
                              <div>
                                <p className="font-medium">{getAdminAutomationLabel(item.automation)}</p>
                                <p className="text-xs text-white/45 mt-1">
                                  {item.total} ejecuciones
                                  {item.errors > 0 ? ` • ${item.errors} con error` : ' • sin errores'}
                                </p>
                              </div>
                              <span className="text-lg font-bold">{item.total}</span>
                            </div>
                          </button>
                        ))}
                      </div>
                    )}
                  </div>

                  <div className="space-y-3">
                    <p className="text-xs uppercase tracking-wider text-white/35 font-bold">
                      Triggers mas usados
                    </p>

                    {adminOverview.ai.top_triggers.length === 0 ? (
                      <div className="glass-panel p-4 text-sm text-white/40">
                        No hubo disparadores automaticos recientes.
                      </div>
                    ) : (
                      <div className="space-y-3">
                        {adminOverview.ai.top_triggers.map((item) => (
                          <button
                            key={item.trigger_key}
                            type="button"
                            onClick={() => onNavigate('ai')}
                            className="w-full text-left glass-panel p-3 hover:border-brand-blue/20 transition-colors"
                          >
                            <div className="flex items-center justify-between gap-3">
                              <div>
                                <p className="font-medium">{getAdminTriggerLabel(item.trigger_key)}</p>
                                <p className="text-xs text-white/45 mt-1">
                                  {item.total} ejecuciones automaticas
                                </p>
                              </div>
                              <span className="text-lg font-bold">{item.total}</span>
                            </div>
                          </button>
                        ))}
                      </div>
                    )}
                  </div>

                  <div className="space-y-3">
                    <div className="flex items-center justify-between gap-3">
                      <p className="text-xs uppercase tracking-wider text-white/35 font-bold">
                        Triggers desactivados
                      </p>
                      {adminOverview.ai.disabled_triggers.length > 1 ? (
                        <button
                          type="button"
                          onClick={() => {
                            setConfirmBulkEnable(true);
                            setConfirmEnableTriggerKey(null);
                          }}
                          className="text-xs text-brand-cyan hover:text-white transition-colors"
                        >
                          Reactivar todos
                        </button>
                      ) : null}
                    </div>

                    {adminOverview.ai.disabled_triggers.length === 0 ? (
                      <div className="glass-panel p-4 text-sm text-white/40">
                        No hay triggers IA desactivados.
                      </div>
                    ) : (
                      <div className="space-y-3">
                        {confirmBulkEnable ? (
                          <div className="glass-panel p-4 space-y-3 border border-yellow-500/20 bg-yellow-500/10">
                            <div>
                              <p className="font-medium text-yellow-200">
                                Confirmar reactivación masiva
                              </p>
                              <p className="text-sm text-white/75 mt-2">
                                Vas a reactivar {adminOverview.ai.disabled_triggers.length} triggers
                                IA. Revísalos primero si venían acumulando errores recientes.
                              </p>
                            </div>

                            <div className="flex flex-wrap gap-3">
                              <button
                                type="button"
                                onClick={() => {
                                  setConfirmBulkEnable(false);
                                }}
                                className="glass-button-secondary"
                              >
                                Cancelar
                              </button>
                              <button
                                type="button"
                                onClick={() => void handleEnableAllAITriggers()}
                                disabled={enablingAllTriggers}
                                className="glass-button-secondary disabled:opacity-50"
                              >
                                {enablingAllTriggers ? 'Reactivando...' : 'Confirmar reactivación'}
                              </button>
                            </div>
                          </div>
                        ) : null}

                        {adminOverview.ai.disabled_triggers.map((item) => (
                          <div
                            key={item.trigger_key}
                            className="glass-panel p-3 space-y-3"
                          >
                            <div className="flex items-center justify-between gap-3">
                              <div>
                                <p className="font-medium">{getAdminTriggerLabel(item.trigger_key)}</p>
                                <p className="text-xs text-white/45 mt-1">
                                  {getDisabledSinceLabel(item.disabled_since)}
                                </p>
                                <p className="text-xs text-white/35 mt-1">
                                  {item.recent_errors_24h > 0
                                    ? `${item.recent_errors_24h} errores en 24h antes de desactivarlo`
                                    : 'Sin errores recientes registrados'}
                                </p>
                                <p className="text-xs text-white/35 mt-1">
                                  {getDisabledTriggerRecoveryLabel(item)}
                                </p>
                              </div>
                              <span className="text-[10px] px-2 py-1 rounded-full border border-white/10 bg-white/5 text-white/60 uppercase tracking-wider font-bold">
                                Off
                              </span>
                            </div>

                            <div className="flex flex-wrap gap-3">
                              {item.recent_errors_24h > 0 ? (
                                <button
                                  type="button"
                                  onClick={() =>
                                    openAIFilteredHistory({
                                      status: 'error',
                                      mode: 'trigger',
                                      trigger_key: item.trigger_key,
                                    })
                                  }
                                  className="glass-button-secondary"
                                >
                                  Ver errores
                                </button>
                              ) : null}

                              <button
                                type="button"
                                onClick={() => {
                                  if (item.recent_errors_24h > 0) {
                                    setConfirmEnableTriggerKey(item.trigger_key);
                                    setConfirmBulkEnable(false);
                                    return;
                                  }

                                  void handleEnableAITrigger(item.trigger_key);
                                }}
                                disabled={enablingTriggerKey === item.trigger_key}
                                className="glass-button-secondary disabled:opacity-50"
                              >
                                {enablingTriggerKey === item.trigger_key
                                  ? 'Reactivando...'
                                  : 'Reactivar'}
                              </button>
                            </div>

                            {confirmEnableTriggerKey === item.trigger_key ? (
                              <div className="glass-panel p-4 space-y-3 border border-yellow-500/20 bg-yellow-500/10">
                                <div>
                                  <p className="font-medium text-yellow-200">
                                    Confirmar reactivación de {getAdminTriggerLabel(item.trigger_key)}
                                  </p>
                                  <p className="text-sm text-white/75 mt-2">
                                    Este trigger acumuló {item.recent_errors_24h} errores en las
                                    últimas 24 horas y lleva {getDisabledSinceLabel(item.disabled_since).toLowerCase()}.
                                    {` ${getDisabledTriggerRecoveryLabel(item)}.`} Revisa el
                                    historial si necesitas contexto antes de volver a activarlo.
                                  </p>
                                </div>

                                <div className="flex flex-wrap gap-3">
                                  <button
                                    type="button"
                                    onClick={() =>
                                      openAIFilteredHistory({
                                        status: 'error',
                                        mode: 'trigger',
                                        trigger_key: item.trigger_key,
                                      })
                                    }
                                    className="glass-button-secondary"
                                  >
                                    Abrir errores
                                  </button>
                                  <button
                                    type="button"
                                    onClick={() => setConfirmEnableTriggerKey(null)}
                                    className="glass-button-secondary"
                                  >
                                    Cancelar
                                  </button>
                                  <button
                                    type="button"
                                    onClick={() => void handleEnableAITrigger(item.trigger_key)}
                                    disabled={enablingTriggerKey === item.trigger_key}
                                    className="glass-button-secondary disabled:opacity-50"
                                  >
                                    {enablingTriggerKey === item.trigger_key
                                      ? 'Reactivando...'
                                      : 'Confirmar reactivación'}
                                  </button>
                                </div>
                              </div>
                            ) : null}
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                </div>
              </div>

              <div className="grid grid-cols-1 gap-6 2xl:grid-cols-2">
                <div className="glass-card p-5 space-y-4">
                  <div className="flex items-center justify-between gap-3">
                    <h4 className="font-semibold">Equipo pendiente</h4>
                    <button
                      type="button"
                      onClick={() => onNavigate('team')}
                      className="text-xs text-brand-cyan hover:text-white transition-colors"
                    >
                      Abrir equipo
                    </button>
                  </div>

                  {adminOverview.pending_team_members.length === 0 ? (
                    <div className="text-sm text-white/40">No hay miembros pendientes.</div>
                  ) : (
                    <div className="space-y-3">
                      {adminOverview.pending_team_members.map((member) => (
                        <button
                          key={member.id}
                          type="button"
                          onClick={() => onNavigate('team')}
                          className="w-full text-left glass-panel p-3 hover:border-brand-blue/20 transition-colors"
                        >
                          <div className="flex items-start justify-between gap-3">
                            <div>
                              <p className="font-medium">{member.name}</p>
                              <p className="text-xs text-white/45">{member.role}</p>
                            </div>
                            <span className="text-[10px] px-2 py-1 rounded-full border border-white/10 bg-white/5 text-white/60 uppercase tracking-wider font-bold">
                              {member.access_status === 'invited' ? 'Invitado' : 'Activo'}
                            </span>
                          </div>
                          <p className="text-xs text-white/40 mt-2">{member.email}</p>
                          <p className="text-xs text-white/45 mt-2">
                            {member.onboarding
                              ? `${member.onboarding.progress}% completado`
                              : 'Sin onboarding visible'}
                          </p>
                        </button>
                      ))}
                    </div>
                  )}
                </div>

                <div className="glass-card p-5 space-y-4">
                  <div className="flex items-center justify-between gap-3">
                    <h4 className="font-semibold">Sesiones activas</h4>
                    <button
                      type="button"
                      onClick={() => void loadAdminOverview()}
                      className="text-xs text-brand-cyan hover:text-white transition-colors"
                    >
                      Refrescar
                    </button>
                  </div>

                  {adminOverview.sessions.length === 0 ? (
                    <div className="text-sm text-white/40">No hay sesiones activas.</div>
                  ) : (
                    <div className="space-y-3">
                      {adminOverview.sessions.map((session) => (
                        <div key={session.id} className="glass-panel p-3 space-y-3">
                          <div className="flex items-start justify-between gap-3">
                            <div>
                              <p className="font-medium">{session.name}</p>
                              <p className="text-xs text-white/45">{session.email}</p>
                            </div>
                            {session.is_current ? (
                              <span className="text-[10px] px-2 py-1 rounded-full border border-brand-blue/20 bg-brand-blue/10 text-brand-blue uppercase tracking-wider font-bold">
                                Sesión actual
                              </span>
                            ) : null}
                          </div>
                          <div className="text-xs text-white/40 space-y-1">
                            <p>{session.role}</p>
                            <p>Inicio: {formatShortDateTime(session.created_at)}</p>
                            <p>Expira: {formatShortDateTime(session.expires_at)}</p>
                          </div>
                          <button
                            type="button"
                            disabled={session.is_current || revokingSessionId === session.id}
                            onClick={() => void handleSessionRevoke(session.id)}
                            className="glass-button-secondary w-full justify-center disabled:opacity-50"
                          >
                            <LogOut className="w-4 h-4" />
                            {revokingSessionId === session.id ? 'Revocando...' : 'Revocar sesión'}
                          </button>
                        </div>
                      ))}
                    </div>
                  )}
                </div>

                <div className="glass-card p-5 space-y-4">
                  <div className="flex items-center justify-between gap-3">
                    <h4 className="font-semibold">Clientes en onboarding</h4>
                    <button
                      type="button"
                      onClick={() => onNavigate('clients')}
                      className="text-xs text-brand-cyan hover:text-white transition-colors"
                    >
                      Abrir clientes
                    </button>
                  </div>

                  {adminOverview.pending_client_onboardings.length === 0 ? (
                    <div className="text-sm text-white/40">
                      No hay onboardings de clientes pendientes.
                    </div>
                  ) : (
                    <div className="space-y-3">
                      {adminOverview.pending_client_onboardings.map((item) => (
                        <button
                          key={item.id}
                          type="button"
                          onClick={() => onNavigate('clients')}
                          className="w-full text-left glass-panel p-3 hover:border-brand-blue/20 transition-colors"
                        >
                          <div className="flex items-start justify-between gap-3">
                            <div>
                              <p className="font-medium">{item.client_name}</p>
                              <p className="text-xs text-white/45">
                                {item.project_name || 'Sin proyecto enlazado'}
                              </p>
                            </div>
                            <span className="text-[10px] px-2 py-1 rounded-full border border-white/10 bg-white/5 text-white/60 uppercase tracking-wider font-bold">
                              {item.status}
                            </span>
                          </div>
                          <div className="mt-3 h-2 rounded-full bg-white/5 overflow-hidden">
                            <div
                              className="h-full bg-gradient-to-r from-brand-blue to-brand-cyan"
                              style={{ width: `${item.progress}%` }}
                            />
                          </div>
                          <div className="flex items-center justify-between mt-2 text-xs text-white/40">
                            <span>{item.progress}% completado</span>
                            <span>Objetivo: {formatShortDateTime(item.target_launch_date)}</span>
                          </div>
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              </div>

              <div className="glass-card p-5 space-y-4">
                <div className="flex items-center justify-between gap-3">
                  <h4 className="font-semibold">Actividad administrativa reciente</h4>
                  <button
                    type="button"
                    onClick={() => onNavigate('settings')}
                    className="text-xs text-brand-cyan hover:text-white transition-colors"
                  >
                    Ver auditoría completa
                  </button>
                </div>

                {adminOverview.recent_audit.length === 0 ? (
                  <div className="text-sm text-white/40">No hay actividad auditada todavía.</div>
                ) : (
                  <div className="space-y-3">
                    {adminOverview.recent_audit.map((item) => (
                      <button
                        key={item.id}
                        type="button"
                        onClick={() => onNavigate('settings')}
                        className="w-full text-left glass-panel p-3 hover:border-brand-blue/20 transition-colors"
                      >
                        <div className="flex flex-wrap items-start justify-between gap-3">
                          <div>
                            <div className="flex flex-wrap items-center gap-2">
                              <span
                                className={cn(
                                  'text-[10px] px-2 py-1 rounded-full border uppercase tracking-wider font-bold',
                                  getAuditActionBadgeClass(item.action),
                                )}
                              >
                                {item.action}
                              </span>
                              <span className="text-[10px] px-2 py-1 rounded-full border border-white/10 bg-white/5 text-white/60 uppercase tracking-wider font-bold">
                                {item.entity_type}
                              </span>
                            </div>
                            <p className="font-medium mt-3">{item.description}</p>
                            <p className="text-xs text-white/45 mt-2">
                              {item.actor_name}
                              {item.actor_email ? ` • ${item.actor_email}` : ''}
                            </p>
                          </div>
                          <p className="text-xs text-white/40">
                            {formatShortDateTime(item.created_at)}
                          </p>
                        </div>
                      </button>
                    ))}
                  </div>
                )}
              </div>
            </>
          ) : (
            <div className="glass-panel p-6 text-center text-white/40">
              No se pudo construir el resumen administrativo.
            </div>
          )}
        </CollapsibleSection>
      ) : null}

      {!isAdminDashboard ? (
        <CollapsibleSection
          title="Visión comercial"
          description="Ingresos y pipeline para lectura rápida del negocio."
          icon={<TrendingUp className="w-5 h-5" />}
          storageKey="dashboard-commercial-overview-v2"
          defaultOpen={false}
        >
          <div className="grid grid-cols-1 gap-8 lg:grid-cols-3">
        <motion.div
          initial={{ opacity: 0, scale: 0.95 }}
          animate={{ opacity: 1, scale: 1 }}
          className="glass-panel min-w-0 p-6 lg:col-span-2"
        >
          <div className="mb-6 flex flex-wrap items-center justify-between gap-3">
            <h3 className="font-bold text-lg">Rendimiento de Ingresos</h3>
            <select
              value={range}
              onChange={(event) => setRange(event.target.value as DashboardRange)}
              className="glass-input text-xs py-1"
              aria-label="Seleccionar rango de ingresos"
            >
              <option value="7d">Últimos 7 días</option>
              <option value="30d">Último mes</option>
            </select>
          </div>
          <div className="h-[300px] w-full">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={revenueTrend}>
                <defs>
                  <linearGradient id="colorRev" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#0066FF" stopOpacity={0.3} />
                    <stop offset="95%" stopColor="#0066FF" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid
                  strokeDasharray="3 3"
                  stroke="rgba(255,255,255,0.05)"
                  vertical={false}
                />
                <XAxis
                  dataKey="name"
                  stroke="rgba(255,255,255,0.3)"
                  fontSize={12}
                  tickLine={false}
                  axisLine={false}
                />
                <YAxis
                  stroke="rgba(255,255,255,0.3)"
                  fontSize={12}
                  tickLine={false}
                  axisLine={false}
                />
                <Tooltip
                  formatter={(value: number) => [`$${Number(value).toLocaleString()}`, 'Ingresos']}
                  contentStyle={{
                    backgroundColor: 'rgba(10, 10, 10, 0.9)',
                    border: '1px solid rgba(255,255,255,0.1)',
                    borderRadius: '12px',
                  }}
                  itemStyle={{ color: '#fff' }}
                />
                <Area
                  type="monotone"
                  dataKey="revenue"
                  stroke="#0066FF"
                  strokeWidth={3}
                  fillOpacity={1}
                  fill="url(#colorRev)"
                />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </motion.div>

        <motion.div
          initial={{ opacity: 0, scale: 0.95 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ delay: 0.1 }}
          className="glass-panel min-w-0 p-6"
        >
          <h3 className="font-bold text-lg mb-6">Pipeline de Ventas</h3>
          {canAccessLeads ? (
            <>
              <div className="h-[300px] w-full">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart
                    data={
                      hasPipelineData
                        ? pipelineData
                        : [
                            { name: 'Nuevos', value: 45, color: pipelineColors.nuevos },
                            { name: 'Contactados', value: 32, color: pipelineColors.contactados },
                            { name: 'Reunión', value: 18, color: pipelineColors.reunion },
                            { name: 'Propuesta', value: 12, color: pipelineColors.propuesta },
                            { name: 'Cerrados', value: 8, color: pipelineColors.cerrados },
                          ]
                    }
                    layout="vertical"
                  >
                    <XAxis type="number" hide />
                    <YAxis
                      dataKey="name"
                      type="category"
                      stroke="rgba(255,255,255,0.5)"
                      fontSize={11}
                      width={80}
                      tickLine={false}
                      axisLine={false}
                    />
                    <Tooltip
                      cursor={{ fill: 'rgba(255,255,255,0.05)' }}
                      formatter={(value: number) => [`${value} leads`, 'Total']}
                      contentStyle={{
                        backgroundColor: 'rgba(10, 10, 10, 0.9)',
                        border: '1px solid rgba(255,255,255,0.1)',
                        borderRadius: '12px',
                      }}
                    />
                    <Bar dataKey="value" radius={[0, 4, 4, 0]} barSize={20}>
                      {(hasPipelineData ? pipelineData : [
                        { name: 'Nuevos', value: 45, color: pipelineColors.nuevos },
                        { name: 'Contactados', value: 32, color: pipelineColors.contactados },
                        { name: 'Reunión', value: 18, color: pipelineColors.reunion },
                        { name: 'Propuesta', value: 12, color: pipelineColors.propuesta },
                        { name: 'Cerrados', value: 8, color: pipelineColors.cerrados },
                      ]).map((entry, index) => (
                        <Cell key={`cell-${index}`} fill={entry.color} />
                      ))}
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              </div>
              <div className="mt-4 space-y-2">
                {(hasPipelineData ? pipelineData : [
                  { name: 'Nuevos', value: 45, color: pipelineColors.nuevos },
                  { name: 'Contactados', value: 32, color: pipelineColors.contactados },
                  { name: 'Reunión', value: 18, color: pipelineColors.reunion },
                  { name: 'Propuesta', value: 12, color: pipelineColors.propuesta },
                  { name: 'Cerrados', value: 8, color: pipelineColors.cerrados },
                ]).map((item) => (
                  <div key={item.name} className="flex justify-between items-center text-xs">
                    <span className="text-white/50">{item.name}</span>
                    <span className="font-bold">{item.value} leads</span>
                  </div>
                ))}
              </div>
            </>
          ) : (
            <div className="h-[300px] w-full flex items-center justify-center text-sm text-white/40">
              No tienes acceso al pipeline de ventas.
            </div>
          )}
        </motion.div>
          </div>
        </CollapsibleSection>
      ) : null}

      {!isAdminDashboard ? (
        <CollapsibleSection
          title="Pulso operativo"
          description="Actividad reciente y tareas pendientes del equipo."
          icon={<Activity className="w-5 h-5" />}
          storageKey="dashboard-operational-pulse-v2"
          defaultOpen={false}
        >
          <div className="grid grid-cols-1 gap-8 lg:grid-cols-2">
        <div ref={activityRef} className="glass-panel min-w-0 p-6">
          <h3 className="font-bold text-lg mb-4">Actividad Reciente</h3>
          <div className="space-y-4">
            {visibleActivityItems.length === 0 ? (
              <div className="p-3 rounded-xl border border-white/5 text-sm text-white/40">
                No tienes actividad disponible para tu rol actual.
              </div>
            ) : (
              visibleActivityItems.map((item) => (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => onNavigate(item.tab)}
                  className="w-full text-left flex items-center gap-4 p-3 rounded-xl hover:bg-white/5 transition-colors cursor-pointer group"
                >
                  <div className="w-10 h-10 rounded-full bg-brand-blue/20 flex items-center justify-center text-brand-blue group-hover:bg-brand-blue group-hover:text-white transition-all">
                    <TrendingUp className="w-5 h-5" />
                  </div>
                  <div className="flex-1">
                    <p className="text-sm font-medium">{item.title}</p>
                    <p className="text-xs text-white/40">{item.subtitle}</p>
                  </div>
                  <ArrowUpRight className="w-4 h-4 text-white/20 group-hover:text-white transition-colors" />
                </button>
              ))
            )}
          </div>
        </div>

        <div ref={tasksRef} className="glass-panel min-w-0 p-6">
          <h3 className="font-bold text-lg mb-4">Tareas Pendientes</h3>
          <div className="space-y-4">
            {!canAccessTasks ? (
              <div className="p-3 rounded-xl border border-white/5 text-sm text-white/40">
                No tienes acceso a tareas.
              </div>
            ) : pendingTasks.length === 0 ? (
              <div className="p-3 rounded-xl border border-white/5 text-sm text-white/40">
                No hay tareas pendientes.
              </div>
            ) : (
              pendingTasks.map((task) => (
                <div
                  key={task.id}
                  onClick={() => onNavigate('tasks')}
                  onKeyDown={(event) => {
                    if (event.key === 'Enter' || event.key === ' ') {
                      event.preventDefault();
                      onNavigate('tasks');
                    }
                  }}
                  role="button"
                  tabIndex={0}
                  className="flex items-center gap-4 p-3 rounded-xl border border-white/5 hover:border-brand-blue/30 transition-all cursor-pointer"
                >
                  <button
                    type="button"
                    disabled={updatingTaskId === task.id}
                    onClick={(event) => {
                      event.stopPropagation();
                      void handleTaskToggle(task.id, task.status);
                    }}
                    className="w-5 h-5 rounded border border-white/20 flex items-center justify-center disabled:opacity-50"
                    aria-label={`Marcar tarea ${task.title} como completada`}
                    title="Marcar como completada"
                  >
                    {updatingTaskId === task.id ? (
                      <div className="w-2 h-2 rounded-full bg-white/50" />
                    ) : null}
                  </button>
                  <div className="flex-1">
                    <p className="text-sm font-medium">{task.title}</p>
                    <div className="flex gap-3 mt-1">
                      <span
                        className={cn(
                          'text-[10px] px-2 py-0.5 rounded-full',
                          getPriorityClass(task.priority),
                        )}
                      >
                        {getPriorityLabel(task.priority)}
                      </span>
                      <span className="text-[10px] text-white/40 flex items-center gap-1">
                        <Clock className="w-3 h-3" />{' '}
                        {new Date(task.due_date).toLocaleDateString('es-ES')}
                      </span>
                    </div>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>
          </div>
        </CollapsibleSection>
      ) : null}
    </div>
  );
};
