import { createContext, useContext, useState, type Dispatch, type ReactNode, type SetStateAction } from 'react';

const CollapseContext = createContext<{
  collapsed: ReadonlySet<string>;
  set(key: string, value: SetStateAction<boolean>): void;
} | null>(null);

export function GuidedPanelCollapse({ children }: { children: ReactNode }) {
  const [collapsed, setCollapsed] = useState<ReadonlySet<string>>(() => new Set());
  return <CollapseContext.Provider value={{
    collapsed,
    set: (key, value) => setCollapsed(previous => {
      const isCollapsed = previous.has(key);
      const next = typeof value === 'function' ? value(isCollapsed) : value;
      if (next === isCollapsed) return previous;
      const updated = new Set(previous);
      if (next) updated.add(key);
      else updated.delete(key);
      return updated;
    }),
  }}>{children}</CollapseContext.Provider>;
}

export function useGuidedPanelCollapse(chapter: string, draftId: string | null | undefined): [boolean, Dispatch<SetStateAction<boolean>>] {
  const context = useContext(CollapseContext);
  const key = chapter + ':' + draftId;
  return [context?.collapsed.has(key) ?? false, value => { if (draftId) context?.set(key, value); }];
}
