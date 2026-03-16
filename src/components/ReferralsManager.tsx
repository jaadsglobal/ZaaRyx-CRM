import React, { useEffect, useMemo, useState } from 'react';
import {
  CheckCircle2,
  Copy,
  DollarSign,
  Gift,
  Link2,
  PauseCircle,
  PlayCircle,
  Plus,
  RefreshCw,
  RotateCcw,
  Users,
} from 'lucide-react';
import { Client, Referral, ReferralCode, ReferralOverview, cn } from '../types';
import { PartnerReferralsPanel } from './PartnerReferralsPanel';

const getResponseJson = async <T,>(response: Response): Promise<T> => {
  if (!response.ok) {
    const errorData = (await response.json().catch(() => null)) as { error?: string } | null;
    throw new Error(errorData?.error || `Request failed with status ${response.status}`);
  }

  return response.json() as Promise<T>;
};

const createInitialCodeForm = (clientId?: number) => ({
  client_id: clientId ? String(clientId) : '',
  landing_url: '',
  commission_type: 'percent' as ReferralCode['commission_type'],
  commission_value: '10',
  reward_description: '',
  notes: '',
});

const createInitialReferralForm = (referralCodeId?: number) => ({
  referral_code_id: referralCodeId ? String(referralCodeId) : '',
  referred_name: '',
  referred_company: '',
  referred_email: '',
  referred_phone: '',
  source: 'manual',
  notes: '',
  auto_create_lead: true,
});

type ReferralEditState = Record<
  number,
  {
    status: Referral['status'];
    payout_status: Referral['payout_status'];
    commission_amount: string;
  }
>;

const getCodeStatusClasses = (status: ReferralCode['status']) => {
  switch (status) {
    case 'active':
      return 'bg-green-500/10 text-green-400 border-green-500/20';
    case 'paused':
      return 'bg-yellow-500/10 text-yellow-400 border-yellow-500/20';
    case 'archived':
      return 'bg-white/10 text-white/50 border-white/10';
    default:
      return 'bg-white/10 text-white/50 border-white/10';
  }
};

const getReferralStatusClasses = (status: Referral['status']) => {
  switch (status) {
    case 'converted':
      return 'bg-green-500/10 text-green-400 border-green-500/20';
    case 'qualified':
      return 'bg-brand-purple/20 text-brand-purple border-brand-purple/20';
    case 'lead':
      return 'bg-brand-blue/20 text-brand-blue border-brand-blue/20';
    case 'rejected':
      return 'bg-red-500/10 text-red-400 border-red-500/20';
    default:
      return 'bg-white/10 text-white/60 border-white/10';
  }
};

const getPayoutStatusClasses = (status: Referral['payout_status']) => {
  switch (status) {
    case 'paid':
      return 'bg-green-500/10 text-green-400 border-green-500/20';
    case 'approved':
      return 'bg-brand-cyan/20 text-brand-cyan border-brand-cyan/20';
    case 'cancelled':
      return 'bg-white/10 text-white/50 border-white/10';
    default:
      return 'bg-yellow-500/10 text-yellow-400 border-yellow-500/20';
  }
};

