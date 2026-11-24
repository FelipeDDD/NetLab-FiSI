# Continuidade entre escola e casa

**Passagem de 24/11/2026 · branch `main`.** O Modem Bridge agora tem variantes branca e grafite e contadores de tráfego por porta. O Packet Inspector e as animações do canvas têm filtros independentes. Em uma transmissão capturada, **Investigar percurso** abre o diagnóstico com saltos correlacionados e evidências de rota, ARP, NAT/PAT e firewall. Veja os guias do [Modem Bridge](modem-bridge.md) e da [inspeção de pacotes](packet-animation.md).

Os últimos ajustes destacam a transmissão selecionada no diagnóstico, distinguem requisições, respostas e erros ICMP e retiram os IDs internos dos enlaces da descrição. O Packet Inspector abre com filtros recolhidos, tem divisória redimensionável e alterna a prioridade com o Terminal Dock quando os painéis se sobrepõem.

## Retomar em casa

- Atualize a `main` a partir de `origin/main` se o checkout permitir avanço direto. Revise manualmente a leitura do diagnóstico com um ICMP sem rota, um percurso NAT/PAT e o terminal aberto.
- Conclua a validação manual da Etapa 3 do tutorial NAT/PAT. Confirme o HTTP de PC2 após corrigir a regra, execute a demonstração de PAT e compare as portas externas em **Firewall → Conntrack**. A escolha do estilo de destaque técnico continua aberta. [Guia do tutorial](progressive-nat-pat.md)
- Considere VLAN Trunk 802.1Q como próxima implementação.

## Validação

A rodada final passou em 154 testes direcionados, 126 verificações em Chromium, TypeScript, build e `git diff --check`. A revisão anterior do diagnóstico também cobriu ICMP sem rota e NAT/PAT em Chromium.

A suíte completa ainda sinaliza a falha conhecida de visibilidade de um salto ARP no Capítulo 4 (`staticRoutingPresentation.test.ts`), já reproduzida na base `58529f9`.
