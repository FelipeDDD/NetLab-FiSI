import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { findReference, REFERENCE_CATEGORIES, TERMINAL_REFERENCE, type ReferenceOs } from '../terminalReference';
import { ReferenceOperationContent, ReferenceNotes } from './ReferenceOperationContent';
import { useFloatingReferences } from './FloatingCommandReferences';
import { canPinReference } from '../floatingReferences';
import { useTranslation } from '../i18n';
import './terminalCommandReference.css';

export function TerminalCommandReference({ origin, onClose }: { origin: HTMLButtonElement; onClose: () => void }) {
  const pins = useFloatingReferences();
  const { t } = useTranslation();
  const [pinMessage, setPinMessage] = useState<'added' | 'duplicate' | 'limit' | null>(null);
  const dialog = useRef<HTMLDialogElement>(null), searchInput = useRef<HTMLInputElement>(null);
  const content = useRef<HTMLElement>(null);
  const [os, setOs] = useState<ReferenceOs>('linux');
  const [search, setSearch] = useState(''), [category, setCategory] = useState('');
  const [selectedId, setSelectedId] = useState('linux-ip-route');
  const available = findReference(os, search, category);
  const selected = available.find(e => e.id === selectedId) ?? available[0];
  useEffect(() => {
    const element = dialog.current!;
    element.showModal();
    searchInput.current?.focus({ preventScroll: true });
    return () => { element.close(); if (origin.isConnected) origin.focus({ preventScroll: true }); };
  }, [origin]);
  useEffect(() => { if (content.current) content.current.scrollTop = 0; }, [selected?.id]);
  return createPortal(<dialog ref={dialog} className="terminal-reference" data-floating-popover="" lang="de"
    aria-labelledby="terminal-reference-title" onCancel={event => { event.preventDefault(); onClose(); }}
    onKeyDown={event => {
      event.stopPropagation();
      if (event.key !== 'Tab' || event.ctrlKey || event.altKey || event.metaKey) return;
      // Chromium can hand focus to browser chrome at the end of a native dialog.
      // Keep both boundaries in the reference; normal interior Tab stays native.
      const items = [...event.currentTarget.querySelectorAll<HTMLElement>('button:not(:disabled), input, select, summary')]
        .filter(element => element.getClientRects().length > 0);
      const boundary = event.shiftKey ? items[0] : items[items.length - 1];
      if (document.activeElement === boundary) {
        event.preventDefault();
        (event.shiftKey ? items[items.length - 1] : items[0])?.focus();
      }
    }}
    onClick={event => {
      if (event.target !== event.currentTarget) return;
      const r = event.currentTarget.getBoundingClientRect();
      if (event.clientX < r.left || event.clientX > r.right || event.clientY < r.top || event.clientY > r.bottom) onClose();
    }}>
    <header className="reference-heading">
      <div><h2 id="terminal-reference-title">Terminal — Befehlsreferenz</h2>
        <p>Unterstützte NetLab-Befehle. Beispiele werden nur kopiert; Adressen an den eigenen Netzplan anpassen.</p>
        <p className="reference-legend">Syntax: <span className="syntax-value">&lt;Wert&gt; / 0|1</span> = selbst wählen · <span className="syntax-optional">[ ]</span> = optional</p></div>
      <button className="btn" type="button" aria-label="Befehlsreferenz schließen" onClick={onClose}>×</button>
    </header>
    <div className="reference-filters">
      <label>Suchen<input ref={searchInput} type="search" placeholder="Befehl oder Thema, z. B. Gateway" value={search}
        onChange={e => setSearch(e.target.value)} /></label>
      <label>Terminal<select value={os} onChange={e => {
        const next = e.target.value as ReferenceOs;
        setOs(next); setCategory(''); setSelectedId(next === 'linux' ? 'linux-ip-route' : 'windows-route');
      }}><option value="linux">Linux</option><option value="windows">Windows CMD</option></select></label>
    </div>
    {pinMessage && <p className="reference-pin-message" role="status">{pinMessage === 'added'
      ? t('referencePins.added', { count: pins?.count ?? 0 })
      : t(pinMessage === 'duplicate' ? 'referencePins.duplicate' : 'referencePins.limit')}</p>}
    <div className="reference-layout">
      <nav className="reference-navigation" aria-label="Befehlskategorien und Befehle">
        <div className="reference-categories">
          <button type="button" className="btn" aria-pressed={category === ''} onClick={() => setCategory('')}>Alle Themen</button>
          {REFERENCE_CATEGORIES.filter(c => TERMINAL_REFERENCE.some(e => e.os === os && e.category === c.id)).map(c =>
            <button type="button" className="btn" key={c.id} aria-pressed={category === c.id} onClick={() => setCategory(c.id)}>{c.title}</button>)}
        </div>
        <p className="reference-count" role="status">{available.length} Befehle</p>
        <div className="reference-command-list">{available.map(e => <button type="button" className="btn" key={e.id}
          aria-current={selected?.id === e.id ? 'true' : undefined}
          onClick={() => setSelectedId(e.id)}>{e.title}</button>)}</div>
      </nav>
      <section ref={content} className="reference-content" aria-label="Befehlsdetails">
        {selected ? <article key={selected.id}>
          <h3>{selected.title}</h3><p>{selected.summary}</p>
          {selected.operations.map((operation, index) => <section className="reference-operation" key={index}>
            <div className="reference-operation-heading"><h4>{operation.title}</h4>
              {pins && canPinReference({ entryId: selected.id, operationIndex: index }) && <button type="button" className="btn reference-pin"
                title={t('referencePins.pin')} aria-label={t('referencePins.pin') + ': ' + operation.title}
                onClick={() => {
                  const result = pins.pin({ entryId: selected.id, operationIndex: index });
                  setPinMessage(result === 'added' ? 'added' : result === 'duplicate' ? 'duplicate' : 'limit');
                }}><svg viewBox="0 0 24 24" width="16" height="16" aria-hidden="true" fill="none" stroke="currentColor" strokeWidth="1.8"><path d="m16 3 5 5-4 1-3 5-4-4 5-3Z M10 10l-4 4 4 4 4-4 M8 16l-5 5" /></svg></button>}
            </div>
            <ReferenceOperationContent operation={operation} />
          </section>)}
          <ReferenceNotes notes={selected.notes} />
        </article> : <p role="status">Keine passenden Befehle. Suchtext oder Kategorie ändern.</p>}
      </section>
    </div>
  </dialog>, document.body);
}
