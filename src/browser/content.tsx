import {createElement,type ReactNode} from 'react';
import {simulatedUrl} from './request';

const tags=new Set(['h1','h2','h3','p','div','span','ul','ol','li','br','pre','code','strong','em']);
/** Parse in an inert template, never attach its nodes. Only new React text/allowlisted
 * elements are rendered: no scripts, styles, images, resources or supplied attributes. */
export function pageContent(body:string,base:string,navigate:(url:string)=>void):ReactNode {
  const template=document.createElement('template');template.innerHTML=body.slice(0,100_000);
  let remaining=1500;
  function walk(node:Node,depth:number,key:number):ReactNode {
    if(--remaining<0||depth>20)return null;
    if(node.nodeType===Node.TEXT_NODE)return node.textContent;
    if(!(node instanceof HTMLElement))return null;
    const tag=node.tagName.toLowerCase();
    if(tag!=='a'&&!tags.has(tag))return null;
    const children=Array.from(node.childNodes).map((n,i)=>walk(n,depth+1,i));
    if(tag==='a') {
      const target=simulatedUrl(node.getAttribute('href')??'',base);
      return target?<button key={key} type="button" role="link" className="pc-browser-link" onClick={()=>navigate(target.address)}>{children}</button>:<span key={key}>{children}</span>;
    }
    return createElement(tag,{key},tag==='br'?undefined:children);
  }
  return Array.from(template.content.childNodes).map((n,i)=>walk(n,0,i));
}
