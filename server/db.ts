import pg from 'pg';
import {readFileSync} from 'node:fs';

export function createPool() {
  if(!process.env.DATABASE_URL&&!process.env.PGUSER)return null;
  const password=process.env.PGPASSWORD_FILE?readFileSync(process.env.PGPASSWORD_FILE,'utf8').trim():process.env.PGPASSWORD;
  const pool=new pg.Pool({...(process.env.DATABASE_URL?{connectionString:process.env.DATABASE_URL}:{}),...(password?{password}:{}),max:3,connectionTimeoutMillis:5000,idleTimeoutMillis:20000,maxLifetimeSeconds:300,statement_timeout:15000,query_timeout:18000,options:'-c default_transaction_read_only=on -c lock_timeout=3000 -c idle_in_transaction_session_timeout=10000'});
  return pool;
}

export async function assertReadOnlyRole(pool:pg.Pool) {
  const role=(await pool.query(`SELECT rolsuper,rolcreatedb,rolcreaterole,rolbypassrls,rolreplication FROM pg_roles WHERE rolname=current_user`)).rows[0];
  if(!role||Object.values(role).some(Boolean))throw new Error('A aplicação exige uma credencial PostgreSQL sem privilégios administrativos.');
  const writable=await pool.query(`SELECT 1 FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname NOT LIKE 'pg_%' AND n.nspname<>'information_schema' AND c.relkind IN ('r','v','m','p','f') AND (pg_get_userbyid(c.relowner)=current_user OR has_table_privilege(c.oid,'INSERT,UPDATE,DELETE,TRUNCATE,TRIGGER')) LIMIT 1`);
  const create=await pool.query(`SELECT 1 FROM pg_namespace WHERE nspname NOT LIKE 'pg_%' AND nspname<>'information_schema' AND has_schema_privilege(oid,'CREATE') LIMIT 1`);
  const raw=await pool.query(`SELECT has_table_privilege('eleicoes_to.raw_bu','SELECT') OR has_table_privilege('eleicoes_to.raw_locais','SELECT') AS exposed`);
  const extra=await pool.query(`SELECT 1 FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname NOT LIKE 'pg_%' AND n.nspname<>'information_schema' AND c.relkind IN ('r','v','m','p','f') AND has_table_privilege(c.oid,'SELECT') AND NOT(n.nspname='eleicoes_to' AND c.relname IN ('locais','comparecimento','comparecimento_identificado','resumo_locais_cadastro','votacao','fontes_publicas')) LIMIT 1`);
  const memberships=await pool.query(`SELECT 1 FROM pg_auth_members WHERE member=(SELECT oid FROM pg_roles WHERE rolname=current_user) LIMIT 1`);
  const database=(await pool.query(`SELECT has_database_privilege(current_database(),'CREATE') AS create`)).rows[0];
  if(writable.rowCount||create.rowCount||raw.rows[0].exposed||extra.rowCount||memberships.rowCount||database.create)throw new Error('A credencial deve ter acesso somente às views públicas, sem escrita, herança de roles ou leitura de outras tabelas.');
  await pool.query('SELECT ano FROM eleicoes_to.comparecimento_identificado LIMIT 1');
}
