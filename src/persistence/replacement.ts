export const REPLACEMENT_WARNING = 'Die aktuelle Topologie wird ersetzt und später durch Autosave überschrieben. Ungesicherte Entwürfe und Terminalsitzungen gehen verloren. Falls benötigt, zuerst JSON exportieren. Fortfahren?';

/** Keep browser interaction at the UI boundary; store methods remain usable by
 * boot, tests and the future project controller without opening dialogs. */
export function confirmReplacement(action: () => void, confirm: (message: string) => boolean): void {
  if (confirm(REPLACEMENT_WARNING)) action();
}
