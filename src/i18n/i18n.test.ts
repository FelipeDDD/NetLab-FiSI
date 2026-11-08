import { afterEach, describe, expect, it, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import ts from 'typescript';
import { catalogs, LANGUAGES, LANGUAGE_KEY, normalizeLanguage, readLanguage, translate, useLanguage, type Language, type TranslationKey } from './index';
import ThematicHome from '../home/journey/ThematicHome';

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
    const previous = catalogs.journey['pt-BR'].title;
    try { catalogs.journey['pt-BR'].title = ''; expect(translate('pt-BR', 'journey.title')).toBe(catalogs.journey.en.title); }
    finally { catalogs.journey['pt-BR'].title = previous; }
  });
  it('interpolates literal technical/user values without translating or interpreting markup', () => {
    expect(translate('en', 'workspace.deleteNamed', { name: '<eth0>192.168.1.1/24' })).toBe('Delete <eth0>192.168.1.1/24');
  });
  it('fully migrated homepage JSX has no uncatalogued natural-language text or attributes', () => {
    for (const file of ['journey/ThematicHome']) {
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
    const files = ['../home/journey/TerminalShowcase.tsx', '../home/journey/ThematicHome.tsx', '../home/journey/PacketScenes.tsx', '../home/journey/ScrollJourney.tsx', './LanguageSelector.tsx', './HomeLink.tsx', '../components/Toolbar.tsx', '../components/InspectorLayoutSettings.tsx', '../workspace/WorkspaceUI.tsx', '../exercises/ExerciseUI.tsx', '../exercises/menuGroups.ts', '../exercises/practice/PracticeSurface.tsx', '../exercises/practice/PracticePanel.tsx', '../components/LearningHelp.tsx', '../tutorials/TutorialUI.tsx', '../tutorials/CompletionUI.tsx', '../tutorials/SubnetTutorialPanel.tsx', '../tutorials/RouterTutorialPanel.tsx', '../tutorials/GuidedVisualHelp.tsx', '../tutorials/tutorialVisualHelp.ts', '../tutorials/StaticRoutingTutorialPanel.tsx', '../tutorials/AlternativePathsPanel.tsx', '../tutorials/ChapterRestartUI.tsx', '../components/QuickPingIndicator.tsx', '../components/PacketAnimationControl.tsx', '../components/TerminalPanelView.tsx', '../components/TerminalCommandReference.tsx', '../components/FloatingCommandReferences.tsx'];
    for (const file of files) {
      const source = readFileSync(new URL(file, import.meta.url), 'utf8');
      for (const match of source.matchAll(/['"]((?:home|common|navigation|workspace|exercises|journey|practice|learningHelp|guided|guidedVisual|guidedSubnet|guidedRouter|guidedRestart|guidedStatic|guidedStaticLine|guidedAlternative|referencePins|pingControls)\.\w+)['"]/g)) {
        expect(translate('en', match[1] as TranslationKey)).toBeTruthy();
      }
    }
  });
  it('catalog keys are used by migrated components (explicit finite dynamic families)', () => {
    const files = ['../home/journey/TerminalShowcase.tsx', '../home/journey/ThematicHome.tsx', '../home/journey/PacketScenes.tsx', '../home/journey/ScrollJourney.tsx', './LanguageSelector.tsx', './HomeLink.tsx', '../components/Toolbar.tsx', '../components/InspectorLayoutSettings.tsx', '../workspace/WorkspaceUI.tsx', '../exercises/ExerciseUI.tsx', '../exercises/menuGroups.ts', '../exercises/practice/PracticeSurface.tsx', '../exercises/practice/PracticePanel.tsx', '../components/LearningHelp.tsx', '../tutorials/TutorialUI.tsx', '../tutorials/CompletionUI.tsx', '../tutorials/SubnetTutorialPanel.tsx', '../tutorials/RouterTutorialPanel.tsx', '../tutorials/GuidedVisualHelp.tsx', '../tutorials/tutorialVisualHelp.ts', '../tutorials/StaticRoutingTutorialPanel.tsx', '../tutorials/AlternativePathsPanel.tsx', '../tutorials/ChapterRestartUI.tsx', '../components/QuickPingIndicator.tsx', '../components/PacketAnimationControl.tsx', '../components/TerminalPanelView.tsx', '../components/TerminalCommandReference.tsx', '../components/FloatingCommandReferences.tsx'];
    const source = files.map(file => readFileSync(new URL(file, import.meta.url), 'utf8')).join('\n');
    const references = new Set([...source.matchAll(/['"]((?:home|common|navigation|workspace|exercises|journey|practice|learningHelp|guided|guidedVisual|guidedSubnet|guidedRouter|guidedRestart|guidedStatic|guidedStaticLine|guidedAlternative|referencePins|pingControls)\.\w+)['"]/g)].map(m => m[1]));
    for (const feature of ['terminal', 'switch', 'routing', 'capture', 'exercise']) { references.add(`journey.${feature}Title`); references.add(`journey.${feature}Body`); references.add(`journey.${feature}Label`); }
    for (const key of ['maskTitle', 'maskText', 'maskPassed', 'demoTitle', 'demoText', 'demoPassed', 'failureTitle', 'failureText', 'failurePassed', 'correctTitle', 'correctText', 'correctPassed', 'retestTitle', 'retestText', 'finished', 'missing', 'conflict', 'noPort', 'network', 'forms', 'terminalBusy', 'terminalInput', 'demoRepeat']) references.add(`guidedSubnet.${key}`);
    for (const key of ['introTitle','introText','cablesTitle','cablesText','interfacesTitle','interfacesText','hostTitle','hostText','gatewaysTitle','gatewaysText','routeTitle','routeText','diagnosisTitle','diagnosisText','solveTitle','solveText','testTitle','testText','missing','conflict','noPort','network','forms','cables','interfaces','hostIp','gateways','defaultRoute','pcB','repeatUnsafe','diagnosisOther']) references.add('guidedRouter.'+key);
    for (const key of ['forms','missing','network','port','conflict']) references.add(`guidedStatic.${key}`);
    for (let step=1;step<=17;step++) for (const suffix of ['Title','Text']) references.add(`guidedAlternative.step${step}${suffix}`);
    for (const step of [1,2,3,4,5,8,9,10,13,14,15,16]) references.add(`guidedAlternative.step${step}Help`);
    for (const key of ['part1','part2','part3','forms','missing','transit','wiring','port','conflict']) references.add(`guidedAlternative.${key}`);
    for (let step=1;step<=11;step++) for (const suffix of ['Title','Text']) references.add(`guidedStaticLine.step${step}${suffix}`);
    for (const step of [3,4,5,6,7,9,10]) references.add(`guidedStaticLine.step${step}Help`);
    for (const status of ['pending','running','confirmed','failed']) references.add(`guidedStaticLine.verification${status}`);
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
  const html = renderToStaticMarkup(createElement(ThematicHome));
  expect(html).toContain('Bauen.'); expect(html).toContain('Verstehen.');
  for (const name of Object.values(LANGUAGES)) expect(html).toContain(name);
  expect(html).toContain('./app.html?home=new'); expect(html).toContain('./app.html?home=load');
  expect(html).toContain('./app.html?home=exercises'); expect(html).toContain('./app.html?home=labs');
  expect(html).not.toContain('xterm'); expect(html).not.toContain('journey.title');
});
