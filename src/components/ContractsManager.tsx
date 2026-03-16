import React, { useEffect, useMemo, useState } from 'react';
import {
  AlertCircle,
  Briefcase,
  CheckCircle2,
  Copy,
  DollarSign,
  Download,
  FileText,
  Mail,
  Send,
  Plus,
  RefreshCw,
  Save,
  UserPlus,
  Users,
} from 'lucide-react';
import {
  Client,
  cn,
  Contract,
  ContractSendResponse,
  ContractEvent,
  ContractsOverview,
  Freelancer,
  Integration,
  ServicePrice,
  TeamMember,
} from '../types';
import { triggerClientDownload } from '../lib/download';
import { CollapsibleSection } from './CollapsibleSection';
import { openMailDraft } from '../lib/communication';
import { InteractiveSummaryCard } from './InteractiveSummaryCard';

const getResponseJson = async <T,>(response: Response): Promise<T> => {
  if (!response.ok) {
    const errorData = (await response.json().catch(() => null)) as { error?: string } | null;
    throw new Error(errorData?.error || `Request failed with status ${response.status}`);
  }

  return response.json() as Promise<T>;
};

const todayValue = () => new Date().toISOString().slice(0, 10);

const createInitialServiceForm = () => ({
  name: '',
  category: 'Ads',
  description: '',
  service_scope: 'client' as ServicePrice['service_scope'],
  unit_label: 'mes',
  billing_model: 'monthly' as ServicePrice['billing_model'],
  default_price: '1500',
  currency: 'EUR' as ServicePrice['currency'],
  tax_rate: '21',
  legal_label: '',
  notes: '',
  is_active: true,
});

const createInitialFreelancerForm = () => ({
  name: '',
  email: '',
  specialty: '',
  hourly_rate: '35',
  currency: 'EUR' as Freelancer['currency'],
  tax_id: '',
  payment_method: 'Transferencia',
  payout_reference: '',
  payout_integration_key: 'wise' as Integration['key'],
  notes: '',
  status: 'active' as Freelancer['status'],
});

const createInitialContractForm = () => ({
  contract_type: 'client' as Contract['contract_type'],
  client_id: '',
  freelancer_id: '',
  owner_user_id: '',
  template_key: 'service_agreement',
  status: 'draft' as Contract['status'],
  currency: 'EUR' as Contract['currency'],
  payment_terms: '50% al inicio y 50% contra entrega.',
  start_date: todayValue(),
  end_date: '',
  counterparty_name: '',
  counterparty_email: '',
  counterparty_tax_id: '',
  counterparty_address: '',
  scope_summary: '',
  custom_requirements: '',
  payment_integration_key: 'stripe' as Integration['key'],
  signature_integration_key: 'docusign' as Integration['key'],
  items: [] as Array<{
    service_price_id: number;
    title: string;
    quantity: number;
    unit_price: number;
    tax_rate: number;
    description?: string | null;
  }>,
});

const paymentOptions: Array<{ key: Integration['key']; label: string }> = [
  { key: 'stripe', label: 'Stripe' },
  { key: 'paypal', label: 'PayPal' },
  { key: 'wise', label: 'Wise' },
];

const signatureOptions: Array<{ key: Integration['key']; label: string }> = [
  { key: 'docusign', label: 'DocuSign' },
  { key: 'pandadoc', label: 'PandaDoc' },
];

const getContractStatusClass = (status: Contract['status']) => {
  switch (status) {
    case 'signed':
      return 'bg-emerald-500/10 text-emerald-300 border-emerald-500/20';
    case 'ready':
    case 'sent':
      return 'bg-brand-cyan/20 text-brand-cyan border-brand-cyan/20';
    case 'review':
      return 'bg-yellow-500/10 text-yellow-300 border-yellow-500/20';
    case 'archived':
      return 'bg-white/10 text-white/45 border-white/10';
    case 'draft':
    default:
      return 'bg-white/10 text-white/60 border-white/10';
  }
};

const getValidationClass = (status: Contract['validation_status']) => {
  switch (status) {
    case 'valid':
      return 'bg-emerald-500/10 text-emerald-300 border-emerald-500/20';
    case 'warning':
      return 'bg-yellow-500/10 text-yellow-300 border-yellow-500/20';
    case 'invalid':
    default:
      return 'bg-red-500/10 text-red-300 border-red-500/20';
  }
};

const getContractTemplates = (contractType: Contract['contract_type']) =>
  contractType === 'client'
    ? [
        { key: 'service_agreement', label: 'Prestación de servicios' },
        { key: 'retainer_growth', label: 'Retainer mensual' },
      ]
    : [
        { key: 'freelance_services', label: 'Colaboración freelance' },
        { key: 'freelance_retainer', label: 'Retainer freelance' },
      ];

const formatDateTime = (value?: string | null) => {
  if (!value) {
    return 'Pendiente';
  }

  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? value : date.toLocaleString('es-ES');
};

const buildContractEmailDraft = (contract: Contract, note?: string) => {
  const subject =
    contract.contract_type === 'freelance'
      ? `Acuerdo de colaboración · ${contract.contract_number}`
      : `Contrato de servicio · ${contract.contract_number}`;
  const body = [
    `Hola ${contract.counterparty_name || 'equipo'},`,
    '',
    `Te comparto el documento ${contract.contract_number} para revisión.`,
    `Importe total: ${contract.total_amount.toFixed(2)} ${contract.currency}`,
    `Inicio previsto: ${contract.start_date || 'Pendiente'}`,
    note?.trim() ? `Nota adicional: ${note.trim()}` : null,
    '',
    'Te adjunto el contrato descargado desde el CRM para que puedas revisarlo con contexto.',
    'Si necesitas cambios o aclaraciones, respóndeme y lo ajustamos.',
  ]
    .filter(Boolean)
    .join('\n');

  return { subject, body };
};