export const ReferralsManager: React.FC = () => {
  const [clients, setClients] = useState<Client[]>([]);
  const [overview, setOverview] = useState<ReferralOverview | null>(null);
  const [codes, setCodes] = useState<ReferralCode[]>([]);
  const [referrals, setReferrals] = useState<Referral[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [showCodeForm, setShowCodeForm] = useState(false);
  const [showReferralForm, setShowReferralForm] = useState(false);
  const [clientFilter, setClientFilter] = useState('all');
  const [statusFilter, setStatusFilter] = useState<'all' | Referral['status']>('all');
  const [payoutFilter, setPayoutFilter] = useState<'all' | Referral['payout_status']>('all');
  const [feedbackMessage, setFeedbackMessage] = useState<string | null>(null);
  const [feedbackTone, setFeedbackTone] = useState<'success' | 'error'>('success');
  const [creatingCode, setCreatingCode] = useState(false);
  const [creatingReferral, setCreatingReferral] = useState(false);
  const [updatingCodeId, setUpdatingCodeId] = useState<number | null>(null);
  const [regeneratingCodeId, setRegeneratingCodeId] = useState<number | null>(null);
  const [savingReferralId, setSavingReferralId] = useState<number | null>(null);
  const [codeForm, setCodeForm] = useState(createInitialCodeForm());
  const [referralForm, setReferralForm] = useState(createInitialReferralForm());
  const [referralEdits, setReferralEdits] = useState<ReferralEditState>({});

  const setMessage = (message: string, tone: 'success' | 'error' = 'success') => {
    setFeedbackTone(tone);
    setFeedbackMessage(message);
  };

  const loadReferralsData = async (background = false) => {
    if (background) {
      setRefreshing(true);
    } else {
      setLoading(true);
    }

    try {
      const [overviewResponse, clientsResponse, codesResponse, referralsResponse] = await Promise.all([
        fetch('/api/referral-overview'),
        fetch('/api/clients'),
        fetch('/api/referral-codes'),
        fetch('/api/referrals'),
      ]);

      const [overviewData, clientsData, codesData, referralsData] = await Promise.all([
        getResponseJson<ReferralOverview>(overviewResponse),
        getResponseJson<Client[]>(clientsResponse),
        getResponseJson<ReferralCode[]>(codesResponse),
        getResponseJson<Referral[]>(referralsResponse),
      ]);

      setOverview(overviewData);
      setClients(clientsData);
      setCodes(codesData);
      setReferrals(referralsData);
      setReferralEdits(
        referralsData.reduce<ReferralEditState>((accumulator, referral) => {
          accumulator[referral.id] = {
            status: referral.status,
            payout_status: referral.payout_status,
            commission_amount: String(referral.commission_amount ?? 0),
          };
          return accumulator;
        }, {}),
      );
      setCodeForm((currentForm) =>
        currentForm.client_id || clientsData.length === 0
          ? currentForm
          : createInitialCodeForm(clientsData[0].id),
      );
      setReferralForm((currentForm) =>
        currentForm.referral_code_id || codesData.length === 0
          ? currentForm
          : createInitialReferralForm(codesData[0].id),
      );
    } catch (error) {
      console.error('Error loading referrals:', error);
      setMessage('No se pudo cargar el módulo de referidos.', 'error');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  useEffect(() => {
    void loadReferralsData();
  }, []);

  const filteredReferrals = useMemo(
    () =>
      referrals.filter((referral) => {
        const matchesClient =
          clientFilter === 'all' || referral.referrer_client_id === Number(clientFilter);
        const matchesStatus = statusFilter === 'all' || referral.status === statusFilter;
        const matchesPayout = payoutFilter === 'all' || referral.payout_status === payoutFilter;
        return matchesClient && matchesStatus && matchesPayout;
      }),
    [clientFilter, payoutFilter, referrals, statusFilter],
  );

  const visibleCodes = useMemo(
    () =>
      clientFilter === 'all'
        ? codes
        : codes.filter((code) => code.client_id === Number(clientFilter)),
    [clientFilter, codes],
  );

  const handleCopy = async (value: string, message: string) => {
    try {
      await navigator.clipboard.writeText(value);
      setMessage(message);
    } catch (error) {
      console.error('Error copying referral value:', error);
      setMessage('No se pudo copiar al portapapeles.', 'error');
    }
  };

  const handleCreateCode = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setCreatingCode(true);

    try {
      await getResponseJson<ReferralCode>(
        await fetch('/api/referral-codes', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            client_id: Number(codeForm.client_id),
            landing_url: codeForm.landing_url || null,
            commission_type: codeForm.commission_type,
            commission_value: Number(codeForm.commission_value),
            reward_description: codeForm.reward_description || null,
            notes: codeForm.notes || null,
          }),
        }),
      );

      await loadReferralsData(true);
      setShowCodeForm(false);
      setCodeForm(createInitialCodeForm(clients[0]?.id));
      setMessage('Código de referido creado correctamente.');
    } catch (error) {
      console.error('Error creating referral code:', error);
      setMessage(error instanceof Error ? error.message : 'No se pudo crear el código.', 'error');
    } finally {
      setCreatingCode(false);
    }
  };

  const handleCreateReferral = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setCreatingReferral(true);

    try {
      await getResponseJson<Referral>(
        await fetch('/api/referrals', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            referral_code_id: Number(referralForm.referral_code_id),
            referred_name: referralForm.referred_name,
            referred_company: referralForm.referred_company || null,
            referred_email: referralForm.referred_email || null,
            referred_phone: referralForm.referred_phone || null,
            source: referralForm.source,
            notes: referralForm.notes || null,
            auto_create_lead: referralForm.auto_create_lead,
          }),
        }),
      );

      await loadReferralsData(true);
      setShowReferralForm(false);
      setReferralForm(createInitialReferralForm(codes[0]?.id));
      setMessage('Referido registrado correctamente.');
    } catch (error) {
      console.error('Error creating referral:', error);
      setMessage(error instanceof Error ? error.message : 'No se pudo registrar el referido.', 'error');
    } finally {
      setCreatingReferral(false);
    }
  };

  const handleToggleCodeStatus = async (referralCode: ReferralCode) => {
    setUpdatingCodeId(referralCode.id);

    try {
      const nextStatus: ReferralCode['status'] =
        referralCode.status === 'active' ? 'paused' : 'active';
      await getResponseJson<ReferralCode>(
        await fetch(`/api/referral-codes/${referralCode.id}`, {
          method: 'PATCH',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({ status: nextStatus }),
        }),
      );

      await loadReferralsData(true);
      setMessage(
        nextStatus === 'active'
          ? `Código ${referralCode.code} activado.`
          : `Código ${referralCode.code} pausado.`,
      );
    } catch (error) {
      console.error('Error updating referral code:', error);
      setMessage(
        error instanceof Error ? error.message : 'No se pudo actualizar el código.',
        'error',
      );
    } finally {
      setUpdatingCodeId(null);
    }
  };

  const handleRegenerateCode = async (referralCode: ReferralCode) => {
    setRegeneratingCodeId(referralCode.id);

    try {
      const response = await getResponseJson<{ regenerated: boolean; referral_code: ReferralCode }>(
        await fetch(`/api/referral-codes/${referralCode.id}/regenerate`, {
          method: 'POST',
        }),
      );

      await loadReferralsData(true);
      setMessage(`Código regenerado: ${response.referral_code.code}.`);
    } catch (error) {
      console.error('Error regenerating referral code:', error);
      setMessage(
        error instanceof Error ? error.message : 'No se pudo regenerar el código.',
        'error',
      );
    } finally {
      setRegeneratingCodeId(null);
    }
  };

  const handleSaveReferral = async (referral: Referral) => {
    const draft = referralEdits[referral.id];

    if (!draft) {
      return;
    }

    setSavingReferralId(referral.id);

    try {
      await getResponseJson<Referral>(
        await fetch(`/api/referrals/${referral.id}/status`, {
          method: 'PATCH',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            status: draft.status,
            payout_status: draft.payout_status,
            commission_amount: Number(draft.commission_amount),
          }),
        }),
      );

      await loadReferralsData(true);
      setMessage(`Referido ${referral.referred_name} actualizado.`);
    } catch (error) {
      console.error('Error updating referral:', error);
      setMessage(error instanceof Error ? error.message : 'No se pudo actualizar el referido.', 'error');
    } finally {
      setSavingReferralId(null);
    }
  };

  return (
    <div className="space-y-8">
      <header className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h2 className="text-3xl font-bold">Referidos</h2>
          <p className="text-white/50">
            Gestiona códigos, enlaces, captación referida y payouts conectados con clientes y cobros.
          </p>
        </div>

        <div className="flex flex-wrap gap-3">
          <button
            type="button"
            onClick={() => void loadReferralsData(true)}
            disabled={refreshing}
            className="glass-button-secondary disabled:opacity-50"
          >
            <RefreshCw className="w-5 h-5" />
            {refreshing ? 'Actualizando...' : 'Actualizar'}
          </button>
          <button
            type="button"
            onClick={() => setShowCodeForm((current) => !current)}
            className="glass-button-secondary"
          >
            <Link2 className="w-5 h-5" />
            Nuevo Código
          </button>
          <button
            type="button"
            onClick={() => setShowReferralForm((current) => !current)}
            className="glass-button-primary"
          >
            <Plus className="w-5 h-5" />
            Nuevo Referido
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

      {showCodeForm ? (
        <form onSubmit={handleCreateCode} className="glass-panel p-6 grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <label className="block text-xs font-bold uppercase tracking-wider text-white/40 mb-2">
              Cliente
            </label>
            <select
              required
              value={codeForm.client_id}
              onChange={(event) =>
                setCodeForm((current) => ({
                  ...current,
                  client_id: event.target.value,
                }))
              }
              className="w-full glass-input"
            >
              <option value="">Selecciona un cliente</option>
              {clients.map((client) => (
                <option key={client.id} value={client.id}>
                  {client.company}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="block text-xs font-bold uppercase tracking-wider text-white/40 mb-2">
              Landing o URL destino
            </label>
            <input
              value={codeForm.landing_url}
              onChange={(event) =>
                setCodeForm((current) => ({
                  ...current,
                  landing_url: event.target.value,
                }))
              }
              className="w-full glass-input"
              placeholder="https://tu-landing.com/oferta"
            />
          </div>

          <div>
            <label className="block text-xs font-bold uppercase tracking-wider text-white/40 mb-2">
              Tipo de comisión
            </label>
            <select
              value={codeForm.commission_type}
              onChange={(event) =>
                setCodeForm((current) => ({
                  ...current,
                  commission_type: event.target.value as ReferralCode['commission_type'],
                }))
              }
              className="w-full glass-input"
            >
              <option value="percent">Porcentaje</option>
              <option value="fixed">Importe fijo</option>
            </select>
          </div>

          <div>
            <label className="block text-xs font-bold uppercase tracking-wider text-white/40 mb-2">
              Valor comisión
            </label>
            <input
              type="number"
              min="0"
              step="0.01"
              value={codeForm.commission_value}
              onChange={(event) =>
                setCodeForm((current) => ({
                  ...current,
                  commission_value: event.target.value,
                }))
              }
              className="w-full glass-input"
              placeholder="10"
            />
          </div>

          <div>
            <label className="block text-xs font-bold uppercase tracking-wider text-white/40 mb-2">
              Incentivo visible
            </label>
            <input
              value={codeForm.reward_description}
              onChange={(event) =>
                setCodeForm((current) => ({
                  ...current,
                  reward_description: event.target.value,
                }))
              }
              className="w-full glass-input"
              placeholder="10% por cada cliente cerrado"
            />
          </div>

          <div>
            <label className="block text-xs font-bold uppercase tracking-wider text-white/40 mb-2">
              Notas
            </label>
            <input
              value={codeForm.notes}
              onChange={(event) =>
                setCodeForm((current) => ({
                  ...current,
                  notes: event.target.value,
                }))
              }
              className="w-full glass-input"
              placeholder="Uso interno o condiciones especiales"
            />
          </div>

          <div className="md:col-span-2 flex justify-end gap-3">
            <button type="button" onClick={() => setShowCodeForm(false)} className="glass-button-secondary">
              Cancelar
            </button>
            <button
              type="submit"
              disabled={creatingCode}
              className="glass-button-primary disabled:opacity-50"
            >
              {creatingCode ? 'Creando...' : 'Crear Código'}
            </button>
          </div>
        </form>
      ) : null}

      {showReferralForm ? (
        <form onSubmit={handleCreateReferral} className="glass-panel p-6 grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <label className="block text-xs font-bold uppercase tracking-wider text-white/40 mb-2">
              Código de referido
            </label>
            <select
              required
              value={referralForm.referral_code_id}
              onChange={(event) =>
                setReferralForm((current) => ({
                  ...current,
                  referral_code_id: event.target.value,
                }))
              }
              className="w-full glass-input"
            >
              <option value="">Selecciona un código</option>
              {codes.map((code) => (
                <option key={code.id} value={code.id}>
                  {code.code} · {code.client_name}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="block text-xs font-bold uppercase tracking-wider text-white/40 mb-2">
              Nombre del referido
            </label>
            <input
              required
              value={referralForm.referred_name}
              onChange={(event) =>
                setReferralForm((current) => ({
                  ...current,
                  referred_name: event.target.value,
                }))
              }
              className="w-full glass-input"
              placeholder="Nombre y apellidos"
            />
          </div>

          <div>
            <label className="block text-xs font-bold uppercase tracking-wider text-white/40 mb-2">
              Empresa
            </label>
            <input
              value={referralForm.referred_company}
              onChange={(event) =>
                setReferralForm((current) => ({
                  ...current,
                  referred_company: event.target.value,
                }))
              }
              className="w-full glass-input"
              placeholder="Empresa del referido"
            />
          </div>

          <div>
            <label className="block text-xs font-bold uppercase tracking-wider text-white/40 mb-2">
              Email
            </label>
            <input
              type="email"
              value={referralForm.referred_email}
              onChange={(event) =>
                setReferralForm((current) => ({
                  ...current,
                  referred_email: event.target.value,
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
              value={referralForm.referred_phone}
              onChange={(event) =>
                setReferralForm((current) => ({
                  ...current,
                  referred_phone: event.target.value,
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
              value={referralForm.source}
              onChange={(event) =>
                setReferralForm((current) => ({
                  ...current,
                  source: event.target.value,
                }))
              }
              className="w-full glass-input"
              placeholder="manual, whatsapp, email, evento..."
            />
          </div>

          <label className="glass-input md:col-span-2 flex items-center justify-between cursor-pointer">
            <span className="text-sm">Crear lead automáticamente en el CRM</span>
            <input
              type="checkbox"
              checked={referralForm.auto_create_lead}
              onChange={(event) =>
                setReferralForm((current) => ({
                  ...current,
                  auto_create_lead: event.target.checked,
                }))
              }
            />
          </label>

          <div className="md:col-span-2 flex justify-end gap-3">
            <button type="button" onClick={() => setShowReferralForm(false)} className="glass-button-secondary">
              Cancelar
            </button>
            <button
              type="submit"
              disabled={creatingReferral}
              className="glass-button-primary disabled:opacity-50"
            >
              {creatingReferral ? 'Guardando...' : 'Registrar Referido'}
            </button>
          </div>
        </form>
      ) : null}

      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-6">
        {[
          {
            label: 'Códigos activos',
            value: overview?.summary.active_codes || 0,
            hint: 'listos para captar',
            icon: Link2,
          },
          {
            label: 'Referidos totales',
            value: overview?.summary.total_referrals || 0,
            hint: 'captados o registrados',
            icon: Users,
          },
          {
            label: 'Convertidos',
            value: overview?.summary.converted_referrals || 0,
            hint: `${overview?.summary.conversion_rate || 0}% de conversión`,
            icon: CheckCircle2,
          },
          {
            label: 'Comisión pendiente',
            value: `€${(overview?.summary.pending_commissions || 0).toLocaleString()}`,
            hint: 'pendiente + aprobada',
            icon: DollarSign,
          },
        ].map((card) => (
          <div key={card.label} className="glass-card p-6">
            <div className="flex items-center gap-3">
              <div className="w-12 h-12 rounded-xl bg-white/5 flex items-center justify-center">
                <card.icon className="w-6 h-6 text-brand-cyan" />
              </div>
              <div>
                <p className="text-xs uppercase tracking-wider text-white/35 font-bold">
                  {card.label}
                </p>
                <p className="text-2xl font-bold mt-1">{card.value}</p>
              </div>
            </div>
            <p className="text-xs text-white/40 mt-4">{card.hint}</p>
          </div>
        ))}
      </div>

      <div className="glass-panel p-4 grid grid-cols-1 md:grid-cols-3 gap-4">
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

        <select
          value={statusFilter}
          onChange={(event) => setStatusFilter(event.target.value as 'all' | Referral['status'])}
          className="glass-input"
        >
          <option value="all">Todos los estados</option>
          <option value="invited">Invitado</option>
          <option value="lead">Lead</option>
          <option value="qualified">Calificado</option>
          <option value="converted">Convertido</option>
          <option value="rejected">Rechazado</option>
        </select>

        <select
          value={payoutFilter}
          onChange={(event) =>
            setPayoutFilter(event.target.value as 'all' | Referral['payout_status'])
          }
          className="glass-input"
        >
          <option value="all">Todos los payouts</option>
          <option value="pending">Pendiente</option>
          <option value="approved">Aprobado</option>
          <option value="paid">Pagado</option>
          <option value="cancelled">Cancelado</option>
        </select>
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-3 gap-6">
        <section className="glass-panel overflow-hidden xl:col-span-2">
          <div className="p-6 border-b border-white/10">
            <div className="flex items-center gap-3">
              <Gift className="w-5 h-5 text-brand-blue" />
              <h3 className="font-bold text-lg">Códigos y enlaces activos</h3>
            </div>
          </div>

          <div className="divide-y divide-white/5">
            {loading ? (
              <div className="p-6 text-white/40">Cargando códigos...</div>
            ) : visibleCodes.length === 0 ? (
              <div className="p-6 text-white/40">No hay códigos para los filtros actuales.</div>
            ) : (
              visibleCodes.map((code) => (
                <div key={code.id} className="p-6 space-y-4">
                  <div className="flex flex-wrap items-start justify-between gap-4">
                    <div>
                      <div className="flex items-center gap-3">
                        <p className="font-bold">{code.code}</p>
                        <span
                          className={cn(
                            'px-3 py-1 rounded-full text-[10px] font-bold uppercase tracking-wider border',
                            getCodeStatusClasses(code.status),
                          )}
                        >
                          {code.status}
                        </span>
                      </div>
                      <p className="text-sm text-white/45 mt-1">
                        {code.client_name} ·{' '}
                        {code.commission_type === 'percent'
                          ? `${code.commission_value}%`
                          : `€${code.commission_value.toLocaleString()}`}{' '}
                        por referido cerrado
                      </p>
                    </div>

                    <div className="flex flex-wrap gap-2">
                      <button
                        type="button"
                        onClick={() => void handleCopy(code.code, `Código ${code.code} copiado.`)}
                        className="glass-button-secondary"
                      >
                        <Copy className="w-4 h-4" />
                        Copiar código
                      </button>
                      <button
                        type="button"
                        onClick={() =>
                          void handleCopy(code.referral_link, `Enlace ${code.code} copiado.`)
                        }
                        className="glass-button-secondary"
                      >
                        <Link2 className="w-4 h-4" />
                        Copiar enlace
                      </button>
                      <button
                        type="button"
                        onClick={() =>
                          void handleCopy(
                            code.capture_endpoint,
                            `Endpoint de captura ${code.code} copiado.`,
                          )
                        }
                        className="glass-button-secondary"
                      >
                        <Gift className="w-4 h-4" />
                        Endpoint
                      </button>
                      <button
                        type="button"
                        disabled={updatingCodeId === code.id}
                        onClick={() => void handleToggleCodeStatus(code)}
                        className="glass-button-secondary disabled:opacity-50"
                      >
                        {code.status === 'active' ? (
                          <PauseCircle className="w-4 h-4" />
                        ) : (
                          <PlayCircle className="w-4 h-4" />
                        )}
                        {code.status === 'active' ? 'Pausar' : 'Activar'}
                      </button>
                      <button
                        type="button"
                        disabled={regeneratingCodeId === code.id}
                        onClick={() => void handleRegenerateCode(code)}
                        className="glass-button-secondary disabled:opacity-50"
                      >
                        <RotateCcw className="w-4 h-4" />
                        {regeneratingCodeId === code.id ? 'Regenerando...' : 'Regenerar'}
                      </button>
                    </div>
                  </div>

                  <div className="glass-input text-sm break-all">{code.referral_link}</div>
                  <div className="glass-input text-xs break-all text-white/45">
                    POST {code.capture_endpoint}
                  </div>
                </div>
              ))
            )}
          </div>
        </section>

        <section className="glass-panel p-6 space-y-4">
          <h3 className="font-bold text-lg">Top clientes referidores</h3>
          {overview?.top_clients.length ? (
            overview.top_clients.map((client) => (
              <div key={client.client_id} className="glass-input">
                <p className="font-bold">{client.client_name}</p>
                <p className="text-sm text-white/45 mt-1">
                  {client.converted_referrals} convertidos · {client.total_referrals} referidos
                </p>
                <p className="text-xs text-white/35 mt-2">
                  Pendiente €{client.pending_commissions.toLocaleString()} · Pagado €
                  {client.paid_commissions.toLocaleString()}
                </p>
              </div>
            ))
          ) : (
            <div className="glass-input text-sm text-white/40">
              Aún no hay clientes con histórico suficiente de referidos.
            </div>
          )}
        </section>
      </div>

      <section className="glass-panel overflow-hidden">
        <div className="p-6 border-b border-white/10">
          <h3 className="font-bold text-lg">Pipeline de referidos y payouts</h3>
        </div>

        <div className="divide-y divide-white/5">
          {loading ? (
            <div className="p-6 text-white/40">Cargando referidos...</div>
          ) : filteredReferrals.length === 0 ? (
            <div className="p-6 text-white/40">No hay referidos para los filtros actuales.</div>
          ) : (
            filteredReferrals.map((referral) => {
              const draft = referralEdits[referral.id] || {
                status: referral.status,
                payout_status: referral.payout_status,
                commission_amount: String(referral.commission_amount ?? 0),
              };

              return (
                <div key={referral.id} className="p-6 grid grid-cols-1 xl:grid-cols-[1.6fr_1fr_1.2fr_auto] gap-4">
                  <div>
                    <div className="flex flex-wrap items-center gap-2">
                      <p className="font-bold">{referral.referred_name}</p>
                      <span
                        className={cn(
                          'px-2.5 py-1 rounded-full text-[10px] font-bold uppercase tracking-wider border',
                          getReferralStatusClasses(draft.status),
                        )}
                      >
                        {draft.status}
                      </span>
                      <span
                        className={cn(
                          'px-2.5 py-1 rounded-full text-[10px] font-bold uppercase tracking-wider border',
                          getPayoutStatusClasses(draft.payout_status),
                        )}
                      >
                        {draft.payout_status}
                      </span>
                    </div>
                    <p className="text-sm text-white/45 mt-1">
                      {referral.referrer_client_name} · Código {referral.code}
                    </p>
                    <p className="text-xs text-white/35 mt-2">
                      {referral.referred_company || 'Sin empresa'} · {referral.referred_email || 'Sin email'}
                    </p>
                    <p className="text-xs text-white/30 mt-2">
                      Captado el {new Date(referral.created_at).toLocaleDateString('es-ES')}
                      {referral.invoice_number ? ` · Factura ${referral.invoice_number}` : ''}
                    </p>
                  </div>

                  <div className="space-y-3">
                    <select
                      value={draft.status}
                      onChange={(event) =>
                        setReferralEdits((current) => ({
                          ...current,
                          [referral.id]: {
                            ...draft,
                            status: event.target.value as Referral['status'],
                          },
                        }))
                      }
                      className="w-full glass-input"
                    >
                      <option value="invited">Invitado</option>
                      <option value="lead">Lead</option>
                      <option value="qualified">Calificado</option>
                      <option value="converted">Convertido</option>
                      <option value="rejected">Rechazado</option>
                    </select>

                    <select
                      value={draft.payout_status}
                      onChange={(event) =>
                        setReferralEdits((current) => ({
                          ...current,
                          [referral.id]: {
                            ...draft,
                            payout_status: event.target.value as Referral['payout_status'],
                          },
                        }))
                      }
                      className="w-full glass-input"
                    >
                      <option value="pending">Pendiente</option>
                      <option value="approved">Aprobado</option>
                      <option value="paid">Pagado</option>
                      <option value="cancelled">Cancelado</option>
                    </select>
                  </div>

                  <div className="space-y-2">
                    <label className="block text-[10px] text-white/30 uppercase font-bold tracking-wider">
                      Comisión
                    </label>
                    <input
                      type="number"
                      min="0"
                      step="0.01"
                      value={draft.commission_amount}
                      onChange={(event) =>
                        setReferralEdits((current) => ({
                          ...current,
                          [referral.id]: {
                            ...draft,
                            commission_amount: event.target.value,
                          },
                        }))
                      }
                      className="w-full glass-input"
                    />
                    <p className="text-xs text-white/35">
                      Cliente convertido: {referral.converted_client_name || 'Pendiente'}
                    </p>
                  </div>

                  <div className="flex items-center justify-end">
                    <button
                      type="button"
                      disabled={savingReferralId === referral.id}
                      onClick={() => void handleSaveReferral(referral)}
                      className="glass-button-primary disabled:opacity-50"
                    >
                      {savingReferralId === referral.id ? 'Guardando...' : 'Guardar'}
                    </button>
                  </div>
                </div>
              );
            })
          )}
        </div>
      </section>

      <PartnerReferralsPanel />
    </div>
  );
};
