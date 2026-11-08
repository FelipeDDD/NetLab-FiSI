import type { Language } from '../../i18n';
import { readStudioPresentation } from '../../studioPresentation';
import type { PrintSnapshot } from './model';
import { printPreset } from './options';
import { createPageSession, pageLayoutKey, preparePageSession, reconcilePageSession, type StudioPageSession } from './pageLayouts';

export function restoreStudioPresentation(value: unknown, snapshot: PrintSnapshot, language: Language) {
  const { data, warning } = readStudioPresentation(value, snapshot.devices);
  if (!data) return { session: createPageSession(printPreset('clean', snapshot)), alignmentGuides: true, positioningTipDismissed: false, warning };
  const session: StudioPageSession = { shared: data.shared, layouts: Object.fromEntries(Object.entries(data.layouts).map(([key, page]) => [key, { ...page, compactUndo: null, compactNotice: false }])) };
  const active = pageLayoutKey(session.shared);
  if (!session.layouts[active]) session.layouts[active] = { devicePositions: {}, compactOffsets: {}, blocks: {}, compactUndo: null, compactNotice: false };
  const prepared = preparePageSession(session, snapshot, language);
  return { session: reconcilePageSession(prepared, snapshot, language), alignmentGuides: data.alignmentGuides, positioningTipDismissed: !!data.positioningTipDismissed, warning };
}
