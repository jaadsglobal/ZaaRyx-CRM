import React, { useEffect, useState } from 'react';
import {
  CreditCard,
  Download,
  AlertCircle,
  ArrowUpRight,
  TrendingUp,
} from 'lucide-react';
import { AnimatePresence, motion } from 'motion/react';
import { Client, DashboardStats, Invoice, cn } from '../types';
import { triggerClientDownload } from '../lib/download';
import { CollapsibleSection } from './CollapsibleSection';
import { InteractiveSummaryCard } from './InteractiveSummaryCard';

const getResponseJson = async <T,>(response: Response): Promise<T> => {
  if (!response.ok) {
    throw new Error(`Request failed with status ${response.status}`);
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

export const BillingManager: React.FC = () => {
  const [invoices, setInvoices] = useState<Invoice[]>([]);
  const [clients, setClients] = useState<Client[]>([]);
  const [stats, setStats] = useState<DashboardStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [invoiceStatusFilter, setInvoiceStatusFilter] = useState<'all' | Invoice['status'] | 'open'>('all');
  const [showPaymentSettings, setShowPaymentSettings] = useState(false);
  const [feedbackMessage, setFeedbackMessage] = useState<string | null>(null);
  const [feedbackTone, setFeedbackTone] = useState<'success' | 'error'>('success');
  const [billingSettings, setBillingSettings] = useState({
    provider: 'Stripe',
    reminders: true,
    autopay: false,
  });

  const loadBillingData = async () => {
    try {
      const [invoicesResponse, clientsResponse, statsResponse] = await Promise.all([
        fetch('/api/invoices'),
        fetch('/api/clients'),
        fetch('/api/stats'),
      ]);

      const [invoicesData, clientsData, statsData] = await Promise.all([
        getResponseJson<Invoice[]>(invoicesResponse),
        getResponseJson<Client[]>(clientsResponse),
        getResponseJson<DashboardStats>(statsResponse),
      ]);

      setInvoices(invoicesData);
      setClients(clientsData);
      setStats(statsData);
    } catch (error) {
      console.error('Error fetching billing data:', error);
      setFeedbackTone('error');
      setFeedbackMessage('No se pudo cargar la información de facturación.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void loadBillingData();
  }, []);

  const setMessage = (message: string, tone: 'success' | 'error' = 'success') => {
    setFeedbackTone(tone);
    setFeedbackMessage(message);
  };

  const clientNameById = clients.reduce<Record<number, string>>((accumulator, client) => {
    accumulator[client.id] = client.company;
    return accumulator;
  }, {});

  const paidInvoices = invoices.filter((invoice) => invoice.status === 'paid');
  const pendingInvoices = invoices.filter((invoice) => invoice.status !== 'paid');
  const totalRevenue = paidInvoices.reduce((sum, invoice) => sum + Number(invoice.amount || 0), 0);
  const pendingRevenue = pendingInvoices.reduce(
    (sum, invoice) => sum + Number(invoice.amount || 0),
    0,
  );
  const activeSubscriptions = clients.filter((client) => client.status === 'active').length;

  const filteredInvoices =
    invoiceStatusFilter === 'all'
      ? invoices
      : invoiceStatusFilter === 'open'
        ? invoices.filter((invoice) => invoice.status !== 'paid')
        : invoices.filter((invoice) => invoice.status === invoiceStatusFilter);
  const visibleInvoices = filteredInvoices.slice(0, 4);

  const scrollToInvoices = () => {
    document.getElementById('billing-invoices-section')?.scrollIntoView({
      behavior: 'smooth',
      block: 'start',
    });
  };

  const handleDownloadInvoice = (invoice: Invoice) => {
    if (!invoice.url) {
      setMessage('Esta factura no tiene archivo disponible para descargar.', 'error');
      return;
    }

    triggerClientDownload(invoice.url, `${invoice.invoice_number}.txt`);
    setMessage(`Descarga iniciada para ${invoice.invoice_number}.`);
  };

  const handleSavePaymentSettings = () => {
    setShowPaymentSettings(false);
    setMessage('Configuración de pagos guardada correctamente.');
  };

  return (
    <div className="space-y-8">
      <header className="flex justify-between items-center">
        <div>
          <h2 className="text-3xl font-bold">Facturación</h2>
          <p className="text-white/50">Gestiona tus ingresos, suscripciones y facturas.</p>
        </div>
        <button
          type="button"
          onClick={() => setShowPaymentSettings((current) => !current)}
          className="glass-button-primary"
        >
          <CreditCard className="w-5 h-5" />
          Configurar Pagos
        </button>
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
        {showPaymentSettings ? (
          <motion.div
            initial={{ opacity: 0, y: -8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -8 }}
            className="glass-panel p-6 grid grid-cols-1 md:grid-cols-3 gap-4"
          >
            <div>
              <label className="block text-xs font-bold uppercase tracking-wider text-white/40 mb-2">
                Proveedor
              </label>
              <select
                value={billingSettings.provider}
                onChange={(event) =>
                  setBillingSettings((current) => ({
                    ...current,
                    provider: event.target.value,
                  }))
                }
                className="w-full glass-input"
              >
                <option value="Stripe">Stripe</option>
                <option value="PayPal">PayPal</option>
                <option value="Wise">Wise</option>
              </select>
            </div>

            <label className="glass-input flex items-center justify-between cursor-pointer">
              <span className="text-sm">Recordatorios automáticos</span>
              <input
                type="checkbox"
                checked={billingSettings.reminders}
                onChange={(event) =>
                  setBillingSettings((current) => ({
                    ...current,
                    reminders: event.target.checked,
                  }))
                }
              />
            </label>

            <label className="glass-input flex items-center justify-between cursor-pointer">
              <span className="text-sm">Cobro automático</span>
              <input
                type="checkbox"
                checked={billingSettings.autopay}
                onChange={(event) =>
                  setBillingSettings((current) => ({
                    ...current,
                    autopay: event.target.checked,
                  }))
                }
              />
            </label>

            <div className="md:col-span-3 flex justify-end gap-3">
              <button
                type="button"
                onClick={() => setShowPaymentSettings(false)}
                className="glass-button-secondary"
              >
                Cancelar
              </button>
              <button type="button" onClick={handleSavePaymentSettings} className="glass-button-primary">
                Guardar Configuración
              </button>
            </div>
          </motion.div>
        ) : null}
      </AnimatePresence>

      <CollapsibleSection
        title="Resumen financiero"
        description="KPIs de ingresos, recurrencia y cobros pendientes."
        icon={<TrendingUp className="w-5 h-5" />}
        storageKey="billing-summary"
      >
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          <InteractiveSummaryCard
            label="Ingresos Totales (YTD)"
            value={`$${(stats?.revenue || totalRevenue).toLocaleString()}`}
            hint="+24% vs año pasado"
            icon={ArrowUpRight}
            onClick={() => {
              setInvoiceStatusFilter('paid');
              scrollToInvoices();
            }}
            active={invoiceStatusFilter === 'paid'}
          />
          <InteractiveSummaryCard
            label="MRR (Ingresos Recurrentes)"
            value={`$${(stats?.mrr || 0).toLocaleString()}`}
            hint={`${activeSubscriptions} suscripciones activas`}
            icon={TrendingUp}
            iconClassName="text-brand-purple"
            onClick={scrollToInvoices}
            active={invoiceStatusFilter === 'all'}
          />
          <InteractiveSummaryCard
            label="Pendiente de Cobro"
            value={`$${pendingRevenue.toLocaleString()}`}
            hint={`${pendingInvoices.length} facturas pendientes`}
            icon={AlertCircle}
            iconClassName="text-red-400"
            onClick={() => {
              setInvoiceStatusFilter('open');
              scrollToInvoices();
            }}
            active={invoiceStatusFilter === 'open'}
          />
        </div>
      </CollapsibleSection>

      <CollapsibleSection
        title="Facturas recientes"
        description="Listado operativo de cobros y vencimientos."
        icon={<CreditCard className="w-5 h-5" />}
        summary={`${visibleInvoices.length} visibles`}
        storageKey="billing-invoices"
        bodyClassName="p-0"
        actions={
          invoiceStatusFilter !== 'all' ? (
            <button
              type="button"
              onClick={() => setInvoiceStatusFilter('all')}
              className="glass-button-secondary"
            >
              Ver todas
            </button>
          ) : null
        }
      >
        <div id="billing-invoices-section" />
        <table className="w-full text-left">
          <thead>
            <tr className="bg-white/5">
              <th className="px-6 py-4 text-xs font-bold uppercase tracking-wider text-white/40">ID Factura</th>
              <th className="px-6 py-4 text-xs font-bold uppercase tracking-wider text-white/40">Cliente</th>
              <th className="px-6 py-4 text-xs font-bold uppercase tracking-wider text-white/40">Monto</th>
              <th className="px-6 py-4 text-xs font-bold uppercase tracking-wider text-white/40">Fecha</th>
              <th className="px-6 py-4 text-xs font-bold uppercase tracking-wider text-white/40">Estado</th>
              <th className="px-6 py-4 text-xs font-bold uppercase tracking-wider text-white/40">Acciones</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-white/5">
            {loading ? (
              [1, 2].map((item) => (
                <tr key={item} className="animate-pulse">
                  <td colSpan={6} className="px-6 py-8 bg-white/5"></td>
                </tr>
              ))
            ) : visibleInvoices.length === 0 ? (
              <tr>
                <td colSpan={6} className="px-6 py-8 text-center text-white/40">
                  No hay facturas disponibles.
                </td>
              </tr>
            ) : (
              visibleInvoices.map((invoice) => (
                <tr key={invoice.id} className="hover:bg-white/5 transition-colors">
                  <td className="px-6 py-4 font-mono text-sm text-brand-cyan">
                    {invoice.invoice_number}
                  </td>
                  <td className="px-6 py-4 font-bold text-sm">
                    {clientNameById[invoice.client_id] || 'Cliente sin nombre'}
                  </td>
                  <td className="px-6 py-4 text-sm font-bold">
                    ${invoice.amount.toLocaleString()}
                  </td>
                  <td className="px-6 py-4 text-sm text-white/40">{invoice.due_date}</td>
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
                      className="p-2 hover:bg-white/10 rounded-lg transition-colors text-white/40 hover:text-white"
                    >
                      <Download className="w-4 h-4" />
                    </button>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </CollapsibleSection>
    </div>
  );
};
