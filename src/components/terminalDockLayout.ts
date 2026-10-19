export const DOCK_HEIGHT_KEY = 'netlab:terminal-dock-height:v1';
export const DEFAULT_DOCK_HEIGHT = 280;

export function dockHeightBounds(viewportHeight: number) {
  const available = Math.max(0, viewportHeight - 52); // toolbar
  const topology = Math.min(160, available / 2);
  const max = Math.floor(Math.min(600, available * 0.65, available - topology));
  return { min: Math.min(160, max), max };
}

export function clampDockHeight(height: number, viewportHeight: number): number {
  const { min, max } = dockHeightBounds(viewportHeight);
  return Math.max(min, Math.min(max, Math.round(height)));
}

export function readDockHeight(): number {
  try {
    const saved = localStorage.getItem(DOCK_HEIGHT_KEY);
    const height = saved === null ? NaN : Number(saved);
    if (saved?.trim() && Number.isFinite(height) && height > 0) return height;
  } catch {
    // Preferences are optional when storage is blocked.
  }
  return DEFAULT_DOCK_HEIGHT;
}

export function saveDockHeight(height: number): void {
  try {
    localStorage.setItem(DOCK_HEIGHT_KEY, String(height));
  } catch {
    // Resizing still works when storage is blocked or full.
  }
}

// Only visible panes are fitted. Coalesce ResizeObserver notifications and
// disconnect on unmount/hide without disposing the underlying session.
export function observeTerminalSize(host: HTMLElement, fit: () => void): () => void {
  let frame: number | null = null;
  let stopped = false;
  const requestFit = () => {
    if (stopped || frame !== null) return;
    frame = requestAnimationFrame(() => {
      frame = null;
      if (host.clientWidth > 0 && host.clientHeight > 0) fit();
    });
  };
  const observer = new ResizeObserver(requestFit);
  observer.observe(host);
  requestFit();
  return () => {
    stopped = true;
    observer.disconnect();
    if (frame !== null) cancelAnimationFrame(frame);
  };
}
