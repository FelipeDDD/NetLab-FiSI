import { Fragment, useEffect, useRef, useState } from 'react';
import type { KeyboardEvent, PointerEvent } from 'react';
import { useStore } from '../store';
import { clampDockHeight, dockHeightBounds, readDockHeight, saveDockHeight } from './terminalDockLayout';
import { terminalEscapeToEditor, terminalNavigationDirection } from '../terminalShortcuts';
import { TerminalPanelView } from './TerminalPanelView';
import { TerminalPanelSplitter } from './TerminalPanelSplitter';
import { TerminalSettingsButton } from './TerminalAppearanceControls';

export function TerminalDock({ onFocusEditor }: { onFocusEditor: () => void }) {
  const panels = useStore((s) => s.terminalPanels);
  const activeTerminal = useStore((s) => s.activeTerminal);
  const hasFocus = useStore((s) => s.terminalHasFocus);
  const [preferredHeight, setPreferredHeight] = useState(readDockHeight);
  const [viewportHeight, setViewportHeight] = useState(window.innerHeight);
  const drag = useRef<{ pointerId: number; startY: number; startHeight: number; height: number } | null>(null);
  useStore((s) => s.uiPulse); // device renames in panel headers

  useEffect(() => {
    const resize = () => setViewportHeight(window.innerHeight);
    window.addEventListener('resize', resize);
    return () => window.removeEventListener('resize', resize);
  }, []);

  const height = clampDockHeight(preferredHeight, viewportHeight);
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
    <div className="terminal-dock" style={{ height }}
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
      <div className="terminal-body" id="terminal-body">
        <div className="terminal-panels">
          {panels.map((panel, index) => <Fragment key={panel.id}>
            <TerminalPanelView panel={panel} index={index} focused={hasFocus && panel.tabs.includes(activeTerminal ?? '')} />
            {panels[index + 1] && <TerminalPanelSplitter left={panel} right={panels[index + 1]} index={index} />}
          </Fragment>)}
        </div>
      </div>
    </div>
  );
}
