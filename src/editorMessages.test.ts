import { describe, expect, it } from 'vitest';
import { translate, type Language } from './i18n';
import { editorMessage, editorMessageText, historyOperationLabel } from './editorMessages';
import type { TopologyOperation } from './topologyHistory';

const t = (language: Language) => (key: Parameters<typeof translate>[1], values?: Record<string, string | number>) => translate(language, key, values);
describe('structured editor presentation', () => {
  it('re-renders a pending notification without changing its key, values or technical content', () => {
    const message = editorMessage('navigation.configCopied', { name: 'Roteador – São Paulo 東京 <via>' });
    const original = structuredClone(message);
    expect(editorMessageText(message, t('de'))).toContain('Konfiguration kopiert');
    expect(editorMessageText(message, t('en'))).toContain('config copied');
    expect(editorMessageText(message, t('pt-BR'))).toContain('configuração nftables copiada');
    for (const language of ['de', 'en', 'pt-BR'] as const) {
      expect(editorMessageText(message, t(language))).toContain('Roteador – São Paulo 東京 <via>');
      expect(editorMessageText(message, t(language))).toContain('/etc/nftables.conf');
    }
    expect(message).toEqual(original);
  });
  it('never interprets old free text or translates a string because it resembles German UI', () => {
    for (const text of ['WLAN hinzuf?gen', 'Custom: Gerät löschen', 'São Paulo 東京', 'Import failed: private diagnostic']) {
      for (const language of ['de', 'en', 'pt-BR'] as const) {
        expect(editorMessageText(text, t(language))).toBe(text);
        expect(historyOperationLabel({ label: text }, t(language))).toBe(text);
        expect(historyOperationLabel({ type: 'future-operation', label: text } as unknown as TopologyOperation, t(language))).toBe(text);
      }
    }
  });
  it('can localize an older typed WLAN operation without inspecting or rewriting its damaged label', () => {
    const operation: TopologyOperation = { type: 'enable-wireless', label: 'WLAN hinzuf?gen', deviceId: 'host', mac: '02:00:00:00:00:01' };
    expect(historyOperationLabel(operation, t('de'))).toBe('WLAN hinzufügen');
    expect(historyOperationLabel(operation, t('en'))).toBe('Add WLAN');
    expect(historyOperationLabel(operation, t('pt-BR'))).toBe('Adicionar WLAN');
    expect(operation.label).toBe('WLAN hinzuf?gen');
  });
  it('preserves Unicode names and before/after values in rename history', () => {
    const operation: TopologyOperation = { type: 'rename-device', label: 'old label', deviceId: 'pc1', before: 'Mein Gerät 東京', after: 'LAN A – São Paulo' };
    const snapshot = structuredClone(operation);
    for (const language of ['de', 'en', 'pt-BR'] as const) {
      const label = historyOperationLabel(operation, t(language));
      expect(label).toContain(operation.before); expect(label).toContain(operation.after);
    }
    expect(operation).toEqual(snapshot);
  });
  it('uses operation snapshots to distinguish wireless from wired connections', () => {
    const link = { id: 'link', a: ['host', 'wlan0'], b: ['ap', 'wifi-1'], latency: 1, medium: 'wireless' } as const;
    const wireless = { type: 'add-links', label: 'anything', links: [link] } as unknown as TopologyOperation;
    const wired = { type: 'add-links', label: 'WLAN verbinden', links: [{ ...link, medium: undefined }] } as unknown as TopologyOperation;
    expect(historyOperationLabel(wireless, t('pt-BR'))).toBe('Conectar WLAN');
    expect(historyOperationLabel(wired, t('pt-BR'))).toBe('Conectar dispositivos');
  });
  it.each(['de', 'en', 'pt-BR'] as const)('uses natural singular/plural and preserves protocol fields in %s', language => {
    const one: TopologyOperation = { type: 'move-nodes', label: 'Move device', changes: [{ id: 'a', before: { x: 0, y: 0 }, after: { x: 1, y: 1 } }] };
    const many: TopologyOperation = { ...one, changes: [...one.changes, { ...one.changes[0], id: 'b' }] };
    expect(historyOperationLabel(one, t(language))).toBe(translate(language, 'navigation.historyMoveOne'));
    expect(historyOperationLabel(many, t(language))).toBe(translate(language, 'navigation.historyMoveMany', { count: 2 }));
    const state: TopologyOperation = { type: 'set-iface-state', label: 'unused', deviceId: 'r1', ifaceName: 'eth42', before: true, after: false };
    expect(historyOperationLabel(state, t(language))).toContain('eth42'); expect(historyOperationLabel(state, t(language))).toContain('DOWN');
    expect(historyOperationLabel({ type: 'chapter-restore', label: 'Approved teaching context', id: 'old' }, t(language))).toBe('Approved teaching context');
  });
});
