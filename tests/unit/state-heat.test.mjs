import test from 'node:test';
import assert from 'node:assert/strict';
import Fastify from 'fastify';
import { registerApi } from '../../server/api.ts';
import {
  HEAT_BRUSH_EXTENT,
  HEAT_MIN_ZOOM,
  heatRadiusAtZoom,
  heatVolumeRadius,
} from '../../src/features/builder/heatZoom.ts';

test('a escala estadual oculta núcleos subpixel e preserva o raio entre níveis', () => {
  assert.equal(heatRadiusAtZoom(10), 3.5);
  assert.equal(heatRadiusAtZoom(9), 1.75);
  assert.equal(heatRadiusAtZoom(8), 0);
  assert.equal(heatRadiusAtZoom(7), 0);
  assert.equal(heatRadiusAtZoom(HEAT_MIN_ZOOM - 0.01), 0);
  assert.ok(heatRadiusAtZoom(HEAT_MIN_ZOOM + 0.01) >= 1);
  assert.equal(heatRadiusAtZoom(17), 28);
  // School volume still affects size, but the widest support is under half
  // the former footprint at the same zoom, including the blurred halo.
  const support = (zoom) => heatRadiusAtZoom(zoom) * heatVolumeRadius(1) * HEAT_BRUSH_EXTENT;
  assert.ok(support(10) < (5.5 * 1.32 * 1.85) / 2);
  assert.ok(support(17) < (45 * 1.32 * 1.85) / 2);
  assert.equal(support(11), support(10) * 2);
  assert.ok(heatVolumeRadius(0) < heatVolumeRadius(1));
});

test('calor estadual retorna municípios distintos, exclui coordenadas ausentes e reutiliza uma consulta', async () => {
  let reads = 0;
  const records = [
    {
      municipio_codigo: '73440',
      zona: '29',
      local_codigo: '1',
      local_nome: 'Escola de teste',
      aptos: '100',
      abstencoes: '20',
      percentual_abstencao: '20',
      latitudes: ['-10.2'],
      longitudes: ['-48.3'],
    },
    {
      municipio_codigo: '95591',
      zona: '1',
      local_codigo: '1',
      aptos: '200',
      abstencoes: '10',
      percentual_abstencao: '5',
      latitudes: ['-7.2'],
      longitudes: ['-48.2'],
    },
    {
      municipio_codigo: '73440',
      zona: '29',
      local_codigo: '2',
      aptos: '100',
      abstencoes: '15',
      percentual_abstencao: '15',
      latitudes: [null],
      longitudes: [null],
    },
  ];
  const pool = {
    query: async (sql, values) => {
      reads++;
      assert.ok(sql.includes('GROUP BY c.municipio_codigo,c.zona,c.local_codigo_cadastro'));
      const city = values.includes('73440');
      return { rows: city ? records.filter((r) => r.municipio_codigo === '73440') : records };
    },
  };
  const app = Fastify();
  try {
    await registerApi(app, pool);
    const url = '/api/mapa/calor-locais?ano=2026&turno=1&cargo=1&eleicao=6257';
    const [a, b] = await Promise.all([app.inject(url), app.inject(url + '&pagina=2&limite=100')]);
    assert.equal(a.statusCode, 200);
    assert.equal(b.statusCode, 200);
    assert.equal(reads, 1);
    assert.equal(a.json().length, 2);
    assert.equal(a.json()[0].local_nome, 'Escola de teste');
    assert.equal(a.json()[0].percentual_abstencao, '20');
    assert.deepEqual(new Set(a.json().map((r) => r.municipio_codigo)), new Set(['73440', '95591']));
    const city = await app.inject(url + '&municipio=73440');
    assert.equal(city.statusCode, 200);
    assert.equal(city.json().length, 1);
    assert.equal(reads, 2);
    const invalid = await app.inject(url + '&municipio=invalid');
    assert.equal(invalid.statusCode, 400);
    assert.equal(reads, 2);
  } finally {
    await app.close();
  }
});
