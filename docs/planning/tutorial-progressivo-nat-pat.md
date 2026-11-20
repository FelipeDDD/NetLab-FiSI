# Tutorial progressivo de NAT/PAT — planejamento PT-BR

Este documento registra o planejamento original. O [guia do tutorial guiado](../progressive-nat-pat.md) descreve a versão atual, inclusive a entrada pelo menu e a criação do segundo Host pelo aluno.

**Objetivo.** Entender como um Router traduz o endereço de origem ao sair da LAN, quais clientes uma regra cobre e como as respostas voltam ao cliente certo quando duas conexões compartilham o endereço externo.

## Cenário e mudança

```text
PC1 ── Switch LAN ── Router Borda ── Servidor Web
          │          eth0     eth1
         PC2
   (entra na etapa 2)
```

Na LAN `192.168.60.0/24`, PC1 usa `.10`, PC2 usa `.11` e o gateway dos PCs é `192.168.60.1` (Borda, `eth0`). Na rede externa simulada `198.51.100.0/24`, o Borda usa `198.51.100.2` em `eth1` e o servidor atende em `http://198.51.100.80`. O servidor não tem caminho de retorno para a LAN privada. Endereços estáticos e acesso por IP deixam DHCP e DNS fora da atividade.

O plano previa apenas PC1 no início, com encaminhamento IPv4 ativo, enlaces operacionais, HTTP disponível e uma regra de `masquerade` para `192.168.60.10/32` na saída `eth1`. Na etapa 2, a proposta era conectar PC2 ao Switch com endereço e gateway já configurados. A regra inicial permitiria observar a diferença com tráfego real: PC2 alcançaria PC1 na LAN, mas o servidor externo ficaria sem rota de retorno para a origem privada.

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

## Questões técnicas do planejamento original

Na época, faltava conferir no checkout da escola como adicionar PC2, observar a tradução e testar duas conexões sobrepostas. A implementação guiada usa o Host criado pelo aluno, compara os SYN na captura e verifica duas conexões HTTP novas pelo Conntrack. Os [testes do cenário](../../src/labs/progressiveNatPat.test.ts) cobrem a falta de rota de retorno e a entrega das respostas aos clientes após a correção. A revisão pedagógica com aluno está indicada no [contexto de continuidade](../CONTEXTO_CONTINUIDADE.md).

## Primeira implementação em Labs (18/11/2026)

Na primeira implementação, o tutorial abria pelo menu Labs. PC2 já estava
configurado e o aluno conectava seu cabo na etapa 2.
