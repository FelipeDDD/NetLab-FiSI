import { afterEach, expect, it, vi } from 'vitest';
import { createElement, type ReactNode } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { useLanguage, type Language, translate } from '../i18n';
import { LpmPanel } from './LpmPanel';
import type { LpmController, LpmState } from './LpmController';
import { createLpmAttempt } from './lpmAttempt';

vi.mock('../exercises/ExercisePanelFrame', () => ({ ExercisePanelFrame: ({ header, children }: { header: ReactNode; children: ReactNode }) => createElement('aside', null, header, children) }));
vi.mock('../terminals', () => ({ disposeAllSessions: vi.fn(), disposeSession: vi.fn(), getSession: vi.fn(), refreshSessionProfile: vi.fn() }));
afterEach(() => useLanguage.setState({ language: 'de' }));
const render = (step: number) => {
  const state: LpmState = { active: true, busy: false, saving: false, storageError: false, warning: null, record: { ...createLpmAttempt().progress, step }, passed: false, historical: false, canAdvance: false, answerError: false, shortRoute:false, longRouteProved:false };
  return renderToStaticMarkup(createElement(LpmPanel, { controller: {} as LpmController, state, onExplore: () => {} }));
};
it.each(['de', 'en', 'pt-BR'] as Language[])('keeps questions visible, solutions hidden and help optional in %s', language => {
  useLanguage.setState({ language });
  for (let step = 1; step <= 5; step++) {
    const html = render(step); expect(html).not.toMatch(/ping -c|<table|<details[^>]*\sopen(?:[ =>])/);
    expect(html).not.toContain(translate(language, `guidedLpm.success${step}` as 'guidedLpm.success1'));
    if (step === 1) {
      expect(html).toContain('data-lpm-prediction'); expect(html).toContain('data-lpm-prediction-confirm="true" disabled');
      expect(html).not.toContain('data-lpm-test'); expect(html).not.toContain('data-lpm-surprise'); expect(html).not.toContain('<details');
    }
    if (step === 2) {
      expect(html).toContain('data-lpm-answer'); expect(html).toContain('value="both"');
      expect(html).toMatch(/<details[^>]*data-lpm-help[^>]*>[\s\S]*data-lpm-table/);
      expect(html).toContain('>ip</span> <span class="guided-command-syntax">route</span>');
    }
    if (step === 4) expect(html).not.toContain('<details');
    if (step === 5) expect(html).not.toMatch(/10\.6\.|eth2|192\.168\.80\.128/);
  }
});
