# Production deployment checklist

This document describes the required setup. Deployment is not verified until the configured services pass the smoke tests.

## Supabase

1. Create a Supabase project in the intended production region.
2. Apply every SQL migration from `supabase/migrations` in order.
3. Enable Supabase Auth email/password sign-in and manually create the initial administrator.
4. Assign the administrator role using the documented privileged setup procedure.
5. Create the private media Storage bucket and apply its size/MIME restrictions and policies.
6. Configure the production Auth site URL and allowed redirect URLs for the deployed admin origin.
7. Keep the service-role key private; configure it only in the Render service environment.

## Render

1. Create a Web Service connected to this GitHub repository.
2. Configure the repository's Node.js/pnpm build and start commands as documented by the API application once implemented.
3. Set all required environment variables from the API `.env.example`; use actual production values in Render's secret environment settings.
4. Set the exact deployed admin origin in the CORS allowlist.
5. Deploy and verify health, readiness, authentication, media upload, player pairing, and realtime reconnection flows.

## Required environment values

The API will require the Supabase project URL, Supabase anon key, Supabase service-role key, allowed admin origins, and its public API origin. The player/admin builds will receive only public configuration (never the service-role key).

## Release verification

- Run formatting, lint, typecheck, unit, and integration tests.
- Verify RLS using both anonymous and authenticated Supabase clients.
- Verify that one administrator cannot access data outside the authorized scope.
- Verify 50 MiB upload acceptance and rejection above the limit.
- Verify synchronized playback across multiple independent browser sessions.
- Disconnect network access and verify cached media continues playing; reconnect and verify configuration reconciliation.
- Verify production CORS, TLS, and secret isolation.
