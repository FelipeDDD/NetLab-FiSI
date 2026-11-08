import assert from 'node:assert/strict';
import {mkdir,readFile,writeFile} from 'node:fs/promises';
import path from 'node:path';
import {runStudioMoveFooterReview} from './studio-move-footer-review.mjs';

export async function runStudioStabilizationReview(args){
  const {page,root,report,openPage}=args,out=path.join(root,'.playwright-mcp/reviews/studio-stabilization'),refs=path.join(out,'referencias-chatgpt');await mkdir(refs,{recursive:true});
  const scoped={...report,results:{}};
  try{await runStudioMoveFooterReview({...args,report:scoped,fixture:'stabilization',outputDirectory:path.join(out,'complex-network'),captureReferences:false});}
  finally{for(const[k,v]of Object.entries(scoped.results))report.results['stabilization complex: '+k]=v;}
  const examples=await page.evaluate("const now=await import('/src/export/studio/geometry.ts'),old=await import('/.playwright-mcp/reviews/studio-stabilization/before/studio/geometry.ts'),snap=(await import('/src/export/studio/geometry.fixture.ts')).geometryFixture('line'),options=(await import('/src/export/studio/options.ts')).printPreset('clean',snap),diagram=await import('/src/export/studio/diagram.ts');snap.links=snap.links.slice(0,1);const raw=now.makeCards(snap,options,'Gateway'),rects=[{x:60,y:120,width:140,height:100},{x:700,y:120,width:140,height:100},{x:390,y:171.75,width:140,height:100}],boxes=raw.map((c,i)=>({...c,...rects[i]})),automatic=diagram.studioAutomaticLayout(snap,options,'en'),base=diagram.positionStudioDevices(automatic,snap,options,'en');return [old,now].map(g=>{const route=g.cablePath(boxes[0],boxes[1],boxes);const l={...base,boxes,areas:[],bounds:now.diagramBounds(boxes),scale:1,tx:0,ty:0,blocks:[],cables:[{link:snap.links[0],...route,labels:[],crowded:false}]};return{points:route.points,obstructed:route.obstructed,length:now.pathLength(route.points),svg:diagram.studioDiagram(snap,options,'en',l)}});");
  assert(examples[0].points.length>2);assert.equal(examples[1].points.length,2);assert(!examples[1].obstructed);await writeFile(path.join(out,'cable-comparison.json'),JSON.stringify(examples.map(({svg,...r})=>r),null,2));
  const printer=await openPage();
  try{
    const tree=await printer.send('Page.getFrameTree');await printer.send('Emulation.setDeviceMetricsOverride',{width:1100,height:800,deviceScaleFactor:1,mobile:false});
    for(const[i,e]of examples.entries()){
      await writeFile(path.join(out,`cables-${i?'after':'before'}.svg`),e.svg);
      await printer.send('Page.setDocumentContent',{frameId:tree.frameTree.frame.id,html:`<!doctype html><meta charset="utf-8"><style>body{margin:20px;background:#fff}svg{display:block}</style>${e.svg}`});await printer.evaluate('await document.fonts.ready;');const image=await printer.send('Page.captureScreenshot',{format:'png',clip:{x:20,y:110,width:920,height:250,scale:1.5}});await writeFile(path.join(refs,`${i?'02-cabos-depois-trajeto-livre':'01-cabos-antes-desvio-por-folga'}.png`),Buffer.from(image.data,'base64'));
    }
    report.results['stabilization studio: reproduced unnecessary cable detour, free strokes remain straight and real obstacles retained']={passed:true,beforeSegments:examples[0].points.length-1,afterSegments:1};
    const matrix=await page.evaluate("window.stabilitySnapshot=(await import('/src/export/studio/model.ts')).capturePrintSnapshot(sim.net,store.getState());const{printPreset}=await import('/src/export/studio/options.ts'),{studioDiagram}=await import('/src/export/studio/diagram.ts'),{studioReport}=await import('/src/export/studio/report.ts');const rows=[];for(const language of ['de','en','pt-BR'])for(const preset of ['clean','presentation','technical'])for(const paper of ['A4','A3'])for(const orientation of ['portrait','landscape']){const o={...printPreset(preset,stabilitySnapshot),paper,orientation,title:'Projeto de rede / Stabilisierung',subtitle:'Revisão de exportação — ä ö ü ç',footerNote:'Netzwerkprojekt – DAA Bonn\\nAutor: Felipe\\nStand: 07.11.2026'},svg=studioDiagram(stabilitySnapshot,o,language),r=studioReport(stabilitySnapshot,o,language);rows.push({language,preset,paper,orientation,pages:r.pages,brand:svg.includes('NetLab-FiSI'),signature:svg.includes('Topology Studio'),automaticMetadata:svg.includes(stabilitySnapshot.capturedAt),customTitle:svg.includes(o.title),customSubtitle:svg.includes(o.subtitle),footer:svg.includes('Netzwerkprojekt'),genericWarning:/Configuration snapshot|Konfigurationsaufnahme|Captura da configuração/.test(svg+r.html),svg,html:r.html});}return rows;");
    const audit=matrix.map(({svg,html,...r})=>r);for(const r of audit){assert(r.brand&&r.customTitle&&r.customSubtitle&&r.footer&&!r.genericWarning);}
    report.studioHeaderAudit={status:audit.every(r=>r.signature&&!r.automaticMetadata)?'validated':'prior-implementation-missing',cases:audit.length,findings:{missingSignature:audit.filter(r=>!r.signature).length,automaticMetadata:audit.filter(r=>r.automaticMetadata).length}};
    await writeFile(path.join(out,'header-audit.json'),JSON.stringify({summary:report.studioHeaderAudit,matrix:audit},null,2));
    assert.equal(report.studioHeaderAudit.status,'validated','The authorized header must be present in every export variant');
    const paintChecks=[],geometryChecks=[];
    for(const row of matrix){
      const key=`${row.language}-${row.preset}-${row.paper}-${row.orientation}`;
      const before=await readFile(path.join(out,'header-before',key+'.svg'),'utf8');
      // The disposable free marking receives a new random ID each run. Its
      // paths, labels and all geometry must remain byte-identical.
      const normalize=svg=>svg.replace(/data-studio-area="[^"]*"/g,'data-studio-area=""');
      const oldBody=normalize(before.replace(/<text x="8" y="[^"]+" font-size="10" fill="#475569">NetLab-FiSI · [^<]*<\/text>/,''));
      const newBody=normalize(row.svg.replace(/<text data-studio-branding=""[^>]*>[^<]*<\/text>/,''));
      assert.equal(newBody,oldBody,'Only the header signature may change: '+key);geometryChecks.push({key,identicalOutsideBranding:true});
      await writeFile(path.join(out,key+'.svg'),row.svg);await writeFile(path.join(out,key+'.html'),row.html);
      if(key==='de-technical-A4-portrait')for(const [i,svg]of [before,row.svg].entries()){
        await printer.send('Page.setDocumentContent',{frameId:tree.frameTree.frame.id,html:`<!doctype html><meta charset="utf-8"><style>body{margin:20px;background:#fff}svg{display:block}</style>${svg}`});await printer.evaluate('await document.fonts.ready;');
        const clip=await printer.evaluate("const r=document.querySelector('svg').getBoundingClientRect();return{x:r.x,y:r.y,width:r.width,height:r.height,scale:1.5};"),capture=await printer.send('Page.captureScreenshot',{format:'png',captureBeyondViewport:true,clip});
        await writeFile(path.join(refs,`${i?'04-cabecalho-depois':'03-cabecalho-antes'}.png`),Buffer.from(capture.data,'base64'));
      }
      // Twelve physical outputs cover all presets and sheets; all 36 variants
      // are parsed/checked above. Languages rotate across the physical cases.
      const langIndex=['de','en','pt-BR'].indexOf(row.language),caseIndex=['clean','presentation','technical'].indexOf(row.preset)*4+['A4','A3'].indexOf(row.paper)*2+['portrait','landscape'].indexOf(row.orientation);if(caseIndex%3!==langIndex)continue;
      await printer.send('Page.setDocumentContent',{frameId:tree.frameTree.frame.id,html:row.html});await printer.evaluate('await document.fonts.ready;');
      const painted=await printer.evaluate("const cards=[...document.querySelectorAll('[data-device]')],clipped=[];for(const g of cards){const b=g.querySelector('rect').getBBox();for(const t of g.querySelectorAll('text')){const r=t.getBBox();if(r.x<b.x-1||r.y<b.y-1||r.x+r.width>b.x+b.width+1||r.y+r.height>b.y+b.height+1)clipped.push({device:g.dataset.device,text:t.textContent});}}const collisions=[];for(let i=0;i<cards.length;i++)for(let j=i+1;j<cards.length;j++){const a=cards[i].querySelector('rect').getBBox(),b=cards[j].querySelector('rect').getBBox();if(a.x<b.x+b.width-.01&&a.x+a.width>b.x+.01&&a.y<b.y+b.height-.01&&a.y+a.height>b.y+.01)collisions.push([cards[i].dataset.device,cards[j].dataset.device]);}return{cards:cards.length,clipped,collisions};");assert.equal(painted.clipped.length,0,JSON.stringify({key,painted}));assert.equal(painted.collisions.length,0,JSON.stringify({key,painted}));paintChecks.push({key,...painted});
      const pdf=await printer.send('Page.printToPDF',{printBackground:true,preferCSSPageSize:true});await writeFile(path.join(out,key+'.pdf'),Buffer.from(pdf.data,'base64'));
      const png=await page.evaluate(`const {svgToPngBlob}=await import('/src/export/diagram.ts');const b=await svgToPngBlob(${JSON.stringify(row.svg)},1),bytes=new Uint8Array(await b.arrayBuffer());let s='';for(let i=0;i<bytes.length;i+=32768)s+=String.fromCharCode(...bytes.subarray(i,i+32768));return btoa(s);`);await writeFile(path.join(out,key+'.png'),Buffer.from(png,'base64'));
    }
    await writeFile(path.join(out,'paint-audit.json'),JSON.stringify(paintChecks,null,2));
    await writeFile(path.join(out,'header-geometry-comparison.json'),JSON.stringify(geometryChecks,null,2));
    report.results['stabilization studio: mandatory branding without capture metadata in all exports; identical geometry in 36 variants']={passed:true,variants:matrix.length,physicalSets:12};
  }finally{await printer.send('Page.close');printer.close();}
}
