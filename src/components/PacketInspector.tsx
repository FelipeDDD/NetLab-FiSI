import { memo, useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import type { Dispatch, SetStateAction } from 'react';
import { createPortal } from 'react-dom';
import { PacketDiagnosis } from './PacketDiagnosis';
import { PacketInspectorSplit } from './PacketInspectorSplit';
import type { CapturedPacket, PacketCaptureState } from '../packetCapture';
import { packetLayers, packetSummary, PACKET_PAGE_SIZE } from '../packetPresentation';
import { emptyPacketLiveView, newPacketCount, packetCaptureWasReset, packetLivePage, receivedPacketCount, suspendPacketLive, type PacketLiveView } from '../packetLiveView';
import { useStore } from '../store';
import { normalizePacketInspector, type PacketInspectorPreference } from '../packetInspectorLayout';
import { emptyPacketFilters, filterCapturedPackets, type PacketFilters } from '../packetFilters';
import { TRAFFIC_PROTOCOLS, toggleTrafficProtocol } from '../packetProtocols';
import { parseIp } from '../engine/ip';
import { useTranslation } from '../i18n';

const packetLinkLabel = (packet: CapturedPacket) =>
  `${packet.fromDeviceName} / ${packet.fromInterface} → ${packet.toDeviceName} / ${packet.toInterface} (${packet.linkId})`;

const PacketRow = memo(function PacketRow({ packet, selected, onSelect }: {
  packet: CapturedPacket; selected: boolean; onSelect: (packet: CapturedPacket | null) => void;
}) {
  const info = packetSummary(packet);
  return <tr data-selected={selected} onClick={() => onSelect(selected ? null : packet)}>
    <td><button type="button" className="packet-time" aria-pressed={selected} title={packetLinkLabel(packet)}
      aria-label={`Inspect packet ${packet.id}, ${info.protocol}`}>
      {(packet.start / 1000).toFixed(3)}s
    </button></td>
    <td className="packet-protocol">{info.protocol}</td>
    <td className="packet-full-column" title={info.source}>{info.source}</td><td className="packet-full-column" title={info.destination}>{info.destination}</td>
    <td className="packet-link packet-full-column" title={packetLinkLabel(packet)}>
      <span>{packet.fromDeviceName}</span><span>→ {packet.toDeviceName}</span>
    </td>
    <td title={info.summary}>{info.summary}</td>
  </tr>;
});

export const PacketDetails = memo(function PacketDetails({ packet, onClose, investigate }: { packet: CapturedPacket; onClose: () => void; investigate?: () => void }) {
  const { t } = useTranslation();
  return <section className="packet-details" aria-label="Packet details" tabIndex={0}>
    <header className="packet-details-head">
      <h3>Packet #{packet.id} <span>{(packet.start / 1000).toFixed(3)}s · transmission</span></h3>
      {investigate && <button className="mini-btn" type="button" data-investigate onClick={investigate}>{t('traffic.inspectPath')}</button>}
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

function PacketInspectorContent({ capture, view, setView, listScroll, layout, onLayoutChange, filters, setFilters, selection, onSelect, investigate }: {
  capture: PacketCaptureState; view: PacketLiveView; setView: Dispatch<SetStateAction<PacketLiveView>>;
  listScroll: { current: number };
  layout: PacketInspectorPreference; onLayoutChange: (value: PacketInspectorPreference) => void;
  filters: PacketFilters; setFilters: (filters: PacketFilters) => void;
  selection: CapturedPacket | null; onSelect: (p: CapturedPacket | null) => void; investigate: () => void;
}) {
  const { t } = useTranslation();
  const heading = useRef<HTMLHeadingElement>(null);
  const scroller = useRef<HTMLDivElement>(null);
  const previousScroll = useRef(0);
  const records = useMemo(() => filterCapturedPackets(capture.records, filters), [capture.records, filters]);
  const activeFilters = filters.protocols.length + [filters.source, filters.destination, filters.linkId].filter(value => value.trim()).length;
  const links = useMemo(() => {
    const options = new Map<string, string>();
    for (const packet of capture.records) {
      if (!options.has(packet.linkId)) options.set(packet.linkId,
        `${packet.fromDeviceName} / ${packet.fromInterface} ↔ ${packet.toDeviceName} / ${packet.toInterface} (${packet.linkId})`);
    }
    return options;
  }, [capture.records]);
  const suspend = useCallback(() => {
    const current = useStore.getState().packetCapture;
    setView(previous => suspendPacketLive(current, previous, filterCapturedPackets(current.records, filters)));
  }, [filters, setView]);
  const selectPacket = useCallback((packet: CapturedPacket | null) => {
    suspend();
    onSelect(packet);
  }, [suspend, onSelect]);
  const closeDetails = useCallback(() => {
    onSelect(null);
    scroller.current?.focus({ preventScroll: true });
  }, [onSelect]);
  useEffect(() => {
    heading.current?.focus({ preventScroll: true });
    if (scroller.current) {
      scroller.current.scrollTop = listScroll.current;
      previousScroll.current = scroller.current.scrollTop;
    }
  }, [listScroll]);
  const selected = selection && capture.records.includes(selection) ? selection : null;
  const { start, rows } = packetLivePage(capture, view, records);
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
  const scrollToStart = () => {
    previousScroll.current = 0;
    listScroll.current = 0;
    if (scroller.current) scroller.current.scrollTop = 0;
  };
  const changePage = (index: number) => {
    setView(previous => ({ ...suspendPacketLive(capture, previous, records), anchor: records[index] ?? null }));
    scrollToStart();
  };
  const updateFilters = (next: PacketFilters) => {
    setFilters(next);
    setView(previous => ({ ...previous, anchor: null }));
    scrollToStart();
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
      <div className="packet-panel-actions">
        <select className="packet-table-mode" aria-label="Packet table view" value={layout.mode}
          onChange={event => onLayoutChange({ ...layout, mode: event.target.value as PacketInspectorPreference['mode'] })}>
          <option value="compact">Compact</option><option value="full">Full</option>
        </select>
        <button type="button" className="mini-btn packet-position-toggle" aria-label="Swap packet panel position"
          title={layout.side === 'right' ? 'Move Packets to the left' : 'Move Packets to the right'} aria-pressed={layout.side === 'left'}
          onClick={() => onLayoutChange({ ...layout, side: layout.side === 'right' ? 'left' : 'right' })}>⇄</button>
      <button type="button" className="mini-btn" aria-label="Close Packet Inspector" title="Close Packet Inspector (Esc)" onClick={close}>×</button>
      </div>
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
    <details className="packet-view-filters">
      <summary>{t('traffic.filters')} <span data-packet-filter-count>{t('traffic.counts', {
        visible: records.length, captured: receivedPacketCount(capture),
      })}</span>{activeFilters > 0 && <span className="packet-active-filters">
        {t('traffic.activeFilters', { count: activeFilters })}
      </span>}</summary>
      <fieldset className="packet-protocol-options">
        <legend>{t('traffic.protocols')}</legend>
        <button type="button" className="mini-btn" aria-pressed={!filters.protocols.length}
          onClick={() => updateFilters({ ...filters, protocols: [] })}>{t('traffic.all')}</button>
        {TRAFFIC_PROTOCOLS.map(protocol => <label key={protocol}>
          <input type="checkbox" checked={filters.protocols.includes(protocol)}
            onChange={() => updateFilters({ ...filters, protocols: toggleTrafficProtocol(filters.protocols, protocol) })} />
          {protocol.toUpperCase()}
        </label>)}
      </fieldset>
      <div className="packet-address-filters">
        {(['source', 'destination'] as const).map(field => {
          const value = filters[field];
          const invalid = value.trim() !== '' && parseIp(value) === null;
          return <label key={field}>{t(field === 'source' ? 'traffic.source' : 'traffic.destination')}
            <input type="text" inputMode="decimal" value={value} aria-invalid={invalid}
              onChange={event => updateFilters({ ...filters, [field]: event.target.value })} />
            {invalid && <small>{t('traffic.invalidIp')}</small>}
          </label>;
        })}
        <label className="packet-link-filter">{t('traffic.link')}
          <select value={filters.linkId} onChange={event => updateFilters({ ...filters, linkId: event.target.value })}>
            <option value="">{t('traffic.allLinks')}</option>
            {filters.linkId && !links.has(filters.linkId) && <option>{filters.linkId}</option>}
            {[...links].map(([id, label]) => <option key={id} value={id}>{label}</option>)}
          </select>
        </label>
      </div>
      <button type="button" className="mini-btn" onClick={() => updateFilters(emptyPacketFilters)}>{t('traffic.reset')}</button>
    </details>
    <div className="packet-live-controls">
      <label><input type="checkbox" checked={view.following} onChange={(event) => {
        if (event.target.checked) jumpToLatest(); else suspend();
      }} /> Follow Live</label>
      {!view.following && <>
        <span>{unseen > 0 ? `${unseen} new records` : 'Live follow suspended'}</span>
        <button type="button" className="mini-btn" onClick={jumpToLatest}>Jump to latest</button>
      </>}
    </div>
    <PacketInspectorSplit selected={!!selected} list={<>
    <div id="packet-list" className="packet-list-scroll" ref={scroller} tabIndex={0} role="region" aria-label="Captured packet list"
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
      <table className={`packet-table${layout.mode === 'compact' ? ' is-compact' : ''}`}>
        <caption className="sr-only">Simulated transmissions in chronological order. Source and destination are protocol addresses.</caption>
        <thead><tr><th scope="col">Time</th><th scope="col">Protocol</th><th className="packet-full-column" scope="col">Source</th><th className="packet-full-column" scope="col">Destination</th><th className="packet-full-column" scope="col">Link</th><th scope="col">Summary</th></tr></thead>
        <tbody>{rows.map((packet) => <PacketRow key={packet.id} packet={packet} selected={packet === selected} onSelect={selectPacket} />)}</tbody>
      </table>
      {!rows.length && (capture.records.length ? <p className="packet-empty">{t('traffic.noMatches')}</p> :
        <p className="packet-empty">No packets captured. {capture.status === 'stopped'
        ? 'Start capture, then run a command such as ping, dhclient, dig or curl.'
        : capture.status === 'paused' ? 'Resume capture to collect new transmissions.'
          : 'Run a command such as ping, dhclient, dig or curl to generate traffic.'}</p>)}
    </div>
    <nav className="packet-pagination" aria-label="Packet pages">
      <button type="button" className="mini-btn" disabled={start === 0} onClick={() => changePage(Math.max(0, start - PACKET_PAGE_SIZE))}>Previous</button>
      <span>Page {Math.floor(start / PACKET_PAGE_SIZE) + 1} of {Math.max(1, Math.ceil(records.length / PACKET_PAGE_SIZE))}<br />
        {rows.length ? `${start + 1}–${start + rows.length} of ${records.length}` : '0 records'}</span>
      <button type="button" className="mini-btn" disabled={start + rows.length >= records.length} onClick={() => changePage(start + PACKET_PAGE_SIZE)}>Next</button>
    </nav>
    </>} details={selected ? <PacketDetails packet={selected} onClose={closeDetails} investigate={investigate} /> : <div className="packet-detail-placeholder">
      {selection ? 'Selected packet is no longer retained. Select another row.' : 'Select a row to inspect its layers and link endpoints.'}
    </div>} />
  </aside>;
}

export function PacketInspector({ layout = normalizePacketInspector(null), onLayoutChange = () => {} }: {
  layout?: PacketInspectorPreference; onLayoutChange?: (value: PacketInspectorPreference) => void;
}) {
  const open = useStore((s) => s.packetInspectorOpen);
  const capture = useStore((s) => s.packetCapture);
  const generation = useStore(s => s.topologyGeneration);
  const [view, setView] = useState(emptyPacketLiveView);
  const [filters, setFilters] = useState(emptyPacketFilters);
  const [selection, onSelect] = useState<CapturedPacket | null>(null);
  const [diagnosing, setDiagnosing] = useState(false);
  const previousGeneration = useRef(generation);
  if (previousGeneration.current !== generation) {
    previousGeneration.current = generation;
    setFilters(emptyPacketFilters);
    onSelect(null);
    setDiagnosing(false);
  }
  const previousCapture = useRef(capture);
  if (capture !== previousCapture.current) {
    if (packetCaptureWasReset(previousCapture.current, capture)) setView(emptyPacketLiveView());
    previousCapture.current = capture;
  }
  const listScroll = useRef(0);
  const workspace = diagnosing && document.querySelector('.main');
  return <>{open && <PacketInspectorContent capture={capture} view={view} setView={setView} listScroll={listScroll}
    layout={layout} onLayoutChange={onLayoutChange} filters={filters} setFilters={setFilters}
    selection={selection} onSelect={onSelect} investigate={() => setDiagnosing(true)} />}
    {workspace && createPortal(<PacketDiagnosis capture={capture} selected={selection?.id} close={() => {
      setDiagnosing(false);
      (document.querySelector<HTMLElement>('[data-investigate]') ?? document.getElementById('packets-toggle'))?.focus({ preventScroll: true });
    }} />, workspace)}</>;
}
