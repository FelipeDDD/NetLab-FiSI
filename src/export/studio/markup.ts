export const escapeMarkup = (value: string) => value.replace(/[&<>"']/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[char]!);
export const printAccent = (value: string) => /^#[a-f\d]{6}$/i.test(value) ? value : '#256080';
