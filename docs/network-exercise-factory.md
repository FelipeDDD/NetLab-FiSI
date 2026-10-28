# Fábrica interna de exercícios de Netzwerk

Estado: protótipo de autoria, versão 1. **20 novos drafts; nenhum publicado.** Material original para revisão pedagógica de FiSI, sem pretensão de ser conteúdo oficial ou validado pela IHK.

O catálogo legível completo, com enunciados alemães, dados, soluções, alternativas, erros e critérios, está em [network-exercise-catalog.md](network-exercise-catalog.md). Sua fonte é `src/exercises/factory/`; o Markdown pode ser regenerado, não editado separadamente.

## Auditoria e decisões

- `src/exercises/types.ts` já oferece `ExerciseDraft`, IDs/versões, objetivos, requisitos, critérios `engine`/`manual` e solução com `SaveFile`. Os oito drafts práticos reutilizam esse contrato integralmente. A extensão local só acrescenta grupo, formato e erros comuns.
- `src/exercises/validate.ts` valida estrutura, referências, topologias, interfaces completas, rotas e compatibilidade com a factory. O validador novo o chama para exercícios práticos; não replica as regras do engine.
- `src/labs/checker.ts` executa verificações reais de IPv4, default route, forwarding, firewall, ping, TCP, DNS e HTTP. Exercises usam `resolveBy: 'id'`; nomes editáveis não são identidade. Os Labs antigos continuam intactos.
- `iface-ip` com `inSubnet` verifica prefixo e pertencimento, **não** unicidade nem exclusão de rede/broadcast. Ping também não prova isso. C02/C04 têm uma etapa manual obrigatória; o auditor de endereços das referências não é apresentado como um novo verificador público.
- O checker não verifica toda a integridade da topologia nem o histórico do diagnóstico. Todos os práticos registram essa limitação; antes de publicação, preservar a topologia-base precisa de proteção ou revisão manual. Sucesso dos probes não deve virar automaticamente uma nota integral.
- `src/exercises/exerciseController.ts` executa tentativas do Beta; `beta.ts` importa apenas `betaStudents.json` e `betaChecks.json`. A publicação atual seleciona explicitamente dois exercícios antigos em `scripts/generate-exercise-beta.mjs`. Nada novo foi adicionado a essa seleção.
- Não existe formulário de respostas numéricas, máscara, intervalos ou plano VLSM no Übungen. O quiz de Labs é de múltipla escolha e não é reutilizado como um segundo sistema de exercícios.
- `engine/factory.ts` cria equipamentos e interfaces reais; `serializeNetwork`/`restoreNetwork` representam configurações e links. As referências usam instâncias isoladas de `Network`, sempre descartadas, sem store, navegador, IndexedDB ou sessão do usuário.
- Não foram alterados protocolos, Scheduler, DHCP, DNS, WLAN, Markierungen, UI ou persistência. As tarefas de cálculo nem sequer criam uma rede.

## Os 20 exercícios

IDs completos começam com `factory-`. B = beginner, I = intermediate, A = advanced.

