import pg from 'pg';
import assert from 'node:assert/strict';
import { writeFile } from 'node:fs/promises';
const pool=new pg.Pool({connectionTimeoutMillis:5000,statement_timeout:45000,options:'-c default_transaction_read_only=on'});
try {
 const r=await pool.query(`WITH cadastro AS MATERIALIZED (SELECT * FROM eleicoes_to.locais WHERE ano=2026 AND turno=1 AND uf='TO'), bu AS MATERIALIZED (SELECT * FROM eleicoes_to.comparecimento_identificado WHERE ano=2026 AND turno=1 AND uf='TO' AND cargo_codigo='1' AND eleicao_codigo='6257') SELECT count(*) FILTER(WHERE l.tipo_secao='Agregada') AS agregadas,count(*) FILTER(WHERE b.secao IS NULL) AS sem_bu,count(*) FILTER(WHERE l.tipo_secao='Principal' AND b.situacao_local='Codigo divergente') AS divergencias FROM cadastro l LEFT JOIN bu b ON b.municipio_codigo=l.municipio_codigo AND b.zona=l.zona AND b.secao=CASE WHEN l.tipo_secao='Agregada' THEN l.secao_principal ELSE l.secao END`);
 assert.equal(Number(r.rows[0].agregadas),106);assert.equal(Number(r.rows[0].sem_bu),0);assert.equal(Number(r.rows[0].divergencias),37);console.log('Vínculos:',r.rows[0]);
 const q=`SELECT sum(v.votos) FROM eleicoes_to.votacao v WHERE v.ano=2026 AND v.turno=1 AND v.uf='TO' AND v.cargo_codigo='1' AND v.eleicao_codigo='6257' AND EXISTS(SELECT 1 FROM eleicoes_to.locais l WHERE l.ano=v.ano AND l.turno=v.turno AND l.uf=v.uf AND l.municipio_codigo=v.municipio_codigo AND l.zona=v.zona AND l.secao=v.secao)`;
 const plan=await pool.query('EXPLAIN (ANALYZE, BUFFERS, FORMAT JSON) '+q);
 await writeFile('database/votes-query-plan.json',JSON.stringify(plan.rows,null,2));
 const total=await pool.query(q);assert.equal(Number(total.rows[0].sum),965196);console.log('Votos de presidente após vínculo cadastral:',total.rows[0].sum);console.log('Plano EXPLAIN salvo em database/votes-query-plan.json');
}catch(e){console.error(JSON.stringify({code:e.code,message:e.message}));process.exitCode=1;}finally{await pool.end();}
