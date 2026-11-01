// Production build with an assertion against Rollup's actual emitted module graph.
import assert from 'node:assert/strict';
import {build} from 'vite';
let inspected=0;
const published=new Set(['boundariesV2.ts','boundariesV3.ts','presentationV3.ts','nd02Messages.ts']);
const seen=new Set();
await build({plugins:[{name:'assert-no-diagnosis-preview-in-production',generateBundle(_options,bundle) {
  for(const output of Object.values(bundle)) {
    if(output.type==='chunk')for(const id of Object.keys(output.modules)) {
      inspected++;
      const normalized=id.replaceAll('\\','/'),diagnosis=normalized.split('/src/exercises/diagnosis/')[1];
      if(diagnosis) {assert(published.has(diagnosis),`Unpublished diagnosis module emitted: ${id}`);seen.add(diagnosis);}
    }
    const content=output.type==='chunk'?output.code:String(output.source);
    for(const marker of ['diagnosis-selection','diagnosis-generated','__diagnosis_preview__','nd02-zero-host','nd05-ingress'])assert(!content.includes(marker),`Preview marker emitted: ${marker}`);
  }
}}]});
assert(inspected>0);assert.deepEqual(seen,published);console.log(`Production isolation OK: ${inspected} emitted modules inspected; only ND02 v3 and its immutable v2 address dependency published. No preview/pilot/internal diagnosis generator.`);
