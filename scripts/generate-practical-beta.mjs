import { createServer } from 'vite';
import { writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
const root=fileURLToPath(new URL('../',import.meta.url));
const vite=await createServer({root,configFile:false,appType:'custom',logLevel:'error',server:{middlewareMode:true,hmr:false,watch:null}});
try {
  const {PRACTICAL_STUDENTS:students,PRACTICAL_RULES:rules}=await vite.ssrLoadModule('/src/exercises/practicalPublication.ts');
  if(students.length!==4||new Set(students.map(e=>e.id)).size!==4)throw Error('Explicit pilot allowlist requires four exercises.');
  for(const e of students) {
    if(e.student.requirements.some(r=>!rules[e.id].some(c=>c.requirementId===r.id)))throw Error('Unassessed requirement');
    if(!rules[e.id].some(c=>c.kind==='structure')||!rules[e.id].some(c=>c.kind==='route'))throw Error('Pilot safety checks required');
  }
  for(const [name,data] of [['practicalStudents',students],['practicalRules',rules]])await writeFile(new URL(`../src/exercises/${name}.json`,import.meta.url),JSON.stringify(data,null,2)+'\n');
  console.log('Published four explicit student/rule projections; no reference topology or solution commands.');
} finally {await vite.close();}
