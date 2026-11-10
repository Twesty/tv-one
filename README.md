# TV One

Production-oriented platform for centrally managing and synchronously playing advertising media on venue displays.

## Applications

- `apps/admin` — Angular administration application.
- `apps/player` — Angular TV playback application.
- `apps/api` — Fastify API deployed as a Render Web Service.
- `packages/shared` — shared TypeScript contracts and validation schemas.
- `supabase/migrations` — database schema, policies, and database functions.

## Infrastructure

- Supabase Auth for administrator authentication.
- Supabase PostgreSQL with Row Level Security.
- Supabase Storage for media assets (50 MB application upload limit).
- Supabase Realtime for device configuration updates.
- Render Web Service for the API and production web delivery.

## Production configuration

All service URLs and credentials are supplied through environment variables. No application behavior depends on a local development server or hard-coded deployment URL.

See [docs/architecture.md](docs/architecture.md) and [docs/deployment.md](docs/deployment.md).

## Project status

Repository bootstrap and architecture foundation. Production functionality, integration tests, and deployment verification are tracked as implementation work; this repository must not be considered production-ready until those checks pass against the configured Supabase and Render projects.
