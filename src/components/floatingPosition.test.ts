import { describe, expect, it } from 'vitest';
import { floatingPosition } from './floatingPosition';

describe('floating popup viewport placement', () => {
  it('places toolbar menus below their button', () => {
    expect(floatingPosition({ left: 200, right: 270, top: 10, bottom: 40 }, { width: 1000, height: 700 }, 320, 450))
      .toEqual({ left: 200, top: 46, width: 320, maxHeight: 646 });
  });

  it('keeps wide menus inside narrow windows and leaves room to scroll', () => {
    const p = floatingPosition({ left: 240, right: 300, top: 10, bottom: 40 }, { width: 320, height: 240 }, 360, 700);
    expect(p).toEqual({ left: 8, top: 46, width: 304, maxHeight: 186 });
  });

  it('flips terminal appearance popovers above a bottom tab', () => {
    const p = floatingPosition({ left: 850, right: 874, top: 580, bottom: 610 }, { width: 1000, height: 700 }, 300, 240);
    expect(p.left + p.width).toBe(992);
    expect(p.top).toBe(334);
    expect(p.maxHeight).toBe(566);
  });

  it('repositions when the viewport or anchor changes', () => {
    const anchor = { left: 600, right: 650, top: 400, bottom: 428 };
    const a = floatingPosition(anchor, { width: 1000, height: 900 }, 300, 240);
    const b = floatingPosition(anchor, { width: 680, height: 480 }, 300, 240);
    expect(a.top).toBe(434);
    expect(b.top).toBe(154);
    expect(b.left + b.width).toBeLessThanOrEqual(672);
    expect(b.top).toBeGreaterThanOrEqual(8);
  });

  it('uses room above rather than unnecessarily clipping a terminal settings popup', () => {
    const p = floatingPosition({ left: 20, right: 44, top: 535, bottom: 562 }, { width: 1280, height: 800 }, 300, 270);
    expect(p.top).toBe(259);
    expect(p.maxHeight).toBeGreaterThanOrEqual(270);
  });

  it('prefers above for tall settings using the visible scrollable height, even with more than 150px below', () => {
    const p = floatingPosition({ left: 8, right: 83, top: 607, bottom: 633 }, { width: 1440, height: 900 }, 320, 760, 'above');
    expect(p).toEqual({ left: 8, top: 8, width: 320, maxHeight: 593 });
    expect(p.top + p.maxHeight).toBeLessThanOrEqual(607 - 6);
  });

  it('prefers above when either side can fit the form', () => {
    const p = floatingPosition({ left: 200, right: 275, top: 400, bottom: 426 }, { width: 1000, height: 900 }, 320, 240, 'above');
    expect(p.top).toBe(154);
    expect(p.maxHeight).toBe(386);
  });

  it('falls back below when above cannot accommodate the visible height, keeping narrow windows scrollable', () => {
    const p = floatingPosition({ left: 240, right: 315, top: 65, bottom: 91 }, { width: 320, height: 240 }, 320, 760, 'above');
    expect(p).toEqual({ left: 8, top: 97, width: 304, maxHeight: 135 });
    expect(p.top + p.maxHeight).toBe(232);
  });
});
