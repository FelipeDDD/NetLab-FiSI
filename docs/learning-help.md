# Ajuda contextual — primeira página

**Hilfe → IPv4 konfigurieren** abre uma página modal sobre endereço, máscara/CIDR,
gateway e configuração pelo Inspector e terminal. O link junto ao editor IPv4 abre
a mesma página. Fechar por Escape, X, fundo ou “Zurück zum Editor” restaura o foco
ao controle de origem, sem abrir plano ou substituir o canvas.

`LearningHelpProvider` mantém uma única página aberta, com estado apenas em memória.
`LearningHelpLink` e `useLearningHelp().open(page, origin)` são as entradas contextuais;
o ID inicial é `ipv4`. Novas páginas podem ampliar esse contrato sem criar navegação
de topologias. O modal segue o padrão de `TerminalCommandReference`: dialog nativo,
portal no body, foco contido, retorno de foco e rolagem interna. Textos seguem os
catálogos DE/EN/PT-BR existentes.

## Exemplos e limites confirmados no código

- Linux: `ip address show` consulta; `ip address add 192.0.2.10/24 dev eth0`
  configura somente uma interface ainda sem IPv4. Há um endereço por interface;
  o comando não define gateway ou DNS. Para editar um endereço existente, a página
  recomenda o Inspector e não promete suporte a `ip address replace`.
- `ip route` consulta a tabela; `ip route add default via 192.0.2.1 dev eth0`
  adiciona a rota padrão genérica. A ajuda distingue endereço/máscara, o Next Hop
  local e a rota usada quando não há correspondência mais específica. `dev` é a
  interface de saída do próprio dispositivo. O comando não preenche o campo Gateway
  do Inspector. Os exemplos de terminal usam a rede de documentação, sem valores
  da solução do tutorial; comandos continuam selecionáveis, com destaque âmbar.
- Windows: `ipconfig /all` consulta. A configuração estática por `netsh` não existe
  neste CMD simulado; a página encaminha ao Inspector.
- Os comandos aparecem como texto selecionável e nunca são executados pela ajuda.
  O exemplo usa /24, conforme a convenção IPv4 do projeto.

Não há nova persistência, tutorial, avaliação ou alteração do E09. A proposta de
aprendizagem progressiva continua em [guided-learning-roadmap.md](guided-learning-roadmap.md).
