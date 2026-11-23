export interface WindowRect {x:number;y:number;width:number;height:number}
export interface WindowArea {width:number;height:number}
export type ResizeEdge='n'|'s'|'e'|'w'|'ne'|'nw'|'se'|'sw';
export const WINDOW_MARGIN=8;
export const WINDOW_INITIAL={width:420,height:294};
export const WINDOW_MIN={width:360,height:280};
const clamp=(value:number,min:number,max:number)=>Math.max(min,Math.min(max,value));
export function windowLimits(area:WindowArea) {
  const width=Math.max(0,area.width-2*WINDOW_MARGIN),height=Math.max(0,area.height-2*WINDOW_MARGIN);
  return {minWidth:Math.min(WINDOW_MIN.width,width),minHeight:Math.min(WINDOW_MIN.height,height),maxWidth:width,maxHeight:height};
}
export function constrainWindow(rect:WindowRect,area:WindowArea):WindowRect {
  const l=windowLimits(area),width=clamp(rect.width,l.minWidth,l.maxWidth),height=clamp(rect.height,l.minHeight,l.maxHeight);
  return {width,height,x:clamp(rect.x,WINDOW_MARGIN,Math.max(WINDOW_MARGIN,area.width-WINDOW_MARGIN-width)),
    y:clamp(rect.y,WINDOW_MARGIN,Math.max(WINDOW_MARGIN,area.height-WINDOW_MARGIN-height))};
}
export function initialWindow(area: WindowArea, left = 12, obstacle?: WindowRect): WindowRect {
  const initial = constrainWindow({ ...WINDOW_INITIAL, x: left, y: 12 }, area);
  if (!obstacle) return initial;
  const below = obstacle.y + obstacle.height + WINDOW_MARGIN;
  const right = obstacle.x + obstacle.width + WINDOW_MARGIN;
  const heightBelow = area.height - below - WINDOW_MARGIN;
  const widthRight = area.width - right - WINDOW_MARGIN;
  if (heightBelow >= WINDOW_MIN.height) {
    return constrainWindow({ ...initial, y: below, height: Math.min(initial.height, heightBelow) }, area);
  }
  if (widthRight >= WINDOW_MIN.width) {
    return constrainWindow({ ...initial, x: right, width: Math.min(initial.width, widthRight) }, area);
  }
  // Use the smallest normal height at the bottom to leave more of the panel visible.
  return constrainWindow({ ...initial, y: below, height: WINDOW_MIN.height }, area);
}
/** CSS pixels in the app's central area; independent of React Flow pan/zoom. */
export function changeWindow(rect:WindowRect,area:WindowArea,edge:ResizeEdge|'move',dx:number,dy:number):WindowRect {
  const r=constrainWindow(rect,area);
  if(edge==='move')return constrainWindow({...r,x:r.x+dx,y:r.y+dy},area);
  const limits=windowLimits(area);
  let left=r.x,right=r.x+r.width,top=r.y,bottom=r.y+r.height;
  if(edge.includes('w'))left=clamp(left+dx,WINDOW_MARGIN,right-limits.minWidth);
  if(edge.includes('e'))right=clamp(right+dx,left+limits.minWidth,area.width-WINDOW_MARGIN);
  if(edge.includes('n'))top=clamp(top+dy,WINDOW_MARGIN,bottom-limits.minHeight);
  if(edge.includes('s'))bottom=clamp(bottom+dy,top+limits.minHeight,area.height-WINDOW_MARGIN);
  return {x:left,y:top,width:right-left,height:bottom-top};
}
