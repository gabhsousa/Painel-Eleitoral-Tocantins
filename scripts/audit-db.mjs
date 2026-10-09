import pg from 'pg';
import {writeFile} from 'node:fs/promises';
const p=new pg.Pool({connectionTimeoutMillis:5000,statement_timeout:10000,options:'-c default_transaction_read_only=on'});
try {
 const role=(await p.query(`SELECT current_database() AS database,current_user AS role,rolsuper,rolcreatedb,rolcreaterole,rolbypassrls,rolinherit FROM pg_roles WHERE rolname=current_user`)).rows[0];
 const grants=(await p.query(`SELECT n.nspname AS schema,c.relname AS object,c.relkind,pg_get_userbyid(c.relowner)=current_user AS owner,has_table_privilege(c.oid,'SELECT') AS select,has_table_privilege(c.oid,'INSERT') AS insert,has_table_privilege(c.oid,'UPDATE') AS update,has_table_privilege(c.oid,'DELETE') AS delete FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname NOT IN ('pg_catalog','information_schema') AND c.relkind IN ('r','v','m','p') ORDER BY 1,2`)).rows;
 const schemas=(await p.query(`SELECT nspname,has_schema_privilege(oid,'CREATE') AS create FROM pg_namespace WHERE nspname NOT LIKE 'pg_%' AND nspname<>'information_schema'`)).rows;
 const report={role,schemas,grants};await writeFile('database/security-db-audit.json',JSON.stringify(report,null,2));console.log(JSON.stringify({role,schemas,objects:grants.length,writable:grants.filter(g=>g.insert||g.update||g.delete||g.owner).length}));
}catch(e){console.error(JSON.stringify({code:e.code,message:e.message}));process.exitCode=1;}finally{await p.end();}
