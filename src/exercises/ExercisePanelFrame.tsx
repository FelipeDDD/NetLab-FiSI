import { useLayoutEffect, useRef, useState, type ReactNode } from 'react';
import { boundExercisePanel } from './panelPosition';

/** Presentation only: no topology, viewport or progress writes. */
export function ExercisePanelFrame({exerciseId,collapsed,header,children}:{exerciseId:string;collapsed:boolean;header:ReactNode;children:ReactNode}) {
  const element=useRef<HTMLElement>(null);
  const [position,setPosition]=useState<{x:number;y:number}>();
  const drag=useRef<{id:number;x:number;y:number;left:number;top:number;target:HTMLElement}>();
  const bound=(p:{x:number;y:number})=>{
    const panel=element.current!,parent=panel.offsetParent as HTMLElement;
    return boundExercisePanel(p,{width:parent.clientWidth,height:parent.clientHeight},{width:panel.offsetWidth,height:panel.offsetHeight});
  };
  const finish=()=>{
    const current=drag.current;drag.current=undefined;
    if(current?.target.hasPointerCapture(current.id))current.target.releasePointerCapture(current.id);
  };
  useLayoutEffect(()=>{
    const panel=element.current!,parent=panel.offsetParent as HTMLElement;
    const observer=new ResizeObserver(()=>setPosition(old=>{
      if(!old)return old;
      const next=bound(old);return next.x===old.x&&next.y===old.y?old:next;
    }));
    observer.observe(panel);observer.observe(parent);
    window.addEventListener('blur',finish);
    return()=>{observer.disconnect();window.removeEventListener('blur',finish);finish();};
  },[]);
  return <aside ref={element} className={`exercise-panel${collapsed?' is-collapsed':''}`} aria-label="Übung" data-exercise={exerciseId}
    onKeyDown={event=>event.stopPropagation()}
    style={position?{left:position.x,top:position.y}:undefined}>
    <header className="exercise-drag-handle" tabIndex={0} aria-label="Übung verschieben" title="Zum Verschieben ziehen oder Pfeiltasten verwenden"
      onPointerDown={event=>{
        if(event.button!==0||!event.isPrimary||(event.target as Element).closest('button,input,select,a'))return;
        event.preventDefault();event.stopPropagation();event.currentTarget.focus({preventScroll:true});
        const panel=element.current!;
        drag.current={id:event.pointerId,x:event.clientX,y:event.clientY,left:panel.offsetLeft,top:panel.offsetTop,target:event.currentTarget};
        event.currentTarget.setPointerCapture(event.pointerId);
      }}
      onPointerMove={event=>{const current=drag.current;if(!current||current.id!==event.pointerId)return;
        event.preventDefault();event.stopPropagation();setPosition(bound({x:current.left+event.clientX-current.x,y:current.top+event.clientY-current.y}));}}
      onPointerUp={finish} onPointerCancel={finish} onLostPointerCapture={finish}
      onKeyDown={event=>{
        if(event.target!==event.currentTarget||event.altKey||event.ctrlKey||event.metaKey)return;
        const step=event.shiftKey?20:5,dx=event.key==='ArrowLeft'?-step:event.key==='ArrowRight'?step:0,dy=event.key==='ArrowUp'?-step:event.key==='ArrowDown'?step:0;
        if(!dx&&!dy)return;event.preventDefault();event.stopPropagation();
        const panel=element.current!;setPosition(bound({x:panel.offsetLeft+dx,y:panel.offsetTop+dy}));
      }}>
      {header}
      <button type="button" className="btn btn--icon exercise-position-reset" aria-label="Übung an Ausgangsposition" title="An Ausgangsposition zurücksetzen"
        onClick={()=>{finish();setPosition(undefined);}}>↖</button>
    </header>
    {children}
  </aside>;
}
