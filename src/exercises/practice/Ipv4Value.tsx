/** Adjacent text nodes retain the exact selectable/copyable address; spacing is CSS only. */
export function Ipv4Value({value}:{value:string}) {
  const match=/^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})(\/\d{1,2})?$/.exec(value);
  if(!match||match.slice(1,5).some(o=>Number(o)>255)||(match[5]&&Number(match[5].slice(1))>32))return <>{value}</>;
  return <span className="practice-ipv4" aria-label={value}>{match.slice(1,5).map((octet,i)=><span className="practice-ipv4-part" key={i}><span className="practice-octet">{octet}</span>{i<3&&<span className="practice-dot">.</span>}</span>)}{match[5]&&<span>{match[5]}</span>}</span>;
}
