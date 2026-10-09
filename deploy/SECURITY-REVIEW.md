# Revisão básica de segurança — 09/10/2026

Destino: `https://mapaeleitoral.sejafast.com`. Publicação ainda pendente.

## Proteções aplicadas

- Conta exclusiva `eleitoral_to_readonly`, com SELECT em seis views públicas; sem escrita, acesso às tabelas brutas, privilégios administrativos ou acesso aos dados de outras aplicações.
- Produção verifica as permissões antes de abrir a porta; recusa a credencial administrativa anterior.
- Pool limitado, timeouts, consultas parametrizadas, filtros validados, paginação, cache limitado e controle de consultas simultâneas.
- Headers de segurança e CSP, limite de 120 chamadas por minuto/IP, erros sem detalhes internos, arquivos privados bloqueados e desligamento controlado.
- Dependência vulnerável atualizada; auditoria de dependências de produção sem vulnerabilidades conhecidas no momento da revisão.
- Senhas em arquivos locais restritos, excluídos da imagem e do pacote de entrega. A senha administrativa antiga não é usada pela aplicação.
- Dockerfile com execução sem root; Compose com filesystem somente leitura, limites de recursos e sem portas publicadas.

## Verificação

Builds frontend e backend concluídos. Servidor compilado em produção iniciado com o banco real pelo túnel SSH. Testes verificam headers, rotas privadas, parâmetros inválidos, permissões reais do banco, ausência de senhas no bundle, rejeição de conta administrativa e limite de chamadas sem confiar em X-Forwarded-For arbitrário. Consultas e correspondência da malha também verificadas.

## Pendências para publicação

Configurar e validar a conexão privada da VPS ao banco no sv01 e identificar a rede do único Cloudflare Tunnel da VPS. Construir e testar a imagem no servidor (Docker indisponível nesta máquina), configurar a stack e cadastrar o hostname no túnel. Depois, conferir HTTPS, readiness, consultas e reinício conforme `DEPLOY.md`.
