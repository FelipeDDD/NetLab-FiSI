import type { IpDevice, SocketControl } from '../engine/ipdevice';
import { resolveHost,type ResolveFailure } from '../commands/resolve';
import {parseIp,ipToString} from '../engine/ip';

export const BROWSER_TIMEOUT_MS=4000;
export interface SimulatedUrl { address:string;host:string;port:number;path:string;https:boolean }
export function simulatedUrl(raw:string,base?:string):SimulatedUrl|null {
  try {
    const value=raw.trim();if(!value||value.length>2048)return null;
    const url=new URL(base?value:/^[a-z][a-z\d+.-]*:/i.test(value)?value:'http://'+value,base);
    if(!['http:','https:'].includes(url.protocol)||url.username||url.password||!url.hostname||!/^[-a-z\d.]+$/i.test(url.hostname))return null;
    const port=Number(url.port||(url.protocol==='https:'?443:80));if(port<1||port>65535)return null;
    return {address:url.href,host:url.hostname,port,path:url.pathname+url.search,https:url.protocol==='https:'};
  }catch{return null;}
}
export type BrowserFailure='url'|'https'|'dns'|'refused'|'timeout'|'unreachable'|'empty'|'other';
export interface BrowserError {kind:'error';code:BrowserFailure;detail?:string;dnsFailure?:ResolveFailure;
  resolution?:{host:string;address:string;viaDns:boolean}}
export type BrowserResult={kind:'http';url:string;status:number;reason:string;body:string}
  |{kind:'tcp';url:string;port:number}
  |BrowserError;
/** All traffic uses the selected device's DNS/IP/TCP stack, never host networking. */
export function requestPage(device:IpDevice,url:SimulatedUrl,done:(r:BrowserResult)=>void,
  options:{tcpOnly?:boolean;stage?:(s:'dns'|'tcp'|'http')=>void}={}):{cancel():void} {
  let finished=false,resolver:{cancel():void}|undefined;
  const socket:SocketControl={};
  let resolution:BrowserError['resolution'];
  const finish=(r:BrowserResult)=>{if(finished)return;finished=true;done(r);};
  const fail=(error:string)=>finish({kind:'error',code: error==='Network is unreachable'||error==='unreachable'?'unreachable':
    (['refused','timeout','empty'] as string[]).includes(error)?error as BrowserFailure:'other',detail:error,...(resolution?{resolution}:{})});
  if(url.https&&!options.tcpOnly)finish({kind:'error',code:'https'});
  else if(device.disposed)fail('unreachable');
  else {
    options.stage?.('dns');
    resolver=resolveHost(device,url.host,result=>{
      if(finished)return;
      if('error' in result){finish({kind:'error',code:'dns',detail:result.error,dnsFailure:result.reason});return;}
      resolution={host:url.host,address:ipToString(result.ip),viaDns:parseIp(url.host)===null};
      options.stage?.('tcp');
      const error=options.tcpOnly?device.connectTcp(result.ip,url.port,BROWSER_TIMEOUT_MS,r=>{
        if(r==='open')finish({kind:'tcp',url:url.address,port:url.port});else fail(r);
      },socket):device.httpGet(result.ip,url.port,url.path,url.host,BROWSER_TIMEOUT_MS,r=>{
        if(r.ok)finish({kind:'http',url:url.address,status:r.status,reason:r.reason,body:r.body});else fail(r.error);
      },()=>{if(!finished)options.stage?.('http');},socket);
      if(error)fail(error);
    });
  }
  return {cancel(){finished=true;resolver?.cancel();socket.cancel?.();}};
}
