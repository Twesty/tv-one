import { createHash, timingSafeEqual } from 'node:crypto';
import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { supabaseAdmin } from '../config/supabase.js';

const credentialSchema = z.object({
  deviceId: z.string().uuid(),
  pairingSecret: z.string().min(32).max(128)
}).strict();

function hashSecret(secret: string): Buffer {
  return createHash('sha256').update(secret).digest();
}

function secretsMatch(provided: string, storedHash: string): boolean {
  const expected = Buffer.from(storedHash, 'hex');
  const actual = hashSecret(provided);
  return expected.length === actual.length && timingSafeEqual(expected, actual);
}

export async function registerPlayerRoutes(app: FastifyInstance): Promise<void> {
  app.get('/venues', async (_request, reply) => {
    const { data, error } = await supabaseAdmin
      .from('venues')
      .select('id, name')
      .eq('is_active', true)
      .order('name', { ascending: true });

    if (error) {
      app.log.error({ err: error }, 'Public venue list failed');
      return reply.code(503).send({ error: 'PLAYER_DIRECTORY_UNAVAILABLE' });
    }

    return { data };
  });

  app.get('/venues/:venueId/devices', async (request, reply) => {
    const { venueId } = request.params as { venueId: string };
    const parsedId = z.string().uuid().safeParse(venueId);
    if (!parsedId.success) {
      return reply.code(400).send({ error: 'INVALID_VENUE_ID' });
    }

    const { data, error } = await supabaseAdmin
      .from('devices')
      .select('id, name')
      .eq('venue_id', parsedId.data)
      .eq('status', 'active')
      .order('name', { ascending: true });

    if (error) {
      app.log.error({ err: error }, 'Public device list failed');
      return reply.code(503).send({ error: 'PLAYER_DIRECTORY_UNAVAILABLE' });
    }

    return { data };
  });

  app.post('/config', async (request, reply) => {
    const parsed = credentialSchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.code(400).send({
        error: 'VALIDATION_ERROR',
        details: parsed.error.flatten()
      });
    }

    const { data: device, error: deviceError } = await supabaseAdmin
      .from('devices')
      .select('id, venue_id, name, status, pairing_secret_hash')
      .eq('id', parsed.data.deviceId)
      .maybeSingle();

    if (deviceError) {
      app.log.error({ err: deviceError }, 'Player device lookup failed');
      return reply.code(503).send({ error: 'PLAYER_CONFIG_UNAVAILABLE' });
    }

    if (
      !device ||
      device.status !== 'active' ||
      !secretsMatch(parsed.data.pairingSecret, device.pairing_secret_hash)
    ) {
      return reply.code(401).send({ error: 'INVALID_DEVICE_CREDENTIALS' });
    }

    const { data: assignment, error: assignmentError } = await supabaseAdmin
      .from('device_assignments')
      .select('media_asset_id, revision, started_at, image_duration_ms')
      .eq('device_id', device.id)
      .maybeSingle();

    if (assignmentError) {
      app.log.error({ err: assignmentError }, 'Player assignment lookup failed');
      return reply.code(503).send({ error: 'PLAYER_CONFIG_UNAVAILABLE' });
    }

    const { data: serverClock, error: clockError } = await supabaseAdmin.rpc('get_server_time');
    if (clockError || !serverClock) {
      app.log.error({ err: clockError }, 'Database clock lookup failed');
      return reply.code(503).send({ error: 'PLAYER_CLOCK_UNAVAILABLE' });
    }
    const serverTime = new Date(serverClock).toISOString();

    await supabaseAdmin
      .from('devices')
      .update({ last_seen_at: serverTime })
      .eq('id', device.id);

    if (!assignment) {
      return {
        serverTime,
        device: { id: device.id, name: device.name, venueId: device.venue_id },
        assignment: null
      };
    }

    const { data: asset, error: assetError } = await supabaseAdmin
      .from('media_assets')
      .select('id, kind, mime_type, size_bytes, duration_ms, width, height, storage_path')
      .eq('id', assignment.media_asset_id)
      .eq('venue_id', device.venue_id)
      .eq('status', 'ready')
      .maybeSingle();

    if (assetError) {
      app.log.error({ err: assetError }, 'Player media lookup failed');
      return reply.code(503).send({ error: 'PLAYER_CONFIG_UNAVAILABLE' });
    }

    if (!asset) {
      return {
        serverTime,
        device: { id: device.id, name: device.name, venueId: device.venue_id },
        assignment: null
      };
    }

    const { data: signed, error: signedUrlError } = await supabaseAdmin.storage
      .from('tv-media')
      .createSignedUrl(asset.storage_path, 60 * 60);

    if (signedUrlError || !signed) {
      app.log.error({ err: signedUrlError }, 'Player media URL signing failed');
      return reply.code(503).send({ error: 'PLAYER_MEDIA_UNAVAILABLE' });
    }

    return {
      serverTime,
      device: { id: device.id, name: device.name, venueId: device.venue_id },
      assignment: {
        revision: assignment.revision,
        startedAt: assignment.started_at,
        imageDurationMs: assignment.image_duration_ms,
        media: {
          id: asset.id,
          kind: asset.kind,
          mimeType: asset.mime_type,
          sizeBytes: asset.size_bytes,
          durationMs: asset.duration_ms,
          width: asset.width,
          height: asset.height,
          url: signed.signedUrl,
          urlExpiresAt: new Date(Date.parse(serverTime) + 60 * 60 * 1000).toISOString()
        }
      }
    };
  });
}
