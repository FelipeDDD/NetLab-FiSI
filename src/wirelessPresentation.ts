import type { Link } from './engine/device';
// Same liveness for cable appearance and live/guided packet visibility.
export const inactiveWireless = (link: Link | undefined): boolean =>
  link?.medium === 'wireless' && !link.operational;
