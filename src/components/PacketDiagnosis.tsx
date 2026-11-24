import { useLayoutEffect, useMemo, useRef } from 'react';
import { useDesktopWindow } from '../browser/useDesktopWindow';
import { constrainWindow, windowLimits, WINDOW_MARGIN, type WindowArea } from '../browser/windowGeometry';
import { browserText } from '../browser/messages';
import '../browser/browser.css';
import { ipToString } from '../engine/ip';
import type { Tuple } from '../engine/conntrack';
import type { TraceFact } from '../engine/packetTrace';
import { useTranslation } from '../i18n';
import type { CapturedPacket, PacketCaptureState } from '../packetCapture';
import { packetPath } from '../packetPath';
import { packetSummary } from '../packetPresentation';

const DIAGNOSIS_SIZE = { width: 520, height: 400 };

function place(area: WindowArea, parent: HTMLElement) {
  const bounds = parent.getBoundingClientRect();
  const panel = parent.querySelector('#packet-inspector')?.getBoundingClientRect();
  if (panel) {
    const left = panel.left - bounds.left;
    const right = panel.right - bounds.left;
    const useLeft = left >= area.width - right;
    const available = (useLeft ? left : area.width - right) - 2 * WINDOW_MARGIN;
    if (available >= windowLimits(area).minWidth) {
      const width = Math.min(DIAGNOSIS_SIZE.width, available);
      return constrainWindow({ ...DIAGNOSIS_SIZE, width,
        x: useLeft ? left - width - WINDOW_MARGIN : right + WINDOW_MARGIN,
        y: panel.top - bounds.top + WINDOW_MARGIN }, area);
    }
  }
  return constrainWindow({ ...DIAGNOSIS_SIZE,
    x: area.width - DIAGNOSIS_SIZE.width - WINDOW_MARGIN, y: WINDOW_MARGIN }, area);
}

function endpoints(tuple: Tuple) {
  const { srcIp, dstIp, srcPort, dstPort, proto } = tuple;
  return proto === 'icmp' ? `${ipToString(srcIp)} → ${ipToString(dstIp)} (ICMP id ${srcPort})`
    : `${ipToString(srcIp)}:${srcPort} → ${ipToString(dstIp)}:${dstPort}`;
}

function describe(fact: TraceFact, t: ReturnType<typeof useTranslation>['t']) {
  switch (fact.kind) {
    case 'more': return t('traffic.detailsLimit');
    case 'received': return t('traffic.received');
    case 'local': return t('traffic.local');
    case 'route': return `${t('traffic.routeDecision')} · ${ipToString(fact.route.dest)}/${fact.route.prefix} → ${ipToString(fact.nextHop)} · ${fact.route.ifaceName}`;
    case 'firewall': return `Firewall · ${fact.chain} · ${fact.rule} → ${fact.verdict}`;
    case 'nat': return `${fact.rule} · ${endpoints(fact.before)} ⇒ ${endpoints(fact.after)}`;
    case 'drop': return [t(`traffic.${fact.reason}`), fact.detail].filter(Boolean).join(' · ');
  }
}

const blocked = (f: TraceFact) => f.kind === 'drop' || (f.kind === 'firewall' && f.verdict !== 'accept');
type Translate = ReturnType<typeof useTranslation>['t'];

// Classify the message itself. Its relationship to another transmission comes
// only from the captured transfer IDs.
function messageRole(packet: CapturedPacket) {
  const payload = packet.frame.payload;
  if (payload.kind === 'arp') return payload.op === 'request' ? 'request' : 'reply';
  const { l4 } = payload;
  if (l4.kind === 'icmp') {
    if (l4.msg.type === 'echo-request') return 'request';
    if (l4.msg.type === 'echo-reply') return 'reply';
    return 'icmp-error';
  }
  if (l4.app?.kind === 'http-request' || l4.app?.kind === 'dns-query') return 'request';
  if (l4.app?.kind === 'http-response' || l4.app?.kind === 'dns-answer') return 'reply';
  if (l4.kind === 'tcp' && l4.syn && !l4.rst) return l4.ack ? 'reply' : 'request';
}

function hopResult(capture: PacketCaptureState, id: number, t: Translate) {
  const facts = capture.evidence?.get(id) ?? [];
  const failure = facts.find(e => blocked(e.fact));
  const local = facts.some(e => e.fact.kind === 'local');
  const received = facts.some(e => e.fact.kind === 'received');
  const result = local ? t('traffic.local') : received ? t('traffic.received') : t('traffic.unknown');
  return { facts, failed: !!failure, local, result: failure ? `${result} · ${describe(failure.fact, t)}` : result };
}

function roleLabel(role: ReturnType<typeof messageRole>, t: Translate) {
  if (role === 'request') return t('traffic.pathRequest');
  if (role === 'reply') return t('traffic.pathReply');
  if (role === 'icmp-error') return t('traffic.pathIcmpError');
}

