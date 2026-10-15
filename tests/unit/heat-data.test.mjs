import test from 'node:test';
import assert from 'node:assert/strict';
import {
  buildHeatPoints,
  abstentionWeight,
  normalizeRange,
} from '../../src/features/builder/heatData.ts';

const school = { municipio_codigo: '73440', latitude: -10.2, longitude: -48.3 };

test('pontos compartilhados ponderam a taxa pelos aptos e ignoram dados ausentes', () => {
  const points = buildHeatPoints(
    [
      { ...school, aptos: 100, percentual_abstencao: 10 },
      { ...school, aptos: 300, percentual_abstencao: 30 },
      { ...school, aptos: 1000, percentual_abstencao: null },
      { ...school, aptos: 1000, percentual_abstencao: 'indisponível' },
      { ...school, latitude: null, aptos: 100, percentual_abstencao: 80 },
    ],
    'percentual_abstencao',
  );
  assert.equal(points.length, 1);
  assert.equal(points[0].value, 25);
  assert.equal(points[0].volume, 400);
  assert.equal(points[0].latitude, school.latitude);
  assert.equal(points[0].longitude, school.longitude);
});

test('percentual de votos usa votos nominais, enquanto valores absolutos são somados', () => {
  const rows = [
    { ...school, aptos: 1000, votos_nominais: 100, percentual_votos: 10, brancos: 3 },
    { ...school, aptos: 1000, votos_nominais: 300, percentual_votos: 30, brancos: 5 },
  ];
  assert.equal(buildHeatPoints(rows, 'percentual_votos')[0].value, 25);
  assert.equal(buildHeatPoints(rows, 'brancos')[0].value, 8);
});

test('escala degenerada nunca produz NaN e distribui mínimo, média e máximo de forma estável', () => {
  const scale = { minimo: 10, media: 20, maximo: 40 };
  assert.equal(abstentionWeight(10, scale), 0);
  assert.equal(abstentionWeight(20, scale), 0.5);
  assert.equal(abstentionWeight(40, scale), 1);
  assert.equal(abstentionWeight(10, { minimo: 10, media: 10, maximo: 10 }), 0.5);
  assert.equal(abstentionWeight(10, { minimo: 10, media: 10, maximo: 40 }), 0);
  assert.equal(normalizeRange(10, 10, 10), 0.5);
  assert.ok(Number.isFinite(normalizeRange(10, NaN, 20)));
});
