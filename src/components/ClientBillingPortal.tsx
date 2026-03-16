import React, { useEffect, useState } from 'react';
import {
  AlertCircle,
  CheckCircle2,
  CreditCard,
  Download,
  RefreshCw,
} from 'lucide-react';
import { Invoice, cn } from '../types';
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

const getInvoiceStatusClasses = (status: Invoice['status']) => {
  switch (status) {
    case 'paid':
      return 'bg-green-500/10 text-green-400 border-green-500/20';
    case 'pending':
      return 'bg-yellow-500/10 text-yellow-400 border-yellow-500/20';
    case 'overdue':
      return 'bg-red-500/10 text-red-400 border-red-500/20';
    default:
      return 'bg-white/10 text-white/60 border-white/10';
  }
};

const getInvoiceStatusLabel = (status: Invoice['status']) => {
  switch (status) {
    case 'paid':
      return 'Pagada';
    case 'pending':
      return 'Pendiente';
    case 'overdue':
      return 'Vencida';
    default:
      return status;
  }
};

const formatDate = (value: string) => {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? value : date.toLocaleDateString('es-ES');
};

export const ClientBillingPortal: React.FC = () => {
  const [invoices, setInvoices] = useState<Invoice[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [invoiceStatusFilter, setInvoiceStatusFilter] = useState<'all' | Invoice['status']>('all');
  const [feedbackMessage, setFeedbackMessage] = useState<string | null>(null);
  const [feedbackTone, setFeedbackTone] = useState<'success' | 'error'>('success');

  const setMessage = (message: string, tone: 'success' | 'error' = 'success') => {
    setFeedbackTone(tone);
    setFeedbackMessage(message);
  };

  const loadInvoices = async (background = false) => {
    if (background) {
      setRefreshing(true);
    } else {
      setLoading(true);
    }

    try {
      const response = await fetch('/api/invoices');
      const data = await getResponseJson<Invoice[]>(response);
      setInvoices(data);
    } catch (error) {
      console.error('Error loading client invoices:', error);
      setMessage('No se pudo cargar tu facturación.', 'error');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  useEffect(() => {
    void loadInvoices();
  }, []);

  const paidInvoices = invoices.filter((invoice) => invoice.status === 'paid');
  const pendingInvoices = invoices.filter((invoice) => invoice.status === 'pending');
  const overdueInvoices = invoices.filter((invoice) => invoice.status === 'overdue');
  const totalBilled = invoices.reduce((sum, invoice) => sum + Number(invoice.amount || 0), 0);
  const totalPaid = paidInvoices.reduce((sum, invoice) => sum + Number(invoice.amount || 0), 0);
  const totalPending = pendingInvoices.reduce((sum, invoice) => sum + Number(invoice.amount || 0), 0);
  const totalOverdue = overdueInvoices.reduce((sum, invoice) => sum + Number(invoice.amount || 0), 0);
  const filteredInvoices =
    invoiceStatusFilter === 'all'
      ? invoices
      : invoices.filter((invoice) => invoice.status === invoiceStatusFilter);

  const scrollToInvoices = () => {
    document.getElementById('client-billing-invoices-section')?.scrollIntoView({
      behavior: 'smooth',
      block: 'start',
    });
  };

  const handleDownloadInvoice = (invoice: Invoice) => {
    if (!invoice.url) {
      setMessage('Esta factura todavía no tiene archivo descargable.', 'error');
      return;
    }

    triggerClientDownload(invoice.url, `${invoice.invoice_number}.txt`);
    setMessage(`Descarga iniciada para ${invoice.invoice_number}.`);
  };

  return (
    <div className="space-y-8">
      <header className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h2 className="text-3xl font-bold">Facturación</h2>
          <p className="text-white/50">
            Consulta tus facturas, el estado de cobro y los archivos compartidos por la agencia.
          </p>
        </div>

        <button
          type="button"
          onClick={() => void loadInvoices(true)}
          className="glass-button-secondary"
          disabled={refreshing}
        >
          <RefreshCw className={cn('w-4 h-4', refreshing && 'animate-spin')} />
          Refrescar
        </button>
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
        title="Resumen de facturación"
        description="KPIs rápidos para filtrar lo cobrado, pendiente o vencido."
        icon={<CreditCard className="w-5 h-5" />}
        summary={`${invoices.length} facturas`}
        storageKey="client-billing-summary"
      >
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-6">
          {[
            {
              label: 'Facturado',
              value: `€${totalBilled.toLocaleString()}`,
              icon: CreditCard,
              key: 'all' as const,
              hint: 'Muestra todas las facturas',
            },
            {
              label: 'Pagado',
              value: `€${totalPaid.toLocaleString()}`,
              icon: CheckCircle2,
              key: 'paid' as const,
              hint: 'Filtra facturas cobradas',
            },
            {
              label: 'Pendiente',
              value: `€${totalPending.toLocaleString()}`,
              icon: RefreshCw,
              key: 'pending' as const,
              hint: 'Filtra vencimientos pendientes',
            },
            {
              label: 'Vencido',
              value: `€${totalOverdue.toLocaleString()}`,
              icon: AlertCircle,
              key: 'overdue' as const,
              hint: 'Filtra cobros vencidos',
            },
          ].map((item) => (
            <InteractiveSummaryCard
              key={item.label}
              label={item.label}
              value={item.value}
              hint={item.hint}
              icon={item.icon}
              active={invoiceStatusFilter === item.key}
              onClick={() => {
                setInvoiceStatusFilter(item.key);
                scrollToInvoices();
              }}
            />
          ))}
        </div>
      </CollapsibleSection>

      <CollapsibleSection
        title="Facturas"
        description="Descarga tus documentos y revisa el estado de cada vencimiento."
        icon={<Download className="w-5 h-5" />}
        summary={`${filteredInvoices.length} visibles`}
        storageKey="client-billing-invoices"
        bodyClassName="p-0"
      >
        <div id="client-billing-invoices-section" />
        <div className="p-6 border-b border-white/10 flex flex-wrap items-center justify-between gap-3">
          <div>
            <h3 className="font-bold text-lg">Listado de facturas</h3>
            <p className="text-sm text-white/45 mt-1">
              Filtra y descarga los archivos compartidos por la agencia.
            </p>
          </div>
          <div className="flex items-center gap-3">
            {invoiceStatusFilter !== 'all' ? (
              <button
                type="button"
                onClick={() => setInvoiceStatusFilter('all')}
                className="glass-button-secondary"
              >
                Ver todas
              </button>
            ) : null}
            <span className="text-sm text-white/40">{filteredInvoices.length} visibles</span>
          </div>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left min-w-[720px]">
            <thead>
              <tr className="bg-white/5">
                <th className="px-6 py-4 text-xs font-bold uppercase tracking-wider text-white/40">
                  Factura
                </th>
                <th className="px-6 py-4 text-xs font-bold uppercase tracking-wider text-white/40">
                  Cliente
                </th>
                <th className="px-6 py-4 text-xs font-bold uppercase tracking-wider text-white/40">
                  Importe
                </th>
                <th className="px-6 py-4 text-xs font-bold uppercase tracking-wider text-white/40">
                  Vencimiento
                </th>
                <th className="px-6 py-4 text-xs font-bold uppercase tracking-wider text-white/40">
                  Estado
                </th>
                <th className="px-6 py-4 text-xs font-bold uppercase tracking-wider text-white/40">
                  Archivo
                </th>
              </tr>
            </thead>

            <tbody className="divide-y divide-white/5">
              {loading ? (
                Array.from({ length: 3 }).map((_, index) => (
                  <tr key={`client-invoice-skeleton-${index}`} className="animate-pulse">
                    <td colSpan={6} className="px-6 py-8 bg-white/5" />
                  </tr>
                ))
              ) : filteredInvoices.length === 0 ? (
                <tr>
                  <td colSpan={6} className="px-6 py-8 text-center text-white/40">
                    Tu agencia todavía no ha compartido facturas contigo.
                  </td>
                </tr>
              ) : (
                filteredInvoices.map((invoice) => (
                  <tr key={invoice.id} className="hover:bg-white/5 transition-colors">
                    <td className="px-6 py-4 font-mono text-sm text-brand-cyan">
                      {invoice.invoice_number}
                    </td>
                    <td className="px-6 py-4 text-sm font-semibold">
                      {invoice.client_name || 'Cliente'}
                    </td>
                    <td className="px-6 py-4 text-sm font-bold">
                      €{invoice.amount.toLocaleString()}
                    </td>
                    <td className="px-6 py-4 text-sm text-white/50">
                      {formatDate(invoice.due_date)}
                    </td>
                    <td className="px-6 py-4">
                      <span
                        className={cn(
                          'text-[10px] px-2 py-1 rounded-full font-bold uppercase tracking-wider border',
                          getInvoiceStatusClasses(invoice.status),
                        )}
                      >
                        {getInvoiceStatusLabel(invoice.status)}
                      </span>
                    </td>
                    <td className="px-6 py-4">
                      <button
                        type="button"
                        onClick={() => handleDownloadInvoice(invoice)}
                        className="glass-button-secondary"
                      >
                        <Download className="w-4 h-4" />
                        Descargar
                      </button>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </CollapsibleSection>
    </div>
  );
};
