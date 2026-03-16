import React, { useEffect, useState } from 'react';
import {
  Briefcase,
  CheckCircle2,
  CreditCard,
  Download,
  RefreshCw,
  Wallet,
} from 'lucide-react';
import {
  FreelancerFinancePortal,
  Contract,
  cn,
} from '../types';
import { triggerClientDownload } from '../lib/download';
import { CollapsibleSection } from './CollapsibleSection';
import { InteractiveSummaryCard } from './InteractiveSummaryCard';

const getResponseJson = async <T,>(response: Response): Promise<T> => {
  if (!response.ok) {
    const errorData = (await response.json().catch(() => null)) as { error?: string } | null;
    throw new Error(errorData?.error || `Request failed with status ${response.status}`);
  }

  return response.json() as Promise<T>;
};

const formatCurrency = (amount: number, currency = 'EUR') =>
  new Intl.NumberFormat('es-ES', {
    style: 'currency',
    currency,
    maximumFractionDigits: 2,
  }).format(Number(amount || 0));

const formatDate = (value?: string | null) => {
  if (!value) {
    return 'Pendiente';
  }

  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? value : date.toLocaleDateString('es-ES');
};

const getContractStatusLabel = (status: Contract['status']) => {
  switch (status) {
    case 'draft':
      return 'Borrador';
    case 'review':
      return 'Revisión';
    case 'ready':
      return 'Listo';
    case 'sent':
      return 'Enviado';
    case 'signed':
      return 'Firmado';
    case 'archived':
      return 'Archivado';
    default:
      return status;
  }
};

