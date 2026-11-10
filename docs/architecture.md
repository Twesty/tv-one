# Architecture

## Runtime boundaries

The platform is split into three deployable applications and one shared package:

1. **Admin** is a browser application. It authenticates administrators with Supabase Auth and calls protected API endpoints.
2. **API** is the trusted application boundary. It validates Supabase access tokens, enforces authorization, owns privileged database and Storage operations, and exposes a narrow public device/player API.
3. **Player** is a public browser application for venue displays. A device is paired using a high-entropy device credential; public endpoints expose only the configuration needed by that device.
4. **Shared** contains runtime schemas and TypeScript contracts. It must not contain secrets or server-only modules.

## Synchronization model

A device assignment references a media asset and a playback revision. The API stores a server-generated UTC schedule anchor (`started_at`) and a monotonically increasing configuration revision.

For video playback, clients estimate server clock offset using an API time endpoint and calculate the expected media position from the shared anchor and duration. Clients seek toward that position within a bounded correction policy rather than independently starting the video on page load. Repeating media uses modulo duration. Images use a server-defined display interval and the same schedule anchor.

Configuration changes are committed in PostgreSQL and broadcast through Supabase Realtime. Realtime is an acceleration path, not the source of truth: players re-fetch their configuration after reconnect and periodically reconcile their revision.

## Offline behavior

The player downloads assigned media into browser-managed persistent storage (IndexedDB metadata plus Cache API/Blob storage where supported), verifies size and content metadata, and only marks an asset available after a complete download. It continues the last known assignment while offline. On reconnect it refreshes credentials/configuration and reconciles the latest revision.

Browser storage is best-effort and can be evicted by the operating system or browser. The UI must expose cache status and recover by downloading the asset again when connectivity returns. A web application cannot guarantee playback after the browser clears its storage or the device loses power.

## Security boundaries

- Supabase Auth authenticates administrators.
- API verifies JWT signature/issuer/audience and checks authorization for every administrative operation.
- Supabase service-role credentials remain server-side and are never returned to a browser.
- RLS is enabled for all application tables. Public clients receive no direct access to administrative tables.
- Player pairing credentials are generated with cryptographically secure randomness, stored hashed, and scoped to one device. Revocation is supported.
- Public player responses contain only the paired device's current assignment and necessary media metadata.
- Uploads are validated server-side for MIME type, extension, actual size, and media metadata. The application limit is 50 MiB; Storage policies also enforce the configured limit.
- CORS uses an explicit production origin allowlist from environment configuration.

## Data model (planned)

- `venues`: establishments.
- `media_assets`: uploaded image/video metadata and Storage object key.
- `devices`: TV devices, venue ownership, pairing credential hash, and status.
- `device_assignments`: current asset, revision, schedule anchor, and image duration.
- `admin_profiles`: administrator role/profile linked to `auth.users`.

All timestamps are UTC `timestamptz`. Foreign keys and constraints enforce tenant ownership and valid assignments.
