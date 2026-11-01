import {useCallback,useEffect,useLayoutEffect,useRef,useState,type PointerEvent as ReactPointerEvent,type KeyboardEvent as ReactKeyboardEvent} from 'react';
import {changeWindow,constrainWindow,initialWindow,windowLimits,type ResizeEdge,type WindowArea,type WindowRect} from './windowGeometry';

/** Same pointer-capture/ResizeObserver approach as ResizableInspector, with a
 * parent-bounded two-dimensional frame. Moving it never remounts its children. */
export function useDesktopWindow() {
  const element=useRef<HTMLElement>(null),[area,setArea]=useState<WindowArea>({width:0,height:0});
  const [preferred,setPreferred]=useState<WindowRect>(),[interacting,setInteracting]=useState(false);
  const drag=useRef<{pointer:number;x:number;y:number;rect:WindowRect;edge:ResizeEdge|'move';target:HTMLElement;original:WindowRect}>();
  const rect=preferred?constrainWindow(preferred,area):undefined;
  const finish=useCallback(()=>{
    const current=drag.current;if(!current)return;
    drag.current=undefined;setInteracting(false);
    if(current.target.hasPointerCapture(current.pointer))current.target.releasePointerCapture(current.pointer);
  },[]);
  useLayoutEffect(()=>{
    const parent=element.current?.parentElement;if(!parent)return;
    const update=()=>{
      finish();const next={width:parent.clientWidth,height:parent.clientHeight};
      setArea(old=>old.width===next.width&&old.height===next.height?old:next);
      setPreferred(old=>old??initialWindow(next,(parent.querySelector('.palette')?.getBoundingClientRect().right??parent.getBoundingClientRect().left)-parent.getBoundingClientRect().left+12));
    };
    update();const observer=new ResizeObserver(update);observer.observe(parent);
    window.addEventListener('blur',finish);
    return ()=>{observer.disconnect();window.removeEventListener('blur',finish);finish();};
  },[finish]);
  useEffect(()=>()=>finish(),[finish]);
  function start(edge:ResizeEdge|'move',event:ReactPointerEvent<HTMLElement>) {
    if(event.button!==0||!event.isPrimary||!rect||!preferred)return;
    if(edge==='move'&&(event.target as Element).closest('button,input,select,textarea,a,[role="button"]'))return;
    event.preventDefault();event.stopPropagation();event.currentTarget.focus({preventScroll:true});
    event.currentTarget.setPointerCapture(event.pointerId);
    drag.current={pointer:event.pointerId,x:event.clientX,y:event.clientY,rect,edge,target:event.currentTarget,original:preferred};
    setInteracting(true);
  }
  function move(event:ReactPointerEvent<HTMLElement>) {
    const current=drag.current;if(!current||current.pointer!==event.pointerId)return;
    event.preventDefault();event.stopPropagation();
    setPreferred(changeWindow(current.rect,area,current.edge,event.clientX-current.x,event.clientY-current.y));
  }
  function keyboard(edge:ResizeEdge|'move',event:ReactKeyboardEvent<HTMLElement>) {
    if(event.key==='Escape'&&drag.current){const original=drag.current.original;finish();setPreferred(original);event.preventDefault();event.stopPropagation();return;}
    if(event.target!==event.currentTarget||event.altKey||event.ctrlKey||event.metaKey||event.nativeEvent.isComposing||!rect)return;
    const step=event.shiftKey?20:5;
    const dx=event.key==='ArrowLeft'?-step:event.key==='ArrowRight'?step:0,dy=event.key==='ArrowUp'?-step:event.key==='ArrowDown'?step:0;
    if(!dx&&!dy)return;
    event.preventDefault();event.stopPropagation();setPreferred(changeWindow(rect,area,edge,dx,dy));
  }
  return {element,rect,limits:windowLimits(area),interacting,start,move,finish,keyboard};
}
