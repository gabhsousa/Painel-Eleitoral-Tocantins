# Revisão e organização do código

Revisão de 15/10/2026. As correções estão no workspace local; publicação e deploy são etapas separadas.

## Problemas corrigidos

| Prioridade | Achado                                                                                                                                                                                                     | Correção e verificação                                                                                                                                                                        |
| ---------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| P1         | Uma atualização do cache absorvia a falha do banco. Se outra requisição chegasse após os cinco minutos enquanto essa atualização ainda estava pendente, ela podia receber uma resposta vazia como sucesso. | `QueryCache` mantém a promessa original rejeitável; o tratamento de erro em segundo plano é separado. Teste cobre a travessia da expiração, resposta 503 e recuperação na tentativa seguinte. |
| P2         | Locais com métrica ausente podiam entrar como zero na média de pontos com as mesmas coordenadas, alterando a taxa exibida.                                                                                 | `heatData.ts` ignora métricas ausentes/inválidas. Testes verificam ponderação por aptos e por votos nominais.                                                                                 |
| P2         | Escala com mínimo, média ou máximo coincidentes podia dividir por zero. O fallback usava números fixos de uma carga anterior.                                                                              | Normalização finita para escalas degeneradas; fallback calculado com os pontos disponíveis.                                                                                                   |
| P2         | A aba do construtor mantinha consultas e antecipação de cores exclusivas da dashboard ativas.                                                                                                              | Consultas de exploração ficam em `ExplorerPage`, montada apenas na aba correspondente. A seleção continua no estado de `App` ao trocar de aba.                                                |
| P3         | Cálculo, desenho, configuração, composição e persistência estavam concentrados em poucos arquivos compactados.                                                                                             | Módulos separados por responsabilidade, formatação consistente e TypeScript recusando variáveis/parâmetros sem uso.                                                                           |
| P3         | CSS de versões anteriores do construtor, relatórios de auditoria e arquivos brutos do IBGE estavam misturados ao código ativo ou aos assets públicos.                                                      | Removidos seletores obsoletos; relatórios históricos preservados localmente em `reports/legacy`, ignorados pelo Git/Docker; fontes brutas movidas para `data/ibge`.                           |

## Organização e desempenho

- `src/app`, `src/features`, `src/shared` e `src/styles` separam aplicação, funcionalidades, código compartilhado e estilos.
- O construtor é carregado sob demanda. O arquivo JavaScript inicial passou de **439.920 para 401.910 bytes**, redução de aproximadamente **8,6%** sem gzip. O construtor tem um chunk separado de aproximadamente 39,7 KB; isso redistribui o carregamento, não reduz o total de código na mesma proporção.
- Cards independentes são memoizados. Alterar título ou posição de um card não obriga os demais mapas a executar novamente seu componente.
- `HeatRenderer` reaproveita kernels e superfície intermediária e aplica a paleta apenas ao retângulo tocado pelos pontos visíveis. Projeção, raio geográfico e comportamento de ocultar calor subpixel foram preservados.
- `server/routes`, `server/http` e `server/cache` separam consultas, validação/transporte e cache. `createApp` permite testar o servidor sem abrir portas; `index` cuida da inicialização e das verificações de produção.
- Testes locais e de integração ficaram em diretórios distintos. Scripts de banco, preparação da malha e benchmark têm pastas próprias.
- `npm run check` executa tipos, formatação e testes locais. O workflow de CI também compila frontend e backend sem credenciais.

## Validação

- 22 testes locais passaram, incluindo regressões de cache, limites de concorrência, segurança HTTP, ponderação do calor e restauração de rascunhos.
- Os builds de frontend e backend passaram.
- 7 testes de integração passaram contra o servidor compilado em modo produção, além das verificações de totais e locais: SQL com fixtures de leitura, cabeçalhos, filtros, credencial restrita, ausência de senhas no bundle, recusa da conta administrativa e limite por IP.
- O benchmark comparou todos os registros das rotas reorganizadas com a rodada anterior pelo túnel de leitura; os resultados coincidiram, incluindo a consulta unificada de participação.
- Conferência no navegador: carregamento do heatmap, filtro de Palmas, ruas, painel de dados, dashboard e retorno entre abas com a composição restaurada.

As consultas e permissões do PostgreSQL não foram modificadas nesta reorganização. Os endpoints antigos de calor e escala foram mantidos por compatibilidade. O desenho continua sendo um heatmap com kernels suaves; esta revisão não muda a metodologia para interpolação territorial.
