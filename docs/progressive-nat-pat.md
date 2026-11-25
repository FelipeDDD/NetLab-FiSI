# Tutorial progressivo de NAT/PAT

Abra **Übungen (Beta) → Geführte Tutorials → Tutorial progressivo — NAT/PAT**.
O workspace abre uma nova tentativa em outro plano. Se já houver um rascunho
do tutorial aberto, o menu oferece também a opção de continuar.
O [planejamento original](planning/tutorial-progressivo-nat-pat.md) registra
a intenção pedagógica e as escolhas anteriores à implementação.

## Fluxo para o aluno

1. **Acesso funcionando.** A primeira tela apresenta NAT, pede iniciar a captura em todos os enlaces e abrir a página externa no navegador de PC1. Cada ação recebe confirmação junto da instrução. O HTTP é confirmado pela resposta real do navegador, sem sonda adicional. **Avançar** abre a comparação.
   Na segunda tela, o aluno identifica primeiro a origem local do SYN e depois a origem externa. A verificação usa o vínculo registrado na captura entre o SYN recebido e o encaminhado pelo Router. Os registros continuam disponíveis ao pausar ou encerrar a captura. Após F5 ou reabertura de um plano, as respostas já verificadas são preservadas enquanto a configuração corresponder. Se ainda faltar uma resposta, inicie uma nova captura em todos os enlaces e reabra a página no PC1. A confirmação de captura ativa acompanha o estado atual da ferramenta.
2. **Novo posto.** Adicione um Host Linux ou Windows e conecte-o ao Switch LAN. Configure 192.168.60.11/24 e gateway 192.168.60.1 no Inspector ou use os comandos de endereço e rota do terminal Linux. O tutorial confere a interface e a rota efetiva. O CMD simulado usa o Inspector para atribuir IPv4 estático. A associação guarda o ID do Host e preserva seu nome.
   Após o Echo Reply real entre os PCs, a etapa mostra as duas tentativas HTTP pendentes. O tutorial associa cada resultado ao socket da requisição no Conntrack. A comparação só é válida enquanto a configuração observada continua em uso.
3. **Acesso compartilhado.** Ajuste o NAT para incluir PC2, reabra a página no navegador dele e aguarde a confirmação da nova conexão traduzida. Abra **Router Borda → Firewall → Conntrack** e observe a tabela enquanto executa **Verificar HTTP dos dois PCs**. A conclusão aparece quando a verificação confirma duas conexões HTTP traduzidas em paralelo. O ping local é comprovado na etapa 2.

O painel e a abertura da tentativa usam a infraestrutura dos tutoriais guiados. A tela interna, a associação do Host e os comprovantes continuam nos campos de progresso da topologia. Tentativas salvas na época em que o tutorial aparecia em Labs abrem no painel guiado, incluindo documentos JSON. Uma assinatura da configuração acompanha as verificações. Mudanças técnicas exigem novas provas. Resultados antigos sem assinatura permanecem armazenados, mas devem ser verificados novamente. A posição dos dispositivos não invalida as provas.

Na etapa 3, três telas apresentam NAT e firewall, a ilustração da regra nftables e a atividade prática. O botão **Abrir imagem** usa o visualizador dos demais capítulos. A ilustração está em PT-BR.

## Alterar NAT no Router Borda

Ao voltar às etapas anteriores, as duas respostas SYN verificadas e a comparação HTTP completa permanecem como registros da configuração observada. Se ainda faltar comprovar a falha de PC2 e seu navegador já receber HTTP, restaure a regra NAT inicial ou abra uma nova tentativa para repetir a comparação.

A aba **Firewall** do **Router Borda** exibe o ruleset. Para incluir toda a LAN, clique em **Adicionar regra NAT**, selecione `eth1`, informe `192.168.60.0/24` e confirme. O formulário mostra a ação `masquerade`, a cadeia e os comandos equivalentes para copiar. Em um Router novo, a primeira inclusão prepara a tabela IPv4 NAT e a cadeia `postrouting`.

O cenário já fornece a tabela e a cadeia. No terminal Linux do Router, `nft list ruleset` mostra a mesma configuração do Inspector. O comando equivalente para incluir toda a LAN e manter a regra de PC1 é:

```sh
nft add rule ip nat postrouting oifname "eth1" ip saddr 192.168.60.0/24 masquerade
```

`oifname` (Output Interface Name) seleciona a interface de saída, `ip saddr` (IPv4 Source Address) seleciona o endereço ou prefixo de origem, e `masquerade` usa o IPv4 da interface de saída para a tradução. Também vale adicionar uma regra só para o IPv4 de PC2. Confira a regra adicionada com `nft list ruleset` e retome o teste no navegador de PC2.

Se quiser deixar apenas a regra abrangente, use `nft -a list ruleset` após adicioná-la e remova a regra antiga de PC1 com `nft delete rule ip nat postrouting handle <número>`. Use o número da regra de PC1 mostrado no terminal. O simulador aceita adicionar, inserir no início e excluir regras por handle. `nft replace rule` está fora do subconjunto implementado.

## Topologia e critérios

PC1 `192.168.60.10/24` e PC2 `192.168.60.11/24` usam o gateway
`192.168.60.1`. Router Borda encaminha para a rede externa pela `eth1`,
`198.51.100.2/24`. O servidor `198.51.100.80/24` oferece HTTP/80 e não tem
rota para a LAN. A regra inicial de masquerade seleciona apenas PC1.

Na etapa 2, a checagem observa as requisições feitas pelo navegador. Na
etapa 3, o botão de verificação abre dois sockets HTTP novos no simulador.
O tutorial associa cada resposta à porta local do socket e confirma a tradução no Conntrack do
Router. Na etapa final, ambos os fluxos precisam usar o IPv4 externo com
portas distintas. Uma regra mais abrangente, uma segunda regra para PC2
ou SNAT para o IPv4 da interface são aceitos. Obter HTTP por uma rota de
retorno sem tradução não comprova NAT. A verificação de concorrência é ativa e
gera tráfego próprio. Os objetivos individuais observam as ações do aluno.

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
verificações, o visualizador em desktop e viewport compacto, o F5, a revisão de etapas e o Save/Load. Pode ser executado
no PowerShell com `$env:NETLAB_PROGRESSIVE_NAT_REVIEW='1'` seguido de
`node scripts/test-project-repository.mjs`. O roteiro usa banco descartável.

No primeiro teste com aluno, observe se ele consegue encontrar a captura e
comparar os endereços nos dois sentidos. Peça que verifique a etapa 2 antes
de editar o NAT, pois a etapa exige observar a falha real de PC2. Se a regra
já foi corrigida, a comparação pode ser feita restaurando a regra inicial
ou abrindo outra tentativa pelo menu de tutoriais guiados.
