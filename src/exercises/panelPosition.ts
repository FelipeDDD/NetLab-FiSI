export function boundExercisePanel(position: {x:number;y:number}, area: {width:number;height:number}, size: {width:number;height:number}) {
  const bound = (value:number, available:number, length:number) => Math.max(0, Math.min(value, Math.max(0, available - length)));
  return {x:bound(position.x,area.width,size.width),y:bound(position.y,area.height,size.height)};
}
