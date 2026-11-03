import { expect, it } from 'vitest';
import { boundExercisePanel } from './panelPosition';

it('keeps a moved instruction panel visible without modifying its dimensions',()=>{
  const area={width:900,height:600},size={width:380,height:400};
  expect(boundExercisePanel({x:250,y:80},area,size)).toEqual({x:250,y:80});
  expect(boundExercisePanel({x:-200,y:-30},area,size)).toEqual({x:0,y:0});
  expect(boundExercisePanel({x:2000,y:900},area,size)).toEqual({x:520,y:200});
  expect(boundExercisePanel({x:520,y:200},{width:400,height:440},size)).toEqual({x:20,y:40});
  expect(boundExercisePanel({x:20,y:40},{width:300,height:200},size)).toEqual({x:0,y:0});
  expect(size).toEqual({width:380,height:400});
});
