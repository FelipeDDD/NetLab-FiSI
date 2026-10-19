type Anchor = { left: number; right: number; top: number; bottom: number };

// Fixed coordinates in the viewport, independent of any scrolling ancestor.
export function floatingPosition(anchor: Anchor, viewport: { width: number; height: number }, width: number, contentHeight: number) {
  const gutter = 8;
  const gap = 6;
  const availableWidth = Math.max(0, viewport.width - gutter * 2);
  const popupWidth = Math.min(width, availableWidth);
  const below = Math.max(0, viewport.height - gutter - Math.max(gutter, anchor.bottom + gap));
  const above = Math.max(0, Math.min(viewport.height - gutter, anchor.top - gap) - gutter);
  const flip = below < contentHeight && (above >= contentHeight || (below < 150 && above > below));
  const maxHeight = flip ? above : below;
  return {
    left: Math.max(gutter, Math.min(anchor.left, viewport.width - gutter - popupWidth)),
    top: flip ? Math.max(gutter, anchor.top - gap - Math.min(contentHeight, maxHeight)) : Math.max(gutter, anchor.bottom + gap),
    width: popupWidth,
    maxHeight,
  };
}
