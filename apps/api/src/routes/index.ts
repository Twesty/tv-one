import type { FastifyInstance } from 'fastify';
import { authenticateAdmin } from '../auth/admin-auth.js';
import { registerAdminRoutes } from './admin.js';
import { registerAssignmentRoutes } from './assignments.js';
import { registerMediaRoutes } from './media.js';

export async function registerRoutes(app: FastifyInstance): Promise<void> {
  await app.register(
    async (adminApp) => {
      adminApp.addHook('preHandler', authenticateAdmin);
      await registerAdminRoutes(adminApp);
      await registerAssignmentRoutes(adminApp);
      await registerMediaRoutes(adminApp);
    },
    { prefix: '/api/admin' }
  );
}
