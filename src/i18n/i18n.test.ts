import { afterEach, describe, expect, it, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import ts from 'typescript';
import { catalogs, LANGUAGES, LANGUAGE_KEY, normalizeLanguage, readLanguage, translate, useLanguage, type Language, type TranslationKey } from './index';
import { Home } from '../home/Home';

afterEach(() => { vi.unstubAllGlobals(); useLanguage.setState({ language: 'de' }); });
const placeholders = (s: string) => [...s.matchAll(/\{(\w+)\}/g)].map(m => m[1]).sort();
describe('catalog contracts', () => {
  for (const [domain, translations] of Object.entries(catalogs)) {
    for (const language of Object.keys(LANGUAGES) as Language[]) {
      it(`${domain}/${language} has exactly the source keys and interpolation fields`, () => {
        expect(Object.keys(translations[language]).sort()).toEqual(Object.keys(translations.en).sort());
        for (const [key, value] of Object.entries(translations[language])) {
          expect(value.trim()).not.toBe('');
          expect(placeholders(value)).toEqual(placeholders((translations.en as Record<string, string>)[key]));
        }
      });
    }
  }
  it('uses English fallback for an untranslated valid key, never the key itself', () => {
    const previous = catalogs.home['pt-BR'].title;
    try { catalogs.home['pt-BR'].title = ''; expect(translate('pt-BR', 'home.title')).toBe(catalogs.home.en.title); }
    finally { catalogs.home['pt-BR'].title = previous; }
  });
  it('interpolates literal technical/user values without translating or interpreting markup', () => {
    expect(translate('en', 'workspace.deleteNamed', { name: '<eth0>192.168.1.1/24' })).toBe('Delete <eth0>192.168.1.1/24');
    expect(translate('en', 'home.recentOther', { count: 3 })).toBe('3 saved plans');
  });
  it('fully migrated homepage JSX has no uncatalogued natural-language text or attributes', () => {
    for (const file of ['Home', 'HomeTopology']) {
      const source = readFileSync(new URL(`../home/${file}.tsx`, import.meta.url), 'utf8');
      const ast = ts.createSourceFile(file + '.tsx', source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
      const literals: string[] = [];
      const visit = (node: ts.Node) => {
        if (ts.isJsxText(node) && /[a-z]{3}/i.test(node.text) && !/NetLab|FiSI|01 \/ LAN/.test(node.text)) literals.push(node.text.trim());
        if (ts.isJsxAttribute(node) && ['title', 'placeholder', 'aria-label', 'alt'].includes(node.name.getText(ast)) && node.initializer && ts.isStringLiteral(node.initializer) && node.initializer.text !== 'NetLab-FiSI') literals.push(node.initializer.text);
        ts.forEachChild(node, visit);
      };
      visit(ast); expect(literals).toEqual([]);
    }
  });
  it('every static key referenced by migrated consumers exists', () => {
    const files = ['../home/journey/TerminalShowcase.tsx', '../home/journey/ThematicHome.tsx', '../home/journey/PacketScenes.tsx', '../home/journey/ScrollJourney.tsx', '../home/Home.tsx', '../home/HomeTopology.tsx', './LanguageSelector.tsx', './HomeLink.tsx', '../components/Toolbar.tsx', '../components/InspectorLayoutSettings.tsx', '../workspace/WorkspaceUI.tsx', '../exercises/ExerciseUI.tsx'];
    for (const file of files) {
      const source = readFileSync(new URL(file, import.meta.url), 'utf8');
      for (const match of source.matchAll(/['"]((?:home|common|navigation|workspace|exercises|journey)\.\w+)['"]/g)) {
        expect(translate('en', match[1] as TranslationKey)).toBeTruthy();
      }
    }
  });
  it('catalog keys are used by migrated components (explicit finite dynamic families)', () => {
    const files = ['../home/journey/TerminalShowcase.tsx', '../home/journey/ThematicHome.tsx', '../home/journey/PacketScenes.tsx', '../home/journey/ScrollJourney.tsx', '../home/Home.tsx', '../home/HomeTopology.tsx', './LanguageSelector.tsx', './HomeLink.tsx', '../components/Toolbar.tsx', '../components/InspectorLayoutSettings.tsx', '../workspace/WorkspaceUI.tsx', '../exercises/ExerciseUI.tsx'];
    const source = files.map(file => readFileSync(new URL(file, import.meta.url), 'utf8')).join('\n');
    const references = new Set([...source.matchAll(/['"]((?:home|common|navigation|workspace|exercises|journey)\.\w+)['"]/g)].map(m => m[1]));
    for (const type of ['host', 'router', 'switch', 'server']) { references.add(`home.${type}`); references.add(`home.${type}Hint`); }
    for (const feature of ['simulation', 'terminals', 'capture', 'routing', 'learning', 'editor']) { references.add(`home.${feature}`); references.add(`home.${feature}Text`); }
    for (const key of ['combined', 'scrollOnly', 'slidesOnly']) references.add(`journey.${key}`);
    for (const feature of ['terminal', 'switch', 'routing', 'capture', 'exercise']) { references.add(`journey.${feature}Title`); references.add(`journey.${feature}Body`); references.add(`journey.${feature}Label`); }
    const unused = Object.entries(catalogs).flatMap(([domain, table]) => Object.keys(table.en).map(key => `${domain}.${key}`)).filter(key => !references.has(key));
    expect(unused).toEqual([]);
  });
});
it('keeps German compatibility default without writing preferences', () => {
  const setItem = vi.fn(); vi.stubGlobal('localStorage', { getItem: () => null, setItem });
  expect(readLanguage()).toBe('de'); expect(normalizeLanguage('unknown')).toBe('de'); expect(setItem).not.toHaveBeenCalled();
});
it.each(Object.keys(LANGUAGES) as Language[])('persists %s independently of other preferences', language => {
  const values = new Map([['netlab:ui-theme:v1', 'classic-light']]);
  vi.stubGlobal('localStorage', { getItem: (k: string) => values.get(k) ?? null, setItem: (k: string, v: string) => values.set(k, v) });
  useLanguage.getState().setLanguage(language);
  expect(readLanguage()).toBe(language); expect(values.get(LANGUAGE_KEY)).toBe(language);
  expect(values.get('netlab:ui-theme:v1')).toBe('classic-light'); expect(values.size).toBe(2);
});
it('works when storage is denied', () => {
  vi.stubGlobal('localStorage', { getItem: () => { throw Error(); }, setItem: () => { throw Error(); } });
  expect(readLanguage()).toBe('de'); expect(() => useLanguage.getState().setLanguage('en')).not.toThrow();
  expect(useLanguage.getState().language).toBe('en');
});
it('renders the compatibility-default homepage and all language options without a simulation', () => {
  const html = renderToStaticMarkup(createElement(Home));
  expect(html).toContain(catalogs.home.de.title);
  for (const name of Object.values(LANGUAGES)) expect(html).toContain(name);
  expect(html).toContain('./app.html?home=new'); expect(html).toContain('./app.html?home=load');
  expect(html).toContain('./app.html?home=exercises'); expect(html).toContain('./app.html?home=labs');
  expect(html).not.toContain('xterm'); expect(html).not.toContain('home.title');
});
