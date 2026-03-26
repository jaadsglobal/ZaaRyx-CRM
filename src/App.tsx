import React, { Suspense, lazy, useEffect, useState } from 'react';
import { Eye, EyeOff } from 'lucide-react';
import { Sidebar } from './components/Sidebar';
import { BrandMark } from './components/BrandMark';
import {
  AuthFlowResponse,
  AuthTwoFactorChallenge,
  AuthUser,
  DashboardStats,
  InviteActivationInfo,
  PasswordResetInfo,
  PasswordResetRequestResponse,
} from './types';
import { motion, AnimatePresence } from 'motion/react';
import {
  AppSection,
  getAccessibleSections,
  getDefaultSectionForRole,
  getRoleKey,
  sanitizeAccessibleSections,
} from './permissions';
import { getSupabaseBrowserClient, hasSupabaseBrowserAuth } from './lib/supabase';

const Dashboard = lazy(() =>
  import('./components/Dashboard').then((module) => ({ default: module.Dashboard })),
);
const LeadsManager = lazy(() =>
  import('./components/LeadsManager').then((module) => ({ default: module.LeadsManager })),
);
const ClientsManager = lazy(() =>
  import('./components/ClientsManager').then((module) => ({ default: module.ClientsManager })),
);
const ContractsManager = lazy(() =>
  import('./components/ContractsManager').then((module) => ({ default: module.ContractsManager })),
);
const ClientContractsPortal = lazy(() =>
  import('./components/ClientContractsPortal').then((module) => ({
    default: module.ClientContractsPortal,
  })),
);
const FreelancerContractsPortal = lazy(() =>
  import('./components/FreelancerContractsPortal').then((module) => ({
    default: module.FreelancerContractsPortal,
  })),
);
const FreelancerWorkspacePortal = lazy(() =>
  import('./components/FreelancerWorkspacePortal').then((module) => ({
    default: module.FreelancerWorkspacePortal,
  })),
);
const ProjectsKanban = lazy(() =>
  import('./components/ProjectsKanban').then((module) => ({ default: module.ProjectsKanban })),
);
const CampaignsManager = lazy(() =>
  import('./components/CampaignsManager').then((module) => ({ default: module.CampaignsManager })),
);
const FreelancerTasksPortal = lazy(() =>
  import('./components/FreelancerTasksPortal').then((module) => ({
    default: module.FreelancerTasksPortal,
  })),
);
const TasksManager = lazy(() =>
  import('./components/TasksManager').then((module) => ({ default: module.TasksManager })),
);
const ReportsManager = lazy(() =>
  import('./components/ReportsManager').then((module) => ({ default: module.ReportsManager })),
);
const BillingManager = lazy(() =>
  import('./components/BillingManager').then((module) => ({ default: module.BillingManager })),
);
const ClientBillingPortal = lazy(() =>
  import('./components/ClientBillingPortal').then((module) => ({
    default: module.ClientBillingPortal,
  })),
);
const FreelancerBillingPortal = lazy(() =>
  import('./components/FreelancerBillingPortal').then((module) => ({
    default: module.FreelancerBillingPortal,
  })),
);
const ClientOnboardingPortal = lazy(() =>
  import('./components/ClientOnboardingPortal').then((module) => ({
    default: module.ClientOnboardingPortal,
  })),
);
const IntegrationsManager = lazy(() =>
  import('./components/IntegrationsManager').then((module) => ({
    default: module.IntegrationsManager,
  })),
);
const TeamManager = lazy(() =>
  import('./components/TeamManager').then((module) => ({ default: module.TeamManager })),
);
const ZaaRyxAI = lazy(() =>
  import('./components/ZaaRyxAI').then((module) => ({ default: module.ZaaRyxAI })),
);
const SettingsManager = lazy(() =>
  import('./components/SettingsManager').then((module) => ({ default: module.SettingsManager })),
);
const AccountSecurityPortal = lazy(() =>
  import('./components/AccountSecurityPortal').then((module) => ({
    default: module.AccountSecurityPortal,
  })),
);

interface LoginFormState {
  email: string;
  password: string;
}

interface ActivationFormState {
  password: string;
  confirmPassword: string;
}

interface ResetPasswordFormState {
  password: string;
  confirmPassword: string;
}

interface TwoFactorFormState {
  code: string;
}

class ApiError extends Error {
  status: number;

  constructor(message: string, status: number) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
  }
}

const createInitialLoginForm = (): LoginFormState => ({
  email: '',
  password: '',
});

const createInitialActivationForm = (): ActivationFormState => ({
  password: '',
  confirmPassword: '',
});

const createInitialResetPasswordForm = (): ResetPasswordFormState => ({
  password: '',
  confirmPassword: '',
});

const createInitialTwoFactorForm = (): TwoFactorFormState => ({
  code: '',
});

const GoogleIcon = ({ className = 'h-4 w-4' }: { className?: string }) => (
  <svg viewBox="0 0 24 24" aria-hidden="true" className={className}>
    <path
      d="M21.8 12.23c0-.72-.06-1.25-.2-1.8H12.2v3.52h5.52c-.11.87-.7 2.18-2 3.06l-.02.12 2.9 2.2.2.02c1.83-1.65 2.9-4.08 2.9-7.12Z"
      fill="#4285F4"
    />
    <path
      d="M12.2 21.88c2.7 0 4.96-.87 6.62-2.35l-3.15-2.34c-.84.57-1.97.97-3.47.97-2.64 0-4.87-1.7-5.68-4.06l-.12.01-3.02 2.29-.04.11c1.65 3.19 5.04 5.37 8.86 5.37Z"
      fill="#34A853"
    />
    <path
      d="M6.52 14.1A5.8 5.8 0 0 1 6.18 12c0-.72.13-1.41.33-2.1l-.01-.14-3.06-2.32-.1.05A9.68 9.68 0 0 0 2.2 12c0 1.56.38 3.04 1.14 4.46l3.18-2.36Z"
      fill="#FBBC05"
    />
    <path
      d="M12.2 5.84c1.88 0 3.15.8 3.87 1.47l2.82-2.7C17.15 3.05 14.9 2.12 12.2 2.12c-3.82 0-7.21 2.17-8.86 5.37l3.17 2.37c.82-2.36 3.05-4.02 5.69-4.02Z"
      fill="#EA4335"
    />
  </svg>
);

