import { memo, useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import type { Dispatch, SetStateAction } from 'react';
import type { CapturedPacket, PacketCaptureState } from '../packetCapture';
import { packetLayers, packetSummary, PACKET_PAGE_SIZE } from '../packetPresentation';
import { emptyPacketLiveView, newPacketCount, packetCaptureWasReset, packetLivePage, receivedPacketCount, suspendPacketLive, type PacketLiveView } from '../packetLiveView';
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

function PacketInspectorContent({ capture, view, setView, listScroll }: {
  capture: PacketCaptureState; view: PacketLiveView; setView: Dispatch<SetStateAction<PacketLiveView>>;
  listScroll: { current: number };
}) {
  const [selection, onSelect] = useState<CapturedPacket | null>(null);
  const heading = useRef<HTMLHeadingElement>(null);
  const scroller = useRef<HTMLDivElement>(null);
  const previousScroll = useRef(0);
  const suspend = useCallback(() => {
    const current = useStore.getState().packetCapture;
    setView((previous) => suspendPacketLive(current, previous));
  }, [setView]);
  const selectPacket = useCallback((packet: CapturedPacket | null) => {
    suspend();
    onSelect(packet);
  }, [suspend]);
  const closeDetails = useCallback(() => {
    onSelect(null);
    scroller.current?.focus({ preventScroll: true });
  }, []);
  useEffect(() => {
    heading.current?.focus({ preventScroll: true });
    if (scroller.current) {
      scroller.current.scrollTop = listScroll.current;
      previousScroll.current = scroller.current.scrollTop;
    }
  }, [listScroll]);
  const selected = selection && capture.records.includes(selection) ? selection : null;
  const { start, rows } = packetLivePage(capture, view);
  const unseen = newPacketCount(capture, view);
  const lastRow = rows.at(-1);
  useLayoutEffect(() => {
    const element = scroller.current;
    if (!view.following || !element) return;
    const bottom = Math.max(0, element.scrollHeight - element.clientHeight);
    if (Math.abs(element.scrollTop - bottom) > 1) element.scrollTop = bottom;
    previousScroll.current = element.scrollTop;
    listScroll.current = element.scrollTop;
  }, [view.following, lastRow, listScroll]);
  const close = () => {
    useStore.getState().setPacketInspectorOpen(false);
    document.getElementById('packets-toggle')?.focus({ preventScroll: true });
  };
  const changePage = (index: number) => {
    setView((previous) => ({ ...suspendPacketLive(capture, previous), anchor: capture.records[index] ?? null }));
    previousScroll.current = 0;
    listScroll.current = 0;
    if (scroller.current) scroller.current.scrollTop = 0;
  };
  const jumpToLatest = () => {
    onSelect(null);
    setView({ following: true, anchor: null, acknowledged: receivedPacketCount(capture) });
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
        onClick={() => { onSelect(null); setView(emptyPacketLiveView()); useStore.getState().startPacketCapture(); }}>Start capture</button>
      <button type="button" className="btn" disabled={capture.status !== 'capturing'} onClick={() => useStore.getState().pausePacketCapture()}>Pause capture</button>
      <button type="button" className="btn" disabled={capture.status !== 'paused'} onClick={() => useStore.getState().resumePacketCapture()}>Resume capture</button>
      <button type="button" className="btn" disabled={capture.status === 'stopped'} onClick={() => useStore.getState().stopPacketCapture()}>Stop capture</button>
      <button type="button" className="btn" onClick={() => { onSelect(null); setView(emptyPacketLiveView()); useStore.getState().clearPacketCapture(); }}>Clear records</button>
    </div>
    <div className="packet-capture-status">
      <strong className={`capture-${capture.status}`}>{capture.status === 'capturing' ? 'Capturing' : capture.status === 'paused' ? 'Capture paused' : 'Capture stopped'}</strong>
      <span>{capture.records.length} / 1,000 records{capture.discarded > 0 ? ` · ${capture.discarded} discarded by limit` : ''}</span>
    </div>
    <p className="packet-capture-note hint">{capture.linkId === null ? 'All links' : `Link: ${capture.linkId}`} · Capture controls do not pause the simulation.</p>
    <div className="packet-live-controls">
      <label><input type="checkbox" checked={view.following} onChange={(event) => {
        if (event.target.checked) jumpToLatest(); else suspend();
      }} /> Follow Live</label>
      {!view.following && <>
        <span>{unseen > 0 ? `${unseen} new records` : 'Live follow suspended'}</span>
        <button type="button" className="mini-btn" onClick={jumpToLatest}>Jump to latest</button>
      </>}
    </div>
    <div className="packet-list-scroll" ref={scroller} tabIndex={0} role="region" aria-label="Captured packet list"
      onWheel={(event) => { if (event.deltaY < 0) suspend(); }}
      onKeyDown={(event) => {
        if (['ArrowUp', 'PageUp', 'Home'].includes(event.key) && !event.nativeEvent.isComposing) suspend();
      }}
      onScroll={(event) => {
        const element = event.currentTarget;
        // Upward scrolling away from the bottom is inspection. Ignore clamping
        // after a short new page and our own scroll-to-bottom assignments.
        if (element.scrollTop < previousScroll.current - 1
          && element.scrollHeight - element.clientHeight - element.scrollTop > 2) suspend();
        previousScroll.current = element.scrollTop;
        listScroll.current = element.scrollTop;
      }}>
      <table className="packet-table">
        <caption className="sr-only">Simulated transmissions in chronological order. Source and destination are protocol addresses.</caption>
        <thead><tr><th scope="col">Time</th><th scope="col">Protocol</th><th scope="col">Source</th><th scope="col">Destination</th><th scope="col">Link</th><th scope="col">Summary</th></tr></thead>
        <tbody>{rows.map((packet) => <PacketRow key={packet.id} packet={packet} selected={packet === selected} onSelect={selectPacket} />)}</tbody>
      </table>
      {!rows.length && <p className="packet-empty">No packets captured. {capture.status === 'stopped'
        ? 'Start capture, then run a command such as ping, dhclient, dig or curl.'
        : capture.status === 'paused' ? 'Resume capture to collect new transmissions.'
          : 'Run a command such as ping, dhclient, dig or curl to generate traffic.'}</p>}
    </div>
    <nav className="packet-pagination" aria-label="Packet pages">
      <button type="button" className="mini-btn" disabled={start === 0} onClick={() => changePage(Math.max(0, start - PACKET_PAGE_SIZE))}>Previous</button>
      <span>Page {Math.floor(start / PACKET_PAGE_SIZE) + 1} of {Math.max(1, Math.ceil(capture.records.length / PACKET_PAGE_SIZE))}<br />
        {rows.length ? `${start + 1}–${start + rows.length} of ${capture.records.length}` : '0 records'}</span>
      <button type="button" className="mini-btn" disabled={start + rows.length >= capture.records.length} onClick={() => changePage(start + PACKET_PAGE_SIZE)}>Next</button>
    </nav>
    {selected ? <PacketDetails packet={selected} onClose={closeDetails} /> : <div className="packet-detail-placeholder">
      {selection ? 'Selected packet is no longer retained. Select another row.' : 'Select a row to inspect its layers and link endpoints.'}
    </div>}
  </aside>;
}

export function PacketInspector() {
  const open = useStore((s) => s.packetInspectorOpen);
  const capture = useStore((s) => s.packetCapture);
  const [view, setView] = useState(emptyPacketLiveView);
  const previousCapture = useRef(capture);
  if (capture !== previousCapture.current) {
    if (packetCaptureWasReset(previousCapture.current, capture)) setView(emptyPacketLiveView());
    previousCapture.current = capture;
  }
  const listScroll = useRef(0);
  // Retain list position, but let the content's selection reset on unmount.
  // Opening/closing never calls capture controls.
  return open ? <PacketInspectorContent capture={capture} view={view} setView={setView} listScroll={listScroll} /> : null;
}
