import { useEffect, useRef, useState } from 'react';
import type { ReactNode } from 'react';
import { copyIpv4, ipv4WithoutPrefix } from '../clipboard';

export function CopyIpButton({ address, context, children, title }: {
  address: string;
  context: string;
  children?: ReactNode;
  title?: string;
}) {
  const [status, setStatus] = useState<'idle' | 'copied' | 'failed'>('idle');
  const sequence = useRef(0);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const ip = ipv4WithoutPrefix(address);
  const iconOnly = children === undefined;
  const label = `Copy IPv4 address ${ip ?? address} (${context})`;

  useEffect(() => {
    setStatus('idle');
    return () => {
      sequence.current++;
      if (timer.current !== null) clearTimeout(timer.current);
    };
  }, [address]);

  const copy = async () => {
    const request = ++sequence.current;
    if (timer.current !== null) clearTimeout(timer.current);
    setStatus('idle');
    const copied = await copyIpv4(address);
    if (request !== sequence.current) return;
    setStatus(copied ? 'copied' : 'failed');
    timer.current = setTimeout(() => setStatus('idle'), copied ? 1600 : 5000);
  };

  return (
    <button
      type="button"
      className={`copy-ip ${iconOnly ? 'copy-ip-icon' : 'copy-ip-text'} ${status} nodrag nopan nowheel nokey`}
      aria-label={title ? `${label}. ${title}` : label}
      title={title ?? label}
      disabled={ip === null}
      onPointerDown={(e) => {
        e.stopPropagation();
        // Copy the configured interface address without committing/remounting
        // an adjacent input that may contain an unfinished edit.
        if (iconOnly) e.preventDefault();
      }}
      onMouseDown={(e) => e.stopPropagation()}
      onKeyDown={(e) => e.stopPropagation()}
      onKeyUp={(e) => e.stopPropagation()}
      onCopy={(e) => e.stopPropagation()}
      onDoubleClick={(e) => e.stopPropagation()}
      onClick={(e) => {
        e.stopPropagation();
        const selected = window.getSelection();
        // Dragging over the address is still native text selection. Do not
        // replace it with a full-address copy on the final mouse click.
        if (e.detail !== 0 && selected && !selected.isCollapsed &&
          (e.currentTarget.contains(selected.anchorNode) || e.currentTarget.contains(selected.focusNode))) return;
        void copy();
      }}
    >
      {iconOnly ? (
        <svg viewBox="0 0 20 20" width="14" height="14" aria-hidden="true">
          {status === 'copied'
            ? <path d="m4 10 4 4 8-8" fill="none" stroke="currentColor" strokeWidth="1.8" />
            : <><rect x="7" y="7" width="9" height="10" rx="1.5" fill="none" stroke="currentColor" strokeWidth="1.5" /><path d="M12 7V3H3v10h4" fill="none" stroke="currentColor" strokeWidth="1.5" /></>}
        </svg>
      ) : children}
      <span className="copy-ip-feedback" role="status" aria-live="polite" aria-atomic="true">
        {status === 'copied' ? 'Copied' : status === 'failed' ? 'Copy failed. Select the address and press Ctrl+C (Cmd+C on Mac).' : ''}
      </span>
    </button>
  );
}
