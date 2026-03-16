import React, { useEffect, useState } from 'react';
import {
  ArrowRight,
  CalendarClock,
  CheckCircle2,
  ClipboardList,
  Clock3,
  FileText,
  Flame,
  Plus,
  Search,
  Filter,
  MoreHorizontal,
  Mail,
  Phone,
  ChevronRight,
  UserPlus,
  MessageSquarePlus,
  Save,
  History,
  Archive,
  RotateCcw,
  Trash2,
  TrendingUp,
} from 'lucide-react';
import { AnimatePresence, motion } from 'motion/react';
import { Client, Lead, LeadNote, TeamMember, cn } from '../types';
import { CollapsibleSection } from './CollapsibleSection';
import { InteractiveSummaryCard } from './InteractiveSummaryCard';
import { openMailDraft } from '../lib/communication';

type LeadStatusFilter = 'all' | Lead['status'];
type LeadSummaryFilter = 'all' | 'active' | 'hot' | 'due' | 'closed';
type LeadPresetKey = 'contact' | 'meeting' | 'documents' | 'proposal' | 'negotiation';

interface LeadConversionResponse {
  lead: Lead;
  client: Client;
  alreadyConverted: boolean;
  matchedBy: 'lead' | 'company' | 'new';
  operational_setup?: {
    created_project: boolean;
    created_onboarding: boolean;
    created_onboarding_tasks: number;
    created_operational_tasks: number;
  } | null;
}

interface LeadFormState {
  name: string;
  company: string;
  email: string;
  phone: string;
  source: string;
  service: string;
  budget: string;
  status: Lead['status'];
}

interface LeadFollowUpResponse {
  lead: Lead;
  notes: LeadNote[];
}

interface LeadNoteCreationResponse {
  note: LeadNote;
  lead: Lead;
}

interface LeadFollowUpFormState {
  next_action: string;
  next_contact_date: string;
  note_type: LeadNote['type'];
  note_content: string;
}

const leadStatusOrder: Lead['status'][] = [
  'new',
  'contacted',
  'meeting',
  'diagnosis',
  'proposal',
  'negotiation',
  'closed',
  'lost',
];

const createInitialLeadForm = (): LeadFormState => ({
  name: '',
  company: '',
  email: '',
  phone: '',
  source: '',
  service: '',
  budget: '',
  status: 'new',
});

const getResponseJson = async <T,>(response: Response): Promise<T> => {
  if (!response.ok) {
    const errorData = (await response.json().catch(() => null)) as { error?: string } | null;
    throw new Error(errorData?.error || `Request failed with status ${response.status}`);
  }

  return response.json() as Promise<T>;
};

const getClientLookupKey = (company?: string | null) => company?.trim().toLowerCase() || '';

const createLeadFollowUpForm = (lead: Lead): LeadFollowUpFormState => ({
  next_action: lead.next_action || '',
  next_contact_date: lead.next_contact_date ? lead.next_contact_date.slice(0, 10) : '',
  note_type: 'note',
  note_content: '',
});

const getStatusColor = (status: Lead['status']) => {
  switch (status) {
    case 'new':
      return 'bg-blue-500/20 text-blue-400 border-blue-500/30';
    case 'contacted':
      return 'bg-purple-500/20 text-purple-400 border-purple-500/30';
    case 'meeting':
      return 'bg-cyan-500/20 text-cyan-400 border-cyan-500/30';
    case 'diagnosis':
      return 'bg-yellow-500/20 text-yellow-400 border-yellow-500/30';
    case 'proposal':
      return 'bg-pink-500/20 text-pink-400 border-pink-500/30';
    case 'negotiation':
      return 'bg-orange-500/20 text-orange-400 border-orange-500/30';
    case 'closed':
      return 'bg-green-500/20 text-green-400 border-green-500/30';
    case 'lost':
      return 'bg-white/10 text-white/60 border-white/10';
    default:
      return 'bg-white/10 text-white/60 border-white/10';
  }
};

const getStatusLabel = (status: Lead['status']) => {
  switch (status) {
    case 'new':
      return 'Nuevo lead';
    case 'contacted':
      return 'Contactado';
    case 'meeting':
      return 'Reunión agendada';
    case 'diagnosis':
      return 'Diagnóstico realizado';
    case 'proposal':
      return 'Propuesta enviada';
    case 'negotiation':
      return 'Negociación';
    case 'closed':
      return 'Cliente cerrado';
    case 'lost':
      return 'Perdido';
    default:
      return status;
  }
};

const getNoteTypeLabel = (type: LeadNote['type']) => {
  switch (type) {
    case 'call':
      return 'Llamada';
    case 'email':
      return 'Email';
    case 'meeting':
      return 'Reunión';
    case 'whatsapp':
      return 'WhatsApp';
    case 'note':
    default:
      return 'Nota';
  }
};

const getNoteTypeColor = (type: LeadNote['type']) => {
  switch (type) {
    case 'call':
      return 'bg-cyan-500/10 text-cyan-300 border-cyan-500/20';
    case 'email':
      return 'bg-blue-500/10 text-blue-300 border-blue-500/20';
    case 'meeting':
      return 'bg-purple-500/10 text-purple-300 border-purple-500/20';
    case 'whatsapp':
      return 'bg-green-500/10 text-green-300 border-green-500/20';
    case 'note':
    default:
      return 'bg-white/10 text-white/60 border-white/10';
  }
};

const formatLeadDate = (value?: string | null, withTime = false) => {
  if (!value) {
    return 'Sin fecha';
  }

  const parsedDate = new Date(value);

  if (Number.isNaN(parsedDate.getTime())) {
    return value;
  }

  return parsedDate.toLocaleString(
    'es-ES',
    withTime
      ? {
          day: '2-digit',
          month: 'short',
          hour: '2-digit',
          minute: '2-digit',
        }
      : {
          day: '2-digit',
          month: 'short',
          year: 'numeric',
        },
  );
};

const getFollowUpBadge = (lead: Lead) => {
  if (lead.archived_at) {
    return {
      label: 'Archivado',
      className: 'bg-white/10 text-white/60 border-white/10',
    };
  }

  if (lead.status === 'closed') {
    return {
      label: 'Cerrado',
      className: 'bg-green-500/10 text-green-300 border-green-500/20',
    };
  }

  if (lead.status === 'lost') {
    return {
      label: 'Perdido',
      className: 'bg-white/10 text-white/60 border-white/10',
    };
  }

  if (!lead.next_contact_date) {
    return {
      label: 'Sin seguimiento',
      className: 'bg-white/10 text-white/60 border-white/10',
    };
  }

  const today = new Date();
  today.setHours(0, 0, 0, 0);

  const nextDate = new Date(lead.next_contact_date);
  nextDate.setHours(0, 0, 0, 0);

  if (nextDate.getTime() < today.getTime()) {
    return {
      label: 'Seguimiento vencido',
      className: 'bg-red-500/10 text-red-300 border-red-500/20',
    };
  }

  if (nextDate.getTime() === today.getTime()) {
    return {
      label: 'Seguimiento hoy',
      className: 'bg-amber-500/10 text-amber-300 border-amber-500/20',
    };
  }

  return {
    label: 'Seguimiento programado',
    className: 'bg-blue-500/10 text-blue-300 border-blue-500/20',
  };
};

const addDaysToDateInput = (days: number) => {
  const date = new Date();
  date.setHours(0, 0, 0, 0);
  date.setDate(date.getDate() + days);
  return date.toISOString().slice(0, 10);
};

const includesCommercialKeyword = (value: string | null | undefined, keywords: string[]) => {
  const normalizedValue = value?.trim().toLowerCase() || '';
  return keywords.some((keyword) => normalizedValue.includes(keyword));
};

const getLeadStatusIndex = (status: Lead['status']) => leadStatusOrder.indexOf(status);

const getLeadStageSummary = (status: Lead['status']) => {
  switch (status) {
    case 'new':
      return 'Captado y pendiente de validación';
    case 'contacted':
      return 'Primer alcance comercial';
    case 'meeting':
      return 'Discovery o reunión activa';
    case 'diagnosis':
      return 'Diagnóstico y recopilación';
    case 'proposal':
      return 'Oferta comercial enviada';
    case 'negotiation':
      return 'Objeciones y cierre activos';
    case 'closed':
      return 'Lead ganado';
    case 'lost':
    default:
      return 'Oportunidad descartada';
  }
};

const getLeadScore = (lead: Lead) => {
  let score = 0;

  if (lead.email?.trim()) {
    score += 12;
  }

  if (lead.phone?.trim()) {
    score += 10;
  }

  if (lead.company?.trim()) {
    score += 8;
  }

  if (lead.source?.trim()) {
    score += 8;
  }

  if (lead.service?.trim()) {
    score += 8;
  }

  if (lead.next_action?.trim()) {
    score += 6;
  }

  if (lead.next_contact_date) {
    score += 8;
  }

  const budget = Number(lead.budget || 0);

  if (budget >= 10000) {
    score += 24;
  } else if (budget >= 5000) {
    score += 18;
  } else if (budget >= 2000) {
    score += 12;
  } else if (budget > 0) {
    score += 6;
  }

  switch (lead.status) {
    case 'contacted':
      score += 6;
      break;
    case 'meeting':
      score += 12;
      break;
    case 'diagnosis':
      score += 18;
      break;
    case 'proposal':
      score += 24;
      break;
    case 'negotiation':
      score += 30;
      break;
    case 'closed':
      score += 36;
      break;
    case 'lost':
      score -= 40;
      break;
    default:
      break;
  }

  return Math.max(0, Math.min(100, score));
};

