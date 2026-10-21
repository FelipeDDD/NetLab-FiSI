import { afterEach, expect, it, vi } from 'vitest';
import { loadPacketInspector, normalizePacketInspector, packetPanelGeometry, savePacketInspector, PACKET_LAYOUT_KEY } from './packetInspectorLayout';
afterEach(() => vi.unstubAllGlobals());
it('keeps the existing Full/right presentation by default and validates local preferences', () => {
  expect(normalizePacketInspector(null)).toEqual({ side: 'right', mode: 'full', widths: { compact: 370, full: 600 } });
  expect(normalizePacketInspector({ side: 'invalid', mode: 'invalid', widths: { compact: NaN, full: 900 } })).toEqual({ side: 'right', mode: 'full', widths: { compact: 370, full: 800 } });
});
it('persists position and separate mode widths without overwriting the other mode', () => {
  const storage = new Map<string, string>();
  vi.stubGlobal('localStorage', { getItem: (key: string) => storage.get(key), setItem: (key: string, value: string) => storage.set(key, value) });
  const pref = normalizePacketInspector({ side: 'left', mode: 'compact', widths: { compact: 390, full: 600 } });
  savePacketInspector(pref); expect(loadPacketInspector()).toEqual(pref);
  savePacketInspector({ ...pref, mode: 'full' }); expect(loadPacketInspector().widths).toEqual(pref.widths);
  expect([...storage.keys()]).toEqual([PACKET_LAYOUT_KEY]);
});
it('tolerates unavailable storage or invalid saved JSON', () => {
  vi.stubGlobal('localStorage', { getItem: () => '{bad', setItem: () => { throw Error(); } });
  expect(loadPacketInspector().mode).toBe('full'); expect(() => savePacketInspector(normalizePacketInspector(null))).not.toThrow();
});
it('reserves a readable canvas and preserves device width in columns', () => {
  const pref = normalizePacketInspector(null), value = packetPanelGeometry(1280, 470, pref);
  expect(value).toMatchObject({ placement: 'columns', width: 530, max: 530, deviceWidth: 470 });
  expect(1280 - value.width - value.deviceWidth).toBe(280);
  expect(pref.widths.full).toBe(600);
});
it('caps widths when narrowed and restores the preference when enlarged', () => {
  const pref = normalizePacketInspector({ widths: { compact: 400, full: 600 } });
  expect(packetPanelGeometry(1500, 340, pref).width).toBe(600);
  expect(packetPanelGeometry(900, 470, pref)).toMatchObject({ placement: 'rows', width: 430 });
  expect(packetPanelGeometry(320, 470, pref)).toMatchObject({ placement: 'stack', width: 304, max: 304 });
  expect(packetPanelGeometry(1500, 340, pref).width).toBe(600);
});
it('uses the same limits in both positions and separate widths for Compact/Full', () => {
  const pref = normalizePacketInspector(null);
  expect(packetPanelGeometry(1280, 340, pref)).toEqual(packetPanelGeometry(1280, 340, { ...pref, side: 'left' }));
  expect(packetPanelGeometry(1280, 340, { ...pref, mode: 'compact' }).width).toBe(370);
  expect(packetPanelGeometry(1280, 0, pref).width).toBe(600);
});
it('allows Full to reach 800 px while keeping Compact unchanged and restoring saved widths', () => {
  const pref = normalizePacketInspector({ widths: { compact: 390, full: 800 } });
  expect(packetPanelGeometry(1500, 340, pref)).toMatchObject({ width: 800, max: 800 });
  expect(packetPanelGeometry(1500, 470, pref)).toMatchObject({ width: 750, max: 750 });
  expect(1500 - 470 - packetPanelGeometry(1500, 470, pref).width).toBe(280);
  expect(packetPanelGeometry(1280, 340, pref).width).toBe(660);
  expect(packetPanelGeometry(1500, 340, pref).width).toBe(800);
  expect(pref.widths).toEqual({ compact: 390, full: 800 });
  expect(packetPanelGeometry(1500, 340, { ...pref, mode: 'compact' }).max).toBe(680);
  expect(normalizePacketInspector({ widths: { full: 560 } }).widths.full).toBe(560);
});