| ID curto | Dificuldade | Objetivo distintivo | Avaliação disponível |
|---|---|---|---|
| a01-service-netz | B | /26: rede, broadcast, 64 endereços versus 62 hosts | Matemática pura |
| a02-werkstatt-hostbereich | B | /27: último host versus broadcast, limites de DHCP | Matemática pura |
| a03-sensor-maske | I | Máscara decimal → /28, sem entregar o prefixo no enunciado | Matemática pura |
| a04-kassen-kapazitaet | I | /29: seis equipamentos incluindo gateway, sem reserva | Matemática pura |
| a05-campus-oktett | A | /22: fronteiras atravessando o terceiro octeto | Matemática pura |
| a06-dmz-zugehoerigkeit | I | /27: pertencimento versus endereço utilizável | Matemática pura |
| b01-buero | I | Escritório: quatro demandas e desperdício mínimo | VLSM por restrições |
| b02-schule | A | Escola: crescimento de 25% e reserva futura separada | VLSM por restrições |
| b03-lager | A | Depósito: preservar uma instalação fixa /26 | VLSM por restrições |
| b04-filiale | A | Filial: preencher /26 incluindo dois trânsitos /30 | VLSM por restrições |
| b05-atelier | I | Atelier: crescimento seletivo e futura expansão /27 | VLSM por restrições |
| b06-fusion | A | Fusão: espaço fragmentado por duas reservas fixas | VLSM por restrições |
| c01-maskenfehler | B | Máscara errada apesar de pings locais funcionando | 9 probes reais |
| c02-neue-arbeitsplaetze | I | Dois hosts novos, escolhas livres dentro de /28 | 9 probes + controle manual de endereços |
| c03-falsches-netz | I | PC em outro /27 apesar do mesmo terceiro octeto | 9 probes reais |
| c04-adresskonflikt | I | Resolver IP duplicado; limpar ARP não é solução | 9 probes + controle manual de endereços |
| d01-default-gateway | B | Gateway local incorreto entre duas redes | 9 probes reais |
| d02-statische-routen | I | Dois routers, rotas de ida e volta, alternativas válidas | 10 probes reais |
| d03-forwarding | I | Firewall com três segmentos e forwarding desligado | 16 probes reais |
| d04-rueckweg-hostroute | A | Rota /32 obsoleta sobrepondo um default correto | 15 probes reais |

A/B são 12 exercícios sem topologia: as respostas estruturadas podem ser corrigidas agora, mas falta UI. C/D são oito topologias executáveis pelo motor, com **86 probes** no conjunto. C01/C03/D01–D04 têm critérios de configuração/conectividade automatizados; C02/C04 exigem também revisão manual de unicidade/host válido. A preservação ampla da topologia e a explicação do diagnóstico não são comprovadas automaticamente em nenhum caso.

## Arquivos e responsabilidades

| Arquivo em `src/exercises/factory/` | Responsabilidade |
|---|---|
| `types.ts` | Extensão de autoria, reutilizando contratos existentes |
| `math.ts` | IPv4, capacidade, VLSM, overlap, membership e correção pura |
| `generator.ts` | Cinco famílias determinísticas, receitas versionadas e instruções alemãs |
| `calculations.ts` | Seis fundamentais + seis cenários VLSM |
| `networkTools.ts` | Factory/serialização reais, helpers de autoria, auditor de referências |
| `practical.ts` | Quatro LANs com defeitos de endereçamento |
| `routing.ts` | Quatro diagnósticos de roteamento/forwarding |
| `catalog.ts` | Agregação interna dos 20 drafts |
| `validate.ts` | Estrutura e compatibilidade, sem alegar aprovação pedagógica |
| `math.test.ts` | Oráculo independente BigInt, 150 variantes e casos negativos |
| `network.test.ts` | Referências reais, falhas iniciais, alternativas, negativos e round-trip |
| `catalog.test.ts` | Contratos, isolamento do catálogo e entradas inválidas |

O CLI `scripts/validate-network-factory.mjs` usa o Vite já instalado em middleware/SSR, sem servidor HTTP. Não requer dependências novas. Por padrão só valida; `--catalog` escreve exclusivamente o Markdown do catálogo.

## Gerador e contratos de resposta

```ts
import { generate } from './src/exercises/factory/generator';
import { grade } from './src/exercises/factory/math';

const variant = generate({
  family: 'vlsm', // subnet | capacity | vlsm | overlap | membership
  difficulty: 'advanced', // beginner | intermediate | advanced
  seed: 'notebook-demo',  // opcional: default estável "netlab-default"
  version: 1,
});
const result = grade(variant.problem, submittedAnswer);
// { pass: boolean, issues: string[] }; correção global, sem notas parciais
```

