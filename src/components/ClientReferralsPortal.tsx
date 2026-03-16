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
import { ClientReferralPortal, Referral, ReferralCode, cn } from '../types';
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

const formatCurrency = (amount: number, currency: Referral['currency']) =>
  new Intl.NumberFormat('es-ES', {
    style: 'currency',
    currency,
    maximumFractionDigits: 2,
  }).format(Number(amount || 0));

const getReferralStatusLabel = (status: Referral['status']) => {
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

const getReferralStatusClasses = (status: Referral['status']) => {
  switch (status) {
    case 'converted':
      return 'bg-emerald-500/10 text-emerald-300 border-emerald-500/20';
    case 'qualified':
      return 'bg-brand-cyan/20 text-brand-cyan border-brand-cyan/20';
    case 'lead':
      return 'bg-blue-500/10 text-blue-300 border-blue-500/20';
    case 'rejected':
      return 'bg-red-500/10 text-red-300 border-red-500/20';
    case 'invited':
    default:
      return 'bg-white/10 text-white/55 border-white/10';
  }
};

const getPayoutStatusLabel = (status: Referral['payout_status']) => {
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

const getPayoutStatusClasses = (status: Referral['payout_status']) => {
  switch (status) {
    case 'paid':
      return 'bg-emerald-500/10 text-emerald-300 border-emerald-500/20';
    case 'approved':
      return 'bg-brand-cyan/20 text-brand-cyan border-brand-cyan/20';
    case 'pending':
      return 'bg-yellow-500/10 text-yellow-300 border-yellow-500/20';
    case 'cancelled':
    default:
      return 'bg-white/10 text-white/55 border-white/10';
  }
};

const getCodeStatusLabel = (status: ReferralCode['status']) => {
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

const getCodeStatusClasses = (status: ReferralCode['status']) => {
  switch (status) {
    case 'active':
      return 'bg-emerald-500/10 text-emerald-300 border-emerald-500/20';
    case 'paused':
      return 'bg-yellow-500/10 text-yellow-300 border-yellow-500/20';
    case 'archived':
    default:
      return 'bg-white/10 text-white/55 border-white/10';
  }
};

const buildReferralsCsv = (referrals: Referral[]) => {
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
      'factura',
      'cliente_convertido',
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
      referral.invoice_number || '',
      referral.converted_client_name || '',
      referral.created_at,
      referral.paid_at || '',
    ]),
  ];

  return rows
    .map((row) =>
      row
        .map((cell) => `"${String(cell).replace(/"/g, '""')}"`)
        .join(','),
    )
    .join('\n');
};

