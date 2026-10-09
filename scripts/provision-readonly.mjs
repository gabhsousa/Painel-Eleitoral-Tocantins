import pg from 'pg';
import {randomBytes} from 'node:crypto';
import {readFile,writeFile,chmod} from 'node:fs/promises';
import {assertReadOnlyRole} from '../server/db.ts';

// Run once with an administrative connection. Passwords are never printed.
const role='eleitoral_to_readonly';
const admin=new pg.Pool({max:1,connectionTimeoutMillis:5000,statement_timeout:15000});
let verified=false;
try {
 const exists=await admin.query('SELECT 1 FROM pg_roles WHERE rolname=$1',[role]);
 if(exists.rowCount)throw new Error('O usuário eleitoral_to_readonly já existe; interrompido para não trocar uma credencial existente.');
 const original=await readFile('.env','utf8');
 await writeFile('.env.admin',original,{flag:'wx',mode:0o600});
 await chmod('.env.admin',0o600);
 const migration=await readFile('database/002-fontes-publicas.sql','utf8');
 await admin.query(migration);
 const password=randomBytes(32).toString('base64url');
 const client=await admin.connect();
 try {
  await client.query('BEGIN');
  await client.query("SET LOCAL password_encryption='scram-sha-256'");
  await client.query(`CREATE ROLE ${role} LOGIN PASSWORD '${password}' NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION NOBYPASSRLS NOINHERIT CONNECTION LIMIT 8`);
  await client.query(`GRANT CONNECT ON DATABASE "VTXMkting" TO ${role}`);
  await client.query(`GRANT USAGE ON SCHEMA eleicoes_to TO ${role}`);
  await client.query(`GRANT SELECT ON eleicoes_to.locais,eleicoes_to.comparecimento,eleicoes_to.comparecimento_identificado,eleicoes_to.resumo_locais_cadastro,eleicoes_to.votacao,eleicoes_to.fontes_publicas TO ${role}`);
  await client.query(`ALTER ROLE ${role} SET default_transaction_read_only=on`);
  await client.query(`ALTER ROLE ${role} SET statement_timeout='15s'`);
  await client.query(`ALTER ROLE ${role} SET lock_timeout='3s'`);
  await client.query(`ALTER ROLE ${role} SET idle_in_transaction_session_timeout='10s'`);
  await client.query('COMMIT');
 }catch(e){await client.query('ROLLBACK');throw e;}finally{client.release();}
 const local=original.split('\n').filter(line=>!/^\s*(PGUSER|PGPASSWORD|DATABASE_URL|PGPASSWORD_FILE)\s*=/.test(line)).join('\n')+`\nPGUSER=${role}\nPGPASSWORD=${password}\n`;
 // Persist the new secret before testing, so a network interruption cannot lose it.
 await writeFile('.env.readonly',local,{flag:'wx',mode:0o600});
 await writeFile('.env.deploy',`NODE_ENV=production\nHOST=0.0.0.0\nPORT=3000\nPGHOST=postgres_main\nPGPORT=5432\nPGDATABASE=VTXMkting\nPGUSER=${role}\nPGPASSWORD=${password}\nTRUST_CLOUDFLARE=true\n`,{flag:'wx',mode:0o600});
 // Validate the actual login before changing the running application's config.
 const test=new pg.Pool({host:process.env.PGHOST,port:Number(process.env.PGPORT||5432),database:process.env.PGDATABASE,user:role,password,connectionTimeoutMillis:5000,statement_timeout:15000});
 try {
  await assertReadOnlyRole(test);
  const value=(await test.query("SELECT sum(aptos) AS aptos FROM eleicoes_to.comparecimento_identificado WHERE ano=2026 AND turno=1 AND cargo_codigo='1' AND uf='TO' AND eleicao_codigo='6257'")).rows[0];
  if(Number(value.aptos)!==1182023)throw new Error('Os totais de conferência não bateram.');
  verified=true;
 }finally{await test.end();}
 await writeFile('.env',local,{mode:0o600});await chmod('.env',0o600);
 console.log(JSON.stringify({role,verified,localUpdated:true,secretsFile:'.env.deploy',adminBackup:'.env.admin'}));
}catch(e){console.error(JSON.stringify({code:e.code,message:e.message,verified}));process.exitCode=1;}finally{await admin.end();}
