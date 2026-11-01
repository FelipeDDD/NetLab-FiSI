/** Typing aid only: preserve paste, deletion, selection and edits inside an address. */
export function completeMaskOctet(previous:string,value:string,caret:number|null,inputType:string):string {
  if(inputType!=='insertText'||caret!==value.length)return value;
  if(previous.endsWith('.')&&value===previous+'.')return previous;
  if(value.length!==previous.length+1||!value.startsWith(previous)||!/[0-9]$/.test(value))return value;
  const octets=value.split('.');
  return octets.length<4&&octets.every(o=>/^\d{1,3}$/.test(o))&&octets.at(-1)!.length===3?value+'.':value;
}
