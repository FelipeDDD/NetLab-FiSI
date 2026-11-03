# Aprendizagem guiada — direção proposta

## Objetivo

Evoluir o NetLab para ensinar redes por tutoriais interativos, preservando os
exercícios tradicionais para diagnóstico e avaliação. O primeiro protótipo,
[Tutorial 01 — Erste Verbindung](tutorial-first-connection.md), publica apenas
cabo, IPv4 e ping em um rascunho normal. O progresso das oito etapas é recuperado
após F5 por metadados vinculados ao rascunho; processos ativos não são restaurados.

## Progressão

1. Começar pelas ferramentas do NetLab: selecionar e configurar dispositivos,
   conectar cabos, usar o Inspector, terminal, ping e observação de pacotes.
   Apresentar caminhos pela interface e pela CLI gradualmente.
2. Cada etapa deve propor uma ação ou descoberta, seguindo o ciclo
   **experimentar → observar → responder → compreender → corrigir**.
3. Respostas erradas são oportunidades de explicação, sem reprovação; explicar
   o raciocínio, permitir continuar e distinguir evidência de suposição.
4. Depois, oferecer variações para prática independente, retirando as dicas
   progressivamente. Evitar exercícios redundantes e tarefas em que uma única
   alteração resolve vários objetivos sem ensinar as decisões envolvidas.
5. Manter cenários tradicionais de diagnóstico e avaliação ao lado dos tutoriais.

## Primeiro candidato futuro: E09 — ARP oder Gateway?

- Começar com a máscara /23 e pedir um ping ao Archiv.
- Observar a falha e a decisão local de entrega, sem antecipar a correção.
- Perguntar sobre pertencimento à subnet e resolução ARP; aceitar respostas
  erradas e explicar a diferença entre cálculo de subnet e alcance real do link.
- Mostrar por que Büro tenta ARP diretamente com /23, embora o Archiv esteja
  no outro segmento físico do plano; explicar a necessidade do gateway.
- Corrigir para /24, repetir o teste e comparar a decisão e o resultado.

O roteiro deve ser validado contra a topologia e as evidências reais. Não inferir
causas ausentes. Não alterar os critérios, IDs, versões ou progresso do E09
publicado para acomodar o tutorial; definir seu contrato antes de implementar.

## Incrementos e limites

Primeiro validar um roteiro curto com revisão humana; depois discutir estado
das etapas, recuperação e variações. Reutilizar observação, terminal e avaliação
existentes quando apropriado, sem criar outra engine ou antecipar arquitetura.

O painel dos exercícios com canvas e o tutorial compartilham arraste pelo
cabeçalho e reset de posição. A posição é transitória e limitada à área visível;
não entra no progresso ou no documento. Rechenpraxis conserva seus controles
próprios. Referências: [piloto prático](practical-exercises-beta.md) e
[usabilidade atual](exercise-usability.md).
