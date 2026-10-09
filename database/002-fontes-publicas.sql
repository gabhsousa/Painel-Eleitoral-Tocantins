BEGIN;
CREATE OR REPLACE VIEW eleicoes_to.fontes_publicas AS
SELECT ano,turno,concluida_em,
jsonb_build_object('url',detalhes->'bu'->>'url','linhas',detalhes->'bu'->'linhas','sha256',detalhes->'bu'->>'sha256') AS bu,
jsonb_build_object('url',detalhes->'locais'->>'url','linhas',detalhes->'locais'->'linhas','sha256',detalhes->'locais'->>'sha256') AS locais
FROM eleicoes_to.cargas;
COMMIT;
