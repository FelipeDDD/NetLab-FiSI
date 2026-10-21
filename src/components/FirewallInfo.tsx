import { InfoTooltip } from './InfoTooltip';

export const FIREWALL_CONCEPTS = {
  INPUT: 'Pakete an dieses Gerät.',
  OUTPUT: 'Pakete von diesem Gerät.',
  FORWARD: 'Pakete, die durch das Gerät weitergeleitet werden.',
  Quelle: 'Absenderadresse eines Pakets.',
  Ziel: 'Empfängeradresse eines Pakets.',
  Conntrack: 'Verfolgung von Netzwerkverbindungen.',
  nftables: 'Linux-Firewall-System.',
} as const;

export function FirewallInfo({ concepts, label }: { concepts: readonly (keyof typeof FIREWALL_CONCEPTS)[]; label: string }) {
  return <InfoTooltip label={label}><dl>{concepts.map(concept => <div key={concept}>
    <dt>{concept}</dt><dd>{FIREWALL_CONCEPTS[concept]}</dd>
  </div>)}</dl></InfoTooltip>;
}