export const FreelancerBillingPortal: React.FC = () => {
  const [portal, setPortal] = useState<FreelancerFinancePortal | null>(null);
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
      const response = await fetch('/api/freelancer-portal/finance');
      const data = await getResponseJson<FreelancerFinancePortal>(response);
      setPortal(data);
    } catch (error) {
      console.error('Error loading freelancer finance portal:', error);
      setPortal(null);
      setMessage(
        error instanceof Error ? error.message : 'No se pudo cargar el portal de cobros.',
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

  const handleDownloadJson = () => {
    if (!portal) {
      return;
    }

    const blob = new Blob([JSON.stringify(portal, null, 2)], {
      type: 'application/json',
    });
    const url = URL.createObjectURL(blob);
    triggerClientDownload(url, 'freelancer-finance.json', () => URL.revokeObjectURL(url));
    setMessage('Resumen de cobros descargado en JSON.');
  };

  const currency = portal?.freelancer.currency || 'EUR';
  const contracts = portal?.contracts || [];

  const scrollToSection = (sectionId: string) => {
    document.getElementById(sectionId)?.scrollIntoView({
      behavior: 'smooth',
      block: 'start',
    });
  };

  return (
    <div className="space-y-8">
      <header className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h2 className="text-3xl font-bold">Cobros</h2>
          <p className="text-white/50">
            Consulta importes contratados, comisiones y la información operativa para tus pagos.
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

      <CollapsibleSection
        title="Resumen de cobros"
        description="Visión rápida del volumen contratado, contratos firmados y total visible."
        icon={<Wallet className="w-5 h-5" />}
        summary={formatCurrency(portal?.summary.total_generated || 0, currency)}
        storageKey="freelancer-billing-summary"
      >
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-6">
          {[
            {
              label: 'Volumen contratado',
              value: formatCurrency(portal?.summary.total_contract_value || 0, currency),
              icon: Briefcase,
              hint: 'Ir al resumen de contratos',
              sectionId: 'freelancer-billing-contracts-section',
            },
            {
              label: 'Pendiente de firma',
              value: formatCurrency(portal?.summary.pending_contract_value || 0, currency),
              icon: CreditCard,
              hint: 'Ir al resumen de contratos',
              sectionId: 'freelancer-billing-contracts-section',
            },
            {
              label: 'Firmado',
              value: formatCurrency(portal?.summary.signed_contract_value || 0, currency),
              icon: CheckCircle2,
              hint: 'Ir al resumen de contratos',
              sectionId: 'freelancer-billing-contracts-section',
            },
            {
              label: 'Total visible',
              value: formatCurrency(portal?.summary.total_generated || 0, currency),
              icon: Wallet,
              hint: 'Ir al perfil de payout',
              sectionId: 'freelancer-billing-profile-section',
            },
          ].map((item) => (
            <InteractiveSummaryCard
              key={item.label}
              label={item.label}
              value={loading ? '...' : item.value}
              hint={item.hint}
              icon={item.icon}
              onClick={() => scrollToSection(item.sectionId)}
            />
          ))}
        </div>
      </CollapsibleSection>

      <div className="grid grid-cols-1 xl:grid-cols-[0.78fr_1.22fr] gap-6">
        <CollapsibleSection
          title="Perfil de payout"
          description="Información usada por la agencia para coordinar tus cobros."
          icon={<Wallet className="w-5 h-5" />}
          storageKey="freelancer-billing-profile"
        >
          <div id="freelancer-billing-profile-section" />
          <div className="space-y-4">
            <div className="rounded-2xl border border-white/10 bg-white/5 p-5">
              <p className="text-xs uppercase tracking-wider text-white/40 font-bold">
                Método de pago
              </p>
              <p className="text-xl font-semibold mt-3">
                {portal?.freelancer.payment_method || 'Pendiente'}
              </p>
            </div>

            <div className="rounded-2xl border border-white/10 bg-white/5 p-5">
              <p className="text-xs uppercase tracking-wider text-white/40 font-bold">
                Referencia
              </p>
              <p className="text-sm font-medium mt-3 break-all">
                {portal?.freelancer.payout_reference || 'Sin referencia configurada'}
              </p>
            </div>

            <div className="rounded-2xl border border-white/10 bg-white/5 p-5">
              <p className="text-xs uppercase tracking-wider text-white/40 font-bold">
                Integración
              </p>
              <p className="text-xl font-semibold mt-3">
                {portal?.freelancer.payout_integration_name || 'Manual'}
              </p>
              <p className="text-sm text-white/45 mt-2">
                {portal?.freelancer.specialty || 'Freelance'} · {portal?.freelancer.currency || 'EUR'}
              </p>
            </div>
          </div>
        </CollapsibleSection>

        <CollapsibleSection
          title="Resumen de contratos"
          description="Acuerdos visibles y estado económico asociado a cada uno."
          icon={<Briefcase className="w-5 h-5" />}
          summary={`${contracts.length} visibles`}
          storageKey="freelancer-billing-contracts"
          bodyClassName="p-0"
        >
          <div id="freelancer-billing-contracts-section" />
          <div className="overflow-x-auto">
            <table className="w-full text-left min-w-[720px]">
              <thead>
                <tr className="bg-white/5">
                  <th className="px-6 py-4 text-xs font-bold uppercase tracking-wider text-white/40">
                    Contrato
                  </th>
                  <th className="px-6 py-4 text-xs font-bold uppercase tracking-wider text-white/40">
                    Cliente
                  </th>
                  <th className="px-6 py-4 text-xs font-bold uppercase tracking-wider text-white/40">
                    Importe
                  </th>
                  <th className="px-6 py-4 text-xs font-bold uppercase tracking-wider text-white/40">
                    Inicio
                  </th>
                  <th className="px-6 py-4 text-xs font-bold uppercase tracking-wider text-white/40">
                    Estado
                  </th>
                </tr>
              </thead>

              <tbody className="divide-y divide-white/5">
                {loading ? (
                  Array.from({ length: 3 }).map((_, index) => (
                    <tr key={`freelancer-finance-contract-${index}`} className="animate-pulse">
                      <td colSpan={5} className="px-6 py-8 bg-white/5" />
                    </tr>
                  ))
                ) : contracts.length === 0 ? (
                  <tr>
                    <td colSpan={5} className="px-6 py-8 text-center text-white/40">
                      Aún no hay contratos visibles en tu portal.
                    </td>
                  </tr>
                ) : (
                  contracts.map((contract) => (
                    <tr key={contract.id} className="hover:bg-white/5 transition-colors">
                      <td className="px-6 py-4 font-mono text-sm text-brand-cyan">
                        {contract.contract_number}
                      </td>
                      <td className="px-6 py-4 text-sm font-semibold">
                        {contract.client_name || contract.counterparty_name}
                      </td>
                      <td className="px-6 py-4 text-sm font-bold">
                        {formatCurrency(contract.total_amount, contract.currency)}
                      </td>
                      <td className="px-6 py-4 text-sm text-white/50">
                        {formatDate(contract.start_date)}
                      </td>
                      <td className="px-6 py-4 text-sm text-white/60">
                        {getContractStatusLabel(contract.status)}
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </CollapsibleSection>
      </div>
    </div>
  );
};
