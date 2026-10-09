-- Definições inspecionadas no servidor; requer as views locais e comparecimento.
BEGIN;
CREATE OR REPLACE VIEW eleicoes_to.comparecimento_identificado AS
 SELECT c.ano,
    c.turno,
    c.uf,
    c.eleicao_codigo,
    c.municipio_codigo,
    c.municipio,
    c.zona,
    c.secao,
    c.local_codigo,
    c.cargo_codigo,
    c.cargo,
    c.aptos,
    c.comparecimento,
    c.abstencoes,
    c.secoes_agregadas,
    l.local_codigo AS local_codigo_cadastro,
    l.local_nome,
    l.endereco,
    l.bairro,
        CASE
            WHEN (l.secao IS NULL) THEN 'Sem cadastro correspondente'::text
            WHEN (c.local_codigo <> l.local_codigo) THEN 'Codigo divergente'::text
            ELSE 'Correspondente'::text
        END AS situacao_local
   FROM (eleicoes_to.comparecimento c
     LEFT JOIN eleicoes_to.locais l ON (((l.ano = c.ano) AND (l.turno = c.turno) AND (l.uf = c.uf) AND (l.municipio_codigo = c.municipio_codigo) AND (l.zona = c.zona) AND (l.secao = c.secao))));

CREATE OR REPLACE VIEW eleicoes_to.resumo_locais_cadastro AS
 SELECT ano,
    turno,
    uf,
    eleicao_codigo,
    municipio_codigo,
    municipio,
    zona,
    local_codigo_cadastro,
    local_nome,
    endereco,
    bairro,
    cargo_codigo,
    cargo,
    count(*) AS secoes_totalizadas,
    count(*) FILTER (WHERE (situacao_local = 'Codigo divergente'::text)) AS secoes_codigo_divergente,
    sum(aptos) AS aptos,
    sum(comparecimento) AS comparecimento,
    sum(abstencoes) AS abstencoes,
    round(((100.0 * (sum(abstencoes))::numeric) / (NULLIF(sum(aptos), 0))::numeric), 2) AS percentual_abstencao
   FROM eleicoes_to.comparecimento_identificado
  GROUP BY ano, turno, uf, eleicao_codigo, municipio_codigo, municipio, zona, local_codigo_cadastro, local_nome, endereco, bairro, cargo_codigo, cargo;
COMMIT;
