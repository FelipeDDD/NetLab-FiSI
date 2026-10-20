import { memo, useCallback, useEffect, useRef, useState } from 'react';
import type { CapturedPacket } from '../packetCapture';
import { packetLayers, packetPage, packetSummary, PACKET_PAGE_SIZE } from '../packetPresentation';
import { useStore } from '../store';

const PacketRow = memo(function PacketRow({ packet, selected, onSelect }: {
  packet: CapturedPacket; selected: boolean; onSelect: (packet: CapturedPacket | null) => void;
}) {
  const info = packetSummary(packet);
  return <tr data-selected={selected} onClick={() => onSelect(selected ? null : packet)}>
    <td><button type="button" className="packet-time" aria-pressed={selected}
      aria-label={`Inspect packet ${packet.id}, ${info.protocol}`}>
      {(packet.start / 1000).toFixed(3)}s
    </button></td>
    <td className="packet-protocol">{info.protocol}</td>
    <td title={info.source}>{info.source}</td><td title={info.destination}>{info.destination}</td>
    <td className="packet-link" title={`${packet.fromDeviceName} / ${packet.fromInterface} → ${packet.toDeviceName} / ${packet.toInterface} (${packet.linkId})`}>
      <span>{packet.fromDeviceName}</span><span>→ {packet.toDeviceName}</span>
    </td>
    <td title={info.summary}>{info.summary}</td>
  </tr>;
});

export const PacketDetails = memo(function PacketDetails({ packet, onClose }: { packet: CapturedPacket; onClose: () => void }) {
  return <section className="packet-details" aria-label="Packet details" tabIndex={0}>
    <header className="packet-details-head">
      <h3>Packet #{packet.id} <span>{(packet.start / 1000).toFixed(3)}s · transmission</span></h3>
      <button type="button" className="mini-btn" aria-label="Close packet details" title="Close packet details" onClick={onClose}>×</button>
    </header>
    <p className="packet-hop">{packet.fromDeviceName} / {packet.fromInterface} → {packet.toDeviceName} / {packet.toInterface}</p>
    <details className="packet-technical">
      <summary>Technical details</summary>
      <dl>
        <dt>Link ID</dt><dd>{packet.linkId}</dd>
        <dt>Device IDs</dt><dd>{packet.fromDeviceId} → {packet.toDeviceId}</dd>
      </dl>
    </details>
    {packet.truncatedFields.length > 0 && <p className="packet-warning">Some captured text was truncated:
      {packet.truncatedFields.map((field) => <span key={field.path}>{field.path}: {field.capturedLength} of {field.originalLength} UTF-16 units</span>)}
    </p>}
    {packetLayers(packet).map((layer, index) => <section className="packet-detail-layer" key={index}>
      <h4>{layer.name}</h4><dl>
        {Object.entries(layer.fields).filter(([, value]) => value !== undefined).map(([key, value]) => <div key={key}>
          <dt>{key}</dt><dd>{typeof value === 'object' || (typeof value === 'string' && (value.includes('\n') || key === 'Body'))
            ? <pre>{typeof value === 'object' ? JSON.stringify(value, null, 2) : value}</pre> : String(value)}</dd>
        </div>)}
      </dl>
    </section>)}
  </section>;
});

