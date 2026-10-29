// Read-only inventory of candidate user-facing strings. No automatic translation.
import ts from 'typescript';
import { readdir, readFile } from 'node:fs/promises';
import path from 'node:path';
const root = new URL('../', import.meta.url);
async function walk(dir) {
  return (await Promise.all((await readdir(new URL(dir, root), { withFileTypes: true })).map(e => e.isDirectory() ? walk(dir + e.name + '/') : dir + e.name))).flat();
}
function domain(file) {
  if (file.includes('/home/') || file.includes('/i18n/')) return 'Homepage / catálogos';
  if (/src\/exercises\/factory/.test(file)) return 'Fábrica interna';
  if (/src\/exercises/.test(file)) return 'Übungen';
  if (/src\/labs/.test(file)) return 'Labs / exemplos';
  if (/src\/(commands|terminal)|Terminal|terminal/.test(file)) return 'Terminais / CLI';
  if (/src\/(projects|persistence|workspace)/.test(file)) return 'Planos / persistência';
  if (/src\/engine/.test(file)) return 'Engine / protocolos';
  if (/Inspector|IPv4|Dhcp|DHCP|Interface|Routing|Firewall|ArpTable/.test(file)) return 'Inspector / configuração';
  if (/Packet|packet|Ping|ping/.test(file)) return 'Pacotes / diagnóstico';
  if (/Settings|Background|Appearance|uiTheme/.test(file)) return 'Preferências visuais';
  if (/Toolbar|Popover|Palette/.test(file)) return 'Menus / catálogo';
  if (/Flow|DeviceNode|Marking|Clipboard|cable|Cable|Placement|device/.test(file)) return 'Canvas / ferramentas';
  return 'UI / utilitários';
}
const rows = [];
for (const file of (await walk('src/')).sort()) {
  if (!/\.(tsx?|json)$/.test(file) || /\.test\.|\.browser\.|reviewEntry|\.d\.ts$/.test(file)) continue;
  const source = await readFile(new URL(file, root), 'utf8'), strings = [];
  const candidate = text => /\p{L}{3}/u.test(text) && !/^(?:[.#]|https?:|data:)/.test(text) && !/^[a-zA-Z0-9_:/.-]+$/.test(text);
  if (file.endsWith('.json')) {
    const visit = value => { if (typeof value === 'string' && candidate(value)) strings.push(value); else if (Array.isArray(value)) value.forEach(visit); else if (value && typeof value === 'object') Object.values(value).forEach(visit); };
    visit(JSON.parse(source));
  } else {
    const ast = ts.createSourceFile(file, source, ts.ScriptTarget.Latest, true);
    const visit = node => {
      if ((ts.isJsxText(node) && /\p{L}{3}/u.test(node.text)) || ((ts.isStringLiteral(node) || ts.isNoSubstitutionTemplateLiteral(node) || ts.isTemplateHead(node) || ts.isTemplateMiddle(node) || ts.isTemplateTail(node)) && candidate(node.text))) strings.push(node.text.trim());
      ts.forEachChild(node, visit);
    };
    visit(ast);
  }
  if (strings.length) rows.push({ file, module: domain(file), candidates: new Set(strings).size });
}
const totals = {};
for (const row of rows) totals[row.module] = (totals[row.module] ?? 0) + row.candidates;
console.log(JSON.stringify({ method: 'Unique literal/JSX/template candidates per file; excludes tests, URLs and identifier-only strings. Heuristic, not translation-key totals. JSON includes pedagogy, not permission to change it.', totals, files: rows }, null, 2));
