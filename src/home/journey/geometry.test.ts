import { describe, expect, it } from 'vitest';
import { alternatingScrollSegments, cameraForX, SCENE_PROGRESS, sceneForX, scrollSegments, smoothStep, travelProgress } from './geometry';
import { arrivalState } from './arrival';
import { artworkPlacement, ARTWORK_PORTS } from './JourneyArtwork';
import { DEVICE_ARTWORK } from '../../deviceArtwork';
import { HERO_REPLY_PROGRESS, HERO_TIMING, JOURNEY_DURATION_MS, HERO_TIMELINE } from './geometry';

describe('illustrative packet journey geometry', () => {
  it('keeps request/reply continuous at the destination; reply returns to the origin', () => {
    expect(travelProgress(0)).toBe(0); expect(travelProgress(HERO_REPLY_PROGRESS)).toBe(1);
    expect(travelProgress(HERO_REPLY_PROGRESS + 1e-7)).toBeCloseTo(1, 5); expect(travelProgress(1)).toBe(0);
    expect(SCENE_PROGRESS.every(p => p < HERO_REPLY_PROGRESS)).toBe(true);
  });
  it('uses a continuous bounded camera and controlled manual repositioning', () => {
    expect([70, 480, 960, 1370].map(cameraForX)).toEqual([0, 240, 720, 960]);
    expect([70, 670, 1370].map(sceneForX)).toEqual([0, 1, 2]);
    expect([0, .5, 1].map(smoothStep)).toEqual([0, .5, 1]);
  });
  it('uses measured anchors and a mobile corridor without changing the cards', () => {
    const p = [{ x: 440, y: 100 }, { x: 560, y: 400 }, { x: 440, y: 700 }];
    expect(scrollSegments(p)).toEqual(['M440 100 C440 250 560 250 560 400', 'M560 400 C560 550 440 550 440 700']);
    expect(scrollSegments([{ x: 32, y: 100 }, { x: 32, y: 400 }])).toEqual(['M32 100 C32 250 32 250 32 400']);
  });
  it('balances movement independently of unchanged reading holds and reset pause', () => {
    expect(JOURNEY_DURATION_MS).toBe(21240); expect(HERO_TIMING.routerHoldMs).toBe(1260); expect(HERO_TIMING.arrivalMs).toBe(550);
    const at = (ms: number) => travelProgress(ms / JOURNEY_DURATION_MS);
    expect(at(2600)).toBe(0); expect(at(4860)).toBe(.45); expect(at(6000)).toBe(.45);
    expect(at(7200)).toBe(.57); expect(at(8400)).toBe(.57);
    expect(at(9700)).toBeGreaterThan(.57); expect(at(9700)).toBeLessThan(1);
    expect(at(10620)).toBe(1); expect(at(13490)).toBe(1);
    expect(at(3780)).toBeCloseTo(.225);
    expect(at(20500)).toBe(0); expect(at(21240)).toBe(0);
    expect(HERO_TIMELINE.every(([time], i) => !i || time > HERO_TIMELINE[i-1][0])).toBe(true);
  });
  it('crosses the alternating layout only in the measured inter-row corridor', () => {
    expect(alternatingScrollSegments([{x:800,y:100},{x:100,y:350}], [{top:0,bottom:200},{top:236,bottom:440}])).toEqual([
      'M800 100 L800 203 Q800 218 785 218 L115 218 Q100 218 100 233 L100 350',
    ]);
    expect(alternatingScrollSegments([{x:100,y:350},{x:800,y:600}], [{top:236,bottom:440},{top:476,bottom:680}])[0]).toContain('Q100 458 115 458');
  });
  it('resolves arrival intensity independently and reverses without stale completed states', () => {
    expect(arrivalState(200, 200)).toEqual({ reached: true, arriving: true, intensity: 1 });
    expect(arrivalState(150, 200)).toEqual({ reached: false, arriving: false, intensity: 0 });
    expect(arrivalState(250, 200)).toEqual({ reached: true, arriving: false, intensity: 0 });
    expect(arrivalState(0, 200, true)).toEqual({ reached: true, arriving: false, intensity: .4 });
  });
  it('places every real asset connector exactly on the shared hero path', () => {
    for (const kind of ['host', 'switch', 'router', 'server'] as const) {
      const port = ARTWORK_PORTS[kind], [left, top, width] = DEVICE_ARTWORK[kind].viewBox.split(' ').map(Number);
      const placement = artworkPlacement(kind, { x: 250, y: 100 }, 150);
      expect(placement.x + (port.x - left) * 150 / width).toBeCloseTo(250);
      expect(placement.y + (port.y - top) * 150 / width).toBeCloseTo(100);
    }
  });
});