export const ContractsManager: React.FC = () => {
  const [clients, setClients] = useState<Client[]>([]);
  const [teamMembers, setTeamMembers] = useState<TeamMember[]>([]);
  const [services, setServices] = useState<ServicePrice[]>([]);
  const [freelancers, setFreelancers] = useState<Freelancer[]>([]);
  const [contracts, setContracts] = useState<Contract[]>([]);
  const [overview, setOverview] = useState<ContractsOverview | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [feedbackMessage, setFeedbackMessage] = useState<string | null>(null);
  const [feedbackTone, setFeedbackTone] = useState<'success' | 'error'>('success');
  const [showServiceForm, setShowServiceForm] = useState(false);
  const [showFreelancerForm, setShowFreelancerForm] = useState(false);
  const [showContractForm, setShowContractForm] = useState(false);
  const [creatingService, setCreatingService] = useState(false);
  const [creatingFreelancer, setCreatingFreelancer] = useState(false);
  const [creatingContract, setCreatingContract] = useState(false);
  const [updatingContractId, setUpdatingContractId] = useState<number | null>(null);
  const [selectedContractId, setSelectedContractId] = useState<number | null>(null);
  const [contractEvents, setContractEvents] = useState<ContractEvent[]>([]);
  const [eventsLoading, setEventsLoading] = useState(false);
  const [contractActionNote, setContractActionNote] = useState('');
  const [reviewingContractId, setReviewingContractId] = useState<number | null>(null);
  const [sendingContractId, setSendingContractId] = useState<number | null>(null);
  const [serviceForm, setServiceForm] = useState(createInitialServiceForm());
  const [freelancerForm, setFreelancerForm] = useState(createInitialFreelancerForm());
  const [contractForm, setContractForm] = useState(createInitialContractForm());
  const [servicePickerId, setServicePickerId] = useState('');
  const [serviceQuantity, setServiceQuantity] = useState('1');
  const [contractTypeFilter, setContractTypeFilter] = useState<'all' | Contract['contract_type']>('all');

  const setMessage = (message: string, tone: 'success' | 'error' = 'success') => {
    setFeedbackTone(tone);
    setFeedbackMessage(message);
  };

  const loadContractsData = async (background = false) => {
    if (background) {
      setRefreshing(true);
    } else {
      setLoading(true);
    }

    try {
      const [
        clientsResponse,
        teamResponse,
        servicesResponse,
        freelancersResponse,
        contractsResponse,
        overviewResponse,
      ] = await Promise.all([
        fetch('/api/clients'),
        fetch('/api/team/options'),
        fetch('/api/service-prices'),
        fetch('/api/freelancers'),
        fetch('/api/contracts'),
        fetch('/api/contracts/overview'),
      ]);

      const [clientsData, teamData, servicesData, freelancersData, contractsData, overviewData] =
        await Promise.all([
          getResponseJson<Client[]>(clientsResponse),
          getResponseJson<TeamMember[]>(teamResponse),
          getResponseJson<ServicePrice[]>(servicesResponse),
          getResponseJson<Freelancer[]>(freelancersResponse),
          getResponseJson<Contract[]>(contractsResponse),
          getResponseJson<ContractsOverview>(overviewResponse),
        ]);

      setClients(clientsData);
      setTeamMembers(teamData);
      setServices(servicesData);
      setFreelancers(freelancersData);
      setContracts(contractsData);
      setOverview(overviewData);
    } catch (error) {
      console.error('Error loading contracts data:', error);
      setMessage('No se pudo cargar el módulo de contratos.', 'error');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  useEffect(() => {
    void loadContractsData();
  }, []);

  const filteredContracts = useMemo(
    () =>
      contractTypeFilter === 'all'
        ? contracts
        : contracts.filter((contract) => contract.contract_type === contractTypeFilter),
    [contractTypeFilter, contracts],
  );

  const selectedContract =
    contracts.find((contract) => contract.id === selectedContractId) || filteredContracts[0] || null;
  const pendingContractCandidate =
    contracts.find((contract) => ['review', 'ready', 'sent'].includes(contract.status)) || null;

  const contractDraftTotals = useMemo(() => {
    const subtotal = contractForm.items.reduce(
      (sum, item) => sum + Number(item.unit_price || 0) * Number(item.quantity || 0),
      0,
    );
    const tax = contractForm.items.reduce(
      (sum, item) =>
        sum + ((Number(item.unit_price || 0) * Number(item.quantity || 0) * Number(item.tax_rate || 0)) / 100),
      0,
    );

    return {
      subtotal: Math.round(subtotal * 100) / 100,
      tax: Math.round(tax * 100) / 100,
      total: Math.round((subtotal + tax) * 100) / 100,
    };
  }, [contractForm.items]);

  const activeServices = services.filter((service) => service.is_active);
  const availableServicesForType = activeServices.filter(
    (service) =>
      service.service_scope === 'both' || service.service_scope === contractForm.contract_type,
  );

  const scrollToSection = (sectionId: string) => {
    document.getElementById(sectionId)?.scrollIntoView({
      behavior: 'smooth',
      block: 'start',
    });
  };

  const loadContractEvents = async (contractId: number) => {
    setEventsLoading(true);

    try {
      const response = await fetch(`/api/contracts/${contractId}/events`);
      const data = await getResponseJson<ContractEvent[]>(response);
      setContractEvents(data);
    } catch (error) {
      console.error('Error loading contract events:', error);
      setContractEvents([]);
      setMessage('No se pudo cargar el historial del contrato seleccionado.', 'error');
    } finally {
      setEventsLoading(false);
    }
  };

  useEffect(() => {
    if (!contracts.length) {
      setSelectedContractId(null);
      return;
    }

    setSelectedContractId((current) =>
      current && contracts.some((contract) => contract.id === current) ? current : contracts[0].id,
    );
  }, [contracts]);

  useEffect(() => {
    if (!selectedContract) {
      setContractEvents([]);
      setEventsLoading(false);
      return;
    }

    void loadContractEvents(selectedContract.id);
  }, [selectedContract?.id]);

  const handleAddServiceLine = () => {
    const service = services.find((item) => item.id === Number(servicePickerId));
    const quantity = Number(serviceQuantity);

    if (!service) {
      setMessage('Selecciona un servicio válido para añadirlo al contrato.', 'error');
      return;
    }

    if (!Number.isFinite(quantity) || quantity <= 0) {
      setMessage('La cantidad del servicio no es válida.', 'error');
      return;
    }

    setContractForm((current) => ({
      ...current,
      currency: service.currency,
      items: [
        ...current.items,
        {
          service_price_id: service.id,
          title: service.name,
          description: service.description,
          quantity,
          unit_price: Number(service.default_price || 0),
          tax_rate: Number(service.tax_rate || 0),
        },
      ],
    }));
    setServicePickerId('');
    setServiceQuantity('1');
  };

  const handleRemoveLine = (servicePriceId: number, index: number) => {
    setContractForm((current) => ({
      ...current,
      items: current.items.filter((item, itemIndex) => !(item.service_price_id === servicePriceId && itemIndex === index)),
    }));
  };

  const handleCreateService = async () => {
    setCreatingService(true);

    try {
      await getResponseJson<ServicePrice>(
        await fetch('/api/service-prices', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            ...serviceForm,
            default_price: Number(serviceForm.default_price),
            tax_rate: Number(serviceForm.tax_rate),
          }),
        }),
      );
      setServiceForm(createInitialServiceForm());
      setShowServiceForm(false);
      setMessage('Tarifa base creada correctamente.');
      await loadContractsData(true);
    } catch (error) {
      console.error('Error creating service price:', error);
      setMessage(error instanceof Error ? error.message : 'No se pudo crear la tarifa.', 'error');
    } finally {
      setCreatingService(false);
    }
  };

  const handleCreateFreelancer = async () => {
    setCreatingFreelancer(true);

    try {
      await getResponseJson<Freelancer>(
        await fetch('/api/freelancers', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            ...freelancerForm,
            hourly_rate: Number(freelancerForm.hourly_rate),
          }),
        }),
      );
      setFreelancerForm(createInitialFreelancerForm());
      setShowFreelancerForm(false);
      setMessage('Freelance añadido correctamente.');
      await loadContractsData(true);
    } catch (error) {
      console.error('Error creating freelancer:', error);
      setMessage(error instanceof Error ? error.message : 'No se pudo crear el freelance.', 'error');
    } finally {
      setCreatingFreelancer(false);
    }
  };

  const handleCreateContract = async () => {
    setCreatingContract(true);

    try {
      const createdContract = await getResponseJson<Contract>(
        await fetch('/api/contracts', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            ...contractForm,
            client_id: contractForm.client_id ? Number(contractForm.client_id) : null,
            freelancer_id: contractForm.freelancer_id ? Number(contractForm.freelancer_id) : null,
            owner_user_id: contractForm.owner_user_id ? Number(contractForm.owner_user_id) : null,
            items: contractForm.items.map((item) => ({
              service_price_id: item.service_price_id,
              quantity: item.quantity,
            })),
          }),
        }),
      );
      setContractForm(createInitialContractForm());
      setShowContractForm(false);
      setMessage('Contrato generado correctamente.');
      setSelectedContractId(createdContract.id);
      await loadContractsData(true);
      await loadContractEvents(createdContract.id);
    } catch (error) {
      console.error('Error creating contract:', error);
      setMessage(error instanceof Error ? error.message : 'No se pudo generar el contrato.', 'error');
    } finally {
      setCreatingContract(false);
    }
  };

  const handleUpdateContractStatus = async (contract: Contract, status: Contract['status']) => {
    setUpdatingContractId(contract.id);

    try {
      await getResponseJson<Contract>(
        await fetch(`/api/contracts/${contract.id}`, {
          method: 'PATCH',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({ status }),
        }),
      );
      setMessage(`Contrato ${contract.contract_number} actualizado a ${status}.`);
      await loadContractsData(true);
      setSelectedContractId(contract.id);
      await loadContractEvents(contract.id);
    } catch (error) {
      console.error('Error updating contract:', error);
      setMessage(error instanceof Error ? error.message : 'No se pudo actualizar el contrato.', 'error');
    } finally {
      setUpdatingContractId(null);
    }
  };

  const handleReviewDecision = async (
    contract: Contract,
    decision: 'review' | 'approve' | 'changes_requested',
  ) => {
    setReviewingContractId(contract.id);

    try {
      await getResponseJson<Contract>(
        await fetch(`/api/contracts/${contract.id}/review`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            decision,
            note: contractActionNote.trim() || null,
          }),
        }),
      );

      setContractActionNote('');
      setSelectedContractId(contract.id);
      setMessage(
        decision === 'approve'
          ? `Contrato ${contract.contract_number} aprobado para envío.`
          : decision === 'changes_requested'
            ? `Se solicitaron cambios en ${contract.contract_number}.`
            : `Se abrió la revisión de ${contract.contract_number}.`,
      );
      await loadContractsData(true);
      await loadContractEvents(contract.id);
    } catch (error) {
      console.error('Error reviewing contract:', error);
      setMessage(
        error instanceof Error ? error.message : 'No se pudo actualizar la revisión del contrato.',
        'error',
      );
    } finally {
      setReviewingContractId(null);
    }
  };

  const handleSendContract = async (contract: Contract) => {
    setSendingContractId(contract.id);

    try {
      const response = await getResponseJson<ContractSendResponse>(
        await fetch(`/api/contracts/${contract.id}/send`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            note: contractActionNote.trim() || null,
          }),
        }),
      );

      setContractActionNote('');
      setSelectedContractId(contract.id);
      setMessage(
        response.delivery.delivered
          ? `Contrato ${contract.contract_number} enviado por email a ${contract.counterparty_email}.`
          : response.delivery.reason === 'smtp_not_configured'
            ? `Contrato ${contract.contract_number} marcado como enviado. SMTP no está configurado; usa "Abrir email" o "Copiar email" para enviarlo manualmente.`
            : `Contrato ${contract.contract_number} marcado como enviado, pero el correo no salió por SMTP. Puedes enviarlo manualmente desde este panel.`,
      );
      await loadContractsData(true);
      await loadContractEvents(contract.id);
    } catch (error) {
      console.error('Error sending contract:', error);
      setMessage(
        error instanceof Error ? error.message : 'No se pudo enviar el contrato.',
        'error',
      );
    } finally {
      setSendingContractId(null);
    }
  };

  const handleOpenContractEmailDraft = (contract: Contract) => {
    if (!contract.counterparty_email) {
      setMessage('Añade un email de contraparte antes de preparar el correo.', 'error');
      return;
    }

    const draft = buildContractEmailDraft(contract, contractActionNote);
    openMailDraft({
      to: contract.counterparty_email,
      subject: draft.subject,
      body: draft.body,
    });
    setMessage(`Borrador de email preparado para ${contract.contract_number}.`);
  };

  const handleCopyContractEmailDraft = async (contract: Contract) => {
    if (!contract.counterparty_email) {
      setMessage('Añade un email de contraparte antes de copiar el correo.', 'error');
      return;
    }

    try {
      if (!navigator.clipboard) {
        throw new Error('Clipboard API not available');
      }

      const draft = buildContractEmailDraft(contract, contractActionNote);
      await navigator.clipboard.writeText(
        [`Para: ${contract.counterparty_email}`, `Asunto: ${draft.subject}`, '', draft.body].join('\n'),
      );
      setMessage(`Contenido del email copiado para ${contract.contract_number}.`);
    } catch (error) {
      console.error('Error copying contract email draft:', error);
      setMessage('No se pudo copiar el borrador del email.', 'error');
    }
  };

  const handleDownloadContract = (contract: Contract) => {
    if (!contract.document_url) {
      setMessage('Este contrato todavía no tiene documento descargable.', 'error');
      return;
    }

    triggerClientDownload(contract.document_url, `${contract.contract_number}.txt`);
    setMessage(`Descarga iniciada para ${contract.contract_number}.`);
  };

  const handleContractTypeChange = (value: Contract['contract_type']) => {
    setContractForm((current) => ({
      ...current,
      contract_type: value,
      template_key: getContractTemplates(value)[0]?.key || current.template_key,
      client_id: value === 'client' ? current.client_id : '',
      freelancer_id: value === 'freelance' ? current.freelancer_id : '',
      counterparty_name: '',
      counterparty_email: '',
      items: current.items.filter(
        (item) =>
          services.find((service) => service.id === item.service_price_id)?.service_scope === 'both' ||
          services.find((service) => service.id === item.service_price_id)?.service_scope === value,
      ),
    }));
  };

  return (
    <div className="space-y-8">
      <header className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h2 className="text-3xl font-bold">Contratos</h2>
          <p className="text-white/50">
            Genera contratos para clientes y freelancers usando una base de tarifas consistente.
          </p>
        </div>

        <div className="flex flex-wrap gap-3">
          <button
            type="button"
            onClick={() => void loadContractsData(true)}
            className="glass-button-secondary"
            disabled={refreshing}
          >
            <RefreshCw className={cn('w-4 h-4', refreshing && 'animate-spin')} />
            Refrescar
          </button>
          <button type="button" onClick={() => setShowContractForm((current) => !current)} className="glass-button-primary">
            <FileText className="w-4 h-4" />
            Nuevo Contrato
          </button>
        </div>
      </header>

      {feedbackMessage ? (
        <div
          className={cn(
            'glass-panel p-3 text-sm',
            feedbackTone === 'success' ? 'text-emerald-300' : 'text-red-300',
          )}
        >
          {feedbackMessage}
        </div>
      ) : null}

      <CollapsibleSection
        title="Resumen contractual"
        description="Estado general de contratos, firmas, colaboradores y base tarifaria."
        icon={<FileText className="w-5 h-5" />}
        storageKey="contracts-summary"
      >
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-6">
          {[
            {
              label: 'Contratos activos',
              value: overview?.summary.total_contracts || 0,
              icon: FileText,
              hint: 'Ir al listado de contratos',
              onClick: () => scrollToSection('contracts-created-section'),
            },
            {
              label: 'Pendientes de firma',
              value: overview?.summary.pending_signature || 0,
              icon: CheckCircle2,
              hint: 'Ir al siguiente pendiente',
              onClick: () => {
                if (pendingContractCandidate) {
                  setSelectedContractId(pendingContractCandidate.id);
                }
                scrollToSection('contracts-review-section');
              },
            },
            {
              label: 'Freelancers activos',
              value: overview?.summary.active_freelancers || 0,
              icon: Users,
              hint: 'Ir a recursos contractuales',
              onClick: () => scrollToSection('contracts-resources-anchor'),
            },
            {
              label: 'Base de servicios',
              value: overview?.summary.active_services || 0,
              icon: DollarSign,
              hint: 'Ir a recursos contractuales',
              onClick: () => scrollToSection('contracts-resources-anchor'),
            },
          ].map((item) => (
            <InteractiveSummaryCard
              key={item.label}
              label={item.label}
              value={item.value}
              hint={item.hint}
              icon={item.icon}
              onClick={item.onClick}
            />
          ))}
        </div>
      </CollapsibleSection>

      {showContractForm ? (
        <section className="glass-panel p-6 space-y-6">
          <div className="flex items-center justify-between gap-4">
            <div>
              <h3 className="text-lg font-bold">Generador de contrato</h3>
              <p className="text-sm text-white/45">
                El documento se compone desde tarifas, condiciones y requisitos del cliente o freelance.
              </p>
            </div>
            <span className="text-sm text-white/40">
              Total estimado: {contractDraftTotals.total.toFixed(2)} {contractForm.currency}
            </span>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-4">
            <div>
              <label className="block text-xs font-bold uppercase tracking-wider text-white/40 mb-2">Tipo</label>
              <select
                value={contractForm.contract_type}
                onChange={(event) => handleContractTypeChange(event.target.value as Contract['contract_type'])}
                className="w-full glass-input"
              >
                <option value="client">Cliente</option>
                <option value="freelance">Freelance</option>
              </select>
            </div>

            {contractForm.contract_type === 'client' ? (
              <div>
                <label className="block text-xs font-bold uppercase tracking-wider text-white/40 mb-2">Cliente</label>
                <select
                  value={contractForm.client_id}
                  onChange={(event) =>
                    setContractForm((current) => ({
                      ...current,
                      client_id: event.target.value,
                      counterparty_name:
                        clients.find((client) => client.id === Number(event.target.value))?.company || '',
                    }))
                  }
                  className="w-full glass-input"
                >
                  <option value="">Selecciona cliente</option>
                  {clients.map((client) => (
                    <option key={client.id} value={client.id}>
                      {client.company}
                    </option>
                  ))}
                </select>
              </div>
            ) : (
              <div>
                <label className="block text-xs font-bold uppercase tracking-wider text-white/40 mb-2">Freelance</label>
                <select
                  value={contractForm.freelancer_id}
                  onChange={(event) =>
                    setContractForm((current) => {
                      const selectedFreelancer = freelancers.find(
                        (freelancer) => freelancer.id === Number(event.target.value),
                      );
                      return {
                        ...current,
                        freelancer_id: event.target.value,
                        counterparty_name: selectedFreelancer?.name || '',
                        counterparty_email: selectedFreelancer?.email || '',
                        payment_integration_key:
                          selectedFreelancer?.payout_integration_key || current.payment_integration_key,
                      };
                    })
                  }
                  className="w-full glass-input"
                >
                  <option value="">Selecciona freelance</option>
                  {freelancers.map((freelancer) => (
                    <option key={freelancer.id} value={freelancer.id}>
                      {freelancer.name}
                    </option>
                  ))}
                </select>
              </div>
            )}

            <div>
              <label className="block text-xs font-bold uppercase tracking-wider text-white/40 mb-2">Owner interno</label>
              <select
                value={contractForm.owner_user_id}
                onChange={(event) =>
                  setContractForm((current) => ({
                    ...current,
                    owner_user_id: event.target.value,
                  }))
                }
                className="w-full glass-input"
              >
                <option value="">Sin asignar</option>
                {teamMembers.map((member) => (
                  <option key={member.id} value={member.id}>
                    {member.name}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-xs font-bold uppercase tracking-wider text-white/40 mb-2">Plantilla</label>
              <select
                value={contractForm.template_key}
                onChange={(event) =>
                  setContractForm((current) => ({
                    ...current,
                    template_key: event.target.value,
                  }))
                }
                className="w-full glass-input"
              >
                {getContractTemplates(contractForm.contract_type).map((template) => (
                  <option key={template.key} value={template.key}>
                    {template.label}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-xs font-bold uppercase tracking-wider text-white/40 mb-2">Inicio</label>
              <input
                type="date"
                value={contractForm.start_date}
                onChange={(event) =>
                  setContractForm((current) => ({
                    ...current,
                    start_date: event.target.value,
                  }))
                }
                className="w-full glass-input"
              />
            </div>

            <div>
              <label className="block text-xs font-bold uppercase tracking-wider text-white/40 mb-2">Fin</label>
              <input
                type="date"
                value={contractForm.end_date}
                onChange={(event) =>
                  setContractForm((current) => ({
                    ...current,
                    end_date: event.target.value,
                  }))
                }
                className="w-full glass-input"
              />
            </div>

            <div>
              <label className="block text-xs font-bold uppercase tracking-wider text-white/40 mb-2">Pago</label>
              <select
                value={contractForm.payment_integration_key}
                onChange={(event) =>
                  setContractForm((current) => ({
                    ...current,
                    payment_integration_key: event.target.value as Integration['key'],
                  }))
                }
                className="w-full glass-input"
              >
                {paymentOptions.map((option) => (
                  <option key={option.key} value={option.key}>
                    {option.label}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-xs font-bold uppercase tracking-wider text-white/40 mb-2">Firma</label>
              <select
                value={contractForm.signature_integration_key}
                onChange={(event) =>
                  setContractForm((current) => ({
                    ...current,
                    signature_integration_key: event.target.value as Integration['key'],
                  }))
                }
                className="w-full glass-input"
              >
                {signatureOptions.map((option) => (
                  <option key={option.key} value={option.key}>
                    {option.label}
                  </option>
                ))}
              </select>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-4">
            <input
              value={contractForm.counterparty_name}
              onChange={(event) =>
                setContractForm((current) => ({
                  ...current,
                  counterparty_name: event.target.value,
                }))
              }
              className="glass-input"
              placeholder="Nombre o razón social"
            />
            <input
              value={contractForm.counterparty_email}
              onChange={(event) =>
                setContractForm((current) => ({
                  ...current,
                  counterparty_email: event.target.value,
                }))
              }
              className="glass-input"
              placeholder="Email de la contraparte"
            />
            <input
              value={contractForm.counterparty_tax_id}
              onChange={(event) =>
                setContractForm((current) => ({
                  ...current,
                  counterparty_tax_id: event.target.value,
                }))
              }
              className="glass-input"
              placeholder="NIF / CIF"
            />
            <input
              value={contractForm.counterparty_address}
              onChange={(event) =>
                setContractForm((current) => ({
                  ...current,
                  counterparty_address: event.target.value,
                }))
              }
              className="glass-input"
              placeholder="Dirección legal"
            />
          </div>

          <textarea
            value={contractForm.scope_summary}
            onChange={(event) =>
              setContractForm((current) => ({
                ...current,
                scope_summary: event.target.value,
              }))
            }
            className="w-full glass-input min-h-[96px]"
            placeholder="Resumen del alcance del contrato"
          />

          <textarea
            value={contractForm.custom_requirements}
            onChange={(event) =>
              setContractForm((current) => ({
                ...current,
                custom_requirements: event.target.value,
              }))
            }
            className="w-full glass-input min-h-[96px]"
            placeholder="Requisitos o peticiones específicas del cliente"
          />

          <textarea
            value={contractForm.payment_terms}
            onChange={(event) =>
              setContractForm((current) => ({
                ...current,
                payment_terms: event.target.value,
              }))
            }
            className="w-full glass-input min-h-[84px]"
            placeholder="Condiciones de pago"
          />

          <div className="glass-panel p-4 space-y-4">
            <div className="flex flex-wrap items-end gap-3">
              <div className="flex-1 min-w-[220px]">
                <label className="block text-xs font-bold uppercase tracking-wider text-white/40 mb-2">
                  Añadir servicio
                </label>
                <select
                  value={servicePickerId}
                  onChange={(event) => setServicePickerId(event.target.value)}
                  className="w-full glass-input"
                >
                  <option value="">Selecciona servicio de la base</option>
                  {availableServicesForType.map((service) => (
                    <option key={service.id} value={service.id}>
                      {service.name} · {service.default_price} {service.currency}
                    </option>
                  ))}
                </select>
              </div>
              <div className="w-32">
                <label className="block text-xs font-bold uppercase tracking-wider text-white/40 mb-2">Cantidad</label>
                <input
                  type="number"
                  min="1"
                  step="1"
                  value={serviceQuantity}
                  onChange={(event) => setServiceQuantity(event.target.value)}
                  className="w-full glass-input"
                />
              </div>
              <button type="button" onClick={handleAddServiceLine} className="glass-button-primary">
                <Plus className="w-4 h-4" />
                Añadir
              </button>
            </div>

            {!contractForm.items.length ? (
              <div className="text-sm text-white/45">Todavía no has añadido líneas de servicio al contrato.</div>
            ) : (
              <div className="space-y-3">
                {contractForm.items.map((item, index) => (
                  <div
                    key={`${item.service_price_id}-${index}`}
                    className="flex flex-wrap items-center justify-between gap-3 p-3 rounded-2xl border border-white/10 bg-white/5"
                  >
                    <div>
                      <p className="font-semibold">{item.title}</p>
                      <p className="text-sm text-white/45">
                        {item.quantity} x {item.unit_price.toFixed(2)} {contractForm.currency} · IVA {item.tax_rate}%
                      </p>
                    </div>
                    <div className="flex items-center gap-3">
                      <p className="font-bold">
                        {(item.quantity * item.unit_price).toFixed(2)} {contractForm.currency}
                      </p>
                      <button
                        type="button"
                        onClick={() => handleRemoveLine(item.service_price_id, index)}
                        className="glass-button-secondary"
                      >
                        Quitar
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          <div className="flex flex-wrap items-center justify-between gap-4">
            <div className="text-sm text-white/50">
              Base contractual operativa. Para firma real y cumplimiento normativo, revisa siempre la jurisdicción aplicable.
            </div>
            <div className="flex gap-3">
              <button type="button" onClick={() => setShowContractForm(false)} className="glass-button-secondary">
                Cancelar
              </button>
              <button
                type="button"
                disabled={creatingContract}
                onClick={() => void handleCreateContract()}
                className="glass-button-primary disabled:opacity-50"
              >
                <Save className="w-4 h-4" />
                {creatingContract ? 'Generando...' : 'Generar contrato'}
              </button>
            </div>
          </div>
        </section>
      ) : null}

      {selectedContract ? (
        <CollapsibleSection
          title="Revisión previa del contrato"
          description="Vista previa, checklist interno e historial del documento seleccionado."
          icon={<CheckCircle2 className="w-5 h-5" />}
          summary={selectedContract.contract_number}
          storageKey="contracts-review"
        >
          <div id="contracts-review-section" />
          <div className="space-y-6">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div>
              <p className="text-xs uppercase tracking-[0.2em] text-white/30 font-bold">
                Revisión previa
              </p>
              <h3 className="text-2xl font-bold mt-2">{selectedContract.contract_number}</h3>
              <p className="text-sm text-white/50 mt-2">
                {selectedContract.counterparty_name} · {selectedContract.counterparty_email || 'email pendiente'} ·{' '}
                {selectedContract.payment_integration_name || 'pago pendiente'} ·{' '}
                {selectedContract.signature_integration_name || 'firma manual'}
              </p>
            </div>

            <div className="flex flex-wrap gap-2">
              <span
                className={cn(
                  'text-[10px] px-2 py-1 rounded-full font-bold uppercase tracking-wider border',
                  getContractStatusClass(selectedContract.status),
                )}
              >
                {selectedContract.status}
              </span>
              <span
                className={cn(
                  'text-[10px] px-2 py-1 rounded-full font-bold uppercase tracking-wider border',
                  getValidationClass(selectedContract.validation_status),
                )}
              >
                {selectedContract.validation_status}
              </span>
            </div>
          </div>

          <div className="grid grid-cols-1 xl:grid-cols-[1.3fr_0.9fr] gap-6">
            <div className="space-y-4">
              <div className="rounded-2xl border border-white/10 bg-black/20 p-4">
                <div className="flex items-center justify-between gap-3 mb-4">
                  <p className="font-semibold">Vista previa del contrato</p>
                  <button
                    type="button"
                    onClick={() => handleDownloadContract(selectedContract)}
                    className="glass-button-secondary"
                  >
                    <Download className="w-4 h-4" />
                    Descargar
                  </button>
                </div>

                <pre className="whitespace-pre-wrap text-sm leading-6 text-white/80 font-mono max-h-[520px] overflow-y-auto">
                  {selectedContract.generated_body}
                </pre>
              </div>
            </div>

            <div className="space-y-4">
              <div className="rounded-2xl border border-white/10 bg-white/5 p-4 space-y-4">
                <div>
                  <p className="font-semibold">Checklist antes de enviar</p>
                  <p className="text-sm text-white/45 mt-1">
                    Usa esta revisión interna antes de pasar el contrato a firma.
                  </p>
                </div>

                <div className="space-y-2 text-sm">
                  <div className="flex items-center justify-between gap-4">
                    <span className="text-white/55">Contraparte</span>
                    <span className="font-medium">{selectedContract.counterparty_name || 'Pendiente'}</span>
                  </div>
                  <div className="flex items-center justify-between gap-4">
                    <span className="text-white/55">Email</span>
                    <span className="font-medium">{selectedContract.counterparty_email || 'Pendiente'}</span>
                  </div>
                  <div className="flex items-center justify-between gap-4">
                    <span className="text-white/55">Importe total</span>
                    <span className="font-medium">
                      {selectedContract.total_amount.toFixed(2)} {selectedContract.currency}
                    </span>
                  </div>
                  <div className="flex items-center justify-between gap-4">
                    <span className="text-white/55">Última actualización</span>
                    <span className="font-medium">{formatDateTime(selectedContract.updated_at)}</span>
                  </div>
                </div>

                {selectedContract.validation_notes.length ? (
                  <div className="rounded-xl border border-yellow-500/20 bg-yellow-500/10 p-3 space-y-2">
                    {selectedContract.validation_notes.map((note) => (
                      <p key={note} className="text-sm text-yellow-100/85">
                        {note}
                      </p>
                    ))}
                  </div>
                ) : (
                  <div className="rounded-xl border border-emerald-500/20 bg-emerald-500/10 p-3 text-sm text-emerald-200">
                    Sin incidencias detectadas en esta versión.
                  </div>
                )}

                <textarea
                  value={contractActionNote}
                  onChange={(event) => setContractActionNote(event.target.value)}
                  className="w-full glass-input min-h-[110px]"
                  placeholder="Nota interna para revisión, aprobación o envío"
                />

                <div className="flex flex-wrap gap-3">
                  <button
                    type="button"
                    onClick={() => handleOpenContractEmailDraft(selectedContract)}
                    disabled={!selectedContract.counterparty_email}
                    className="glass-button-secondary disabled:opacity-50"
                  >
                    <Mail className="w-4 h-4" />
                    Abrir email
                  </button>
                  <button
                    type="button"
                    onClick={() => void handleCopyContractEmailDraft(selectedContract)}
                    disabled={!selectedContract.counterparty_email}
                    className="glass-button-secondary disabled:opacity-50"
                  >
                    <Copy className="w-4 h-4" />
                    Copiar email
                  </button>
                  <button
                    type="button"
                    onClick={() => void handleReviewDecision(selectedContract, 'review')}
                    disabled={reviewingContractId === selectedContract.id}
                    className="glass-button-secondary disabled:opacity-50"
                  >
                    <FileText className="w-4 h-4" />
                    Abrir revisión
                  </button>
                  <button
                    type="button"
                    onClick={() => void handleReviewDecision(selectedContract, 'approve')}
                    disabled={
                      reviewingContractId === selectedContract.id ||
                      selectedContract.validation_status === 'invalid'
                    }
                    className="glass-button-primary disabled:opacity-50"
                  >
                    <CheckCircle2 className="w-4 h-4" />
                    Aprobar
                  </button>
                  <button
                    type="button"
                    onClick={() => void handleReviewDecision(selectedContract, 'changes_requested')}
                    disabled={reviewingContractId === selectedContract.id}
                    className="glass-button-secondary disabled:opacity-50"
                  >
                    <AlertCircle className="w-4 h-4" />
                    Pedir cambios
                  </button>
                  <button
                    type="button"
                    onClick={() => void handleSendContract(selectedContract)}
                    disabled={
                      sendingContractId === selectedContract.id ||
                      selectedContract.status !== 'ready' ||
                      selectedContract.validation_status === 'invalid' ||
                      !selectedContract.counterparty_email
                    }
                    className="glass-button-primary disabled:opacity-50"
                  >
                    <Send className="w-4 h-4" />
                    Enviar
                  </button>
                </div>
              </div>

              <div className="rounded-2xl border border-white/10 bg-white/5 p-4 space-y-4">
                <div className="flex items-center justify-between gap-3">
                  <p className="font-semibold">Historial del contrato</p>
                  {eventsLoading ? <RefreshCw className="w-4 h-4 animate-spin text-white/50" /> : null}
                </div>

                <div className="space-y-3 max-h-[360px] overflow-y-auto">
                  {eventsLoading ? (
                    Array.from({ length: 3 }).map((_, index) => (
                      <div
                        key={`contract-event-skeleton-${index}`}
                        className="h-16 rounded-2xl bg-white/5 animate-pulse"
                      />
                    ))
                  ) : contractEvents.length ? (
                    contractEvents.map((event) => (
                      <div key={event.id} className="rounded-2xl border border-white/10 bg-black/20 p-3">
                        <div className="flex items-start justify-between gap-3">
                          <div>
                            <p className="font-semibold text-sm">{event.title}</p>
                            <p className="text-xs text-white/40 mt-1">
                              {event.actor_name} · {formatDateTime(event.created_at)}
                            </p>
                          </div>
                          <span className="text-[10px] uppercase tracking-[0.2em] text-white/35 font-bold">
                            {event.event_type}
                          </span>
                        </div>
                        <p className="text-sm text-white/60 mt-3">{event.description}</p>
                      </div>
                    ))
                  ) : (
                    <p className="text-sm text-white/45">
                      Este contrato todavía no tiene eventos de revisión registrados.
                    </p>
                  )}
                </div>
              </div>
            </div>
          </div>
          </div>
        </CollapsibleSection>
      ) : null}

      <div id="contracts-resources-anchor" />
      <CollapsibleSection
        title="Recursos contractuales"
        description="Base de servicios y colaboradores listos para nuevos contratos."
        icon={<Briefcase className="w-5 h-5" />}
        storageKey="contracts-resources"
        defaultOpen={false}
      >
        <div className="grid grid-cols-1 xl:grid-cols-2 gap-6">
        <section className="glass-panel p-6 space-y-5" id="contracts-services-section">
          <div className="flex items-center justify-between gap-4">
            <div>
              <h3 className="text-lg font-bold">Base de precios</h3>
              <p className="text-sm text-white/45">Servicios y tarifas reutilizables para contratos.</p>
            </div>
            <button type="button" onClick={() => setShowServiceForm((current) => !current)} className="glass-button-secondary">
              <Plus className="w-4 h-4" />
              Servicio
            </button>
          </div>

          {showServiceForm ? (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              <input
                value={serviceForm.name}
                onChange={(event) => setServiceForm((current) => ({ ...current, name: event.target.value }))}
                className="glass-input"
                placeholder="Nombre del servicio"
              />
              <input
                value={serviceForm.category}
                onChange={(event) =>
                  setServiceForm((current) => ({ ...current, category: event.target.value }))
                }
                className="glass-input"
                placeholder="Categoría"
              />
              <select
                value={serviceForm.service_scope}
                onChange={(event) =>
                  setServiceForm((current) => ({
                    ...current,
                    service_scope: event.target.value as ServicePrice['service_scope'],
                  }))
                }
                className="glass-input"
              >
                <option value="client">Cliente</option>
                <option value="freelance">Freelance</option>
                <option value="both">Ambos</option>
              </select>
              <select
                value={serviceForm.billing_model}
                onChange={(event) =>
                  setServiceForm((current) => ({
                    ...current,
                    billing_model: event.target.value as ServicePrice['billing_model'],
                  }))
                }
                className="glass-input"
              >
                <option value="one_time">Puntual</option>
                <option value="monthly">Mensual</option>
                <option value="hourly">Por hora</option>
                <option value="weekly">Semanal</option>
                <option value="performance">Performance</option>
              </select>
              <input
                value={serviceForm.default_price}
                onChange={(event) =>
                  setServiceForm((current) => ({ ...current, default_price: event.target.value }))
                }
                className="glass-input"
                placeholder="Precio base"
                type="number"
                min="0"
                step="0.01"
              />
              <input
                value={serviceForm.tax_rate}
                onChange={(event) =>
                  setServiceForm((current) => ({ ...current, tax_rate: event.target.value }))
                }
                className="glass-input"
                placeholder="IVA"
                type="number"
                min="0"
                step="0.01"
              />
              <input
                value={serviceForm.unit_label}
                onChange={(event) =>
                  setServiceForm((current) => ({ ...current, unit_label: event.target.value }))
                }
                className="glass-input"
                placeholder="Unidad"
              />
              <input
                value={serviceForm.legal_label}
                onChange={(event) =>
                  setServiceForm((current) => ({ ...current, legal_label: event.target.value }))
                }
                className="glass-input"
                placeholder="Etiqueta legal"
              />
              <textarea
                value={serviceForm.description}
                onChange={(event) =>
                  setServiceForm((current) => ({ ...current, description: event.target.value }))
                }
                className="glass-input md:col-span-2 min-h-[88px]"
                placeholder="Descripción operativa del servicio"
              />
              <div className="md:col-span-2 flex justify-end gap-3">
                <button type="button" onClick={() => setShowServiceForm(false)} className="glass-button-secondary">
                  Cancelar
                </button>
                <button
                  type="button"
                  disabled={creatingService}
                  onClick={() => void handleCreateService()}
                  className="glass-button-primary disabled:opacity-50"
                >
                  {creatingService ? 'Guardando...' : 'Guardar servicio'}
                </button>
              </div>
            </div>
          ) : null}

          <div className="space-y-3 max-h-[520px] overflow-y-auto">
            {loading
              ? Array.from({ length: 3 }).map((_, index) => (
                <div key={`service-skeleton-${index}`} className="h-20 rounded-2xl bg-white/5 animate-pulse" />
              ))
              : activeServices.map((service) => (
                <div key={service.id} className="p-4 rounded-2xl border border-white/10 bg-white/5">
                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <div>
                      <p className="font-semibold">{service.name}</p>
                      <p className="text-sm text-white/45">
                        {service.category} · {service.service_scope} · {service.billing_model}
                      </p>
                    </div>
                    <div className="text-right">
                      <p className="font-bold">
                        {service.default_price.toFixed(2)} {service.currency}
                      </p>
                      <p className="text-xs text-white/40">IVA {service.tax_rate}%</p>
                    </div>
                  </div>
                  {service.description ? (
                    <p className="text-sm text-white/50 mt-3">{service.description}</p>
                  ) : null}
                </div>
              ))}
          </div>
        </section>

        <section className="glass-panel p-6 space-y-5" id="contracts-freelancers-section">
          <div className="flex items-center justify-between gap-4">
            <div>
              <h3 className="text-lg font-bold">Freelancers</h3>
              <p className="text-sm text-white/45">Colaboradores externos listos para contratos y payouts.</p>
            </div>
            <button
              type="button"
              onClick={() => setShowFreelancerForm((current) => !current)}
              className="glass-button-secondary"
            >
              <UserPlus className="w-4 h-4" />
              Freelance
            </button>
          </div>

          {showFreelancerForm ? (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              <input
                value={freelancerForm.name}
                onChange={(event) =>
                  setFreelancerForm((current) => ({ ...current, name: event.target.value }))
                }
                className="glass-input"
                placeholder="Nombre"
              />
              <input
                value={freelancerForm.email}
                onChange={(event) =>
                  setFreelancerForm((current) => ({ ...current, email: event.target.value }))
                }
                className="glass-input"
                placeholder="Email"
              />
              <input
                value={freelancerForm.specialty}
                onChange={(event) =>
                  setFreelancerForm((current) => ({ ...current, specialty: event.target.value }))
                }
                className="glass-input"
                placeholder="Especialidad"
              />
              <input
                value={freelancerForm.hourly_rate}
                onChange={(event) =>
                  setFreelancerForm((current) => ({ ...current, hourly_rate: event.target.value }))
                }
                className="glass-input"
                placeholder="Tarifa hora"
                type="number"
                min="0"
                step="0.01"
              />
              <input
                value={freelancerForm.payment_method}
                onChange={(event) =>
                  setFreelancerForm((current) => ({ ...current, payment_method: event.target.value }))
                }
                className="glass-input"
                placeholder="Método de pago"
              />
              <input
                value={freelancerForm.payout_reference}
                onChange={(event) =>
                  setFreelancerForm((current) => ({ ...current, payout_reference: event.target.value }))
                }
                className="glass-input"
                placeholder="Referencia de pago"
              />
              <select
                value={freelancerForm.payout_integration_key}
                onChange={(event) =>
                  setFreelancerForm((current) => ({
                    ...current,
                    payout_integration_key: event.target.value as Integration['key'],
                  }))
                }
                className="glass-input"
              >
                {paymentOptions.map((option) => (
                  <option key={option.key} value={option.key}>
                    {option.label}
                  </option>
                ))}
              </select>
              <textarea
                value={freelancerForm.notes}
                onChange={(event) =>
                  setFreelancerForm((current) => ({ ...current, notes: event.target.value }))
                }
                className="glass-input md:col-span-2 min-h-[88px]"
                placeholder="Notas internas"
              />
              <div className="md:col-span-2 flex justify-end gap-3">
                <button type="button" onClick={() => setShowFreelancerForm(false)} className="glass-button-secondary">
                  Cancelar
                </button>
                <button
                  type="button"
                  disabled={creatingFreelancer}
                  onClick={() => void handleCreateFreelancer()}
                  className="glass-button-primary disabled:opacity-50"
                >
                  {creatingFreelancer ? 'Guardando...' : 'Guardar freelance'}
                </button>
              </div>
            </div>
          ) : null}

          <div className="space-y-3 max-h-[520px] overflow-y-auto">
            {loading
              ? Array.from({ length: 3 }).map((_, index) => (
                <div key={`freelancer-skeleton-${index}`} className="h-24 rounded-2xl bg-white/5 animate-pulse" />
              ))
              : freelancers.map((freelancer) => (
                <div key={freelancer.id} className="p-4 rounded-2xl border border-white/10 bg-white/5">
                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <div>
                      <p className="font-semibold">{freelancer.name}</p>
                      <p className="text-sm text-white/45">
                        {freelancer.specialty || 'Sin especialidad'} · {freelancer.email}
                      </p>
                    </div>
                    <div className="text-right">
                      <p className="font-bold">
                        {freelancer.hourly_rate.toFixed(2)} {freelancer.currency}/h
                      </p>
                      <p className="text-xs text-white/40">
                        {freelancer.payout_integration_name || freelancer.payment_method || 'Pago pendiente'}
                      </p>
                    </div>
                  </div>
                </div>
              ))}
          </div>
        </section>
        </div>
      </CollapsibleSection>

      <CollapsibleSection
        title="Contratos creados"
        description="Listado completo de documentos generados desde la base tarifaria."
        icon={<FileText className="w-5 h-5" />}
        summary={`${filteredContracts.length} contratos`}
        storageKey="contracts-list"
        bodyClassName="p-0"
      >
        <div id="contracts-created-section" />
        <div className="p-6 border-b border-white/10 flex flex-wrap items-center justify-between gap-4">
          <div>
            <h3 className="text-lg font-bold">Contratos creados</h3>
            <p className="text-sm text-white/45">Todos los contratos generados desde base de tarifas.</p>
          </div>

          <div className="flex gap-3">
            <select
              value={contractTypeFilter}
              onChange={(event) => setContractTypeFilter(event.target.value as typeof contractTypeFilter)}
              className="glass-input"
            >
              <option value="all">Todos</option>
              <option value="client">Clientes</option>
              <option value="freelance">Freelance</option>
            </select>
          </div>
        </div>

        <div className="divide-y divide-white/5">
          {loading ? (
            Array.from({ length: 3 }).map((_, index) => (
              <div key={`contract-skeleton-${index}`} className="h-32 bg-white/5 animate-pulse" />
            ))
          ) : filteredContracts.length === 0 ? (
            <div className="p-6 text-white/45">Todavía no hay contratos generados.</div>
          ) : (
            filteredContracts.map((contract) => (
              <div
                key={contract.id}
                className={cn(
                  'p-6 space-y-4 transition-colors',
                  selectedContract?.id === contract.id && 'bg-brand-blue/5',
                )}
              >
                <div className="flex flex-wrap items-start justify-between gap-4">
                  <div>
                    <div className="flex flex-wrap items-center gap-2">
                      <p className="font-bold text-lg">{contract.contract_number}</p>
                      <span
                        className={cn(
                          'text-[10px] px-2 py-1 rounded-full font-bold uppercase tracking-wider border',
                          getContractStatusClass(contract.status),
                        )}
                      >
                        {contract.status}
                      </span>
                      <span
                        className={cn(
                          'text-[10px] px-2 py-1 rounded-full font-bold uppercase tracking-wider border',
                          getValidationClass(contract.validation_status),
                        )}
                      >
                        {contract.validation_status}
                      </span>
                    </div>
                    <p className="text-sm text-white/45 mt-2">
                      {contract.contract_type === 'client'
                        ? contract.client_name || contract.counterparty_name
                        : contract.freelancer_name || contract.counterparty_name}
                      {' · '}
                      {contract.template_key}
                      {' · '}
                      {contract.start_date}
                      {contract.end_date ? ` -> ${contract.end_date}` : ''}
                    </p>
                    {contract.validation_notes.length ? (
                      <div className="mt-3 flex items-start gap-2 text-sm text-yellow-200/80">
                        <AlertCircle className="w-4 h-4 mt-0.5" />
                        <div className="space-y-1">
                          {contract.validation_notes.map((note) => (
                            <p key={note}>{note}</p>
                          ))}
                        </div>
                      </div>
                    ) : null}
                  </div>

                  <div className="text-right">
                    <p className="text-2xl font-bold">
                      {contract.total_amount.toFixed(2)} {contract.currency}
                    </p>
                    <p className="text-sm text-white/45">
                      {contract.payment_integration_name || 'Pago pendiente'} ·{' '}
                      {contract.signature_integration_name || 'Firma manual'}
                    </p>
                  </div>
                </div>

                <div className="grid grid-cols-1 lg:grid-cols-[1.4fr_auto] gap-4 items-start">
                  <div className="space-y-2">
                    <p className="text-sm text-white/55">{contract.scope_summary || 'Sin alcance detallado.'}</p>
                    {contract.line_items.length ? (
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
                        {contract.line_items.slice(0, 4).map((item) => (
                          <div key={item.id} className="rounded-xl border border-white/10 bg-white/5 p-3">
                            <p className="font-semibold text-sm">{item.title}</p>
                            <p className="text-xs text-white/45 mt-1">
                              {item.quantity} x {item.unit_price.toFixed(2)} {contract.currency}
                            </p>
                          </div>
                        ))}
                      </div>
                    ) : null}
                  </div>

                  <div className="flex flex-wrap gap-3 justify-end">
                    <button
                      type="button"
                      onClick={() => setSelectedContractId(contract.id)}
                      className="glass-button-secondary"
                    >
                      <FileText className="w-4 h-4" />
                      Abrir
                    </button>
                    <select
                      value={contract.status}
                      onChange={(event) =>
                        void handleUpdateContractStatus(contract, event.target.value as Contract['status'])
                      }
                      disabled={updatingContractId === contract.id}
                      className="glass-input min-w-[160px]"
                    >
                      <option value="draft">draft</option>
                      <option value="review">review</option>
                      <option value="ready">ready</option>
                      <option value="sent">sent</option>
                      <option value="signed">signed</option>
                      <option value="archived">archived</option>
                    </select>
                    <button type="button" onClick={() => handleDownloadContract(contract)} className="glass-button-secondary">
                      <Download className="w-4 h-4" />
                      Descargar
                    </button>
                  </div>
                </div>
              </div>
            ))
          )}
        </div>
      </CollapsibleSection>
    </div>
  );
};
