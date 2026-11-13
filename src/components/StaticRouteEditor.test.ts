import { afterEach, expect, it, vi } from 'vitest';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import type { IpDevice, Route } from '../engine/ipdevice';
import { StaticRouteEditor } from './StaticRouteEditor';
import { useLanguage, type Language } from '../i18n';
vi.mock('../terminals',()=>({disposeAllSessions:vi.fn(),disposeSession:vi.fn(),getSession:vi.fn(),refreshSessionProfile:vi.fn()}));
afterEach(()=>useLanguage.setState({language:'de'}));
it.each(['de','en','pt-BR'] as Language[])('offers editing only for explicit static entries in %s',language=>{
 useLanguage.setState({language});
 const route:Route={dest:0,prefix:32,via:1,ifaceName:'eth0',kind:'static'};
 const others:Route[]=[{...route,prefix:24,kind:'connected'},{...route,prefix:16,kind:'rip',metric:1},{...route,prefix:0}];
 const device={staticRoutes:[route],routes:()=>[...others,route]} as IpDevice;
 const html=renderToStaticMarkup(createElement(StaticRouteEditor,{device}));
 expect(html.match(/data-route-edit=/g)).toHaveLength(1);expect(html).toContain('data-route-add');expect(html).not.toContain('data-static-route-form');
});
