import React, { useEffect, useState } from 'react';
import {
  Activity,
  Bell,
  Bot,
  Building2,
  Download,
  RefreshCw,
  RotateCcw,
  Search,
  Save,
  Shield,
} from 'lucide-react';
import {
  AppSettings,
  AuditLog,
  ProductionReadinessReport,
  TwoFactorRecoveryCodesResponse,
  TwoFactorSetupResponse,
  TwoFactorStatus,
  cn,
} from '../types';
import { triggerClientDownload } from '../lib/download';
import { CollapsibleSection } from './CollapsibleSection';

const getResponseJson = async <T,>(response: Response): Promise<T> => {
  if (!response.ok) {
    const errorData = (await response.json().catch(() => null)) as { error?: string } | null;
    throw new Error(errorData?.error || `Request failed with status ${response.status}`);
  }

  return response.json() as Promise<T>;
};

const formatAuditDate = (value: string) => {
  const parsedDate = new Date(value);

  if (Number.isNaN(parsedDate.getTime())) {
    return value;
  }

  return parsedDate.toLocaleString('es-ES', {
    day: '2-digit',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
  });
};

const getAuditActionLabel = (action: string) =>
  action
    .split('.')
    .map((segment) => segment.charAt(0).toUpperCase() + segment.slice(1))
    .join(' / ');

const getAuditActionColor = (action: string) => {
  if (action.startsWith('auth.')) {
    return 'bg-blue-500/10 text-blue-300 border-blue-500/20';
  }

  if (action.startsWith('settings.')) {
    return 'bg-amber-500/10 text-amber-300 border-amber-500/20';
  }

  if (action.startsWith('team.')) {
    return 'bg-cyan-500/10 text-cyan-300 border-cyan-500/20';
  }

  if (action.startsWith('ai.')) {
    return 'bg-fuchsia-500/10 text-fuchsia-300 border-fuchsia-500/20';
  }

  if (action.startsWith('client.') || action.startsWith('lead.')) {
    return 'bg-emerald-500/10 text-emerald-300 border-emerald-500/20';
  }

  if (action.startsWith('project.') || action.startsWith('task.')) {
    return 'bg-violet-500/10 text-violet-300 border-violet-500/20';
  }

  return 'bg-white/10 text-white/60 border-white/10';
};

const formatAuditMetadataValue = (value: unknown) => {
  if (typeof value === 'boolean') {
    return value ? 'Sí' : 'No';
  }

  if (typeof value === 'number') {
    return String(value);
  }

  if (typeof value === 'string') {
    return value;
  }

  return null;
};

const getReadinessTone = (status: 'ready' | 'warning' | 'critical') => {
  if (status === 'ready') {
    return 'text-green-400 border-green-500/20 bg-green-500/10';
  }

  if (status === 'warning') {
    return 'text-yellow-300 border-yellow-500/20 bg-yellow-500/10';
  }

  return 'text-red-400 border-red-500/20 bg-red-500/10';
};

const getReadinessLabel = (status: 'ready' | 'warning' | 'critical') => {
  if (status === 'ready') {
    return 'Listo';
  }

  if (status === 'warning') {
    return 'Revisar';
  }

  return 'Crítico';
};

const createDefaultSettings = (): AppSettings => ({
  agency_name: 'ZaaRyx Global',
  subscription_plan: 'pro',
  timezone: 'Europe/Madrid',
  currency: 'EUR',
  email_reports: true,
  task_reminders: true,
  invoice_alerts: true,
  weekly_digest: false,
  two_factor: false,
  login_alerts: true,
  session_timeout: '2h',
  ai_trigger_new_lead: false,
  ai_trigger_client_report: false,
  ai_trigger_project_task_pack: false,
});