export const ClientReferralsPortal: React.FC = () => {
  const [portal, setPortal] = useState<ClientReferralPortal | null>(null);
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
      const response = await fetch('/api/client-portal/referrals');
      const data = await getResponseJson<ClientReferralPortal>(response);
      setPortal(data);
    } catch (error) {
      console.error('Error loading client referrals portal:', error);
      setPortal(null);
      setMessage(
        error instanceof Error
          ? error.message
          : 'No se pudo cargar el programa de referidos.',
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
      console.error('Error copying referral value:', error);
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
    triggerClientDownload(url, 'client-referrals.json', () => URL.revokeObjectURL(url));
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
    triggerClientDownload(url, 'client-referrals.csv', () => URL.revokeObjectURL(url));
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
            Controla tu base de referidos, las ganancias acumuladas y los enlaces activos.
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
          { label: 'Codigos activos', value: portal?.summary.active_codes || 0, icon: Gift },
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
            <h3 className="font-bold text-lg">Tus codigos y enlaces</h3>
            <p className="text-sm text-white/45 mt-1">
              Comparte estos enlaces para que la agencia pueda atribuir cada referido y su pago.
            </p>
          </div>
          <span className="text-sm text-white/40">{codes.length} disponibles</span>
        </div>

        {loading ? (
          <div className="grid grid-cols-1 xl:grid-cols-2 gap-4">
            {Array.from({ length: 2 }).map((_, index) => (
              <div
                key={`client-referral-code-skeleton-${index}`}
                className="h-56 rounded-2xl bg-white/5 animate-pulse"
              />
            ))}
          </div>
        ) : codes.length === 0 ? (
          <div className="glass-input text-sm text-white/45">
            Todavia no tienes codigos activos. La agencia puede activarlos desde el panel
            principal.
          </div>
        ) : (
          <div className="grid grid-cols-1 xl:grid-cols-2 gap-4">
            {codes.map((code) => (
              <div
                key={code.id}
                className="rounded-2xl border border-white/10 bg-white/5 p-5 space-y-4"
              >
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <p className="font-bold text-lg">{code.code}</p>
                    <p className="text-sm text-white/45 mt-1">
                      {code.reward_description || 'Programa de recomendacion activo'}
                    </p>
                  </div>
                  <span
                    className={cn(
                      'text-[10px] px-2 py-1 rounded-full font-bold uppercase tracking-wider border',
                      getCodeStatusClasses(code.status),
                    )}
                  >
                    {getCodeStatusLabel(code.status)}
                  </span>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                  <div className="glass-input">
                    <p className="text-[10px] text-white/30 uppercase font-bold tracking-wider">
                      Comision
                    </p>
                    <p className="text-lg font-bold mt-2">
                      {code.commission_type === 'percent'
                        ? `${code.commission_value}%`
                        : formatCurrency(code.commission_value, referralCurrency)}
                    </p>
                  </div>
                  <div className="glass-input">
                    <p className="text-[10px] text-white/30 uppercase font-bold tracking-wider">
                      Codigo
                    </p>
                    <p className="text-lg font-bold mt-2 break-all">{code.code}</p>
                  </div>
                  <div className="glass-input">
                    <p className="text-[10px] text-white/30 uppercase font-bold tracking-wider">
                      Creado
                    </p>
                    <p className="text-lg font-bold mt-2">{formatDate(code.created_at)}</p>
                  </div>
                </div>

                <div className="glass-input text-xs break-all">{code.referral_link}</div>
                <div className="glass-input text-[11px] break-all text-white/45">
                  POST {code.capture_endpoint}
                </div>
                {code.landing_url ? (
                  <div className="glass-input text-[11px] break-all text-white/45">
                    Landing {code.landing_url}
                  </div>
                ) : null}

                <div className="flex flex-wrap gap-2">
                  <button
                    type="button"
                    onClick={() => void handleCopy(code.code, `Codigo ${code.code} copiado.`)}
                    className="glass-button-secondary"
                  >
                    <Copy className="w-4 h-4" />
                    Codigo
                  </button>
                  <button
                    type="button"
                    onClick={() =>
                      void handleCopy(code.referral_link, `Enlace ${code.code} copiado.`)
                    }
                    className="glass-button-secondary"
                  >
                    <Link2 className="w-4 h-4" />
                    Enlace
                  </button>
                  <button
                    type="button"
                    onClick={() =>
                      void handleCopy(
                        code.capture_endpoint,
                        `Endpoint ${code.code} copiado.`,
                      )
                    }
                    className="glass-button-secondary"
                  >
                    <Gift className="w-4 h-4" />
                    Endpoint
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
              Consulta quien ha sido referido, en que estado esta y cuanto ha generado.
            </p>
          </div>
          <span className="text-sm text-white/40">{referrals.length} registros</span>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left min-w-[1080px]">
            <thead>
              <tr className="bg-white/5">
                <th className="px-6 py-4 text-xs font-bold uppercase tracking-wider text-white/40">
                  Referido
                </th>
                <th className="px-6 py-4 text-xs font-bold uppercase tracking-wider text-white/40">
                  Codigo
                </th>
                <th className="px-6 py-4 text-xs font-bold uppercase tracking-wider text-white/40">
                  Estado
                </th>
                <th className="px-6 py-4 text-xs font-bold uppercase tracking-wider text-white/40">
                  Pago
                </th>
                <th className="px-6 py-4 text-xs font-bold uppercase tracking-wider text-white/40">
                  Ganancia
                </th>
                <th className="px-6 py-4 text-xs font-bold uppercase tracking-wider text-white/40">
                  Factura
                </th>
                <th className="px-6 py-4 text-xs font-bold uppercase tracking-wider text-white/40">
                  Alta
                </th>
              </tr>
            </thead>

            <tbody className="divide-y divide-white/5">
              {loading ? (
                Array.from({ length: 4 }).map((_, index) => (
                  <tr key={`client-referral-skeleton-${index}`} className="animate-pulse">
                    <td colSpan={7} className="px-6 py-8 bg-white/5" />
                  </tr>
                ))
              ) : referrals.length === 0 ? (
                <tr>
                  <td colSpan={7} className="px-6 py-8 text-center text-white/40">
                    Aun no hay referidos registrados para tu cuenta.
                  </td>
                </tr>
              ) : (
                referrals.map((referral) => (
                  <tr key={referral.id} className="hover:bg-white/5 transition-colors">
                    <td className="px-6 py-4">
                      <div>
                        <p className="font-semibold">{referral.referred_name}</p>
                        <p className="text-xs text-white/45 mt-1">
                          {referral.referred_company || 'Sin empresa'}
                        </p>
                        <p className="text-xs text-white/35 mt-1">
                          {referral.referred_email || 'Sin email'} ·{' '}
                          {referral.referred_phone || 'Sin telefono'}
                        </p>
                      </div>
                    </td>
                    <td className="px-6 py-4 text-sm font-mono text-brand-cyan">
                      {referral.code}
                    </td>
                    <td className="px-6 py-4">
                      <span
                        className={cn(
                          'text-[10px] px-2 py-1 rounded-full font-bold uppercase tracking-wider border',
                          getReferralStatusClasses(referral.status),
                        )}
                      >
                        {getReferralStatusLabel(referral.status)}
                      </span>
                    </td>
                    <td className="px-6 py-4">
                      <span
                        className={cn(
                          'text-[10px] px-2 py-1 rounded-full font-bold uppercase tracking-wider border',
                          getPayoutStatusClasses(referral.payout_status),
                        )}
                      >
                        {getPayoutStatusLabel(referral.payout_status)}
                      </span>
                    </td>
                    <td className="px-6 py-4 text-sm font-bold">
                      {formatCurrency(referral.commission_amount, referral.currency)}
                    </td>
                    <td className="px-6 py-4 text-sm text-white/50">
                      {referral.invoice_number || referral.converted_client_name || 'Pendiente'}
                    </td>
                    <td className="px-6 py-4 text-sm text-white/50">
                      {formatDate(referral.created_at)}
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
