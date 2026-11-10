import type { FastifyInstance } from 'fastify';
import { registerAdminRoutes } from './admin.js';

export async function registerRoutes(app: FastifyInstance): Promise<void> {
  await app.register(
    async (adminApp) => registerAdminRoutes(adminApp),
    { prefix: '/api/admin' }
  );
}
