#!/bin/sh
# Executar no servidor via SSH. Não imprime variáveis, tokens ou senhas.
set -eu
docker ps --format '{{.Names}} | {{.Image}} | {{.Networks}}'
docker inspect postgres_main --format '{{json .NetworkSettings.Networks}}'
docker network ls --format '{{.Name}} | {{.Driver}} | {{.Scope}}'
