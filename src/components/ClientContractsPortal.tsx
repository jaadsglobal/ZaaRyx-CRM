import React, { useEffect, useState } from 'react';
import {
  AlertCircle,
  CheckCircle2,
  Clock3,
  Download,
  FileSignature,
  FileText,
  RefreshCw,
} from 'lucide-react';
import { Contract, ContractEvent, cn } from '../types';
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

const formatDate = (value?: string | null) => {
  if (!value) {
    return 'Pendiente';
  }

  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? value : date.toLocaleDateString('es-ES');
};

export const ClientContractsPortal: React.FC = () => {
  const [contracts, setContracts] = useState<Contract[]>([]);
  const [events, setEvents] = useState<ContractEvent[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [eventsLoading, setEventsLoading] = useState(false);
  const [contractStatusFilter, setContractStatusFilter] = useState<'all' | 'pending' | 'signed'>('all');
  const [selectedContractId, setSelectedContractId] = useState<number | null>(null);
  const [signingContractId, setSigningContractId] = useState<number | null>(null);
  const [feedbackMessage, setFeedbackMessage] = useState<string | null>(null);
  const [feedbackTone, setFeedbackTone] = useState<'success' | 'error'>('success');

  const setMessage = (message: string, tone: 'success' | 'error' = 'success') => {
    setFeedbackTone(tone);
    setFeedbackMessage(message);
  };

  const loadContracts = async (background = false) => {
    if (background) {
      setRefreshing(true);
    } else {
      setLoading(true);
    }

    try {
      const response = await fetch('/api/contracts');
      const data = await getResponseJson<Contract[]>(response);
      setContracts(data);
      setSelectedContractId((current) =>
        current && data.some((contract) => contract.id === current)
          ? current
          : data[0]?.id || null,
      );
    } catch (error) {
      console.error('Error loading client contracts:', error);
      setMessage('No se pudieron cargar tus contratos.', 'error');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  const loadContractEvents = async (contractId: number) => {
    setEventsLoading(true);

    try {
      const response = await fetch(`/api/contracts/${contractId}/events`);
      const data = await getResponseJson<ContractEvent[]>(response);
      setEvents(data);
    } catch (error) {
      console.error('Error loading client contract events:', error);
      setEvents([]);
      setMessage('No se pudo cargar el historial del contrato.', 'error');
    } finally {
      setEventsLoading(false);
    }
  };

  const filteredContracts =
    contractStatusFilter === 'all'
      ? contracts
      : contracts.filter((contract) =>
          contractStatusFilter === 'signed'
            ? contract.status === 'signed'
            : ['review', 'ready', 'sent'].includes(contract.status),
        );
  const selectedContract =
    filteredContracts.find((contract) => contract.id === selectedContractId) ||
    filteredContracts[0] ||
    null;

  useEffect(() => {
    void loadContracts();
  }, []);

  useEffect(() => {
    if (!selectedContract?.id) {
      setEvents([]);
      return;
    }

    void loadContractEvents(selectedContract.id);
  }, [selectedContract?.id]);
  const signedContracts = contracts.filter((contract) => contract.status === 'signed').length;
  const pendingSignature = contracts.filter((contract) =>
    ['review', 'ready', 'sent'].includes(contract.status),
  ).length;
  const totalValue = contracts.reduce(
    (sum, contract) => sum + Number(contract.total_amount || 0),
    0,
  );

  const scrollToContractList = () => {
    document.getElementById('client-contracts-list-section')?.scrollIntoView({
      behavior: 'smooth',
      block: 'start',
    });
  };

  const handleDownloadContract = (contract: Contract) => {
    if (!contract.document_url) {
      setMessage('Este contrato todavía no tiene documento descargable.', 'error');
      return;
    }

    triggerClientDownload(contract.document_url, `${contract.contract_number}.txt`);
    setMessage(`Descarga iniciada para ${contract.contract_number}.`);
  };

  const handleSignContract = async (contract: Contract) => {
    if (contract.status !== 'sent') {
      setMessage('Este contrato no está pendiente de firma.', 'error');
      return;
    }

    if (!window.confirm(`Vas a firmar digitalmente ${contract.contract_number}. ¿Continuar?`)) {
      return;
    }

    setSigningContractId(contract.id);

    try {
      await getResponseJson<Contract>(
        await fetch(`/api/client-portal/contracts/${contract.id}/sign`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
        }),
      );
      await loadContracts(true);
      await loadContractEvents(contract.id);
      setMessage(`Contrato firmado digitalmente: ${contract.contract_number}.`);
    } catch (error) {
      console.error('Error signing client contract:', error);
      setMessage('No se pudo firmar el contrato.', 'error');
    } finally {
      setSigningContractId(null);
    }
  };

  return (
    <div className="space-y-8">
      <header className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h2 className="text-3xl font-bold">Contratos</h2>
          <p className="text-white/50">
            Revisa tus acuerdos vigentes, su estado y el historial de revisiones compartido contigo.
          </p>
        </div>

        <button
          type="button"
          onClick={() => void loadContracts(true)}
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
        title="Resumen contractual"
        description="Vista rápida de tus acuerdos, estados de firma y valor total compartido por la agencia."
        storageKey="client-contracts-summary"
        defaultOpen
      >
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-6">
          {[
            {
              label: 'Contratos visibles',
              value: contracts.length,
              icon: FileText,
              key: 'all' as const,
              hint: 'Muestra todos tus acuerdos',
              activeWhenAll: true,
            },
            {
              label: 'Pendientes de firma',
              value: pendingSignature,
              icon: Clock3,
              key: 'pending' as const,
              hint: 'Filtra acuerdos por firmar',
            },
            {
              label: 'Firmados',
              value: signedContracts,
              icon: CheckCircle2,
              key: 'signed' as const,
              hint: 'Filtra contratos ya firmados',
            },
            {
              label: 'Valor total',
              value: `€${totalValue.toLocaleString()}`,
              icon: AlertCircle,
              key: 'all' as const,
              hint: 'Vuelve a la vista completa',
            },
          ].map((item) => (
            <InteractiveSummaryCard
              key={item.label}
              label={item.label}
              value={item.value}
              hint={item.hint}
              icon={item.icon}
              active={
                item.key === 'all'
                  ? Boolean(item.activeWhenAll && contractStatusFilter === 'all')
                  : contractStatusFilter === item.key
              }
              onClick={() => {
                setContractStatusFilter(item.key);
                scrollToContractList();
              }}
            />
          ))}
        </div>
      </CollapsibleSection>

      <div className="grid grid-cols-1 xl:grid-cols-[0.92fr_1.08fr] gap-6">
        <CollapsibleSection
          title="Tus contratos"
          description="Selecciona un contrato para revisar el detalle completo."
          summary={`${filteredContracts.length} visibles`}
          storageKey="client-contracts-list"
          defaultOpen
          actions={
            contractStatusFilter !== 'all' ? (
              <button
                type="button"
                onClick={() => setContractStatusFilter('all')}
                className="glass-button-secondary"
              >
                Ver todos
              </button>
            ) : undefined
          }
        >
          <div className="space-y-3 max-h-[720px] overflow-y-auto" id="client-contracts-list-section">
            {loading
              ? Array.from({ length: 3 }).map((_, index) => (
                  <div
                    key={`client-contract-skeleton-${index}`}
                    className="h-28 rounded-2xl bg-white/5 animate-pulse"
                  />
                ))
              : filteredContracts.length === 0
                ? (
                    <div className="rounded-2xl border border-white/10 bg-white/5 p-6 text-white/45">
                      Tu agencia todavía no ha compartido contratos contigo.
                    </div>
                  )
                : filteredContracts.map((contract) => (
                    <button
                      key={contract.id}
                      type="button"
                      onClick={() => setSelectedContractId(contract.id)}
                      className={cn(
                        'w-full rounded-2xl border p-4 text-left transition-all',
                        selectedContractId === contract.id
                          ? 'border-brand-blue/30 bg-brand-blue/10 shadow-[0_0_20px_rgba(0,102,255,0.08)]'
                          : 'border-white/10 bg-white/5 hover:bg-white/8',
                      )}
                    >
                      <div className="flex items-start justify-between gap-3">
                        <div>
                          <p className="font-semibold">{contract.contract_number}</p>
                          <p className="text-sm text-white/45 mt-1">
                            {contract.counterparty_name} · Inicio {formatDate(contract.start_date)}
                          </p>
                        </div>
                        <span
                          className={cn(
                            'text-[10px] px-2 py-1 rounded-full font-bold uppercase tracking-wider border',
                            getContractStatusClass(contract.status),
                          )}
                        >
                          {contract.status}
                        </span>
                      </div>

                      <div className="mt-4 flex items-center justify-between gap-3 text-sm">
                        <span className="text-white/55">
                          {contract.total_amount.toFixed(2)} {contract.currency}
                        </span>
                        <span className="text-white/40">
                          {contract.end_date ? `Fin ${formatDate(contract.end_date)}` : 'Sin fecha final'}
                        </span>
                      </div>
                    </button>
                  ))}
          </div>
        </CollapsibleSection>

        <section className="space-y-6">
          {selectedContract ? (
            <>
              <CollapsibleSection
                title="Detalle del contrato"
                description="Consulta el acuerdo seleccionado, descarga el documento y revisa sus condiciones."
                summary={selectedContract.contract_number}
                storageKey="client-contracts-detail"
                defaultOpen
                actions={
                  <>
                    <button
                      type="button"
                      onClick={() => handleDownloadContract(selectedContract)}
                      className="glass-button-secondary"
                    >
                      <Download className="w-4 h-4" />
                      Descargar
                    </button>

                    {selectedContract.status === 'sent' ? (
                      <button
                        type="button"
                        onClick={() => void handleSignContract(selectedContract)}
                        disabled={signingContractId === selectedContract.id}
                        className="glass-button-primary disabled:opacity-50"
                      >
                        {signingContractId === selectedContract.id ? (
                          <>
                            <RefreshCw className="w-4 h-4 animate-spin" />
                            Firmando...
                          </>
                        ) : (
                          <>
                            <FileSignature className="w-4 h-4" />
                            Firmar
                          </>
                        )}
                      </button>
                    ) : null}
                  </>
                }
              >
                <div>
                  <p className="text-xs uppercase tracking-[0.2em] text-white/30 font-bold">
                    Contrato seleccionado
                  </p>
                  <h3 className="text-2xl font-bold mt-2">{selectedContract.contract_number}</h3>
                  <p className="text-sm text-white/50 mt-2">
                    {selectedContract.counterparty_name} ·{' '}
                    {selectedContract.counterparty_email || 'email pendiente'} ·{' '}
                    {selectedContract.total_amount.toFixed(2)} {selectedContract.currency}
                  </p>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-sm">
                  <div className="rounded-2xl border border-white/10 bg-white/5 p-4 space-y-2">
                    <p className="font-semibold">Resumen</p>
                    <p className="text-white/55">Estado: {selectedContract.status}</p>
                    <p className="text-white/55">
                      Vigencia: {formatDate(selectedContract.start_date)} a{' '}
                      {formatDate(selectedContract.end_date)}
                    </p>
                    <p className="text-white/55">
                      Condiciones de pago: {selectedContract.payment_terms}
                    </p>
                  </div>

                  <div className="rounded-2xl border border-white/10 bg-white/5 p-4 space-y-2">
                    <p className="font-semibold">Servicios incluidos</p>
                    {selectedContract.line_items.length > 0 ? (
                      selectedContract.line_items.map((lineItem) => (
                        <div key={lineItem.id} className="flex items-center justify-between gap-3 text-white/55">
                          <span>{lineItem.title}</span>
                          <span>
                            {lineItem.line_total.toFixed(2)} {selectedContract.currency}
                          </span>
                        </div>
                      ))
                    ) : (
                      <p className="text-white/45">No hay líneas detalladas registradas.</p>
                    )}
                  </div>
                </div>

                {selectedContract.scope_summary ? (
                  <div className="rounded-2xl border border-white/10 bg-white/5 p-4">
                    <p className="font-semibold">Alcance</p>
                    <p className="text-sm text-white/60 mt-2">{selectedContract.scope_summary}</p>
                  </div>
                ) : null}
              </CollapsibleSection>

              <CollapsibleSection
                title="Documento compartido"
                description="Texto contractual generado y compartido por la agencia."
                storageKey="client-contracts-document"
                defaultOpen={false}
              >
                <div className="rounded-2xl border border-white/10 bg-black/20 p-4">
                  <pre className="whitespace-pre-wrap text-sm leading-6 text-white/80 font-mono max-h-[360px] overflow-y-auto">
                    {selectedContract.generated_body}
                  </pre>
                </div>
              </CollapsibleSection>

              <CollapsibleSection
                title="Historial del contrato"
                description="Movimientos, revisiones y eventos visibles de este acuerdo."
                summary={eventsLoading ? 'Cargando' : `${events.length} registros`}
                storageKey="client-contracts-history"
                defaultOpen={false}
              >
                <div className="flex items-center justify-between gap-3">
                  <p className="font-semibold">Historial</p>
                  {eventsLoading ? <RefreshCw className="w-4 h-4 animate-spin text-white/45" /> : null}
                </div>

                <div className="space-y-3 max-h-[260px] overflow-y-auto">
                  {eventsLoading ? (
                    Array.from({ length: 3 }).map((_, index) => (
                      <div
                        key={`client-contract-event-${index}`}
                        className="h-16 rounded-2xl bg-white/5 animate-pulse"
                      />
                    ))
                  ) : events.length > 0 ? (
                    events.map((event) => (
                      <div key={event.id} className="rounded-2xl border border-white/10 bg-black/20 p-3">
                        <div className="flex items-start justify-between gap-3">
                          <div>
                            <p className="font-semibold text-sm">{event.title}</p>
                            <p className="text-xs text-white/40 mt-1">
                              {event.actor_name} · {formatDate(event.created_at)}
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
                      No hay movimientos visibles para este contrato todavía.
                    </p>
                  )}
                </div>
              </CollapsibleSection>
            </>
          ) : (
            <div className="glass-panel rounded-2xl border border-white/10 bg-white/5 p-6 text-white/45">
              Selecciona un contrato para ver su contenido.
            </div>
          )}
        </section>
      </div>
    </div>
  );
};
