import { expect, it } from 'vitest';
import { containsPoint, readExtensions, rectangleBetween, touchesArea, unionLoops, unionPath, validAreaRect, type AreaRect } from './markingGeometry';
import { DEFAULT_MARKING, readAreaMarkings } from './areaMarkings';

const rect = (x: number, y: number, width: number, height: number) => ({ x, y, width, height });
const area = (rectangles: AreaRect[]) => unionLoops(rectangles).reduce((sum, loop) => sum + loop.reduce((a, p, i) => {
  const q = loop[(i + 1) % loop.length]; return a + p.x * q.y - q.x * p.y;
}, 0) / 2, 0);
it('unites overlapping rectangles once, with only the external contour for L, U and T', () => {
  const l = [rect(0,0,100,60),rect(0,40,40,100)];
  expect(area(l)).toBe(9200); expect(unionLoops(l)).toHaveLength(1); expect(unionLoops(l)[0]).toHaveLength(6);
  const u = [rect(0,0,40,120),rect(100,0,40,120),rect(0,80,140,40)];
  expect(area(u)).toBe(12000); expect(unionLoops(u)[0]).toHaveLength(8);
  const t = [rect(0,0,140,40),rect(50,0,40,140)];
  expect(area(t)).toBe(9600); expect(unionLoops(t)[0]).toHaveLength(8);
  expect(unionPath(l)).toContain('Q'); expect(unionPath(l).match(/M/g)).toHaveLength(1);
  expect(unionPath(l)).toBe(unionPath([...l].reverse()));
});
it('preserves holes, disjoint islands, corner contacts, contained and duplicate rectangles deterministically', () => {
  const frame = [rect(0,0,100,20),rect(0,80,100,20),rect(0,0,20,100),rect(80,0,20,100)];
  expect(area(frame)).toBe(6400); expect(unionLoops(frame)).toHaveLength(2);
  expect(unionLoops([rect(0,0,20,20),rect(20,20,20,20)])).toHaveLength(2);
  expect(unionLoops([rect(0,0,20,20),rect(100,100,20,20)])).toHaveLength(2);
  const outer=rect(-10,-10,100,100);expect(area([outer,outer,rect(0,0,20,20)])).toBe(10000);
  expect(unionLoops([])).toEqual([]);expect(unionPath([])).toBe('');
  expect(unionPath([rect(.25,-.5,31.75,42.5)])).not.toMatch(/NaN|Infinity/);
});
it('compares union area to a raster oracle for deterministic overlapping/adjacent rectangle sets', () => {
  let seed=15;const random=()=>{seed=(seed*1664525+1013904223)>>>0;return seed;};
  for(let sample=0;sample<80;sample++){
    const rectangles=Array.from({length:8},()=>rect(random()%12,random()%12,1+random()%8,1+random()%8));
    let filled=0;for(let y=0;y<21;y++)for(let x=0;x<21;x++)if(rectangles.some(r=>containsPoint(r,{x:x+.5,y:y+.5})))filled++;
    expect(area(rectangles)).toBe(filled);
  }
});
it('validates finite geometry, allows shared edges but not corner-only contact, and preserves old metadata', () => {
  expect(touchesArea(rect(0,0,100,50),rect(100,10,30,40))).toBe(true);
  expect(touchesArea(rect(0,0,100,50),rect(100,50,30,40))).toBe(false);
  expect(touchesArea(rect(0,0,100,50),rect(101,0,30,40))).toBe(false);
  expect(rectangleBetween({x:100,y:80},{x:-10,y:0})).toEqual(rect(-10,0,110,80));
  expect(validAreaRect(rect(0,0,11,50))).toBe(false);expect(validAreaRect(rect(Infinity,0,20,20))).toBe(false);
  const extension={id:'e1',...rect(0,20,30,50)};
  expect(readExtensions([extension,extension,{...extension,id:'bad',width:NaN}])).toEqual([extension]);
  const old={...DEFAULT_MARKING,id:'a',deviceIds:['pc1']};
  expect(readAreaMarkings([old],['pc1'])).toEqual([old]);
  const fresh={...old,extensions:[extension]}; const restored=readAreaMarkings([fresh],['pc1']);
  expect(restored).toEqual([fresh]);extension.x=999;expect(restored[0].extensions![0].x).toBe(0);
});
