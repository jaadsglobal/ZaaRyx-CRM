import React, { useEffect, useState } from 'react';
import {
  CheckCircle2,
  Copy,
  Download,
  Gift,
  Link2,
  RefreshCw,
  Wallet,
} from 'lucide-react';
import {
  FreelancerReferralPortal,
  PartnerReferral,
  PartnerReferralCode,
  cn,
} from '../types';
import { triggerClientDownload } from '../lib/download';

const getResponseJson = async <T,>(response: Response): Promise<T> => {
  if (!response.ok) {
    const errorData = (await response.json().catch(() => null)) as { error?: string } | null;
    throw new Error(errorData?.error || `Request failed with status ${response.status}`);
  }

  return response.json() as Promise<T>;
};

const formatDate = (value?: string | null) => {
  if (!value) {
    return 'Pendiente';
  }

  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? value : date.toLocaleDateString('es-ES');
};

const formatCurrency = (amount: number, currency: PartnerReferral['currency']) =>
  new Intl.NumberFormat('es-ES', {
    style: 'currency',
    currency,
    maximumFractionDigits: 2,
  }).format(Number(amount || 0));

const getReferralStatusLabel = (status: PartnerReferral['status']) => {
  switch (status) {
    case 'invited':
      return 'Invitado';
    case 'lead':
      return 'Lead';
    case 'qualified':
      return 'Cualificado';
    case 'converted':
      return 'Convertido';
    case 'rejected':
      return 'Descartado';
    default:
      return status;
  }
};

const getPayoutStatusLabel = (status: PartnerReferral['payout_status']) => {
  switch (status) {
    case 'pending':
      return 'Pendiente';
    case 'approved':
      return 'Aprobado';
    case 'paid':
      return 'Pagado';
    case 'cancelled':
      return 'Cancelado';
    default:
      return status;
  }
};

const getCodeStatusLabel = (status: PartnerReferralCode['status']) => {
  switch (status) {
    case 'active':
      return 'Activo';
    case 'paused':
      return 'Pausado';
    case 'archived':
      return 'Archivado';
    default:
      return status;
  }
};

const buildReferralsCsv = (referrals: PartnerReferral[]) => {
  const rows = [
    [
      'nombre',
      'empresa',
      'email',
      'telefono',
      'codigo',
      'estado',
      'payout',
      'comision',
      'cliente_convertido',
      'factura',
      'fecha_alta',
      'fecha_pago',
    ],
    ...referrals.map((referral) => [
      referral.referred_name,
      referral.referred_company || '',
      referral.referred_email || '',
      referral.referred_phone || '',
      referral.code,
      getReferralStatusLabel(referral.status),
      getPayoutStatusLabel(referral.payout_status),
      String(referral.commission_amount || 0),
      referral.converted_client_name || '',
      referral.invoice_number || '',
      referral.created_at,
      referral.paid_at || '',
    ]),
  ];

  return rows
    .map((row) => row.map((cell) => `"${String(cell).replace(/"/g, '""')}"`).join(','))
    .join('\n');
};

