import { InfoTooltip } from './InfoTooltip';
import { useTranslation } from '../i18n';

export const FIREWALL_CONCEPTS = {
  INPUT: 'navigation.firewallInputHint',
  OUTPUT: 'navigation.firewallOutputHint',
  FORWARD: 'navigation.firewallForwardHint',
  Quelle: 'navigation.firewallSourceHint',
  Ziel: 'navigation.firewallDestinationHint',
  Conntrack: 'navigation.firewallConntrackHint',
  nftables: 'navigation.firewallNftablesHint',
} as const;

export function FirewallInfo({ concepts, label }: { concepts: readonly (keyof typeof FIREWALL_CONCEPTS)[]; label: string }) {
  const { t } = useTranslation();
  return <InfoTooltip label={label}><dl>{concepts.map(concept => <div key={concept}>
    <dt>{concept === 'Quelle' ? t('navigation.firewallSource') : concept === 'Ziel' ? t('navigation.firewallDestination') : concept}</dt><dd>{t(FIREWALL_CONCEPTS[concept])}</dd>
  </div>)}</dl></InfoTooltip>;
}
