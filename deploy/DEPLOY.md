# Deploy — mapaeleitoral.sejafast.com

Aplicação pública na VPS, servida pelo Cloudflare Tunnel da VPS. O banco continua sendo `VTXMkting` no container `postgres_main` do servidor local sv01. Este preparo não publicou a aplicação nem modificou containers de outras aplicações.

## O que já foi aplicado no banco

- Usuário `eleitoral_to_readonly`, com senha aleatória de 256 bits, autenticação SCRAM e limite de 8 conexões.
- CONNECT em `VTXMkting`, USAGE em `eleicoes_to`, SELECT somente em `locais`, `comparecimento`, `comparecimento_identificado`, `resumo_locais_cadastro`, `votacao` e `fontes_publicas`.
- Sem superusuário, criação de roles/bancos, bypass de RLS, herança de roles, escrita ou leitura de tabelas brutas e dados de outras aplicações.
- View `fontes_publicas` retorna apenas URLs, contagens e hashes das fontes, sem liberar JSONB bruto do histórico.
- `.env` local agora usa essa conta. `.env.deploy` contém a senha para configurar no Portainer. `.env.admin` é uma cópia privada da configuração anterior, guardada localmente para administração. Todos esses arquivos têm acesso restrito e são excluídos do Git, do pacote de release e do build Docker.

Não reexecute `scripts/provision-readonly.mjs` no servidor atual: o usuário já existe. O script interrompe em vez de substituir credenciais existentes. As definições adicionais de views estão versionadas em `database/001-identificacao-cadastral.sql` e `database/002-fontes-publicas.sql`.

## 1. Topologia: aplicação na VPS, banco no sv01

Frontend e API serão executados na VPS, publicados pelo único `cloudflared` da VPS. PostgreSQL permanece no servidor local `sv01` (`100.73.87.91` na Tailscale). As redes Docker listadas anteriormente pertencem ao sv01 e não devem ser utilizadas como configuração da VPS. O nome Docker `postgres_main` não resolve entre servidores.

Rede confirmada na VPS: `automation`, compartilhada pelo único `cloudflared`. A aplicação será conectada a essa rede, sem publicar a porta 3000. Para conferir novamente:

```sh
docker ps --format '{{.Names}} | {{.Image}} | {{.Networks}}'
```

A conexão ao banco deverá usar uma rota privada entre VPS e sv01, preferencialmente Tailscale com acesso restrito, ou um túnel SSH persistente. A existência do túnel no Mac não atende à VPS. Confirmar Tailscale, publicação/listener atual do PostgreSQL e acesso a partir do container antes de definir `DB_HOST` e `DB_PORT`. Se PostgreSQL escuta somente em localhost no sv01, usar um túnel SSH persistente sem publicar 5432 na Internet. Chaves SSH, host keys e reinício do túnel devem ser configurados antes de subir a aplicação.

A aplicação acessará a rede do cloudflared da VPS; nenhuma rede Docker do banco local será conectada diretamente. O Compose exige o endpoint privado do banco como variável e não pressupõe que ele já exista.

## GitHub e Portainer

Enviar o código e lockfile ao repositório GitHub escolhido, sem `.env`, backups administrativos ou auditorias do banco. A imagem precisa ser construída na VPS a partir do commit publicado (ou por CI e entregue em um registry). A stack fornecida usa uma imagem pronta: cadastrar o repositório como origem no Portainer não substitui a construção da imagem. Em repositório privado, configurar credencial de acesso restrita no servidor/Portainer.

## 2. Enviar e construir a aplicação

O pacote `consulta-eleitoral-to-0.1.0.tar.gz` contém o código, o lockfile, as malhas públicas, migrations e os arquivos de deploy. Não contém senhas, `node_modules`, bundles antigos ou auditorias de outros schemas.

Envie o pacote usando seu SSH existente e extraia numa pasta exclusiva, por exemplo `/home/vtx/mapaeleitoral`. Na pasta extraída, execute no servidor que tem Docker:

```sh
docker build -t consulta-eleitoral-to:0.1.0 .
```

O Dockerfile faz `npm ci`, compila frontend e backend e remove dependências de desenvolvimento. O processo final executa JavaScript compilado diretamente, como usuário 1000, com verificação de readiness do banco.

