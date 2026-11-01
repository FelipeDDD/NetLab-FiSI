import {expect,it} from 'vitest';
import {LANGUAGES,type Language} from '../../i18n';
import {generateBoundariesV3,V3_RECIPES} from './boundariesV3';
import {presentationV3} from './presentationV3';
import {previewMessages,previewText} from './previewMessages';
import {checkDiagnosis,diagnosisPrompt} from './previewModel';

const placeholders=(s:string)=>[...s.matchAll(/\{(\w+)\}/g)].map(m=>m[1]).sort();
it('has complete static catalogs with identical interpolation fields',()=>{
  for(const lang of Object.keys(LANGUAGES) as Language[]) {
    expect(Object.keys(previewMessages[lang]).sort()).toEqual(Object.keys(previewMessages.en).sort());
    for(const [key,text] of Object.entries(previewMessages[lang])) {
      expect(text.trim()).not.toBe('');
      expect(placeholders(text)).toEqual(placeholders(previewMessages.en[key as keyof typeof previewMessages.en]));
    }
  }
});
it('localizes all recipe roles from facts without changing versioned content, answers or results',()=>{
  for(const recipe of V3_RECIPES)for(let i=0;i<20;i++) {
    const g=generateBoundariesV3({version:3,archetype:'ND02',difficulty:'advanced',recipe,seed:`translation-${i}`});
    const original=JSON.stringify(g),answers=Object.fromEntries(g.case.questions.map(q=>[q.id,q.answer])),result=checkDiagnosis(g,answers);
    const de=presentationV3(g,'de');
    expect(de.prompts).toEqual(Object.fromEntries(g.case.questions.map(q=>[q.id,q.prompt])));
    expect(de.explanations).toEqual(Object.fromEntries(g.case.questions.map(q=>[q.id,q.explanation.reasoning])));
    for(const lang of ['de','pt-BR','en','de'] as const) {
      const view=presentationV3(g,lang);
      expect(view.emphasis).toBe({de:'rechnerisch','pt-BR':'matematicamente',en:'mathematically'}[lang]);
      expect(view.prompts.membership).toContain(view.emphasis);
      expect(view.explanations.membership).toContain(g.data.candidate);
      expect(view.explanations.mask).toContain(g.calculation.mask);
      expect(view.explanations.mask).toContain(`/${g.data.prefix}`);
      expect(Object.keys(view.prompts)).toEqual(['membership','host','mask']);
      expect(JSON.stringify(view)).not.toMatch(/\{\w+\}/);
      if(lang!=='de')expect(JSON.stringify(view)).not.toMatch(/Gateway-Adresse|Netzbits|Hostbereich|Subnetz des PCs/);
      expect(checkDiagnosis(g,answers)).toEqual(result);
      expect(diagnosisPrompt(g).questions.map(q=>q.prompt)).toEqual(g.case.questions.map(q=>q.prompt));
      expect(JSON.stringify(g)).toBe(original);
    }
  }
});
it('selects distinct network, broadcast, outside and usable-host explanations',()=>{
  const keys={'network':'hostNetwork','broadcast':'hostBroadcast','after-broadcast':'hostOutside','before-network':'hostOutside','last-host':'hostUsable','first-host':'hostUsable','interior':'hostUsable'} as const;
  for(const [recipe,key] of Object.entries(keys))for(const lang of Object.keys(LANGUAGES) as Language[]) {
    const g=generateBoundariesV3({version:3,archetype:'ND02',difficulty:'advanced',recipe:recipe as keyof typeof keys,seed:'roles'});
    expect(presentationV3(g,lang).explanations.host).toBe(previewText(lang,key));
  }
});