`generate` é uma API **de autoria**: retorna receita, instrução, problema e referência. Não enviar esse objeto completo a uma futura tela de aluno. Os drafts matemáticos usam `student` e `review` separados; uma publicação futura deve projetar somente a parte do aluno.

| Família | Resposta estruturada |
|---|---|
| subnet | `{network, broadcast, prefix, mask, first, last, addresses, hosts}` |
| capacity | `{prefix, mask, hosts}`; hosts é a capacidade disponível, não a demanda |
| vlsm | `[{id, cidr}]`, uma rede alinhada por ID de demanda |
| overlap | `{pairs: ['1:3', ...]}`; índices começam em 1, menor primeiro, sem duplicados; `[]` se nenhum par |
| membership | `{candidateId: 'host' \| 'network' \| 'broadcast' \| 'outside', ...}` |

Números são números JSON; IPv4 usa escrita decimal canônica. Ordem das chaves, dos pares e das alocações não importa. Espaços externos em respostas escalares de texto são tolerados. Não há parser de texto livre ou respostas numéricas localizadas. O futuro formulário deve produzir esses tipos explicitamente.

A versão 1 usa hash FNV-1a da receita e PRNG LCG local, sem relógio, `Math.random` ou IA. Família/dificuldade/seed/versão determinam a variante. Seeds diferentes podem gerar o mesmo problema; não se promete unicidade. Três exemplos congelados nos testes protegem contra alterações acidentais da receita; mudanças de geração precisam de nova versão, mantendo a antiga legível.

As dificuldades mudam prefixos/capacidades e complexidade: VLSM avançado inclui reserva fixa; intermediário inclui crescimento; overlap inclui contenção em níveis superiores. São variações matemáticas, não um gerador de narrativas ou de topologias arbitrárias.

### Exemplos efetivamente gerados

Todos com seed `notebook-demo`, versão 1:

- `subnet/intermediate`: **10.113.220.8/27** → rede .0, broadcast .31, hosts .1–.30, máscara 255.255.255.224, 32 endereços/30 hosts.
- `capacity/beginner`: **5 hosts** → /29, 255.255.255.248, capacidade 6.
- `vlsm/advanced`: **10.208.200.0/22**, reserva fixa 10.208.202.0/25. Büro 215 + 10% → 237 hosts; Technik 40; Lager 20; reserva futura 7. Uma solução: 10.208.200.0/24, 10.208.201.0/26, 10.208.201.64/27, 10.208.201.96/28. Outro arranjo é aceito se cumprir todas as restrições.

### Convenções e limites matemáticos

- Broadcast IPv4 normal: /0–/30; rede/broadcast não são hosts. /31 RFC 3021 e /32 ficam fora das tarefas de capacidade, embora /32 seja usado normalmente como rota na topologia D04.
- Contagens incluem gateways e infraestrutura. Crescimento usa `ceil(hosts × (100+percent)/100)` e só é aplicado onde indicado. Percentual inteiro entre 0 e 1000; demanda positiva dentro do espaço IPv4.
- VLSM exige **o menor bloco suficiente por demanda**, não igualdade à solução de referência. Não há objetivo implícito de minimizar a quantidade de intervalos livres.
- Reservas fixas são intervalos proibidos; demandas `future` precisam de uma alocação separada, mesmo sem dispositivos instalados.
- Alocador de referência: maiores demandas primeiro, desempate por ID, primeiro bloco alinhado livre. Não percorre cada IP; salta intervalos ocupados. Não é um solucionador geral de restrições arbitrárias.
- Auditor de endereços das referências assume um espaço de endereçamento único para estas oito topologias. Reutilização legítima de IPs entre VLANs/VRFs isoladas exigiria política por segmento; esse helper não deve virar validador global do produto.
- Referências práticas têm configuração estática e nenhuma sequência de comandos obrigatória. DHCP/DNS/HTTP não foram acrescentados artificialmente ao escopo: os drafts antigos já os cobrem.

## Validação reproduzível

