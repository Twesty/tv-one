import Fastify, { type FastifyInstance } from 'fastify';
import fastifyStatic from '@fastify/static';
import { resolve } from 'node:path';
import { access, readFile } from 'node:fs/promises';
import cors from '@fastify/cors';
import helmet from '@fastify/helmet';
import rateLimit from '@fastify/rate-limit';
import multipart from '@fastify/multipart';
import { env } from './config/env.js';
import { supabaseAdmin } from './config/supabase.js';
import { registerRoutes } from './routes/index.js';

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

  app.decorateRequest('adminUser', null);


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

  await app.register(multipart, {
    limits: {
      fileSize: 50 * 1024 * 1024,
      files: 1,
      fields: 0
    }
  });

  await app.register(rateLimit, {
    max: 600,
    timeWindow: '1 minute'
  });

  const adminRoot = resolve(process.cwd(), '../admin/dist/admin/browser');
  const playerRoot = resolve(process.cwd(), '../player/dist/player/browser');

  // Fail startup rather than silently serving an API without its browser apps.
  await Promise.all([
    access(resolve(adminRoot, 'index.html')),
    access(resolve(playerRoot, 'index.html')),
    access(resolve(adminRoot, 'assets/runtime-config.js')),
    access(resolve(playerRoot, 'assets/runtime-config.js'))
  ]);

  await app.register(fastifyStatic, {
    root: adminRoot,
    prefix: '/admin/',
    index: ['index.html'],
    wildcard: false,
    decorateReply: false,
    maxAge: '1y',
    setHeaders(response, filePath) {
      if (['index.html', 'runtime-config.js', 'ngsw-worker.js', 'ngsw.json', 'safety-worker.js'].some((name) => filePath.endsWith(name))) {
        response.setHeader('Cache-Control', 'no-store');
      } else {
        response.setHeader('Cache-Control', 'public, max-age=31536000, immutable');
      }
    }
  });

  await app.register(fastifyStatic, {
    root: playerRoot,
    prefix: '/player/',
    index: ['index.html'],
    wildcard: false,
    decorateReply: false,
    maxAge: '1y',
    setHeaders(response, filePath) {
      if (['index.html', 'runtime-config.js', 'ngsw-worker.js', 'ngsw.json', 'safety-worker.js'].some((name) => filePath.endsWith(name))) {
        response.setHeader('Cache-Control', 'no-store');
      } else {
        response.setHeader('Cache-Control', 'public, max-age=31536000, immutable');
      }
    }
  });

  app.get('/', async (_request, reply) => reply.redirect('/admin/'));
  app.get('/admin', async (_request, reply) => reply.redirect('/admin/'));
  app.get('/player', async (_request, reply) => reply.redirect('/player/'));
  app.get('/admin/*', async (request, reply) => {
    if ((request.url.split('?')[0] ?? '').includes('.')) {
      return reply.code(404).send({ error: 'NOT_FOUND' });
    }
    return reply
      .header('Cache-Control', 'no-store')
      .type('text/html')
      .send(await readFile(resolve(adminRoot, 'index.html')));
  });

  app.get('/player/*', async (request, reply) => {
    if ((request.url.split('?')[0] ?? '').includes('.')) {
      return reply.code(404).send({ error: 'NOT_FOUND' });
    }
    return reply
      .header('Cache-Control', 'no-store')
      .type('text/html')
      .send(await readFile(resolve(playerRoot, 'index.html')));
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

  await registerRoutes(app);

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
