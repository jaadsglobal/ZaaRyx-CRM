import React, { useEffect, useState } from 'react';
import {
  Copy,
  Download,
  KeyRound,
  LockKeyhole,
  Mail,
  RefreshCw,
  Shield,
  ShieldCheck,
  Smartphone,
  UserCircle2,
} from 'lucide-react';
import {
  AuthUser,
  TwoFactorRecoveryCodesResponse,
  TwoFactorSetupResponse,
  TwoFactorStatus,
  UserSessionSummary,
  cn,
} from '../types';
import { triggerClientDownload } from '../lib/download';
import { getRoleKey } from '../permissions';
import { CollapsibleSection } from './CollapsibleSection';
import { InteractiveSummaryCard } from './InteractiveSummaryCard';

interface AccountSecurityPortalProps {
  currentUser: AuthUser | null;
  onCurrentUserPatch: (patch: Partial<AuthUser>) => void;
}

const getResponseJson = async <T,>(response: Response): Promise<T> => {
  if (!response.ok) {
    const errorData = (await response.json().catch(() => null)) as { error?: string } | null;
    throw new Error(errorData?.error || `Request failed with status ${response.status}`);
  }

  return response.json() as Promise<T>;
};

const formatDateTime = (value?: string | null) => {
  if (!value) {
    return 'Sin fecha';
  }

  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime())
    ? value
    : parsed.toLocaleString('es-ES', {
        day: '2-digit',
        month: 'short',
        year: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
      });
};

