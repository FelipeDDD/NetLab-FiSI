import {create} from 'zustand';
import type {Host} from '../engine/ipdevice';
/** Ephemeral UI only; never part of topology, project, terminal or exercise state. */
export const useDesktop=create<{device:Host|null;view:'desktop'|'browser';open(device:Host):void;openBrowser(device:Host):void;showDesktop():void;close():void}>(set=>({
  device:null,view:'desktop',open:device=>set(s=>s.device===device?s:{device,view:'desktop'}),
  openBrowser:device=>set({device,view:'browser'}),showDesktop:()=>set({view:'desktop'}),close:()=>set({device:null,view:'desktop'}),
}));
