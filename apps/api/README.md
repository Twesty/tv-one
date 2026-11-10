# TV One API

Fastify API intended for deployment as a Render Web Service.

## Runtime

- Node.js 22+
- pnpm workspace
- Supabase PostgreSQL/Auth/Storage
- Production environment variables are mandatory; the process fails fast when configuration is missing or invalid.

## Health endpoints

- `GET /health/live` — process liveness.
- `GET /health/ready` — checks connectivity and access to the Supabase database.

## Render

Configure the service to install the workspace dependencies, build `@tv-one/api`, and start the compiled server. Bind to `0.0.0.0` and the Render-provided `PORT`.

Required variables are listed in `.env.example`. Never add actual credentials to GitHub. The service-role key is server-only.
