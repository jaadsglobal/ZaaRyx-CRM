import "dotenv/config";
import fs from "fs";
import path from "path";
import Database from "better-sqlite3";

type CheckStatus = "ready" | "warning" | "critical";

interface CheckResult {
  key: string;
  label: string;
  status: CheckStatus;
  detail: string;
}

const projectRoot = process.cwd();
const isProduction = process.env.NODE_ENV === "production";

const parseBooleanEnvFlag = (value?: string) =>
  typeof value === "string" && ["1", "true", "yes", "on"].includes(value.trim().toLowerCase());

const strictProductionChecksEnabled = parseBooleanEnvFlag(process.env.STRICT_PRODUCTION_CHECKS);

const normalizeAppUrl = (value?: string | null) => {
  if (!value || typeof value !== "string") {
    return null;
  }

  const trimmed = value.trim();
  return trimmed ? trimmed.replace(/\/+$/, "") : null;
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

const resolveDatabasePath = (value?: string | null) => {
  const configuredPath = typeof value === "string" && value.trim() ? value.trim() : "jaadsglobal.db";

  return path.isAbsolute(configuredPath)
    ? configuredPath
    : path.join(projectRoot, configuredPath);
};

const getOverallStatus = (checks: CheckResult[]): CheckStatus =>
  checks.some((check) => check.status === "critical")
    ? "critical"
    : checks.some((check) => check.status === "warning")
      ? "warning"
      : "ready";

const appUrl = normalizeAppUrl(process.env.APP_URL);
const smtpHost = process.env.SMTP_HOST?.trim();
const smtpPort = Number(process.env.SMTP_PORT || 587);
const smtpConfigured = Boolean(smtpHost && Number.isFinite(smtpPort));
const mailFrom =
  process.env.MAIL_FROM?.trim() ||
  process.env.SMTP_FROM?.trim() ||
  process.env.SMTP_USER?.trim() ||
  "no-reply@jaadsglobal.local";
const trustProxyEnabled = parseBooleanEnvFlag(process.env.TRUST_PROXY);
const secureCookiesEnabled = parseBooleanEnvFlag(process.env.SECURE_COOKIES);
const geminiConfigured = Boolean(process.env.GEMINI_API_KEY?.trim());
const distIndexPath = path.join(projectRoot, "dist", "index.html");
const databasePath = resolveDatabasePath(process.env.DATABASE_PATH);
const databaseDirectory = path.dirname(databasePath);
const databaseExists = fs.existsSync(databasePath);
const databasePathIsAbsolute = path.isAbsolute(databasePath);
const appUrlUsesTrustedLocalHttp = isTrustedLocalAppUrl(appUrl);

let databaseReachable = false;
let schemaReady = false;
let databaseDirectoryWritable = false;

try {
  fs.mkdirSync(databaseDirectory, { recursive: true });
  fs.accessSync(databaseDirectory, fs.constants.W_OK);
  databaseDirectoryWritable = true;
} catch {
  databaseDirectoryWritable = false;
}

try {
  const db = new Database(databasePath);

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
  } finally {
    db.close();
  }
} catch {
  databaseReachable = false;
  schemaReady = false;
}

