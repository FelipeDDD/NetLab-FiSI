# Persistência: proteção do formato v1 e ciclo de ativação

Estado atual: a [Fase 5B2-B](application-boot.md) ativa o controller e a interface
no boot normal. O autosave legado fica permanentemente somente leitura nessa
entrada; falhas oferecem recuperação sem demo nem fallback gravável automático.
Os parágrafos sobre boot/fallback legado abaixo registram os contratos históricos
das Fases 1–2, ainda cobertos por testes e APIs explícitas.

Implementação das Fases 1 e 2 da auditoria. A infraestrutura isolada da Fase 3
está descrita em [project-repository.md](project-repository.md); ela ainda não
substitui o autosave. O [serviço explícito da Fase 4](legacy-migration.md)
também permanece separado do boot. Não há catálogo visual, migração automática
nem alteração da chave `netsim:autosave:v1`.

## Documento e ativação

- `engine/validateSave.ts`: valida a representação v1 antes de restaurar.
  Tipos desconhecidos, endpoints inválidos, conflitos de links e configurações
  malformadas são erros; não há importação parcial automática.
- `persistence/topologyDocument.ts`: `captureTopologyDocument` produz um snapshot
  independente; `prepareTopologyDocument` lê/clona, valida e prepara rede e
  apresentação sem acessar a simulação ativa, sessões ou armazenamento.
- `persistence/topologyActivation.ts`: `activateTopologyNetwork` é a fronteira
  de commit; descarta sessões e a rede anterior antes de instalar a nova rede.
- `engine/networkLifecycle.ts`: desconecta observadores, descarta dispositivos e
  esvazia eventos pendentes. Também limpa preparações que falharam.
- `store.ts`: aplica a projeção para a interface, invalida verificações de Labs,
  histórico e movimentos, reinicia relógios e incrementa `topologyGeneration`.
  Flow usa essa geração para cancelar interações sem remontar o canvas.

A ordem para um futuro controller é: capturar A, preparar B, salvar A e confirmar
o resultado, ativar B. Captura e preparação não descartam A. A gravação
assíncrona por projeto está implementada no [controller da Fase 5B1](session-controller.md),
disponível apenas por chamada explícita. O boot normal permanece no fluxo legado.

## Proteção do autosave

Boot tenta ler o autosave com tratamento de erros. Conteúdo inválido ou de versão
não suportada fica intacto na chave original e disponível para download exato.
A demo de fallback é temporária: `autosaveBlocked` impede gravações, inclusive
por debounce, `pagehide`, edição ou troca de topologia.

Falhas de gravação mantêm `autosavePending` e a rede em memória; o erro permanece
visível com ações para tentar novamente e exportar JSON. Retry após erro de
leitura primeiro relê o armazenamento: nunca sobrescreve conteúdo desconhecido.
Substituir um autosave protegido exige uma ação separada e confirmação explícita;
antes de gravar, o conteúdo é comparado com o original apresentado ao usuário.
Se mudou, a substituição é recusada. Essa comparação não constitui um bloqueio
atômico entre abas.

## Substituições e compartilhamento

Na interface, New, Demo, Labs e Examples pedem confirmação de substituição.
Import prepara o documento antes da confirmação; cancelar mantém rede, sessões,
histórico e salvamento pendente. Métodos básicos do store permanecem disponíveis
sem diálogos para boot, testes e futuros controllers; novos consumidores visuais
devem respeitar a fronteira de confirmação.

Share Link gera uma URL copiável sem instalar um snapshot antigo no endereço da
própria aba. Um link recebido no boot ou por `hashchange` vira uma oferta de
abertura explícita, e seu hash é consumido preservando a query. O trabalho local
continua aberto. A aceitação usa o mesmo fluxo validado de importação. Um F5 antes
de aceitar descarta a oferta em memória; o link original pode ser aberto de novo.

Importações rejeitadas conservam o texto original em memória e oferecem download;
o arquivo escolhido pelo usuário não é alterado. Um novo erro de importação
substitui esse diagnóstico transitório. O autosave protegido é mantido separado.

## Compatibilidade e limites

Continuam válidos `app: 'netsim', version: 1`, switches legados com `ifaces: []`,
cores legadas de cabos, defaults antigos dos terminais e DHCP legado, inclusive
pools cuja elegibilidade depende do motor. A validação não ativa serviços nem
muda regras de roteamento ou protocolos.

O documento continua sendo configuração, não checkpoint de execução. Não inclui
sessões xterm, rascunhos não aplicados, Undo/Redo, caches, leases ou captura.
Trocar de rede reinicia esses estados; preferências locais continuam separadas.

O autosave ativo ainda não tem controle transacional de múltiplas abas, histórico
persistido nem garantia contra encerramento abrupto antes da gravação. O novo
repositório possui revisões e checkpoints, mas só terá efeito após integração
futura. Backups JSON externos continuam necessários. Dados reais do navegador
não devem ser usados em testes.

## Verificação

Os testes `persistence/persistenceSafety.test.ts` e
`persistence/topologyDocument.test.ts` usam storage simulado e documentos fictícios.
Complementam os testes existentes de Labs, terminais, DHCP, Switch e cabos.

```powershell
node node_modules/typescript/bin/tsc --noEmit
npm test
npm run build
git diff --check
```

Verificações visuais devem usar um perfil novo e isolado, cobrindo Graphite Dark,
Classic Light, 700/1440 px, erro de storage, exportação do original e confirmações.
