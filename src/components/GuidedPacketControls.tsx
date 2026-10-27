import { useStore } from '../store';

export function GuidedPacketControls() {
  const observation = useStore((s) => s.guidedPacket.observation);
  const playback = useStore((s) => s.guidedPacket.playback);
  const { status, hops, index, kind } = playback;
  const hop = hops[index];
  const canToggle = Boolean(hop) && (status === 'playing' || status === 'paused');
  return <section aria-label="Schrittmodus Wiedergabe" className="guided-packet-controls">
    <p>ARP und ICMP des neuesten Ping-Befehls schrittweise verfolgen. Der Netzwerkverkehr läuft unabhängig weiter.</p>
    <p id="guided-playback-status" role="status">{kind === 'replay' ? 'Replay of observed hops. ' : 'Following the newest ping. '}
      {observation.message}
      {status === 'finished' && ' Playback finished; ready for a new ping.'}</p>
    {hop && <p className="guided-hop-label">Ping {hop.ping} · {hop.arp ? `ARP ${hop.arp === 'request' ? 'Request' : 'Reply'}` : hop.direction === 'request' ? 'Echo Request' : 'Echo Reply'}<br />
      Hop {index + 1} / {hops.length}<br />
      {hop.fromDeviceName} / {hop.fromInterface} → {hop.toDeviceName} / {hop.toInterface}</p>}
    <div className="guided-playback-actions">
      <button type="button" className="btn" disabled={!canToggle}
        title={status === 'finished' ? 'Playback finished. Use Replay or start a new ping.' : 'Pause or continue visual playback only.'}
        aria-describedby="guided-playback-status" onClick={() => useStore.getState().toggleGuidedPlayback()}>{status === 'playing' ? 'Pause' : 'Play'}</button>
      <button type="button" className="btn" disabled={!hop || status === 'finished'}
        onClick={() => useStore.getState().nextGuidedHop()}>Step</button>
      <button type="button" className="btn" disabled={!observation.observed.length}
        onClick={() => useStore.getState().replayGuidedPacket()}>Replay</button>
      {kind === 'replay' && <button type="button" className="btn" onClick={() => useStore.getState().followGuidedPacket()}>Follow</button>}
    </div>
    {(playback.skipped > 0 || observation.truncated) && <p role="status">Visual limit reached{playback.skipped > 0 ? `: ${playback.skipped} hops omitted from playback` : ''}. Packet capture is unaffected.</p>}
    <p className="guided-playback-note">Replay keeps the latest four attempts. Observation continues during playback and pause. A new ping always replaces this view.</p>
  </section>;
}
