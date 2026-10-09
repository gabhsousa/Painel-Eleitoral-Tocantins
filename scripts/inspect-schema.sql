\set ON_ERROR_STOP on
\d+ eleicoes_to.locais
\d+ eleicoes_to.comparecimento
\d+ eleicoes_to.votacao
\d+ eleicoes_to.cargas
\d+ eleicoes_to.comparecimento_identificado
\d+ eleicoes_to.resumo_locais_cadastro
SELECT schemaname, viewname, definition FROM pg_views
WHERE schemaname = 'eleicoes_to'
AND viewname IN ('comparecimento_identificado', 'resumo_locais_cadastro');