export function PacketDiagnosis({ capture, selected, close }: {
  capture: PacketCaptureState; selected: number | undefined; close(): void;
}) {
  const { t, language } = useTranslation();
  const frame = useDesktopWindow(place), closeButton = useRef<HTMLButtonElement>(null);
  const { element } = frame;
  useLayoutEffect(() => {
    const panel = element.current, workspace = panel?.parentElement;
    if (!panel || !workspace) return;
    // In the stacked layout, the workspace scrolls under the floating window.
    const followWorkspace = () => { panel.style.translate = `0 ${workspace.scrollTop}px`; };
    followWorkspace();
    const observer = new ResizeObserver(followWorkspace);
    observer.observe(workspace);
    workspace.addEventListener('scroll', followWorkspace, { passive: true });
    return () => {
      observer.disconnect();
      workspace.removeEventListener('scroll', followWorkspace);
    };
  }, [element]);
  const path = useMemo(() => selected === undefined ? [] : packetPath(capture.records, selected), [capture.records, selected]);
  const ids = useMemo(() => new Set(capture.records.map(p => p.id)), [capture.records]);
  const answered = new Set(path.map(p => p.responseTo));
  const selectedPacket = path.find(p => p.id === selected);
  const selectedInfo = selectedPacket && packetSummary(selectedPacket);
  const selectedResult = selectedPacket && hopResult(capture, selectedPacket.id, t);
  const selectedRole = selectedPacket && messageRole(selectedPacket);
  const selectedLabel = roleLabel(selectedRole, t);
  const active = useRef<HTMLDetailsElement>(null);
  useLayoutEffect(() => { closeButton.current?.focus({ preventScroll: true }); }, []);
  useLayoutEffect(() => {
    const row = active.current, list = row?.parentElement;
    if (row && list) list.scrollTop += row.getBoundingClientRect().top - list.getBoundingClientRect().top;
  }, [selected]);
  return <section ref={frame.element} role="dialog" aria-labelledby="packet-diagnosis-title" className="packet-diagnosis"
    style={frame.rect && { left: frame.rect.x, top: frame.rect.y, width: frame.rect.width, height: frame.rect.height }}
    onPointerMove={frame.move} onPointerUp={frame.finish} onPointerCancel={frame.finish} onLostPointerCapture={frame.finish}
    onKeyDown={e => { e.stopPropagation(); if (e.key === 'Escape' && !e.defaultPrevented) { e.preventDefault(); close(); } }}>
    <header className="pc-desktop-header" tabIndex={0} title={browserText(language, 'moveWindow')}
      onPointerDown={e => frame.start('move', e)} onKeyDown={e => frame.keyboard('move', e)}>
      <div className="packet-diagnosis-heading" id="packet-diagnosis-title">
        <strong>{t('traffic.pathTitle')}</strong>
        {selected !== undefined && <span className="packet-diagnosis-selection">
          <small>{t('traffic.pathSelected')}</small> <strong>#{selected}</strong>
        </span>}
      </div>
      <button ref={closeButton} type="button" className="mini-btn" aria-label={t('common.close')} onClick={close}>×</button>
    </header>
    {selectedInfo && selectedResult && <div className="packet-diagnosis-overview">
      <p><strong data-tone={selectedRole === 'icmp-error' ? 'error' : selectedRole}>{selectedInfo.protocol}{selectedLabel && ` · ${selectedLabel}`}</strong>
        {' '}<span>{selectedInfo.source} → {selectedInfo.destination}</span></p>
      <p data-tone={selectedResult.failed ? 'error' : undefined}>{selectedResult.result}</p>
    </div>}
    <div className="packet-diagnosis-list">
      {!path.length && <p role="status">{t('traffic.absent')}</p>}
      {path.map(p => {
        const info = packetSummary(p), role = messageRole(p);
        const { facts, failed, local, result } = hopResult(capture, p.id, t);
        const tone = failed || role === 'icmp-error' ? 'error' : role;
        const label = roleLabel(role, t);
        return <details key={p.id} className="packet-diagnosis-hop" data-role={role} data-tone={tone}
          open={p.id === selected} ref={p.id === selected ? active : undefined}>
          <summary aria-current={p.id === selected || undefined}>
            <span className="packet-diagnosis-hop-id">#{p.id}</span>
            {' '}<strong>{p.fromDeviceName} / {p.fromInterface} → {p.toDeviceName} / {p.toInterface}</strong>
            <small><span className="packet-diagnosis-kind">{info.protocol}{label && ` · ${label}`}</span> · {result}</small>
          </summary>
          <p>{info.summary} · {info.source} → {info.destination}</p>
          <p>{t('traffic.sent')}{p.parentTransferId !== undefined && ` · ${t(ids.has(p.parentTransferId) ? 'traffic.after' : 'traffic.partial')} #${p.parentTransferId}`}</p>
          {p.responseTo !== undefined && <p>{t('traffic.pathResponseTo')} #{p.responseTo}{!ids.has(p.responseTo) && ` · ${t('traffic.partial')}`}</p>}
          {p.resolvedByArp !== undefined && <p>{t('traffic.resolved')} #{p.resolvedByArp}</p>}
          <ul>{facts.map(({ deviceId, fact }, i) => <li key={i}>
            {deviceId === p.fromDeviceId ? p.fromDeviceName : p.toDeviceName} · {describe(fact, t)}
          </li>)}</ul>
          {local && role === 'request' && !answered.has(p.id) && <p>{t('traffic.noReply')}</p>}
        </details>;
      })}
    </div>
    <button type="button" className="pc-window-resizer resize-se" title={browserText(language, 'resizeWindow')}
      aria-label={browserText(language, 'resizeWindow')}
      onPointerDown={e => frame.start('se', e)} onKeyDown={e => frame.keyboard('se', e)} />
  </section>;
}