const getLeadScoreLabel = (lead: Lead, score: number) => {
  if (lead.status === 'closed') {
    return 'Ganado';
  }

  if (lead.status === 'lost') {
    return 'Descartado';
  }

  if (score >= 80) {
    return 'Muy alto';
  }

  if (score >= 60) {
    return 'Alto';
  }

  if (score >= 40) {
    return 'Medio';
  }

  return 'Bajo';
};

const getLeadScoreClass = (lead: Lead, score: number) => {
  if (lead.status === 'closed') {
    return 'bg-emerald-500/10 text-emerald-300 border-emerald-500/20';
  }

  if (lead.status === 'lost') {
    return 'bg-white/10 text-white/60 border-white/10';
  }

  if (score >= 80) {
    return 'bg-red-500/10 text-red-300 border-red-500/20';
  }

  if (score >= 60) {
    return 'bg-amber-500/10 text-amber-300 border-amber-500/20';
  }

  if (score >= 40) {
    return 'bg-brand-cyan/20 text-brand-cyan border-brand-cyan/20';
  }

  return 'bg-white/10 text-white/60 border-white/10';
};

const isLeadFollowUpDue = (lead: Lead) => {
  if (!lead.next_contact_date || lead.archived_at || ['closed', 'lost'].includes(lead.status)) {
    return false;
  }

  const today = new Date();
  today.setHours(0, 0, 0, 0);

  const nextDate = new Date(lead.next_contact_date);
  nextDate.setHours(0, 0, 0, 0);

  return nextDate.getTime() <= today.getTime();
};

interface LeadsManagerProps {
  onNavigate?: (tab: string) => void;
}

