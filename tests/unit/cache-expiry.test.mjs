import test from 'node:test';
import assert from 'node:assert/strict';
import { setImmediate as nextTick } from 'node:timers/promises';
import Fastify from 'fastify';
import { registerApi } from '../../server/api.ts';

test('requisição após expiração recebe erro se a atualização em andamento falhar, e pode tentar novamente', async () => {
  const originalNow = Date.now;
  let clock = originalNow(),
    reads = 0,
    rejectRefresh;
  Date.now = () => clock;
  const app = Fastify();
  try {
    await registerApi(app, {
      query: async () => {
        reads++;
        if (reads === 2)
          await new Promise((_, reject) => {
            rejectRefresh = reject;
          });
        return { rows: [{ municipio_codigo: '73440', aptos: String(reads) }] };
      },
    });
    const url = '/api/mapa/indicadores';
    assert.equal((await app.inject(url)).json()[0].aptos, '1');
    clock += 61_000;
    assert.equal((await app.inject(url)).json()[0].aptos, '1');
    clock += 240_001;
    let completed = false;
    const expired = app.inject(url).then((response) => {
      completed = true;
      return response;
    });
    await nextTick();
    assert.equal(completed, false);
    assert.equal(reads, 2);
    rejectRefresh(new Error('database unavailable'));
    const response = await expired;
    assert.equal(response.statusCode, 503);
    assert.ok(response.json().message);
    assert.equal((await app.inject(url)).json()[0].aptos, '3');
  } finally {
    Date.now = originalNow;
    await app.close();
  }
});

test('limite de consultas permite compartilhar uma consulta pendente e recusa apenas novas chaves', async () => {
  const app = Fastify();
  let release,
    reads = 0;
  const gate = new Promise((resolve) => {
    release = resolve;
  });
  try {
    await registerApi(app, {
      query: async () => {
        reads++;
        await gate;
        return { rows: [] };
      },
    });
    const first = Array.from({ length: 12 }, (_, index) =>
      app.inject(`/api/mapa/indicadores?cargo=${index + 1}`),
    );
    const work = Promise.all(first);
    await nextTick();
    assert.equal(reads, 12);
    const duplicate = app.inject('/api/mapa/indicadores?cargo=1');
    const shared = Promise.resolve(duplicate);
    const excess = await app.inject('/api/mapa/indicadores?cargo=13');
    assert.equal(excess.statusCode, 503);
    assert.equal(excess.headers['retry-after'], '2');
    assert.equal(reads, 12);
    release();
    assert.ok((await work).every((response) => response.statusCode === 200));
    assert.equal((await shared).statusCode, 200);
    assert.equal((await app.inject('/api/mapa/indicadores?cargo=13')).statusCode, 200);
  } finally {
    release();
    await app.close();
  }
});
