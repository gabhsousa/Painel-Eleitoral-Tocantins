import type { FastifyInstance } from 'fastify';
import type { Pool } from 'pg';
import { createRouteContext } from './http/cachedRoutes.js';
import { registerExplorerRoutes } from './routes/explorer.js';
import { registerMapRoutes } from './routes/maps.js';

export async function registerApi(app: FastifyInstance, pool: Pool | null) {
  const context = createRouteContext(app, pool);
  registerExplorerRoutes(context);
  return registerMapRoutes(context);
}
