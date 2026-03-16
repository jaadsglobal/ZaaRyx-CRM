# Despliegue a Producción

## Ruta recomendada para este proyecto

La opción más segura para el estado actual del CRM es:

1. GitHub como repositorio principal
2. Staging del backend completo con Docker
3. Hosting con volumen persistente real para SQLite
4. Después producción, sólo cuando staging esté validado

Plataformas válidas para este estado del proyecto:

- Render
- Railway con volumen persistente
- Fly.io con volumen persistente
- VPS con Docker

No se recomienda desplegar el backend actual en Vercel como primer destino porque esta app usa SQLite y necesita persistencia real en `DATABASE_PATH`. Vercel puede servir bien un frontend estático, pero no es la base correcta para este backend monolítico sin migrarlo antes a Postgres.

## Primer staging recomendado: Render

El repositorio incluye [render.yaml](/Users/juanguillermomarquezperez/Downloads/zaaryx-global-crm/render.yaml) para crear una instancia de staging con:

- Docker
- disco persistente en `/data`
- health check inicial en `/healthz`
- despliegue automático sólo si GitHub Actions pasa

### Variables para staging

Usa [.env.staging.example](/Users/juanguillermomarquezperez/Downloads/zaaryx-global-crm/.env.staging.example) como referencia. En staging se deja `STRICT_PRODUCTION_CHECKS=false` para no bloquear el primer despliegue si todavía no has conectado SMTP o Gemini.

### Pasos en Render

1. Entra en Render y crea un `Blueprint` desde tu repo de GitHub
2. Selecciona este repositorio y usa `render.yaml`
3. Revisa el servicio `zaaryx-crm-staging`
4. Completa como mínimo:
   - `APP_URL`
   - `MAIL_FROM`
5. Si ya tienes correo real, completa también:
   - `SMTP_HOST`
   - `SMTP_PORT`
   - `SMTP_SECURE`
   - `SMTP_USER`
   - `SMTP_PASS`
6. Lanza el deploy
7. Verifica:
   - `GET /healthz`
   - login admin
   - login cliente
   - login freelance
   - persistencia tras reinicio del servicio

### Pasar la base local actual a staging

Si el `staging` arranca con una base vacía o sin tus demos de `cliente` y `freelance`, la forma más segura de alinearlo con local es restaurar un volcado SQL de tu base actual.

1. Crea un backup local de `zaaryx.db`
2. Exporta el dump SQL:
   `sqlite3 zaaryx.db .dump > /tmp/zaaryx-staging.sql`
3. En Render, añade ese dump como `Secret File`
   - nombre sugerido: `staging-seed.sql`
   - ruta final: `/etc/secrets/staging-seed.sql`
4. Abre la `Shell` del servicio `zaaryx-crm-staging`
5. Ejecuta la importación sobre el disco persistente:
   `npm run db:import-dump -- /etc/secrets/staging-seed.sql /data/zaaryx.db`
6. Reinicia el servicio desde Render
7. Verifica de nuevo:
   - login admin
   - `cliente.demo@zaaryx.local`
   - `freelance.demo@zaaryx.local`
   - `/healthz`

El script de importación crea una copia previa del fichero remoto antes de sustituirlo, así que el staging no se pisa sin respaldo.

### Cuándo cambiar a `/readyz`

Mantén `/healthz` en staging mientras faltan `SMTP` o `APP_URL` definitivos. Cuando staging tenga configuración completa y estable, conviene mover el health check a `/readyz` y activar `STRICT_PRODUCTION_CHECKS=true` en producción.

## Variables mínimas

- `APP_URL=https://tu-dominio-real`
- `DATABASE_PATH=/data/zaaryx.db`
- `SMTP_HOST=...`
- `SMTP_PORT=587`
- `SMTP_SECURE=false`
- `SMTP_USER=...`
- `SMTP_PASS=...`
- `MAIL_FROM=ZaaRyx CRM <no-reply@tu-dominio>`

## Variables recomendadas

- `TRUST_PROXY=true` si la app va detrás de Nginx, Traefik, Cloudflare o un balanceador
- `SECURE_COOKIES=true` si necesitas forzar cookies seguras
- `STRICT_PRODUCTION_CHECKS=true` para abortar el arranque si faltan elementos críticos
- `RELEASE_VERSION=2026.03.11` o el identificador de tu release
- `GEMINI_API_KEY=...` para IA nativa

## Preflight local

1. Instala dependencias:
   `npm install`
2. Compila frontend:
   `npm run build`
3. Ejecuta preflight:
   `npm run preflight`
4. Corrige cualquier `FAIL` antes de desplegar.

## Docker

1. Construye la imagen:
   `docker build -t zaaryx-crm .`
2. Ejecuta con volumen persistente:
   `docker run --env-file .env -p 3000:3000 -v zaaryx_data:/data zaaryx-crm`
3. Comprueba:
   `GET /healthz`
   `GET /readyz`

## Docker Compose

El proyecto incluye [compose.yml](/Users/juanguillermomarquezperez/Downloads/zaaryx-global-crm/compose.yml) para levantar una instancia de staging o producción local con volumen persistente.

1. Crea tu fichero real de entorno a partir de [.env.production.example](/Users/juanguillermomarquezperez/Downloads/zaaryx-global-crm/.env.production.example)
2. Exporta esas variables en tu shell o cárgalas desde tu plataforma
3. Levanta el stack:
   `docker compose up --build -d`
4. Verifica:
   `GET /healthz`
   `GET /readyz`
5. Confirma persistencia reiniciando el contenedor:
   `docker compose restart`

## Post-deploy

1. `/healthz` debe devolver `200`
2. `/readyz` debe devolver `200`
3. `npm run preflight` debe quedar sin `FAIL`
4. Login admin correcto
5. Recuperación de contraseña operativa con SMTP real
6. Revisión en `Ajustes > Checklist de Producción`
7. Confirmar que la base persiste tras reinicio del servicio

## Notas operativas

- Esta app usa SQLite. En producción necesitas almacenamiento persistente real para `DATABASE_PATH`.
- Si despliegas en una plataforma con filesystem efímero y sin volumen persistente, perderás datos al reiniciar.
- Si `STRICT_PRODUCTION_CHECKS=true`, el servidor no arrancará si faltan `APP_URL` o SMTP.
- Si más adelante quieres usar Supabase, la ruta correcta es migrar antes la capa de datos a Postgres y después reevaluar si merece la pena mover el hosting del backend.
