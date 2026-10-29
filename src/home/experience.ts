/** URL switches are temporary preview overrides, never persisted preferences. */
export function homeExperience(search: string) {
  const query = new URLSearchParams(search), demo = query.get('demo');
  return {
    classic: query.get('experience') === 'classic',
    demo: demo === 'scroll' || demo === 'slides' ? demo : null,
    alternateStations: query.get('stations') !== 'original',
    dataPreview: query.get('dataPreview') !== '0',
  };
}
