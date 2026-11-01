/** Shared native single-choice presentation; callers own grading and disclosure timing. */
export function ChoiceField({id,prompt,options,value,onChange,labels,states,result,correctChoice,language='de'}: {
  id:string; prompt:import('react').ReactNode; options:readonly {value:string;label:'yes'|'no'|'unknown'}[];
  value?:string; onChange(value:string):void;
  labels:Record<'yes'|'no'|'unknown',string>; states:Record<'correct'|'incorrect',string>;
  result?:'correct'|'incorrect'|'missing'; correctChoice?:string;
  language?:string;
}) {
  return <fieldset id={id} className="practice-choice" aria-describedby={result?id+'-feedback':undefined} aria-invalid={result&&result!=='correct'}>
    <legend lang={language}>{prompt}</legend><div className="practice-choice-options">
      {options.map(o=>{
        const verdict=correctChoice===undefined?undefined:o.value===correctChoice?'correct':value===o.value?'incorrect':undefined;
        return <label className="btn" key={o.value} data-choice-result={verdict}>
          <input type="radio" name={id} value={o.value} checked={value===o.value} onChange={()=>onChange(o.value)} />
          <span>{labels[o.label]}</span>
          {verdict&&<span className="practice-choice-verdict"><span aria-hidden="true">{verdict==='correct'?'✓':'✕'}</span> {states[verdict]}</span>}
        </label>;
      })}
    </div>
  </fieldset>;
}
