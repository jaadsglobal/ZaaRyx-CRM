import type { AppSection } from './permissions';
import { type ClassValue, clsx } from 'clsx';
import { twMerge } from 'tailwind-merge';

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export interface Lead {
  id: number;
  name: string;
  company: string;
  email: string;
  phone: string;
  source: string;
  service: string;
  budget: number;
  status: 'new' | 'contacted' | 'meeting' | 'diagnosis' | 'proposal' | 'negotiation' | 'closed' | 'lost';
  assigned_to?: number;
  next_action?: string | null;
  next_contact_date?: string | null;
  last_contacted_at?: string | null;
  archived_at?: string | null;
  created_at: string;
}

export interface LeadNote {
  id: number;
  lead_id: number;
  author_id?: number | null;
  author_name: string;
  type: 'note' | 'call' | 'email' | 'meeting' | 'whatsapp';
  content: string;
  created_at: string;
}

export interface Client {
  id: number;
  lead_id?: number;
  company: string;
  industry: string;
  budget: number;
  status: 'active' | 'inactive';
  archived_at?: string | null;
  created_at: string;
}

export interface ClientOnboardingStep {
  id: number;
  onboarding_id: number;
  task_id?: number | null;
  title: string;
  description: string;
  status: 'pending' | 'in_progress' | 'completed';
  due_date: string;
  sort_order: number;
  created_at: string;
}

export interface ClientOnboarding {
  id: number;
  client_id: number;
  project_id?: number | null;
  project_name?: string | null;
  status: 'pending' | 'in_progress' | 'blocked' | 'completed';
  kickoff_date: string;
  target_launch_date: string;
  created_at: string;
  completed_at?: string | null;
  completed_steps: number;
  total_steps: number;
  progress: number;
  steps: ClientOnboardingStep[];
}

export interface ClientOnboardingDocument {
  id: number;
  client_id: number;
  onboarding_id: number;
  step_id?: number | null;
  step_title?: string | null;
  title: string;
  notes?: string | null;
  file_name: string;
  file_type?: string | null;
  file_size: number;
  file_data_url: string;
  uploaded_by_user_id?: number | null;
  uploaded_by_name?: string | null;
  created_at: string;
}

export interface ClientOnboardingForm {
  id: number;
  client_id: number;
  onboarding_id: number;
  advertising_accesses?: string | null;
  business_goals?: string | null;
  target_audience?: string | null;
  competition?: string | null;
  ad_budget: number;
  status: 'draft' | 'submitted';
  submitted_at?: string | null;
  submitted_by_user_id?: number | null;
  submitted_by_name?: string | null;
  created_at: string;
  updated_at: string;
}

export interface ClientPortalOnboarding {
  client: Client;
  onboarding: ClientOnboarding | null;
  documents: ClientOnboardingDocument[];
  primary_contract: Contract | null;
  briefing_form: ClientOnboardingForm | null;
}

export interface Project {
  id: number;
  client_id: number;
  name: string;
  status: 'strategy' | 'setup' | 'execution' | 'optimization' | 'reporting' | 'completed';
  archived_at?: string | null;
  created_at: string;
}

export interface Campaign {
  id: number;
  project_id: number;
  name: string;
  platform: string;
  budget: number;
  spent: number;
  roi: number;
  status: 'active' | 'paused' | 'completed';
  archived_at?: string | null;
  created_at: string;
}

export interface Report {
  id: number;
  client_id?: number;
  client_name?: string | null;
  title: string;
  type: string;
  url: string;
  created_at: string;
}

export interface Invoice {
  id: number;
  invoice_number: string;
  client_id: number;
  client_name?: string | null;
  amount: number;
  due_date: string;
  status: 'paid' | 'pending' | 'overdue';
  url: string;
  created_at: string;
}

