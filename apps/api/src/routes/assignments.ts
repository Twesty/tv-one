import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { supabaseAdmin } from '../config/supabase.js';
import { publishAssignmentUpdates } from '../realtime/assignment-broadcast.js';

const assignmentSchema = z.object({
  mediaAssetId: z.string().uuid(),
  imageDurationMs: z.number().int().min(1000).max(3600000).default(10000)
}).strict();

export async function registerAssignmentRoutes(app: FastifyInstance): Promise<void> {
  app.put('/devices/:deviceId/assignment', async (request, reply) => {
    const { deviceId } = request.params as { deviceId: string };
    const parsedId = z.string().uuid().safeParse(deviceId);
    if (!parsedId.success) {
      return reply.code(400).send({ error: 'INVALID_DEVICE_ID' });
    }

    const parsed = assignmentSchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.code(400).send({
        error: 'VALIDATION_ERROR',
        details: parsed.error.flatten()
      });
    }

    const { data, error } = await supabaseAdmin.rpc('assign_media_to_device', {
      p_device_id: parsedId.data,
      p_media_asset_id: parsed.data.mediaAssetId,
      p_image_duration_ms: parsed.data.imageDurationMs
    });

    if (error) {
      if (error.code === 'P0002') {
        return reply.code(404).send({ error: 'DEVICE_NOT_FOUND' });
      }
      if (error.code === '23503') {
        return reply.code(409).send({
          error: 'MEDIA_NOT_AVAILABLE',
          message: 'The media asset must be ready and belong to the same venue as the device.'
        });
      }
      if (error.code === '22023') {
        return reply.code(400).send({ error: 'INVALID_IMAGE_DURATION' });
      }

      app.log.error({ err: error }, 'Device assignment failed');
      return reply.code(500).send({ error: 'ASSIGNMENT_FAILED' });
    }

    await publishAssignmentUpdates([parsedId.data]);
    return { data };
  });

  app.delete('/devices/:deviceId/assignment', async (request, reply) => {
    const { deviceId } = request.params as { deviceId: string };
    const parsedId = z.string().uuid().safeParse(deviceId);
    if (!parsedId.success) {
      return reply.code(400).send({ error: 'INVALID_DEVICE_ID' });
    }

    const { data, error } = await supabaseAdmin
      .from('device_assignments')
      .delete()
      .eq('device_id', parsedId.data)
      .select('device_id')
      .maybeSingle();

    if (error) {
      app.log.error({ err: error }, 'Device assignment removal failed');
      return reply.code(500).send({ error: 'ASSIGNMENT_REMOVE_FAILED' });
    }
    if (!data) return reply.code(404).send({ error: 'ASSIGNMENT_NOT_FOUND' });
    await publishAssignmentUpdates([parsedId.data]);

    return reply.code(204).send();
  });
}