const isTwoFactorChallenge = (value: AuthFlowResponse): value is AuthTwoFactorChallenge =>
  'two_factor_required' in value && value.two_factor_required === true;

const getUrlTokenFromLocation = (key: string) => {
  if (typeof window === 'undefined') {
    return null;
  }

  const token = new URLSearchParams(window.location.search).get(key);
  return token && token.trim().length > 0 ? token.trim() : null;
};

const getInviteTokenFromLocation = () => getUrlTokenFromLocation('invite');
const getResetTokenFromLocation = () => getUrlTokenFromLocation('reset');

const getAuthReturnUrl = () => {
  if (typeof window === 'undefined') {
    return undefined;
  }

  return new URL(window.location.pathname, window.location.origin).toString();
};

const getResponseJson = async <T,>(response: Response): Promise<T> => {
  if (!response.ok) {
    const errorData = (await response.json().catch(() => null)) as { error?: string } | null;
    throw new ApiError(
      errorData?.error || `Request failed with status ${response.status}`,
      response.status,
    );
  }

  return response.json() as Promise<T>;
};

const getLoginErrorMessage = (error: unknown) => {
  if (error instanceof ApiError) {
    if (error.status === 401) {
      return 'Credenciales inválidas. Revisa email y contraseña.';
    }

    if (error.status === 403) {
      return 'Esta cuenta necesita activarse desde la invitación.';
    }

    if (error.status === 404) {
      return 'La API no está disponible en esta instancia. Arranca la app con `npm run dev` o `npm run preview`.';
    }

    if (error.status >= 500) {
      return 'El servidor respondió con un error. Reinicia la app e inténtalo de nuevo.';
    }
  }

  return 'No se pudo conectar con el servidor. Arranca la app con `npm run dev` o `npm run preview`.';
};

const getSupabaseLoginErrorMessage = (message: string) => {
  const normalizedMessage = message.trim().toLowerCase();

  if (normalizedMessage.includes('invalid login credentials')) {
    return 'Credenciales inválidas. Revisa email y contraseña.';
  }

  if (normalizedMessage.includes('email not confirmed')) {
    return 'Tu usuario existe en Supabase, pero el email todavía no está confirmado.';
  }

  if (normalizedMessage.includes('signup is disabled')) {
    return 'El acceso por email y contraseña está desactivado en Supabase.';
  }

  return 'No se pudo iniciar sesión con Supabase.';
};

const getSupabaseOAuthErrorMessage = (message: string) => {
  const normalizedMessage = message.trim().toLowerCase();

  if (normalizedMessage.includes('provider is not enabled')) {
    return 'Google login aún no está habilitado en tu proyecto de Supabase.';
  }

  if (normalizedMessage.includes('unsupported provider')) {
    return 'Supabase no reconoce Google como proveedor activo en esta instancia.';
  }

  if (normalizedMessage.includes('redirect')) {
    return 'La URL de retorno no está autorizada en Supabase Auth.';
  }

  return 'No se pudo iniciar el acceso con Google.';
};

const getSupabaseBridgeErrorMessage = (error: unknown) => {
  if (error instanceof ApiError) {
    if (error.status === 403) {
      return 'Esta cuenta necesita activarse dentro del CRM antes de poder entrar.';
    }

    if (error.status === 404) {
      return 'El usuario existe en Supabase, pero no está dado de alta en el CRM.';
    }

    if (error.status === 409) {
      return 'La cuenta del CRM ya está enlazada a otro usuario de Supabase.';
    }

    if (error.status === 503) {
      return 'El backend no tiene Supabase configurado para aceptar sesiones.';
    }

    return getLoginErrorMessage(error);
  }

  return 'No se pudo completar el acceso entre Supabase y el CRM.';
};

const getActivationErrorMessage = (error: unknown) => {
  if (error instanceof ApiError) {
    if (error.status === 404) {
      return 'La invitación no existe o ya fue usada.';
    }

    if (error.status === 400) {
      return error.message || 'No se pudo activar la cuenta.';
    }

    if (error.status >= 500) {
      return 'El servidor respondió con un error al activar la cuenta.';
    }
  }

  return 'No se pudo validar la invitación en esta instancia.';
};

const getPasswordResetRequestErrorMessage = (error: unknown) => {
  if (error instanceof ApiError) {
    if (error.status === 400) {
      return error.message || 'Necesitamos un email válido para iniciar la recuperación.';
    }

    if (error.status >= 500) {
      return 'El servidor respondió con un error al preparar la recuperación.';
    }
  }

  return 'No se pudo preparar la recuperación de acceso en esta instancia.';
};

const getPasswordResetErrorMessage = (error: unknown) => {
  if (error instanceof ApiError) {
    if (error.status === 404) {
      return 'El enlace de recuperación no existe o ya expiró.';
    }

    if (error.status === 400) {
      return error.message || 'No se pudo restablecer la contraseña.';
    }

    if (error.status >= 500) {
      return 'El servidor respondió con un error al restablecer la contraseña.';
    }
  }

  return 'No se pudo completar la recuperación en esta instancia.';
};

