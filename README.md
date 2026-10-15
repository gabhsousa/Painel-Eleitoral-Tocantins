# Consulta Eleitoral TO

Aplicação pública de consulta eleitoral do Tocantins: mapa de vencedores por município, locais de votação, resultados por cargo e construtor de mapas normais e de calor. O construtor mantém configurações, títulos, posições, filtros e câmera neste navegador.

React, Vite e TypeScript no frontend; Fastify e PostgreSQL no backend. Frontend e API são servidos no mesmo domínio. Site: [mapaeleitoral.sejafast.com](https://mapaeleitoral.sejafast.com). A aplicação roda na VPS via Portainer e Cloudflare Tunnel; o banco permanece no sv01, acessível pela rede privada. Veja [deploy](deploy/DEPLOY.md).

## Desenvolvimento

Use Node.js 22 ou superior. Configure `.env` conforme [.env.example](.env.example), com a credencial de leitura. No ambiente local, mantenha o túnel PostgreSQL aberto em `127.0.0.1:15432`.

```sh
npm ci
npm run build
npm start
```

A interface usa a porta definida em `PORT` (3000 por padrão). Para atualização automática, execute `npm run dev:api` e `npm run dev` em terminais separados; o Vite encaminha `/api` para a porta configurada no `.env`.

## Estrutura

| Diretório                                         | Responsabilidade                                                 |
| ------------------------------------------------- | ---------------------------------------------------------------- |
| `src/app`                                         | Navegação, tema e estado compartilhado entre abas                |
| `src/features/explorer`                           | Dashboard, resultados e mapa de vencedores                       |
| `src/features/builder`                            | Composição, persistência, configurações e renderização dos mapas |
| `src/shared`                                      | Componentes de interface, acesso à API, formatação e tipos       |
| `src/styles`                                      | Estilos da aplicação e do construtor                             |
| `server/routes`                                   | Consultas da exploração e dos mapas                              |
| `server/http`                                     | Validação, filtros SQL e integração HTTP do cache                |
| `server/cache`                                    | Cache limitado e deduplicação de consultas                       |
| `server/createApp.ts`                             | Montagem do servidor, testável sem abrir uma porta               |
| `server/index.ts`                                 | Inicialização, validação de produção e encerramento              |
| `tests/unit`                                      | Testes locais com fixtures, sem túnel ou credenciais             |
| `tests/integration`                               | Verificações com servidor e banco reais                          |
| `scripts/db`, `scripts/maps`, `scripts/benchmark` | Operações administrativas, preparação da malha e medições        |
| `database`                                        | Migrations SQL das views públicas                                |
| `public/maps`                                     | Malha e fontes necessárias em execução                           |
| `data/ibge`                                       | Arquivos brutos usados na preparação, sem publicação no site     |
| `reports`                                         | Relatórios locais ignorados pelo Git e Docker                    |

Os indicadores, títulos automáticos e formatos estão em `src/features/builder/indicators.ts`. Os cálculos dos pontos de calor ficam em `heatData.ts`; a rasterização, em `HeatRenderer.ts`. A versão/chave do rascunho foi preservada para manter composições já salvas.

## Qualidade e testes

```sh
npm run check
npm run build
npm run build:server
```

`check` verifica tipos, código sem uso, formatação e testes locais. `npm run format` aplica a formatação. O workflow de CI executa essas verificações e os dois builds sem precisar de segredos ou banco.

Para integração, compile e inicie uma instância exclusiva com o banco de leitura e o túnel ativo:

```sh
NODE_ENV=production HOST=127.0.0.1 PORT=3002 node --env-file=.env build/server/index.js
```

Em outro terminal:

```sh
TEST_BASE_URL=http://127.0.0.1:3002 npm run test:integration
```

Essa suíte verifica dados conhecidos da carga de 2026, consultas com fixtures SQL de leitura, proteção HTTP e permissões reais. O teste adicional de recusa da conta administrativa usa o backup local privado `.env.admin`, quando disponível. O teste de limite de chamadas consome a cota da instância de teste; reinicie-a antes de repetir. Nunca execute a suíte contra o site público.

Para comparar consultas e resultados:

```sh
npm run benchmark:maps -- --out /tmp/map-queries.json --results --explain
```

Adicione `--compare /tmp/map-queries-anterior.json` para conferir equivalência com uma rodada anterior. Os relatórios contêm SQL e dados eleitorais agregados; mantenha-os fora do Git. Veja as [medições das consultas](docs/performance-mapas.md) e a [revisão do código](docs/revisao-codigo.md).

## Dados e interpretação

Os locais são associados aos boletins pela view `comparecimento_identificado`. Locais sem BU individual continuam na listagem; códigos do BU e do cadastro são preservados. Divergências não comprovam o prédio efetivamente usado. Seções agregadas usam o consolidado da principal, sem replicar votos ou eleitorado nos totais.

Taxa de abstenção = ausentes ÷ aptos × 100. O resultado geral usa todos os votos, incluindo brancos, nulos e legenda. No construtor, o percentual de um candidato usa somente os votos nominais do cargo, conforme indicado no formulário. O agregado soma abstenções, brancos e nulos do cargo selecionado. Dados ausentes continuam ausentes, em vez de virar zero.

A malha de máxima qualidade do IBGE tem os 139 vínculos entre códigos IBGE e TSE conferidos. Coordenadas fora do município cadastrado são sinalizadas, sem deslocamento artificial; locais sem coordenadas permanecem nas listagens e nos totais. O construtor usa tiles do OpenStreetMap para as ruas, com atribuição visível. O mapa da aba Explorar usa a malha local.

Para atualizar a malha: `node --env-file=.env scripts/maps/prepare-map.mjs`. Os arquivos brutos vão para `data/ibge` e as auditorias para `reports`. A credencial de leitura foi provisionada por `scripts/db/provision-readonly.mjs`; esse script não substitui um usuário existente.

## Segurança e operação

- SQL parametrizado, filtros validados e UF restrita a TO; sem endpoint de SQL arbitrário, JSONB bruto ou telefones.
- Pool de 3 conexões, timeout SQL de 15 segundos e até 12 consultas diferentes em andamento.
- Cache do servidor: 60 segundos, até 200 entradas e 16 MiB. Mapas podem usar dados por até cinco minutos enquanto atualizam em segundo plano; uma falha não estende a validade. O navegador reutiliza respostas dos mapas por até 60 segundos. HTTP da API recebe `Cache-Control: no-store`.
- Limite de 120 chamadas por minuto por IP, CSP e cabeçalhos de proteção. A opção de confiar em `CF-Connecting-IP` exige a topologia privada descrita no deploy.
- Produção recusa credenciais administrativas, escrita, leitura de dados brutos, outros schemas ou herança de roles.
- Logs omitem senhas, connection strings, URLs de consulta e respostas do banco. Credenciais e relatórios locais não entram no Git ou Docker.
- Container sem root. `/health` verifica o processo; `/ready`, a leitura do banco.

Os endpoints anteriores de calor e escala foram mantidos para compatibilidade, embora o construtor use a consulta unificada de participação. Atualizações de dados devem considerar a validade dos caches; reiniciar o serviço os invalida imediatamente.
