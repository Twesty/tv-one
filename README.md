# TV One

Production-oriented platform for centrally managing and synchronously playing advertising media on venue displays.

## Applications

- `apps/admin` — Angular administration application.
- `apps/player` — Angular TV playback application.
- `apps/api` — Fastify API and static hosting for both Angular apps, deployed as one Render Web Service.
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

## Implementation status

- [x] Repository and workspace foundation
- [x] Initial Supabase schema, RLS defaults, private media bucket
- [x] Fastify API foundation and production configuration validation
- [x] Supabase administrator token and role verification
- [x] Venue and device administration endpoints (including rename and revocation)
- [x] Media listing, signature-validated uploads, and safe deletion of unassigned files (50 MiB limit)
- [x] Single-device and bulk synchronized assignment endpoints
- [x] Public player directory and device credential verification
- [x] Database clock endpoint for playback synchronization
- [x] Angular admin application foundation (auth, venues, devices, media, bulk assignment UI)
- [x] Angular TV player foundation (pairing, server-time playback, media cache, app-shell offline support, polling)
- [x] Supabase Realtime assignment broadcasts with polling fallback
- [ ] End-to-end tests for synchronization, cache eviction, and reconnect behavior
- [ ] Realtime permissions and production channel verification
- [x] Single-service Render Blueprint and build-time public runtime configuration
- [ ] Render/Supabase production deployment and smoke tests

This is an active implementation, not yet a production-ready release. Do not deploy to real venues until the remaining items, CI checks, and live integration tests have passed.