function PacketInspectorContent({ anchor, onPage, listScroll }: {
  anchor: CapturedPacket | null; onPage: (packet: CapturedPacket | null) => void;
  listScroll: { current: number };
}) {
  const [selection, onSelect] = useState<CapturedPacket | null>(null);
  const capture = useStore((s) => s.packetCapture);
  const heading = useRef<HTMLHeadingElement>(null);
  const scroller = useRef<HTMLDivElement>(null);
  const closeDetails = useCallback(() => {
    onSelect(null);
    scroller.current?.focus({ preventScroll: true });
  }, []);
  useEffect(() => {
    heading.current?.focus({ preventScroll: true });
    if (scroller.current) scroller.current.scrollTop = listScroll.current;
  }, [listScroll]);
  const selected = selection && capture.records.includes(selection) ? selection : null;
  const { start, rows } = packetPage(capture.records, anchor);
  const close = () => {
    useStore.getState().setPacketInspectorOpen(false);
    document.getElementById('packets-toggle')?.focus({ preventScroll: true });
  };
  const changePage = (index: number) => {
    onPage(capture.records[index] ?? null);
    if (scroller.current) scroller.current.scrollTop = 0;
  };
  return <aside id="packet-inspector" className="packet-inspector" aria-labelledby="packet-inspector-heading"
    onKeyDown={(event) => {
      if (event.key === 'Escape' && !event.defaultPrevented && !event.nativeEvent.isComposing) {
        event.preventDefault(); event.stopPropagation(); close();
      }
    }}>
    <header className="packet-inspector-head">
      <h2 id="packet-inspector-heading" ref={heading} tabIndex={-1}>Packet Inspector</h2>
      <button type="button" className="mini-btn" aria-label="Close Packet Inspector" title="Close Packet Inspector (Esc)" onClick={close}>×</button>
    </header>
    <div className="packet-capture-controls" role="group" aria-label="Packet capture controls">
      <button type="button" className="btn" disabled={capture.status !== 'stopped'} title="Start a new capture on all links"
        onClick={() => { onSelect(null); onPage(null); useStore.getState().startPacketCapture(); }}>Start capture</button>
      <button type="button" className="btn" disabled={capture.status !== 'capturing'} onClick={() => useStore.getState().pausePacketCapture()}>Pause capture</button>
      <button type="button" className="btn" disabled={capture.status !== 'paused'} onClick={() => useStore.getState().resumePacketCapture()}>Resume capture</button>
      <button type="button" className="btn" disabled={capture.status === 'stopped'} onClick={() => useStore.getState().stopPacketCapture()}>Stop capture</button>
      <button type="button" className="btn" onClick={() => { onSelect(null); onPage(null); useStore.getState().clearPacketCapture(); }}>Clear records</button>
    </div>
    <div className="packet-capture-status">
      <strong className={`capture-${capture.status}`}>{capture.status === 'capturing' ? 'Capturing' : capture.status === 'paused' ? 'Capture paused' : 'Capture stopped'}</strong>
      <span>{capture.records.length} / 1,000 records{capture.discarded > 0 ? ` · ${capture.discarded} discarded by limit` : ''}</span>
    </div>
    <p className="packet-capture-note hint">{capture.linkId === null ? 'All links' : `Link: ${capture.linkId}`} · Capture controls do not pause the simulation.</p>
    <div className="packet-list-scroll" ref={scroller} tabIndex={0} role="region" aria-label="Captured packet list"
      onScroll={(event) => { listScroll.current = event.currentTarget.scrollTop; }}>
      <table className="packet-table">
        <caption className="sr-only">Simulated transmissions in chronological order. Source and destination are protocol addresses.</caption>
        <thead><tr><th scope="col">Time</th><th scope="col">Protocol</th><th scope="col">Source</th><th scope="col">Destination</th><th scope="col">Link</th><th scope="col">Summary</th></tr></thead>
        <tbody>{rows.map((packet) => <PacketRow key={packet.id} packet={packet} selected={packet === selected} onSelect={onSelect} />)}</tbody>
      </table>
      {!rows.length && <p className="packet-empty">No packets captured. {capture.status === 'stopped'
        ? 'Start capture, then run a command such as ping, dhclient, dig or curl.'
        : capture.status === 'paused' ? 'Resume capture to collect new transmissions.'
          : 'Run a command such as ping, dhclient, dig or curl to generate traffic.'}</p>}
    </div>
    <nav className="packet-pagination" aria-label="Packet pages">
      <button type="button" className="mini-btn" disabled={start === 0} onClick={() => changePage(Math.max(0, start - PACKET_PAGE_SIZE))}>Previous</button>
      <span>{rows.length ? `${start + 1}–${start + rows.length} of ${capture.records.length}` : '0 records'} · up to 50 per page</span>
      <button type="button" className="mini-btn" disabled={start + rows.length >= capture.records.length} onClick={() => changePage(start + PACKET_PAGE_SIZE)}>Next</button>
    </nav>
    {selected ? <PacketDetails packet={selected} onClose={closeDetails} /> : <div className="packet-detail-placeholder">
      {selection ? 'Selected packet is no longer retained. Select another row.' : 'Select a row to inspect its layers and link endpoints.'}
    </div>}
  </aside>;
}

export function PacketInspector() {
  const open = useStore((s) => s.packetInspectorOpen);
  const [anchor, setAnchor] = useState<CapturedPacket | null>(null);
  const listScroll = useRef(0);
  // Retain list position, but let the content's selection reset on unmount.
  // Opening/closing never calls capture controls.
  return open ? <PacketInspectorContent anchor={anchor} onPage={setAnchor} listScroll={listScroll} /> : null;
}