export interface ServicePrice {
  id: number;
  name: string;
  category: string;
  description?: string | null;
  service_scope: 'client' | 'freelance' | 'both';
  unit_label: string;
  billing_model: 'one_time' | 'monthly' | 'hourly' | 'weekly' | 'performance';
  default_price: number;
  currency: 'USD' | 'EUR' | 'MXN';
  tax_rate: number;
  legal_label?: string | null;
  notes?: string | null;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

export interface Freelancer {
  id: number;
  name: string;
  email: string;
  specialty?: string | null;
  hourly_rate: number;
  currency: 'USD' | 'EUR' | 'MXN';
  tax_id?: string | null;
  payment_method?: string | null;
  payout_reference?: string | null;
  payout_integration_key?: Integration['key'] | null;
  payout_integration_name?: string | null;
  notes?: string | null;
  status: 'active' | 'paused' | 'inactive';
  created_at: string;
  updated_at: string;
}

export interface ContractLineItem {
  id: number;
  contract_id: number;
  service_price_id?: number | null;
  service_name?: string | null;
  title: string;
  description?: string | null;
  quantity: number;
  unit_price: number;
  tax_rate: number;
  line_total: number;
  created_at: string;
}

export interface Contract {
  id: number;
  contract_number: string;
  contract_type: 'client' | 'freelance';
  client_id?: number | null;
  client_name?: string | null;
  freelancer_id?: number | null;
  freelancer_name?: string | null;
  owner_user_id?: number | null;
  owner_name?: string | null;
  template_key: string;
  status: 'draft' | 'review' | 'ready' | 'sent' | 'signed' | 'archived';
  currency: 'USD' | 'EUR' | 'MXN';
  payment_terms: string;
  start_date: string;
  end_date?: string | null;
  counterparty_name: string;
  counterparty_email?: string | null;
  counterparty_tax_id?: string | null;
  counterparty_address?: string | null;
  scope_summary?: string | null;
  custom_requirements?: string | null;
  payment_integration_key?: Integration['key'] | null;
  payment_integration_name?: string | null;
  signature_integration_key?: Integration['key'] | null;
  signature_integration_name?: string | null;
  subtotal: number;
  tax_amount: number;
  total_amount: number;
  generated_body: string;
  document_url?: string | null;
  validation_status: 'valid' | 'warning' | 'invalid';
  validation_notes: string[];
  signed_at?: string | null;
  archived_at?: string | null;
  created_at: string;
  updated_at: string;
  line_items: ContractLineItem[];
}

export interface ContractDelivery {
  delivered: boolean;
  skipped: boolean;
  channel: 'smtp' | 'manual';
  reason?: string | null;
}

export interface ContractSendResponse extends Contract {
  delivery: ContractDelivery;
}

export interface ContractEvent {
  id: number;
  contract_id: number;
  event_type:
    | 'created'
    | 'updated'
    | 'review_started'
    | 'approved'
    | 'changes_requested'
    | 'sent'
    | 'signed'
    | 'archived'
    | 'status_changed';
  title: string;
  description: string;
  metadata?: Record<string, unknown> | null;
  user_id?: number | null;
  actor_name: string;
  actor_email?: string | null;
  created_at: string;
}

export interface ContractsOverview {
  summary: {
    total_contracts: number;
    draft_contracts: number;
    ready_contracts: number;
    signed_contracts: number;
    active_freelancers: number;
    active_services: number;
    pending_signature: number;
    monthly_value: number;
  };
  recent_contracts: Contract[];
}

export interface ReferralCode {
  id: number;
  client_id: number;
  client_name: string;
  code: string;
  referral_link: string;
  capture_endpoint: string;
  landing_url?: string | null;
  commission_type: 'percent' | 'fixed';
  commission_value: number;
  reward_description?: string | null;
  status: 'active' | 'paused' | 'archived';
  notes?: string | null;
  created_at: string;
  updated_at: string;
}

export interface Referral {
  id: number;
  referral_code_id: number;
  referrer_client_id: number;
  referrer_client_name: string;
  code: string;
  referral_link: string;
  referred_name: string;
  referred_company?: string | null;
  referred_email?: string | null;
  referred_phone?: string | null;
  status: 'invited' | 'lead' | 'qualified' | 'converted' | 'rejected';
  payout_status: 'pending' | 'approved' | 'paid' | 'cancelled';
  commission_amount: number;
  currency: 'USD' | 'EUR' | 'MXN';
  payout_due_date?: string | null;
  paid_at?: string | null;
  lead_id?: number | null;
  converted_client_id?: number | null;
  converted_client_name?: string | null;
  invoice_id?: number | null;
  invoice_number?: string | null;
  source?: string | null;
  notes?: string | null;
  created_at: string;
  updated_at: string;
  converted_at?: string | null;
}

export interface ReferralClientSummary {
  client_id: number;
  client_name: string;
  active_codes: number;
  total_referrals: number;
  converted_referrals: number;
  pending_commissions: number;
  paid_commissions: number;
}

export interface ReferralOverview {
  summary: {
    total_codes: number;
    active_codes: number;
    total_referrals: number;
    converted_referrals: number;
    conversion_rate: number;
    pending_commissions: number;
    approved_commissions: number;
    paid_commissions: number;
  };
  top_clients: ReferralClientSummary[];
  recent_codes: ReferralCode[];
  recent_referrals: Referral[];
}

export interface ClientReferralPortal {
  client: {
    id: number;
    company: string;
    status: Client['status'];
  };
  summary: {
    active_codes: number;
    total_referrals: number;
    converted_referrals: number;
    conversion_rate: number;
    pending_commissions: number;
    approved_commissions: number;
    paid_commissions: number;
  };
  codes: ReferralCode[];
  referrals: Referral[];
}

export interface ClientManagementProjectSummary {
  id: number;
  name: string;
  status: Project['status'];
  created_at: string;
  total_tasks: number;
  open_tasks: number;
  completed_tasks: number;
}

export interface ClientManagementTaskSummary {
  id: number;
  project_id: number;
  project_name: string;
  title: string;
  status: Task['status'];
  priority: Task['priority'];
  due_date: string;
  assigned_to?: number | null;
  assigned_name?: string | null;
}

export interface ClientManagementContractSummary {
  id: number;
  contract_number: string;
  status: Contract['status'];
  total_amount: number;
  currency: Contract['currency'];
  start_date: string;
  end_date?: string | null;
}

export interface ClientManagementAccessSummary {
  id: number;
  integration_key: Integration['key'];
  integration_name: string;
  status: Integration['status'];
  account_label?: string | null;
  last_tested_at?: string | null;
  last_synced_at?: string | null;
}

export interface ClientManagementDocumentSummary {
  id: number;
  title: string;
  step_title?: string | null;
  file_name: string;
  file_size: number;
  uploaded_by_name?: string | null;
  created_at: string;
}

export interface ClientManagementOverview {
  client_id: number;
  currency: AppSettings['currency'];
  contact: {
    name?: string | null;
    email?: string | null;
    phone?: string | null;
    source?: string | null;
    lead_status?: Lead['status'] | null;
  };
  services: string[];
  projects: ClientManagementProjectSummary[];
  setup: {
    has_project_folder: boolean;
    onboarding_ready: boolean;
    onboarding_status?: ClientOnboarding['status'] | null;
    onboarding_progress: number;
    team_tasks_total: number;
    team_tasks_open: number;
    team_tasks_completed: number;
  };
  billing: {
    invoice_count: number;
    pending_count: number;
    overdue_count: number;
    paid_count: number;
    total_invoiced: number;
    pending_amount: number;
    overdue_amount: number;
    paid_amount: number;
  };
  contracts: {
    total: number;
    draft: number;
    sent: number;
    signed: number;
    active_services: number;
    recent: ClientManagementContractSummary[];
  };
  accesses: {
    total: number;
    connected: number;
    attention: number;
    disconnected: number;
    items: ClientManagementAccessSummary[];
  };
  documents: {
    total: number;
    recent: ClientManagementDocumentSummary[];
  };
  team_tasks: ClientManagementTaskSummary[];
}

export interface ReferralPartnerProfile {
  id: number;
  owner_type: 'team' | 'freelance';
  user_id?: number | null;
  freelancer_id?: number | null;
  display_name: string;
  email?: string | null;
  role_label?: string | null;
  payment_method?: string | null;
  payout_reference?: string | null;
  payout_integration_key?: Integration['key'] | null;
  payout_integration_name?: string | null;
  notes?: string | null;
  status: 'active' | 'paused' | 'archived';
  active_codes: number;
  total_referrals: number;
  converted_referrals: number;
  pending_commissions: number;
  paid_commissions: number;
  created_at: string;
  updated_at: string;
}

export interface PartnerReferralCode {
  id: number;
  partner_id: number;
  partner_name: string;
  owner_type: 'team' | 'freelance';
  code: string;
  referral_link: string;
  capture_endpoint: string;
  landing_url?: string | null;
  commission_type: 'percent' | 'fixed';
  commission_value: number;
  reward_description?: string | null;
  status: 'active' | 'paused' | 'archived';
  notes?: string | null;
  payout_integration_key?: Integration['key'] | null;
  payout_integration_name?: string | null;
  created_at: string;
  updated_at: string;
}

export interface PartnerReferral {
  id: number;
  referral_code_id: number;
  partner_id: number;
  partner_name: string;
  partner_email?: string | null;
  partner_role_label?: string | null;
  owner_type: 'team' | 'freelance';
  code: string;
  referral_link: string;
  referred_name: string;
  referred_company?: string | null;
  referred_email?: string | null;
  referred_phone?: string | null;
  status: 'invited' | 'lead' | 'qualified' | 'converted' | 'rejected';
  payout_status: 'pending' | 'approved' | 'paid' | 'cancelled';
  commission_amount: number;
  currency: 'USD' | 'EUR' | 'MXN';
  payout_due_date?: string | null;
  paid_at?: string | null;
  lead_id?: number | null;
  converted_client_id?: number | null;
  converted_client_name?: string | null;
  invoice_id?: number | null;
  invoice_number?: string | null;
  source?: string | null;
  notes?: string | null;
  payment_method?: string | null;
  payout_reference?: string | null;
  payout_integration_key?: Integration['key'] | null;
  payout_integration_name?: string | null;
  created_at: string;
  updated_at: string;
  converted_at?: string | null;
}

export interface PartnerReferralOverview {
  summary: {
    total_partners: number;
    active_partners: number;
    total_codes: number;
    active_codes: number;
    total_referrals: number;
    converted_referrals: number;
    conversion_rate: number;
    pending_commissions: number;
    approved_commissions: number;
    paid_commissions: number;
  };
  partners: ReferralPartnerProfile[];
  recent_codes: PartnerReferralCode[];
  recent_referrals: PartnerReferral[];
}

export interface FreelancerReferralPortal {
  freelancer: Freelancer;
  partner: ReferralPartnerProfile | null;
  summary: {
    active_codes: number;
    total_referrals: number;
    converted_referrals: number;
    conversion_rate: number;
    pending_commissions: number;
    approved_commissions: number;
    paid_commissions: number;
  };
  codes: PartnerReferralCode[];
  referrals: PartnerReferral[];
}

export interface FreelancerFinancePortal {
  freelancer: Freelancer;
  summary: {
    total_contracts: number;
    pending_contracts: number;
    signed_contracts: number;
    total_contract_value: number;
    pending_contract_value: number;
    signed_contract_value: number;
    total_generated: number;
  };
  contracts: Contract[];
}

export interface FreelancerWorkspaceClient {
  id: number;
  company: string;
  industry?: string | null;
  budget: number;
  status: Client['status'];
  project_count: number;
  active_campaigns: number;
  pending_tasks: number;
  contact_name?: string | null;
  contact_email?: string | null;
  contact_phone?: string | null;
}

export interface FreelancerWorkspaceProject {
  id: number;
  client_id: number;
  client_name: string;
  name: string;
  status: Project['status'];
  role_label?: string | null;
  notes?: string | null;
  total_tasks: number;
  open_tasks: number;
  my_tasks: number;
  active_campaigns: number;
  campaigns_count: number;
  total_budget: number;
  total_spend: number;
  average_roi: number;
  next_due_date?: string | null;
}

export interface FreelancerWorkspaceCampaign {
  id: number;
  project_id: number;
  project_name: string;
  client_id: number;
  client_name: string;
  name: string;
  platform: string;
  budget: number;
  spent: number;
  roi: number;
  status: Campaign['status'];
  created_at: string;
}

export interface FreelancerWorkspaceTask {
  id: number;
  project_id: number;
  project_name: string;
  client_id?: number | null;
  client_name?: string | null;
  title: string;
  description: string;
  status: Task['status'];
  priority: Task['priority'];
  due_date: string;
  assigned_to?: number | null;
  is_assigned_to_me: boolean;
  can_update_status: boolean;
}

export interface FreelancerWorkspacePortal {
  freelancer: Freelancer;
  clients: FreelancerWorkspaceClient[];
  projects: FreelancerWorkspaceProject[];
  campaigns: FreelancerWorkspaceCampaign[];
  upcoming_tasks: FreelancerWorkspaceTask[];
}

export interface FreelancerTasksPortal {
  freelancer: Freelancer;
  summary: {
    total_tasks: number;
    assigned_tasks: number;
    due_this_week: number;
    in_review: number;
    completed_tasks: number;
  };
  tasks: FreelancerWorkspaceTask[];
}

export interface TeamOnboardingStep {
  id: number;
  onboarding_id: number;
  title: string;
  description?: string | null;
  status: 'pending' | 'in_progress' | 'completed';
  sort_order: number;
  created_at: string;
}

export interface TeamOnboarding {
  id: number;
  user_id: number;
  status: 'pending' | 'in_progress' | 'completed';
  target_ready_date?: string | null;
  created_at: string;
  completed_at?: string | null;
  completed_steps: number;
  total_steps: number;
  progress: number;
  steps: TeamOnboardingStep[];
}

export interface TeamMember {
  id: number;
  email: string;
  name: string;
  role: string;
  status: 'online' | 'meeting' | 'offline';
  access_status: 'invited' | 'active';
  activation_token?: string | null;
  invited_at?: string | null;
  activated_at?: string | null;
  projects: number;
  onboarding?: TeamOnboarding | null;
}

export interface InviteActivationInfo {
  name: string;
  email: string;
  role: string;
  onboarding?: TeamOnboarding | null;
}

export interface PasswordResetInfo {
  name: string;
  email: string;
  expires_at?: string | null;
}

export interface PasswordResetRequestResponse {
  message: string;
  preview_url?: string | null;
  expires_at?: string | null;
}

export interface AuthUser {
  id: number;
  email: string;
  name: string;
  role: string;
  status: 'online' | 'meeting' | 'offline';
  agency_id: number | null;
  client_id?: number | null;
  freelancer_id?: number | null;
  two_factor_enabled: boolean;
  accessible_sections: AppSection[];
}

export interface AuthTwoFactorChallenge {
  two_factor_required: true;
  challenge_token: string;
  challenge_expires_at: string;
  email: string;
  name: string;
  available_methods: Array<'totp' | 'backup_code'>;
}

export type AuthFlowResponse = AuthUser | AuthTwoFactorChallenge;

export interface AppSettings {
  agency_name: string;
  subscription_plan: 'starter' | 'pro' | 'enterprise';
  timezone: string;
  currency: 'USD' | 'EUR' | 'MXN';
  email_reports: boolean;
  task_reminders: boolean;
  invoice_alerts: boolean;
  weekly_digest: boolean;
  two_factor: boolean;
  login_alerts: boolean;
  session_timeout: '30m' | '2h' | '8h';
  ai_trigger_new_lead: boolean;
  ai_trigger_client_report: boolean;
  ai_trigger_project_task_pack: boolean;
}

export interface Integration {
  id: number;
  key:
    | 'n8n'
    | 'zapier'
    | 'make'
    | 'gmail'
    | 'slack'
    | 'google_ads'
    | 'meta_ads'
    | 'instagram'
    | 'tiktok_ads'
    | 'facebook_pages'
    | 'landing_pages'
    | 'external_crm'
    | 'hubspot'
    | 'google_sheets'
    | 'google_calendar'
    | 'calendly'
    | 'stripe'
    | 'paypal'
    | 'wise'
    | 'docusign'
    | 'pandadoc';
  name: string;
  category:
    | 'automation'
    | 'communication'
    | 'ads'
    | 'social'
    | 'landing'
    | 'crm'
    | 'ops'
    | 'payments'
    | 'documents';
  connection_mode: 'api_key' | 'oauth' | 'webhook' | 'manual';
  direction: 'inbound' | 'outbound' | 'bidirectional';
  status: 'connected' | 'attention' | 'disconnected';
  description: string;
  sync_enabled: boolean;
  auto_capture_leads: boolean;
  supports_webhook: boolean;
  supports_lead_capture: boolean;
  account_label?: string | null;
  endpoint_url?: string | null;
  api_key?: string | null;
  access_token?: string | null;
  email?: string | null;
  account_id?: string | null;
  webhook_secret?: string | null;
  webhook_path?: string | null;
  notes?: string | null;
  scopes: string[];
  last_tested_at?: string | null;
  last_synced_at?: string | null;
  created_at: string;
  updated_at: string;
}

export interface IntegrationEvent {
  id: number;
  integration_id: number;
  integration_name: string;
  integration_key: Integration['key'];
  direction: 'inbound' | 'outbound';
  event_type: string;
  status: 'success' | 'error' | 'ignored';
  summary: string;
  payload?: Record<string, unknown> | null;
  created_at: string;
}

export interface IntegrationClientOption {
  id: number;
  company: string;
}

export interface ClientIntegration {
  id: number;
  client_id: number;
  client_name: string;
  integration_key: Integration['key'];
  integration_name: string;
  status: Integration['status'];
  account_label?: string | null;
  endpoint_url?: string | null;
  api_key?: string | null;
  access_token?: string | null;
  email?: string | null;
  account_id?: string | null;
  notes?: string | null;
  sync_enabled: boolean;
  last_tested_at?: string | null;
  last_synced_at?: string | null;
  created_at: string;
  updated_at: string;
}

export interface CalendarEvent {
  id: number;
  title: string;
  description?: string | null;
  event_kind: 'deadline' | 'followup' | 'launch' | 'meeting';
  source_type: 'task' | 'lead_followup' | 'client_onboarding' | 'calendly';
  source_ref: string;
  status: 'scheduled' | 'completed' | 'cancelled';
  start_at: string;
  end_at?: string | null;
  action_tab: AppSection;
  action_entity_id?: number | null;
  client_id?: number | null;
  project_id?: number | null;
  integration_key?: Integration['key'] | null;
  created_at: string;
  updated_at: string;
}

export interface AppNotification {
  id: number;
  type: 'task_due' | 'lead_followup' | 'client_onboarding' | 'calendar_event' | 'integration';
  severity: 'info' | 'warning' | 'critical' | 'success';
  title: string;
  message: string;
  is_read: boolean;
  read_at?: string | null;
  action_tab: AppSection;
  action_entity_type?: string | null;
  action_entity_id?: number | null;
  source_type?: string | null;
  source_ref?: string | null;
  dedupe_key?: string | null;
  created_at: string;
  updated_at: string;
}

export interface AIResponse {
  text: string;
  source: 'gemini' | 'local';
}

export interface AIAutomationAction {
  type: string;
  label: string;
  status: 'created' | 'updated' | 'skipped';
  details: string;
  target_id?: number | null;
}

export interface AIAutomationResponse {
  automation: 'lead_followup' | 'client_report' | 'project_tasks';
  source: 'gemini' | 'local';
  summary: string;
  applied_actions: AIAutomationAction[];
}

export interface TwoFactorStatus {
  enabled: boolean;
  pending_setup: boolean;
  confirmed_at?: string | null;
  backup_codes_remaining: number;
  policy_enabled: boolean;
}

export interface TwoFactorSetupResponse extends TwoFactorStatus {
  issuer: string;
  manual_entry_key: string;
  otpauth_url: string;
  qr_data_url: string;
}

export interface TwoFactorRecoveryCodesResponse extends TwoFactorStatus {
  backup_codes: string[];
}

export interface AIAutomationRun {
  id: number;
  automation: 'lead_followup' | 'client_report' | 'project_tasks';
  mode: 'manual' | 'trigger';
  status: 'success' | 'error' | 'skipped';
  trigger_key?: 'ai_trigger_new_lead' | 'ai_trigger_client_report' | 'ai_trigger_project_task_pack' | null;
  entity_type: 'lead' | 'client' | 'project';
  entity_id?: number | null;
  source: 'gemini' | 'local';
  summary?: string | null;
  error_message?: string | null;
  actor_name: string;
  actor_email?: string | null;
  created_at: string;
  actions: AIAutomationAction[];
}

export interface AuditLog {
  id: number;
  user_id?: number | null;
  actor_name: string;
  actor_email?: string | null;
  action: string;
  entity_type: string;
  entity_id?: number | null;
  description: string;
  metadata?: Record<string, unknown> | null;
  created_at: string;
}

export interface ProductionReadinessItem {
  key: string;
  status: 'ready' | 'warning' | 'critical';
  label: string;
  detail: string;
}

export interface ProductionReadinessReport {
  overall_status: 'ready' | 'warning' | 'critical';
  items: ProductionReadinessItem[];
}

export interface AdminSessionSummary {
  id: number;
  user_id: number;
  name: string;
  email: string;
  role: string;
  created_at: string;
  expires_at: string;
  is_current: boolean;
}

export interface UserSessionSummary {
  id: number;
  user_id: number;
  name: string;
  email: string;
  role: string;
  created_at: string;
  expires_at: string;
  is_current: boolean;
}

export interface AdminClientOnboardingSummary {
  id: number;
  client_id: number;
  client_name: string;
  status: 'pending' | 'in_progress' | 'blocked' | 'completed';
  progress: number;
  project_name?: string | null;
  target_launch_date?: string | null;
}

export interface AdminAIAutomationSummary {
  automation: 'lead_followup' | 'client_report' | 'project_tasks';
  total: number;
  errors: number;
}

export interface AdminAITriggerSummary {
  trigger_key: 'ai_trigger_new_lead' | 'ai_trigger_client_report' | 'ai_trigger_project_task_pack';
  total: number;
}

export interface AdminAIDisabledTriggerSummary {
  trigger_key: 'ai_trigger_new_lead' | 'ai_trigger_client_report' | 'ai_trigger_project_task_pack';
  recent_errors_24h: number;
  disabled_since?: string | null;
  consecutive_error_streak: number;
  last_error_at?: string | null;
  last_success_at?: string | null;
}

export interface AdminAIAlert {
  id: string;
  severity: 'warning' | 'critical';
  title: string;
  description: string;
  tab: 'ai' | 'settings';
  trigger_key?:
    | 'ai_trigger_new_lead'
    | 'ai_trigger_client_report'
    | 'ai_trigger_project_task_pack'
    | null;
  run_filters?: {
    automation?: 'lead_followup' | 'client_report' | 'project_tasks';
    status?: 'success' | 'error' | 'skipped';
    mode?: 'manual' | 'trigger';
    trigger_key?:
      | 'ai_trigger_new_lead'
      | 'ai_trigger_client_report'
      | 'ai_trigger_project_task_pack';
  } | null;
}

export interface AdminOverview {
  kpis: {
    pending_invites: number;
    team_onboardings_open: number;
    client_onboardings_open: number;
    active_sessions: number;
    overdue_tasks: number;
    overdue_invoices: number;
  };
  ai: {
    total_runs_7d: number;
    success_runs_7d: number;
    error_runs_7d: number;
    trigger_runs_7d: number;
    error_rate_7d: number;
    top_automations: AdminAIAutomationSummary[];
    top_triggers: AdminAITriggerSummary[];
    disabled_triggers: AdminAIDisabledTriggerSummary[];
    alerts: AdminAIAlert[];
  };
  pending_team_members: TeamMember[];
  pending_client_onboardings: AdminClientOnboardingSummary[];
  sessions: AdminSessionSummary[];
  recent_audit: AuditLog[];
}

export interface Task {
  id: number;
  project_id: number;
  title: string;
  description: string;
  status: 'todo' | 'in_progress' | 'review' | 'done';
  priority: 'low' | 'medium' | 'high';
  due_date: string;
  assigned_to?: number;
  archived_at?: string | null;
}

export interface DashboardStats {
  leads: { count: number };
  clients: { count: number };
  projects: { count: number };
  revenue: number;
  mrr: number;
}
