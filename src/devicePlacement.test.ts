import { expect, it } from 'vitest';
import { boxesOverlap, canvasWorldBounds, deviceSize, freePosition, insertionPosition, placementBox } from './devicePlacement';
import type { VisualNode } from './deviceArtwork';

const visible={x:1000,y:500,width:1000,height:600};
it('uses visible world coordinates and selected reference without depending on names',()=>{
  const nodes: VisualNode[]=[{id:'chosen',position:{x:1100,y:550},data:{kind:'server'}}];
  const p=insertionPosition('host',nodes,'chosen',visible);
  expect(p.x).toBeGreaterThan(1100);expect(p.y).toBe(550);
  expect(boxesOverlap({...p,...deviceSize('host')},placementBox(nodes[0]))).toBe(false);
  expect(insertionPosition('host',[],null,visible)).toEqual({x:1430,y:734.5});
});
it('places ten consecutive nodes in collision-free rows and retains existing positions',()=>{
  const nodes: VisualNode[]=[];
  for(let i=0;i<10;i++){
    const p=insertionPosition('host',nodes,nodes.at(-1)?.id??null,visible);
    expect(nodes.every(n=>!boxesOverlap({...p,...deviceSize('host')},placementBox(n)))).toBe(true);
    nodes.push({id:String(i),position:p,data:{kind:'host'}});
  }
  expect(new Set(nodes.map(n=>n.position.y)).size).toBeGreaterThan(1);
});
it('translates a group without changing its internal spacing in a dense canvas',()=>{
  const occupied=Array.from({length:300},(_,i)=>({x:i%20*180,y:Math.floor(i/20)*180,width:140,height:130}));
  const group=[{x:5,y:10,width:140,height:130},{x:230,y:220,width:140,height:130}];
  const p=freePosition(group,occupied,{x:0,y:0},{x:0,y:0,width:600,height:400});
  for(const b of group) expect(occupied.every(o=>!boxesOverlap({...b,x:p.x+b.x-5,y:p.y+b.y-10},o))).toBe(true);
});
it.each([.5,1,2])('converts the actual canvas rectangle at zoom %s',zoom=>{
  const r=canvasWorldBounds({left:200,top:50,right:1000,bottom:650},p=>({x:(p.x-200-80)/zoom,y:(p.y-50-30)/zoom}));
  expect(r).toEqual({x:-64/zoom,y:-14/zoom,width:768/zoom,height:568/zoom});
});