export const SettingsManager: React.FC = () => {
  const [settings, setSettings] = useState<AppSettings>(createDefaultSettings());
  const [auditLogs, setAuditLogs] = useState<AuditLog[]>([]);
  const [twoFactorStatus, setTwoFactorStatus] = useState<TwoFactorStatus | null>(null);
  const [twoFactorSetup, setTwoFactorSetup] = useState<TwoFactorSetupResponse | null>(null);
  const [twoFactorCodes, setTwoFactorCodes] = useState<string[]>([]);
  const [productionReadiness, setProductionReadiness] = useState<ProductionReadinessReport | null>(
    null,
  );
  const [loading, setLoading] = useState(true);
  const [auditLoading, setAuditLoading] = useState(true);
  const [twoFactorLoading, setTwoFactorLoading] = useState(true);
  const [readinessLoading, setReadinessLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [resetting, setResetting] = useState(false);
  const [refreshingAudit, setRefreshingAudit] = useState(false);
  const [refreshingReadiness, setRefreshingReadiness] = useState(false);
  const [twoFactorBusy, setTwoFactorBusy] = useState<
    'setup' | 'confirm' | 'disable' | 'regenerate' | 'copy' | 'download' | null
  >(null);
  const [auditQuery, setAuditQuery] = useState('');
  const [auditActionFilter, setAuditActionFilter] = useState('all');
  const [changingPassword, setChangingPassword] = useState(false);
  const [passwordForm, setPasswordForm] = useState({
    currentPassword: '',
    newPassword: '',
    confirmPassword: '',
  });
  const [twoFactorForm, setTwoFactorForm] = useState({
    setupCode: '',
    currentPassword: '',
    securityCode: '',
  });
  const [feedbackMessage, setFeedbackMessage] = useState<string | null>(null);
  const [feedbackTone, setFeedbackTone] = useState<'success' | 'error'>('success');

  const setMessage = (message: string, tone: 'success' | 'error' = 'success') => {
    setFeedbackTone(tone);
    setFeedbackMessage(message);
  };

  const loadSettings = async () => {
    try {
      const response = await fetch('/api/settings');
      const data = await getResponseJson<AppSettings>(response);
      setSettings(data);
    } catch (error) {
      console.error('Error fetching settings:', error);
      setMessage('No se pudieron cargar los ajustes.', 'error');
    } finally {
      setLoading(false);
    }
  };

  const loadAuditLogs = async ({
    background = false,
    silent = false,
  }: {
    background?: boolean;
    silent?: boolean;
  } = {}) => {
    if (background) {
      setRefreshingAudit(true);
    } else {
      setAuditLoading(true);
    }

    try {
      const response = await fetch('/api/audit-logs?limit=120');
      const data = await getResponseJson<AuditLog[]>(response);
      setAuditLogs(data);

      if (background && !silent) {
        setMessage('Auditoría actualizada.');
      }
    } catch (error) {
      console.error('Error fetching audit logs:', error);

      if (!silent) {
        setMessage('No se pudo cargar la auditoría de actividad.', 'error');
      }
    } finally {
      if (background) {
        setRefreshingAudit(false);
      } else {
        setAuditLoading(false);
      }
    }
  };

  const loadTwoFactorStatus = async ({
    silent = false,
  }: {
    silent?: boolean;
  } = {}) => {
    try {
      const response = await fetch('/api/auth/2fa/status');
      const data = await getResponseJson<TwoFactorStatus>(response);
      setTwoFactorStatus(data);

      if (!data.pending_setup) {
        setTwoFactorSetup(null);
      }
    } catch (error) {
      console.error('Error fetching 2FA status:', error);

      if (!silent) {
        setMessage('No se pudo cargar el estado del 2FA.', 'error');
      }
    } finally {
      setTwoFactorLoading(false);
    }
  };

  const loadProductionReadiness = async ({
    background = false,
    silent = false,
  }: {
    background?: boolean;
    silent?: boolean;
  } = {}) => {
    if (background) {
      setRefreshingReadiness(true);
    } else {
      setReadinessLoading(true);
    }

    try {
      const response = await fetch('/api/settings/production-readiness');
      const data = await getResponseJson<ProductionReadinessReport>(response);
      setProductionReadiness(data);

      if (background && !silent) {
        setMessage('Checklist de producción actualizada.');
      }
    } catch (error) {
      console.error('Error fetching production readiness:', error);

      if (!silent) {
        setMessage('No se pudo cargar la checklist de producción.', 'error');
      }
    } finally {
      if (background) {
        setRefreshingReadiness(false);
      } else {
        setReadinessLoading(false);
      }
    }
  };

  useEffect(() => {
    void loadSettings();
    void loadAuditLogs({ silent: true });
    void loadTwoFactorStatus({ silent: true });
    void loadProductionReadiness({ silent: true });
  }, []);

  const handleSave = async () => {
    setSaving(true);

    try {
      const response = await fetch('/api/settings', {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(settings),
      });

      const savedSettings = await getResponseJson<AppSettings>(response);
      setSettings(savedSettings);
      setMessage('Ajustes guardados correctamente.');
      void loadAuditLogs({ background: true, silent: true });
      void loadProductionReadiness({ background: true, silent: true });
    } catch (error) {
      console.error('Error saving settings:', error);
      setMessage('No se pudieron guardar los ajustes.', 'error');
    } finally {
      setSaving(false);
    }
  };

  const handleReset = async () => {
    setResetting(true);

    try {
      const response = await fetch('/api/settings/reset', {
        method: 'POST',
      });

      const resetSettings = await getResponseJson<AppSettings>(response);
      setSettings(resetSettings);
      setMessage('Ajustes restablecidos a valores por defecto.');
      void loadAuditLogs({ background: true, silent: true });
      void loadProductionReadiness({ background: true, silent: true });
    } catch (error) {
      console.error('Error resetting settings:', error);
      setMessage('No se pudieron restablecer los ajustes.', 'error');
    } finally {
      setResetting(false);
    }
  };

  const handleDownloadSnapshot = () => {
    const blob = new Blob([JSON.stringify(settings, null, 2)], {
      type: 'application/json',
    });
    const url = URL.createObjectURL(blob);
    triggerClientDownload(url, 'zaaryx-settings.json', () => URL.revokeObjectURL(url));
    setMessage('Copia de ajustes descargada.');
  };

  const handleDownloadAudit = () => {
    const blob = new Blob([JSON.stringify(filteredAuditLogs, null, 2)], {
      type: 'application/json',
    });
    const url = URL.createObjectURL(blob);
    triggerClientDownload(url, 'zaaryx-audit-log.json', () => URL.revokeObjectURL(url));
    setMessage('Auditoría descargada.');
  };

  const handleChangePassword = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();

    if (!passwordForm.currentPassword) {
      setMessage('Introduce tu contraseña actual.', 'error');
      return;
    }

    if (passwordForm.newPassword.length < 8) {
      setMessage('La nueva contraseña debe tener al menos 8 caracteres.', 'error');
      return;
    }

    if (passwordForm.newPassword !== passwordForm.confirmPassword) {
      setMessage('Las nuevas contraseñas no coinciden.', 'error');
      return;
    }

    setChangingPassword(true);

    try {
      const response = await fetch('/api/auth/password/change', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          current_password: passwordForm.currentPassword,
          new_password: passwordForm.newPassword,
        }),
      });

      await getResponseJson<{ success: boolean }>(response);
      setPasswordForm({
        currentPassword: '',
        newPassword: '',
        confirmPassword: '',
      });
      setMessage('Contraseña actualizada. El resto de sesiones anteriores quedaron revocadas.');
      void loadAuditLogs({ background: true, silent: true });
    } catch (error) {
      console.error('Error changing password:', error);
      setMessage(
        error instanceof Error ? error.message : 'No se pudo actualizar la contraseña.',
        'error',
      );
    } finally {
      setChangingPassword(false);
    }
  };

  const handleStartTwoFactorSetup = async () => {
    setTwoFactorBusy('setup');

    try {
      const response = await fetch('/api/auth/2fa/setup', {
        method: 'POST',
      });

      const data = await getResponseJson<TwoFactorSetupResponse>(response);
      setTwoFactorSetup(data);
      setTwoFactorStatus(data);
      setTwoFactorCodes([]);
      setTwoFactorForm((current) => ({
        ...current,
        setupCode: '',
      }));
      setMessage('Escanea el QR y confirma con el primer código de tu app.');
      void loadAuditLogs({ background: true, silent: true });
    } catch (error) {
      console.error('Error starting 2FA setup:', error);
      setMessage(
        error instanceof Error ? error.message : 'No se pudo preparar el 2FA.',
        'error',
      );
    } finally {
      setTwoFactorBusy(null);
    }
  };

  const handleConfirmTwoFactorSetup = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();

    if (!twoFactorForm.setupCode.trim()) {
      setMessage('Introduce el código generado por tu app autenticadora.', 'error');
      return;
    }

    setTwoFactorBusy('confirm');

    try {
      const response = await fetch('/api/auth/2fa/confirm', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          code: twoFactorForm.setupCode.trim(),
        }),
      });

      const data = await getResponseJson<TwoFactorRecoveryCodesResponse>(response);
      setTwoFactorStatus(data);
      setTwoFactorSetup(null);
      setTwoFactorCodes(data.backup_codes);
      setTwoFactorForm((current) => ({
        ...current,
        setupCode: '',
      }));
      setMessage('2FA activado. Guarda tus códigos de respaldo antes de cerrar este panel.');
      void loadAuditLogs({ background: true, silent: true });
    } catch (error) {
      console.error('Error confirming 2FA setup:', error);
      setMessage(
        error instanceof Error ? error.message : 'No se pudo confirmar el 2FA.',
        'error',
      );
    } finally {
      setTwoFactorBusy(null);
    }
  };

  const handleDisableTwoFactor = async () => {
    if (!twoFactorForm.currentPassword) {
      setMessage('Introduce tu contraseña actual para desactivar el 2FA.', 'error');
      return;
    }

    if (!twoFactorForm.securityCode.trim()) {
      setMessage('Introduce un código 2FA o un código de respaldo.', 'error');
      return;
    }

    setTwoFactorBusy('disable');

    try {
      const response = await fetch('/api/auth/2fa/disable', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          current_password: twoFactorForm.currentPassword,
          code: twoFactorForm.securityCode.trim(),
        }),
      });

      const data = await getResponseJson<TwoFactorStatus>(response);
      setTwoFactorStatus(data);
      setTwoFactorSetup(null);
      setTwoFactorCodes([]);
      setTwoFactorForm({
        setupCode: '',
        currentPassword: '',
        securityCode: '',
      });
      setMessage('2FA desactivado para tu cuenta.');
      void loadAuditLogs({ background: true, silent: true });
    } catch (error) {
      console.error('Error disabling 2FA:', error);
      setMessage(
        error instanceof Error ? error.message : 'No se pudo desactivar el 2FA.',
        'error',
      );
    } finally {
      setTwoFactorBusy(null);
    }
  };

  const handleRegenerateBackupCodes = async () => {
    if (!twoFactorForm.currentPassword) {
      setMessage('Introduce tu contraseña actual para regenerar los códigos.', 'error');
      return;
    }

    if (!twoFactorForm.securityCode.trim()) {
      setMessage('Introduce un código 2FA o un código de respaldo.', 'error');
      return;
    }

    setTwoFactorBusy('regenerate');

    try {
      const response = await fetch('/api/auth/2fa/backup-codes/regenerate', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          current_password: twoFactorForm.currentPassword,
          code: twoFactorForm.securityCode.trim(),
        }),
      });

      const data = await getResponseJson<TwoFactorRecoveryCodesResponse>(response);
      setTwoFactorStatus(data);
      setTwoFactorCodes(data.backup_codes);
      setTwoFactorForm((current) => ({
        ...current,
        securityCode: '',
      }));
      setMessage('Códigos de respaldo regenerados. Guarda la nueva lista.');
      void loadAuditLogs({ background: true, silent: true });
    } catch (error) {
      console.error('Error regenerating 2FA backup codes:', error);
      setMessage(
        error instanceof Error
          ? error.message
          : 'No se pudieron regenerar los códigos de respaldo.',
        'error',
      );
    } finally {
      setTwoFactorBusy(null);
    }
  };

  const handleCopyBackupCodes = async () => {
    if (!twoFactorCodes.length) {
      return;
    }

    setTwoFactorBusy('copy');

    try {
      await navigator.clipboard.writeText(twoFactorCodes.join('\n'));
      setMessage('Códigos de respaldo copiados al portapapeles.');
    } catch (error) {
      console.error('Error copying backup codes:', error);
      setMessage('No se pudieron copiar los códigos de respaldo.', 'error');
    } finally {
      setTwoFactorBusy(null);
    }
  };

  const handleDownloadBackupCodes = () => {
    if (!twoFactorCodes.length) {
      return;
    }

    setTwoFactorBusy('download');

    try {
      const blob = new Blob([twoFactorCodes.join('\n')], {
        type: 'text/plain;charset=utf-8',
      });
      const url = URL.createObjectURL(blob);
      triggerClientDownload(url, 'zaaryx-2fa-backup-codes.txt', () => URL.revokeObjectURL(url));
      setMessage('Códigos de respaldo descargados.');
    } finally {
      setTwoFactorBusy(null);
    }
  };

  const normalizedAuditQuery = auditQuery.trim().toLowerCase();
  const filteredAuditLogs = auditLogs.filter((log) => {
    const matchesAction = auditActionFilter === 'all' || log.action === auditActionFilter;

    if (!matchesAction) {
      return false;
    }

    if (!normalizedAuditQuery) {
      return true;
    }

    const metadataText = Object.values(log.metadata || {})
      .map((value) => formatAuditMetadataValue(value) || '')
      .join(' ')
      .toLowerCase();

    return [
      log.actor_name,
      log.actor_email || '',
      log.description,
      log.action,
      log.entity_type,
      metadataText,
    ]
      .join(' ')
      .toLowerCase()
      .includes(normalizedAuditQuery);
  });

  const auditActionOptions = Array.from(
    new Set(auditLogs.map((log) => log.action).filter(Boolean)),
  ).sort((left, right) => left.localeCompare(right));

  return (
    <div className="space-y-8">
      <header className="flex justify-between items-center">
        <div>
          <h2 className="text-3xl font-bold">Ajustes</h2>
          <p className="text-white/50">Controla la configuración operativa del CRM.</p>
        </div>
        <div className="flex gap-3">
          <button
            type="button"
            onClick={handleDownloadSnapshot}
            className="glass-button-secondary"
          >
            <Download className="w-5 h-5" />
            Exportar
          </button>
          <button
            type="button"
            onClick={handleReset}
            disabled={resetting || loading}
            className="glass-button-secondary"
          >
            <RotateCcw className="w-5 h-5" />
            {resetting ? 'Restableciendo...' : 'Restablecer'}
          </button>
          <button
            type="button"
            onClick={handleSave}
            disabled={saving || loading}
            className="glass-button-primary"
          >
            <Save className="w-5 h-5" />
            {saving ? 'Guardando...' : 'Guardar Cambios'}
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

      <CollapsibleSection
        title="Resumen de ajustes"
        description="Estado rápido del plan, seguridad y configuración base."
        icon={<Building2 className="w-5 h-5" />}
        storageKey="settings-summary"
      >
        <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
          {[
            { label: 'Plan', value: settings.subscription_plan.toUpperCase(), icon: Building2, color: 'text-brand-cyan' },
            { label: 'Zona Horaria', value: settings.timezone, icon: Bell, color: 'text-blue-400' },
            { label: 'Seguridad', value: settings.two_factor ? '2FA Activo' : '2FA Inactivo', icon: Shield, color: settings.two_factor ? 'text-green-400' : 'text-yellow-400' },
            { label: 'Moneda', value: settings.currency, icon: Save, color: 'text-brand-purple' },
          ].map((card) => (
            <div key={card.label} className="glass-card p-6">
              <div className="flex items-center gap-3 mb-2">
                <card.icon className={cn('w-5 h-5', card.color)} />
                <span className="text-xs text-white/40 uppercase font-bold tracking-wider">
                  {card.label}
                </span>
              </div>
              <p className="text-xl font-bold break-words">{card.value}</p>
            </div>
          ))}
        </div>
      </CollapsibleSection>

      <CollapsibleSection
        title="Checklist de producción"
        description="Validación del entorno antes de despliegue o entrega."
        icon={<Activity className="w-5 h-5" />}
        storageKey="settings-production"
      >
        <section className="space-y-4">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <div className="flex items-center gap-3">
              <Shield className="w-5 h-5 text-brand-cyan" />
              <h3 className="font-bold text-lg">Checklist de Producción</h3>
            </div>
            <p className="text-sm text-white/45 mt-1">
              Verifica si el entorno está listo para desplegarse sin sorpresas.
            </p>
          </div>

          <div className="flex items-center gap-3">
            {productionReadiness ? (
              <span
                className={cn(
                  'rounded-full border px-3 py-1 text-xs font-bold uppercase tracking-wider',
                  getReadinessTone(productionReadiness.overall_status),
                )}
              >
                {getReadinessLabel(productionReadiness.overall_status)}
              </span>
            ) : null}
            <button
              type="button"
              onClick={() => {
                void loadProductionReadiness({ background: true });
              }}
              disabled={refreshingReadiness || readinessLoading}
              className="glass-button-secondary disabled:opacity-50 disabled:cursor-not-allowed"
            >
              <RefreshCw className="w-5 h-5" />
              {refreshingReadiness ? 'Revisando...' : 'Revisar'}
            </button>
          </div>
        </div>

        {readinessLoading ? (
          <div className="glass-input text-sm text-white/45">Revisando entorno de producción...</div>
        ) : productionReadiness ? (
          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
            {productionReadiness.items.map((item) => (
              <div key={item.key} className="glass-input space-y-2">
                <div className="flex items-center justify-between gap-3">
                  <p className="font-medium">{item.label}</p>
                  <span
                    className={cn(
                      'rounded-full border px-2.5 py-1 text-[11px] font-bold uppercase tracking-wider',
                      getReadinessTone(item.status),
                    )}
                  >
                    {getReadinessLabel(item.status)}
                  </span>
                </div>
                <p className="text-sm text-white/45">{item.detail}</p>
              </div>
            ))}
          </div>
        ) : (
          <div className="glass-input text-sm text-red-400">
            No se pudo cargar la checklist de producción.
          </div>
        )}
        </section>
      </CollapsibleSection>

      {loading ? (
        <div className="glass-panel p-8 text-center text-white/40">Cargando ajustes...</div>
      ) : (
        <>
          <CollapsibleSection
            title="Configuración base"
            description="Preferencias generales, notificaciones y política básica de seguridad."
            icon={<Save className="w-5 h-5" />}
            storageKey="settings-base"
          >
            <div className="grid grid-cols-1 xl:grid-cols-3 gap-6">
            <section className="glass-panel p-6 space-y-4">
            <div className="flex items-center gap-3">
              <Building2 className="w-5 h-5 text-brand-blue" />
              <h3 className="font-bold text-lg">General</h3>
            </div>

            <div>
              <label className="block text-xs font-bold uppercase tracking-wider text-white/40 mb-2">
                Nombre de la agencia
              </label>
              <input
                value={settings.agency_name}
                onChange={(event) =>
                  setSettings((current) => ({
                    ...current,
                    agency_name: event.target.value,
                  }))
                }
                className="w-full glass-input"
              />
            </div>

            <div>
              <label className="block text-xs font-bold uppercase tracking-wider text-white/40 mb-2">
                Plan
              </label>
              <select
                value={settings.subscription_plan}
                onChange={(event) =>
                  setSettings((current) => ({
                    ...current,
                    subscription_plan: event.target.value as AppSettings['subscription_plan'],
                  }))
                }
                className="w-full glass-input"
              >
                <option value="starter">Starter</option>
                <option value="pro">Pro</option>
                <option value="enterprise">Enterprise</option>
              </select>
            </div>

            <div>
              <label className="block text-xs font-bold uppercase tracking-wider text-white/40 mb-2">
                Zona horaria
              </label>
              <select
                value={settings.timezone}
                onChange={(event) =>
                  setSettings((current) => ({
                    ...current,
                    timezone: event.target.value,
                  }))
                }
                className="w-full glass-input"
              >
                <option value="Europe/Madrid">Europe/Madrid</option>
                <option value="Europe/London">Europe/London</option>
                <option value="America/New_York">America/New_York</option>
                <option value="America/Mexico_City">America/Mexico_City</option>
              </select>
            </div>

            <div>
              <label className="block text-xs font-bold uppercase tracking-wider text-white/40 mb-2">
                Moneda
              </label>
              <select
                value={settings.currency}
                onChange={(event) =>
                  setSettings((current) => ({
                    ...current,
                    currency: event.target.value as AppSettings['currency'],
                  }))
                }
                className="w-full glass-input"
              >
                <option value="EUR">EUR</option>
                <option value="USD">USD</option>
                <option value="MXN">MXN</option>
              </select>
            </div>
          </section>

          <section className="glass-panel p-6 space-y-4">
            <div className="flex items-center gap-3">
              <Bell className="w-5 h-5 text-brand-cyan" />
              <h3 className="font-bold text-lg">Notificaciones</h3>
            </div>

            {[
              {
                key: 'email_reports',
                label: 'Enviar reportes por email',
                description: 'Permite resúmenes automáticos para clientes o equipo.',
              },
              {
                key: 'task_reminders',
                label: 'Recordatorios de tareas',
                description: 'Activa avisos internos para vencimientos y seguimiento.',
              },
              {
                key: 'invoice_alerts',
                label: 'Alertas de facturas',
                description: 'Notifica cobros pendientes y vencimientos próximos.',
              },
              {
                key: 'weekly_digest',
                label: 'Resumen semanal',
                description: 'Agrupa actividad, campañas y pipeline en un digest.',
              },
            ].map((item) => (
              <label
                key={item.key}
                className="glass-input flex items-start justify-between gap-4 cursor-pointer"
              >
                <div>
                  <p className="font-medium">{item.label}</p>
                  <p className="text-sm text-white/40">{item.description}</p>
                </div>
                <input
                  type="checkbox"
                  checked={settings[item.key as keyof AppSettings] as boolean}
                  onChange={(event) =>
                    setSettings((current) => ({
                      ...current,
                      [item.key]: event.target.checked,
                    }))
                  }
                />
              </label>
            ))}
          </section>

          <section className="glass-panel p-6 space-y-4">
            <div className="flex items-center gap-3">
              <Shield className="w-5 h-5 text-green-400" />
              <h3 className="font-bold text-lg">Seguridad</h3>
            </div>

            <div>
              <label className="block text-xs font-bold uppercase tracking-wider text-white/40 mb-2">
                Expiración de sesión
              </label>
              <select
                value={settings.session_timeout}
                onChange={(event) =>
                  setSettings((current) => ({
                    ...current,
                    session_timeout: event.target.value as AppSettings['session_timeout'],
                  }))
                }
                className="w-full glass-input"
              >
                <option value="30m">30 minutos</option>
                <option value="2h">2 horas</option>
                <option value="8h">8 horas</option>
              </select>
            </div>

            {[
              {
                key: 'two_factor',
                label: 'Autenticación en dos pasos',
                description: 'Añade una capa adicional para accesos sensibles.',
              },
              {
                key: 'login_alerts',
                label: 'Alertas de inicio de sesión',
                description: 'Notifica accesos nuevos o inusuales.',
              },
            ].map((item) => (
              <label
                key={item.key}
                className="glass-input flex items-start justify-between gap-4 cursor-pointer"
              >
                <div>
                  <p className="font-medium">{item.label}</p>
                  <p className="text-sm text-white/40">{item.description}</p>
                </div>
                <input
                  type="checkbox"
                  checked={settings[item.key as keyof AppSettings] as boolean}
                  onChange={(event) =>
                    setSettings((current) => ({
                      ...current,
                      [item.key]: event.target.checked,
                    }))
                  }
                />
              </label>
            ))}
            </section>
            </div>
          </CollapsibleSection>

          <CollapsibleSection
            title="Acceso"
            description="Cambio de contraseña y control básico de acceso de la cuenta."
            icon={<Shield className="w-5 h-5" />}
            storageKey="settings-access"
          >
            <section className="space-y-5">
            <div className="flex items-center gap-3">
              <Shield className="w-5 h-5 text-green-400" />
              <div>
                <h3 className="font-bold text-lg">Acceso</h3>
                <p className="text-sm text-white/40">
                  Cambia tu contraseña actual sin salir del CRM.
                </p>
              </div>
            </div>

            <form onSubmit={handleChangePassword} className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div>
                <label className="block text-xs font-bold uppercase tracking-wider text-white/40 mb-2">
                  Contraseña actual
                </label>
                <input
                  required
                  type="password"
                  value={passwordForm.currentPassword}
                  onChange={(event) =>
                    setPasswordForm((current) => ({
                      ...current,
                      currentPassword: event.target.value,
                    }))
                  }
                  className="w-full glass-input"
                  placeholder="Tu contraseña actual"
                />
              </div>

              <div>
                <label className="block text-xs font-bold uppercase tracking-wider text-white/40 mb-2">
                  Nueva contraseña
                </label>
                <input
                  required
                  type="password"
                  value={passwordForm.newPassword}
                  onChange={(event) =>
                    setPasswordForm((current) => ({
                      ...current,
                      newPassword: event.target.value,
                    }))
                  }
                  className="w-full glass-input"
                  placeholder="Mínimo 8 caracteres"
                />
              </div>

              <div>
                <label className="block text-xs font-bold uppercase tracking-wider text-white/40 mb-2">
                  Confirmar contraseña
                </label>
                <input
                  required
                  type="password"
                  value={passwordForm.confirmPassword}
                  onChange={(event) =>
                    setPasswordForm((current) => ({
                      ...current,
                      confirmPassword: event.target.value,
                    }))
                  }
                  className="w-full glass-input"
                  placeholder="Repite la nueva contraseña"
                />
              </div>

              <div className="md:col-span-3 flex flex-wrap items-center justify-between gap-3">
                <p className="text-sm text-white/40">
                  Si pierdes acceso, puedes generar un enlace temporal desde la pantalla de login.
                </p>
                <button
                  type="submit"
                  disabled={changingPassword}
                  className="glass-button-secondary disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  <Shield className="w-5 h-5" />
                  {changingPassword ? 'Actualizando...' : 'Actualizar contraseña'}
                </button>
              </div>
            </form>
            </section>
          </CollapsibleSection>

          <CollapsibleSection
            title="2FA de tu cuenta"
            description="Configuración TOTP y códigos de respaldo del usuario activo."
            icon={<Shield className="w-5 h-5" />}
            storageKey="settings-2fa"
            defaultOpen={false}
          >
            <section className="space-y-5">
            <div className="flex items-center gap-3">
              <Shield className="w-5 h-5 text-brand-cyan" />
              <div>
                <h3 className="font-bold text-lg">2FA de tu cuenta</h3>
                <p className="text-sm text-white/40">
                  Configura TOTP con Google Authenticator, 1Password, Authy o similar.
                </p>
              </div>
            </div>

            {twoFactorLoading ? (
              <div className="glass-input text-sm text-white/45">Cargando estado del 2FA...</div>
            ) : twoFactorStatus ? (
              <>
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                  <div className="glass-input">
                    <p className="text-xs font-bold uppercase tracking-wider text-white/35">
                      Estado
                    </p>
                    <p
                      className={cn(
                        'mt-1 font-semibold',
                        twoFactorStatus.enabled ? 'text-green-400' : 'text-yellow-400',
                      )}
                    >
                      {twoFactorStatus.enabled
                        ? 'Protegido con 2FA'
                        : twoFactorStatus.pending_setup
                          ? 'Configuración pendiente'
                          : '2FA no activado'}
                    </p>
                  </div>

                  <div className="glass-input">
                    <p className="text-xs font-bold uppercase tracking-wider text-white/35">
                      Política agencia
                    </p>
                    <p className="mt-1 font-semibold text-white/85">
                      {twoFactorStatus.policy_enabled ? '2FA señalado como activo' : '2FA opcional'}
                    </p>
                  </div>

                  <div className="glass-input">
                    <p className="text-xs font-bold uppercase tracking-wider text-white/35">
                      Códigos restantes
                    </p>
                    <p className="mt-1 font-semibold text-white/85">
                      {twoFactorStatus.backup_codes_remaining}
                    </p>
                  </div>
                </div>

                {twoFactorStatus.confirmed_at ? (
                  <p className="text-sm text-white/40">
                    Confirmado el {formatAuditDate(twoFactorStatus.confirmed_at)}.
                  </p>
                ) : null}

                {!twoFactorStatus.enabled && !twoFactorStatus.pending_setup ? (
                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <p className="text-sm text-white/45">
                      Al activarlo necesitarás tu contraseña y un código temporal para entrar.
                    </p>
                    <button
                      type="button"
                      onClick={handleStartTwoFactorSetup}
                      disabled={twoFactorBusy !== null}
                      className="glass-button-secondary disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                      <Shield className="w-5 h-5" />
                      {twoFactorBusy === 'setup' ? 'Preparando...' : 'Activar 2FA'}
                    </button>
                  </div>
                ) : null}

                {twoFactorStatus.pending_setup && twoFactorSetup ? (
                  <form onSubmit={handleConfirmTwoFactorSetup} className="space-y-4">
                    <div className="grid grid-cols-1 lg:grid-cols-[220px_1fr] gap-5">
                      <div className="glass-input flex items-center justify-center p-4">
                        <img
                          src={twoFactorSetup.qr_data_url}
                          alt="QR 2FA"
                          className="w-[180px] h-[180px] rounded-xl bg-white p-3"
                        />
                      </div>

                      <div className="space-y-4">
                        <div className="glass-input">
                          <p className="text-xs font-bold uppercase tracking-wider text-white/35">
                            Clave manual
                          </p>
                          <p className="mt-2 break-all text-sm text-white/85">
                            {twoFactorSetup.manual_entry_key}
                          </p>
                        </div>

                        <div>
                          <label className="block text-xs font-bold uppercase tracking-wider text-white/40 mb-2">
                            Primer código generado
                          </label>
                          <input
                            type="text"
                            value={twoFactorForm.setupCode}
                            onChange={(event) =>
                              setTwoFactorForm((current) => ({
                                ...current,
                                setupCode: event.target.value,
                              }))
                            }
                            className="w-full glass-input"
                            placeholder="123456"
                          />
                        </div>

                        <div className="flex flex-wrap gap-3">
                          <button
                            type="submit"
                            disabled={twoFactorBusy !== null}
                            className="glass-button-secondary disabled:opacity-50 disabled:cursor-not-allowed"
                          >
                            <Shield className="w-5 h-5" />
                            {twoFactorBusy === 'confirm' ? 'Confirmando...' : 'Confirmar 2FA'}
                          </button>
                          <button
                            type="button"
                            onClick={handleStartTwoFactorSetup}
                            disabled={twoFactorBusy !== null}
                            className="glass-button-secondary disabled:opacity-50 disabled:cursor-not-allowed"
                          >
                            <RefreshCw className="w-5 h-5" />
                            Regenerar QR
                          </button>
                        </div>
                      </div>
                    </div>
                  </form>
                ) : null}

                {twoFactorStatus.pending_setup && !twoFactorSetup ? (
                  <div className="glass-input flex flex-wrap items-center justify-between gap-3">
                    <div>
                      <p className="font-medium">Configuración pendiente</p>
                      <p className="text-sm text-white/45">
                        Hay un setup 2FA iniciado para tu cuenta. Regenera el QR para terminarlo.
                      </p>
                    </div>
                    <button
                      type="button"
                      onClick={handleStartTwoFactorSetup}
                      disabled={twoFactorBusy !== null}
                      className="glass-button-secondary disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                      <RefreshCw className="w-5 h-5" />
                      {twoFactorBusy === 'setup' ? 'Preparando...' : 'Regenerar QR'}
                    </button>
                  </div>
                ) : null}

                {twoFactorStatus.enabled ? (
                  <div className="space-y-4">
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      <div>
                        <label className="block text-xs font-bold uppercase tracking-wider text-white/40 mb-2">
                          Contraseña actual
                        </label>
                        <input
                          type="password"
                          value={twoFactorForm.currentPassword}
                          onChange={(event) =>
                            setTwoFactorForm((current) => ({
                              ...current,
                              currentPassword: event.target.value,
                            }))
                          }
                          className="w-full glass-input"
                          placeholder="Confirma tu contraseña"
                        />
                      </div>

                      <div>
                        <label className="block text-xs font-bold uppercase tracking-wider text-white/40 mb-2">
                          Código 2FA o respaldo
                        </label>
                        <input
                          type="text"
                          value={twoFactorForm.securityCode}
                          onChange={(event) =>
                            setTwoFactorForm((current) => ({
                              ...current,
                              securityCode: event.target.value,
                            }))
                          }
                          className="w-full glass-input"
                          placeholder="123456 o AAAA-BBBB"
                        />
                      </div>
                    </div>

                    <div className="flex flex-wrap gap-3">
                      <button
                        type="button"
                        onClick={handleRegenerateBackupCodes}
                        disabled={twoFactorBusy !== null}
                        className="glass-button-secondary disabled:opacity-50 disabled:cursor-not-allowed"
                      >
                        <RefreshCw className="w-5 h-5" />
                        {twoFactorBusy === 'regenerate'
                          ? 'Regenerando...'
                          : 'Regenerar códigos'}
                      </button>
                      <button
                        type="button"
                        onClick={handleDisableTwoFactor}
                        disabled={twoFactorBusy !== null}
                        className="glass-button-secondary disabled:opacity-50 disabled:cursor-not-allowed"
                      >
                        <Shield className="w-5 h-5" />
                        {twoFactorBusy === 'disable' ? 'Desactivando...' : 'Desactivar 2FA'}
                      </button>
                    </div>
                  </div>
                ) : null}

                {twoFactorCodes.length > 0 ? (
                  <div className="glass-input space-y-4">
                    <div className="flex flex-wrap items-center justify-between gap-3">
                      <div>
                        <p className="font-medium">Códigos de respaldo</p>
                        <p className="text-sm text-white/45">
                          Guárdalos fuera del CRM. Cada uno se puede usar una sola vez.
                        </p>
                      </div>

                      <div className="flex gap-3">
                        <button
                          type="button"
                          onClick={() => {
                            void handleCopyBackupCodes();
                          }}
                          disabled={twoFactorBusy !== null}
                          className="glass-button-secondary disabled:opacity-50 disabled:cursor-not-allowed"
                        >
                          <Download className="w-5 h-5" />
                          {twoFactorBusy === 'copy' ? 'Copiando...' : 'Copiar'}
                        </button>
                        <button
                          type="button"
                          onClick={handleDownloadBackupCodes}
                          disabled={twoFactorBusy !== null}
                          className="glass-button-secondary disabled:opacity-50 disabled:cursor-not-allowed"
                        >
                          <Download className="w-5 h-5" />
                          {twoFactorBusy === 'download' ? 'Preparando...' : 'Descargar'}
                        </button>
                      </div>
                    </div>

                    <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-3">
                      {twoFactorCodes.map((code) => (
                        <div
                          key={code}
                          className="rounded-xl border border-white/10 bg-black/20 px-3 py-2 text-sm font-mono tracking-wider text-white/85"
                        >
                          {code}
                        </div>
                      ))}
                    </div>
                  </div>
                ) : null}
              </>
            ) : (
              <div className="glass-input text-sm text-red-400">
                No se pudo cargar la configuración del 2FA.
              </div>
            )}
            </section>
          </CollapsibleSection>

          <CollapsibleSection
            title="Automatizaciones IA"
            description="Disparadores automáticos para leads, clientes y proyectos."
            icon={<Bot className="w-5 h-5" />}
            storageKey="settings-ai"
            defaultOpen={false}
          >
            <section className="space-y-4">
            <div className="flex items-center gap-3">
              <Bot className="w-5 h-5 text-fuchsia-400" />
              <div>
                <h3 className="font-bold text-lg">Automatizaciones IA</h3>
                <p className="text-sm text-white/40">
                  Activa disparadores automáticos sobre eventos clave del CRM.
                </p>
              </div>
            </div>

            {[
              {
                key: 'ai_trigger_new_lead',
                label: 'Nuevo lead: seguimiento automático',
                description:
                  'Al crear un lead, la IA define próximo paso, fecha de contacto y tarea de seguimiento.',
              },
              {
                key: 'ai_trigger_client_report',
                label: 'Conversión a cliente: reporte automático',
                description:
                  'Al cerrar un lead como cliente nuevo, la IA genera un reporte operativo inicial.',
              },
              {
                key: 'ai_trigger_project_task_pack',
                label: 'Nuevo proyecto: pack de tareas',
                description:
                  'Al crear un proyecto, la IA crea un bloque inicial de tareas según su fase actual.',
              },
            ].map((item) => (
              <label
                key={item.key}
                className="glass-input flex items-start justify-between gap-4 cursor-pointer"
              >
                <div>
                  <p className="font-medium">{item.label}</p>
                  <p className="text-sm text-white/40">{item.description}</p>
                </div>
                <input
                  type="checkbox"
                  checked={settings[item.key as keyof AppSettings] as boolean}
                  onChange={(event) =>
                    setSettings((current) => ({
                      ...current,
                      [item.key]: event.target.checked,
                    }))
                  }
                />
              </label>
            ))}
            </section>
          </CollapsibleSection>

          <CollapsibleSection
            title="Auditoría de actividad"
            description="Registro de accesos y cambios operativos clave del CRM."
            icon={<Search className="w-5 h-5" />}
            summary={`${filteredAuditLogs.length} registros`}
            storageKey="settings-audit"
            defaultOpen={false}
          >
            <section className="space-y-5">
            <div className="flex flex-wrap items-start justify-between gap-4">
              <div>
                <div className="flex items-center gap-3">
                  <Activity className="w-5 h-5 text-brand-cyan" />
                  <h3 className="font-bold text-lg">Auditoría de actividad</h3>
                </div>
                <p className="text-sm text-white/45 mt-1">
                  Registro de accesos y cambios operativos clave del CRM.
                </p>
              </div>

              <div className="flex gap-3">
                <button
                  type="button"
                  onClick={handleDownloadAudit}
                  disabled={auditLoading || filteredAuditLogs.length === 0}
                  className="glass-button-secondary"
                >
                  <Download className="w-5 h-5" />
                  Exportar Auditoría
                </button>
                <button
                  type="button"
                  onClick={() => void loadAuditLogs({ background: true })}
                  disabled={refreshingAudit}
                  className="glass-button-secondary"
                >
                  <RefreshCw className="w-5 h-5" />
                  {refreshingAudit ? 'Actualizando...' : 'Actualizar'}
                </button>
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-[1fr_220px] gap-4">
              <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-white/30" />
                <input
                  type="text"
                  value={auditQuery}
                  onChange={(event) => setAuditQuery(event.target.value)}
                  placeholder="Buscar por actor, acción o detalle..."
                  className="w-full glass-input pl-10"
                />
              </div>

              <select
                value={auditActionFilter}
                onChange={(event) => setAuditActionFilter(event.target.value)}
                className="w-full glass-input"
              >
                <option value="all">Todas las acciones</option>
                {auditActionOptions.map((action) => (
                  <option key={action} value={action}>
                    {getAuditActionLabel(action)}
                  </option>
                ))}
              </select>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              {[
                { label: 'Registros cargados', value: auditLogs.length },
                {
                  label: 'Accesos',
                  value: auditLogs.filter((log) => log.action.startsWith('auth.')).length,
                },
                {
                  label: 'Cambios operativos',
                  value: auditLogs.filter((log) => !log.action.startsWith('auth.')).length,
                },
              ].map((stat) => (
                <div key={stat.label} className="glass-card p-4">
                  <p className="text-xs uppercase tracking-wider text-white/35 font-bold">
                    {stat.label}
                  </p>
                  <p className="text-2xl font-bold mt-2">{stat.value}</p>
                </div>
              ))}
            </div>

            {auditLoading ? (
              <div className="glass-panel p-6 text-center text-white/40">
                Cargando auditoría...
              </div>
            ) : filteredAuditLogs.length === 0 ? (
              <div className="glass-panel p-6 text-center text-white/40">
                No hay registros que coincidan con los filtros actuales.
              </div>
            ) : (
              <div className="space-y-3">
                {filteredAuditLogs.map((log) => (
                  <div key={log.id} className="glass-card p-4 space-y-3">
                    <div className="flex flex-wrap items-start justify-between gap-3">
                      <div>
                        <div className="flex flex-wrap items-center gap-2">
                          <span
                            className={cn(
                              'text-[10px] px-2 py-1 rounded-full font-bold uppercase tracking-wider border',
                              getAuditActionColor(log.action),
                            )}
                          >
                            {getAuditActionLabel(log.action)}
                          </span>
                          <span className="text-[10px] px-2 py-1 rounded-full font-bold uppercase tracking-wider border bg-white/5 text-white/60 border-white/10">
                            {log.entity_type}
                          </span>
                        </div>
                        <p className="font-medium mt-3">{log.description}</p>
                      </div>

                      <p className="text-xs text-white/40">{formatAuditDate(log.created_at)}</p>
                    </div>

                    <div className="flex flex-wrap items-center gap-3 text-xs text-white/45">
                      <span>{log.actor_name}</span>
                      {log.actor_email ? <span>{log.actor_email}</span> : null}
                      {log.entity_id ? <span>ID #{log.entity_id}</span> : null}
                    </div>

                    {log.metadata && Object.keys(log.metadata).length > 0 ? (
                      <div className="flex flex-wrap gap-2">
                        {Object.entries(log.metadata).map(([key, value]) => {
                          const formattedValue = formatAuditMetadataValue(value);

                          if (!formattedValue) {
                            return null;
                          }

                          return (
                            <span
                              key={`${log.id}-${key}`}
                              className="text-[11px] px-2 py-1 rounded-full bg-white/5 text-white/55 border border-white/10"
                            >
                              {key}: {formattedValue}
                            </span>
                          );
                        })}
                      </div>
                    ) : null}
                  </div>
                ))}
              </div>
            )}
            </section>
          </CollapsibleSection>
        </>
      )}
    </div>
  );
};
