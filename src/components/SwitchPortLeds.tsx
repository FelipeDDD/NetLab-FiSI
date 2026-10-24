import { useId } from 'react';
import { useStore } from '../store';
import { sim } from '../sim';
import { switchPortLeds } from '../switchPortLeds';
import { DEVICE_ARTWORK } from '../deviceArtwork';

// Both lamps of a socket indicate link state; neither simulates traffic blinking.
export function SwitchPortLeds({ id }: { id: string }) {
  const nodes = useStore(s => s.nodes);
  const edges = useStore(s => s.edges);
  const uid = useId().replace(/:/g, '');
  const node = nodes.find(n => n.id === id);
  if (!node) return null;
  const slots = switchPortLeds(node, nodes, edges, sim.net);
  const url = `${import.meta.env.BASE_URL}assets/devices/${DEVICE_ARTWORK.switch.file}`;
  const lamps = (activeOnly: boolean) => slots.flatMap((slot, i) => {
    if (activeOnly && !slot.active) return [];
    return [0, 65].map(offset => <ellipse key={`${i}-${offset}`}
      cx={390 + i % 8 * 94 + offset} cy={i < 8 ? 648 : 771} rx={24} ry={20}
      fill={`url(#${uid}-feather)`} />);
  });
  return <g className="switch-port-leds" pointerEvents="none">
    <defs>
      <filter id={`${uid}-dim`} colorInterpolationFilters="sRGB">
        <feColorMatrix type="saturate" values="0" />
        <feComponentTransfer>
          <feFuncR type="linear" slope="0.16" /><feFuncG type="linear" slope="0.16" /><feFuncB type="linear" slope="0.16" />
        </feComponentTransfer>
      </filter>
      <radialGradient id={`${uid}-feather`}>
        <stop offset="0.65" stopColor="white" /><stop offset="1" stopColor="black" />
      </radialGradient>
      <mask id={`${uid}-off`} maskUnits="userSpaceOnUse" x="350" y="610" width="810" height="200">{lamps(false)}</mask>
      <mask id={`${uid}-on`} maskUnits="userSpaceOnUse" x="350" y="610" width="810" height="200">{lamps(true)}</mask>
    </defs>
    {/* Reuse the original lamp texture, dimmed locally, then restore active lamps. */}
    <image href={url} width="1254" height="1254" filter={`url(#${uid}-dim)`} mask={`url(#${uid}-off)`} />
    <image href={url} width="1254" height="1254" mask={`url(#${uid}-on)`} />
    {slots.map((slot, i) => <g key={i} data-led-slot={i} data-link-id={slot.linkId} data-led-active={slot.active} />)}
  </g>;
}
