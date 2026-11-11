# Kapitel 5 · Alternative Wege — edição v5

Tutorial independente em Übungen (Beta) → Geführte Tutorials. O início abre
rascunho próprio; retomar e abrir rede preservam a tentativa. Nova tentativa
oferece início, Parte 2 e Parte 3. Contratos e persistência estão detalhados em
[chapter-entry-points.md](chapter-entry-points.md).

## Estrutura — 16 tarefas, 4 + 9 + 3

| Parte | Tarefas | Objetivo |
|---|---|---|
| 1 · Vizinhos | 1–3 | Endereçar os três enlaces e obter respostas nos seis sentidos |
| | 4 | Distinguir rede conectada e remota para R1 |
| 2 · Via R2 | 5–6 | Configurar LAN A, LAN B e gateways |
| | 7 | Investigar o ping sem rota em R1 |
| | 8–9 | Completar ida para LAN B em R1/R2 |
| | 10 | Observar o retorno sem antecipar sua falha |
| | 11–12 | Completar retorno e comprovar A/B via R2 |
| | 13 | Identificar o Next Hop efetivo |
| 3 · Alternativa | 14 | Tempestade única em R2–R3 e ping real para observar a falha |
| | 15 | Recuperar ida/retorno pelo enlace direto, com dois checkpoints |
| | 16 | Novos pings reais nos dois sentidos e conclusão |

Os três routers mantêm encaminhamento ativo e RIP desativado. Endereços transit:

| Enlace | Primeira interface | Segunda interface |
|---|---|---|
| R1–R2 | R1 eth0 10.0.12.1/30 | R2 eth0 10.0.12.2/30 |
| R2–R3 | R2 eth1 10.0.23.1/30 | R3 eth0 10.0.23.2/30 |
| R1–R3 | R1 eth1 10.0.13.1/30 | R3 eth1 10.0.13.2/30 |

PC A conecta a R1 eth2 em 192.168.10.0/24; PC B a R3 eth2 em
192.168.20.0/24. Endereços válidos únicos e gateways locais efetivos são
verificados. Configuração inicial e posições das Partes 1/2 foram preservadas.
Não se cria PC C, não se configura R3 eth3 e não há rotas LPM fornecidas.

## Evidências e incidente

O baseline passa da antiga tarefa 19 para a transição verificada 13 → 14.
O cenário direto de tarefa 14 tem baseline técnico próprio, sem pings fornecidos.
O incidente desativa R2 eth1 atomicamente com seu marcador, preservando cabo e
configuração. Correções/F5/navegação não reaplicam a falha. Reinício explícito
restaura o ponto escolhido, incluindo o cenário anterior ao incidente.

Ping de falha deve percorrer A → R1 → R2; timeout isolado não identifica a causa.
Recuperação exige rotas efetivas corretas para ambas as LANs completas, não só
endereços /32 dos PCs. Aceita ip route replace ou del + add equivalentes.
Novas respostas e caminhos reais devem comprovar A → R1 → R3 → B e o inverso.
Fonte do comando, rede, ICMP ID, sequência e configuração vinculam a evidência.
Texto de terminal, probes API, outro ping ou apenas tabela correta não concluem.

Configuração atual, tarefa histórica e conclusão integral permanecem distintas.
Revisão não substitui recibos antigos por provas incompletas nem refaz o baseline.
DE/EN/PT-BR mantêm ajuda recolhida quando útil e âmbar somente na sintaxe.

## Compatibilidade e limites

chapterVersion 5 e namespaces v5 isolam progresso, checkpoint, seleção e histórico.
Registros e topologias antigos não são apagados; suas redes continuam editáveis,
sem execução automática ou reinício pelo novo contrato. Não há migração das 22
tarefas nem transferência de conclusão integral para v5. Capítulos 1–4 intactos.

abSignature foi movida de alternativeLpm.ts para alternativePathsChapter.ts.
O experimento removido permanece recuperável no histórico Git até 8d13379.
Não foi criado framework ou capítulo LPM; seu futuro cenário poderá comparar
rota abrangente direta e rota mais específica por quatro/cinco saltos.
lookupRoute e a validação de prefixos IPv4 canônicos permanecem inalterados.

Como antes, commitDocument reativa a simulação consistente e encerra processos
transitórios; não restaura pings em andamento. Preserva configurações, UI e
histórico instalado. Histórico de aprendizagem é local e não acompanha JSON.
Configurações incompatíveis com o baseline bloqueiam o incidente sem reparo
automático. Undo/Redo não persiste após recarregar o navegador.

## Verificação

Executar Vitest, node scripts/test-alternative-paths-tutorial.mjs, TypeScript,
npm run build e git diff --check. Perfis/bancos de teste são descartáveis.
Capturas em .playwright-mcp/reviews/chapter5-v5/referencias-chatgpt/.
