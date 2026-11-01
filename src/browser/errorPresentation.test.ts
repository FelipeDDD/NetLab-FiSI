import {expect,it} from 'vitest';
import {createElement} from 'react';
import {renderToStaticMarkup} from 'react-dom/server';
import type {BrowserResult,BrowserError} from './request';
import {browserErrorPresentation} from './errorPresentation';
import {BrowserErrorPanel} from './BrowserErrorPanel';
import {browserMessages,browserText} from './messages';

it('maps only evidenced transport failures to matching familiar codes',()=>{
  for(const [code,expected] of Object.entries({dns:'ERR_NAME_NOT_RESOLVED',unreachable:'ERR_ADDRESS_UNREACHABLE',refused:'ERR_CONNECTION_REFUSED',timeout:'ERR_CONNECTION_TIMED_OUT',empty:'ERR_TIMED_OUT'})){
    const r:BrowserError={kind:'error',code:code as BrowserError['code'],detail:'raw internal unreachable code'};
    for(const language of ['de','pt-BR','en'] as const){
      const info=browserErrorPresentation(r,language)!;expect(info.code).toBe(expected);expect(info.title).toBeTruthy();
      const html=renderToStaticMarkup(createElement(BrowserErrorPanel,{result:r,language}));
      expect(html).not.toContain(r.detail);expect(html).toContain(browserText(language,'whatMeans'));
      if(code==='timeout')expect(info.explanation).not.toMatch(/firewall|blocked|blockiert|bloque/i);
    }
  }
});
it('does not invent SSL, NXDOMAIN or other codes without the corresponding evidence',()=>{
  for(const code of ['url','https','other'] as const)expect(browserErrorPresentation({kind:'error',code,detail:'unknown error'},'en')?.code).toBeUndefined();
  const empty=browserErrorPresentation({kind:'error',code:'empty'},'en')!;
  expect(empty.code).not.toBe('ERR_EMPTY_RESPONSE');expect(empty.explanation).toContain('TCP was established');
});
it('keeps DNS failure separate from successful DNS followed by transport failure',()=>{
  for(const reason of ['not-configured','not-found','timeout','refused'] as const){
    const info=browserErrorPresentation({kind:'error',code:'dns',dnsFailure:reason},'en')!;
    expect(info.resolution).toBeUndefined();expect(info.code).toBe('ERR_NAME_NOT_RESOLVED');
  }
  const info=browserErrorPresentation({kind:'error',code:'refused',resolution:{host:'server.lab',address:'192.168.1.20',viaDns:true}},'pt-BR')!;
  expect(info.resolution).toBe('DNS resolvido: server.lab → 192.168.1.20');
  expect(browserErrorPresentation({kind:'error',code:'refused',resolution:{host:'192.168.1.20',address:'192.168.1.20',viaDns:false}},'en')?.resolution).toBeUndefined();
});
it('uses actual HTTP 403/404 statuses and leaves successful HTTP/TCP responses unchanged',()=>{
  // The current single-page engine emits 200/404. 403 is an explicit presentation
  // contract fixture, not a new server rule or a fabricated network response.
  for(const status of [403,404])for(const language of ['de','pt-BR','en'] as const){
    const result:BrowserResult={kind:'http',status,reason:status===403?'Forbidden':'Not Found',body:'server body',url:'http://server.lab/'};
    const original=JSON.stringify(result),info=browserErrorPresentation(result,language)!;
    expect(info.code).toContain(`HTTP ${status}`);expect(info.explanation).toContain(String(status));expect(info.code).not.toContain('ERR_');
    expect(JSON.stringify(result)).toBe(original);
    const html=renderToStaticMarkup(createElement(BrowserErrorPanel,{result,language,showCode:false}));
    expect(html).toContain(browserText(language,'whatMeans'));expect(html).not.toContain('pc-browser-error-code');
  }
  for(const status of [200,201,204,301,500])expect(browserErrorPresentation({kind:'http',status,reason:'',body:'',url:'http://server.lab/'},'en')).toBeNull();
  expect(browserErrorPresentation({kind:'tcp',url:'https://server.lab/',port:443},'en')).toBeNull();
});
it('keeps translation keys and interpolation placeholders aligned',()=>{
  const placeholders=(s:string)=>[...s.matchAll(/\{(\w+)\}/g)].map(m=>m[1]).sort();
  for(const messages of Object.values(browserMessages))for(const key of Object.keys(browserMessages.en) as (keyof typeof browserMessages.en)[]){
    expect(messages[key].trim()).not.toBe('');expect(placeholders(messages[key])).toEqual(placeholders(browserMessages.en[key]));
  }
});
