import type {Language} from '../../i18n';
import type {BoundaryDiagnosisV3} from './boundariesV3';
import {nd02Text} from './nd02Messages';

/** Pure presentation. No changes to questions, expected answers, recipes or correction state. */
export function presentationV3(g:BoundaryDiagnosisV3,language:Language) {
  const t=(key:Parameters<typeof nd02Text>[1],values?:Record<string,string|number>)=>nd02Text(language,key,values);
  const d=g.data,f=g.calculation;
  // Recipe roles and calculated facts select fixed templates, never German prose parsing.
  const outside=d.role==='before-network'||d.role==='after-broadcast';
  const host=d.candidate===f.network?t('hostNetwork'):d.candidate===f.broadcast?t('hostBroadcast'):outside?t('hostOutside'):
    t('hostUsable')+(['zero-host','255-host'].includes(d.role)?' '+t('hostOctet'):'');
  return {title:t('exerciseTitle'),emphasis:t('term'),
    prompts:{membership:t('membership',{term:t('term')}),host:t('host'),mask:t('mask')} as Record<string,string>,
    explanations:{membership:t(outside?'memberOutside':'memberInside',{candidate:d.candidate}),host,
      mask:t('maskReason',{prefix:d.prefix,bits:Array.from({length:4},(_,i)=>Math.max(0,Math.min(8,d.prefix-i*8))).join(' + '),mask:f.mask})} as Record<string,string>};
}
