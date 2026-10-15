import type { FastifyInstance } from 'fastify';
import type { Pool } from 'pg';
import { QueryCache, QueryCapacityError } from '../cache/QueryCache.js';
import { cacheKey, querySchema } from './filters.js';
import type { Filters } from './filters.js';

export function createRouteContext(app: FastifyInstance, pool: Pool | null) {
  const cache = new QueryCache();
  function route(path: string, handler: (f: Filters) => Promise<unknown>) {
    app.get(path, { schema: { querystring: querySchema } }, async (request, reply) => {
      if (!pool) return reply.code(503).send({ message: 'Conexão com o banco não configurada.' });
      const f = request.query as Filters;
      if (path === '/api/mapa/locais' && !f.municipio)
        return reply
          .code(400)
          .send({ message: 'Selecione um município para consultar os locais no mapa.' });
      if (path === '/api/secoes' && (!f.municipio || !f.zona || !f.local))
        return reply
          .code(400)
          .send({ message: 'Informe município, zona e local para consultar as seções.' });
      for (const key of [
        'cargo',
        'eleicao',
        'candidato',
        'municipio',
        'zona',
        'local',
        'secao',
      ] as const)
        if (f[key]) f[key] = f[key]!.replace(/^0+(?=\d)/, '');
      if (path.includes(':codigo')) {
        if (!f.municipio || !f.zona || !f.eleicao)
          return reply.code(400).send({
            message: 'Informe município, zona e código da eleição para identificar o local.',
          });
        const codigo = (request.params as { codigo: string }).codigo;
        if (!/^\d{1,12}$/.test(codigo))
          return reply.code(400).send({ message: 'Código de local inválido.' });
        f.local = codigo.replace(/^0+(?=\d)/, '');
      }

      try {
        return await cache.get(cacheKey(path, f), () => handler(f), {
          allowStale: path.startsWith('/api/mapa/'),
          onRefreshError: () =>
            request.log.warn('Atualização do mapa temporariamente indisponível'),
        });
      } catch (error) {
        if (error instanceof QueryCapacityError) {
          reply.header('Retry-After', '2');
          return reply
            .code(503)
            .send({ message: 'Consultas em andamento. Tente novamente em instantes.' });
        }
        request.log.error({ code: (error as { code?: string }).code }, 'Consulta eleitoral falhou');
        return reply
          .code(503)
          .send({ message: 'Não foi possível concluir a consulta. Tente novamente.' });
      }
    });
  }
  const rows = async (sql: string, values: unknown[] = []) => {
    if (!pool) throw new Error('Conexão com o banco não configurada.');
    return (await pool.query(sql, values)).rows;
  };
  return { route, rows, cache, pool };
}
export type RouteContext = ReturnType<typeof createRouteContext>;
