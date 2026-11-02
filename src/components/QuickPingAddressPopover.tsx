import { useLayoutEffect, useRef, useState } from 'react';
import type { PingAddress } from '../quickPing';
import { useStore } from '../store';
import { FloatingPopover } from './FloatingPopover';

/** Screen-sized options anchored to the actual transformed React Flow node. */
export function QuickPingAddressPopover({ targetId, addresses }: { targetId: string; addresses: PingAddress[] }) {
  const anchor = useRef<HTMLElement | null>(null);
  const [ready, setReady] = useState(false);
  const label = useStore(s => s.nodes.find(n => n.id === targetId)?.data.label ?? targetId);
  useLayoutEffect(() => {
    anchor.current = [...document.querySelectorAll<HTMLElement>('.react-flow__node')]
      .find(node => node.dataset.id === targetId) ?? null;
    setReady(!!anchor.current);
  }, [targetId]);
  if (!ready) return null;
  return <FloatingPopover anchor={anchor} id="quick-ping-addresses" label={'Ping-Ziel: ' + label} role="menu"
      width={244} preferredSide="above" followAnchor dismissOnOutside={false}
      className="quick-ping-panel quick-ping-address-popover nodrag nopan nowheel"
      onClose={() => useStore.getState().cancelQuickPing()}>
      <strong>IPv4-Adresse auswählen</strong>
      <small>{label} · Esc zum Abbrechen</small>
      {addresses.map(a => <button type="button" role="menuitem" className="btn" key={a.address}
        onClick={() => useStore.getState().chooseQuickPingTarget(targetId, a.address)}>
        <span>{a.address}</span><small>{a.interfaces.join(', ')}</small>
      </button>)}
      <button type="button" role="menuitem" className="btn" onClick={() => useStore.getState().cancelQuickPing()}>Abbrechen</button>
    </FloatingPopover>;
}
