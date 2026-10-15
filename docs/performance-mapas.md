# Otimização das consultas dos mapas

Validação concluída em 15/10/2026 com a credencial de leitura, pelo túnel SSH local. Não foram alterados índices, views, permissões ou dados do PostgreSQL.

## Medições

Tempos de uma rodada de requisições internas ao Fastify sem cache, incluindo a consulta pelo túnel. Não incluem transferência HTTP até o usuário nem renderização no navegador. Carga do servidor e latência do túnel fazem os tempos variar.

| Consulta                                     |    Antes |   Depois |
| -------------------------------------------- | -------: | -------: |
| Catálogo de cargos                           | 2.059 ms |   547 ms |
| Catálogo de candidatos — Presidente          |   368 ms |   318 ms |
| Votação — Presidente                         | 1.727 ms |   897 ms |
| Brancos, nulos e agregado — Presidente       | 1.080 ms |   948 ms |
| Catálogo de candidatos — Deputado Federal    |   703 ms |   411 ms |
| Votação — Deputado Federal                   | 1.779 ms | 1.258 ms |
| Brancos, nulos e agregado — Deputado Federal | 2.669 ms | 1.171 ms |

O heatmap de comparecimento passa a buscar locais e escala juntos em `/api/mapa/participacao`: **uma requisição e uma consulta SQL**, medida em **747 ms** nesta rodada. Antes, locais e escala exigiam duas consultas independentes. Mapas normais de comparecimento continuam baixando somente os totais municipais.

Respostas já presentes no cache do servidor levaram aproximadamente **1–3 ms** no teste interno. Esse valor não representa o tempo de rede de um usuário remoto.

## Alterações

- As consultas de votação materializam somente os campos escalares necessários antes dos agrupamentos. Isso evita ordenar os documentos JSONB completos das views públicas. Em uma comparação de planos do mapa de votação de Deputado Federal, o PostgreSQL passou de aproximadamente 1.486 ms para 913 ms; os blocos temporários escritos caíram de 33.593 para 1.799.
- O catálogo de cargos usa a view pública `votacao`, derivada dos mesmos boletins, eliminando uma deduplicação intermediária dos campos de comparecimento.
- A consulta unificada de participação lê o comparecimento uma vez. Locais sem coordenadas permanecem nos totais e no cálculo da escala, mas não são desenhados no heatmap.
- Todos os endpoints de mapas reutilizam o cache vencido enquanto atualizam em segundo plano. Há somente uma atualização por filtro. A idade máxima é de cinco minutos, inclusive quando uma atualização falha; depois disso, a requisição precisa obter dados novos.

## Equivalência e testes

O benchmark comparou todos os registros das rotas existentes com o relatório anterior. Municípios, locais e escala da nova consulta também foram comparados com os três endpoints anteriores de comparecimento. Os resultados coincidiram, incluindo percentuais, coordenadas e componentes do agregado.

Há testes para cache concorrente, atualização em segundo plano, falhas de atualização, idade máxima, filtros, preservação de locais sem coordenadas nos totais e consolidação de votos por seção. O teste SQL com dados fictícios usa somente CTEs de leitura, sem criar tabelas nem alterar o banco.

Para reproduzir, mantenha o túnel ativo e execute:

```sh
node --env-file-if-exists=.env --import tsx scripts/benchmark/map-queries.mjs --out /tmp/map-queries.json --results --explain
node --import tsx --test tests/unit/participation-map.test.mjs tests/unit/map-cache.test.mjs
node --env-file-if-exists=.env --import tsx --test tests/unit/non-nominal-maps.test.mjs
```

Para comparar com um relatório que contenha os resultados, adicione `--compare /tmp/map-queries-anterior.json`. Relatórios detalhados ficam fora do Git.
