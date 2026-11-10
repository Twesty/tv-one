# API endpoints

All endpoints under `/api/admin` require an administrator Supabase access token:

`Authorization: Bearer <access_token>`

The API validates the token with Supabase Auth and checks `admin_profiles.role = 'admin'` before executing the request.

## Venues

- `GET /api/admin/venues`
- `POST /api/admin/venues` — `{ name, description?, isActive? }`
- `GET /api/admin/venues/:venueId`
- `PATCH /api/admin/venues/:venueId`
- `DELETE /api/admin/venues/:venueId` — deactivates the venue without deleting its media or assignment history.

## Devices

- `GET /api/admin/venues/:venueId/devices`
- `POST /api/admin/venues/:venueId/devices` — `{ name }`; returns the pairing secret once.
- `PATCH /api/admin/venues/:venueId/devices/:deviceId` — update the display name.
- `DELETE /api/admin/venues/:venueId/devices/:deviceId` — revokes the device credential.

## Media library

- `GET /api/admin/venues/:venueId/media`
- `POST /api/admin/venues/:venueId/media` — multipart form with one `file` field.
- `DELETE /api/admin/venues/:venueId/media/:mediaId` — deletes an unassigned asset and its private Storage object; assigned media returns `409 MEDIA_IN_USE`.

Uploads are limited to 50 MiB. The API detects the file format from its binary signature rather than trusting the browser-supplied MIME type. Supported formats: JPEG, PNG, WebP, GIF, MP4, WebM and MOV.

## Playback assignments

- `PUT /api/admin/devices/:deviceId/assignment` — assign one device.
- `DELETE /api/admin/devices/:deviceId/assignment`
- `PUT /api/admin/venues/:venueId/assignments` — assign one asset to multiple devices in one operation.

Use the bulk endpoint when several TVs must start the same media together. The database function applies one shared server timestamp to every device assignment in that request and increments each device's revision.

## Health

- `GET /health/live`
- `GET /health/ready`

No endpoint should be considered production-verified until the GitHub Actions checks and live Supabase integration tests pass.

## Public TV player

- `GET /api/player/venues` — active venue directory.
- `GET /api/player/venues/:venueId/devices` — active display directory for a venue.
- `POST /api/player/config` — request the current player configuration using `{ deviceId, pairingSecret }`.

The pairing secret is generated when an administrator creates a device and is returned only once. Store it locally on the TV device; do not put it in a URL. The player configuration endpoint checks the secret hash and device status on every request. Revoking a device immediately prevents further configuration requests.

The response contains the current assignment revision, server timestamp, schedule anchor, and a time-limited signed URL for the private media object. Signed URLs expire after one hour; the player must refresh its configuration before expiry and after reconnecting.
