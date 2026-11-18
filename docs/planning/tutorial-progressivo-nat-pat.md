# Tutorial progressivo de NAT/PAT — planejamento PT-BR

**Objetivo.** Entender como um Router traduz o endereço de origem ao sair da LAN, quais clientes uma regra cobre e como as respostas voltam ao cliente certo quando duas conexões compartilham o endereço externo.

## Cenário e mudança

```text
PC1 ── Switch LAN ── Router Borda ── Servidor Web
          │          eth0     eth1
         PC2
   (entra na etapa 2)
```

Na LAN `192.168.60.0/24`, PC1 usa `.10`, PC2 usa `.11` e o gateway dos PCs é `192.168.60.1` (Borda, `eth0`). Na rede externa simulada `198.51.100.0/24`, o Borda usa `198.51.100.2` em `eth1` e o servidor atende em `http://198.51.100.80`. O servidor não tem caminho de retorno para a LAN privada. Endereços estáticos e acesso por IP deixam DHCP e DNS fora da atividade.

No início, só PC1 está presente. O encaminhamento IPv4 está ativo, os enlaces estão operacionais, o HTTP responde e uma regra de `masquerade` cobre `192.168.60.10/32` na saída `eth1`. Na etapa 2, conectar PC2 ao Switch com seu endereço e gateway já configurados. A regra continua igual. PC2 alcança PC1 na LAN e seu tráfego pode chegar ao servidor com origem privada, mas a resposta fica sem rota de retorno. Essa diferença deve emergir da simulação e ser confirmada com tráfego real durante a futura validação.

## Etapas

| Etapa | Enunciado para o aluno | Aprendizagem e observação | Verificação |
| --- | --- | --- | --- |
| 1. Acesso funcionando | Abra a página externa a partir do PC1. Observe como a conexão sai da LAN e como a resposta chega ao PC. | A página abre. A demonstração explica que o NAT de origem faz o servidor ver o endereço externo do Router e que o Router usa o mapeamento da conexão para devolver a resposta ao PC1. Mostrar a tradução com as ferramentas existentes, conforme a evidência disponível. | Uma conexão HTTP do PC1 recebe o conteúdo esperado do servidor externo. |
| 2. Novo posto | Um segundo PC chegou à oficina. Compare o acesso local e o acesso à página externa a partir dos dois PCs. | PC2 alcança PC1, mas só PC1 abre a página. A comparação separa a conectividade local do acesso externo. O aluno pode inspecionar endereços, interfaces, pacotes e a configuração do Router na ordem que preferir. | Confirmar a diferença real com ping local bem-sucedido e novas tentativas HTTP dos dois PCs antes da correção. A observação do cenário é formativa e pode ser retomada sem exigir provocar a falha de novo. |
| 3. Acesso compartilhado | Ajuste a configuração para que os dois PCs abram a página ao mesmo tempo. Confira também se eles continuam se comunicando na LAN. | A regra passa a atender os dois clientes. Na revisão final, explicar que o PAT usa portas para distinguir conexões quando elas compartilham um IP externo e que o tráfego de resposta é associado ao cliente correspondente. | Duas novas sessões HTTP, com sobreposição real, entregam o conteúdo esperado aos respectivos PCs. Um novo teste local continua funcionando. |

## Ajuda opcional

- **Comparar.** Qual teste funciona nos dois PCs? Qual produz resultados diferentes? Você pode comparar os mesmos destinos a partir de cada posto.
- **Entender a regra.** SNAT altera a origem. `Masquerade` é uma forma de SNAT que usa o endereço da interface de saída. Uma regra pode selecionar um endereço ou um prefixo inteiro. `/32` seleciona um endereço, que ainda pode abrir várias conexões.
- **Inspecionar.** Compare os IPs dos dois PCs com o campo de origem e a interface de saída da regra. Se a captura mostrar os dois lados do Router, compare também o endereço de origem que sai em cada tentativa.

Mostrar as ajudas sob demanda, sem fornecer um comando pronto. Usar canvas, Inspector, terminais e ferramentas de captura já disponíveis. Exploração, pedidos de ajuda e reflexões opcionais ficam fora da avaliação. Aceitar, por exemplo, uma segunda regra `/32`, uma regra para o prefixo da LAN ou SNAT equivalente, desde que o acesso simultâneo funcione e os endereços, enlaces, serviço e acesso local sejam preservados.

## A confirmar no checkout atualizado

- **Tráfego e topologia.** Validar os gateways, a ausência de retorno para origem privada e o HTTP real. Confirmar a criação ou ativação de PC2 com as APIs existentes, preservando a configuração da tentativa ao retomar ou reiniciar. A entrada do PC2 muda a topologia. Sucesso e falha vêm dos pacotes e das respostas reais.
- **NAT e PAT.** Confirmar a correção de PAT da escola com dois clientes usando a mesma porta de origem para o mesmo servidor e porta. Verificar tradução reversa e entrega ao cliente certo. Nas verificações após a edição da regra, usar sessões novas para evitar resultados de Conntrack ou HTTP anteriores.
- **Recursos existentes.** Conferir onde já é possível ler e editar a regra e observar ida, volta e origem traduzida. Usar a demonstração disponível para ensinar o conceito e registrar lacunas de evidência antes de propor qualquer ferramenta visual adicional.
- **Concorrência.** O `runChecks` local é sequencial. Confirmar se a versão atualizada permite iniciar duas sessões sobrepostas e associar cada resposta à sua tentativa. Dois acessos sequenciais podem confirmar acesso individual. O critério de simultaneidade requer sobreposição real.

O protótipo usa roteamento IPv4, NAT/PAT e HTTP. Server multifuncional, DHCP Relay e Modem Bridge ficam fora deste cenário. O plano aguarda a versão atualizada para validação técnica.

## Implementação de 18/11/2026

O tutorial está no menu Labs. A topologia segue este plano com uma adaptação:
PC2 aparece desde o início com endereço e gateway configurados, mas fica
desconectado até o aluno ligar seu cabo na etapa 2. A própria tentativa
registra a conexão, as alterações de NAT e os objetivos verificados.

A verificação final abre dois sockets de uma vez e confirma o conteúdo
recebido por cada PC e as portas externas no Conntrack. A captura e a
listagem do Conntrack continuam disponíveis para observação manual.
Consulte [o guia do tutorial](../progressive-nat-pat.md) para o fluxo, os
testes e os limites observados na implementação.
