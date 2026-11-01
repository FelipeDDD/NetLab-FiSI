import {useRef} from 'react';
import {createPortal} from 'react-dom';
import {Host} from '../engine/ipdevice';
import {sim} from '../sim';
import {useStore} from '../store';
import {useDesktop} from '../browser/desktopState';
import {browserText} from '../browser/messages';
import {useTranslation} from '../i18n';
import {FloatingPopover} from './FloatingPopover';

export type DeviceMenuPoint={id:string;x:number;y:number};
export function DeviceContextMenu({menu,onClose}:{menu:DeviceMenuPoint|null;onClose():void}) {
  const anchor=useRef<HTMLSpanElement>(null),{language}=useTranslation();useStore(s=>s.nodes);
  const device=menu&&sim.net.devices.get(menu.id);
  if(!menu||!(device instanceof Host)||device.disposed)return null;
  const close=()=>{onClose();requestAnimationFrame(()=>{
    if(document.activeElement?.closest('.pc-desktop,[data-floating-popover]'))return;
    [...document.querySelectorAll<HTMLElement>('.react-flow__node')].find(n=>n.dataset.id===menu.id)?.focus({preventScroll:true});
  });};
  return <>{createPortal(<span ref={anchor} className="cable-menu-anchor" tabIndex={-1} style={{left:menu.x,top:menu.y}}/>,document.body)}
    <FloatingPopover anchor={anchor} id="device-context-menu" label={device.name} role="menu" width={200} onClose={close}>
      <button type="button" role="menuitem" className="toolbar-menu-action" onClick={()=>{
        [...document.querySelectorAll<HTMLElement>('.react-flow__node')].find(n=>n.dataset.id===device.id)?.focus({preventScroll:true});
        useDesktop.getState().openBrowser(device);onClose();
        requestAnimationFrame(()=>document.querySelector<HTMLInputElement>('#pc-browser-address')?.focus({preventScroll:true}));
      }}>{browserText(language,'openBrowser')}</button>
    </FloatingPopover></>;
}