export const FreelancerReferralsPortal: React.FC = () => {
  const [portal, setPortal] = useState<FreelancerReferralPortal | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [feedbackMessage, setFeedbackMessage] = useState<string | null>(null);
  const [feedbackTone, setFeedbackTone] = useState<'success' | 'error'>('success');

  const setMessage = (message: string, tone: 'success' | 'error' = 'success') => {
    setFeedbackTone(tone);
    setFeedbackMessage(message);
  };

  const loadPortal = async (background = false) => {
    if (background) {
      setRefreshing(true);
    } else {
      setLoading(true);
    }

    try {
      const response = await fetch('/api/freelancer-portal/referrals');
      const data = await getResponseJson<FreelancerReferralPortal>(response);
      setPortal(data);
    } catch (error) {
      console.error('Error loading freelancer referrals portal:', error);
      setPortal(null);
      setMessage(
        error instanceof Error ? error.message : 'No se pudo cargar el programa de referidos.',
        'error',
      );
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  useEffect(() => {
    void loadPortal();
  }, []);

  const handleCopy = async (value: string, message: string) => {
    try {
      await navigator.clipboard.writeText(value);
      setMessage(message);
    } catch (error) {
      console.error('Error copying freelancer referral value:', error);
      setMessage('No se pudo copiar al portapapeles.', 'error');
    }
  };

  const handleDownloadJson = () => {
    if (!portal) {
      return;
    }

    const blob = new Blob([JSON.stringify(portal, null, 2)], {
      type: 'application/json',
    });
    const url = URL.createObjectURL(blob);
    triggerClientDownload(url, 'freelancer-referrals.json', () => URL.revokeObjectURL(url));
    setMessage('Base de referidos descargada en JSON.');
  };

  const handleDownloadCsv = () => {
    if (!portal) {
      return;
    }

    const blob = new Blob([buildReferralsCsv(portal.referrals)], {
      type: 'text/csv;charset=utf-8',
    });
    const url = URL.createObjectURL(blob);
    triggerClientDownload(url, 'freelancer-referrals.csv', () => URL.revokeObjectURL(url));
    setMessage('Base de referidos descargada en CSV.');
  };

  const codes = portal?.codes || [];
  const referrals = portal?.referrals || [];
  const referralCurrency = referrals[0]?.currency || 'EUR';
  const totalGenerated =
    (portal?.summary.pending_commissions || 0) +
    (portal?.summary.approved_commissions || 0) +
    (portal?.summary.paid_commissions || 0);

  return (
    <div className="space-y-8">
      <header className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h2 className="text-3xl font-bold">Referidos</h2>
          <p className="text-white/50">
            Controla tus códigos activos, la base atribuida y las comisiones generadas.
          </p>
        </div>

        <div className="flex flex-wrap gap-3">
          <button
            type="button"
            onClick={handleDownloadJson}
            className="glass-button-secondary"
            disabled={!portal}
          >
            <Download className="w-4 h-4" />
            JSON
          </button>
          <button
            type="button"
            onClick={handleDownloadCsv}
            className="glass-button-secondary"
            disabled={!portal}
          >
            <Download className="w-4 h-4" />
            CSV
          </button>
          <button
            type="button"
            onClick={() => void loadPortal(true)}
            className="glass-button-secondary"
            disabled={refreshing}
          >
            <RefreshCw className={cn('w-4 h-4', refreshing && 'animate-spin')} />
            Refrescar
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

      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-6 gap-6">
        {[
          { label: 'Códigos activos', value: portal?.summary.active_codes || 0, icon: Gift },
          { label: 'Referidos', value: portal?.summary.total_referrals || 0, icon: Link2 },
          {
            label: 'Convertidos',
            value: portal?.summary.converted_referrals || 0,
            icon: CheckCircle2,
          },
          {
            label: 'Pendiente',
            value: formatCurrency(portal?.summary.pending_commissions || 0, referralCurrency),
            icon: Wallet,
          },
          {
            label: 'Pagado',
            value: formatCurrency(portal?.summary.paid_commissions || 0, referralCurrency),
            icon: Wallet,
          },
          {
            label: 'Total generado',
            value: formatCurrency(totalGenerated, referralCurrency),
            icon: Wallet,
          },
        ].map((item) => (
          <div key={item.label} className="glass-panel p-6">
            <div className="flex items-center justify-between gap-3">
              <p className="text-xs uppercase tracking-wider text-white/40 font-bold">
                {item.label}
              </p>
              <item.icon className="w-5 h-5 text-brand-cyan" />
            </div>
            <p className="text-3xl font-bold mt-4">{loading ? '...' : item.value}</p>
          </div>
        ))}
      </div>

      <section className="glass-panel p-6 space-y-5">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div>
            <h3 className="font-bold text-lg">Perfil del programa</h3>
            <p className="text-sm text-white/45 mt-1">
              Configuración de payout y datos base de tu programa de referidos freelance.
            </p>
          </div>
          <span className="text-sm text-white/40">
            {portal?.partner?.display_name || portal?.freelancer.name || 'Freelance'}
          </span>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div className="rounded-2xl border border-white/10 bg-white/5 p-5">
            <p className="text-xs uppercase tracking-wider text-white/40 font-bold">
              Método
            </p>
            <p className="text-xl font-semibold mt-3">
              {portal?.partner?.payment_method || portal?.freelancer.payment_method || 'Pendiente'}
            </p>
          </div>

          <div className="rounded-2xl border border-white/10 bg-white/5 p-5">
            <p className="text-xs uppercase tracking-wider text-white/40 font-bold">
              Referencia
            </p>
            <p className="text-sm font-medium mt-3 break-all">
              {portal?.partner?.payout_reference ||
                portal?.freelancer.payout_reference ||
                'Sin referencia configurada'}
            </p>
          </div>

          <div className="rounded-2xl border border-white/10 bg-white/5 p-5">
            <p className="text-xs uppercase tracking-wider text-white/40 font-bold">
              Integración
            </p>
            <p className="text-xl font-semibold mt-3">
              {portal?.partner?.payout_integration_name ||
                portal?.freelancer.payout_integration_name ||
                'Manual'}
            </p>
          </div>
        </div>
      </section>

      <section className="glass-panel p-6 space-y-5">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div>
            <h3 className="font-bold text-lg">Tus códigos y enlaces</h3>
            <p className="text-sm text-white/45 mt-1">
              Comparte estos enlaces para atribuir cada oportunidad a tu cuenta freelance.
            </p>
          </div>
          <span className="text-sm text-white/40">{codes.length} disponibles</span>
        </div>

        {loading ? (
          <div className="grid grid-cols-1 xl:grid-cols-2 gap-4">
            {Array.from({ length: 2 }).map((_, index) => (
              <div
                key={`freelancer-referral-code-skeleton-${index}`}
                className="h-56 rounded-2xl bg-white/5 animate-pulse"
              />
            ))}
          </div>
        ) : codes.length === 0 ? (
          <div className="rounded-2xl border border-white/10 bg-white/5 p-6 text-white/45">
            La agencia todavía no ha activado códigos para tu perfil.
          </div>
        ) : (
          <div className="grid grid-cols-1 xl:grid-cols-2 gap-4">
            {codes.map((code) => (
              <div key={code.id} className="rounded-2xl border border-white/10 bg-white/5 p-5 space-y-4">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <p className="font-semibold">{code.code}</p>
                    <p className="text-sm text-white/45 mt-1">
                      {code.commission_type === 'percent'
                        ? `${code.commission_value}% por cierre`
                        : `${code.commission_value} ${referralCurrency} por cierre`}
                    </p>
                  </div>
                  <span className="text-xs uppercase tracking-wider text-brand-cyan font-bold">
                    {getCodeStatusLabel(code.status)}
                  </span>
                </div>

                <div className="space-y-2 text-sm text-white/55">
                  <p>{code.reward_description || 'Sin descripción adicional'}</p>
                  <p className="break-all">{code.referral_link}</p>
                </div>

                <div className="flex flex-wrap gap-3">
                  <button
                    type="button"
                    onClick={() => void handleCopy(code.code, `Código ${code.code} copiado.`)}
                    className="glass-button-secondary"
                  >
                    <Copy className="w-4 h-4" />
                    Código
                  </button>
                  <button
                    type="button"
                    onClick={() => void handleCopy(code.referral_link, 'Enlace copiado al portapapeles.')}
                    className="glass-button-secondary"
                  >
                    <Link2 className="w-4 h-4" />
                    Enlace
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </section>

      <section className="glass-panel overflow-hidden">
        <div className="p-6 border-b border-white/10 flex flex-wrap items-center justify-between gap-3">
          <div>
            <h3 className="font-bold text-lg">Base de referidos</h3>
            <p className="text-sm text-white/45 mt-1">
              Seguimiento completo de leads, conversiones y estado de payout.
            </p>
          </div>
          <span className="text-sm text-white/40">{referrals.length} registros</span>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left min-w-[980px]">
            <thead>
              <tr className="bg-white/5">
                <th className="px-6 py-4 text-xs font-bold uppercase tracking-wider text-white/40">
                  Contacto
                </th>
                <th className="px-6 py-4 text-xs font-bold uppercase tracking-wider text-white/40">
                  Empresa
                </th>
                <th className="px-6 py-4 text-xs font-bold uppercase tracking-wider text-white/40">
                  Código
                </th>
                <th className="px-6 py-4 text-xs font-bold uppercase tracking-wider text-white/40">
                  Estado
                </th>
                <th className="px-6 py-4 text-xs font-bold uppercase tracking-wider text-white/40">
                  Payout
                </th>
                <th className="px-6 py-4 text-xs font-bold uppercase tracking-wider text-white/40">
                  Comisión
                </th>
                <th className="px-6 py-4 text-xs font-bold uppercase tracking-wider text-white/40">
                  Convertido
                </th>
                <th className="px-6 py-4 text-xs font-bold uppercase tracking-wider text-white/40">
                  Fechas
                </th>
              </tr>
            </thead>

            <tbody className="divide-y divide-white/5">
              {loading ? (
                Array.from({ length: 3 }).map((_, index) => (
                  <tr key={`freelancer-referral-row-${index}`} className="animate-pulse">
                    <td colSpan={8} className="px-6 py-8 bg-white/5" />
                  </tr>
                ))
              ) : referrals.length === 0 ? (
                <tr>
                  <td colSpan={8} className="px-6 py-8 text-center text-white/40">
                    Todavía no hay referidos asociados a tu cuenta.
                  </td>
                </tr>
              ) : (
                referrals.map((referral) => (
                  <tr key={referral.id} className="hover:bg-white/5 transition-colors">
                    <td className="px-6 py-4">
                      <p className="font-semibold">{referral.referred_name}</p>
                      <p className="text-xs text-white/40 mt-1">
                        {referral.referred_email || 'Sin email'}
                      </p>
                    </td>
                    <td className="px-6 py-4 text-sm text-white/55">
                      {referral.referred_company || 'Sin empresa'}
                    </td>
                    <td className="px-6 py-4 font-mono text-sm text-brand-cyan">
                      {referral.code}
                    </td>
                    <td className="px-6 py-4 text-sm text-white/60">
                      {getReferralStatusLabel(referral.status)}
                    </td>
                    <td className="px-6 py-4 text-sm text-white/60">
                      {getPayoutStatusLabel(referral.payout_status)}
                    </td>
                    <td className="px-6 py-4 text-sm font-bold">
                      {formatCurrency(referral.commission_amount, referral.currency)}
                    </td>
                    <td className="px-6 py-4 text-sm text-white/55">
                      {referral.converted_client_name || 'Pendiente'}
                    </td>
                    <td className="px-6 py-4 text-xs text-white/45">
                      Alta {formatDate(referral.created_at)}
                      <br />
                      Pago {formatDate(referral.paid_at || referral.payout_due_date)}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
};
