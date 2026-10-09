import pg from 'pg';
const p=new pg.Pool({connectionTimeoutMillis:5000,statement_timeout:60000,options:'-c default_transaction_read_only=on'});
const queries={
totais:`SELECT ano,turno,eleicao_codigo,cargo_codigo,cargo,count(*) AS secoes,sum(aptos) AS aptos,sum(comparecimento) AS comparecimento,sum(abstencoes) AS abstencoes FROM eleicoes_to.comparecimento_identificado GROUP BY 1,2,3,4,5 ORDER BY cargo_codigo`,
tipos:`SELECT DISTINCT tipo_codigo,tipo_voto FROM eleicoes_to.votacao ORDER BY 1,2`,
agregacoes:`SELECT tipo_secao,secao_principal,count(*) FROM eleicoes_to.locais GROUP BY 1,2 ORDER BY count(*) DESC LIMIT 12`,
faustino:`SELECT * FROM eleicoes_to.comparecimento_identificado WHERE municipio_codigo='95591' AND zona='3' AND secao='190' AND cargo_codigo='1'`,
duplicados:`SELECT count(*) AS chaves_duplicadas FROM (SELECT ano,turno,uf,municipio_codigo,zona,secao FROM eleicoes_to.locais GROUP BY 1,2,3,4,5,6 HAVING count(*)>1) t`,
fontes:`SELECT ano,turno,concluida_em,detalhes FROM eleicoes_to.cargas ORDER BY concluida_em DESC LIMIT 1`
};
try{for(const [name,sql] of Object.entries(queries)){console.log(name,JSON.stringify((await p.query(sql)).rows));}}
catch(e){console.error(JSON.stringify({code:e.code,message:e.message}));process.exitCode=1;}finally{await p.end();}
