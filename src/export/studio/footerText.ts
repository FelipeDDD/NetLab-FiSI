/** Plain text only; preserve explicit line breaks, with at most three lines. */
export const normalizeFooterNote = (value: string) => value.replace(/\r\n?/g, '\n').split('\n').slice(0, 3).join('\n').slice(0, 600);
