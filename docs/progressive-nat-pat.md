# Tutorial progressivo de NAT/PAT

Abra **Labs → Tutorial progressivo — NAT/PAT** na lista de laboratórios.
O workspace abre uma nova tentativa em outro plano. Na interface legada,
a abertura segue o aviso existente de substituição da topologia.
O [planejamento original](planning/tutorial-progressivo-nat-pat.md) registra
a intenção pedagógica e as escolhas anteriores à implementação.

## Fluxo para o aluno

1. **Acesso funcionando.** A primeira tela apresenta NAT, pede iniciar a captura em todos os enlaces e abrir a página externa no navegador de PC1. Cada ação recebe confirmação junto da instrução. O HTTP é confirmado pela resposta real do navegador, sem sonda adicional. **Próximo** abre a comparação.
   Na segunda tela, o aluno identifica primeiro a origem local do SYN e depois a origem externa. A verificação usa o vínculo registrado na captura entre o SYN recebido e o encaminhado pelo Router. A evidência continua válida após pausar ou encerrar a captura e após a expiração do Conntrack. As respostas completas aparecem após acertar. Se faltarem registros na captura, abra a página novamente com a captura ativa em todos os enlaces.
2. **Novo posto.** O cenário novo começa sem PC2. Adicione um Host Linux ou Windows, configure 192.168.60.11/24 e Gateway 192.168.60.1 pelo Inspector e conecte-o ao Switch LAN. A associação guarda o ID do Host no progresso existente. O nome existente é preservado e aparece junto de PC2. Se houver vários candidatos, o tutorial pede resolver a ambiguidade.
   Verificações contextuais comprovam ping de PC2 para PC1, HTTP traduzido de PC1 e uma nova falha externa de PC2, nessa ordem. Cada botão gera tráfego real. As dicas aparecem após as ações.
3. **Acesso compartilhado.** A explicação esclarece a abrangência da regra inicial. O aluno adapta o NAT e verifica HTTP concorrente e comunicação local por botões separados. O verificador existente confere sockets novos e Conntrack. A explicação de PAT menciona portas externas distintas e remapeamento conforme a necessidade.

Tela interna, associação do Host e comprovantes usam os campos existentes de progresso do Lab. Uma assinatura da configuração acompanha as verificações. Mudanças técnicas exigem novas provas. Resultados antigos sem assinatura permanecem armazenados, mas devem ser verificados novamente. A posição dos dispositivos não invalida as provas. Tentativas antigas com PC2 pronto continuam utilizáveis.

## Topologia e critérios

PC1 `192.168.60.10/24` e PC2 `192.168.60.11/24` usam o gateway
`192.168.60.1`. Router Borda encaminha para a rede externa pela `eth1`,
`198.51.100.2/24`. O servidor `198.51.100.80/24` oferece HTTP/80 e não tem
rota para a LAN. A regra inicial de masquerade seleciona apenas PC1.

Nas etapas 2 e 3, a checagem usa sockets HTTP novos no simulador ao apertar cada botão. Associa
cada resposta à porta local do socket e confirma a tradução no Conntrack do
Router. Na etapa final, ambos os fluxos precisam usar o IPv4 externo com
portas distintas. Uma regra mais abrangente, uma segunda regra para PC2
ou SNAT para o IPv4 da interface são aceitos. Obter HTTP por uma rota de
retorno sem tradução não comprova NAT. As verificações são ativas, então
geram tráfego próprio além das tentativas manuais.

O cabo, as regras, a etapa e os resultados persistem no documento de Lab
existente com Save/Load, JSON e autosave. Sockets, caches e Conntrack são
transitórios. O tutorial usa a rede externa diretamente ligada ao Router
para facilitar a comparação. O cenário separado de Internet simulada
continua disponível para praticar DNS e Modem Bridge.

## Validação

Os testes enviados ao Scheduler cobrem o retorno ausente, a comunicação
local, duas conexões com a mesma porta de origem, duas portas externas
distintas, SNAT equivalente e a rejeição de HTTP roteado sem NAT. Também
verificam que remover a correção volta a falhar em conexões novas mesmo
com associações anteriores ativas.

O roteiro Chromium valida o menu, as dicas, os bloqueios antes das
verificações, o F5, a revisão de etapas e o Save/Load. Pode ser executado
no PowerShell com `$env:NETLAB_PROGRESSIVE_NAT_REVIEW='1'` seguido de
`node scripts/test-project-repository.mjs`. O roteiro usa banco descartável
e grava uma captura representativa em .playwright-mcp/reviews/nat-pat-refinement/comparacao.png.

No primeiro teste com aluno, observe se ele consegue encontrar a captura e
comparar os endereços nos dois sentidos. Peça que verifique a etapa 2 antes
de editar o NAT, pois a etapa exige observar a falha real de PC2. Se a regra
já foi corrigida, a comparação pode ser feita restaurando a regra inicial
ou abrindo outra tentativa pelo menu Labs.
