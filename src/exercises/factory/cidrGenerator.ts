import { ipToString } from '../../engine/ip';
import type { CidrCase, CidrProblem } from './cidr';

export const CIDR_SCENARIOS = ['same-network', 'boundary', 'gateway', 'mixed-masks', 'healthy', 'real-fault'] as const;
export type CidrScenario = typeof CIDR_SCENARIOS[number];
/** CIDR v1 has its own seed namespace: adding this family cannot change A/B recipes. */
export function generateCidr(seed: string, level: number, scenario: CidrScenario): CidrProblem {
  if (!CIDR_SCENARIOS.includes(scenario)) throw Error('Unbekannter CIDR-Szenariotyp');
  let state=2166136261;
  for (const c of `1|cidr|${level}|${scenario}|${seed}`) state=Math.imul(state^c.charCodeAt(0),16777619)>>>0;
  const next=(n:number)=>{ state=(Math.imul(state,1664525)+1013904223)>>>0; return Math.floor(state/2**32*n); };
  const pick=(values:number[])=>values[next(values.length)];
  const prefix=pick(level===0?[23,25,26]:level===1?[22,23,25,26,27]:[20,22,23,25,26,27,28]);
  const base=10*2**24+(16+next(200))*65536;
  const size=2**(32-prefix), start=base+next(8)*size;
  const ip=(offset:number)=>ipToString(start+offset), host=2+next(Math.min(10,size-4));
  let c:CidrCase={id:'fall',a:`${ip(host)}/${prefix}`,b:`${ip(size-2)}/${prefix}`,layer2:'same',routedPath:'absent'};
  switch(scenario) {
    case 'same-network': {
      const p=pick(level===0?[23]:level===1?[22,23]:[20,22,23]), n=2**(32-p);
      const begin=base+next(8)*n;
      c={...c,a:`${ipToString(begin+1+next(200))}/${p}`,b:`${ipToString(begin+256+1+next(200))}/${p}`}; break;
    }
    case 'boundary': c={...c,a:`${ip(size-2)}/${prefix}`,b:`${ip(size+1+next(6))}/${prefix}`}; break;
    case 'gateway': {
      const kind=next(3);
      c={...c,layer2:'unknown',routedPath:'unknown',gatewayA:ip(kind===0?1:kind===1?size+1:size-1)}; break;
    }
    case 'mixed-masks':
      c={...c,a:`${ip(1+next(Math.min(10,size/2-2)))}/${prefix}`,b:`${ip(size/2+1+next(Math.min(5,size/2-3)))}/${prefix+1}`}; break;
    case 'healthy': {
      if(level>0&&next(2)===0) c={...c,b:`${ip(size+host)}/${prefix}`,layer2:'separate',routedPath:'working',gatewayA:ip(1),routerA:ip(1),gatewayB:ip(size+1),routerB:ip(size+1)};
      break;
    }
    case 'real-fault': {
      const fault=next(level===0?2:3);
      if(fault===0) c={...c,layer2:'separate'};
      else {
        c={...c,b:`${ip(size+host)}/${prefix}`,layer2:'separate',routedPath:'working',gatewayA:ip(1),routerA:ip(1),gatewayB:ip(size+1),routerB:ip(size+1)};
        if(fault===1) c.gatewayA=ip(size+2);
        else c.a=`${ip(host)}/${prefix-1}`; // start must align with the broader client network.
        if(fault===2&&Math.floor(start/(size*2))!==Math.floor((start+size)/(size*2))) {
          // Shift the whole pair by one original subnet; retain the same documented router relationships.
          const shift=(value:string)=>ipToString(value.split('.').reduce((n,o)=>n*256+Number(o),0)-size);
          c={...c,a:`${shift(ip(host))}/${prefix-1}`,b:`${shift(ip(size+host))}/${prefix}`,
            gatewayA:shift(ip(1)),routerA:shift(ip(1)),gatewayB:shift(ip(size+1)),routerB:shift(ip(size+1))};
        }
      } break;
    }
  }
  return {family:'cidr',mode:'diagnosis',cases:[c]};
}
