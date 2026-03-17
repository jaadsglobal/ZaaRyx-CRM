import "dotenv/config";
import fs from "fs";
import path from "path";
import Database from "better-sqlite3";

const usage = () => {
  console.error(
    [
      "Uso:",
      "  npm run db:import-dump -- <ruta-dump.sql> [ruta-db-destino]",
      "",
      "Ejemplo:",
      "  npm run db:import-dump -- /etc/secrets/staging-seed.sql /data/jaadsglobal.db",
    ].join("\n"),
  );
};

const getSqliteSidecarPaths = (databasePath: string) => [
  `${databasePath}-wal`,
  `${databasePath}-shm`,
];

const removeSqliteArtifacts = (databasePath: string) => {
  fs.rmSync(databasePath, { force: true });

  for (const sidecarPath of getSqliteSidecarPaths(databasePath)) {
    fs.rmSync(sidecarPath, { force: true });
  }
};

const moveSqliteArtifacts = (sourceDatabasePath: string, destinationDatabasePath: string) => {
  if (fs.existsSync(sourceDatabasePath)) {
    fs.renameSync(sourceDatabasePath, destinationDatabasePath);
  }

  const sourceSidecars = getSqliteSidecarPaths(sourceDatabasePath);
  const destinationSidecars = getSqliteSidecarPaths(destinationDatabasePath);

  sourceSidecars.forEach((sourceSidecarPath, index) => {
    if (fs.existsSync(sourceSidecarPath)) {
      fs.renameSync(sourceSidecarPath, destinationSidecars[index]);
    }
  });
};

const resolveDatabasePath = (value?: string | null) => {
  const configuredPath = typeof value === "string" && value.trim() ? value.trim() : "jaadsglobal.db";
  return path.isAbsolute(configuredPath)
    ? configuredPath
    : path.join(process.cwd(), configuredPath);
};

const sourceDumpArg = process.argv[2];
const destinationDbArg = process.argv[3];

if (!sourceDumpArg) {
  usage();
  process.exit(1);
}

const sourceDumpPath = path.resolve(process.cwd(), sourceDumpArg);
const targetDatabasePath = destinationDbArg
  ? path.resolve(process.cwd(), destinationDbArg)
  : resolveDatabasePath(process.env.DATABASE_PATH);
const targetDirectory = path.dirname(targetDatabasePath);
const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
const temporaryDatabasePath = `${targetDatabasePath}.import-${timestamp}`;
const backupDatabasePath = `${targetDatabasePath}.backup-${timestamp}`;

if (!fs.existsSync(sourceDumpPath)) {
  console.error(`[import] No existe el dump SQL: ${sourceDumpPath}`);
  process.exit(1);
}

const dumpContents = fs.readFileSync(sourceDumpPath, "utf8");

if (!dumpContents.trim()) {
  console.error(`[import] El dump SQL está vacío: ${sourceDumpPath}`);
  process.exit(1);
}

fs.mkdirSync(targetDirectory, { recursive: true });
removeSqliteArtifacts(temporaryDatabasePath);

const temporaryDatabase = new Database(temporaryDatabasePath);

try {
  temporaryDatabase.pragma("journal_mode = DELETE");
  temporaryDatabase.exec(dumpContents);

  const integrityCheck = temporaryDatabase.pragma("integrity_check", { simple: true });
  const schemaReady = temporaryDatabase
    .prepare("SELECT COUNT(*) AS count FROM sqlite_master WHERE type = 'table'")
    .get() as { count: number };

  if (integrityCheck !== "ok") {
    throw new Error(`La verificación de integridad devolvió: ${integrityCheck}`);
  }

  if (!schemaReady.count) {
    throw new Error("La base importada no contiene tablas.");
  }
} catch (error) {
  temporaryDatabase.close();
  removeSqliteArtifacts(temporaryDatabasePath);
  throw error;
}

temporaryDatabase.close();

const temporaryDatabaseStats = fs.existsSync(temporaryDatabasePath)
  ? fs.statSync(temporaryDatabasePath)
  : null;

if (!temporaryDatabaseStats || temporaryDatabaseStats.size === 0) {
  removeSqliteArtifacts(temporaryDatabasePath);
  throw new Error(`La base temporal no quedó persistida correctamente en ${temporaryDatabasePath}.`);
}

if (
  fs.existsSync(targetDatabasePath) ||
  getSqliteSidecarPaths(targetDatabasePath).some((artifactPath) => fs.existsSync(artifactPath))
) {
  removeSqliteArtifacts(backupDatabasePath);
  moveSqliteArtifacts(targetDatabasePath, backupDatabasePath);
  console.log(`[import] Copia previa guardada en ${backupDatabasePath}`);
}

moveSqliteArtifacts(temporaryDatabasePath, targetDatabasePath);

const targetDatabaseStats = fs.existsSync(targetDatabasePath)
  ? fs.statSync(targetDatabasePath)
  : null;

if (!targetDatabaseStats || targetDatabaseStats.size === 0) {
  removeSqliteArtifacts(targetDatabasePath);
  throw new Error(`La base importada no quedó disponible en ${targetDatabasePath}.`);
}

const importedDatabase = new Database(targetDatabasePath, { readonly: true });

try {
  const summary = importedDatabase
    .prepare(
      [
        "SELECT",
        "  (SELECT COUNT(*) FROM users) AS users_count,",
        "  (SELECT COUNT(*) FROM clients) AS clients_count,",
        "  (SELECT COUNT(*) FROM freelancers) AS freelancers_count,",
        "  (SELECT COUNT(*) FROM contracts) AS contracts_count",
      ].join(" "),
    )
    .get() as {
      users_count: number;
      clients_count: number;
      freelancers_count: number;
      contracts_count: number;
    };

  console.log(`[import] Importación completada en ${targetDatabasePath}`);
  console.log(
    `[import] Resumen: ${summary.users_count} usuarios, ${summary.clients_count} clientes, ${summary.freelancers_count} freelancers, ${summary.contracts_count} contratos.`,
  );
} finally {
  importedDatabase.close();
}
