/** View-only scale. A sheet includes the report's 16px surround on each side. */
export type PreviewZoom = number | 'page';
export function previewScale(zoom: PreviewZoom, width: number, height: number, availableWidth: number, availableHeight: number): number {
  if (zoom === 'page') return Math.max(.01, Math.min((availableWidth - 16) / width, (availableHeight - 16) / height));
  return zoom || Math.min(1, Math.max(.12, (availableWidth - 16) / width));
}
