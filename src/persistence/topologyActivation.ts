import type { Network } from '../engine/network';
import { disposeNetwork } from '../engine/networkLifecycle';
import { sim } from '../sim';
import { disposeAllSessions } from '../terminals';

/** Commit only a successfully prepared network. Callers can capture/save the
 * current document before this boundary; preparation never calls this function. */
export function activateTopologyNetwork(network: Network): void {
  if (network === sim.net) throw new Error('Cannot reactivate the live network');
  disposeAllSessions();
  disposeNetwork(sim.net);
  sim.net = network;
}
