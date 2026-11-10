# Production deployment

The production topology uses **one Render Web Service** to host the Fastify API, Angular administration app, and Angular TV player. The two browser applications are served under the same origin:

- Admin: `https://YOUR-SERVICE.onrender.com/admin/`
- Player: `https://YOUR-SERVICE.onrender.com/player/`
- API: `https://YOUR-SERVICE.onrender.com/api/`

The root URL redirects to the admin application.

## Supabase

1. Create a Supabase project in the intended production region.
2. Apply every SQL migration from `supabase/migrations` in order.
3. In **Authentication → Users**, create the initial administrator manually.
4. Follow [initial administrator setup](./initial-admin-setup.md) to insert the administrator profile.
5. Confirm the private `tv-media` Storage bucket exists with a 50 MiB limit and allowed media MIME types. The initial migration creates/configures it.
6. Set the Supabase Auth Site URL to the Render service origin. Add the deployed admin URL to allowed redirect URLs if required by the chosen sign-in flow.
7. Never expose the service-role key to either browser application.

## Render

1. Connect the GitHub repository `Twesty/tv-one` to Render.
2. Use the included `render.yaml` Blueprint, or create a Node.js Web Service with its build and start commands.
3. Configure these secret/environment values in Render:
   - `SUPABASE_URL`
   - `SUPABASE_ANON_KEY`
   - `SUPABASE_SERVICE_ROLE_KEY`
   - `PUBLIC_API_URL` — the service's HTTPS origin, without a trailing slash
   - `CORS_ALLOWED_ORIGINS` — comma-separated origins allowed to call the API from browsers; for the single-origin setup use the service's HTTPS origin
4. Deploy. The build runs `scripts/write-browser-config.mjs` before compiling Angular so the public runtime configuration is included in the service-worker asset hashes. It then builds both Angular applications and the API. The API serves both apps and the API routes from the same Render origin.
5. Verify:
   - `/health/live`
   - `/health/ready`
   - `/admin/`
   - `/player/`

## Runtime environment

The API requires Node.js 22+ and the environment variables listed in `apps/api/.env.example`. Render supplies `PORT`; the API binds to `0.0.0.0`.

The public browser configuration contains only the API origin, Supabase project URL, and Supabase anon key. The service-role key is used exclusively by the API process and is never written into the frontend runtime configuration.

## Release verification

- Run GitHub Actions typecheck and production builds for API, admin, and player.
- Apply all Supabase migrations and verify database functions.
- Verify RLS using anonymous and authenticated Supabase clients.
- Verify admin role enforcement and device secret revocation.
- Verify 50 MiB upload acceptance and rejection above the limit.
- Verify multiple independent players start the same media against one database timestamp.
- Verify Realtime assignment broadcasts and polling fallback.
- Disconnect network access and verify cached media and app shell survive a reload; reconnect and verify configuration reconciliation.
- Verify production CORS, TLS, and secret isolation.

Do not consider the system production-ready until these checks pass against the actual Render and Supabase projects and representative TV browsers.
