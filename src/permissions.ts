export type AppSection =
  | 'dashboard'
  | 'leads'
  | 'clients'
  | 'client_referrals'
  | 'freelancer_referrals'
  | 'referrals'
  | 'contracts'
  | 'onboarding'
  | 'projects'
  | 'tasks'
  | 'campaigns'
  | 'reports'
  | 'billing'
  | 'integrations'
  | 'ai'
  | 'team'
  | 'settings';

const deprecatedSections: AppSection[] = ['client_referrals', 'freelancer_referrals', 'referrals'];

type RoleKey =
  | 'admin'
  | 'project_manager'
  | 'media_buyer'
  | 'ai_specialist'
  | 'account'
  | 'finance'
  | 'client'
  | 'freelancer'
  | 'viewer';

const allSections: AppSection[] = [
  'dashboard',
  'leads',
  'clients',
  'contracts',
  'projects',
  'tasks',
  'campaigns',
  'reports',
  'billing',
  'integrations',
  'ai',
  'team',
  'settings',
];

const roleSections: Record<RoleKey, AppSection[]> = {
  admin: allSections,
  project_manager: [
    'dashboard',
    'clients',
    'contracts',
    'projects',
    'tasks',
    'campaigns',
    'reports',
    'integrations',
    'ai',
  ],
  media_buyer: ['dashboard', 'projects', 'tasks', 'campaigns', 'reports', 'integrations', 'ai'],
  ai_specialist: ['dashboard', 'tasks', 'campaigns', 'reports', 'integrations', 'ai'],
  account: ['dashboard', 'leads', 'clients', 'contracts', 'reports', 'integrations', 'ai'],
  finance: ['dashboard', 'clients', 'contracts', 'billing', 'reports'],
  client: ['dashboard', 'contracts', 'onboarding', 'reports', 'billing', 'settings'],
  freelancer: ['dashboard', 'projects', 'tasks', 'contracts', 'billing', 'settings'],
  viewer: ['dashboard', 'reports'],
};

const normalizeRole = (role: string) =>
  role
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .trim()
    .toLowerCase();

export const getRoleKey = (role: string): RoleKey => {
  const normalized = normalizeRole(role);

  if (['administrador', 'admin', 'administrator'].includes(normalized)) {
    return 'admin';
  }

  if (
    ['project manager', 'project lead', 'gerente de proyectos', 'project_manager'].includes(
      normalized,
    )
  ) {
    return 'project_manager';
  }

  if (['media buyer', 'traffic manager', 'media_buyer'].includes(normalized)) {
    return 'media_buyer';
  }

  if (
    ['ai specialist', 'ia specialist', 'especialista ai', 'especialista ia', 'ai_specialist'].includes(
      normalized,
    )
  ) {
    return 'ai_specialist';
  }

  if (
    [
      'account manager',
      'sales',
      'sales manager',
      'business development',
      'closer',
      'account',
    ].includes(normalized)
  ) {
    return 'account';
  }

  if (['finance', 'finanzas', 'finance manager', 'controller'].includes(normalized)) {
    return 'finance';
  }

  if (['client', 'cliente', 'customer'].includes(normalized)) {
    return 'client';
  }

  if (['freelancer', 'freelance', 'contractor', 'colaborador'].includes(normalized)) {
    return 'freelancer';
  }

  return 'viewer';
};

export const getAccessibleSections = (role: string) => roleSections[getRoleKey(role)];

export const sanitizeAccessibleSections = (sections: readonly AppSection[]) =>
  Array.from(new Set(sections.filter((section) => !deprecatedSections.includes(section))));

export const canAccessSection = (role: string, section: AppSection) =>
  sanitizeAccessibleSections(getAccessibleSections(role)).includes(section);

export const getDefaultSectionForRole = (role: string): AppSection =>
  sanitizeAccessibleSections(getAccessibleSections(role))[0] || 'dashboard';
