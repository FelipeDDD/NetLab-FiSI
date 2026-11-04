import { useEffect, useRef, useState } from 'react';
import { syntaxParameterHints, tokenizeSyntax } from '../referenceSyntax';
import type { ReferenceOperation } from '../terminalReference';

function CopyButton({ text, kind }: { text: string; kind: 'Syntax' | 'Beispiel' }) {
  const [message, setMessage] = useState('');
  const alive = useRef(true);
  const timer = useRef<ReturnType<typeof setTimeout>>();
  useEffect(() => {
    alive.current = true;
    return () => { alive.current = false; clearTimeout(timer.current); };
  }, []);
  return <div className="reference-copy">
    <button type="button" className="btn" aria-label={kind + ' kopieren: ' + text} onClick={async () => {
      let copied = false;
      try { if (navigator.clipboard?.writeText) { await navigator.clipboard.writeText(text); copied = true; } } catch {}
      if (!alive.current) return;
      clearTimeout(timer.current);
      setMessage(copied ? 'Kopiert' : 'Kopieren nicht möglich. Text markieren und Strg+C verwenden.');
      timer.current = setTimeout(() => setMessage(''), copied ? 1800 : 5000);
    }}>Kopieren</button>
    <span role="status" aria-live="polite">{message}</span>
  </div>;
}

function CopyExample({ text }: { text: string }) {
  return <div className="reference-example"><code>{text}</code><CopyButton text={text} kind="Beispiel" /></div>;
}


export function ReferenceOperationContent({ operation }: { operation: ReferenceOperation }) {
  const hasExample = operation.syntax !== operation.example;
  const hints = operation.parameters ? [operation.parameters] : syntaxParameterHints(operation.syntax);
  return <><p>{operation.description}</p>
  <div className="reference-syntax"><span>Syntax</span><div className="reference-syntax-line"><code>{tokenizeSyntax(operation.syntax).map((token, i) =>
    <span key={i} className={token.kind === 'literal' ? undefined : 'syntax-' + token.kind}>{token.text}</span>)}</code>
    {!hasExample && <CopyButton text={operation.syntax} kind="Syntax" />}</div></div>
  {(hasExample || hints.length > 0) && <details><summary>{hasExample ? 'Beispiel' : ''}{hasExample && hints.length > 0 ? ' & ' : ''}{hints.length > 0 ? 'Parameter' : ''}</summary>
    {hasExample && <CopyExample text={operation.example} />}
    {hints.length > 0 && <ul className="reference-parameters">{hints.map((hint, i) => <li key={i}>{hint}</li>)}</ul>}
  </details>}
  </>;
}

export function ReferenceNotes({ notes }: { notes: readonly string[] }) {
  return notes.length ? <details className="reference-notes"><summary>Hinweise & NetLab-Grenzen</summary>
    <ul>{notes.map((note, index) => <li key={index}>{note}</li>)}</ul>
  </details> : null;
}
