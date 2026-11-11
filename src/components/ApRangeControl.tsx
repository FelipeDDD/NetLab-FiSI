import { useTranslation } from '../i18n';
import { useRef } from 'react';
import { useStore } from '../store';
import type { ApDevice } from '../engine/switch';
import { WIFI_RANGE } from '../engine/wirelessRange';

export function ApRangeControl({ device }: { device: ApDevice }) {
  const { t } = useTranslation();
  const gesture = useRef<object | null>(null);
  return <div className="ap-range-control">
    <label htmlFor={`${device.id}-range`}>{t('navigation.wifiRange')} <output>{device.rangeMeters} m</output></label>
    <input id={`${device.id}-range`} type="range" min={WIFI_RANGE.min} max={WIFI_RANGE.max} step="1"
      value={device.rangeMeters} aria-label={t('navigation.wifiRangeAria')} aria-valuetext={t('navigation.wifiRangeValue', { value: device.rangeMeters })}
      onPointerDown={() => { gesture.current = {}; }} onPointerUp={() => { gesture.current = null; }}
      onKeyDown={() => { gesture.current ??= {}; }} onKeyUp={() => { gesture.current = null; }}
      onBlur={() => { gesture.current = null; }}
      onChange={e => useStore.getState().setWifiRange(device.id, Number(e.target.value), gesture.current ?? undefined)} />
    <div className="ap-range-limits" aria-hidden="true"><span>{WIFI_RANGE.min} m</span><span>{WIFI_RANGE.max} m</span></div>
    <p className="ap-note">{t('navigation.wifiRangeHint')}</p>
  </div>;
}
