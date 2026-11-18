# Tutorial progressivo de NAT/PAT

Abra **Labs → Tutorial progressivo — NAT/PAT** na lista de laboratórios.
O workspace abre uma nova tentativa em outro plano. Na interface legada,
a abertura segue o aviso existente de substituição da topologia.
O [planejamento original](planning/tutorial-progressivo-nat-pat.md) registra
a intenção pedagógica e as escolhas anteriores à implementação.

## Fluxo para o aluno

1. **Acesso funcionando.** Abra `http://198.51.100.80` no navegador de PC1.
   Inicie a captura antes do acesso para comparar os pacotes TCP dos dois
   lados do Router. Na ida, compare o IPv4 de origem. Na volta, compare o
   destino. O terminal do Router também mostra as associações com `conntrack -L`.
2. **Novo posto.** Ligue PC2 ao Switch LAN. Compare o ping local PC2 → PC1 e
   as tentativas de abrir a página nos dois PCs. Use **Verificar objetivos**
   antes de mudar o NAT. O tráfego de PC2 sai com a origem privada, para a
   qual o servidor não tem rota de retorno.
3. **Acesso compartilhado.** Edite a regra de saída no terminal do Router e
   verifique os objetivos. A verificação inicia duas conexões HTTP juntas
   e testa de novo a comunicação local. As duas respostas precisam chegar
   aos clientes corretos.

As dicas são recolhíveis e podem ser abertas uma de cada vez. Nas duas primeiras
etapas, a verificação libera o avanço e guarda a observação. Voltar serve para
revisá-la sem desfazer o cabo ou as regras. A última etapa pode ser verificada
novamente a qualquer momento. Os objetivos são resultados da última verificação.

## Topologia e critérios

PC1 `192.168.60.10/24` e PC2 `192.168.60.11/24` usam o gateway
`192.168.60.1`. Router Borda encaminha para a rede externa pela `eth1`,
`198.51.100.2/24`. O servidor `198.51.100.80/24` oferece HTTP/80 e não tem
rota para a LAN. A regra inicial de masquerade seleciona apenas PC1.

A checagem usa sockets HTTP novos no simulador ao apertar o botão. Associa
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
e não grava capturas.

No primeiro teste com aluno, observe se ele consegue encontrar a captura e
comparar os endereços nos dois sentidos. Peça que verifique a etapa 2 antes
de editar o NAT, pois a etapa exige observar a falha real de PC2. Se a regra
já foi corrigida, a comparação pode ser feita restaurando a regra inicial
ou abrindo outra tentativa pelo menu Labs.
