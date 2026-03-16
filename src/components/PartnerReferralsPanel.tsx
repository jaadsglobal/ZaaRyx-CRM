import React, { useEffect, useMemo, useState } from 'react';
import {
  Briefcase,
  Copy,
  DollarSign,
  Gift,
  Link2,
  Plus,
  RefreshCw,
  Save,
  Users,
} from 'lucide-react';
import {
  cn,
  Freelancer,
  Integration,
  PartnerReferral,
  PartnerReferralCode,
  PartnerReferralOverview,
  ReferralPartnerProfile,
  TeamMember,
} from '../types';

const getResponseJson = async <T,>(response: Response): Promise<T> => {
  if (!response.ok) {
    const errorData = (await response.json().catch(() => null)) as { error?: string } | null;
    throw new Error(errorData?.error || `Request failed with status ${response.status}`);
  }

  return response.json() as Promise<T>;
};

const createPartnerForm = () => ({
  owner_type: 'team' as ReferralPartnerProfile['owner_type'],
  user_id: '',
  freelancer_id: '',
  payment_method: 'Transferencia',
  payout_reference: '',
  payout_integration_key: 'wise' as Integration['key'],
  notes: '',
  status: 'active' as ReferralPartnerProfile['status'],
});

const createCodeForm = () => ({
  partner_id: '',
  landing_url: '',
  commission_type: 'percent' as PartnerReferralCode['commission_type'],
  commission_value: '10',
  reward_description: '',
  notes: '',
});

const createReferralForm = () => ({
  referral_code_id: '',
  referred_name: '',
  referred_company: '',
  referred_email: '',
  referred_phone: '',
  source: 'manual',
  notes: '',
  auto_create_lead: true,
});

const paymentOptions: Array<{ key: Integration['key']; label: string }> = [
  { key: 'stripe', label: 'Stripe' },
  { key: 'paypal', label: 'PayPal' },
  { key: 'wise', label: 'Wise' },
];

type PartnerReferralEditState = Record<
  number,
  {
    status: PartnerReferral['status'];
    payout_status: PartnerReferral['payout_status'];
    commission_amount: string;
  }
>;

