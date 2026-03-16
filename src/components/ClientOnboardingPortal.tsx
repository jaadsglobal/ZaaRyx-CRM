import React, { useEffect, useRef, useState } from 'react';
import {
  CheckCircle2,
  ClipboardList,
  Clock3,
  Download,
  FileSignature,
  FileText,
  FileUp,
  LoaderCircle,
  RefreshCw,
  SendHorizontal,
} from 'lucide-react';
import {
  ClientOnboarding,
  ClientOnboardingDocument,
  ClientOnboardingForm,
  ClientPortalOnboarding,
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

const getOnboardingStatusLabel = (status: ClientOnboarding['status']) => {
  switch (status) {
    case 'pending':
      return 'Pendiente';
    case 'in_progress':
      return 'En marcha';
    case 'blocked':
      return 'Bloqueado';
    case 'completed':
      return 'Completado';
    default:
      return status;
  }
};

const getOnboardingStatusClasses = (status: ClientOnboarding['status']) => {
  switch (status) {
    case 'pending':
      return 'bg-white/10 text-white/60 border-white/10';
    case 'in_progress':
      return 'bg-brand-blue/20 text-brand-blue border-brand-blue/20';
    case 'blocked':
      return 'bg-red-500/10 text-red-400 border-red-500/20';
    case 'completed':
      return 'bg-green-500/10 text-green-400 border-green-500/20';
    default:
      return 'bg-white/10 text-white/60 border-white/10';
  }
};

const getContractStatusLabel = (status: Contract['status']) => {
  switch (status) {
    case 'draft':
      return 'Borrador';
    case 'review':
      return 'En revisión';
    case 'ready':
      return 'Listo';
    case 'sent':
      return 'Pendiente de firma';
    case 'signed':
      return 'Firmado';
    case 'archived':
      return 'Archivado';
    default:
      return status;
  }
};

const getContractStatusClasses = (status: Contract['status']) => {
  switch (status) {
    case 'signed':
      return 'bg-green-500/10 text-green-300 border-green-500/20';
    case 'sent':
      return 'bg-brand-cyan/20 text-brand-cyan border-brand-cyan/20';
    case 'ready':
    case 'review':
      return 'bg-amber-500/10 text-amber-300 border-amber-500/20';
    case 'draft':
    case 'archived':
    default:
      return 'bg-white/10 text-white/60 border-white/10';
  }
};

const getStepStatusLabel = (status: ClientOnboarding['steps'][number]['status']) => {
  switch (status) {
    case 'pending':
      return 'Pendiente';
    case 'in_progress':
      return 'En curso';
    case 'completed':
      return 'Completado';
    default:
      return status;
  }
};

const getStepStatusIcon = (status: ClientOnboarding['steps'][number]['status']) => {
  switch (status) {
    case 'completed':
      return <CheckCircle2 className="w-4 h-4 text-green-400" />;
    case 'in_progress':
      return <Clock3 className="w-4 h-4 text-brand-blue" />;
    case 'pending':
    default:
      return <ClipboardList className="w-4 h-4 text-white/35" />;
  }
};

const getFormStatusLabel = (form: ClientOnboardingForm | null) => {
  if (!form) {
    return 'Pendiente';
  }

  return form.status === 'submitted' ? 'Enviado' : 'Borrador';
};

const getFormStatusClasses = (form: ClientOnboardingForm | null) => {
  if (!form) {
    return 'bg-white/10 text-white/60 border-white/10';
  }

  return form.status === 'submitted'
    ? 'bg-green-500/10 text-green-300 border-green-500/20'
    : 'bg-amber-500/10 text-amber-300 border-amber-500/20';
};

const formatDate = (value?: string | null) => {
  if (!value) {
    return 'Pendiente';
  }

  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? value : date.toLocaleDateString('es-ES');
};

const formatFileSize = (size: number) => {
  if (size < 1024) {
    return `${size} B`;
  }

  if (size < 1024 * 1024) {
    return `${(size / 1024).toFixed(1)} KB`;
  }

  return `${(size / (1024 * 1024)).toFixed(1)} MB`;
};

const formatCurrency = (amount: number, currency: Contract['currency'] = 'EUR') =>
  new Intl.NumberFormat('es-ES', {
    style: 'currency',
    currency,
    maximumFractionDigits: 0,
  }).format(amount || 0);

const readFileAsDataUrl = (file: File) =>
  new Promise<string>((resolve, reject) => {
    const reader = new FileReader();

    reader.onload = () => {
      if (typeof reader.result === 'string') {
        resolve(reader.result);
        return;
      }

      reject(new Error('No se pudo leer el archivo.'));
    };

    reader.onerror = () => reject(new Error('No se pudo leer el archivo.'));
    reader.readAsDataURL(file);
  });

const initialBriefingForm = {
  advertising_accesses: '',
  business_goals: '',
  target_audience: '',
  competition: '',
  ad_budget: '',
};

export const ClientOnboardingPortal: React.FC = () => {
  const [portal, setPortal] = useState<ClientPortalOnboarding | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [savingBriefing, setSavingBriefing] = useState<'save' | 'submit' | null>(null);
  const [signingContract, setSigningContract] = useState(false);
  const [feedbackMessage, setFeedbackMessage] = useState<string | null>(null);
  const [feedbackTone, setFeedbackTone] = useState<'success' | 'error'>('success');
  const [selectedStepId, setSelectedStepId] = useState('');
  const [documentTitle, setDocumentTitle] = useState('');
  const [documentNotes, setDocumentNotes] = useState('');
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [briefingForm, setBriefingForm] = useState(initialBriefingForm);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

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
      const response = await fetch('/api/client-portal/onboarding');
      const data = await getResponseJson<ClientPortalOnboarding>(response);
      setPortal(data);
    } catch (error) {
      console.error('Error loading client onboarding portal:', error);
      setMessage('No se pudo cargar el onboarding.', 'error');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  useEffect(() => {
    void loadPortal();
  }, []);

  useEffect(() => {
    const form = portal?.briefing_form;

    setBriefingForm({
      advertising_accesses: form?.advertising_accesses || '',
      business_goals: form?.business_goals || '',
      target_audience: form?.target_audience || '',
      competition: form?.competition || '',
      ad_budget: form?.ad_budget ? String(form.ad_budget) : '',
    });
  }, [portal?.briefing_form?.id, portal?.briefing_form?.updated_at]);

  const handleSignContract = async () => {
    const contract = portal?.primary_contract;

    if (!contract) {
      setMessage('Tu agencia todavía no ha publicado el contrato para firmar.', 'error');
      return;
    }

    if (contract.status !== 'sent') {
      setMessage('Este contrato no está pendiente de firma en este momento.', 'error');
      return;
    }

    if (!window.confirm(`Vas a firmar digitalmente ${contract.contract_number}. ¿Continuar?`)) {
      return;
    }

    setSigningContract(true);

    try {
      await getResponseJson<Contract>(
        await fetch(`/api/client-portal/contracts/${contract.id}/sign`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
        }),
      );
      await loadPortal(true);
      setMessage('Contrato firmado digitalmente. El onboarding ya puede avanzar.');
    } catch (error) {
      console.error('Error signing contract:', error);
      setMessage('No se pudo firmar el contrato.', 'error');
    } finally {
      setSigningContract(false);
    }
  };

  const handleSaveBriefing = async (action: 'save' | 'submit') => {
    if (!portal?.onboarding) {
      setMessage('Tu onboarding todavía no está abierto.', 'error');
      return;
    }

    if (action === 'submit' && portal.primary_contract?.status !== 'signed') {
      setMessage('Firma primero el contrato para enviar el formulario.', 'error');
      return;
    }

    setSavingBriefing(action);

    try {
      const response = await fetch('/api/client-portal/onboarding/form', {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          action,
          advertising_accesses: briefingForm.advertising_accesses,
          business_goals: briefingForm.business_goals,
          target_audience: briefingForm.target_audience,
          competition: briefingForm.competition,
          ad_budget: Number(briefingForm.ad_budget || 0),
        }),
      });

      const updatedPortal = await getResponseJson<ClientPortalOnboarding>(response);
      setPortal(updatedPortal);
      setMessage(
        action === 'submit'
          ? 'Formulario de onboarding enviado correctamente.'
          : 'Borrador del formulario guardado.',
      );
    } catch (error) {
      console.error('Error saving onboarding briefing:', error);
      setMessage(
        action === 'submit'
          ? 'No se pudo enviar el formulario.'
          : 'No se pudo guardar el borrador.',
        'error',
      );
    } finally {
      setSavingBriefing(null);
    }
  };

  const handleUploadDocument = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();

    if (!portal?.onboarding) {
      setMessage('Tu onboarding todavía no está abierto.', 'error');
      return;
    }

    if (!selectedFile) {
      setMessage('Selecciona un archivo antes de enviarlo.', 'error');
      return;
    }

    setUploading(true);

    try {
      const fileDataUrl = await readFileAsDataUrl(selectedFile);
      const response = await fetch('/api/client-portal/onboarding/documents', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          step_id: selectedStepId ? Number(selectedStepId) : null,
          title: documentTitle.trim() || selectedFile.name,
          notes: documentNotes.trim() || null,
          file_name: selectedFile.name,
          file_type: selectedFile.type || 'application/octet-stream',
          file_size: selectedFile.size,
          file_data_url: fileDataUrl,
        }),
      });

      const document = await getResponseJson<ClientOnboardingDocument>(response);
      setPortal((current) =>
        current
          ? {
              ...current,
              documents: [document, ...current.documents],
            }
          : current,
      );
      setSelectedFile(null);
      setSelectedStepId('');
      setDocumentTitle('');
      setDocumentNotes('');
      if (fileInputRef.current) {
        fileInputRef.current.value = '';
      }
      setMessage('Documentación enviada correctamente.');
    } catch (error) {
      console.error('Error uploading onboarding document:', error);
      setMessage('No se pudo enviar la documentación.', 'error');
    } finally {
      setUploading(false);
    }
  };

  const handleDownloadDocument = (fileDocument: ClientOnboardingDocument) => {
    triggerClientDownload(fileDocument.file_data_url, fileDocument.file_name);
    setMessage(`Descarga iniciada para ${fileDocument.file_name}.`);
  };

  const onboarding = portal?.onboarding || null;
  const documents = portal?.documents || [];
  const primaryContract = portal?.primary_contract || null;
  const briefing = portal?.briefing_form || null;
  const steps = onboarding?.steps || [];
  const checklistSteps = steps.filter(
    (step) =>
      !['firma de contrato digital', 'formulario de onboarding'].includes(
        step.title.trim().toLowerCase(),
      ),
  );
  const contractSigned = primaryContract?.status === 'signed';
  const isBriefingSubmitted = briefing?.status === 'submitted';
  const canSubmitBriefing =
    Boolean(
      contractSigned &&
        briefingForm.advertising_accesses.trim() &&
        briefingForm.business_goals.trim() &&
        briefingForm.target_audience.trim() &&
        briefingForm.competition.trim() &&
        Number(briefingForm.ad_budget || 0) > 0,
    );

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
          <h2 className="text-3xl font-bold">Onboarding</h2>
          <p className="text-white/50">
            Firma tu contrato, completa el briefing inicial y sigue el checklist operativo de tu cuenta.
          </p>
        </div>

        <button
          type="button"
          onClick={() => void loadPortal(true)}
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
        title="Resumen de onboarding"
        description="Vista rápida del estado de tu contrato, el avance operativo y la documentación compartida."
        storageKey="client-onboarding-summary"
        defaultOpen
      >
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-6">
          <InteractiveSummaryCard
            label="Cliente"
            value={portal?.client.company || '...'}
            hint="Ir a firma y briefing"
            icon={FileSignature}
            onClick={() => scrollToSection('client-onboarding-contract-section')}
          />
          <InteractiveSummaryCard
            label="Estado"
            value={
              onboarding ? (
                <span
                  className={cn(
                    'inline-flex text-[10px] px-2 py-1 rounded-full font-bold uppercase tracking-wider border',
                    getOnboardingStatusClasses(onboarding.status),
                  )}
                >
                  {getOnboardingStatusLabel(onboarding.status)}
                </span>
              ) : (
                'Pendiente de apertura'
              )
            }
            hint="Ir al estado operativo"
            icon={Clock3}
            onClick={() => scrollToSection('client-onboarding-checklist-section')}
          />
          <InteractiveSummaryCard
            label="Progreso"
            value={`${onboarding?.progress || 0}%`}
            hint="Ir al checklist automático"
            icon={ClipboardList}
            onClick={() => scrollToSection('client-onboarding-checklist-section')}
          />
          <InteractiveSummaryCard
            label="Documentos enviados"
            value={documents.length}
            hint="Ir a documentación compartida"
            icon={FileText}
            onClick={() => scrollToSection('client-onboarding-documents-section')}
          />
        </div>
      </CollapsibleSection>

      {loading ? (
        <div className="glass-panel p-8 flex items-center justify-center gap-3 text-white/50">
          <LoaderCircle className="w-5 h-5 animate-spin" />
          Cargando onboarding...
        </div>
      ) : onboarding ? (
        <>
          <section className="grid grid-cols-1 xl:grid-cols-2 gap-6">
            <div id="client-onboarding-contract-section">
              <CollapsibleSection
                title="Paso 1 · Firma de contrato digital"
                description="Valida el acuerdo comercial para desbloquear el onboarding operativo."
                icon={<FileSignature className="w-5 h-5" />}
                summary={primaryContract ? getContractStatusLabel(primaryContract.status) : 'Pendiente'}
                storageKey="client-onboarding-contract"
                defaultOpen
              >
                {primaryContract ? (
                  <>
                    <div className="rounded-2xl border border-white/10 bg-white/5 p-4 space-y-3">
                      <div className="flex flex-wrap items-center justify-between gap-3">
                        <div>
                          <p className="font-semibold">{primaryContract.contract_number}</p>
                          <p className="text-sm text-white/45 mt-1">
                            {primaryContract.counterparty_email || 'email pendiente'} ·{' '}
                            {formatCurrency(primaryContract.total_amount, primaryContract.currency)}
                          </p>
                        </div>
                        <span
                          className={cn(
                            'px-3 py-1 rounded-full border text-[10px] uppercase tracking-wider font-bold',
                            getContractStatusClasses(primaryContract.status),
                          )}
                        >
                          {getContractStatusLabel(primaryContract.status)}
                        </span>
                      </div>

                      <div className="text-sm text-white/55 space-y-1">
                        <p>Inicio: {formatDate(primaryContract.start_date)}</p>
                        <p>Fin: {formatDate(primaryContract.end_date)}</p>
                        <p>
                          Canal de firma:{' '}
                          {primaryContract.signature_integration_name || 'Firma digital interna'}
                        </p>
                      </div>
                    </div>

                    <div className="flex flex-wrap gap-3">
                      <button
                        type="button"
                        onClick={() =>
                          primaryContract.document_url
                            ? triggerClientDownload(
                                primaryContract.document_url,
                                `${primaryContract.contract_number}.txt`,
                              )
                            : setMessage(
                                'Este contrato todavía no tiene documento descargable.',
                                'error',
                              )
                        }
                        className="glass-button-secondary"
                      >
                        <Download className="w-4 h-4" />
                        Descargar contrato
                      </button>

                      {primaryContract.status === 'sent' ? (
                        <button
                          type="button"
                          onClick={() => void handleSignContract()}
                          disabled={signingContract}
                          className="glass-button-primary disabled:opacity-50"
                        >
                          {signingContract ? (
                            <>
                              <LoaderCircle className="w-4 h-4 animate-spin" />
                              Firmando...
                            </>
                          ) : (
                            <>
                              <FileSignature className="w-4 h-4" />
                              Firmar digitalmente
                            </>
                          )}
                        </button>
                      ) : primaryContract.status === 'signed' ? (
                        <div className="glass-input text-sm text-emerald-300">
                          Contrato firmado el {formatDate(primaryContract.signed_at)}.
                        </div>
                      ) : (
                        <div className="glass-input text-sm text-white/45">
                          La agencia todavía no ha enviado este contrato para firma.
                        </div>
                      )}
                    </div>
                  </>
                ) : (
                  <div className="glass-input text-sm text-white/45">
                    Tu agencia todavía no ha cargado el contrato inicial en el portal.
                  </div>
                )}
              </CollapsibleSection>
            </div>

            <div id="client-onboarding-briefing-section">
              <CollapsibleSection
                title="Paso 2 · Formulario de onboarding"
                description="Comparte la información comercial y operativa para construir la estrategia inicial."
                icon={<FileText className="w-5 h-5" />}
                summary={getFormStatusLabel(briefing)}
                storageKey="client-onboarding-briefing"
                defaultOpen
              >
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <span
                    className={cn(
                      'px-3 py-1 rounded-full border text-[10px] uppercase tracking-wider font-bold',
                      getFormStatusClasses(briefing),
                    )}
                  >
                    {getFormStatusLabel(briefing)}
                  </span>

                  {briefing?.submitted_at ? (
                    <span className="text-xs text-white/40">
                      Enviado el {formatDate(briefing.submitted_at)}
                    </span>
                  ) : null}
                </div>

                <div className="grid grid-cols-1 gap-4">
                  <textarea
                    value={briefingForm.advertising_accesses}
                    onChange={(event) =>
                      setBriefingForm((current) => ({
                        ...current,
                        advertising_accesses: event.target.value,
                      }))
                    }
                    className="w-full glass-input min-h-[96px]"
                    placeholder="Accesos publicitarios: Meta Ads, Google Ads, Business Manager, GTM, GA4..."
                  />

                  <textarea
                    value={briefingForm.business_goals}
                    onChange={(event) =>
                      setBriefingForm((current) => ({
                        ...current,
                        business_goals: event.target.value,
                      }))
                    }
                    className="w-full glass-input min-h-[96px]"
                    placeholder="Objetivos del negocio: ventas, leads, CAC objetivo, ticket medio, plazos..."
                  />

                  <textarea
                    value={briefingForm.target_audience}
                    onChange={(event) =>
                      setBriefingForm((current) => ({
                        ...current,
                        target_audience: event.target.value,
                      }))
                    }
                    className="w-full glass-input min-h-[96px]"
                    placeholder="Público objetivo: buyer persona, ubicaciones, segmentos, objeciones..."
                  />

                  <textarea
                    value={briefingForm.competition}
                    onChange={(event) =>
                      setBriefingForm((current) => ({
                        ...current,
                        competition: event.target.value,
                      }))
                    }
                    className="w-full glass-input min-h-[96px]"
                    placeholder="Competencia: principales competidores, referencias, mensajes y ventajas..."
                  />

                  <input
                    type="number"
                    min="0"
                    step="50"
                    value={briefingForm.ad_budget}
                    onChange={(event) =>
                      setBriefingForm((current) => ({
                        ...current,
                        ad_budget: event.target.value,
                      }))
                    }
                    className="w-full glass-input"
                    placeholder="Presupuesto publicitario mensual"
                  />
                </div>

                {!contractSigned ? (
                  <div className="glass-input text-sm text-white/45">
                    La firma del contrato desbloquea el envío final del formulario. Mientras tanto,
                    puedes guardar el briefing como borrador.
                  </div>
                ) : null}

                <div className="flex flex-wrap gap-3">
                  <button
                    type="button"
                    onClick={() => void handleSaveBriefing('save')}
                    disabled={savingBriefing !== null}
                    className="glass-button-secondary disabled:opacity-50"
                  >
                    {savingBriefing === 'save' ? (
                      <>
                        <LoaderCircle className="w-4 h-4 animate-spin" />
                        Guardando...
                      </>
                    ) : (
                      <>
                        <ClipboardList className="w-4 h-4" />
                        Guardar borrador
                      </>
                    )}
                  </button>

                  <button
                    type="button"
                    onClick={() => void handleSaveBriefing('submit')}
                    disabled={savingBriefing !== null || !canSubmitBriefing}
                    className="glass-button-primary disabled:opacity-50"
                  >
                    {savingBriefing === 'submit' ? (
                      <>
                        <LoaderCircle className="w-4 h-4 animate-spin" />
                        Enviando...
                      </>
                    ) : (
                      <>
                        <SendHorizontal className="w-4 h-4" />
                        Enviar formulario
                      </>
                    )}
                  </button>
                </div>
              </CollapsibleSection>
            </div>
          </section>

          <div id="client-onboarding-checklist-section">
            <CollapsibleSection
              title="Paso 3 · Checklist automático de la agencia"
              description="Tu equipo ejecuta esta fase internamente: auditoría, estrategia, campañas, tracking, CRM y automatizaciones."
              icon={<ClipboardList className="w-5 h-5" />}
              summary={`${onboarding.completed_steps}/${onboarding.total_steps} hitos`}
              storageKey="client-onboarding-checklist"
              defaultOpen={false}
            >
              <div className="h-3 rounded-full bg-white/5 overflow-hidden">
                <div
                  className="h-full rounded-full bg-gradient-to-r from-brand-blue via-brand-cyan to-emerald-400 transition-all"
                  style={{ width: `${onboarding.progress}%` }}
                />
              </div>

              {!contractSigned || !isBriefingSubmitted ? (
                <div className="rounded-2xl border border-white/10 bg-white/5 p-4 text-sm text-white/45">
                  La fase operativa se desbloquea cuando el contrato está firmado y el formulario de
                  onboarding está enviado.
                </div>
              ) : null}

              <div className="grid grid-cols-1 xl:grid-cols-2 gap-4">
                {checklistSteps.length > 0 ? (
                  checklistSteps.map((step) => (
                    <div
                      key={step.id}
                      className="rounded-2xl border border-white/10 bg-white/5 p-5 space-y-4"
                    >
                      <div className="flex items-start justify-between gap-3">
                        <div>
                          <p className="font-semibold">{step.title}</p>
                          <p className="text-sm text-white/45 mt-1">{step.description}</p>
                        </div>
                        <div className="flex items-center gap-2 text-sm text-white/50">
                          {getStepStatusIcon(step.status)}
                          <span>{getStepStatusLabel(step.status)}</span>
                        </div>
                      </div>

                      <div className="flex flex-wrap items-center justify-between gap-3 text-sm">
                        <span className="text-white/40">
                          Fecha objetivo: {formatDate(step.due_date)}
                        </span>
                        <span className="px-3 py-1 rounded-full border border-white/10 bg-black/20 text-white/50 text-[11px] uppercase tracking-wider">
                          Gestionado por agencia
                        </span>
                      </div>
                    </div>
                  ))
                ) : (
                  <div className="rounded-2xl border border-white/10 bg-white/5 p-5 text-white/45 xl:col-span-2">
                    La agencia todavía no ha generado el checklist operativo para esta cuenta.
                  </div>
                )}
              </div>
            </CollapsibleSection>
          </div>

          <div id="client-onboarding-documents-section">
            <CollapsibleSection
              title="Documentación compartida"
              description="Sube archivos para la agencia y consulta todo lo que ya se ha entregado en esta cuenta."
              icon={<FileUp className="w-5 h-5" />}
              summary={`${documents.length} archivos`}
              storageKey="client-onboarding-documents"
              defaultOpen={false}
            >
              <div className="grid grid-cols-1 xl:grid-cols-[0.95fr_1.05fr] gap-6">
                <form onSubmit={handleUploadDocument} className="space-y-4">
                  <div>
                    <h3 className="text-lg font-bold">Enviar documentación</h3>
                    <p className="text-sm text-white/45 mt-1">
                      Sube contratos firmados, accesos, briefings, creatividades o cualquier archivo que te pida la agencia.
                    </p>
                  </div>

                  <select
                    value={selectedStepId}
                    onChange={(event) => setSelectedStepId(event.target.value)}
                    className="w-full glass-input"
                  >
                    <option value="">Documento general del onboarding</option>
                    {steps.map((step) => (
                      <option key={step.id} value={step.id}>
                        {step.title}
                      </option>
                    ))}
                  </select>

                  <input
                    value={documentTitle}
                    onChange={(event) => setDocumentTitle(event.target.value)}
                    className="w-full glass-input"
                    placeholder="Título interno del documento"
                  />

                  <textarea
                    value={documentNotes}
                    onChange={(event) => setDocumentNotes(event.target.value)}
                    className="w-full glass-input min-h-[120px]"
                    placeholder="Notas o contexto para la agencia"
                  />

                  <label className="block rounded-2xl border border-dashed border-white/15 bg-white/5 p-5">
                    <span className="flex items-center gap-2 font-semibold">
                      <FileUp className="w-4 h-4 text-brand-cyan" />
                      Seleccionar archivo
                    </span>
                    <input
                      ref={fileInputRef}
                      type="file"
                      onChange={(event) => setSelectedFile(event.target.files?.[0] || null)}
                      className="sr-only"
                    />
                    <p className="text-sm text-white/45 mt-2">
                      {selectedFile
                        ? `${selectedFile.name} · ${formatFileSize(selectedFile.size)}`
                        : 'PDF, imágenes, hojas de cálculo o cualquier documento necesario.'}
                    </p>
                  </label>

                  <button
                    type="submit"
                    disabled={uploading || !selectedFile}
                    className="glass-button-primary disabled:opacity-50"
                  >
                    {uploading ? (
                      <>
                        <LoaderCircle className="w-4 h-4 animate-spin" />
                        Enviando...
                      </>
                    ) : (
                      <>
                        <FileUp className="w-4 h-4" />
                        Enviar documentación
                      </>
                    )}
                  </button>
                </form>

                <div className="space-y-4">
                  <div className="flex items-center justify-between gap-3">
                    <div>
                      <h3 className="text-lg font-bold">Documentos compartidos</h3>
                      <p className="text-sm text-white/45 mt-1">
                        Todo lo que ya has enviado durante el onboarding.
                      </p>
                    </div>
                    <span className="text-sm text-white/40">{documents.length} archivos</span>
                  </div>

                  <div className="space-y-3 max-h-[520px] overflow-y-auto pr-1">
                    {documents.length === 0 ? (
                      <div className="rounded-2xl border border-white/10 bg-white/5 p-5 text-white/45">
                        Todavía no has subido documentación.
                      </div>
                    ) : (
                      documents.map((document) => (
                        <div
                          key={document.id}
                          className="rounded-2xl border border-white/10 bg-white/5 p-4 space-y-3"
                        >
                          <div className="flex items-start justify-between gap-3">
                            <div>
                              <p className="font-semibold">{document.title}</p>
                              <p className="text-sm text-white/45 mt-1">
                                {document.step_title || 'Documento general'} ·{' '}
                                {formatFileSize(document.file_size)}
                              </p>
                            </div>
                            <button
                              type="button"
                              onClick={() => handleDownloadDocument(document)}
                              className="glass-button-secondary"
                            >
                              <Download className="w-4 h-4" />
                              Descargar
                            </button>
                          </div>

                          <div className="text-sm text-white/45">
                            <p>Archivo: {document.file_name}</p>
                            <p>Subido: {formatDate(document.created_at)}</p>
                            {document.notes ? (
                              <p className="mt-2 text-white/60">{document.notes}</p>
                            ) : null}
                          </div>
                        </div>
                      ))
                    )}
                  </div>
                </div>
              </div>
            </CollapsibleSection>
          </div>
        </>
      ) : (
        <div className="glass-panel p-8 text-center space-y-3">
          <h3 className="text-xl font-bold">Onboarding pendiente de apertura</h3>
          <p className="text-white/45">
            Tu agencia todavía no ha activado el onboarding para esta cuenta. Cuando lo haga,
            aquí verás la firma, el formulario inicial y el checklist operativo.
          </p>
        </div>
      )}
    </div>
  );
};
