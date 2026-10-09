# Consulta Eleitoral TO

Dashboard pública com mapa dos 139 municípios do Tocantins, aproximação animada, locais de votação e resultados do primeiro turno de 2026. React/Vite/TypeScript no frontend; Fastify/PostgreSQL no backend, no mesmo domínio.

Domínio definido: **mapaeleitoral.sejafast.com**. Aplicação será hospedada na VPS via Portainer e Cloudflare Tunnel; banco permanece no sv01. Publicação pendente da rota privada VPS–sv01, do repositório GitHub e da construção da imagem na VPS. Instruções completas em [deploy/DEPLOY.md](deploy/DEPLOY.md).

## Rodar localmente

```sh
npm ci
npm run build
npm start
```

Mantenha o túnel SSH ativo para `127.0.0.1:15432` e configure `.env` conforme `.env.example`. Nesta instalação, a porta da interface é 3001. A credencial local já foi trocada para `eleitoral_to_readonly`, com SELECT somente nas views públicas. O servidor local aceita conexões apenas em localhost.

Para desenvolver com atualização automática: `npm run dev` e `npm run dev:api`. O proxy usa a porta da API definida no `.env`.

## Builds e testes

```sh
npm run build
npm run build:server
node scripts/test-api.mjs
node --import tsx scripts/test-map.mjs
```

Para testar o servidor compilado em produção com o banco pelo túnel local, execute em um terminal:

```sh
NODE_ENV=production HOST=127.0.0.1 PORT=3002 node --env-file=.env build/server/index.js
```

Em outro terminal:

```sh
node --env-file=.env --import tsx --test scripts/security.test.mjs
```

O último teste consome o limite de chamadas da instância de teste; reinicie-a antes de repetir a suíte. O teste de recusa do proprietário usa `.env.admin`, backup privado da configuração anterior desta instalação.

## Dados e interpretação

A API prefere `comparecimento_identificado` para associar os BUs ao cadastro. Locais sem BU individual continuam na listagem. Os códigos do BU e do cadastro são preservados; divergências não comprovam o prédio efetivamente usado. Seções agregadas mostram o resultado consolidado da principal e não replicam votos ou eleitorado nos totais.

Percentual de abstenção: total de abstenções dividido pelo total de aptos. Percentual de votos: todos os votos do recorte, incluindo branco, nulo e legenda; o denominador não é o número de presentes. Nomes são os do BU; candidaturas completas não foram importadas. Votos têm paginação, com máximo de 100 registros por página.

A malha está em qualidade máxima da API oficial do IBGE. Os códigos IBGE e TSE são diferentes e os 139 vínculos foram conferidos. Há 928 locais com coordenadas, incluindo 16 pontos fora do município cadastrado, sinalizados sem deslocamento artificial. Os cinco sem coordenadas continuam apenas na lista. Mapas não dependem de tiles externos em tempo de execução.

Atualizar a malha: `node --env-file=.env scripts/prepare-map.mjs`. As migrations das views estão em `database/001-identificacao-cadastral.sql` e `database/002-fontes-publicas.sql`. A role de leitura foi provisionada uma vez por `scripts/provision-readonly.mjs`; não reexecute para trocar uma senha existente.

## Segurança e operação

- Consultas parametrizadas, tipos e filtros validados, UF restrita a TO, nenhuma rota SQL genérica ou exposição de raw JSONB/telefones.
- Pool de 3 conexões, timeout SQL de 15 segundos, lock timeout de 3 segundos, no máximo 12 consultas diferentes pendentes.
- Cache interno de 60 segundos, até 200 entradas e 16 MiB. APIs recebem `Cache-Control: no-store`; a aplicação controla a consistência internamente.
- Limite de 120 chamadas de API por minuto por IP, CSP e outros cabeçalhos de proteção, sem CORS aberto.
- Produção rejeita credenciais administrativas, escrita, leitura de dados brutos, outros schemas ou herança de roles.
- Logs não registram URLs de consulta, senhas, connection strings ou respostas do banco; erros entregam mensagens genéricas.
- Credenciais ignoradas por Git e Docker. Container final sem tsx ou dependências de desenvolvimento, executado sem root.
- `/health` verifica o processo, `/ready` verifica acesso ao banco; `/api/status` retorna uma mensagem pública de conectividade.

Dependências auditadas após a atualização, sem vulnerabilidades reportadas. A imagem Docker ainda precisa ser construída no servidor (Docker não está instalado no Mac desta revisão). Comparações e exportações são etapas posteriores.
