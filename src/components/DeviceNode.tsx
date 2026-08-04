import { memo } from 'react';
import { Handle, Position } from '@xyflow/react';
import type { NodeProps } from '@xyflow/react';
import type { DevNode } from '../store';
import type { DeviceKind } from '../engine/device';

export const NODE_W = 96;
export const NODE_H = 78;

export function DeviceIcon({ kind, size = 30 }: { kind: DeviceKind; size?: number }) {
  if (kind === 'host') {
    return (
      <svg viewBox="0 0 32 32" width={size} height={size} aria-hidden>
        <rect x="4" y="6" width="24" height="15" rx="2" fill="none" stroke="currentColor" strokeWidth="2" />
        <rect x="7" y="9" width="18" height="9" fill="currentColor" opacity="0.35" />
        <rect x="12" y="23" width="8" height="2" fill="currentColor" />
        <rect x="9" y="26" width="14" height="2" rx="1" fill="currentColor" />
      </svg>
    );
  }
  if (kind === 'switch') {
    return (
      <svg viewBox="0 0 32 32" width={size} height={size} aria-hidden>
        <rect x="3" y="10" width="26" height="12" rx="2" fill="none" stroke="currentColor" strokeWidth="2" />
        <path d="M8 14h8m0 0-2.5-2.5M16 14l-2.5 2.5" stroke="currentColor" strokeWidth="1.6" fill="none" />
        <path d="M24 18h-8m0 0 2.5-2.5M16 18l2.5 2.5" stroke="currentColor" strokeWidth="1.6" fill="none" />
      </svg>
    );
  }
  if (kind === 'server') {
    return (
      <svg viewBox="0 0 32 32" width={size} height={size} aria-hidden>
        <rect x="6" y="4" width="20" height="8" rx="1.5" fill="none" stroke="currentColor" strokeWidth="2" />
        <rect x="6" y="14" width="20" height="8" rx="1.5" fill="none" stroke="currentColor" strokeWidth="2" />
        <circle cx="10" cy="8" r="1.3" fill="currentColor" />
        <circle cx="10" cy="18" r="1.3" fill="currentColor" />
        <path d="M14 8h8M14 18h8" stroke="currentColor" strokeWidth="1.4" />
        <path d="M12 25h8M16 22v3" stroke="currentColor" strokeWidth="1.6" fill="none" />
      </svg>
    );
  }
  if (kind === 'ap') {
    return (
      <svg viewBox="0 0 32 32" width={size} height={size} aria-hidden>
        <path d="M6 14a14 14 0 0 1 20 0" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
        <path d="M10 18a8.5 8.5 0 0 1 12 0" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
        <circle cx="16" cy="23" r="2.4" fill="currentColor" />
        <path d="M16 25v3" stroke="currentColor" strokeWidth="2" />
      </svg>
    );
  }
  if (kind === 'firewall') {
    return (
      <svg viewBox="0 0 32 32" width={size} height={size} aria-hidden>
        <path
          d="M16 3l10 4v8c0 7-4.5 11.5-10 14C10.5 26.5 6 22 6 15V7l10-4z"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
        />
        <path d="M9 12h14M9 17h14M13 12v5M19 12v5" stroke="currentColor" strokeWidth="1.4" fill="none" />
      </svg>
    );
  }
  return (
    <svg viewBox="0 0 32 32" width={size} height={size} aria-hidden>
      <circle cx="16" cy="16" r="12" fill="none" stroke="currentColor" strokeWidth="2" />
      <path d="M16 8v6m0 0-2.5-2M16 14l2.5-2M16 24v-6m0 0-2.5 2m2.5-2 2.5 2M8 16h6m10 0h-6" stroke="currentColor" strokeWidth="1.6" fill="none" />
    </svg>
  );
}

function DeviceNodeInner({ data, selected }: NodeProps<DevNode>) {
  return (
    <div className={`device-node kind-${data.kind}${selected ? ' selected' : ''}`}>
      <Handle type="source" position={Position.Top} id="t" />
      <Handle type="source" position={Position.Right} id="r" />
      <Handle type="source" position={Position.Bottom} id="b" />
      <Handle type="source" position={Position.Left} id="l" />
      <div className="dev-icon">
        <DeviceIcon kind={data.kind} />
      </div>
      {data.fw === true && (
        <span className="dev-fw-badge" title="firewall rules active">
          ⛨
        </span>
      )}
      <div className="dev-label">{data.label}</div>
      <div className="dev-ip">{data.ips.length ? data.ips[0] + (data.ips.length > 1 ? ' +' : '') : ' '}</div>
    </div>
  );
}

export const DeviceNode = memo(DeviceNodeInner);
