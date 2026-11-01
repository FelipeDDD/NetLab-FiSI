import {afterEach,expect,it} from 'vitest';
import {changeWindow,constrainWindow,initialWindow,type ResizeEdge} from './windowGeometry';
import {useDesktop} from './desktopState';
import {createDevice} from '../engine/factory';
import {Network} from '../engine/network';
import type {Host} from '../engine/ipdevice';

afterEach(()=>useDesktop.getState().close());
const area={width:1440,height:800};
it('starts at 600 × 420 and respects small containers without changing preferred dimensions',()=>{
  const preferred=initialWindow(area,228);expect(preferred).toEqual({x:228,y:12,width:600,height:420});
  const mobile=constrainWindow(preferred,{width:330,height:350});
  expect(mobile).toEqual({x:8,y:8,width:314,height:334});
  expect(constrainWindow(preferred,area)).toEqual(preferred);
});
it('bounds dragging while preserving size and independent axes',()=>{
  const r=initialWindow(area,228);
  expect(changeWindow(r,area,'move',50,0)).toEqual({...r,x:278});
  expect(changeWindow(r,area,'move',-10000,-10000)).toEqual({...r,x:8,y:8});
  expect(changeWindow(r,area,'move',10000,10000)).toEqual({...r,x:832,y:372});
});
it.each(['n','s','e','w','ne','nw','se','sw'] as ResizeEdge[])('resizes %s within parent bounds while keeping opposite sides fixed',edge=>{
  const r={x:200,y:150,width:600,height:420};
  for(const delta of [-10000,10000]){
    const next=changeWindow(r,area,edge,delta,delta);
    expect(next.x).toBeGreaterThanOrEqual(8);expect(next.y).toBeGreaterThanOrEqual(8);
    expect(next.x+next.width).toBeLessThanOrEqual(1432);expect(next.y+next.height).toBeLessThanOrEqual(792);
    expect(next.width).toBeGreaterThanOrEqual(360);expect(next.height).toBeGreaterThanOrEqual(280);
    if(edge.includes('w'))expect(next.x+next.width).toBe(r.x+r.width);else expect(next.x).toBe(r.x);
    if(edge.includes('n'))expect(next.y+next.height).toBe(r.y+r.height);else expect(next.y).toBe(r.y);
  }
});
it('opens one shared browser without replacing the selected device or duplicating the desktop',()=>{
  const net=new Network(),pc=createDevice(net,'host') as Host,other=createDevice(net,'host',{os:'windows'}) as Host;
  useDesktop.getState().open(pc);expect(useDesktop.getState().view).toBe('desktop');
  useDesktop.getState().openBrowser(pc);useDesktop.getState().openBrowser(pc);
  expect(useDesktop.getState().device).toBe(pc);expect(useDesktop.getState().view).toBe('browser');
  useDesktop.getState().open(pc);expect(useDesktop.getState().view).toBe('browser');
  useDesktop.getState().showDesktop();expect(useDesktop.getState().device).toBe(pc);
  useDesktop.getState().openBrowser(other);expect(useDesktop.getState().device).toBe(other);
  expect(net.devices.size).toBe(2);expect(net.links.size).toBe(0);
});
