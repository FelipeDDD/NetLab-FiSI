import { translate, useLanguage } from '../i18n';

export const replacementWarning = () => translate(useLanguage.getState().language, 'workspace.replacementWarning');

/** Keep browser interaction at the UI boundary; store methods remain usable by
 * boot, tests and the future project controller without opening dialogs. */
export function confirmReplacement(action: () => void, confirm: (message: string) => boolean): void {
  if (confirm(replacementWarning())) action();
}
