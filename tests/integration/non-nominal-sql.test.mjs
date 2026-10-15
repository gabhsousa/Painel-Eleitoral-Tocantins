import test from 'node:test';
import assert from 'node:assert/strict';
import Fastify from 'fastify';
import { registerApi } from '../../server/api.ts';
import { createPool } from '../../server/db.ts';

// Run the actual SQL against read-only CTE fixtures. No tables or production
// data are created or modified; multiple choice rows must not multiply turnout.
test(
  'SQL consolida seções sem duplicar aptos e soma exatamente os três componentes',
  { skip: !process.env.PGUSER && !process.env.DATABASE_URL },
  async () => {
    const pool = createPool(),
      app = Fastify();
    const fixtures = `WITH fixture_comparecimento(ano,turno,uf,municipio_codigo,zona,secao,local_codigo_cadastro,cargo_codigo,eleicao_codigo,aptos,comparecimento,abstencoes) AS (VALUES
    (2026,1,'TO','73440','29','1','1015','1','6257',100,80,20),
    (2026,1,'TO','73440','29','2','1015','1','6257',200,150,50),
    (2026,1,'TO','73440','29','3','1031','1','6257',50,40,10),
    (2026,1,'TO','95591','1','4','2015','1','6257',60,30,30),
    (2026,1,'TO','73440','29','1','1015','3','6259',100,80,20),
    (2025,1,'TO','73440','29','1','1015','1','6257',999,0,999)
  ), fixture_votacao(ano,turno,uf,municipio_codigo,zona,secao,cargo_codigo,eleicao_codigo,tipo_codigo,votos) AS (VALUES
    (2026,1,'TO','73440','29','1','1','6257','1',40),(2026,1,'TO','73440','29','1','1','6257','1',30),
    (2026,1,'TO','73440','29','1','1','6257','2',3),(2026,1,'TO','73440','29','1','1','6257','3',7),
    (2026,1,'TO','73440','29','2','1','6257','1',120),(2026,1,'TO','73440','29','2','1','6257','2',10),(2026,1,'TO','73440','29','2','1','6257','3',20),
    (2026,1,'TO','73440','29','3','1','6257','1',39),(2026,1,'TO','73440','29','3','1','6257','3',1),
    (2026,1,'TO','73440','29','1','3','6259','2',1),(2026,1,'TO','73440','29','1','3','6259','3',2),
    (2025,1,'TO','73440','29','1','1','6257','2',999)
  ), fixture_locais(ano,turno,uf,municipio_codigo,zona,local_codigo,local_nome,latitude,longitude) AS (VALUES
    (2026,1,'TO','73440','29','1015','Escola principal','-10.2','-48.3'),
    (2026,1,'TO','73440','29','1031','Escola sem coordenadas',NULL,NULL),
    (2026,1,'TO','95591','1','2015','Escola sem votação','-7.2','-48.2')
  ), `;
    try {
      await registerApi(app, {
        query: (sql, values) =>
          pool.query(
            fixtures +
              sql
                .replace(/^WITH /, '')
                .replaceAll('eleicoes_to.comparecimento_identificado', 'fixture_comparecimento')
                .replaceAll('eleicoes_to.votacao', 'fixture_votacao')
                .replaceAll('eleicoes_to.locais', 'fixture_locais'),
            values,
          ),
      });
      const response = await app.inject('/api/mapa/nao-nominais?cargo=1&eleicao=6257');
      assert.equal(response.statusCode, 200, response.body);
      const data = response.json(),
        city = data.municipios.find((row) => row.municipio_codigo === '73440'),
        school = data.locais.find((row) => row.local_codigo === '1015');
      assert.equal(city.aptos, '350');
      assert.equal(city.brancos, '13');
      assert.equal(city.nulos, '28');
      assert.equal(city.abstencoes, '80');
      assert.equal(city.abstencoes_brancos_nulos, '121');
      assert.equal(school.aptos, '300');
      assert.equal(school.brancos, '13');
      assert.equal(school.nulos, '27');
      assert.equal(school.abstencoes_brancos_nulos, '110');
      assert.equal(data.locais.length, 2);
      assert.equal(
        data.locais.find((row) => row.local_codigo === '2015').abstencoes_brancos_nulos,
        null,
      );
      const other = await app.inject('/api/mapa/nao-nominais?cargo=3&eleicao=6259');
      assert.equal(other.statusCode, 200);
      assert.equal(other.json().municipios[0].brancos, '1');
      assert.equal(other.json().municipios[0].nulos, '2');
      assert.equal(other.json().municipios[0].abstencoes_brancos_nulos, '23');
    } finally {
      await app.close();
      await pool.end();
    }
  },
);
