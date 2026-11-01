import type {Language} from '../i18n';
import {browserText} from './messages';
import type {BrowserResult} from './request';

/** Presentation of observed results only. Never derives causes from timing or
 * parses the resolver's English console strings. No protocol/capture changes. */
export function browserErrorPresentation(result:BrowserResult,language:Language) {
  const t=(key:Parameters<typeof browserText>[1])=>browserText(language,key);
  if(result.kind==='tcp'||(result.kind==='http'&&![403,404].includes(result.status)))return null;
  if(result.kind==='http')return {
    title:t(result.status===403?'forbiddenTitle':'notFoundTitle'),code:`HTTP ${result.status} ${result.reason}`,
    explanation:t(result.status===403?'http403Meaning':'http404Meaning'),resolution:undefined,
  };
  const codes={dns:'ERR_NAME_NOT_RESOLVED',refused:'ERR_CONNECTION_REFUSED',unreachable:'ERR_ADDRESS_UNREACHABLE',timeout:'ERR_CONNECTION_TIMED_OUT',empty:'ERR_TIMED_OUT'};
  const meaning=result.code==='dns'?t(result.dnsFailure==='not-configured'?'dnsUnconfiguredMeaning':result.dnsFailure==='not-found'?'dnsNotFoundMeaning':result.dnsFailure==='timeout'?'dnsTimeoutMeaning':result.dnsFailure==='refused'?'dnsRefusedMeaning':'dns'):t(result.code);
  return {
    title:t(result.code==='url'?'invalidAddressTitle':result.code==='https'?'httpsTitle':result.code==='empty'?'noResponseTitle':'siteUnavailableTitle'),
    code:codes[result.code as keyof typeof codes],explanation:meaning,
    resolution:result.resolution?.viaDns?browserText(language,'dnsResolved',{host:result.resolution.host,address:result.resolution.address}):undefined,
  };
}