const checks: CheckResult[] = [
  {
    key: "database",
    label: "Base de datos",
    status: databaseReachable && databaseDirectoryWritable ? "ready" : "critical",
    detail:
      databaseReachable && databaseDirectoryWritable
        ? `La base de datos está accesible en ${databasePath}.`
        : `No se pudo abrir la base de datos o escribir en ${databaseDirectory}.`,
  },
  {
    key: "schema",
    label: "Esquema principal",
    status: !databaseReachable ? "critical" : schemaReady ? "ready" : "warning",
    detail: !databaseReachable
      ? "No se puede validar el esquema porque la base de datos no está accesible."
      : schemaReady
        ? "La tabla base de agencias existe."
        : "El esquema se inicializará al primer arranque si la base está vacía.",
  },
  {
    key: "database_path",
    label: "Ruta de datos",
    status: !isProduction || databasePathIsAbsolute ? "ready" : "warning",
    detail: databasePathIsAbsolute
      ? `DATABASE_PATH apunta a ${databasePath}.`
      : `DATABASE_PATH actual: ${databasePath}. Para producción se recomienda una ruta absoluta sobre almacenamiento persistente.`,
  },
  {
    key: "build_assets",
    label: "Build frontend",
    status: fs.existsSync(distIndexPath) ? "ready" : "critical",
    detail: fs.existsSync(distIndexPath)
      ? "La carpeta dist está lista."
      : "Falta dist/index.html. Ejecuta npm run build antes del despliegue.",
  },
  {
    key: "app_url",
    label: "APP_URL",
    status: appUrl ? "ready" : "critical",
    detail: appUrl
      ? "APP_URL está configurada."
      : "Falta APP_URL para recuperación, callbacks y enlaces públicos.",
  },
  {
    key: "app_url_https",
    label: "APP_URL segura",
    status: !appUrl || appUrl.startsWith("https://")
      ? "ready"
      : appUrlUsesTrustedLocalHttp
        ? "warning"
        : "critical",
    detail:
      !appUrl || appUrl.startsWith("https://")
        ? "APP_URL usa un esquema válido para producción."
        : appUrlUsesTrustedLocalHttp
          ? "APP_URL usa HTTP sólo en localhost o red privada. Sirve para pruebas, no para despliegue público."
          : "APP_URL debe usar HTTPS en despliegue real.",
  },
  {
    key: "smtp",
    label: "SMTP",
    status: smtpConfigured ? "ready" : strictProductionChecksEnabled ? "critical" : "warning",
    detail: smtpConfigured
      ? "SMTP está configurado."
      : strictProductionChecksEnabled
        ? "Faltan SMTP_HOST y/o SMTP_PORT para correos reales."
        : "Faltan SMTP_HOST y/o SMTP_PORT. Con STRICT_PRODUCTION_CHECKS=false el staging puede arrancar, pero no enviará correos reales.",
  },
  {
    key: "mail_from",
    label: "MAIL_FROM",
    status: mailFrom.includes("@") ? "ready" : "warning",
    detail: mailFrom.includes("@")
      ? "El remitente de correo parece correcto."
      : "MAIL_FROM no parece un correo válido.",
  },
  {
    key: "secure_cookie_strategy",
    label: "Cookies seguras",
    status: trustProxyEnabled || secureCookiesEnabled ? "ready" : "warning",
    detail:
      trustProxyEnabled || secureCookiesEnabled
        ? "La estrategia para cookies seguras está definida."
        : "Define TRUST_PROXY o SECURE_COOKIES según tu infraestructura HTTPS.",
  },
  {
    key: "ai_provider",
    label: "Proveedor IA",
    status: geminiConfigured ? "ready" : "warning",
    detail: geminiConfigured
      ? "GEMINI_API_KEY está presente."
      : "No hay GEMINI_API_KEY. La IA usará fallback local.",
  },
];

const overallStatus = getOverallStatus(checks);
const counts = checks.reduce(
  (accumulator, check) => {
    accumulator[check.status] += 1;
    return accumulator;
  },
  { ready: 0, warning: 0, critical: 0 },
);

console.log("Preflight de despliegue");
console.log(`Modo: ${isProduction ? "production" : "development"}`);
console.log(`Strict checks: ${strictProductionChecksEnabled ? "enabled" : "disabled"}`);
console.log(`Proyecto: ${projectRoot}`);
console.log("");

for (const check of checks) {
  const marker =
    check.status === "ready" ? "[OK]" : check.status === "warning" ? "[WARN]" : "[FAIL]";
  console.log(`${marker} ${check.label}: ${check.detail}`);
}

console.log("");
console.log(
  `Resultado: ${overallStatus.toUpperCase()} · OK ${counts.ready} · WARN ${counts.warning} · FAIL ${counts.critical}`,
);

if (checks.some((check) => check.key === "secure_cookie_strategy" && check.status === "warning")) {
  console.log(
    "Nota: la validación final de cookies seguras depende también de cómo entre HTTPS en producción.",
  );
}

if (overallStatus === "critical") {
  process.exitCode = 1;
}
