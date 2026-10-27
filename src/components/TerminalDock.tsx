import { Fragment, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import type { KeyboardEvent, PointerEvent } from 'react';
import { useStore } from '../store';
import { clampDockHeight, COLLAPSED_DOCK_HEIGHT, dockHeightBounds, readDockHeight, saveDockHeight } from './terminalDockLayout';
import { terminalEscapeToEditor, terminalNavigationDirection } from '../terminalShortcuts';
import { TerminalPanelView } from './TerminalPanelView';
import { TerminalPanelSplitter } from './TerminalPanelSplitter';
import { TerminalSettingsButton } from './TerminalAppearanceControls';
import { terminalPanelWidths, TERMINAL_PANEL_SEPARATOR_WIDTH } from '../terminalPanels';
import { TerminalNewPanelDrop, TerminalTabMovementProvider } from './TerminalTabMovement';

export function TerminalDock({ onFocusEditor, onOverlapHeightChange }: {
  onFocusEditor: () => void; onOverlapHeightChange?: (height: number) => void;
}) {
  const panels = useStore((s) => s.terminalPanels);
  const activeTerminal = useStore((s) => s.activeTerminal);
  const hasFocus = useStore((s) => s.terminalHasFocus);
  const collapsed = useStore((s) => s.terminalDockCollapsed);
  const count = useStore((s) => s.terminals.length);
  const [preferredHeight, setPreferredHeight] = useState(readDockHeight);
  const [viewportHeight, setViewportHeight] = useState(window.innerHeight);
  const drag = useRef<{ pointerId: number; startY: number; startHeight: number; height: number } | null>(null);
  const columns = useRef<HTMLDivElement>(null);
  const [availableWidth, setAvailableWidth] = useState(0);
  useLayoutEffect(() => {
    const element = columns.current;
    if (!element || collapsed) return;
    const update = () => { if (element.clientWidth > 0) setAvailableWidth(element.clientWidth); };
    const observer = new ResizeObserver(update);
    observer.observe(element);
    update();
    return () => observer.disconnect();
  }, [panels.length, collapsed]);
  const widths = useMemo(() => terminalPanelWidths(panels, Math.max(0, availableWidth - (panels.length - 1) * TERMINAL_PANEL_SEPARATOR_WIDTH)), [panels, availableWidth]);
  useStore((s) => s.uiPulse); // device renames in panel headers

  useEffect(() => {
    const resize = () => setViewportHeight(window.innerHeight);
    window.addEventListener('resize', resize);
    return () => window.removeEventListener('resize', resize);
  }, []);

  const height = clampDockHeight(preferredHeight, viewportHeight);
  // Only report existing geometry. Focus/stacking never changes dock height or
  // causes a fit, and collapsed/closed docks leave the normal Inspector bounds.
  const overlapHeight = panels.length && !collapsed ? height : 0;
  useLayoutEffect(() => { onOverlapHeightChange?.(overlapHeight); }, [overlapHeight, onOverlapHeightChange]);
  const bounds = dockHeightBounds(viewportHeight);
  const changeHeight = (next: number) => {
    const clamped = clampDockHeight(next, window.innerHeight);
    setPreferredHeight(clamped);
    return clamped;
  };
  const finishResize = (event: PointerEvent<HTMLDivElement>) => {
    if (drag.current?.pointerId !== event.pointerId) return;
    saveDockHeight(changeHeight(drag.current.height));
    drag.current = null;
    if (event.currentTarget.hasPointerCapture(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId);
  };
  const resizeWithKeyboard = (event: KeyboardEvent<HTMLDivElement>) => {
    let next: number;
    switch (event.key) {
      case 'ArrowUp': next = height + (event.shiftKey ? 50 : 10); break;
      case 'ArrowDown': next = height - (event.shiftKey ? 50 : 10); break;
      case 'Home': next = bounds.min; break;
      case 'End': next = bounds.max; break;
      default: return;
    }
    event.preventDefault();
    event.stopPropagation();
    saveDockHeight(changeHeight(next));
  };

  if (!panels.length) return null;
  return (
    <TerminalTabMovementProvider>
    <div className={`terminal-dock${collapsed ? ' is-collapsed' : ''}`} style={{ height: collapsed ? COLLAPSED_DOCK_HEIGHT : height }}
      onFocusCapture={(event) => {
        const target = event.target as HTMLElement;
        if (!target.closest('.xterm')) {
          const panel = target.closest<HTMLElement>('[data-terminal-pane]');
          if (panel) useStore.getState().noteTerminalPanelFocus(panel.id);
          return;
        }
        const id = target.closest<HTMLElement>('[data-terminal-device]')?.dataset.terminalDevice;
        if (id) useStore.getState().noteTerminalFocus(id);
      }}
      onBlurCapture={(event) => {
        const next = event.relatedTarget as HTMLElement | null;
        if (!next?.closest?.('.xterm')) useStore.getState().releaseTerminalFocus();
      }}
      onKeyDownCapture={(event) => {
        const target = event.target as HTMLElement;
        if (target.closest('[data-floating-popover]')) return;
        if (target.closest('input, textarea, [contenteditable="true"]') && !target.closest('.xterm')) return;
        if (target.closest('.xterm') && terminalEscapeToEditor(event.nativeEvent)) {
          event.preventDefault();
          event.stopPropagation();
          useStore.getState().releaseTerminalFocus();
          onFocusEditor();
          return;
        }
        const direction = terminalNavigationDirection(event.nativeEvent);
        if (direction === null) return;
        event.preventDefault();
        event.stopPropagation();
        const origin = target.closest<HTMLElement>('[data-terminal-device]')?.dataset.terminalDevice;
        useStore.getState().cycleTerminal(direction, origin);
      }}>
      <div
        className="terminal-resizer"
        hidden={collapsed}
        role="separator"
        tabIndex={0}
        aria-label="Resize terminal dock"
        aria-orientation="horizontal"
        aria-controls="terminal-body"
        aria-valuemin={bounds.min}
        aria-valuemax={bounds.max}
        aria-valuenow={height}
        aria-valuetext={height + ' pixels'}
        title="Drag to resize. Use Up/Down arrows, Home or End."
        onKeyDown={resizeWithKeyboard}
        onPointerDown={(event) => {
          if (event.button !== 0 || !event.isPrimary) return;
          event.preventDefault();
          event.currentTarget.focus();
          event.currentTarget.setPointerCapture(event.pointerId);
          drag.current = { pointerId: event.pointerId, startY: event.clientY, startHeight: height, height };
        }}
        onPointerMove={(event) => {
          const current = drag.current;
          if (current?.pointerId !== event.pointerId) return;
          current.height = changeHeight(current.startHeight + current.startY - event.clientY);
        }}
        onPointerUp={finishResize}
        onPointerCancel={finishResize}
        onLostPointerCapture={finishResize}
      />
      <TerminalSettingsButton />
      <button type="button" className="terminal-dock-toggle" aria-expanded={!collapsed} aria-controls="terminal-body"
        aria-label={collapsed ? 'Expand terminals' : 'Collapse terminals'} title={collapsed ? 'Expand terminals' : 'Collapse terminals'}
        onClick={() => {
          useStore.getState().setTerminalDockCollapsed(!collapsed);
          if (!collapsed) onFocusEditor();
        }}>
        {collapsed && <span className="terminal-collapsed-label">{count} {count === 1 ? 'terminal' : 'terminals'}</span>}
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
          <path d={collapsed ? 'M6 15l6-6 6 6' : 'M6 9l6 6 6-6'} />
        </svg>
      </button>
      <div className="terminal-body" id="terminal-body" hidden={collapsed}>
        <div className="terminal-panels" ref={columns}>
          {panels.map((panel, index) => <Fragment key={panel.id}>
            <TerminalPanelView panel={panel} index={index} width={widths[index]} suspended={collapsed} focused={hasFocus && panel.tabs.includes(activeTerminal ?? '')} />
            {panels[index + 1] && <TerminalPanelSplitter left={panel} right={panels[index + 1]} index={index} suspended={collapsed} />}
          </Fragment>)}
        </div>
      </div>
      <TerminalNewPanelDrop />
    </div>
    </TerminalTabMovementProvider>
  );
}
