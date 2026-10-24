import { useCanvasBackground } from '../canvasBackground';
import { BACKGROUND_ANIMATIONS, normalizeAnimation } from '../backgroundParticles';

export function BackgroundSettings() {
  const { preference, update } = useCanvasBackground();
  return <fieldset className="background-settings">
    <legend>Background</legend>
    <label htmlFor="canvas-background-choice">Background</label>
    <select id="canvas-background-choice" value={preference.choice}
      onChange={event => update({ choice: event.target.value as typeof preference.choice })}>
      <option value="original">Original</option><option value="verde1">Verde 1</option><option value="verde2">Verde 2</option>
    </select>
    <label htmlFor="canvas-background-intensity">Intensity <output>{preference.intensity}%</output></label>
    <input id="canvas-background-intensity" type="range" min="0" max="100" value={preference.intensity}
      disabled={preference.choice === 'original'} onChange={event => update({ intensity: Number(event.target.value) })} />
    <label className="background-dots-choice"><input type="checkbox" checked={preference.dots}
      onChange={event => update({ dots: event.target.checked })} />Show React Flow dots</label>
    <label htmlFor="background-animation">Background animation</label>
    <select id="background-animation" value={preference.animation} onChange={event => update({ animation: normalizeAnimation(event.target.value) })}>
      {Object.entries(BACKGROUND_ANIMATIONS).map(([id, label]) => <option key={id} value={id}>{label}</option>)}
    </select>
  </fieldset>;
}
