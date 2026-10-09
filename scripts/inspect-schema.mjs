import pg from 'pg';
import { mkdir, writeFile } from 'node:fs/promises';
const pool = new pg.Pool({connectionTimeoutMillis:5000,statement_timeout:15000,options:'-c default_transaction_read_only=on'});
try {
  const columns = await pool.query(`SELECT table_name,column_name,data_type FROM information_schema.columns WHERE table_schema='eleicoes_to' ORDER BY table_name,ordinal_position`);
  const views = await pool.query(`SELECT viewname,definition FROM pg_views WHERE schemaname='eleicoes_to' ORDER BY viewname`);
  const constraints = await pool.query(`SELECT c.relname,pg_get_constraintdef(k.oid) AS definition FROM pg_constraint k JOIN pg_class c ON c.oid=k.conrelid JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname='eleicoes_to'`);
  await mkdir('database',{recursive:true});
  await writeFile('database/schema-inspection.json',JSON.stringify({columns:columns.rows,views:views.rows,constraints:constraints.rows},null,2));
  console.log(JSON.stringify({columns:columns.rows,views:views.rows},null,2));
} catch(e) { console.error(JSON.stringify({code:e.code,message:e.message}));process.exitCode=1; }
finally { await pool.end(); }
