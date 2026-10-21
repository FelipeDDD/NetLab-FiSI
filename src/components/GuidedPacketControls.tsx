import { useStore } from '../store';

export function GuidedPacketControls() {
  const status = useStore((s) => s.guidedPacket.status);
  const hops = useStore((s) => s.guidedPacket.hops);
  const index = useStore((s) => s.guidedPacket.index);
  const message = useStore((s) => s.guidedPacket.message);
  const attempts = useStore((s) => s.guidedPacket.attempts);
  const firstSeq = useStore((s) => s.guidedPacket.session?.firstSeq ?? 1);
  const hop = hops[index];
  const attempt = hop && attempts.find((item) => item.seq === firstSeq + hop.ping - 1);
  const canTogglePlayback = Boolean(hop) && (status === 'playing' || status === 'paused');
  const playbackHint = status === 'finished' ? 'Playback finished. Use Replay to start again.'
    : status === 'playing' ? 'Pause visual playback.'
      : status === 'paused' ? 'Continue visual playback.' : 'Observe a ping sequence before playback.';
  const statusMessage = status === 'waiting' ? 'Waiting for next ping...'
    : status === 'collecting' && attempts.length > 0 ? `Capturing ping ${attempts.length}/4...` : message;
  return <section aria-label="Guided playback" className="guided-packet-controls">
    <p>Learning view only. The network and terminal commands keep running.</p>
    <button type="button" className="btn" onClick={() => useStore.getState().observeNextGuidedPacket()}>Observe next ping</button>
    <p id="guided-playback-status" role="status">{status === 'finished' && 'Sequence finished. Replay or observe another ping. '}{statusMessage}</p>
    {hop && <p className="guided-hop-label">Ping {hop.ping}/4 · {hop.direction === 'request' ? 'Echo Request' : 'Echo Reply'}
      {attempt && !attempt.replied && ' · No complete reply path in the observation window'}<br />
      Hop {index + 1} / {hops.length}<br />
      {hop.fromDeviceName} / {hop.fromInterface} → {hop.toDeviceName} / {hop.toInterface}</p>}
    <div className="guided-playback-actions">
      <button type="button" className="btn" disabled={!canTogglePlayback} title={playbackHint} aria-describedby="guided-playback-status"
        onClick={() => useStore.getState().toggleGuidedPlayback()}>{status === 'playing' ? 'Pause' : 'Play'}</button>
      <button type="button" className="btn" disabled={!hop} onClick={() => useStore.getState().replayGuidedPacket()}>Replay</button>
    </div>
    <p className="guided-playback-note">Up to four real requests from one ping session, with their observed replies. No new cycle starts automatically. Replay does not send packets.</p>
  </section>;
}
