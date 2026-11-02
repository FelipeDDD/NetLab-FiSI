import type { SaveFile } from '../engine/serialize';

/** Authoring adapter for new Beta attempts; never applied to loaded documents. */
export function publishedExerciseLayout(file: SaveFile, order?: string[]): SaveFile {
  const result = structuredClone(file);
  const left = Math.min(...file.devices.map(d => d.x)), top = Math.min(...file.devices.map(d => d.y));
  for (const device of result.devices) {
    device.x = left + (device.x - left) * 1.18;
    device.y = top + (device.y - top) * 1.18;
    if (order) {
      const index = order.indexOf(device.id);
      if (index >= 0) { device.x = left + index * 270 * 1.18; device.y = top; }
    }
  }
  return result;
}
