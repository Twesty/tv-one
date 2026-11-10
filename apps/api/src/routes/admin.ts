import { createHash, randomBytes } from 'node:crypto';
import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { supabaseAdmin } from '../config/supabase.js';

const idSchema = z.string().uuid();
const venueCreateSchema = z.object({
  name: z.string().trim().min(1).max(120),
  description: z.string().trim().max(2000).nullable().optional(),
  isActive: z.boolean().optional()
}).strict();

const venueUpdateSchema = venueCreateSchema.partial().refine(
  (value) => Object.keys(value).length > 0,
  'At least one field must be provided.'
);

const deviceCreateSchema = z.object({
  name: z.string().trim().min(1).max(80)
}).strict();

const deviceUpdateSchema = deviceCreateSchema;

function parseId(value: string): string | null {
  const parsed = idSchema.safeParse(value);
  return parsed.success ? parsed.data : null;
}

export async function registerAdminRoutes(app: FastifyInstance): Promise<void> {
  app.get('/venues', async (_request, reply) => {
    const { data, error } = await supabaseAdmin
      .from('venues')
      .select('id, name, description, is_active, created_at, updated_at')
      .eq('is_active', true)
      .order('created_at', { ascending: false });

    if (error) {
      app.log.error({ err: error }, 'Venue listing failed');
      return reply.code(500).send({ error: 'VENUE_LIST_FAILED' });
    }

    return { data };
  });

  app.post('/venues', async (request, reply) => {
    const parsed = venueCreateSchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.code(400).send({
        error: 'VALIDATION_ERROR',
        details: parsed.error.flatten()
      });
    }

    const { data, error } = await supabaseAdmin
      .from('venues')
      .insert({
        name: parsed.data.name,
        description: parsed.data.description ?? null,
        is_active: parsed.data.isActive ?? true,
        created_by: request.adminUser?.id ?? null
      })
      .select('id, name, description, is_active, created_at, updated_at')
      .single();

    if (error) {
      app.log.error({ err: error }, 'Venue creation failed');
      return reply.code(500).send({ error: 'VENUE_CREATE_FAILED' });
    }

    return reply.code(201).send({ data });
  });

  app.get('/venues/:venueId', async (request, reply) => {
    const { venueId } = request.params as { venueId: string };
    const id = parseId(venueId);
    if (!id) return reply.code(400).send({ error: 'INVALID_VENUE_ID' });

    const { data, error } = await supabaseAdmin
      .from('venues')
      .select('id, name, description, is_active, created_at, updated_at')
      .eq('id', id)
      .maybeSingle();

    if (error) {
      app.log.error({ err: error }, 'Venue lookup failed');
      return reply.code(500).send({ error: 'VENUE_LOOKUP_FAILED' });
    }
    if (!data) return reply.code(404).send({ error: 'VENUE_NOT_FOUND' });

    return { data };
  });

  app.patch('/venues/:venueId', async (request, reply) => {
    const { venueId } = request.params as { venueId: string };
    const id = parseId(venueId);
    if (!id) return reply.code(400).send({ error: 'INVALID_VENUE_ID' });

    const parsed = venueUpdateSchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.code(400).send({
        error: 'VALIDATION_ERROR',
        details: parsed.error.flatten()
      });
    }

    const update: {
      name?: string;
      description?: string | null;
      is_active?: boolean;
    } = {};
    if (parsed.data.name !== undefined) update.name = parsed.data.name;
    if (parsed.data.description !== undefined) update.description = parsed.data.description;
    if (parsed.data.isActive !== undefined) update.is_active = parsed.data.isActive;

    const { data, error } = await supabaseAdmin
      .from('venues')
      .update(update)
      .eq('id', id)
      .select('id, name, description, is_active, created_at, updated_at')
      .maybeSingle();

    if (error) {
      app.log.error({ err: error }, 'Venue update failed');
      return reply.code(500).send({ error: 'VENUE_UPDATE_FAILED' });
    }
    if (!data) return reply.code(404).send({ error: 'VENUE_NOT_FOUND' });

    return { data };
  });

  app.delete('/venues/:venueId', async (request, reply) => {
    const { venueId } = request.params as { venueId: string };
    const id = parseId(venueId);
    if (!id) return reply.code(400).send({ error: 'INVALID_VENUE_ID' });

    // Deactivation preserves media and assignment history for audit/recovery.
    const { data, error } = await supabaseAdmin
      .from('venues')
      .update({ is_active: false })
      .eq('id', id)
      .select('id')
      .maybeSingle();

    if (error) {
      app.log.error({ err: error }, 'Venue deactivation failed');
      return reply.code(500).send({ error: 'VENUE_DEACTIVATE_FAILED' });
    }
    if (!data) return reply.code(404).send({ error: 'VENUE_NOT_FOUND' });

    return reply.code(204).send();
  });

  app.get('/venues/:venueId/devices', async (request, reply) => {
    const { venueId } = request.params as { venueId: string };
    const id = parseId(venueId);
    if (!id) return reply.code(400).send({ error: 'INVALID_VENUE_ID' });

    const { data, error } = await supabaseAdmin
      .from('devices')
      .select('id, venue_id, name, status, last_seen_at, created_at, updated_at, device_assignments(media_asset_id, revision, started_at, image_duration_ms)')
      .eq('venue_id', id)
      .order('created_at', { ascending: true });

    if (error) {
      app.log.error({ err: error }, 'Device listing failed');
      return reply.code(500).send({ error: 'DEVICE_LIST_FAILED' });
    }

    return { data };
  });

  app.post('/venues/:venueId/devices', async (request, reply) => {
    const { venueId } = request.params as { venueId: string };
    const id = parseId(venueId);
    if (!id) return reply.code(400).send({ error: 'INVALID_VENUE_ID' });

    const parsed = deviceCreateSchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.code(400).send({
        error: 'VALIDATION_ERROR',
        details: parsed.error.flatten()
      });
    }

    const { data: venue, error: venueError } = await supabaseAdmin
      .from('venues')
      .select('id')
      .eq('id', id)
      .maybeSingle();

    if (venueError) {
      app.log.error({ err: venueError }, 'Venue verification failed');
      return reply.code(500).send({ error: 'VENUE_LOOKUP_FAILED' });
    }
    if (!venue) return reply.code(404).send({ error: 'VENUE_NOT_FOUND' });

    const pairingSecret = randomBytes(32).toString('base64url');
    const pairingSecretHash = createHash('sha256').update(pairingSecret).digest('hex');

    const { data, error } = await supabaseAdmin
      .from('devices')
      .insert({
        venue_id: id,
        name: parsed.data.name,
        pairing_secret_hash: pairingSecretHash
      })
      .select('id, venue_id, name, status, last_seen_at, created_at, updated_at')
      .single();

    if (error) {
      app.log.error({ err: error }, 'Device creation failed');
      return reply.code(500).send({ error: 'DEVICE_CREATE_FAILED' });
    }

    // The plaintext secret is returned only once and is never persisted.
    return reply.code(201).send({
      data: {
        ...data,
        pairingSecret
      }
    });
  });

  app.patch('/venues/:venueId/devices/:deviceId', async (request, reply) => {
    const { venueId, deviceId } = request.params as {
      venueId: string;
      deviceId: string;
    };
    const venue = parseId(venueId);
    const device = parseId(deviceId);
    if (!venue || !device) {
      return reply.code(400).send({ error: 'INVALID_RESOURCE_ID' });
    }

    const parsed = deviceUpdateSchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.code(400).send({
        error: 'VALIDATION_ERROR',
        details: parsed.error.flatten()
      });
    }

    const { data, error } = await supabaseAdmin
      .from('devices')
      .update({ name: parsed.data.name })
      .eq('id', device)
      .eq('venue_id', venue)
      .select('id, venue_id, name, status, last_seen_at, created_at, updated_at')
      .maybeSingle();

    if (error) {
      app.log.error({ err: error }, 'Device update failed');
      return reply.code(500).send({ error: 'DEVICE_UPDATE_FAILED' });
    }
    if (!data) return reply.code(404).send({ error: 'DEVICE_NOT_FOUND' });

    return { data };
  });

  app.delete('/venues/:venueId/devices/:deviceId', async (request, reply) => {
    const { venueId, deviceId } = request.params as {
      venueId: string;
      deviceId: string;
    };
    const venue = parseId(venueId);
    const device = parseId(deviceId);
    if (!venue || !device) {
      return reply.code(400).send({ error: 'INVALID_RESOURCE_ID' });
    }

    const { data, error } = await supabaseAdmin
      .from('devices')
      .update({ status: 'revoked' })
      .eq('id', device)
      .eq('venue_id', venue)
      .select('id, status')
      .maybeSingle();

    if (error) {
      app.log.error({ err: error }, 'Device revocation failed');
      return reply.code(500).send({ error: 'DEVICE_REVOKE_FAILED' });
    }
    if (!data) return reply.code(404).send({ error: 'DEVICE_NOT_FOUND' });

    return { data };
  });
}
