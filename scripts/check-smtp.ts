import "dotenv/config";
import { createTransport } from "nodemailer";

const usage = () => {
  console.error(
    [
      "Uso:",
      "  npm run smtp:check",
      "  npm run smtp:check -- <email-destino>",
      "",
      "Ejemplos:",
      "  npm run smtp:check",
      "  npm run smtp:check -- admin@tu-dominio.com",
    ].join("\n"),
  );
};

const parseBooleanEnvFlag = (value?: string) =>
  typeof value === "string" && ["1", "true", "yes", "on"].includes(value.trim().toLowerCase());

const maskValue = (value?: string | null) => {
  if (!value) {
    return "(empty)";
  }

  if (value.length <= 4) {
    return "*".repeat(value.length);
  }

  return `${value.slice(0, 2)}${"*".repeat(Math.max(2, value.length - 4))}${value.slice(-2)}`;
};

const recipient = process.argv[2]?.trim() || null;

if (process.argv.length > 3) {
  usage();
  process.exit(1);
}

const host = process.env.SMTP_HOST?.trim();
const port = Number(process.env.SMTP_PORT || 587);
const secure = parseBooleanEnvFlag(process.env.SMTP_SECURE) || port === 465;
const user = process.env.SMTP_USER?.trim();
const pass = process.env.SMTP_PASS?.trim();
const from =
  process.env.MAIL_FROM?.trim() ||
  process.env.SMTP_FROM?.trim() ||
  user ||
  "no-reply@zaaryx.local";

if (!host || !Number.isFinite(port)) {
  console.error("[smtp] SMTP_HOST o SMTP_PORT no estan configurados correctamente.");
  usage();
  process.exit(1);
}

console.log("[smtp] Configuracion detectada:");
console.log(`  host: ${host}`);
console.log(`  port: ${port}`);
console.log(`  secure: ${secure ? "true" : "false"}`);
console.log(`  user: ${maskValue(user)}`);
console.log(`  pass: ${pass ? "(set)" : "(empty)"}`);
console.log(`  from: ${from}`);
console.log(`  test recipient: ${recipient || "(none)"}`);

const transporter = createTransport({
  host,
  port,
  secure,
  auth: user && pass ? { user, pass } : undefined,
});

const run = async () => {
  console.log("[smtp] Verificando conexion...");
  await transporter.verify();
  console.log("[smtp] Conexion SMTP verificada correctamente.");

  if (!recipient) {
    console.log("[smtp] No se envio correo de prueba porque no se proporciono destinatario.");
    return;
  }

  console.log(`[smtp] Enviando correo de prueba a ${recipient}...`);

  const result = await transporter.sendMail({
    from,
    to: recipient,
    subject: "Prueba SMTP · ZaaRyx CRM",
    text: [
      "Esta es una prueba manual del canal SMTP de ZaaRyx CRM.",
      "",
      `Servidor: ${host}:${port}`,
      `Secure: ${secure ? "true" : "false"}`,
      `From: ${from}`,
      `Fecha: ${new Date().toISOString()}`,
    ].join("\n"),
  });

  console.log("[smtp] Correo de prueba aceptado por el servidor SMTP.");
  console.log(`[smtp] messageId: ${result.messageId || "(none)"}`);
  console.log(
    `[smtp] accepted: ${result.accepted.length > 0 ? result.accepted.join(", ") : "(none)"}`,
  );
  console.log(
    `[smtp] rejected: ${result.rejected.length > 0 ? result.rejected.join(", ") : "(none)"}`,
  );
  console.log(`[smtp] response: ${result.response || "(none)"}`);
};

run().catch((error) => {
  const message = error instanceof Error ? error.message : String(error);
  console.error("[smtp] Fallo en la verificacion o envio SMTP.");
  console.error(`[smtp] Error: ${message}`);
  process.exit(1);
});