export const LeadsManager: React.FC<LeadsManagerProps> = ({ onNavigate }) => {
  const [leads, setLeads] = useState<Lead[]>([]);
  const [clients, setClients] = useState<Client[]>([]);
  const [teamMembers, setTeamMembers] = useState<TeamMember[]>([]);
  const [followUpNotesByLeadId, setFollowUpNotesByLeadId] = useState<
    Record<number, { notes: LeadNote[]; loaded: boolean; loading: boolean }>
  >({});
  const [followUpForms, setFollowUpForms] = useState<Record<number, LeadFollowUpFormState>>({});
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState<LeadStatusFilter>('all');
  const [serviceFilter, setServiceFilter] = useState('all');
  const [summaryFilter, setSummaryFilter] = useState<LeadSummaryFilter>('all');
  const [showFilters, setShowFilters] = useState(false);
  const [showArchived, setShowArchived] = useState(false);
  const [showNewLeadForm, setShowNewLeadForm] = useState(false);
  const [expandedLeadId, setExpandedLeadId] = useState<number | null>(null);
  const [creatingLead, setCreatingLead] = useState(false);
  const [assigningLeads, setAssigningLeads] = useState(false);
  const [updatingLeadId, setUpdatingLeadId] = useState<number | null>(null);
  const [convertingLeadId, setConvertingLeadId] = useState<number | null>(null);
  const [savingFollowUpLeadId, setSavingFollowUpLeadId] = useState<number | null>(null);
  const [creatingLeadNoteId, setCreatingLeadNoteId] = useState<number | null>(null);
  const [applyingLeadPresetId, setApplyingLeadPresetId] = useState<number | null>(null);
  const [archivingLeadId, setArchivingLeadId] = useState<number | null>(null);
  const [deletingLeadId, setDeletingLeadId] = useState<number | null>(null);
  const [feedbackMessage, setFeedbackMessage] = useState<string | null>(null);
  const [feedbackTone, setFeedbackTone] = useState<'success' | 'error'>('success');
  const [leadForm, setLeadForm] = useState<LeadFormState>(createInitialLeadForm());

  const loadLeads = async () => {
    try {
      const archiveQuery = showArchived ? '?include_archived=true' : '';
      const [leadsResponse, clientsResponse, teamResponse] = await Promise.all([
        fetch(`/api/leads${archiveQuery}`),
        fetch(`/api/clients${archiveQuery}`),
        fetch('/api/team/options'),
      ]);
      const leadsData = await getResponseJson<Lead[]>(leadsResponse);
      const clientsData = clientsResponse.ok
        ? await getResponseJson<Client[]>(clientsResponse)
        : [];
      const teamData = teamResponse.ok
        ? await getResponseJson<TeamMember[]>(teamResponse)
        : [];

      setLeads(leadsData);
      setClients(clientsData);
      setTeamMembers(teamData);
    } catch (error) {
      console.error('Error fetching leads:', error);
      setFeedbackTone('error');
      setFeedbackMessage('No se pudieron cargar los leads.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void loadLeads();
  }, [showArchived]);

  const setMessage = (message: string, tone: 'success' | 'error' = 'success') => {
    setFeedbackTone(tone);
    setFeedbackMessage(message);
  };

  const serviceOptions = Array.from(
    new Set(leads.map((lead) => lead.service).filter(Boolean)),
  ).sort();

  const filteredLeads = leads.filter((lead) => {
    const query = searchQuery.trim().toLowerCase();
    const matchesQuery =
      query.length === 0 ||
      lead.name.toLowerCase().includes(query) ||
      (lead.company || '').toLowerCase().includes(query) ||
      (lead.email || '').toLowerCase().includes(query) ||
      (lead.phone || '').toLowerCase().includes(query);
    const matchesStatus = statusFilter === 'all' || lead.status === statusFilter;
    const matchesService = serviceFilter === 'all' || lead.service === serviceFilter;
    const matchesArchive = showArchived ? Boolean(lead.archived_at) : !lead.archived_at;
    const matchesSummary =
      summaryFilter === 'all' ||
      (summaryFilter === 'active' && !lead.archived_at && !['closed', 'lost'].includes(lead.status)) ||
      (summaryFilter === 'hot' &&
        !lead.archived_at &&
        !['closed', 'lost'].includes(lead.status) &&
        getLeadScore(lead) >= 75) ||
      (summaryFilter === 'due' && isLeadFollowUpDue(lead)) ||
      (summaryFilter === 'closed' && !lead.archived_at && lead.status === 'closed');

    return matchesQuery && matchesStatus && matchesService && matchesArchive && matchesSummary;
  });

  const clientsByLeadId = clients.reduce<Record<number, Client>>((accumulator, client) => {
    if (typeof client.lead_id === 'number') {
      accumulator[client.lead_id] = client;
    }

    return accumulator;
  }, {});

  const clientsByCompany = clients.reduce<Record<string, Client>>((accumulator, client) => {
    const lookupKey = getClientLookupKey(client.company);

    if (lookupKey && !accumulator[lookupKey]) {
      accumulator[lookupKey] = client;
    }

    return accumulator;
  }, {});

  const teamMembersById = teamMembers.reduce<Record<number, TeamMember>>((accumulator, member) => {
    accumulator[member.id] = member;
    return accumulator;
  }, {});

  const getExistingClientForLead = (lead: Lead) =>
    clientsByLeadId[lead.id] || clientsByCompany[getClientLookupKey(lead.company)] || null;

  const getAssignedMember = (lead: Lead) =>
    typeof lead.assigned_to === 'number' ? teamMembersById[lead.assigned_to] || null : null;

  const activeLeads = leads.filter((lead) => !lead.archived_at);
  const hotLeads = activeLeads.filter((lead) => getLeadScore(lead) >= 75 && !['closed', 'lost'].includes(lead.status));
  const dueFollowUps = activeLeads.filter((lead) => isLeadFollowUpDue(lead));
  const closedLeads = activeLeads.filter((lead) => lead.status === 'closed');

  const appendLeadNote = async (
    leadId: number,
    type: LeadNote['type'],
    content: string,
  ) => {
    const response = await fetch(`/api/leads/${leadId}/notes`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        content,
        type,
      }),
    });

    const result = await getResponseJson<LeadNoteCreationResponse>(response);

    setLeads((currentLeads) =>
      currentLeads.map((currentLead) =>
        currentLead.id === result.lead.id ? result.lead : currentLead,
      ),
    );
    setFollowUpNotesByLeadId((currentMap) => ({
      ...currentMap,
      [leadId]: {
        notes: [result.note, ...(currentMap[leadId]?.notes || [])],
        loaded: true,
        loading: false,
      },
    }));

    return result;
  };

  const getLeadPresetConfig = (presetKey: LeadPresetKey, lead: Lead) => {
    switch (presetKey) {
      case 'contact':
        return {
          status: lead.status === 'new' ? ('contacted' as Lead['status']) : lead.status,
          nextAction: 'Enviar recap comercial y validar interés real del lead.',
          nextContactDate: addDaysToDateInput(2),
          noteType: 'call' as LeadNote['type'],
          noteContent: 'Acción rápida aplicada: primer contacto comercial registrado y recap pendiente.',
          lastContactedAt: new Date().toISOString(),
          successMessage: 'Lead actualizado con primer contacto y siguiente paso.',
        };
      case 'meeting':
        return {
          status:
            getLeadStatusIndex(lead.status) < getLeadStatusIndex('meeting')
              ? ('meeting' as Lead['status'])
              : lead.status,
          nextAction: 'Confirmar agenda y preparar reunion de descubrimiento con objetivos y contexto.',
          nextContactDate: addDaysToDateInput(3),
          noteType: 'meeting' as LeadNote['type'],
          noteContent: 'Acción rápida aplicada: reunión comercial preparada o pendiente de confirmación.',
          successMessage: 'Lead movido a reunión y seguimiento preparado.',
        };
      case 'documents':
        return {
          status:
            getLeadStatusIndex(lead.status) < getLeadStatusIndex('diagnosis')
              ? ('diagnosis' as Lead['status'])
              : lead.status,
          nextAction: 'Solicitar accesos, briefing y documentacion necesaria para diagnostico.',
          nextContactDate: addDaysToDateInput(2),
          noteType: 'email' as LeadNote['type'],
          noteContent: 'Acción rápida aplicada: solicitud de documentación, accesos y briefing enviada.',
          successMessage: 'Solicitud de documentación y briefing preparada.',
        };
      case 'proposal':
        return {
          status:
            getLeadStatusIndex(lead.status) < getLeadStatusIndex('proposal')
              ? ('proposal' as Lead['status'])
              : lead.status,
          nextAction: 'Enviar propuesta comercial y abrir ronda de dudas u objeciones.',
          nextContactDate: addDaysToDateInput(3),
          noteType: 'email' as LeadNote['type'],
          noteContent: 'Acción rápida aplicada: propuesta preparada para envío y seguimiento comercial.',
          successMessage: 'Lead preparado para envío de propuesta.',
        };
      case 'negotiation':
      default:
        return {
          status:
            getLeadStatusIndex(lead.status) < getLeadStatusIndex('negotiation')
              ? ('negotiation' as Lead['status'])
              : lead.status,
          nextAction: 'Hacer seguimiento de propuesta, tratar objeciones y cerrar próximos pasos.',
          nextContactDate: addDaysToDateInput(2),
          noteType: 'note' as LeadNote['type'],
          noteContent: 'Acción rápida aplicada: seguimiento de negociación activado.',
          successMessage: 'Seguimiento de negociación activado.',
        };
    }
  };

  const handleApplyLeadPreset = async (lead: Lead, presetKey: LeadPresetKey) => {
    const preset = getLeadPresetConfig(presetKey, lead);
    setApplyingLeadPresetId(lead.id);

    try {
      if (preset.status !== lead.status) {
        const statusResponse = await fetch(`/api/leads/${lead.id}/status`, {
          method: 'PATCH',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({ status: preset.status }),
        });
        const updatedLead = await getResponseJson<Lead>(statusResponse);
        setLeads((currentLeads) =>
          currentLeads.map((currentLead) =>
            currentLead.id === updatedLead.id ? updatedLead : currentLead,
          ),
        );
      }

      const followUpResponse = await fetch(`/api/leads/${lead.id}/follow-up`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          next_action: preset.nextAction,
          next_contact_date: preset.nextContactDate,
          ...(preset.lastContactedAt ? { last_contacted_at: preset.lastContactedAt } : {}),
        }),
      });
      const nextLead = await getResponseJson<Lead>(followUpResponse);

      setLeads((currentLeads) =>
        currentLeads.map((currentLead) =>
          currentLead.id === nextLead.id ? nextLead : currentLead,
        ),
      );
      syncLeadFollowUpForm(nextLead);
      await appendLeadNote(lead.id, preset.noteType, preset.noteContent);
      setMessage(preset.successMessage);
    } catch (error) {
      console.error('Error applying lead preset:', error);
      setMessage(
        error instanceof Error
          ? error.message
          : 'No se pudo aplicar la acción rápida sobre el lead.',
        'error',
      );
    } finally {
      setApplyingLeadPresetId(null);
    }
  };

  const scrollToLeadList = () => {
    document.getElementById('leads-base-section')?.scrollIntoView({
      behavior: 'smooth',
      block: 'start',
    });
  };

  const handleSummaryFilterChange = (nextFilter: LeadSummaryFilter) => {
    setShowArchived(false);
    setSummaryFilter(nextFilter);
    scrollToLeadList();
  };

  const syncLeadFollowUpForm = (lead: Lead, preserveNoteComposer = true) => {
    setFollowUpForms((currentForms) => {
      const currentForm = currentForms[lead.id];

      return {
        ...currentForms,
        [lead.id]: {
          next_action: lead.next_action || '',
          next_contact_date: lead.next_contact_date ? lead.next_contact_date.slice(0, 10) : '',
          note_type: preserveNoteComposer ? currentForm?.note_type || 'note' : 'note',
          note_content: preserveNoteComposer ? currentForm?.note_content || '' : '',
        },
      };
    });
  };

  const loadLeadFollowUp = async (lead: Lead) => {
    setFollowUpNotesByLeadId((currentMap) => ({
      ...currentMap,
      [lead.id]: {
        notes: currentMap[lead.id]?.notes || [],
        loaded: currentMap[lead.id]?.loaded || false,
        loading: true,
      },
    }));

    try {
      const response = await fetch(`/api/leads/${lead.id}/follow-up`);
      const data = await getResponseJson<LeadFollowUpResponse>(response);

      setLeads((currentLeads) =>
        currentLeads.map((currentLead) =>
          currentLead.id === data.lead.id ? data.lead : currentLead,
        ),
      );
      setFollowUpNotesByLeadId((currentMap) => ({
        ...currentMap,
        [lead.id]: {
          notes: data.notes,
          loaded: true,
          loading: false,
        },
      }));
      syncLeadFollowUpForm(data.lead);
    } catch (error) {
      console.error('Error loading lead follow-up:', error);
      setFollowUpNotesByLeadId((currentMap) => ({
        ...currentMap,
        [lead.id]: {
          notes: currentMap[lead.id]?.notes || [],
          loaded: currentMap[lead.id]?.loaded || false,
          loading: false,
        },
      }));
      setMessage('No se pudo cargar el seguimiento comercial del lead.', 'error');
    }
  };

  const handleCreateLead = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setCreatingLead(true);

    try {
      const response = await fetch('/api/leads', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          name: leadForm.name,
          company: leadForm.company,
          email: leadForm.email,
          phone: leadForm.phone,
          source: leadForm.source,
          service: leadForm.service,
          budget: Number(leadForm.budget || 0),
          status: leadForm.status,
        }),
      });

      const createdLead = await getResponseJson<Lead>(response);

      setLeads((currentLeads) => [createdLead, ...currentLeads]);
      setLeadForm(createInitialLeadForm());
      setShowNewLeadForm(false);
      setMessage('Lead creado correctamente.');
    } catch (error) {
      console.error('Error creating lead:', error);
      setMessage('No se pudo crear el lead.', 'error');
    } finally {
      setCreatingLead(false);
    }
  };

  const handleUpdateLeadStatus = async (
    leadId: number,
    status: Lead['status'],
    successMessage?: string,
  ) => {
    setUpdatingLeadId(leadId);

    try {
      const response = await fetch(`/api/leads/${leadId}/status`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ status }),
      });

      const updatedLead = await getResponseJson<Lead>(response);

      setLeads((currentLeads) =>
        currentLeads.map((lead) => (lead.id === updatedLead.id ? updatedLead : lead)),
      );
      setMessage(successMessage || 'Estado del lead actualizado.');
    } catch (error) {
      console.error('Error updating lead:', error);
      setMessage('No se pudo actualizar el estado del lead.', 'error');
    } finally {
      setUpdatingLeadId(null);
    }
  };

  const handleAutoAssign = async () => {
    setAssigningLeads(true);

    try {
      const response = await fetch('/api/leads/auto-assign', {
        method: 'POST',
      });

      const result = await getResponseJson<{ assignedCount: number }>(response);
      await loadLeads();
      setMessage(
        result.assignedCount > 0
          ? `Se asignaron ${result.assignedCount} leads automáticamente.`
          : 'No había leads pendientes por asignar.',
      );
    } catch (error) {
      console.error('Error assigning leads:', error);
      setMessage('No se pudo completar la asignación automática.', 'error');
    } finally {
      setAssigningLeads(false);
    }
  };

  const handleMailLead = (lead: Lead) => {
    if (!lead.email) {
      setMessage('Este lead no tiene email configurado.', 'error');
      return;
    }

    openMailDraft({
      to: lead.email,
      subject: `Seguimiento comercial · ${lead.company || lead.name}`,
      body: [
        `Hola ${lead.name || 'equipo'},`,
        '',
        'Te escribo para dar seguimiento a la conversación sobre vuestro crecimiento digital.',
        'Cuando te encaje, retomamos próximos pasos y necesidades.',
      ].join('\n'),
    });
  };

  const toggleExpandedLead = (leadId: number) => {
    if (expandedLeadId === leadId) {
      setExpandedLeadId(null);
      return;
    }

    const lead = leads.find((item) => item.id === leadId);

    if (lead) {
      syncLeadFollowUpForm(lead);

      if (
        !lead.archived_at &&
        !followUpNotesByLeadId[leadId]?.loaded &&
        !followUpNotesByLeadId[leadId]?.loading
      ) {
        void loadLeadFollowUp(lead);
      }
    }

    setExpandedLeadId(leadId);
  };

  const handleFollowUpFormChange = (
    leadId: number,
    key: keyof LeadFollowUpFormState,
    value: string,
  ) => {
    setFollowUpForms((currentForms) => ({
      ...currentForms,
      [leadId]: {
        ...(currentForms[leadId] || createLeadFollowUpForm(
          leads.find((lead) => lead.id === leadId) || {
            id: leadId,
            name: '',
            company: '',
            email: '',
            phone: '',
            source: '',
            service: '',
            budget: 0,
            status: 'new',
            created_at: '',
          },
        )),
        [key]: value,
      },
    }));
  };

  const handleSaveFollowUp = async (
    lead: Lead,
    options: {
      last_contacted_at?: string;
      successMessage?: string;
    } = {},
  ) => {
    const form = followUpForms[lead.id] || createLeadFollowUpForm(lead);
    setSavingFollowUpLeadId(lead.id);

    try {
      const response = await fetch(`/api/leads/${lead.id}/follow-up`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          next_action: form.next_action.trim() || null,
          next_contact_date: form.next_contact_date || null,
          ...(options.last_contacted_at
            ? { last_contacted_at: options.last_contacted_at }
            : {}),
        }),
      });

      const updatedLead = await getResponseJson<Lead>(response);

      setLeads((currentLeads) =>
        currentLeads.map((currentLead) =>
          currentLead.id === updatedLead.id ? updatedLead : currentLead,
        ),
      );
      syncLeadFollowUpForm(updatedLead);
      setMessage(options.successMessage || 'Seguimiento comercial actualizado.');
    } catch (error) {
      console.error('Error saving lead follow-up:', error);
      setMessage(
        error instanceof Error
          ? error.message
          : 'No se pudo guardar el seguimiento del lead.',
        'error',
      );
    } finally {
      setSavingFollowUpLeadId(null);
    }
  };

  const handleCreateLeadNote = async (lead: Lead) => {
    const form = followUpForms[lead.id] || createLeadFollowUpForm(lead);

    if (!form.note_content.trim()) {
      setMessage('Escribe una nota antes de guardarla.', 'error');
      return;
    }

    setCreatingLeadNoteId(lead.id);

    try {
      const response = await fetch(`/api/leads/${lead.id}/notes`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          content: form.note_content.trim(),
          type: form.note_type,
        }),
      });

      const result = await getResponseJson<LeadNoteCreationResponse>(response);

      setLeads((currentLeads) =>
        currentLeads.map((currentLead) =>
          currentLead.id === result.lead.id ? result.lead : currentLead,
        ),
      );
      setFollowUpNotesByLeadId((currentMap) => ({
        ...currentMap,
        [lead.id]: {
          notes: [result.note, ...(currentMap[lead.id]?.notes || [])],
          loaded: true,
          loading: false,
        },
      }));
      setFollowUpForms((currentForms) => ({
        ...currentForms,
        [lead.id]: {
          ...(currentForms[lead.id] || createLeadFollowUpForm(result.lead)),
          next_action: currentForms[lead.id]?.next_action ?? (result.lead.next_action || ''),
          next_contact_date:
            currentForms[lead.id]?.next_contact_date ??
            (result.lead.next_contact_date ? result.lead.next_contact_date.slice(0, 10) : ''),
          note_type: 'note',
          note_content: '',
        },
      }));
      setMessage(`Nota de ${getNoteTypeLabel(form.note_type).toLowerCase()} registrada.`);
    } catch (error) {
      console.error('Error creating lead note:', error);
      setMessage(
        error instanceof Error ? error.message : 'No se pudo registrar la nota.',
        'error',
      );
    } finally {
      setCreatingLeadNoteId(null);
    }
  };

  const handleConvertLead = async (lead: Lead) => {
    setConvertingLeadId(lead.id);

    try {
      const response = await fetch(`/api/leads/${lead.id}/convert`, {
        method: 'POST',
      });

      const result = await getResponseJson<LeadConversionResponse>(response);

      setLeads((currentLeads) =>
        currentLeads.map((currentLead) =>
          currentLead.id === result.lead.id ? result.lead : currentLead,
        ),
      );
      setClients((currentClients) => {
        const existingIndex = currentClients.findIndex(
          (client) => client.id === result.client.id,
        );

        if (existingIndex === -1) {
          return [result.client, ...currentClients];
        }

        return currentClients.map((client) =>
          client.id === result.client.id ? result.client : client,
        );
      });

      const setupCreated = Boolean(
        result.operational_setup &&
          (result.operational_setup.created_project ||
            result.operational_setup.created_onboarding ||
            result.operational_setup.created_onboarding_tasks > 0 ||
            result.operational_setup.created_operational_tasks > 0),
      );

      if (!result.alreadyConverted) {
        setMessage(
          setupCreated
            ? `Lead cerrado y convertido en cliente: ${result.client.company}. Se creó también su setup operativo inicial.`
            : `Lead cerrado y convertido en cliente: ${result.client.company}.`,
        );
        return;
      }

      setMessage(
        result.matchedBy === 'company'
          ? setupCreated
            ? `La empresa ya existía como cliente: ${result.client.company}. Se completó el setup que faltaba.`
            : `La empresa ya existía como cliente: ${result.client.company}.`
          : setupCreated
            ? `Este lead ya estaba convertido en cliente: ${result.client.company}. Se completó el setup que faltaba.`
            : `Este lead ya estaba convertido en cliente: ${result.client.company}.`,
      );
    } catch (error) {
      console.error('Error converting lead:', error);
      setMessage('No se pudo convertir el lead en cliente.', 'error');
    } finally {
      setConvertingLeadId(null);
    }
  };

  const handleArchiveLead = async (lead: Lead) => {
    setArchivingLeadId(lead.id);

    try {
      const response = await fetch(`/api/leads/${lead.id}/archive`, { method: 'POST' });
      await getResponseJson<Lead>(response);
      await loadLeads();
      setExpandedLeadId((currentId) => (currentId === lead.id ? null : currentId));
      setMessage(`Lead archivado: ${lead.name}.`);
    } catch (error) {
      console.error('Error archiving lead:', error);
      setMessage(
        error instanceof Error ? error.message : 'No se pudo archivar el lead.',
        'error',
      );
    } finally {
      setArchivingLeadId(null);
    }
  };

  const handleRestoreLead = async (lead: Lead) => {
    setArchivingLeadId(lead.id);

    try {
      const response = await fetch(`/api/leads/${lead.id}/restore`, { method: 'POST' });
      await getResponseJson<Lead>(response);
      await loadLeads();
      setExpandedLeadId((currentId) => (currentId === lead.id ? null : currentId));
      setMessage(`Lead restaurado: ${lead.name}.`);
    } catch (error) {
      console.error('Error restoring lead:', error);
      setMessage(
        error instanceof Error ? error.message : 'No se pudo restaurar el lead.',
        'error',
      );
    } finally {
      setArchivingLeadId(null);
    }
  };

  const handleDeleteLead = async (lead: Lead) => {
    if (
      !window.confirm(
        `Vas a eliminar permanentemente el lead ${lead.name}. Esta acción no se puede deshacer.`,
      )
    ) {
      return;
    }

    setDeletingLeadId(lead.id);

    try {
      const response = await fetch(`/api/leads/${lead.id}`, { method: 'DELETE' });

      if (!response.ok) {
        const errorData = (await response.json().catch(() => null)) as { error?: string } | null;
        throw new Error(errorData?.error || `Request failed with status ${response.status}`);
      }

      await loadLeads();
      setExpandedLeadId((currentId) => (currentId === lead.id ? null : currentId));
      setMessage(`Lead eliminado: ${lead.name}.`);
    } catch (error) {
      console.error('Error deleting lead:', error);
      setMessage(
        error instanceof Error ? error.message : 'No se pudo eliminar el lead.',
        'error',
      );
    } finally {
      setDeletingLeadId(null);
    }
  };

  return (
    <div className="space-y-6">
      <header className="flex justify-between items-center">
        <div>
          <h2 className="text-3xl font-bold">Gestión de Leads</h2>
          <p className="text-white/50">Administra y convierte tus prospectos en clientes.</p>
        </div>
        <div className="flex gap-3">
          <button
            type="button"
            onClick={() => {
              setShowArchived((current) => !current);
              setShowNewLeadForm(false);
              setExpandedLeadId(null);
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
              onClick={() => setShowNewLeadForm((current) => !current)}
              className="glass-button-primary"
            >
              <Plus className="w-5 h-5" />
              Nuevo Lead
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
        {showNewLeadForm ? (
          <motion.form
            initial={{ opacity: 0, y: -8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -8 }}
            onSubmit={handleCreateLead}
            className="glass-panel p-6 grid grid-cols-1 md:grid-cols-2 gap-4"
          >
            <div>
              <label className="block text-xs font-bold uppercase tracking-wider text-white/40 mb-2">
                Nombre
              </label>
              <input
                required
                value={leadForm.name}
                onChange={(event) =>
                  setLeadForm((currentForm) => ({
                    ...currentForm,
                    name: event.target.value,
                  }))
                }
                className="w-full glass-input"
                placeholder="Nombre del contacto"
              />
            </div>

            <div>
              <label className="block text-xs font-bold uppercase tracking-wider text-white/40 mb-2">
                Empresa
              </label>
              <input
                value={leadForm.company}
                onChange={(event) =>
                  setLeadForm((currentForm) => ({
                    ...currentForm,
                    company: event.target.value,
                  }))
                }
                className="w-full glass-input"
                placeholder="Empresa"
              />
            </div>

            <div>
              <label className="block text-xs font-bold uppercase tracking-wider text-white/40 mb-2">
                Email
              </label>
              <input
                type="email"
                value={leadForm.email}
                onChange={(event) =>
                  setLeadForm((currentForm) => ({
                    ...currentForm,
                    email: event.target.value,
                  }))
                }
                className="w-full glass-input"
                placeholder="correo@empresa.com"
              />
            </div>

            <div>
              <label className="block text-xs font-bold uppercase tracking-wider text-white/40 mb-2">
                Teléfono
              </label>
              <input
                value={leadForm.phone}
                onChange={(event) =>
                  setLeadForm((currentForm) => ({
                    ...currentForm,
                    phone: event.target.value,
                  }))
                }
                className="w-full glass-input"
                placeholder="+34 600 000 000"
              />
            </div>

            <div>
              <label className="block text-xs font-bold uppercase tracking-wider text-white/40 mb-2">
                Fuente
              </label>
              <input
                value={leadForm.source}
                onChange={(event) =>
                  setLeadForm((currentForm) => ({
                    ...currentForm,
                    source: event.target.value,
                  }))
                }
                className="w-full glass-input"
                placeholder="Meta Ads, Referral, Web..."
              />
            </div>

            <div>
              <label className="block text-xs font-bold uppercase tracking-wider text-white/40 mb-2">
                Servicio
              </label>
              <input
                value={leadForm.service}
                onChange={(event) =>
                  setLeadForm((currentForm) => ({
                    ...currentForm,
                    service: event.target.value,
                  }))
                }
                className="w-full glass-input"
                placeholder="SEO, IA, Meta Ads..."
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
                value={leadForm.budget}
                onChange={(event) =>
                  setLeadForm((currentForm) => ({
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
                Estado inicial
              </label>
              <select
                value={leadForm.status}
                onChange={(event) =>
                  setLeadForm((currentForm) => ({
                    ...currentForm,
                    status: event.target.value as Lead['status'],
                  }))
                }
                className="w-full glass-input"
              >
                {leadStatusOrder.map((status) => (
                  <option key={status} value={status}>
                    {getStatusLabel(status)}
                  </option>
                ))}
              </select>
            </div>

            <div className="md:col-span-2 flex justify-end gap-3">
              <button
                type="button"
                onClick={() => setShowNewLeadForm(false)}
                className="glass-button-secondary"
              >
                Cancelar
              </button>
              <button
                type="submit"
                disabled={creatingLead}
                className="glass-button-primary disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {creatingLead ? 'Creando...' : 'Guardar Lead'}
              </button>
            </div>
          </motion.form>
        ) : null}
      </AnimatePresence>

      <CollapsibleSection
        title="Resumen del pipeline"
        description="Métricas rápidas para priorizar el trabajo comercial."
        icon={<TrendingUp className="w-5 h-5" />}
        storageKey="leads-summary"
      >
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-4">
          {[
            {
              key: 'active' as const,
              label: 'Leads activos',
              value: activeLeads.length,
              hint: 'Pipeline comercial abierto',
              icon: TrendingUp,
            },
            {
              key: 'hot' as const,
              label: 'Scoring alto',
              value: hotLeads.length,
              hint: 'Leads con alta intención',
              icon: Flame,
            },
            {
              key: 'due' as const,
              label: 'Seguimiento vencido/hoy',
              value: dueFollowUps.length,
              hint: 'Recordatorios que requieren acción',
              icon: Clock3,
            },
            {
              key: 'closed' as const,
              label: 'Clientes cerrados',
              value: closedLeads.length,
              hint: 'Leads ya convertidos o cerrados',
              icon: CheckCircle2,
            },
          ].map((item) => (
            <InteractiveSummaryCard
              key={item.label}
              label={item.label}
              value={item.value}
              hint={item.hint}
              icon={item.icon}
              active={summaryFilter === item.key}
              onClick={() => handleSummaryFilterChange(item.key)}
            />
          ))}
        </div>
      </CollapsibleSection>

      <CollapsibleSection
        title="Base de leads"
        description="Búsqueda, filtros y listado operativo del pipeline."
        icon={<Search className="w-5 h-5" />}
        storageKey="leads-table"
        bodyClassName="overflow-visible p-0"
        className="scroll-mt-6 overflow-visible"
        actions={
          summaryFilter !== 'all' ? (
            <button
              type="button"
              onClick={() => setSummaryFilter('all')}
              className="glass-button-secondary"
            >
              Ver todos
            </button>
          ) : null
        }
      >
        <div id="leads-base-section" />
        <div className="p-6 space-y-6">
          <div className="flex gap-4">
            <div className="flex-1 relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-white/30" />
              <input
                value={searchQuery}
                onChange={(event) => setSearchQuery(event.target.value)}
                type="text"
                placeholder="Buscar leads por nombre, empresa o email..."
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
            {!showArchived ? (
              <button
                type="button"
                onClick={() => void handleAutoAssign()}
                disabled={assigningLeads}
                className="glass-button-secondary disabled:opacity-50 disabled:cursor-not-allowed"
              >
                <UserPlus className="w-5 h-5" />
                {assigningLeads ? 'Asignando...' : 'Asignación Automática'}
              </button>
            ) : null}
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
                    setStatusFilter(event.target.value as LeadStatusFilter)
                  }
                  className="glass-input"
                >
                  <option value="all">Todos los estados</option>
                  {leadStatusOrder.map((status) => (
                    <option key={status} value={status}>
                      {getStatusLabel(status)}
                    </option>
                  ))}
                </select>

                <select
                  value={serviceFilter}
                  onChange={(event) => setServiceFilter(event.target.value)}
                  className="glass-input"
                >
                  <option value="all">Todos los servicios</option>
                  {serviceOptions.map((service) => (
                    <option key={service} value={service}>
                      {service}
                    </option>
                  ))}
                </select>

                <button
                  type="button"
                  onClick={() => {
                    setStatusFilter('all');
                    setServiceFilter('all');
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
          <div className="glass-panel overflow-x-auto overflow-y-visible border-0 rounded-none">
        <table className="w-full min-w-[980px] text-left">
          <thead>
            <tr className="border-b border-white/10 bg-white/5">
              <th className="px-6 py-4 text-xs font-bold uppercase tracking-wider text-white/40">
                Lead / Empresa
              </th>
              <th className="px-6 py-4 text-xs font-bold uppercase tracking-wider text-white/40">
                Contacto
              </th>
              <th className="px-6 py-4 text-xs font-bold uppercase tracking-wider text-white/40">
                Servicio / Fuente
              </th>
              <th className="px-6 py-4 text-xs font-bold uppercase tracking-wider text-white/40">
                Presupuesto / Scoring
              </th>
              <th className="px-6 py-4 text-xs font-bold uppercase tracking-wider text-white/40">
                Estado
              </th>
              <th className="px-6 py-4 text-xs font-bold uppercase tracking-wider text-white/40">
                Acciones
              </th>
            </tr>
          </thead>
          <tbody className="divide-y divide-white/5">
            {loading ? (
              [1, 2, 3].map((item) => (
                <tr key={item} className="animate-pulse">
                  <td colSpan={6} className="px-6 py-8 bg-white/5"></td>
                </tr>
              ))
            ) : filteredLeads.length === 0 ? (
              <tr>
                <td colSpan={6} className="px-6 py-8 text-center text-white/40">
                  No hay leads que coincidan con los filtros actuales.
                </td>
              </tr>
            ) : (
              filteredLeads.map((lead) => {
                const isArchived = Boolean(lead.archived_at);
                const existingClient = getExistingClientForLead(lead);
                const assignedMember = getAssignedMember(lead);
                const followUpForm = followUpForms[lead.id] || createLeadFollowUpForm(lead);
                const followUpState = followUpNotesByLeadId[lead.id];
                const followUpBadge = getFollowUpBadge(lead);
                const leadScore = getLeadScore(lead);
                const leadNotes = followUpState?.notes || [];
                const leadStatusIndex = getLeadStatusIndex(lead.status);
                const hasContactSignal =
                  Boolean(lead.last_contacted_at) ||
                  leadNotes.some((note) =>
                    ['call', 'email', 'meeting', 'whatsapp'].includes(note.type),
                  );
                const hasMeetingSignal =
                  leadStatusIndex >= getLeadStatusIndex('meeting') ||
                  leadNotes.some((note) => note.type === 'meeting');
                const documentationRequested =
                  includesCommercialKeyword(lead.next_action, [
                    'document',
                    'documentacion',
                    'documentación',
                    'brief',
                    'briefing',
                    'acceso',
                    'accesos',
                    'material',
                  ]) ||
                  leadNotes.some((note) =>
                    includesCommercialKeyword(note.content, [
                      'document',
                      'documentacion',
                      'documentación',
                      'brief',
                      'briefing',
                      'acceso',
                      'accesos',
                      'material',
                    ]),
                  );
                const proposalSignal =
                  leadStatusIndex >= getLeadStatusIndex('proposal') ||
                  leadNotes.some((note) =>
                    includesCommercialKeyword(note.content, ['propuesta', 'proposal', 'presupuesto']),
                  );
                const quickPresets: Array<{
                  key: LeadPresetKey;
                  label: string;
                  hint: string;
                  icon: typeof Phone;
                }> = [
                  {
                    key: 'contact',
                    label: 'Registrar contacto',
                    hint: 'Deja el lead en primer seguimiento comercial.',
                    icon: Phone,
                  },
                  {
                    key: 'meeting',
                    label: 'Preparar reunión',
                    hint: 'Avanza a discovery y fija próximo contacto.',
                    icon: CalendarClock,
                  },
                  {
                    key: 'documents',
                    label: 'Solicitar documentación',
                    hint: 'Activa accesos, briefing y material clave.',
                    icon: FileText,
                  },
                  {
                    key: 'proposal',
                    label: 'Enviar propuesta',
                    hint: 'Mueve el lead a propuesta y seguimiento.',
                    icon: TrendingUp,
                  },
                  {
                    key: 'negotiation',
                    label: 'Activar negociación',
                    hint: 'Deja preparado el cierre comercial.',
                    icon: CheckCircle2,
                  },
                ];
                const recommendedPresetKey: LeadPresetKey =
                  lead.status === 'new'
                    ? 'contact'
                    : lead.status === 'contacted'
                      ? 'meeting'
                      : lead.status === 'meeting'
                        ? 'documents'
                        : lead.status === 'diagnosis'
                          ? 'proposal'
                          : lead.status === 'proposal'
                            ? 'negotiation'
                            : 'negotiation';
                const recommendedPreset =
                  quickPresets.find((preset) => preset.key === recommendedPresetKey) ||
                  quickPresets[0];

                return (
                  <React.Fragment key={lead.id}>
                    <motion.tr
                      initial={{ opacity: 0 }}
                      animate={{ opacity: 1 }}
                      className={cn(
                        'hover:bg-white/5 transition-colors group',
                        isArchived && 'opacity-70',
                      )}
                    >
                      <td className="px-6 py-4">
                        <div className="flex items-center gap-3">
                          <div className="w-10 h-10 rounded-full bg-gradient-to-br from-brand-blue to-brand-purple flex items-center justify-center font-bold">
                            {lead.name.charAt(0)}
                          </div>
                          <div>
                            <p className="font-bold text-sm">{lead.name}</p>
                            <p className="text-xs text-white/40 mb-2">
                              {lead.company || 'Sin empresa'}
                            </p>
                            <div className="flex flex-wrap items-center gap-2">
                              <span
                                className={cn(
                                  'text-[10px] font-bold uppercase tracking-wider px-2 py-1 rounded-full border',
                                  followUpBadge.className,
                                )}
                              >
                                {followUpBadge.label}
                              </span>
                              <span
                                className={cn(
                                  'text-[10px] font-bold uppercase tracking-wider px-2 py-1 rounded-full border',
                                  getLeadScoreClass(lead, leadScore),
                                )}
                              >
                                Score {leadScore}
                              </span>
                            </div>
                            <p className="text-[11px] text-white/35 mt-2">
                              Responsable:{' '}
                              <span className="text-white/65">
                                {assignedMember?.name || 'Sin asignar'}
                              </span>
                            </p>
                          </div>
                        </div>
                      </td>
                      <td className="px-6 py-4">
                        <div className="flex flex-col gap-1">
                          <div className="flex items-center gap-2 text-xs text-white/60">
                            <Mail className="w-3 h-3" /> {lead.email || 'Sin email'}
                          </div>
                          <div className="flex items-center gap-2 text-xs text-white/60">
                            <Phone className="w-3 h-3" /> {lead.phone || 'N/A'}
                          </div>
                        </div>
                      </td>
                      <td className="px-6 py-4">
                        <p className="text-sm font-medium">{lead.service || 'Sin servicio'}</p>
                        <p className="text-xs text-brand-cyan">{lead.source || 'Sin fuente'}</p>
                      </td>
                      <td className="px-6 py-4">
                        <p className="text-sm font-bold">
                          ${Number(lead.budget || 0).toLocaleString()}
                        </p>
                        <p className="text-xs text-white/40 mt-1">
                          {getLeadScoreLabel(lead, leadScore)}
                        </p>
                      </td>
                      <td className="px-6 py-4">
                        <span
                          className={cn(
                            'text-[10px] font-bold uppercase tracking-wider px-2 py-1 rounded-full border',
                            getStatusColor(lead.status),
                          )}
                        >
                          {getStatusLabel(lead.status)}
                        </span>
                      </td>
                      <td className="px-6 py-4">
                        <div className="flex items-center gap-2">
                          <button
                            type="button"
                            onClick={() => handleMailLead(lead)}
                            className="p-2 hover:bg-white/10 rounded-lg transition-colors"
                            title={lead.email ? `Escribir a ${lead.email}` : 'Sin email disponible'}
                          >
                            <Mail className="w-4 h-4 text-white/40" />
                          </button>
                          <button
                            type="button"
                            onClick={() => toggleExpandedLead(lead.id)}
                            className={cn(
                              'p-2 hover:bg-white/10 rounded-lg transition-colors',
                              expandedLeadId === lead.id && 'bg-white/10',
                            )}
                          >
                            <MoreHorizontal className="w-4 h-4 text-white/40" />
                          </button>
                          <ChevronRight
                            className={cn(
                              'w-4 h-4 text-white/20 transition-all',
                              expandedLeadId === lead.id
                                ? 'text-white rotate-90'
                                : 'group-hover:text-white group-hover:translate-x-1',
                            )}
                          />
                        </div>
                      </td>
                    </motion.tr>

                    <AnimatePresence>
                      {expandedLeadId === lead.id ? (
                        <motion.tr
                          initial={{ opacity: 0 }}
                          animate={{ opacity: 1 }}
                          exit={{ opacity: 0 }}
                        >
                          <td colSpan={6} className="px-6 pb-4">
                            <div className="glass-card p-4 space-y-3">
                              {isArchived ? (
                                <div className="glass-panel p-4 space-y-4">
                                  <div className="text-xs text-white/40 flex flex-wrap gap-4">
                                    <span>
                                      Archivado el{' '}
                                      {lead.archived_at
                                        ? new Date(lead.archived_at).toLocaleDateString('es-ES')
                                        : 'sin fecha'}
                                    </span>
                                    <span>
                                      Creado {new Date(lead.created_at).toLocaleDateString('es-ES')}
                                    </span>
                                  </div>

                                  <div className="flex flex-wrap gap-2">
                                    <button
                                      type="button"
                                      disabled={archivingLeadId === lead.id}
                                      onClick={() => void handleRestoreLead(lead)}
                                      className="glass-button-secondary disabled:opacity-50 disabled:cursor-not-allowed"
                                    >
                                      <RotateCcw className="w-4 h-4" />
                                      {archivingLeadId === lead.id ? 'Restaurando...' : 'Restaurar'}
                                    </button>
                                    <button
                                      type="button"
                                      disabled={deletingLeadId === lead.id}
                                      onClick={() => void handleDeleteLead(lead)}
                                      className="glass-button-secondary disabled:opacity-50 disabled:cursor-not-allowed"
                                    >
                                      <Trash2 className="w-4 h-4" />
                                      {deletingLeadId === lead.id ? 'Eliminando...' : 'Eliminar definitivamente'}
                                    </button>
                                  </div>
                                </div>
                              ) : (
                                <>
                                  <div className="flex flex-wrap gap-2">
                                    {leadStatusOrder.map((status) => (
                                      <button
                                        key={status}
                                        type="button"
                                        disabled={updatingLeadId === lead.id}
                                        onClick={() =>
                                          void handleUpdateLeadStatus(
                                            lead.id,
                                            status,
                                            `Lead movido a ${getStatusLabel(status).toLowerCase()}.`,
                                          )
                                        }
                                        className={cn(
                                          'px-3 py-1.5 rounded-lg text-xs font-bold uppercase tracking-wider transition-all',
                                          lead.status === status
                                            ? 'bg-brand-blue/20 text-brand-blue border border-brand-blue/20'
                                            : 'bg-white/5 text-white/60 border border-white/10 hover:bg-white/10',
                                        )}
                                      >
                                        {getStatusLabel(status)}
                                      </button>
                                    ))}
                                  </div>

                                  <div className="flex flex-wrap items-center justify-between gap-3">
                                    <div className="text-xs text-white/40 flex flex-wrap gap-4">
                                      <span>
                                        Asignado automáticamente: {lead.assigned_to ? 'Sí' : 'No'}
                                      </span>
                                      <span>
                                        Creado {new Date(lead.created_at).toLocaleDateString('es-ES')}
                                      </span>
                                      <span>
                                        Budget ${Number(lead.budget || 0).toLocaleString()}
                                      </span>
                                      <span>
                                        Scoring {leadScore}/100
                                      </span>
                                    </div>

                                    <div className="flex flex-wrap gap-2">
                                      {existingClient ? (
                                        <>
                                          <span className="px-3 py-1.5 rounded-lg text-xs font-bold uppercase tracking-wider bg-green-500/10 text-green-400 border border-green-500/20">
                                            Cliente creado
                                          </span>
                                          {onNavigate ? (
                                            <button
                                              type="button"
                                              onClick={() => onNavigate('clients')}
                                              className="glass-button-secondary"
                                            >
                                              Ver Clientes
                                            </button>
                                          ) : null}
                                        </>
                                      ) : (
                                        <button
                                          type="button"
                                          disabled={
                                            convertingLeadId === lead.id || lead.status === 'lost'
                                          }
                                          onClick={() => void handleConvertLead(lead)}
                                          className="glass-button-secondary disabled:opacity-50 disabled:cursor-not-allowed"
                                        >
                                          <UserPlus className="w-4 h-4" />
                                          {convertingLeadId === lead.id
                                            ? 'Convirtiendo...'
                                            : lead.status === 'closed'
                                              ? 'Convertir a Cliente'
                                              : 'Cerrar y Convertir'}
                                        </button>
                                      )}
                                      <button
                                        type="button"
                                        disabled={archivingLeadId === lead.id}
                                        onClick={() => void handleArchiveLead(lead)}
                                        className="glass-button-secondary disabled:opacity-50 disabled:cursor-not-allowed"
                                      >
                                        <Archive className="w-4 h-4" />
                                        {archivingLeadId === lead.id ? 'Archivando...' : 'Archivar'}
                                      </button>
                                    </div>
                                  </div>

                                  {existingClient ? (
                                    <div className="text-xs text-white/35">
                                      Vinculado a cliente:{' '}
                                      <span className="text-white/70">{existingClient.company}</span>
                                    </div>
                                  ) : null}

                                  <div className="space-y-4">
                                <div className="glass-panel p-4 space-y-4">
                                  <div className="flex items-center gap-2">
                                    <CalendarClock className="w-4 h-4 text-brand-cyan" />
                                    <h4 className="font-semibold">Seguimiento comercial</h4>
                                  </div>

                                  <div className="rounded-2xl border border-white/10 bg-black/20 p-4 space-y-4">
                                    <div className="flex flex-wrap items-start justify-between gap-3">
                                      <div>
                                        <p className="text-[10px] font-bold uppercase tracking-[0.22em] text-white/35">
                                          Panel interactivo
                                        </p>
                                        <p className="mt-2 text-lg font-semibold">
                                          Punto actual: {getStatusLabel(lead.status)}
                                        </p>
                                        <p className="mt-1 text-sm text-white/45">
                                          {getLeadPresetConfig(recommendedPresetKey, lead).nextAction}
                                        </p>
                                      </div>
                                      <span
                                        className={cn(
                                          'rounded-full border px-3 py-1 text-[10px] font-bold uppercase tracking-wider',
                                          getStatusColor(lead.status),
                                        )}
                                      >
                                          {leadStatusIndex + 1}/{leadStatusOrder.length}
                                        </span>
                                      </div>

                                    <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-2.5">
                                      {[
                                        {
                                          label: 'Contacto',
                                          value: hasContactSignal ? 'Hecho' : 'Pendiente',
                                          hint: hasContactSignal
                                            ? `Ultimo contacto ${formatLeadDate(lead.last_contacted_at, true)}`
                                            : 'Aún no hay interacción registrada.',
                                          state: hasContactSignal,
                                          icon: Phone,
                                        },
                                        {
                                          label: 'Reunión',
                                          value: hasMeetingSignal ? 'En marcha' : 'Sin agendar',
                                          hint: hasMeetingSignal
                                            ? 'Ya hay discovery o reunión registrada.'
                                            : 'Falta confirmar siguiente reunión.',
                                          state: hasMeetingSignal,
                                          icon: CalendarClock,
                                        },
                                        {
                                          label: 'Documentación',
                                          value: documentationRequested ? 'Solicitada' : 'No activada',
                                          hint: documentationRequested
                                            ? 'El lead ya tiene briefing, accesos o docs en seguimiento.'
                                            : 'Todavía no consta solicitud de material.',
                                          state: documentationRequested,
                                          icon: FileText,
                                        },
                                        {
                                          label: 'Propuesta',
                                          value: proposalSignal ? 'Activa' : 'Pendiente',
                                          hint: proposalSignal
                                            ? 'La propuesta o presupuesto ya está en el flujo.'
                                            : 'Aún no se ha activado fase de propuesta.',
                                          state: proposalSignal,
                                          icon: TrendingUp,
                                        },
                                      ].map((item) => (
                                        <div key={item.label} className="glass-card p-2.5 space-y-1.5">
                                          <div className="flex items-center justify-between gap-3">
                                            <p className="text-[10px] font-bold uppercase tracking-wider text-white/35">
                                              {item.label}
                                            </p>
                                            <item.icon
                                              className={cn(
                                                'h-4 w-4',
                                                item.state ? 'text-brand-cyan' : 'text-white/25',
                                              )}
                                            />
                                          </div>
                                          <p className="text-sm font-semibold">{item.value}</p>
                                          <p className="text-[11px] leading-snug text-white/45">
                                            {item.hint}
                                          </p>
                                        </div>
                                      ))}
                                    </div>

                                    <div className="space-y-3">
                                      <div className="flex flex-wrap items-center justify-between gap-3">
                                        <p className="text-xs font-bold uppercase tracking-wider text-white/35">
                                          Ruta comercial
                                        </p>
                                        <p className="text-xs text-white/40">
                                          Pulsa una fase para mover el lead.
                                        </p>
                                      </div>

                                      <div className="grid grid-cols-1 gap-2.5 md:grid-cols-2 xl:grid-cols-4">
                                        {leadStatusOrder.map((status, index) => {
                                          const isCurrent = lead.status === status;
                                          const isCompleted =
                                            lead.status !== 'lost' && leadStatusIndex > index;
                                          const isLocked =
                                            lead.status === 'lost' &&
                                            status !== 'lost' &&
                                            index > leadStatusIndex;

                                          return (
                                            <button
                                              key={status}
                                              type="button"
                                              disabled={updatingLeadId === lead.id || isCurrent}
                                              onClick={() =>
                                                void handleUpdateLeadStatus(
                                                  lead.id,
                                                  status,
                                                  `Lead movido a ${getStatusLabel(status).toLowerCase()}.`,
                                                )
                                              }
                                              className={cn(
                                                'h-full rounded-2xl border p-3 text-left transition-all',
                                                isCurrent &&
                                                  'border-brand-blue/30 bg-brand-blue/10 shadow-[0_0_20px_rgba(0,102,255,0.08)]',
                                                isCompleted &&
                                                  !isCurrent &&
                                                  'border-emerald-500/20 bg-emerald-500/10',
                                                !isCompleted &&
                                                  !isCurrent &&
                                                  'border-white/10 bg-white/5 hover:bg-white/8',
                                                isLocked && 'opacity-60',
                                              )}
                                            >
                                              <div className="flex items-center justify-between gap-3">
                                                <span className="text-[10px] font-bold uppercase tracking-wider text-white/35">
                                                  Paso {index + 1}
                                                </span>
                                                {isCompleted ? (
                                                  <CheckCircle2 className="h-4 w-4 text-emerald-300" />
                                                ) : isCurrent ? (
                                                  <ClipboardList className="h-4 w-4 text-brand-cyan" />
                                                ) : (
                                                  <ArrowRight className="h-4 w-4 text-white/25" />
                                                )}
                                              </div>
                                              <p className="mt-2 text-sm font-semibold">
                                                {getStatusLabel(status)}
                                              </p>
                                              <p className="mt-1 text-[11px] leading-snug text-white/45">
                                                {isCurrent
                                                  ? 'Fase actual del lead.'
                                                  : isCompleted
                                                    ? 'Paso ya superado.'
                                                    : getLeadStageSummary(status)}
                                              </p>
                                            </button>
                                          );
                                        })}
                                      </div>
                                    </div>

                                    {!['closed', 'lost'].includes(lead.status) ? (
                                      <div className="rounded-2xl border border-white/10 bg-white/5 p-3 space-y-3">
                                        <div className="flex flex-wrap items-center justify-between gap-3">
                                          <div>
                                            <p className="text-xs font-bold uppercase tracking-wider text-white/35">
                                              Siguiente hito sugerido
                                            </p>
                                            <p className="mt-1 text-sm text-white/50">
                                              {getLeadPresetConfig(recommendedPresetKey, lead).nextAction}
                                            </p>
                                          </div>
                                          <button
                                            type="button"
                                            disabled={applyingLeadPresetId === lead.id}
                                            onClick={() =>
                                              void handleApplyLeadPreset(lead, recommendedPresetKey)
                                            }
                                            className="glass-button-primary disabled:opacity-50"
                                          >
                                            <recommendedPreset.icon className="w-4 h-4" />
                                            {recommendedPreset.label}
                                          </button>
                                        </div>

                                        <div className="flex flex-wrap gap-2">
                                          {quickPresets
                                            .filter((preset) => preset.key !== recommendedPresetKey)
                                            .map((preset) => (
                                              <button
                                                key={preset.key}
                                                type="button"
                                                disabled={applyingLeadPresetId === lead.id}
                                                onClick={() => void handleApplyLeadPreset(lead, preset.key)}
                                                className="glass-button-secondary disabled:opacity-50"
                                              >
                                                <preset.icon className="h-4 w-4" />
                                                {preset.label}
                                              </button>
                                            ))}
                                        </div>
                                      </div>
                                    ) : null}
                                  </div>

                                  <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                                    <div className="md:col-span-2">
                                      <label className="block text-[10px] font-bold uppercase tracking-wider text-white/35 mb-2">
                                        Próxima acción
                                      </label>
                                      <input
                                        value={followUpForm.next_action}
                                        onChange={(event) =>
                                          handleFollowUpFormChange(
                                            lead.id,
                                            'next_action',
                                            event.target.value,
                                          )
                                        }
                                        className="w-full glass-input"
                                        placeholder="Ej: enviar propuesta, cerrar reunión, resolver objeciones"
                                      />
                                    </div>

                                    <div>
                                      <label className="block text-[10px] font-bold uppercase tracking-wider text-white/35 mb-2">
                                        Próximo contacto
                                      </label>
                                      <input
                                        type="date"
                                        value={followUpForm.next_contact_date}
                                        onChange={(event) =>
                                          handleFollowUpFormChange(
                                            lead.id,
                                            'next_contact_date',
                                            event.target.value,
                                          )
                                        }
                                        className="w-full glass-input"
                                      />
                                    </div>

                                    <div className="glass-card p-3 space-y-2">
                                      <p className="text-[10px] font-bold uppercase tracking-wider text-white/35">
                                        Último contacto
                                      </p>
                                      <p className="text-sm font-medium">
                                        {formatLeadDate(lead.last_contacted_at, true)}
                                      </p>
                                    </div>
                                  </div>

                                  <div className="grid grid-cols-1 md:grid-cols-3 gap-3 text-xs text-white/45">
                                    <div className="glass-card p-3">
                                      <p className="font-bold text-white/70 mb-1">Siguiente paso</p>
                                      <p>{lead.next_action || 'Sin próxima acción definida'}</p>
                                    </div>
                                    <div className="glass-card p-3">
                                      <p className="font-bold text-white/70 mb-1">Seguimiento</p>
                                      <p>{formatLeadDate(lead.next_contact_date)}</p>
                                    </div>
                                    <div className="glass-card p-3">
                                      <p className="font-bold text-white/70 mb-1">Responsable</p>
                                      <p>
                                        {assignedMember
                                          ? `${assignedMember.name} · ${assignedMember.role}`
                                          : 'Sin asignar'}
                                      </p>
                                    </div>
                                  </div>

                                  <div className="grid grid-cols-1 md:grid-cols-2 gap-3 text-xs text-white/45">
                                    <div className="glass-card p-3">
                                      <p className="font-bold text-white/70 mb-1">Scoring del lead</p>
                                      <p className="text-sm font-semibold text-white">
                                        {leadScore}/100 · {getLeadScoreLabel(lead, leadScore)}
                                      </p>
                                    </div>
                                    <div className="glass-card p-3">
                                      <p className="font-bold text-white/70 mb-1">Automatización</p>
                                      <p>
                                        Los nuevos leads activan seguimiento IA, recordatorios y tareas
                                        automáticas según contexto.
                                      </p>
                                    </div>
                                  </div>

                                  <div className="flex flex-wrap gap-2">
                                    <button
                                      type="button"
                                      disabled={savingFollowUpLeadId === lead.id}
                                      onClick={() =>
                                        void handleSaveFollowUp(lead, {
                                          successMessage: 'Seguimiento guardado correctamente.',
                                        })
                                      }
                                      className="glass-button-secondary disabled:opacity-50 disabled:cursor-not-allowed"
                                    >
                                      <Save className="w-4 h-4" />
                                      {savingFollowUpLeadId === lead.id
                                        ? 'Guardando...'
                                        : 'Guardar seguimiento'}
                                    </button>
                                    <button
                                      type="button"
                                      disabled={savingFollowUpLeadId === lead.id}
                                      onClick={() =>
                                        void handleSaveFollowUp(lead, {
                                          last_contacted_at: new Date().toISOString(),
                                          successMessage: 'Contacto registrado correctamente.',
                                        })
                                      }
                                      className="glass-button-secondary disabled:opacity-50 disabled:cursor-not-allowed"
                                    >
                                      <Phone className="w-4 h-4" />
                                      Registrar contacto ahora
                                    </button>
                                  </div>
                                </div>

                                <div className="glass-panel p-4 space-y-4">
                                  <div className="flex items-center gap-2">
                                    <History className="w-4 h-4 text-brand-purple" />
                                    <h4 className="font-semibold">Historial de comunicaciones</h4>
                                  </div>

                                  <div className="text-xs text-white/35">
                                    {followUpState?.notes?.length || 0} registros entre notas internas,
                                    llamadas, emails, reuniones y WhatsApp.
                                  </div>

                                  <div className="grid grid-cols-1 xl:grid-cols-[220px_1fr] gap-3">
                                    <select
                                      value={followUpForm.note_type}
                                      onChange={(event) =>
                                        handleFollowUpFormChange(
                                          lead.id,
                                          'note_type',
                                          event.target.value,
                                        )
                                      }
                                      className="glass-input"
                                    >
                                      <option value="note">Nota interna</option>
                                      <option value="call">Llamada</option>
                                      <option value="email">Email</option>
                                      <option value="meeting">Reunión</option>
                                      <option value="whatsapp">WhatsApp</option>
                                    </select>

                                    <textarea
                                      value={followUpForm.note_content}
                                      onChange={(event) =>
                                        handleFollowUpFormChange(
                                          lead.id,
                                          'note_content',
                                          event.target.value,
                                        )
                                      }
                                      rows={3}
                                      className="w-full glass-input resize-none"
                                      placeholder="Registra contexto, objeciones, próximos pasos o acuerdos..."
                                    />
                                  </div>

                                  <div className="flex flex-wrap items-center justify-between gap-3">
                                    <p className="text-xs text-white/40">
                                      Registra llamadas, emails, reuniones, WhatsApp y notas internas.
                                    </p>
                                    <button
                                      type="button"
                                      disabled={creatingLeadNoteId === lead.id}
                                      onClick={() => void handleCreateLeadNote(lead)}
                                      className="glass-button-secondary disabled:opacity-50 disabled:cursor-not-allowed"
                                    >
                                      <MessageSquarePlus className="w-4 h-4" />
                                      {creatingLeadNoteId === lead.id
                                        ? 'Guardando nota...'
                                        : 'Añadir nota al seguimiento'}
                                    </button>
                                  </div>

                                  {followUpState?.loading ? (
                                    <div className="glass-card p-4 text-sm text-white/40">
                                      Cargando notas del lead...
                                    </div>
                                  ) : followUpState?.notes?.length ? (
                                    <div className="space-y-3 max-h-[420px] overflow-y-auto pr-1">
                                      {followUpState.notes.map((note) => (
                                        <div key={note.id} className="glass-card p-3 space-y-2">
                                          <div className="flex flex-wrap items-center justify-between gap-2">
                                            <span
                                              className={cn(
                                                'text-[10px] font-bold uppercase tracking-wider px-2 py-1 rounded-full border',
                                                getNoteTypeColor(note.type),
                                              )}
                                            >
                                              {getNoteTypeLabel(note.type)}
                                            </span>
                                            <span className="text-[11px] text-white/35">
                                              {formatLeadDate(note.created_at, true)}
                                            </span>
                                          </div>
                                          <p className="text-sm text-white/85 whitespace-pre-wrap">
                                            {note.content}
                                          </p>
                                          <p className="text-[11px] text-white/40">
                                            {note.author_name}
                                          </p>
                                        </div>
                                      ))}
                                    </div>
                                  ) : (
                                    <div className="glass-card p-4 text-sm text-white/40">
                                      Todavía no hay notas de seguimiento para este lead.
                                    </div>
                                  )}
                                </div>
                                  </div>
                                </>
                              )}
                            </div>
                          </td>
                        </motion.tr>
                      ) : null}
                    </AnimatePresence>
                  </React.Fragment>
                );
              })
            )}
          </tbody>
        </table>
          </div>
        </div>
      </CollapsibleSection>
    </div>
  );
};
