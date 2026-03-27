import "dotenv/config";
import express from "express";
import { createServer as createViteServer } from "vite";
import Database from "better-sqlite3";
import fs from "fs";
import type { Server as HttpServer } from "http";
import path from "path";
import { fileURLToPath } from "url";
import { GoogleGenAI } from "@google/genai";
import { randomBytes, scryptSync, timingSafeEqual } from "crypto";
import { createTransport } from "nodemailer";
import type { Transporter } from "nodemailer";
import { generateSecret, generateURI, verifySync } from "otplib";
import QRCode from "qrcode";
import { AppSection, canAccessSection, getAccessibleSections, getRoleKey } from "./src/permissions";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

function parseBooleanEnvFlag(value?: string) {
  return typeof value === "string" && ["1", "true", "yes", "on"].includes(value.trim().toLowerCase());
}

const resolveDatabasePath = (value?: string | null) => {
  const configuredPath = typeof value === "string" && value.trim() ? value.trim() : "zaaryx.db";

  return path.isAbsolute(configuredPath)
    ? configuredPath
    : path.join(process.cwd(), configuredPath);
};

const DATABASE_PATH = resolveDatabasePath(process.env.DATABASE_PATH);

fs.mkdirSync(path.dirname(DATABASE_PATH), { recursive: true });

const db = new Database(DATABASE_PATH);

// Initialize Database Schema
db.exec(`
  CREATE TABLE IF NOT EXISTS agencies (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    subscription_plan TEXT DEFAULT 'pro'
  );

  CREATE TABLE IF NOT EXISTS users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    email TEXT UNIQUE NOT NULL,
    password TEXT NOT NULL,
    name TEXT NOT NULL,
    role TEXT NOT NULL,
    client_id INTEGER,
    freelancer_id INTEGER,
    access_status TEXT DEFAULT 'active',
    activation_token TEXT,
    invited_at DATETIME,
    activated_at DATETIME,
    two_factor_secret TEXT,
    two_factor_pending_secret TEXT,
    two_factor_enabled INTEGER DEFAULT 0,
    two_factor_backup_codes TEXT,
    two_factor_confirmed_at DATETIME,
    agency_id INTEGER,
    FOREIGN KEY (client_id) REFERENCES clients(id),
    FOREIGN KEY (freelancer_id) REFERENCES freelancers(id),
    FOREIGN KEY (agency_id) REFERENCES agencies(id)
  );

  CREATE TABLE IF NOT EXISTS team_onboardings (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER UNIQUE NOT NULL,
    status TEXT DEFAULT 'pending',
    target_ready_date TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    completed_at DATETIME,
    agency_id INTEGER,
    FOREIGN KEY (user_id) REFERENCES users(id),
    FOREIGN KEY (agency_id) REFERENCES agencies(id)
  );

  CREATE TABLE IF NOT EXISTS team_onboarding_steps (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    onboarding_id INTEGER NOT NULL,
    title TEXT NOT NULL,
    description TEXT,
    status TEXT DEFAULT 'pending',
    sort_order INTEGER NOT NULL,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (onboarding_id) REFERENCES team_onboardings(id)
  );

  CREATE TABLE IF NOT EXISTS leads (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    company TEXT,
    email TEXT,
    phone TEXT,
    source TEXT,
    service TEXT,
    budget REAL,
    status TEXT DEFAULT 'new',
    assigned_to INTEGER,
    next_action TEXT,
    next_contact_date TEXT,
    last_contacted_at DATETIME,
    archived_at DATETIME,
    agency_id INTEGER,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (agency_id) REFERENCES agencies(id),
    FOREIGN KEY (assigned_to) REFERENCES users(id)
  );

  CREATE TABLE IF NOT EXISTS lead_notes (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    lead_id INTEGER NOT NULL,
    author_id INTEGER,
    author_name TEXT NOT NULL,
    type TEXT DEFAULT 'note',
    content TEXT NOT NULL,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (lead_id) REFERENCES leads(id),
    FOREIGN KEY (author_id) REFERENCES users(id)
  );

  CREATE TABLE IF NOT EXISTS clients (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    lead_id INTEGER,
    company TEXT NOT NULL,
    industry TEXT,
    budget REAL,
    status TEXT DEFAULT 'active',
    archived_at DATETIME,
    agency_id INTEGER,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (lead_id) REFERENCES leads(id),
    FOREIGN KEY (agency_id) REFERENCES agencies(id)
  );

  CREATE TABLE IF NOT EXISTS projects (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    client_id INTEGER,
    name TEXT NOT NULL,
    status TEXT DEFAULT 'strategy',
    archived_at DATETIME,
    agency_id INTEGER,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (client_id) REFERENCES clients(id),
    FOREIGN KEY (agency_id) REFERENCES agencies(id)
  );

  CREATE TABLE IF NOT EXISTS freelancer_project_assignments (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    project_id INTEGER NOT NULL,
    freelancer_id INTEGER NOT NULL,
    role_label TEXT,
    notes TEXT,
    status TEXT NOT NULL DEFAULT 'active',
    agency_id INTEGER,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    UNIQUE (project_id, freelancer_id),
    FOREIGN KEY (project_id) REFERENCES projects(id),
    FOREIGN KEY (freelancer_id) REFERENCES freelancers(id),
    FOREIGN KEY (agency_id) REFERENCES agencies(id)
  );

  CREATE TABLE IF NOT EXISTS tasks (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    project_id INTEGER,
    title TEXT NOT NULL,
    description TEXT,
    status TEXT DEFAULT 'todo',
    priority TEXT DEFAULT 'medium',
    due_date DATETIME,
    assigned_to INTEGER,
    archived_at DATETIME,
    agency_id INTEGER,
    FOREIGN KEY (project_id) REFERENCES projects(id),
    FOREIGN KEY (assigned_to) REFERENCES users(id),
    FOREIGN KEY (agency_id) REFERENCES agencies(id)
  );

  CREATE TABLE IF NOT EXISTS client_onboardings (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    client_id INTEGER UNIQUE NOT NULL,
    project_id INTEGER,
    status TEXT DEFAULT 'pending',
    kickoff_date TEXT,
    target_launch_date TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    completed_at DATETIME,
    agency_id INTEGER,
    FOREIGN KEY (client_id) REFERENCES clients(id),
    FOREIGN KEY (project_id) REFERENCES projects(id),
    FOREIGN KEY (agency_id) REFERENCES agencies(id)
  );

  CREATE TABLE IF NOT EXISTS client_onboarding_steps (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    onboarding_id INTEGER NOT NULL,
    task_id INTEGER,
    title TEXT NOT NULL,
    description TEXT,
    status TEXT DEFAULT 'pending',
    due_date TEXT,
    sort_order INTEGER NOT NULL,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (onboarding_id) REFERENCES client_onboardings(id),
    FOREIGN KEY (task_id) REFERENCES tasks(id)
  );

  CREATE TABLE IF NOT EXISTS client_onboarding_documents (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    client_id INTEGER NOT NULL,
    onboarding_id INTEGER NOT NULL,
    step_id INTEGER,
    title TEXT NOT NULL,
    notes TEXT,
    file_name TEXT NOT NULL,
    file_type TEXT,
    file_size INTEGER NOT NULL DEFAULT 0,
    file_data_url TEXT NOT NULL,
    uploaded_by_user_id INTEGER,
    uploaded_by_name TEXT,
    agency_id INTEGER,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (client_id) REFERENCES clients(id),
    FOREIGN KEY (onboarding_id) REFERENCES client_onboardings(id),
    FOREIGN KEY (step_id) REFERENCES client_onboarding_steps(id),
    FOREIGN KEY (uploaded_by_user_id) REFERENCES users(id),
    FOREIGN KEY (agency_id) REFERENCES agencies(id)
  );

  CREATE TABLE IF NOT EXISTS client_onboarding_forms (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    client_id INTEGER UNIQUE NOT NULL,
    onboarding_id INTEGER UNIQUE NOT NULL,
    advertising_accesses TEXT,
    business_goals TEXT,
    target_audience TEXT,
    competition TEXT,
    ad_budget REAL DEFAULT 0,
    status TEXT DEFAULT 'draft',
    submitted_at DATETIME,
    submitted_by_user_id INTEGER,
    submitted_by_name TEXT,
    agency_id INTEGER,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (client_id) REFERENCES clients(id),
    FOREIGN KEY (onboarding_id) REFERENCES client_onboardings(id),
    FOREIGN KEY (submitted_by_user_id) REFERENCES users(id),
    FOREIGN KEY (agency_id) REFERENCES agencies(id)
  );

  CREATE TABLE IF NOT EXISTS campaigns (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    project_id INTEGER,
    name TEXT NOT NULL,
    platform TEXT NOT NULL,
    budget REAL,
    spent REAL,
    roi REAL,
    status TEXT DEFAULT 'active',
    archived_at DATETIME,
    agency_id INTEGER,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (project_id) REFERENCES projects(id),
    FOREIGN KEY (agency_id) REFERENCES agencies(id)
  );

  CREATE TABLE IF NOT EXISTS reports (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    client_id INTEGER,
    title TEXT NOT NULL,
    type TEXT NOT NULL,
    url TEXT,
    agency_id INTEGER,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (client_id) REFERENCES clients(id),
    FOREIGN KEY (agency_id) REFERENCES agencies(id)
  );

  CREATE TABLE IF NOT EXISTS invoices (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    invoice_number TEXT UNIQUE NOT NULL,
    client_id INTEGER NOT NULL,
    amount REAL NOT NULL,
    due_date DATETIME NOT NULL,
    status TEXT DEFAULT 'pending',
    url TEXT,
    agency_id INTEGER,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (client_id) REFERENCES clients(id),
    FOREIGN KEY (agency_id) REFERENCES agencies(id)
  );

  CREATE TABLE IF NOT EXISTS referral_codes (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    client_id INTEGER NOT NULL,
    code TEXT UNIQUE NOT NULL,
    landing_url TEXT,
    commission_type TEXT NOT NULL DEFAULT 'percent',
    commission_value REAL NOT NULL DEFAULT 10,
    reward_description TEXT,
    status TEXT NOT NULL DEFAULT 'active',
    notes TEXT,
    agency_id INTEGER,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (client_id) REFERENCES clients(id),
    FOREIGN KEY (agency_id) REFERENCES agencies(id)
  );

  CREATE TABLE IF NOT EXISTS referrals (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    referral_code_id INTEGER NOT NULL,
    referrer_client_id INTEGER NOT NULL,
    referred_name TEXT NOT NULL,
    referred_company TEXT,
    referred_email TEXT,
    referred_phone TEXT,
    status TEXT NOT NULL DEFAULT 'invited',
    payout_status TEXT NOT NULL DEFAULT 'pending',
    commission_amount REAL NOT NULL DEFAULT 0,
    currency TEXT NOT NULL DEFAULT 'EUR',
    payout_due_date TEXT,
    paid_at DATETIME,
    lead_id INTEGER,
    converted_client_id INTEGER,
    invoice_id INTEGER,
    source TEXT,
    notes TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    converted_at DATETIME,
    agency_id INTEGER,
    FOREIGN KEY (referral_code_id) REFERENCES referral_codes(id),
    FOREIGN KEY (referrer_client_id) REFERENCES clients(id),
    FOREIGN KEY (lead_id) REFERENCES leads(id),
    FOREIGN KEY (converted_client_id) REFERENCES clients(id),
    FOREIGN KEY (invoice_id) REFERENCES invoices(id),
    FOREIGN KEY (agency_id) REFERENCES agencies(id)
  );

  CREATE TABLE IF NOT EXISTS service_prices (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    category TEXT NOT NULL,
    description TEXT,
    service_scope TEXT NOT NULL DEFAULT 'both',
    unit_label TEXT NOT NULL DEFAULT 'servicio',
    billing_model TEXT NOT NULL DEFAULT 'one_time',
    default_price REAL NOT NULL DEFAULT 0,
    currency TEXT NOT NULL DEFAULT 'EUR',
    tax_rate REAL NOT NULL DEFAULT 21,
    legal_label TEXT,
    notes TEXT,
    is_active INTEGER NOT NULL DEFAULT 1,
    agency_id INTEGER,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (agency_id) REFERENCES agencies(id)
  );

  CREATE TABLE IF NOT EXISTS freelancers (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    email TEXT NOT NULL,
    specialty TEXT,
    hourly_rate REAL NOT NULL DEFAULT 0,
    currency TEXT NOT NULL DEFAULT 'EUR',
    tax_id TEXT,
    payment_method TEXT,
    payout_reference TEXT,
    payout_integration_key TEXT,
    notes TEXT,
    status TEXT NOT NULL DEFAULT 'active',
    agency_id INTEGER,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (agency_id) REFERENCES agencies(id)
  );

  CREATE TABLE IF NOT EXISTS contracts (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    contract_number TEXT UNIQUE NOT NULL,
    contract_type TEXT NOT NULL,
    client_id INTEGER,
    freelancer_id INTEGER,
    owner_user_id INTEGER,
    template_key TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'draft',
    currency TEXT NOT NULL DEFAULT 'EUR',
    payment_terms TEXT NOT NULL,
    start_date TEXT NOT NULL,
    end_date TEXT,
    counterparty_name TEXT NOT NULL,
    counterparty_email TEXT,
    counterparty_tax_id TEXT,
    counterparty_address TEXT,
    scope_summary TEXT,
    custom_requirements TEXT,
    payment_integration_key TEXT,
    signature_integration_key TEXT,
    subtotal REAL NOT NULL DEFAULT 0,
    tax_amount REAL NOT NULL DEFAULT 0,
    total_amount REAL NOT NULL DEFAULT 0,
    generated_body TEXT NOT NULL,
    document_url TEXT,
    validation_status TEXT NOT NULL DEFAULT 'invalid',
    validation_notes TEXT,
    signed_at DATETIME,
    archived_at DATETIME,
    agency_id INTEGER,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (client_id) REFERENCES clients(id),
    FOREIGN KEY (freelancer_id) REFERENCES freelancers(id),
    FOREIGN KEY (owner_user_id) REFERENCES users(id),
    FOREIGN KEY (agency_id) REFERENCES agencies(id)
  );

  CREATE TABLE IF NOT EXISTS contract_line_items (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    contract_id INTEGER NOT NULL,
    service_price_id INTEGER,
    title TEXT NOT NULL,
    description TEXT,
    quantity REAL NOT NULL DEFAULT 1,
    unit_price REAL NOT NULL DEFAULT 0,
    tax_rate REAL NOT NULL DEFAULT 21,
    line_total REAL NOT NULL DEFAULT 0,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (contract_id) REFERENCES contracts(id),
    FOREIGN KEY (service_price_id) REFERENCES service_prices(id)
  );

  CREATE TABLE IF NOT EXISTS contract_events (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    contract_id INTEGER NOT NULL,
    event_type TEXT NOT NULL,
    title TEXT NOT NULL,
    description TEXT NOT NULL,
    metadata TEXT,
    user_id INTEGER,
    actor_name TEXT NOT NULL,
    actor_email TEXT,
    agency_id INTEGER,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (contract_id) REFERENCES contracts(id),
    FOREIGN KEY (user_id) REFERENCES users(id),
    FOREIGN KEY (agency_id) REFERENCES agencies(id)
  );

  CREATE TABLE IF NOT EXISTS referral_partners (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    owner_type TEXT NOT NULL,
    user_id INTEGER,
    freelancer_id INTEGER,
    payment_method TEXT,
    payout_reference TEXT,
    payout_integration_key TEXT,
    notes TEXT,
    status TEXT NOT NULL DEFAULT 'active',
    agency_id INTEGER,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (user_id) REFERENCES users(id),
    FOREIGN KEY (freelancer_id) REFERENCES freelancers(id),
    FOREIGN KEY (agency_id) REFERENCES agencies(id)
  );

  CREATE TABLE IF NOT EXISTS partner_referral_codes (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    partner_id INTEGER NOT NULL,
    code TEXT UNIQUE NOT NULL,
    landing_url TEXT,
    commission_type TEXT NOT NULL DEFAULT 'percent',
    commission_value REAL NOT NULL DEFAULT 10,
    reward_description TEXT,
    status TEXT NOT NULL DEFAULT 'active',
    notes TEXT,
    agency_id INTEGER,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (partner_id) REFERENCES referral_partners(id),
    FOREIGN KEY (agency_id) REFERENCES agencies(id)
  );

  CREATE TABLE IF NOT EXISTS partner_referrals (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    referral_code_id INTEGER NOT NULL,
    partner_id INTEGER NOT NULL,
    referred_name TEXT NOT NULL,
    referred_company TEXT,
    referred_email TEXT,
    referred_phone TEXT,
    status TEXT NOT NULL DEFAULT 'invited',
    payout_status TEXT NOT NULL DEFAULT 'pending',
    commission_amount REAL NOT NULL DEFAULT 0,
    currency TEXT NOT NULL DEFAULT 'EUR',
    payout_due_date TEXT,
    paid_at DATETIME,
    lead_id INTEGER,
    converted_client_id INTEGER,
    invoice_id INTEGER,
    source TEXT,
    notes TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    converted_at DATETIME,
    agency_id INTEGER,
    FOREIGN KEY (referral_code_id) REFERENCES partner_referral_codes(id),
    FOREIGN KEY (partner_id) REFERENCES referral_partners(id),
    FOREIGN KEY (lead_id) REFERENCES leads(id),
    FOREIGN KEY (converted_client_id) REFERENCES clients(id),
    FOREIGN KEY (invoice_id) REFERENCES invoices(id),
    FOREIGN KEY (agency_id) REFERENCES agencies(id)
  );

  CREATE TABLE IF NOT EXISTS app_settings (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    agency_id INTEGER NOT NULL,
    key TEXT NOT NULL,
    value TEXT NOT NULL,
    UNIQUE (agency_id, key),
    FOREIGN KEY (agency_id) REFERENCES agencies(id)
  );

  CREATE TABLE IF NOT EXISTS audit_logs (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER,
    actor_name TEXT NOT NULL,
    actor_email TEXT,
    action TEXT NOT NULL,
    entity_type TEXT NOT NULL,
    entity_id INTEGER,
    description TEXT NOT NULL,
    metadata TEXT,
    agency_id INTEGER,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (user_id) REFERENCES users(id),
    FOREIGN KEY (agency_id) REFERENCES agencies(id)
  );

  CREATE TABLE IF NOT EXISTS ai_automation_runs (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    automation TEXT NOT NULL,
    mode TEXT NOT NULL,
    status TEXT NOT NULL,
    trigger_key TEXT,
    entity_type TEXT NOT NULL,
    entity_id INTEGER,
    source TEXT NOT NULL DEFAULT 'local',
    summary TEXT,
    error_message TEXT,
    actions TEXT,
    user_id INTEGER,
    actor_name TEXT NOT NULL,
    actor_email TEXT,
    agency_id INTEGER,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (user_id) REFERENCES users(id),
    FOREIGN KEY (agency_id) REFERENCES agencies(id)
  );

  CREATE TABLE IF NOT EXISTS integrations (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    key TEXT NOT NULL,
    name TEXT NOT NULL,
    category TEXT NOT NULL,
    connection_mode TEXT NOT NULL,
    direction TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'disconnected',
    description TEXT,
    sync_enabled INTEGER NOT NULL DEFAULT 0,
    auto_capture_leads INTEGER NOT NULL DEFAULT 0,
    supports_webhook INTEGER NOT NULL DEFAULT 0,
    supports_lead_capture INTEGER NOT NULL DEFAULT 0,
    account_label TEXT,
    endpoint_url TEXT,
    api_key TEXT,
    access_token TEXT,
    email TEXT,
    account_id TEXT,
    webhook_secret TEXT,
    notes TEXT,
    scopes TEXT,
    last_tested_at DATETIME,
    last_synced_at DATETIME,
    agency_id INTEGER,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    UNIQUE (agency_id, key),
    FOREIGN KEY (agency_id) REFERENCES agencies(id)
  );

  CREATE TABLE IF NOT EXISTS integration_events (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    integration_id INTEGER NOT NULL,
    direction TEXT NOT NULL,
    event_type TEXT NOT NULL,
    status TEXT NOT NULL,
    summary TEXT NOT NULL,
    payload TEXT,
    agency_id INTEGER,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (integration_id) REFERENCES integrations(id),
    FOREIGN KEY (agency_id) REFERENCES agencies(id)
  );

  CREATE TABLE IF NOT EXISTS client_integrations (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    client_id INTEGER NOT NULL,
    integration_key TEXT NOT NULL,
    integration_name TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'disconnected',
    account_label TEXT,
    endpoint_url TEXT,
    api_key TEXT,
    access_token TEXT,
    email TEXT,
    account_id TEXT,
    notes TEXT,
    sync_enabled INTEGER NOT NULL DEFAULT 0,
    last_tested_at DATETIME,
    last_synced_at DATETIME,
    agency_id INTEGER,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    UNIQUE (client_id, integration_key),
    FOREIGN KEY (client_id) REFERENCES clients(id),
    FOREIGN KEY (agency_id) REFERENCES agencies(id)
  );

  CREATE TABLE IF NOT EXISTS calendar_events (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    title TEXT NOT NULL,
    description TEXT,
    event_kind TEXT NOT NULL,
    source_type TEXT NOT NULL,
    source_ref TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'scheduled',
    start_at DATETIME NOT NULL,
    end_at DATETIME,
    action_tab TEXT NOT NULL DEFAULT 'dashboard',
    action_entity_id INTEGER,
    client_id INTEGER,
    project_id INTEGER,
    integration_key TEXT,
    agency_id INTEGER,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    UNIQUE (agency_id, source_type, source_ref, event_kind),
    FOREIGN KEY (client_id) REFERENCES clients(id),
    FOREIGN KEY (project_id) REFERENCES projects(id),
    FOREIGN KEY (agency_id) REFERENCES agencies(id)
  );

  CREATE TABLE IF NOT EXISTS notifications (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    type TEXT NOT NULL,
    severity TEXT NOT NULL DEFAULT 'info',
    title TEXT NOT NULL,
    message TEXT NOT NULL,
    is_read INTEGER NOT NULL DEFAULT 0,
    read_at DATETIME,
    action_tab TEXT NOT NULL DEFAULT 'dashboard',
    action_entity_type TEXT,
    action_entity_id INTEGER,
    source_type TEXT,
    source_ref TEXT,
    dedupe_key TEXT,
    agency_id INTEGER,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    UNIQUE (agency_id, dedupe_key),
    FOREIGN KEY (agency_id) REFERENCES agencies(id)
  );

  CREATE TABLE IF NOT EXISTS sessions (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    token TEXT UNIQUE NOT NULL,
    user_id INTEGER NOT NULL,
    expires_at DATETIME NOT NULL,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (user_id) REFERENCES users(id)
  );

  CREATE TABLE IF NOT EXISTS password_reset_tokens (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    token TEXT UNIQUE NOT NULL,
    user_id INTEGER NOT NULL,
    requested_email TEXT NOT NULL,
    expires_at DATETIME NOT NULL,
    used_at DATETIME,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    agency_id INTEGER,
    FOREIGN KEY (user_id) REFERENCES users(id),
    FOREIGN KEY (agency_id) REFERENCES agencies(id)
  );

  CREATE TABLE IF NOT EXISTS two_factor_challenges (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    token TEXT UNIQUE NOT NULL,
    user_id INTEGER NOT NULL,
    purpose TEXT NOT NULL DEFAULT 'login',
    expires_at DATETIME NOT NULL,
    consumed_at DATETIME,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    agency_id INTEGER,
    FOREIGN KEY (user_id) REFERENCES users(id),
    FOREIGN KEY (agency_id) REFERENCES agencies(id)
  );

  CREATE TABLE IF NOT EXISTS auth_rate_limits (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    scope TEXT NOT NULL,
    identifier TEXT NOT NULL,
    failure_count INTEGER DEFAULT 0,
    lock_level INTEGER DEFAULT 0,
    blocked_until DATETIME,
    window_started_at DATETIME,
    last_attempt_at DATETIME,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    UNIQUE (scope, identifier)
  );
`);

type SubscriptionPlan = "starter" | "pro" | "enterprise";
type SupportedCurrency = "USD" | "EUR" | "MXN";
type SessionTimeout = "30m" | "2h" | "8h";

interface AppSettingsPayload {
  agency_name: string;
  subscription_plan: SubscriptionPlan;
  timezone: string;
  currency: SupportedCurrency;
  client_referral_program_enabled: boolean;
  partner_referral_program_enabled: boolean;
  email_reports: boolean;
  task_reminders: boolean;
  invoice_alerts: boolean;
  weekly_digest: boolean;
  two_factor: boolean;
  login_alerts: boolean;
  session_timeout: SessionTimeout;
  ai_trigger_new_lead: boolean;
  ai_trigger_client_report: boolean;
  ai_trigger_project_task_pack: boolean;
}

type StoredSettingKey = Exclude<keyof AppSettingsPayload, "agency_name" | "subscription_plan">;
type AiFeatureId = "proposal" | "strategy" | "analysis" | "content";
type AiAutomationId = "lead_followup" | "client_report" | "project_tasks";
type AiAutomationMode = "manual" | "trigger";
type AiAutomationRunStatus = "success" | "error" | "skipped";
type AiAutomationEntityType = "lead" | "client" | "project";
type AiTriggerSettingKey =
  | "ai_trigger_new_lead"
  | "ai_trigger_client_report"
  | "ai_trigger_project_task_pack";
type AuthRateLimitScope =
  | "login_email"
  | "login_ip"
  | "forgot_email"
  | "forgot_ip"
  | "two_factor_user"
  | "two_factor_ip";
type UserAccessStatus = "invited" | "active";
type ClientOnboardingStatus = "pending" | "in_progress" | "blocked" | "completed";
type ClientOnboardingStepStatus = "pending" | "in_progress" | "completed";
type TeamOnboardingStatus = "pending" | "in_progress" | "completed";
type TeamOnboardingStepStatus = "pending" | "in_progress" | "completed";
type ReferralCodeStatus = "active" | "paused" | "archived";
type ReferralStatus = "invited" | "lead" | "qualified" | "converted" | "rejected";
type ReferralPayoutStatus = "pending" | "approved" | "paid" | "cancelled";
type ReferralCommissionType = "percent" | "fixed";
type ServiceScope = "client" | "freelance" | "both";
type ServiceBillingModel = "one_time" | "monthly" | "hourly" | "weekly" | "performance";
type FreelancerStatus = "active" | "paused" | "inactive";
type ContractType = "client" | "freelance";
type ContractStatus = "draft" | "review" | "ready" | "sent" | "signed" | "archived";
type ContractValidationStatus = "valid" | "warning" | "invalid";
type ContractEventType =
  | "created"
  | "updated"
  | "review_started"
  | "approved"
  | "changes_requested"
  | "sent"
  | "signed"
  | "archived"
  | "status_changed";
type ReferralPartnerOwnerType = "team" | "freelance";
type ReferralPartnerStatus = "active" | "paused" | "archived";
type IntegrationKey =
  | "n8n"
  | "zapier"
  | "make"
  | "gmail"
  | "slack"
  | "google_ads"
  | "meta_ads"
  | "instagram"
  | "tiktok_ads"
  | "facebook_pages"
  | "landing_pages"
  | "external_crm"
  | "hubspot"
  | "google_sheets"
  | "google_calendar"
  | "calendly"
  | "stripe"
  | "paypal"
  | "wise"
  | "docusign"
  | "pandadoc";
type IntegrationCategory =
  | "automation"
  | "communication"
  | "ads"
  | "social"
  | "landing"
  | "crm"
  | "ops"
  | "payments"
  | "documents";
type IntegrationConnectionMode = "api_key" | "oauth" | "webhook" | "manual";
type IntegrationDirection = "inbound" | "outbound" | "bidirectional";
type IntegrationStatus = "connected" | "attention" | "disconnected";
type IntegrationEventDirection = "inbound" | "outbound";
type IntegrationEventStatus = "success" | "error" | "ignored";
type CalendarEventStatus = "scheduled" | "completed" | "cancelled";
type CalendarEventSourceType = "task" | "lead_followup" | "client_onboarding" | "calendly";
type CalendarEventKind = "deadline" | "followup" | "launch" | "meeting";
type NotificationType =
  | "task_due"
  | "lead_followup"
  | "client_onboarding"
  | "calendar_event"
  | "integration";
type NotificationSeverity = "info" | "warning" | "critical" | "success";

const AI_TRIGGER_KEYS: AiTriggerSettingKey[] = [
  "ai_trigger_new_lead",
  "ai_trigger_client_report",
  "ai_trigger_project_task_pack",
];

interface IntegrationTemplate {
  key: IntegrationKey;
  name: string;
  category: IntegrationCategory;
  connectionMode: IntegrationConnectionMode;
  direction: IntegrationDirection;
  description: string;
  scopes: string[];
  supportsWebhook: boolean;
  supportsLeadCapture: boolean;
  defaultSyncEnabled?: boolean;
  defaultAutoCaptureLeads?: boolean;
}

const integrationTemplates: IntegrationTemplate[] = [
  {
    key: "n8n",
    name: "n8n",
    category: "automation",
    connectionMode: "webhook",
    direction: "bidirectional",
    description: "Orquesta automatizaciones internas y sincronizaciones personalizadas.",
    scopes: ["lead.created", "client.converted", "project.created"],
    supportsWebhook: true,
    supportsLeadCapture: false,
  },
  {
    key: "zapier",
    name: "Zapier",
    category: "automation",
    connectionMode: "webhook",
    direction: "bidirectional",
    description: "Dispara flujos con apps externas sin tocar el core del CRM.",
    scopes: ["lead.created", "report.generated", "invoice.updated"],
    supportsWebhook: true,
    supportsLeadCapture: false,
  },
  {
    key: "make",
    name: "Make",
    category: "automation",
    connectionMode: "webhook",
    direction: "bidirectional",
    description: "Encadena automatizaciones visuales para operaciones multi-step.",
    scopes: ["lead.created", "task.updated", "campaign.changed"],
    supportsWebhook: true,
    supportsLeadCapture: false,
  },
  {
    key: "gmail",
    name: "Gmail",
    category: "communication",
    connectionMode: "oauth",
    direction: "outbound",
    description: "Centraliza avisos comerciales y operativos por email.",
    scopes: ["notifications", "followups", "report_delivery"],
    supportsWebhook: false,
    supportsLeadCapture: false,
  },
  {
    key: "slack",
    name: "Slack",
    category: "communication",
    connectionMode: "webhook",
    direction: "outbound",
    description: "Envía alertas de actividad, IA y operaciones al equipo.",
    scopes: ["alerts", "activity", "delivery"],
    supportsWebhook: true,
    supportsLeadCapture: false,
  },
  {
    key: "google_ads",
    name: "Google Ads",
    category: "ads",
    connectionMode: "oauth",
    direction: "bidirectional",
    description: "Conecta cuentas publicitarias para reporting y automatización.",
    scopes: ["campaigns", "spend", "reporting"],
    supportsWebhook: false,
    supportsLeadCapture: false,
  },
  {
    key: "meta_ads",
    name: "Meta Ads",
    category: "ads",
    connectionMode: "oauth",
    direction: "bidirectional",
    description: "Gestiona sincronización con campañas y activos de Meta.",
    scopes: ["campaigns", "ads", "reporting"],
    supportsWebhook: false,
    supportsLeadCapture: false,
  },
  {
    key: "instagram",
    name: "Instagram",
    category: "social",
    connectionMode: "oauth",
    direction: "bidirectional",
    description: "Conecta perfiles y flujos sociales para contenido y mensajes.",
    scopes: ["messages", "publishing", "engagement"],
    supportsWebhook: false,
    supportsLeadCapture: false,
  },
  {
    key: "tiktok_ads",
    name: "TikTok Ads",
    category: "ads",
    connectionMode: "oauth",
    direction: "bidirectional",
    description: "Sincroniza campañas y datos operativos de TikTok Ads.",
    scopes: ["campaigns", "spend", "reporting"],
    supportsWebhook: false,
    supportsLeadCapture: false,
  },
  {
    key: "facebook_pages",
    name: "Facebook Pages",
    category: "social",
    connectionMode: "oauth",
    direction: "bidirectional",
    description: "Conecta páginas, formularios y actividad social de Facebook.",
    scopes: ["messages", "forms", "publishing"],
    supportsWebhook: false,
    supportsLeadCapture: false,
  },
  {
    key: "landing_pages",
    name: "Landing Pages",
    category: "landing",
    connectionMode: "webhook",
    direction: "inbound",
    description: "Recibe formularios externos y convierte envíos en leads del CRM.",
    scopes: ["lead_capture", "form_submissions", "utm_tracking"],
    supportsWebhook: true,
    supportsLeadCapture: true,
    defaultSyncEnabled: true,
    defaultAutoCaptureLeads: true,
  },
  {
    key: "external_crm",
    name: "CRM Externo",
    category: "crm",
    connectionMode: "webhook",
    direction: "bidirectional",
    description: "Recibe y envía eventos operativos desde CRMs de terceros.",
    scopes: ["lead_sync", "client_sync", "pipeline_events"],
    supportsWebhook: true,
    supportsLeadCapture: true,
    defaultSyncEnabled: true,
    defaultAutoCaptureLeads: true,
  },
  {
    key: "hubspot",
    name: "HubSpot",
    category: "crm",
    connectionMode: "oauth",
    direction: "bidirectional",
    description: "Conecta pipeline comercial y propiedades del cliente con HubSpot.",
    scopes: ["contacts", "companies", "deals"],
    supportsWebhook: false,
    supportsLeadCapture: false,
  },
  {
    key: "google_sheets",
    name: "Google Sheets",
    category: "ops",
    connectionMode: "oauth",
    direction: "bidirectional",
    description: "Exporta y sincroniza operativa con hojas de cálculo vivas.",
    scopes: ["exports", "imports", "reporting"],
    supportsWebhook: false,
    supportsLeadCapture: false,
  },
  {
    key: "google_calendar",
    name: "Google Calendar",
    category: "ops",
    connectionMode: "oauth",
    direction: "bidirectional",
    description: "Sincroniza agenda operativa, tareas y reuniones con el calendario principal.",
    scopes: ["events.read", "events.write", "availability"],
    supportsWebhook: false,
    supportsLeadCapture: false,
    defaultSyncEnabled: true,
  },
  {
    key: "calendly",
    name: "Calendly",
    category: "ops",
    connectionMode: "oauth",
    direction: "bidirectional",
    description: "Recibe reuniones agendadas y coordina disponibilidad comercial y operativa.",
    scopes: ["meetings", "availability", "invitees"],
    supportsWebhook: true,
    supportsLeadCapture: false,
    defaultSyncEnabled: true,
  },
  {
    key: "stripe",
    name: "Stripe",
    category: "payments",
    connectionMode: "oauth",
    direction: "bidirectional",
    description: "Gestiona cobros, payouts y conciliación operativa desde un único punto.",
    scopes: ["payments", "payouts", "customers"],
    supportsWebhook: true,
    supportsLeadCapture: false,
  },
  {
    key: "paypal",
    name: "PayPal",
    category: "payments",
    connectionMode: "oauth",
    direction: "bidirectional",
    description: "Centraliza cobros y liquidaciones puntuales con clientes y colaboradores.",
    scopes: ["payments", "payouts", "invoices"],
    supportsWebhook: true,
    supportsLeadCapture: false,
  },
  {
    key: "wise",
    name: "Wise",
    category: "payments",
    connectionMode: "manual",
    direction: "outbound",
    description: "Organiza pagos internacionales y referencias de payout para equipo y freelance.",
    scopes: ["payouts", "banking", "references"],
    supportsWebhook: false,
    supportsLeadCapture: false,
  },
  {
    key: "docusign",
    name: "DocuSign",
    category: "documents",
    connectionMode: "oauth",
    direction: "outbound",
    description: "Prepara contratos para firma digital y seguimiento de estado.",
    scopes: ["envelopes", "signatures", "documents"],
    supportsWebhook: true,
    supportsLeadCapture: false,
  },
  {
    key: "pandadoc",
    name: "PandaDoc",
    category: "documents",
    connectionMode: "oauth",
    direction: "outbound",
    description: "Genera propuestas y contratos listos para validación y firma.",
    scopes: ["documents", "approvals", "signatures"],
    supportsWebhook: true,
    supportsLeadCapture: false,
  },
];

interface ClientOnboardingStepTemplate {
  title: string;
  description: string;
  priority: "low" | "medium" | "high";
  dueOffsetDays: number;
}

interface TeamOnboardingStepTemplate {
  title: string;
  description: string;
}

interface AuthUser {
  id: number;
  email: string;
  name: string;
  role: string;
  status: "online" | "meeting" | "offline";
  agency_id: number | null;
  client_id?: number | null;
  freelancer_id?: number | null;
  two_factor_enabled: boolean;
  accessible_sections: AppSection[];
}

interface AuditLogParams {
  action: string;
  entityType: string;
  entityId?: number | null;
  description: string;
  metadata?: Record<string, unknown> | null;
  authUser?: AuthUser | null;
  userId?: number | null;
  actorName?: string | null;
  actorEmail?: string | null;
  agencyId?: number | null;
}

interface ContractEventParams {
  contractId: number;
  eventType: ContractEventType;
  title: string;
  description: string;
  metadata?: Record<string, unknown> | null;
  authUser?: AuthUser | null;
  userId?: number | null;
  actorName?: string | null;
  actorEmail?: string | null;
  agencyId?: number | null;
}

interface AIAutomationActionResult {
  type: string;
  label: string;
  status: "created" | "updated" | "skipped";
  details: string;
  target_id?: number | null;
}

interface AIAutomationExecutionResponse {
  automation: AiAutomationId;
  source: "local";
  summary: string;
  applied_actions: AIAutomationActionResult[];
}

interface ProductionReadinessItem {
  key: string;
  status: "ready" | "warning" | "critical";
  label: string;
  detail: string;
}

interface RuntimeReadinessReport {
  overall_status: "ready" | "warning" | "critical";
  items: ProductionReadinessItem[];
  checked_at: string;
  environment: "development" | "production";
  release: string | null;
  uptime_seconds: number;
}

interface ReferralCodeRow {
  id: number;
  client_id: number;
  code: string;
  landing_url: string | null;
  commission_type: ReferralCommissionType;
  commission_value: number;
  reward_description: string | null;
  status: ReferralCodeStatus;
  notes: string | null;
  agency_id: number;
  created_at: string;
  updated_at: string;
}

interface ReferralRow {
  id: number;
  referral_code_id: number;
  referrer_client_id: number;
  referred_name: string;
  referred_company: string | null;
  referred_email: string | null;
  referred_phone: string | null;
  status: ReferralStatus;
  payout_status: ReferralPayoutStatus;
  commission_amount: number;
  currency: SupportedCurrency;
  payout_due_date: string | null;
  paid_at: string | null;
  lead_id: number | null;
  converted_client_id: number | null;
  invoice_id: number | null;
  source: string | null;
  notes: string | null;
  created_at: string;
  updated_at: string;
  converted_at: string | null;
  agency_id: number;
}

interface ServicePriceRow {
  id: number;
  name: string;
  category: string;
  description: string | null;
  service_scope: ServiceScope;
  unit_label: string;
  billing_model: ServiceBillingModel;
  default_price: number;
  currency: SupportedCurrency;
  tax_rate: number;
  legal_label: string | null;
  notes: string | null;
  is_active: number;
  agency_id: number;
  created_at: string;
  updated_at: string;
}

interface FreelancerRow {
  id: number;
  name: string;
  email: string;
  specialty: string | null;
  hourly_rate: number;
  currency: SupportedCurrency;
  tax_id: string | null;
  payment_method: string | null;
  payout_reference: string | null;
  payout_integration_key: IntegrationKey | null;
  notes: string | null;
  status: FreelancerStatus;
  agency_id: number;
  created_at: string;
  updated_at: string;
}

interface FreelancerProjectAssignmentRow {
  id: number;
  project_id: number;
  freelancer_id: number;
  role_label: string | null;
  notes: string | null;
  status: "active" | "paused" | "archived";
  agency_id: number;
  created_at: string;
  updated_at: string;
}

interface ContractRow {
  id: number;
  contract_number: string;
  contract_type: ContractType;
  client_id: number | null;
  freelancer_id: number | null;
  owner_user_id: number | null;
  template_key: string;
  status: ContractStatus;
  currency: SupportedCurrency;
  payment_terms: string;
  start_date: string;
  end_date: string | null;
  counterparty_name: string;
  counterparty_email: string | null;
  counterparty_tax_id: string | null;
  counterparty_address: string | null;
  scope_summary: string | null;
  custom_requirements: string | null;
  payment_integration_key: IntegrationKey | null;
  signature_integration_key: IntegrationKey | null;
  subtotal: number;
  tax_amount: number;
  total_amount: number;
  generated_body: string;
  document_url: string | null;
  validation_status: ContractValidationStatus;
  validation_notes: string | null;
  signed_at: string | null;
  archived_at: string | null;
  agency_id: number;
  created_at: string;
  updated_at: string;
}

interface ContractLineItemRow {
  id: number;
  contract_id: number;
  service_price_id: number | null;
  title: string;
  description: string | null;
  quantity: number;
  unit_price: number;
  tax_rate: number;
  line_total: number;
  created_at: string;
}

interface ContractEventRow {
  id: number;
  contract_id: number;
  event_type: ContractEventType;
  title: string;
  description: string;
  metadata: string | null;
  user_id: number | null;
  actor_name: string;
  actor_email: string | null;
  agency_id: number | null;
  created_at: string;
}

interface ClientOnboardingDocumentRow {
  id: number;
  client_id: number;
  onboarding_id: number;
  step_id: number | null;
  title: string;
  notes: string | null;
  file_name: string;
  file_type: string | null;
  file_size: number;
  file_data_url: string;
  uploaded_by_user_id: number | null;
  uploaded_by_name: string | null;
  agency_id: number | null;
  created_at: string;
}

interface ClientOnboardingFormRow {
  id: number;
  client_id: number;
  onboarding_id: number;
  advertising_accesses: string | null;
  business_goals: string | null;
  target_audience: string | null;
  competition: string | null;
  ad_budget: number;
  status: "draft" | "submitted";
  submitted_at: string | null;
  submitted_by_user_id: number | null;
  submitted_by_name: string | null;
  agency_id: number | null;
  created_at: string;
  updated_at: string;
}

interface ReferralPartnerRow {
  id: number;
  owner_type: ReferralPartnerOwnerType;
  user_id: number | null;
  freelancer_id: number | null;
  payment_method: string | null;
  payout_reference: string | null;
  payout_integration_key: IntegrationKey | null;
  notes: string | null;
  status: ReferralPartnerStatus;
  agency_id: number;
  created_at: string;
  updated_at: string;
}

interface PartnerReferralCodeRow {
  id: number;
  partner_id: number;
  code: string;
  landing_url: string | null;
  commission_type: ReferralCommissionType;
  commission_value: number;
  reward_description: string | null;
  status: ReferralCodeStatus;
  notes: string | null;
  agency_id: number;
  created_at: string;
  updated_at: string;
}

interface PartnerReferralRow {
  id: number;
  referral_code_id: number;
  partner_id: number;
  referred_name: string;
  referred_company: string | null;
  referred_email: string | null;
  referred_phone: string | null;
  status: ReferralStatus;
  payout_status: ReferralPayoutStatus;
  commission_amount: number;
  currency: SupportedCurrency;
  payout_due_date: string | null;
  paid_at: string | null;
  lead_id: number | null;
  converted_client_id: number | null;
  invoice_id: number | null;
  source: string | null;
  notes: string | null;
  created_at: string;
  updated_at: string;
  converted_at: string | null;
  agency_id: number;
}

interface ExecuteAIAutomationOptions {
  automation: AiAutomationId;
  entityId: number;
  input?: string;
  authUser?: AuthUser | null;
  bypassAccessChecks?: boolean;
  auditAction?: string;
  auditDescription?: string;
  auditMetadata?: Record<string, unknown> | null;
}

interface RunAIAutomationTriggerOptions {
  agencyId: number;
  triggerKey: AiTriggerSettingKey;
  automation: AiAutomationId;
  entityId: number;
  input?: string;
  entityType: AiAutomationEntityType;
  authUser?: AuthUser | null;
  description: string;
}

interface AIAutomationRunParams {
  automation: AiAutomationId;
  mode: AiAutomationMode;
  status: AiAutomationRunStatus;
  entityType: AiAutomationEntityType;
  entityId?: number | null;
  triggerKey?: AiTriggerSettingKey | null;
  source?: "gemini" | "local";
  summary?: string | null;
  errorMessage?: string | null;
  actions?: AIAutomationActionResult[] | null;
  authUser?: AuthUser | null;
  userId?: number | null;
  actorName?: string | null;
  actorEmail?: string | null;
  agencyId?: number | null;
}

type ArchiveScope = "active" | "archived" | "all";

const defaultAppSettings: AppSettingsPayload = {
  agency_name: "ZaaRyx Global",
  subscription_plan: "pro",
  timezone: "Europe/Madrid",
  currency: "EUR",
  client_referral_program_enabled: true,
  partner_referral_program_enabled: true,
  email_reports: true,
  task_reminders: true,
  invoice_alerts: true,
  weekly_digest: false,
  two_factor: false,
  login_alerts: true,
  session_timeout: "2h",
  ai_trigger_new_lead: false,
  ai_trigger_client_report: false,
  ai_trigger_project_task_pack: false,
};

const storedSettingKeys: StoredSettingKey[] = [
  "timezone",
  "currency",
  "client_referral_program_enabled",
  "partner_referral_program_enabled",
  "email_reports",
  "task_reminders",
  "invoice_alerts",
  "weekly_digest",
  "two_factor",
  "login_alerts",
  "session_timeout",
  "ai_trigger_new_lead",
  "ai_trigger_client_report",
  "ai_trigger_project_task_pack",
];

const booleanSettingKeys: StoredSettingKey[] = [
  "client_referral_program_enabled",
  "partner_referral_program_enabled",
  "email_reports",
  "task_reminders",
  "invoice_alerts",
  "weekly_digest",
  "two_factor",
  "login_alerts",
  "ai_trigger_new_lead",
  "ai_trigger_client_report",
  "ai_trigger_project_task_pack",
];

const aiFeaturePrompts: Record<AiFeatureId, string> = {
  proposal:
    "Redacta una propuesta comercial persuasiva para una agencia de marketing digital enfocada en",
  strategy:
    "Genera una estrategia de marketing digital completa de 3 meses para un cliente en el sector de",
  analysis: "Analiza los siguientes KPIs de campaña y sugiere 5 optimizaciones:",
  content: "Genera 10 ideas creativas de contenido para redes sociales para una marca de",
};

const clientOnboardingStepTemplates: ClientOnboardingStepTemplate[] = [
  {
    title: "Firma de contrato digital",
    description: "Enviar, revisar y validar la firma digital del acuerdo comercial antes del arranque.",
    priority: "high",
    dueOffsetDays: 1,
  },
  {
    title: "Formulario de onboarding",
    description: "Recoger accesos publicitarios, objetivos, publico objetivo, competencia y presupuesto.",
    priority: "high",
    dueOffsetDays: 2,
  },
  {
    title: "Auditoria inicial",
    description: "Auditar la situacion actual de activos, embudos, campañas y presencia digital.",
    priority: "high",
    dueOffsetDays: 4,
  },
  {
    title: "Estrategia",
    description: "Definir enfoque estrategico, objetivos de medios, oferta y mensajes principales.",
    priority: "medium",
    dueOffsetDays: 6,
  },
  {
    title: "Creacion de campañas",
    description: "Configurar la estructura de campañas, conjuntos, anuncios y recursos iniciales.",
    priority: "medium",
    dueOffsetDays: 8,
  },
  {
    title: "Configuracion tracking",
    description: "Implementar medicion, eventos, conversiones, paneles y validaciones tecnicas.",
    priority: "high",
    dueOffsetDays: 9,
  },
  {
    title: "Implementacion CRM",
    description: "Conectar CRM, pipelines, fuentes de lead y campos necesarios para operar.",
    priority: "medium",
    dueOffsetDays: 11,
  },
  {
    title: "Automatizaciones",
    description: "Activar automatizaciones operativas, alertas, seguimiento y traspasos de datos.",
    priority: "high",
    dueOffsetDays: 13,
  },
];

const legacyClientOnboardingStepTitles = [
  "kickoff y briefing",
  "accesos y permisos",
  "tracking y analytics",
  "assets y creatividades",
  "validación y aprobaciones",
  "lanzamiento operativo",
];

const teamOnboardingStepTemplates: TeamOnboardingStepTemplate[] = [
  {
    title: "Activar cuenta",
    description: "Crear la contraseña inicial y validar el acceso seguro a la plataforma.",
  },
  {
    title: "Configurar perfil y seguridad",
    description: "Revisar rol, preferencias y medidas básicas de seguridad operativa.",
  },
  {
    title: "Leer playbook y SOP",
    description: "Entender procesos, estándares y forma de trabajo interna del equipo.",
  },
  {
    title: "Confirmar herramientas y accesos",
    description: "Verificar cuentas, plataformas, permisos y stack necesario para operar.",
  },
  {
    title: "Primera sesión acompañada",
    description: "Completar la primera sesión de transferencia con el responsable del área.",
  },
  {
    title: "Primer entregable operativo",
    description: "Cerrar una primera tarea real y dejar constancia de que el onboarding quedó aplicado.",
  },
];

const aiSystemInstruction =
  "Eres ZaaRyx AI, un estratega senior de marketing digital, automatización y operaciones para agencias. Responde en español, con foco práctico, claridad ejecutiva y orientación a resultados.";

const SESSION_COOKIE_NAME = "zaaryx_session";
const PASSWORD_SCHEME = "scrypt";
const PASSWORD_RESET_TOKEN_TTL_MS = 30 * 60 * 1000;
const PASSWORD_RESET_RESEND_COOLDOWN_MS = 90 * 1000;
const TWO_FACTOR_CHALLENGE_TTL_MS = 5 * 60 * 1000;
const TWO_FACTOR_BACKUP_CODE_COUNT = 8;
const AUTH_RATE_LIMIT_RESET_AFTER_MS = 24 * 60 * 60 * 1000;
const AUTH_RATE_LIMIT_CONFIG: Record<
  AuthRateLimitScope,
  {
    maxAttempts: number;
    windowMs: number;
    lockStepsMs: number[];
    resetAfterMs: number;
  }
> = {
  login_email: {
    maxAttempts: 5,
    windowMs: 15 * 60 * 1000,
    lockStepsMs: [5 * 60 * 1000, 15 * 60 * 1000, 60 * 60 * 1000],
    resetAfterMs: AUTH_RATE_LIMIT_RESET_AFTER_MS,
  },
  login_ip: {
    maxAttempts: 12,
    windowMs: 15 * 60 * 1000,
    lockStepsMs: [5 * 60 * 1000, 15 * 60 * 1000, 60 * 60 * 1000],
    resetAfterMs: AUTH_RATE_LIMIT_RESET_AFTER_MS,
  },
  forgot_email: {
    maxAttempts: 3,
    windowMs: 15 * 60 * 1000,
    lockStepsMs: [15 * 60 * 1000, 60 * 60 * 1000],
    resetAfterMs: AUTH_RATE_LIMIT_RESET_AFTER_MS,
  },
  forgot_ip: {
    maxAttempts: 10,
    windowMs: 15 * 60 * 1000,
    lockStepsMs: [15 * 60 * 1000, 60 * 60 * 1000],
    resetAfterMs: AUTH_RATE_LIMIT_RESET_AFTER_MS,
  },
  two_factor_user: {
    maxAttempts: 5,
    windowMs: 10 * 60 * 1000,
    lockStepsMs: [5 * 60 * 1000, 15 * 60 * 1000, 60 * 60 * 1000],
    resetAfterMs: AUTH_RATE_LIMIT_RESET_AFTER_MS,
  },
  two_factor_ip: {
    maxAttempts: 10,
    windowMs: 10 * 60 * 1000,
    lockStepsMs: [5 * 60 * 1000, 15 * 60 * 1000, 60 * 60 * 1000],
    resetAfterMs: AUTH_RATE_LIMIT_RESET_AFTER_MS,
  },
};
const JSON_BODY_LIMIT = process.env.JSON_BODY_LIMIT?.trim() || "1mb";
const IS_PRODUCTION = process.env.NODE_ENV === "production";
const TRUST_PROXY_ENABLED = parseBooleanEnvFlag(process.env.TRUST_PROXY);
const SECURE_COOKIES_ENABLED = parseBooleanEnvFlag(process.env.SECURE_COOKIES);
const STRICT_PRODUCTION_CHECKS_ENABLED = parseBooleanEnvFlag(process.env.STRICT_PRODUCTION_CHECKS);

const serializeStoredSettingValue = <T extends StoredSettingKey>(value: AppSettingsPayload[T]) =>
  (typeof value === "boolean" ? String(value) : value) as string;

const parseStoredSettingValue = <T extends StoredSettingKey>(
  key: T,
  value: string,
): AppSettingsPayload[T] =>
  (booleanSettingKeys.includes(key) ? value === "true" : value) as AppSettingsPayload[T];

const getAppSettings = (agencyId: number): AppSettingsPayload => {
  const agency = db
    .prepare("SELECT name, subscription_plan FROM agencies WHERE id = ?")
    .get(agencyId) as { name: string; subscription_plan: string } | undefined;
  const rows = db
    .prepare("SELECT key, value FROM app_settings WHERE agency_id = ?")
    .all(agencyId) as Array<{ key: StoredSettingKey; value: string }>;

  const settings: AppSettingsPayload = {
    ...defaultAppSettings,
    agency_name: agency?.name || defaultAppSettings.agency_name,
    subscription_plan:
      agency?.subscription_plan === "starter" ||
      agency?.subscription_plan === "pro" ||
      agency?.subscription_plan === "enterprise"
        ? agency.subscription_plan
        : defaultAppSettings.subscription_plan,
  };

  rows.forEach((row) => {
    switch (row.key) {
      case "timezone":
        settings.timezone = parseStoredSettingValue(row.key, row.value);
        break;
      case "currency":
        settings.currency = parseStoredSettingValue(row.key, row.value);
        break;
      case "client_referral_program_enabled":
        settings.client_referral_program_enabled = parseStoredSettingValue(row.key, row.value);
        break;
      case "partner_referral_program_enabled":
        settings.partner_referral_program_enabled = parseStoredSettingValue(row.key, row.value);
        break;
      case "email_reports":
        settings.email_reports = parseStoredSettingValue(row.key, row.value);
        break;
      case "task_reminders":
        settings.task_reminders = parseStoredSettingValue(row.key, row.value);
        break;
      case "invoice_alerts":
        settings.invoice_alerts = parseStoredSettingValue(row.key, row.value);
        break;
      case "weekly_digest":
        settings.weekly_digest = parseStoredSettingValue(row.key, row.value);
        break;
      case "two_factor":
        settings.two_factor = parseStoredSettingValue(row.key, row.value);
        break;
      case "login_alerts":
        settings.login_alerts = parseStoredSettingValue(row.key, row.value);
        break;
      case "session_timeout":
        settings.session_timeout = parseStoredSettingValue(row.key, row.value);
        break;
      case "ai_trigger_new_lead":
        settings.ai_trigger_new_lead = parseStoredSettingValue(row.key, row.value);
        break;
      case "ai_trigger_client_report":
        settings.ai_trigger_client_report = parseStoredSettingValue(row.key, row.value);
        break;
      case "ai_trigger_project_task_pack":
        settings.ai_trigger_project_task_pack = parseStoredSettingValue(row.key, row.value);
        break;
      default:
        break;
    }
  });

  return settings;
};

const saveAppSettings = (agencyId: number, settings: AppSettingsPayload) => {
  db.prepare("UPDATE agencies SET name = ?, subscription_plan = ? WHERE id = ?").run(
    settings.agency_name,
    settings.subscription_plan,
    agencyId,
  );

  const upsertSetting = db.prepare(
    `
      INSERT INTO app_settings (agency_id, key, value)
      VALUES (?, ?, ?)
      ON CONFLICT(agency_id, key) DO UPDATE SET value = excluded.value
    `,
  );

  storedSettingKeys.forEach((key) => {
    upsertSetting.run(agencyId, key, serializeStoredSettingValue(settings[key]));
  });
};

const buildAiFallbackResponse = (feature: AiFeatureId, input: string) => {
  const cleanedInput = input.trim();

  switch (feature) {
    case "proposal":
      return [
        `# Propuesta Comercial`,
        "",
        `## Contexto`,
        `Cliente objetivo: ${cleanedInput}`,
        "",
        `## Alcance recomendado`,
        `- Diagnóstico inicial del embudo y activos digitales.`,
        `- Plan de captación con campañas, automatización y reporting semanal.`,
        `- Optimización continua con foco en CAC, ROAS y velocidad comercial.`,
        "",
        `## Entregables`,
        `1. Auditoría inicial y roadmap de 90 días.`,
        `2. Configuración de tracking, dashboards y automatizaciones.`,
        `3. Sprint semanal de optimización y comité mensual ejecutivo.`,
        "",
        `## Resultado esperado`,
        `Alinear marketing y ventas para crecer de forma predecible con una operación más medible.`,
      ].join("\n");
    case "strategy":
      return [
        `# Estrategia de 90 días`,
        "",
        `Sector o caso: ${cleanedInput}`,
        "",
        `## Mes 1`,
        `- Auditoría de canales, oferta y activos creativos.`,
        `- Definición de ICP, mensajes y tracking.`,
        `- Lanzamiento de campañas base y embudos principales.`,
        "",
        `## Mes 2`,
        `- Optimización de segmentaciones y creatividades.`,
        `- Automatización de seguimiento comercial.`,
        `- Test A/B de ofertas, hooks y landings.`,
        "",
        `## Mes 3`,
        `- Escalado de campañas ganadoras.`,
        `- Reasignación de presupuesto según ROAS y CPL.`,
        `- Reporte ejecutivo con plan del siguiente trimestre.`,
        "",
        `## KPIs`,
        `- CPL y CAC`,
        `- Conversión de landing y de pipeline`,
        `- ROAS y margen por canal`,
      ].join("\n");
    case "analysis":
      return [
        `# Analisis de Campaña`,
        "",
        `Datos revisados: ${cleanedInput}`,
        "",
        `## Diagnóstico`,
        `- Revisa la relación entre CTR, CPC y tasa de conversión para detectar fricción en el anuncio o en la landing.`,
        `- Contrasta el gasto con la generación real de oportunidades y no solo con clics.`,
        "",
        `## 5 optimizaciones`,
        `1. Separar campañas por intención y nivel de conciencia.`,
        `2. Reducir audiencias frías con baja conversión y reforzar remarketing.`,
        `3. Renovar creatividades con nuevos hooks y pruebas por ángulo.`,
        `4. Ajustar la landing para mejorar velocidad, prueba social y CTA.`,
        `5. Reasignar presupuesto a anuncios y segmentos con mayor ROAS.`,
      ].join("\n");
    case "content":
      return [
        `# Ideas de Contenido`,
        "",
        `Marca o nicho: ${cleanedInput}`,
        "",
        `1. Antes y despues de un caso real.`,
        `2. Error comun que bloquea resultados.`,
        `3. Checklist rapido en carrusel.`,
        `4. Mito vs realidad del sector.`,
        `5. Detras de camaras del proceso.`,
        `6. Mini tutorial de 30 segundos.`,
        `7. Preguntas frecuentes respondidas por el equipo.`,
        `8. Breakdown de una campaña ganadora.`,
        `9. Tendencia adaptada al nicho.`,
        `10. Llamada a la accion con oferta o lead magnet.`,
      ].join("\n");
    default:
      return cleanedInput;
  }
};

const getLeadAutomationDefaults = (
  status: {
    status: "new" | "contacted" | "meeting" | "diagnosis" | "proposal" | "negotiation" | "closed" | "lost";
  }["status"],
) => {
  switch (status) {
    case "new":
      return {
        nextAction: "Contactar por primera vez y validar encaje comercial",
        offsetDays: 1,
      };
    case "contacted":
      return {
        nextAction: "Enviar propuesta inicial y cerrar siguiente llamada",
        offsetDays: 2,
      };
    case "meeting":
      return {
        nextAction: "Mandar recap de reunión y acordar diagnóstico",
        offsetDays: 1,
      };
    case "diagnosis":
      return {
        nextAction: "Convertir hallazgos en propuesta personalizada",
        offsetDays: 2,
      };
    case "proposal":
      return {
        nextAction: "Resolver objeciones y empujar decisión final",
        offsetDays: 2,
      };
    case "negotiation":
      return {
        nextAction: "Cerrar condiciones finales y confirmar arranque",
        offsetDays: 1,
      };
    case "closed":
      return {
        nextAction: "Preparar traspaso a onboarding y expectativas de kickoff",
        offsetDays: 3,
      };
    case "lost":
      return {
        nextAction: "Registrar motivo de pérdida y planificar reactivación",
        offsetDays: 30,
      };
    default:
      return {
        nextAction: "Revisar oportunidad y definir siguiente paso comercial",
        offsetDays: 2,
      };
  }
};

const buildLeadAutomationPlan = (
  lead: {
    id: number;
    name: string;
    company: string | null;
    service: string | null;
    status: "new" | "contacted" | "meeting" | "diagnosis" | "proposal" | "negotiation" | "closed" | "lost";
  },
  input: string,
) => {
  const defaults = getLeadAutomationDefaults(lead.status);
  const companyName = (lead.company || lead.name).trim();
  const cleanedInput = input.trim();
  const nextAction = cleanedInput
    ? `${defaults.nextAction}. Contexto adicional: ${cleanedInput}`
    : defaults.nextAction;
  const nextContactDate = addDays(new Date(), defaults.offsetDays);
  const note = [
    `IA operativa revisó el lead ${companyName}.`,
    `Siguiente acción sugerida: ${nextAction}.`,
    `Servicio prioritario: ${lead.service || "sin servicio definido"}.`,
    `Seguimiento recomendado para ${nextContactDate}.`,
  ].join(" ");

  return {
    nextAction,
    nextContactDate,
    note,
    taskTitle: `[AI] Seguimiento comercial - ${companyName}`,
    taskDescription: `${defaults.nextAction}.${cleanedInput ? ` Contexto: ${cleanedInput}.` : ""}`,
  };
};

const buildProjectAutomationTemplates = (
  project: {
    name: string;
    status: "strategy" | "setup" | "execution" | "optimization" | "reporting" | "completed";
  },
  input: string,
) => {
  const cleanedInput = input.trim();
  const contextSuffix = cleanedInput ? ` Contexto adicional: ${cleanedInput}.` : "";

  switch (project.status) {
    case "strategy":
      return [
        {
          title: `[AI] ICP y propuesta de valor - ${project.name}`,
          description: `Definir ICP, mensaje central y diferenciadores del proyecto.${contextSuffix}`,
          priority: "high" as const,
          dueDate: addDays(new Date(), 1),
        },
        {
          title: `[AI] KPIs y metas del sprint - ${project.name}`,
          description: `Aterrizar métricas de éxito y objetivos ejecutables para el primer sprint.${contextSuffix}`,
          priority: "high" as const,
          dueDate: addDays(new Date(), 3),
        },
        {
          title: `[AI] Roadmap de 30 días - ${project.name}`,
          description: `Construir roadmap táctico del primer mes con dependencias y responsables.${contextSuffix}`,
          priority: "medium" as const,
          dueDate: addDays(new Date(), 5),
        },
      ];
    case "setup":
      return [
        {
          title: `[AI] Checklist de tracking - ${project.name}`,
          description: `Validar medición, eventos, dashboards y estructura de campañas.${contextSuffix}`,
          priority: "high" as const,
          dueDate: addDays(new Date(), 1),
        },
        {
          title: `[AI] Recopilar activos y accesos - ${project.name}`,
          description: `Confirmar creatividades, copies, accesos y dependencias técnicas.${contextSuffix}`,
          priority: "high" as const,
          dueDate: addDays(new Date(), 2),
        },
        {
          title: `[AI] Pre-flight de lanzamiento - ${project.name}`,
          description: `Revisar lista final antes de publicar la operación inicial.${contextSuffix}`,
          priority: "medium" as const,
          dueDate: addDays(new Date(), 4),
        },
      ];
    case "execution":
      return [
        {
          title: `[AI] Revisión semanal de rendimiento - ${project.name}`,
          description: `Analizar resultados, desvíos y oportunidades inmediatas de optimización.${contextSuffix}`,
          priority: "high" as const,
          dueDate: addDays(new Date(), 1),
        },
        {
          title: `[AI] Iteración creativa - ${project.name}`,
          description: `Plantear nuevos hooks, anuncios o assets según el desempeño actual.${contextSuffix}`,
          priority: "medium" as const,
          dueDate: addDays(new Date(), 3),
        },
        {
          title: `[AI] Seguimiento a stakeholders - ${project.name}`,
          description: `Compartir estado, bloqueos y próximos hitos del proyecto.${contextSuffix}`,
          priority: "medium" as const,
          dueDate: addDays(new Date(), 5),
        },
      ];
    case "optimization":
      return [
        {
          title: `[AI] Priorización de experimentos - ${project.name}`,
          description: `Definir test A/B y oportunidades con mayor impacto esperado.${contextSuffix}`,
          priority: "high" as const,
          dueDate: addDays(new Date(), 1),
        },
        {
          title: `[AI] Reasignación de presupuesto - ${project.name}`,
          description: `Ajustar presupuesto y foco operativo según rendimiento y retorno.${contextSuffix}`,
          priority: "medium" as const,
          dueDate: addDays(new Date(), 3),
        },
        {
          title: `[AI] Optimización de funnel - ${project.name}`,
          description: `Revisar fricción de conversión y acciones de mejora del embudo.${contextSuffix}`,
          priority: "medium" as const,
          dueDate: addDays(new Date(), 5),
        },
      ];
    case "reporting":
      return [
        {
          title: `[AI] Cierre ejecutivo - ${project.name}`,
          description: `Consolidar resultados, insights y lectura ejecutiva del periodo.${contextSuffix}`,
          priority: "high" as const,
          dueDate: addDays(new Date(), 1),
        },
        {
          title: `[AI] Recomendaciones del siguiente sprint - ${project.name}`,
          description: `Priorizar decisiones y próximos pasos para el nuevo ciclo.${contextSuffix}`,
          priority: "medium" as const,
          dueDate: addDays(new Date(), 3),
        },
        {
          title: `[AI] Documentación de aprendizajes - ${project.name}`,
          description: `Registrar hipótesis, resultados y aprendizajes accionables.${contextSuffix}`,
          priority: "medium" as const,
          dueDate: addDays(new Date(), 5),
        },
      ];
    case "completed":
    default:
      return [
        {
          title: `[AI] Post-mortem - ${project.name}`,
          description: `Documentar aciertos, riesgos y oportunidades de mejora del proyecto.${contextSuffix}`,
          priority: "medium" as const,
          dueDate: addDays(new Date(), 2),
        },
        {
          title: `[AI] Caso de éxito interno - ${project.name}`,
          description: `Estructurar aprendizajes reutilizables para operaciones futuras.${contextSuffix}`,
          priority: "low" as const,
          dueDate: addDays(new Date(), 4),
        },
        {
          title: `[AI] Oportunidad de upsell - ${project.name}`,
          description: `Identificar siguiente propuesta de valor para la cuenta.${contextSuffix}`,
          priority: "low" as const,
          dueDate: addDays(new Date(), 6),
        },
      ];
  }
};

const executeAIAutomation = ({
  automation,
  entityId,
  input = "",
  authUser = null,
  bypassAccessChecks = false,
  auditAction = "ai.automation_run",
  auditDescription,
  auditMetadata = null,
}: ExecuteAIAutomationOptions): AIAutomationExecutionResponse => {
  const cleanedInput = input.trim();

  if (automation === "lead_followup") {
    if (!bypassAccessChecks && (!authUser || !canAccessSection(authUser.role, "leads"))) {
      throw new Error("Forbidden");
    }

    const lead = getLeadRecordById(entityId);

    if (
      !lead ||
      isArchivedRecord(lead) ||
      (!bypassAccessChecks && !isAgencyOwnedRecord(lead, authUser?.agency_id ?? -1))
    ) {
      throw new Error("Lead not found");
    }

    const plan = buildLeadAutomationPlan(lead, cleanedInput);
    const actions: AIAutomationActionResult[] = [];

    db.prepare(
      `
        UPDATE leads
        SET next_action = ?, next_contact_date = ?
        WHERE id = ?
      `,
    ).run(plan.nextAction, plan.nextContactDate, lead.id);
    syncLeadFollowUpCalendarEvent(lead.id);
    actions.push({
      type: "lead",
      label: "Seguimiento actualizado",
      status: "updated",
      details: `Próxima acción: ${plan.nextAction}. Seguimiento: ${plan.nextContactDate}.`,
      target_id: lead.id,
    });

    const noteAuthorName = authUser?.name || "Sistema IA";
    const noteId = Number(
      db
        .prepare(
          `
            INSERT INTO lead_notes (lead_id, author_id, author_name, type, content)
            VALUES (?, ?, ?, 'note', ?)
          `,
        )
        .run(lead.id, authUser?.id ?? null, noteAuthorName, plan.note).lastInsertRowid,
    );
    actions.push({
      type: "lead_note",
      label: "Nota comercial creada",
      status: "created",
      details: "Se registró una nota operativa con el siguiente paso sugerido por IA.",
      target_id: noteId,
    });

    if (bypassAccessChecks || (authUser && canAccessSection(authUser.role, "tasks"))) {
      const matchedClient =
        lead.company && lead.company.trim()
          ? getClientRecordByCompany(lead.agency_id || authUser?.agency_id || 0, lead.company)
          : undefined;
      const taskProject =
        (matchedClient ? getFirstProjectRecordByClientId(matchedClient.id) : undefined) ||
        getDefaultProjectForAgency(lead.agency_id || 0);

      if (taskProject) {
        const taskId = Number(
          db
            .prepare(
              `
                INSERT INTO tasks (
                  project_id,
                  title,
                  description,
                  status,
                  priority,
                  due_date,
                  assigned_to,
                  agency_id
                )
                VALUES (?, ?, ?, 'todo', 'high', ?, ?, ?)
              `,
            )
            .run(
              taskProject.id,
              plan.taskTitle,
              plan.taskDescription,
              plan.nextContactDate,
              authUser?.id ?? null,
              taskProject.agency_id,
            ).lastInsertRowid,
        );
        actions.push({
          type: "task",
          label: "Tarea de seguimiento creada",
          status: "created",
          details: "Se creó una tarea operativa para ejecutar el siguiente paso comercial.",
          target_id: taskId,
        });
        syncTaskCalendarEvent(taskId);
      } else {
        actions.push({
          type: "task",
          label: "Tarea no creada",
          status: "skipped",
          details: "No existe un proyecto disponible para vincular la tarea de seguimiento.",
        });
      }
    } else {
      actions.push({
        type: "task",
        label: "Tarea omitida",
        status: "skipped",
        details: "Tu rol no tiene acceso a tareas, así que la automatización no creó una tarea.",
      });
    }

    createAuditLog({
      action: auditAction,
      entityType: "lead",
      entityId: lead.id,
      description:
        auditDescription ||
        `Se ejecutó la automatización IA de seguimiento sobre el lead ${lead.name}.`,
      authUser,
      metadata: {
        automation,
        actions: actions.length,
        ...(auditMetadata || {}),
      },
    });

    return {
      automation,
      source: "local",
      summary: `IA actualizó el seguimiento del lead ${lead.company || lead.name}, dejó una nota comercial y ${actions.some((action) => action.type === "task" && action.status === "created") ? "creó una tarea operativa" : "no creó tarea por permisos o falta de proyecto"}.`,
      applied_actions: actions,
    };
  }

  if (automation === "client_report") {
    if (
      !bypassAccessChecks &&
      (!authUser ||
        !canAccessSection(authUser.role, "clients") ||
        !canAccessSection(authUser.role, "reports"))
    ) {
      throw new Error("Forbidden");
    }

    const client = getClientRecordById(entityId);

    if (
      !client ||
      isArchivedRecord(client) ||
      (!bypassAccessChecks && !isAgencyOwnedRecord(client, authUser?.agency_id ?? -1))
    ) {
      throw new Error("Client not found");
    }

    const metrics = getClientReportMetrics(client.id);
    const reportTitle = `Plan IA - ${client.company}`;
    const reportType = cleanedInput
      ? `AI Action Plan (${cleanedInput.slice(0, 32)})`
      : "AI Action Plan";
    const content = buildReportContent({
      clientName: client.company,
      type: reportType,
      generatedAt: new Date().toLocaleString("es-ES"),
      ...metrics,
    });
    const reportId = Number(
      db
        .prepare(
          `
            INSERT INTO reports (client_id, title, type, url, agency_id)
            VALUES (?, ?, ?, ?, ?)
          `,
        )
        .run(
          client.id,
          reportTitle,
          reportType,
          createReportUrl(reportTitle, content),
          client.agency_id,
        ).lastInsertRowid,
    );
    const actions: AIAutomationActionResult[] = [
      {
        type: "report",
        label: "Reporte creado",
        status: "created",
        details: `Se generó un reporte ejecutivo con foco operativo para ${client.company}.`,
        target_id: reportId,
      },
    ];

    createAuditLog({
      action: auditAction,
      entityType: "client",
      entityId: client.id,
      description:
        auditDescription ||
        `Se ejecutó la automatización IA de reporte sobre el cliente ${client.company}.`,
      authUser,
      metadata: {
        automation,
        report_id: reportId,
        ...(auditMetadata || {}),
      },
    });

    return {
      automation,
      source: "local",
      summary: `IA generó un reporte operativo para ${client.company} con una lectura ejecutiva del estado actual, campañas y tareas pendientes.`,
      applied_actions: actions,
    };
  }

  if (
    !bypassAccessChecks &&
    (!authUser || !canAccessSection(authUser.role, "projects") || !canAccessSection(authUser.role, "tasks"))
  ) {
    throw new Error("Forbidden");
  }

  const project = getProjectRecordByIdFull(entityId);

  if (
    !project ||
    isArchivedRecord(project) ||
    (!bypassAccessChecks && !isAgencyOwnedRecord(project, authUser?.agency_id ?? -1))
  ) {
    throw new Error("Project not found");
  }

  const taskTemplates = buildProjectAutomationTemplates(project, cleanedInput);
  const actions = taskTemplates.map((taskTemplate) => {
    const taskId = Number(
      db
        .prepare(
          `
            INSERT INTO tasks (
              project_id,
              title,
              description,
              status,
              priority,
              due_date,
              assigned_to,
              agency_id
            )
            VALUES (?, ?, ?, 'todo', ?, ?, ?, ?)
          `,
        )
        .run(
          project.id,
          taskTemplate.title,
          taskTemplate.description,
          taskTemplate.priority,
          taskTemplate.dueDate,
          authUser?.id ?? null,
          project.agency_id,
        ).lastInsertRowid,
    );

    return {
      type: "task",
      label: taskTemplate.title,
      status: "created" as const,
      details: `Tarea creada con prioridad ${taskTemplate.priority} y vencimiento ${taskTemplate.dueDate}.`,
      target_id: taskId,
    };
  });

  createAuditLog({
    action: auditAction,
    entityType: "project",
    entityId: project.id,
    description:
      auditDescription ||
      `Se ejecutó la automatización IA de tareas sobre el proyecto ${project.name}.`,
    authUser,
    metadata: {
      automation,
      tasks_created: actions.length,
      ...(auditMetadata || {}),
    },
  });

  return {
    automation,
    source: "local",
    summary: `IA desglosó el proyecto ${project.name} en ${actions.length} tareas operativas alineadas con su fase actual.`,
    applied_actions: actions,
  };
};

const runAIAutomationTrigger = ({
  agencyId,
  triggerKey,
  automation,
  entityId,
  input = "",
  entityType,
  authUser = null,
  description,
}: RunAIAutomationTriggerOptions) => {
  if (!getAppSettings(agencyId)[triggerKey]) {
    return null;
  }

  try {
    const result = executeAIAutomation({
      automation,
      entityId,
      input,
      authUser,
      bypassAccessChecks: true,
      auditAction: "ai.trigger_executed",
      auditDescription: description,
      auditMetadata: {
        trigger: triggerKey,
      },
    });

    createAIAutomationRun({
      automation,
      mode: "trigger",
      status: getAutomationRunStatus(result.applied_actions),
      entityType,
      entityId,
      triggerKey,
      source: result.source,
      summary: result.summary,
      actions: result.applied_actions,
      authUser,
      agencyId,
    });

    return result;
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown trigger error";
    createAIAutomationRun({
      automation,
      mode: "trigger",
      status: "error",
      entityType,
      entityId,
      triggerKey,
      errorMessage: message,
      authUser,
      agencyId,
    });
    createAuditLog({
      action: "ai.trigger_failed",
      entityType,
      entityId,
      description: `Falló la automatización IA automática ${automation} para ${entityType} #${entityId}.`,
      authUser,
      metadata: {
        trigger: triggerKey,
        automation,
        error: message,
      },
      agencyId,
    });
    console.error("AI trigger failed:", {
      triggerKey,
      automation,
      entityType,
      entityId,
      error,
    });
    return null;
  }
};

const toIsoDate = (value: Date) => {
  const year = value.getFullYear();
  const month = String(value.getMonth() + 1).padStart(2, "0");
  const day = String(value.getDate()).padStart(2, "0");

  return `${year}-${month}-${day}`;
};

const addDays = (baseDate: string | Date, days: number) => {
  const nextDate = new Date(baseDate);
  nextDate.setHours(0, 0, 0, 0);
  nextDate.setDate(nextDate.getDate() + days);
  return toIsoDate(nextDate);
};

const parseDateTimeInput = (value: string | null | undefined, defaultHour = 9) => {
  if (!value || typeof value !== "string") {
    return null;
  }

  if (/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    const [year, month, day] = value.split("-").map(Number);
    return new Date(year, month - 1, day, defaultHour, 0, 0, 0);
  }

  const parsedValue = new Date(value);
  return Number.isNaN(parsedValue.getTime()) ? null : parsedValue;
};

const addMinutes = (value: Date, minutes: number) => {
  const nextDate = new Date(value);
  nextDate.setMinutes(nextDate.getMinutes() + minutes);
  return nextDate;
};

const parseStoredUtcDate = (value: string | null | undefined) => {
  if (!value || typeof value !== "string") {
    return null;
  }

  const normalizedValue = value.includes("T") ? value : value.replace(" ", "T");
  const utcValue = /(?:Z|[+-]\d{2}:\d{2})$/.test(normalizedValue)
    ? normalizedValue
    : `${normalizedValue}Z`;
  const parsedValue = new Date(utcValue);

  return Number.isNaN(parsedValue.getTime()) ? null : parsedValue;
};

const getTodayDateStart = () => {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  return today;
};

const getDaysDifferenceFromToday = (value: string | null | undefined) => {
  const parsedValue = parseDateTimeInput(value, 9);

  if (!parsedValue) {
    return null;
  }

  const diffMs = parsedValue.getTime() - getTodayDateStart().getTime();
  return Math.floor(diffMs / 86_400_000);
};

const createOnboardingProjectName = (company: string) => `Onboarding - ${company}`;
const createInviteToken = () => randomBytes(24).toString("hex");

type ClientOperationalSetupResult = {
  project_id: number | null;
  onboarding_id: number | null;
  created_project: boolean;
  created_onboarding: boolean;
  created_onboarding_tasks: number;
  created_operational_tasks: number;
  owner_user_id: number | null;
};

const resolveClientOperationalOwnerUserId = (
  agencyId: number,
  preferredUserId?: number | null,
  fallbackUserId?: number | null,
) => {
  const resolveAgencyUserId = (userId?: number | null) => {
    if (!Number.isInteger(Number(userId)) || Number(userId) <= 0) {
      return null;
    }

    const user = getUserRecordByIdFull(Number(userId));
    return user && user.agency_id === agencyId ? user.id : null;
  };

  const preferredAgencyUserId = resolveAgencyUserId(preferredUserId);

  if (preferredAgencyUserId) {
    return preferredAgencyUserId;
  }

  const fallbackAgencyUserId = resolveAgencyUserId(fallbackUserId);

  if (fallbackAgencyUserId) {
    return fallbackAgencyUserId;
  }

  return (
    getLeadAssignmentCandidatesForAgency(agencyId)[0]?.user.id ||
    getDefaultUserForAgency(agencyId)?.id ||
    null
  );
};

const mapOnboardingStepToTaskStatus = (status: ClientOnboardingStepStatus) => {
  switch (status) {
    case "in_progress":
      return "in_progress";
    case "completed":
      return "done";
    case "pending":
    default:
      return "todo";
  }
};

const hashPassword = (password: string) => {
  const salt = randomBytes(16).toString("hex");
  const hash = scryptSync(password, salt, 64).toString("hex");
  return `${PASSWORD_SCHEME}:${salt}:${hash}`;
};

const verifyPassword = (password: string, storedPassword: string) => {
  if (!storedPassword.includes(":")) {
    return password === storedPassword;
  }

  const [scheme, salt, storedHash] = storedPassword.split(":");

  if (scheme !== PASSWORD_SCHEME || !salt || !storedHash) {
    return false;
  }

  const expected = Buffer.from(storedHash, "hex");
  const actual = scryptSync(password, salt, expected.length);

  return expected.length === actual.length && timingSafeEqual(expected, actual);
};

const isUserTwoFactorEnabled = (user: {
  two_factor_enabled?: number | boolean | null;
  two_factor_secret?: string | null;
}) => Boolean(user.two_factor_enabled) && Boolean(user.two_factor_secret);

const normalizeTwoFactorCode = (value?: string | null) =>
  typeof value === "string" ? value.replace(/[\s-]+/g, "").toUpperCase() : "";

const formatTwoFactorBackupCode = (value: string) => `${value.slice(0, 4)}-${value.slice(4, 8)}`;

const createTwoFactorBackupCodes = () => {
  const plainCodes = Array.from({ length: TWO_FACTOR_BACKUP_CODE_COUNT }, () =>
    formatTwoFactorBackupCode(randomBytes(4).toString("hex").toUpperCase()),
  );

  return {
    plainCodes,
    hashedCodes: plainCodes.map((code) => hashPassword(normalizeTwoFactorCode(code))),
  };
};

const parseStoredStringArray = (value?: string | null) => {
  if (!value) {
    return [];
  }

  try {
    const parsed = JSON.parse(value) as unknown;
    return Array.isArray(parsed) ? parsed.filter((item): item is string => typeof item === "string") : [];
  } catch {
    return [];
  }
};

const serializeStoredStringArray = (values: string[]) => JSON.stringify(values);

const getTwoFactorIssuer = (agencyName?: string | null) =>
  agencyName?.trim() || process.env.TWO_FACTOR_ISSUER?.trim() || "ZaaRyx Global CRM";

const getTwoFactorSetupPayload = async ({
  email,
  agencyName,
}: {
  email: string;
  agencyName?: string | null;
}) => {
  const secret = generateSecret();
  const issuer = getTwoFactorIssuer(agencyName);
  const otpauthUrl = generateURI({
    issuer,
    label: email,
    secret,
  });
  const qrDataUrl = await QRCode.toDataURL(otpauthUrl, {
    margin: 1,
    width: 220,
  });

  return {
    secret,
    issuer,
    otpauthUrl,
    qrDataUrl,
  };
};

const verifyTwoFactorTotp = (secret: string | null | undefined, code: string) => {
  const normalizedCode = normalizeTwoFactorCode(code);

  if (!secret || !/^\d{6}$/.test(normalizedCode)) {
    return false;
  }

  try {
    return verifySync({
      secret,
      token: normalizedCode,
      epochTolerance: 30,
    }).valid;
  } catch {
    return false;
  }
};

const countRemainingBackupCodes = (value?: string | null) => parseStoredStringArray(value).length;

const consumeTwoFactorBackupCode = ({
  userId,
  storedCodes,
  code,
}: {
  userId: number;
  storedCodes?: string | null;
  code: string;
}) => {
  const normalizedCode = normalizeTwoFactorCode(code);

  if (!normalizedCode) {
    return null;
  }

  const hashes = parseStoredStringArray(storedCodes);
  const matchedIndex = hashes.findIndex((hash) => verifyPassword(normalizedCode, hash));

  if (matchedIndex === -1) {
    return null;
  }

  const nextHashes = hashes.filter((_, index) => index !== matchedIndex);

  db.prepare("UPDATE users SET two_factor_backup_codes = ? WHERE id = ?").run(
    serializeStoredStringArray(nextHashes),
    userId,
  );

  return nextHashes.length;
};

const parseCookies = (cookieHeader?: string) =>
  (cookieHeader || "")
    .split(";")
    .map((part) => part.trim())
    .filter(Boolean)
    .reduce<Record<string, string>>((accumulator, cookie) => {
      const separatorIndex = cookie.indexOf("=");

      if (separatorIndex === -1) {
        return accumulator;
      }

      const key = cookie.slice(0, separatorIndex).trim();
      const value = cookie.slice(separatorIndex + 1).trim();

      accumulator[key] = decodeURIComponent(value);
      return accumulator;
    }, {});

const parseBooleanQueryFlag = (value: unknown) =>
  typeof value === "string" && ["1", "true", "yes", "on"].includes(value.trim().toLowerCase());

const getArchiveScopeFromQuery = (query: Record<string, unknown>): ArchiveScope => {
  if (parseBooleanQueryFlag(query.archived_only)) {
    return "archived";
  }

  if (parseBooleanQueryFlag(query.include_archived)) {
    return "all";
  }

  return "active";
};

const getArchiveSqlCondition = (scope: ArchiveScope, qualifiedColumn = "archived_at") => {
  if (scope === "archived") {
    return `${qualifiedColumn} IS NOT NULL`;
  }

  if (scope === "all") {
    return "1 = 1";
  }

  return `${qualifiedColumn} IS NULL`;
};

const getSessionDurationMs = (agencyId: number) => {
  const timeout = getAppSettings(agencyId).session_timeout;

  switch (timeout) {
    case "30m":
      return 30 * 60 * 1000;
    case "2h":
      return 2 * 60 * 60 * 1000;
    case "8h":
      return 8 * 60 * 60 * 1000;
    default:
      return 2 * 60 * 60 * 1000;
  }
};

const shouldUseSecureCookies = (req?: express.Request) =>
  SECURE_COOKIES_ENABLED || req?.secure === true;

const createSessionCookie = (token: string, maxAgeMs: number, req?: express.Request) =>
  `${SESSION_COOKIE_NAME}=${encodeURIComponent(token)}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${Math.floor(
    maxAgeMs / 1000,
  )}; Priority=High${shouldUseSecureCookies(req) ? "; Secure" : ""}`;

const clearSessionCookie = (req?: express.Request) =>
  `${SESSION_COOKIE_NAME}=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0; Priority=High${
    shouldUseSecureCookies(req) ? "; Secure" : ""
  }`;

const getSessionTokenFromCookieHeader = (cookieHeader?: string) =>
  parseCookies(cookieHeader)[SESSION_COOKIE_NAME];

const getAccessibleSectionsForAuthUser = (user: {
  role: string;
  agency_id: number | null;
  client_id?: number | null;
  freelancer_id?: number | null;
}) => {
  const sections = new Set<AppSection>(getAccessibleSections(user.role));

  if (!user.agency_id) {
    return Array.from(sections);
  }

  const roleKey = getRoleKey(user.role);

  if (roleKey === "freelancer") {
    if (!Number.isInteger(Number(user.freelancer_id))) {
      return ["dashboard"] as AppSection[];
    }
  }

  return Array.from(sections);
};

const toAuthUser = (user: {
  id: number;
  email: string;
  name: string;
  role: string;
  status: "online" | "meeting" | "offline";
  agency_id: number | null;
  client_id?: number | null;
  freelancer_id?: number | null;
  two_factor_enabled?: number | boolean | null;
}): AuthUser => ({
  ...user,
  two_factor_enabled: Boolean(user.two_factor_enabled),
  accessible_sections: getAccessibleSectionsForAuthUser(user),
});

const getScopedClientIdForAuthUser = (authUser?: AuthUser | null) =>
  authUser && getRoleKey(authUser.role) === "client" && Number.isInteger(Number(authUser.client_id))
    ? Number(authUser.client_id)
    : null;

const getScopedFreelancerIdForAuthUser = (authUser?: AuthUser | null) =>
  authUser &&
  getRoleKey(authUser.role) === "freelancer" &&
  Number.isInteger(Number(authUser.freelancer_id))
    ? Number(authUser.freelancer_id)
    : null;

const isExternalPortalUser = (authUser?: AuthUser | null) => {
  const roleKey = authUser ? getRoleKey(authUser.role) : null;
  return roleKey === "client" || roleKey === "freelancer";
};

const clearExpiredSessions = () => {
  db.prepare("DELETE FROM sessions WHERE datetime(expires_at) <= datetime('now')").run();
};

const normalizeAppUrl = (value?: string | null) => {
  if (!value || typeof value !== "string") {
    return null;
  }

  const trimmed = value.trim();

  if (!trimmed) {
    return null;
  }

  return trimmed.replace(/\/+$/, "");
};

const isLocalLikeHostname = (hostname: string) =>
  hostname === "localhost" ||
  hostname === "127.0.0.1" ||
  hostname === "0.0.0.0" ||
  hostname === "::1" ||
  hostname === "[::1]" ||
  hostname.endsWith(".local") ||
  isPrivateIpv4Host(hostname);

const isTrustedLocalAppUrl = (appUrl?: string | null) => {
  if (!appUrl) {
    return false;
  }

  try {
    const parsedUrl = new URL(appUrl);
    return parsedUrl.protocol === "http:" && isLocalLikeHostname(parsedUrl.hostname);
  } catch {
    return false;
  }
};

const getPublicAppUrl = (req?: express.Request) => {
  const envUrl = normalizeAppUrl(process.env.APP_URL);

  if (envUrl) {
    return envUrl;
  }

  const host = req?.get("host");

  if (!host) {
    return null;
  }

  return `${req?.protocol || "http"}://${host}`;
};

const decodeDataUrlAttachment = (dataUrl: string, fallbackFilename: string) => {
  const match = dataUrl.match(/^data:([^;,]+)?(?:;charset=[^;,]+)?(;base64)?,(.*)$/);

  if (!match) {
    return null;
  }

  const mimeType = match[1] || "text/plain";
  const isBase64 = Boolean(match[2]);
  const payload = match[3] || "";
  const content = isBase64
    ? Buffer.from(payload, "base64")
    : Buffer.from(decodeURIComponent(payload), "utf-8");
  const extension =
    mimeType === "application/json"
      ? "json"
      : mimeType === "text/html"
        ? "html"
        : mimeType.startsWith("image/")
          ? mimeType.split("/")[1] || "bin"
          : "txt";
  const filename = fallbackFilename.includes(".")
    ? fallbackFilename
    : `${fallbackFilename}.${extension}`;

  return {
    filename,
    content,
    contentType: mimeType,
  };
};

type ContractDeliveryResult = {
  delivered: boolean;
  skipped: boolean;
  channel: "smtp" | "manual";
  reason: string | null;
};

type AccountInviteDeliveryResult = {
  delivered: boolean;
  skipped: boolean;
  channel: "smtp" | "manual";
  reason: string | null;
};

let smtpTransporter: Transporter | null | undefined;

const getSmtpTransporter = () => {
  if (smtpTransporter !== undefined) {
    return smtpTransporter;
  }

  const host = process.env.SMTP_HOST?.trim();
  const port = Number(process.env.SMTP_PORT || 587);

  if (!host || !Number.isFinite(port)) {
    smtpTransporter = null;
    return smtpTransporter;
  }

  const secure = parseBooleanEnvFlag(process.env.SMTP_SECURE) || port === 465;
  const user = process.env.SMTP_USER?.trim();
  const pass = process.env.SMTP_PASS?.trim();

  smtpTransporter = createTransport({
    host,
    port,
    secure,
    auth: user && pass ? { user, pass } : undefined,
  });

  return smtpTransporter;
};

const getMailFromAddress = () =>
  process.env.MAIL_FROM?.trim() ||
  process.env.SMTP_FROM?.trim() ||
  process.env.SMTP_USER?.trim() ||
  "no-reply@zaaryx.local";

const buildPasswordResetUrl = (token: string, req?: express.Request) => {
  const publicAppUrl = getPublicAppUrl(req);

  if (!publicAppUrl) {
    return null;
  }

  return `${publicAppUrl}/?reset=${encodeURIComponent(token)}`;
};

const buildActivationUrl = (token: string, req?: express.Request) => {
  const publicAppUrl = getPublicAppUrl(req);

  if (!publicAppUrl) {
    return null;
  }

  return `${publicAppUrl}/?invite=${encodeURIComponent(token)}`;
};

const sendPasswordResetEmail = async ({
  to,
  name,
  agencyName,
  resetUrl,
}: {
  to: string;
  name: string;
  agencyName: string;
  resetUrl: string;
}) => {
  const transporter = getSmtpTransporter();

  if (!transporter) {
    return {
      delivered: false,
      skipped: true,
      reason: "smtp_not_configured",
    } as const;
  }

  await transporter.sendMail({
    from: getMailFromAddress(),
    to,
    subject: `Recuperación de acceso · ${agencyName}`,
    text: [
      `Hola ${name},`,
      "",
      "Hemos recibido una solicitud para restablecer tu contraseña.",
      `Usa este enlace para recuperar el acceso: ${resetUrl}`,
      "",
      "Este enlace caduca en 30 minutos.",
      "Si no solicitaste este cambio, puedes ignorar este mensaje.",
    ].join("\n"),
    html: `
      <div style="font-family: Arial, sans-serif; max-width: 560px; margin: 0 auto; color: #111827;">
        <h2 style="margin-bottom: 16px;">Recuperación de acceso</h2>
        <p>Hola ${name},</p>
        <p>Hemos recibido una solicitud para restablecer tu contraseña en <strong>${agencyName}</strong>.</p>
        <p style="margin: 24px 0;">
          <a href="${resetUrl}" style="display: inline-block; background: #0066ff; color: #ffffff; text-decoration: none; padding: 12px 18px; border-radius: 10px; font-weight: 600;">
            Restablecer contraseña
          </a>
        </p>
        <p>Este enlace caduca en 30 minutos.</p>
        <p>Si no solicitaste este cambio, puedes ignorar este mensaje.</p>
      </div>
    `,
  });

  return {
    delivered: true,
    skipped: false,
    reason: null,
  } as const;
};

const sendActivationEmail = async ({
  to,
  name,
  agencyName,
  inviteUrl,
  roleLabel,
}: {
  to: string;
  name: string;
  agencyName: string;
  inviteUrl: string;
  roleLabel: string;
}) => {
  const transporter = getSmtpTransporter();

  if (!transporter) {
    return {
      delivered: false,
      skipped: true,
      channel: "manual",
      reason: "smtp_not_configured",
    } satisfies AccountInviteDeliveryResult;
  }

  const roleLine =
    roleLabel.trim().length > 0
      ? `Se te ha preparado acceso como ${roleLabel.toLowerCase()} en ${agencyName}.`
      : `Se te ha preparado acceso a ${agencyName}.`;

  await transporter.sendMail({
    from: getMailFromAddress(),
    to,
    subject: `Activa tu acceso · ${agencyName}`,
    text: [
      `Hola ${name},`,
      "",
      roleLine,
      `Activa tu cuenta desde este enlace: ${inviteUrl}`,
      "",
      "En el primer acceso podras definir tu contrasena.",
      "Si no esperabas esta invitacion, puedes ignorar este mensaje.",
    ].join("\n"),
    html: `
      <div style="font-family: Arial, sans-serif; max-width: 560px; margin: 0 auto; color: #111827;">
        <h2 style="margin-bottom: 16px;">Activa tu acceso</h2>
        <p>Hola ${name},</p>
        <p>${roleLine}</p>
        <p style="margin: 24px 0;">
          <a href="${inviteUrl}" style="display: inline-block; background: #0066ff; color: #ffffff; text-decoration: none; padding: 12px 18px; border-radius: 10px; font-weight: 600;">
            Activar cuenta
          </a>
        </p>
        <p>En el primer acceso podras definir tu contrasena.</p>
        <p>Si no esperabas esta invitacion, puedes ignorar este mensaje.</p>
      </div>
    `,
  });

  return {
    delivered: true,
    skipped: false,
    channel: "smtp",
    reason: null,
  } satisfies AccountInviteDeliveryResult;
};

const sendLoginAlertEmail = async ({
  to,
  name,
  agencyName,
  requestIp,
  userAgent,
  loggedAt,
  usedTwoFactor,
}: {
  to: string;
  name: string;
  agencyName: string;
  requestIp: string;
  userAgent: string;
  loggedAt: string;
  usedTwoFactor: boolean;
}) => {
  const transporter = getSmtpTransporter();

  if (!transporter) {
    return {
      delivered: false,
      skipped: true,
      reason: "smtp_not_configured",
    } as const;
  }

  const formattedDate = new Date(loggedAt).toLocaleString("es-ES", {
    dateStyle: "medium",
    timeStyle: "short",
  });

  await transporter.sendMail({
    from: getMailFromAddress(),
    to,
    subject: `Nuevo acceso detectado · ${agencyName}`,
    text: [
      `Hola ${name},`,
      "",
      `Se detectó un nuevo inicio de sesión en ${agencyName}.`,
      `Fecha: ${formattedDate}`,
      `IP: ${requestIp}`,
      `Segundo factor: ${usedTwoFactor ? "Sí" : "No"}`,
      `Dispositivo: ${userAgent}`,
      "",
      "Si no reconoces este acceso, cambia tu contraseña y revisa tus sesiones activas.",
    ].join("\n"),
    html: `
      <div style="font-family: Arial, sans-serif; max-width: 560px; margin: 0 auto; color: #111827;">
        <h2 style="margin-bottom: 16px;">Nuevo acceso detectado</h2>
        <p>Hola ${name},</p>
        <p>Se detectó un nuevo inicio de sesión en <strong>${agencyName}</strong>.</p>
        <ul style="padding-left: 18px; line-height: 1.6;">
          <li><strong>Fecha:</strong> ${formattedDate}</li>
          <li><strong>IP:</strong> ${requestIp}</li>
          <li><strong>Segundo factor:</strong> ${usedTwoFactor ? "Sí" : "No"}</li>
          <li><strong>Dispositivo:</strong> ${userAgent}</li>
        </ul>
        <p>Si no reconoces este acceso, cambia tu contraseña y revisa tus sesiones activas cuanto antes.</p>
      </div>
    `,
  });

  return {
    delivered: true,
    skipped: false,
    reason: null,
  } as const;
};

const sendContractEmail = async ({
  contract,
  agencyName,
  note,
  appUrl,
}: {
  contract: ContractRow;
  agencyName: string;
  note?: string | null;
  appUrl?: string | null;
}) => {
  const transporter = getSmtpTransporter();

  if (!transporter) {
    return {
      delivered: false,
      skipped: true,
      channel: "manual",
      reason: "smtp_not_configured",
    } satisfies ContractDeliveryResult;
  }

  const counterpartyName = contract.counterparty_name?.trim() || "equipo";
  const scopeSummary =
    contract.scope_summary?.trim() ||
    "Colaboracion operativa y alcance definidos en el contrato adjunto.";
  const totalAmount = new Intl.NumberFormat("es-ES", {
    style: "currency",
    currency: contract.currency || "EUR",
    maximumFractionDigits: 2,
  }).format(Number(contract.total_amount || 0));
  const portalLine =
    appUrl && contract.contract_type === "client"
      ? `Si ya tienes acceso al portal, puedes revisar el estado general en ${appUrl}.`
      : appUrl
        ? `Puedes revisar el estado general del acuerdo en ${appUrl}.`
        : null;
  const attachment =
    typeof contract.document_url === "string" && contract.document_url.startsWith("data:")
      ? decodeDataUrlAttachment(contract.document_url, `${contract.contract_number}.txt`)
      : null;
  const documentReference =
    typeof contract.document_url === "string" && /^https?:\/\//i.test(contract.document_url)
      ? contract.document_url
      : null;
  const noteLine = note?.trim() ? `Nota adicional de la agencia: ${note.trim()}` : null;
  const subject =
    contract.contract_type === "freelance"
      ? `Acuerdo de colaboracion · ${contract.contract_number}`
      : `Contrato de servicio · ${contract.contract_number}`;
  const text = [
    `Hola ${counterpartyName},`,
    "",
    `Te compartimos el documento ${contract.contract_number} desde ${agencyName}.`,
    `Importe total: ${totalAmount}`,
    `Inicio previsto: ${contract.start_date || "Pendiente"}`,
    `Alcance: ${scopeSummary}`,
    noteLine,
    portalLine,
    documentReference ? `Documento online: ${documentReference}` : null,
    "",
    attachment
      ? "Adjuntamos una copia operativa del contrato en este correo."
      : "Encontraras el detalle del contrato en el documento generado.",
    "Si necesitas ajustes o aclaraciones, responde a este correo y lo revisamos contigo.",
  ]
    .filter(Boolean)
    .join("\n");
  const html = `
    <div style="font-family: Arial, sans-serif; max-width: 640px; margin: 0 auto; color: #111827;">
      <div style="padding: 24px 0 12px;">
        <p style="letter-spacing: 0.24em; font-size: 11px; font-weight: 700; color: #6b7280; text-transform: uppercase; margin: 0;">
          ${agencyName}
        </p>
        <h2 style="margin: 12px 0 0; font-size: 28px; line-height: 1.2;">${subject}</h2>
      </div>
      <p>Hola ${counterpartyName},</p>
      <p>Te compartimos el documento <strong>${contract.contract_number}</strong> para su revision.</p>
      <div style="border: 1px solid rgba(17,24,39,0.08); border-radius: 18px; padding: 18px; background: #f8fafc; margin: 24px 0;">
        <p style="margin: 0 0 8px;"><strong>Importe total:</strong> ${totalAmount}</p>
        <p style="margin: 0 0 8px;"><strong>Inicio previsto:</strong> ${contract.start_date || "Pendiente"}</p>
        <p style="margin: 0;"><strong>Alcance:</strong> ${scopeSummary}</p>
      </div>
      ${
        noteLine
          ? `<p style="padding: 14px 16px; border-radius: 14px; background: #eff6ff; color: #1d4ed8;"><strong>Nota de la agencia:</strong> ${note.trim()}</p>`
          : ""
      }
      ${portalLine ? `<p>${portalLine}</p>` : ""}
      ${
        documentReference
          ? `<p><a href="${documentReference}" style="color: #0066ff; text-decoration: none; font-weight: 600;">Abrir documento online</a></p>`
          : ""
      }
      <p>Si necesitas ajustes o aclaraciones, responde a este correo y lo revisamos contigo.</p>
    </div>
  `;

  try {
    await transporter.sendMail({
      from: getMailFromAddress(),
      to: contract.counterparty_email,
      subject,
      text,
      html,
      attachments: attachment ? [attachment] : undefined,
    });

    return {
      delivered: true,
      skipped: false,
      channel: "smtp",
      reason: null,
    } satisfies ContractDeliveryResult;
  } catch (error) {
    console.warn("Contract email could not be delivered", {
      contract_number: contract.contract_number,
      email: contract.counterparty_email,
      error: error instanceof Error ? error.message : error,
    });

    return {
      delivered: false,
      skipped: false,
      channel: "manual",
      reason: "smtp_delivery_failed",
    } satisfies ContractDeliveryResult;
  }
};

const triggerLoginAlertIfEnabled = ({
  user,
  agencyId,
  requestIp,
  userAgent,
  loggedAt,
  usedTwoFactor,
}: {
  user: {
    id: number;
    email: string;
    name: string;
    agency_id: number | null;
  };
  agencyId: number;
  requestIp: string;
  userAgent: string;
  loggedAt: string;
  usedTwoFactor: boolean;
}) => {
  const appSettings = getAppSettings(agencyId);

  if (!appSettings.login_alerts) {
    return;
  }

  void sendLoginAlertEmail({
    to: user.email,
    name: user.name,
    agencyName: appSettings.agency_name,
    requestIp,
    userAgent,
    loggedAt,
    usedTwoFactor,
  })
    .then((result) => {
      if (result.delivered) {
        return;
      }

      console.warn("Login alert email could not be delivered", {
        email: user.email,
        reason: result.reason,
      });

      createAuditLog({
        action: "auth.login_alert_failed",
        entityType: "user",
        entityId: user.id,
        description: `No se pudo enviar la alerta de login para ${user.email}.`,
        userId: user.id,
        actorName: user.name,
        actorEmail: user.email,
        agencyId,
        metadata: {
          request_ip: requestIp,
          used_two_factor: usedTwoFactor,
          reason: result.reason,
        },
      });
    })
    .catch((error) => {
      console.warn("Login alert email could not be delivered", {
        email: user.email,
        error: error instanceof Error ? error.message : error,
      });

      createAuditLog({
        action: "auth.login_alert_failed",
        entityType: "user",
        entityId: user.id,
        description: `No se pudo enviar la alerta de login para ${user.email}.`,
        userId: user.id,
        actorName: user.name,
        actorEmail: user.email,
        agencyId,
        metadata: {
          request_ip: requestIp,
          used_two_factor: usedTwoFactor,
        },
      });
    });
};

const getProductionReadiness = (req: express.Request, agencyId: number): ProductionReadinessItem[] => {
  const smtpConfigured = Boolean(getSmtpTransporter());
  const appUrl = normalizeAppUrl(process.env.APP_URL);
  const appSettings = getAppSettings(agencyId);
  const usesSecureCookies = shouldUseSecureCookies(req);
  const appUrlIsHttps = Boolean(appUrl?.startsWith("https://"));
  const appUrlUsesTrustedLocalHttp = isTrustedLocalAppUrl(appUrl);

  const items: ProductionReadinessItem[] = [
    {
      key: "app_url",
      status: appUrl ? "ready" : "critical",
      label: "APP_URL",
      detail: appUrl
        ? `Configurada como ${appUrl}.`
        : "Falta APP_URL para enlaces de recuperación y callbacks externos.",
    },
    {
      key: "app_url_https",
      status:
        !IS_PRODUCTION || !appUrl || appUrlIsHttps
          ? "ready"
          : appUrlUsesTrustedLocalHttp
            ? "warning"
            : "critical",
      label: "APP_URL segura",
      detail:
        !IS_PRODUCTION || !appUrl
          ? "La validación HTTPS fuerte se aplica al desplegar en producción real."
          : appUrlIsHttps
            ? "APP_URL usa HTTPS."
            : appUrlUsesTrustedLocalHttp
              ? "APP_URL usa HTTP sólo en localhost o red privada. Sirve para pruebas, no para despliegue público."
              : "APP_URL debe usar HTTPS en producción.",
    },
    {
      key: "smtp",
      status: smtpConfigured ? "ready" : "critical",
      label: "SMTP transaccional",
      detail: smtpConfigured
        ? "SMTP configurado para recuperación y alertas de acceso."
        : "Falta SMTP. La recuperación y las alertas reales no saldrán por email.",
    },
    {
      key: "mail_from",
      status: getMailFromAddress().includes("@") ? "ready" : "warning",
      label: "Remitente de correo",
      detail: `MAIL_FROM actual: ${getMailFromAddress()}.`,
    },
    {
      key: "trust_proxy",
      status: TRUST_PROXY_ENABLED ? "ready" : IS_PRODUCTION ? "warning" : "ready",
      label: "TRUST_PROXY",
      detail: TRUST_PROXY_ENABLED
        ? "El servidor confía en un proxy frontal para IP y esquema HTTPS."
        : "Desactivado. Actívalo sólo si hay reverse proxy o balanceador delante.",
    },
    {
      key: "secure_cookies",
      status: usesSecureCookies ? "ready" : IS_PRODUCTION ? "warning" : "ready",
      label: "Cookie segura",
      detail: usesSecureCookies
        ? "La cookie de sesión saldrá con Secure en esta request."
        : "En esta request la cookie no sale Secure. En despliegue real debe entrar por HTTPS o activar SECURE_COOKIES.",
    },
    {
      key: "login_alerts",
      status: !appSettings.login_alerts || smtpConfigured ? "ready" : "warning",
      label: "Alertas de login",
      detail: appSettings.login_alerts
        ? smtpConfigured
          ? "Las alertas de acceso están activas y con canal SMTP disponible."
          : "Las alertas de acceso están activas, pero falta SMTP para entregarlas."
        : "Las alertas de acceso están desactivadas en ajustes.",
    },
    {
      key: "two_factor_policy",
      status: appSettings.two_factor ? "ready" : "warning",
      label: "Política 2FA",
      detail: appSettings.two_factor
        ? "La agencia marca 2FA como activo en ajustes."
        : "2FA está disponible, pero no está señalado como política activa en ajustes.",
    },
    {
      key: "gemini",
      status: process.env.GEMINI_API_KEY?.trim() ? "ready" : "warning",
      label: "Gemini API",
      detail: process.env.GEMINI_API_KEY?.trim()
        ? "GEMINI_API_KEY presente."
        : "No hay GEMINI_API_KEY; la IA seguirá con fallback local.",
    },
  ];

  return items;
};

const getOverallReadinessStatus = (items: Array<{ status: "ready" | "warning" | "critical" }>) =>
  items.some((item) => item.status === "critical")
    ? "critical"
    : items.some((item) => item.status === "warning")
      ? "warning"
      : "ready";

const getReleaseIdentifier = () =>
  process.env.RELEASE_VERSION?.trim() ||
  process.env.RENDER_GIT_COMMIT?.trim() ||
  process.env.VERCEL_GIT_COMMIT_SHA?.trim() ||
  process.env.RAILWAY_GIT_COMMIT_SHA?.trim() ||
  null;

const getRuntimeReadiness = (): RuntimeReadinessReport => {
  let databaseReachable = false;
  let schemaReady = false;

  try {
    db.prepare("SELECT 1 AS ok").get();
    databaseReachable = true;
    schemaReady = Boolean(
      db
        .prepare(
          "SELECT 1 AS ok FROM sqlite_master WHERE type = 'table' AND name = 'agencies' LIMIT 1",
        )
        .get(),
    );
  } catch {
    databaseReachable = false;
    schemaReady = false;
  }

  const distIndexPath = path.join(__dirname, "dist", "index.html");
  const buildAssetsPresent = fs.existsSync(distIndexPath);
  const appUrl = normalizeAppUrl(process.env.APP_URL);
  const smtpConfigured = Boolean(getSmtpTransporter());
  const mailFrom = getMailFromAddress();
  const geminiConfigured = Boolean(process.env.GEMINI_API_KEY?.trim());
  const databasePathIsAbsolute = path.isAbsolute(DATABASE_PATH);
  const appUrlUsesTrustedLocalHttp = isTrustedLocalAppUrl(appUrl);

  const items: ProductionReadinessItem[] = [
    {
      key: "database",
      status: databaseReachable ? "ready" : "critical",
      label: "Base de datos",
      detail: databaseReachable
        ? "La conexión SQLite responde correctamente."
        : "La base de datos no responde o no se pudo consultar.",
    },
    {
      key: "schema",
      status: schemaReady ? "ready" : "critical",
      label: "Esquema principal",
      detail: schemaReady
        ? "El esquema principal está disponible."
        : "Faltan tablas base o el esquema no está listo.",
    },
    {
      key: "database_path",
      status: !IS_PRODUCTION || databasePathIsAbsolute ? "ready" : "warning",
      label: "Ruta de datos",
      detail: databasePathIsAbsolute
        ? `La base de datos usa una ruta absoluta: ${DATABASE_PATH}.`
        : `DATABASE_PATH actual: ${DATABASE_PATH}. Para producción se recomienda una ruta absoluta sobre almacenamiento persistente.`,
    },
    {
      key: "build_assets",
      status: !IS_PRODUCTION || buildAssetsPresent ? "ready" : "critical",
      label: "Assets compilados",
      detail:
        !IS_PRODUCTION || buildAssetsPresent
          ? "Los assets frontend están disponibles para servir la app."
          : "Falta la carpeta dist compilada para producción.",
    },
    {
      key: "app_url",
      status: appUrl ? "ready" : IS_PRODUCTION ? "critical" : "warning",
      label: "APP_URL",
      detail: appUrl
        ? "APP_URL está configurada."
        : "Falta APP_URL para enlaces externos y flujos de recuperación.",
    },
    {
      key: "app_url_https",
      status:
        !IS_PRODUCTION || !appUrl || appUrl.startsWith("https://")
          ? "ready"
          : appUrlUsesTrustedLocalHttp
            ? "warning"
            : "critical",
      label: "APP_URL segura",
      detail:
        !IS_PRODUCTION || !appUrl
          ? "La validación HTTPS fuerte aplica al desplegar en producción."
          : appUrl.startsWith("https://")
            ? "APP_URL usa HTTPS."
            : appUrlUsesTrustedLocalHttp
              ? "APP_URL usa HTTP sólo en localhost o red privada. Sirve para pruebas, no para despliegue público."
              : "APP_URL debe usar HTTPS en producción.",
    },
    {
      key: "smtp",
      status: smtpConfigured ? "ready" : IS_PRODUCTION ? "critical" : "warning",
      label: "SMTP",
      detail: smtpConfigured
        ? "SMTP está disponible para correos transaccionales."
        : "SMTP no está configurado.",
    },
    {
      key: "mail_from",
      status: mailFrom.includes("@") ? "ready" : "warning",
      label: "MAIL_FROM",
      detail: mailFrom.includes("@")
        ? "El remitente de correo parece válido."
        : "MAIL_FROM no parece una dirección de correo válida.",
    },
    {
      key: "secure_cookie_strategy",
      status:
        !IS_PRODUCTION || TRUST_PROXY_ENABLED || SECURE_COOKIES_ENABLED ? "ready" : "warning",
      label: "Estrategia de cookie segura",
      detail:
        !IS_PRODUCTION || TRUST_PROXY_ENABLED || SECURE_COOKIES_ENABLED
          ? "La estrategia para cookies seguras está definida."
          : "Ni TRUST_PROXY ni SECURE_COOKIES están activos. Verifica cómo llegará HTTPS en producción.",
    },
    {
      key: "ai_provider",
      status: geminiConfigured ? "ready" : "warning",
      label: "Proveedor IA",
      detail: geminiConfigured
        ? "GEMINI_API_KEY está configurada."
        : "No hay GEMINI_API_KEY. ZaaRyx AI seguirá con fallback local.",
    },
  ];

  return {
    overall_status: getOverallReadinessStatus(items),
    items,
    checked_at: new Date().toISOString(),
    environment: IS_PRODUCTION ? "production" : "development",
    release: getReleaseIdentifier(),
    uptime_seconds: Math.round(process.uptime()),
  };
};

const isPrivateIpv4Host = (hostname: string) => {
  const segments = hostname.split(".").map((segment) => Number(segment));

  if (segments.length !== 4 || segments.some((segment) => Number.isNaN(segment))) {
    return false;
  }

  const [first, second] = segments;

  if (first === 10) {
    return true;
  }

  if (first === 172 && second >= 16 && second <= 31) {
    return true;
  }

  return first === 192 && second === 168;
};

const isAllowedLocalOrigin = (origin: string) => {
  try {
    const parsedOrigin = new URL(origin);

    if (!["http:", "https:"].includes(parsedOrigin.protocol)) {
      return false;
    }

    return (
      parsedOrigin.hostname === "localhost" ||
      parsedOrigin.hostname === "127.0.0.1" ||
      parsedOrigin.hostname === "0.0.0.0" ||
      parsedOrigin.hostname === "[::1]" ||
      parsedOrigin.hostname.endsWith(".local") ||
      isPrivateIpv4Host(parsedOrigin.hostname)
    );
  } catch {
    return false;
  }
};

const getContentSecurityPolicyValue = () => {
  if (!IS_PRODUCTION) {
    return null;
  }

  return [
    "default-src 'self'",
    "base-uri 'self'",
    "frame-ancestors 'none'",
    "form-action 'self'",
    "object-src 'none'",
    "script-src 'self'",
    "style-src 'self' 'unsafe-inline'",
    "img-src 'self' data: blob: https:",
    "font-src 'self' data:",
    "connect-src 'self'",
    "manifest-src 'self'",
    "worker-src 'self' blob:",
  ].join("; ");
};

const normalizeIpAddress = (value?: string | null) => {
  if (!value || typeof value !== "string") {
    return null;
  }

  const firstValue = value.split(",")[0]?.trim();

  if (!firstValue) {
    return null;
  }

  return firstValue.startsWith("::ffff:") ? firstValue.slice(7) : firstValue;
};

const getRequestIp = (req: express.Request) =>
  normalizeIpAddress(req.ip) ||
  (TRUST_PROXY_ENABLED ? normalizeIpAddress(req.headers["x-forwarded-for"] as string | undefined) : null) ||
  normalizeIpAddress(req.socket.remoteAddress) ||
  "unknown";

const setRetryAfterHeader = (res: express.Response, retryAfterMs: number) => {
  res.setHeader("Retry-After", String(Math.max(1, Math.ceil(retryAfterMs / 1000))));
};

const createAuthRateLimitAuditLog = ({
  action,
  description,
  scope,
  requestIp,
  retryAfterMs,
  user,
  email,
}: {
  action: string;
  description: string;
  scope: AuthRateLimitScope;
  requestIp: string;
  retryAfterMs: number;
  user?:
    | {
        id: number;
        email: string;
        name: string;
        agency_id: number | null;
      }
    | null
    | undefined;
  email?: string | null;
}) => {
  createAuditLog({
    action,
    entityType: "security",
    entityId: user?.id || null,
    description,
    userId: user?.id || null,
    actorName: user?.name || "Protección de acceso",
    actorEmail: user?.email || email || null,
    agencyId: user?.agency_id || null,
    metadata: {
      scope,
      request_ip: requestIp,
      retry_after_seconds: Math.max(1, Math.ceil(retryAfterMs / 1000)),
    },
  });
};

const getAuthRateLimitRecord = (scope: AuthRateLimitScope, identifier: string) =>
  db
    .prepare(
      `
        SELECT
          id,
          scope,
          identifier,
          failure_count,
          lock_level,
          blocked_until,
          window_started_at,
          last_attempt_at
        FROM auth_rate_limits
        WHERE scope = ? AND identifier = ?
      `,
    )
    .get(scope, identifier) as
    | {
        id: number;
        scope: AuthRateLimitScope;
        identifier: string;
        failure_count: number;
        lock_level: number;
        blocked_until: string | null;
        window_started_at: string | null;
        last_attempt_at: string | null;
      }
    | undefined;

const clearAuthRateLimit = (scope: AuthRateLimitScope, identifier: string) => {
  db.prepare("DELETE FROM auth_rate_limits WHERE scope = ? AND identifier = ?").run(scope, identifier);
};

const normalizeAuthRateLimitRecord = (scope: AuthRateLimitScope, identifier: string) => {
  const record = getAuthRateLimitRecord(scope, identifier);

  if (!record) {
    return null;
  }

  const config = AUTH_RATE_LIMIT_CONFIG[scope];
  const now = Date.now();
  const lastAttemptAt = parseStoredUtcDate(record.last_attempt_at)?.getTime() ?? null;

  if (lastAttemptAt && now - lastAttemptAt > config.resetAfterMs) {
    clearAuthRateLimit(scope, identifier);
    return null;
  }

  const blockedUntil = parseStoredUtcDate(record.blocked_until);
  const windowStartedAt = parseStoredUtcDate(record.window_started_at);

  let shouldPersist = false;
  let failureCount = record.failure_count;
  let blockedUntilValue = record.blocked_until;
  let windowStartedValue = record.window_started_at;

  if (blockedUntil && blockedUntil.getTime() <= now) {
    blockedUntilValue = null;
    failureCount = 0;
    windowStartedValue = null;
    shouldPersist = true;
  }

  if (windowStartedAt && now - windowStartedAt.getTime() > config.windowMs && failureCount > 0) {
    failureCount = 0;
    windowStartedValue = null;
    shouldPersist = true;
  }

  if (shouldPersist) {
    db.prepare(
      `
        UPDATE auth_rate_limits
        SET
          failure_count = ?,
          blocked_until = ?,
          window_started_at = ?,
          updated_at = ?
        WHERE id = ?
      `,
    ).run(failureCount, blockedUntilValue, windowStartedValue, new Date().toISOString(), record.id);
  }

  return {
    ...record,
    failure_count: failureCount,
    blocked_until: blockedUntilValue,
    window_started_at: windowStartedValue,
  };
};

const getAuthRateLimitStatus = (scope: AuthRateLimitScope, identifier: string) => {
  const record = normalizeAuthRateLimitRecord(scope, identifier);
  const blockedUntil = parseStoredUtcDate(record?.blocked_until);

  if (record && blockedUntil && blockedUntil.getTime() > Date.now()) {
    return {
      blocked: true as const,
      retryAfterMs: blockedUntil.getTime() - Date.now(),
      lockLevel: record.lock_level,
      record,
    };
  }

  return {
    blocked: false as const,
    retryAfterMs: 0,
    lockLevel: record?.lock_level || 0,
    record,
  };
};

const registerAuthRateLimitFailure = (scope: AuthRateLimitScope, identifier: string) => {
  const config = AUTH_RATE_LIMIT_CONFIG[scope];
  const currentRecord = normalizeAuthRateLimitRecord(scope, identifier);
  const now = new Date();
  const nowIso = now.toISOString();
  const windowStartedAt = parseStoredUtcDate(currentRecord?.window_started_at);
  const isWithinWindow =
    windowStartedAt && now.getTime() - windowStartedAt.getTime() < config.windowMs;
  const failureCount = isWithinWindow ? (currentRecord?.failure_count || 0) + 1 : 1;
  let lockLevel = currentRecord?.lock_level || 0;
  let blockedUntil: string | null = null;
  let nextFailureCount = failureCount;
  let nextWindowStartedAt = isWithinWindow && currentRecord?.window_started_at ? currentRecord.window_started_at : nowIso;
  let justBlocked = false;

  if (failureCount >= config.maxAttempts) {
    lockLevel = Math.min(lockLevel + 1, config.lockStepsMs.length);
    blockedUntil = new Date(
      now.getTime() + config.lockStepsMs[Math.min(lockLevel - 1, config.lockStepsMs.length - 1)],
    ).toISOString();
    nextFailureCount = 0;
    nextWindowStartedAt = null;
    justBlocked = true;
  }

  db.prepare(
    `
      INSERT INTO auth_rate_limits (
        scope,
        identifier,
        failure_count,
        lock_level,
        blocked_until,
        window_started_at,
        last_attempt_at,
        updated_at
      )
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(scope, identifier) DO UPDATE SET
        failure_count = excluded.failure_count,
        lock_level = excluded.lock_level,
        blocked_until = excluded.blocked_until,
        window_started_at = excluded.window_started_at,
        last_attempt_at = excluded.last_attempt_at,
        updated_at = excluded.updated_at
    `,
  ).run(
    scope,
    identifier,
    nextFailureCount,
    lockLevel,
    blockedUntil,
    nextWindowStartedAt,
    nowIso,
    nowIso,
  );

  return {
    justBlocked,
    blockedUntil,
    retryAfterMs: blockedUntil ? parseStoredUtcDate(blockedUntil)!.getTime() - now.getTime() : 0,
    lockLevel,
    failureCount: nextFailureCount,
  };
};

const getAuthUserBySessionToken = (token?: string) => {
  if (!token) {
    return null;
  }

  clearExpiredSessions();

  const user = db
    .prepare(
      `
        SELECT
          users.id,
          users.email,
          users.name,
          users.role,
          users.status,
          users.agency_id,
          users.client_id,
          users.freelancer_id,
          users.two_factor_enabled
        FROM sessions
        INNER JOIN users ON users.id = sessions.user_id
        WHERE
          sessions.token = ?
          AND datetime(sessions.expires_at) > datetime('now')
          AND COALESCE(users.access_status, 'active') = 'active'
      `,
    )
    .get(token) as AuthUser | undefined;

  return user ? toAuthUser(user) : null;
};

const createSessionForUser = (userId: number, agencyId: number) => {
  const token = randomBytes(32).toString("hex");
  const durationMs = getSessionDurationMs(agencyId);
  const expiresAt = new Date(Date.now() + durationMs).toISOString();

  db.prepare("INSERT INTO sessions (token, user_id, expires_at) VALUES (?, ?, ?)").run(
    token,
    userId,
    expiresAt,
  );

  return { token, durationMs };
};

const deleteSessionsForUser = (userId: number) =>
  db.prepare("DELETE FROM sessions WHERE user_id = ?").run(userId).changes;

const clearExpiredTwoFactorChallenges = () => {
  db.prepare(
    "DELETE FROM two_factor_challenges WHERE consumed_at IS NOT NULL OR datetime(expires_at) <= datetime('now')",
  ).run();
};

const invalidateTwoFactorChallengesForUser = (userId: number) =>
  db.prepare("DELETE FROM two_factor_challenges WHERE user_id = ?").run(userId).changes;

const createTwoFactorChallengeForUser = (
  userId: number,
  agencyId: number,
  purpose: "login" | "password_reset" = "login",
) => {
  clearExpiredTwoFactorChallenges();
  invalidateTwoFactorChallengesForUser(userId);

  const token = randomBytes(24).toString("hex");
  const expiresAt = new Date(Date.now() + TWO_FACTOR_CHALLENGE_TTL_MS).toISOString();

  db.prepare(
    `
      INSERT INTO two_factor_challenges (token, user_id, purpose, expires_at, agency_id)
      VALUES (?, ?, ?, ?, ?)
    `,
  ).run(token, userId, purpose, expiresAt, agencyId);

  return { token, expiresAt };
};

const getTwoFactorChallengeByToken = (token: string) => {
  clearExpiredTwoFactorChallenges();

  return db
    .prepare(
      `
        SELECT
          two_factor_challenges.id,
          two_factor_challenges.token,
          two_factor_challenges.purpose,
          two_factor_challenges.expires_at,
          users.id as user_id,
          users.email,
          users.name,
          users.role,
          users.status,
          users.agency_id,
          users.two_factor_secret,
          users.two_factor_enabled,
          users.two_factor_backup_codes
        FROM two_factor_challenges
        INNER JOIN users ON users.id = two_factor_challenges.user_id
        WHERE
          two_factor_challenges.token = ?
          AND two_factor_challenges.consumed_at IS NULL
          AND datetime(two_factor_challenges.expires_at) > datetime('now')
          AND COALESCE(users.access_status, 'active') = 'active'
      `,
    )
    .get(token) as
    | {
        id: number;
        token: string;
        purpose: "login" | "password_reset";
        expires_at: string;
        user_id: number;
        email: string;
        name: string;
        role: string;
        status: "online" | "meeting" | "offline";
        agency_id: number | null;
        two_factor_secret: string | null;
        two_factor_enabled: number | null;
        two_factor_backup_codes: string | null;
      }
    | undefined;
};

const markTwoFactorChallengeConsumed = (challengeId: number) => {
  db.prepare(
    "UPDATE two_factor_challenges SET consumed_at = ? WHERE id = ? AND consumed_at IS NULL",
  ).run(new Date().toISOString(), challengeId);
};

const createTwoFactorChallengeResponse = ({
  user,
  challengeToken,
  expiresAt,
}: {
  user: {
    email: string;
    name: string;
  };
  challengeToken: string;
  expiresAt: string;
}) => ({
  two_factor_required: true as const,
  challenge_token: challengeToken,
  challenge_expires_at: expiresAt,
  email: user.email,
  name: user.name,
  available_methods: ["totp", "backup_code"] as const,
});

const serializeAuditMetadata = (metadata?: Record<string, unknown> | null) =>
  metadata ? JSON.stringify(metadata) : null;

const parseAuditMetadata = (value?: string | null) => {
  if (!value) {
    return null;
  }

  try {
    return JSON.parse(value) as Record<string, unknown>;
  } catch {
    return null;
  }
};

const getAutomationEntityType = (automation: AiAutomationId): AiAutomationEntityType => {
  switch (automation) {
    case "lead_followup":
      return "lead";
    case "client_report":
      return "client";
    case "project_tasks":
    default:
      return "project";
  }
};

const getAutomationRunStatus = (
  actions?: AIAutomationActionResult[] | null,
): AiAutomationRunStatus => {
  if (!actions || actions.length === 0) {
    return "skipped";
  }

  return actions.every((action) => action.status === "skipped") ? "skipped" : "success";
};

const serializeAIAutomationActions = (actions?: AIAutomationActionResult[] | null) =>
  actions ? JSON.stringify(actions) : null;

const parseAIAutomationActions = (value?: string | null) => {
  if (!value) {
    return [];
  }

  try {
    const parsed = JSON.parse(value) as AIAutomationActionResult[];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
};

const getAutomationRunTaskIds = ({
  agencyId,
  entityType,
  entityId,
  automation = null,
}: {
  agencyId: number;
  entityType: AiAutomationEntityType;
  entityId: number;
  automation?: AiAutomationId | null;
}) => {
  const rows = (
    automation
      ? db
          .prepare(
            `
              SELECT actions
              FROM ai_automation_runs
              WHERE agency_id = ? AND entity_type = ? AND entity_id = ? AND automation = ?
            `,
          )
          .all(agencyId, entityType, entityId, automation)
      : db
          .prepare(
            `
              SELECT actions
              FROM ai_automation_runs
              WHERE agency_id = ? AND entity_type = ? AND entity_id = ?
            `,
          )
          .all(agencyId, entityType, entityId)
  ) as Array<{ actions?: string | null }>;

  return Array.from(
    new Set(
      rows.flatMap((row) =>
        parseAIAutomationActions(row.actions)
          .filter(
            (action) =>
              action.type === "task" &&
              action.status === "created" &&
              Number.isInteger(Number(action.target_id)) &&
              Number(action.target_id) > 0,
          )
          .map((action) => Number(action.target_id)),
      ),
    ),
  );
};

const createAIAutomationRun = ({
  automation,
  mode,
  status,
  entityType,
  entityId = null,
  triggerKey = null,
  source = "local",
  summary = null,
  errorMessage = null,
  actions = null,
  authUser = null,
  userId = null,
  actorName = null,
  actorEmail = null,
  agencyId = null,
}: AIAutomationRunParams) => {
  const resolvedUserId = authUser?.id ?? userId ?? null;
  const fallbackUser = resolvedUserId ? getUserRecordByIdFull(resolvedUserId) : null;
  const resolvedActorName = authUser?.name || actorName || fallbackUser?.name || "Sistema IA";
  const resolvedActorEmail = authUser?.email || actorEmail || fallbackUser?.email || null;
  const resolvedAgencyId = agencyId ?? fallbackUser?.agency_id ?? null;

  db.prepare(
    `
      INSERT INTO ai_automation_runs (
        automation,
        mode,
        status,
        trigger_key,
        entity_type,
        entity_id,
        source,
        summary,
        error_message,
        actions,
        user_id,
        actor_name,
        actor_email,
        agency_id
      )
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `,
  ).run(
    automation,
    mode,
    status,
    triggerKey,
    entityType,
    entityId,
    source,
    summary,
    errorMessage,
    serializeAIAutomationActions(actions),
    resolvedUserId,
    resolvedActorName,
    resolvedActorEmail,
    resolvedAgencyId,
  );
};

const createAuditLog = ({
  action,
  entityType,
  entityId = null,
  description,
  metadata = null,
  authUser = null,
  userId = null,
  actorName = null,
  actorEmail = null,
  agencyId = null,
}: AuditLogParams) => {
  const resolvedUserId = authUser?.id ?? userId ?? null;
  const fallbackUser = resolvedUserId ? getUserRecordByIdFull(resolvedUserId) : null;
  const resolvedActorName = authUser?.name || actorName || fallbackUser?.name || "Sistema";
  const resolvedActorEmail = authUser?.email || actorEmail || fallbackUser?.email || null;
  const resolvedAgencyId = agencyId ?? fallbackUser?.agency_id ?? null;

  db.prepare(
    `
      INSERT INTO audit_logs (
        user_id,
        actor_name,
        actor_email,
        action,
        entity_type,
        entity_id,
        description,
        metadata,
        agency_id
      )
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `,
  ).run(
    resolvedUserId,
    resolvedActorName,
    resolvedActorEmail,
    action,
    entityType,
    entityId,
    description,
    serializeAuditMetadata(metadata),
    resolvedAgencyId,
  );
};

const createContractEvent = ({
  contractId,
  eventType,
  title,
  description,
  metadata = null,
  authUser = null,
  userId = null,
  actorName = null,
  actorEmail = null,
  agencyId = null,
}: ContractEventParams) => {
  const resolvedUserId = authUser?.id ?? userId ?? null;
  const fallbackUser = resolvedUserId ? getUserRecordByIdFull(resolvedUserId) : null;
  const resolvedActorName = authUser?.name || actorName || fallbackUser?.name || "Sistema";
  const resolvedActorEmail = authUser?.email || actorEmail || fallbackUser?.email || null;
  const resolvedAgencyId = agencyId ?? fallbackUser?.agency_id ?? null;

  db.prepare(
    `
      INSERT INTO contract_events (
        contract_id,
        event_type,
        title,
        description,
        metadata,
        user_id,
        actor_name,
        actor_email,
        agency_id
      )
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `,
  ).run(
    contractId,
    eventType,
    title,
    description,
    serializeAuditMetadata(metadata),
    resolvedUserId,
    resolvedActorName,
    resolvedActorEmail,
    resolvedAgencyId,
  );
};

const createAiTriggerStateChangeAuditLogs = ({
  previousSettings,
  nextSettings,
  authUser,
  agencyId,
  source,
}: {
  previousSettings: AppSettingsPayload;
  nextSettings: AppSettingsPayload;
  authUser: AuthUser | null;
  agencyId: number;
  source: string;
}) => {
  AI_TRIGGER_KEYS.forEach((triggerKey) => {
    if (previousSettings[triggerKey] === nextSettings[triggerKey]) {
      return;
    }

    const nextEnabled = nextSettings[triggerKey] === true;

    createAuditLog({
      action: nextEnabled ? "settings.ai_trigger_enabled" : "settings.ai_trigger_disabled",
      entityType: "settings",
      entityId: agencyId,
      description: `Se ${nextEnabled ? "reactivó" : "desactivó"} el trigger IA ${triggerKey} desde ${source}.`,
      authUser,
      agencyId,
      metadata: {
        trigger_key: triggerKey,
        source,
      },
    });
  });
};

const userColumns = db
  .prepare("PRAGMA table_info(users)")
  .all() as Array<{ name: string }>;
const leadColumns = db
  .prepare("PRAGMA table_info(leads)")
  .all() as Array<{ name: string }>;
const clientColumns = db
  .prepare("PRAGMA table_info(clients)")
  .all() as Array<{ name: string }>;
const projectColumns = db
  .prepare("PRAGMA table_info(projects)")
  .all() as Array<{ name: string }>;
const taskColumns = db
  .prepare("PRAGMA table_info(tasks)")
  .all() as Array<{ name: string }>;
const campaignColumns = db
  .prepare("PRAGMA table_info(campaigns)")
  .all() as Array<{ name: string }>;

if (!userColumns.some((column) => column.name === "status")) {
  db.exec("ALTER TABLE users ADD COLUMN status TEXT DEFAULT 'online'");
}

if (!userColumns.some((column) => column.name === "access_status")) {
  db.exec("ALTER TABLE users ADD COLUMN access_status TEXT DEFAULT 'active'");
}

if (!userColumns.some((column) => column.name === "activation_token")) {
  db.exec("ALTER TABLE users ADD COLUMN activation_token TEXT");
}

if (!userColumns.some((column) => column.name === "invited_at")) {
  db.exec("ALTER TABLE users ADD COLUMN invited_at DATETIME");
}

if (!userColumns.some((column) => column.name === "activated_at")) {
  db.exec("ALTER TABLE users ADD COLUMN activated_at DATETIME");
}

if (!userColumns.some((column) => column.name === "two_factor_secret")) {
  db.exec("ALTER TABLE users ADD COLUMN two_factor_secret TEXT");
}

if (!userColumns.some((column) => column.name === "two_factor_pending_secret")) {
  db.exec("ALTER TABLE users ADD COLUMN two_factor_pending_secret TEXT");
}

if (!userColumns.some((column) => column.name === "two_factor_enabled")) {
  db.exec("ALTER TABLE users ADD COLUMN two_factor_enabled INTEGER DEFAULT 0");
}

if (!userColumns.some((column) => column.name === "two_factor_backup_codes")) {
  db.exec("ALTER TABLE users ADD COLUMN two_factor_backup_codes TEXT");
}

if (!userColumns.some((column) => column.name === "two_factor_confirmed_at")) {
  db.exec("ALTER TABLE users ADD COLUMN two_factor_confirmed_at DATETIME");
}

if (!userColumns.some((column) => column.name === "client_id")) {
  db.exec("ALTER TABLE users ADD COLUMN client_id INTEGER");
}

if (!userColumns.some((column) => column.name === "freelancer_id")) {
  db.exec("ALTER TABLE users ADD COLUMN freelancer_id INTEGER");
}

if (!leadColumns.some((column) => column.name === "next_action")) {
  db.exec("ALTER TABLE leads ADD COLUMN next_action TEXT");
}

if (!leadColumns.some((column) => column.name === "next_contact_date")) {
  db.exec("ALTER TABLE leads ADD COLUMN next_contact_date TEXT");
}

if (!leadColumns.some((column) => column.name === "last_contacted_at")) {
  db.exec("ALTER TABLE leads ADD COLUMN last_contacted_at DATETIME");
}

if (!leadColumns.some((column) => column.name === "archived_at")) {
  db.exec("ALTER TABLE leads ADD COLUMN archived_at DATETIME");
}

if (!clientColumns.some((column) => column.name === "archived_at")) {
  db.exec("ALTER TABLE clients ADD COLUMN archived_at DATETIME");
}

if (!projectColumns.some((column) => column.name === "archived_at")) {
  db.exec("ALTER TABLE projects ADD COLUMN archived_at DATETIME");
}

if (!taskColumns.some((column) => column.name === "archived_at")) {
  db.exec("ALTER TABLE tasks ADD COLUMN archived_at DATETIME");
}

if (!campaignColumns.some((column) => column.name === "archived_at")) {
  db.exec("ALTER TABLE campaigns ADD COLUMN archived_at DATETIME");
}

const usersWithPasswords = db
  .prepare("SELECT id, password FROM users")
  .all() as Array<{ id: number; password: string }>;

usersWithPasswords.forEach((user) => {
  if (!user.password.includes(":")) {
    db.prepare("UPDATE users SET password = ? WHERE id = ?").run(
      hashPassword(user.password),
      user.id,
    );
  }
});

const createInvoiceUrl = (invoiceNumber: string, clientName: string, amount: number, dueDate: string) =>
  `data:text/plain;charset=utf-8,${encodeURIComponent(
    [
      `Factura ${invoiceNumber}`,
      "",
      `Cliente: ${clientName}`,
      `Importe: $${Math.round(amount).toLocaleString("en-US")}`,
      `Vencimiento: ${dueDate}`,
    ].join("\n"),
  )}`;

const createReportUrl = (title: string, content: string) =>
  `data:text/plain;charset=utf-8,${encodeURIComponent(`# ${title}\n\n${content}`)}`;

const createContractUrl = (contractNumber: string, title: string, content: string) =>
  `data:text/plain;charset=utf-8,${encodeURIComponent(
    [`Contrato ${contractNumber}`, "", `Título: ${title}`, "", content].join("\n"),
  )}`;

const buildReportContent = ({
  clientName,
  type,
  generatedAt,
  projectCount,
  campaignCount,
  activeCampaignCount,
  totalSpend,
  averageRoi,
  pendingTaskCount,
}: {
  clientName: string;
  type: string;
  generatedAt: string;
  projectCount: number;
  campaignCount: number;
  activeCampaignCount: number;
  totalSpend: number;
  averageRoi: number;
  pendingTaskCount: number;
}) =>
  [
    `Cliente: ${clientName}`,
    `Tipo de reporte: ${type}`,
    `Generado: ${generatedAt}`,
    "",
    "Resumen ejecutivo",
    `- Proyectos vinculados: ${projectCount}`,
    `- Campañas registradas: ${campaignCount}`,
    `- Campañas activas: ${activeCampaignCount}`,
    `- Gasto total: $${Math.round(totalSpend).toLocaleString("en-US")}`,
    `- ROI promedio: ${averageRoi.toFixed(2)}x`,
    `- Tareas pendientes: ${pendingTaskCount}`,
    "",
    "Siguientes pasos",
    "- Revisar campañas con menor ROI.",
    "- Priorizar tareas pendientes del cliente.",
    "- Compartir recomendaciones y próximos hitos.",
  ].join("\n");

const getClientReportMetrics = (clientId: number) => {
  const projectCount =
    (db
      .prepare("SELECT COUNT(*) as count FROM projects WHERE client_id = ? AND archived_at IS NULL")
      .get(clientId) as { count: number }).count;
  const projectIds = db
    .prepare("SELECT id FROM projects WHERE client_id = ? AND archived_at IS NULL")
    .all(clientId) as Array<{ id: number }>;
  const projectIdValues = projectIds.map((project) => project.id);

  let campaignCount = 0;
  let activeCampaignCount = 0;
  let totalSpend = 0;
  let averageRoi = 0;
  let pendingTaskCount = 0;

  if (projectIdValues.length > 0) {
    const placeholders = projectIdValues.map(() => "?").join(", ");

    const campaignStats = db
      .prepare(
        `
          SELECT
            COUNT(*) as count,
            SUM(CASE WHEN status = 'active' THEN 1 ELSE 0 END) as active_count,
            COALESCE(SUM(spent), 0) as total_spend,
            COALESCE(AVG(roi), 0) as average_roi
          FROM campaigns
          WHERE project_id IN (${placeholders}) AND archived_at IS NULL
        `,
      )
      .get(...projectIdValues) as {
      count: number;
      active_count: number;
      total_spend: number;
      average_roi: number;
    };

    const taskStats = db
      .prepare(
        `
          SELECT COUNT(*) as count
          FROM tasks
          WHERE status != 'done' AND archived_at IS NULL AND project_id IN (${placeholders})
        `,
      )
      .get(...projectIdValues) as { count: number };

    campaignCount = campaignStats.count;
    activeCampaignCount = campaignStats.active_count;
    totalSpend = campaignStats.total_spend;
    averageRoi = campaignStats.average_roi;
    pendingTaskCount = taskStats.count;
  }

  return {
    projectCount,
    campaignCount,
    activeCampaignCount,
    totalSpend,
    averageRoi,
    pendingTaskCount,
  };
};

// Seed initial data if empty
const agencyCount = db.prepare("SELECT COUNT(*) as count FROM agencies").get() as { count: number };
if (agencyCount.count === 0) {
  const agencyId = db
    .prepare("INSERT INTO agencies (name, subscription_plan) VALUES (?, ?)")
    .run(defaultAppSettings.agency_name, defaultAppSettings.subscription_plan).lastInsertRowid;
  db
    .prepare("INSERT INTO users (email, password, name, role, agency_id) VALUES (?, ?, ?, ?, ?)")
    .run("admin@zaaryx.com", hashPassword("admin123"), "Admin User", "Administrador", agencyId);
  const insertUser = db.prepare(
    "INSERT INTO users (email, password, name, role, agency_id, status) VALUES (?, ?, ?, ?, ?, ?)",
  );
  insertUser.run(
    "alex@zaaryx.com",
    hashPassword("temp123"),
    "Alex Rivera",
    "Media Buyer",
    agencyId,
    "meeting",
  );
  insertUser.run(
    "sofia@zaaryx.com",
    hashPassword("temp123"),
    "Sofia Chen",
    "Project Manager",
    agencyId,
    "online",
  );
  insertUser.run(
    "marcus@zaaryx.com",
    hashPassword("temp123"),
    "Marcus Thorne",
    "AI Specialist",
    agencyId,
    "offline",
  );
  
  // Seed some leads
  const insertLead = db.prepare("INSERT INTO leads (name, company, email, source, service, budget, status, agency_id) VALUES (?, ?, ?, ?, ?, ?, ?, ?)");
  const lead1Id = insertLead.run("John Doe", "TechCorp", "john@techcorp.com", "Google Ads", "SEO", 5000, "closed", agencyId).lastInsertRowid;
  const lead2Id = insertLead.run("Jane Smith", "FashionHub", "jane@fashionhub.com", "Instagram", "Meta Ads", 3000, "contacted", agencyId).lastInsertRowid;

  // Seed some clients
  const insertClient = db.prepare("INSERT INTO clients (lead_id, company, industry, budget, status, agency_id) VALUES (?, ?, ?, ?, ?, ?)");
  const client1Id = insertClient.run(lead1Id, "TechCorp", "Technology", 5000, "active", agencyId).lastInsertRowid;

  // Seed some projects
  const insertProject = db.prepare("INSERT INTO projects (client_id, name, status, agency_id) VALUES (?, ?, ?, ?)");
  const project1Id = insertProject.run(client1Id, "SEO Optimization Q1", "execution", agencyId).lastInsertRowid;

  // Seed some campaigns
  const insertCampaign = db.prepare("INSERT INTO campaigns (project_id, name, platform, budget, spent, roi, status, agency_id) VALUES (?, ?, ?, ?, ?, ?, ?, ?)");
  insertCampaign.run(project1Id, "Google Search Ads - Tech", "Google Ads", 2000, 1200, 3.5, "active", agencyId);
  insertCampaign.run(project1Id, "Display Retargeting", "Google Ads", 1000, 450, 2.1, "active", agencyId);

  // Seed some tasks
  const insertTask = db.prepare("INSERT INTO tasks (project_id, title, description, status, priority, due_date, agency_id) VALUES (?, ?, ?, ?, ?, ?, ?)");
  insertTask.run(project1Id, "Auditoría SEO Inicial", "Realizar auditoría completa del sitio web", "done", "high", "2026-03-10", agencyId);
  insertTask.run(project1Id, "Keyword Research", "Investigar palabras clave para el sector tech", "in_progress", "medium", "2026-03-15", agencyId);
  insertTask.run(project1Id, "Optimización On-Page", "Aplicar cambios técnicos en el CMS", "todo", "high", "2026-03-20", agencyId);

  // Seed some reports
  const insertReport = db.prepare(
    "INSERT INTO reports (client_id, title, type, url, agency_id) VALUES (?, ?, ?, ?, ?)",
  );
  const monthlyReportContent = buildReportContent({
    clientName: "TechCorp",
    type: "Performance",
    generatedAt: "2026-03-09 09:00",
    projectCount: 1,
    campaignCount: 2,
    activeCampaignCount: 2,
    totalSpend: 1650,
    averageRoi: 2.8,
    pendingTaskCount: 2,
  });
  insertReport.run(
    client1Id,
    "Reporte Mensual - TechCorp",
    "Performance",
    createReportUrl("Reporte Mensual - TechCorp", monthlyReportContent),
    agencyId,
  );

  const insertInvoice = db.prepare(
    "INSERT INTO invoices (invoice_number, client_id, amount, due_date, status, url, agency_id) VALUES (?, ?, ?, ?, ?, ?, ?)",
  );
  insertInvoice.run(
    "INV-001",
    client1Id,
    5000,
    "2026-03-12",
    "pending",
    createInvoiceUrl("INV-001", "TechCorp", 5000, "2026-03-12"),
    agencyId,
  );
  insertInvoice.run(
    "INV-002",
    client1Id,
    3200,
    "2026-02-28",
    "paid",
    createInvoiceUrl("INV-002", "TechCorp", 3200, "2026-02-28"),
    agencyId,
  );
}

const getDefaultAgency = () =>
  db.prepare("SELECT id FROM agencies ORDER BY id LIMIT 1").get() as { id: number } | undefined;

const getDefaultUser = () =>
  db.prepare("SELECT id FROM users ORDER BY id LIMIT 1").get() as { id: number } | undefined;

const getDefaultUserForAgency = (agencyId: number) =>
  db
    .prepare("SELECT id FROM users WHERE agency_id = ? ORDER BY id LIMIT 1")
    .get(agencyId) as { id: number } | undefined;

const getLeadAssignmentCandidatesForAgency = (agencyId: number) => {
  const rows = db
    .prepare(
      `
        SELECT id
        FROM users
        WHERE agency_id = ? AND COALESCE(access_status, 'active') = 'active'
        ORDER BY id ASC
      `,
    )
    .all(agencyId) as Array<{ id: number }>;

  const activeLeadLoadRows = db
    .prepare(
      `
        SELECT assigned_to, COUNT(*) as count
        FROM leads
        WHERE agency_id = ?
          AND assigned_to IS NOT NULL
          AND archived_at IS NULL
          AND status NOT IN ('closed', 'lost')
        GROUP BY assigned_to
      `,
    )
    .all(agencyId) as Array<{ assigned_to: number; count: number }>;

  const activeLeadLoadByUserId = activeLeadLoadRows.reduce<Record<number, number>>(
    (accumulator, row) => {
      accumulator[row.assigned_to] = row.count;
      return accumulator;
    },
    {},
  );

  const availabilityPriority: Record<"online" | "meeting" | "offline", number> = {
    online: 0,
    meeting: 1,
    offline: 2,
  };
  const rolePriority: Record<string, number> = {
    account: 0,
    admin: 1,
    project_manager: 2,
    media_buyer: 3,
    ai_specialist: 4,
    finance: 5,
    viewer: 6,
  };

  const candidates = rows
    .map((row) => getUserRecordByIdFull(row.id))
    .filter(
      (
        user,
      ): user is NonNullable<ReturnType<typeof getUserRecordByIdFull>> =>
        Boolean(user && canAccessSection(user.role, "leads")),
    )
    .map((user) => ({
      user,
      roleKey: getRoleKey(user.role),
      activeLeadLoad: activeLeadLoadByUserId[user.id] || 0,
      projectsLoad: getProjectsCountByUserId(user.id, agencyId),
      availabilityRank: availabilityPriority[user.status],
    }));

  const preferredCandidates = candidates.filter((candidate) =>
    ["account", "admin", "project_manager"].includes(candidate.roleKey),
  );

  return (preferredCandidates.length > 0 ? preferredCandidates : candidates).sort((left, right) => {
    const roleDelta =
      (rolePriority[left.roleKey] ?? 99) - (rolePriority[right.roleKey] ?? 99);

    if (roleDelta !== 0) {
      return roleDelta;
    }

    if (left.activeLeadLoad !== right.activeLeadLoad) {
      return left.activeLeadLoad - right.activeLeadLoad;
    }

    if (left.projectsLoad !== right.projectsLoad) {
      return left.projectsLoad - right.projectsLoad;
    }

    if (left.availabilityRank !== right.availabilityRank) {
      return left.availabilityRank - right.availabilityRank;
    }

    return left.user.id - right.user.id;
  });
};

type FullUserRecord = {
  id: number;
  email: string;
  password: string;
  name: string;
  role: string;
  client_id: number | null;
  freelancer_id: number | null;
  status: "online" | "meeting" | "offline";
  access_status: UserAccessStatus | null;
  activation_token: string | null;
  invited_at: string | null;
  activated_at: string | null;
  two_factor_secret: string | null;
  two_factor_pending_secret: string | null;
  two_factor_enabled: number | null;
  two_factor_backup_codes: string | null;
  two_factor_confirmed_at: string | null;
  agency_id: number | null;
};

const getUserRecordByEmailFull = (email: string) =>
  db.prepare("SELECT * FROM users WHERE lower(email) = lower(?)").get(email.trim()) as
    | FullUserRecord
    | undefined;

const getUserRecordByIdFull = (userId: number) =>
  db.prepare("SELECT * FROM users WHERE id = ?").get(userId) as FullUserRecord | undefined;

const isAgencyOwnedRecord = (
  record: { agency_id: number | null | undefined } | null | undefined,
  agencyId: number,
) => Boolean(record && record.agency_id === agencyId);

const isArchivedRecord = (
  record: { archived_at?: string | null | undefined } | null | undefined,
) => Boolean(record?.archived_at);

const deleteOperationalArtifactsBySource = (
  agencyId: number,
  sourceType: string,
  sourceRef: string,
) => {
  db.prepare("DELETE FROM calendar_events WHERE agency_id = ? AND source_type = ? AND source_ref = ?").run(
    agencyId,
    sourceType,
    sourceRef,
  );
  db.prepare("DELETE FROM notifications WHERE agency_id = ? AND source_type = ? AND source_ref = ?").run(
    agencyId,
    sourceType,
    sourceRef,
  );
};

const getUserRecordByActivationToken = (token: string) =>
  db.prepare("SELECT * FROM users WHERE activation_token = ?").get(token) as
    | FullUserRecord
    | undefined;

const isExternalLinkedUser = (user: {
  role: string;
  client_id?: number | null;
  freelancer_id?: number | null;
}) => {
  const roleKey = getRoleKey(user.role);
  return (
    roleKey === "client" ||
    roleKey === "freelancer" ||
    Number.isInteger(Number(user.client_id)) ||
    Number.isInteger(Number(user.freelancer_id))
  );
};

const shouldUseTeamOnboardingForUser = (user: {
  role: string;
  client_id?: number | null;
  freelancer_id?: number | null;
}) => !isExternalLinkedUser(user);

const getLinkedClientUserRecord = (agencyId: number, clientId: number) =>
  db
    .prepare(
      `
        SELECT *
        FROM users
        WHERE agency_id = ? AND client_id = ?
        ORDER BY
          CASE COALESCE(access_status, 'active')
            WHEN 'active' THEN 0
            ELSE 1
          END,
          id ASC
        LIMIT 1
      `,
    )
    .get(agencyId, clientId) as ReturnType<typeof getUserRecordByIdFull>;

const getLinkedFreelancerUserRecord = (agencyId: number, freelancerId: number) =>
  db
    .prepare(
      `
        SELECT *
        FROM users
        WHERE agency_id = ? AND freelancer_id = ?
        ORDER BY
          CASE COALESCE(access_status, 'active')
            WHEN 'active' THEN 0
            ELSE 1
          END,
          id ASC
        LIMIT 1
      `,
    )
    .get(agencyId, freelancerId) as ReturnType<typeof getUserRecordByIdFull>;

const serializePortalAccessUser = (
  user: ReturnType<typeof getUserRecordByIdFull> | null | undefined,
  req?: express.Request,
) => {
  if (!user) {
    return null;
  }

  const accessStatus = (user.access_status || "active") as UserAccessStatus;

  return {
    user_id: user.id,
    email: user.email,
    name: user.name,
    role: user.role,
    access_status: accessStatus,
    invited_at: user.invited_at,
    activated_at: user.activated_at,
    invite_url:
      accessStatus === "invited" && user.activation_token
        ? buildActivationUrl(user.activation_token, req)
        : null,
  };
};

const canReceiveTaskAssignment = (
  user: NonNullable<ReturnType<typeof getUserRecordByIdFull>>,
) => {
  if (!canAccessSection(user.role, "tasks")) {
    return false;
  }

  if (getRoleKey(user.role) === "freelancer" && !Number.isInteger(Number(user.freelancer_id))) {
    return false;
  }

  return true;
};

const getTaskAssignableUsersForAgency = (agencyId: number) =>
  (
    db
      .prepare(
        `
          SELECT id
          FROM users
          WHERE agency_id = ?
            AND COALESCE(access_status, 'active') IN ('active', 'invited')
          ORDER BY lower(name) ASC, id ASC
        `,
      )
      .all(agencyId) as Array<{ id: number }>
  )
    .map((row) => getUserRecordByIdFull(row.id))
    .filter(
      (
        user,
      ): user is NonNullable<ReturnType<typeof getUserRecordByIdFull>> =>
        Boolean(user && canReceiveTaskAssignment(user)),
    );

const getTaskAssignableUserById = (agencyId: number, userId: number) => {
  const user = getUserRecordByIdFull(userId);

  if (!user || user.agency_id !== agencyId) {
    return null;
  }

  if (!["active", "invited"].includes(user.access_status || "active")) {
    return null;
  }

  if (!canReceiveTaskAssignment(user)) {
    return null;
  }

  return user;
};

const ensurePortalUserAccess = ({
  agencyId,
  entityType,
  entityId,
  name,
  email,
}: {
  agencyId: number;
  entityType: "client" | "freelancer";
  entityId: number;
  name: string;
  email: string;
}) => {
  const normalizedName = name.trim();
  const normalizedEmail = email.trim().toLowerCase();
  const linkedColumn = entityType === "client" ? "client_id" : "freelancer_id";
  const otherLinkedColumn = entityType === "client" ? "freelancer_id" : "client_id";
  const desiredRole = entityType === "client" ? "Client" : "Freelancer";
  const existingUser = getUserRecordByEmailFull(normalizedEmail);

  if (!normalizedName) {
    return {
      error:
        entityType === "client"
          ? "Client contact name is required"
          : "Freelancer name is required",
    } as const;
  }

  if (!normalizedEmail) {
    return {
      error:
        entityType === "client"
          ? "Client contact email is required"
          : "Freelancer email is required",
    } as const;
  }

  if (existingUser && existingUser.agency_id !== agencyId) {
    return { error: "Email already exists in another agency" } as const;
  }

  if (existingUser) {
    const roleKey = getRoleKey(existingUser.role);
    const existingLinkedEntityId =
      entityType === "client" ? existingUser.client_id : existingUser.freelancer_id;
    const otherLinkedEntityId =
      entityType === "client" ? existingUser.freelancer_id : existingUser.client_id;

    if (roleKey !== entityType) {
      return { error: "Email already belongs to a different internal role" } as const;
    }

    if (otherLinkedEntityId) {
      return { error: "This user is already linked to another external profile" } as const;
    }

    if (existingLinkedEntityId && existingLinkedEntityId !== entityId) {
      return {
        error:
          entityType === "client"
            ? "This email is already linked to another client portal"
            : "This email is already linked to another freelancer portal",
      } as const;
    }

    const isInvited = (existingUser.access_status || "active") === "invited";
    const nextActivationToken = isInvited ? createInviteToken() : null;
    const nextInvitedAt = isInvited ? new Date().toISOString() : existingUser.invited_at;

    db.prepare(
      `
        UPDATE users
        SET
          email = ?,
          name = ?,
          role = ?,
          ${linkedColumn} = ?,
          ${otherLinkedColumn} = NULL,
          activation_token = ?,
          invited_at = ?,
          status = COALESCE(status, 'offline')
        WHERE id = ?
      `,
    ).run(
      normalizedEmail,
      normalizedName,
      desiredRole,
      entityId,
      nextActivationToken,
      nextInvitedAt,
      existingUser.id,
    );

    return {
      user: getUserRecordByIdFull(existingUser.id),
      created: false,
      linked_existing: !existingLinkedEntityId,
      invite_required: isInvited,
      already_active: !isInvited,
    } as const;
  }

  const activationToken = createInviteToken();
  const invitedAt = new Date().toISOString();
  const result = db
    .prepare(
      `
        INSERT INTO users (
          email,
          password,
          name,
          role,
          client_id,
          freelancer_id,
          agency_id,
          status,
          access_status,
          activation_token,
          invited_at
        )
        VALUES (?, ?, ?, ?, ?, ?, ?, 'offline', 'invited', ?, ?)
      `,
    )
    .run(
      normalizedEmail,
      hashPassword(randomBytes(18).toString("hex")),
      normalizedName,
      desiredRole,
      entityType === "client" ? entityId : null,
      entityType === "freelancer" ? entityId : null,
      agencyId,
      activationToken,
      invitedAt,
    );

  return {
    user: getUserRecordByIdFull(Number(result.lastInsertRowid)),
    created: true,
    linked_existing: false,
    invite_required: true,
    already_active: false,
  } as const;
};

const resetPortalInviteForUser = (userId: number) => {
  const invitedAt = new Date().toISOString();
  const activationToken = createInviteToken();

  db.prepare(
    `
      UPDATE users
      SET activation_token = ?, invited_at = ?
      WHERE id = ?
    `,
  ).run(activationToken, invitedAt, userId);

  return getUserRecordByIdFull(userId);
};

const createPasswordResetToken = () => randomBytes(24).toString("hex");

const clearExpiredPasswordResetTokens = () => {
  db.prepare(
    "DELETE FROM password_reset_tokens WHERE datetime(expires_at) <= datetime('now')",
  ).run();
};

const invalidatePasswordResetTokensForUser = (userId: number) => {
  db.prepare(
    "UPDATE password_reset_tokens SET used_at = COALESCE(used_at, ?) WHERE user_id = ? AND used_at IS NULL",
  ).run(new Date().toISOString(), userId);
};

const getLatestActivePasswordResetTokenForUser = (userId: number) => {
  clearExpiredPasswordResetTokens();

  return db
    .prepare(
      `
        SELECT id, token, expires_at, created_at
        FROM password_reset_tokens
        WHERE user_id = ? AND used_at IS NULL AND datetime(expires_at) > datetime('now')
        ORDER BY datetime(created_at) DESC, id DESC
        LIMIT 1
      `,
    )
    .get(userId) as
    | {
        id: number;
        token: string;
        expires_at: string;
        created_at: string;
      }
    | undefined;
};

const getPasswordResetRecordByToken = (token: string) => {
  clearExpiredPasswordResetTokens();

  return db
    .prepare(
      `
        SELECT
          password_reset_tokens.id,
          password_reset_tokens.token,
          password_reset_tokens.user_id,
          password_reset_tokens.requested_email,
          password_reset_tokens.expires_at,
          password_reset_tokens.used_at,
          password_reset_tokens.agency_id,
          users.email,
          users.name,
          users.role,
          users.status,
          users.password,
          users.access_status
        FROM password_reset_tokens
        INNER JOIN users ON users.id = password_reset_tokens.user_id
        WHERE
          password_reset_tokens.token = ?
          AND password_reset_tokens.used_at IS NULL
          AND datetime(password_reset_tokens.expires_at) > datetime('now')
          AND COALESCE(users.access_status, 'active') = 'active'
      `,
    )
    .get(token) as
    | {
        id: number;
        token: string;
        user_id: number;
        requested_email: string;
        expires_at: string;
        used_at: string | null;
        agency_id: number | null;
        email: string;
        name: string;
        role: string;
        status: "online" | "meeting" | "offline";
        password: string;
        access_status: UserAccessStatus | null;
      }
    | undefined;
};

const shouldThrottlePasswordResetResend = (createdAt?: string | null) => {
  const parsedDate = parseStoredUtcDate(createdAt);

  if (!parsedDate) {
    return false;
  }

  return Date.now() - parsedDate.getTime() < PASSWORD_RESET_RESEND_COOLDOWN_MS;
};

const createIntegrationSecret = () => randomBytes(12).toString("hex");

const serializeIntegrationScopes = (scopes: string[]) => JSON.stringify(scopes);

const parseIntegrationScopes = (value?: string | null) => {
  if (!value) {
    return [];
  }

  try {
    const parsed = JSON.parse(value) as unknown;

    if (!Array.isArray(parsed)) {
      return [];
    }

    return parsed
      .filter((item): item is string => typeof item === "string" && item.trim().length > 0)
      .map((item) => item.trim());
  } catch {
    return [];
  }
};

const parseIntegrationPayload = (value?: string | null) => {
  if (!value) {
    return null;
  }

  try {
    const parsed = JSON.parse(value) as unknown;
    return parsed && typeof parsed === "object" && !Array.isArray(parsed)
      ? (parsed as Record<string, unknown>)
      : null;
  } catch {
    return null;
  }
};

const buildIntegrationWebhookPath = (secret?: string | null) =>
  secret ? `/api/integrations/webhooks/${secret}` : null;

const getIntegrationTemplateByKey = (integrationKey: IntegrationKey) =>
  integrationTemplates.find((template) => template.key === integrationKey) || null;

type IntegrationRecord = {
  id: number;
  key: IntegrationKey;
  name: string;
  category: IntegrationCategory;
  connection_mode: IntegrationConnectionMode;
  direction: IntegrationDirection;
  status: IntegrationStatus;
  description: string | null;
  sync_enabled: number;
  auto_capture_leads: number;
  supports_webhook: number;
  supports_lead_capture: number;
  account_label: string | null;
  endpoint_url: string | null;
  api_key: string | null;
  access_token: string | null;
  email: string | null;
  account_id: string | null;
  webhook_secret: string | null;
  notes: string | null;
  scopes: string | null;
  last_tested_at: string | null;
  last_synced_at: string | null;
  agency_id: number;
  created_at: string;
  updated_at: string;
};

type ClientIntegrationRecord = {
  id: number;
  client_id: number;
  integration_key: IntegrationKey;
  integration_name: string;
  status: IntegrationStatus;
  account_label: string | null;
  endpoint_url: string | null;
  api_key: string | null;
  access_token: string | null;
  email: string | null;
  account_id: string | null;
  notes: string | null;
  sync_enabled: number;
  last_tested_at: string | null;
  last_synced_at: string | null;
  agency_id: number;
  created_at: string;
  updated_at: string;
};

type CalendarEventRecord = {
  id: number;
  title: string;
  description: string | null;
  event_kind: CalendarEventKind;
  source_type: CalendarEventSourceType;
  source_ref: string;
  status: CalendarEventStatus;
  start_at: string;
  end_at: string | null;
  action_tab: AppSection;
  action_entity_id: number | null;
  client_id: number | null;
  project_id: number | null;
  integration_key: IntegrationKey | null;
  agency_id: number;
  created_at: string;
  updated_at: string;
};

type NotificationRecord = {
  id: number;
  type: NotificationType;
  severity: NotificationSeverity;
  title: string;
  message: string;
  is_read: number;
  read_at: string | null;
  action_tab: AppSection;
  action_entity_type: string | null;
  action_entity_id: number | null;
  source_type: string | null;
  source_ref: string | null;
  dedupe_key: string | null;
  agency_id: number;
  created_at: string;
  updated_at: string;
};

const serializeIntegration = (integration: IntegrationRecord) => ({
  id: integration.id,
  key: integration.key,
  name: integration.name,
  category: integration.category,
  connection_mode: integration.connection_mode,
  direction: integration.direction,
  status: integration.status,
  description: integration.description || "",
  sync_enabled: integration.sync_enabled === 1,
  auto_capture_leads: integration.auto_capture_leads === 1,
  supports_webhook: integration.supports_webhook === 1,
  supports_lead_capture: integration.supports_lead_capture === 1,
  account_label: integration.account_label,
  endpoint_url: integration.endpoint_url,
  api_key: integration.api_key,
  access_token: integration.access_token,
  email: integration.email,
  account_id: integration.account_id,
  webhook_secret: integration.webhook_secret,
  webhook_path:
    integration.supports_webhook === 1
      ? buildIntegrationWebhookPath(integration.webhook_secret)
      : null,
  notes: integration.notes,
  scopes: parseIntegrationScopes(integration.scopes),
  last_tested_at: integration.last_tested_at,
  last_synced_at: integration.last_synced_at,
  created_at: integration.created_at,
  updated_at: integration.updated_at,
});

const serializeClientIntegration = (
  row: ClientIntegrationRecord & { client_name: string },
) => ({
  id: row.id,
  client_id: row.client_id,
  client_name: row.client_name,
  integration_key: row.integration_key,
  integration_name: row.integration_name,
  status: row.status,
  account_label: row.account_label,
  endpoint_url: row.endpoint_url,
  api_key: row.api_key,
  access_token: row.access_token,
  email: row.email,
  account_id: row.account_id,
  notes: row.notes,
  sync_enabled: row.sync_enabled === 1,
  last_tested_at: row.last_tested_at,
  last_synced_at: row.last_synced_at,
  created_at: row.created_at,
  updated_at: row.updated_at,
});

const serializeCalendarEvent = (row: CalendarEventRecord) => ({
  id: row.id,
  title: row.title,
  description: row.description,
  event_kind: row.event_kind,
  source_type: row.source_type,
  source_ref: row.source_ref,
  status: row.status,
  start_at: row.start_at,
  end_at: row.end_at,
  action_tab: row.action_tab,
  action_entity_id: row.action_entity_id,
  client_id: row.client_id,
  project_id: row.project_id,
  integration_key: row.integration_key,
  created_at: row.created_at,
  updated_at: row.updated_at,
});

const serializeNotification = (row: NotificationRecord) => ({
  id: row.id,
  type: row.type,
  severity: row.severity,
  title: row.title,
  message: row.message,
  is_read: row.is_read === 1,
  read_at: row.read_at,
  action_tab: row.action_tab,
  action_entity_type: row.action_entity_type,
  action_entity_id: row.action_entity_id,
  source_type: row.source_type,
  source_ref: row.source_ref,
  dedupe_key: row.dedupe_key,
  created_at: row.created_at,
  updated_at: row.updated_at,
});

const ensureIntegrationCatalog = (agencyId: number) => {
  const insertIntegration = db.prepare(
    `
      INSERT OR IGNORE INTO integrations (
        key,
        name,
        category,
        connection_mode,
        direction,
        status,
        description,
        sync_enabled,
        auto_capture_leads,
        supports_webhook,
        supports_lead_capture,
        webhook_secret,
        scopes,
        agency_id
      )
      VALUES (?, ?, ?, ?, ?, 'disconnected', ?, ?, ?, ?, ?, ?, ?, ?)
    `,
  );

  integrationTemplates.forEach((template) => {
    insertIntegration.run(
      template.key,
      template.name,
      template.category,
      template.connectionMode,
      template.direction,
      template.description,
      template.defaultSyncEnabled ? 1 : 0,
      template.defaultAutoCaptureLeads ? 1 : 0,
      template.supportsWebhook ? 1 : 0,
      template.supportsLeadCapture ? 1 : 0,
      template.supportsWebhook ? createIntegrationSecret() : null,
      serializeIntegrationScopes(template.scopes),
      agencyId,
    );
  });
};

const getIntegrationRecordById = (integrationId: number) =>
  db.prepare("SELECT * FROM integrations WHERE id = ?").get(integrationId) as
    | IntegrationRecord
    | undefined;

const getIntegrationRecordByKey = (agencyId: number, integrationKey: IntegrationKey) =>
  db
    .prepare(
      `
        SELECT *
        FROM integrations
        WHERE agency_id = ? AND key = ?
        LIMIT 1
      `,
    )
    .get(agencyId, integrationKey) as IntegrationRecord | undefined;

const getIntegrationRecordByWebhookSecret = (secret: string) =>
  db.prepare("SELECT * FROM integrations WHERE webhook_secret = ?").get(secret) as
    | IntegrationRecord
    | undefined;

const getIntegrationsByAgencyId = (agencyId: number) => {
  ensureIntegrationCatalog(agencyId);

  return (
    db
      .prepare(
        `
          SELECT *
          FROM integrations
          WHERE agency_id = ?
          ORDER BY id ASC
        `,
      )
      .all(agencyId) as IntegrationRecord[]
  ).map(serializeIntegration);
};

const getClientIntegrationRecordById = (clientIntegrationId: number) =>
  db.prepare("SELECT * FROM client_integrations WHERE id = ?").get(clientIntegrationId) as
    | ClientIntegrationRecord
    | undefined;

const getClientIntegrationRecordByClientAndKey = (
  clientId: number,
  integrationKey: IntegrationKey,
) =>
  db
    .prepare(
      `
        SELECT *
        FROM client_integrations
        WHERE client_id = ? AND integration_key = ?
        LIMIT 1
      `,
    )
    .get(clientId, integrationKey) as ClientIntegrationRecord | undefined;

const getClientIntegrationConnections = (agencyId: number) =>
  (
    db
      .prepare(
        `
          SELECT
          client_integrations.*,
          clients.company as client_name
        FROM client_integrations
        INNER JOIN clients ON clients.id = client_integrations.client_id
        WHERE client_integrations.agency_id = ? AND clients.archived_at IS NULL
        ORDER BY datetime(client_integrations.updated_at) DESC, client_integrations.id DESC
      `,
      )
      .all(agencyId) as Array<ClientIntegrationRecord & { client_name: string }>
  ).map(serializeClientIntegration);

const getClientIntegrationConnectionById = (clientIntegrationId: number) => {
  const row = db
    .prepare(
      `
        SELECT
          client_integrations.*,
          clients.company as client_name
        FROM client_integrations
        INNER JOIN clients ON clients.id = client_integrations.client_id
        WHERE client_integrations.id = ?
        LIMIT 1
      `,
    )
    .get(clientIntegrationId) as (ClientIntegrationRecord & { client_name: string }) | undefined;

  return row ? serializeClientIntegration(row) : null;
};

const getClientConnectionOptions = (agencyId: number) =>
  db
    .prepare(
      `
        SELECT id, company
        FROM clients
        WHERE agency_id = ? AND archived_at IS NULL
        ORDER BY lower(company) ASC, id ASC
      `,
    )
    .all(agencyId) as Array<{ id: number; company: string }>;

const getIntegrationEvents = ({
  agencyId,
  integrationId = null,
  limit,
}: {
  agencyId: number;
  integrationId?: number | null;
  limit: number;
}) => {
  const conditions = ["integration_events.agency_id = ?"];
  const params: Array<number> = [agencyId];

  if (integrationId) {
    conditions.push("integration_events.integration_id = ?");
    params.push(integrationId);
  }

  return (
    db
      .prepare(
        `
          SELECT
            integration_events.id,
            integration_events.integration_id,
            integrations.name as integration_name,
            integrations.key as integration_key,
            integration_events.direction,
            integration_events.event_type,
            integration_events.status,
            integration_events.summary,
            integration_events.payload,
            integration_events.created_at
          FROM integration_events
          INNER JOIN integrations ON integrations.id = integration_events.integration_id
          WHERE ${conditions.join(" AND ")}
          ORDER BY datetime(integration_events.created_at) DESC, integration_events.id DESC
          LIMIT ?
        `,
      )
      .all(...params, limit) as Array<{
      id: number;
      integration_id: number;
      integration_name: string;
      integration_key: IntegrationKey;
      direction: IntegrationEventDirection;
      event_type: string;
      status: IntegrationEventStatus;
      summary: string;
      payload: string | null;
      created_at: string;
    }>
  ).map((row) => ({
    ...row,
    payload: parseIntegrationPayload(row.payload),
  }));
};

const createIntegrationEvent = ({
  integrationId,
  direction,
  eventType,
  status,
  summary,
  payload = null,
  agencyId,
}: {
  integrationId: number;
  direction: IntegrationEventDirection;
  eventType: string;
  status: IntegrationEventStatus;
  summary: string;
  payload?: Record<string, unknown> | null;
  agencyId: number;
}) => {
  db.prepare(
    `
      INSERT INTO integration_events (
        integration_id,
        direction,
        event_type,
        status,
        summary,
        payload,
        agency_id
      )
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `,
  ).run(
    integrationId,
    direction,
    eventType,
    status,
    summary,
    payload ? JSON.stringify(payload) : null,
    agencyId,
  );
};

const integrationHasConnectionData = (integration: IntegrationRecord) =>
  Boolean(
    (integration.endpoint_url && integration.endpoint_url.trim()) ||
      (integration.api_key && integration.api_key.trim()) ||
      (integration.access_token && integration.access_token.trim()) ||
      (integration.email && integration.email.trim()) ||
      (integration.account_id && integration.account_id.trim()) ||
      (integration.supports_webhook === 1 && integration.webhook_secret),
  );

const clientIntegrationHasConnectionData = (integration: ClientIntegrationRecord) =>
  Boolean(
    (integration.endpoint_url && integration.endpoint_url.trim()) ||
      (integration.api_key && integration.api_key.trim()) ||
      (integration.access_token && integration.access_token.trim()) ||
      (integration.email && integration.email.trim()) ||
      (integration.account_id && integration.account_id.trim()),
  );

const getCalendarEvents = ({
  agencyId,
  limit = 50,
  actionTab = null,
  sourceType = null,
}: {
  agencyId: number;
  limit?: number;
  actionTab?: AppSection | null;
  sourceType?: CalendarEventSourceType | null;
}) => {
  const conditions = [
    "agency_id = ?",
    "status != 'cancelled'",
    "(status != 'completed' OR datetime(start_at) >= datetime('now', '-1 day'))",
  ];
  const params: Array<string | number> = [agencyId];

  if (actionTab) {
    conditions.push("action_tab = ?");
    params.push(actionTab);
  }

  if (sourceType) {
    conditions.push("source_type = ?");
    params.push(sourceType);
  }

  return (
    db
      .prepare(
        `
          SELECT *
          FROM calendar_events
          WHERE ${conditions.join(" AND ")}
          ORDER BY datetime(start_at) ASC, id ASC
          LIMIT ?
        `,
      )
      .all(...params, limit) as CalendarEventRecord[]
  ).map(serializeCalendarEvent);
};

const getCalendarEventById = (calendarEventId: number) =>
  db.prepare("SELECT * FROM calendar_events WHERE id = ?").get(calendarEventId) as
    | CalendarEventRecord
    | undefined;

const upsertCalendarEvent = ({
  title,
  description = null,
  eventKind,
  sourceType,
  sourceRef,
  status,
  startAt,
  endAt = null,
  actionTab,
  actionEntityId = null,
  clientId = null,
  projectId = null,
  integrationKey = null,
  agencyId,
}: {
  title: string;
  description?: string | null;
  eventKind: CalendarEventKind;
  sourceType: CalendarEventSourceType;
  sourceRef: string;
  status: CalendarEventStatus;
  startAt: string;
  endAt?: string | null;
  actionTab: AppSection;
  actionEntityId?: number | null;
  clientId?: number | null;
  projectId?: number | null;
  integrationKey?: IntegrationKey | null;
  agencyId: number;
}) => {
  db.prepare(
    `
      INSERT INTO calendar_events (
        title,
        description,
        event_kind,
        source_type,
        source_ref,
        status,
        start_at,
        end_at,
        action_tab,
        action_entity_id,
        client_id,
        project_id,
        integration_key,
        agency_id
      )
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT (agency_id, source_type, source_ref, event_kind) DO UPDATE SET
        title = excluded.title,
        description = excluded.description,
        status = excluded.status,
        start_at = excluded.start_at,
        end_at = excluded.end_at,
        action_tab = excluded.action_tab,
        action_entity_id = excluded.action_entity_id,
        client_id = excluded.client_id,
        project_id = excluded.project_id,
        integration_key = excluded.integration_key,
        updated_at = CURRENT_TIMESTAMP
    `,
  ).run(
    title,
    description,
    eventKind,
    sourceType,
    sourceRef,
    status,
    startAt,
    endAt,
    actionTab,
    actionEntityId,
    clientId,
    projectId,
    integrationKey,
    agencyId,
  );

  return (
    db
      .prepare(
        `
          SELECT *
          FROM calendar_events
          WHERE agency_id = ? AND source_type = ? AND source_ref = ? AND event_kind = ?
          LIMIT 1
        `,
      )
      .get(agencyId, sourceType, sourceRef, eventKind) as CalendarEventRecord | undefined
  );
};

const getNotifications = ({
  agencyId,
  limit = 20,
  unreadOnly = false,
}: {
  agencyId: number;
  limit?: number;
  unreadOnly?: boolean;
}) => {
  const conditions = ["agency_id = ?"];
  const params: Array<string | number> = [agencyId];

  if (unreadOnly) {
    conditions.push("is_read = 0");
  }

  return (
    db
      .prepare(
        `
          SELECT *
          FROM notifications
          WHERE ${conditions.join(" AND ")}
          ORDER BY is_read ASC, datetime(created_at) DESC, id DESC
          LIMIT ?
        `,
      )
      .all(...params, limit) as NotificationRecord[]
  ).map(serializeNotification);
};

const getNotificationById = (notificationId: number) =>
  db.prepare("SELECT * FROM notifications WHERE id = ?").get(notificationId) as
    | NotificationRecord
    | undefined;

const upsertNotification = ({
  type,
  severity,
  title,
  message,
  actionTab,
  actionEntityType = null,
  actionEntityId = null,
  sourceType = null,
  sourceRef = null,
  dedupeKey = null,
  agencyId,
  markUnread = false,
}: {
  type: NotificationType;
  severity: NotificationSeverity;
  title: string;
  message: string;
  actionTab: AppSection;
  actionEntityType?: string | null;
  actionEntityId?: number | null;
  sourceType?: string | null;
  sourceRef?: string | null;
  dedupeKey?: string | null;
  agencyId: number;
  markUnread?: boolean;
}) => {
  if (dedupeKey) {
    db.prepare(
      `
        INSERT INTO notifications (
          type,
          severity,
          title,
          message,
          is_read,
          read_at,
          action_tab,
          action_entity_type,
          action_entity_id,
          source_type,
          source_ref,
          dedupe_key,
          agency_id
        )
        VALUES (?, ?, ?, ?, 0, NULL, ?, ?, ?, ?, ?, ?, ?)
        ON CONFLICT (agency_id, dedupe_key) DO UPDATE SET
          type = excluded.type,
          severity = excluded.severity,
          title = excluded.title,
          message = excluded.message,
          action_tab = excluded.action_tab,
          action_entity_type = excluded.action_entity_type,
          action_entity_id = excluded.action_entity_id,
          source_type = excluded.source_type,
          source_ref = excluded.source_ref,
          is_read = CASE WHEN ? = 1 THEN 0 ELSE notifications.is_read END,
          read_at = CASE WHEN ? = 1 THEN NULL ELSE notifications.read_at END,
          updated_at = CURRENT_TIMESTAMP
      `,
    ).run(
      type,
      severity,
      title,
      message,
      actionTab,
      actionEntityType,
      actionEntityId,
      sourceType,
      sourceRef,
      dedupeKey,
      agencyId,
      markUnread ? 1 : 0,
      markUnread ? 1 : 0,
    );

    return (
      db
        .prepare(
          `
            SELECT *
            FROM notifications
            WHERE agency_id = ? AND dedupe_key = ?
            LIMIT 1
          `,
        )
        .get(agencyId, dedupeKey) as NotificationRecord | undefined
    );
  }

  const result = db
    .prepare(
      `
        INSERT INTO notifications (
          type,
          severity,
          title,
          message,
          is_read,
          read_at,
          action_tab,
          action_entity_type,
          action_entity_id,
          source_type,
          source_ref,
          dedupe_key,
          agency_id
        )
        VALUES (?, ?, ?, ?, ?, NULL, ?, ?, ?, ?, ?, NULL, ?)
      `,
    )
    .run(
      type,
      severity,
      title,
      message,
      0,
      actionTab,
      actionEntityType,
      actionEntityId,
      sourceType,
      sourceRef,
      agencyId,
    );

  return getNotificationById(Number(result.lastInsertRowid));
};

const markNotificationReadByDedupeKey = (agencyId: number, dedupeKey: string) => {
  db.prepare(
    `
      UPDATE notifications
      SET is_read = 1, read_at = COALESCE(read_at, CURRENT_TIMESTAMP), updated_at = CURRENT_TIMESTAMP
      WHERE agency_id = ? AND dedupe_key = ?
    `,
  ).run(agencyId, dedupeKey);
};

const touchConnectedIntegrationSync = ({
  agencyId,
  integrationKey,
  summary,
  payload = null,
  direction,
  eventType,
  status = "success",
}: {
  agencyId: number;
  integrationKey: IntegrationKey;
  summary: string;
  payload?: Record<string, unknown> | null;
  direction: IntegrationEventDirection;
  eventType: string;
  status?: IntegrationEventStatus;
}) => {
  const integration = getIntegrationRecordByKey(agencyId, integrationKey);

  if (!integration || integration.status !== "connected" || integration.sync_enabled !== 1) {
    return;
  }

  db.prepare(
    `
      UPDATE integrations
      SET last_synced_at = CURRENT_TIMESTAMP, updated_at = CURRENT_TIMESTAMP
      WHERE id = ?
    `,
  ).run(integration.id);

  createIntegrationEvent({
    integrationId: integration.id,
    direction,
    eventType,
    status,
    summary,
    payload,
    agencyId,
  });
};

const syncTaskCalendarEvent = (taskId: number) => {
  const task = getTaskRecordByIdFull(taskId);

  if (!task) {
    return;
  }

  const startDate = parseDateTimeInput(task.due_date, 10);

  if (!startDate) {
    return;
  }

  const settings = getAppSettings(task.agency_id);
  const dedupeKey = `task:${task.id}:due`;

  if (!settings.task_reminders || task.status === "done" || isArchivedRecord(task)) {
    upsertCalendarEvent({
      title: task.title,
      description: task.description || `Entrega operativa del proyecto ${task.project_name || "sin proyecto"}.`,
      eventKind: "deadline",
      sourceType: "task",
      sourceRef: String(task.id),
      status: "cancelled",
      startAt: startDate.toISOString(),
      endAt: addMinutes(startDate, 60).toISOString(),
      actionTab: "tasks",
      actionEntityId: task.id,
      clientId: task.client_id,
      projectId: task.project_id,
      agencyId: task.agency_id,
    });
    markNotificationReadByDedupeKey(task.agency_id, dedupeKey);
  } else {
    upsertCalendarEvent({
      title: task.title,
      description: task.description || `Entrega operativa del proyecto ${task.project_name || "sin proyecto"}.`,
      eventKind: "deadline",
      sourceType: "task",
      sourceRef: String(task.id),
      status: "scheduled",
      startAt: startDate.toISOString(),
      endAt: addMinutes(startDate, 60).toISOString(),
      actionTab: "tasks",
      actionEntityId: task.id,
      clientId: task.client_id,
      projectId: task.project_id,
      agencyId: task.agency_id,
    });

    const daysUntil = getDaysDifferenceFromToday(task.due_date);

    if (daysUntil !== null && daysUntil <= 3) {
      const severity: NotificationSeverity =
        daysUntil < 0 ? "critical" : task.priority === "high" ? "warning" : "info";
      const title =
        daysUntil < 0
          ? `Tarea vencida: ${task.title}`
          : daysUntil === 0
            ? `Tarea para hoy: ${task.title}`
            : `Tarea próxima: ${task.title}`;
      const message =
        daysUntil < 0
          ? `${task.title} venció y sigue pendiente en ${task.project_name || "tu proyecto"}.`
          : `${task.title} vence ${daysUntil === 0 ? "hoy" : `en ${daysUntil} ${daysUntil === 1 ? "día" : "días"}`}.`;

      upsertNotification({
        type: "task_due",
        severity,
        title,
        message,
        actionTab: "tasks",
        actionEntityType: "task",
        actionEntityId: task.id,
        sourceType: "task",
        sourceRef: String(task.id),
        dedupeKey,
        agencyId: task.agency_id,
      });
    } else {
      markNotificationReadByDedupeKey(task.agency_id, dedupeKey);
    }
  }

};

const syncLeadFollowUpCalendarEvent = (leadId: number) => {
  const lead = getLeadRecordById(leadId);

  if (!lead || !lead.agency_id) {
    return;
  }

  const dedupeKey = `lead:${lead.id}:followup`;

  if (isArchivedRecord(lead) || !lead.next_contact_date || ["closed", "lost"].includes(lead.status)) {
    upsertCalendarEvent({
      title: `Seguimiento ${lead.company || lead.name}`,
      description: lead.next_action || "Seguimiento comercial archivado.",
      eventKind: "followup",
      sourceType: "lead_followup",
      sourceRef: String(lead.id),
      status: "cancelled",
      startAt: new Date().toISOString(),
      actionTab: "leads",
      actionEntityId: lead.id,
      agencyId: lead.agency_id,
    });
    markNotificationReadByDedupeKey(lead.agency_id, dedupeKey);
    return;
  }

  const startDate = parseDateTimeInput(lead.next_contact_date, 11);

  if (!startDate) {
    return;
  }

  upsertCalendarEvent({
    title: `Seguimiento: ${lead.company || lead.name}`,
    description: lead.next_action || "Revisar siguiente paso comercial.",
    eventKind: "followup",
    sourceType: "lead_followup",
    sourceRef: String(lead.id),
    status: "scheduled",
    startAt: startDate.toISOString(),
    endAt: addMinutes(startDate, 30).toISOString(),
    actionTab: "leads",
    actionEntityId: lead.id,
    agencyId: lead.agency_id,
  });

  const daysUntil = getDaysDifferenceFromToday(lead.next_contact_date);

  if (daysUntil !== null && daysUntil <= 3) {
    upsertNotification({
      type: "lead_followup",
      severity: daysUntil < 0 ? "critical" : "warning",
      title:
        daysUntil < 0
          ? `Seguimiento vencido: ${lead.company || lead.name}`
          : daysUntil === 0
            ? `Seguimiento para hoy: ${lead.company || lead.name}`
            : `Seguimiento próximo: ${lead.company || lead.name}`,
      message:
        lead.next_action && lead.next_action.trim().length > 0
          ? lead.next_action
          : "Revisar siguiente acción comercial pendiente.",
      actionTab: "leads",
      actionEntityType: "lead",
      actionEntityId: lead.id,
      sourceType: "lead_followup",
      sourceRef: String(lead.id),
      dedupeKey,
      agencyId: lead.agency_id,
    });
  } else {
    markNotificationReadByDedupeKey(lead.agency_id, dedupeKey);
  }

};

const syncClientOnboardingCalendarEvent = (onboardingId: number) => {
  const onboarding = getClientOnboardingById(onboardingId);

  if (!onboarding || !onboarding.agency_id || !onboarding.target_launch_date) {
    return;
  }

  const client = getClientRecordById(onboarding.client_id);
  const project = onboarding.project_id ? getProjectRecordByIdFull(onboarding.project_id) : null;
  const startDate = parseDateTimeInput(onboarding.target_launch_date, 12);

  if (!startDate) {
    return;
  }

  const isArchived = isArchivedRecord(client) || isArchivedRecord(project);

  if (isArchived) {
    upsertCalendarEvent({
      title: `Lanzamiento onboarding: ${client?.company || `Cliente #${onboarding.client_id}`}`,
      description: "Onboarding archivado.",
      eventKind: "launch",
      sourceType: "client_onboarding",
      sourceRef: String(onboarding.id),
      status: "cancelled",
      startAt: startDate.toISOString(),
      endAt: addMinutes(startDate, 90).toISOString(),
      actionTab: "clients",
      actionEntityId: onboarding.client_id,
      clientId: onboarding.client_id,
      projectId: onboarding.project_id,
      agencyId: onboarding.agency_id,
    });
    markNotificationReadByDedupeKey(onboarding.agency_id, `client_onboarding:${onboarding.id}:launch`);
    return;
  }

  upsertCalendarEvent({
    title: `Lanzamiento onboarding: ${client?.company || `Cliente #${onboarding.client_id}`}`,
    description: "Revisión de hitos finales y salida a producción.",
    eventKind: "launch",
    sourceType: "client_onboarding",
    sourceRef: String(onboarding.id),
    status: onboarding.status === "completed" ? "completed" : "scheduled",
    startAt: startDate.toISOString(),
    endAt: addMinutes(startDate, 90).toISOString(),
    actionTab: "clients",
    actionEntityId: onboarding.client_id,
    clientId: onboarding.client_id,
    projectId: onboarding.project_id,
    agencyId: onboarding.agency_id,
  });

  const daysUntil = getDaysDifferenceFromToday(onboarding.target_launch_date);
  const dedupeKey = `client_onboarding:${onboarding.id}:launch`;

  if (onboarding.status === "completed") {
    markNotificationReadByDedupeKey(onboarding.agency_id, dedupeKey);
  } else if (daysUntil !== null && daysUntil <= 5) {
    upsertNotification({
      type: "client_onboarding",
      severity: daysUntil < 0 ? "critical" : "info",
      title:
        daysUntil < 0
          ? `Onboarding vencido: ${client?.company || onboarding.client_id}`
          : `Lanzamiento próximo: ${client?.company || onboarding.client_id}`,
      message:
        daysUntil < 0
          ? "La fecha objetivo de lanzamiento ya pasó y el onboarding sigue abierto."
          : `Quedan ${daysUntil} ${daysUntil === 1 ? "día" : "días"} para la fecha objetivo de lanzamiento.`,
      actionTab: "clients",
      actionEntityType: "client_onboarding",
      actionEntityId: onboarding.id,
      sourceType: "client_onboarding",
      sourceRef: String(onboarding.id),
      dedupeKey,
      agencyId: onboarding.agency_id,
    });
  } else {
    markNotificationReadByDedupeKey(onboarding.agency_id, dedupeKey);
  }

};

const syncAgencyOperationalSignals = (agencyId: number) => {
  const taskIds = db
    .prepare("SELECT id FROM tasks WHERE agency_id = ? ORDER BY id ASC")
    .all(agencyId) as Array<{ id: number }>;
  const leadIds = db
    .prepare("SELECT id FROM leads WHERE agency_id = ? ORDER BY id ASC")
    .all(agencyId) as Array<{ id: number }>;
  const onboardingIds = db
    .prepare("SELECT id FROM client_onboardings WHERE agency_id = ? ORDER BY id ASC")
    .all(agencyId) as Array<{ id: number }>;

  taskIds.forEach((task) => {
    syncTaskCalendarEvent(task.id);
  });

  leadIds.forEach((lead) => {
    syncLeadFollowUpCalendarEvent(lead.id);
  });

  onboardingIds.forEach((onboarding) => {
    syncClientOnboardingCalendarEvent(onboarding.id);
  });
};

const isPlainObject = (value: unknown): value is Record<string, unknown> =>
  Boolean(value) && typeof value === "object" && !Array.isArray(value);

const getPayloadValue = (payload: Record<string, unknown>, pathValue: string) =>
  pathValue.split(".").reduce<unknown>((current, key) => {
    if (!isPlainObject(current)) {
      return undefined;
    }

    return current[key];
  }, payload);

const getPayloadString = (payload: Record<string, unknown>, paths: string[]) => {
  for (const pathValue of paths) {
    const value = getPayloadValue(payload, pathValue);

    if (typeof value === "string" && value.trim().length > 0) {
      return value.trim();
    }
  }

  return null;
};

const getPayloadNumber = (payload: Record<string, unknown>, paths: string[]) => {
  for (const pathValue of paths) {
    const value = getPayloadValue(payload, pathValue);

    if (typeof value === "number" && Number.isFinite(value)) {
      return value;
    }

    if (typeof value === "string" && value.trim().length > 0) {
      const parsed = Number(value);

      if (Number.isFinite(parsed)) {
        return parsed;
      }
    }
  }

  return 0;
};

const resolveIntegrationTargetEntity = (
  integration: IntegrationRecord,
  payload: Record<string, unknown>,
) => {
  const explicitEntity = getPayloadString(payload, ["entity", "type"]);

  if (explicitEntity && ["client", "customer", "company"].includes(explicitEntity.toLowerCase())) {
    return "client" as const;
  }

  if (integration.key === "external_crm") {
    const lifecycle = getPayloadString(payload, ["stage", "status", "lifecycle", "lifecycle_stage"]);

    if (lifecycle && ["client", "customer", "won", "closed_won"].includes(lifecycle.toLowerCase())) {
      return "client" as const;
    }
  }

  return "lead" as const;
};

const getProjectById = (projectId: number) =>
  db
    .prepare("SELECT id, agency_id, archived_at FROM projects WHERE id = ?")
    .get(projectId) as { id: number; agency_id: number; archived_at: string | null } | undefined;

const getClientById = (clientId: number) =>
  db
    .prepare("SELECT id, agency_id, archived_at FROM clients WHERE id = ?")
    .get(clientId) as { id: number; agency_id: number; archived_at: string | null } | undefined;

const getDefaultProjectForAgency = (agencyId: number) =>
  db
    .prepare(
      "SELECT id, agency_id, archived_at FROM projects WHERE agency_id = ? AND archived_at IS NULL ORDER BY id LIMIT 1",
    )
    .get(agencyId) as { id: number; agency_id: number; archived_at: string | null } | undefined;

const getLeadRecordById = (leadId: number) =>
  db.prepare("SELECT * FROM leads WHERE id = ?").get(leadId) as
    | {
        id: number;
        name: string;
        company: string | null;
        email: string | null;
        phone: string | null;
        source: string | null;
        service: string | null;
        budget: number;
        status: "new" | "contacted" | "meeting" | "diagnosis" | "proposal" | "negotiation" | "closed" | "lost";
        assigned_to: number | null;
        next_action: string | null;
        next_contact_date: string | null;
        last_contacted_at: string | null;
        archived_at: string | null;
        agency_id: number | null;
        created_at: string;
      }
    | undefined;

const getLeadRecordByEmail = (agencyId: number, email: string, includeArchived = false) =>
  db
    .prepare(
      `
        SELECT *
        FROM leads
        WHERE agency_id = ? AND lower(trim(COALESCE(email, ''))) = lower(trim(?))
          AND (${includeArchived ? "1 = 1" : "archived_at IS NULL"})
        ORDER BY id ASC
        LIMIT 1
      `,
    )
    .get(agencyId, email) as
    | {
        id: number;
        name: string;
        company: string | null;
        email: string | null;
        phone: string | null;
        source: string | null;
        service: string | null;
        budget: number;
        status: "new" | "contacted" | "meeting" | "diagnosis" | "proposal" | "negotiation" | "closed" | "lost";
        assigned_to: number | null;
        next_action: string | null;
        next_contact_date: string | null;
        last_contacted_at: string | null;
        archived_at: string | null;
        agency_id: number | null;
        created_at: string;
      }
    | undefined;

const getLeadNotes = (leadId: number) =>
  db
    .prepare(
      `
        SELECT id, lead_id, author_id, author_name, type, content, created_at
        FROM lead_notes
        WHERE lead_id = ?
        ORDER BY datetime(created_at) DESC, id DESC
      `,
    )
    .all(leadId) as Array<{
    id: number;
    lead_id: number;
    author_id: number | null;
    author_name: string;
    type: "note" | "call" | "email" | "meeting" | "whatsapp";
    content: string;
    created_at: string;
  }>;

const getTaskRecordByIdFull = (taskId: number) =>
  db
    .prepare(
      `
        SELECT
          tasks.*,
          COALESCE(tasks.description, '') as description,
          users.name as assigned_name,
          users.access_status as assignee_access_status,
          projects.name as project_name,
          projects.client_id as client_id,
          clients.company as client_name
        FROM tasks
        LEFT JOIN users ON users.id = tasks.assigned_to
        LEFT JOIN projects ON projects.id = tasks.project_id
        LEFT JOIN clients ON clients.id = projects.client_id
        WHERE tasks.id = ?
        LIMIT 1
      `,
    )
    .get(taskId) as
    | {
        id: number;
        project_id: number;
        title: string;
        description: string | null;
        status: "todo" | "in_progress" | "review" | "done";
        priority: "low" | "medium" | "high";
        due_date: string;
        assigned_to: number | null;
        assigned_name: string | null;
        assignee_access_status: UserAccessStatus | null;
        archived_at: string | null;
        agency_id: number;
        project_name: string | null;
        client_id: number | null;
        client_name: string | null;
      }
    | undefined;

const getCampaignRecordById = (campaignId: number) =>
  db.prepare("SELECT * FROM campaigns WHERE id = ?").get(campaignId) as
    | {
        id: number;
        project_id: number;
        name: string;
        platform: string;
        budget: number;
        spent: number;
        roi: number;
        status: "active" | "paused" | "completed";
        archived_at: string | null;
        agency_id: number;
        created_at: string;
      }
    | undefined;

const getClientRecordById = (clientId: number) =>
  db.prepare("SELECT * FROM clients WHERE id = ?").get(clientId) as
    | {
        id: number;
        lead_id: number | null;
        company: string;
        industry: string | null;
        budget: number;
        status: "active" | "inactive";
        archived_at: string | null;
        agency_id: number;
        created_at: string;
      }
    | undefined;

const getClientRecordByLeadId = (leadId: number, includeArchived = false) =>
  db
    .prepare(
      `
        SELECT *
        FROM clients
        WHERE lead_id = ? AND (${includeArchived ? "1 = 1" : "archived_at IS NULL"})
        ORDER BY id ASC
        LIMIT 1
      `,
    )
    .get(leadId) as
    | {
        id: number;
        lead_id: number | null;
        company: string;
        industry: string | null;
        budget: number;
        status: "active" | "inactive";
        archived_at: string | null;
        agency_id: number;
        created_at: string;
      }
    | undefined;

const getClientRecordByCompany = (agencyId: number, company: string, includeArchived = false) =>
  db
    .prepare(
      `
        SELECT *
        FROM clients
        WHERE agency_id = ? AND lower(trim(company)) = lower(trim(?))
          AND (${includeArchived ? "1 = 1" : "archived_at IS NULL"})
        ORDER BY id ASC
        LIMIT 1
      `,
    )
    .get(agencyId, company) as
    | {
        id: number;
        lead_id: number | null;
        company: string;
        industry: string | null;
        budget: number;
        status: "active" | "inactive";
        archived_at: string | null;
        agency_id: number;
        created_at: string;
      }
    | undefined;

const getInvoiceRecordById = (invoiceId: number) =>
  db.prepare("SELECT * FROM invoices WHERE id = ?").get(invoiceId) as
    | {
        id: number;
        invoice_number: string;
        client_id: number;
        amount: number;
        due_date: string;
        status: "paid" | "pending" | "overdue";
        url: string | null;
        agency_id: number;
        created_at: string;
      }
    | undefined;

const getReferralCodeRecordById = (referralCodeId: number) =>
  db.prepare("SELECT * FROM referral_codes WHERE id = ?").get(referralCodeId) as ReferralCodeRow | undefined;

const getReferralCodeRecordByCode = (code: string) =>
  db.prepare("SELECT * FROM referral_codes WHERE upper(code) = upper(?)").get(code) as
    | ReferralCodeRow
    | undefined;

const getReferralRecordById = (referralId: number) =>
  db.prepare("SELECT * FROM referrals WHERE id = ?").get(referralId) as ReferralRow | undefined;

const getReferralByCodeAndEmail = (referralCodeId: number, email: string) =>
  db
    .prepare(
      `
        SELECT *
        FROM referrals
        WHERE referral_code_id = ? AND lower(trim(COALESCE(referred_email, ''))) = lower(trim(?))
        ORDER BY id ASC
        LIMIT 1
      `,
    )
    .get(referralCodeId, email) as ReferralRow | undefined;

const normalizeReferralCodeValue = (value: string) =>
  value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-zA-Z0-9]+/g, "")
    .toUpperCase()
    .trim();

const appendQueryParam = (url: string, key: string, value: string) => {
  try {
    const parsedUrl = new URL(url);
    parsedUrl.searchParams.set(key, value);
    return parsedUrl.toString();
  } catch {
    const separator = url.includes("?") ? "&" : "?";
    return `${url}${separator}${encodeURIComponent(key)}=${encodeURIComponent(value)}`;
  }
};

const buildReferralLink = (code: string, landingUrl?: string | null, req?: express.Request) => {
  const trimmedLandingUrl = typeof landingUrl === "string" ? landingUrl.trim() : "";

  if (trimmedLandingUrl) {
    return appendQueryParam(trimmedLandingUrl, "ref", code);
  }

  const publicAppUrl = getPublicAppUrl(req);

  if (publicAppUrl) {
    return appendQueryParam(publicAppUrl, "ref", code);
  }

  return `?ref=${encodeURIComponent(code)}`;
};

const buildReferralCaptureEndpoint = (code: string, req?: express.Request) => {
  const publicAppUrl = getPublicAppUrl(req);
  const path = `/api/public/referrals/${encodeURIComponent(code)}/capture`;

  return publicAppUrl ? `${publicAppUrl}${path}` : path;
};

const createReferralCodeCandidate = (clientName: string) => {
  const normalizedBase = normalizeReferralCodeValue(clientName).slice(0, 6) || "REFER";
  return `${normalizedBase}${randomBytes(2).toString("hex").toUpperCase()}`;
};

const generateUniqueReferralCode = (clientName: string) => {
  let nextCode = createReferralCodeCandidate(clientName);

  while (getReferralCodeRecordByCode(nextCode)) {
    nextCode = createReferralCodeCandidate(clientName);
  }

  return nextCode;
};

const calculateReferralCommission = ({
  commissionType,
  commissionValue,
  invoiceAmount,
}: {
  commissionType: ReferralCommissionType;
  commissionValue: number;
  invoiceAmount: number;
}) => {
  const sanitizedValue = Math.max(0, Number(commissionValue || 0));
  const sanitizedInvoiceAmount = Math.max(0, Number(invoiceAmount || 0));
  const amount =
    commissionType === "fixed"
      ? sanitizedValue
      : (sanitizedInvoiceAmount * sanitizedValue) / 100;

  return Math.round(amount * 100) / 100;
};

const serializeReferralCodeRow = (
  referralCode: ReferralCodeRow,
  req?: express.Request,
) => {
  const client = getClientRecordById(referralCode.client_id);

  if (!client) {
    return null;
  }

  return {
    ...referralCode,
    client_name: client.company,
    referral_link: buildReferralLink(referralCode.code, referralCode.landing_url, req),
    capture_endpoint: buildReferralCaptureEndpoint(referralCode.code, req),
  };
};

const serializeReferralCode = (referralCodeId: number, req?: express.Request) => {
  const referralCode = getReferralCodeRecordById(referralCodeId);

  if (!referralCode) {
    return null;
  }

  return serializeReferralCodeRow(referralCode, req);
};

const serializeReferralRow = (referral: ReferralRow, req?: express.Request) => {
  const referralCode = getReferralCodeRecordById(referral.referral_code_id);
  const referrerClient = getClientRecordById(referral.referrer_client_id);

  if (!referralCode || !referrerClient) {
    return null;
  }

  const convertedClient = referral.converted_client_id
    ? getClientRecordById(referral.converted_client_id)
    : null;
  const invoice = referral.invoice_id ? getInvoiceRecordById(referral.invoice_id) : null;

  return {
    ...referral,
    referrer_client_name: referrerClient.company,
    code: referralCode.code,
    referral_link: buildReferralLink(referralCode.code, referralCode.landing_url, req),
    converted_client_name: convertedClient?.company || null,
    invoice_number: invoice?.invoice_number || null,
  };
};

const serializeReferral = (referralId: number, req?: express.Request) => {
  const referral = getReferralRecordById(referralId);

  if (!referral) {
    return null;
  }

  return serializeReferralRow(referral, req);
};

const getReferralOverview = (agencyId: number, req?: express.Request) => {
  const referralCodes = db
    .prepare("SELECT * FROM referral_codes WHERE agency_id = ? ORDER BY datetime(created_at) DESC, id DESC")
    .all(agencyId) as ReferralCodeRow[];
  const referrals = db
    .prepare("SELECT * FROM referrals WHERE agency_id = ? ORDER BY datetime(created_at) DESC, id DESC")
    .all(agencyId) as ReferralRow[];

  const serializedCodes = referralCodes
    .map((referralCode) => serializeReferralCodeRow(referralCode, req))
    .filter(Boolean);
  const serializedReferrals = referrals
    .map((referral) => serializeReferralRow(referral, req))
    .filter(Boolean);

  const totalCodes = serializedCodes.length;
  const activeCodes = serializedCodes.filter((referralCode) => referralCode.status === "active").length;
  const totalReferrals = serializedReferrals.length;
  const convertedReferrals = serializedReferrals.filter((referral) => referral.status === "converted").length;
  const conversionRate =
    totalReferrals === 0 ? 0 : Math.round((convertedReferrals / totalReferrals) * 100);
  const pendingCommissions = serializedReferrals
    .filter((referral) => referral.payout_status === "pending")
    .reduce((sum, referral) => sum + Number(referral.commission_amount || 0), 0);
  const approvedCommissions = serializedReferrals
    .filter((referral) => referral.payout_status === "approved")
    .reduce((sum, referral) => sum + Number(referral.commission_amount || 0), 0);
  const paidCommissions = serializedReferrals
    .filter((referral) => referral.payout_status === "paid")
    .reduce((sum, referral) => sum + Number(referral.commission_amount || 0), 0);

  const topClients = Object.values(
    serializedReferrals.reduce<Record<number, {
      client_id: number;
      client_name: string;
      active_codes: number;
      total_referrals: number;
      converted_referrals: number;
      pending_commissions: number;
      paid_commissions: number;
    }>>((accumulator, referral) => {
      const current =
        accumulator[referral.referrer_client_id] || {
          client_id: referral.referrer_client_id,
          client_name: referral.referrer_client_name,
          active_codes: serializedCodes.filter(
            (referralCode) =>
              referralCode.client_id === referral.referrer_client_id &&
              referralCode.status === "active",
          ).length,
          total_referrals: 0,
          converted_referrals: 0,
          pending_commissions: 0,
          paid_commissions: 0,
        };

      current.total_referrals += 1;

      if (referral.status === "converted") {
        current.converted_referrals += 1;
      }

      if (referral.payout_status === "pending" || referral.payout_status === "approved") {
        current.pending_commissions += Number(referral.commission_amount || 0);
      }

      if (referral.payout_status === "paid") {
        current.paid_commissions += Number(referral.commission_amount || 0);
      }

      accumulator[referral.referrer_client_id] = current;
      return accumulator;
    }, {}),
  )
    .sort((left, right) => right.converted_referrals - left.converted_referrals || right.total_referrals - left.total_referrals)
    .slice(0, 5);

  return {
    summary: {
      total_codes: totalCodes,
      active_codes: activeCodes,
      total_referrals: totalReferrals,
      converted_referrals: convertedReferrals,
      conversion_rate: conversionRate,
      pending_commissions: Math.round(pendingCommissions * 100) / 100,
      approved_commissions: Math.round(approvedCommissions * 100) / 100,
      paid_commissions: Math.round(paidCommissions * 100) / 100,
    },
    top_clients: topClients,
    recent_codes: serializedCodes.slice(0, 6),
    recent_referrals: serializedReferrals.slice(0, 8),
  };
};

const getClientReferralPortal = (clientId: number, agencyId: number, req?: express.Request) => {
  const client = getClientRecordById(clientId);

  if (!client || client.agency_id !== agencyId) {
    return null;
  }

  const codes = (db
    .prepare(
      "SELECT * FROM referral_codes WHERE agency_id = ? AND client_id = ? ORDER BY datetime(created_at) DESC, id DESC",
    )
    .all(agencyId, client.id) as ReferralCodeRow[])
    .map((referralCode) => serializeReferralCodeRow(referralCode, req))
    .filter(Boolean);
  const referrals = (db
    .prepare(
      "SELECT * FROM referrals WHERE agency_id = ? AND referrer_client_id = ? ORDER BY datetime(created_at) DESC, id DESC",
    )
    .all(agencyId, client.id) as ReferralRow[])
    .map((referral) => serializeReferralRow(referral, req))
    .filter(Boolean);

  const totalReferrals = referrals.length;
  const convertedReferrals = referrals.filter((referral) => referral.status === "converted").length;

  return {
    client: {
      id: client.id,
      company: client.company,
      status: client.status,
    },
    summary: {
      active_codes: codes.filter((code) => code.status === "active").length,
      total_referrals: totalReferrals,
      converted_referrals: convertedReferrals,
      conversion_rate: totalReferrals === 0 ? 0 : Math.round((convertedReferrals / totalReferrals) * 100),
      pending_commissions: Math.round(
        referrals
          .filter((referral) => referral.payout_status === "pending")
          .reduce((sum, referral) => sum + Number(referral.commission_amount || 0), 0) * 100,
      ) / 100,
      approved_commissions: Math.round(
        referrals
          .filter((referral) => referral.payout_status === "approved")
          .reduce((sum, referral) => sum + Number(referral.commission_amount || 0), 0) * 100,
      ) / 100,
      paid_commissions: Math.round(
        referrals
          .filter((referral) => referral.payout_status === "paid")
          .reduce((sum, referral) => sum + Number(referral.commission_amount || 0), 0) * 100,
      ) / 100,
    },
    codes,
    referrals,
  };
};

const syncReferralConversionForClient = (leadId: number, clientId: number) => {
  const client = getClientRecordById(clientId);

  if (!client) {
    return;
  }

  db.prepare(
    `
      UPDATE referrals
      SET
        status = CASE WHEN status = 'rejected' THEN status ELSE 'converted' END,
        converted_client_id = ?,
        converted_at = COALESCE(converted_at, CURRENT_TIMESTAMP),
        updated_at = CURRENT_TIMESTAMP
      WHERE lead_id = ? AND agency_id = ?
    `,
  ).run(client.id, leadId, client.agency_id);
};

const getIntegrationDisplayName = (integrationKey?: IntegrationKey | null) =>
  integrationKey
    ? integrationTemplates.find((template) => template.key === integrationKey)?.name || integrationKey
    : null;

const getServicePriceRecordById = (servicePriceId: number) =>
  db.prepare("SELECT * FROM service_prices WHERE id = ?").get(servicePriceId) as
    | ServicePriceRow
    | undefined;

const getFreelancerRecordById = (freelancerId: number) =>
  db.prepare("SELECT * FROM freelancers WHERE id = ?").get(freelancerId) as
    | FreelancerRow
    | undefined;

const serializeServicePriceRow = (servicePrice: ServicePriceRow) => ({
  ...servicePrice,
  is_active: servicePrice.is_active === 1,
});

const serializeFreelancerRow = (freelancer: FreelancerRow, req?: express.Request) => ({
  ...freelancer,
  payout_integration_name: getIntegrationDisplayName(freelancer.payout_integration_key),
  portal_access: serializePortalAccessUser(
    getLinkedFreelancerUserRecord(freelancer.agency_id, freelancer.id),
    req,
  ),
});

const getContractRecordById = (contractId: number) =>
  db.prepare("SELECT * FROM contracts WHERE id = ?").get(contractId) as ContractRow | undefined;

const getContractLineItems = (contractId: number) =>
  db
    .prepare(
      `
        SELECT *
        FROM contract_line_items
        WHERE contract_id = ?
        ORDER BY id ASC
      `,
    )
    .all(contractId) as ContractLineItemRow[];

const getContractEvents = (contractId: number) =>
  (
    db
      .prepare(
        `
          SELECT *
          FROM contract_events
          WHERE contract_id = ?
          ORDER BY datetime(created_at) DESC, id DESC
        `,
      )
      .all(contractId) as ContractEventRow[]
  ).map((event) => ({
    ...event,
    metadata: parseAuditMetadata(event.metadata),
  }));

const serializeContractLineItemRow = (lineItem: ContractLineItemRow) => {
  const servicePrice = lineItem.service_price_id
    ? getServicePriceRecordById(lineItem.service_price_id)
    : null;

  return {
    ...lineItem,
    service_name: servicePrice?.name || null,
  };
};

const parseValidationNotes = (value?: string | null) => {
  if (!value) {
    return [] as string[];
  }

  try {
    const parsed = JSON.parse(value);
    return Array.isArray(parsed) ? parsed.filter((item) => typeof item === "string") : [];
  } catch {
    return value.trim() ? [value] : [];
  }
};

const generateContractNumber = (agencyId: number) => {
  const dateCode = new Date().toISOString().slice(0, 10).replace(/-/g, "");
  const count =
    (db
      .prepare(
        `
          SELECT COUNT(*) as count
          FROM contracts
          WHERE agency_id = ? AND contract_number LIKE ?
        `,
      )
      .get(agencyId, `CTR-${dateCode}-%`) as { count: number }).count;

  return `CTR-${dateCode}-${String(count + 1).padStart(3, "0")}`;
};

const getContractStatusTransitionMeta = (
  previousStatus: ContractStatus,
  nextStatus: ContractStatus,
  contractNumber: string,
) => {
  switch (nextStatus) {
    case "review":
      return {
        eventType: "review_started" as const,
        action: "contracts.review_started",
        title: "Contrato en revision",
        description: `Se movió ${contractNumber} a revision interna.`,
      };
    case "ready":
      return {
        eventType: "approved" as const,
        action: "contracts.review_approved",
        title: "Contrato aprobado",
        description: `Se aprobó ${contractNumber} para envío.`,
      };
    case "sent":
      return {
        eventType: "sent" as const,
        action: "contracts.sent",
        title: "Contrato enviado",
        description: `Se marcó ${contractNumber} como enviado.`,
      };
    case "signed":
      return {
        eventType: "signed" as const,
        action: "contracts.signed",
        title: "Contrato firmado",
        description: `Se marcó ${contractNumber} como firmado.`,
      };
    case "archived":
      return {
        eventType: "archived" as const,
        action: "contracts.archived",
        title: "Contrato archivado",
        description: `Se archivó ${contractNumber}.`,
      };
    case "draft":
      return {
        eventType: "status_changed" as const,
        action: "contracts.status_changed",
        title: previousStatus === "review" || previousStatus === "ready" ? "Vuelta a borrador" : "Estado actualizado",
        description:
          previousStatus === "review" || previousStatus === "ready"
            ? `Se devolvió ${contractNumber} a borrador.`
            : `Se actualizó el estado de ${contractNumber} a borrador.`,
      };
    default:
      return {
        eventType: "status_changed" as const,
        action: "contracts.status_changed",
        title: "Estado actualizado",
        description: `Se actualizó el estado de ${contractNumber} a ${nextStatus}.`,
      };
  }
};

const buildContractValidation = ({
  contractType,
  clientId,
  freelancerId,
  counterpartyName,
  counterpartyEmail,
  counterpartyTaxId,
  counterpartyAddress,
  paymentTerms,
  startDate,
  endDate,
  lineItems,
}: {
  contractType: ContractType;
  clientId?: number | null;
  freelancerId?: number | null;
  counterpartyName: string;
  counterpartyEmail?: string | null;
  counterpartyTaxId?: string | null;
  counterpartyAddress?: string | null;
  paymentTerms: string;
  startDate: string;
  endDate?: string | null;
  lineItems: Array<{ quantity: number; unit_price: number }>;
}) => {
  const notes: string[] = [];
  let status: ContractValidationStatus = "valid";

  if (contractType === "client" && !clientId) {
    notes.push("El contrato de cliente necesita un cliente vinculado.");
    status = "invalid";
  }

  if (contractType === "freelance" && !freelancerId) {
    notes.push("El contrato freelance necesita un colaborador vinculado.");
    status = "invalid";
  }

  if (!counterpartyName.trim()) {
    notes.push("La contraparte necesita nombre o razón social.");
    status = "invalid";
  }

  if (!paymentTerms.trim()) {
    notes.push("Define condiciones de pago antes de generar el contrato.");
    status = "invalid";
  }

  if (!startDate || Number.isNaN(new Date(startDate).getTime())) {
    notes.push("La fecha de inicio no es válida.");
    status = "invalid";
  }

  if (endDate && !Number.isNaN(new Date(startDate).getTime()) && !Number.isNaN(new Date(endDate).getTime())) {
    if (new Date(endDate).getTime() < new Date(startDate).getTime()) {
      notes.push("La fecha de fin no puede ser anterior a la de inicio.");
      status = "invalid";
    }
  }

  if (lineItems.length === 0) {
    notes.push("Añade al menos una línea de servicio para poder validar el contrato.");
    status = "invalid";
  }

  if (
    lineItems.some(
      (lineItem) =>
        !Number.isFinite(Number(lineItem.quantity)) ||
        Number(lineItem.quantity) <= 0 ||
        !Number.isFinite(Number(lineItem.unit_price)) ||
        Number(lineItem.unit_price) < 0,
    )
  ) {
    notes.push("Hay líneas con cantidad o precio inválidos.");
    status = "invalid";
  }

  if (status !== "invalid" && !counterpartyEmail) {
    notes.push("Añadir email de la contraparte mejora la trazabilidad para envío y firma.");
    status = "warning";
  }

  if (status !== "invalid" && !counterpartyTaxId) {
    notes.push("Falta NIF/CIF o identificador fiscal de la contraparte.");
    status = "warning";
  }

  if (status !== "invalid" && !counterpartyAddress) {
    notes.push("Falta domicilio legal de la contraparte.");
    status = "warning";
  }

  return { status, notes };
};

const buildContractBody = ({
  contractNumber,
  contractType,
  templateKey,
  agencyName,
  counterpartyName,
  counterpartyEmail,
  counterpartyTaxId,
  counterpartyAddress,
  paymentTerms,
  startDate,
  endDate,
  currency,
  subtotal,
  taxAmount,
  totalAmount,
  scopeSummary,
  customRequirements,
  paymentIntegrationKey,
  signatureIntegrationKey,
  lineItems,
}: {
  contractNumber: string;
  contractType: ContractType;
  templateKey: string;
  agencyName: string;
  counterpartyName: string;
  counterpartyEmail?: string | null;
  counterpartyTaxId?: string | null;
  counterpartyAddress?: string | null;
  paymentTerms: string;
  startDate: string;
  endDate?: string | null;
  currency: SupportedCurrency;
  subtotal: number;
  taxAmount: number;
  totalAmount: number;
  scopeSummary?: string | null;
  customRequirements?: string | null;
  paymentIntegrationKey?: IntegrationKey | null;
  signatureIntegrationKey?: IntegrationKey | null;
  lineItems: Array<{
    title: string;
    description?: string | null;
    quantity: number;
    unit_price: number;
    tax_rate: number;
    line_total: number;
  }>;
}) => {
  const formattedLineItems = lineItems
    .map(
      (lineItem, index) =>
        `${index + 1}. ${lineItem.title} · ${lineItem.quantity} x ${lineItem.unit_price.toFixed(2)} ${currency} = ${lineItem.line_total.toFixed(2)} ${currency}${lineItem.description ? `\n   ${lineItem.description}` : ""}`,
    )
    .join("\n");

  const sharedClauses = [
    "CONFIDENCIALIDAD: ambas partes tratarán la información compartida como confidencial y únicamente para la ejecución del servicio.",
    "PROPIEDAD INTELECTUAL: los entregables finales se transferirán según el alcance contratado y una vez confirmado el pago correspondiente.",
    "PROTECCIÓN DE DATOS: las partes se comprometen a tratar los datos personales conforme a la normativa aplicable y a las instrucciones operativas acordadas.",
    "RESOLUCIÓN DE CONFLICTOS: se recomienda revisión jurídica previa al uso definitivo en producción o firma con terceros.",
  ];

  const specificClauses =
    contractType === "client"
      ? [
          "OBJETO: la agencia prestará los servicios definidos en este contrato para la contraparte cliente.",
          "APROBACIONES: la contraparte facilitará aprobaciones y materiales en tiempo razonable para evitar retrasos operativos.",
          "FACTURACIÓN: los importes se emitirán según las condiciones de pago acordadas y podrán suspenderse entregables en caso de impago.",
        ]
      : [
          "OBJETO: el colaborador freelance prestará los servicios definidos con autonomía organizativa y responsabilidad sobre sus medios de trabajo.",
          "ENTREGABLES: el freelance se compromete a cumplir plazos, calidad y revisiones razonables dentro del alcance acordado.",
          "CESIÓN: los activos entregados para el proyecto podrán ser utilizados por la agencia o el cliente final una vez abonados los importes pactados.",
        ];

  return [
    `CONTRATO ${contractType === "client" ? "DE PRESTACIÓN DE SERVICIOS" : "DE COLABORACIÓN FREELANCE"}`,
    `Número: ${contractNumber}`,
    `Plantilla: ${templateKey}`,
    "",
    "PARTES",
    `1. Agencia: ${agencyName}`,
    `2. Contraparte: ${counterpartyName}`,
    `Email: ${counterpartyEmail || "Pendiente"}`,
    `Fiscal: ${counterpartyTaxId || "Pendiente"}`,
    `Dirección: ${counterpartyAddress || "Pendiente"}`,
    "",
    "VIGENCIA",
    `Inicio: ${startDate}`,
    `Fin: ${endDate || "Sin fecha final definida"}`,
    "",
    "ALCANCE",
    scopeSummary?.trim() || "El alcance se define por las líneas de servicio y requisitos adicionales de este contrato.",
    customRequirements?.trim() ? `\nREQUISITOS ESPECÍFICOS\n${customRequirements.trim()}` : null,
    "",
    "SERVICIOS Y TARIFAS",
    formattedLineItems || "Sin líneas registradas",
    "",
    "RESUMEN ECONÓMICO",
    `Subtotal: ${subtotal.toFixed(2)} ${currency}`,
    `Impuestos: ${taxAmount.toFixed(2)} ${currency}`,
    `Total: ${totalAmount.toFixed(2)} ${currency}`,
    `Condiciones de pago: ${paymentTerms}`,
    `Canal de pago recomendado: ${getIntegrationDisplayName(paymentIntegrationKey) || "Pendiente"}`,
    `Firma prevista: ${getIntegrationDisplayName(signatureIntegrationKey) || "Manual / Pendiente"}`,
    "",
    "CLÁUSULAS",
    ...specificClauses,
    ...sharedClauses,
    "",
    "NOTA",
    "Este documento sirve como base contractual operativa y debe revisarse jurídicamente antes de su firma definitiva según la jurisdicción aplicable.",
  ]
    .filter(Boolean)
    .join("\n");
};

const serializeContractRow = (contract: ContractRow) => {
  const client = contract.client_id ? getClientRecordById(contract.client_id) : null;
  const freelancer = contract.freelancer_id ? getFreelancerRecordById(contract.freelancer_id) : null;
  const ownerUser = contract.owner_user_id ? getUserRecordByIdFull(contract.owner_user_id) : null;

  return {
    ...contract,
    client_name: client?.company || null,
    freelancer_name: freelancer?.name || null,
    owner_name: ownerUser?.name || null,
    payment_integration_name: getIntegrationDisplayName(contract.payment_integration_key),
    signature_integration_name: getIntegrationDisplayName(contract.signature_integration_key),
    validation_notes: parseValidationNotes(contract.validation_notes),
    line_items: getContractLineItems(contract.id).map(serializeContractLineItemRow),
  };
};

const serializeContract = (contractId: number) => {
  const contract = getContractRecordById(contractId);
  return contract ? serializeContractRow(contract) : null;
};

const getContractsOverview = (
  agencyId: number,
  scope?: {
    clientId?: number | null;
    freelancerId?: number | null;
  },
) => {
  const scopedClientId = scope?.clientId || null;
  const scopedFreelancerId = scope?.freelancerId || null;
  const isScoped = Boolean(scopedClientId || scopedFreelancerId);
  const contracts = (
    db
      .prepare(
        `
          SELECT *
          FROM contracts
          WHERE agency_id = ?
            AND archived_at IS NULL
            AND (? <= 0 OR client_id = ?)
            AND (? <= 0 OR freelancer_id = ?)
          ORDER BY datetime(created_at) DESC, id DESC
        `,
      )
      .all(
        agencyId,
        scopedClientId || 0,
        scopedClientId || 0,
        scopedFreelancerId || 0,
        scopedFreelancerId || 0,
      ) as ContractRow[]
  ).map(serializeContractRow);
  const freelancers = isScoped
    ? { count: scopedFreelancerId ? 1 : 0 }
    : ((db
        .prepare("SELECT COUNT(*) as count FROM freelancers WHERE agency_id = ? AND status = 'active'")
        .get(agencyId) as { count: number }) || { count: 0 });
  const services = isScoped
    ? ((db
        .prepare(
          `
            SELECT COUNT(*) as count
            FROM contract_line_items
            INNER JOIN contracts ON contracts.id = contract_line_items.contract_id
            WHERE contracts.agency_id = ?
              AND (? <= 0 OR contracts.client_id = ?)
              AND (? <= 0 OR contracts.freelancer_id = ?)
              AND contracts.archived_at IS NULL
          `,
        )
        .get(
          agencyId,
          scopedClientId || 0,
          scopedClientId || 0,
          scopedFreelancerId || 0,
          scopedFreelancerId || 0,
        ) as { count: number }) || { count: 0 })
    : ((db
        .prepare("SELECT COUNT(*) as count FROM service_prices WHERE agency_id = ? AND is_active = 1")
        .get(agencyId) as { count: number }) || { count: 0 });

  return {
    summary: {
      total_contracts: contracts.length,
      draft_contracts: contracts.filter((contract) => contract.status === "draft").length,
      ready_contracts: contracts.filter((contract) => contract.status === "ready").length,
      signed_contracts: contracts.filter((contract) => contract.status === "signed").length,
      active_freelancers: freelancers.count,
      active_services: services.count,
      pending_signature: contracts.filter((contract) => ["review", "ready", "sent"].includes(contract.status)).length,
      monthly_value: Math.round(
        contracts
          .filter((contract) => contract.status !== "archived")
          .reduce((sum, contract) => sum + Number(contract.total_amount || 0), 0) * 100,
      ) / 100,
    },
    recent_contracts: contracts.slice(0, 6),
  };
};

const sanitizeContractLineItemsInput = (
  items: unknown,
  agencyId: number,
) => {
  if (!Array.isArray(items)) {
    return [] as Array<{
      service_price_id: number | null;
      title: string;
      description: string | null;
      quantity: number;
      unit_price: number;
      tax_rate: number;
      line_total: number;
    }>;
  }

  return items
    .map((item) => {
      const row = item as Record<string, unknown>;
      const servicePriceId = Number(row.service_price_id || 0);
      const servicePrice =
        Number.isInteger(servicePriceId) && servicePriceId > 0
          ? getServicePriceRecordById(servicePriceId)
          : null;

      if (servicePrice && servicePrice.agency_id !== agencyId) {
        return null;
      }

      const quantity = Number(row.quantity ?? 1);
      const unitPrice = Number(
        row.unit_price ?? servicePrice?.default_price ?? 0,
      );
      const taxRate = Number(row.tax_rate ?? servicePrice?.tax_rate ?? 21);
      const title =
        typeof row.title === "string" && row.title.trim()
          ? row.title.trim()
          : servicePrice?.name || "";

      if (
        !title ||
        !Number.isFinite(quantity) ||
        quantity <= 0 ||
        !Number.isFinite(unitPrice) ||
        unitPrice < 0 ||
        !Number.isFinite(taxRate) ||
        taxRate < 0
      ) {
        return null;
      }

      return {
        service_price_id: servicePrice?.id || null,
        title,
        description:
          typeof row.description === "string" && row.description.trim()
            ? row.description.trim()
            : servicePrice?.description || null,
        quantity,
        unit_price: Math.round(unitPrice * 100) / 100,
        tax_rate: Math.round(taxRate * 100) / 100,
        line_total: Math.round(quantity * unitPrice * 100) / 100,
      };
    })
    .filter(Boolean) as Array<{
    service_price_id: number | null;
    title: string;
    description: string | null;
    quantity: number;
    unit_price: number;
    tax_rate: number;
    line_total: number;
  }>;
};

const getReferralPartnerRecordById = (partnerId: number) =>
  db.prepare("SELECT * FROM referral_partners WHERE id = ?").get(partnerId) as
    | ReferralPartnerRow
    | undefined;

const getReferralPartnerRecordByFreelancerId = (agencyId: number, freelancerId: number) =>
  db
    .prepare(
      `
        SELECT *
        FROM referral_partners
        WHERE agency_id = ? AND owner_type = 'freelance' AND freelancer_id = ?
        ORDER BY datetime(created_at) DESC, id DESC
        LIMIT 1
      `,
    )
    .get(agencyId, freelancerId) as ReferralPartnerRow | undefined;

const getPartnerReferralCodeRecordById = (codeId: number) =>
  db.prepare("SELECT * FROM partner_referral_codes WHERE id = ?").get(codeId) as
    | PartnerReferralCodeRow
    | undefined;

const getPartnerReferralCodeRecordByCode = (code: string) =>
  db.prepare("SELECT * FROM partner_referral_codes WHERE upper(code) = upper(?)").get(code) as
    | PartnerReferralCodeRow
    | undefined;

const getPartnerReferralRecordById = (referralId: number) =>
  db.prepare("SELECT * FROM partner_referrals WHERE id = ?").get(referralId) as
    | PartnerReferralRow
    | undefined;

const getPartnerReferralByCodeAndEmail = (referralCodeId: number, email: string) =>
  db
    .prepare(
      `
        SELECT *
        FROM partner_referrals
        WHERE referral_code_id = ? AND lower(trim(COALESCE(referred_email, ''))) = lower(trim(?))
        ORDER BY id ASC
        LIMIT 1
      `,
    )
    .get(referralCodeId, email) as PartnerReferralRow | undefined;

const getReferralPartnerDisplay = (partner: ReferralPartnerRow) => {
  const user = partner.user_id ? getUserRecordByIdFull(partner.user_id) : null;
  const freelancer = partner.freelancer_id ? getFreelancerRecordById(partner.freelancer_id) : null;

  if (partner.owner_type === "team") {
    return {
      display_name: user?.name || `Miembro #${partner.user_id || partner.id}`,
      email: user?.email || null,
      role_label: user?.role || "Equipo",
    };
  }

  return {
    display_name: freelancer?.name || `Freelance #${partner.freelancer_id || partner.id}`,
    email: freelancer?.email || null,
    role_label: freelancer?.specialty || "Freelance",
  };
};

const serializeReferralPartnerRow = (partner: ReferralPartnerRow) => {
  const owner = getReferralPartnerDisplay(partner);
  const codes = db
    .prepare("SELECT * FROM partner_referral_codes WHERE partner_id = ? ORDER BY datetime(created_at) DESC")
    .all(partner.id) as PartnerReferralCodeRow[];
  const referrals = db
    .prepare("SELECT * FROM partner_referrals WHERE partner_id = ? ORDER BY datetime(created_at) DESC")
    .all(partner.id) as PartnerReferralRow[];

  return {
    ...partner,
    ...owner,
    payout_integration_name: getIntegrationDisplayName(partner.payout_integration_key),
    active_codes: codes.filter((code) => code.status === "active").length,
    total_referrals: referrals.length,
    converted_referrals: referrals.filter((referral) => referral.status === "converted").length,
    pending_commissions:
      Math.round(
        referrals
          .filter((referral) => ["pending", "approved"].includes(referral.payout_status))
          .reduce((sum, referral) => sum + Number(referral.commission_amount || 0), 0) * 100,
      ) / 100,
    paid_commissions:
      Math.round(
        referrals
          .filter((referral) => referral.payout_status === "paid")
          .reduce((sum, referral) => sum + Number(referral.commission_amount || 0), 0) * 100,
      ) / 100,
  };
};

const serializePartnerReferralCodeRow = (referralCode: PartnerReferralCodeRow, req?: express.Request) => {
  const partner = getReferralPartnerRecordById(referralCode.partner_id);

  if (!partner) {
    return null;
  }

  const owner = getReferralPartnerDisplay(partner);

  return {
    ...referralCode,
    partner_name: owner.display_name,
    owner_type: partner.owner_type,
    payout_integration_key: partner.payout_integration_key,
    payout_integration_name: getIntegrationDisplayName(partner.payout_integration_key),
    referral_link: buildReferralLink(referralCode.code, referralCode.landing_url, req),
    capture_endpoint: buildReferralCaptureEndpoint(referralCode.code, req).replace(
      "/api/public/referrals/",
      "/api/public/partner-referrals/",
    ),
  };
};

const serializePartnerReferralRow = (referral: PartnerReferralRow, req?: express.Request) => {
  const referralCode = getPartnerReferralCodeRecordById(referral.referral_code_id);
  const partner = getReferralPartnerRecordById(referral.partner_id);

  if (!referralCode || !partner) {
    return null;
  }

  const owner = getReferralPartnerDisplay(partner);
  const convertedClient = referral.converted_client_id
    ? getClientRecordById(referral.converted_client_id)
    : null;
  const invoice = referral.invoice_id ? getInvoiceRecordById(referral.invoice_id) : null;

  return {
    ...referral,
    partner_name: owner.display_name,
    partner_email: owner.email,
    partner_role_label: owner.role_label,
    owner_type: partner.owner_type,
    payout_integration_key: partner.payout_integration_key,
    payout_integration_name: getIntegrationDisplayName(partner.payout_integration_key),
    payout_reference: partner.payout_reference,
    payment_method: partner.payment_method,
    code: referralCode.code,
    referral_link: buildReferralLink(referralCode.code, referralCode.landing_url, req),
    converted_client_name: convertedClient?.company || null,
    invoice_number: invoice?.invoice_number || null,
  };
};

const getPartnerReferralOverview = (agencyId: number, req?: express.Request) => {
  const partners = (
    db
      .prepare("SELECT * FROM referral_partners WHERE agency_id = ? ORDER BY datetime(created_at) DESC, id DESC")
      .all(agencyId) as ReferralPartnerRow[]
  ).map(serializeReferralPartnerRow);
  const codes = (
    db
      .prepare("SELECT * FROM partner_referral_codes WHERE agency_id = ? ORDER BY datetime(created_at) DESC, id DESC")
      .all(agencyId) as PartnerReferralCodeRow[]
  )
    .map((code) => serializePartnerReferralCodeRow(code, req))
    .filter(Boolean);
  const referrals = (
    db
      .prepare("SELECT * FROM partner_referrals WHERE agency_id = ? ORDER BY datetime(created_at) DESC, id DESC")
      .all(agencyId) as PartnerReferralRow[]
  )
    .map((referral) => serializePartnerReferralRow(referral, req))
    .filter(Boolean);

  const totalReferrals = referrals.length;
  const convertedReferrals = referrals.filter((referral) => referral.status === "converted").length;

  return {
    summary: {
      total_partners: partners.length,
      active_partners: partners.filter((partner) => partner.status === "active").length,
      total_codes: codes.length,
      active_codes: codes.filter((code) => code.status === "active").length,
      total_referrals: totalReferrals,
      converted_referrals: convertedReferrals,
      conversion_rate: totalReferrals === 0 ? 0 : Math.round((convertedReferrals / totalReferrals) * 100),
      pending_commissions:
        Math.round(
          referrals
            .filter((referral) => referral.payout_status === "pending")
            .reduce((sum, referral) => sum + Number(referral.commission_amount || 0), 0) * 100,
        ) / 100,
      approved_commissions:
        Math.round(
          referrals
            .filter((referral) => referral.payout_status === "approved")
            .reduce((sum, referral) => sum + Number(referral.commission_amount || 0), 0) * 100,
        ) / 100,
      paid_commissions:
        Math.round(
          referrals
            .filter((referral) => referral.payout_status === "paid")
            .reduce((sum, referral) => sum + Number(referral.commission_amount || 0), 0) * 100,
        ) / 100,
    },
    partners: partners.slice(0, 8),
    recent_codes: codes.slice(0, 6),
    recent_referrals: referrals.slice(0, 8),
  };
};

const getFreelancerReferralPortal = (
  agencyId: number,
  freelancerId: number,
  req?: express.Request,
) => {
  const freelancer = getFreelancerRecordById(freelancerId);

  if (!freelancer || freelancer.agency_id !== agencyId) {
    return null;
  }

  const partner = getReferralPartnerRecordByFreelancerId(agencyId, freelancer.id) || null;
  const codes = partner
    ? ((db
        .prepare(
          `
            SELECT *
            FROM partner_referral_codes
            WHERE agency_id = ? AND partner_id = ?
            ORDER BY datetime(created_at) DESC, id DESC
          `,
        )
        .all(agencyId, partner.id) as PartnerReferralCodeRow[])
        .map((row) => serializePartnerReferralCodeRow(row, req))
        .filter(Boolean))
    : [];
  const referrals = partner
    ? ((db
        .prepare(
          `
            SELECT *
            FROM partner_referrals
            WHERE agency_id = ? AND partner_id = ?
            ORDER BY datetime(created_at) DESC, id DESC
          `,
        )
        .all(agencyId, partner.id) as PartnerReferralRow[])
        .map((row) => serializePartnerReferralRow(row, req))
        .filter(Boolean))
    : [];
  const totalReferrals = referrals.length;
  const convertedReferrals = referrals.filter((referral) => referral.status === "converted").length;

  return {
    freelancer: serializeFreelancerRow(freelancer),
    partner: partner ? serializeReferralPartnerRow(partner) : null,
    summary: {
      active_codes: codes.filter((code) => code.status === "active").length,
      total_referrals: totalReferrals,
      converted_referrals: convertedReferrals,
      conversion_rate: totalReferrals === 0 ? 0 : Math.round((convertedReferrals / totalReferrals) * 100),
      pending_commissions: Math.round(
        referrals
          .filter((referral) => referral.payout_status === "pending")
          .reduce((sum, referral) => sum + Number(referral.commission_amount || 0), 0) * 100,
      ) / 100,
      approved_commissions: Math.round(
        referrals
          .filter((referral) => referral.payout_status === "approved")
          .reduce((sum, referral) => sum + Number(referral.commission_amount || 0), 0) * 100,
      ) / 100,
      paid_commissions: Math.round(
        referrals
          .filter((referral) => referral.payout_status === "paid")
          .reduce((sum, referral) => sum + Number(referral.commission_amount || 0), 0) * 100,
      ) / 100,
    },
    codes,
    referrals,
  };
};

const getFreelancerFinancePortal = (
  agencyId: number,
  freelancerId: number,
  _req?: express.Request,
) => {
  const freelancer = getFreelancerRecordById(freelancerId);

  if (!freelancer || freelancer.agency_id !== agencyId) {
    return null;
  }

  const contracts = (
    db
      .prepare(
        `
          SELECT *
          FROM contracts
          WHERE agency_id = ? AND freelancer_id = ? AND archived_at IS NULL
          ORDER BY datetime(created_at) DESC, id DESC
        `,
      )
      .all(agencyId, freelancerId) as ContractRow[]
  ).map(serializeContractRow);
  const pendingContracts = contracts.filter((contract) => ["draft", "review", "ready", "sent"].includes(contract.status));
  const signedContracts = contracts.filter((contract) => contract.status === "signed");
  const totalContractValue =
    Math.round(contracts.reduce((sum, contract) => sum + Number(contract.total_amount || 0), 0) * 100) / 100;
  const pendingContractValue =
    Math.round(pendingContracts.reduce((sum, contract) => sum + Number(contract.total_amount || 0), 0) * 100) / 100;
  const signedContractValue =
    Math.round(signedContracts.reduce((sum, contract) => sum + Number(contract.total_amount || 0), 0) * 100) / 100;
  const totalGenerated = totalContractValue;

  return {
    freelancer: serializeFreelancerRow(freelancer),
    summary: {
      total_contracts: contracts.length,
      pending_contracts: pendingContracts.length,
      signed_contracts: signedContracts.length,
      total_contract_value: totalContractValue,
      pending_contract_value: pendingContractValue,
      signed_contract_value: signedContractValue,
      total_generated: totalGenerated,
    },
    contracts,
  };
};

const syncPartnerReferralConversionForClient = (leadId: number, clientId: number) => {
  const client = getClientRecordById(clientId);

  if (!client) {
    return;
  }

  db.prepare(
    `
      UPDATE partner_referrals
      SET
        status = CASE WHEN status = 'rejected' THEN status ELSE 'converted' END,
        converted_client_id = ?,
        converted_at = COALESCE(converted_at, CURRENT_TIMESTAMP),
        updated_at = CURRENT_TIMESTAMP
      WHERE lead_id = ? AND agency_id = ?
    `,
  ).run(client.id, leadId, client.agency_id);
};

const getProjectRecordByClientAndName = (clientId: number, name: string, includeArchived = false) =>
  db
    .prepare(
      `
        SELECT *
        FROM projects
        WHERE client_id = ? AND lower(trim(name)) = lower(trim(?))
          AND (${includeArchived ? "1 = 1" : "archived_at IS NULL"})
        ORDER BY id ASC
        LIMIT 1
      `,
    )
    .get(clientId, name) as
    | {
        id: number;
        client_id: number;
        name: string;
        status: "strategy" | "setup" | "execution" | "optimization" | "reporting" | "completed";
        archived_at: string | null;
        agency_id: number;
        created_at: string;
      }
    | undefined;

const getFirstProjectRecordByClientId = (clientId: number, includeArchived = false) =>
  db
    .prepare(
      `
        SELECT *
        FROM projects
        WHERE client_id = ? AND (${includeArchived ? "1 = 1" : "archived_at IS NULL"})
        ORDER BY created_at ASC, id ASC
        LIMIT 1
      `,
    )
    .get(clientId) as
    | {
        id: number;
        client_id: number;
        name: string;
        status: "strategy" | "setup" | "execution" | "optimization" | "reporting" | "completed";
        archived_at: string | null;
        agency_id: number;
        created_at: string;
      }
    | undefined;

const getProjectRecordByIdFull = (projectId: number) =>
  db.prepare("SELECT * FROM projects WHERE id = ?").get(projectId) as
    | {
        id: number;
        client_id: number;
        name: string;
        status: "strategy" | "setup" | "execution" | "optimization" | "reporting" | "completed";
        archived_at: string | null;
        agency_id: number;
        created_at: string;
      }
    | undefined;

const getFreelancerProjectAssignmentRows = (agencyId: number, freelancerId: number) =>
  db
    .prepare(
      `
        SELECT *
        FROM freelancer_project_assignments
        WHERE agency_id = ? AND freelancer_id = ? AND status != 'archived'
        ORDER BY datetime(created_at) DESC, id DESC
      `,
    )
    .all(agencyId, freelancerId) as FreelancerProjectAssignmentRow[];

const getFreelancerWorkspaceData = (
  agencyId: number,
  freelancerId: number,
  authUserId: number,
) => {
  const freelancer = getFreelancerRecordById(freelancerId);

  if (!freelancer || freelancer.agency_id !== agencyId) {
    return null;
  }

  const assignmentRows = getFreelancerProjectAssignmentRows(agencyId, freelancerId);
  const projectRows = assignmentRows
    .map((assignment) => ({
      assignment,
      project: getProjectRecordByIdFull(assignment.project_id),
    }))
    .filter(
      (
        row,
      ): row is {
        assignment: FreelancerProjectAssignmentRow;
        project: NonNullable<ReturnType<typeof getProjectRecordByIdFull>>;
      } => Boolean(row.project && row.project.agency_id === agencyId && !isArchivedRecord(row.project)),
    );
  const validProjectRows = projectRows.filter((row) => {
    const client = getClientRecordById(row.project.client_id);
    return Boolean(client && client.agency_id === agencyId && !isArchivedRecord(client));
  });
  const projectIds = validProjectRows.map((row) => row.project.id);

  if (projectIds.length === 0) {
    return {
      freelancer: serializeFreelancerRow(freelancer),
      clients: [],
      projects: [],
      campaigns: [],
      tasks: [],
    };
  }

  const placeholders = projectIds.map(() => "?").join(", ");
  const taskRows = db
    .prepare(
      `
        SELECT
          tasks.*,
          projects.name as project_name,
          projects.client_id as client_id,
          clients.company as client_name
        FROM tasks
        INNER JOIN projects ON projects.id = tasks.project_id
        INNER JOIN clients ON clients.id = projects.client_id
        WHERE tasks.agency_id = ?
          AND tasks.archived_at IS NULL
          AND tasks.project_id IN (${placeholders})
          AND tasks.assigned_to = ?
        ORDER BY datetime(tasks.due_date) ASC, tasks.id ASC
      `,
    )
    .all(agencyId, ...projectIds, authUserId) as Array<{
    id: number;
    project_id: number;
    title: string;
    description: string | null;
    status: "todo" | "in_progress" | "review" | "done";
    priority: "low" | "medium" | "high";
    due_date: string;
    assigned_to: number | null;
    archived_at: string | null;
    agency_id: number;
    project_name: string;
    client_id: number | null;
    client_name: string | null;
  }>;
  const campaignRows = db
    .prepare(
      `
        SELECT
          campaigns.*,
          projects.name as project_name,
          projects.client_id as client_id,
          clients.company as client_name
        FROM campaigns
        INNER JOIN projects ON projects.id = campaigns.project_id
        INNER JOIN clients ON clients.id = projects.client_id
        WHERE campaigns.agency_id = ? AND campaigns.archived_at IS NULL AND campaigns.project_id IN (${placeholders})
        ORDER BY datetime(campaigns.created_at) DESC, campaigns.id DESC
      `,
    )
    .all(agencyId, ...projectIds) as Array<{
    id: number;
    project_id: number;
    name: string;
    platform: string;
    budget: number;
    spent: number;
    roi: number;
    status: "active" | "paused" | "completed";
    archived_at: string | null;
    agency_id: number;
    created_at: string;
    project_name: string;
    client_id: number;
    client_name: string;
  }>;

  const tasks = taskRows.map((task) => ({
    id: task.id,
    project_id: task.project_id,
    project_name: task.project_name,
    client_id: task.client_id,
    client_name: task.client_name,
    title: task.title,
    description: task.description || "",
    status: task.status,
    priority: task.priority,
    due_date: task.due_date,
    assigned_to: task.assigned_to,
    is_assigned_to_me: task.assigned_to === authUserId,
    can_update_status: task.assigned_to === authUserId,
  }));

  const campaigns = campaignRows.map((campaign) => ({
    id: campaign.id,
    project_id: campaign.project_id,
    project_name: campaign.project_name,
    client_id: campaign.client_id,
    client_name: campaign.client_name,
    name: campaign.name,
    platform: campaign.platform,
    budget: campaign.budget,
    spent: campaign.spent,
    roi: campaign.roi,
    status: campaign.status,
    created_at: campaign.created_at,
  }));

  const clientsById = new Map<
    number,
    {
      id: number;
      company: string;
      industry: string | null;
      budget: number;
      status: "active" | "inactive";
      lead_id: number | null;
      project_count: number;
      active_campaigns: number;
      pending_tasks: number;
    }
  >();

  validProjectRows.forEach(({ project }) => {
    const client = getClientRecordById(project.client_id);

    if (!client) {
      return;
    }

    const existing = clientsById.get(client.id) || {
      id: client.id,
      company: client.company,
      industry: client.industry,
      budget: client.budget,
      status: client.status,
      lead_id: client.lead_id,
      project_count: 0,
      active_campaigns: 0,
      pending_tasks: 0,
    };

    existing.project_count += 1;
    clientsById.set(client.id, existing);
  });

  campaigns.forEach((campaign) => {
    const client = clientsById.get(campaign.client_id);

    if (client && campaign.status === "active") {
      client.active_campaigns += 1;
    }
  });

  tasks.forEach((task) => {
    if (!task.client_id || task.status === "done") {
      return;
    }

    const client = clientsById.get(task.client_id);

    if (client) {
      client.pending_tasks += 1;
    }
  });

  const clients = Array.from(clientsById.values()).map((client) => {
    const lead = client.lead_id ? getLeadRecordById(client.lead_id) : null;
    return {
      id: client.id,
      company: client.company,
      industry: client.industry,
      budget: client.budget,
      status: client.status,
      project_count: client.project_count,
      active_campaigns: client.active_campaigns,
      pending_tasks: client.pending_tasks,
      contact_name: lead?.name || null,
      contact_email: lead?.email || null,
      contact_phone: lead?.phone || null,
    };
  });

  const projects = validProjectRows.map(({ assignment, project }) => {
    const client = getClientRecordById(project.client_id);
    const projectTasks = tasks.filter((task) => task.project_id === project.id);
    const projectCampaigns = campaigns.filter((campaign) => campaign.project_id === project.id);
    const nextDueTask = projectTasks
      .filter((task) => task.status !== "done" && task.due_date)
      .sort((a, b) => new Date(a.due_date).getTime() - new Date(b.due_date).getTime())[0];

    return {
      id: project.id,
      client_id: project.client_id,
      client_name: client?.company || `Cliente #${project.client_id}`,
      name: project.name,
      status: project.status,
      role_label: assignment.role_label,
      notes: assignment.notes,
      total_tasks: projectTasks.length,
      open_tasks: projectTasks.filter((task) => task.status !== "done").length,
      my_tasks: projectTasks.filter((task) => task.is_assigned_to_me).length,
      active_campaigns: projectCampaigns.filter((campaign) => campaign.status === "active").length,
      campaigns_count: projectCampaigns.length,
      total_budget:
        Math.round(projectCampaigns.reduce((sum, campaign) => sum + Number(campaign.budget || 0), 0) * 100) / 100,
      total_spend:
        Math.round(projectCampaigns.reduce((sum, campaign) => sum + Number(campaign.spent || 0), 0) * 100) / 100,
      average_roi:
        projectCampaigns.length === 0
          ? 0
          : Math.round(
              (projectCampaigns.reduce((sum, campaign) => sum + Number(campaign.roi || 0), 0) / projectCampaigns.length) *
                100,
            ) / 100,
      next_due_date: nextDueTask?.due_date || null,
    };
  });

  return {
    freelancer: serializeFreelancerRow(freelancer),
    clients,
    projects,
    campaigns,
    tasks,
  };
};

const getFreelancerWorkspacePortal = (agencyId: number, freelancerId: number, authUserId: number) => {
  const workspace = getFreelancerWorkspaceData(agencyId, freelancerId, authUserId);

  if (!workspace) {
    return null;
  }

  return {
    freelancer: workspace.freelancer,
    clients: workspace.clients.sort((a, b) => a.company.localeCompare(b.company)),
    projects: workspace.projects.sort((a, b) => a.name.localeCompare(b.name)),
    campaigns: workspace.campaigns.slice(0, 12),
    upcoming_tasks: workspace.tasks
      .filter((task) => task.status !== "done")
      .sort((a, b) => new Date(a.due_date).getTime() - new Date(b.due_date).getTime())
      .slice(0, 10),
  };
};

const getFreelancerTasksPortal = (agencyId: number, freelancerId: number, authUserId: number) => {
  const workspace = getFreelancerWorkspaceData(agencyId, freelancerId, authUserId);

  if (!workspace) {
    return null;
  }

  const dueThisWeek = workspace.tasks.filter((task) => {
    if (task.status === "done") {
      return false;
    }

    const due = new Date(task.due_date).getTime();
    const now = Date.now();
    const weekAhead = now + 7 * 24 * 60 * 60 * 1000;
    return Number.isFinite(due) && due >= now && due <= weekAhead;
  }).length;

  return {
    freelancer: workspace.freelancer,
    summary: {
      total_tasks: workspace.tasks.length,
      assigned_tasks: workspace.tasks.filter((task) => task.is_assigned_to_me).length,
      due_this_week: dueThisWeek,
      in_review: workspace.tasks.filter((task) => task.status === "review").length,
      completed_tasks: workspace.tasks.filter((task) => task.status === "done").length,
    },
    tasks: workspace.tasks,
  };
};

const getTeamOnboardingById = (onboardingId: number) =>
  db.prepare("SELECT * FROM team_onboardings WHERE id = ?").get(onboardingId) as
    | {
        id: number;
        user_id: number;
        status: TeamOnboardingStatus;
        target_ready_date: string | null;
        created_at: string;
        completed_at: string | null;
        agency_id: number | null;
      }
    | undefined;

const getTeamOnboardingByUserId = (userId: number) =>
  db.prepare("SELECT * FROM team_onboardings WHERE user_id = ?").get(userId) as
    | {
        id: number;
        user_id: number;
        status: TeamOnboardingStatus;
        target_ready_date: string | null;
        created_at: string;
        completed_at: string | null;
        agency_id: number | null;
      }
    | undefined;

const getTeamOnboardingStepById = (stepId: number) =>
  db.prepare("SELECT * FROM team_onboarding_steps WHERE id = ?").get(stepId) as
    | {
        id: number;
        onboarding_id: number;
        title: string;
        description: string | null;
        status: TeamOnboardingStepStatus;
        sort_order: number;
        created_at: string;
      }
    | undefined;

const getTeamOnboardingSteps = (onboardingId: number) =>
  db
    .prepare(
      `
        SELECT *
        FROM team_onboarding_steps
        WHERE onboarding_id = ?
        ORDER BY sort_order ASC, id ASC
      `,
    )
    .all(onboardingId) as Array<{
    id: number;
    onboarding_id: number;
    title: string;
    description: string | null;
    status: TeamOnboardingStepStatus;
    sort_order: number;
    created_at: string;
  }>;

const getClientOnboardingById = (onboardingId: number) =>
  db.prepare("SELECT * FROM client_onboardings WHERE id = ?").get(onboardingId) as
    | {
        id: number;
        client_id: number;
        project_id: number | null;
        status: ClientOnboardingStatus;
        kickoff_date: string | null;
        target_launch_date: string | null;
        created_at: string;
        completed_at: string | null;
        agency_id: number;
      }
    | undefined;

const getClientOnboardingByClientId = (clientId: number) =>
  db.prepare("SELECT * FROM client_onboardings WHERE client_id = ?").get(clientId) as
    | {
        id: number;
        client_id: number;
        project_id: number | null;
        status: ClientOnboardingStatus;
        kickoff_date: string | null;
        target_launch_date: string | null;
        created_at: string;
        completed_at: string | null;
        agency_id: number;
      }
    | undefined;

const getClientOnboardingByProjectId = (projectId: number) =>
  db.prepare("SELECT * FROM client_onboardings WHERE project_id = ?").get(projectId) as
    | {
        id: number;
        client_id: number;
        project_id: number | null;
        status: ClientOnboardingStatus;
        kickoff_date: string | null;
        target_launch_date: string | null;
        created_at: string;
        completed_at: string | null;
        agency_id: number;
      }
    | undefined;

const getClientOnboardingStepById = (stepId: number) =>
  db.prepare("SELECT * FROM client_onboarding_steps WHERE id = ?").get(stepId) as
    | {
        id: number;
        onboarding_id: number;
        task_id: number | null;
        title: string;
        description: string | null;
        status: ClientOnboardingStepStatus;
        due_date: string | null;
        sort_order: number;
        created_at: string;
      }
    | undefined;

const getClientOnboardingStepsRaw = (onboardingId: number) =>
  db
    .prepare(
      `
        SELECT *
        FROM client_onboarding_steps
        WHERE onboarding_id = ?
        ORDER BY sort_order ASC, id ASC
      `,
    )
    .all(onboardingId) as Array<{
    id: number;
    onboarding_id: number;
    task_id: number | null;
    title: string;
    description: string | null;
    status: ClientOnboardingStepStatus;
    due_date: string | null;
    sort_order: number;
    created_at: string;
  }>;

const getClientOnboardingSteps = (onboardingId: number) => {
  const onboarding = getClientOnboardingById(onboardingId);
  const steps = getClientOnboardingStepsRaw(onboardingId);

  if (!onboarding || steps.length === 0) {
    return steps;
  }

  const matchesCurrentTemplate =
    steps.length === clientOnboardingStepTemplates.length &&
    steps.every((step, index) => step.title.trim() === clientOnboardingStepTemplates[index]?.title);

  if (matchesCurrentTemplate) {
    return steps;
  }

  const matchesLegacyTemplate =
    steps.length === legacyClientOnboardingStepTitles.length &&
    steps.every(
      (step, index) => step.title.trim().toLowerCase() === legacyClientOnboardingStepTitles[index],
    );

  if (!matchesLegacyTemplate) {
    return steps;
  }

  const client = getClientRecordById(onboarding.client_id);

  if (!client) {
    return steps;
  }

  const kickoffDate = onboarding.kickoff_date || onboarding.created_at || new Date().toISOString();
  const fallbackAssignee =
    steps
      .map((step) => (step.task_id ? getTaskRecordByIdFull(step.task_id)?.assigned_to ?? null : null))
      .find((value) => Number.isInteger(value) && Number(value) > 0) ?? null;
  const updateStep = db.prepare(
    `
      UPDATE client_onboarding_steps
      SET title = ?, description = ?, due_date = ?, sort_order = ?
      WHERE id = ?
    `,
  );
  const updateStepTaskLink = db.prepare(
    `
      UPDATE client_onboarding_steps
      SET task_id = ?
      WHERE id = ?
    `,
  );
  const updateTask = db.prepare(
    `
      UPDATE tasks
      SET title = ?, description = ?, priority = ?, due_date = ?
      WHERE id = ?
    `,
  );
  const insertTask = db.prepare(
    `
      INSERT INTO tasks (
        project_id,
        title,
        description,
        status,
        priority,
        due_date,
        assigned_to,
        agency_id
      )
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `,
  );
  const insertStep = db.prepare(
    `
      INSERT INTO client_onboarding_steps (
        onboarding_id,
        task_id,
        title,
        description,
        status,
        due_date,
        sort_order
      )
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `,
  );

  db.transaction(() => {
    clientOnboardingStepTemplates.forEach((template, index) => {
      const existingStep = steps[index];
      const dueDate = addDays(kickoffDate, template.dueOffsetDays);

      if (existingStep) {
        updateStep.run(template.title, template.description, dueDate, index + 1, existingStep.id);

        if (existingStep.task_id) {
          updateTask.run(
            `[Onboarding] ${template.title}`,
            template.description,
            template.priority,
            dueDate,
            existingStep.task_id,
          );
        } else if (onboarding.project_id) {
          const taskId = Number(
            insertTask.run(
              onboarding.project_id,
              `[Onboarding] ${template.title}`,
              template.description,
              mapOnboardingStepToTaskStatus(existingStep.status),
              template.priority,
              dueDate,
              fallbackAssignee,
              client.agency_id,
            ).lastInsertRowid,
          );

          updateStepTaskLink.run(taskId, existingStep.id);
        }

        return;
      }

      const initialStatus: ClientOnboardingStepStatus =
        onboarding.status === "completed" ? "completed" : "pending";
      const taskId =
        onboarding.project_id
          ? Number(
              insertTask.run(
                onboarding.project_id,
                `[Onboarding] ${template.title}`,
                template.description,
                mapOnboardingStepToTaskStatus(initialStatus),
                template.priority,
                dueDate,
                fallbackAssignee,
                client.agency_id,
              ).lastInsertRowid,
            )
          : null;

      insertStep.run(
        onboarding.id,
        taskId,
        template.title,
        template.description,
        initialStatus,
        dueDate,
        index + 1,
      );
    });
  })();

  return getClientOnboardingStepsRaw(onboardingId);
};

const getClientOnboardingDocumentsByOnboardingId = (onboardingId: number) =>
  db
    .prepare(
      `
        SELECT *
        FROM client_onboarding_documents
        WHERE onboarding_id = ?
        ORDER BY datetime(created_at) DESC, id DESC
      `,
    )
    .all(onboardingId) as ClientOnboardingDocumentRow[];

const getClientOnboardingDocumentById = (documentId: number) =>
  db.prepare("SELECT * FROM client_onboarding_documents WHERE id = ?").get(documentId) as
    | ClientOnboardingDocumentRow
    | undefined;

const getClientOnboardingFormByClientId = (clientId: number) =>
  db.prepare("SELECT * FROM client_onboarding_forms WHERE client_id = ?").get(clientId) as
    | ClientOnboardingFormRow
    | undefined;

const serializeClientOnboardingFormRow = (form: ClientOnboardingFormRow) => ({
  ...form,
  ad_budget: Math.round(Number(form.ad_budget || 0) * 100) / 100,
});

const serializeClientOnboardingDocumentRow = (document: ClientOnboardingDocumentRow) => {
  const step = document.step_id ? getClientOnboardingStepById(document.step_id) : null;

  return {
    ...document,
    step_title: step?.title || null,
  };
};

const getPrimaryClientContractForOnboarding = (clientId: number, agencyId: number) =>
  db
    .prepare(
      `
        SELECT *
        FROM contracts
        WHERE client_id = ? AND agency_id = ? AND contract_type = 'client' AND archived_at IS NULL
        ORDER BY
          CASE status
            WHEN 'sent' THEN 0
            WHEN 'signed' THEN 1
            WHEN 'ready' THEN 2
            WHEN 'review' THEN 3
            WHEN 'draft' THEN 4
            ELSE 5
          END,
          datetime(updated_at) DESC,
          id DESC
        LIMIT 1
      `,
    )
    .get(clientId, agencyId) as ContractRow | undefined;

const getClientContractSignatureStepStatus = (
  contract?: ContractRow | null,
  onboarding?: { status: ClientOnboardingStatus } | null,
): ClientOnboardingStepStatus => {
  if (!contract && onboarding?.status === "completed") {
    return "completed";
  }

  if (!contract) {
    return "pending";
  }

  if (contract.status === "signed") {
    return "completed";
  }

  if (contract.status === "sent") {
    return "in_progress";
  }

  return "pending";
};

const getClientOnboardingFormStepStatus = (
  form?: ClientOnboardingFormRow | null,
  onboarding?: { status: ClientOnboardingStatus } | null,
): ClientOnboardingStepStatus => {
  if (!form && onboarding?.status === "completed") {
    return "completed";
  }

  if (!form) {
    return "pending";
  }

  if (form.status === "submitted" && form.submitted_at) {
    return "completed";
  }

  const hasPartialData = [
    form.advertising_accesses,
    form.business_goals,
    form.target_audience,
    form.competition,
  ].some((value) => typeof value === "string" && value.trim()) || Number(form.ad_budget || 0) > 0;

  return hasPartialData ? "in_progress" : "pending";
};

const normalizeOnboardingStepTitle = (title: string) => title.trim().toLowerCase();

const clientOnboardingAutoManagedStepErrors = new Map<string, string>([
  [
    "firma de contrato digital",
    "La firma de contrato se actualiza automáticamente cuando el cliente firma desde su portal.",
  ],
  [
    "formulario de onboarding",
    "El formulario de onboarding se actualiza automáticamente cuando el cliente guarda o envía su briefing.",
  ],
]);

const syncClientOnboardingFlowSteps = (clientId: number) => {
  const client = getClientRecordById(clientId);
  const onboarding = client ? getClientOnboardingByClientId(client.id) : null;

  if (!client || !onboarding) {
    return null;
  }

  const steps = getClientOnboardingSteps(onboarding.id);
  const stepByTitle = new Map(
    steps.map((step) => [step.title.trim().toLowerCase(), step] as const),
  );
  const contractStep = stepByTitle.get("firma de contrato digital");
  const formStep = stepByTitle.get("formulario de onboarding");
  const primaryContract = getPrimaryClientContractForOnboarding(client.id, client.agency_id);
  const form = getClientOnboardingFormByClientId(client.id);
  const nextStatuses = [
    {
      step: contractStep,
      status: getClientContractSignatureStepStatus(primaryContract, onboarding),
    },
    {
      step: formStep,
      status: getClientOnboardingFormStepStatus(form, onboarding),
    },
  ];
  const resolvedStatuses = new Map(
    steps.map((step) => [step.id, step.status] as const),
  );

  let hasChanges = false;

  nextStatuses.forEach(({ step, status }) => {
    if (!step) {
      return;
    }

    resolvedStatuses.set(step.id, status);

    if (step.status === status) {
      return;
    }

    db.prepare("UPDATE client_onboarding_steps SET status = ? WHERE id = ?").run(status, step.id);
    updateClientOnboardingTaskStatus(step.task_id, status);
    hasChanges = true;
  });

  steps.forEach((step, index) => {
    if (index < 2) {
      return;
    }

    const hasIncompleteDependencies = steps
      .slice(0, index)
      .some((candidate) => (resolvedStatuses.get(candidate.id) || candidate.status) !== "completed");
    const resolvedStatus = resolvedStatuses.get(step.id) || step.status;

    if (!hasIncompleteDependencies || resolvedStatus === "pending") {
      return;
    }

    db.prepare("UPDATE client_onboarding_steps SET status = 'pending' WHERE id = ?").run(step.id);
    updateClientOnboardingTaskStatus(step.task_id, "pending");
    resolvedStatuses.set(step.id, "pending");
    hasChanges = true;
  });

  return hasChanges ? syncClientOnboardingAggregate(onboarding.id) : serializeClientOnboarding(onboarding.id);
};

const getClientOnboardingStepTransitionError = (
  onboardingId: number,
  stepId: number,
  nextStatus: ClientOnboardingStepStatus,
) => {
  const steps = getClientOnboardingSteps(onboardingId);
  const stepIndex = steps.findIndex((candidate) => candidate.id === stepId);

  if (stepIndex === -1) {
    return "Onboarding step not found";
  }

  const step = steps[stepIndex];
  const autoManagedError = clientOnboardingAutoManagedStepErrors.get(
    normalizeOnboardingStepTitle(step.title),
  );

  if (autoManagedError) {
    return autoManagedError;
  }

  if (nextStatus === "pending") {
    return null;
  }

  const blockingStep = steps
    .slice(0, stepIndex)
    .find((candidate) => candidate.status !== "completed");

  if (blockingStep) {
    return `Completa antes "${blockingStep.title}" para avanzar este paso.`;
  }

  return null;
};

const applyClientOnboardingStepStatus = (
  onboardingId: number,
  stepId: number,
  nextStatus: ClientOnboardingStepStatus,
) => {
  const steps = getClientOnboardingSteps(onboardingId);
  const stepIndex = steps.findIndex((candidate) => candidate.id === stepId);

  if (stepIndex === -1) {
    return;
  }

  const updateStepStatus = db.prepare("UPDATE client_onboarding_steps SET status = ? WHERE id = ?");
  const currentStep = steps[stepIndex];

  updateStepStatus.run(nextStatus, currentStep.id);
  updateClientOnboardingTaskStatus(currentStep.task_id, nextStatus);

  if (nextStatus === "completed") {
    return;
  }

  steps.slice(stepIndex + 1).forEach((candidate) => {
    if (candidate.status === "pending") {
      return;
    }

    updateStepStatus.run("pending", candidate.id);
    updateClientOnboardingTaskStatus(candidate.task_id, "pending");
  });
};

const getClientPortalOnboardingPayload = (clientId: number, agencyId: number) => {
  const client = getClientRecordById(clientId);

  if (!client || client.agency_id !== agencyId || isArchivedRecord(client)) {
    return null;
  }

  syncClientOnboardingFlowSteps(client.id);
  const onboardingRecord = getClientOnboardingByClientId(client.id);
  const onboarding = onboardingRecord ? serializeClientOnboarding(onboardingRecord.id) : null;
  const documents = onboardingRecord
    ? getClientOnboardingDocumentsByOnboardingId(onboardingRecord.id).map(
        serializeClientOnboardingDocumentRow,
      )
    : [];
  const briefingForm = getClientOnboardingFormByClientId(client.id);
  const primaryContract = getPrimaryClientContractForOnboarding(client.id, agencyId);

  return {
    client: {
      id: client.id,
      company: client.company,
      industry: client.industry,
      budget: client.budget,
      status: client.status,
      created_at: client.created_at,
    },
    onboarding,
    documents,
    primary_contract: primaryContract ? serializeContractRow(primaryContract) : null,
    briefing_form: briefingForm ? serializeClientOnboardingFormRow(briefingForm) : null,
  };
};

const getClientOnboardingProgress = (
  steps: Array<{
    status: ClientOnboardingStepStatus;
  }>,
) => {
  if (steps.length === 0) {
    return 0;
  }

  const progressUnits = steps.reduce((sum, step) => {
    if (step.status === "completed") {
      return sum + 1;
    }

    if (step.status === "in_progress") {
      return sum + 0.5;
    }

    return sum;
  }, 0);

  return Math.round((progressUnits / steps.length) * 100);
};

const serializeClientOnboarding = (onboardingId: number) => {
  const onboarding = getClientOnboardingById(onboardingId);

  if (!onboarding) {
    return null;
  }

  const client = getClientRecordById(onboarding.client_id);
  const project = onboarding.project_id ? getProjectRecordByIdFull(onboarding.project_id) : null;

  if (!client || isArchivedRecord(client) || isArchivedRecord(project)) {
    return null;
  }

  const steps = getClientOnboardingSteps(onboarding.id);
  const completedSteps = steps.filter((step) => step.status === "completed").length;
  const projectName = project?.name || null;

  return {
    ...onboarding,
    project_name: projectName,
    completed_steps: completedSteps,
    total_steps: steps.length,
    progress: getClientOnboardingProgress(steps),
    steps,
  };
};

const syncClientOnboardingAggregate = (onboardingId: number) => {
  const onboarding = getClientOnboardingById(onboardingId);

  if (!onboarding) {
    return null;
  }

  const steps = getClientOnboardingSteps(onboarding.id);
  const nextStatus: ClientOnboardingStatus =
    steps.length > 0 && steps.every((step) => step.status === "completed")
      ? "completed"
      : onboarding.status === "blocked"
        ? "blocked"
        : onboarding.status === "in_progress" ||
            steps.some((step) => step.status === "in_progress" || step.status === "completed")
        ? "in_progress"
        : "pending";

  db.prepare(
    `
      UPDATE client_onboardings
      SET status = ?, completed_at = ?
      WHERE id = ?
    `,
  ).run(nextStatus, nextStatus === "completed" ? new Date().toISOString() : null, onboarding.id);

  if (onboarding.project_id) {
    db.prepare("UPDATE projects SET status = ? WHERE id = ?").run(
      nextStatus === "completed" ? "completed" : "setup",
      onboarding.project_id,
    );
  }

  return serializeClientOnboarding(onboarding.id);
};

const getClientOperationalTaskCount = (projectId: number) =>
  (
    db
      .prepare(
        `
          SELECT COUNT(*) as count
          FROM tasks
          WHERE project_id = ? AND archived_at IS NULL AND title NOT LIKE '[Onboarding]%'
        `,
      )
      .get(projectId) as { count: number }
  ).count;

const ensureClientOperationalSetup = ({
  clientId,
  targetLaunchDate,
  preferredOwnerUserId = null,
  fallbackOwnerUserId = null,
  triggerInput = "",
  authUser = null,
}: {
  clientId: number;
  targetLaunchDate?: string | null;
  preferredOwnerUserId?: number | null;
  fallbackOwnerUserId?: number | null;
  triggerInput?: string;
  authUser?: AuthUser | null;
}) => {
  const client = getClientRecordById(clientId);

  if (!client || isArchivedRecord(client)) {
    return null;
  }

  const kickoffDate = toIsoDate(new Date());
  const ownerUserId = resolveClientOperationalOwnerUserId(
    client.agency_id,
    preferredOwnerUserId,
    fallbackOwnerUserId,
  );
  const normalizedTargetLaunchDate =
    typeof targetLaunchDate === "string" && !Number.isNaN(new Date(targetLaunchDate).getTime())
      ? targetLaunchDate
      : addDays(kickoffDate, 14);
  const projectName = createOnboardingProjectName(client.company.trim());

  const setup = db.transaction(() => {
    const existingOnboarding = getClientOnboardingByClientId(client.id);
    const currentProject =
      existingOnboarding?.project_id && Number.isInteger(Number(existingOnboarding.project_id))
        ? getProjectRecordByIdFull(existingOnboarding.project_id)
        : null;
    const onboardingProject =
      currentProject && !isArchivedRecord(currentProject)
        ? currentProject
        : getProjectRecordByClientAndName(client.id, projectName);
    const projectId =
      onboardingProject?.id ||
      Number(
        db
          .prepare(
            `
              INSERT INTO projects (client_id, name, status, agency_id)
              VALUES (?, ?, 'setup', ?)
            `,
          )
          .run(client.id, projectName, client.agency_id).lastInsertRowid,
      );
    const createdProject = !Boolean(onboardingProject);

    let onboardingId = existingOnboarding?.id || null;
    let createdOnboarding = false;
    let createdOnboardingTasks = 0;

    if (existingOnboarding?.id && existingOnboarding.project_id !== projectId) {
      db.prepare("UPDATE client_onboardings SET project_id = ? WHERE id = ?").run(
        projectId,
        existingOnboarding.id,
      );
    }

    if (!existingOnboarding) {
      onboardingId = Number(
        db
          .prepare(
            `
              INSERT INTO client_onboardings (
                client_id,
                project_id,
                status,
                kickoff_date,
                target_launch_date,
                agency_id
              )
              VALUES (?, ?, 'in_progress', ?, ?, ?)
            `,
          )
          .run(client.id, projectId, kickoffDate, normalizedTargetLaunchDate, client.agency_id)
          .lastInsertRowid,
      );

      const insertTask = db.prepare(
        `
          INSERT INTO tasks (
            project_id,
            title,
            description,
            status,
            priority,
            due_date,
            assigned_to,
            agency_id
          )
          VALUES (?, ?, ?, 'todo', ?, ?, ?, ?)
        `,
      );
      const insertStep = db.prepare(
        `
          INSERT INTO client_onboarding_steps (
            onboarding_id,
            task_id,
            title,
            description,
            status,
            due_date,
            sort_order
          )
          VALUES (?, ?, ?, ?, 'pending', ?, ?)
        `,
      );

      clientOnboardingStepTemplates.forEach((template, index) => {
        const dueDate = addDays(kickoffDate, template.dueOffsetDays);
        const taskId = Number(
          insertTask.run(
            projectId,
            `[Onboarding] ${template.title}`,
            template.description,
            template.priority,
            dueDate,
            ownerUserId,
            client.agency_id,
          ).lastInsertRowid,
        );

        insertStep.run(
          onboardingId,
          taskId,
          template.title,
          template.description,
          dueDate,
          index + 1,
        );

        createdOnboardingTasks += 1;
      });

      createdOnboarding = true;
    }

    return {
      project_id: projectId,
      onboarding_id: onboardingId,
      created_project: createdProject,
      created_onboarding: createdOnboarding,
      created_onboarding_tasks: createdOnboardingTasks,
      created_operational_tasks: 0,
      owner_user_id: ownerUserId,
    } satisfies ClientOperationalSetupResult;
  })();

  syncClientOnboardingFlowSteps(client.id);

  if (setup.onboarding_id) {
    syncClientOnboardingCalendarEvent(setup.onboarding_id);
  }

  if (setup.project_id && getClientOperationalTaskCount(setup.project_id) === 0) {
    const ownerUser = setup.owner_user_id ? getUserRecordByIdFull(setup.owner_user_id) : null;
    const automationActor =
      authUser || (ownerUser ? toAuthUser(ownerUser) : null);
    const automation = runAIAutomationTrigger({
      agencyId: client.agency_id,
      triggerKey: "ai_trigger_project_task_pack",
      automation: "project_tasks",
      entityId: setup.project_id,
      input: triggerInput.trim(),
      entityType: "project",
      authUser: automationActor,
      description: `Se ejecutó automáticamente el pack de tareas IA para el setup inicial de ${client.company}.`,
    });
    const createdTaskIds = (automation?.applied_actions || [])
      .filter(
        (action) =>
          action.type === "task" &&
          action.status === "created" &&
          Number.isInteger(Number(action.target_id)) &&
          Number(action.target_id) > 0,
      )
      .map((action) => Number(action.target_id));

    if (setup.owner_user_id) {
      const assignTask = db.prepare(
        `
          UPDATE tasks
          SET assigned_to = ?
          WHERE id = ? AND agency_id = ?
        `,
      );

      createdTaskIds.forEach((taskId) => {
        assignTask.run(setup.owner_user_id, taskId, client.agency_id);
      });
    }

    setup.created_operational_tasks = createdTaskIds.length;
  }

  return setup;
};

const getClientManagementOverview = (
  clientId: number,
  agencyId: number,
  includeArchived = false,
  req?: express.Request,
) => {
  const client = getClientRecordById(clientId);

  if (!client || client.agency_id !== agencyId || (!includeArchived && isArchivedRecord(client))) {
    return null;
  }

  syncClientOnboardingFlowSteps(client.id);
  const lead = client.lead_id ? getLeadRecordById(client.lead_id) : null;
  const onboardingRecord = getClientOnboardingByClientId(client.id);
  const onboarding = onboardingRecord ? serializeClientOnboarding(onboardingRecord.id) : null;
  const currency = getAppSettings(agencyId).currency;
  const projectRows = db
    .prepare(
      `
        SELECT *
        FROM projects
        WHERE client_id = ? AND agency_id = ? AND (${includeArchived ? "1 = 1" : "archived_at IS NULL"})
        ORDER BY datetime(created_at) DESC, id DESC
      `,
    )
    .all(client.id, agencyId) as Array<{
    id: number;
    client_id: number;
    name: string;
    status: "strategy" | "setup" | "execution" | "optimization" | "reporting" | "completed";
    archived_at: string | null;
    agency_id: number;
    created_at: string;
  }>;
  const projectIds = projectRows.map((project) => project.id);
  const tasks =
    projectIds.length === 0
      ? []
      : (db
          .prepare(
            `
              SELECT
                tasks.id,
                tasks.project_id,
                projects.name as project_name,
                tasks.title,
                tasks.status,
                tasks.priority,
                tasks.due_date,
                tasks.assigned_to,
                users.name as assigned_name
              FROM tasks
              INNER JOIN projects ON projects.id = tasks.project_id
              LEFT JOIN users ON users.id = tasks.assigned_to
              WHERE tasks.agency_id = ? AND tasks.archived_at IS NULL AND tasks.project_id IN (${projectIds
                .map(() => "?")
                .join(", ")})
              ORDER BY
                CASE WHEN tasks.status = 'done' THEN 1 ELSE 0 END,
                datetime(COALESCE(tasks.due_date, '2999-12-31')) ASC,
                tasks.id ASC
            `,
          )
          .all(agencyId, ...projectIds) as Array<{
          id: number;
          project_id: number;
          project_name: string;
          title: string;
          status: "todo" | "in_progress" | "review" | "done";
          priority: "low" | "medium" | "high";
          due_date: string;
          assigned_to: number | null;
          assigned_name: string | null;
        }>);
  const contractRows = db
    .prepare(
      `
        SELECT *
        FROM contracts
        WHERE client_id = ? AND agency_id = ? AND (${includeArchived ? "1 = 1" : "archived_at IS NULL"})
        ORDER BY datetime(created_at) DESC, id DESC
      `,
    )
    .all(client.id, agencyId) as ContractRow[];
  const contracts = contractRows.map(serializeContractRow);
  const invoiceRows = db
    .prepare(
      `
        SELECT id, invoice_number, amount, due_date, status, created_at
        FROM invoices
        WHERE client_id = ? AND agency_id = ?
        ORDER BY datetime(due_date) DESC, id DESC
      `,
    )
    .all(client.id, agencyId) as Array<{
    id: number;
    invoice_number: string;
    amount: number;
    due_date: string;
    status: "paid" | "pending" | "overdue";
    created_at: string;
  }>;
  const integrationRows = db
    .prepare(
      `
        SELECT *
        FROM client_integrations
        WHERE client_id = ? AND agency_id = ?
        ORDER BY
          CASE status
            WHEN 'connected' THEN 0
            WHEN 'attention' THEN 1
            ELSE 2
          END,
          datetime(updated_at) DESC,
          id DESC
      `,
    )
    .all(client.id, agencyId) as ClientIntegrationRecord[];
  const onboardingDocumentRows = onboardingRecord
    ? getClientOnboardingDocumentsByOnboardingId(onboardingRecord.id)
    : [];

  const services = Array.from(
    new Set(
      contracts.flatMap((contract) =>
        contract.line_items
          .map((lineItem) => (lineItem.service_name || lineItem.title || "").trim())
          .filter(Boolean),
      ),
    ),
  );

  if (services.length === 0 && lead?.service?.trim()) {
    services.push(lead.service.trim());
  }

  const projectSummaries = projectRows.map((project) => {
    const projectTasks = tasks.filter((task) => task.project_id === project.id);

    return {
      id: project.id,
      name: project.name,
      status: project.status,
      created_at: project.created_at,
      total_tasks: projectTasks.length,
      open_tasks: projectTasks.filter((task) => task.status !== "done").length,
      completed_tasks: projectTasks.filter((task) => task.status === "done").length,
    };
  });

  const integrationItems = integrationRows.map((integration) => ({
    id: integration.id,
    integration_key: integration.integration_key,
    integration_name: integration.integration_name,
    status: integration.status,
    account_label: integration.account_label,
    last_tested_at: integration.last_tested_at,
    last_synced_at: integration.last_synced_at,
  }));

  return {
    client_id: client.id,
    currency,
    portal_access: serializePortalAccessUser(getLinkedClientUserRecord(agencyId, client.id), req),
    contact: {
      name: lead?.name || null,
      email: lead?.email || null,
      phone: lead?.phone || null,
      source: lead?.source || null,
      lead_status: lead?.status || null,
    },
    services,
    projects: projectSummaries,
    setup: {
      has_project_folder: projectRows.length > 0,
      onboarding_ready: Boolean(onboarding),
      onboarding_status: onboarding?.status || null,
      onboarding_progress: onboarding?.progress || 0,
      team_tasks_total: tasks.length,
      team_tasks_open: tasks.filter((task) => task.status !== "done").length,
      team_tasks_completed: tasks.filter((task) => task.status === "done").length,
    },
    billing: {
      invoice_count: invoiceRows.length,
      pending_count: invoiceRows.filter((invoice) => invoice.status === "pending").length,
      overdue_count: invoiceRows.filter((invoice) => invoice.status === "overdue").length,
      paid_count: invoiceRows.filter((invoice) => invoice.status === "paid").length,
      total_invoiced:
        Math.round(
          invoiceRows.reduce((sum, invoice) => sum + Number(invoice.amount || 0), 0) * 100,
        ) / 100,
      pending_amount:
        Math.round(
          invoiceRows
            .filter((invoice) => invoice.status === "pending")
            .reduce((sum, invoice) => sum + Number(invoice.amount || 0), 0) * 100,
        ) / 100,
      overdue_amount:
        Math.round(
          invoiceRows
            .filter((invoice) => invoice.status === "overdue")
            .reduce((sum, invoice) => sum + Number(invoice.amount || 0), 0) * 100,
        ) / 100,
      paid_amount:
        Math.round(
          invoiceRows
            .filter((invoice) => invoice.status === "paid")
            .reduce((sum, invoice) => sum + Number(invoice.amount || 0), 0) * 100,
        ) / 100,
    },
    contracts: {
      total: contracts.length,
      draft: contracts.filter((contract) => contract.status === "draft").length,
      sent: contracts.filter((contract) => contract.status === "sent").length,
      signed: contracts.filter((contract) => contract.status === "signed").length,
      active_services: services.length,
      recent: contracts.slice(0, 3).map((contract) => ({
        id: contract.id,
        contract_number: contract.contract_number,
        status: contract.status,
        total_amount: contract.total_amount,
        currency: contract.currency,
        start_date: contract.start_date,
        end_date: contract.end_date,
      })),
    },
    accesses: {
      total: integrationItems.length,
      connected: integrationItems.filter((integration) => integration.status === "connected").length,
      attention: integrationItems.filter((integration) => integration.status === "attention").length,
      disconnected: integrationItems.filter((integration) => integration.status === "disconnected")
        .length,
      items: integrationItems.slice(0, 6),
    },
    documents: {
      total: onboardingDocumentRows.length,
      recent: onboardingDocumentRows.slice(0, 4).map((document) => ({
        id: document.id,
        title: document.title,
        step_title: document.step_id
          ? getClientOnboardingStepById(document.step_id)?.title || null
          : null,
        file_name: document.file_name,
        file_size: document.file_size,
        uploaded_by_name: document.uploaded_by_name,
        created_at: document.created_at,
      })),
    },
    team_tasks: tasks.slice(0, 6).map((task) => ({
      id: task.id,
      project_id: task.project_id,
      project_name: task.project_name,
      title: task.title,
      status: task.status,
      priority: task.priority,
      due_date: task.due_date,
      assigned_to: task.assigned_to,
      assigned_name: task.assigned_name,
    })),
  };
};

const updateClientOnboardingTaskStatus = (
  taskId: number | null,
  stepStatus: ClientOnboardingStepStatus,
) => {
  if (!taskId) {
    return;
  }

  db.prepare("UPDATE tasks SET status = ? WHERE id = ?").run(
    mapOnboardingStepToTaskStatus(stepStatus),
    taskId,
  );
};

const setLeadArchivedState = (leadId: number, agencyId: number, archived: boolean) => {
  const lead = getLeadRecordById(leadId);

  if (!lead || !isAgencyOwnedRecord(lead, agencyId)) {
    return null;
  }

  db.prepare("UPDATE leads SET archived_at = ? WHERE id = ? AND agency_id = ?").run(
    archived ? new Date().toISOString() : null,
    lead.id,
    agencyId,
  );

  syncLeadFollowUpCalendarEvent(lead.id);
  return getLeadRecordById(lead.id);
};

const setTaskArchivedState = (taskId: number, agencyId: number, archived: boolean) => {
  const task = getTaskRecordByIdFull(taskId);

  if (!task || !isAgencyOwnedRecord(task, agencyId)) {
    return null;
  }

  db.prepare("UPDATE tasks SET archived_at = ? WHERE id = ? AND agency_id = ?").run(
    archived ? new Date().toISOString() : null,
    task.id,
    agencyId,
  );

  syncTaskCalendarEvent(task.id);
  return getTaskRecordByIdFull(task.id);
};

const setProjectArchivedState = (projectId: number, agencyId: number, archived: boolean) => {
  const archiveTimestamp = archived ? new Date().toISOString() : null;
  const updateArchiveState = db.transaction(() => {
    const project = getProjectRecordByIdFull(projectId);

    if (!project || !isAgencyOwnedRecord(project, agencyId)) {
      return null;
    }

    db.prepare("UPDATE projects SET archived_at = ? WHERE id = ? AND agency_id = ?").run(
      archiveTimestamp,
      project.id,
      agencyId,
    );
    db.prepare("UPDATE tasks SET archived_at = ? WHERE project_id = ? AND agency_id = ?").run(
      archiveTimestamp,
      project.id,
      agencyId,
    );
    db.prepare("UPDATE campaigns SET archived_at = ? WHERE project_id = ? AND agency_id = ?").run(
      archiveTimestamp,
      project.id,
      agencyId,
    );

    const taskIds = (
      db.prepare("SELECT id FROM tasks WHERE project_id = ? AND agency_id = ?").all(project.id, agencyId) as Array<{
        id: number;
      }>
    ).map((row) => row.id);
    const onboarding = getClientOnboardingByProjectId(project.id);

    return {
      projectId: project.id,
      taskIds,
      onboardingId: onboarding?.id || null,
    };
  });

  const result = updateArchiveState();

  if (!result) {
    return null;
  }

  result.taskIds.forEach((taskId) => syncTaskCalendarEvent(taskId));

  if (result.onboardingId) {
    syncClientOnboardingCalendarEvent(result.onboardingId);
  }

  return getProjectRecordByIdFull(result.projectId);
};

const setClientArchivedState = (clientId: number, agencyId: number, archived: boolean) => {
  const archiveTimestamp = archived ? new Date().toISOString() : null;
  const updateArchiveState = db.transaction(() => {
    const client = getClientRecordById(clientId);

    if (!client || !isAgencyOwnedRecord(client, agencyId)) {
      return null;
    }

    db.prepare("UPDATE clients SET archived_at = ? WHERE id = ? AND agency_id = ?").run(
      archiveTimestamp,
      client.id,
      agencyId,
    );

    const projectIds = (
      db.prepare("SELECT id FROM projects WHERE client_id = ? AND agency_id = ?").all(client.id, agencyId) as Array<{
        id: number;
      }>
    ).map((row) => row.id);

    projectIds.forEach((projectId) => {
      db.prepare("UPDATE projects SET archived_at = ? WHERE id = ? AND agency_id = ?").run(
        archiveTimestamp,
        projectId,
        agencyId,
      );
      db.prepare("UPDATE tasks SET archived_at = ? WHERE project_id = ? AND agency_id = ?").run(
        archiveTimestamp,
        projectId,
        agencyId,
      );
      db.prepare("UPDATE campaigns SET archived_at = ? WHERE project_id = ? AND agency_id = ?").run(
        archiveTimestamp,
        projectId,
        agencyId,
      );
    });

    const taskIds = projectIds.flatMap((projectId) =>
      (
        db.prepare("SELECT id FROM tasks WHERE project_id = ? AND agency_id = ?").all(projectId, agencyId) as Array<{
          id: number;
        }>
      ).map((row) => row.id),
    );

    const onboarding = getClientOnboardingByClientId(client.id);

    return {
      clientId: client.id,
      taskIds,
      onboardingId: onboarding?.id || null,
    };
  });

  const result = updateArchiveState();

  if (!result) {
    return null;
  }

  result.taskIds.forEach((taskId) => syncTaskCalendarEvent(taskId));

  if (result.onboardingId) {
    syncClientOnboardingCalendarEvent(result.onboardingId);
  }

  return getClientRecordById(result.clientId);
};

const deleteTaskPermanently = (taskId: number, agencyId: number) => {
  const removeTask = db.transaction(() => {
    const task = getTaskRecordByIdFull(taskId);

    if (!task || !isAgencyOwnedRecord(task, agencyId)) {
      return { error: "not_found" as const };
    }

    if (!isArchivedRecord(task)) {
      return { error: "not_archived" as const };
    }

    deleteOperationalArtifactsBySource(agencyId, "task", String(task.id));
    db.prepare("DELETE FROM tasks WHERE id = ? AND agency_id = ?").run(task.id, agencyId);
    return { task };
  });

  return removeTask();
};

const deleteLeadPermanently = (leadId: number, agencyId: number) => {
  const removeLead = db.transaction(() => {
    const lead = getLeadRecordById(leadId);

    if (!lead || !isAgencyOwnedRecord(lead, agencyId)) {
      return { error: "not_found" as const };
    }

    if (!isArchivedRecord(lead)) {
      return { error: "not_archived" as const };
    }

    if (getClientRecordByLeadId(lead.id, true)) {
      return { error: "lead_has_client" as const };
    }

    const automationTaskIds = getAutomationRunTaskIds({
      agencyId,
      entityType: "lead",
      entityId: lead.id,
      automation: "lead_followup",
    });

    automationTaskIds.forEach((taskId) => deleteOperationalArtifactsBySource(agencyId, "task", String(taskId)));

    deleteOperationalArtifactsBySource(agencyId, "lead_followup", String(lead.id));
    const deleteTask = db.prepare("DELETE FROM tasks WHERE id = ? AND agency_id = ?");
    automationTaskIds.forEach((taskId) => deleteTask.run(taskId, agencyId));
    db.prepare("DELETE FROM ai_automation_runs WHERE agency_id = ? AND entity_type = 'lead' AND entity_id = ?").run(
      agencyId,
      lead.id,
    );
    db.prepare("DELETE FROM lead_notes WHERE lead_id = ?").run(lead.id);
    db.prepare("DELETE FROM leads WHERE id = ? AND agency_id = ?").run(lead.id, agencyId);
    return { lead };
  });

  return removeLead();
};

const deleteProjectPermanently = (projectId: number, agencyId: number) => {
  const removeProject = db.transaction(() => {
    const project = getProjectRecordByIdFull(projectId);

    if (!project || !isAgencyOwnedRecord(project, agencyId)) {
      return { error: "not_found" as const };
    }

    if (!isArchivedRecord(project)) {
      return { error: "not_archived" as const };
    }

    if (getClientOnboardingByProjectId(project.id)) {
      return { error: "project_has_onboarding" as const };
    }

    const activeTaskCount =
      (db
        .prepare("SELECT COUNT(*) as count FROM tasks WHERE project_id = ? AND agency_id = ? AND archived_at IS NULL")
        .get(project.id, agencyId) as { count: number }).count;
    const activeCampaignCount =
      (db
        .prepare(
          "SELECT COUNT(*) as count FROM campaigns WHERE project_id = ? AND agency_id = ? AND archived_at IS NULL",
        )
        .get(project.id, agencyId) as { count: number }).count;

    if (activeTaskCount > 0 || activeCampaignCount > 0) {
      return { error: "project_has_active_children" as const };
    }

    const taskIds = (
      db.prepare("SELECT id FROM tasks WHERE project_id = ? AND agency_id = ?").all(project.id, agencyId) as Array<{
        id: number;
      }>
    ).map((row) => row.id);

    taskIds.forEach((taskId) => deleteOperationalArtifactsBySource(agencyId, "task", String(taskId)));

    db.prepare("DELETE FROM tasks WHERE project_id = ? AND agency_id = ?").run(project.id, agencyId);
    db.prepare("DELETE FROM campaigns WHERE project_id = ? AND agency_id = ?").run(project.id, agencyId);
    db.prepare("DELETE FROM projects WHERE id = ? AND agency_id = ?").run(project.id, agencyId);

    return { project };
  });

  return removeProject();
};

const deleteClientPermanently = (clientId: number, agencyId: number) => {
  const removeClient = db.transaction(() => {
    const client = getClientRecordById(clientId);

    if (!client || !isAgencyOwnedRecord(client, agencyId)) {
      return { error: "not_found" as const };
    }

    if (!isArchivedRecord(client)) {
      return { error: "not_archived" as const };
    }

    const reportsCount =
      (db
        .prepare("SELECT COUNT(*) as count FROM reports WHERE client_id = ? AND agency_id = ?")
        .get(client.id, agencyId) as { count: number }).count;
    const invoicesCount =
      (db
        .prepare("SELECT COUNT(*) as count FROM invoices WHERE client_id = ? AND agency_id = ?")
        .get(client.id, agencyId) as { count: number }).count;

    if (reportsCount > 0 || invoicesCount > 0) {
      return { error: "client_has_documents" as const };
    }

    const activeProjectCount =
      (db
        .prepare("SELECT COUNT(*) as count FROM projects WHERE client_id = ? AND agency_id = ? AND archived_at IS NULL")
        .get(client.id, agencyId) as { count: number }).count;

    if (activeProjectCount > 0) {
      return { error: "client_has_active_projects" as const };
    }

    const projectIds = (
      db.prepare("SELECT id FROM projects WHERE client_id = ? AND agency_id = ?").all(client.id, agencyId) as Array<{
        id: number;
      }>
    ).map((row) => row.id);

    const taskIds = projectIds.flatMap((projectId) =>
      (
        db.prepare("SELECT id FROM tasks WHERE project_id = ? AND agency_id = ?").all(projectId, agencyId) as Array<{
          id: number;
        }>
      ).map((row) => row.id),
    );

    const onboardingIds = (
      db.prepare("SELECT id FROM client_onboardings WHERE client_id = ? AND agency_id = ?").all(client.id, agencyId) as Array<{
        id: number;
      }>
    ).map((row) => row.id);

    taskIds.forEach((taskId) => deleteOperationalArtifactsBySource(agencyId, "task", String(taskId)));
    onboardingIds.forEach((onboardingId) =>
      deleteOperationalArtifactsBySource(agencyId, "client_onboarding", String(onboardingId)),
    );

    db.prepare("DELETE FROM client_onboarding_steps WHERE onboarding_id IN (SELECT id FROM client_onboardings WHERE client_id = ? AND agency_id = ?)").run(
      client.id,
      agencyId,
    );
    db.prepare("DELETE FROM client_onboardings WHERE client_id = ? AND agency_id = ?").run(client.id, agencyId);
    db.prepare("DELETE FROM client_integrations WHERE client_id = ? AND agency_id = ?").run(client.id, agencyId);
    db.prepare("DELETE FROM tasks WHERE project_id IN (SELECT id FROM projects WHERE client_id = ? AND agency_id = ?) AND agency_id = ?").run(
      client.id,
      agencyId,
      agencyId,
    );
    db.prepare(
      "DELETE FROM campaigns WHERE project_id IN (SELECT id FROM projects WHERE client_id = ? AND agency_id = ?) AND agency_id = ?",
    ).run(client.id, agencyId, agencyId);
    db.prepare("DELETE FROM projects WHERE client_id = ? AND agency_id = ?").run(client.id, agencyId);
    db.prepare("DELETE FROM clients WHERE id = ? AND agency_id = ?").run(client.id, agencyId);

    return { client };
  });

  return removeClient();
};

const serializeTeamOnboarding = (onboardingId: number) => {
  const onboarding = getTeamOnboardingById(onboardingId);

  if (!onboarding) {
    return null;
  }

  const steps = getTeamOnboardingSteps(onboarding.id);
  const completedSteps = steps.filter((step) => step.status === "completed").length;

  return {
    ...onboarding,
    completed_steps: completedSteps,
    total_steps: steps.length,
    progress: steps.length === 0 ? 0 : Math.round((completedSteps / steps.length) * 100),
    steps,
  };
};

const syncTeamOnboardingAggregate = (onboardingId: number) => {
  const onboarding = getTeamOnboardingById(onboardingId);

  if (!onboarding) {
    return null;
  }

  const steps = getTeamOnboardingSteps(onboarding.id);
  const nextStatus: TeamOnboardingStatus =
    steps.length > 0 && steps.every((step) => step.status === "completed")
      ? "completed"
      : steps.some((step) => step.status === "in_progress" || step.status === "completed")
        ? "in_progress"
        : "pending";

  db.prepare(
    `
      UPDATE team_onboardings
      SET status = ?, completed_at = ?
      WHERE id = ?
    `,
  ).run(nextStatus, nextStatus === "completed" ? new Date().toISOString() : null, onboarding.id);

  return serializeTeamOnboarding(onboarding.id);
};

const getTeamOnboardingStepTransitionError = (
  onboardingId: number,
  stepId: number,
  nextStatus: TeamOnboardingStepStatus,
) => {
  const steps = getTeamOnboardingSteps(onboardingId);
  const stepIndex = steps.findIndex((candidate) => candidate.id === stepId);

  if (stepIndex === -1) {
    return "Onboarding step not found";
  }

  if (stepIndex === 0) {
    return "La activación de cuenta se completa automáticamente cuando el miembro accede por primera vez.";
  }

  if (nextStatus === "pending") {
    return null;
  }

  const blockingStep = steps
    .slice(0, stepIndex)
    .find((candidate) => candidate.status !== "completed");

  if (blockingStep) {
    return `Completa antes "${blockingStep.title}" para avanzar este paso.`;
  }

  return null;
};

const applyTeamOnboardingStepStatus = (
  onboardingId: number,
  stepId: number,
  nextStatus: TeamOnboardingStepStatus,
) => {
  const steps = getTeamOnboardingSteps(onboardingId);
  const stepIndex = steps.findIndex((candidate) => candidate.id === stepId);

  if (stepIndex === -1) {
    return;
  }

  const updateStepStatus = db.prepare("UPDATE team_onboarding_steps SET status = ? WHERE id = ?");
  const currentStep = steps[stepIndex];

  updateStepStatus.run(nextStatus, currentStep.id);

  if (nextStatus === "completed") {
    return;
  }

  steps.slice(stepIndex + 1).forEach((candidate) => {
    if (candidate.status === "pending") {
      return;
    }

    updateStepStatus.run("pending", candidate.id);
  });
};

const ensureTeamOnboardingForUser = (userId: number, agencyId: number | null) => {
  const existingOnboarding = getTeamOnboardingByUserId(userId);

  if (existingOnboarding) {
    return existingOnboarding.id;
  }

  const targetReadyDate = addDays(new Date(), 14);
  const onboardingId = Number(
    db
      .prepare(
        `
          INSERT INTO team_onboardings (user_id, status, target_ready_date, agency_id)
          VALUES (?, 'pending', ?, ?)
        `,
      )
      .run(userId, targetReadyDate, agencyId).lastInsertRowid,
  );
  const insertStep = db.prepare(
    `
      INSERT INTO team_onboarding_steps (
        onboarding_id,
        title,
        description,
        status,
        sort_order
      )
      VALUES (?, ?, ?, 'pending', ?)
    `,
  );

  teamOnboardingStepTemplates.forEach((template, index) => {
    insertStep.run(onboardingId, template.title, template.description, index + 1);
  });

  return onboardingId;
};

const getProjectsCountByUserId = (userId: number, agencyId?: number | null) => {
  if (agencyId) {
    return (
      db
        .prepare(
          "SELECT COUNT(DISTINCT project_id) as count FROM tasks WHERE assigned_to = ? AND agency_id = ?",
        )
        .get(userId, agencyId) as { count: number }
    ).count;
  }

  return (
    db
      .prepare("SELECT COUNT(DISTINCT project_id) as count FROM tasks WHERE assigned_to = ?")
      .get(userId) as { count: number }
  ).count;
};

const buildTeamMemberResponse = (
  userId: number,
  projects?: number,
  agencyId?: number | null,
) => {
  const user = getUserRecordByIdFull(userId);

  if (
    !user ||
    (agencyId && user.agency_id !== agencyId) ||
    !shouldUseTeamOnboardingForUser(user)
  ) {
    return null;
  }

  const onboarding = getTeamOnboardingByUserId(user.id);

  return {
    id: user.id,
    email: user.email,
    name: user.name,
    role: user.role,
    status: user.status,
    access_status: (user.access_status || "active") as UserAccessStatus,
    activation_token: user.activation_token,
    invited_at: user.invited_at,
    activated_at: user.activated_at,
    projects: projects ?? getProjectsCountByUserId(user.id, user.agency_id),
    onboarding: onboarding ? serializeTeamOnboarding(onboarding.id) : null,
  };
};

const getAgencyIdForAuthUser = (authUser: AuthUser | null) => authUser?.agency_id ?? null;

const getAgencyRequestContext = (authUser?: AuthUser | null) => {
  const agencyId = getAgencyIdForAuthUser(authUser || null);

  if (!authUser || !agencyId) {
    return null;
  }

  return { authUser, agencyId };
};

const getScopedClientRecordForContext = (
  context?: {
    authUser: AuthUser;
    agencyId: number;
  } | null,
) => {
  const scopedClientId = getScopedClientIdForAuthUser(context?.authUser);

  if (!context || !scopedClientId) {
    return null;
  }

  const client = getClientRecordById(scopedClientId);

  if (!client || client.agency_id !== context.agencyId || isArchivedRecord(client)) {
    return undefined;
  }

  return client;
};

const getScopedFreelancerRecordForContext = (
  context?: {
    authUser: AuthUser;
    agencyId: number;
  } | null,
) => {
  const scopedFreelancerId = getScopedFreelancerIdForAuthUser(context?.authUser);

  if (!context || !scopedFreelancerId) {
    return null;
  }

  const freelancer = getFreelancerRecordById(scopedFreelancerId);

  if (!freelancer || freelancer.agency_id !== context.agencyId) {
    return undefined;
  }

  return freelancer;
};

const createLeadFromIntegrationPayload = (
  integration: IntegrationRecord,
  payload: Record<string, unknown>,
) => {
  const company = getPayloadString(payload, [
    "company",
    "company_name",
    "business",
    "organization",
    "lead.company",
  ]);
  const email = getPayloadString(payload, ["email", "contact.email", "lead.email"]);
  const phone = getPayloadString(payload, ["phone", "mobile", "contact.phone", "lead.phone"]);
  const name =
    getPayloadString(payload, ["name", "full_name", "contact_name", "lead.name"]) ||
    company ||
    email ||
    "Lead externo";
  const existingLead =
    email && email.trim().length > 0 ? getLeadRecordByEmail(integration.agency_id, email) : null;

  if (existingLead) {
    return {
      entityType: "lead" as const,
      entityId: existingLead.id,
      summary: `Lead existente reutilizado: ${existingLead.name}.`,
    };
  }

  const service =
    getPayloadString(payload, ["service", "offer", "product", "lead.service"]) ||
    (integration.key === "landing_pages" ? "Captación Landing" : "Integración externa");
  const source =
    getPayloadString(payload, ["source", "utm_source", "channel", "lead.source"]) ||
    integration.name;
  const budget = getPayloadNumber(payload, ["budget", "value", "deal_value", "lead.budget"]);

  const leadId = Number(
    db
      .prepare(
        `
          INSERT INTO leads (
            name,
            company,
            email,
            phone,
            source,
            service,
            budget,
            status,
            agency_id
          )
          VALUES (?, ?, ?, ?, ?, ?, ?, 'new', ?)
        `,
      )
      .run(
        name,
        company || null,
        email || null,
        phone || null,
        source,
        service,
        budget,
        integration.agency_id,
      ).lastInsertRowid,
  );

  return {
    entityType: "lead" as const,
    entityId: leadId,
    summary: `Lead creado desde ${integration.name}: ${name}.`,
  };
};

const createClientFromIntegrationPayload = (
  integration: IntegrationRecord,
  payload: Record<string, unknown>,
) => {
  const company = getPayloadString(payload, [
    "company",
    "company_name",
    "business",
    "organization",
    "client.company",
  ]);

  if (!company) {
    throw new Error("No se pudo crear el cliente porque falta la empresa.");
  }

  const existingClient = getClientRecordByCompany(integration.agency_id, company);

  if (existingClient) {
    return {
      entityType: "client" as const,
      entityId: existingClient.id,
      summary: `Cliente existente reutilizado: ${existingClient.company}.`,
    };
  }

  const industry =
    getPayloadString(payload, ["industry", "sector", "client.industry"]) ||
    "Integración externa";
  const budget = getPayloadNumber(payload, ["budget", "value", "monthly_value", "client.budget"]);

  const clientId = Number(
    db
      .prepare(
        `
          INSERT INTO clients (lead_id, company, industry, budget, status, agency_id)
          VALUES (NULL, ?, ?, ?, 'active', ?)
        `,
      )
      .run(company, industry, budget, integration.agency_id).lastInsertRowid,
  );

  return {
    entityType: "client" as const,
    entityId: clientId,
    summary: `Cliente creado desde ${integration.name}: ${company}.`,
  };
};

const createCalendlyEventFromPayload = (
  integration: IntegrationRecord,
  payload: Record<string, unknown>,
) => {
  const inviteeName =
    getPayloadString(payload, ["invitee.name", "name", "contact_name", "invitee_name"]) ||
    "Reunión externa";
  const eventName =
    getPayloadString(payload, ["event.name", "event_type", "title", "meeting_name"]) ||
    "Reunión Calendly";
  const startAtValue =
    getPayloadString(payload, ["start_at", "event.start_time", "scheduled_at", "starts_at"]) ||
    new Date().toISOString();
  const endAtValue =
    getPayloadString(payload, ["end_at", "event.end_time", "ends_at"]) || null;
  const eventUri =
    getPayloadString(payload, ["event.uri", "event.id", "event_uuid", "uuid"]) ||
    `${eventName}:${startAtValue}`;
  const startAt = parseDateTimeInput(startAtValue, 12);

  if (!startAt) {
    throw new Error("Calendly recibió un evento sin fecha válida.");
  }

  const endAt = parseDateTimeInput(endAtValue, 13);
  const summary = `${eventName} con ${inviteeName}`;
  const event = upsertCalendarEvent({
    title: summary,
    description:
      getPayloadString(payload, ["notes", "description", "event.description"]) ||
      "Reunión creada desde Calendly.",
    eventKind: "meeting",
    sourceType: "calendly",
    sourceRef: eventUri,
    status: "scheduled",
    startAt: startAt.toISOString(),
    endAt: (endAt || addMinutes(startAt, 45)).toISOString(),
    actionTab: "dashboard",
    integrationKey: "calendly",
    agencyId: integration.agency_id,
  });

  const notification = upsertNotification({
    type: "calendar_event",
    severity: "info",
    title: `Nueva reunión: ${eventName}`,
    message: `${inviteeName} agendó una reunión desde Calendly.`,
    actionTab: "dashboard",
    actionEntityType: "calendar_event",
    actionEntityId: event?.id || null,
    sourceType: "calendly",
    sourceRef: eventUri,
    dedupeKey: `calendly:${eventUri}`,
    agencyId: integration.agency_id,
  });

  touchConnectedIntegrationSync({
    agencyId: integration.agency_id,
    integrationKey: "google_calendar",
    summary: `Reunión de Calendly sincronizada con Google Calendar: ${summary}.`,
    payload: {
      calendar_event_id: event?.id || null,
      notification_id: notification?.id || null,
    },
    direction: "outbound",
    eventType: "calendar.calendly_synced",
  });

  return {
    entityType: "calendar_event" as const,
    entityId: event?.id || null,
    summary: `Evento de calendario creado desde Calendly: ${summary}.`,
  };
};

const ingestIntegrationPayload = ({
  integration,
  payload,
}: {
  integration: IntegrationRecord;
  payload: Record<string, unknown>;
}) => {
  if (integration.status !== "connected") {
    return {
      status: "ignored" as const,
      summary: "Evento ignorado porque la integración está desconectada.",
      entityType: null,
      entityId: null,
    };
  }

  if (integration.sync_enabled !== 1) {
    return {
      status: "ignored" as const,
      summary: "Evento ignorado porque la sincronización está desactivada.",
      entityType: null,
      entityId: null,
    };
  }

  if (integration.key === "calendly") {
    try {
      const result = createCalendlyEventFromPayload(integration, payload);

      return {
        status: "success" as const,
        summary: result.summary,
        entityType: result.entityType,
        entityId: result.entityId,
      };
    } catch (error) {
      return {
        status: "error" as const,
        summary:
          error instanceof Error ? error.message : "No se pudo registrar la reunión de Calendly.",
        entityType: null,
        entityId: null,
      };
    }
  }

  if (integration.supports_lead_capture !== 1 || integration.auto_capture_leads !== 1) {
    return {
      status: "ignored" as const,
      summary: "Evento recibido y registrado sin captura automática activa.",
      entityType: null,
      entityId: null,
    };
  }

  const targetEntity = resolveIntegrationTargetEntity(integration, payload);

  try {
    const result =
      targetEntity === "client"
        ? createClientFromIntegrationPayload(integration, payload)
        : createLeadFromIntegrationPayload(integration, payload);

    return {
      status: "success" as const,
      summary: result.summary,
      entityType: result.entityType,
      entityId: result.entityId,
    };
  } catch (error) {
    return {
      status: "error" as const,
      summary:
        error instanceof Error ? error.message : "No se pudo procesar el evento entrante.",
      entityType: null,
      entityId: null,
    };
  }
};

const buildIntegrationSamplePayload = (integration: IntegrationRecord) => {
  if (integration.key === "external_crm") {
    return {
      entity: "client",
      company: "Northwind Ventures",
      industry: "SaaS",
      budget: 6500,
      source: integration.name,
      lifecycle_stage: "customer",
      contact_name: "Laura Gómez",
      email: "laura@northwind.io",
    };
  }

  if (integration.key === "calendly") {
    return {
      event_type: "Strategy Call",
      invitee: {
        name: "Marta Ruiz",
        email: "marta@oriongrowth.com",
      },
      event: {
        uri: "calendly-event-orion-growth",
      },
      start_at: addMinutes(new Date(), 90).toISOString(),
      end_at: addMinutes(new Date(), 135).toISOString(),
      notes: "Primera llamada de descubrimiento y roadmap operativo.",
    };
  }

  return {
    entity: "lead",
    name: "Mario Vega",
    company: "Acme Growth",
    email: "mario@acmegrowth.com",
    phone: "+34 600 123 456",
    budget: 2500,
    source: integration.name,
    service: "Paid Media",
    utm_source: integration.key,
  };
};

const getCurrentSessionIdByToken = (token?: string) =>
  (token
    ? (db.prepare("SELECT id FROM sessions WHERE token = ?").get(token) as
        | { id: number }
        | undefined)
    : undefined)?.id || null;

const getRecentAuditLogs = (agencyId: number, limit: number) =>
  (db
    .prepare(
      `
        SELECT
          id,
          user_id,
          actor_name,
          actor_email,
          action,
          entity_type,
          entity_id,
          description,
          metadata,
          created_at
        FROM audit_logs
        WHERE agency_id = ?
        ORDER BY datetime(created_at) DESC, id DESC
        LIMIT ?
      `,
    )
    .all(agencyId, limit) as Array<{
    id: number;
    user_id: number | null;
    actor_name: string;
    actor_email: string | null;
    action: string;
    entity_type: string;
    entity_id: number | null;
    description: string;
    metadata: string | null;
    created_at: string;
  }>).map((row) => ({
    ...row,
    metadata: parseAuditMetadata(row.metadata),
  }));

const getAIAutomationRuns = ({
  agencyId,
  limit,
  automation,
  mode,
  status,
  triggerKey,
}: {
  agencyId: number;
  limit: number;
  automation?: AiAutomationId | null;
  mode?: AiAutomationMode | null;
  status?: AiAutomationRunStatus | null;
  triggerKey?: AiTriggerSettingKey | null;
}) => {
  const conditions = ["agency_id = ?"];
  const params: Array<string | number> = [agencyId];

  if (automation) {
    conditions.push("automation = ?");
    params.push(automation);
  }

  if (mode) {
    conditions.push("mode = ?");
    params.push(mode);
  }

  if (status) {
    conditions.push("status = ?");
    params.push(status);
  }

  if (triggerKey) {
    conditions.push("trigger_key = ?");
    params.push(triggerKey);
  }

  return (
    db
      .prepare(
        `
          SELECT
            id,
            automation,
            mode,
            status,
            trigger_key,
            entity_type,
            entity_id,
            source,
            summary,
            error_message,
            actions,
            actor_name,
            actor_email,
            created_at
          FROM ai_automation_runs
          WHERE ${conditions.join(" AND ")}
          ORDER BY datetime(created_at) DESC, id DESC
          LIMIT ?
        `,
      )
      .all(...params, limit) as Array<{
      id: number;
      automation: AiAutomationId;
      mode: AiAutomationMode;
      status: AiAutomationRunStatus;
      trigger_key: AiTriggerSettingKey | null;
      entity_type: AiAutomationEntityType;
      entity_id: number | null;
      source: "gemini" | "local";
      summary: string | null;
      error_message: string | null;
      actions: string | null;
      actor_name: string;
      actor_email: string | null;
      created_at: string;
    }>
  ).map((row) => ({
    ...row,
    actions: parseAIAutomationActions(row.actions),
  }));
};

const getAdminTriggerAlertLabel = (triggerKey: AiTriggerSettingKey) => {
  switch (triggerKey) {
    case "ai_trigger_new_lead":
      return "Nuevo lead";
    case "ai_trigger_client_report":
      return "Conversion a cliente";
    case "ai_trigger_project_task_pack":
      return "Nuevo proyecto";
    default:
      return triggerKey;
  }
};

const getLatestAiTriggerAuditStates = (agencyId: number) => {
  const rows = db
    .prepare(
      `
        SELECT action, metadata, created_at
        FROM audit_logs
        WHERE
          agency_id = ?
          AND action IN ('settings.ai_trigger_disabled', 'settings.ai_trigger_enabled')
        ORDER BY datetime(created_at) DESC, id DESC
      `,
    )
    .all(agencyId) as Array<{
    action: "settings.ai_trigger_disabled" | "settings.ai_trigger_enabled";
    metadata: string | null;
    created_at: string;
  }>;

  const latestStates = new Map<
    AiTriggerSettingKey,
    {
      action: "settings.ai_trigger_disabled" | "settings.ai_trigger_enabled";
      created_at: string;
    }
  >();

  rows.forEach((row) => {
    const metadata = parseAuditMetadata(row.metadata);
    const triggerKey = metadata?.trigger_key;

    if (
      typeof triggerKey !== "string" ||
      !AI_TRIGGER_KEYS.includes(triggerKey as AiTriggerSettingKey) ||
      latestStates.has(triggerKey as AiTriggerSettingKey)
    ) {
      return;
    }

    latestStates.set(triggerKey as AiTriggerSettingKey, {
      action: row.action,
      created_at: row.created_at,
    });
  });

  return latestStates;
};

const getAiTriggerRunInsights = (agencyId: number) => {
  const rows = db
    .prepare(
      `
        SELECT trigger_key, status, created_at
        FROM ai_automation_runs
        WHERE
          agency_id = ?
          AND mode = 'trigger'
          AND trigger_key IS NOT NULL
        ORDER BY trigger_key ASC, datetime(created_at) DESC, id DESC
      `,
    )
    .all(agencyId) as Array<{
    trigger_key: AiTriggerSettingKey;
    status: AiAutomationRunStatus;
    created_at: string;
  }>;

  const insights = new Map<
    AiTriggerSettingKey,
    {
      consecutive_error_streak: number;
      last_error_at: string | null;
      last_success_at: string | null;
    }
  >();
  const streakClosed = new Set<AiTriggerSettingKey>();

  AI_TRIGGER_KEYS.forEach((triggerKey) => {
    insights.set(triggerKey, {
      consecutive_error_streak: 0,
      last_error_at: null,
      last_success_at: null,
    });
  });

  rows.forEach((row) => {
    if (!AI_TRIGGER_KEYS.includes(row.trigger_key)) {
      return;
    }

    const current = insights.get(row.trigger_key);

    if (!current) {
      return;
    }

    if (!current.last_error_at && row.status === "error") {
      current.last_error_at = row.created_at;
    }

    if (!current.last_success_at && row.status === "success") {
      current.last_success_at = row.created_at;
    }

    if (streakClosed.has(row.trigger_key)) {
      return;
    }

    if (row.status === "error") {
      current.consecutive_error_streak += 1;
      return;
    }

    streakClosed.add(row.trigger_key);
  });

  return insights;
};

const getAdminAIMetrics = (agencyId: number) => {
  const settings = getAppSettings(agencyId);
  const totals =
    (db
      .prepare(
        `
          SELECT
            COUNT(*) as total_runs_7d,
            SUM(CASE WHEN status = 'success' THEN 1 ELSE 0 END) as success_runs_7d,
            SUM(CASE WHEN status = 'error' THEN 1 ELSE 0 END) as error_runs_7d,
            SUM(CASE WHEN mode = 'trigger' THEN 1 ELSE 0 END) as trigger_runs_7d
          FROM ai_automation_runs
          WHERE agency_id = ? AND datetime(created_at) >= datetime('now', '-7 days')
        `,
      )
      .get(agencyId) as {
      total_runs_7d: number | null;
      success_runs_7d: number | null;
      error_runs_7d: number | null;
      trigger_runs_7d: number | null;
    }) || {
      total_runs_7d: 0,
      success_runs_7d: 0,
      error_runs_7d: 0,
      trigger_runs_7d: 0,
    };

  const topAutomations = db
    .prepare(
      `
        SELECT
          automation,
          COUNT(*) as total,
          SUM(CASE WHEN status = 'error' THEN 1 ELSE 0 END) as errors
        FROM ai_automation_runs
        WHERE agency_id = ? AND datetime(created_at) >= datetime('now', '-7 days')
        GROUP BY automation
        ORDER BY total DESC, automation ASC
        LIMIT 3
      `,
    )
    .all(agencyId) as Array<{
    automation: AiAutomationId;
    total: number;
    errors: number | null;
  }>;

  const topTriggers = db
    .prepare(
      `
        SELECT
          trigger_key,
          COUNT(*) as total
        FROM ai_automation_runs
        WHERE
          agency_id = ?
          AND mode = 'trigger'
          AND trigger_key IS NOT NULL
          AND datetime(created_at) >= datetime('now', '-7 days')
        GROUP BY trigger_key
        ORDER BY total DESC, trigger_key ASC
        LIMIT 3
      `,
    )
    .all(agencyId) as Array<{
    trigger_key: AiTriggerSettingKey;
    total: number;
  }>;

  const recentTriggerFailures = db
    .prepare(
      `
        SELECT
          trigger_key,
          COUNT(*) as total
        FROM ai_automation_runs
        WHERE
          agency_id = ?
          AND mode = 'trigger'
          AND status = 'error'
          AND trigger_key IS NOT NULL
          AND datetime(created_at) >= datetime('now', '-24 hours')
        GROUP BY trigger_key
        ORDER BY total DESC, trigger_key ASC
        LIMIT 3
      `,
    )
    .all(agencyId) as Array<{
    trigger_key: AiTriggerSettingKey;
    total: number;
  }>;

  const totalRuns = totals.total_runs_7d || 0;
  const errorRuns = totals.error_runs_7d || 0;
  const errorRate = totalRuns > 0 ? Math.round((errorRuns / totalRuns) * 100) : 0;
  const triggerFailureMap = new Map(
    recentTriggerFailures.map((item) => [item.trigger_key, item.total]),
  );
  const latestTriggerAuditStates = getLatestAiTriggerAuditStates(agencyId);
  const triggerRunInsights = getAiTriggerRunInsights(agencyId);
  const disabledTriggers = AI_TRIGGER_KEYS
    .filter((triggerKey) => settings[triggerKey] === false)
    .map((triggerKey) => {
      const triggerInsight = triggerRunInsights.get(triggerKey);

      return {
        trigger_key: triggerKey,
        recent_errors_24h: triggerFailureMap.get(triggerKey) || 0,
        disabled_since:
          latestTriggerAuditStates.get(triggerKey)?.action === "settings.ai_trigger_disabled"
            ? latestTriggerAuditStates.get(triggerKey)?.created_at || null
            : null,
        consecutive_error_streak: triggerInsight?.consecutive_error_streak || 0,
        last_error_at: triggerInsight?.last_error_at || null,
        last_success_at: triggerInsight?.last_success_at || null,
      };
    });
  const alerts: Array<{
    id: string;
    severity: "warning" | "critical";
    title: string;
    description: string;
    tab: "ai" | "settings";
    trigger_key?: AiTriggerSettingKey | null;
    run_filters?: {
      automation?: AiAutomationId;
      status?: AiAutomationRunStatus;
      mode?: AiAutomationMode;
      trigger_key?: AiTriggerSettingKey;
    } | null;
  }> = [];

  if (totalRuns >= 5 && errorRate >= 25) {
    alerts.push({
      id: "ai-error-rate-critical",
      severity: "critical",
      title: "Ratio de error IA alto",
      description: `${errorRuns} de ${totalRuns} ejecuciones fallaron en los ultimos 7 dias. Revisa el monitor de IA y las automatizaciones con mas incidencia.`,
      tab: "ai",
      trigger_key: null,
      run_filters: {
        status: "error",
      },
    });
  } else if (totalRuns >= 5 && errorRate >= 10) {
    alerts.push({
      id: "ai-error-rate-warning",
      severity: "warning",
      title: "Ratio de error IA en vigilancia",
      description: `${errorRuns} de ${totalRuns} ejecuciones fallaron en los ultimos 7 dias. Conviene revisar los flujos con mas errores antes de que escalen.`,
      tab: "ai",
      trigger_key: null,
      run_filters: {
        status: "error",
      },
    });
  }

  recentTriggerFailures
    .filter((item) => item.total >= 2 && settings[item.trigger_key])
    .forEach((item) => {
      alerts.push({
        id: `trigger-failures-${item.trigger_key}`,
        severity: item.total >= 3 ? "critical" : "warning",
        title: `Trigger con fallos repetidos: ${getAdminTriggerAlertLabel(item.trigger_key)}`,
        description: `${item.total} ejecuciones automaticas fallaron en las ultimas 24 horas. Revisa si el trigger debe ajustarse o desactivarse temporalmente.`,
        tab: "settings",
        trigger_key: item.trigger_key,
        run_filters: {
          status: "error",
          mode: "trigger",
          trigger_key: item.trigger_key,
        },
      });
    });

  return {
    total_runs_7d: totalRuns,
    success_runs_7d: totals.success_runs_7d || 0,
    error_runs_7d: errorRuns,
    trigger_runs_7d: totals.trigger_runs_7d || 0,
    error_rate_7d: errorRate,
    top_automations: topAutomations.map((item) => ({
      automation: item.automation,
      total: item.total,
      errors: item.errors || 0,
    })),
    top_triggers: topTriggers,
    disabled_triggers: disabledTriggers,
    alerts,
  };
};

const getAdminOverview = (agencyId: number | null, currentSessionToken?: string) => {
  if (!agencyId) {
    return null;
  }

  clearExpiredSessions();

  const currentSessionId = getCurrentSessionIdByToken(currentSessionToken);
  const pendingInviteCount =
    (db
      .prepare(
        "SELECT COUNT(*) as count FROM users WHERE agency_id = ? AND COALESCE(access_status, 'active') = 'invited'",
      )
      .get(agencyId) as { count: number }).count;
  const teamOnboardingsOpenCount =
    (db
      .prepare(
        "SELECT COUNT(*) as count FROM team_onboardings WHERE agency_id = ? AND status != 'completed'",
      )
      .get(agencyId) as { count: number }).count;
  const clientOnboardingsOpenCount =
    (db
      .prepare(
        `
          SELECT COUNT(*) as count
          FROM client_onboardings
          INNER JOIN clients ON clients.id = client_onboardings.client_id
          WHERE client_onboardings.agency_id = ? AND client_onboardings.status != 'completed' AND clients.archived_at IS NULL
        `,
      )
      .get(agencyId) as { count: number }).count;
  const activeSessionsCount =
    (db
      .prepare(
        `
          SELECT COUNT(*) as count
          FROM sessions
          INNER JOIN users ON users.id = sessions.user_id
          WHERE users.agency_id = ? AND datetime(sessions.expires_at) > datetime('now')
        `,
      )
      .get(agencyId) as { count: number }).count;
  const overdueTasksCount =
    (db
      .prepare(
        `
          SELECT COUNT(*) as count
          FROM tasks
          WHERE agency_id = ? AND archived_at IS NULL AND status != 'done' AND date(due_date) < date('now')
        `,
      )
      .get(agencyId) as { count: number }).count;
  const overdueInvoicesCount =
    (db
      .prepare(
        `
          SELECT COUNT(*) as count
          FROM invoices
          WHERE agency_id = ? AND status != 'paid' AND date(due_date) < date('now')
        `,
      )
      .get(agencyId) as { count: number }).count;
  const pendingTeamUserIds = db
    .prepare(
      `
        SELECT DISTINCT users.id
        FROM users
        LEFT JOIN team_onboardings ON team_onboardings.user_id = users.id
        WHERE
          users.agency_id = ?
          AND (
            COALESCE(users.access_status, 'active') = 'invited'
            OR (team_onboardings.id IS NOT NULL AND team_onboardings.status != 'completed')
          )
        ORDER BY COALESCE(users.invited_at, team_onboardings.created_at) DESC, users.id DESC
        LIMIT 6
      `,
    )
    .all(agencyId) as Array<{ id: number }>;

  const pendingTeamMembers = pendingTeamUserIds
    .map((row) => buildTeamMemberResponse(row.id, undefined, agencyId))
    .filter(Boolean);

  const pendingClientOnboardingIds = db
    .prepare(
      `
        SELECT id
        FROM client_onboardings
        WHERE agency_id = ? AND status != 'completed' AND client_id IN (
          SELECT id FROM clients WHERE agency_id = ? AND archived_at IS NULL
        )
        ORDER BY created_at DESC, id DESC
        LIMIT 6
      `,
    )
    .all(agencyId, agencyId) as Array<{ id: number }>;

  const pendingClientOnboardings = pendingClientOnboardingIds
    .map((row) => {
      const onboarding = serializeClientOnboarding(row.id);

      if (!onboarding) {
        return null;
      }

      const client = getClientRecordById(onboarding.client_id);

      return {
        id: onboarding.id,
        client_id: onboarding.client_id,
        client_name: client?.company || `Cliente #${onboarding.client_id}`,
        status: onboarding.status,
        progress: onboarding.progress,
        project_name: onboarding.project_name,
        target_launch_date: onboarding.target_launch_date,
      };
    })
    .filter(Boolean);

  const sessions = db
    .prepare(
      `
        SELECT
          sessions.id,
          sessions.user_id,
          sessions.created_at,
          sessions.expires_at,
          users.name,
          users.email,
          users.role
        FROM sessions
        INNER JOIN users ON users.id = sessions.user_id
        WHERE users.agency_id = ? AND datetime(sessions.expires_at) > datetime('now')
        ORDER BY datetime(sessions.created_at) DESC, sessions.id DESC
        LIMIT 8
      `,
    )
    .all(agencyId) as Array<{
    id: number;
    user_id: number;
    created_at: string;
    expires_at: string;
    name: string;
    email: string;
    role: string;
  }>;

  return {
    kpis: {
      pending_invites: pendingInviteCount,
      team_onboardings_open: teamOnboardingsOpenCount,
      client_onboardings_open: clientOnboardingsOpenCount,
      active_sessions: activeSessionsCount,
      overdue_tasks: overdueTasksCount,
      overdue_invoices: overdueInvoicesCount,
    },
    ai: getAdminAIMetrics(agencyId),
    pending_team_members: pendingTeamMembers,
    pending_client_onboardings: pendingClientOnboardings,
    sessions: sessions.map((session) => ({
      ...session,
      is_current: session.id === currentSessionId,
    })),
    recent_audit: getRecentAuditLogs(agencyId, 6),
  };
};

const defaultAgency = getDefaultAgency();

if (defaultAgency) {
  saveAppSettings(defaultAgency.id, {
    ...defaultAppSettings,
    ...getAppSettings(defaultAgency.id),
  });
  ensureIntegrationCatalog(defaultAgency.id);

  db.prepare("UPDATE users SET status = 'online' WHERE status IS NULL OR status = ''").run();
  db.prepare(
    "UPDATE users SET access_status = 'active' WHERE access_status IS NULL OR access_status = ''",
  ).run();
  db.prepare(
    `
      UPDATE users
      SET activated_at = COALESCE(activated_at, CURRENT_TIMESTAMP)
      WHERE access_status = 'active' AND activated_at IS NULL
    `,
  ).run();

  const insertTeamMember = db.prepare(
    "INSERT OR IGNORE INTO users (email, password, name, role, agency_id, status) VALUES (?, ?, ?, ?, ?, ?)",
  );

  insertTeamMember.run(
    "alex@zaaryx.com",
    hashPassword("temp123"),
    "Alex Rivera",
    "Media Buyer",
    defaultAgency.id,
    "meeting",
  );
  insertTeamMember.run(
    "sofia@zaaryx.com",
    hashPassword("temp123"),
    "Sofia Chen",
    "Project Manager",
    defaultAgency.id,
    "online",
  );
  insertTeamMember.run(
    "marcus@zaaryx.com",
    hashPassword("temp123"),
    "Marcus Thorne",
    "AI Specialist",
    defaultAgency.id,
    "offline",
  );

  const reportCount =
    (db.prepare("SELECT COUNT(*) as count FROM reports").get() as { count: number }).count;

  if (reportCount === 0) {
    const firstClient = db
      .prepare("SELECT id, company, agency_id FROM clients ORDER BY id LIMIT 1")
      .get() as { id: number; company: string; agency_id: number } | undefined;

    if (firstClient) {
      const projectCount =
        (db
          .prepare("SELECT COUNT(*) as count FROM projects WHERE client_id = ?")
          .get(firstClient.id) as { count: number }).count;
      const projectIds = db
        .prepare("SELECT id FROM projects WHERE client_id = ?")
        .all(firstClient.id) as Array<{ id: number }>;
      const projectIdValues = projectIds.map((project) => project.id);

      let campaignCount = 0;
      let activeCampaignCount = 0;
      let totalSpend = 0;
      let averageRoi = 0;
      let pendingTaskCount = 0;

      if (projectIdValues.length > 0) {
        const placeholders = projectIdValues.map(() => "?").join(", ");
        const campaignStats = db
          .prepare(
            `
              SELECT
                COUNT(*) as count,
                SUM(CASE WHEN status = 'active' THEN 1 ELSE 0 END) as active_count,
                COALESCE(SUM(spent), 0) as total_spend,
                COALESCE(AVG(roi), 0) as average_roi
              FROM campaigns
              WHERE project_id IN (${placeholders})
            `,
          )
          .get(...projectIdValues) as {
          count: number;
          active_count: number;
          total_spend: number;
          average_roi: number;
        };

        const taskStats = db
          .prepare(
            `
              SELECT COUNT(*) as count
              FROM tasks
              WHERE status != 'done' AND project_id IN (${placeholders})
            `,
          )
          .get(...projectIdValues) as { count: number };

        campaignCount = campaignStats.count;
        activeCampaignCount = campaignStats.active_count;
        totalSpend = campaignStats.total_spend;
        averageRoi = campaignStats.average_roi;
        pendingTaskCount = taskStats.count;
      }

      const content = buildReportContent({
        clientName: firstClient.company,
        type: "Performance",
        generatedAt: "2026-03-09 09:00",
        projectCount,
        campaignCount,
        activeCampaignCount,
        totalSpend,
        averageRoi,
        pendingTaskCount,
      });

      db.prepare(
        "INSERT INTO reports (client_id, title, type, url, agency_id) VALUES (?, ?, ?, ?, ?)",
      ).run(
        firstClient.id,
        `Reporte Mensual - ${firstClient.company}`,
        "Performance",
        createReportUrl(`Reporte Mensual - ${firstClient.company}`, content),
        firstClient.agency_id || defaultAgency.id,
      );
    }
  }

  const invoiceCount =
    (db.prepare("SELECT COUNT(*) as count FROM invoices").get() as { count: number }).count;

  if (invoiceCount === 0) {
    const allClients = db
      .prepare("SELECT id, company, budget, agency_id FROM clients ORDER BY id ASC")
      .all() as Array<{ id: number; company: string; budget: number; agency_id: number }>;
    const statusCycle: Array<'paid' | 'pending' | 'overdue'> = ['paid', 'pending', 'overdue'];
    const insertInvoice = db.prepare(
      "INSERT INTO invoices (invoice_number, client_id, amount, due_date, status, url, agency_id) VALUES (?, ?, ?, ?, ?, ?, ?)",
    );

    if (allClients.length > 0) {
      allClients.forEach((client, index) => {
        const invoiceNumber = `INV-${String(index + 1).padStart(3, '0')}`;
        const amount = Number(client.budget || 0) || 1000;
        const dueDate = `2026-03-${String(10 + index).padStart(2, '0')}`;
        const status = statusCycle[index % statusCycle.length];
        insertInvoice.run(
          invoiceNumber,
          client.id,
          amount,
          dueDate,
          status,
          createInvoiceUrl(invoiceNumber, client.company, amount, dueDate),
          client.agency_id || defaultAgency.id,
        );
      });
    }
  }

  const servicePriceCount =
    (db.prepare("SELECT COUNT(*) as count FROM service_prices").get() as { count: number }).count;

  if (servicePriceCount === 0) {
    const insertServicePrice = db.prepare(
      `
        INSERT INTO service_prices (
          name,
          category,
          description,
          service_scope,
          unit_label,
          billing_model,
          default_price,
          currency,
          tax_rate,
          legal_label,
          is_active,
          agency_id
        )
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1, ?)
      `,
    );

    [
      ["Gestión Paid Media", "Ads", "Setup, optimización y reporting mensual.", "client", "mes", "monthly", 1500, "EUR", 21, "Servicio mensual de gestión"],
      ["Landing de captación", "Growth", "Diseño, copy y publicación de landing.", "client", "proyecto", "one_time", 950, "EUR", 21, "Proyecto puntual de captación"],
      ["Horas de diseño freelance", "Creative", "Bolsa de horas para creatividades y adaptaciones.", "freelance", "hora", "hourly", 35, "EUR", 21, "Servicio freelance por horas"],
      ["Soporte de automatizaciones", "Automation", "Diseño y mantenimiento de flujos internos.", "both", "mes", "monthly", 600, "EUR", 21, "Soporte técnico recurrente"],
    ].forEach((service) => {
      insertServicePrice.run(...service, defaultAgency.id);
    });
  }

  const freelancerCount =
    (db.prepare("SELECT COUNT(*) as count FROM freelancers").get() as { count: number }).count;

  if (freelancerCount === 0) {
    db.prepare(
      `
        INSERT INTO freelancers (
          name,
          email,
          specialty,
          hourly_rate,
          currency,
          payment_method,
          payout_reference,
          payout_integration_key,
          status,
          agency_id
        )
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'active', ?)
      `,
    ).run(
      "Laura Vega",
      "laura.freelance@zaaryx.com",
      "Diseño Creativo",
      38,
      "EUR",
      "Transferencia",
      "ES91 2100 0418 4502 0005 1332",
      "wise",
      defaultAgency.id,
    );
  }
}

async function startServer() {
  const app = express();
  let viteServer: Awaited<ReturnType<typeof createViteServer>> | null = null;
  let httpServer: HttpServer | null = null;
  let isShuttingDown = false;

  app.disable("x-powered-by");
  app.set("trust proxy", TRUST_PROXY_ENABLED ? 1 : false);

  app.use((req, res, next) => {
    res.setHeader("X-Frame-Options", "DENY");
    res.setHeader("X-Content-Type-Options", "nosniff");
    res.setHeader("Referrer-Policy", "no-referrer");
    res.setHeader("Permissions-Policy", "camera=(), microphone=(), geolocation=()");
    res.setHeader("Cross-Origin-Opener-Policy", "same-origin");
    res.setHeader("Cross-Origin-Resource-Policy", "same-origin");
    res.setHeader("Origin-Agent-Cluster", "?1");
    res.setHeader("X-DNS-Prefetch-Control", "off");
    res.setHeader("X-Permitted-Cross-Domain-Policies", "none");

    if (IS_PRODUCTION && shouldUseSecureCookies(req)) {
      res.setHeader(
        "Strict-Transport-Security",
        "max-age=15552000; includeSubDomains; preload",
      );
    }

    const cspValue = getContentSecurityPolicyValue();

    if (cspValue) {
      res.setHeader("Content-Security-Policy", cspValue);
    }

    next();
  });

  app.use((req, res, next) => {
    const origin = req.headers.origin;

    if (typeof origin === "string" && isAllowedLocalOrigin(origin)) {
      res.setHeader("Access-Control-Allow-Origin", origin);
      res.setHeader("Vary", "Origin");
      res.setHeader("Access-Control-Allow-Credentials", "true");
      res.setHeader("Access-Control-Allow-Headers", "Content-Type");
      res.setHeader("Access-Control-Allow-Methods", "GET,POST,PUT,PATCH,DELETE,OPTIONS");

      if (req.headers["access-control-request-private-network"] === "true") {
        res.setHeader("Access-Control-Allow-Private-Network", "true");
      }
    }

    if (req.method === "OPTIONS") {
      return res.status(204).end();
    }

    next();
  });

  app.use(express.json({ limit: JSON_BODY_LIMIT }));

  const isRemovedReferralPath = (requestPath: string) =>
    requestPath === "/api/referral-overview" ||
    requestPath === "/api/partner-referral-overview" ||
    requestPath === "/api/client-portal/referrals" ||
    requestPath === "/api/freelancer-portal/referrals" ||
    requestPath.startsWith("/api/referral-codes") ||
    requestPath.startsWith("/api/referrals") ||
    requestPath.startsWith("/api/referral-partners") ||
    requestPath.startsWith("/api/partner-referrals") ||
    /^\/api\/clients\/\d+\/referrals$/.test(requestPath) ||
    /^\/api\/public\/referrals\/[^/]+\/capture$/.test(requestPath) ||
    /^\/api\/public\/partner-referrals\/[^/]+\/capture$/.test(requestPath);

  app.use((req, res, next) => {
    if (!isRemovedReferralPath(req.path)) {
      return next();
    }

    return res.status(404).json({ error: "Referral module is not available" });
  });

  app.use("/api/auth", (req, res, next) => {
    res.setHeader("Cache-Control", "no-store, max-age=0");
    res.setHeader("Pragma", "no-cache");
    res.setHeader("Expires", "0");
    next();
  });

  app.get("/healthz", (_req, res) => {
    res.setHeader("Cache-Control", "no-store, max-age=0");
    res.json({
      status: "ok",
      checked_at: new Date().toISOString(),
      environment: IS_PRODUCTION ? "production" : "development",
      release: getReleaseIdentifier(),
      uptime_seconds: Math.round(process.uptime()),
    });
  });

  app.get("/readyz", (_req, res) => {
    res.setHeader("Cache-Control", "no-store, max-age=0");

    const readiness = getRuntimeReadiness();
    const statusCode = readiness.overall_status === "critical" ? 503 : 200;

    res.status(statusCode).json(readiness);
  });

  const requireAuthenticatedUser: express.RequestHandler = (req, res, next) => {
    const user = getAuthUserBySessionToken(getSessionTokenFromCookieHeader(req.headers.cookie));

    if (!user) {
      return res.status(401).json({ error: "Unauthorized" });
    }

    res.locals.authUser = user;
    next();
  };

  const requireSectionAccess = (section: AppSection): express.RequestHandler =>
    (req, res, next) => {
      const authUser = res.locals.authUser as AuthUser | undefined;

      if (!authUser) {
        return res.status(401).json({ error: "Unauthorized" });
      }

      const accessibleSections =
        authUser.accessible_sections?.length > 0
          ? authUser.accessible_sections
          : getAccessibleSectionsForAuthUser(authUser);

      if (!accessibleSections.includes(section)) {
        return res.status(403).json({ error: "Forbidden" });
      }

      next();
    };

  const requireAnySectionAccess = (sections: AppSection[]): express.RequestHandler =>
    (req, res, next) => {
      const authUser = res.locals.authUser as AuthUser | undefined;

      if (!authUser) {
        return res.status(401).json({ error: "Unauthorized" });
      }

      const accessibleSections =
        authUser.accessible_sections?.length > 0
          ? authUser.accessible_sections
          : getAccessibleSectionsForAuthUser(authUser);

      if (!sections.some((section) => accessibleSections.includes(section))) {
        return res.status(403).json({ error: "Forbidden" });
      }

      next();
    };

  app.get("/api/auth/invite/:token", (req, res) => {
    const token = String(req.params.token || "").trim();

    if (!token) {
      return res.status(400).json({ error: "Invitation token is required" });
    }

    const user = getUserRecordByActivationToken(token);

    if (!user || (user.access_status || "active") !== "invited") {
      return res.status(404).json({ error: "Invitation not found" });
    }

    const onboardingId = shouldUseTeamOnboardingForUser(user)
      ? ensureTeamOnboardingForUser(user.id, user.agency_id || null)
      : null;

    res.json({
      name: user.name,
      email: user.email,
      role: user.role,
      onboarding: onboardingId ? serializeTeamOnboarding(onboardingId) : null,
    });
  });

  app.post("/api/auth/activate", (req, res) => {
    const { token, password } = req.body ?? {};

    if (typeof token !== "string" || !token.trim()) {
      return res.status(400).json({ error: "Invitation token is required" });
    }

    if (typeof password !== "string" || password.length < 8) {
      return res
        .status(400)
        .json({ error: "Password must contain at least 8 characters" });
    }

    const user = getUserRecordByActivationToken(token.trim());

    if (!user || (user.access_status || "active") !== "invited") {
      return res.status(404).json({ error: "Invitation not found" });
    }

    const agencyId = user.agency_id;

    if (!agencyId) {
      return res.status(400).json({ error: "Agency not found" });
    }

    const onboardingId = shouldUseTeamOnboardingForUser(user)
      ? ensureTeamOnboardingForUser(user.id, agencyId)
      : null;
    const onboardingSteps = onboardingId ? getTeamOnboardingSteps(onboardingId) : [];
    const activationStep = onboardingSteps.find((step) => step.sort_order === 1) || onboardingSteps[0];

    db.prepare(
      `
        UPDATE users
        SET
          password = ?,
          access_status = 'active',
          activation_token = NULL,
          activated_at = ?,
          status = COALESCE(status, 'offline')
        WHERE id = ?
      `,
    ).run(hashPassword(password), new Date().toISOString(), user.id);

    if (activationStep) {
      db.prepare("UPDATE team_onboarding_steps SET status = 'completed' WHERE id = ?").run(
        activationStep.id,
      );
      syncTeamOnboardingAggregate(onboardingId);
    }

    const activatedUser = getUserRecordByIdFull(user.id);

    if (!activatedUser) {
      return res.status(404).json({ error: "User not found" });
    }

    const { token: sessionToken, durationMs } = createSessionForUser(user.id, agencyId);
    createAuditLog({
      action: "auth.activate",
      entityType: "user",
      entityId: activatedUser.id,
      description: `${activatedUser.name} activó su cuenta y completó el acceso inicial.`,
      userId: activatedUser.id,
      actorName: activatedUser.name,
      actorEmail: activatedUser.email,
      agencyId,
      metadata: {
        role: activatedUser.role,
        onboarding_id: onboardingId,
      },
    });
    res.setHeader("Set-Cookie", createSessionCookie(sessionToken, durationMs, req));
    res.json(
      toAuthUser({
        id: activatedUser.id,
        email: activatedUser.email,
        name: activatedUser.name,
        role: activatedUser.role,
        status: activatedUser.status,
        agency_id: activatedUser.agency_id,
        client_id: activatedUser.client_id,
        freelancer_id: activatedUser.freelancer_id,
      }),
    );
  });

  app.post("/api/auth/password/forgot", async (req, res) => {
    const email = typeof req.body?.email === "string" ? req.body.email.trim() : "";
    const normalizedEmail = email.toLowerCase();
    const requestIp = getRequestIp(req);

    if (!email) {
      return res.status(400).json({ error: "Email is required" });
    }

    const genericResponse: {
      message: string;
      preview_url?: string | null;
      expires_at?: string | null;
    } = {
      message:
        "Si existe una cuenta activa para este email, el proceso de recuperación ya está preparado.",
    };

    const emailRateLimit = getAuthRateLimitStatus("forgot_email", normalizedEmail);
    const ipRateLimit = getAuthRateLimitStatus("forgot_ip", requestIp);

    if (emailRateLimit.blocked || ipRateLimit.blocked) {
      setRetryAfterHeader(
        res,
        Math.max(emailRateLimit.retryAfterMs || 0, ipRateLimit.retryAfterMs || 0),
      );
      return res.json(genericResponse);
    }

    const emailRateLimitAttempt = registerAuthRateLimitFailure("forgot_email", normalizedEmail);
    const ipRateLimitAttempt = registerAuthRateLimitFailure("forgot_ip", requestIp);

    if (emailRateLimitAttempt.justBlocked || ipRateLimitAttempt.justBlocked) {
      createAuthRateLimitAuditLog({
        action: "auth.password_reset_rate_limited",
        description: `Se bloqueó temporalmente la recuperación de acceso para ${normalizedEmail}.`,
        scope: emailRateLimitAttempt.justBlocked ? "forgot_email" : "forgot_ip",
        requestIp,
        retryAfterMs: Math.max(emailRateLimitAttempt.retryAfterMs || 0, ipRateLimitAttempt.retryAfterMs || 0),
        email: normalizedEmail,
      });
      setRetryAfterHeader(
        res,
        Math.max(emailRateLimitAttempt.retryAfterMs || 0, ipRateLimitAttempt.retryAfterMs || 0),
      );
      return res.json(genericResponse);
    }

    const user = getUserRecordByEmailFull(email);

    if (!user || (user.access_status || "active") !== "active" || !user.agency_id) {
      return res.json(genericResponse);
    }

    try {
      let resetRecord = getLatestActivePasswordResetTokenForUser(user.id);
      let reusedExistingToken = Boolean(resetRecord);
      const throttled = shouldThrottlePasswordResetResend(resetRecord?.created_at);

      if (!resetRecord) {
        const resetToken = createPasswordResetToken();
        const expiresAt = new Date(Date.now() + PASSWORD_RESET_TOKEN_TTL_MS).toISOString();

        db.prepare(
          `
            INSERT INTO password_reset_tokens (token, user_id, requested_email, expires_at, agency_id)
            VALUES (?, ?, ?, ?, ?)
          `,
        ).run(resetToken, user.id, user.email, expiresAt, user.agency_id);

        resetRecord = getLatestActivePasswordResetTokenForUser(user.id);
        reusedExistingToken = false;
      }

      const resetUrl = resetRecord ? buildPasswordResetUrl(resetRecord.token, req) : null;
      let delivery: {
        delivered: boolean;
        skipped: boolean;
        reason: string | null;
      } = {
        delivered: false,
        skipped: true,
        reason: throttled ? "cooldown_active" : "missing_reset_url",
      };

      if (resetRecord && resetUrl && !throttled) {
        delivery = await sendPasswordResetEmail({
          to: user.email,
          name: user.name,
          agencyName: getAppSettings(user.agency_id).agency_name,
          resetUrl,
        });
      }

      createAuditLog({
        action: "auth.password_reset_requested",
        entityType: "user",
        entityId: user.id,
        description: `Se preparó una recuperación de acceso para ${user.email}.`,
        userId: user.id,
        actorName: user.name,
        actorEmail: user.email,
        agencyId: user.agency_id,
        metadata: {
          expires_at: resetRecord?.expires_at || null,
          email_delivery: delivery.delivered ? "sent" : delivery.reason || "skipped",
          reused_existing_token: reusedExistingToken,
          throttled,
        },
      });

      if (!IS_PRODUCTION && resetUrl) {
        genericResponse.preview_url = resetUrl;
        genericResponse.expires_at = resetRecord?.expires_at || null;
      }

      const shouldWarnPasswordResetDelivery =
        IS_PRODUCTION &&
        !delivery.delivered &&
        !["cooldown_active", "missing_reset_url"].includes(delivery.reason || "");

      if (shouldWarnPasswordResetDelivery) {
        console.warn("Password reset email was not delivered", {
          email: user.email,
          reason: delivery.reason,
        });
      }

      res.json(genericResponse);
    } catch (error) {
      console.error("Error preparing password reset:", error);
      res.json(genericResponse);
    }
  });

  app.get("/api/auth/password-reset/:token", (req, res) => {
    const token = String(req.params.token || "").trim();

    if (!token) {
      return res.status(400).json({ error: "Reset token is required" });
    }

    const resetRecord = getPasswordResetRecordByToken(token);

    if (!resetRecord) {
      return res.status(404).json({ error: "Password reset token not found" });
    }

    res.json({
      name: resetRecord.name,
      email: resetRecord.email,
      expires_at: resetRecord.expires_at,
    });
  });

  app.post("/api/auth/password/reset", (req, res) => {
    const token = typeof req.body?.token === "string" ? req.body.token.trim() : "";
    const password = req.body?.password;

    if (!token) {
      return res.status(400).json({ error: "Reset token is required" });
    }

    if (typeof password !== "string" || password.length < 8) {
      return res
        .status(400)
        .json({ error: "Password must contain at least 8 characters" });
    }

    const resetRecord = getPasswordResetRecordByToken(token);

    if (!resetRecord) {
      return res.status(404).json({ error: "Password reset token not found" });
    }

    if (!resetRecord.agency_id) {
      return res.status(400).json({ error: "Agency not found" });
    }

    db.prepare("UPDATE users SET password = ? WHERE id = ?").run(
      hashPassword(password),
      resetRecord.user_id,
    );
    invalidatePasswordResetTokensForUser(resetRecord.user_id);
    const revokedSessions = deleteSessionsForUser(resetRecord.user_id);
    const updatedUser = getUserRecordByIdFull(resetRecord.user_id);

    if (!updatedUser) {
      return res.status(404).json({ error: "User not found" });
    }

    createAuditLog({
      action: "auth.password_reset_completed",
      entityType: "user",
      entityId: updatedUser.id,
      description: `${updatedUser.name} restableció su contraseña y recuperó el acceso.`,
      userId: updatedUser.id,
      actorName: updatedUser.name,
      actorEmail: updatedUser.email,
      agencyId: resetRecord.agency_id,
      metadata: {
        revoked_sessions: revokedSessions,
        two_factor_required: isUserTwoFactorEnabled(updatedUser),
      },
    });

    if (isUserTwoFactorEnabled(updatedUser)) {
      const challenge = createTwoFactorChallengeForUser(
        updatedUser.id,
        resetRecord.agency_id,
        "password_reset",
      );

      return res.json(
        createTwoFactorChallengeResponse({
          user: updatedUser,
          challengeToken: challenge.token,
          expiresAt: challenge.expiresAt,
        }),
      );
    }

    const { token: sessionToken, durationMs } = createSessionForUser(
      resetRecord.user_id,
      resetRecord.agency_id,
    );

    res.setHeader("Set-Cookie", createSessionCookie(sessionToken, durationMs, req));
    res.json(
      toAuthUser({
        id: updatedUser.id,
        email: updatedUser.email,
        name: updatedUser.name,
        role: updatedUser.role,
        status: updatedUser.status,
        agency_id: updatedUser.agency_id,
        client_id: updatedUser.client_id,
        freelancer_id: updatedUser.freelancer_id,
      }),
    );
  });

  app.post("/api/auth/login", (req, res) => {
    const { email, password } = req.body ?? {};
    const normalizedEmail = typeof email === "string" ? email.trim().toLowerCase() : "";
    const requestIp = getRequestIp(req);
    const userAgent = String(req.headers["user-agent"] || "Unknown");

    if (typeof email !== "string" || !email.trim()) {
      return res.status(400).json({ error: "Email is required" });
    }

    if (typeof password !== "string" || !password) {
      return res.status(400).json({ error: "Password is required" });
    }

    const emailRateLimit = getAuthRateLimitStatus("login_email", normalizedEmail);
    const ipRateLimit = getAuthRateLimitStatus("login_ip", requestIp);

    if (emailRateLimit.blocked || ipRateLimit.blocked) {
      setRetryAfterHeader(
        res,
        Math.max(emailRateLimit.retryAfterMs || 0, ipRateLimit.retryAfterMs || 0),
      );
      return res.status(429).json({
        error: "Too many login attempts. Try again in a few minutes.",
        retry_after_seconds: Math.max(
          1,
          Math.ceil(Math.max(emailRateLimit.retryAfterMs || 0, ipRateLimit.retryAfterMs || 0) / 1000),
        ),
      });
    }

    const user = getUserRecordByEmailFull(normalizedEmail);
    const passwordMatches = Boolean(user && verifyPassword(password, user.password));

    if (!user || !passwordMatches) {
      const emailAttempt = registerAuthRateLimitFailure("login_email", normalizedEmail);
      const ipAttempt = registerAuthRateLimitFailure("login_ip", requestIp);
      const retryAfterMs = Math.max(emailAttempt.retryAfterMs || 0, ipAttempt.retryAfterMs || 0);

      if (emailAttempt.justBlocked || ipAttempt.justBlocked) {
        createAuthRateLimitAuditLog({
          action: "auth.locked_out",
          description: `Se bloqueó temporalmente el acceso para ${normalizedEmail}.`,
          scope: emailAttempt.justBlocked ? "login_email" : "login_ip",
          requestIp,
          retryAfterMs,
          user,
          email: normalizedEmail,
        });
        setRetryAfterHeader(res, retryAfterMs);
        return res.status(429).json({
          error: "Too many login attempts. Try again in a few minutes.",
          retry_after_seconds: Math.max(1, Math.ceil(retryAfterMs / 1000)),
        });
      }

      return res.status(401).json({ error: "Invalid credentials" });
    }

    clearAuthRateLimit("login_email", normalizedEmail);
    clearAuthRateLimit("login_ip", requestIp);

    if ((user.access_status || "active") !== "active") {
      return res.status(403).json({ error: "Account activation required" });
    }

    const agencyId = user.agency_id;

    if (!agencyId) {
      return res.status(400).json({ error: "Agency not found" });
    }

    if (isUserTwoFactorEnabled(user)) {
      const challenge = createTwoFactorChallengeForUser(user.id, agencyId, "login");

      createAuditLog({
        action: "auth.login_2fa_challenge",
        entityType: "user",
        entityId: user.id,
        description: `${user.name} validó su contraseña y quedó pendiente del segundo factor.`,
        userId: user.id,
        actorName: user.name,
        actorEmail: user.email,
        agencyId,
      });

      return res.json(
        createTwoFactorChallengeResponse({
          user,
          challengeToken: challenge.token,
          expiresAt: challenge.expiresAt,
        }),
      );
    }

    const { token, durationMs } = createSessionForUser(user.id, agencyId);
    const loggedAt = new Date().toISOString();
    createAuditLog({
      action: "auth.login",
      entityType: "session",
      entityId: user.id,
      description: `${user.name} inició sesión.`,
      userId: user.id,
      actorName: user.name,
      actorEmail: user.email,
      agencyId,
      metadata: {
        role: user.role,
        request_ip: requestIp,
      },
    });
    triggerLoginAlertIfEnabled({
      user,
      agencyId,
      requestIp,
      userAgent,
      loggedAt,
      usedTwoFactor: false,
    });
    res.setHeader("Set-Cookie", createSessionCookie(token, durationMs, req));
    res.json(
      toAuthUser({
        id: user.id,
        email: user.email,
        name: user.name,
        role: user.role,
        status: user.status,
        agency_id: user.agency_id,
        client_id: user.client_id,
        freelancer_id: user.freelancer_id,
      }),
    );
  });

  app.post("/api/auth/login/2fa", (req, res) => {
    const challengeToken =
      typeof req.body?.challenge_token === "string" ? req.body.challenge_token.trim() : "";
    const code = typeof req.body?.code === "string" ? req.body.code.trim() : "";
    const requestIp = getRequestIp(req);
    const userAgent = String(req.headers["user-agent"] || "Unknown");

    if (!challengeToken) {
      return res.status(400).json({ error: "2FA challenge token is required" });
    }

    if (!code) {
      return res.status(400).json({ error: "2FA code is required" });
    }

    const challenge = getTwoFactorChallengeByToken(challengeToken);

    if (!challenge) {
      return res.status(404).json({ error: "2FA challenge not found" });
    }

    if (!challenge.agency_id || !isUserTwoFactorEnabled(challenge)) {
      return res.status(400).json({ error: "2FA is not available for this account" });
    }

    const userRateLimit = getAuthRateLimitStatus("two_factor_user", String(challenge.user_id));
    const ipRateLimit = getAuthRateLimitStatus("two_factor_ip", requestIp);

    if (userRateLimit.blocked || ipRateLimit.blocked) {
      setRetryAfterHeader(
        res,
        Math.max(userRateLimit.retryAfterMs || 0, ipRateLimit.retryAfterMs || 0),
      );
      return res.status(429).json({
        error: "Too many 2FA attempts. Try again in a few minutes.",
        retry_after_seconds: Math.max(
          1,
          Math.ceil(Math.max(userRateLimit.retryAfterMs || 0, ipRateLimit.retryAfterMs || 0) / 1000),
        ),
      });
    }

    const usedMethod = verifyTwoFactorTotp(challenge.two_factor_secret, code)
      ? "totp"
      : null;
    const remainingBackupCodes =
      usedMethod === null
        ? consumeTwoFactorBackupCode({
            userId: challenge.user_id,
            storedCodes: challenge.two_factor_backup_codes,
            code,
          })
        : null;

    if (!usedMethod && remainingBackupCodes === null) {
      const userAttempt = registerAuthRateLimitFailure("two_factor_user", String(challenge.user_id));
      const ipAttempt = registerAuthRateLimitFailure("two_factor_ip", requestIp);
      const retryAfterMs = Math.max(userAttempt.retryAfterMs || 0, ipAttempt.retryAfterMs || 0);

      if (userAttempt.justBlocked || ipAttempt.justBlocked) {
        createAuthRateLimitAuditLog({
          action: "auth.2fa_rate_limited",
          description: `Se bloqueó temporalmente la validación 2FA para ${challenge.email}.`,
          scope: userAttempt.justBlocked ? "two_factor_user" : "two_factor_ip",
          requestIp,
          retryAfterMs,
          user: {
            id: challenge.user_id,
            email: challenge.email,
            name: challenge.name,
            agency_id: challenge.agency_id,
          },
        });
        setRetryAfterHeader(res, retryAfterMs);
        return res.status(429).json({
          error: "Too many 2FA attempts. Try again in a few minutes.",
          retry_after_seconds: Math.max(1, Math.ceil(retryAfterMs / 1000)),
        });
      }

      return res.status(401).json({ error: "Invalid 2FA code" });
    }

    clearAuthRateLimit("two_factor_user", String(challenge.user_id));
    clearAuthRateLimit("two_factor_ip", requestIp);
    markTwoFactorChallengeConsumed(challenge.id);

    const { token, durationMs } = createSessionForUser(challenge.user_id, challenge.agency_id);
    const refreshedUser = getUserRecordByIdFull(challenge.user_id);
    const loggedAt = new Date().toISOString();

    if (!refreshedUser) {
      return res.status(404).json({ error: "User not found" });
    }

    createAuditLog({
      action: "auth.login_2fa_completed",
      entityType: "session",
      entityId: refreshedUser.id,
      description: `${refreshedUser.name} completó el segundo factor y accedió al CRM.`,
      userId: refreshedUser.id,
      actorName: refreshedUser.name,
      actorEmail: refreshedUser.email,
      agencyId: challenge.agency_id,
      metadata: {
        method: usedMethod || "backup_code",
        remaining_backup_codes: remainingBackupCodes,
        request_ip: requestIp,
      },
    });
    triggerLoginAlertIfEnabled({
      user: refreshedUser,
      agencyId: challenge.agency_id,
      requestIp,
      userAgent,
      loggedAt,
      usedTwoFactor: true,
    });

    res.setHeader("Set-Cookie", createSessionCookie(token, durationMs, req));
    res.json(
      toAuthUser({
        id: refreshedUser.id,
        email: refreshedUser.email,
        name: refreshedUser.name,
        role: refreshedUser.role,
        status: refreshedUser.status,
        agency_id: refreshedUser.agency_id,
        client_id: refreshedUser.client_id,
        freelancer_id: refreshedUser.freelancer_id,
        two_factor_enabled: refreshedUser.two_factor_enabled,
      }),
    );
  });

  app.get("/api/auth/me", (req, res) => {
    const user = getAuthUserBySessionToken(getSessionTokenFromCookieHeader(req.headers.cookie));

    if (!user) {
      return res.status(401).json({ error: "Unauthorized" });
    }

    res.json(user);
  });

  app.post("/api/auth/logout", (req, res) => {
    const token = getSessionTokenFromCookieHeader(req.headers.cookie);
    const authUser = getAuthUserBySessionToken(token);

    if (token) {
      db.prepare("DELETE FROM sessions WHERE token = ?").run(token);
    }

    if (authUser) {
      createAuditLog({
        action: "auth.logout",
        entityType: "session",
        entityId: authUser.id,
        description: `${authUser.name} cerró sesión.`,
        authUser,
      });
    }

    res.setHeader("Set-Cookie", clearSessionCookie(req));
    res.status(204).end();
  });

  app.post("/api/integrations/webhooks/:secret", (req, res) => {
    const secret = String(req.params.secret || "").trim();

    if (!secret) {
      return res.status(400).json({ error: "Webhook secret is required" });
    }

    const integration = getIntegrationRecordByWebhookSecret(secret);

    if (!integration) {
      return res.status(404).json({ error: "Integration webhook not found" });
    }

    const payload = isPlainObject(req.body) ? req.body : {};
    const eventType =
      getPayloadString(payload, ["event_type", "event", "type"]) || "webhook.received";
    const result = ingestIntegrationPayload({
      integration,
      payload,
    });

    db.prepare(
      "UPDATE integrations SET last_synced_at = CURRENT_TIMESTAMP, updated_at = CURRENT_TIMESTAMP WHERE id = ?",
    ).run(integration.id);

    createIntegrationEvent({
      integrationId: integration.id,
      direction: "inbound",
      eventType,
      status: result.status,
      summary: result.summary,
      payload,
      agencyId: integration.agency_id,
    });

    createAuditLog({
      action:
        result.status === "success"
          ? "integration.webhook_processed"
          : result.status === "ignored"
            ? "integration.webhook_ignored"
            : "integration.webhook_failed",
      entityType: "integration",
      entityId: integration.id,
      description: `${integration.name} recibió un evento externo: ${result.summary}`,
      actorName: "Webhook",
      actorEmail: null,
      agencyId: integration.agency_id,
      metadata: {
        integration_key: integration.key,
        event_type: eventType,
        entity_type: result.entityType,
        entity_id: result.entityId,
      },
    });

    res.status(result.status === "error" ? 400 : result.status === "ignored" ? 202 : 200).json({
      status: result.status,
      summary: result.summary,
      entity_type: result.entityType,
      entity_id: result.entityId,
    });
  });

  app.post("/api/public/referrals/:code/capture", (req, res) => {
    const code = normalizeReferralCodeValue(String(req.params.code || ""));
    const {
      referred_name,
      referred_company,
      referred_email,
      referred_phone,
      source,
      notes,
    } = req.body ?? {};

    if (!code) {
      return res.status(400).json({ error: "Referral code is required" });
    }

    if (typeof referred_name !== "string" || !referred_name.trim()) {
      return res.status(400).json({ error: "Referred name is required" });
    }

    const referralCode = getReferralCodeRecordByCode(code);
    const referrerClient = referralCode ? getClientRecordById(referralCode.client_id) : null;

    if (
      !referralCode ||
      !referrerClient ||
      referralCode.status !== "active" ||
      isArchivedRecord(referrerClient)
    ) {
      return res.status(404).json({ error: "Referral code not available" });
    }

    if (!getAppSettings(referralCode.agency_id).client_referral_program_enabled) {
      return res.status(403).json({ error: "Client referral program is paused" });
    }

    const normalizedEmail =
      typeof referred_email === "string" && referred_email.trim() ? referred_email.trim() : null;
    const existingReferral =
      normalizedEmail ? getReferralByCodeAndEmail(referralCode.id, normalizedEmail) : null;

    if (existingReferral) {
      return res.json({
        created: false,
        referral: serializeReferral(existingReferral.id, req),
      });
    }

    const agencyCurrency = getAppSettings(referralCode.agency_id).currency;

    const result = db.transaction(() => {
      const existingLead =
        normalizedEmail ? getLeadRecordByEmail(referralCode.agency_id, normalizedEmail) : undefined;
      let leadId = existingLead?.id || null;

      if (!leadId) {
        const leadInsert = db
          .prepare(
            `
              INSERT INTO leads (name, company, email, phone, source, service, budget, status, agency_id)
              VALUES (?, ?, ?, ?, ?, ?, ?, 'new', ?)
            `,
          )
          .run(
            referred_name.trim(),
            typeof referred_company === "string" && referred_company.trim()
              ? referred_company.trim()
              : null,
            normalizedEmail,
            typeof referred_phone === "string" && referred_phone.trim()
              ? referred_phone.trim()
              : null,
            `Referral · ${referralCode.code}`,
            "Referral",
            0,
            referralCode.agency_id,
          );

        leadId = Number(leadInsert.lastInsertRowid);
      }

      const referralInsert = db
        .prepare(
          `
            INSERT INTO referrals (
              referral_code_id,
              referrer_client_id,
              referred_name,
              referred_company,
              referred_email,
              referred_phone,
              status,
              payout_status,
              commission_amount,
              currency,
              lead_id,
              source,
              notes,
              agency_id,
              updated_at
            )
            VALUES (?, ?, ?, ?, ?, ?, 'lead', 'pending', 0, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)
          `,
        )
        .run(
          referralCode.id,
          referrerClient.id,
          referred_name.trim(),
          typeof referred_company === "string" && referred_company.trim()
            ? referred_company.trim()
            : null,
          normalizedEmail,
          typeof referred_phone === "string" && referred_phone.trim()
            ? referred_phone.trim()
            : null,
          agencyCurrency,
          leadId,
          typeof source === "string" && source.trim() ? source.trim() : "public_capture",
          typeof notes === "string" && notes.trim() ? notes.trim() : null,
          referralCode.agency_id,
        );

      return {
        referralId: Number(referralInsert.lastInsertRowid),
        leadId,
      };
    })();

    createAuditLog({
      action: "referral.public_captured",
      entityType: "referral",
      entityId: result.referralId,
      description: `Se capturó un referido público con el código ${referralCode.code}.`,
      actorName: "Portal de referidos",
      actorEmail: null,
      agencyId: referralCode.agency_id,
      metadata: {
        code: referralCode.code,
        referrer_client_id: referrerClient.id,
        lead_id: result.leadId,
      },
    });

    res.status(201).json({
      created: true,
      referral: serializeReferral(result.referralId, req),
    });
  });

  app.post("/api/public/partner-referrals/:code/capture", (req, res) => {
    const code = normalizeReferralCodeValue(String(req.params.code || ""));
    const {
      referred_name,
      referred_company,
      referred_email,
      referred_phone,
      source,
      notes,
    } = req.body ?? {};

    if (!code) {
      return res.status(400).json({ error: "Referral code is required" });
    }

    if (typeof referred_name !== "string" || !referred_name.trim()) {
      return res.status(400).json({ error: "Referred name is required" });
    }

    const referralCode = getPartnerReferralCodeRecordByCode(code);
    const partner = referralCode ? getReferralPartnerRecordById(referralCode.partner_id) : null;

    if (!referralCode || !partner || referralCode.status !== "active" || partner.status !== "active") {
      return res.status(404).json({ error: "Referral code not available" });
    }

    if (!getAppSettings(referralCode.agency_id).partner_referral_program_enabled) {
      return res.status(403).json({ error: "Partner referral program is paused" });
    }

    const normalizedEmail =
      typeof referred_email === "string" && referred_email.trim() ? referred_email.trim() : null;
    const existingReferral =
      normalizedEmail ? getPartnerReferralByCodeAndEmail(referralCode.id, normalizedEmail) : null;

    if (existingReferral) {
      return res.json({
        created: false,
        referral: serializePartnerReferralRow(existingReferral, req),
      });
    }

    const agencyCurrency = getAppSettings(referralCode.agency_id).currency;

    const result = db.transaction(() => {
      const existingLead =
        normalizedEmail ? getLeadRecordByEmail(referralCode.agency_id, normalizedEmail) : undefined;
      let leadId = existingLead?.id || null;

      if (!leadId) {
        const leadInsert = db
          .prepare(
            `
              INSERT INTO leads (name, company, email, phone, source, service, budget, status, agency_id)
              VALUES (?, ?, ?, ?, ?, ?, ?, 'new', ?)
            `,
          )
          .run(
            referred_name.trim(),
            typeof referred_company === "string" && referred_company.trim()
              ? referred_company.trim()
              : null,
            normalizedEmail,
            typeof referred_phone === "string" && referred_phone.trim()
              ? referred_phone.trim()
              : null,
            `Referral Partner · ${referralCode.code}`,
            "Referral Partner",
            0,
            referralCode.agency_id,
          );

        leadId = Number(leadInsert.lastInsertRowid);
      }

      const referralInsert = db
        .prepare(
          `
            INSERT INTO partner_referrals (
              referral_code_id,
              partner_id,
              referred_name,
              referred_company,
              referred_email,
              referred_phone,
              status,
              payout_status,
              commission_amount,
              currency,
              lead_id,
              source,
              notes,
              agency_id,
              updated_at
            )
            VALUES (?, ?, ?, ?, ?, ?, 'lead', 'pending', 0, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)
          `,
        )
        .run(
          referralCode.id,
          partner.id,
          referred_name.trim(),
          typeof referred_company === "string" && referred_company.trim()
            ? referred_company.trim()
            : null,
          normalizedEmail,
          typeof referred_phone === "string" && referred_phone.trim()
            ? referred_phone.trim()
            : null,
          agencyCurrency,
          leadId,
          typeof source === "string" && source.trim() ? source.trim() : "public_capture",
          typeof notes === "string" && notes.trim() ? notes.trim() : null,
          referralCode.agency_id,
        );

      return {
        referralId: Number(referralInsert.lastInsertRowid),
        leadId,
      };
    })();

    const owner = getReferralPartnerDisplay(partner);

    createAuditLog({
      action: "partner_referral.public_captured",
      entityType: "partner_referral",
      entityId: result.referralId,
      description: `Se capturó un referido público para ${owner.display_name}.`,
      actorName: "Portal de referidos",
      actorEmail: null,
      agencyId: referralCode.agency_id,
      metadata: {
        code: referralCode.code,
        partner_id: partner.id,
        lead_id: result.leadId,
      },
    });

    const referral = getPartnerReferralRecordById(result.referralId);

    res.status(201).json({
      created: true,
      referral: referral ? serializePartnerReferralRow(referral, req) : null,
    });
  });

  app.use("/api", requireAuthenticatedUser);

  // API Routes
  app.get("/api/auth/sessions", (req, res) => {
    const authUser = res.locals.authUser as AuthUser | undefined;
    const currentSessionId = getCurrentSessionIdByToken(
      getSessionTokenFromCookieHeader(req.headers.cookie),
    );

    if (!authUser) {
      return res.status(401).json({ error: "Unauthorized" });
    }

    const sessions = db
      .prepare(
        `
          SELECT
            sessions.id,
            sessions.user_id,
            sessions.created_at,
            sessions.expires_at,
            users.name,
            users.email,
            users.role
          FROM sessions
          INNER JOIN users ON users.id = sessions.user_id
          WHERE sessions.user_id = ? AND datetime(sessions.expires_at) > datetime('now')
          ORDER BY datetime(sessions.created_at) DESC, sessions.id DESC
        `,
      )
      .all(authUser.id) as Array<{
      id: number;
      user_id: number;
      created_at: string;
      expires_at: string;
      name: string;
      email: string;
      role: string;
    }>;

    res.json(
      sessions.map((session) => ({
        ...session,
        is_current: session.id === currentSessionId,
      })),
    );
  });

  app.post("/api/auth/sessions/:id/revoke", (req, res) => {
    const authUser = res.locals.authUser as AuthUser | undefined;
    const sessionId = Number(req.params.id);
    const currentSessionId = getCurrentSessionIdByToken(
      getSessionTokenFromCookieHeader(req.headers.cookie),
    );

    if (!authUser) {
      return res.status(401).json({ error: "Unauthorized" });
    }

    if (!Number.isInteger(sessionId)) {
      return res.status(400).json({ error: "Invalid session id" });
    }

    if (sessionId === currentSessionId) {
      return res.status(400).json({ error: "Current session cannot be revoked here" });
    }

    const session = db
      .prepare(
        `
          SELECT sessions.id, sessions.user_id, sessions.expires_at
          FROM sessions
          WHERE sessions.id = ? AND sessions.user_id = ?
        `,
      )
      .get(sessionId, authUser.id) as
      | {
          id: number;
          user_id: number;
          expires_at: string;
        }
      | undefined;

    if (!session) {
      return res.status(404).json({ error: "Session not found" });
    }

    db.prepare("DELETE FROM sessions WHERE id = ?").run(session.id);
    createAuditLog({
      action: "auth.session_revoked",
      entityType: "session",
      entityId: session.id,
      description: `${authUser.name} revocó una sesión activa de su cuenta.`,
      authUser,
      metadata: {
        revoked_session_id: session.id,
        expires_at: session.expires_at,
      },
    });

    res.json({ revoked: true });
  });

  app.post("/api/auth/password/change", (req, res) => {
    const authUser = res.locals.authUser as AuthUser | undefined;
    const currentPassword = req.body?.current_password;
    const nextPassword = req.body?.new_password;

    if (!authUser) {
      return res.status(401).json({ error: "Unauthorized" });
    }

    if (typeof currentPassword !== "string" || !currentPassword) {
      return res.status(400).json({ error: "Current password is required" });
    }

    if (typeof nextPassword !== "string" || nextPassword.length < 8) {
      return res
        .status(400)
        .json({ error: "Password must contain at least 8 characters" });
    }

    const user = getUserRecordByIdFull(authUser.id);

    if (!user) {
      return res.status(404).json({ error: "User not found" });
    }

    if (!user.agency_id) {
      return res.status(400).json({ error: "Agency not found" });
    }

    if (!verifyPassword(currentPassword, user.password)) {
      return res.status(401).json({ error: "Current password is incorrect" });
    }

    if (verifyPassword(nextPassword, user.password)) {
      return res.status(400).json({ error: "New password must be different from the current one" });
    }

    db.prepare("UPDATE users SET password = ? WHERE id = ?").run(hashPassword(nextPassword), user.id);
    invalidatePasswordResetTokensForUser(user.id);
    const revokedSessions = deleteSessionsForUser(user.id);
    const { token, durationMs } = createSessionForUser(user.id, user.agency_id);
    const updatedUser = getUserRecordByIdFull(user.id);

    if (!updatedUser) {
      return res.status(404).json({ error: "User not found" });
    }

    createAuditLog({
      action: "auth.password_changed",
      entityType: "user",
      entityId: updatedUser.id,
      description: `${updatedUser.name} actualizó su contraseña.`,
      authUser,
      metadata: {
        revoked_sessions: revokedSessions,
      },
    });

    res.setHeader("Set-Cookie", createSessionCookie(token, durationMs, req));
    res.json({
      success: true,
      user: toAuthUser({
        id: updatedUser.id,
        email: updatedUser.email,
        name: updatedUser.name,
        role: updatedUser.role,
        status: updatedUser.status,
        agency_id: updatedUser.agency_id,
        client_id: updatedUser.client_id,
        freelancer_id: updatedUser.freelancer_id,
        two_factor_enabled: updatedUser.two_factor_enabled,
      }),
    });
  });

  app.get("/api/auth/2fa/status", (req, res) => {
    const authUser = res.locals.authUser as AuthUser | undefined;

    if (!authUser) {
      return res.status(401).json({ error: "Unauthorized" });
    }

    const user = getUserRecordByIdFull(authUser.id);

    if (!user || !user.agency_id) {
      return res.status(404).json({ error: "User not found" });
    }

    res.json({
      enabled: isUserTwoFactorEnabled(user),
      pending_setup: Boolean(user.two_factor_pending_secret),
      confirmed_at: user.two_factor_confirmed_at || null,
      backup_codes_remaining: countRemainingBackupCodes(user.two_factor_backup_codes),
      policy_enabled: getAppSettings(user.agency_id).two_factor,
    });
  });

  app.post("/api/auth/2fa/setup", async (req, res) => {
    const authUser = res.locals.authUser as AuthUser | undefined;

    if (!authUser) {
      return res.status(401).json({ error: "Unauthorized" });
    }

    const user = getUserRecordByIdFull(authUser.id);

    if (!user || !user.agency_id) {
      return res.status(404).json({ error: "User not found" });
    }

    if (isUserTwoFactorEnabled(user)) {
      return res.status(400).json({ error: "2FA is already enabled for this account" });
    }

    try {
      const setup = await getTwoFactorSetupPayload({
        email: user.email,
        agencyName: getAppSettings(user.agency_id).agency_name,
      });

      db.prepare(
        `
          UPDATE users
          SET
            two_factor_pending_secret = ?,
            two_factor_backup_codes = NULL,
            two_factor_confirmed_at = NULL
          WHERE id = ?
        `,
      ).run(setup.secret, user.id);

      createAuditLog({
        action: "auth.2fa_setup_started",
        entityType: "user",
        entityId: user.id,
        description: `${user.name} inició la configuración del segundo factor.`,
        authUser,
      });

      res.json({
        enabled: false,
        pending_setup: true,
        confirmed_at: null,
        backup_codes_remaining: 0,
        policy_enabled: getAppSettings(user.agency_id).two_factor,
        issuer: setup.issuer,
        manual_entry_key: setup.secret,
        otpauth_url: setup.otpauthUrl,
        qr_data_url: setup.qrDataUrl,
      });
    } catch (error) {
      console.error("Error creating 2FA setup payload:", error);
      return res.status(500).json({ error: "2FA setup could not be prepared" });
    }
  });

  app.post("/api/auth/2fa/confirm", (req, res) => {
    const authUser = res.locals.authUser as AuthUser | undefined;
    const code = typeof req.body?.code === "string" ? req.body.code.trim() : "";

    if (!authUser) {
      return res.status(401).json({ error: "Unauthorized" });
    }

    if (!code) {
      return res.status(400).json({ error: "2FA code is required" });
    }

    const user = getUserRecordByIdFull(authUser.id);

    if (!user || !user.agency_id) {
      return res.status(404).json({ error: "User not found" });
    }

    if (!user.two_factor_pending_secret) {
      return res.status(400).json({ error: "No pending 2FA setup found" });
    }

    if (!verifyTwoFactorTotp(user.two_factor_pending_secret, code)) {
      return res.status(401).json({ error: "Invalid 2FA code" });
    }

    const backupCodes = createTwoFactorBackupCodes();
    const confirmedAt = new Date().toISOString();

    db.prepare(
      `
        UPDATE users
        SET
          two_factor_secret = ?,
          two_factor_pending_secret = NULL,
          two_factor_enabled = 1,
          two_factor_backup_codes = ?,
          two_factor_confirmed_at = ?
        WHERE id = ?
      `,
    ).run(
      user.two_factor_pending_secret,
      serializeStoredStringArray(backupCodes.hashedCodes),
      confirmedAt,
      user.id,
    );

    createAuditLog({
      action: "auth.2fa_enabled",
      entityType: "user",
      entityId: user.id,
      description: `${user.name} activó el segundo factor.`,
      authUser,
      metadata: {
        backup_codes_issued: backupCodes.plainCodes.length,
      },
    });

    res.json({
      enabled: true,
      pending_setup: false,
      confirmed_at: confirmedAt,
      backup_codes_remaining: backupCodes.plainCodes.length,
      backup_codes: backupCodes.plainCodes,
      policy_enabled: getAppSettings(user.agency_id).two_factor,
    });
  });

  app.post("/api/auth/2fa/disable", (req, res) => {
    const authUser = res.locals.authUser as AuthUser | undefined;
    const currentPassword =
      typeof req.body?.current_password === "string" ? req.body.current_password : "";
    const code = typeof req.body?.code === "string" ? req.body.code.trim() : "";

    if (!authUser) {
      return res.status(401).json({ error: "Unauthorized" });
    }

    if (!currentPassword) {
      return res.status(400).json({ error: "Current password is required" });
    }

    if (!code) {
      return res.status(400).json({ error: "2FA code is required" });
    }

    const user = getUserRecordByIdFull(authUser.id);

    if (!user || !user.agency_id) {
      return res.status(404).json({ error: "User not found" });
    }

    if (!isUserTwoFactorEnabled(user)) {
      return res.status(400).json({ error: "2FA is not enabled for this account" });
    }

    if (!verifyPassword(currentPassword, user.password)) {
      return res.status(401).json({ error: "Current password is incorrect" });
    }

    const method = verifyTwoFactorTotp(user.two_factor_secret, code)
      ? "totp"
      : consumeTwoFactorBackupCode({
            userId: user.id,
            storedCodes: user.two_factor_backup_codes,
            code,
          }) !== null
        ? "backup_code"
        : null;

    if (!method) {
      return res.status(401).json({ error: "Invalid 2FA code" });
    }

    db.prepare(
      `
        UPDATE users
        SET
          two_factor_secret = NULL,
          two_factor_pending_secret = NULL,
          two_factor_enabled = 0,
          two_factor_backup_codes = NULL,
          two_factor_confirmed_at = NULL
        WHERE id = ?
      `,
    ).run(user.id);

    invalidateTwoFactorChallengesForUser(user.id);

    createAuditLog({
      action: "auth.2fa_disabled",
      entityType: "user",
      entityId: user.id,
      description: `${user.name} desactivó el segundo factor.`,
      authUser,
      metadata: {
        method,
      },
    });

    res.json({
      enabled: false,
      pending_setup: false,
      confirmed_at: null,
      backup_codes_remaining: 0,
      policy_enabled: getAppSettings(user.agency_id).two_factor,
    });
  });

  app.post("/api/auth/2fa/backup-codes/regenerate", (req, res) => {
    const authUser = res.locals.authUser as AuthUser | undefined;
    const currentPassword =
      typeof req.body?.current_password === "string" ? req.body.current_password : "";
    const code = typeof req.body?.code === "string" ? req.body.code.trim() : "";

    if (!authUser) {
      return res.status(401).json({ error: "Unauthorized" });
    }

    if (!currentPassword) {
      return res.status(400).json({ error: "Current password is required" });
    }

    if (!code) {
      return res.status(400).json({ error: "2FA code is required" });
    }

    const user = getUserRecordByIdFull(authUser.id);

    if (!user || !user.agency_id) {
      return res.status(404).json({ error: "User not found" });
    }

    if (!isUserTwoFactorEnabled(user)) {
      return res.status(400).json({ error: "2FA is not enabled for this account" });
    }

    if (!verifyPassword(currentPassword, user.password)) {
      return res.status(401).json({ error: "Current password is incorrect" });
    }

    const method = verifyTwoFactorTotp(user.two_factor_secret, code)
      ? "totp"
      : consumeTwoFactorBackupCode({
            userId: user.id,
            storedCodes: user.two_factor_backup_codes,
            code,
          }) !== null
        ? "backup_code"
        : null;

    if (!method) {
      return res.status(401).json({ error: "Invalid 2FA code" });
    }

    const backupCodes = createTwoFactorBackupCodes();

    db.prepare("UPDATE users SET two_factor_backup_codes = ? WHERE id = ?").run(
      serializeStoredStringArray(backupCodes.hashedCodes),
      user.id,
    );

    createAuditLog({
      action: "auth.2fa_backup_codes_regenerated",
      entityType: "user",
      entityId: user.id,
      description: `${user.name} regeneró sus códigos de respaldo del segundo factor.`,
      authUser,
      metadata: {
        method,
        backup_codes_issued: backupCodes.plainCodes.length,
      },
    });

    res.json({
      enabled: true,
      pending_setup: false,
      confirmed_at: user.two_factor_confirmed_at || new Date().toISOString(),
      backup_codes_remaining: backupCodes.plainCodes.length,
      backup_codes: backupCodes.plainCodes,
      policy_enabled: getAppSettings(user.agency_id).two_factor,
    });
  });

  app.get("/api/stats", requireSectionAccess("dashboard"), (req, res) => {
    const context = getAgencyRequestContext(res.locals.authUser as AuthUser | undefined);
    const scopedClientId = getScopedClientIdForAuthUser(context?.authUser);
    const scopedFreelancerId = getScopedFreelancerIdForAuthUser(context?.authUser);

    if (!context) {
      return res.status(400).json({ error: "Agency not found" });
    }

    if (scopedClientId) {
      const scopedClient = getClientRecordById(scopedClientId);

      if (!scopedClient || scopedClient.agency_id !== context.agencyId || isArchivedRecord(scopedClient)) {
        return res.status(403).json({ error: "Client access is not linked correctly" });
      }

      return res.json({
        leads: {
          count: (db
            .prepare("SELECT COUNT(*) as count FROM reports WHERE agency_id = ? AND client_id = ?")
            .get(context.agencyId, scopedClient.id) as { count: number }).count,
        },
        clients: { count: 1 },
        projects: (db
          .prepare(
            "SELECT COUNT(*) as count FROM projects WHERE agency_id = ? AND client_id = ? AND archived_at IS NULL",
          )
          .get(context.agencyId, scopedClient.id) as { count: number }),
        revenue:
          (db
            .prepare(
              "SELECT COALESCE(SUM(amount), 0) as total FROM invoices WHERE agency_id = ? AND client_id = ? AND status = 'paid'",
            )
            .get(context.agencyId, scopedClient.id) as { total: number }).total,
        mrr: Number(scopedClient.budget || 0),
      });
    }

    if (scopedFreelancerId) {
      const scopedFreelancer = getFreelancerRecordById(scopedFreelancerId);

    if (!scopedFreelancer || scopedFreelancer.agency_id !== context.agencyId) {
      return res.status(403).json({ error: "Freelancer access is not linked correctly" });
    }

    const workspace = getFreelancerWorkspaceData(
      context.agencyId,
      scopedFreelancer.id,
      context.authUser.id,
    );

    const contracts = db
      .prepare(
        `
            SELECT status, total_amount
            FROM contracts
            WHERE agency_id = ? AND freelancer_id = ? AND archived_at IS NULL
          `,
        )
        .all(context.agencyId, scopedFreelancer.id) as Array<{
        status: ContractStatus;
        total_amount: number;
      }>;
      const partner = getReferralPartnerRecordByFreelancerId(context.agencyId, scopedFreelancer.id);
      const referrals = partner
        ? (db
            .prepare(
              `
                SELECT status, payout_status, commission_amount
                FROM partner_referrals
                WHERE agency_id = ? AND partner_id = ?
              `,
            )
            .all(context.agencyId, partner.id) as Array<{
            status: ReferralStatus;
            payout_status: ReferralPayoutStatus;
            commission_amount: number;
          }>)
        : [];
      const paidReferralCommissions =
        Math.round(
          referrals
            .filter((referral) => referral.payout_status === "paid")
            .reduce((sum, referral) => sum + Number(referral.commission_amount || 0), 0) * 100,
        ) / 100;
      const pendingReferralCommissions =
        Math.round(
          referrals
            .filter((referral) => ["pending", "approved"].includes(referral.payout_status))
            .reduce((sum, referral) => sum + Number(referral.commission_amount || 0), 0) * 100,
        ) / 100;
      const totalContractValue =
        Math.round(contracts.reduce((sum, contract) => sum + Number(contract.total_amount || 0), 0) * 100) / 100;
      const pendingContractValue =
        Math.round(
          contracts
            .filter((contract) => ["draft", "review", "ready", "sent"].includes(contract.status))
            .reduce((sum, contract) => sum + Number(contract.total_amount || 0), 0) * 100,
        ) / 100;

      return res.json({
        leads: {
          count: workspace?.tasks.filter((task) => task.status !== "done").length || 0,
        },
        clients: {
          count: workspace?.clients.length || 0,
        },
        projects: { count: workspace?.projects.length || 0 },
        revenue: totalContractValue + paidReferralCommissions,
        mrr: pendingContractValue + pendingReferralCommissions,
      });
    }

    const stats = {
      leads: db
        .prepare("SELECT COUNT(*) as count FROM leads WHERE agency_id = ? AND archived_at IS NULL")
        .get(context.agencyId),
      clients: db
        .prepare("SELECT COUNT(*) as count FROM clients WHERE agency_id = ? AND archived_at IS NULL")
        .get(context.agencyId),
      projects: db
        .prepare("SELECT COUNT(*) as count FROM projects WHERE agency_id = ? AND archived_at IS NULL")
        .get(context.agencyId),
      revenue:
        (db
          .prepare(
            "SELECT COALESCE(SUM(amount), 0) as total FROM invoices WHERE agency_id = ? AND status = 'paid'",
          )
          .get(context.agencyId) as { total: number }).total,
      mrr:
        (db
          .prepare(
            "SELECT COALESCE(SUM(budget), 0) as total FROM clients WHERE agency_id = ? AND status = 'active' AND archived_at IS NULL",
          )
          .get(context.agencyId) as { total: number }).total,
    };
    res.json(stats);
  });

  app.get(
    "/api/team/options",
    requireAnySectionAccess(["team", "contracts", "referrals"]),
    (req, res) => {
      const context = getAgencyRequestContext(res.locals.authUser as AuthUser | undefined);

      if (!context) {
        return res.status(400).json({ error: "Agency not found" });
      }

      if (isExternalPortalUser(context.authUser)) {
        return res.status(403).json({ error: "Portal users cannot access internal team data" });
      }

      const rows = db
        .prepare(
          `
            SELECT id
            FROM users
            WHERE agency_id = ? AND COALESCE(access_status, 'active') = 'active'
            ORDER BY name ASC
          `,
        )
        .all(context.agencyId) as Array<{ id: number }>;

      res.json(
        rows
          .map((row) => buildTeamMemberResponse(row.id, undefined, context.agencyId))
          .filter(Boolean),
      );
    },
  );

  app.get(
    "/api/task-assignees",
    requireAnySectionAccess(["tasks", "projects", "team", "contracts"]),
    (req, res) => {
      const context = getAgencyRequestContext(res.locals.authUser as AuthUser | undefined);

      if (!context) {
        return res.status(400).json({ error: "Agency not found" });
      }

      if (isExternalPortalUser(context.authUser)) {
        return res.status(403).json({ error: "Portal users cannot access assignee options" });
      }

      res.json(
        getTaskAssignableUsersForAgency(context.agencyId).map((user) => ({
          id: user.id,
          email: user.email,
          name: user.name,
          role: user.role,
          access_status: (user.access_status || "active") as UserAccessStatus,
          client_id: user.client_id,
          freelancer_id: user.freelancer_id,
        })),
      );
    },
  );

  app.get("/api/referral-overview", requireSectionAccess("referrals"), (req, res) => {
    const context = getAgencyRequestContext(res.locals.authUser as AuthUser | undefined);

    if (!context) {
      return res.status(400).json({ error: "Agency not found" });
    }

    res.json(getReferralOverview(context.agencyId, req));
  });

  app.get("/api/referral-codes", requireSectionAccess("referrals"), (req, res) => {
    const context = getAgencyRequestContext(res.locals.authUser as AuthUser | undefined);
    const clientId = Number(req.query.client_id || 0);
    const status = typeof req.query.status === "string" ? req.query.status.trim() : "";

    if (!context) {
      return res.status(400).json({ error: "Agency not found" });
    }

    const rows = db
      .prepare(
        `
          SELECT *
          FROM referral_codes
          WHERE agency_id = ?
            AND (? <= 0 OR client_id = ?)
            AND (? = '' OR status = ?)
          ORDER BY datetime(created_at) DESC, id DESC
        `,
      )
      .all(context.agencyId, clientId, clientId, status, status) as ReferralCodeRow[];

    res.json(
      rows
        .map((referralCode) => serializeReferralCodeRow(referralCode, req))
        .filter(Boolean),
    );
  });

  app.post("/api/referral-codes", requireSectionAccess("referrals"), (req, res) => {
    const context = getAgencyRequestContext(res.locals.authUser as AuthUser | undefined);
    const {
      client_id,
      code,
      landing_url,
      commission_type,
      commission_value,
      reward_description,
      notes,
      status,
    } = req.body ?? {};

    if (!context) {
      return res.status(400).json({ error: "Agency not found" });
    }

    const parsedClientId = Number(client_id);
    const client =
      Number.isInteger(parsedClientId) && parsedClientId > 0
        ? getClientRecordById(parsedClientId)
        : undefined;

    if (!client || client.agency_id !== context.agencyId || isArchivedRecord(client)) {
      return res.status(400).json({ error: "Client not found" });
    }

    const resolvedCommissionType =
      commission_type === "fixed" ? "fixed" : "percent";
    const resolvedCommissionValue = Number(commission_value);
    const allowedStatuses = new Set<ReferralCodeStatus>(["active", "paused", "archived"]);

    if (!Number.isFinite(resolvedCommissionValue) || resolvedCommissionValue <= 0) {
      return res.status(400).json({ error: "Commission value must be greater than 0" });
    }

    if (status && !allowedStatuses.has(status)) {
      return res.status(400).json({ error: "Invalid referral code status" });
    }

    const normalizedCode =
      typeof code === "string" && code.trim()
        ? normalizeReferralCodeValue(code)
        : generateUniqueReferralCode(client.company);

    if (!normalizedCode) {
      return res.status(400).json({ error: "Referral code is required" });
    }

    const existingCode = getReferralCodeRecordByCode(normalizedCode);

    if (existingCode) {
      return res.status(409).json({ error: "This referral code already exists" });
    }

    const result = db
      .prepare(
        `
          INSERT INTO referral_codes (
            client_id,
            code,
            landing_url,
            commission_type,
            commission_value,
            reward_description,
            status,
            notes,
            agency_id,
            updated_at
          )
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)
        `,
      )
      .run(
        client.id,
        normalizedCode,
        typeof landing_url === "string" && landing_url.trim() ? landing_url.trim() : null,
        resolvedCommissionType,
        resolvedCommissionValue,
        typeof reward_description === "string" && reward_description.trim()
          ? reward_description.trim()
          : null,
        (status as ReferralCodeStatus | undefined) || "active",
        typeof notes === "string" && notes.trim() ? notes.trim() : null,
        context.agencyId,
      );

    const referralCode = serializeReferralCode(Number(result.lastInsertRowid), req);

    createAuditLog({
      action: "referral.code_created",
      entityType: "referral_code",
      entityId: Number(result.lastInsertRowid),
      description: `Se creó un código de referido para ${client.company}.`,
      authUser: context.authUser,
      metadata: {
        client_id: client.id,
        code: normalizedCode,
        commission_type: resolvedCommissionType,
        commission_value: resolvedCommissionValue,
      },
    });

    res.status(201).json(referralCode);
  });

  app.patch("/api/referral-codes/:id", requireSectionAccess("referrals"), (req, res) => {
    const context = getAgencyRequestContext(res.locals.authUser as AuthUser | undefined);
    const referralCodeId = Number(req.params.id);
    const {
      landing_url,
      commission_type,
      commission_value,
      reward_description,
      status,
      notes,
    } = req.body ?? {};

    if (!context) {
      return res.status(400).json({ error: "Agency not found" });
    }

    const referralCode = getReferralCodeRecordById(referralCodeId);

    if (!Number.isInteger(referralCodeId) || !referralCode || referralCode.agency_id !== context.agencyId) {
      return res.status(404).json({ error: "Referral code not found" });
    }

    const nextCommissionType =
      commission_type === undefined
        ? referralCode.commission_type
        : commission_type === "fixed"
          ? "fixed"
          : commission_type === "percent"
            ? "percent"
            : null;
    const nextCommissionValue =
      commission_value === undefined ? referralCode.commission_value : Number(commission_value);
    const allowedStatuses = new Set<ReferralCodeStatus>(["active", "paused", "archived"]);
    const nextStatus =
      status === undefined ? referralCode.status : allowedStatuses.has(status) ? status : null;

    if (!nextCommissionType) {
      return res.status(400).json({ error: "Invalid commission type" });
    }

    if (!Number.isFinite(nextCommissionValue) || nextCommissionValue <= 0) {
      return res.status(400).json({ error: "Commission value must be greater than 0" });
    }

    if (!nextStatus) {
      return res.status(400).json({ error: "Invalid referral code status" });
    }

    db.prepare(
      `
        UPDATE referral_codes
        SET
          landing_url = ?,
          commission_type = ?,
          commission_value = ?,
          reward_description = ?,
          status = ?,
          notes = ?,
          updated_at = CURRENT_TIMESTAMP
        WHERE id = ?
      `,
    ).run(
      landing_url === undefined
        ? referralCode.landing_url
        : typeof landing_url === "string" && landing_url.trim()
          ? landing_url.trim()
          : null,
      nextCommissionType,
      nextCommissionValue,
      reward_description === undefined
        ? referralCode.reward_description
        : typeof reward_description === "string" && reward_description.trim()
          ? reward_description.trim()
          : null,
      nextStatus,
      notes === undefined
        ? referralCode.notes
        : typeof notes === "string" && notes.trim()
          ? notes.trim()
          : null,
      referralCode.id,
    );

    createAuditLog({
      action: "referral.code_updated",
      entityType: "referral_code",
      entityId: referralCode.id,
      description: `Se actualizó el código de referido ${referralCode.code}.`,
      authUser: context.authUser,
      metadata: {
        status: nextStatus,
        commission_type: nextCommissionType,
        commission_value: nextCommissionValue,
      },
    });

    res.json(serializeReferralCode(referralCode.id, req));
  });

  app.post("/api/referral-codes/:id/regenerate", requireSectionAccess("referrals"), (req, res) => {
    const context = getAgencyRequestContext(res.locals.authUser as AuthUser | undefined);
    const referralCodeId = Number(req.params.id);

    if (!context) {
      return res.status(400).json({ error: "Agency not found" });
    }

    const referralCode = getReferralCodeRecordById(referralCodeId);
    const client = referralCode ? getClientRecordById(referralCode.client_id) : null;

    if (
      !Number.isInteger(referralCodeId) ||
      !referralCode ||
      referralCode.agency_id !== context.agencyId ||
      !client
    ) {
      return res.status(404).json({ error: "Referral code not found" });
    }

    const nextCode = generateUniqueReferralCode(client.company);

    db.prepare(
      "UPDATE referral_codes SET code = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?",
    ).run(nextCode, referralCode.id);

    createAuditLog({
      action: "referral.code_regenerated",
      entityType: "referral_code",
      entityId: referralCode.id,
      description: `Se regeneró el código de referido para ${client.company}.`,
      authUser: context.authUser,
      metadata: {
        previous_code: referralCode.code,
        next_code: nextCode,
      },
    });

    res.json({
      regenerated: true,
      referral_code: serializeReferralCode(referralCode.id, req),
    });
  });

  app.get("/api/referrals", requireSectionAccess("referrals"), (req, res) => {
    const context = getAgencyRequestContext(res.locals.authUser as AuthUser | undefined);
    const clientId = Number(req.query.client_id || 0);
    const status = typeof req.query.status === "string" ? req.query.status.trim() : "";
    const payoutStatus =
      typeof req.query.payout_status === "string" ? req.query.payout_status.trim() : "";

    if (!context) {
      return res.status(400).json({ error: "Agency not found" });
    }

    const rows = db
      .prepare(
        `
          SELECT *
          FROM referrals
          WHERE agency_id = ?
            AND (? <= 0 OR referrer_client_id = ?)
            AND (? = '' OR status = ?)
            AND (? = '' OR payout_status = ?)
          ORDER BY datetime(created_at) DESC, id DESC
        `,
      )
      .all(context.agencyId, clientId, clientId, status, status, payoutStatus, payoutStatus) as ReferralRow[];

    res.json(rows.map((referral) => serializeReferralRow(referral, req)).filter(Boolean));
  });

  app.post("/api/referrals", requireSectionAccess("referrals"), (req, res) => {
    const context = getAgencyRequestContext(res.locals.authUser as AuthUser | undefined);
    const {
      referral_code_id,
      referred_name,
      referred_company,
      referred_email,
      referred_phone,
      source,
      notes,
      auto_create_lead,
    } = req.body ?? {};

    if (!context) {
      return res.status(400).json({ error: "Agency not found" });
    }

    const referralCodeId = Number(referral_code_id);
    const referralCode =
      Number.isInteger(referralCodeId) && referralCodeId > 0
        ? getReferralCodeRecordById(referralCodeId)
        : undefined;
    const referrerClient = referralCode ? getClientRecordById(referralCode.client_id) : null;

    if (
      !referralCode ||
      referralCode.agency_id !== context.agencyId ||
      !referrerClient ||
      isArchivedRecord(referrerClient) ||
      referralCode.status === "archived"
    ) {
      return res.status(400).json({ error: "Referral code not found" });
    }

    if (typeof referred_name !== "string" || !referred_name.trim()) {
      return res.status(400).json({ error: "Referred name is required" });
    }

    const normalizedEmail =
      typeof referred_email === "string" && referred_email.trim() ? referred_email.trim() : null;

    if (normalizedEmail && getReferralByCodeAndEmail(referralCode.id, normalizedEmail)) {
      return res.status(409).json({ error: "There is already a referral for this email and code" });
    }

    const shouldCreateLead = auto_create_lead !== false;
    const currency = getAppSettings(context.agencyId).currency;

    const result = db.transaction(() => {
      let leadId: number | null = null;

      if (shouldCreateLead) {
        const existingLead = normalizedEmail
          ? getLeadRecordByEmail(context.agencyId, normalizedEmail)
          : undefined;

        if (existingLead && !isArchivedRecord(existingLead)) {
          leadId = existingLead.id;
        } else {
          const leadInsert = db
            .prepare(
              `
                INSERT INTO leads (name, company, email, phone, source, service, budget, status, agency_id)
                VALUES (?, ?, ?, ?, ?, ?, ?, 'new', ?)
              `,
            )
            .run(
              referred_name.trim(),
              typeof referred_company === "string" && referred_company.trim()
                ? referred_company.trim()
                : null,
              normalizedEmail,
              typeof referred_phone === "string" && referred_phone.trim()
                ? referred_phone.trim()
                : null,
              `Referral · ${referralCode.code}`,
              "Referral",
              0,
              context.agencyId,
            );

          leadId = Number(leadInsert.lastInsertRowid);
        }
      }

      const referralInsert = db
        .prepare(
          `
            INSERT INTO referrals (
              referral_code_id,
              referrer_client_id,
              referred_name,
              referred_company,
              referred_email,
              referred_phone,
              status,
              payout_status,
              commission_amount,
              currency,
              lead_id,
              source,
              notes,
              agency_id,
              updated_at
            )
            VALUES (?, ?, ?, ?, ?, ?, ?, 'pending', 0, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)
          `,
        )
        .run(
          referralCode.id,
          referrerClient.id,
          referred_name.trim(),
          typeof referred_company === "string" && referred_company.trim()
            ? referred_company.trim()
            : null,
          normalizedEmail,
          typeof referred_phone === "string" && referred_phone.trim() ? referred_phone.trim() : null,
          leadId ? "lead" : "invited",
          currency,
          leadId,
          typeof source === "string" && source.trim() ? source.trim() : "manual",
          typeof notes === "string" && notes.trim() ? notes.trim() : null,
          context.agencyId,
        );

      return {
        referralId: Number(referralInsert.lastInsertRowid),
        leadId,
      };
    })();

    createAuditLog({
      action: "referral.created",
      entityType: "referral",
      entityId: result.referralId,
      description: `Se registró un nuevo referido para ${referrerClient.company}.`,
      authUser: context.authUser,
      metadata: {
        referral_code_id: referralCode.id,
        code: referralCode.code,
        lead_id: result.leadId,
      },
    });

    res.status(201).json(serializeReferral(result.referralId, req));
  });

  app.patch("/api/referrals/:id/status", requireSectionAccess("referrals"), (req, res) => {
    const context = getAgencyRequestContext(res.locals.authUser as AuthUser | undefined);
    const referralId = Number(req.params.id);
    const {
      status,
      payout_status,
      commission_amount,
      payout_due_date,
      invoice_id,
      notes,
      converted_client_id,
    } = req.body ?? {};

    if (!context) {
      return res.status(400).json({ error: "Agency not found" });
    }

    const referral = getReferralRecordById(referralId);

    if (!Number.isInteger(referralId) || !referral || referral.agency_id !== context.agencyId) {
      return res.status(404).json({ error: "Referral not found" });
    }

    const referralCode = getReferralCodeRecordById(referral.referral_code_id);

    if (!referralCode) {
      return res.status(404).json({ error: "Referral code not found" });
    }

    const allowedStatuses = new Set<ReferralStatus>([
      "invited",
      "lead",
      "qualified",
      "converted",
      "rejected",
    ]);
    const allowedPayoutStatuses = new Set<ReferralPayoutStatus>([
      "pending",
      "approved",
      "paid",
      "cancelled",
    ]);

    const nextStatus =
      status === undefined ? referral.status : allowedStatuses.has(status) ? status : null;
    const nextPayoutStatus =
      payout_status === undefined
        ? referral.payout_status
        : allowedPayoutStatuses.has(payout_status)
          ? payout_status
          : null;

    if (!nextStatus) {
      return res.status(400).json({ error: "Invalid referral status" });
    }

    if (!nextPayoutStatus) {
      return res.status(400).json({ error: "Invalid payout status" });
    }

    const parsedInvoiceId = Number(invoice_id);
    const invoice =
      Number.isInteger(parsedInvoiceId) && parsedInvoiceId > 0
        ? getInvoiceRecordById(parsedInvoiceId)
        : referral.invoice_id
          ? getInvoiceRecordById(referral.invoice_id)
          : undefined;

    if (invoice && invoice.agency_id !== context.agencyId) {
      return res.status(400).json({ error: "Invoice not found" });
    }

    const parsedConvertedClientId = Number(converted_client_id);
    let resolvedConvertedClient =
      Number.isInteger(parsedConvertedClientId) && parsedConvertedClientId > 0
        ? getClientRecordById(parsedConvertedClientId)
        : referral.converted_client_id
          ? getClientRecordById(referral.converted_client_id)
          : referral.lead_id
            ? getClientRecordByLeadId(referral.lead_id)
            : referral.referred_company
              ? getClientRecordByCompany(context.agencyId, referral.referred_company)
              : undefined;

    if (resolvedConvertedClient && resolvedConvertedClient.agency_id !== context.agencyId) {
      return res.status(400).json({ error: "Converted client not found" });
    }

    if (invoice) {
      if (resolvedConvertedClient && invoice.client_id !== resolvedConvertedClient.id) {
        return res.status(400).json({ error: "Invoice does not belong to the converted client" });
      }

      if (!resolvedConvertedClient) {
        resolvedConvertedClient = getClientRecordById(invoice.client_id);
      }
    }

    const nextCommissionAmount =
      commission_amount === undefined
        ? invoice
          ? calculateReferralCommission({
              commissionType: referralCode.commission_type,
              commissionValue: referralCode.commission_value,
              invoiceAmount: invoice.amount,
            })
          : referral.commission_amount
        : Number(commission_amount);

    if (!Number.isFinite(nextCommissionAmount) || nextCommissionAmount < 0) {
      return res.status(400).json({ error: "Invalid commission amount" });
    }

    if (
      payout_due_date !== undefined &&
      payout_due_date !== null &&
      (typeof payout_due_date !== "string" || Number.isNaN(new Date(payout_due_date).getTime()))
    ) {
      return res.status(400).json({ error: "Invalid payout due date" });
    }

    db.prepare(
      `
        UPDATE referrals
        SET
          status = ?,
          payout_status = ?,
          commission_amount = ?,
          payout_due_date = ?,
          paid_at = ?,
          converted_client_id = ?,
          invoice_id = ?,
          notes = ?,
          converted_at = ?,
          updated_at = CURRENT_TIMESTAMP
        WHERE id = ?
      `,
    ).run(
      nextStatus,
      nextPayoutStatus,
      nextCommissionAmount,
      payout_due_date === undefined
        ? referral.payout_due_date
        : typeof payout_due_date === "string"
          ? payout_due_date
          : null,
      nextPayoutStatus === "paid" ? referral.paid_at || new Date().toISOString() : null,
      resolvedConvertedClient?.id || null,
      invoice?.id || null,
      notes === undefined
        ? referral.notes
        : typeof notes === "string" && notes.trim()
          ? notes.trim()
          : null,
      nextStatus === "converted" ? referral.converted_at || new Date().toISOString() : null,
      referral.id,
    );

    createAuditLog({
      action: "referral.updated",
      entityType: "referral",
      entityId: referral.id,
      description: `Se actualizó el referido ${referral.referred_name}.`,
      authUser: context.authUser,
      metadata: {
        status: nextStatus,
        payout_status: nextPayoutStatus,
        commission_amount: nextCommissionAmount,
        invoice_id: invoice?.id || null,
        converted_client_id: resolvedConvertedClient?.id || null,
      },
    });

    res.json(serializeReferral(referral.id, req));
  });

  app.get("/api/clients/:id/referrals", requireSectionAccess("clients"), (req, res) => {
    const context = getAgencyRequestContext(res.locals.authUser as AuthUser | undefined);
    const clientId = Number(req.params.id);

    if (!context) {
      return res.status(400).json({ error: "Agency not found" });
    }

    if (!Number.isInteger(clientId)) {
      return res.status(400).json({ error: "Invalid client id" });
    }

    const portal = getClientReferralPortal(clientId, context.agencyId, req);

    if (!portal) {
      return res.status(404).json({ error: "Client referral portal not found" });
    }

    res.json(portal);
  });

  app.get("/api/client-portal/referrals", requireSectionAccess("client_referrals"), (req, res) => {
    const context = getAgencyRequestContext(res.locals.authUser as AuthUser | undefined);
    const scopedClient = getScopedClientRecordForContext(context);

    if (!context) {
      return res.status(400).json({ error: "Agency not found" });
    }

    if (scopedClient === undefined) {
      return res.status(403).json({ error: "Client access is not linked correctly" });
    }

    if (!scopedClient) {
      return res.status(403).json({ error: "Only linked client users can access this portal" });
    }

    if (!getAppSettings(context.agencyId).client_referral_program_enabled) {
      return res.status(403).json({ error: "Client referral program is paused" });
    }

    const portal = getClientReferralPortal(scopedClient.id, context.agencyId, req);

    if (!portal) {
      return res.status(404).json({ error: "Client referral portal not found" });
    }

    res.json(portal);
  });

  app.get("/api/freelancer-portal/referrals", requireSectionAccess("freelancer_referrals"), (req, res) => {
    const context = getAgencyRequestContext(res.locals.authUser as AuthUser | undefined);
    const scopedFreelancer = getScopedFreelancerRecordForContext(context);

    if (!context) {
      return res.status(400).json({ error: "Agency not found" });
    }

    if (scopedFreelancer === undefined) {
      return res.status(403).json({ error: "Freelancer access is not linked correctly" });
    }

    if (!scopedFreelancer) {
      return res.status(403).json({ error: "Only linked freelancer users can access this portal" });
    }

    if (!getAppSettings(context.agencyId).partner_referral_program_enabled) {
      return res.status(403).json({ error: "Freelancer referral program is paused" });
    }

    const portal = getFreelancerReferralPortal(context.agencyId, scopedFreelancer.id, req);

    if (!portal) {
      return res.status(404).json({ error: "Freelancer referral portal not found" });
    }

    res.json(portal);
  });

  app.get("/api/freelancer-portal/workspace", requireSectionAccess("projects"), (req, res) => {
    const context = getAgencyRequestContext(res.locals.authUser as AuthUser | undefined);
    const scopedFreelancer = getScopedFreelancerRecordForContext(context);

    if (!context) {
      return res.status(400).json({ error: "Agency not found" });
    }

    if (scopedFreelancer === undefined) {
      return res.status(403).json({ error: "Freelancer access is not linked correctly" });
    }

    if (!scopedFreelancer) {
      return res.status(403).json({ error: "Only linked freelancer users can access this workspace" });
    }

    const portal = getFreelancerWorkspacePortal(
      context.agencyId,
      scopedFreelancer.id,
      context.authUser.id,
    );

    if (!portal) {
      return res.status(404).json({ error: "Freelancer workspace not found" });
    }

    res.json(portal);
  });

  app.get("/api/freelancer-portal/tasks", requireSectionAccess("tasks"), (req, res) => {
    const context = getAgencyRequestContext(res.locals.authUser as AuthUser | undefined);
    const scopedFreelancer = getScopedFreelancerRecordForContext(context);

    if (!context) {
      return res.status(400).json({ error: "Agency not found" });
    }

    if (scopedFreelancer === undefined) {
      return res.status(403).json({ error: "Freelancer access is not linked correctly" });
    }

    if (!scopedFreelancer) {
      return res.status(403).json({ error: "Only linked freelancer users can access these tasks" });
    }

    const portal = getFreelancerTasksPortal(context.agencyId, scopedFreelancer.id, context.authUser.id);

    if (!portal) {
      return res.status(404).json({ error: "Freelancer tasks portal not found" });
    }

    res.json(portal);
  });

  app.patch("/api/freelancer-portal/tasks/:id/status", requireSectionAccess("tasks"), (req, res) => {
    const context = getAgencyRequestContext(res.locals.authUser as AuthUser | undefined);
    const scopedFreelancer = getScopedFreelancerRecordForContext(context);
    const taskId = Number(req.params.id);
    const { status } = req.body ?? {};
    const allowedStatuses = new Set(["todo", "in_progress", "review", "done"]);

    if (!context) {
      return res.status(400).json({ error: "Agency not found" });
    }

    if (scopedFreelancer === undefined) {
      return res.status(403).json({ error: "Freelancer access is not linked correctly" });
    }

    if (!scopedFreelancer) {
      return res.status(403).json({ error: "Only linked freelancer users can update tasks" });
    }

    if (!Number.isInteger(taskId) || !allowedStatuses.has(status)) {
      return res.status(400).json({ error: "Invalid task id or status" });
    }

    const task = getTaskRecordByIdFull(taskId);

    if (!task || task.agency_id !== context.agencyId || isArchivedRecord(task)) {
      return res.status(404).json({ error: "Task not found" });
    }

    const workspace = getFreelancerTasksPortal(context.agencyId, scopedFreelancer.id, context.authUser.id);
    const scopedTask = workspace?.tasks.find((item) => item.id === task.id);

    if (!scopedTask) {
      return res.status(404).json({ error: "Task not found" });
    }

    if (!scopedTask.can_update_status) {
      return res.status(403).json({ error: "This task is assigned to another team member" });
    }

    db.prepare("UPDATE tasks SET status = ? WHERE id = ? AND agency_id = ? AND archived_at IS NULL").run(
      status,
      task.id,
      context.agencyId,
    );

    syncTaskCalendarEvent(task.id);

    createAuditLog({
      action: "freelancer.task_status_updated",
      entityType: "task",
      entityId: task.id,
      description: `El freelance ${context.authUser.name} actualizó la tarea ${task.title} a ${status}.`,
      authUser: context.authUser,
      agencyId: context.agencyId,
      metadata: {
        status,
        project_id: task.project_id,
        client_id: task.client_id,
      },
    });

    const updatedWorkspace = getFreelancerTasksPortal(
      context.agencyId,
      scopedFreelancer.id,
      context.authUser.id,
    );
    const updatedTask = updatedWorkspace?.tasks.find((item) => item.id === task.id);

    res.json(updatedTask || getTaskRecordByIdFull(task.id) || task);
  });

  app.get("/api/freelancer-portal/finance", requireSectionAccess("billing"), (req, res) => {
    const context = getAgencyRequestContext(res.locals.authUser as AuthUser | undefined);
    const scopedFreelancer = getScopedFreelancerRecordForContext(context);

    if (!context) {
      return res.status(400).json({ error: "Agency not found" });
    }

    if (scopedFreelancer === undefined) {
      return res.status(403).json({ error: "Freelancer access is not linked correctly" });
    }

    if (!scopedFreelancer) {
      return res.status(403).json({ error: "Only linked freelancer users can access this portal" });
    }

    const portal = getFreelancerFinancePortal(context.agencyId, scopedFreelancer.id, req);

    if (!portal) {
      return res.status(404).json({ error: "Freelancer finance portal not found" });
    }

    res.json(portal);
  });

  app.get("/api/service-prices", requireSectionAccess("contracts"), (req, res) => {
    const context = getAgencyRequestContext(res.locals.authUser as AuthUser | undefined);
    const scope = typeof req.query.scope === "string" ? req.query.scope.trim() : "";
    const activeOnly = String(req.query.active || "false").trim() === "true";

    if (!context) {
      return res.status(400).json({ error: "Agency not found" });
    }

    if (isExternalPortalUser(context.authUser)) {
      return res.status(403).json({ error: "Portal users cannot access service pricing" });
    }

    const rows = db
      .prepare(
        `
          SELECT *
          FROM service_prices
          WHERE agency_id = ?
            AND (? = '' OR service_scope = ? OR service_scope = 'both')
            AND (? = 0 OR is_active = 1)
          ORDER BY is_active DESC, category ASC, name ASC
        `,
      )
      .all(context.agencyId, scope, scope, activeOnly ? 1 : 0) as ServicePriceRow[];

    res.json(rows.map(serializeServicePriceRow));
  });

  app.post("/api/service-prices", requireSectionAccess("contracts"), (req, res) => {
    const context = getAgencyRequestContext(res.locals.authUser as AuthUser | undefined);
    const {
      name,
      category,
      description,
      service_scope,
      unit_label,
      billing_model,
      default_price,
      currency,
      tax_rate,
      legal_label,
      notes,
      is_active,
    } = req.body ?? {};

    if (!context) {
      return res.status(400).json({ error: "Agency not found" });
    }

    if (isExternalPortalUser(context.authUser)) {
      return res.status(403).json({ error: "Portal users cannot manage service pricing" });
    }

    const nextName = typeof name === "string" ? name.trim() : "";
    const nextCategory = typeof category === "string" ? category.trim() : "";
    const nextScope = ["client", "freelance", "both"].includes(service_scope)
      ? (service_scope as ServiceScope)
      : "both";
    const nextBillingModel = ["one_time", "monthly", "hourly", "weekly", "performance"].includes(
      billing_model,
    )
      ? (billing_model as ServiceBillingModel)
      : "one_time";
    const nextPrice = Number(default_price);
    const nextTaxRate = Number(tax_rate ?? 21);
    const nextCurrency = ["USD", "EUR", "MXN"].includes(currency) ? (currency as SupportedCurrency) : "EUR";

    if (!nextName || !nextCategory) {
      return res.status(400).json({ error: "Name and category are required" });
    }

    if (!Number.isFinite(nextPrice) || nextPrice < 0) {
      return res.status(400).json({ error: "Default price is invalid" });
    }

    if (!Number.isFinite(nextTaxRate) || nextTaxRate < 0) {
      return res.status(400).json({ error: "Tax rate is invalid" });
    }

    const result = db
      .prepare(
        `
          INSERT INTO service_prices (
            name,
            category,
            description,
            service_scope,
            unit_label,
            billing_model,
            default_price,
            currency,
            tax_rate,
            legal_label,
            notes,
            is_active,
            agency_id,
            updated_at
          )
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)
        `,
      )
      .run(
        nextName,
        nextCategory,
        typeof description === "string" && description.trim() ? description.trim() : null,
        nextScope,
        typeof unit_label === "string" && unit_label.trim() ? unit_label.trim() : "servicio",
        nextBillingModel,
        Math.round(nextPrice * 100) / 100,
        nextCurrency,
        Math.round(nextTaxRate * 100) / 100,
        typeof legal_label === "string" && legal_label.trim() ? legal_label.trim() : null,
        typeof notes === "string" && notes.trim() ? notes.trim() : null,
        is_active === false ? 0 : 1,
        context.agencyId,
      );

    const servicePrice = getServicePriceRecordById(Number(result.lastInsertRowid));

    createAuditLog({
      action: "contracts.service_price_created",
      entityType: "service_price",
      entityId: Number(result.lastInsertRowid),
      description: `Se creó la tarifa base ${nextName}.`,
      authUser: context.authUser,
      agencyId: context.agencyId,
    });

    res.status(201).json(servicePrice ? serializeServicePriceRow(servicePrice) : null);
  });

  app.patch("/api/service-prices/:id", requireSectionAccess("contracts"), (req, res) => {
    const context = getAgencyRequestContext(res.locals.authUser as AuthUser | undefined);
    const servicePriceId = Number(req.params.id);

    if (!context) {
      return res.status(400).json({ error: "Agency not found" });
    }

    if (isExternalPortalUser(context.authUser)) {
      return res.status(403).json({ error: "Portal users cannot manage service pricing" });
    }

    const current = Number.isInteger(servicePriceId) ? getServicePriceRecordById(servicePriceId) : undefined;

    if (!current || current.agency_id !== context.agencyId) {
      return res.status(404).json({ error: "Service price not found" });
    }

    const {
      name,
      category,
      description,
      service_scope,
      unit_label,
      billing_model,
      default_price,
      currency,
      tax_rate,
      legal_label,
      notes,
      is_active,
    } = req.body ?? {};

    const nextName = typeof name === "string" && name.trim() ? name.trim() : current.name;
    const nextCategory =
      typeof category === "string" && category.trim() ? category.trim() : current.category;
    const nextScope = ["client", "freelance", "both"].includes(service_scope)
      ? (service_scope as ServiceScope)
      : current.service_scope;
    const nextBillingModel = ["one_time", "monthly", "hourly", "weekly", "performance"].includes(
      billing_model,
    )
      ? (billing_model as ServiceBillingModel)
      : current.billing_model;
    const nextPrice =
      default_price === undefined ? current.default_price : Number(default_price);
    const nextTaxRate = tax_rate === undefined ? current.tax_rate : Number(tax_rate);
    const nextCurrency = ["USD", "EUR", "MXN"].includes(currency)
      ? (currency as SupportedCurrency)
      : current.currency;

    if (!Number.isFinite(nextPrice) || nextPrice < 0) {
      return res.status(400).json({ error: "Default price is invalid" });
    }

    if (!Number.isFinite(nextTaxRate) || nextTaxRate < 0) {
      return res.status(400).json({ error: "Tax rate is invalid" });
    }

    db.prepare(
      `
        UPDATE service_prices
        SET
          name = ?,
          category = ?,
          description = ?,
          service_scope = ?,
          unit_label = ?,
          billing_model = ?,
          default_price = ?,
          currency = ?,
          tax_rate = ?,
          legal_label = ?,
          notes = ?,
          is_active = ?,
          updated_at = CURRENT_TIMESTAMP
        WHERE id = ?
      `,
    ).run(
      nextName,
      nextCategory,
      description === undefined
        ? current.description
        : typeof description === "string" && description.trim()
          ? description.trim()
          : null,
      nextScope,
      typeof unit_label === "string" && unit_label.trim() ? unit_label.trim() : current.unit_label,
      nextBillingModel,
      Math.round(nextPrice * 100) / 100,
      nextCurrency,
      Math.round(nextTaxRate * 100) / 100,
      legal_label === undefined
        ? current.legal_label
        : typeof legal_label === "string" && legal_label.trim()
          ? legal_label.trim()
          : null,
      notes === undefined
        ? current.notes
        : typeof notes === "string" && notes.trim()
          ? notes.trim()
          : null,
      is_active === undefined ? current.is_active : is_active ? 1 : 0,
      current.id,
    );

    const servicePrice = getServicePriceRecordById(current.id);
    res.json(servicePrice ? serializeServicePriceRow(servicePrice) : null);
  });

  app.get("/api/freelancers", requireSectionAccess("contracts"), (req, res) => {
    const context = getAgencyRequestContext(res.locals.authUser as AuthUser | undefined);

    if (!context) {
      return res.status(400).json({ error: "Agency not found" });
    }

    if (isExternalPortalUser(context.authUser)) {
      return res.status(403).json({ error: "Portal users cannot access the freelancers directory" });
    }

    const rows = db
      .prepare(
        `
          SELECT *
          FROM freelancers
          WHERE agency_id = ?
          ORDER BY status = 'active' DESC, name ASC
        `,
      )
      .all(context.agencyId) as FreelancerRow[];

    res.json(rows.map((row) => serializeFreelancerRow(row, req)));
  });

  app.post("/api/freelancers", requireSectionAccess("contracts"), (req, res) => {
    const context = getAgencyRequestContext(res.locals.authUser as AuthUser | undefined);
    const {
      name,
      email,
      specialty,
      hourly_rate,
      currency,
      tax_id,
      payment_method,
      payout_reference,
      payout_integration_key,
      notes,
      status,
    } = req.body ?? {};

    if (!context) {
      return res.status(400).json({ error: "Agency not found" });
    }

    if (isExternalPortalUser(context.authUser)) {
      return res.status(403).json({ error: "Portal users cannot manage freelancers" });
    }

    const nextName = typeof name === "string" ? name.trim() : "";
    const nextEmail = typeof email === "string" ? email.trim() : "";
    const nextRate = Number(hourly_rate ?? 0);
    const nextCurrency = ["USD", "EUR", "MXN"].includes(currency) ? (currency as SupportedCurrency) : "EUR";
    const nextStatus = ["active", "paused", "inactive"].includes(status)
      ? (status as FreelancerStatus)
      : "active";

    if (!nextName || !nextEmail) {
      return res.status(400).json({ error: "Name and email are required" });
    }

    if (!Number.isFinite(nextRate) || nextRate < 0) {
      return res.status(400).json({ error: "Hourly rate is invalid" });
    }

    const result = db
      .prepare(
        `
          INSERT INTO freelancers (
            name,
            email,
            specialty,
            hourly_rate,
            currency,
            tax_id,
            payment_method,
            payout_reference,
            payout_integration_key,
            notes,
            status,
            agency_id,
            updated_at
          )
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)
        `,
      )
      .run(
        nextName,
        nextEmail,
        typeof specialty === "string" && specialty.trim() ? specialty.trim() : null,
        Math.round(nextRate * 100) / 100,
        nextCurrency,
        typeof tax_id === "string" && tax_id.trim() ? tax_id.trim() : null,
        typeof payment_method === "string" && payment_method.trim() ? payment_method.trim() : null,
        typeof payout_reference === "string" && payout_reference.trim()
          ? payout_reference.trim()
          : null,
        typeof payout_integration_key === "string" && payout_integration_key.trim()
          ? payout_integration_key.trim()
          : null,
        typeof notes === "string" && notes.trim() ? notes.trim() : null,
        nextStatus,
        context.agencyId,
      );

    const freelancer = getFreelancerRecordById(Number(result.lastInsertRowid));
    res.status(201).json(freelancer ? serializeFreelancerRow(freelancer, req) : null);
  });

  app.patch("/api/freelancers/:id", requireSectionAccess("contracts"), (req, res) => {
    const context = getAgencyRequestContext(res.locals.authUser as AuthUser | undefined);
    const freelancerId = Number(req.params.id);

    if (!context) {
      return res.status(400).json({ error: "Agency not found" });
    }

    if (isExternalPortalUser(context.authUser)) {
      return res.status(403).json({ error: "Portal users cannot manage freelancers" });
    }

    const freelancer = Number.isInteger(freelancerId) ? getFreelancerRecordById(freelancerId) : undefined;

    if (!freelancer || freelancer.agency_id !== context.agencyId) {
      return res.status(404).json({ error: "Freelancer not found" });
    }

    const nextRate =
      req.body?.hourly_rate === undefined ? freelancer.hourly_rate : Number(req.body.hourly_rate);

    if (!Number.isFinite(nextRate) || nextRate < 0) {
      return res.status(400).json({ error: "Hourly rate is invalid" });
    }

    db.prepare(
      `
        UPDATE freelancers
        SET
          name = ?,
          email = ?,
          specialty = ?,
          hourly_rate = ?,
          currency = ?,
          tax_id = ?,
          payment_method = ?,
          payout_reference = ?,
          payout_integration_key = ?,
          notes = ?,
          status = ?,
          updated_at = CURRENT_TIMESTAMP
        WHERE id = ?
      `,
    ).run(
      typeof req.body?.name === "string" && req.body.name.trim() ? req.body.name.trim() : freelancer.name,
      typeof req.body?.email === "string" && req.body.email.trim() ? req.body.email.trim() : freelancer.email,
      req.body?.specialty === undefined
        ? freelancer.specialty
        : typeof req.body.specialty === "string" && req.body.specialty.trim()
          ? req.body.specialty.trim()
          : null,
      Math.round(nextRate * 100) / 100,
      ["USD", "EUR", "MXN"].includes(req.body?.currency)
        ? (req.body.currency as SupportedCurrency)
        : freelancer.currency,
      req.body?.tax_id === undefined
        ? freelancer.tax_id
        : typeof req.body.tax_id === "string" && req.body.tax_id.trim()
          ? req.body.tax_id.trim()
          : null,
      req.body?.payment_method === undefined
        ? freelancer.payment_method
        : typeof req.body.payment_method === "string" && req.body.payment_method.trim()
          ? req.body.payment_method.trim()
          : null,
      req.body?.payout_reference === undefined
        ? freelancer.payout_reference
        : typeof req.body.payout_reference === "string" && req.body.payout_reference.trim()
          ? req.body.payout_reference.trim()
          : null,
      req.body?.payout_integration_key === undefined
        ? freelancer.payout_integration_key
        : typeof req.body.payout_integration_key === "string" && req.body.payout_integration_key.trim()
          ? req.body.payout_integration_key.trim()
          : null,
      req.body?.notes === undefined
        ? freelancer.notes
        : typeof req.body.notes === "string" && req.body.notes.trim()
          ? req.body.notes.trim()
          : null,
      ["active", "paused", "inactive"].includes(req.body?.status)
        ? (req.body.status as FreelancerStatus)
        : freelancer.status,
      freelancer.id,
    );

    const updatedFreelancer = getFreelancerRecordById(freelancer.id);
    res.json(updatedFreelancer ? serializeFreelancerRow(updatedFreelancer, req) : null);
  });

  app.post("/api/freelancers/:id/portal-access/invite", requireSectionAccess("contracts"), async (req, res) => {
    const context = getAgencyRequestContext(res.locals.authUser as AuthUser | undefined);
    const freelancerId = Number(req.params.id);
    const freelancer = Number.isInteger(freelancerId) ? getFreelancerRecordById(freelancerId) : undefined;

    if (!context) {
      return res.status(400).json({ error: "Agency not found" });
    }

    if (!freelancer || freelancer.agency_id !== context.agencyId) {
      return res.status(404).json({ error: "Freelancer not found" });
    }

    const result = ensurePortalUserAccess({
      agencyId: context.agencyId,
      entityType: "freelancer",
      entityId: freelancer.id,
      name:
        typeof req.body?.name === "string" && req.body.name.trim()
          ? req.body.name.trim()
          : freelancer.name,
      email:
        typeof req.body?.email === "string" && req.body.email.trim()
          ? req.body.email.trim()
          : freelancer.email,
    });

    if ("error" in result) {
      return res.status(result.error.includes("required") ? 400 : 409).json({ error: result.error });
    }

    if (!result.user) {
      return res.status(500).json({ error: "Freelancer portal user could not be prepared" });
    }

    let delivery: AccountInviteDeliveryResult = {
      delivered: false,
      skipped: true,
      channel: "manual",
      reason: result.already_active ? "already_active" : "missing_invite_url",
    };

    if (result.invite_required && result.user.activation_token) {
      const inviteUrl = buildActivationUrl(result.user.activation_token, req);
      delivery = inviteUrl
        ? await sendActivationEmail({
            to: result.user.email,
            name: result.user.name,
            agencyName: getAppSettings(context.agencyId).agency_name,
            inviteUrl,
            roleLabel: "freelancer",
          })
        : {
            delivered: false,
            skipped: true,
            channel: "manual",
            reason: "missing_invite_url",
          };
    }

    createAuditLog({
      action: result.invite_required ? "freelancer.portal_invited" : "freelancer.portal_linked",
      entityType: "freelancer",
      entityId: freelancer.id,
      description: result.invite_required
        ? `Se preparo acceso portal para ${freelancer.name}.`
        : `Se vinculo acceso portal ya activo para ${freelancer.name}.`,
      authUser: context.authUser,
      agencyId: context.agencyId,
      metadata: {
        freelancer_id: freelancer.id,
        user_id: result.user.id,
        email: result.user.email,
        delivery: delivery.delivered ? "sent" : delivery.reason,
        created: result.created,
        linked_existing: result.linked_existing,
      },
    });

    res.status(result.created ? 201 : 200).json({
      access: serializePortalAccessUser(result.user, req),
      delivery,
      created: result.created,
      linked_existing: result.linked_existing,
      already_active: result.already_active,
    });
  });

  app.post("/api/freelancers/:id/portal-access/resend", requireSectionAccess("contracts"), async (req, res) => {
    const context = getAgencyRequestContext(res.locals.authUser as AuthUser | undefined);
    const freelancerId = Number(req.params.id);
    const freelancer = Number.isInteger(freelancerId) ? getFreelancerRecordById(freelancerId) : undefined;

    if (!context) {
      return res.status(400).json({ error: "Agency not found" });
    }

    if (!freelancer || freelancer.agency_id !== context.agencyId) {
      return res.status(404).json({ error: "Freelancer not found" });
    }

    const linkedUser = getLinkedFreelancerUserRecord(context.agencyId, freelancer.id);

    if (!linkedUser) {
      return res.status(404).json({ error: "Freelancer portal access has not been configured yet" });
    }

    if ((linkedUser.access_status || "active") !== "invited") {
      return res.status(400).json({ error: "Freelancer portal access is already active" });
    }

    const refreshedUser = resetPortalInviteForUser(linkedUser.id);

    if (!refreshedUser || !refreshedUser.activation_token) {
      return res.status(500).json({ error: "Freelancer portal invite could not be regenerated" });
    }

    const inviteUrl = buildActivationUrl(refreshedUser.activation_token, req);
    const delivery = inviteUrl
      ? await sendActivationEmail({
          to: refreshedUser.email,
          name: refreshedUser.name,
          agencyName: getAppSettings(context.agencyId).agency_name,
          inviteUrl,
          roleLabel: "freelancer",
        })
      : {
          delivered: false,
          skipped: true,
          channel: "manual",
          reason: "missing_invite_url",
        };

    createAuditLog({
      action: "freelancer.portal_invite_resent",
      entityType: "freelancer",
      entityId: freelancer.id,
      description: `Se reenvio el acceso portal para ${freelancer.name}.`,
      authUser: context.authUser,
      agencyId: context.agencyId,
      metadata: {
        freelancer_id: freelancer.id,
        user_id: refreshedUser.id,
        email: refreshedUser.email,
        delivery: delivery.delivered ? "sent" : delivery.reason,
      },
    });

    res.json({
      access: serializePortalAccessUser(refreshedUser, req),
      delivery,
      resent: true,
    });
  });

  app.get(
    "/api/freelancer-project-assignments",
    requireAnySectionAccess(["projects", "contracts"]),
    (req, res) => {
      const context = getAgencyRequestContext(res.locals.authUser as AuthUser | undefined);
      const projectId = Number(req.query.project_id || 0);
      const freelancerId = Number(req.query.freelancer_id || 0);

      if (!context) {
        return res.status(400).json({ error: "Agency not found" });
      }

      if (isExternalPortalUser(context.authUser)) {
        return res.status(403).json({ error: "Portal users cannot manage freelancer assignments" });
      }

      const rows = db
        .prepare(
          `
            SELECT
              freelancer_project_assignments.*,
              projects.name as project_name,
              projects.client_id as client_id,
              clients.company as client_name,
              freelancers.name as freelancer_name,
              freelancers.email as freelancer_email
            FROM freelancer_project_assignments
            INNER JOIN projects ON projects.id = freelancer_project_assignments.project_id
            INNER JOIN freelancers ON freelancers.id = freelancer_project_assignments.freelancer_id
            LEFT JOIN clients ON clients.id = projects.client_id
            WHERE freelancer_project_assignments.agency_id = ?
              AND freelancer_project_assignments.status != 'archived'
              AND (? <= 0 OR freelancer_project_assignments.project_id = ?)
              AND (? <= 0 OR freelancer_project_assignments.freelancer_id = ?)
            ORDER BY datetime(freelancer_project_assignments.created_at) DESC, freelancer_project_assignments.id DESC
          `,
        )
        .all(context.agencyId, projectId, projectId, freelancerId, freelancerId);

      res.json(rows);
    },
  );

  app.post(
    "/api/freelancer-project-assignments",
    requireAnySectionAccess(["projects", "contracts"]),
    (req, res) => {
      const context = getAgencyRequestContext(res.locals.authUser as AuthUser | undefined);
      const projectId = Number(req.body?.project_id);
      const freelancerId = Number(req.body?.freelancer_id);
      const roleLabel =
        typeof req.body?.role_label === "string" && req.body.role_label.trim()
          ? req.body.role_label.trim()
          : null;
      const notes =
        typeof req.body?.notes === "string" && req.body.notes.trim() ? req.body.notes.trim() : null;

      if (!context) {
        return res.status(400).json({ error: "Agency not found" });
      }

      if (isExternalPortalUser(context.authUser)) {
        return res.status(403).json({ error: "Portal users cannot manage freelancer assignments" });
      }

      const project = Number.isInteger(projectId) ? getProjectRecordByIdFull(projectId) : undefined;
      const freelancer = Number.isInteger(freelancerId) ? getFreelancerRecordById(freelancerId) : undefined;

      if (!project || project.agency_id !== context.agencyId || isArchivedRecord(project)) {
        return res.status(404).json({ error: "Project not found" });
      }

      if (!freelancer || freelancer.agency_id !== context.agencyId) {
        return res.status(404).json({ error: "Freelancer not found" });
      }

      const existingAssignment = db
        .prepare(
          `
            SELECT *
            FROM freelancer_project_assignments
            WHERE agency_id = ? AND project_id = ? AND freelancer_id = ?
            LIMIT 1
          `,
        )
        .get(context.agencyId, project.id, freelancer.id) as FreelancerProjectAssignmentRow | undefined;

      if (existingAssignment) {
        db.prepare(
          `
            UPDATE freelancer_project_assignments
            SET
              role_label = ?,
              notes = ?,
              status = 'active',
              updated_at = CURRENT_TIMESTAMP
            WHERE id = ?
          `,
        ).run(roleLabel, notes, existingAssignment.id);
      } else {
        db.prepare(
          `
            INSERT INTO freelancer_project_assignments (
              project_id,
              freelancer_id,
              role_label,
              notes,
              status,
              agency_id,
              updated_at
            )
            VALUES (?, ?, ?, ?, 'active', ?, CURRENT_TIMESTAMP)
          `,
        ).run(project.id, freelancer.id, roleLabel, notes, context.agencyId);
      }

      createAuditLog({
        action: existingAssignment
          ? "freelancer.assignment_updated"
          : "freelancer.assignment_created",
        entityType: "project",
        entityId: project.id,
        description: existingAssignment
          ? `Se actualizo la asignacion de ${freelancer.name} al proyecto ${project.name}.`
          : `Se asigno ${freelancer.name} al proyecto ${project.name}.`,
        authUser: context.authUser,
        agencyId: context.agencyId,
        metadata: {
          project_id: project.id,
          freelancer_id: freelancer.id,
          role_label: roleLabel,
        },
      });

      const assignment = db
        .prepare(
          `
            SELECT
              freelancer_project_assignments.*,
              projects.name as project_name,
              projects.client_id as client_id,
              clients.company as client_name,
              freelancers.name as freelancer_name,
              freelancers.email as freelancer_email
            FROM freelancer_project_assignments
            INNER JOIN projects ON projects.id = freelancer_project_assignments.project_id
            INNER JOIN freelancers ON freelancers.id = freelancer_project_assignments.freelancer_id
            LEFT JOIN clients ON clients.id = projects.client_id
            WHERE freelancer_project_assignments.agency_id = ?
              AND freelancer_project_assignments.project_id = ?
              AND freelancer_project_assignments.freelancer_id = ?
            LIMIT 1
          `,
        )
        .get(context.agencyId, project.id, freelancer.id);

      res.status(existingAssignment ? 200 : 201).json(assignment);
    },
  );

  app.delete(
    "/api/freelancer-project-assignments/:id",
    requireAnySectionAccess(["projects", "contracts"]),
    (req, res) => {
      const context = getAgencyRequestContext(res.locals.authUser as AuthUser | undefined);
      const assignmentId = Number(req.params.id);
      const assignment = Number.isInteger(assignmentId)
        ? (db
            .prepare("SELECT * FROM freelancer_project_assignments WHERE id = ?")
            .get(assignmentId) as FreelancerProjectAssignmentRow | undefined)
        : undefined;

      if (!context) {
        return res.status(400).json({ error: "Agency not found" });
      }

      if (isExternalPortalUser(context.authUser)) {
        return res.status(403).json({ error: "Portal users cannot manage freelancer assignments" });
      }

      if (!assignment || assignment.agency_id !== context.agencyId) {
        return res.status(404).json({ error: "Assignment not found" });
      }

      db.prepare(
        `
          UPDATE freelancer_project_assignments
          SET status = 'archived', updated_at = CURRENT_TIMESTAMP
          WHERE id = ?
        `,
      ).run(assignment.id);

      const project = getProjectRecordByIdFull(assignment.project_id);
      const freelancer = getFreelancerRecordById(assignment.freelancer_id);

      createAuditLog({
        action: "freelancer.assignment_archived",
        entityType: "project",
        entityId: assignment.project_id,
        description: `Se retiro ${freelancer?.name || `freelancer #${assignment.freelancer_id}`} del proyecto ${project?.name || `#${assignment.project_id}`}.`,
        authUser: context.authUser,
        agencyId: context.agencyId,
        metadata: {
          project_id: assignment.project_id,
          freelancer_id: assignment.freelancer_id,
        },
      });

      res.json({ deleted: true, id: assignment.id });
    },
  );

  app.get("/api/contracts/overview", requireSectionAccess("contracts"), (req, res) => {
    const context = getAgencyRequestContext(res.locals.authUser as AuthUser | undefined);
    const scopedClient = getScopedClientRecordForContext(context);
    const scopedFreelancer = getScopedFreelancerRecordForContext(context);

    if (!context) {
      return res.status(400).json({ error: "Agency not found" });
    }

    if (scopedClient === undefined) {
      return res.status(403).json({ error: "Client access is not linked correctly" });
    }

    if (scopedFreelancer === undefined) {
      return res.status(403).json({ error: "Freelancer access is not linked correctly" });
    }

    res.json(
      getContractsOverview(context.agencyId, {
        clientId: scopedClient?.id || null,
        freelancerId: scopedFreelancer?.id || null,
      }),
    );
  });

  app.get("/api/contracts", requireSectionAccess("contracts"), (req, res) => {
    const context = getAgencyRequestContext(res.locals.authUser as AuthUser | undefined);
    const scopedClient = getScopedClientRecordForContext(context);
    const scopedFreelancer = getScopedFreelancerRecordForContext(context);
    const type = typeof req.query.contract_type === "string" ? req.query.contract_type.trim() : "";
    const includeArchived = String(req.query.include_archived || "false").trim() === "true";

    if (!context) {
      return res.status(400).json({ error: "Agency not found" });
    }

    if (scopedClient === undefined) {
      return res.status(403).json({ error: "Client access is not linked correctly" });
    }

    if (scopedFreelancer === undefined) {
      return res.status(403).json({ error: "Freelancer access is not linked correctly" });
    }

    const rows = db
      .prepare(
        `
          SELECT *
          FROM contracts
          WHERE agency_id = ?
            AND (? = '' OR contract_type = ?)
            AND (? <= 0 OR client_id = ?)
            AND (? <= 0 OR freelancer_id = ?)
            AND (${includeArchived ? "1 = 1" : "archived_at IS NULL"})
          ORDER BY datetime(created_at) DESC, id DESC
        `,
      )
      .all(
        context.agencyId,
        type,
        type,
        scopedClient?.id || 0,
        scopedClient?.id || 0,
        scopedFreelancer?.id || 0,
        scopedFreelancer?.id || 0,
      ) as ContractRow[];

    res.json(rows.map(serializeContractRow));
  });

  app.post("/api/contracts", requireSectionAccess("contracts"), (req, res) => {
    const context = getAgencyRequestContext(res.locals.authUser as AuthUser | undefined);
    const scopedClientId = getScopedClientIdForAuthUser(context?.authUser);
    const scopedFreelancerId = getScopedFreelancerIdForAuthUser(context?.authUser);
    const {
      contract_type,
      client_id,
      freelancer_id,
      owner_user_id,
      template_key,
      payment_terms,
      start_date,
      end_date,
      counterparty_name,
      counterparty_email,
      counterparty_tax_id,
      counterparty_address,
      scope_summary,
      custom_requirements,
      payment_integration_key,
      signature_integration_key,
      currency,
      items,
      status,
    } = req.body ?? {};

    if (!context) {
      return res.status(400).json({ error: "Agency not found" });
    }

    if (scopedClientId || scopedFreelancerId) {
      return res.status(403).json({ error: "Portal users have read-only contract access" });
    }

    const nextType = contract_type === "freelance" ? "freelance" : "client";
    const client =
      nextType === "client" && Number.isInteger(Number(client_id)) && Number(client_id) > 0
        ? getClientRecordById(Number(client_id))
        : null;
    const freelancer =
      nextType === "freelance" && Number.isInteger(Number(freelancer_id)) && Number(freelancer_id) > 0
        ? getFreelancerRecordById(Number(freelancer_id))
        : null;
    const ownerUser =
      Number.isInteger(Number(owner_user_id)) && Number(owner_user_id) > 0
        ? getUserRecordByIdFull(Number(owner_user_id))
        : null;

    if (client && (client.agency_id !== context.agencyId || isArchivedRecord(client))) {
      return res.status(400).json({ error: "Client not found" });
    }

    if (freelancer && freelancer.agency_id !== context.agencyId) {
      return res.status(400).json({ error: "Freelancer not found" });
    }

    if (ownerUser && ownerUser.agency_id !== context.agencyId) {
      return res.status(400).json({ error: "Owner user not found" });
    }

    const lineItems = sanitizeContractLineItemsInput(items, context.agencyId);
    const subtotal = Math.round(lineItems.reduce((sum, lineItem) => sum + Number(lineItem.line_total || 0), 0) * 100) / 100;
    const taxAmount =
      Math.round(
        lineItems.reduce(
          (sum, lineItem) => sum + (Number(lineItem.line_total || 0) * Number(lineItem.tax_rate || 0)) / 100,
          0,
        ) * 100,
      ) / 100;
    const totalAmount = Math.round((subtotal + taxAmount) * 100) / 100;
    const nextCounterpartyName =
      typeof counterparty_name === "string" && counterparty_name.trim()
        ? counterparty_name.trim()
        : client?.company || freelancer?.name || "";
    const nextCounterpartyEmail =
      typeof counterparty_email === "string" && counterparty_email.trim()
        ? counterparty_email.trim()
        : freelancer?.email || null;
    const nextCurrency = ["USD", "EUR", "MXN"].includes(currency)
      ? (currency as SupportedCurrency)
      : client
        ? getAppSettings(client.agency_id).currency
        : freelancer?.currency || getAppSettings(context.agencyId).currency;
    const validation = buildContractValidation({
      contractType: nextType,
      clientId: client?.id,
      freelancerId: freelancer?.id,
      counterpartyName: nextCounterpartyName,
      counterpartyEmail: nextCounterpartyEmail,
      counterpartyTaxId:
        typeof counterparty_tax_id === "string" && counterparty_tax_id.trim() ? counterparty_tax_id.trim() : null,
      counterpartyAddress:
        typeof counterparty_address === "string" && counterparty_address.trim()
          ? counterparty_address.trim()
          : null,
      paymentTerms: typeof payment_terms === "string" ? payment_terms.trim() : "",
      startDate: typeof start_date === "string" ? start_date.trim() : "",
      endDate: typeof end_date === "string" && end_date.trim() ? end_date.trim() : null,
      lineItems,
    });

    const nextTemplateKey =
      typeof template_key === "string" && template_key.trim()
        ? template_key.trim()
        : nextType === "client"
          ? "service_agreement"
          : "freelance_services";
    const contractNumber = generateContractNumber(context.agencyId);
    const body = buildContractBody({
      contractNumber,
      contractType: nextType,
      templateKey: nextTemplateKey,
      agencyName: getAppSettings(context.agencyId).agency_name,
      counterpartyName: nextCounterpartyName,
      counterpartyEmail: nextCounterpartyEmail,
      counterpartyTaxId:
        typeof counterparty_tax_id === "string" && counterparty_tax_id.trim() ? counterparty_tax_id.trim() : null,
      counterpartyAddress:
        typeof counterparty_address === "string" && counterparty_address.trim()
          ? counterparty_address.trim()
          : null,
      paymentTerms: typeof payment_terms === "string" ? payment_terms.trim() : "",
      startDate: typeof start_date === "string" ? start_date.trim() : "",
      endDate: typeof end_date === "string" && end_date.trim() ? end_date.trim() : null,
      currency: nextCurrency,
      subtotal,
      taxAmount,
      totalAmount,
      scopeSummary: typeof scope_summary === "string" ? scope_summary.trim() : null,
      customRequirements:
        typeof custom_requirements === "string" ? custom_requirements.trim() : null,
      paymentIntegrationKey:
        typeof payment_integration_key === "string" && payment_integration_key.trim()
          ? (payment_integration_key.trim() as IntegrationKey)
          : null,
      signatureIntegrationKey:
        typeof signature_integration_key === "string" && signature_integration_key.trim()
          ? (signature_integration_key.trim() as IntegrationKey)
          : null,
      lineItems,
    });

    const result = db.transaction(() => {
      const contractInsert = db
        .prepare(
          `
            INSERT INTO contracts (
              contract_number,
              contract_type,
              client_id,
              freelancer_id,
              owner_user_id,
              template_key,
              status,
              currency,
              payment_terms,
              start_date,
              end_date,
              counterparty_name,
              counterparty_email,
              counterparty_tax_id,
              counterparty_address,
              scope_summary,
              custom_requirements,
              payment_integration_key,
              signature_integration_key,
              subtotal,
              tax_amount,
              total_amount,
              generated_body,
              document_url,
              validation_status,
              validation_notes,
              signed_at,
              agency_id,
              updated_at
            )
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)
          `,
        )
        .run(
          contractNumber,
          nextType,
          client?.id || null,
          freelancer?.id || null,
          ownerUser?.id || null,
          nextTemplateKey,
          ["draft", "review", "ready", "sent", "signed", "archived"].includes(status)
            ? status
            : validation.status === "invalid"
              ? "draft"
              : "review",
          nextCurrency,
          typeof payment_terms === "string" ? payment_terms.trim() : "",
          typeof start_date === "string" ? start_date.trim() : "",
          typeof end_date === "string" && end_date.trim() ? end_date.trim() : null,
          nextCounterpartyName,
          nextCounterpartyEmail,
          typeof counterparty_tax_id === "string" && counterparty_tax_id.trim() ? counterparty_tax_id.trim() : null,
          typeof counterparty_address === "string" && counterparty_address.trim()
            ? counterparty_address.trim()
            : null,
          typeof scope_summary === "string" && scope_summary.trim() ? scope_summary.trim() : null,
          typeof custom_requirements === "string" && custom_requirements.trim()
            ? custom_requirements.trim()
            : null,
          typeof payment_integration_key === "string" && payment_integration_key.trim()
            ? payment_integration_key.trim()
            : null,
          typeof signature_integration_key === "string" && signature_integration_key.trim()
            ? signature_integration_key.trim()
            : null,
          subtotal,
          taxAmount,
          totalAmount,
          body,
          createContractUrl(contractNumber, nextCounterpartyName, body),
          validation.status,
          JSON.stringify(validation.notes),
          status === "signed" ? new Date().toISOString() : null,
          context.agencyId,
        );

      const contractId = Number(contractInsert.lastInsertRowid);
      const insertLineItem = db.prepare(
        `
          INSERT INTO contract_line_items (
            contract_id,
            service_price_id,
            title,
            description,
            quantity,
            unit_price,
            tax_rate,
            line_total
          )
          VALUES (?, ?, ?, ?, ?, ?, ?, ?)
        `,
      );

      lineItems.forEach((lineItem) => {
        insertLineItem.run(
          contractId,
          lineItem.service_price_id,
          lineItem.title,
          lineItem.description,
          lineItem.quantity,
          lineItem.unit_price,
          lineItem.tax_rate,
          lineItem.line_total,
        );
      });

      return contractId;
    })();

    createAuditLog({
      action: "contracts.created",
      entityType: "contract",
      entityId: result,
      description: `Se creó el contrato ${contractNumber}.`,
      authUser: context.authUser,
      agencyId: context.agencyId,
      metadata: {
        contract_type: nextType,
        total_amount: totalAmount,
        validation_status: validation.status,
      },
    });

    createContractEvent({
      contractId: result,
      eventType: "created",
      title: "Contrato generado",
      description: `Se generó ${contractNumber}.`,
      authUser: context.authUser,
      agencyId: context.agencyId,
      metadata: {
        status:
          ["draft", "review", "ready", "sent", "signed", "archived"].includes(status)
            ? status
            : validation.status === "invalid"
              ? "draft"
              : "review",
        validation_status: validation.status,
        total_amount: totalAmount,
      },
    });

    res.status(201).json(serializeContract(result));
  });

  app.patch("/api/contracts/:id", requireSectionAccess("contracts"), (req, res) => {
    const context = getAgencyRequestContext(res.locals.authUser as AuthUser | undefined);
    const scopedClientId = getScopedClientIdForAuthUser(context?.authUser);
    const scopedFreelancerId = getScopedFreelancerIdForAuthUser(context?.authUser);
    const contractId = Number(req.params.id);

    if (!context) {
      return res.status(400).json({ error: "Agency not found" });
    }

    if (scopedClientId || scopedFreelancerId) {
      return res.status(403).json({ error: "Portal users have read-only contract access" });
    }

    const contract = Number.isInteger(contractId) ? getContractRecordById(contractId) : undefined;

    if (!contract || contract.agency_id !== context.agencyId) {
      return res.status(404).json({ error: "Contract not found" });
    }

    const nextType =
      req.body?.contract_type === "freelance" || contract.contract_type === "freelance"
        ? "freelance"
        : "client";
    const client =
      nextType === "client"
        ? req.body?.client_id !== undefined
          ? Number.isInteger(Number(req.body.client_id)) && Number(req.body.client_id) > 0
            ? getClientRecordById(Number(req.body.client_id))
            : null
          : contract.client_id
            ? getClientRecordById(contract.client_id)
            : null
        : null;
    const freelancer =
      nextType === "freelance"
        ? req.body?.freelancer_id !== undefined
          ? Number.isInteger(Number(req.body.freelancer_id)) && Number(req.body.freelancer_id) > 0
            ? getFreelancerRecordById(Number(req.body.freelancer_id))
            : null
          : contract.freelancer_id
            ? getFreelancerRecordById(contract.freelancer_id)
            : null
        : null;
    const ownerUser =
      req.body?.owner_user_id !== undefined
        ? Number.isInteger(Number(req.body.owner_user_id)) && Number(req.body.owner_user_id) > 0
          ? getUserRecordByIdFull(Number(req.body.owner_user_id))
          : null
        : contract.owner_user_id
          ? getUserRecordByIdFull(contract.owner_user_id)
          : null;

    if (client && (client.agency_id !== context.agencyId || isArchivedRecord(client))) {
      return res.status(400).json({ error: "Client not found" });
    }

    if (freelancer && freelancer.agency_id !== context.agencyId) {
      return res.status(400).json({ error: "Freelancer not found" });
    }

    if (ownerUser && ownerUser.agency_id !== context.agencyId) {
      return res.status(400).json({ error: "Owner user not found" });
    }

    const lineItems =
      req.body?.items === undefined
        ? getContractLineItems(contract.id).map((lineItem) => ({
            service_price_id: lineItem.service_price_id,
            title: lineItem.title,
            description: lineItem.description,
            quantity: lineItem.quantity,
            unit_price: lineItem.unit_price,
            tax_rate: lineItem.tax_rate,
            line_total: lineItem.line_total,
          }))
        : sanitizeContractLineItemsInput(req.body.items, context.agencyId);
    const subtotal = Math.round(lineItems.reduce((sum, lineItem) => sum + Number(lineItem.line_total || 0), 0) * 100) / 100;
    const taxAmount =
      Math.round(
        lineItems.reduce(
          (sum, lineItem) => sum + (Number(lineItem.line_total || 0) * Number(lineItem.tax_rate || 0)) / 100,
          0,
        ) * 100,
      ) / 100;
    const totalAmount = Math.round((subtotal + taxAmount) * 100) / 100;
    const nextCounterpartyName =
      typeof req.body?.counterparty_name === "string" && req.body.counterparty_name.trim()
        ? req.body.counterparty_name.trim()
        : contract.counterparty_name || client?.company || freelancer?.name || "";
    const nextCounterpartyEmail =
      req.body?.counterparty_email !== undefined
        ? typeof req.body.counterparty_email === "string" && req.body.counterparty_email.trim()
          ? req.body.counterparty_email.trim()
          : null
        : contract.counterparty_email || freelancer?.email || null;
    const nextCounterpartyTaxId =
      req.body?.counterparty_tax_id !== undefined
        ? typeof req.body.counterparty_tax_id === "string" && req.body.counterparty_tax_id.trim()
          ? req.body.counterparty_tax_id.trim()
          : null
        : contract.counterparty_tax_id;
    const nextCounterpartyAddress =
      req.body?.counterparty_address !== undefined
        ? typeof req.body.counterparty_address === "string" && req.body.counterparty_address.trim()
          ? req.body.counterparty_address.trim()
          : null
        : contract.counterparty_address;
    const nextPaymentTerms =
      typeof req.body?.payment_terms === "string" ? req.body.payment_terms.trim() : contract.payment_terms;
    const nextStartDate =
      typeof req.body?.start_date === "string" && req.body.start_date.trim()
        ? req.body.start_date.trim()
        : contract.start_date;
    const nextEndDate =
      req.body?.end_date !== undefined
        ? typeof req.body.end_date === "string" && req.body.end_date.trim()
          ? req.body.end_date.trim()
          : null
        : contract.end_date;
    const nextTemplateKey =
      typeof req.body?.template_key === "string" && req.body.template_key.trim()
        ? req.body.template_key.trim()
        : contract.template_key;
    const nextCurrency = ["USD", "EUR", "MXN"].includes(req.body?.currency)
      ? (req.body.currency as SupportedCurrency)
      : contract.currency;
    const nextScopeSummary =
      typeof req.body?.scope_summary === "string"
        ? req.body.scope_summary.trim() || null
        : contract.scope_summary;
    const nextCustomRequirements =
      typeof req.body?.custom_requirements === "string"
        ? req.body.custom_requirements.trim() || null
        : contract.custom_requirements;
    const nextPaymentIntegrationKey =
      typeof req.body?.payment_integration_key === "string" && req.body.payment_integration_key.trim()
        ? (req.body.payment_integration_key.trim() as IntegrationKey)
        : contract.payment_integration_key;
    const nextSignatureIntegrationKey =
      typeof req.body?.signature_integration_key === "string" && req.body.signature_integration_key.trim()
        ? (req.body.signature_integration_key.trim() as IntegrationKey)
        : contract.signature_integration_key;
    const validation = buildContractValidation({
      contractType: nextType,
      clientId: client?.id,
      freelancerId: freelancer?.id,
      counterpartyName: nextCounterpartyName,
      counterpartyEmail: nextCounterpartyEmail,
      counterpartyTaxId: nextCounterpartyTaxId,
      counterpartyAddress: nextCounterpartyAddress,
      paymentTerms: nextPaymentTerms,
      startDate: nextStartDate,
      endDate: nextEndDate,
      lineItems,
    });
    const nextStatus = ["draft", "review", "ready", "sent", "signed", "archived"].includes(req.body?.status)
      ? (req.body.status as ContractStatus)
      : contract.status;

    if (nextStatus === "ready" && validation.status === "invalid") {
      return res.status(400).json({ error: "Fix validation issues before marking the contract as ready" });
    }

    if (nextStatus === "sent") {
      if (validation.status === "invalid") {
        return res.status(400).json({ error: "Fix validation issues before sending this contract" });
      }

      if (!nextCounterpartyEmail) {
        return res.status(400).json({ error: "Counterparty email is required before sending" });
      }

      if (contract.status !== "ready" && contract.status !== "sent") {
        return res.status(400).json({ error: "Approve the contract before marking it as sent" });
      }
    }

    if (nextStatus === "signed" && !["sent", "signed"].includes(contract.status)) {
      return res.status(400).json({ error: "Only sent contracts can be marked as signed" });
    }

    const body = buildContractBody({
      contractNumber: contract.contract_number,
      contractType: nextType,
      templateKey: nextTemplateKey,
      agencyName: getAppSettings(context.agencyId).agency_name,
      counterpartyName: nextCounterpartyName,
      counterpartyEmail: nextCounterpartyEmail,
      counterpartyTaxId: nextCounterpartyTaxId,
      counterpartyAddress: nextCounterpartyAddress,
      paymentTerms: nextPaymentTerms,
      startDate: nextStartDate,
      endDate: nextEndDate,
      currency: nextCurrency,
      subtotal,
      taxAmount,
      totalAmount,
      scopeSummary: nextScopeSummary,
      customRequirements: nextCustomRequirements,
      paymentIntegrationKey: nextPaymentIntegrationKey,
      signatureIntegrationKey: nextSignatureIntegrationKey,
      lineItems,
    });
    const updatedFields = [
      nextType !== contract.contract_type ? "contract_type" : null,
      (client?.id || null) !== contract.client_id ? "client_id" : null,
      (freelancer?.id || null) !== contract.freelancer_id ? "freelancer_id" : null,
      (ownerUser?.id || null) !== contract.owner_user_id ? "owner_user_id" : null,
      nextTemplateKey !== contract.template_key ? "template_key" : null,
      nextCurrency !== contract.currency ? "currency" : null,
      nextPaymentTerms !== contract.payment_terms ? "payment_terms" : null,
      nextStartDate !== contract.start_date ? "start_date" : null,
      nextEndDate !== contract.end_date ? "end_date" : null,
      nextCounterpartyName !== contract.counterparty_name ? "counterparty_name" : null,
      nextCounterpartyEmail !== contract.counterparty_email ? "counterparty_email" : null,
      nextCounterpartyTaxId !== contract.counterparty_tax_id ? "counterparty_tax_id" : null,
      nextCounterpartyAddress !== contract.counterparty_address ? "counterparty_address" : null,
      nextScopeSummary !== contract.scope_summary ? "scope_summary" : null,
      nextCustomRequirements !== contract.custom_requirements ? "custom_requirements" : null,
      nextPaymentIntegrationKey !== contract.payment_integration_key ? "payment_integration_key" : null,
      nextSignatureIntegrationKey !== contract.signature_integration_key
        ? "signature_integration_key"
        : null,
      req.body?.items !== undefined ? "line_items" : null,
      validation.status !== contract.validation_status ? "validation_status" : null,
      nextStatus !== contract.status ? "status" : null,
    ].filter((field): field is string => Boolean(field));

    db.transaction(() => {
      db.prepare(
        `
          UPDATE contracts
          SET
            contract_type = ?,
            client_id = ?,
            freelancer_id = ?,
            owner_user_id = ?,
            template_key = ?,
            status = ?,
            currency = ?,
            payment_terms = ?,
            start_date = ?,
            end_date = ?,
            counterparty_name = ?,
            counterparty_email = ?,
            counterparty_tax_id = ?,
            counterparty_address = ?,
            scope_summary = ?,
            custom_requirements = ?,
            payment_integration_key = ?,
            signature_integration_key = ?,
            subtotal = ?,
            tax_amount = ?,
            total_amount = ?,
            generated_body = ?,
            document_url = ?,
            validation_status = ?,
            validation_notes = ?,
            signed_at = ?,
            archived_at = ?,
            updated_at = CURRENT_TIMESTAMP
          WHERE id = ?
        `,
      ).run(
        nextType,
        client?.id || null,
        freelancer?.id || null,
        ownerUser?.id || null,
        nextTemplateKey,
        nextStatus,
        nextCurrency,
        nextPaymentTerms,
        nextStartDate,
        nextEndDate,
        nextCounterpartyName,
        nextCounterpartyEmail,
        nextCounterpartyTaxId,
        nextCounterpartyAddress,
        nextScopeSummary,
        nextCustomRequirements,
        nextPaymentIntegrationKey,
        nextSignatureIntegrationKey,
        subtotal,
        taxAmount,
        totalAmount,
        body,
        createContractUrl(contract.contract_number, nextCounterpartyName, body),
        validation.status,
        JSON.stringify(validation.notes),
        nextStatus === "signed" ? contract.signed_at || new Date().toISOString() : null,
        nextStatus === "archived" ? contract.archived_at || new Date().toISOString() : null,
        contract.id,
      );

      if (req.body?.items !== undefined) {
        db.prepare("DELETE FROM contract_line_items WHERE contract_id = ?").run(contract.id);
        const insertLineItem = db.prepare(
          `
            INSERT INTO contract_line_items (
              contract_id,
              service_price_id,
              title,
              description,
              quantity,
              unit_price,
              tax_rate,
              line_total
            )
            VALUES (?, ?, ?, ?, ?, ?, ?, ?)
          `,
        );

        lineItems.forEach((lineItem) => {
          insertLineItem.run(
            contract.id,
            lineItem.service_price_id,
            lineItem.title,
            lineItem.description,
            lineItem.quantity,
            lineItem.unit_price,
            lineItem.tax_rate,
            lineItem.line_total,
          );
        });
      }
    })();

    if (updatedFields.length > 0) {
      createAuditLog({
        action: nextStatus !== contract.status ? "contracts.status_changed" : "contracts.updated",
        entityType: "contract",
        entityId: contract.id,
        description:
          nextStatus !== contract.status
            ? `Se actualizó ${contract.contract_number} de ${contract.status} a ${nextStatus}.`
            : `Se actualizaron datos del contrato ${contract.contract_number}.`,
        authUser: context.authUser,
        agencyId: context.agencyId,
        metadata: {
          updated_fields: updatedFields,
          previous_status: contract.status,
          next_status: nextStatus,
          validation_status: validation.status,
        },
      });

      if (updatedFields.some((field) => field !== "status")) {
        createContractEvent({
          contractId: contract.id,
          eventType: "updated",
          title: "Contrato actualizado",
          description: `Se actualizaron datos internos de ${contract.contract_number}.`,
          authUser: context.authUser,
          agencyId: context.agencyId,
          metadata: {
            updated_fields: updatedFields.filter((field) => field !== "status"),
          },
        });
      }

      if (nextStatus !== contract.status) {
        const transitionMeta = getContractStatusTransitionMeta(
          contract.status,
          nextStatus,
          contract.contract_number,
        );

        createContractEvent({
          contractId: contract.id,
          eventType: transitionMeta.eventType,
          title: transitionMeta.title,
          description: transitionMeta.description,
          authUser: context.authUser,
          agencyId: context.agencyId,
          metadata: {
            previous_status: contract.status,
            next_status: nextStatus,
          },
        });
      }
    }

    res.json(serializeContract(contract.id));
  });

  app.get("/api/contracts/:id/events", requireSectionAccess("contracts"), (req, res) => {
    const context = getAgencyRequestContext(res.locals.authUser as AuthUser | undefined);
    const scopedClient = getScopedClientRecordForContext(context);
    const scopedFreelancer = getScopedFreelancerRecordForContext(context);
    const contractId = Number(req.params.id);

    if (!context) {
      return res.status(400).json({ error: "Agency not found" });
    }

    if (scopedClient === undefined) {
      return res.status(403).json({ error: "Client access is not linked correctly" });
    }

    if (scopedFreelancer === undefined) {
      return res.status(403).json({ error: "Freelancer access is not linked correctly" });
    }

    const contract = Number.isInteger(contractId) ? getContractRecordById(contractId) : undefined;

    if (!contract || contract.agency_id !== context.agencyId) {
      return res.status(404).json({ error: "Contract not found" });
    }

    if (scopedClient && contract.client_id !== scopedClient.id) {
      return res.status(404).json({ error: "Contract not found" });
    }

    if (scopedFreelancer && contract.freelancer_id !== scopedFreelancer.id) {
      return res.status(404).json({ error: "Contract not found" });
    }

    res.json(getContractEvents(contract.id));
  });

  app.post("/api/client-portal/contracts/:id/sign", requireSectionAccess("contracts"), (req, res) => {
    const context = getAgencyRequestContext(res.locals.authUser as AuthUser | undefined);
    const scopedClient = getScopedClientRecordForContext(context);
    const contractId = Number(req.params.id);
    const signerName =
      typeof req.body?.signer_name === "string" && req.body.signer_name.trim()
        ? req.body.signer_name.trim()
        : context?.authUser.name || "Cliente";
    const signerRole =
      typeof req.body?.signer_role === "string" && req.body.signer_role.trim()
        ? req.body.signer_role.trim()
        : null;
    const note =
      typeof req.body?.note === "string" && req.body.note.trim() ? req.body.note.trim() : null;

    if (!context) {
      return res.status(400).json({ error: "Agency not found" });
    }

    if (scopedClient === undefined) {
      return res.status(403).json({ error: "Client access is not linked correctly" });
    }

    if (!scopedClient) {
      return res.status(403).json({ error: "Only linked client users can sign contracts" });
    }

    const contract = Number.isInteger(contractId) ? getContractRecordById(contractId) : undefined;

    if (
      !contract ||
      contract.agency_id !== context.agencyId ||
      contract.contract_type !== "client" ||
      contract.client_id !== scopedClient.id
    ) {
      return res.status(404).json({ error: "Contract not found" });
    }

    if (contract.archived_at) {
      return res.status(400).json({ error: "Archived contracts cannot be signed" });
    }

    if (!["sent", "signed"].includes(contract.status)) {
      return res.status(400).json({ error: "This contract is not ready for client signature" });
    }

    if (contract.status !== "signed") {
      const signedAt = new Date().toISOString();

      db.prepare(
        `
          UPDATE contracts
          SET status = 'signed', signed_at = ?, updated_at = CURRENT_TIMESTAMP
          WHERE id = ?
        `,
      ).run(signedAt, contract.id);

      const description = note
        ? `${signerName} firmó digitalmente ${contract.contract_number}. Nota: ${note}`
        : `${signerName} firmó digitalmente ${contract.contract_number}.`;

      createContractEvent({
        contractId: contract.id,
        eventType: "signed",
        title: "Contrato firmado digitalmente",
        description,
        authUser: context.authUser,
        agencyId: context.agencyId,
        metadata: {
          signer_name: signerName,
          signer_role: signerRole,
          note,
          client_portal: true,
        },
      });

      createAuditLog({
        action: "contracts.signed",
        entityType: "contract",
        entityId: contract.id,
        description,
        authUser: context.authUser,
        agencyId: context.agencyId,
        metadata: {
          signer_name: signerName,
          signer_role: signerRole,
          client_id: scopedClient.id,
          client_portal: true,
        },
      });
    }

    syncClientOnboardingFlowSteps(scopedClient.id);
    res.json(serializeContract(contract.id));
  });

  app.post("/api/contracts/:id/review", requireSectionAccess("contracts"), (req, res) => {
    const context = getAgencyRequestContext(res.locals.authUser as AuthUser | undefined);
    const scopedClientId = getScopedClientIdForAuthUser(context?.authUser);
    const scopedFreelancerId = getScopedFreelancerIdForAuthUser(context?.authUser);
    const contractId = Number(req.params.id);
    const decision =
      typeof req.body?.decision === "string" ? req.body.decision.trim().toLowerCase() : "";
    const note =
      typeof req.body?.note === "string" && req.body.note.trim() ? req.body.note.trim() : null;

    if (!context) {
      return res.status(400).json({ error: "Agency not found" });
    }

    if (scopedClientId || scopedFreelancerId) {
      return res.status(403).json({ error: "Portal users have read-only contract access" });
    }

    const contract = Number.isInteger(contractId) ? getContractRecordById(contractId) : undefined;

    if (!contract || contract.agency_id !== context.agencyId) {
      return res.status(404).json({ error: "Contract not found" });
    }

    if (!["review", "approve", "changes_requested"].includes(decision)) {
      return res.status(400).json({ error: "Invalid review decision" });
    }

    if (contract.archived_at) {
      return res.status(400).json({ error: "Archived contracts cannot be reviewed" });
    }

    if (decision === "approve" && contract.validation_status === "invalid") {
      return res.status(400).json({ error: "Fix validation issues before approving this contract" });
    }

    const nextStatus =
      decision === "review"
        ? ("review" as ContractStatus)
        : decision === "approve"
          ? ("ready" as ContractStatus)
          : ("draft" as ContractStatus);
    const eventType =
      decision === "review"
        ? ("review_started" as ContractEventType)
        : decision === "approve"
          ? ("approved" as ContractEventType)
          : ("changes_requested" as ContractEventType);
    const action =
      decision === "review"
        ? "contracts.review_started"
        : decision === "approve"
          ? "contracts.review_approved"
          : "contracts.changes_requested";
    const title =
      decision === "review"
        ? "Revision iniciada"
        : decision === "approve"
          ? "Contrato aprobado"
          : "Cambios solicitados";
    const descriptionBase =
      decision === "review"
        ? `Se abrió la revisión interna de ${contract.contract_number}.`
        : decision === "approve"
          ? `Se aprobó ${contract.contract_number} para envío.`
          : `Se solicitaron cambios sobre ${contract.contract_number}.`;
    const description = note ? `${descriptionBase} Nota: ${note}` : descriptionBase;

    db.prepare(
      `
        UPDATE contracts
        SET status = ?, updated_at = CURRENT_TIMESTAMP
        WHERE id = ?
      `,
    ).run(nextStatus, contract.id);

    createContractEvent({
      contractId: contract.id,
      eventType,
      title,
      description,
      authUser: context.authUser,
      agencyId: context.agencyId,
      metadata: {
        previous_status: contract.status,
        next_status: nextStatus,
        note,
      },
    });

    createAuditLog({
      action,
      entityType: "contract",
      entityId: contract.id,
      description,
      authUser: context.authUser,
      agencyId: context.agencyId,
      metadata: {
        previous_status: contract.status,
        next_status: nextStatus,
        note,
      },
    });

    res.json(serializeContract(contract.id));
  });

  app.post("/api/contracts/:id/send", requireSectionAccess("contracts"), async (req, res) => {
    const context = getAgencyRequestContext(res.locals.authUser as AuthUser | undefined);
    const scopedClientId = getScopedClientIdForAuthUser(context?.authUser);
    const scopedFreelancerId = getScopedFreelancerIdForAuthUser(context?.authUser);
    const contractId = Number(req.params.id);
    const note =
      typeof req.body?.note === "string" && req.body.note.trim() ? req.body.note.trim() : null;

    if (!context) {
      return res.status(400).json({ error: "Agency not found" });
    }

    if (scopedClientId || scopedFreelancerId) {
      return res.status(403).json({ error: "Portal users have read-only contract access" });
    }

    const contract = Number.isInteger(contractId) ? getContractRecordById(contractId) : undefined;

    if (!contract || contract.agency_id !== context.agencyId) {
      return res.status(404).json({ error: "Contract not found" });
    }

    if (contract.archived_at || contract.status === "signed") {
      return res.status(400).json({ error: "This contract can no longer be sent" });
    }

    if (contract.validation_status === "invalid") {
      return res.status(400).json({ error: "Fix validation issues before sending this contract" });
    }

    if (contract.status !== "ready") {
      return res.status(400).json({ error: "Approve the contract before sending it" });
    }

    if (!contract.counterparty_email) {
      return res.status(400).json({ error: "Counterparty email is required before sending" });
    }

    db.prepare(
      `
        UPDATE contracts
        SET status = 'sent', updated_at = CURRENT_TIMESTAMP
        WHERE id = ?
      `,
    ).run(contract.id);

    const sentContract = getContractRecordById(contract.id) || contract;
    const delivery = await sendContractEmail({
      contract: sentContract,
      agencyName: getAppSettings(context.agencyId).agency_name,
      note,
      appUrl: getPublicAppUrl(req),
    });
    const description =
      delivery.delivered
        ? note
          ? `Se envió ${contract.contract_number} por email a ${contract.counterparty_email}. Nota: ${note}`
          : `Se envió ${contract.contract_number} por email a ${contract.counterparty_email}.`
        : delivery.reason === "smtp_not_configured"
          ? note
            ? `Se marcó ${contract.contract_number} como enviado para ${contract.counterparty_email}. SMTP no está configurado y queda pendiente de envío manual. Nota: ${note}`
            : `Se marcó ${contract.contract_number} como enviado para ${contract.counterparty_email}. SMTP no está configurado y queda pendiente de envío manual.`
          : note
            ? `Se marcó ${contract.contract_number} como enviado para ${contract.counterparty_email}, pero la entrega SMTP falló. Nota: ${note}`
            : `Se marcó ${contract.contract_number} como enviado para ${contract.counterparty_email}, pero la entrega SMTP falló.`;

    createContractEvent({
      contractId: contract.id,
      eventType: "sent",
      title: "Contrato enviado",
      description,
      authUser: context.authUser,
      agencyId: context.agencyId,
      metadata: {
        recipient_email: contract.counterparty_email,
        signature_integration_key: contract.signature_integration_key,
        payment_integration_key: contract.payment_integration_key,
        delivery_channel: delivery.channel,
        delivery_reason: delivery.reason,
        email_delivered: delivery.delivered,
        note,
      },
    });

    createAuditLog({
      action: "contracts.sent",
      entityType: "contract",
      entityId: contract.id,
      description,
      authUser: context.authUser,
      agencyId: context.agencyId,
      metadata: {
        recipient_email: contract.counterparty_email,
        signature_integration_key: contract.signature_integration_key,
        delivery_channel: delivery.channel,
        delivery_reason: delivery.reason,
        email_delivered: delivery.delivered,
        note,
      },
    });

    const serializedContract = serializeContract(contract.id);

    if (!serializedContract) {
      return res.status(500).json({ error: "Unable to load sent contract" });
    }

    res.json({
      ...serializedContract,
      delivery,
    });
  });

  app.get("/api/partner-referral-overview", requireSectionAccess("referrals"), (req, res) => {
    const context = getAgencyRequestContext(res.locals.authUser as AuthUser | undefined);

    if (!context) {
      return res.status(400).json({ error: "Agency not found" });
    }

    res.json(getPartnerReferralOverview(context.agencyId, req));
  });

  app.get("/api/referral-partners", requireSectionAccess("referrals"), (req, res) => {
    const context = getAgencyRequestContext(res.locals.authUser as AuthUser | undefined);

    if (!context) {
      return res.status(400).json({ error: "Agency not found" });
    }

    const rows = db
      .prepare(
        `
          SELECT *
          FROM referral_partners
          WHERE agency_id = ?
          ORDER BY status = 'active' DESC, id DESC
        `,
      )
      .all(context.agencyId) as ReferralPartnerRow[];

    res.json(rows.map(serializeReferralPartnerRow));
  });

  app.post("/api/referral-partners", requireSectionAccess("referrals"), (req, res) => {
    const context = getAgencyRequestContext(res.locals.authUser as AuthUser | undefined);
    const {
      owner_type,
      user_id,
      freelancer_id,
      payment_method,
      payout_reference,
      payout_integration_key,
      notes,
      status,
    } = req.body ?? {};

    if (!context) {
      return res.status(400).json({ error: "Agency not found" });
    }

    const ownerType = owner_type === "freelance" ? "freelance" : "team";
    const user = ownerType === "team" && Number.isInteger(Number(user_id)) && Number(user_id) > 0
      ? getUserRecordByIdFull(Number(user_id))
      : null;
    const freelancer =
      ownerType === "freelance" && Number.isInteger(Number(freelancer_id)) && Number(freelancer_id) > 0
        ? getFreelancerRecordById(Number(freelancer_id))
        : null;

    if (ownerType === "team" && (!user || user.agency_id !== context.agencyId)) {
      return res.status(400).json({ error: "Team member not found" });
    }

    if (ownerType === "freelance" && (!freelancer || freelancer.agency_id !== context.agencyId)) {
      return res.status(400).json({ error: "Freelancer not found" });
    }

    const duplicate = db
      .prepare(
        `
          SELECT id
          FROM referral_partners
          WHERE agency_id = ? AND owner_type = ? AND COALESCE(user_id, 0) = ? AND COALESCE(freelancer_id, 0) = ?
          LIMIT 1
        `,
      )
      .get(context.agencyId, ownerType, user?.id || 0, freelancer?.id || 0) as { id: number } | undefined;

    if (duplicate) {
      return res.status(409).json({ error: "This referral partner already exists" });
    }

    const result = db
      .prepare(
        `
          INSERT INTO referral_partners (
            owner_type,
            user_id,
            freelancer_id,
            payment_method,
            payout_reference,
            payout_integration_key,
            notes,
            status,
            agency_id,
            updated_at
          )
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)
        `,
      )
      .run(
        ownerType,
        user?.id || null,
        freelancer?.id || null,
        typeof payment_method === "string" && payment_method.trim() ? payment_method.trim() : null,
        typeof payout_reference === "string" && payout_reference.trim() ? payout_reference.trim() : null,
        typeof payout_integration_key === "string" && payout_integration_key.trim()
          ? payout_integration_key.trim()
          : null,
        typeof notes === "string" && notes.trim() ? notes.trim() : null,
        ["active", "paused", "archived"].includes(status) ? status : "active",
        context.agencyId,
      );

    const partner = getReferralPartnerRecordById(Number(result.lastInsertRowid));
    res.status(201).json(partner ? serializeReferralPartnerRow(partner) : null);
  });

  app.patch("/api/referral-partners/:id", requireSectionAccess("referrals"), (req, res) => {
    const context = getAgencyRequestContext(res.locals.authUser as AuthUser | undefined);
    const partnerId = Number(req.params.id);

    if (!context) {
      return res.status(400).json({ error: "Agency not found" });
    }

    const partner = Number.isInteger(partnerId) ? getReferralPartnerRecordById(partnerId) : undefined;

    if (!partner || partner.agency_id !== context.agencyId) {
      return res.status(404).json({ error: "Referral partner not found" });
    }

    db.prepare(
      `
        UPDATE referral_partners
        SET
          payment_method = ?,
          payout_reference = ?,
          payout_integration_key = ?,
          notes = ?,
          status = ?,
          updated_at = CURRENT_TIMESTAMP
        WHERE id = ?
      `,
    ).run(
      req.body?.payment_method === undefined
        ? partner.payment_method
        : typeof req.body.payment_method === "string" && req.body.payment_method.trim()
          ? req.body.payment_method.trim()
          : null,
      req.body?.payout_reference === undefined
        ? partner.payout_reference
        : typeof req.body.payout_reference === "string" && req.body.payout_reference.trim()
          ? req.body.payout_reference.trim()
          : null,
      req.body?.payout_integration_key === undefined
        ? partner.payout_integration_key
        : typeof req.body.payout_integration_key === "string" && req.body.payout_integration_key.trim()
          ? req.body.payout_integration_key.trim()
          : null,
      req.body?.notes === undefined
        ? partner.notes
        : typeof req.body.notes === "string" && req.body.notes.trim()
          ? req.body.notes.trim()
          : null,
      ["active", "paused", "archived"].includes(req.body?.status)
        ? req.body.status
        : partner.status,
      partner.id,
    );

    const updatedPartner = getReferralPartnerRecordById(partner.id);
    res.json(updatedPartner ? serializeReferralPartnerRow(updatedPartner) : null);
  });

  app.get("/api/partner-referral-codes", requireSectionAccess("referrals"), (req, res) => {
    const context = getAgencyRequestContext(res.locals.authUser as AuthUser | undefined);
    const partnerId = Number(req.query.partner_id || 0);

    if (!context) {
      return res.status(400).json({ error: "Agency not found" });
    }

    const rows = db
      .prepare(
        `
          SELECT *
          FROM partner_referral_codes
          WHERE agency_id = ? AND (? <= 0 OR partner_id = ?)
          ORDER BY datetime(created_at) DESC, id DESC
        `,
      )
      .all(context.agencyId, partnerId, partnerId) as PartnerReferralCodeRow[];

    res.json(rows.map((row) => serializePartnerReferralCodeRow(row, req)).filter(Boolean));
  });

  app.post("/api/partner-referral-codes", requireSectionAccess("referrals"), (req, res) => {
    const context = getAgencyRequestContext(res.locals.authUser as AuthUser | undefined);
    const {
      partner_id,
      code,
      landing_url,
      commission_type,
      commission_value,
      reward_description,
      notes,
      status,
    } = req.body ?? {};

    if (!context) {
      return res.status(400).json({ error: "Agency not found" });
    }

    const partner =
      Number.isInteger(Number(partner_id)) && Number(partner_id) > 0
        ? getReferralPartnerRecordById(Number(partner_id))
        : undefined;

    if (!partner || partner.agency_id !== context.agencyId || partner.status === "archived") {
      return res.status(400).json({ error: "Referral partner not found" });
    }

    const owner = getReferralPartnerDisplay(partner);
    const nextCode =
      typeof code === "string" && code.trim()
        ? normalizeReferralCodeValue(code)
        : generateUniqueReferralCode(owner.display_name);
    const nextCommissionType = commission_type === "fixed" ? "fixed" : "percent";
    const nextCommissionValue = Number(commission_value);

    if (!Number.isFinite(nextCommissionValue) || nextCommissionValue <= 0) {
      return res.status(400).json({ error: "Commission value must be greater than 0" });
    }

    if (getPartnerReferralCodeRecordByCode(nextCode) || getReferralCodeRecordByCode(nextCode)) {
      return res.status(409).json({ error: "This referral code already exists" });
    }

    const result = db
      .prepare(
        `
          INSERT INTO partner_referral_codes (
            partner_id,
            code,
            landing_url,
            commission_type,
            commission_value,
            reward_description,
            status,
            notes,
            agency_id,
            updated_at
          )
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)
        `,
      )
      .run(
        partner.id,
        nextCode,
        typeof landing_url === "string" && landing_url.trim() ? landing_url.trim() : null,
        nextCommissionType,
        Math.round(nextCommissionValue * 100) / 100,
        typeof reward_description === "string" && reward_description.trim()
          ? reward_description.trim()
          : null,
        ["active", "paused", "archived"].includes(status) ? status : "active",
        typeof notes === "string" && notes.trim() ? notes.trim() : null,
        context.agencyId,
      );

    const referralCode = getPartnerReferralCodeRecordById(Number(result.lastInsertRowid));
    res.status(201).json(referralCode ? serializePartnerReferralCodeRow(referralCode, req) : null);
  });

  app.patch("/api/partner-referral-codes/:id", requireSectionAccess("referrals"), (req, res) => {
    const context = getAgencyRequestContext(res.locals.authUser as AuthUser | undefined);
    const codeId = Number(req.params.id);

    if (!context) {
      return res.status(400).json({ error: "Agency not found" });
    }

    const referralCode = Number.isInteger(codeId) ? getPartnerReferralCodeRecordById(codeId) : undefined;

    if (!referralCode || referralCode.agency_id !== context.agencyId) {
      return res.status(404).json({ error: "Partner referral code not found" });
    }

    const nextCommissionValue =
      req.body?.commission_value === undefined
        ? referralCode.commission_value
        : Number(req.body.commission_value);

    if (!Number.isFinite(nextCommissionValue) || nextCommissionValue <= 0) {
      return res.status(400).json({ error: "Commission value must be greater than 0" });
    }

    db.prepare(
      `
        UPDATE partner_referral_codes
        SET
          landing_url = ?,
          commission_type = ?,
          commission_value = ?,
          reward_description = ?,
          status = ?,
          notes = ?,
          updated_at = CURRENT_TIMESTAMP
        WHERE id = ?
      `,
    ).run(
      req.body?.landing_url === undefined
        ? referralCode.landing_url
        : typeof req.body.landing_url === "string" && req.body.landing_url.trim()
          ? req.body.landing_url.trim()
          : null,
      req.body?.commission_type === "fixed" ? "fixed" : referralCode.commission_type,
      Math.round(nextCommissionValue * 100) / 100,
      req.body?.reward_description === undefined
        ? referralCode.reward_description
        : typeof req.body.reward_description === "string" && req.body.reward_description.trim()
          ? req.body.reward_description.trim()
          : null,
      ["active", "paused", "archived"].includes(req.body?.status)
        ? req.body.status
        : referralCode.status,
      req.body?.notes === undefined
        ? referralCode.notes
        : typeof req.body.notes === "string" && req.body.notes.trim()
          ? req.body.notes.trim()
          : null,
      referralCode.id,
    );

    const updatedCode = getPartnerReferralCodeRecordById(referralCode.id);
    res.json(updatedCode ? serializePartnerReferralCodeRow(updatedCode, req) : null);
  });

  app.post("/api/partner-referral-codes/:id/regenerate", requireSectionAccess("referrals"), (req, res) => {
    const context = getAgencyRequestContext(res.locals.authUser as AuthUser | undefined);
    const codeId = Number(req.params.id);

    if (!context) {
      return res.status(400).json({ error: "Agency not found" });
    }

    const referralCode = Number.isInteger(codeId) ? getPartnerReferralCodeRecordById(codeId) : undefined;
    const partner = referralCode ? getReferralPartnerRecordById(referralCode.partner_id) : null;

    if (!referralCode || !partner || referralCode.agency_id !== context.agencyId) {
      return res.status(404).json({ error: "Partner referral code not found" });
    }

    const nextCode = generateUniqueReferralCode(getReferralPartnerDisplay(partner).display_name);

    db.prepare(
      "UPDATE partner_referral_codes SET code = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?",
    ).run(nextCode, referralCode.id);

    const updatedCode = getPartnerReferralCodeRecordById(referralCode.id);
    res.json({
      regenerated: true,
      referral_code: updatedCode ? serializePartnerReferralCodeRow(updatedCode, req) : null,
    });
  });

  app.get("/api/partner-referrals", requireSectionAccess("referrals"), (req, res) => {
    const context = getAgencyRequestContext(res.locals.authUser as AuthUser | undefined);
    const partnerId = Number(req.query.partner_id || 0);
    const status = typeof req.query.status === "string" ? req.query.status.trim() : "";
    const payoutStatus =
      typeof req.query.payout_status === "string" ? req.query.payout_status.trim() : "";

    if (!context) {
      return res.status(400).json({ error: "Agency not found" });
    }

    const rows = db
      .prepare(
        `
          SELECT *
          FROM partner_referrals
          WHERE agency_id = ?
            AND (? <= 0 OR partner_id = ?)
            AND (? = '' OR status = ?)
            AND (? = '' OR payout_status = ?)
          ORDER BY datetime(created_at) DESC, id DESC
        `,
      )
      .all(context.agencyId, partnerId, partnerId, status, status, payoutStatus, payoutStatus) as PartnerReferralRow[];

    res.json(rows.map((row) => serializePartnerReferralRow(row, req)).filter(Boolean));
  });

  app.post("/api/partner-referrals", requireSectionAccess("referrals"), (req, res) => {
    const context = getAgencyRequestContext(res.locals.authUser as AuthUser | undefined);
    const {
      referral_code_id,
      referred_name,
      referred_company,
      referred_email,
      referred_phone,
      source,
      notes,
      auto_create_lead,
    } = req.body ?? {};

    if (!context) {
      return res.status(400).json({ error: "Agency not found" });
    }

    const referralCode =
      Number.isInteger(Number(referral_code_id)) && Number(referral_code_id) > 0
        ? getPartnerReferralCodeRecordById(Number(referral_code_id))
        : undefined;
    const partner = referralCode ? getReferralPartnerRecordById(referralCode.partner_id) : null;

    if (
      !referralCode ||
      !partner ||
      referralCode.agency_id !== context.agencyId ||
      partner.status === "archived" ||
      referralCode.status === "archived"
    ) {
      return res.status(400).json({ error: "Partner referral code not found" });
    }

    if (typeof referred_name !== "string" || !referred_name.trim()) {
      return res.status(400).json({ error: "Referred name is required" });
    }

    const normalizedEmail =
      typeof referred_email === "string" && referred_email.trim() ? referred_email.trim() : null;

    if (normalizedEmail && getPartnerReferralByCodeAndEmail(referralCode.id, normalizedEmail)) {
      return res.status(409).json({ error: "There is already a referral for this email and code" });
    }

    const shouldCreateLead = auto_create_lead !== false;
    const currency = getAppSettings(context.agencyId).currency;

    const result = db.transaction(() => {
      let leadId: number | null = null;

      if (shouldCreateLead) {
        const existingLead = normalizedEmail
          ? getLeadRecordByEmail(context.agencyId, normalizedEmail)
          : undefined;

        if (existingLead && !isArchivedRecord(existingLead)) {
          leadId = existingLead.id;
        } else {
          const leadInsert = db
            .prepare(
              `
                INSERT INTO leads (name, company, email, phone, source, service, budget, status, agency_id)
                VALUES (?, ?, ?, ?, ?, ?, ?, 'new', ?)
              `,
            )
            .run(
              referred_name.trim(),
              typeof referred_company === "string" && referred_company.trim()
                ? referred_company.trim()
                : null,
              normalizedEmail,
              typeof referred_phone === "string" && referred_phone.trim()
                ? referred_phone.trim()
                : null,
              `Referral Partner · ${referralCode.code}`,
              "Referral Partner",
              0,
              context.agencyId,
            );

          leadId = Number(leadInsert.lastInsertRowid);
        }
      }

      const referralInsert = db
        .prepare(
          `
            INSERT INTO partner_referrals (
              referral_code_id,
              partner_id,
              referred_name,
              referred_company,
              referred_email,
              referred_phone,
              status,
              payout_status,
              commission_amount,
              currency,
              lead_id,
              source,
              notes,
              agency_id,
              updated_at
            )
            VALUES (?, ?, ?, ?, ?, ?, ?, 'pending', 0, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)
          `,
        )
        .run(
          referralCode.id,
          partner.id,
          referred_name.trim(),
          typeof referred_company === "string" && referred_company.trim()
            ? referred_company.trim()
            : null,
          normalizedEmail,
          typeof referred_phone === "string" && referred_phone.trim() ? referred_phone.trim() : null,
          leadId ? "lead" : "invited",
          currency,
          leadId,
          typeof source === "string" && source.trim() ? source.trim() : "manual",
          typeof notes === "string" && notes.trim() ? notes.trim() : null,
          context.agencyId,
        );

      return Number(referralInsert.lastInsertRowid);
    })();

    const referral = getPartnerReferralRecordById(result);
    res.status(201).json(referral ? serializePartnerReferralRow(referral, req) : null);
  });

  app.patch("/api/partner-referrals/:id/status", requireSectionAccess("referrals"), (req, res) => {
    const context = getAgencyRequestContext(res.locals.authUser as AuthUser | undefined);
    const referralId = Number(req.params.id);

    if (!context) {
      return res.status(400).json({ error: "Agency not found" });
    }

    const referral = Number.isInteger(referralId) ? getPartnerReferralRecordById(referralId) : undefined;

    if (!referral || referral.agency_id !== context.agencyId) {
      return res.status(404).json({ error: "Partner referral not found" });
    }

    const referralCode = getPartnerReferralCodeRecordById(referral.referral_code_id);

    if (!referralCode) {
      return res.status(404).json({ error: "Partner referral code not found" });
    }

    const nextStatus = ["invited", "lead", "qualified", "converted", "rejected"].includes(req.body?.status)
      ? (req.body.status as ReferralStatus)
      : referral.status;
    const nextPayoutStatus = ["pending", "approved", "paid", "cancelled"].includes(req.body?.payout_status)
      ? (req.body.payout_status as ReferralPayoutStatus)
      : referral.payout_status;
    const invoice =
      Number.isInteger(Number(req.body?.invoice_id)) && Number(req.body?.invoice_id) > 0
        ? getInvoiceRecordById(Number(req.body.invoice_id))
        : referral.invoice_id
          ? getInvoiceRecordById(referral.invoice_id)
          : undefined;

    if (invoice && invoice.agency_id !== context.agencyId) {
      return res.status(400).json({ error: "Invoice not found" });
    }

    let convertedClient =
      Number.isInteger(Number(req.body?.converted_client_id)) && Number(req.body?.converted_client_id) > 0
        ? getClientRecordById(Number(req.body.converted_client_id))
        : referral.converted_client_id
          ? getClientRecordById(referral.converted_client_id)
          : referral.lead_id
            ? getClientRecordByLeadId(referral.lead_id)
            : referral.referred_company
              ? getClientRecordByCompany(context.agencyId, referral.referred_company)
              : undefined;

    if (convertedClient && convertedClient.agency_id !== context.agencyId) {
      return res.status(400).json({ error: "Converted client not found" });
    }

    if (invoice) {
      convertedClient = convertedClient || getClientRecordById(invoice.client_id);
    }

    const nextCommissionAmount =
      req.body?.commission_amount === undefined
        ? invoice
          ? calculateReferralCommission({
              commissionType: referralCode.commission_type,
              commissionValue: referralCode.commission_value,
              invoiceAmount: invoice.amount,
            })
          : referral.commission_amount
        : Number(req.body.commission_amount);

    if (!Number.isFinite(nextCommissionAmount) || nextCommissionAmount < 0) {
      return res.status(400).json({ error: "Invalid commission amount" });
    }

    db.prepare(
      `
        UPDATE partner_referrals
        SET
          status = ?,
          payout_status = ?,
          commission_amount = ?,
          payout_due_date = ?,
          paid_at = ?,
          converted_client_id = ?,
          invoice_id = ?,
          notes = ?,
          converted_at = ?,
          updated_at = CURRENT_TIMESTAMP
        WHERE id = ?
      `,
    ).run(
      nextStatus,
      nextPayoutStatus,
      nextCommissionAmount,
      req.body?.payout_due_date === undefined
        ? referral.payout_due_date
        : typeof req.body.payout_due_date === "string" && req.body.payout_due_date.trim()
          ? req.body.payout_due_date.trim()
          : null,
      nextPayoutStatus === "paid" ? referral.paid_at || new Date().toISOString() : null,
      convertedClient?.id || null,
      invoice?.id || null,
      req.body?.notes === undefined
        ? referral.notes
        : typeof req.body.notes === "string" && req.body.notes.trim()
          ? req.body.notes.trim()
          : null,
      nextStatus === "converted" ? referral.converted_at || new Date().toISOString() : null,
      referral.id,
    );

    const updatedReferral = getPartnerReferralRecordById(referral.id);
    res.json(updatedReferral ? serializePartnerReferralRow(updatedReferral, req) : null);
  });

  app.get("/api/integrations", requireSectionAccess("integrations"), (req, res) => {
    const authUser = res.locals.authUser as AuthUser | undefined;
    const agencyId = getAgencyIdForAuthUser(authUser || null);
    const accessibleSections = authUser?.accessible_sections || ["dashboard"];

    if (!agencyId) {
      return res.status(400).json({ error: "Agency not found" });
    }

    res.json(getIntegrationsByAgencyId(agencyId));
  });

  app.get("/api/integration-events", requireSectionAccess("integrations"), (req, res) => {
    const authUser = res.locals.authUser as AuthUser | undefined;
    const agencyId = getAgencyIdForAuthUser(authUser || null);

    if (!agencyId) {
      return res.status(400).json({ error: "Agency not found" });
    }

    const integrationId = Number(req.query.integration_id || 0);
    const requestedLimit = Number(req.query.limit || 60);
    const limit =
      Number.isFinite(requestedLimit) && requestedLimit > 0 ? Math.min(requestedLimit, 200) : 60;

    res.json(
      getIntegrationEvents({
        agencyId,
        integrationId: Number.isFinite(integrationId) && integrationId > 0 ? integrationId : null,
        limit,
      }),
    );
  });

  app.get("/api/integration-clients", requireSectionAccess("integrations"), (req, res) => {
    const authUser = res.locals.authUser as AuthUser | undefined;
    const agencyId = getAgencyIdForAuthUser(authUser || null);

    if (!agencyId) {
      return res.status(400).json({ error: "Agency not found" });
    }

    res.json(getClientConnectionOptions(agencyId));
  });

  app.get("/api/client-integrations", requireSectionAccess("integrations"), (req, res) => {
    const authUser = res.locals.authUser as AuthUser | undefined;
    const agencyId = getAgencyIdForAuthUser(authUser || null);

    if (!agencyId) {
      return res.status(400).json({ error: "Agency not found" });
    }

    res.json(getClientIntegrationConnections(agencyId));
  });

  app.post("/api/client-integrations", requireSectionAccess("integrations"), (req, res) => {
    const authUser = res.locals.authUser as AuthUser | undefined;
    const agencyId = getAgencyIdForAuthUser(authUser || null);
    const body = isPlainObject(req.body) ? req.body : {};
    const clientId = Number(body.client_id);
    const integrationKey = String(body.integration_key || "").trim() as IntegrationKey;

    if (!agencyId) {
      return res.status(400).json({ error: "Agency not found" });
    }

    if (!Number.isFinite(clientId)) {
      return res.status(400).json({ error: "Client id is required" });
    }

    if (!getIntegrationTemplateByKey(integrationKey)) {
      return res.status(400).json({ error: "Invalid integration key" });
    }

    const client = getClientRecordById(clientId);

    if (!client || client.agency_id !== agencyId || isArchivedRecord(client)) {
      return res.status(404).json({ error: "Client not found" });
    }

    const existing = getClientIntegrationRecordByClientAndKey(clientId, integrationKey);
    const integrationTemplate = getIntegrationTemplateByKey(integrationKey);
    const normalizeString = (value: unknown) =>
      typeof value === "string" ? value.trim() || null : null;
    const syncEnabled =
      typeof body.sync_enabled === "boolean"
        ? body.sync_enabled
        : existing?.sync_enabled === 1
          ? true
          : false;

    if (existing) {
      db.prepare(
        `
          UPDATE client_integrations
          SET
            account_label = ?,
            endpoint_url = ?,
            api_key = ?,
            access_token = ?,
            email = ?,
            account_id = ?,
            notes = ?,
            sync_enabled = ?,
            updated_at = CURRENT_TIMESTAMP
          WHERE id = ?
        `,
      ).run(
        normalizeString(body.account_label) ?? existing.account_label,
        normalizeString(body.endpoint_url) ?? existing.endpoint_url,
        normalizeString(body.api_key) ?? existing.api_key,
        normalizeString(body.access_token) ?? existing.access_token,
        normalizeString(body.email) ?? existing.email,
        normalizeString(body.account_id) ?? existing.account_id,
        normalizeString(body.notes) ?? existing.notes,
        syncEnabled ? 1 : 0,
        existing.id,
      );

      createAuditLog({
        action: "client_integration.updated",
        entityType: "client_integration",
        entityId: existing.id,
        description: `Se actualizó la conexión manual ${integrationTemplate?.name || integrationKey} para ${client.company}.`,
        authUser: authUser || null,
        agencyId,
        metadata: {
          client_id: client.id,
          integration_key: integrationKey,
        },
      });

      return res.json(getClientIntegrationConnectionById(existing.id));
    }

    const clientIntegrationId = Number(
      db
        .prepare(
          `
            INSERT INTO client_integrations (
              client_id,
              integration_key,
              integration_name,
              status,
              account_label,
              endpoint_url,
              api_key,
              access_token,
              email,
              account_id,
              notes,
              sync_enabled,
              agency_id
            )
            VALUES (?, ?, ?, 'disconnected', ?, ?, ?, ?, ?, ?, ?, ?, ?)
          `,
        )
        .run(
          client.id,
          integrationKey,
          integrationTemplate?.name || integrationKey,
          normalizeString(body.account_label),
          normalizeString(body.endpoint_url),
          normalizeString(body.api_key),
          normalizeString(body.access_token),
          normalizeString(body.email),
          normalizeString(body.account_id),
          normalizeString(body.notes),
          syncEnabled ? 1 : 0,
          agencyId,
        ).lastInsertRowid,
    );

    createAuditLog({
      action: "client_integration.created",
      entityType: "client_integration",
      entityId: clientIntegrationId,
      description: `Se creó la conexión manual ${integrationTemplate?.name || integrationKey} para ${client.company}.`,
      authUser: authUser || null,
      agencyId,
      metadata: {
        client_id: client.id,
        integration_key: integrationKey,
      },
    });

    return res.json(getClientIntegrationConnectionById(clientIntegrationId));
  });

  app.post(
    "/api/client-integrations/:id/connect",
    requireSectionAccess("integrations"),
    (req, res) => {
      const authUser = res.locals.authUser as AuthUser | undefined;
      const agencyId = getAgencyIdForAuthUser(authUser || null);
      const clientIntegrationId = Number(req.params.id);

      if (!agencyId) {
        return res.status(400).json({ error: "Agency not found" });
      }

      if (!Number.isFinite(clientIntegrationId)) {
        return res.status(400).json({ error: "Invalid client integration id" });
      }

      const clientIntegration = getClientIntegrationRecordById(clientIntegrationId);

      if (!clientIntegration || clientIntegration.agency_id !== agencyId) {
        return res.status(404).json({ error: "Client integration not found" });
      }

      if (!clientIntegrationHasConnectionData(clientIntegration)) {
        return res.status(400).json({
          error: "Añade datos de cuenta, email, token, endpoint o id antes de conectar.",
        });
      }

      db.prepare(
        `
          UPDATE client_integrations
          SET status = 'connected', updated_at = CURRENT_TIMESTAMP
          WHERE id = ?
        `,
      ).run(clientIntegration.id);

      createAuditLog({
        action: "client_integration.connected",
        entityType: "client_integration",
        entityId: clientIntegration.id,
        description: `Se conectó manualmente ${clientIntegration.integration_name} para un cliente.`,
        authUser: authUser || null,
        agencyId,
        metadata: {
          client_id: clientIntegration.client_id,
          integration_key: clientIntegration.integration_key,
        },
      });

      res.json(getClientIntegrationConnectionById(clientIntegration.id));
    },
  );

  app.post(
    "/api/client-integrations/:id/disconnect",
    requireSectionAccess("integrations"),
    (req, res) => {
      const authUser = res.locals.authUser as AuthUser | undefined;
      const agencyId = getAgencyIdForAuthUser(authUser || null);
      const clientIntegrationId = Number(req.params.id);

      if (!agencyId) {
        return res.status(400).json({ error: "Agency not found" });
      }

      if (!Number.isFinite(clientIntegrationId)) {
        return res.status(400).json({ error: "Invalid client integration id" });
      }

      const clientIntegration = getClientIntegrationRecordById(clientIntegrationId);

      if (!clientIntegration || clientIntegration.agency_id !== agencyId) {
        return res.status(404).json({ error: "Client integration not found" });
      }

      db.prepare(
        `
          UPDATE client_integrations
          SET status = 'disconnected', updated_at = CURRENT_TIMESTAMP
          WHERE id = ?
        `,
      ).run(clientIntegration.id);

      createAuditLog({
        action: "client_integration.disconnected",
        entityType: "client_integration",
        entityId: clientIntegration.id,
        description: `Se desconectó manualmente ${clientIntegration.integration_name} para un cliente.`,
        authUser: authUser || null,
        agencyId,
        metadata: {
          client_id: clientIntegration.client_id,
          integration_key: clientIntegration.integration_key,
        },
      });

      res.json(getClientIntegrationConnectionById(clientIntegration.id));
    },
  );

  app.post(
    "/api/client-integrations/:id/test",
    requireSectionAccess("integrations"),
    (req, res) => {
      const authUser = res.locals.authUser as AuthUser | undefined;
      const agencyId = getAgencyIdForAuthUser(authUser || null);
      const clientIntegrationId = Number(req.params.id);

      if (!agencyId) {
        return res.status(400).json({ error: "Agency not found" });
      }

      if (!Number.isFinite(clientIntegrationId)) {
        return res.status(400).json({ error: "Invalid client integration id" });
      }

      const clientIntegration = getClientIntegrationRecordById(clientIntegrationId);

      if (!clientIntegration || clientIntegration.agency_id !== agencyId) {
        return res.status(404).json({ error: "Client integration not found" });
      }

      const success = clientIntegrationHasConnectionData(clientIntegration);
      const summary = success
        ? `Configuración válida para ${clientIntegration.integration_name}.`
        : `Faltan datos manuales para ${clientIntegration.integration_name}.`;

      db.prepare(
        `
          UPDATE client_integrations
          SET
            status = ?,
            last_tested_at = CURRENT_TIMESTAMP,
            updated_at = CURRENT_TIMESTAMP
          WHERE id = ?
        `,
      ).run(
        success
          ? clientIntegration.status === "disconnected"
            ? "attention"
            : "connected"
          : "attention",
        clientIntegration.id,
      );

      createAuditLog({
        action: "client_integration.tested",
        entityType: "client_integration",
        entityId: clientIntegration.id,
        description: `Se probó la conexión manual ${clientIntegration.integration_name}: ${summary}`,
        authUser: authUser || null,
        agencyId,
        metadata: {
          client_id: clientIntegration.client_id,
          integration_key: clientIntegration.integration_key,
          success,
        },
      });

      res.json({
        connection: getClientIntegrationConnectionById(clientIntegration.id),
        result: {
          status: success ? "success" : "error",
          summary,
        },
      });
    },
  );

  app.patch("/api/integrations/:id", requireSectionAccess("integrations"), (req, res) => {
    const authUser = res.locals.authUser as AuthUser | undefined;
    const agencyId = getAgencyIdForAuthUser(authUser || null);
    const integrationId = Number(req.params.id);

    if (!agencyId) {
      return res.status(400).json({ error: "Agency not found" });
    }

    if (!Number.isFinite(integrationId)) {
      return res.status(400).json({ error: "Invalid integration id" });
    }

    const integration = getIntegrationRecordById(integrationId);

    if (!integration || integration.agency_id !== agencyId) {
      return res.status(404).json({ error: "Integration not found" });
    }

    const body = isPlainObject(req.body) ? req.body : {};
    const normalizeString = (value: unknown) =>
      typeof value === "string" ? value.trim() || null : null;
    const normalizeBoolean = (value: unknown, fallback: boolean) =>
      typeof value === "boolean" ? value : fallback;
    const scopes = Array.isArray(body.scopes)
      ? body.scopes
          .filter((item): item is string => typeof item === "string" && item.trim().length > 0)
          .map((item) => item.trim())
      : parseIntegrationScopes(integration.scopes);

    db.prepare(
      `
        UPDATE integrations
        SET
          account_label = ?,
          endpoint_url = ?,
          api_key = ?,
          access_token = ?,
          email = ?,
          account_id = ?,
          notes = ?,
          sync_enabled = ?,
          auto_capture_leads = ?,
          scopes = ?,
          updated_at = CURRENT_TIMESTAMP
        WHERE id = ?
      `,
    ).run(
      normalizeString(body.account_label) ?? integration.account_label,
      normalizeString(body.endpoint_url) ?? integration.endpoint_url,
      normalizeString(body.api_key) ?? integration.api_key,
      normalizeString(body.access_token) ?? integration.access_token,
      normalizeString(body.email) ?? integration.email,
      normalizeString(body.account_id) ?? integration.account_id,
      normalizeString(body.notes) ?? integration.notes,
      normalizeBoolean(body.sync_enabled, integration.sync_enabled === 1) ? 1 : 0,
      normalizeBoolean(body.auto_capture_leads, integration.auto_capture_leads === 1) ? 1 : 0,
      serializeIntegrationScopes(scopes),
      integration.id,
    );

    const updatedIntegration = getIntegrationRecordById(integration.id);

    if (!updatedIntegration) {
      return res.status(500).json({ error: "Integration update failed" });
    }

    createAuditLog({
      action: "integration.updated",
      entityType: "integration",
      entityId: integration.id,
      description: `Se actualizó la configuración de ${integration.name}.`,
      authUser: authUser || null,
      agencyId,
      metadata: {
        integration_key: integration.key,
      },
    });

    res.json(serializeIntegration(updatedIntegration));
  });

  app.post("/api/integrations/:id/connect", requireSectionAccess("integrations"), (req, res) => {
    const authUser = res.locals.authUser as AuthUser | undefined;
    const agencyId = getAgencyIdForAuthUser(authUser || null);
    const integrationId = Number(req.params.id);

    if (!agencyId) {
      return res.status(400).json({ error: "Agency not found" });
    }

    if (!Number.isFinite(integrationId)) {
      return res.status(400).json({ error: "Invalid integration id" });
    }

    const integration = getIntegrationRecordById(integrationId);

    if (!integration || integration.agency_id !== agencyId) {
      return res.status(404).json({ error: "Integration not found" });
    }

    if (!integrationHasConnectionData(integration)) {
      return res.status(400).json({
        error: "Configura al menos un dato de conexión o usa la URL webhook antes de conectar.",
      });
    }

    db.prepare(
      `
        UPDATE integrations
        SET status = 'connected', updated_at = CURRENT_TIMESTAMP
        WHERE id = ?
      `,
    ).run(integration.id);

    createIntegrationEvent({
      integrationId: integration.id,
      direction: "outbound",
      eventType: "connection.connected",
      status: "success",
      summary: `Integración ${integration.name} conectada manualmente.`,
      agencyId,
    });

    createAuditLog({
      action: "integration.connected",
      entityType: "integration",
      entityId: integration.id,
      description: `Se conectó ${integration.name}.`,
      authUser: authUser || null,
      agencyId,
      metadata: {
        integration_key: integration.key,
      },
    });

    res.json(serializeIntegration(getIntegrationRecordById(integration.id) || integration));
  });

  app.post("/api/integrations/:id/disconnect", requireSectionAccess("integrations"), (req, res) => {
    const authUser = res.locals.authUser as AuthUser | undefined;
    const agencyId = getAgencyIdForAuthUser(authUser || null);
    const integrationId = Number(req.params.id);

    if (!agencyId) {
      return res.status(400).json({ error: "Agency not found" });
    }

    if (!Number.isFinite(integrationId)) {
      return res.status(400).json({ error: "Invalid integration id" });
    }

    const integration = getIntegrationRecordById(integrationId);

    if (!integration || integration.agency_id !== agencyId) {
      return res.status(404).json({ error: "Integration not found" });
    }

    db.prepare(
      `
        UPDATE integrations
        SET status = 'disconnected', updated_at = CURRENT_TIMESTAMP
        WHERE id = ?
      `,
    ).run(integration.id);

    createIntegrationEvent({
      integrationId: integration.id,
      direction: "outbound",
      eventType: "connection.disconnected",
      status: "ignored",
      summary: `Integración ${integration.name} desconectada manualmente.`,
      agencyId,
    });

    createAuditLog({
      action: "integration.disconnected",
      entityType: "integration",
      entityId: integration.id,
      description: `Se desconectó ${integration.name}.`,
      authUser: authUser || null,
      agencyId,
      metadata: {
        integration_key: integration.key,
      },
    });

    res.json(serializeIntegration(getIntegrationRecordById(integration.id) || integration));
  });

  app.post("/api/integrations/:id/test", requireSectionAccess("integrations"), (req, res) => {
    const authUser = res.locals.authUser as AuthUser | undefined;
    const agencyId = getAgencyIdForAuthUser(authUser || null);
    const integrationId = Number(req.params.id);

    if (!agencyId) {
      return res.status(400).json({ error: "Agency not found" });
    }

    if (!Number.isFinite(integrationId)) {
      return res.status(400).json({ error: "Invalid integration id" });
    }

    const integration = getIntegrationRecordById(integrationId);

    if (!integration || integration.agency_id !== agencyId) {
      return res.status(404).json({ error: "Integration not found" });
    }

    const success = integrationHasConnectionData(integration);
    const summary = success
      ? `Configuración válida para ${integration.name}.`
      : `Faltan credenciales, endpoint o webhook para ${integration.name}.`;

    db.prepare(
      `
        UPDATE integrations
        SET
          status = ?,
          last_tested_at = CURRENT_TIMESTAMP,
          updated_at = CURRENT_TIMESTAMP
        WHERE id = ?
      `,
    ).run(
      success ? (integration.status === "disconnected" ? "attention" : "connected") : "attention",
      integration.id,
    );

    createIntegrationEvent({
      integrationId: integration.id,
      direction: "outbound",
      eventType: "connection.healthcheck",
      status: success ? "success" : "error",
      summary,
      agencyId,
    });

    createAuditLog({
      action: "integration.tested",
      entityType: "integration",
      entityId: integration.id,
      description: `Se probó ${integration.name}: ${summary}`,
      authUser: authUser || null,
      agencyId,
      metadata: {
        integration_key: integration.key,
        success,
      },
    });

    res.json({
      integration: serializeIntegration(getIntegrationRecordById(integration.id) || integration),
      result: {
        status: success ? "success" : "error",
        summary,
      },
    });
  });

  app.post("/api/integrations/:id/simulate", requireSectionAccess("integrations"), (req, res) => {
    const authUser = res.locals.authUser as AuthUser | undefined;
    const agencyId = getAgencyIdForAuthUser(authUser || null);
    const integrationId = Number(req.params.id);

    if (!agencyId) {
      return res.status(400).json({ error: "Agency not found" });
    }

    if (!Number.isFinite(integrationId)) {
      return res.status(400).json({ error: "Invalid integration id" });
    }

    const integration = getIntegrationRecordById(integrationId);

    if (!integration || integration.agency_id !== agencyId) {
      return res.status(404).json({ error: "Integration not found" });
    }

    if (integration.supports_webhook !== 1) {
      return res.status(400).json({ error: "This integration does not support inbound simulation" });
    }

    const body = isPlainObject(req.body) ? req.body : {};
    const payload = Object.keys(body).length > 0 ? body : buildIntegrationSamplePayload(integration);
    const result = ingestIntegrationPayload({
      integration,
      payload,
    });

    db.prepare(
      "UPDATE integrations SET last_synced_at = CURRENT_TIMESTAMP, updated_at = CURRENT_TIMESTAMP WHERE id = ?",
    ).run(integration.id);

    createIntegrationEvent({
      integrationId: integration.id,
      direction: "inbound",
      eventType: "simulation.run",
      status: result.status,
      summary: result.summary,
      payload,
      agencyId,
    });

    createAuditLog({
      action: "integration.simulated",
      entityType: "integration",
      entityId: integration.id,
      description: `Se simuló un evento en ${integration.name}: ${result.summary}`,
      authUser: authUser || null,
      agencyId,
      metadata: {
        integration_key: integration.key,
        result_status: result.status,
        entity_type: result.entityType,
        entity_id: result.entityId,
      },
    });

    res.status(result.status === "error" ? 400 : 200).json({
      integration: serializeIntegration(getIntegrationRecordById(integration.id) || integration),
      result: {
        status: result.status,
        summary: result.summary,
        entity_type: result.entityType,
        entity_id: result.entityId,
      },
      payload,
    });
  });

  app.post(
    "/api/integrations/:id/webhook/regenerate",
    requireSectionAccess("integrations"),
    (req, res) => {
      const authUser = res.locals.authUser as AuthUser | undefined;
      const agencyId = getAgencyIdForAuthUser(authUser || null);
      const integrationId = Number(req.params.id);

      if (!agencyId) {
        return res.status(400).json({ error: "Agency not found" });
      }

      if (!Number.isFinite(integrationId)) {
        return res.status(400).json({ error: "Invalid integration id" });
      }

      const integration = getIntegrationRecordById(integrationId);

      if (!integration || integration.agency_id !== agencyId) {
        return res.status(404).json({ error: "Integration not found" });
      }

      if (integration.supports_webhook !== 1) {
        return res.status(400).json({ error: "This integration does not use webhooks" });
      }

      db.prepare(
        `
          UPDATE integrations
          SET webhook_secret = ?, updated_at = CURRENT_TIMESTAMP
          WHERE id = ?
        `,
      ).run(createIntegrationSecret(), integration.id);

      createAuditLog({
        action: "integration.webhook_regenerated",
        entityType: "integration",
        entityId: integration.id,
        description: `Se regeneró la URL webhook de ${integration.name}.`,
        authUser: authUser || null,
        agencyId,
        metadata: {
          integration_key: integration.key,
        },
      });

      res.json(serializeIntegration(getIntegrationRecordById(integration.id) || integration));
    },
  );

  app.get("/api/calendar-events", requireSectionAccess("dashboard"), (req, res) => {
    const authUser = res.locals.authUser as AuthUser | undefined;
    const agencyId = getAgencyIdForAuthUser(authUser || null);
    const accessibleSections = authUser?.accessible_sections || ["dashboard"];

    if (getScopedClientIdForAuthUser(authUser)) {
      return res.json([]);
    }

    if (!agencyId) {
      return res.status(400).json({ error: "Agency not found" });
    }

    syncAgencyOperationalSignals(agencyId);

    const rawLimit = Number(req.query.limit ?? 40);
    const limit = Number.isInteger(rawLimit) ? Math.max(1, Math.min(rawLimit, 200)) : 40;
    const actionTab =
      typeof req.query.tab === "string" && req.query.tab.trim()
        ? (req.query.tab.trim() as AppSection)
        : null;
    const sourceType =
      typeof req.query.source_type === "string" && req.query.source_type.trim()
        ? (req.query.source_type.trim() as CalendarEventSourceType)
        : null;

    res.json(
      getCalendarEvents({
        agencyId,
        limit,
        actionTab,
        sourceType,
      }).filter((calendarEvent) => accessibleSections.includes(calendarEvent.action_tab)),
    );
  });

  app.patch("/api/calendar-events/:id/status", requireSectionAccess("dashboard"), (req, res) => {
    const calendarEventId = Number(req.params.id);
    const { status } = req.body ?? {};
    const authUser = res.locals.authUser as AuthUser | undefined;
    const agencyId = getAgencyIdForAuthUser(authUser || null);
    const allowedStatuses = new Set<CalendarEventStatus>(["scheduled", "completed", "cancelled"]);

    if (getScopedClientIdForAuthUser(authUser)) {
      return res.status(403).json({ error: "Client users do not manage the operational calendar" });
    }

    if (!agencyId) {
      return res.status(400).json({ error: "Agency not found" });
    }

    if (!Number.isInteger(calendarEventId) || !allowedStatuses.has(status)) {
      return res.status(400).json({ error: "Invalid calendar event id or status" });
    }

    const calendarEvent = getCalendarEventById(calendarEventId);

    if (!calendarEvent || calendarEvent.agency_id !== agencyId) {
      return res.status(404).json({ error: "Calendar event not found" });
    }

    db.prepare(
      `
        UPDATE calendar_events
        SET status = ?, updated_at = CURRENT_TIMESTAMP
        WHERE id = ?
      `,
    ).run(status, calendarEvent.id);

    createAuditLog({
      action: "calendar_event.status_updated",
      entityType: "calendar_event",
      entityId: calendarEvent.id,
      description: `Se actualizó el estado del evento de calendario "${calendarEvent.title}" a ${status}.`,
      authUser: authUser || null,
      agencyId,
      metadata: {
        source_type: calendarEvent.source_type,
        source_ref: calendarEvent.source_ref,
        status,
      },
    });

    res.json(serializeCalendarEvent(getCalendarEventById(calendarEvent.id) || calendarEvent));
  });

  app.get("/api/notifications", requireSectionAccess("dashboard"), (req, res) => {
    const authUser = res.locals.authUser as AuthUser | undefined;
    const agencyId = getAgencyIdForAuthUser(authUser || null);
    const accessibleSections = authUser?.accessible_sections || ["dashboard"];

    if (getScopedClientIdForAuthUser(authUser)) {
      return res.json([]);
    }

    if (!agencyId) {
      return res.status(400).json({ error: "Agency not found" });
    }

    syncAgencyOperationalSignals(agencyId);

    const rawLimit = Number(req.query.limit ?? 20);
    const limit = Number.isInteger(rawLimit) ? Math.max(1, Math.min(rawLimit, 200)) : 20;
    const unreadOnly = String(req.query.unread || "").trim() === "1";

    res.json(
      getNotifications({ agencyId, limit, unreadOnly }).filter((notification) =>
        accessibleSections.includes(notification.action_tab),
      ),
    );
  });

  app.post("/api/notifications/:id/read", requireSectionAccess("dashboard"), (req, res) => {
    const notificationId = Number(req.params.id);
    const authUser = res.locals.authUser as AuthUser | undefined;
    const agencyId = getAgencyIdForAuthUser(authUser || null);

    if (getScopedClientIdForAuthUser(authUser)) {
      return res.status(403).json({ error: "Client users do not manage internal notifications" });
    }

    if (!agencyId) {
      return res.status(400).json({ error: "Agency not found" });
    }

    if (!Number.isInteger(notificationId)) {
      return res.status(400).json({ error: "Invalid notification id" });
    }

    const notification = getNotificationById(notificationId);

    if (!notification || notification.agency_id !== agencyId) {
      return res.status(404).json({ error: "Notification not found" });
    }

    db.prepare(
      `
        UPDATE notifications
        SET is_read = 1, read_at = COALESCE(read_at, CURRENT_TIMESTAMP), updated_at = CURRENT_TIMESTAMP
        WHERE id = ?
      `,
    ).run(notification.id);

    res.json(serializeNotification(getNotificationById(notification.id) || notification));
  });

  app.post("/api/notifications/read-all", requireSectionAccess("dashboard"), (req, res) => {
    const authUser = res.locals.authUser as AuthUser | undefined;
    const agencyId = getAgencyIdForAuthUser(authUser || null);

    if (getScopedClientIdForAuthUser(authUser)) {
      return res.status(403).json({ error: "Client users do not manage internal notifications" });
    }

    if (!agencyId) {
      return res.status(400).json({ error: "Agency not found" });
    }

    const result = db.prepare(
      `
        UPDATE notifications
        SET is_read = 1, read_at = COALESCE(read_at, CURRENT_TIMESTAMP), updated_at = CURRENT_TIMESTAMP
        WHERE agency_id = ? AND is_read = 0
      `,
    ).run(agencyId);

    res.json({ updated: result.changes });
  });

  app.get("/api/settings", requireSectionAccess("settings"), (req, res) => {
    const context = getAgencyRequestContext(res.locals.authUser as AuthUser | undefined);

    if (!context) {
      return res.status(400).json({ error: "Agency not found" });
    }

    res.json(getAppSettings(context.agencyId));
  });

  app.get("/api/settings/production-readiness", requireSectionAccess("settings"), (req, res) => {
    const context = getAgencyRequestContext(res.locals.authUser as AuthUser | undefined);

    if (!context) {
      return res.status(400).json({ error: "Agency not found" });
    }

    const items = getProductionReadiness(req, context.agencyId);
    const overallStatus = getOverallReadinessStatus(items);

    res.json({
      overall_status: overallStatus,
      items,
    });
  });

  app.get("/api/audit-logs", requireSectionAccess("settings"), (req, res) => {
    const context = getAgencyRequestContext(res.locals.authUser as AuthUser | undefined);

    if (!context) {
      return res.status(400).json({ error: "Agency not found" });
    }

    const rawLimit = Number(req.query.limit ?? 80);
    const limit = Number.isInteger(rawLimit)
      ? Math.max(1, Math.min(rawLimit, 200))
      : 80;
    const action =
      typeof req.query.action === "string" && req.query.action.trim()
        ? req.query.action.trim()
        : null;
    const entityType =
      typeof req.query.entity_type === "string" && req.query.entity_type.trim()
        ? req.query.entity_type.trim()
        : null;
    const query =
      typeof req.query.q === "string" && req.query.q.trim()
        ? req.query.q.trim().toLowerCase()
        : null;
    const conditions = ["agency_id = ?"];
    const params: Array<string | number> = [context.agencyId];

    if (action) {
      conditions.push("action = ?");
      params.push(action);
    }

    if (entityType) {
      conditions.push("entity_type = ?");
      params.push(entityType);
    }

    if (query) {
      const pattern = `%${query}%`;
      conditions.push(
        "(lower(description) LIKE ? OR lower(actor_name) LIKE ? OR lower(COALESCE(actor_email, '')) LIKE ?)",
      );
      params.push(pattern, pattern, pattern);
    }

    const rows = db
      .prepare(
        `
          SELECT
            id,
            user_id,
            actor_name,
            actor_email,
            action,
            entity_type,
            entity_id,
            description,
            metadata,
            created_at
          FROM audit_logs
          WHERE ${conditions.join(" AND ")}
          ORDER BY datetime(created_at) DESC, id DESC
          LIMIT ?
        `,
      )
      .all(...params, limit) as Array<{
      id: number;
      user_id: number | null;
      actor_name: string;
      actor_email: string | null;
      action: string;
      entity_type: string;
      entity_id: number | null;
      description: string;
      metadata: string | null;
      created_at: string;
    }>;

    res.json(
      rows.map((row) => ({
        ...row,
        metadata: parseAuditMetadata(row.metadata),
      })),
    );
  });

  app.get("/api/admin/overview", requireSectionAccess("settings"), (req, res) => {
    const context = getAgencyRequestContext(res.locals.authUser as AuthUser | undefined);
    const overview = getAdminOverview(
      context?.agencyId ?? null,
      getSessionTokenFromCookieHeader(req.headers.cookie),
    );

    if (!overview) {
      return res.status(400).json({ error: "Agency not found" });
    }

    res.json(overview);
  });

  app.post("/api/admin/sessions/:id/revoke", requireSectionAccess("settings"), (req, res) => {
    const context = getAgencyRequestContext(res.locals.authUser as AuthUser | undefined);
    const sessionId = Number(req.params.id);
    const currentSessionId = getCurrentSessionIdByToken(
      getSessionTokenFromCookieHeader(req.headers.cookie),
    );

    if (!context) {
      return res.status(400).json({ error: "Agency not found" });
    }

    if (!Number.isInteger(sessionId)) {
      return res.status(400).json({ error: "Invalid session id" });
    }

    if (currentSessionId === sessionId) {
      return res.status(400).json({ error: "Current session cannot be revoked here" });
    }

    const session = db
      .prepare(
        `
          SELECT sessions.id, sessions.user_id, sessions.expires_at, users.name, users.email, users.role
          FROM sessions
          INNER JOIN users ON users.id = sessions.user_id
          WHERE sessions.id = ? AND users.agency_id = ?
        `,
      )
      .get(sessionId, context.agencyId) as
      | {
          id: number;
          user_id: number;
          expires_at: string;
          name: string;
          email: string;
          role: string;
        }
      | undefined;

    if (!session) {
      return res.status(404).json({ error: "Session not found" });
    }

    db.prepare("DELETE FROM sessions WHERE id = ?").run(session.id);
    createAuditLog({
      action: "admin.session_revoked",
      entityType: "session",
      entityId: session.id,
      description: `Se revocó una sesión activa de ${session.name}.`,
      authUser: res.locals.authUser as AuthUser,
      metadata: {
        revoked_user_id: session.user_id,
        revoked_role: session.role,
        expires_at: session.expires_at,
      },
    });

    res.json({ revoked: true });
  });

  app.put("/api/settings", requireSectionAccess("settings"), (req, res) => {
    const context = getAgencyRequestContext(res.locals.authUser as AuthUser | undefined);

    if (!context) {
      return res.status(400).json({ error: "Agency not found" });
    }

    const currentSettings = getAppSettings(context.agencyId);
    const nextSettings: AppSettingsPayload = {
      ...currentSettings,
      ...(req.body ?? {}),
    };
    const allowedPlans = new Set<SubscriptionPlan>(["starter", "pro", "enterprise"]);
    const allowedCurrencies = new Set<SupportedCurrency>(["USD", "EUR", "MXN"]);
    const allowedSessionTimeouts = new Set<SessionTimeout>(["30m", "2h", "8h"]);

    if (typeof nextSettings.agency_name !== "string" || !nextSettings.agency_name.trim()) {
      return res.status(400).json({ error: "Agency name is required" });
    }

    if (!allowedPlans.has(nextSettings.subscription_plan)) {
      return res.status(400).json({ error: "Invalid subscription plan" });
    }

    if (typeof nextSettings.timezone !== "string" || !nextSettings.timezone.trim()) {
      return res.status(400).json({ error: "Timezone is required" });
    }

    if (!allowedCurrencies.has(nextSettings.currency)) {
      return res.status(400).json({ error: "Invalid currency" });
    }

    if (!allowedSessionTimeouts.has(nextSettings.session_timeout)) {
      return res.status(400).json({ error: "Invalid session timeout" });
    }

    if (
      typeof nextSettings.client_referral_program_enabled !== "boolean" ||
      typeof nextSettings.partner_referral_program_enabled !== "boolean" ||
      typeof nextSettings.email_reports !== "boolean" ||
      typeof nextSettings.task_reminders !== "boolean" ||
      typeof nextSettings.invoice_alerts !== "boolean" ||
      typeof nextSettings.weekly_digest !== "boolean" ||
      typeof nextSettings.two_factor !== "boolean" ||
      typeof nextSettings.login_alerts !== "boolean" ||
      typeof nextSettings.ai_trigger_new_lead !== "boolean" ||
      typeof nextSettings.ai_trigger_client_report !== "boolean" ||
      typeof nextSettings.ai_trigger_project_task_pack !== "boolean"
    ) {
      return res.status(400).json({ error: "Invalid boolean settings payload" });
    }

    saveAppSettings(context.agencyId, {
      ...nextSettings,
      agency_name: nextSettings.agency_name.trim(),
      timezone: nextSettings.timezone.trim(),
    });

    const savedSettings = getAppSettings(context.agencyId);
    createAiTriggerStateChangeAuditLogs({
      previousSettings: currentSettings,
      nextSettings: savedSettings,
      authUser: context.authUser,
      agencyId: context.agencyId,
      source: "ajustes",
    });
    createAuditLog({
      action: "settings.updated",
      entityType: "settings",
      entityId: context.agencyId,
      description: `Se actualizaron los ajustes de la agencia ${savedSettings.agency_name}.`,
      authUser: context.authUser,
      metadata: {
        agency_name: savedSettings.agency_name,
        subscription_plan: savedSettings.subscription_plan,
        session_timeout: savedSettings.session_timeout,
        client_referral_program_enabled: savedSettings.client_referral_program_enabled,
        partner_referral_program_enabled: savedSettings.partner_referral_program_enabled,
        ai_trigger_new_lead: savedSettings.ai_trigger_new_lead,
        ai_trigger_client_report: savedSettings.ai_trigger_client_report,
        ai_trigger_project_task_pack: savedSettings.ai_trigger_project_task_pack,
      },
    });

    res.json(savedSettings);
  });

  app.post("/api/settings/reset", requireSectionAccess("settings"), (req, res) => {
    const context = getAgencyRequestContext(res.locals.authUser as AuthUser | undefined);

    if (!context) {
      return res.status(400).json({ error: "Agency not found" });
    }

    const currentSettings = getAppSettings(context.agencyId);
    saveAppSettings(context.agencyId, defaultAppSettings);
    const resetSettings = getAppSettings(context.agencyId);
    createAiTriggerStateChangeAuditLogs({
      previousSettings: currentSettings,
      nextSettings: resetSettings,
      authUser: context.authUser,
      agencyId: context.agencyId,
      source: "restablecimiento",
    });
    createAuditLog({
      action: "settings.reset",
      entityType: "settings",
      entityId: context.agencyId,
      description: `Se restablecieron los ajustes de la agencia ${resetSettings.agency_name}.`,
      authUser: context.authUser,
      metadata: {
        agency_name: resetSettings.agency_name,
      },
    });
    res.json(resetSettings);
  });

  app.post("/api/settings/ai-triggers/:key/disable", requireSectionAccess("settings"), (req, res) => {
    const context = getAgencyRequestContext(res.locals.authUser as AuthUser | undefined);
    const triggerKey = req.params.key as AiTriggerSettingKey;
    const allowedTriggerKeys = new Set<AiTriggerSettingKey>(AI_TRIGGER_KEYS);

    if (!context) {
      return res.status(400).json({ error: "Agency not found" });
    }

    if (!allowedTriggerKeys.has(triggerKey)) {
      return res.status(400).json({ error: "Invalid AI trigger key" });
    }

    const currentSettings = getAppSettings(context.agencyId);
    const alreadyDisabled = currentSettings[triggerKey] === false;
    const nextSettings: AppSettingsPayload = {
      ...currentSettings,
      [triggerKey]: false,
    };

    saveAppSettings(context.agencyId, nextSettings);

    createAuditLog({
      action: "settings.ai_trigger_disabled",
      entityType: "settings",
      entityId: context.agencyId,
      description: `Se desactivó el trigger IA ${triggerKey}.`,
      authUser: context.authUser,
      metadata: {
        trigger_key: triggerKey,
        already_disabled: alreadyDisabled,
      },
    });

    res.json({
      disabled: true,
      trigger_key: triggerKey,
      already_disabled: alreadyDisabled,
      settings: getAppSettings(context.agencyId),
    });
  });

  app.post("/api/settings/ai-triggers/:key/enable", requireSectionAccess("settings"), (req, res) => {
    const context = getAgencyRequestContext(res.locals.authUser as AuthUser | undefined);
    const triggerKey = req.params.key as AiTriggerSettingKey;
    const allowedTriggerKeys = new Set<AiTriggerSettingKey>(AI_TRIGGER_KEYS);

    if (!context) {
      return res.status(400).json({ error: "Agency not found" });
    }

    if (!allowedTriggerKeys.has(triggerKey)) {
      return res.status(400).json({ error: "Invalid AI trigger key" });
    }

    const currentSettings = getAppSettings(context.agencyId);
    const alreadyEnabled = currentSettings[triggerKey] === true;
    const nextSettings: AppSettingsPayload = {
      ...currentSettings,
      [triggerKey]: true,
    };

    saveAppSettings(context.agencyId, nextSettings);

    createAuditLog({
      action: "settings.ai_trigger_enabled",
      entityType: "settings",
      entityId: context.agencyId,
      description: `Se reactivó el trigger IA ${triggerKey}.`,
      authUser: context.authUser,
      metadata: {
        trigger_key: triggerKey,
        already_enabled: alreadyEnabled,
      },
    });

    res.json({
      enabled: true,
      trigger_key: triggerKey,
      already_enabled: alreadyEnabled,
      settings: getAppSettings(context.agencyId),
    });
  });

  app.post("/api/settings/ai-triggers/enable-all", requireSectionAccess("settings"), (req, res) => {
    const context = getAgencyRequestContext(res.locals.authUser as AuthUser | undefined);

    if (!context) {
      return res.status(400).json({ error: "Agency not found" });
    }

    const currentSettings = getAppSettings(context.agencyId);
    const disabledTriggerKeys = AI_TRIGGER_KEYS.filter((triggerKey) => currentSettings[triggerKey] === false);
    const nextSettings: AppSettingsPayload = {
      ...currentSettings,
      ...Object.fromEntries(AI_TRIGGER_KEYS.map((triggerKey) => [triggerKey, true])),
    } as AppSettingsPayload;

    saveAppSettings(context.agencyId, nextSettings);
    createAiTriggerStateChangeAuditLogs({
      previousSettings: currentSettings,
      nextSettings,
      authUser: context.authUser,
      agencyId: context.agencyId,
      source: "reactivacion masiva",
    });

    createAuditLog({
      action: "settings.ai_triggers_enabled_bulk",
      entityType: "settings",
      entityId: context.agencyId,
      description: `Se reactivaron ${disabledTriggerKeys.length} triggers IA desde el panel administrativo.`,
      authUser: context.authUser,
      metadata: {
        trigger_keys: disabledTriggerKeys,
        reactivated_count: disabledTriggerKeys.length,
      },
    });

    res.json({
      enabled: true,
      trigger_keys: disabledTriggerKeys,
      reactivated_count: disabledTriggerKeys.length,
      settings: getAppSettings(context.agencyId),
    });
  });

  app.post("/api/ai/generate", requireSectionAccess("ai"), async (req, res) => {
    const { feature, input } = req.body ?? {};
    const allowedFeatures = new Set<AiFeatureId>([
      "proposal",
      "strategy",
      "analysis",
      "content",
    ]);

    if (typeof input !== "string" || !input.trim()) {
      return res.status(400).json({ error: "Prompt input is required" });
    }

    if (!allowedFeatures.has(feature)) {
      return res.status(400).json({ error: "Invalid AI feature" });
    }

    const prompt = `${aiFeaturePrompts[feature]} ${input.trim()}`;
    const fallbackText = buildAiFallbackResponse(feature, input);

    if (!process.env.GEMINI_API_KEY) {
      return res.json({ text: fallbackText, source: "local" });
    }

    try {
      const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });
      const response = await ai.models.generateContent({
        model: process.env.GEMINI_MODEL || "gemini-2.5-flash",
        contents: prompt,
        config: {
          systemInstruction: aiSystemInstruction,
        },
      });

      if (!response.text?.trim()) {
        return res.json({ text: fallbackText, source: "local" });
      }

      return res.json({ text: response.text.trim(), source: "gemini" });
    } catch (error) {
      console.error("AI generation fallback:", error);
      return res.json({ text: fallbackText, source: "local" });
    }
  });

  app.get("/api/ai/runs", requireSectionAccess("ai"), (req, res) => {
    const context = getAgencyRequestContext(res.locals.authUser as AuthUser | undefined);

    if (!context) {
      return res.status(400).json({ error: "Agency not found" });
    }

    const rawLimit = Number(req.query.limit ?? 30);
    const limit = Number.isInteger(rawLimit)
      ? Math.max(1, Math.min(rawLimit, 100))
      : 30;
    const automation =
      typeof req.query.automation === "string" &&
      ["lead_followup", "client_report", "project_tasks"].includes(req.query.automation)
        ? (req.query.automation as AiAutomationId)
        : null;
    const mode =
      typeof req.query.mode === "string" && ["manual", "trigger"].includes(req.query.mode)
        ? (req.query.mode as AiAutomationMode)
        : null;
    const status =
      typeof req.query.status === "string" && ["success", "error", "skipped"].includes(req.query.status)
        ? (req.query.status as AiAutomationRunStatus)
        : null;
    const triggerKey =
      typeof req.query.trigger_key === "string" &&
      [
        "ai_trigger_new_lead",
        "ai_trigger_client_report",
        "ai_trigger_project_task_pack",
      ].includes(req.query.trigger_key)
        ? (req.query.trigger_key as AiTriggerSettingKey)
        : null;

    res.json(
      getAIAutomationRuns({
        agencyId: context.agencyId,
        limit,
        automation,
        mode,
        status,
        triggerKey,
      }),
    );
  });

  app.post("/api/ai/automations/run", requireSectionAccess("ai"), (req, res) => {
    const { automation, entity_id, input } = req.body ?? {};
    const authUser = res.locals.authUser as AuthUser;
    const parsedEntityId = Number(entity_id);
    const allowedAutomations = new Set<AiAutomationId>([
      "lead_followup",
      "client_report",
      "project_tasks",
    ]);

    if (!allowedAutomations.has(automation)) {
      return res.status(400).json({ error: "Invalid automation" });
    }

    if (!Number.isInteger(parsedEntityId) || parsedEntityId <= 0) {
      return res.status(400).json({ error: "Invalid entity id" });
    }

    try {
      const result = executeAIAutomation({
        automation,
        entityId: parsedEntityId,
        input: typeof input === "string" ? input : "",
        authUser,
      });

      createAIAutomationRun({
        automation,
        mode: "manual",
        status: getAutomationRunStatus(result.applied_actions),
        entityType: getAutomationEntityType(automation),
        entityId: parsedEntityId,
        source: result.source,
        summary: result.summary,
        actions: result.applied_actions,
        authUser,
      });

      return res.json(result);
    } catch (error) {
      const message = error instanceof Error ? error.message : "Automation failed";

      createAIAutomationRun({
        automation,
        mode: "manual",
        status: "error",
        entityType: getAutomationEntityType(automation),
        entityId: Number.isInteger(parsedEntityId) && parsedEntityId > 0 ? parsedEntityId : null,
        errorMessage: message,
        authUser,
      });

      if (message === "Forbidden") {
        return res.status(403).json({ error: "Forbidden" });
      }

      if (message === "Lead not found" || message === "Client not found" || message === "Project not found") {
        return res.status(404).json({ error: message });
      }

      console.error("AI automation run failed:", error);
      return res.status(500).json({ error: "Automation failed" });
    }
  });

  app.get("/api/leads", requireSectionAccess("leads"), (req, res) => {
    const context = getAgencyRequestContext(res.locals.authUser as AuthUser | undefined);

    if (!context) {
      return res.status(400).json({ error: "Agency not found" });
    }

    const archiveScope = getArchiveScopeFromQuery(req.query as Record<string, unknown>);
    const leads = db
      .prepare(
        `SELECT * FROM leads WHERE agency_id = ? AND ${getArchiveSqlCondition(archiveScope)} ORDER BY created_at DESC`,
      )
      .all(context.agencyId);
    res.json(leads);
  });

  app.get("/api/leads/:id/follow-up", requireSectionAccess("leads"), (req, res) => {
    const context = getAgencyRequestContext(res.locals.authUser as AuthUser | undefined);
    const leadId = Number(req.params.id);
    const lead = getLeadRecordById(leadId);

    if (!context) {
      return res.status(400).json({ error: "Agency not found" });
    }

    if (
      !Number.isInteger(leadId) ||
      !lead ||
      !isAgencyOwnedRecord(lead, context.agencyId) ||
      isArchivedRecord(lead)
    ) {
      return res.status(404).json({ error: "Lead not found" });
    }

    res.json({
      lead,
      notes: getLeadNotes(lead.id),
    });
  });

  app.post("/api/leads", requireSectionAccess("leads"), (req, res) => {
    const context = getAgencyRequestContext(res.locals.authUser as AuthUser | undefined);
    const { name, company, email, phone, source, service, budget, status } = req.body ?? {};
    const parsedBudget = Number(budget ?? 0);
    const allowedStatuses = new Set([
      "new",
      "contacted",
      "meeting",
      "diagnosis",
      "proposal",
      "negotiation",
      "closed",
      "lost",
    ]);
    const resolvedStatus =
      typeof status === "string" && allowedStatuses.has(status) ? status : "new";

    if (!context) {
      return res.status(400).json({ error: "Agency not found" });
    }

    if (typeof name !== "string" || !name.trim()) {
      return res.status(400).json({ error: "Name is required" });
    }

    if (Number.isNaN(parsedBudget) || parsedBudget < 0) {
      return res.status(400).json({ error: "Budget must be a valid positive number" });
    }

    if (status !== undefined && !allowedStatuses.has(status)) {
      return res.status(400).json({ error: "Invalid lead status" });
    }

    const result = db
      .prepare(
        `
          INSERT INTO leads (name, company, email, phone, source, service, budget, status, agency_id)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
        `,
      )
      .run(
        name.trim(),
        typeof company === "string" ? company.trim() : null,
        typeof email === "string" ? email.trim() : null,
        typeof phone === "string" ? phone.trim() : null,
        typeof source === "string" ? source.trim() : null,
        typeof service === "string" ? service.trim() : null,
        parsedBudget,
        resolvedStatus,
        context.agencyId,
      );

    const lead = db.prepare("SELECT * FROM leads WHERE id = ?").get(result.lastInsertRowid);
    createAuditLog({
      action: "lead.created",
      entityType: "lead",
      entityId: Number(result.lastInsertRowid),
      description: `Se creó el lead ${name.trim()}${typeof company === "string" && company.trim() ? ` para ${company.trim()}` : ""}.`,
      authUser: res.locals.authUser as AuthUser,
      metadata: {
        company: typeof company === "string" ? company.trim() : null,
        service: typeof service === "string" ? service.trim() : null,
        budget: parsedBudget,
        status: resolvedStatus,
      },
    });

    runAIAutomationTrigger({
      agencyId: context.agencyId,
      triggerKey: "ai_trigger_new_lead",
      automation: "lead_followup",
      entityId: Number(result.lastInsertRowid),
      input: [
        typeof source === "string" && source.trim() ? `Origen: ${source.trim()}` : null,
        typeof service === "string" && service.trim() ? `Servicio: ${service.trim()}` : null,
      ]
        .filter(Boolean)
        .join(" | "),
      entityType: "lead",
      authUser: res.locals.authUser as AuthUser,
      description: `Se ejecutó automáticamente el seguimiento IA al crear el lead ${name.trim()}.`,
    });
    res.status(201).json(lead);
  });

  app.patch("/api/leads/:id/follow-up", requireSectionAccess("leads"), (req, res) => {
    const context = getAgencyRequestContext(res.locals.authUser as AuthUser | undefined);
    const leadId = Number(req.params.id);
    const lead = getLeadRecordById(leadId);
    const { next_action, next_contact_date, last_contacted_at } = req.body ?? {};
    const shouldUpdateNextAction = next_action !== undefined;
    const shouldUpdateNextContactDate = next_contact_date !== undefined;
    const shouldUpdateLastContactedAt = last_contacted_at !== undefined;

    if (!context) {
      return res.status(400).json({ error: "Agency not found" });
    }

    if (
      !Number.isInteger(leadId) ||
      !lead ||
      !isAgencyOwnedRecord(lead, context.agencyId) ||
      isArchivedRecord(lead)
    ) {
      return res.status(404).json({ error: "Lead not found" });
    }

    if (
      next_action !== undefined &&
      next_action !== null &&
      typeof next_action !== "string"
    ) {
      return res.status(400).json({ error: "Invalid next action" });
    }

    if (
      next_contact_date !== undefined &&
      next_contact_date !== null &&
      (typeof next_contact_date !== "string" ||
        Number.isNaN(new Date(next_contact_date).getTime()))
    ) {
      return res.status(400).json({ error: "Invalid next contact date" });
    }

    if (
      last_contacted_at !== undefined &&
      last_contacted_at !== null &&
      (typeof last_contacted_at !== "string" ||
        Number.isNaN(new Date(last_contacted_at).getTime()))
    ) {
      return res.status(400).json({ error: "Invalid last contact date" });
    }

    db.prepare(
      `
        UPDATE leads
        SET
          next_action = CASE WHEN ? = 1 THEN ? ELSE next_action END,
          next_contact_date = CASE WHEN ? = 1 THEN ? ELSE next_contact_date END,
          last_contacted_at = CASE WHEN ? = 1 THEN ? ELSE last_contacted_at END
        WHERE id = ?
      `,
    ).run(
      shouldUpdateNextAction ? 1 : 0,
      typeof next_action === "string" ? next_action.trim() : null,
      shouldUpdateNextContactDate ? 1 : 0,
      typeof next_contact_date === "string" ? next_contact_date : null,
      shouldUpdateLastContactedAt ? 1 : 0,
      typeof last_contacted_at === "string" ? last_contacted_at : null,
      lead.id,
    );

    const updatedLead = getLeadRecordById(lead.id);

    if (!updatedLead) {
      return res.status(404).json({ error: "Lead not found" });
    }

    syncLeadFollowUpCalendarEvent(updatedLead.id);

    createAuditLog({
      action: "lead.follow_up_updated",
      entityType: "lead",
      entityId: updatedLead.id,
      description: `Se actualizó el seguimiento comercial del lead ${updatedLead.name}.`,
      authUser: res.locals.authUser as AuthUser,
      metadata: {
        next_action: updatedLead.next_action,
        next_contact_date: updatedLead.next_contact_date,
        last_contacted_at: updatedLead.last_contacted_at,
      },
    });

    res.json(updatedLead);
  });

  app.post("/api/leads/:id/notes", requireSectionAccess("leads"), (req, res) => {
    const context = getAgencyRequestContext(res.locals.authUser as AuthUser | undefined);
    const leadId = Number(req.params.id);
    const lead = getLeadRecordById(leadId);
    const { content, type } = req.body ?? {};
    const authUser = res.locals.authUser as AuthUser;
    const allowedTypes = new Set(["note", "call", "email", "meeting", "whatsapp"]);

    if (!context) {
      return res.status(400).json({ error: "Agency not found" });
    }

    if (
      !Number.isInteger(leadId) ||
      !lead ||
      !isAgencyOwnedRecord(lead, context.agencyId) ||
      isArchivedRecord(lead)
    ) {
      return res.status(404).json({ error: "Lead not found" });
    }

    if (typeof content !== "string" || !content.trim()) {
      return res.status(400).json({ error: "Note content is required" });
    }

    if (type && !allowedTypes.has(type)) {
      return res.status(400).json({ error: "Invalid note type" });
    }

    const noteType = (type || "note") as "note" | "call" | "email" | "meeting" | "whatsapp";
    const result = db
      .prepare(
        `
          INSERT INTO lead_notes (lead_id, author_id, author_name, type, content)
          VALUES (?, ?, ?, ?, ?)
        `,
      )
      .run(lead.id, authUser.id, authUser.name, noteType, content.trim());

    if (noteType !== "note") {
      db.prepare("UPDATE leads SET last_contacted_at = ? WHERE id = ?").run(
        new Date().toISOString(),
        lead.id,
      );
    }

    const note = db
      .prepare(
        "SELECT id, lead_id, author_id, author_name, type, content, created_at FROM lead_notes WHERE id = ?",
      )
      .get(result.lastInsertRowid);

    createAuditLog({
      action: "lead.note_added",
      entityType: "lead_note",
      entityId: Number(result.lastInsertRowid),
      description: `Se añadió una nota de tipo ${noteType} al lead ${lead.name}.`,
      authUser,
      metadata: {
        lead_id: lead.id,
        type: noteType,
      },
    });

    res.status(201).json({
      note,
      lead: getLeadRecordById(lead.id),
    });
  });

  app.patch("/api/leads/:id/status", requireSectionAccess("leads"), (req, res) => {
    const context = getAgencyRequestContext(res.locals.authUser as AuthUser | undefined);
    const leadId = Number(req.params.id);
    const { status } = req.body ?? {};
    const allowedStatuses = new Set([
      "new",
      "contacted",
      "meeting",
      "diagnosis",
      "proposal",
      "negotiation",
      "closed",
      "lost",
    ]);

    if (!context) {
      return res.status(400).json({ error: "Agency not found" });
    }

    if (!Number.isInteger(leadId) || !allowedStatuses.has(status)) {
      return res.status(400).json({ error: "Invalid lead id or status" });
    }

    const result = db
      .prepare("UPDATE leads SET status = ? WHERE id = ? AND agency_id = ? AND archived_at IS NULL")
      .run(status, leadId, context.agencyId);

    if (result.changes === 0) {
      return res.status(404).json({ error: "Lead not found" });
    }

    const lead = db.prepare("SELECT * FROM leads WHERE id = ?").get(leadId);
    syncLeadFollowUpCalendarEvent(leadId);
    createAuditLog({
      action: "lead.status_updated",
      entityType: "lead",
      entityId: leadId,
      description: `Se actualizó el estado del lead #${leadId} a ${status}.`,
      authUser: res.locals.authUser as AuthUser,
      metadata: {
        status,
      },
    });
    res.json(lead);
  });

  app.post("/api/leads/:id/convert", requireSectionAccess("leads"), (req, res) => {
    const context = getAgencyRequestContext(res.locals.authUser as AuthUser | undefined);
    const leadId = Number(req.params.id);

    if (!Number.isInteger(leadId)) {
      return res.status(400).json({ error: "Invalid lead id" });
    }

    if (!context) {
      return res.status(400).json({ error: "Agency not found" });
    }

    const lead = getLeadRecordById(leadId);

    if (!lead || !isAgencyOwnedRecord(lead, context.agencyId) || isArchivedRecord(lead)) {
      return res.status(404).json({ error: "Lead not found" });
    }

    if (lead.status === "lost") {
      return res.status(400).json({ error: "Lost leads cannot be converted into clients" });
    }

    const normalizedCompany = (lead.company || "").trim();

    const convertLead = db.transaction(() => {
      const linkedClient = getClientRecordByLeadId(lead.id);

      if (linkedClient && linkedClient.agency_id === context.agencyId) {
        if (lead.status !== "closed") {
          db.prepare("UPDATE leads SET status = 'closed' WHERE id = ?").run(lead.id);
        }

        return {
          lead: getLeadRecordById(lead.id),
          client: getClientRecordById(linkedClient.id),
          alreadyConverted: true,
          matchedBy: "lead" as const,
        };
      }

      if (normalizedCompany) {
        const existingCompanyClient = getClientRecordByCompany(context.agencyId, normalizedCompany);

        if (existingCompanyClient) {
          if (lead.status !== "closed") {
            db.prepare("UPDATE leads SET status = 'closed' WHERE id = ?").run(lead.id);
          }

          return {
            lead: getLeadRecordById(lead.id),
            client: getClientRecordById(existingCompanyClient.id),
            alreadyConverted: true,
            matchedBy: "company" as const,
          };
        }
      }

      const result = db
        .prepare(
          `
            INSERT INTO clients (lead_id, company, industry, budget, status, agency_id)
            VALUES (?, ?, ?, ?, 'active', ?)
          `,
        )
        .run(
          lead.id,
          normalizedCompany || lead.name.trim(),
          null,
          Number(lead.budget || 0) || 0,
          lead.agency_id || context.agencyId,
        );

      db.prepare("UPDATE leads SET status = 'closed' WHERE id = ?").run(lead.id);

      return {
        lead: getLeadRecordById(lead.id),
        client: getClientRecordById(Number(result.lastInsertRowid)),
        alreadyConverted: false,
        matchedBy: "new" as const,
      };
    });

    const conversion = convertLead();
    const operationalSetup = conversion.client
      ? ensureClientOperationalSetup({
          clientId: conversion.client.id,
          preferredOwnerUserId: lead.assigned_to,
          fallbackOwnerUserId: context.authUser.id,
          triggerInput: [
            lead.service?.trim() ? `Servicio interesado: ${lead.service.trim()}` : null,
            lead.source?.trim() ? `Origen del lead: ${lead.source.trim()}` : null,
            `Conversión desde lead ${lead.name}`,
          ]
            .filter(Boolean)
            .join(" | "),
          authUser: context.authUser,
        })
      : null;

    if (conversion.client) {
      syncReferralConversionForClient(lead.id, conversion.client.id);
      syncPartnerReferralConversionForClient(lead.id, conversion.client.id);
    }
    syncLeadFollowUpCalendarEvent(lead.id);
    createAuditLog({
      action: "lead.converted",
      entityType: "lead",
      entityId: lead.id,
      description: `El lead ${lead.name} se vinculó con el cliente ${conversion.client?.company || "sin nombre"}.`,
      authUser: res.locals.authUser as AuthUser,
      metadata: {
        client_id: conversion.client?.id || null,
        already_converted: conversion.alreadyConverted,
        matched_by: conversion.matchedBy,
        operational_setup: operationalSetup,
      },
    });

    if (!conversion.alreadyConverted && conversion.client) {
      runAIAutomationTrigger({
        agencyId: context.agencyId,
        triggerKey: "ai_trigger_client_report",
        automation: "client_report",
        entityId: conversion.client.id,
        input: `Cliente recién convertido desde lead ${lead.name}`,
        entityType: "client",
        authUser: res.locals.authUser as AuthUser,
        description: `Se generó automáticamente un reporte IA tras convertir el lead ${lead.name} en cliente.`,
      });
    }

    res.status(conversion.alreadyConverted ? 200 : 201).json({
      ...conversion,
      operational_setup: operationalSetup,
    });
  });

  app.post("/api/leads/auto-assign", requireSectionAccess("leads"), (req, res) => {
    const context = getAgencyRequestContext(res.locals.authUser as AuthUser | undefined);

    if (!context) {
      return res.status(400).json({ error: "Agency not found" });
    }

    const candidates = getLeadAssignmentCandidatesForAgency(context.agencyId);

    if (candidates.length === 0) {
      return res.status(400).json({ error: "No users available for assignment" });
    }

    const unassignedLeadRows = db
      .prepare(
        `
          SELECT id
          FROM leads
          WHERE assigned_to IS NULL AND agency_id = ? AND archived_at IS NULL
          ORDER BY datetime(created_at) ASC, id ASC
        `,
      )
      .all(context.agencyId) as Array<{ id: number }>;

    const loadByUserId = candidates.reduce<Record<number, number>>((accumulator, candidate) => {
      accumulator[candidate.user.id] = candidate.activeLeadLoad;
      return accumulator;
    }, {});
    const assignedUserIds = new Set<number>();

    const assignLeads = db.transaction(() => {
      unassignedLeadRows.forEach((leadRow) => {
        const candidate = [...candidates].sort((left, right) => {
          if (loadByUserId[left.user.id] !== loadByUserId[right.user.id]) {
            return loadByUserId[left.user.id] - loadByUserId[right.user.id];
          }

          if (left.projectsLoad !== right.projectsLoad) {
            return left.projectsLoad - right.projectsLoad;
          }

          if (left.availabilityRank !== right.availabilityRank) {
            return left.availabilityRank - right.availabilityRank;
          }

          return left.user.id - right.user.id;
        })[0];

        db.prepare(
          `
            UPDATE leads
            SET assigned_to = ?
            WHERE id = ? AND agency_id = ? AND assigned_to IS NULL AND archived_at IS NULL
          `,
        ).run(candidate.user.id, leadRow.id, context.agencyId);

        loadByUserId[candidate.user.id] += 1;
        assignedUserIds.add(candidate.user.id);
      });
    });

    assignLeads();
    const primaryUserId = Array.from(assignedUserIds)[0] || candidates[0].user.id;

    createAuditLog({
      action: "lead.auto_assigned",
      entityType: "lead",
      entityId: primaryUserId,
      description: `Se autoasignaron ${unassignedLeadRows.length} leads entre ${assignedUserIds.size || 1} responsables comerciales.`,
      authUser: res.locals.authUser as AuthUser,
      metadata: {
        assigned_count: unassignedLeadRows.length,
        assigned_user_ids: Array.from(assignedUserIds),
      },
    });
    res.json({
      assignedCount: unassignedLeadRows.length,
      userId: primaryUserId,
      assignedUserIds: Array.from(assignedUserIds),
    });
  });

  app.post("/api/leads/:id/archive", requireSectionAccess("leads"), (req, res) => {
    const context = getAgencyRequestContext(res.locals.authUser as AuthUser | undefined);
    const leadId = Number(req.params.id);

    if (!context) {
      return res.status(400).json({ error: "Agency not found" });
    }

    if (!Number.isInteger(leadId)) {
      return res.status(400).json({ error: "Invalid lead id" });
    }

    const lead = setLeadArchivedState(leadId, context.agencyId, true);

    if (!lead) {
      return res.status(404).json({ error: "Lead not found" });
    }

    createAuditLog({
      action: "lead.archived",
      entityType: "lead",
      entityId: lead.id,
      description: `Se archivó el lead ${lead.name}.`,
      authUser: context.authUser,
      metadata: {
        company: lead.company,
      },
    });

    res.json(lead);
  });

  app.post("/api/leads/:id/restore", requireSectionAccess("leads"), (req, res) => {
    const context = getAgencyRequestContext(res.locals.authUser as AuthUser | undefined);
    const leadId = Number(req.params.id);

    if (!context) {
      return res.status(400).json({ error: "Agency not found" });
    }

    if (!Number.isInteger(leadId)) {
      return res.status(400).json({ error: "Invalid lead id" });
    }

    const lead = setLeadArchivedState(leadId, context.agencyId, false);

    if (!lead) {
      return res.status(404).json({ error: "Lead not found" });
    }

    createAuditLog({
      action: "lead.restored",
      entityType: "lead",
      entityId: lead.id,
      description: `Se restauró el lead ${lead.name}.`,
      authUser: context.authUser,
    });

    res.json(lead);
  });

  app.delete("/api/leads/:id", requireSectionAccess("leads"), (req, res) => {
    const context = getAgencyRequestContext(res.locals.authUser as AuthUser | undefined);
    const leadId = Number(req.params.id);

    if (!context) {
      return res.status(400).json({ error: "Agency not found" });
    }

    if (!Number.isInteger(leadId)) {
      return res.status(400).json({ error: "Invalid lead id" });
    }

    const result = deleteLeadPermanently(leadId, context.agencyId);

    if ("error" in result) {
      if (result.error === "not_found") {
        return res.status(404).json({ error: "Lead not found" });
      }

      if (result.error === "not_archived") {
        return res.status(400).json({ error: "Archive the lead before deleting it permanently" });
      }

      if (result.error === "lead_has_client") {
        return res.status(409).json({ error: "This lead is linked to a client and cannot be deleted" });
      }
    }

    createAuditLog({
      action: "lead.deleted",
      entityType: "lead",
      entityId: result.lead.id,
      description: `Se eliminó permanentemente el lead ${result.lead.name}.`,
      authUser: context.authUser,
    });

    res.json({ deleted: true, id: result.lead.id });
  });

  app.get("/api/team", requireSectionAccess("team"), (req, res) => {
    const context = getAgencyRequestContext(res.locals.authUser as AuthUser | undefined);

    if (!context) {
      return res.status(400).json({ error: "Agency not found" });
    }

    const users = db
      .prepare(
        `
          SELECT id, email, name, role, status, access_status, activation_token, invited_at, activated_at
          FROM users
          WHERE agency_id = ?
          ORDER BY id ASC
        `,
      )
      .all(context.agencyId) as Array<{
      id: number;
      email: string;
      name: string;
      role: string;
      status: "online" | "meeting" | "offline";
      access_status: UserAccessStatus | null;
      activation_token: string | null;
      invited_at: string | null;
      activated_at: string | null;
    }>;

    const projectCounts = db
      .prepare(
        `
          SELECT assigned_to, COUNT(DISTINCT project_id) as projects
          FROM tasks
          WHERE assigned_to IS NOT NULL AND agency_id = ?
          GROUP BY assigned_to
        `,
      )
      .all(context.agencyId) as Array<{ assigned_to: number; projects: number }>;

    const projectsByUserId = projectCounts.reduce<Record<number, number>>((accumulator, item) => {
      accumulator[item.assigned_to] = item.projects;
      return accumulator;
    }, {});

    res.json(
      users
        .map((user) => buildTeamMemberResponse(user.id, projectsByUserId[user.id] || 0, context.agencyId))
        .filter(Boolean),
    );
  });

  app.post("/api/team", requireSectionAccess("team"), (req, res) => {
    const context = getAgencyRequestContext(res.locals.authUser as AuthUser | undefined);
    const { name, email, role, status } = req.body ?? {};
    const allowedStatuses = new Set(["online", "meeting", "offline"]);

    if (!context) {
      return res.status(400).json({ error: "Agency not found" });
    }

    if (typeof name !== "string" || !name.trim()) {
      return res.status(400).json({ error: "Name is required" });
    }

    if (typeof email !== "string" || !email.trim()) {
      return res.status(400).json({ error: "Email is required" });
    }

    if (typeof role !== "string" || !role.trim()) {
      return res.status(400).json({ error: "Role is required" });
    }

    if (!shouldUseTeamOnboardingForUser({ role, client_id: null, freelancer_id: null })) {
      return res.status(400).json({
        error: "Client and freelancer access must be managed from their portal modules",
      });
    }

    if (status && !allowedStatuses.has(status)) {
      return res.status(400).json({ error: "Invalid team status" });
    }

    try {
      const activationToken = createInviteToken();
      const invitedAt = new Date().toISOString();
      const result = db
        .prepare(
          `
            INSERT INTO users (
              email,
              password,
              name,
              role,
              agency_id,
              status,
              access_status,
              activation_token,
              invited_at
            )
            VALUES (?, ?, ?, ?, ?, ?, 'invited', ?, ?)
          `,
        )
        .run(
          email.trim(),
          hashPassword(randomBytes(18).toString("hex")),
          name.trim(),
          role.trim(),
          context.agencyId,
          status || "offline",
          activationToken,
          invitedAt,
        );

      ensureTeamOnboardingForUser(Number(result.lastInsertRowid), context.agencyId);

      const member = buildTeamMemberResponse(Number(result.lastInsertRowid), 0, context.agencyId);

      if (!member) {
        return res.status(500).json({ error: "Team member could not be loaded" });
      }

      createAuditLog({
        action: "team.invited",
        entityType: "user",
        entityId: member.id,
        description: `Se invitó a ${member.name} al equipo con rol ${member.role}.`,
        authUser: res.locals.authUser as AuthUser,
        metadata: {
          role: member.role,
          access_status: member.access_status,
        },
      });
      res.status(201).json(member);
    } catch (error) {
      return res.status(400).json({ error: "Email already exists" });
    }
  });

  app.post("/api/team/:id/resend-invite", requireSectionAccess("team"), (req, res) => {
    const context = getAgencyRequestContext(res.locals.authUser as AuthUser | undefined);
    const userId = Number(req.params.id);
    const user = Number.isInteger(userId) ? getUserRecordByIdFull(userId) : undefined;

    if (!context) {
      return res.status(400).json({ error: "Agency not found" });
    }

    if (!user || user.agency_id !== context.agencyId) {
      return res.status(404).json({ error: "User not found" });
    }

    if (!shouldUseTeamOnboardingForUser(user)) {
      return res.status(400).json({
        error: "Client and freelancer access must be managed from their portal modules",
      });
    }

    if ((user.access_status || "active") !== "invited") {
      return res.status(400).json({ error: "User is already active" });
    }

    db.prepare(
      `
        UPDATE users
        SET activation_token = ?, invited_at = ?
        WHERE id = ?
      `,
    ).run(createInviteToken(), new Date().toISOString(), user.id);

    ensureTeamOnboardingForUser(user.id, user.agency_id || null);

    const member = buildTeamMemberResponse(user.id, undefined, context.agencyId);

    if (!member) {
      return res.status(500).json({ error: "Team member could not be loaded" });
    }

    createAuditLog({
      action: "team.invite_resent",
      entityType: "user",
      entityId: member.id,
      description: `Se regeneró la invitación de ${member.name}.`,
      authUser: res.locals.authUser as AuthUser,
      metadata: {
        role: member.role,
      },
    });
    res.json(member);
  });

  app.patch("/api/team/:id/status", requireSectionAccess("team"), (req, res) => {
    const context = getAgencyRequestContext(res.locals.authUser as AuthUser | undefined);
    const userId = Number(req.params.id);
    const { status } = req.body ?? {};
    const allowedStatuses = new Set(["online", "meeting", "offline"]);

    if (!context) {
      return res.status(400).json({ error: "Agency not found" });
    }

    if (!Number.isInteger(userId) || !allowedStatuses.has(status)) {
      return res.status(400).json({ error: "Invalid user id or status" });
    }

    const user = getUserRecordByIdFull(userId);

    if (!user || user.agency_id !== context.agencyId) {
      return res.status(404).json({ error: "User not found" });
    }

    if (!shouldUseTeamOnboardingForUser(user)) {
      return res.status(400).json({
        error: "Client and freelancer access must be managed from their portal modules",
      });
    }

    const result = db
      .prepare("UPDATE users SET status = ? WHERE id = ? AND agency_id = ?")
      .run(status, userId, context.agencyId);

    if (result.changes === 0) {
      return res.status(404).json({ error: "User not found" });
    }

    const member = buildTeamMemberResponse(userId, undefined, context.agencyId);

    if (!member) {
      return res.status(500).json({ error: "Team member could not be loaded" });
    }

    createAuditLog({
      action: "team.status_updated",
      entityType: "user",
      entityId: member.id,
      description: `Se actualizó la disponibilidad de ${member.name} a ${status}.`,
      authUser: res.locals.authUser as AuthUser,
      metadata: {
        status,
      },
    });
    res.json(member);
  });

  app.patch(
    "/api/team-onboarding-steps/:id/status",
    requireSectionAccess("team"),
    (req, res) => {
      const context = getAgencyRequestContext(res.locals.authUser as AuthUser | undefined);
      const stepId = Number(req.params.id);
      const step = Number.isInteger(stepId) ? getTeamOnboardingStepById(stepId) : undefined;
      const onboarding = step ? getTeamOnboardingById(step.onboarding_id) : undefined;
      const { status } = req.body ?? {};
      const allowedStatuses = new Set<TeamOnboardingStepStatus>([
        "pending",
        "in_progress",
        "completed",
      ]);

      if (!context) {
        return res.status(400).json({ error: "Agency not found" });
      }

      if (!step || !onboarding || !isAgencyOwnedRecord(onboarding, context.agencyId)) {
        return res.status(404).json({ error: "Onboarding step not found" });
      }

      if (!allowedStatuses.has(status)) {
        return res.status(400).json({ error: "Invalid onboarding step status" });
      }

      const transitionError = getTeamOnboardingStepTransitionError(
        step.onboarding_id,
        step.id,
        status,
      );

      if (transitionError) {
        return res.status(409).json({ error: transitionError });
      }

      applyTeamOnboardingStepStatus(step.onboarding_id, step.id, status);

      const updatedOnboarding = syncTeamOnboardingAggregate(step.onboarding_id);

      if (!updatedOnboarding) {
        return res.status(404).json({ error: "Onboarding not found" });
      }

      const member = buildTeamMemberResponse(updatedOnboarding.user_id, undefined, context.agencyId);

      if (!member) {
        return res.status(500).json({ error: "Team member could not be loaded" });
      }

      createAuditLog({
        action: "team.onboarding_step_updated",
        entityType: "team_onboarding_step",
        entityId: step.id,
        description: `Se actualizó el paso "${step.title}" del onboarding de ${member.name} a ${status}.`,
        authUser: res.locals.authUser as AuthUser,
        metadata: {
          user_id: member.id,
          onboarding_id: step.onboarding_id,
          status,
        },
      });
      res.json(member);
    },
  );

  app.get("/api/clients", requireSectionAccess("clients"), (req, res) => {
    const context = getAgencyRequestContext(res.locals.authUser as AuthUser | undefined);

    if (!context) {
      return res.status(400).json({ error: "Agency not found" });
    }

    const archiveScope = getArchiveScopeFromQuery(req.query as Record<string, unknown>);
    const clients = db
      .prepare(
        `SELECT * FROM clients WHERE agency_id = ? AND ${getArchiveSqlCondition(archiveScope)} ORDER BY created_at DESC`,
      )
      .all(context.agencyId);
    res.json(clients);
  });

  app.get("/api/clients/overview", requireSectionAccess("clients"), (req, res) => {
    const context = getAgencyRequestContext(res.locals.authUser as AuthUser | undefined);

    if (!context) {
      return res.status(400).json({ error: "Agency not found" });
    }

    const archiveScope = getArchiveScopeFromQuery(req.query as Record<string, unknown>);
    const clientRows = db
      .prepare(
        `SELECT id FROM clients WHERE agency_id = ? AND ${getArchiveSqlCondition(archiveScope)} ORDER BY datetime(created_at) DESC, id DESC`,
      )
      .all(context.agencyId) as Array<{ id: number }>;

    res.json(
      clientRows
        .map((clientRow) =>
          getClientManagementOverview(clientRow.id, context.agencyId, archiveScope !== "active", req),
        )
        .filter(Boolean),
    );
  });

  app.post("/api/clients/:id/portal-access/invite", requireSectionAccess("clients"), async (req, res) => {
    const context = getAgencyRequestContext(res.locals.authUser as AuthUser | undefined);
    const clientId = Number(req.params.id);
    const client = Number.isInteger(clientId) ? getClientRecordById(clientId) : undefined;
    const lead = client?.lead_id ? getLeadRecordById(client.lead_id) : null;
    const contactName =
      typeof req.body?.name === "string" && req.body.name.trim()
        ? req.body.name.trim()
        : lead?.name?.trim() || client?.company?.trim() || "";
    const contactEmail =
      typeof req.body?.email === "string" && req.body.email.trim()
        ? req.body.email.trim()
        : lead?.email?.trim() || "";

    if (!context) {
      return res.status(400).json({ error: "Agency not found" });
    }

    if (!client || !isAgencyOwnedRecord(client, context.agencyId) || isArchivedRecord(client)) {
      return res.status(404).json({ error: "Client not found" });
    }

    const result = ensurePortalUserAccess({
      agencyId: context.agencyId,
      entityType: "client",
      entityId: client.id,
      name: contactName,
      email: contactEmail,
    });

    if ("error" in result) {
      return res.status(result.error.includes("required") ? 400 : 409).json({ error: result.error });
    }

    if (!result.user) {
      return res.status(500).json({ error: "Client portal user could not be prepared" });
    }

    let delivery: AccountInviteDeliveryResult = {
      delivered: false,
      skipped: true,
      channel: "manual",
      reason: result.already_active ? "already_active" : "missing_invite_url",
    };

    if (result.invite_required && result.user.activation_token) {
      const inviteUrl = buildActivationUrl(result.user.activation_token, req);
      delivery = inviteUrl
        ? await sendActivationEmail({
            to: result.user.email,
            name: result.user.name,
            agencyName: getAppSettings(context.agencyId).agency_name,
            inviteUrl,
            roleLabel: "cliente",
          })
        : {
            delivered: false,
            skipped: true,
            channel: "manual",
            reason: "missing_invite_url",
          };
    }

    createAuditLog({
      action: result.invite_required ? "client.portal_invited" : "client.portal_linked",
      entityType: "client",
      entityId: client.id,
      description: result.invite_required
        ? `Se preparo acceso portal para el cliente ${client.company}.`
        : `Se vinculo acceso portal ya activo para el cliente ${client.company}.`,
      authUser: context.authUser,
      agencyId: context.agencyId,
      metadata: {
        client_id: client.id,
        user_id: result.user.id,
        email: result.user.email,
        delivery: delivery.delivered ? "sent" : delivery.reason,
        created: result.created,
        linked_existing: result.linked_existing,
      },
    });

    res.status(result.created ? 201 : 200).json({
      access: serializePortalAccessUser(result.user, req),
      delivery,
      created: result.created,
      linked_existing: result.linked_existing,
      already_active: result.already_active,
    });
  });

  app.post("/api/clients/:id/portal-access/resend", requireSectionAccess("clients"), async (req, res) => {
    const context = getAgencyRequestContext(res.locals.authUser as AuthUser | undefined);
    const clientId = Number(req.params.id);
    const client = Number.isInteger(clientId) ? getClientRecordById(clientId) : undefined;

    if (!context) {
      return res.status(400).json({ error: "Agency not found" });
    }

    if (!client || !isAgencyOwnedRecord(client, context.agencyId) || isArchivedRecord(client)) {
      return res.status(404).json({ error: "Client not found" });
    }

    const linkedUser = getLinkedClientUserRecord(context.agencyId, client.id);

    if (!linkedUser) {
      return res.status(404).json({ error: "Client portal access has not been configured yet" });
    }

    if ((linkedUser.access_status || "active") !== "invited") {
      return res.status(400).json({ error: "Client portal access is already active" });
    }

    const refreshedUser = resetPortalInviteForUser(linkedUser.id);

    if (!refreshedUser || !refreshedUser.activation_token) {
      return res.status(500).json({ error: "Client portal invite could not be regenerated" });
    }

    const inviteUrl = buildActivationUrl(refreshedUser.activation_token, req);
    const delivery = inviteUrl
      ? await sendActivationEmail({
          to: refreshedUser.email,
          name: refreshedUser.name,
          agencyName: getAppSettings(context.agencyId).agency_name,
          inviteUrl,
          roleLabel: "cliente",
        })
      : {
          delivered: false,
          skipped: true,
          channel: "manual",
          reason: "missing_invite_url",
        };

    createAuditLog({
      action: "client.portal_invite_resent",
      entityType: "client",
      entityId: client.id,
      description: `Se reenvio el acceso portal para el cliente ${client.company}.`,
      authUser: context.authUser,
      agencyId: context.agencyId,
      metadata: {
        client_id: client.id,
        user_id: refreshedUser.id,
        email: refreshedUser.email,
        delivery: delivery.delivered ? "sent" : delivery.reason,
      },
    });

    res.json({
      access: serializePortalAccessUser(refreshedUser, req),
      delivery,
      resent: true,
    });
  });

  app.get("/api/client-onboarding-documents/:id", requireSectionAccess("clients"), (req, res) => {
    const context = getAgencyRequestContext(res.locals.authUser as AuthUser | undefined);
    const documentId = Number(req.params.id);
    const document =
      Number.isInteger(documentId) && documentId > 0
        ? getClientOnboardingDocumentById(documentId)
        : undefined;
    const onboarding = document ? getClientOnboardingById(document.onboarding_id) : undefined;
    const client = document ? getClientRecordById(document.client_id) : null;

    if (!context) {
      return res.status(400).json({ error: "Agency not found" });
    }

    if (
      !document ||
      !onboarding ||
      !client ||
      onboarding.agency_id !== context.agencyId ||
      client.agency_id !== context.agencyId ||
      isArchivedRecord(client)
    ) {
      return res.status(404).json({ error: "Onboarding document not found" });
    }

    res.json(serializeClientOnboardingDocumentRow(document));
  });

  app.post("/api/clients", requireSectionAccess("clients"), (req, res) => {
    const context = getAgencyRequestContext(res.locals.authUser as AuthUser | undefined);
    const { company, industry, budget, status, lead_id } = req.body ?? {};
    const allowedStatuses = new Set(["active", "inactive"]);
    const parsedBudget = Number(budget ?? 0);
    const parsedLeadId = Number(lead_id);
    const linkedLead =
      Number.isInteger(parsedLeadId) && parsedLeadId > 0 ? getLeadRecordById(parsedLeadId) : undefined;

    if (!context) {
      return res.status(400).json({ error: "Agency not found" });
    }

    if (typeof company !== "string" || !company.trim()) {
      return res.status(400).json({ error: "Company is required" });
    }

    if (status && !allowedStatuses.has(status)) {
      return res.status(400).json({ error: "Invalid client status" });
    }

    if (Number.isNaN(parsedBudget) || parsedBudget < 0) {
      return res.status(400).json({ error: "Budget must be a valid positive number" });
    }

    if (Number.isInteger(parsedLeadId) && parsedLeadId > 0 && !linkedLead) {
      return res.status(404).json({ error: "Lead not found" });
    }

    if (linkedLead && !isAgencyOwnedRecord(linkedLead, context.agencyId)) {
      return res.status(404).json({ error: "Lead not found" });
    }

    if (linkedLead && isArchivedRecord(linkedLead)) {
      return res.status(400).json({ error: "Archived leads cannot be linked to new clients" });
    }

    const result = db
      .prepare(
        `
          INSERT INTO clients (lead_id, company, industry, budget, status, agency_id)
          VALUES (?, ?, ?, ?, ?, ?)
        `,
      )
      .run(
        Number.isInteger(parsedLeadId) && parsedLeadId > 0 ? parsedLeadId : null,
        company.trim(),
        typeof industry === "string" ? industry.trim() : null,
        parsedBudget,
        status || "active",
        context.agencyId,
      );

    const client = db.prepare("SELECT * FROM clients WHERE id = ?").get(result.lastInsertRowid);
    createAuditLog({
      action: "client.created",
      entityType: "client",
      entityId: Number(result.lastInsertRowid),
      description: `Se creó el cliente ${company.trim()}.`,
      authUser: res.locals.authUser as AuthUser,
      metadata: {
        industry: typeof industry === "string" ? industry.trim() : null,
        budget: parsedBudget,
        lead_id: Number.isInteger(parsedLeadId) && parsedLeadId > 0 ? parsedLeadId : null,
      },
    });
    res.status(201).json(client);
  });

  app.patch("/api/clients/:id/status", requireSectionAccess("clients"), (req, res) => {
    const context = getAgencyRequestContext(res.locals.authUser as AuthUser | undefined);
    const clientId = Number(req.params.id);
    const { status } = req.body ?? {};
    const allowedStatuses = new Set(["active", "inactive"]);

    if (!context) {
      return res.status(400).json({ error: "Agency not found" });
    }

    if (!Number.isInteger(clientId) || !allowedStatuses.has(status)) {
      return res.status(400).json({ error: "Invalid client id or status" });
    }

    const result = db
      .prepare("UPDATE clients SET status = ? WHERE id = ? AND agency_id = ? AND archived_at IS NULL")
      .run(status, clientId, context.agencyId);

    if (result.changes === 0) {
      return res.status(404).json({ error: "Client not found" });
    }

    const client = db.prepare("SELECT * FROM clients WHERE id = ?").get(clientId);
    createAuditLog({
      action: "client.status_updated",
      entityType: "client",
      entityId: clientId,
      description: `Se actualizó el estado del cliente #${clientId} a ${status}.`,
      authUser: res.locals.authUser as AuthUser,
      metadata: {
        status,
      },
    });
    res.json(client);
  });

  app.get("/api/client-onboardings", requireSectionAccess("clients"), (_req, res) => {
    const context = getAgencyRequestContext(res.locals.authUser as AuthUser | undefined);

    if (!context) {
      return res.status(400).json({ error: "Agency not found" });
    }

    const onboardings = db
      .prepare("SELECT id FROM client_onboardings WHERE agency_id = ? ORDER BY created_at DESC")
      .all(context.agencyId) as Array<{ id: number }>;

    res.json(
      onboardings
        .map((onboarding) => {
          const onboardingRecord = getClientOnboardingById(onboarding.id);
          if (onboardingRecord) {
            syncClientOnboardingFlowSteps(onboardingRecord.client_id);
          }
          return serializeClientOnboarding(onboarding.id);
        })
        .filter(Boolean),
    );
  });

  app.post("/api/clients/:id/onboarding/start", requireSectionAccess("clients"), (req, res) => {
    const context = getAgencyRequestContext(res.locals.authUser as AuthUser | undefined);
    const clientId = Number(req.params.id);
    const client = getClientRecordById(clientId);
    const providedTargetDate = req.body?.target_launch_date;

    if (!context) {
      return res.status(400).json({ error: "Agency not found" });
    }

    if (
      !Number.isInteger(clientId) ||
      !client ||
      !isAgencyOwnedRecord(client, context.agencyId) ||
      isArchivedRecord(client)
    ) {
      return res.status(404).json({ error: "Client not found" });
    }

    if (
      providedTargetDate &&
      (typeof providedTargetDate !== "string" ||
        Number.isNaN(new Date(providedTargetDate).getTime()))
    ) {
      return res.status(400).json({ error: "Invalid target launch date" });
    }

    const existingOnboarding = getClientOnboardingByClientId(client.id);
    const setup = ensureClientOperationalSetup({
      clientId: client.id,
      targetLaunchDate:
        typeof providedTargetDate === "string" ? providedTargetDate : undefined,
      fallbackOwnerUserId: context.authUser.id,
      triggerInput: `Setup manual desde ficha de cliente ${client.company}`,
      authUser: context.authUser,
    });
    const onboardingId = setup?.onboarding_id || existingOnboarding?.id || null;
    const onboarding = onboardingId ? serializeClientOnboarding(onboardingId) : null;

    if (!onboardingId || !onboarding) {
      return res.status(500).json({ error: "Client onboarding could not be initialized" });
    }

    if (setup?.created_onboarding) {
      createAuditLog({
        action: "client.onboarding_started",
        entityType: "client_onboarding",
        entityId: onboardingId,
        description: `Se inició el onboarding del cliente ${client.company}.`,
        authUser: res.locals.authUser as AuthUser,
        metadata: {
          client_id: client.id,
          project_id: onboarding.project_id || null,
          operational_setup: setup,
        },
      });
    }

    res.status(existingOnboarding ? 200 : 201).json(onboarding);
  });

  app.patch("/api/client-onboardings/:id", requireSectionAccess("clients"), (req, res) => {
    const context = getAgencyRequestContext(res.locals.authUser as AuthUser | undefined);
    const onboardingId = Number(req.params.id);
    const onboarding = getClientOnboardingById(onboardingId);
    const { status, kickoff_date, target_launch_date } = req.body ?? {};
    const allowedStatuses = new Set<ClientOnboardingStatus>([
      "pending",
      "in_progress",
      "blocked",
      "completed",
    ]);

    if (!context) {
      return res.status(400).json({ error: "Agency not found" });
    }

    const onboardingClient = onboarding ? getClientRecordById(onboarding.client_id) : null;

    if (
      !Number.isInteger(onboardingId) ||
      !onboarding ||
      !isAgencyOwnedRecord(onboarding, context.agencyId) ||
      !onboardingClient ||
      isArchivedRecord(onboardingClient)
    ) {
      return res.status(404).json({ error: "Onboarding not found" });
    }

    if (status && !allowedStatuses.has(status)) {
      return res.status(400).json({ error: "Invalid onboarding status" });
    }

    if (
      kickoff_date &&
      (typeof kickoff_date !== "string" || Number.isNaN(new Date(kickoff_date).getTime()))
    ) {
      return res.status(400).json({ error: "Invalid kickoff date" });
    }

    if (
      target_launch_date &&
      (typeof target_launch_date !== "string" ||
        Number.isNaN(new Date(target_launch_date).getTime()))
    ) {
      return res.status(400).json({ error: "Invalid target launch date" });
    }

    if (status === "completed") {
      const steps = getClientOnboardingSteps(onboarding.id);

      steps.forEach((step) => {
        db.prepare("UPDATE client_onboarding_steps SET status = 'completed' WHERE id = ?").run(
          step.id,
        );
        updateClientOnboardingTaskStatus(step.task_id, "completed");
      });
    }

    db.prepare(
      `
        UPDATE client_onboardings
        SET
          status = COALESCE(?, status),
          kickoff_date = COALESCE(?, kickoff_date),
          target_launch_date = COALESCE(?, target_launch_date),
          completed_at = CASE
            WHEN ? = 'completed' THEN ?
            WHEN ? IS NOT NULL AND ? != 'completed' THEN NULL
            ELSE completed_at
          END
        WHERE id = ?
      `,
    ).run(
      status || null,
      kickoff_date || null,
      target_launch_date || null,
      status || null,
      status === "completed" ? new Date().toISOString() : null,
      status || null,
      status || null,
      onboarding.id,
    );

    if (onboarding.project_id && status) {
      db.prepare("UPDATE projects SET status = ? WHERE id = ?").run(
        status === "completed" ? "completed" : "setup",
        onboarding.project_id,
      );
    }

    const updatedOnboarding =
      status === "blocked" ? serializeClientOnboarding(onboarding.id) : syncClientOnboardingAggregate(onboarding.id);
    syncClientOnboardingCalendarEvent(onboarding.id);

    createAuditLog({
      action: "client.onboarding_updated",
      entityType: "client_onboarding",
      entityId: onboarding.id,
      description: `Se actualizó el onboarding del cliente #${onboarding.client_id}.`,
      authUser: res.locals.authUser as AuthUser,
      metadata: {
        status: updatedOnboarding?.status || status || onboarding.status,
        kickoff_date: kickoff_date || onboarding.kickoff_date,
        target_launch_date: target_launch_date || onboarding.target_launch_date,
      },
    });

    res.json(updatedOnboarding);
  });

  app.patch(
    "/api/client-onboarding-steps/:id/status",
    requireSectionAccess("clients"),
    (req, res) => {
      const context = getAgencyRequestContext(res.locals.authUser as AuthUser | undefined);
      const stepId = Number(req.params.id);
      const step = getClientOnboardingStepById(stepId);
      const onboarding = step ? getClientOnboardingById(step.onboarding_id) : undefined;
      const { status } = req.body ?? {};
      const allowedStatuses = new Set<ClientOnboardingStepStatus>([
        "pending",
        "in_progress",
        "completed",
      ]);

      if (!context) {
        return res.status(400).json({ error: "Agency not found" });
      }

      const onboardingClient = onboarding ? getClientRecordById(onboarding.client_id) : null;

      if (
        !Number.isInteger(stepId) ||
        !step ||
        !onboarding ||
        !isAgencyOwnedRecord(onboarding, context.agencyId) ||
        !onboardingClient ||
        isArchivedRecord(onboardingClient)
      ) {
        return res.status(404).json({ error: "Onboarding step not found" });
      }

      if (!allowedStatuses.has(status)) {
        return res.status(400).json({ error: "Invalid onboarding step status" });
      }

      syncClientOnboardingFlowSteps(onboarding.client_id);

      const transitionError = getClientOnboardingStepTransitionError(
        step.onboarding_id,
        step.id,
        status,
      );

      if (transitionError) {
        return res.status(409).json({ error: transitionError });
      }

      applyClientOnboardingStepStatus(step.onboarding_id, step.id, status);

      const updatedOnboarding = syncClientOnboardingAggregate(step.onboarding_id);
      syncClientOnboardingCalendarEvent(step.onboarding_id);
      createAuditLog({
        action: "client.onboarding_step_updated",
        entityType: "client_onboarding_step",
        entityId: step.id,
        description: `Se actualizó el paso "${step.title}" del onboarding de cliente a ${status}.`,
        authUser: res.locals.authUser as AuthUser,
        metadata: {
          onboarding_id: step.onboarding_id,
          task_id: step.task_id,
          status,
        },
      });
      res.json(updatedOnboarding);
    },
  );

  app.get("/api/client-portal/onboarding", requireSectionAccess("onboarding"), (req, res) => {
    const context = getAgencyRequestContext(res.locals.authUser as AuthUser | undefined);
    const scopedClient = getScopedClientRecordForContext(context);

    if (!context) {
      return res.status(400).json({ error: "Agency not found" });
    }

    if (!scopedClient) {
      return res.status(403).json({ error: "Client portal access is only available for linked client users" });
    }

    const portal = getClientPortalOnboardingPayload(scopedClient.id, context.agencyId);

    if (!portal) {
      return res.status(404).json({ error: "Client onboarding portal not found" });
    }

    res.json(portal);
  });

  app.put("/api/client-portal/onboarding/form", requireSectionAccess("onboarding"), (req, res) => {
    const context = getAgencyRequestContext(res.locals.authUser as AuthUser | undefined);
    const scopedClient = getScopedClientRecordForContext(context);
    const onboardingRecord = scopedClient ? getClientOnboardingByClientId(scopedClient.id) : null;
    const existingForm = scopedClient ? getClientOnboardingFormByClientId(scopedClient.id) : null;
    const action =
      typeof req.body?.action === "string" && req.body.action.trim().toLowerCase() === "submit"
        ? "submit"
        : "save";
    const advertisingAccesses =
      typeof req.body?.advertising_accesses === "string"
        ? req.body.advertising_accesses.trim() || null
        : existingForm?.advertising_accesses || null;
    const businessGoals =
      typeof req.body?.business_goals === "string"
        ? req.body.business_goals.trim() || null
        : existingForm?.business_goals || null;
    const targetAudience =
      typeof req.body?.target_audience === "string"
        ? req.body.target_audience.trim() || null
        : existingForm?.target_audience || null;
    const competition =
      typeof req.body?.competition === "string"
        ? req.body.competition.trim() || null
        : existingForm?.competition || null;
    const adBudget =
      req.body?.ad_budget === undefined
        ? Number(existingForm?.ad_budget || 0)
        : Number(req.body.ad_budget);

    if (!context) {
      return res.status(400).json({ error: "Agency not found" });
    }

    if (!scopedClient || !onboardingRecord) {
      return res.status(400).json({ error: "Client onboarding is not available yet" });
    }

    if (!Number.isFinite(adBudget) || adBudget < 0) {
      return res.status(400).json({ error: "Advertising budget is invalid" });
    }

    if (
      action === "submit" &&
      (
        [advertisingAccesses, businessGoals, targetAudience, competition].some(
          (value) => !value || !value.trim(),
        ) ||
        adBudget <= 0
      )
    ) {
      return res.status(400).json({
        error: "Complete accesses, goals, audience, competition and advertising budget before submitting the onboarding form",
      });
    }

    const nextStatus =
      action === "submit" || existingForm?.status === "submitted" ? "submitted" : "draft";
    const submittedAt =
      action === "submit"
        ? new Date().toISOString()
        : existingForm?.submitted_at || null;
    const submittedByUserId =
      action === "submit"
        ? context.authUser.id
        : existingForm?.submitted_by_user_id || null;
    const submittedByName =
      action === "submit"
        ? context.authUser.name
        : existingForm?.submitted_by_name || null;

    if (existingForm) {
      db.prepare(
        `
          UPDATE client_onboarding_forms
          SET
            advertising_accesses = ?,
            business_goals = ?,
            target_audience = ?,
            competition = ?,
            ad_budget = ?,
            status = ?,
            submitted_at = ?,
            submitted_by_user_id = ?,
            submitted_by_name = ?,
            updated_at = CURRENT_TIMESTAMP
          WHERE id = ?
        `,
      ).run(
        advertisingAccesses,
        businessGoals,
        targetAudience,
        competition,
        Math.round(adBudget * 100) / 100,
        nextStatus,
        submittedAt,
        submittedByUserId,
        submittedByName,
        existingForm.id,
      );
    } else {
      db.prepare(
        `
          INSERT INTO client_onboarding_forms (
            client_id,
            onboarding_id,
            advertising_accesses,
            business_goals,
            target_audience,
            competition,
            ad_budget,
            status,
            submitted_at,
            submitted_by_user_id,
            submitted_by_name,
            agency_id,
            updated_at
          )
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)
        `,
      ).run(
        scopedClient.id,
        onboardingRecord.id,
        advertisingAccesses,
        businessGoals,
        targetAudience,
        competition,
        Math.round(adBudget * 100) / 100,
        nextStatus,
        submittedAt,
        submittedByUserId,
        submittedByName,
        context.agencyId,
      );
    }

    syncClientOnboardingFlowSteps(scopedClient.id);

    createAuditLog({
      action:
        action === "submit"
          ? "client.portal_onboarding_form_submitted"
          : "client.portal_onboarding_form_saved",
      entityType: "client_onboarding_form",
      entityId: onboardingRecord.id,
      description:
        action === "submit"
          ? `El cliente ${scopedClient.company} envió su formulario de onboarding.`
          : `El cliente ${scopedClient.company} guardó un borrador de onboarding.`,
      authUser: context.authUser,
      agencyId: context.agencyId,
      metadata: {
        client_id: scopedClient.id,
        onboarding_id: onboardingRecord.id,
        status: nextStatus,
        ad_budget: Math.round(adBudget * 100) / 100,
      },
    });

    const portal = getClientPortalOnboardingPayload(scopedClient.id, context.agencyId);

    if (!portal) {
      return res.status(404).json({ error: "Client onboarding portal not found" });
    }

    res.json(portal);
  });

  app.post(
    "/api/client-portal/onboarding/documents",
    requireSectionAccess("onboarding"),
    (req, res) => {
      const context = getAgencyRequestContext(res.locals.authUser as AuthUser | undefined);
      const scopedClient = getScopedClientRecordForContext(context);
      const onboardingRecord = scopedClient ? getClientOnboardingByClientId(scopedClient.id) : null;
      const parsedStepId = Number(req.body?.step_id);
      const step =
        Number.isInteger(parsedStepId) && parsedStepId > 0
          ? getClientOnboardingStepById(parsedStepId)
          : null;
      const maxUploadBytes = 5 * 1024 * 1024;
      const title =
        typeof req.body?.title === "string" && req.body.title.trim()
          ? req.body.title.trim()
          : typeof req.body?.file_name === "string" && req.body.file_name.trim()
            ? req.body.file_name.trim()
            : "";
      const fileName =
        typeof req.body?.file_name === "string" && req.body.file_name.trim()
          ? req.body.file_name.trim()
          : "";
      const fileType =
        typeof req.body?.file_type === "string" && req.body.file_type.trim()
          ? req.body.file_type.trim()
          : null;
      const notes =
        typeof req.body?.notes === "string" && req.body.notes.trim()
          ? req.body.notes.trim()
          : null;
      const fileSize = Number(req.body?.file_size);
      const fileDataUrl =
        typeof req.body?.file_data_url === "string" ? req.body.file_data_url.trim() : "";

      if (!context) {
        return res.status(400).json({ error: "Agency not found" });
      }

      if (!scopedClient || !onboardingRecord) {
        return res.status(400).json({ error: "Client onboarding is not available yet" });
      }

      if (step && step.onboarding_id !== onboardingRecord.id) {
        return res.status(404).json({ error: "Onboarding step not found" });
      }

      if (!title) {
        return res.status(400).json({ error: "Document title is required" });
      }

      if (!fileName) {
        return res.status(400).json({ error: "File name is required" });
      }

      if (!Number.isFinite(fileSize) || fileSize <= 0 || fileSize > maxUploadBytes) {
        return res.status(400).json({ error: "Document exceeds the allowed size" });
      }

      if (!fileDataUrl.startsWith("data:") || fileDataUrl.length > maxUploadBytes * 3) {
        return res.status(400).json({ error: "Invalid document payload" });
      }

      const result = db
        .prepare(
          `
            INSERT INTO client_onboarding_documents (
              client_id,
              onboarding_id,
              step_id,
              title,
              notes,
              file_name,
              file_type,
              file_size,
              file_data_url,
              uploaded_by_user_id,
              uploaded_by_name,
              agency_id
            )
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
          `,
        )
        .run(
          scopedClient.id,
          onboardingRecord.id,
          step?.id || null,
          title,
          notes,
          fileName,
          fileType,
          Math.round(fileSize),
          fileDataUrl,
          context.authUser.id,
          context.authUser.name,
          context.agencyId,
        );

      const document = db
        .prepare("SELECT * FROM client_onboarding_documents WHERE id = ?")
        .get(Number(result.lastInsertRowid)) as ClientOnboardingDocumentRow | undefined;

      createAuditLog({
        action: "client.portal_onboarding_document_uploaded",
        entityType: "client_onboarding_document",
        entityId: Number(result.lastInsertRowid),
        description: `El cliente ${scopedClient.company} subió la documentación "${title}".`,
        authUser: context.authUser,
        agencyId: context.agencyId,
        metadata: {
          client_id: scopedClient.id,
          onboarding_id: onboardingRecord.id,
          step_id: step?.id || null,
          file_name: fileName,
          file_size: Math.round(fileSize),
        },
      });

      res.status(201).json(document ? serializeClientOnboardingDocumentRow(document) : null);
    },
  );

  app.patch(
    "/api/client-portal/onboarding/steps/:id/status",
    requireSectionAccess("onboarding"),
    (req, res) => {
      const context = getAgencyRequestContext(res.locals.authUser as AuthUser | undefined);
      const scopedClient = getScopedClientRecordForContext(context);
      const stepId = Number(req.params.id);
      const step = getClientOnboardingStepById(stepId);
      const onboarding = step ? getClientOnboardingById(step.onboarding_id) : undefined;
      const { status } = req.body ?? {};
      const allowedStatuses = new Set<ClientOnboardingStepStatus>([
        "pending",
        "in_progress",
        "completed",
      ]);

      if (!context) {
        return res.status(400).json({ error: "Agency not found" });
      }

      if (!scopedClient) {
        return res.status(403).json({ error: "Client portal access is only available for linked client users" });
      }

      if (
        !Number.isInteger(stepId) ||
        !step ||
        !onboarding ||
        onboarding.client_id !== scopedClient.id ||
        !isAgencyOwnedRecord(onboarding, context.agencyId)
      ) {
        return res.status(404).json({ error: "Onboarding step not found" });
      }

      if (!allowedStatuses.has(status)) {
        return res.status(400).json({ error: "Invalid onboarding step status" });
      }

      return res.status(403).json({
        error:
          "Onboarding progress is updated automatically from contract signature, form submission and agency execution",
      });
    },
  );

  app.post("/api/clients/:id/archive", requireSectionAccess("clients"), (req, res) => {
    const context = getAgencyRequestContext(res.locals.authUser as AuthUser | undefined);
    const clientId = Number(req.params.id);

    if (!context) {
      return res.status(400).json({ error: "Agency not found" });
    }

    if (!Number.isInteger(clientId)) {
      return res.status(400).json({ error: "Invalid client id" });
    }

    const client = setClientArchivedState(clientId, context.agencyId, true);

    if (!client) {
      return res.status(404).json({ error: "Client not found" });
    }

    createAuditLog({
      action: "client.archived",
      entityType: "client",
      entityId: client.id,
      description: `Se archivó el cliente ${client.company}.`,
      authUser: context.authUser,
    });

    res.json(client);
  });

  app.post("/api/clients/:id/restore", requireSectionAccess("clients"), (req, res) => {
    const context = getAgencyRequestContext(res.locals.authUser as AuthUser | undefined);
    const clientId = Number(req.params.id);

    if (!context) {
      return res.status(400).json({ error: "Agency not found" });
    }

    if (!Number.isInteger(clientId)) {
      return res.status(400).json({ error: "Invalid client id" });
    }

    const client = setClientArchivedState(clientId, context.agencyId, false);

    if (!client) {
      return res.status(404).json({ error: "Client not found" });
    }

    createAuditLog({
      action: "client.restored",
      entityType: "client",
      entityId: client.id,
      description: `Se restauró el cliente ${client.company}.`,
      authUser: context.authUser,
    });

    res.json(client);
  });

  app.delete("/api/clients/:id", requireSectionAccess("clients"), (req, res) => {
    const context = getAgencyRequestContext(res.locals.authUser as AuthUser | undefined);
    const clientId = Number(req.params.id);

    if (!context) {
      return res.status(400).json({ error: "Agency not found" });
    }

    if (!Number.isInteger(clientId)) {
      return res.status(400).json({ error: "Invalid client id" });
    }

    const result = deleteClientPermanently(clientId, context.agencyId);

    if ("error" in result) {
      if (result.error === "not_found") {
        return res.status(404).json({ error: "Client not found" });
      }

      if (result.error === "not_archived") {
        return res.status(400).json({ error: "Archive the client before deleting it permanently" });
      }

      if (result.error === "client_has_documents") {
        return res.status(409).json({ error: "The client has invoices or reports and cannot be deleted" });
      }

      if (result.error === "client_has_active_projects") {
        return res.status(409).json({ error: "Archive all client projects before deleting it permanently" });
      }
    }

    createAuditLog({
      action: "client.deleted",
      entityType: "client",
      entityId: result.client.id,
      description: `Se eliminó permanentemente el cliente ${result.client.company}.`,
      authUser: context.authUser,
    });

    res.json({ deleted: true, id: result.client.id });
  });

  app.get("/api/projects", requireSectionAccess("projects"), (req, res) => {
    const context = getAgencyRequestContext(res.locals.authUser as AuthUser | undefined);

    if (!context) {
      return res.status(400).json({ error: "Agency not found" });
    }

    if (isExternalPortalUser(context.authUser)) {
      return res.status(403).json({ error: "Portal users must use the workspace portal" });
    }

    const archiveScope = getArchiveScopeFromQuery(req.query as Record<string, unknown>);
    const projects = db
      .prepare(
        `SELECT * FROM projects WHERE agency_id = ? AND ${getArchiveSqlCondition(archiveScope)} ORDER BY created_at DESC`,
      )
      .all(context.agencyId);
    res.json(projects);
  });

  app.post("/api/projects", requireSectionAccess("projects"), (req, res) => {
    const context = getAgencyRequestContext(res.locals.authUser as AuthUser | undefined);
    const { client_id, name, status } = req.body ?? {};
    const allowedStatuses = new Set([
      "strategy",
      "setup",
      "execution",
      "optimization",
      "reporting",
      "completed",
    ]);
    const parsedClientId = Number(client_id);
    const client =
      Number.isInteger(parsedClientId) && parsedClientId > 0
        ? getClientById(parsedClientId)
        : undefined;

    if (!context) {
      return res.status(400).json({ error: "Agency not found" });
    }

    if (isExternalPortalUser(context.authUser)) {
      return res.status(403).json({ error: "Portal users cannot create projects from this module" });
    }

    if (!client || client.agency_id !== context.agencyId || isArchivedRecord(client)) {
      return res.status(400).json({ error: "Client not found" });
    }

    if (typeof name !== "string" || !name.trim()) {
      return res.status(400).json({ error: "Project name is required" });
    }

    if (status && !allowedStatuses.has(status)) {
      return res.status(400).json({ error: "Invalid project status" });
    }

    const result = db
      .prepare(
        `
          INSERT INTO projects (client_id, name, status, agency_id)
          VALUES (?, ?, ?, ?)
        `,
      )
      .run(client.id, name.trim(), status || "strategy", client.agency_id);

    const project = db.prepare("SELECT * FROM projects WHERE id = ?").get(result.lastInsertRowid);
    createAuditLog({
      action: "project.created",
      entityType: "project",
      entityId: Number(result.lastInsertRowid),
      description: `Se creó el proyecto ${name.trim()}.`,
      authUser: res.locals.authUser as AuthUser,
      metadata: {
        client_id: client.id,
        status: status || "strategy",
      },
    });

    runAIAutomationTrigger({
      agencyId: client.agency_id,
      triggerKey: "ai_trigger_project_task_pack",
      automation: "project_tasks",
      entityId: Number(result.lastInsertRowid),
      input: `Proyecto recién creado para cliente #${client.id}`,
      entityType: "project",
      authUser: res.locals.authUser as AuthUser,
      description: `Se ejecutó automáticamente el pack de tareas IA al crear el proyecto ${name.trim()}.`,
    });
    res.status(201).json(project);
  });

  app.patch("/api/projects/:id/status", requireSectionAccess("projects"), (req, res) => {
    const context = getAgencyRequestContext(res.locals.authUser as AuthUser | undefined);
    const projectId = Number(req.params.id);
    const { status } = req.body ?? {};
    const allowedStatuses = new Set([
      "strategy",
      "setup",
      "execution",
      "optimization",
      "reporting",
      "completed",
    ]);

    if (!context) {
      return res.status(400).json({ error: "Agency not found" });
    }

    if (isExternalPortalUser(context.authUser)) {
      return res.status(403).json({ error: "Portal users must use the workspace portal" });
    }

    if (!Number.isInteger(projectId) || !allowedStatuses.has(status)) {
      return res.status(400).json({ error: "Invalid project id or status" });
    }

    const result = db
      .prepare("UPDATE projects SET status = ? WHERE id = ? AND agency_id = ? AND archived_at IS NULL")
      .run(status, projectId, context.agencyId);

    if (result.changes === 0) {
      return res.status(404).json({ error: "Project not found" });
    }

    const project = db.prepare("SELECT * FROM projects WHERE id = ?").get(projectId);
    createAuditLog({
      action: "project.status_updated",
      entityType: "project",
      entityId: projectId,
      description: `Se actualizó el estado del proyecto #${projectId} a ${status}.`,
      authUser: res.locals.authUser as AuthUser,
      metadata: {
        status,
      },
    });
    res.json(project);
  });

  app.post("/api/projects/:id/archive", requireSectionAccess("projects"), (req, res) => {
    const context = getAgencyRequestContext(res.locals.authUser as AuthUser | undefined);
    const projectId = Number(req.params.id);

    if (!context) {
      return res.status(400).json({ error: "Agency not found" });
    }

    if (isExternalPortalUser(context.authUser)) {
      return res.status(403).json({ error: "Portal users cannot archive projects" });
    }

    if (!Number.isInteger(projectId)) {
      return res.status(400).json({ error: "Invalid project id" });
    }

    const project = setProjectArchivedState(projectId, context.agencyId, true);

    if (!project) {
      return res.status(404).json({ error: "Project not found" });
    }

    createAuditLog({
      action: "project.archived",
      entityType: "project",
      entityId: project.id,
      description: `Se archivó el proyecto ${project.name}.`,
      authUser: context.authUser,
    });

    res.json(project);
  });

  app.post("/api/projects/:id/restore", requireSectionAccess("projects"), (req, res) => {
    const context = getAgencyRequestContext(res.locals.authUser as AuthUser | undefined);
    const projectId = Number(req.params.id);

    if (!context) {
      return res.status(400).json({ error: "Agency not found" });
    }

    if (isExternalPortalUser(context.authUser)) {
      return res.status(403).json({ error: "Portal users cannot restore projects" });
    }

    if (!Number.isInteger(projectId)) {
      return res.status(400).json({ error: "Invalid project id" });
    }

    const project = setProjectArchivedState(projectId, context.agencyId, false);

    if (!project) {
      return res.status(404).json({ error: "Project not found" });
    }

    createAuditLog({
      action: "project.restored",
      entityType: "project",
      entityId: project.id,
      description: `Se restauró el proyecto ${project.name}.`,
      authUser: context.authUser,
    });

    res.json(project);
  });

  app.delete("/api/projects/:id", requireSectionAccess("projects"), (req, res) => {
    const context = getAgencyRequestContext(res.locals.authUser as AuthUser | undefined);
    const projectId = Number(req.params.id);

    if (!context) {
      return res.status(400).json({ error: "Agency not found" });
    }

    if (isExternalPortalUser(context.authUser)) {
      return res.status(403).json({ error: "Portal users cannot delete projects" });
    }

    if (!Number.isInteger(projectId)) {
      return res.status(400).json({ error: "Invalid project id" });
    }

    const result = deleteProjectPermanently(projectId, context.agencyId);

    if ("error" in result) {
      if (result.error === "not_found") {
        return res.status(404).json({ error: "Project not found" });
      }

      if (result.error === "not_archived") {
        return res.status(400).json({ error: "Archive the project before deleting it permanently" });
      }

      if (result.error === "project_has_onboarding") {
        return res.status(409).json({ error: "The project is linked to a client onboarding and cannot be deleted" });
      }

      if (result.error === "project_has_active_children") {
        return res.status(409).json({ error: "Archive all project tasks and campaigns before deleting it permanently" });
      }
    }

    createAuditLog({
      action: "project.deleted",
      entityType: "project",
      entityId: result.project.id,
      description: `Se eliminó permanentemente el proyecto ${result.project.name}.`,
      authUser: context.authUser,
    });

    res.json({ deleted: true, id: result.project.id });
  });

  app.get("/api/campaigns", requireSectionAccess("campaigns"), (req, res) => {
    const context = getAgencyRequestContext(res.locals.authUser as AuthUser | undefined);

    if (!context) {
      return res.status(400).json({ error: "Agency not found" });
    }

    if (isExternalPortalUser(context.authUser)) {
      return res.status(403).json({ error: "Portal users must use the workspace portal" });
    }

    const archiveScope = getArchiveScopeFromQuery(req.query as Record<string, unknown>);
    const campaigns = db
      .prepare(
        `SELECT * FROM campaigns WHERE agency_id = ? AND ${getArchiveSqlCondition(archiveScope)} ORDER BY created_at DESC`,
      )
      .all(context.agencyId);
    res.json(campaigns);
  });

  app.patch("/api/campaigns/:id/status", requireSectionAccess("campaigns"), (req, res) => {
    const context = getAgencyRequestContext(res.locals.authUser as AuthUser | undefined);
    const campaignId = Number(req.params.id);
    const { status } = req.body ?? {};
    const allowedStatuses = new Set(["active", "paused", "completed"]);

    if (!context) {
      return res.status(400).json({ error: "Agency not found" });
    }

    if (isExternalPortalUser(context.authUser)) {
      return res.status(403).json({ error: "Portal users cannot update campaigns from this module" });
    }

    if (!Number.isInteger(campaignId) || !allowedStatuses.has(status)) {
      return res.status(400).json({ error: "Invalid campaign id or status" });
    }

    const campaign = getCampaignRecordById(campaignId);

    if (!campaign || !isAgencyOwnedRecord(campaign, context.agencyId) || isArchivedRecord(campaign)) {
      return res.status(404).json({ error: "Campaign not found" });
    }

    const result = db
      .prepare("UPDATE campaigns SET status = ? WHERE id = ? AND agency_id = ? AND archived_at IS NULL")
      .run(status, campaignId, context.agencyId);

    if (result.changes === 0) {
      return res.status(404).json({ error: "Campaign not found" });
    }

    const updatedCampaign = getCampaignRecordById(campaignId);

    createAuditLog({
      action: "campaign.status_updated",
      entityType: "campaign",
      entityId: campaignId,
      description: `Se actualizó el estado de la campaña #${campaignId} a ${status}.`,
      authUser: res.locals.authUser as AuthUser,
      metadata: {
        status,
      },
    });
    res.json(updatedCampaign || campaign);
  });

  app.get("/api/reports", requireSectionAccess("reports"), (req, res) => {
    const context = getAgencyRequestContext(res.locals.authUser as AuthUser | undefined);
    const scopedClientId = getScopedClientIdForAuthUser(context?.authUser);

    if (!context) {
      return res.status(400).json({ error: "Agency not found" });
    }

    const reports = db
      .prepare(
        `
          SELECT reports.*, clients.company as client_name
          FROM reports
          LEFT JOIN clients ON clients.id = reports.client_id
          WHERE reports.agency_id = ?
            AND (? <= 0 OR reports.client_id = ?)
          ORDER BY reports.created_at DESC
        `,
      )
      .all(context.agencyId, scopedClientId || 0, scopedClientId || 0);
    res.json(reports);
  });

  app.post("/api/reports", requireSectionAccess("reports"), (req, res) => {
    const context = getAgencyRequestContext(res.locals.authUser as AuthUser | undefined);
    const scopedClientId = getScopedClientIdForAuthUser(context?.authUser);
    const { client_id, title, type } = req.body ?? {};
    const parsedClientId = Number(client_id);
    const client =
      Number.isInteger(parsedClientId) && parsedClientId > 0
        ? (db
            .prepare("SELECT id, company, agency_id, archived_at FROM clients WHERE id = ?")
            .get(parsedClientId) as
            | { id: number; company: string; agency_id: number; archived_at: string | null }
            | undefined)
        : undefined;

    if (!context) {
      return res.status(400).json({ error: "Agency not found" });
    }

    if (scopedClientId) {
      return res.status(403).json({ error: "Client users have read-only report access" });
    }

    if (!client || client.agency_id !== context.agencyId || isArchivedRecord(client)) {
      return res.status(400).json({ error: "Client not found" });
    }

    if (typeof title !== "string" || !title.trim()) {
      return res.status(400).json({ error: "Report title is required" });
    }

    if (typeof type !== "string" || !type.trim()) {
      return res.status(400).json({ error: "Report type is required" });
    }

    const projectCount =
      (db
        .prepare("SELECT COUNT(*) as count FROM projects WHERE client_id = ? AND archived_at IS NULL")
        .get(client.id) as { count: number }).count;

    const projectIds = db
      .prepare("SELECT id FROM projects WHERE client_id = ? AND archived_at IS NULL")
      .all(client.id) as Array<{ id: number }>;

    const projectIdValues = projectIds.map((project) => project.id);

    let campaignCount = 0;
    let activeCampaignCount = 0;
    let totalSpend = 0;
    let averageRoi = 0;
    let pendingTaskCount = 0;

    if (projectIdValues.length > 0) {
      const placeholders = projectIdValues.map(() => "?").join(", ");

      const campaignStats = db
        .prepare(
          `
            SELECT
              COUNT(*) as count,
              SUM(CASE WHEN status = 'active' THEN 1 ELSE 0 END) as active_count,
              COALESCE(SUM(spent), 0) as total_spend,
              COALESCE(AVG(roi), 0) as average_roi
            FROM campaigns
            WHERE project_id IN (${placeholders}) AND archived_at IS NULL
          `,
        )
        .get(...projectIdValues) as {
        count: number;
        active_count: number;
        total_spend: number;
        average_roi: number;
      };

      const taskStats = db
        .prepare(
          `
            SELECT COUNT(*) as count
            FROM tasks
            WHERE status != 'done' AND archived_at IS NULL AND project_id IN (${placeholders})
          `,
        )
        .get(...projectIdValues) as { count: number };

      campaignCount = campaignStats.count;
      activeCampaignCount = campaignStats.active_count;
      totalSpend = campaignStats.total_spend;
      averageRoi = campaignStats.average_roi;
      pendingTaskCount = taskStats.count;
    }

    const generatedAt = new Date().toLocaleString("es-ES");
    const content = buildReportContent({
      clientName: client.company,
      type: type.trim(),
      generatedAt,
      projectCount,
      campaignCount,
      activeCampaignCount,
      totalSpend,
      averageRoi,
      pendingTaskCount,
    });
    const url = createReportUrl(title.trim(), content);

    const result = db
      .prepare(
        `
          INSERT INTO reports (client_id, title, type, url, agency_id)
          VALUES (?, ?, ?, ?, ?)
        `,
      )
      .run(client.id, title.trim(), type.trim(), url, client.agency_id || context.agencyId);

    const report = db.prepare("SELECT * FROM reports WHERE id = ?").get(result.lastInsertRowid);
    createAuditLog({
      action: "report.created",
      entityType: "report",
      entityId: Number(result.lastInsertRowid),
      description: `Se generó el reporte ${title.trim()} para ${client.company}.`,
      authUser: res.locals.authUser as AuthUser,
      metadata: {
        client_id: client.id,
        type: type.trim(),
      },
    });
    res.status(201).json(report);
  });

  app.get("/api/invoices", requireSectionAccess("billing"), (req, res) => {
    const context = getAgencyRequestContext(res.locals.authUser as AuthUser | undefined);
    const scopedClient = getScopedClientRecordForContext(context);
    const scopedFreelancer = getScopedFreelancerRecordForContext(context);

    if (!context) {
      return res.status(400).json({ error: "Agency not found" });
    }

    if (scopedClient === undefined) {
      return res.status(403).json({ error: "Client access is not linked correctly" });
    }

    if (scopedFreelancer === undefined) {
      return res.status(403).json({ error: "Freelancer access is not linked correctly" });
    }

    if (scopedFreelancer) {
      return res.status(403).json({ error: "Freelancer users must use the payouts portal" });
    }

    const invoices = scopedClient
      ? (db
          .prepare(
            `
              SELECT invoices.*, clients.company as client_name
              FROM invoices
              LEFT JOIN clients ON clients.id = invoices.client_id
              WHERE invoices.agency_id = ? AND invoices.client_id = ?
              ORDER BY datetime(invoices.due_date) DESC, invoices.id DESC
            `,
          )
          .all(context.agencyId, scopedClient.id) as Array<Record<string, unknown>>)
      : (db
          .prepare(
            `
              SELECT invoices.*, clients.company as client_name
              FROM invoices
              LEFT JOIN clients ON clients.id = invoices.client_id
              WHERE invoices.agency_id = ?
              ORDER BY datetime(invoices.due_date) DESC, invoices.id DESC
            `,
          )
          .all(context.agencyId) as Array<Record<string, unknown>>);

    res.json(invoices);
  });

  app.get("/api/tasks", requireSectionAccess("tasks"), (req, res) => {
    const context = getAgencyRequestContext(res.locals.authUser as AuthUser | undefined);

    if (!context) {
      return res.status(400).json({ error: "Agency not found" });
    }

    if (isExternalPortalUser(context.authUser)) {
      return res.status(403).json({ error: "Portal users must use their tasks portal" });
    }

    const archiveScope = getArchiveScopeFromQuery(req.query as Record<string, unknown>);
    const tasks = db
      .prepare(
        `
          SELECT
            tasks.*,
            COALESCE(tasks.description, '') as description,
            users.name as assigned_name,
            users.access_status as assignee_access_status
          FROM tasks
          LEFT JOIN users ON users.id = tasks.assigned_to
          WHERE tasks.agency_id = ? AND ${getArchiveSqlCondition(archiveScope)}
          ORDER BY datetime(tasks.due_date) ASC, tasks.id ASC
        `,
      )
      .all(context.agencyId);
    res.json(tasks);
  });

  app.post("/api/tasks", requireSectionAccess("tasks"), (req, res) => {
    const context = getAgencyRequestContext(res.locals.authUser as AuthUser | undefined);
    const { title, description, priority, due_date, project_id, assigned_to } = req.body ?? {};
    const allowedPriorities = new Set(["low", "medium", "high"]);
    const parsedProjectId = Number(project_id);
    const parsedAssignedTo = assigned_to === null || assigned_to === "" ? null : Number(assigned_to);
    const project =
      Number.isInteger(parsedProjectId) && parsedProjectId > 0
        ? getProjectById(parsedProjectId)
        : undefined;

    if (!context) {
      return res.status(400).json({ error: "Agency not found" });
    }

    if (isExternalPortalUser(context.authUser)) {
      return res.status(403).json({ error: "Portal users cannot create tasks from this module" });
    }

    const resolvedProject =
      Number.isInteger(parsedProjectId) && parsedProjectId > 0
        ? project && project.agency_id === context.agencyId && !isArchivedRecord(project)
          ? project
          : undefined
        : getDefaultProjectForAgency(context.agencyId);

    if (typeof title !== "string" || !title.trim()) {
      return res.status(400).json({ error: "Title is required" });
    }

    if (priority && !allowedPriorities.has(priority)) {
      return res.status(400).json({ error: "Invalid priority" });
    }

    if (!resolvedProject) {
      return res.status(400).json({ error: "Project not found" });
    }

    if (typeof due_date !== "string" || Number.isNaN(new Date(due_date).getTime())) {
      return res.status(400).json({ error: "Valid due date is required" });
    }

    const assignee =
      parsedAssignedTo === null
        ? null
        : Number.isInteger(parsedAssignedTo) && parsedAssignedTo > 0
          ? getTaskAssignableUserById(context.agencyId, parsedAssignedTo)
          : undefined;

    if (parsedAssignedTo !== null && !assignee) {
      return res.status(400).json({ error: "Assigned user is not valid for task delivery" });
    }

    const result = db
      .prepare(
        `
          INSERT INTO tasks (project_id, title, description, status, priority, due_date, assigned_to, agency_id)
          VALUES (?, ?, ?, 'todo', ?, ?, ?, ?)
        `,
      )
      .run(
        resolvedProject.id,
        title.trim(),
        typeof description === "string" ? description.trim() : "",
        priority || "medium",
        due_date,
        assignee?.id || null,
        resolvedProject.agency_id,
      );

    const task = getTaskRecordByIdFull(Number(result.lastInsertRowid));
    syncTaskCalendarEvent(Number(result.lastInsertRowid));
    createAuditLog({
      action: "task.created",
      entityType: "task",
      entityId: Number(result.lastInsertRowid),
      description: `Se creó la tarea ${title.trim()}.`,
      authUser: res.locals.authUser as AuthUser,
      metadata: {
        project_id: resolvedProject.id,
        priority: priority || "medium",
        due_date,
        assigned_to: assignee?.id || null,
      },
    });
    res.status(201).json(task);
  });

  app.patch("/api/tasks/:id/assignment", requireSectionAccess("tasks"), (req, res) => {
    const context = getAgencyRequestContext(res.locals.authUser as AuthUser | undefined);
    const taskId = Number(req.params.id);
    const parsedAssignedTo =
      req.body?.assigned_to === null || req.body?.assigned_to === ""
        ? null
        : Number(req.body?.assigned_to);

    if (!context) {
      return res.status(400).json({ error: "Agency not found" });
    }

    if (isExternalPortalUser(context.authUser)) {
      return res.status(403).json({ error: "Portal users cannot reassign tasks from this module" });
    }

    if (!Number.isInteger(taskId)) {
      return res.status(400).json({ error: "Invalid task id" });
    }

    const task = getTaskRecordByIdFull(taskId);

    if (!task || !isAgencyOwnedRecord(task, context.agencyId) || isArchivedRecord(task)) {
      return res.status(404).json({ error: "Task not found" });
    }

    const assignee =
      parsedAssignedTo === null
        ? null
        : Number.isInteger(parsedAssignedTo) && parsedAssignedTo > 0
          ? getTaskAssignableUserById(context.agencyId, parsedAssignedTo)
          : undefined;

    if (parsedAssignedTo !== null && !assignee) {
      return res.status(400).json({ error: "Assigned user is not valid for task delivery" });
    }

    db.prepare(
      `
        UPDATE tasks
        SET assigned_to = ?
        WHERE id = ? AND agency_id = ? AND archived_at IS NULL
      `,
    ).run(assignee?.id || null, task.id, context.agencyId);

    syncTaskCalendarEvent(task.id);
    const updatedTask = getTaskRecordByIdFull(task.id);

    createAuditLog({
      action: "task.assignment_updated",
      entityType: "task",
      entityId: task.id,
      description: assignee
        ? `Se asigno la tarea ${task.title} a ${assignee.name}.`
        : `Se desasigno la tarea ${task.title}.`,
      authUser: context.authUser,
      agencyId: context.agencyId,
      metadata: {
        previous_assigned_to: task.assigned_to,
        assigned_to: assignee?.id || null,
      },
    });

    res.json(updatedTask || task);
  });

  app.patch("/api/tasks/:id/status", requireSectionAccess("tasks"), (req, res) => {
    const context = getAgencyRequestContext(res.locals.authUser as AuthUser | undefined);
    const taskId = Number(req.params.id);
    const { status } = req.body ?? {};
    const allowedStatuses = new Set(["todo", "in_progress", "review", "done"]);

    if (!context) {
      return res.status(400).json({ error: "Agency not found" });
    }

    if (isExternalPortalUser(context.authUser)) {
      return res.status(403).json({ error: "Portal users must use their tasks portal" });
    }

    if (!Number.isInteger(taskId) || !allowedStatuses.has(status)) {
      return res.status(400).json({ error: "Invalid task id or status" });
    }

    const task = getTaskRecordByIdFull(taskId);

    if (!task || !isAgencyOwnedRecord(task, context.agencyId) || isArchivedRecord(task)) {
      return res.status(404).json({ error: "Task not found" });
    }

    const result = db
      .prepare("UPDATE tasks SET status = ? WHERE id = ? AND agency_id = ? AND archived_at IS NULL")
      .run(status, taskId, context.agencyId);

    if (result.changes === 0) {
      return res.status(404).json({ error: "Task not found" });
    }

    syncTaskCalendarEvent(taskId);
    const updatedTask = getTaskRecordByIdFull(taskId);
    createAuditLog({
      action: "task.status_updated",
      entityType: "task",
      entityId: taskId,
      description: `Se actualizó el estado de la tarea #${taskId} a ${status}.`,
      authUser: res.locals.authUser as AuthUser,
      metadata: {
        status,
      },
    });
    res.json(updatedTask || task);
  });

  app.post("/api/tasks/:id/archive", requireSectionAccess("tasks"), (req, res) => {
    const context = getAgencyRequestContext(res.locals.authUser as AuthUser | undefined);
    const taskId = Number(req.params.id);

    if (!context) {
      return res.status(400).json({ error: "Agency not found" });
    }

    if (isExternalPortalUser(context.authUser)) {
      return res.status(403).json({ error: "Portal users cannot archive tasks" });
    }

    if (!Number.isInteger(taskId)) {
      return res.status(400).json({ error: "Invalid task id" });
    }

    const task = setTaskArchivedState(taskId, context.agencyId, true);

    if (!task) {
      return res.status(404).json({ error: "Task not found" });
    }

    createAuditLog({
      action: "task.archived",
      entityType: "task",
      entityId: task.id,
      description: `Se archivó la tarea ${task.title}.`,
      authUser: context.authUser,
    });

    res.json(task);
  });

  app.post("/api/tasks/:id/restore", requireSectionAccess("tasks"), (req, res) => {
    const context = getAgencyRequestContext(res.locals.authUser as AuthUser | undefined);
    const taskId = Number(req.params.id);

    if (!context) {
      return res.status(400).json({ error: "Agency not found" });
    }

    if (isExternalPortalUser(context.authUser)) {
      return res.status(403).json({ error: "Portal users cannot restore tasks" });
    }

    if (!Number.isInteger(taskId)) {
      return res.status(400).json({ error: "Invalid task id" });
    }

    const task = setTaskArchivedState(taskId, context.agencyId, false);

    if (!task) {
      return res.status(404).json({ error: "Task not found" });
    }

    createAuditLog({
      action: "task.restored",
      entityType: "task",
      entityId: task.id,
      description: `Se restauró la tarea ${task.title}.`,
      authUser: context.authUser,
    });

    res.json(task);
  });

  app.delete("/api/tasks/:id", requireSectionAccess("tasks"), (req, res) => {
    const context = getAgencyRequestContext(res.locals.authUser as AuthUser | undefined);
    const taskId = Number(req.params.id);

    if (!context) {
      return res.status(400).json({ error: "Agency not found" });
    }

    if (isExternalPortalUser(context.authUser)) {
      return res.status(403).json({ error: "Portal users cannot delete tasks" });
    }

    if (!Number.isInteger(taskId)) {
      return res.status(400).json({ error: "Invalid task id" });
    }

    const result = deleteTaskPermanently(taskId, context.agencyId);

    if ("error" in result) {
      if (result.error === "not_found") {
        return res.status(404).json({ error: "Task not found" });
      }

      if (result.error === "not_archived") {
        return res.status(400).json({ error: "Archive the task before deleting it permanently" });
      }
    }

    createAuditLog({
      action: "task.deleted",
      entityType: "task",
      entityId: result.task.id,
      description: `Se eliminó permanentemente la tarea ${result.task.title}.`,
      authUser: context.authUser,
    });

    res.json({ deleted: true, id: result.task.id });
  });

  // Vite middleware for development
  if (process.env.NODE_ENV !== "production") {
    viteServer = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(viteServer.middlewares);
  } else {
    app.use(express.static(path.join(__dirname, "dist")));
    app.get("*", (req, res) => {
      res.sendFile(path.join(__dirname, "dist", "index.html"));
    });
  }

  const runtimeReadiness = getRuntimeReadiness();
  const startupIssues = runtimeReadiness.items.filter((item) => item.status !== "ready");

  if (startupIssues.length > 0) {
    console.warn("[startup] readiness summary:", runtimeReadiness.overall_status);

    startupIssues.forEach((item) => {
      const logMethod = item.status === "critical" ? console.error : console.warn;
      logMethod(`[startup] ${item.label}: ${item.detail}`);
    });
  }

  if (IS_PRODUCTION && STRICT_PRODUCTION_CHECKS_ENABLED && runtimeReadiness.overall_status === "critical") {
    throw new Error(
      "Startup aborted: strict production checks detected critical readiness issues. Run `npm run preflight` and fix the failing items before deploying.",
    );
  }

  const PORT = Number(process.env.PORT || 3000);
  httpServer = app.listen(PORT, "0.0.0.0", () => {
    console.log(`Server running on http://0.0.0.0:${PORT}`);
    console.log(`[startup] database path: ${DATABASE_PATH}`);
    console.log(`[startup] release: ${getReleaseIdentifier() || "local"}`);
    console.log(`[startup] strict production checks: ${STRICT_PRODUCTION_CHECKS_ENABLED ? "enabled" : "disabled"}`);
  });

  const shutdown = async (signal: string) => {
    if (isShuttingDown) {
      return;
    }

    isShuttingDown = true;
    console.log(`[shutdown] received ${signal}, closing server...`);

    const forceExitTimer = setTimeout(() => {
      console.error("[shutdown] force exit after timeout");
      process.exit(1);
    }, 10000);
    forceExitTimer.unref();

    try {
      await new Promise<void>((resolve, reject) => {
        if (!httpServer) {
          resolve();
          return;
        }

        httpServer.close((error) => {
          if (error) {
            reject(error);
            return;
          }

          resolve();
        });
      });

      if (viteServer) {
        await viteServer.close();
      }

      db.close();
      clearTimeout(forceExitTimer);
      console.log("[shutdown] server stopped cleanly");
      process.exit(0);
    } catch (error) {
      clearTimeout(forceExitTimer);
      console.error("[shutdown] graceful shutdown failed", error);
      process.exit(1);
    }
  };

  process.once("SIGTERM", () => {
    void shutdown("SIGTERM");
  });
  process.once("SIGINT", () => {
    void shutdown("SIGINT");
  });
}

startServer().catch((error) => {
  console.error("[startup] fatal error", error);

  try {
    db.close();
  } catch {
    // Ignore close errors during fatal startup.
  }

  process.exit(1);
});
