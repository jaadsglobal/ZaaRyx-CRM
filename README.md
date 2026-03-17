<div align="center">
<img width="1200" height="475" alt="GHBanner" src="https://github.com/user-attachments/assets/0aa67016-6eaf-458a-adb2-6e31a0763ed6" />
</div>

# Run and deploy your AI Studio app

This contains everything you need to run your app locally.

View your app in AI Studio: https://ai.studio/apps/b3dda3b8-2d74-43e5-a650-6f7b1339365a

## Run Locally

**Prerequisites:**  Node.js


1. Install dependencies:
   `npm install`
2. Set the `GEMINI_API_KEY` in `.env.local` to your Gemini API key
3. If you want real password recovery emails and login alerts, also configure:
   `APP_URL`, `SMTP_HOST`, `SMTP_PORT`, `SMTP_SECURE`, `SMTP_USER`, `SMTP_PASS`, `MAIL_FROM`
4. For a real production deployment, review:
   `DATABASE_PATH`, `TRUST_PROXY`, `SECURE_COOKIES`, `JSON_BODY_LIMIT`, `STRICT_PRODUCTION_CHECKS`
5. In production, use `DATABASE_PATH` over persistent storage. With Docker, the recommended path is `/data/jaadsglobal.db`.
6. If the app is behind a reverse proxy or load balancer, set `TRUST_PROXY=true` only if that proxy forwards the real client IP and HTTPS scheme correctly.
7. Inside `Ajustes` you now have a production readiness checklist that warns if `APP_URL`, SMTP or cookie/proxy settings are not ready.
8. In local development, if SMTP is not configured, the recovery flow exposes a temporary reset link only in non-production mode.
9. Before deploying, run:
   `npm run preflight`
10. Health endpoints for infrastructure:
   `GET /healthz`
   `GET /readyz`
11. Run the app:
   `npm run dev`

## Production Notes

- `npm run start` now runs the production server through `node --import .../tsx`, which is safer for deployment than the `tsx` CLI wrapper.
- If you want the server to abort startup when critical configuration is missing, set `STRICT_PRODUCTION_CHECKS=true`.
- `/readyz` returns `503` when critical runtime checks fail, so it can be used directly by a load balancer or orchestrator.
- A Docker deployment recipe is available in [DEPLOYMENT.md](./DEPLOYMENT.md).
