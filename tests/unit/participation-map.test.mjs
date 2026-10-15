import test from 'node:test';
import assert from 'node:assert/strict';
import { setImmediate as nextTick } from 'node:timers/promises';
import Fastify from 'fastify';
import { registerApi } from '../../server/api.ts';

const records = [
  {
    nivel: 'municipio',
    municipio_codigo: '73440',
    aptos: '200',
    comparecimento: '150',
    abstencoes: '50',
    percentual_abstencao: '25.00',
    percentual_comparecimento: '75.00',
  },
  {
    nivel: 'local',
    municipio_codigo: '73440',
    zona: '29',
    local_codigo: '1015',
    local_nome: 'Escola com coordenadas',
    latitudes: ['-10.2'],
    longitudes: ['-48.3'],
    aptos: '100',
    comparecimento: '80',
    abstencoes: '20',
    percentual_abstencao: '20.00',
  },
  {
    nivel: 'local',
    municipio_codigo: '73440',
    zona: '29',
    local_codigo: '1031',
    local_nome: 'Escola sem coordenadas',
    latitudes: [null],
    longitudes: [null],
    aptos: '100',
    comparecimento: '70',
    abstencoes: '30',
    percentual_abstencao: '30.00',
  },
  {
    nivel: 'local',
    municipio_codigo: '73440',
    zona: '29',
    local_codigo: null,
    latitudes: null,
    longitudes: null,
    aptos: '0',
    comparecimento: '0',
    abstencoes: '0',
    percentual_abstencao: null,
  },
  {
    nivel: 'escala',
    locais: '2',
    minimo: '20.00',
    media: '25.00',
    maximo: '30.00',
    media_ponderada: '25.00',
  },
];
test('uma consulta reúne totais, pontos e escala sem remover locais sem coordenadas dos totais', async () => {
  const calls = [],
    app = Fastify();
  try {
    await registerApi(app, {
      query: async (sql, values) => {
        calls.push({ sql, values });
        return { rows: records };
      },
    });
    const url = '/api/mapa/participacao?cargo=1&eleicao=6257';
    const [a, b] = await Promise.all([
      app.inject(url),
      app.inject(url + '&municipio=73440&pagina=2'),
    ]);
    assert.equal(a.statusCode, 200);
    assert.deepEqual(b.json(), a.json());
    assert.equal(calls.length, 1);
    assert.deepEqual(calls[0].values, [2026, 1, '1', '6257', 2026, 1]);
    const data = a.json();
    assert.equal(data.municipios[0].aptos, '200');
    assert.equal(data.municipios[0].abstencoes, '50');
    assert.equal(data.locais.length, 1);
    assert.equal(data.locais[0].local_codigo, '1015');
    assert.equal(data.escala.locais, '2');
    assert.equal(data.escala.maximo, '30.00');
    assert.equal(calls[0].sql.split('FROM eleicoes_to.comparecimento_identificado').length - 1, 1);
    await app.inject('/api/mapa/participacao?cargo=3&eleicao=6259');
    assert.equal(calls.length, 2);
    assert.equal((await app.inject('/api/mapa/participacao?cargo=bad')).statusCode, 400);
    assert.equal(calls.length, 2);
  } finally {
    await app.close();
  }
});
test('mapas atualizam cache em segundo plano, com deduplicação e limite de idade de cinco minutos', async () => {
  const originalNow = Date.now;
  let clock = originalNow(),
    reads = 0,
    release,
    blocked = false,
    fail = false;
  Date.now = () => clock;
  const app = Fastify();
  try {
    await registerApi(app, {
      query: async () => {
        reads++;
        if (blocked)
          await new Promise((resolve) => {
            release = resolve;
          });
        if (fail) throw new Error('Unavailable');
        return { rows: records };
      },
    });
    const url = '/api/mapa/participacao?cargo=1&eleicao=6257';
    assert.equal((await app.inject(url)).statusCode, 200);
    assert.equal(reads, 1);
    clock += 61000;
    blocked = true;
    assert.equal((await app.inject(url)).statusCode, 200);
    assert.equal(reads, 2);
    assert.equal((await app.inject(url)).statusCode, 200);
    assert.equal(reads, 2);
    blocked = false;
    fail = true;
    release();
    await nextTick();
    // Serving stale data never resets its original age, including on failure.
    clock += 240001;
    blocked = true;
    fail = false;
    let completed = false;
    const expired = app.inject(url).then((response) => {
      completed = true;
      return response;
    });
    await nextTick();
    assert.equal(completed, false);
    assert.equal(reads, 3);
    blocked = false;
    release();
    assert.equal((await expired).statusCode, 200);
  } finally {
    Date.now = originalNow;
    await app.close();
  }
});
