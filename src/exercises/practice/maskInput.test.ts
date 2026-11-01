import {expect,it} from 'vitest';
import {completeMaskOctet} from './maskInput';
const typed=(previous:string,value:string)=>completeMaskOctet(previous,value,value.length,'insertText');
it('separates three typed digits before the last octet without duplicating manual dots',()=>{
  expect(typed('25','255')).toBe('255.');
  expect(typed('255.25','255.255')).toBe('255.255.');
  expect(typed('255.255.25','255.255.255')).toBe('255.255.255.');
  expect(typed('255.255.255.','255.255.255..')).toBe('255.255.255.');
  expect(typed('255.255.25','255.255.25.')).toBe('255.255.25.');
  expect(typed('255.255.25.','255.255.25..')).toBe('255.255.25.');
  expect(typed('255.255.255.22','255.255.255.224')).toBe('255.255.255.224');
});
it('keeps deletion, paste, composition, selected replacements and middle edits untouched',()=>{
  for(const inputType of ['deleteContentBackward','insertFromPaste','insertCompositionText'])expect(completeMaskOctet('255.255.25','255.255.255',11,inputType)).toBe('255.255.255');
  expect(completeMaskOctet('255.255.25','255.255.255',10,'insertText')).toBe('255.255.255');
  expect(typed('255.255.128','255.255.255')).toBe('255.255.255');
  expect(typed('','255.255.255.0')).toBe('255.255.255.0');
});