export const AccountSecurityPortal: React.FC<AccountSecurityPortalProps> = ({
  currentUser,
  onCurrentUserPatch,
}) => {
  const [sessions, setSessions] = useState<UserSessionSummary[]>([]);
  const [sessionsLoading, setSessionsLoading] = useState(true);
  const [twoFactorStatus, setTwoFactorStatus] = useState<TwoFactorStatus | null>(null);
  const [twoFactorSetup, setTwoFactorSetup] = useState<TwoFactorSetupResponse | null>(null);
  const [twoFactorCodes, setTwoFactorCodes] = useState<string[]>([]);
  const [twoFactorLoading, setTwoFactorLoading] = useState(true);
  const [changingPassword, setChangingPassword] = useState(false);
  const [revokingSessionId, setRevokingSessionId] = useState<number | null>(null);
  const [twoFactorBusy, setTwoFactorBusy] = useState<
    'setup' | 'confirm' | 'disable' | 'regenerate' | 'copy' | 'download' | null
  >(null);
  const [feedbackMessage, setFeedbackMessage] = useState<string | null>(null);
  const [feedbackTone, setFeedbackTone] = useState<'success' | 'error'>('success');
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
  const currentUserRoleKey = currentUser ? getRoleKey(currentUser.role) : null;
  const isFreelancerPortalUser = currentUserRoleKey === 'freelancer';

  const setMessage = (message: string, tone: 'success' | 'error' = 'success') => {
    setFeedbackTone(tone);
    setFeedbackMessage(message);
  };

  const scrollToSection = (sectionId: string) => {
    document.getElementById(sectionId)?.scrollIntoView({
      behavior: 'smooth',
      block: 'start',
    });
  };

  const loadTwoFactorStatus = async ({ silent = false }: { silent?: boolean } = {}) => {
    try {
      const response = await fetch('/api/auth/2fa/status');
      const data = await getResponseJson<TwoFactorStatus>(response);
      setTwoFactorStatus(data);

      if (!data.pending_setup) {
        setTwoFactorSetup(null);
      }
    } catch (error) {
      console.error('Error loading 2FA status:', error);

      if (!silent) {
        setMessage('No se pudo cargar el estado del segundo factor.', 'error');
      }
    } finally {
      setTwoFactorLoading(false);
    }
  };

  const loadSessions = async ({ silent = false }: { silent?: boolean } = {}) => {
    try {
      const response = await fetch('/api/auth/sessions');
      const data = await getResponseJson<UserSessionSummary[]>(response);
      setSessions(data);
    } catch (error) {
      console.error('Error loading auth sessions:', error);

      if (!silent) {
        setMessage('No se pudieron cargar las sesiones activas.', 'error');
      }
    } finally {
      setSessionsLoading(false);
    }
  };

  useEffect(() => {
    void loadTwoFactorStatus({ silent: true });
    void loadSessions({ silent: true });
  }, []);

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

      const data = await getResponseJson<{ success: boolean; user: AuthUser }>(response);
      onCurrentUserPatch(data.user);
      setPasswordForm({
        currentPassword: '',
        newPassword: '',
        confirmPassword: '',
      });
      setMessage('Contraseña actualizada. El resto de sesiones anteriores se ha revocado.');
      setSessionsLoading(true);
      await loadSessions({ silent: true });
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
      onCurrentUserPatch({ two_factor_enabled: false });
      setMessage('Escanea el QR y confirma con el primer código de tu app autenticadora.');
    } catch (error) {
      console.error('Error starting 2FA setup:', error);
      setMessage(error instanceof Error ? error.message : 'No se pudo preparar el 2FA.', 'error');
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
      onCurrentUserPatch({ two_factor_enabled: true });
      setMessage('2FA activado. Guarda tus códigos de respaldo antes de cerrar este panel.');
    } catch (error) {
      console.error('Error confirming 2FA setup:', error);
      setMessage(error instanceof Error ? error.message : 'No se pudo confirmar el 2FA.', 'error');
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
      onCurrentUserPatch({ two_factor_enabled: false });
      setMessage('2FA desactivado para tu cuenta.');
    } catch (error) {
      console.error('Error disabling 2FA:', error);
      setMessage(error instanceof Error ? error.message : 'No se pudo desactivar el 2FA.', 'error');
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
      onCurrentUserPatch({ two_factor_enabled: true });
      setMessage('Códigos de respaldo regenerados. Guarda la nueva lista.');
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
      triggerClientDownload(url, 'jaadsglobal-2fa-backup-codes.txt', () => URL.revokeObjectURL(url));
      setMessage('Códigos de respaldo descargados.');
    } finally {
      setTwoFactorBusy(null);
    }
  };

  const handleRevokeSession = async (session: UserSessionSummary) => {
    if (session.is_current) {
      return;
    }

    if (!window.confirm('Vas a cerrar una de tus otras sesiones activas. ¿Continuar?')) {
      return;
    }

    setRevokingSessionId(session.id);

    try {
      const response = await fetch(`/api/auth/sessions/${session.id}/revoke`, {
        method: 'POST',
      });

      await getResponseJson<{ revoked: true }>(response);
      setMessage(`Sesión revocada: ${formatDateTime(session.created_at)}.`);
      await loadSessions({ silent: true });
    } catch (error) {
      console.error('Error revoking auth session:', error);
      setMessage(error instanceof Error ? error.message : 'No se pudo cerrar la sesión.', 'error');
    } finally {
      setRevokingSessionId(null);
    }
  };

  const effectiveTwoFactorEnabled = twoFactorStatus?.enabled ?? currentUser?.two_factor_enabled ?? false;

  if (!currentUser) {
    return (
      <div className="glass-panel p-8 text-center text-white/45">
        No se pudo cargar tu cuenta de seguridad.
      </div>
    );
  }

  return (
    <div className="space-y-8">
      <header className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h2 className="text-3xl font-bold">
            {isFreelancerPortalUser ? 'Cuenta profesional' : 'Cuenta y seguridad'}
          </h2>
          <p className="text-white/50">
            {isFreelancerPortalUser
              ? 'Gestiona el acceso a tu espacio freelance, protege tu cuenta y controla tus sesiones activas.'
              : 'Gestiona el acceso a tu portal, protege tu cuenta y controla tus sesiones activas.'}
          </p>
        </div>

        <button
          type="button"
          onClick={() => {
            setTwoFactorLoading(true);
            setSessionsLoading(true);
            void loadTwoFactorStatus();
            void loadSessions();
          }}
          className="glass-button-secondary"
        >
          <RefreshCw className="w-4 h-4" />
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
        title="Resumen de acceso"
        description="Estado general de tu cuenta, protección en dos pasos y sesiones activas."
        storageKey="account-security-summary"
        defaultOpen
      >
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-6">
          <InteractiveSummaryCard
            label="Usuario"
            value={currentUser.name}
            hint="Identidad de acceso del portal"
            icon={UserCircle2}
            onClick={() => scrollToSection('account-password-section')}
          />
          <InteractiveSummaryCard
            label="Email"
            value={currentUser.email}
            hint="Cuenta principal de acceso"
            icon={Mail}
            onClick={() => scrollToSection('account-password-section')}
          />
          <InteractiveSummaryCard
            label="2FA"
            value={effectiveTwoFactorEnabled ? 'Activo' : 'Pendiente'}
            hint={
              twoFactorStatus?.pending_setup
                ? 'Configuración iniciada'
                : effectiveTwoFactorEnabled
                  ? 'Cuenta protegida'
                  : 'Recomendado activar'
            }
            icon={ShieldCheck}
            active={effectiveTwoFactorEnabled}
            onClick={() => scrollToSection('account-2fa-section')}
          />
          <InteractiveSummaryCard
            label="Sesiones"
            value={sessions.length}
            hint="Revisa accesos abiertos"
            icon={Smartphone}
            onClick={() => scrollToSection('account-sessions-section')}
          />
        </div>
      </CollapsibleSection>

      <div id="account-password-section">
        <CollapsibleSection
          title="Cambio de contraseña"
          description="Actualiza tu contraseña y revoca automáticamente el resto de sesiones anteriores."
          icon={<LockKeyhole className="w-5 h-5" />}
          storageKey="account-security-password"
          defaultOpen
        >
          <form onSubmit={handleChangePassword} className="space-y-5">
            <div className="grid grid-cols-1 xl:grid-cols-3 gap-4">
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
                  Confirmar nueva contraseña
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
            </div>

            <div className="flex flex-wrap items-center justify-between gap-3">
              <p className="text-sm text-white/40">
                Usa una contraseña distinta, larga y exclusiva para este portal.
              </p>
              <button
                type="submit"
                disabled={changingPassword}
                className="glass-button-primary disabled:opacity-50"
              >
                <KeyRound className="w-4 h-4" />
                {changingPassword ? 'Actualizando...' : 'Actualizar contraseña'}
              </button>
            </div>
          </form>
        </CollapsibleSection>
      </div>

      <div id="account-2fa-section">
        <CollapsibleSection
          title="Autenticación en dos pasos"
          description="Protege tu acceso con una app autenticadora y conserva tus códigos de respaldo."
          icon={<Shield className="w-5 h-5" />}
          summary={effectiveTwoFactorEnabled ? 'Protegido' : 'Pendiente'}
          storageKey="account-security-2fa"
          defaultOpen={false}
        >
          {twoFactorLoading ? (
            <div className="glass-input text-sm text-white/45">Cargando estado del 2FA...</div>
          ) : twoFactorStatus ? (
            <div className="space-y-5">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="glass-input">
                  <p className="text-xs font-bold uppercase tracking-wider text-white/35">Estado</p>
                  <p
                    className={cn(
                      'mt-2 font-semibold',
                      twoFactorStatus.enabled ? 'text-emerald-300' : 'text-yellow-300',
                    )}
                  >
                    {twoFactorStatus.enabled
                      ? 'Cuenta protegida con 2FA'
                      : twoFactorStatus.pending_setup
                        ? 'Configuración pendiente'
                        : '2FA no activado'}
                  </p>
                </div>

                <div className="glass-input">
                  <p className="text-xs font-bold uppercase tracking-wider text-white/35">
                    Códigos restantes
                  </p>
                  <p className="mt-2 font-semibold text-white/85">
                    {twoFactorStatus.backup_codes_remaining}
                  </p>
                </div>
              </div>

              {twoFactorStatus.confirmed_at ? (
                <p className="text-sm text-white/40">
                  Última confirmación: {formatDateTime(twoFactorStatus.confirmed_at)}.
                </p>
              ) : null}

              {!twoFactorStatus.enabled && !twoFactorStatus.pending_setup ? (
                <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-brand-cyan/15 bg-brand-cyan/10 p-4">
                  <p className="text-sm text-white/70">
                    Activa el segundo factor para que tu acceso dependa también de un código temporal.
                  </p>
                  <button
                    type="button"
                    onClick={handleStartTwoFactorSetup}
                    disabled={twoFactorBusy !== null}
                    className="glass-button-primary disabled:opacity-50"
                  >
                    <Shield className="w-4 h-4" />
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
                        className="h-[180px] w-[180px] rounded-xl bg-white p-3"
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
                          className="glass-button-primary disabled:opacity-50"
                        >
                          <ShieldCheck className="w-4 h-4" />
                          {twoFactorBusy === 'confirm' ? 'Confirmando...' : 'Confirmar 2FA'}
                        </button>
                        <button
                          type="button"
                          onClick={handleStartTwoFactorSetup}
                          disabled={twoFactorBusy !== null}
                          className="glass-button-secondary disabled:opacity-50"
                        >
                          <RefreshCw className="w-4 h-4" />
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
                    className="glass-button-secondary disabled:opacity-50"
                  >
                    <RefreshCw className="w-4 h-4" />
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
                      className="glass-button-secondary disabled:opacity-50"
                    >
                      <RefreshCw className="w-4 h-4" />
                      {twoFactorBusy === 'regenerate' ? 'Regenerando...' : 'Regenerar códigos'}
                    </button>
                    <button
                      type="button"
                      onClick={handleDisableTwoFactor}
                      disabled={twoFactorBusy !== null}
                      className="glass-button-secondary disabled:opacity-50"
                    >
                      <Shield className="w-4 h-4" />
                      {twoFactorBusy === 'disable' ? 'Desactivando...' : 'Desactivar 2FA'}
                    </button>
                  </div>
                </div>
              ) : null}

              {twoFactorCodes.length > 0 ? (
                <div className="rounded-2xl border border-emerald-500/20 bg-emerald-500/10 p-4 space-y-4">
                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <div>
                      <p className="font-semibold text-emerald-300">Códigos de respaldo listos</p>
                      <p className="text-sm text-white/70 mt-1">
                        Guarda esta lista en un lugar seguro antes de cerrar este bloque.
                      </p>
                    </div>

                    <div className="flex flex-wrap gap-3">
                      <button
                        type="button"
                        onClick={() => void handleCopyBackupCodes()}
                        disabled={twoFactorBusy !== null}
                        className="glass-button-secondary disabled:opacity-50"
                      >
                        <Copy className="w-4 h-4" />
                        Copiar
                      </button>
                      <button
                        type="button"
                        onClick={handleDownloadBackupCodes}
                        disabled={twoFactorBusy !== null}
                        className="glass-button-secondary disabled:opacity-50"
                      >
                        <Download className="w-4 h-4" />
                        Descargar
                      </button>
                    </div>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-3">
                    {twoFactorCodes.map((code) => (
                      <div
                        key={code}
                        className="rounded-xl border border-white/10 bg-black/20 px-3 py-3 font-mono text-sm text-white/85"
                      >
                        {code}
                      </div>
                    ))}
                  </div>
                </div>
              ) : null}
            </div>
          ) : (
            <div className="glass-input text-sm text-red-300">
              No se pudo cargar el estado del segundo factor.
            </div>
          )}
        </CollapsibleSection>
      </div>

      <div id="account-sessions-section">
        <CollapsibleSection
          title="Sesiones activas"
          description="Consulta dónde tienes acceso abierto y cierra cualquier sesión adicional que no reconozcas."
          icon={<Smartphone className="w-5 h-5" />}
          summary={`${sessions.length} activas`}
          storageKey="account-security-sessions"
          defaultOpen={false}
        >
          {sessionsLoading ? (
            <div className="glass-input text-sm text-white/45">Cargando sesiones activas...</div>
          ) : sessions.length === 0 ? (
            <div className="glass-input text-sm text-white/45">
              No hay sesiones adicionales visibles para esta cuenta.
            </div>
          ) : (
            <div className="space-y-3">
              {sessions.map((session) => (
                <div
                  key={session.id}
                  className="rounded-2xl border border-white/10 bg-white/5 p-4"
                >
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div>
                      <div className="flex flex-wrap items-center gap-3">
                        <p className="font-semibold">
                          {session.is_current ? 'Sesión actual' : 'Sesión web activa'}
                        </p>
                        <span
                          className={cn(
                            'rounded-full border px-2.5 py-1 text-[10px] font-bold uppercase tracking-wider',
                            session.is_current
                              ? 'border-emerald-500/20 bg-emerald-500/10 text-emerald-300'
                              : 'border-white/10 bg-white/5 text-white/55',
                          )}
                        >
                          {session.is_current ? 'Actual' : 'Abierta'}
                        </span>
                      </div>
                      <p className="text-sm text-white/45 mt-2">
                        Iniciada: {formatDateTime(session.created_at)}
                      </p>
                      <p className="text-sm text-white/45">
                        Expira: {formatDateTime(session.expires_at)}
                      </p>
                    </div>

                    {!session.is_current ? (
                      <button
                        type="button"
                        onClick={() => void handleRevokeSession(session)}
                        disabled={revokingSessionId === session.id}
                        className="glass-button-secondary disabled:opacity-50"
                      >
                        <RefreshCw className={cn('w-4 h-4', revokingSessionId === session.id && 'animate-spin')} />
                        {revokingSessionId === session.id ? 'Cerrando...' : 'Cerrar sesión'}
                      </button>
                    ) : null}
                  </div>
                </div>
              ))}
            </div>
          )}
        </CollapsibleSection>
      </div>
    </div>
  );
};