const getTwoFactorErrorMessage = (error: unknown) => {
  if (error instanceof ApiError) {
    if (error.status === 401) {
      return 'El código 2FA no es válido.';
    }

    if (error.status === 404) {
      return 'La validación 2FA expiró. Vuelve a iniciar sesión.';
    }

    if (error.status === 400) {
      return error.message || 'No se pudo validar el segundo factor.';
    }
  }

  return 'No se pudo completar la validación del segundo factor.';
};

const getResolvedAccessibleSections = (user: AuthUser | null): AppSection[] =>
  user
    ? sanitizeAccessibleSections(
        user.accessible_sections?.length > 0
          ? user.accessible_sections
          : getAccessibleSections(user.role),
      )
    : (['dashboard'] as AppSection[]);

const getResolvedDefaultSection = (user: AuthUser | null): AppSection => {
  const accessibleSections = getResolvedAccessibleSections(user);
  return accessibleSections[0] || (user ? getDefaultSectionForRole(user.role) : 'dashboard');
};

export default function App() {
  const [activeTab, setActiveTab] = useState('dashboard');
  const [stats, setStats] = useState<DashboardStats | null>(null);
  const [currentUser, setCurrentUser] = useState<AuthUser | null>(null);
  const [authMode, setAuthMode] = useState<'login' | 'forgot'>('login');
  const [authChecking, setAuthChecking] = useState(true);
  const [authLoading, setAuthLoading] = useState(false);
  const [authMessage, setAuthMessage] = useState<string | null>(null);
  const [resetPreviewUrl, setResetPreviewUrl] = useState<string | null>(null);
  const [showLoginPassword, setShowLoginPassword] = useState(false);

  const exchangeSupabaseSession = async (accessToken: string) => {
    const response = await fetch('/api/auth/supabase/session', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        access_token: accessToken,
      }),
    });

    return getResponseJson<AuthFlowResponse>(response);
  };

  const maybeRestoreLocalSessionFromSupabase = async () => {
    const supabase = getSupabaseBrowserClient();

    if (!supabase) {
      return null;
    }

    const { data, error } = await supabase.auth.getSession();

    if (error || !data.session?.access_token) {
      return null;
    }

    try {
      return await exchangeSupabaseSession(data.session.access_token);
    } catch (restoreError) {
      if (restoreError instanceof ApiError && restoreError.status === 401) {
        await supabase.auth.signOut();
        return null;
      }

      if (
        restoreError instanceof ApiError &&
        [403, 404, 409].includes(restoreError.status)
      ) {
        setAuthMessage(getSupabaseBridgeErrorMessage(restoreError));
        await supabase.auth.signOut();
        return null;
      }

      throw restoreError;
    }
  };
  const [loginForm, setLoginForm] = useState<LoginFormState>(createInitialLoginForm());
  const [inviteToken, setInviteToken] = useState<string | null>(getInviteTokenFromLocation);
  const [inviteInfo, setInviteInfo] = useState<InviteActivationInfo | null>(null);
  const [inviteChecking, setInviteChecking] = useState(false);
  const [activationLoading, setActivationLoading] = useState(false);
  const [activationForm, setActivationForm] = useState<ActivationFormState>(
    createInitialActivationForm(),
  );
  const [resetToken, setResetToken] = useState<string | null>(getResetTokenFromLocation);
  const [resetInfo, setResetInfo] = useState<PasswordResetInfo | null>(null);
  const [resetChecking, setResetChecking] = useState(false);
  const [resetLoading, setResetLoading] = useState(false);
  const [resetForm, setResetForm] = useState<ResetPasswordFormState>(
    createInitialResetPasswordForm(),
  );
  const [pendingTwoFactorChallenge, setPendingTwoFactorChallenge] =
    useState<AuthTwoFactorChallenge | null>(null);
  const [twoFactorForm, setTwoFactorForm] = useState<TwoFactorFormState>(createInitialTwoFactorForm);
  const accessibleSections = getResolvedAccessibleSections(currentUser);
  const currentUserRoleKey = currentUser ? getRoleKey(currentUser.role) : null;
  const isClientPortalUser = currentUserRoleKey === 'client';
  const isFreelancerPortalUser = currentUserRoleKey === 'freelancer';
  const hasPriorityAuthToken = Boolean(inviteToken || resetToken);

  const resolveNavigationTarget = (nextTab: string): AppSection => {
    const fallbackSection = getResolvedDefaultSection(currentUser);
    const directTarget = nextTab as AppSection;

    if (accessibleSections.includes(directTarget)) {
      return directTarget;
    }

    const legacyFallbacks: Record<string, AppSection[]> = {
      referrals: ['clients', 'reports', 'dashboard'],
      client_referrals: ['billing', 'contracts', 'reports', 'dashboard'],
      freelancer_referrals: ['billing', 'contracts', 'projects', 'dashboard'],
    };

    const resolvedLegacyTarget = legacyFallbacks[nextTab]?.find((section) =>
      accessibleSections.includes(section),
    );

    return resolvedLegacyTarget || fallbackSection;
  };

  const handleCurrentUserPatch = (patch: Partial<AuthUser>) => {
    setCurrentUser((current) => (current ? { ...current, ...patch } : current));
  };

  const loadCurrentUser = async () => {
    try {
      const response = await fetch('/api/auth/me');

      if (response.status === 401) {
        const restoredSession = await maybeRestoreLocalSessionFromSupabase();

        if (restoredSession) {
          handleAuthFlowResponse(restoredSession);
          return;
        }

        setCurrentUser(null);
        return;
      }

      const data = await getResponseJson<AuthUser>(response);
      setCurrentUser(data);
    } catch (error) {
      console.error('Error fetching current user:', error);
      setCurrentUser(null);
    } finally {
      setAuthChecking(false);
    }
  };

  const loadStats = async () => {
    try {
      const response = await fetch('/api/stats');

      if (response.status === 401) {
        setCurrentUser(null);
        setStats(null);
        return;
      }

      if (!response.ok) {
        throw new Error(`Stats request failed with ${response.status}`);
      }

      const data = await response.json();
      setStats(data);
    } catch (error) {
      console.error('Error fetching stats:', error);
    }
  };

  useEffect(() => {
    void loadCurrentUser();
  }, []);

  useEffect(() => {
    if (!inviteToken || resetToken) {
      setInviteInfo(null);
      setInviteChecking(false);
      return;
    }

    let cancelled = false;

    const loadInviteInfo = async () => {
      setInviteChecking(true);
      setAuthMessage(null);

      try {
        const response = await fetch(`/api/auth/invite/${encodeURIComponent(inviteToken)}`);
        const data = await getResponseJson<InviteActivationInfo>(response);

        if (!cancelled) {
          setInviteInfo(data);
        }
      } catch (error) {
        console.error('Error fetching invite info:', error);

        if (!cancelled) {
          setInviteInfo(null);
          setAuthMessage(getActivationErrorMessage(error));
        }
      } finally {
        if (!cancelled) {
          setInviteChecking(false);
        }
      }
    };

    void loadInviteInfo();

    return () => {
      cancelled = true;
    };
  }, [inviteToken, resetToken]);

  useEffect(() => {
    if (!resetToken || inviteToken) {
      setResetInfo(null);
      setResetChecking(false);
      return;
    }

    let cancelled = false;

    const loadResetInfo = async () => {
      setResetChecking(true);
      setAuthMessage(null);

      try {
        const response = await fetch(
          `/api/auth/password-reset/${encodeURIComponent(resetToken)}`,
        );
        const data = await getResponseJson<PasswordResetInfo>(response);

        if (!cancelled) {
          setResetInfo(data);
        }
      } catch (error) {
        console.error('Error fetching password reset info:', error);

        if (!cancelled) {
          setResetInfo(null);
          setAuthMessage(getPasswordResetErrorMessage(error));
        }
      } finally {
        if (!cancelled) {
          setResetChecking(false);
        }
      }
    };

    void loadResetInfo();

    return () => {
      cancelled = true;
    };
  }, [inviteToken, resetToken]);

  useEffect(() => {
    if (currentUser) {
      void loadStats();
    } else {
      setStats(null);
    }
  }, [currentUser]);

  useEffect(() => {
    if (!currentUser) {
      return;
    }

    if (!accessibleSections.includes(activeTab as AppSection)) {
      setActiveTab(getResolvedDefaultSection(currentUser));
    }
  }, [accessibleSections, activeTab, currentUser]);

  const finalizeAuthenticatedUser = (user: AuthUser) => {
    setCurrentUser(user);
    setActiveTab(getResolvedDefaultSection(user));
    setPendingTwoFactorChallenge(null);
    setTwoFactorForm(createInitialTwoFactorForm());
  };

  const handleAuthFlowResponse = (
    result: AuthFlowResponse,
    options?: {
      clearResetMode?: boolean;
      clearInviteMode?: boolean;
    },
  ) => {
    if (isTwoFactorChallenge(result)) {
      setPendingTwoFactorChallenge(result);
      setTwoFactorForm(createInitialTwoFactorForm());

      if (options?.clearResetMode) {
        clearResetMode();
      }

      if (options?.clearInviteMode) {
        clearInviteMode();
      }

      return;
    }

    finalizeAuthenticatedUser(result);

    if (options?.clearResetMode) {
      clearResetMode();
    }

    if (options?.clearInviteMode) {
      clearInviteMode();
    }
  };

  const handleLogin = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setAuthLoading(true);
    setAuthMessage(null);
    setResetPreviewUrl(null);

    try {
      const normalizedEmail = loginForm.email.trim();
      let result: AuthFlowResponse;

      if (hasSupabaseBrowserAuth()) {
        const supabase = getSupabaseBrowserClient();

        if (!supabase) {
          throw new Error('Supabase auth client is not available');
        }

        const { data, error } = await supabase.auth.signInWithPassword({
          email: normalizedEmail,
          password: loginForm.password,
        });

        if (error) {
          setAuthMessage(getSupabaseLoginErrorMessage(error.message));
          return;
        }

        if (!data.session?.access_token) {
          setAuthMessage('Supabase no devolvió una sesión válida.');
          return;
        }

        try {
          result = await exchangeSupabaseSession(data.session.access_token);
        } catch (bridgeError) {
          await supabase.auth.signOut();
          setAuthMessage(getSupabaseBridgeErrorMessage(bridgeError));
          return;
        }
      } else {
        const response = await fetch('/api/auth/login', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify(loginForm),
        });

        result = await getResponseJson<AuthFlowResponse>(response);
      }

      handleAuthFlowResponse(result);
      setAuthMode('login');
      setLoginForm((currentForm) => ({
        ...currentForm,
        password: '',
      }));
    } catch (error) {
      console.error('Error logging in:', error);
      setAuthMessage(getLoginErrorMessage(error));
    } finally {
      setAuthLoading(false);
    }
  };

  const handleGoogleLogin = () => {
    void (async () => {
      setAuthLoading(true);
      setAuthMessage(null);
      setResetPreviewUrl(null);

      try {
        const supabase = getSupabaseBrowserClient();

        if (!supabase) {
          setAuthMessage('Supabase Auth no está configurado en el navegador.');
          return;
        }

        const { error } = await supabase.auth.signInWithOAuth({
          provider: 'google',
          options: {
            redirectTo: getAuthReturnUrl(),
          },
        });

        if (error) {
          setAuthMessage(getSupabaseOAuthErrorMessage(error.message));
        }
      } catch (error) {
        console.error('Error starting Google login:', error);
        setAuthMessage('No se pudo iniciar el acceso con Google.');
      } finally {
        setAuthLoading(false);
      }
    })();
  };

  const clearInviteMode = () => {
    setInviteToken(null);
    setInviteInfo(null);
    setActivationForm(createInitialActivationForm());
    setAuthMessage(null);
    setResetPreviewUrl(null);
    window.history.replaceState({}, '', window.location.pathname);
  };

  const clearResetMode = () => {
    setResetToken(null);
    setResetInfo(null);
    setResetForm(createInitialResetPasswordForm());
    setAuthMessage(null);
    setResetPreviewUrl(null);
    setAuthMode('login');
    window.history.replaceState({}, '', window.location.pathname);
  };

  const clearTwoFactorMode = () => {
    setPendingTwoFactorChallenge(null);
    setTwoFactorForm(createInitialTwoFactorForm());
    setAuthMessage(null);
  };

  const handleActivateAccount = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();

    if (!inviteToken) {
      setAuthMessage('No hay una invitación válida para activar.');
      return;
    }

    if (activationForm.password.length < 8) {
      setAuthMessage('La contraseña debe tener al menos 8 caracteres.');
      return;
    }

    if (activationForm.password !== activationForm.confirmPassword) {
      setAuthMessage('Las contraseñas no coinciden.');
      return;
    }

    setActivationLoading(true);
    setAuthMessage(null);

    try {
      const response = await fetch('/api/auth/activate', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          token: inviteToken,
          password: activationForm.password,
        }),
      });

      const user = await getResponseJson<AuthUser>(response);
      setCurrentUser(user);
      setActiveTab(getResolvedDefaultSection(user));
      setActivationForm(createInitialActivationForm());
      clearInviteMode();
    } catch (error) {
      console.error('Error activating account:', error);
      setAuthMessage(getActivationErrorMessage(error));
    } finally {
      setActivationLoading(false);
    }
  };

  const handleLogout = () => {
    void (async () => {
      const supabase = getSupabaseBrowserClient();

      try {
        await fetch('/api/auth/logout', {
          method: 'POST',
        });
      } catch (error) {
        console.error('Error logging out:', error);
      } finally {
        if (supabase) {
          await supabase.auth.signOut().catch((error) => {
            console.error('Error logging out from Supabase:', error);
          });
        }

        setCurrentUser(null);
        setStats(null);
        setActiveTab('dashboard');
      }
    })();
  };

  const handleRequestPasswordReset = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();

    if (!loginForm.email.trim()) {
      setAuthMessage('Introduce tu email para iniciar la recuperación.');
      return;
    }

    setAuthLoading(true);
    setAuthMessage(null);
    setResetPreviewUrl(null);

    try {
      const response = await fetch('/api/auth/password/forgot', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          email: loginForm.email.trim(),
        }),
      });

      const result = await getResponseJson<PasswordResetRequestResponse>(response);
      setAuthMessage(result.message);
      setResetPreviewUrl(result.preview_url || null);
    } catch (error) {
      console.error('Error requesting password reset:', error);
      setAuthMessage(getPasswordResetRequestErrorMessage(error));
    } finally {
      setAuthLoading(false);
    }
  };

  const handleResetPassword = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();

    if (!resetToken) {
      setAuthMessage('No hay un enlace de recuperación válido.');
      return;
    }

    if (resetForm.password.length < 8) {
      setAuthMessage('La contraseña debe tener al menos 8 caracteres.');
      return;
    }

    if (resetForm.password !== resetForm.confirmPassword) {
      setAuthMessage('Las contraseñas no coinciden.');
      return;
    }

    setResetLoading(true);
    setAuthMessage(null);

    try {
      const response = await fetch('/api/auth/password/reset', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          token: resetToken,
          password: resetForm.password,
        }),
      });

      const result = await getResponseJson<AuthFlowResponse>(response);
      setResetForm(createInitialResetPasswordForm());
      handleAuthFlowResponse(result, { clearResetMode: true });
    } catch (error) {
      console.error('Error resetting password:', error);
      setAuthMessage(getPasswordResetErrorMessage(error));
    } finally {
      setResetLoading(false);
    }
  };

  const handleVerifyTwoFactor = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();

    if (!pendingTwoFactorChallenge?.challenge_token) {
      setAuthMessage('No hay una validación 2FA pendiente.');
      return;
    }

    if (!twoFactorForm.code.trim()) {
      setAuthMessage('Introduce tu código 2FA o un código de respaldo.');
      return;
    }

    setAuthLoading(true);
    setAuthMessage(null);

    try {
      const response = await fetch('/api/auth/login/2fa', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          challenge_token: pendingTwoFactorChallenge.challenge_token,
          code: twoFactorForm.code.trim(),
        }),
      });

      const user = await getResponseJson<AuthUser>(response);
      finalizeAuthenticatedUser(user);
      setLoginForm((currentForm) => ({
        ...currentForm,
        password: '',
      }));
    } catch (error) {
      console.error('Error verifying 2FA:', error);
      setAuthMessage(getTwoFactorErrorMessage(error));
    } finally {
      setAuthLoading(false);
    }
  };

  const isActivationMode = Boolean(inviteToken && inviteInfo);
  const isResetMode = Boolean(resetToken && resetInfo);
  const isInvalidResetMode = Boolean(resetToken && !resetInfo && !resetChecking);
  const isTwoFactorMode = Boolean(pendingTwoFactorChallenge);
  const canUseGoogleLogin =
    !isActivationMode &&
    !isResetMode &&
    !isInvalidResetMode &&
    !isTwoFactorMode &&
    authMode === 'login' &&
    hasSupabaseBrowserAuth();

  const handleNavigate = (nextTab: string) => {
    if (!currentUser) {
      return;
    }

    setActiveTab(resolveNavigationTarget(nextTab));
  };

  const routeLoader = (
    <div className="flex items-center justify-center min-h-[60vh]">
      <div className="glass-panel px-6 py-5 text-center space-y-2 min-w-[280px]">
        <p className="text-sm uppercase tracking-[0.2em] text-white/30 font-bold">
          Cargando
        </p>
        <p className="text-white/60">Preparando el módulo seleccionado...</p>
      </div>
    </div>
  );

  const authLoader = (
    <div className="min-h-screen flex items-center justify-center p-8">
      <div className="glass-panel max-w-md w-full p-8 text-center space-y-3">
        <h2 className="text-2xl font-bold">Validando sesión</h2>
        <p className="text-white/50">Comprobando acceso y restaurando tu espacio de trabajo.</p>
      </div>
    </div>
  );

  const renderContent = () => {
    switch (activeTab) {
      case 'dashboard':
        return (
          <Dashboard
            stats={stats}
            onNavigate={handleNavigate}
            onRefreshStats={loadStats}
            accessibleSections={accessibleSections}
            currentUserName={currentUser?.name || 'Usuario'}
            currentUserRole={currentUser?.role || ''}
          />
        );
      case 'leads':
        return <LeadsManager onNavigate={handleNavigate} />;
      case 'clients':
        return <ClientsManager />;
      case 'contracts':
        return isClientPortalUser ? (
          <ClientContractsPortal />
        ) : isFreelancerPortalUser ? (
          <FreelancerContractsPortal />
        ) : (
          <ContractsManager />
        );
      case 'onboarding':
        return <ClientOnboardingPortal />;
      case 'projects':
        return isFreelancerPortalUser ? <FreelancerWorkspacePortal /> : <ProjectsKanban />;
      case 'tasks':
        return isFreelancerPortalUser ? <FreelancerTasksPortal /> : <TasksManager />;
      case 'campaigns':
        return <CampaignsManager />;
      case 'reports':
        return <ReportsManager readOnly={isClientPortalUser} />;
      case 'billing':
        return isClientPortalUser ? (
          <ClientBillingPortal />
        ) : isFreelancerPortalUser ? (
          <FreelancerBillingPortal />
        ) : (
          <BillingManager />
        );
      case 'integrations':
        return <IntegrationsManager />;
      case 'team':
        return <TeamManager />;
      case 'ai':
        return <ZaaRyxAI accessibleSections={accessibleSections} />;
      case 'settings':
        return isClientPortalUser || isFreelancerPortalUser ? (
          <AccountSecurityPortal
            currentUser={currentUser}
            onCurrentUserPatch={handleCurrentUserPatch}
          />
        ) : (
          <SettingsManager />
        );
      default:
        return (
          <div className="flex flex-col items-center justify-center h-[60vh] text-center space-y-4">
            <div className="w-20 h-20 bg-white/5 rounded-full flex items-center justify-center border border-white/10">
              <span className="text-4xl">🚧</span>
            </div>
            <h2 className="text-2xl font-bold">Módulo en Construcción</h2>
            <p className="text-white/40 max-w-md">
              Estamos trabajando duro para traerte la mejor experiencia en {activeTab}.
              Vuelve pronto para ver las novedades.
            </p>
          </div>
        );
    }
  };

  if ((authChecking && !hasPriorityAuthToken) || Boolean(inviteToken && inviteChecking) || Boolean(resetToken && resetChecking)) {
    return authLoader;
  }

  return currentUser && !hasPriorityAuthToken ? (
    <div className="min-h-screen flex">
      <Sidebar
        activeTab={activeTab}
        setActiveTab={handleNavigate}
        onLogout={handleLogout}
        accessibleSections={accessibleSections}
        currentUserRole={currentUser.role}
      />

      <main className="flex-1 min-w-0 ml-64 p-8 min-h-screen overflow-x-hidden">
        <div className="mb-6 flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
          <div>
            <p className="text-xs uppercase tracking-[0.2em] text-white/30 font-bold">
              Sesión activa
            </p>
            <h1 className="text-xl font-bold">{currentUser.name}</h1>
          </div>
          <div className="text-right">
            <p className="text-sm text-brand-cyan font-medium">{currentUser.role}</p>
            <p className="text-xs text-white/40">{currentUser.email}</p>
          </div>
        </div>

        <AnimatePresence mode="wait">
          <motion.div
            key={activeTab}
            initial={{ opacity: 0, x: 20 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: -20 }}
            transition={{ duration: 0.3, ease: 'easeOut' }}
          >
            <Suspense fallback={routeLoader}>
              {renderContent()}
            </Suspense>
          </motion.div>
        </AnimatePresence>
      </main>
    </div>
  ) : (
    <div className="min-h-screen flex items-center justify-center p-8">
      <motion.form
        initial={{ opacity: 0, y: 24 }}
        animate={{ opacity: 1, y: 0 }}
        onSubmit={
          isActivationMode
            ? handleActivateAccount
            : isResetMode
              ? handleResetPassword
              : isTwoFactorMode
                ? handleVerifyTwoFactor
                : authMode === 'forgot'
                  ? handleRequestPasswordReset
                  : handleLogin
        }
        className="glass-panel max-w-md w-full p-8 space-y-5"
      >
        <div className="space-y-2 text-center">
          <BrandMark className="w-16 h-16 mx-auto" iconClassName="w-[3.8rem] h-[3.8rem]" />
          <h2 className="text-2xl font-bold">
            {isActivationMode
              ? 'Activar cuenta'
              : isResetMode
                ? 'Restablecer acceso'
                : isTwoFactorMode
                  ? 'Confirmar 2FA'
                  : isInvalidResetMode
                    ? 'Enlace inválido'
                    : authMode === 'forgot'
                    ? 'Recuperar acceso'
                    : 'Iniciar sesión'}
          </h2>
          <p className="text-white/50">
            {isActivationMode
              ? 'Completa tu acceso inicial con la invitacion recibida.'
              : isResetMode
                ? 'Define una nueva contraseña y recupera tu sesión.'
                : isTwoFactorMode
                  ? 'Introduce el código de tu app autenticadora o un código de respaldo.'
                  : isInvalidResetMode
                    ? 'El enlace de recuperación no es válido o ya expiró.'
                    : authMode === 'forgot'
                    ? 'Genera un enlace temporal para restablecer tu contraseña.'
                    : 'Accede al CRM con un usuario real del sistema.'}
          </p>
        </div>

        {authMessage ? (
          <div className="glass-panel p-3 text-sm text-red-400">
            {authMessage}
          </div>
        ) : null}

        {isActivationMode && inviteInfo ? (
          <>
            <div className="glass-panel p-4 space-y-3">
              <div>
                <p className="text-xs font-bold uppercase tracking-wider text-white/35">Nombre</p>
                <p className="text-sm text-white/80">{inviteInfo.name}</p>
              </div>
              <div>
                <p className="text-xs font-bold uppercase tracking-wider text-white/35">Email</p>
                <p className="text-sm text-white/80">{inviteInfo.email}</p>
              </div>
              <div>
                <p className="text-xs font-bold uppercase tracking-wider text-white/35">Rol</p>
                <p className="text-sm text-brand-cyan">{inviteInfo.role}</p>
              </div>
            </div>

            <div>
              <label className="block text-xs font-bold uppercase tracking-wider text-white/40 mb-2">
                Nueva contraseña
              </label>
              <input
                required
                type="password"
                value={activationForm.password}
                onChange={(event) =>
                  setActivationForm((currentForm) => ({
                    ...currentForm,
                    password: event.target.value,
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
                value={activationForm.confirmPassword}
                onChange={(event) =>
                  setActivationForm((currentForm) => ({
                    ...currentForm,
                    confirmPassword: event.target.value,
                  }))
                }
                className="w-full glass-input"
                placeholder="Repite la contraseña"
              />
            </div>
          </>
        ) : isResetMode && resetInfo ? (
          <>
            <div className="glass-panel p-4 space-y-3">
              <div>
                <p className="text-xs font-bold uppercase tracking-wider text-white/35">Nombre</p>
                <p className="text-sm text-white/80">{resetInfo.name}</p>
              </div>
              <div>
                <p className="text-xs font-bold uppercase tracking-wider text-white/35">Email</p>
                <p className="text-sm text-white/80">{resetInfo.email}</p>
              </div>
              {resetInfo.expires_at ? (
                <div>
                  <p className="text-xs font-bold uppercase tracking-wider text-white/35">
                    Expira
                  </p>
                  <p className="text-sm text-brand-cyan">
                    {new Date(resetInfo.expires_at).toLocaleString('es-ES')}
                  </p>
                </div>
              ) : null}
            </div>

            <div>
              <label className="block text-xs font-bold uppercase tracking-wider text-white/40 mb-2">
                Nueva contraseña
              </label>
              <input
                required
                type="password"
                value={resetForm.password}
                onChange={(event) =>
                  setResetForm((currentForm) => ({
                    ...currentForm,
                    password: event.target.value,
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
                value={resetForm.confirmPassword}
                onChange={(event) =>
                  setResetForm((currentForm) => ({
                    ...currentForm,
                    confirmPassword: event.target.value,
                  }))
                }
                className="w-full glass-input"
                placeholder="Repite la contraseña"
              />
            </div>
          </>
        ) : isTwoFactorMode && pendingTwoFactorChallenge ? (
          <>
            <div className="glass-panel p-4 space-y-3">
              <div>
                <p className="text-xs font-bold uppercase tracking-wider text-white/35">Usuario</p>
                <p className="text-sm text-white/80">{pendingTwoFactorChallenge.name}</p>
              </div>
              <div>
                <p className="text-xs font-bold uppercase tracking-wider text-white/35">Email</p>
                <p className="text-sm text-white/80">{pendingTwoFactorChallenge.email}</p>
              </div>
              <div>
                <p className="text-xs font-bold uppercase tracking-wider text-white/35">Expira</p>
                <p className="text-sm text-brand-cyan">
                  {new Date(pendingTwoFactorChallenge.challenge_expires_at).toLocaleString('es-ES')}
                </p>
              </div>
            </div>

            <div>
              <label className="block text-xs font-bold uppercase tracking-wider text-white/40 mb-2">
                Código 2FA o respaldo
              </label>
              <input
                required
                type="text"
                value={twoFactorForm.code}
                onChange={(event) =>
                  setTwoFactorForm({
                    code: event.target.value,
                  })
                }
                className="w-full glass-input"
                placeholder="123456 o AAAA-BBBB"
                autoComplete="one-time-code"
              />
            </div>
          </>
        ) : isInvalidResetMode ? (
          <div className="glass-panel p-4 text-sm text-white/55">
            Pide un nuevo enlace de recuperación desde el acceso normal si este ya no sirve.
          </div>
        ) : authMode === 'forgot' ? (
          <>
            <div>
              <label className="block text-xs font-bold uppercase tracking-wider text-white/40 mb-2">
                Email
              </label>
              <input
                required
                type="email"
                value={loginForm.email}
                onChange={(event) =>
                  setLoginForm((currentForm) => ({
                    ...currentForm,
                    email: event.target.value,
                  }))
                }
                className="w-full glass-input"
                placeholder="tu@empresa.com"
              />
            </div>

            {resetPreviewUrl ? (
              <div className="glass-panel p-4 space-y-3">
                <p className="text-sm text-white/75">
                  En esta instancia local no hay envío de email todavía. Puedes abrir el enlace
                  de recuperación directamente.
                </p>
                <button
                  type="button"
                  onClick={() => {
                    window.location.href = resetPreviewUrl;
                  }}
                  className="glass-button-secondary w-full justify-center"
                >
                  Abrir enlace de recuperación
                </button>
                <p className="text-[11px] text-white/35 break-all">{resetPreviewUrl}</p>
              </div>
            ) : null}
          </>
        ) : (
          <>
            <div>
              <label className="block text-xs font-bold uppercase tracking-wider text-white/40 mb-2">
                Email
              </label>
              <input
                required
                type="email"
                value={loginForm.email}
                onChange={(event) =>
                  setLoginForm((currentForm) => ({
                    ...currentForm,
                    email: event.target.value,
                  }))
                }
                className="w-full glass-input"
                placeholder="admin@zaaryx.com"
              />
            </div>

            <div>
              <label className="block text-xs font-bold uppercase tracking-wider text-white/40 mb-2">
                Contraseña
              </label>
              <div className="relative">
                <input
                  required
                  type={showLoginPassword ? 'text' : 'password'}
                  value={loginForm.password}
                  onChange={(event) =>
                    setLoginForm((currentForm) => ({
                      ...currentForm,
                      password: event.target.value,
                    }))
                  }
                  className="w-full glass-input pr-12"
                  placeholder="Tu contraseña"
                />
                <button
                  type="button"
                  onClick={() => setShowLoginPassword((current) => !current)}
                  className="absolute inset-y-0 right-0 flex items-center justify-center px-3 text-white/50 transition hover:text-white/80"
                  aria-label={showLoginPassword ? 'Ocultar contraseña' : 'Mostrar contraseña'}
                  aria-pressed={showLoginPassword}
                >
                  {showLoginPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                </button>
              </div>
            </div>

            {canUseGoogleLogin ? (
              <div className="space-y-3">
                <div className="flex items-center gap-3 text-[11px] uppercase tracking-[0.22em] text-white/30">
                  <div className="h-px flex-1 bg-white/10" />
                  <span>o</span>
                  <div className="h-px flex-1 bg-white/10" />
                </div>
                <button
                  type="button"
                  onClick={handleGoogleLogin}
                  disabled={authLoading}
                  className="glass-button-secondary w-full justify-center disabled:cursor-not-allowed disabled:opacity-50"
                >
                  <GoogleIcon className="h-4 w-4" />
                  {authLoading ? 'Redirigiendo a Google...' : 'Continuar con Google'}
                </button>
              </div>
            ) : null}
          </>
        )}

        {!isInvalidResetMode ? (
          <button
            type="submit"
            disabled={authLoading || activationLoading || resetLoading}
            className="glass-button-primary w-full justify-center disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {isActivationMode
              ? activationLoading
                ? 'Activando...'
                : 'Activar cuenta'
              : isResetMode
                ? resetLoading
                  ? 'Restableciendo...'
                  : 'Restablecer contraseña'
                : isTwoFactorMode
                  ? authLoading
                    ? 'Validando...'
                    : 'Validar acceso'
                : authMode === 'forgot'
                  ? authLoading
                    ? 'Preparando...'
                    : 'Generar enlace'
                  : authLoading
                    ? 'Entrando...'
                    : 'Entrar'}
          </button>
        ) : null}

        {isActivationMode ? (
          <button
            type="button"
            onClick={clearInviteMode}
            className="w-full text-xs text-white/40 hover:text-white transition-colors"
          >
            Volver al acceso normal
          </button>
        ) : isResetMode || isInvalidResetMode ? (
          <button
            type="button"
            onClick={clearResetMode}
            className="w-full text-xs text-white/40 hover:text-white transition-colors"
          >
            Volver al acceso normal
          </button>
        ) : isTwoFactorMode ? (
          <button
            type="button"
            onClick={clearTwoFactorMode}
            className="w-full text-xs text-white/40 hover:text-white transition-colors"
          >
            Cancelar validación 2FA
          </button>
        ) : authMode === 'forgot' ? (
          <button
            type="button"
            onClick={() => {
              setAuthMode('login');
              setAuthMessage(null);
              setResetPreviewUrl(null);
            }}
            className="w-full text-xs text-white/40 hover:text-white transition-colors"
          >
            Volver al acceso normal
          </button>
        ) : (
          <>
            <button
              type="button"
              onClick={() => {
                setAuthMode('forgot');
                setAuthMessage(null);
                setResetPreviewUrl(null);
              }}
              className="w-full text-xs text-white/40 hover:text-white transition-colors"
            >
              ¿Olvidaste tu contraseña?
            </button>
            <p className="text-xs text-center text-white/35">
              Acceso inicial local: `admin@zaaryx.com` / `admin123`
            </p>
          </>
        )}
      </motion.form>
    </div>
  );
}
