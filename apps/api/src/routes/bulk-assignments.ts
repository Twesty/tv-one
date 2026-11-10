import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { supabaseAdmin } from '../config/supabase.js';
import { publishAssignmentUpdates } from '../realtime/assignment-broadcast.js';

const bulkAssignmentSchema = z.object({
  deviceIds: z.array(z.string().uuid()).min(1).max(100),
  mediaAssetId: z.string().uuid(),
  imageDurationMs: z.number().int().min(1000).max(3600000).default(10000)
}).strict().refine(
  (value) => new Set(value.deviceIds).size === value.deviceIds.length,
  'Device IDs must be unique.'
);

export async function registerBulkAssignmentRoutes(app: FastifyInstance): Promise<void> {
  app.put('/venues/:venueId/assignments', async (request, reply) => {
    const { venueId } = request.params as { venueId: string };
    const parsedVenueId = z.string().uuid().safeParse(venueId);
    if (!parsedVenueId.success) {
      return reply.code(400).send({ error: 'INVALID_VENUE_ID' });
    }

    const parsed = bulkAssignmentSchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.code(400).send({
        error: 'VALIDATION_ERROR',
        details: parsed.error.flatten()
      });
    }

    const { data, error } = await supabaseAdmin.rpc('assign_media_to_devices', {
      p_venue_id: parsedVenueId.data,
      p_device_ids: parsed.data.deviceIds,
      p_media_asset_id: parsed.data.mediaAssetId,
      p_image_duration_ms: parsed.data.imageDurationMs
    });

    if (error) {
      if (error.code === 'P0002') {
        return reply.code(404).send({ error: 'ACTIVE_DEVICE_NOT_FOUND' });
      }
      if (error.code === '23503') {
        return reply.code(409).send({
          error: 'MEDIA_NOT_AVAILABLE',
          message: 'The media asset must be ready and belong to the same venue.'
        });
      }
      if (error.code === '22023') {
        return reply.code(400).send({ error: 'INVALID_ASSIGNMENT_PARAMETERS' });
      }

      app.log.error({ err: error }, 'Bulk device assignment failed');
      return reply.code(500).send({ error: 'BULK_ASSIGNMENT_FAILED' });
    }

    await publishAssignmentUpdates(parsed.data.deviceIds);
    return { data };
  });
}
