/** One brief segment travels around a decorative panel. No pixel masks/filters. */
export function EnergyBorder() {
  return <svg className="journey-energy" aria-hidden="true" focusable="false">
    <rect x="1" y="1" width="calc(100% - 2px)" height="calc(100% - 2px)" rx="9" pathLength="100" />
  </svg>;
}