export const PartnerReferralsPanel: React.FC = () => {
  const [teamMembers, setTeamMembers] = useState<TeamMember[]>([]);
  const [freelancers, setFreelancers] = useState<Freelancer[]>([]);
  const [overview, setOverview] = useState<PartnerReferralOverview | null>(null);
  const [partners, setPartners] = useState<ReferralPartnerProfile[]>([]);
  const [codes, setCodes] = useState<PartnerReferralCode[]>([]);
  const [referrals, setReferrals] = useState<PartnerReferral[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [feedbackMessage, setFeedbackMessage] = useState<string | null>(null);
  const [feedbackTone, setFeedbackTone] = useState<'success' | 'error'>('success');
  const [showPartnerForm, setShowPartnerForm] = useState(false);
  const [showCodeForm, setShowCodeForm] = useState(false);
  const [showReferralForm, setShowReferralForm] = useState(false);
  const [creatingPartner, setCreatingPartner] = useState(false);
  const [creatingCode, setCreatingCode] = useState(false);
  const [creatingReferral, setCreatingReferral] = useState(false);
  const [savingReferralId, setSavingReferralId] = useState<number | null>(null);
  const [partnerForm, setPartnerForm] = useState(createPartnerForm());
  const [codeForm, setCodeForm] = useState(createCodeForm());
  const [referralForm, setReferralForm] = useState(createReferralForm());
  const [referralEdits, setReferralEdits] = useState<PartnerReferralEditState>({});

  const setMessage = (message: string, tone: 'success' | 'error' = 'success') => {
    setFeedbackTone(tone);
    setFeedbackMessage(message);
  };

  const loadData = async (background = false) => {
    if (background) {
      setRefreshing(true);
    } else {
      setLoading(true);
    }

    try {
      const [
        teamResponse,
        freelancersResponse,
        overviewResponse,
        partnersResponse,
        codesResponse,
        referralsResponse,
      ] = await Promise.all([
        fetch('/api/team/options'),
        fetch('/api/freelancers'),
        fetch('/api/partner-referral-overview'),
        fetch('/api/referral-partners'),
        fetch('/api/partner-referral-codes'),
        fetch('/api/partner-referrals'),
      ]);

      const [teamData, freelancersData, overviewData, partnersData, codesData, referralsData] =
        await Promise.all([
          getResponseJson<TeamMember[]>(teamResponse),
          getResponseJson<Freelancer[]>(freelancersResponse),
          getResponseJson<PartnerReferralOverview>(overviewResponse),
          getResponseJson<ReferralPartnerProfile[]>(partnersResponse),
          getResponseJson<PartnerReferralCode[]>(codesResponse),
          getResponseJson<PartnerReferral[]>(referralsResponse),
        ]);

      setTeamMembers(teamData);
      setFreelancers(freelancersData);
      setOverview(overviewData);
      setPartners(partnersData);
      setCodes(codesData);
      setReferrals(referralsData);
      setReferralEdits(
        referralsData.reduce<PartnerReferralEditState>((accumulator, referral) => {
          accumulator[referral.id] = {
            status: referral.status,
            payout_status: referral.payout_status,
            commission_amount: String(referral.commission_amount ?? 0),
          };
          return accumulator;
        }, {}),
      );
      setCodeForm((current) =>
        current.partner_id || partnersData.length === 0 ? current : { ...current, partner_id: String(partnersData[0].id) },
      );
      setReferralForm((current) =>
        current.referral_code_id || codesData.length === 0
          ? current
          : { ...current, referral_code_id: String(codesData[0].id) },
      );
    } catch (error) {
      console.error('Error loading partner referrals:', error);
      setMessage('No se pudo cargar el bloque de referidos de equipo y freelance.', 'error');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  useEffect(() => {
    void loadData();
  }, []);

  const teamCandidates = useMemo(
    () => teamMembers.filter((member) => member.access_status === 'active'),
    [teamMembers],
  );

  const availableOwnerOptions = partnerForm.owner_type === 'team' ? teamCandidates : freelancers;

  const handleCopy = async (value: string, message: string) => {
    try {
      await navigator.clipboard.writeText(value);
      setMessage(message);
    } catch (error) {
      console.error('Error copying partner referral value:', error);
      setMessage('No se pudo copiar al portapapeles.', 'error');
    }
  };

  const handleCreatePartner = async () => {
    setCreatingPartner(true);

    try {
      await getResponseJson<ReferralPartnerProfile>(
        await fetch('/api/referral-partners', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            ...partnerForm,
            user_id: partnerForm.owner_type === 'team' && partnerForm.user_id ? Number(partnerForm.user_id) : null,
            freelancer_id:
              partnerForm.owner_type === 'freelance' && partnerForm.freelancer_id
                ? Number(partnerForm.freelancer_id)
                : null,
          }),
        }),
      );
      setPartnerForm(createPartnerForm());
      setShowPartnerForm(false);
      setMessage('Partner de referidos creado correctamente.');
      await loadData(true);
    } catch (error) {
      console.error('Error creating referral partner:', error);
      setMessage(error instanceof Error ? error.message : 'No se pudo crear el partner.', 'error');
    } finally {
      setCreatingPartner(false);
    }
  };

  const handleCreateCode = async () => {
    setCreatingCode(true);

    try {
      await getResponseJson<PartnerReferralCode>(
        await fetch('/api/partner-referral-codes', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            ...codeForm,
            partner_id: Number(codeForm.partner_id),
            commission_value: Number(codeForm.commission_value),
          }),
        }),
      );
      setCodeForm(createCodeForm());
      setShowCodeForm(false);
      setMessage('Código de referido creado para partner.');
      await loadData(true);
    } catch (error) {
      console.error('Error creating partner referral code:', error);
      setMessage(error instanceof Error ? error.message : 'No se pudo crear el código.', 'error');
    } finally {
      setCreatingCode(false);
    }
  };

  const handleCreateReferral = async () => {
    setCreatingReferral(true);

    try {
      await getResponseJson<PartnerReferral>(
        await fetch('/api/partner-referrals', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            ...referralForm,
            referral_code_id: Number(referralForm.referral_code_id),
          }),
        }),
      );
      setReferralForm(createReferralForm());
      setShowReferralForm(false);
      setMessage('Referido registrado para partner correctamente.');
      await loadData(true);
    } catch (error) {
      console.error('Error creating partner referral:', error);
      setMessage(error instanceof Error ? error.message : 'No se pudo crear el referido.', 'error');
    } finally {
      setCreatingReferral(false);
    }
  };

  const handleSaveReferral = async (referral: PartnerReferral) => {
    const draft = referralEdits[referral.id];

    if (!draft) {
      return;
    }

    setSavingReferralId(referral.id);

    try {
      await getResponseJson<PartnerReferral>(
        await fetch(`/api/partner-referrals/${referral.id}/status`, {
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
      setMessage(`Referido ${referral.referred_name} actualizado.`);
      await loadData(true);
    } catch (error) {
      console.error('Error updating partner referral:', error);
      setMessage(error instanceof Error ? error.message : 'No se pudo actualizar el referido.', 'error');
    } finally {
      setSavingReferralId(null);
    }
  };

  return (
    <section className="glass-panel p-6 space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h3 className="text-xl font-bold">Referidos de equipo y freelance</h3>
          <p className="text-sm text-white/45">
            Gestiona partners internos y externos con códigos, payouts y trazabilidad propia.
          </p>
        </div>
        <button
          type="button"
          onClick={() => void loadData(true)}
          disabled={refreshing}
          className="glass-button-secondary"
        >
          <RefreshCw className={cn('w-4 h-4', refreshing && 'animate-spin')} />
          Refrescar
        </button>
      </div>

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

      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-4">
        {[
          {
            label: 'Partners activos',
            value: overview?.summary.active_partners || 0,
            icon: Users,
          },
          {
            label: 'Códigos activos',
            value: overview?.summary.active_codes || 0,
            icon: Gift,
          },
          {
            label: 'Referidos convertidos',
            value: overview?.summary.converted_referrals || 0,
            icon: Briefcase,
          },
          {
            label: 'Payout pendiente',
            value: `€${(
              (overview?.summary.pending_commissions || 0) + (overview?.summary.approved_commissions || 0)
            ).toLocaleString()}`,
            icon: DollarSign,
          },
        ].map((item) => (
          <div key={item.label} className="p-5 rounded-2xl border border-white/10 bg-white/5">
            <div className="flex items-center justify-between">
              <p className="text-xs font-bold uppercase tracking-wider text-white/40">{item.label}</p>
              <item.icon className="w-5 h-5 text-brand-cyan" />
            </div>
            <p className="text-3xl font-bold mt-4">{item.value}</p>
          </div>
        ))}
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-3 gap-6">
        <div className="space-y-4">
          <div className="flex items-center justify-between gap-3">
            <h4 className="font-bold">Partners</h4>
            <button type="button" onClick={() => setShowPartnerForm((current) => !current)} className="glass-button-secondary">
              <Plus className="w-4 h-4" />
              Partner
            </button>
          </div>

          {showPartnerForm ? (
            <div className="p-4 rounded-2xl border border-white/10 bg-white/5 space-y-3">
              <select
                value={partnerForm.owner_type}
                onChange={(event) =>
                  setPartnerForm((current) => ({
                    ...current,
                    owner_type: event.target.value as ReferralPartnerProfile['owner_type'],
                    user_id: '',
                    freelancer_id: '',
                  }))
                }
                className="w-full glass-input"
              >
                <option value="team">Equipo</option>
                <option value="freelance">Freelance</option>
              </select>

              <select
                value={partnerForm.owner_type === 'team' ? partnerForm.user_id : partnerForm.freelancer_id}
                onChange={(event) =>
                  setPartnerForm((current) => ({
                    ...current,
                    user_id: current.owner_type === 'team' ? event.target.value : '',
                    freelancer_id: current.owner_type === 'freelance' ? event.target.value : '',
                  }))
                }
                className="w-full glass-input"
              >
                <option value="">Selecciona partner</option>
                {availableOwnerOptions.map((option) => (
                  <option key={option.id} value={option.id}>
                    {'name' in option ? option.name : option.name}
                  </option>
                ))}
              </select>

              <input
                value={partnerForm.payment_method}
                onChange={(event) =>
                  setPartnerForm((current) => ({ ...current, payment_method: event.target.value }))
                }
                className="w-full glass-input"
                placeholder="Método de pago"
              />

              <input
                value={partnerForm.payout_reference}
                onChange={(event) =>
                  setPartnerForm((current) => ({ ...current, payout_reference: event.target.value }))
                }
                className="w-full glass-input"
                placeholder="Referencia payout"
              />

              <select
                value={partnerForm.payout_integration_key}
                onChange={(event) =>
                  setPartnerForm((current) => ({
                    ...current,
                    payout_integration_key: event.target.value as Integration['key'],
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

              <textarea
                value={partnerForm.notes}
                onChange={(event) =>
                  setPartnerForm((current) => ({ ...current, notes: event.target.value }))
                }
                className="w-full glass-input min-h-[88px]"
                placeholder="Notas del partner"
              />

              <div className="flex justify-end gap-3">
                <button type="button" onClick={() => setShowPartnerForm(false)} className="glass-button-secondary">
                  Cancelar
                </button>
                <button
                  type="button"
                  disabled={creatingPartner}
                  onClick={() => void handleCreatePartner()}
                  className="glass-button-primary disabled:opacity-50"
                >
                  {creatingPartner ? 'Guardando...' : 'Guardar'}
                </button>
              </div>
            </div>
          ) : null}

          <div className="space-y-3 max-h-[520px] overflow-y-auto">
            {loading
              ? Array.from({ length: 3 }).map((_, index) => (
                <div key={`partner-skeleton-${index}`} className="h-24 rounded-2xl bg-white/5 animate-pulse" />
              ))
              : partners.map((partner) => (
                <div key={partner.id} className="p-4 rounded-2xl border border-white/10 bg-white/5">
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <p className="font-semibold">{partner.display_name}</p>
                      <p className="text-sm text-white/45">
                        {partner.role_label || partner.owner_type} · {partner.email || 'sin email'}
                      </p>
                    </div>
                    <span
                      className={cn(
                        'text-[10px] px-2 py-1 rounded-full font-bold uppercase tracking-wider border',
                        partner.status === 'active'
                          ? 'bg-emerald-500/10 text-emerald-300 border-emerald-500/20'
                          : 'bg-white/10 text-white/50 border-white/10',
                      )}
                    >
                      {partner.status}
                    </span>
                  </div>
                  <div className="grid grid-cols-3 gap-3 mt-3 text-sm">
                    <div>
                      <p className="text-white/35">Códigos</p>
                      <p className="font-bold">{partner.active_codes}</p>
                    </div>
                    <div>
                      <p className="text-white/35">Referidos</p>
                      <p className="font-bold">{partner.total_referrals}</p>
                    </div>
                    <div>
                      <p className="text-white/35">Pendiente</p>
                      <p className="font-bold">€{partner.pending_commissions.toLocaleString()}</p>
                    </div>
                  </div>
                </div>
              ))}
          </div>
        </div>

        <div className="space-y-4">
          <div className="flex items-center justify-between gap-3">
            <h4 className="font-bold">Códigos</h4>
            <button type="button" onClick={() => setShowCodeForm((current) => !current)} className="glass-button-secondary">
              <Plus className="w-4 h-4" />
              Código
            </button>
          </div>

          {showCodeForm ? (
            <div className="p-4 rounded-2xl border border-white/10 bg-white/5 space-y-3">
              <select
                value={codeForm.partner_id}
                onChange={(event) =>
                  setCodeForm((current) => ({ ...current, partner_id: event.target.value }))
                }
                className="w-full glass-input"
              >
                <option value="">Selecciona partner</option>
                {partners.map((partner) => (
                  <option key={partner.id} value={partner.id}>
                    {partner.display_name}
                  </option>
                ))}
              </select>

              <input
                value={codeForm.commission_value}
                onChange={(event) =>
                  setCodeForm((current) => ({ ...current, commission_value: event.target.value }))
                }
                type="number"
                min="0"
                step="0.01"
                className="w-full glass-input"
                placeholder="Comisión"
              />

              <input
                value={codeForm.landing_url}
                onChange={(event) =>
                  setCodeForm((current) => ({ ...current, landing_url: event.target.value }))
                }
                className="w-full glass-input"
                placeholder="Landing URL opcional"
              />

              <input
                value={codeForm.reward_description}
                onChange={(event) =>
                  setCodeForm((current) => ({ ...current, reward_description: event.target.value }))
                }
                className="w-full glass-input"
                placeholder="Descripción de incentivo"
              />

              <div className="flex justify-end gap-3">
                <button type="button" onClick={() => setShowCodeForm(false)} className="glass-button-secondary">
                  Cancelar
                </button>
                <button
                  type="button"
                  disabled={creatingCode}
                  onClick={() => void handleCreateCode()}
                  className="glass-button-primary disabled:opacity-50"
                >
                  {creatingCode ? 'Guardando...' : 'Guardar'}
                </button>
              </div>
            </div>
          ) : null}

          <div className="space-y-3 max-h-[520px] overflow-y-auto">
            {loading
              ? Array.from({ length: 3 }).map((_, index) => (
                <div key={`code-skeleton-${index}`} className="h-24 rounded-2xl bg-white/5 animate-pulse" />
              ))
              : codes.map((code) => (
                <div key={code.id} className="p-4 rounded-2xl border border-white/10 bg-white/5 space-y-3">
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <p className="font-semibold">{code.partner_name}</p>
                      <p className="text-sm text-white/45">{code.code}</p>
                    </div>
                    <span
                      className={cn(
                        'text-[10px] px-2 py-1 rounded-full font-bold uppercase tracking-wider border',
                        code.status === 'active'
                          ? 'bg-emerald-500/10 text-emerald-300 border-emerald-500/20'
                          : 'bg-white/10 text-white/50 border-white/10',
                      )}
                    >
                      {code.status}
                    </span>
                  </div>
                  <div className="space-y-2 text-sm">
                    <div className="flex items-center justify-between gap-3">
                      <span className="text-white/40">Enlace</span>
                      <button
                        type="button"
                        onClick={() => void handleCopy(code.referral_link, `Enlace ${code.code} copiado.`)}
                        className="glass-button-secondary"
                      >
                        <Link2 className="w-4 h-4" />
                        Copiar
                      </button>
                    </div>
                    <div className="glass-input text-xs break-all">{code.referral_link}</div>
                    <div className="flex items-center justify-between gap-3">
                      <span className="text-white/40">Capture endpoint</span>
                      <button
                        type="button"
                        onClick={() =>
                          void handleCopy(code.capture_endpoint, `Endpoint ${code.code} copiado.`)
                        }
                        className="glass-button-secondary"
                      >
                        <Copy className="w-4 h-4" />
                        Copiar
                      </button>
                    </div>
                    <div className="glass-input text-xs break-all">{code.capture_endpoint}</div>
                  </div>
                </div>
              ))}
          </div>
        </div>

        <div className="space-y-4">
          <div className="flex items-center justify-between gap-3">
            <h4 className="font-bold">Referidos</h4>
            <button type="button" onClick={() => setShowReferralForm((current) => !current)} className="glass-button-secondary">
              <Plus className="w-4 h-4" />
              Referido
            </button>
          </div>

          {showReferralForm ? (
            <div className="p-4 rounded-2xl border border-white/10 bg-white/5 space-y-3">
              <select
                value={referralForm.referral_code_id}
                onChange={(event) =>
                  setReferralForm((current) => ({ ...current, referral_code_id: event.target.value }))
                }
                className="w-full glass-input"
              >
                <option value="">Selecciona código</option>
                {codes.map((code) => (
                  <option key={code.id} value={code.id}>
                    {code.partner_name} · {code.code}
                  </option>
                ))}
              </select>

              <input
                value={referralForm.referred_name}
                onChange={(event) =>
                  setReferralForm((current) => ({ ...current, referred_name: event.target.value }))
                }
                className="w-full glass-input"
                placeholder="Nombre del referido"
              />
              <input
                value={referralForm.referred_company}
                onChange={(event) =>
                  setReferralForm((current) => ({ ...current, referred_company: event.target.value }))
                }
                className="w-full glass-input"
                placeholder="Empresa"
              />
              <input
                value={referralForm.referred_email}
                onChange={(event) =>
                  setReferralForm((current) => ({ ...current, referred_email: event.target.value }))
                }
                className="w-full glass-input"
                placeholder="Email"
              />
              <div className="flex justify-end gap-3">
                <button type="button" onClick={() => setShowReferralForm(false)} className="glass-button-secondary">
                  Cancelar
                </button>
                <button
                  type="button"
                  disabled={creatingReferral}
                  onClick={() => void handleCreateReferral()}
                  className="glass-button-primary disabled:opacity-50"
                >
                  {creatingReferral ? 'Guardando...' : 'Guardar'}
                </button>
              </div>
            </div>
          ) : null}

          <div className="space-y-3 max-h-[520px] overflow-y-auto">
            {loading
              ? Array.from({ length: 3 }).map((_, index) => (
                <div key={`referral-skeleton-${index}`} className="h-32 rounded-2xl bg-white/5 animate-pulse" />
              ))
              : referrals.map((referral) => (
                <div key={referral.id} className="p-4 rounded-2xl border border-white/10 bg-white/5 space-y-3">
                  <div>
                    <p className="font-semibold">{referral.referred_name}</p>
                    <p className="text-sm text-white/45">
                      {referral.partner_name} · {referral.code}
                    </p>
                  </div>
                  <div className="grid grid-cols-1 gap-3">
                    <select
                      value={referralEdits[referral.id]?.status || referral.status}
                      onChange={(event) =>
                        setReferralEdits((current) => ({
                          ...current,
                          [referral.id]: {
                            ...(current[referral.id] || {
                              status: referral.status,
                              payout_status: referral.payout_status,
                              commission_amount: String(referral.commission_amount),
                            }),
                            status: event.target.value as PartnerReferral['status'],
                          },
                        }))
                      }
                      className="w-full glass-input"
                    >
                      <option value="invited">invited</option>
                      <option value="lead">lead</option>
                      <option value="qualified">qualified</option>
                      <option value="converted">converted</option>
                      <option value="rejected">rejected</option>
                    </select>

                    <select
                      value={referralEdits[referral.id]?.payout_status || referral.payout_status}
                      onChange={(event) =>
                        setReferralEdits((current) => ({
                          ...current,
                          [referral.id]: {
                            ...(current[referral.id] || {
                              status: referral.status,
                              payout_status: referral.payout_status,
                              commission_amount: String(referral.commission_amount),
                            }),
                            payout_status: event.target.value as PartnerReferral['payout_status'],
                          },
                        }))
                      }
                      className="w-full glass-input"
                    >
                      <option value="pending">pending</option>
                      <option value="approved">approved</option>
                      <option value="paid">paid</option>
                      <option value="cancelled">cancelled</option>
                    </select>

                    <input
                      type="number"
                      min="0"
                      step="0.01"
                      value={referralEdits[referral.id]?.commission_amount || referral.commission_amount}
                      onChange={(event) =>
                        setReferralEdits((current) => ({
                          ...current,
                          [referral.id]: {
                            ...(current[referral.id] || {
                              status: referral.status,
                              payout_status: referral.payout_status,
                              commission_amount: String(referral.commission_amount),
                            }),
                            commission_amount: event.target.value,
                          },
                        }))
                      }
                      className="w-full glass-input"
                    />
                  </div>
                  <div className="flex items-center justify-between gap-3">
                    <p className="text-sm text-white/45">
                      {referral.payment_method || 'Pago pendiente'} ·{' '}
                      {referral.payout_integration_name || 'sin integración'}
                    </p>
                    <button
                      type="button"
                      disabled={savingReferralId === referral.id}
                      onClick={() => void handleSaveReferral(referral)}
                      className="glass-button-primary disabled:opacity-50"
                    >
                      <Save className="w-4 h-4" />
                      {savingReferralId === referral.id ? 'Guardando...' : 'Guardar'}
                    </button>
                  </div>
                </div>
              ))}
          </div>
        </div>
      </div>
    </section>
  );
};
