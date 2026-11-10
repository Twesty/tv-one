import { randomUUID } from 'node:crypto';
import type { FastifyInstance } from 'fastify';
import { fileTypeFromBuffer } from 'file-type';
import { z } from 'zod';
import { supabaseAdmin } from '../config/supabase.js';

const MAX_MEDIA_BYTES = 50 * 1024 * 1024;
const allowedTypes = new Map([
  ['image/jpeg', { kind: 'image', extension: 'jpg' }],
  ['image/png', { kind: 'image', extension: 'png' }],
  ['image/webp', { kind: 'image', extension: 'webp' }],
  ['image/gif', { kind: 'image', extension: 'gif' }],
  ['video/mp4', { kind: 'video', extension: 'mp4' }],
  ['video/webm', { kind: 'video', extension: 'webm' }],
  ['video/quicktime', { kind: 'video', extension: 'mov' }]
] as const);

export async function registerMediaRoutes(app: FastifyInstance): Promise<void> {
  app.get('/venues/:venueId/media', async (request, reply) => {
    const { venueId } = request.params as { venueId: string };
    const parsedId = z.string().uuid().safeParse(venueId);
    if (!parsedId.success) {
      return reply.code(400).send({ error: 'INVALID_VENUE_ID' });
    }

    const { data, error } = await supabaseAdmin
      .from('media_assets')
      .select('id, venue_id, kind, status, original_name, mime_type, size_bytes, duration_ms, width, height, created_at, updated_at')
      .eq('venue_id', parsedId.data)
      .order('created_at', { ascending: false });

    if (error) {
      app.log.error({ err: error }, 'Media listing failed');
      return reply.code(500).send({ error: 'MEDIA_LIST_FAILED' });
    }

    return { data };
  });

  app.post('/venues/:venueId/media', async (request, reply) => {
    const { venueId } = request.params as { venueId: string };
    const parsedId = z.string().uuid().safeParse(venueId);
    if (!parsedId.success) {
      return reply.code(400).send({ error: 'INVALID_VENUE_ID' });
    }

    const { data: venue, error: venueError } = await supabaseAdmin
      .from('venues')
      .select('id')
      .eq('id', parsedId.data)
      .maybeSingle();

    if (venueError) {
      app.log.error({ err: venueError }, 'Venue verification failed for media upload');
      return reply.code(500).send({ error: 'VENUE_LOOKUP_FAILED' });
    }
    if (!venue) return reply.code(404).send({ error: 'VENUE_NOT_FOUND' });

    let part;
    try {
      part = await request.file({
        limits: {
          files: 1,
          fields: 0,
          fileSize: MAX_MEDIA_BYTES
        }
      });
    } catch {
      return reply.code(400).send({ error: 'INVALID_MULTIPART_REQUEST' });
    }

    if (!part) {
      return reply.code(400).send({ error: 'MEDIA_FILE_REQUIRED' });
    }

    let buffer: Buffer;
    try {
      buffer = await part.toBuffer();
    } catch {
      return reply.code(413).send({
        error: 'MEDIA_FILE_TOO_LARGE',
        message: 'The maximum media file size is 50 MiB.'
      });
    }

    if (part.file.truncated || buffer.byteLength === 0 || buffer.byteLength > MAX_MEDIA_BYTES) {
      return reply.code(413).send({
        error: 'MEDIA_FILE_TOO_LARGE_OR_EMPTY',
        message: 'The media file must be non-empty and no larger than 50 MiB.'
      });
    }

    const detected = await fileTypeFromBuffer(buffer);
    const accepted = detected ? allowedTypes.get(detected.mime) : undefined;

    if (!detected || !accepted) {
      return reply.code(415).send({
        error: 'UNSUPPORTED_MEDIA_TYPE',
        message: 'Supported formats: JPEG, PNG, WebP, GIF, MP4, WebM and MOV.'
      });
    }

    const storagePath = `${parsedId.data}/${randomUUID()}.${accepted.extension}`;
    const { error: storageError } = await supabaseAdmin.storage
      .from('tv-media')
      .upload(storagePath, buffer, {
        contentType: detected.mime,
        cacheControl: '31536000',
        upsert: false
      });

    if (storageError) {
      request.log.error({ err: storageError }, 'Media Storage upload failed');
      return reply.code(502).send({ error: 'MEDIA_STORAGE_UPLOAD_FAILED' });
    }

    const originalName = part.filename
      .replace(/[\/\\\x00-\x1f]/g, '_')
      .slice(0, 255) || `media.${accepted.extension}`;

    const { data, error: insertError } = await supabaseAdmin
      .from('media_assets')
      .insert({
        venue_id: parsedId.data,
        kind: accepted.kind,
        status: 'ready',
        original_name: originalName,
        storage_path: storagePath,
        mime_type: detected.mime,
        size_bytes: buffer.byteLength
      })
      .select('id, venue_id, kind, status, original_name, mime_type, size_bytes, created_at')
      .single();

    if (insertError) {
      const { error: cleanupError } = await supabaseAdmin.storage
        .from('tv-media')
        .remove([storagePath]);

      request.log.error({ err: insertError }, 'Media metadata insert failed');
      if (cleanupError) {
        request.log.error({ err: cleanupError, storagePath }, 'Orphaned media cleanup failed');
      }
      return reply.code(500).send({ error: 'MEDIA_METADATA_CREATE_FAILED' });
    }

    return reply.code(201).send({ data });
  });
}
