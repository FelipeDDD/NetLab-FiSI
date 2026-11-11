import { CANVAS_BACKGROUNDS, useCanvasBackground } from '../canvasBackground';
import { BACKGROUND_ANIMATIONS, normalizeAnimation } from '../backgroundParticles';
import { useTranslation } from '../i18n';

const ANIMATION_LABELS = {
  off: 'navigation.settingsAnimationOff', emerald: 'navigation.settingsAnimationEmerald',
  fireflies: 'navigation.settingsAnimationFireflies', teal: 'navigation.settingsAnimationTeal', shooting: 'navigation.settingsAnimationShooting',
} as const;

export function BackgroundSettings() {
  const { t } = useTranslation();
  const { preference, update } = useCanvasBackground();
  return <fieldset className="background-settings">
    <legend>{t('navigation.settingsBackground')}</legend>
    <label htmlFor="canvas-background-choice">{t('navigation.settingsBackground')}</label>
    <select id="canvas-background-choice" value={preference.choice}
      onChange={event => update({ choice: event.target.value as typeof preference.choice })}>
      {Object.entries(CANVAS_BACKGROUNDS).map(([id, { label }]) => <option key={id} value={id}>{label}</option>)}
    </select>
    <label htmlFor="canvas-background-intensity">{t('navigation.settingsIntensity')} <output>{preference.intensity}%</output></label>
    <input id="canvas-background-intensity" type="range" min="0" max="100" value={preference.intensity}
      disabled={preference.choice === 'original'} onChange={event => update({ intensity: Number(event.target.value) })} />
    <label className="background-dots-choice"><input type="checkbox" checked={preference.dots}
      onChange={event => update({ dots: event.target.checked })} />{t('navigation.settingsDots')}</label>
    <label htmlFor="background-animation">{t('navigation.settingsAnimation')}</label>
    <select id="background-animation" value={preference.animation} onChange={event => update({ animation: normalizeAnimation(event.target.value) })}>
      {(Object.keys(BACKGROUND_ANIMATIONS) as (keyof typeof BACKGROUND_ANIMATIONS)[]).map(id => <option key={id} value={id}>{t(ANIMATION_LABELS[id])}</option>)}
    </select>
  </fieldset>;
}
