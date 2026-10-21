import { useEffect, useLayoutEffect, useId, useRef, type ReactNode } from 'react';

export interface InspectorTab { id: string; label: string; content: ReactNode }
const useTabLayoutEffect = typeof window === 'undefined' ? useEffect : useLayoutEffect;

// Keep each page mounted: hiding a tab must not dispose form drafts or debounce
// timers. Only an actual device selection change creates a new inspector.
export function InspectorTabs({ tabs, active, onChange, label = 'Host-Einstellungen' }: {
  tabs: InspectorTab[]; active: string; onChange: (id: string) => void; label?: string;
}) {
  const prefix = useId();
  const buttons = useRef<(HTMLButtonElement | null)[]>([]);
  const container = useRef<HTMLDivElement>(null);
  const strip = useRef<HTMLDivElement>(null);
  const activeIndex = tabs.findIndex((tab) => tab.id === active);
  const reveal = (button: HTMLButtonElement | null) => {
    const bar = strip.current;
    if (!bar || !button || !bar.clientWidth) return;
    const rect = button.getBoundingClientRect(), bounds = bar.getBoundingClientRect();
    // Scroll just the strip, never the Inspector, editor or terminal dock.
    if (rect.left < bounds.left) bar.scrollLeft += rect.left - bounds.left;
    else if (rect.right > bounds.right) bar.scrollLeft += rect.right - bounds.right;
  };
  useTabLayoutEffect(() => {
    const update = () => reveal(buttons.current[activeIndex]);
    update();
    if (!strip.current) return;
    const observer = new ResizeObserver(update);
    observer.observe(strip.current);
    return () => observer.disconnect();
  }, [activeIndex]);
  useEffect(() => {
    // A shortcut button inside the previous page may have changed the active
    // tab. Move focus out of that now-hidden page, without stealing editor focus.
    const focused = document.activeElement;
    if (focused instanceof HTMLElement && container.current?.contains(focused)
      && focused.closest('[role="tabpanel"][hidden]')) {
      buttons.current[activeIndex]?.focus();
    }
  }, [activeIndex]);
  return <div ref={container}>
    <div ref={strip} className="inspector-tabs" data-tab-count={tabs.length} role="tablist" aria-label={label}>
      {tabs.map((tab, index) => <button key={tab.id} type="button" role="tab"
        id={`${prefix}-tab-${tab.id}`} aria-controls={`${prefix}-panel-${tab.id}`}
        aria-selected={active === tab.id} tabIndex={active === tab.id ? 0 : -1}
        ref={(element) => { buttons.current[index] = element; }} onClick={() => onChange(tab.id)}
        onFocus={event => reveal(event.currentTarget)}
        onKeyDown={(event) => {
          if (event.nativeEvent.isComposing || event.defaultPrevented || event.altKey || event.ctrlKey || event.metaKey) return;
          let next: number;
          if (event.key === 'ArrowRight') next = (index + 1) % tabs.length;
          else if (event.key === 'ArrowLeft') next = (index + tabs.length - 1) % tabs.length;
          else if (event.key === 'Home') next = 0;
          else if (event.key === 'End') next = tabs.length - 1;
          else return;
          event.preventDefault(); buttons.current[next]?.focus(); onChange(tabs[next].id);
        }}>{tab.label}</button>)}
    </div>
    {tabs.map((tab) => <div key={tab.id} className="inspector-tab-panel" role="tabpanel"
      id={`${prefix}-panel-${tab.id}`} aria-labelledby={`${prefix}-tab-${tab.id}`}
      hidden={active !== tab.id} tabIndex={0}>{tab.content}</div>)}
  </div>;
}