```powershell
node scripts/validate-network-factory.mjs
node scripts/validate-network-factory.mjs --family=vlsm --difficulty=advanced --seed=notebook-demo
node scripts/validate-network-factory.mjs --catalog
node node_modules/vitest/vitest.mjs run src/exercises src/labs src/areaMarkings.test.ts src/markingGeometry.test.ts
node node_modules/typescript/bin/tsc --noEmit
npm run build
node scripts/validate-network-factory.mjs --check-bundle
git diff --check
```

150 variantes = 5 famílias × 3 dificuldades × 10 seeds. Cada uma tem repetibilidade, resposta conferida por oráculo independente, aprovação correta e rejeição de resposta errada/nula. O teste exige pelo menos 100 problemas distintos nesse conjunto. O oráculo usa máscaras/deslocamentos **BigInt**, independente dos cálculos por divisão/logaritmos do resolvedor. VLSM verifica alinhamento, capacidade mínima, crescimento, contenção e intervalos; não se limita a comparar a referência consigo mesma.

Casos de fronteira incluem 0.0.0.0/0, extremo 255.255.255.255/30, /1, saltos de octeto, capacidades exatas e um host além. Negativos incluem máscaras inválidas, /31–/32 fora da convenção, redes desalinhadas, sobreposição, reservas inválidas, duplicação/ausência de IDs, planos impossíveis e respostas malformadas.

As oito referências são restauradas e executadas isoladamente; os testes também verificam configurações iniciais defeituosas, manutenção dos defeitos durante serialização, portas/links, nomes alterados, alternativas válidas, retorno ausente, forwarding desligado e política DROP. Não dependem de animação, terminal ou banco real.

`--check-bundle` procura IDs/títulos internos nos JS emitidos; complementa a inspeção de imports, não é uma garantia criptográfica contra qualquer vazamento futuro. O entrypoint público continua utilizando somente as projeções Beta existentes.

Validação em 28/10/2026: **367 testes aprovados em 11 arquivos**, dos quais 265 são novos testes da fábrica. Incluem as 150 variantes e regressões dos drafts anteriores, controller, Labs, identidade e Markierungen. TypeScript, build e checks de whitespace passaram. O build mantém o aviso existente de chunk maior que 500 kB; não foram adicionadas dependências nem imports da fábrica ao runtime.

## Evolução segura para Übungen

1. Revisar pedagogicamente cada draft e seus critérios, mantendo versão de conteúdo. Não apresentar estes materiais como provas oficiais.
2. Criar, futuramente, um adaptador de respostas matemáticas no mesmo sistema de Übungen, com campos tipados e mensagens alemãs. Não reutilizar ping como correção teórica. Só então decidir notas parciais/rubricas.
3. Publicar uma projeção explícita de `student`, mantendo `review`/referências fora do bundle. Não importar `catalog.ts` em UI/store/controller. O gerador atual também contém soluções e é de autoria; sua integração exige separar geração de problemas e correção.
4. Para tarefas práticas, reutilizar o carregamento de tentativas do `exerciseController` e documentos visuais existentes. A factory não deve escrever diretamente em IndexedDB. Antes de aprovação automática completa, implementar ou revisar verificadores de host válido/unicidade e regras de preservação da topologia.
5. Selecionar por categoria/dificuldade; armazenar receita completa e versão. Evitar repetição por fingerprint dos dados normalizados, não apenas seed. Conteúdos antigos devem continuar reproduzíveis após atualizações.
6. Um exercício misto pode mapear requisitos `math`, `engine` e `manual` por IDs; a conclusão deve respeitar todos, sem converter verificações manuais em sucesso implícito.
7. Progresso futuro deve registrar ID/versão do exercício, receita, respostas e resultados por critério, separados da topologia do usuário. Planejar migração e restauração pelo repositório existente, sem backend, moedas ou autenticação nesta etapa.

Nenhuma dessas etapas de UI/publicação/progresso foi implementada aqui.
