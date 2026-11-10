import Fastify, { type FastifyInstance } from 'fastify';
import cors from '@fastify/cors';
import helmet from '@fastify/helmet';
import rateLimit from '@fastify/rate-limit';
import { env } from './config/env.js';
import { supabaseAdmin } from './config/supabase.js';

export async function buildApp(): Promise<FastifyInstance> {
  const app = Fastify({
    logger: {
      level: env.NODE_ENV === 'production' ? 'info' : 'debug',
      redact: [
        'req.headers.authorization',
        'req.headers.cookie',
        'res.headers["set-cookie"]'
      ]
    },
    trustProxy: true,
    bodyLimit: 1_048_576
  });

  await app.register(helmet, {
    contentSecurityPolicy: false
  });

  await app.register(cors, {
    credentials: true,
    origin(origin, callback) {
      // Requests without Origin are non-browser clients and still undergo
      // authentication/authorization at the route boundary.
      if (!origin || env.corsAllowedOrigins.includes(origin.replace(/\/$/, ''))) {
        callback(null, true);
        return;
      }

      callback(new Error('Origin is not allowed by CORS.'), false);
    }
  });

  await app.register(rateLimit, {
    max: 120,
    timeWindow: '1 minute'
  });

  app.get('/health/live', async () => ({
    status: 'ok',
    service: 'tv-one-api'
  }));

  app.get('/health/ready', async (_request, reply) => {
    const { error } = await supabaseAdmin
      .from('venues')
      .select('id')
      .limit(1);

    if (error) {
      app.log.error({ err: error }, 'Supabase readiness check failed');
      return reply.code(503).send({
        status: 'unavailable',
        dependency: 'supabase'
      });
    }

    return {
      status: 'ready',
      service: 'tv-one-api'
    };
  });

  app.setErrorHandler((error, request, reply) => {
    request.log.error({ err: error }, 'Unhandled request error');

    if (error.validation) {
      return reply.code(400).send({
        error: 'VALIDATION_ERROR',
        message: 'The request payload is invalid.'
      });
    }

    if (error.message === 'Origin is not allowed by CORS.') {
      return reply.code(403).send({
        error: 'ORIGIN_NOT_ALLOWED',
        message: 'This origin is not allowed.'
      });
    }

    return reply.code(500).send({
      error: 'INTERNAL_SERVER_ERROR',
      message: 'An unexpected error occurred.'
    });
  });

  return app;
}
