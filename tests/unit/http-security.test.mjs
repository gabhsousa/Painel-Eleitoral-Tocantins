import test from 'node:test';
import assert from 'node:assert/strict';
import { createApp } from '../../server/createApp.ts';

test('proteções HTTP, validação e readiness funcionam sem depender de um banco ou porta aberta', async () => {
  const { app } = await createApp(null);
  try {
    const health = await app.inject('/health');
    assert.equal(health.statusCode, 200);
    assert.ok(health.headers['content-security-policy'].includes("frame-ancestors 'none'"));
    assert.equal(health.headers['x-content-type-options'], 'nosniff');
    assert.ok(health.headers['permissions-policy'].includes('geolocation=()'));
    assert.equal((await app.inject('/ready')).statusCode, 503);
    const status = await app.inject('/api/status');
    assert.equal(status.statusCode, 503);
    assert.equal(status.headers['cache-control'], 'no-store');
    for (const path of [
      '/api/mapa/indicadores?cargo=bad',
      '/api/votos?limite=1000',
      '/api/votos?sql=SELECT%201',
    ]) {
      assert.equal((await app.inject(path)).statusCode, 400, path);
    }
    for (const path of [
      '/api/raw_bu',
      '/.env',
      '/server/index.ts',
      '/database/security-db-audit.json',
    ]) {
      assert.ok([403, 404].includes((await app.inject(path)).statusCode), path);
    }
  } finally {
    await app.close();
  }
});

test('limite por IP ignora X-Forwarded-For arbitrário', async () => {
  const { app } = await createApp(null);
  try {
    let limited = false;
    for (let index = 0; index < 121; index++) {
      const response = await app.inject({
        url: '/api/status',
        headers: { 'x-forwarded-for': `198.51.100.${index}` },
      });
      if (response.statusCode === 429) {
        assert.ok(response.headers['retry-after']);
        limited = true;
        break;
      }
      assert.equal(response.statusCode, 503);
    }
    assert.ok(limited);
    assert.equal((await app.inject('/health')).statusCode, 200);
  } finally {
    await app.close();
  }
});
