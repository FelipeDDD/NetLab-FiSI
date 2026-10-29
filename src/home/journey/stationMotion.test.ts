import { expect, it } from 'vitest';
import { remapStationPosition, stationAt, stationMove, stationMovePosition } from './stationMotion';

const anchors = [100,350,600,850,1100];
it('selects the current station on restore and skips obsolete destinations', () => {
  expect(stationAt(590,anchors)).toBe(2);
  expect(stationAt(2000,anchors,0)).toBe(4);
  expect(stationAt(-100,anchors,4)).toBe(0);
});
it('uses a deadband around the station boundary in both directions', () => {
  expect(stationAt(238,anchors,0)).toBe(0);
  expect(stationAt(239,anchors,0)).toBe(1);
  expect(stationAt(212,anchors,1)).toBe(1);
  expect(stationAt(210,anchors,1)).toBe(0);
});
it('completes without additional scroll and reverses from the current rendered position', () => {
  const forward=stationMove(0,.5,1000);forward.elapsed=forward.duration*.4;
  const position=stationMovePosition(forward),reverse=stationMove(position,0,1000);
  expect(stationMovePosition(reverse)).toBe(position);
  reverse.elapsed=50;expect(stationMovePosition(reverse)).toBeLessThan(position);
  reverse.elapsed=reverse.duration;expect(stationMovePosition(reverse)).toBe(0);
  forward.elapsed=forward.duration;expect(stationMovePosition(forward)).toBe(.5);
});
it('bounds duration and preserves the same connectors after responsive remeasurement', () => {
  expect(stationMove(0,.01,1000).duration).toBe(300);
  expect(stationMove(0,1,10000).duration).toBe(1100);
  expect(remapStationPosition(.25,[0,.25,.5,1],[0,.4,.7,1])).toBe(.4);
  expect(remapStationPosition(.375,[0,.25,.5,1],[0,.4,.7,1])).toBeCloseTo(.55);
});