A máquina local desta revisão não tem Docker; a imagem ainda precisa ser construída e testada no servidor. Builds TypeScript/Vite e o servidor compilado em modo produção foram testados localmente com o banco real.

## 3. Criar a stack no Portainer

Use `deploy/compose.yml` como stack Docker Compose/Standalone, não Swarm. Configure as variáveis da stack:

| Variável | Valor |
|---|---|
| `APP_IMAGE` | `consulta-eleitoral-to:0.1.0` |
| `DB_HOST` | Endpoint privado do banco do sv01, alcançável pelo container na VPS |
| `DB_PORT` | Porta do endpoint privado ou túnel persistente |
| `TUNNEL_NETWORK` | `automation` |
| `PGPASSWORD` | Senha de `eleitoral_to_readonly` em `.env.deploy` |

O compose não tem `ports`. A aplicação fica acessível apenas nas redes internas, na porta 3000. Possui filesystem somente leitura, `cap_drop: ALL`, `no-new-privileges`, memória limitada, logs rotacionados e reinício automático. A senha é configurada no Portainer, não incluída na imagem.

O backend também suporta `PGPASSWORD_FILE` para setups com Docker Secrets; nesse caso, monte o arquivo somente leitura e não configure `PGPASSWORD`. O caminho padrão pode ser `/run/secrets/postgres_password`. A stack padrão usa variável do Portainer para funcionar em Compose Standalone sem assumir uma configuração de Secrets já existente.

A verificação de produção recusa a credencial proprietária ou qualquer conta com permissões além da lista de views. Não há CORS liberado: frontend e API usam o mesmo domínio.

## 4. Configurar o Cloudflare Tunnel escolhido

No túnel existente associado ao domínio, adicione um hostname público:

| Campo | Valor |
|---|---|
| Subdomínio | `mapaeleitoral` |
| Domínio | `sejafast.com` |
| Tipo do serviço | HTTP |
| URL do serviço | `mapaeleitoral:3000` |

O Cloudflare entrega HTTPS para o navegador; o hop até a aplicação é pela rede Docker interna da VPS. A conexão ao banco usa a rota privada até o sv01. Mantenha o redirecionamento HTTPS habilitado para o hostname. A rota acima deve apontar para o alias Docker do serviço, e não para localhost do container Cloudflare.

`TRUST_CLOUDFLARE=true` faz o limite de consultas usar `CF-Connecting-IP`. Só use essa opção neste desenho, sem porta publicada e com entrada pelo túnel escolhido. A aplicação não confia em `X-Forwarded-For` arbitrário.

A interface é pública conforme decidido. Não configure Cloudflare Access sem mudar esse requisito.

## 5. Verificar após subir

- Container healthy; `/health` responde 200 para o processo e `/ready` responde 200 para conexão e leitura da view.
- `https://mapaeleitoral.sejafast.com/` abre a dashboard e os 139 municípios.
- Selecione Porto Nacional e clique em Faustino: 197 aptos, 149 presentes, 48 abstenções, 24,37%.
- Compare o resumo estadual de presidente: 1.182.023 aptos, 965.196 presentes, 216.827 abstenções.
- Endpoints `/.env`, `/server/index.ts` e `/api/raw_bu` não entregam arquivos ou dados.
- Chamadas inválidas retornam 400; mais de 120 chamadas de API por minuto por IP retornam 429.
- Reinicie somente o container da aplicação e repita readiness, dashboard e consulta de um local.

Se o banco estiver indisponível no momento do startup, a produção não abre a porta e o container reinicia. Uma perda posterior de conexão é tratada pelo pool; `/ready` fica 503 e volta a 200 após reconexão. Docker Standalone não reinicia automaticamente por status unhealthy: investigue a conexão pelo Portainer e acompanhe a recuperação.

## Rollback e atualização de dados

Mantenha a imagem anterior e troque apenas `APP_IMAGE` na stack para reverter uma versão. Esta entrega só adicionou uma view pública e uma role de leitura; não alterou dados importados ou schemas de outras aplicações. Não remova a role enquanto houver instâncias usando-a.

Depois de importar dados, reinicie a aplicação para invalidar imediatamente os caches (ou aguarde 60 segundos). Mudanças no cadastro/coordenadas exigem nova conferência; mudanças na malha exigem rebuild da imagem. Mantenha a senha de leitura fora do repositório e configure sua rotação pelo banco e Portainer em uma janela coordenada.
