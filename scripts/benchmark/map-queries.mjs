import Fastify from 'fastify';
import { readFile, writeFile } from 'node:fs/promises';
import { performance } from 'node:perf_hooks';
import assert from 'node:assert/strict';
import { registerApi } from '../../server/api.ts';
import { createPool } from '../../server/db.ts';

const pool = createPool();
if (!pool) throw new Error('Configure a conexão de leitura para executar o benchmark.');
const argument = (flag) => {
  const index = process.argv.indexOf(flag);
  return index >= 0 ? process.argv[index + 1] : undefined;
};
const output = argument('--out'),
  compare = argument('--compare');
const explain = process.argv.includes('--explain'),
  includeResults = process.argv.includes('--results') || !!compare;
const routes = [
  '/api/cargos',
  '/api/mapa/candidatos?cargo=1&eleicao=6257',
  '/api/mapa/calor-locais?cargo=1&eleicao=6257',
  '/api/mapa/indicadores?cargo=1&eleicao=6257',
  '/api/mapa/escala-abstencao?cargo=1&eleicao=6257',
  '/api/mapa/participacao?cargo=1&eleicao=6257',
  '/api/mapa/votacao?cargo=1&eleicao=6257',
  '/api/mapa/nao-nominais?cargo=1&eleicao=6257',
  '/api/mapa/candidatos?cargo=6&eleicao=6259',
  '/api/mapa/votacao?cargo=6&eleicao=6259',
  '/api/mapa/nao-nominais?cargo=6&eleicao=6259',
];
const results = [],
  queries = [],
  app = Fastify();
await registerApi(app, {
  query: async (sql, values) => {
    const start = performance.now(),
      result = await pool.query(sql, values);
    queries.push({ sql, values, milliseconds: performance.now() - start });
    return result;
  },
});
try {
  await pool.query('SELECT 1');
  for (const route of routes) {
    const queryStart = queries.length,
      start = performance.now(),
      response = await app.inject(route),
      milliseconds = performance.now() - start;
    if (response.statusCode !== 200)
      throw new Error(`Consulta falhou: ${route} (${response.statusCode})`);
    const data = response.json(),
      startHit = performance.now();
    await app.inject(route);
    const entry = {
      route,
      milliseconds,
      cacheMilliseconds: performance.now() - startHit,
      queries: queries.slice(queryStart),
      bytes: Buffer.byteLength(response.body),
      ...(includeResults ? { data } : {}),
    };
    results.push(entry);
    console.log(
      JSON.stringify({
        route,
        milliseconds: Math.round(milliseconds),
        cacheMilliseconds: Math.round(entry.cacheMilliseconds),
        sqlMilliseconds: entry.queries.map((query) => Math.round(query.milliseconds)),
        bytes: entry.bytes,
      }),
    );
  }
  if (explain) {
    const unique = [
      ...new Map(
        results.flatMap((result) => result.queries).map((query) => [query.sql, query]),
      ).values(),
    ]
      .sort((a, b) => b.milliseconds - a.milliseconds)
      .slice(0, 3);
    for (const query of unique) {
      const plan = (
        await pool.query('EXPLAIN (ANALYZE, BUFFERS, FORMAT JSON) ' + query.sql, query.values)
      ).rows[0]['QUERY PLAN'][0];
      query.plan = plan;
      const scans = [];
      function visit(node) {
        if (node['Relation Name'])
          scans.push({
            relation: node['Relation Name'],
            type: node['Node Type'],
            rows: node['Actual Rows'],
            loops: node['Actual Loops'],
            removed: node['Rows Removed by Filter'],
          });
        for (const child of node.Plans || []) visit(child);
      }
      visit(plan.Plan);
      console.log(JSON.stringify({ explainMilliseconds: plan['Execution Time'], scans }));
    }
  }
  if (compare) {
    const baseline = JSON.parse(await readFile(compare, 'utf8'));
    const canonical = (value) =>
      Array.isArray(value)
        ? value.map(canonical).sort((a, b) => JSON.stringify(a).localeCompare(JSON.stringify(b)))
        : value && typeof value === 'object'
          ? Object.fromEntries(
              Object.entries(value)
                .sort(([a], [b]) => a.localeCompare(b))
                .map(([key, item]) => [key, canonical(item)]),
            )
          : value;
    for (const result of results) {
      const old = baseline.results.find((item) => item.route === result.route);
      if (old?.data !== undefined)
        assert.deepEqual(canonical(result.data), canonical(old.data), result.route);
    }
    const participation = results.find((item) =>
      item.route.startsWith('/api/mapa/participacao?'),
    ).data;
    const previous = (path) =>
      baseline.results.find((item) => item.route === path + '?cargo=1&eleicao=6257').data;
    assert.deepEqual(
      canonical(participation.municipios),
      canonical(previous('/api/mapa/indicadores')),
    );
    assert.deepEqual(
      canonical(participation.locais.map(({ status, ...row }) => row)),
      canonical(previous('/api/mapa/calor-locais')),
    );
    assert.deepEqual(participation.escala, previous('/api/mapa/escala-abstencao'));
    console.log(
      'Resultados anteriores preservados; consulta unificada equivalente aos três endpoints de comparecimento.',
    );
  }
  if (output && !output.startsWith('--'))
    await writeFile(
      output,
      JSON.stringify({ measuredAt: new Date().toISOString(), results }, null, 2),
    );
} finally {
  await app.close();
  await pool.end();
}
