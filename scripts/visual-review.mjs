import { createHash } from 'node:crypto';
import { execFile } from 'node:child_process';
import { readFile, writeFile, mkdir, access, readdir, rename, lstat } from 'node:fs/promises';
import { promisify } from 'node:util';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const reviewsRoot = path.join(projectRoot, '.playwright-mcp', 'reviews');
const slug = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const escape = value => String(value).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const key = capture => `${capture.scene}|${capture.state}|${capture.width}x${capture.height}`;
const json = value => JSON.stringify(value).replace(/</g, '\\u003c');

function assert(condition, message) { if (!condition) throw new Error(message); }
function inside(root, target) {
  const relative = path.relative(root, target);
  return relative !== '' && !relative.startsWith('..' + path.sep) && relative !== '..' && !path.isAbsolute(relative);
}
async function absent(target) {
  try { await access(target); } catch (error) { if (error.code === 'ENOENT') return; throw error; }
  throw new Error(`Already exists; use a new review ID to preserve previous artifacts: ${target}`);
}
function pngSize(bytes, source) {
  assert(bytes.length >= 24 && bytes.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10])) && bytes.toString('ascii', 12, 16) === 'IHDR', `Not a PNG: ${source}`);
  return { width: bytes.readUInt32BE(16), height: bytes.readUInt32BE(20) };
}

function dateStamp() {
  return new Intl.DateTimeFormat('sv-SE', { timeZone: 'Europe/Berlin', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date());
}
async function exists(target) {
  try { await access(target); return true; } catch (error) { if (error.code === 'ENOENT') return false; throw error; }
}
async function newDirectory(parent, name) {
  await mkdir(parent, { recursive: true });
  for (let i = 1; ; i++) {
    const target = path.join(parent, name + (i === 1 ? '' : `--${String(i).padStart(2, '0')}`));
    try { await mkdir(target); return target; } catch (error) { if (error.code !== 'EEXIST') throw error; }
  }
}
async function moveWithin(root, source, target) {
  // Check final absolute paths before every Windows file/directory move.
  assert(inside(root, path.resolve(source)) && inside(root, path.resolve(target)), 'Archive move must stay inside the reviews folder');
  const sourceInfo = await lstat(source);
  assert(!sourceInfo.isSymbolicLink(), 'Do not move symbolic links as review artifacts');
  await absent(target);
  try { await rename(source, target); }
  catch (error) {
    if (process.platform !== 'win32' || error.code !== 'EPERM' || !sourceInfo.isDirectory()) throw error;
    // Native Move-Item handles Windows directory ACL cases rejected by rename.
    // Fixed command + literal env paths: no path interpolation or cmd/batch.
    await promisify(execFile)('powershell.exe', ['-NoProfile', '-NonInteractive', '-Command',
      'Move-Item -LiteralPath $env:NETLAB_REVIEW_MOVE_SOURCE -Destination $env:NETLAB_REVIEW_MOVE_TARGET -ErrorAction Stop'],
    { windowsHide: true, env: { ...process.env, NETLAB_REVIEW_MOVE_SOURCE: source, NETLAB_REVIEW_MOVE_TARGET: target } });
  }
}
function captureScript(directory, review) {
  const options = { htmlUrl: pathToFileURL(path.join(directory, 'contact-sheet.html')).href, pngUrl: pathToFileURL(path.join(directory, 'contact-sheet.png')).href, pngPath: path.join(directory, 'contact-sheet.png'), width: review.sheetWidth, captures: review.captures.length, uniqueImages: review.uniqueImages };
  return `async (page) => {\n  const render = ${renderContactSheet.toString()};\n  return await render(page, ${json(options)});\n}\n`;
}
function selectedCaptures(review) {
  if (review.share !== undefined) {
    assert(Array.isArray(review.share) && review.share.length > 0, 'share must select at least one capture');
    return review.share.map(selection => {
      const capture = review.captures.find(c => c.variant === selection.variant && key(c) === key({ ...selection, scene: selection.scene ?? review.scene ?? 'main' }));
      assert(capture, `No capture matches share selection: ${JSON.stringify(selection)}`);
      if (selection.name !== undefined) assert(slug.test(selection.name), 'Share names must use lowercase words separated by hyphens');
      return { ...capture, shareName: selection.name };
    });
  }
  // A small useful default: one highest-resolution selected view per variant.
  return review.variants.map(v => review.captures.filter(c => c.variant === v.id)
    .sort((a, b) => Number(b.state === 'selected') - Number(a.state === 'selected') || b.width - a.width || b.height - a.height)[0]).filter(Boolean);
}

/** Publish only curated PNGs. Old share files and their raw review are archived. */
export async function publishReview(reviewDirectory, { root = reviewsRoot } = {}) {
  root = path.resolve(root);
  let directory = path.resolve(projectRoot, reviewDirectory);
  assert(inside(root, directory) && directory !== path.join(root, 'raw') && directory !== path.join(root, 'archive') && !inside(path.join(root, 'archive'), directory), 'Publish a raw/legacy review inside the reviews folder');
  assert(!(await lstat(directory)).isSymbolicLink(), 'Review directory cannot be a symbolic link');
  const review = JSON.parse(await readFile(path.join(directory, 'review.json'), 'utf8'));
  assert(slug.test(review.id), 'Invalid review ID');
  const selections = selectedCaptures(review);
  const files = [], hashes = new Set();
  for (const capture of selections) {
    assert(typeof capture.file === 'string' && path.basename(capture.file) === capture.file, 'Invalid capture filename');
    const bytes = await readFile(path.join(directory, 'captures', capture.file));
    pngSize(bytes, capture.file);
    const hash = createHash('sha256').update(bytes).digest('hex');
    if (hashes.has(hash)) continue;
    hashes.add(hash);
    const name = capture.shareName ?? `${capture.variant}-${capture.state}-${capture.width}x${capture.height}`;
    files.push({ name: `${String(files.length + 1).padStart(2, '0')}-${name}.png`, bytes });
  }
  if (review.shareContactSheet !== false && await exists(path.join(directory, 'contact-sheet.png'))) {
    const bytes = await readFile(path.join(directory, 'contact-sheet.png'));
    pngSize(bytes, 'contact-sheet.png');
    files.push({ name: 'contact-sheet.png', bytes });
  }
  // Validate/read all selected files before moving anything from a prior review.
  const rawRoot = path.join(root, 'raw'), statePath = path.join(rawRoot, 'current.json');
  await mkdir(rawRoot, { recursive: true });
  if (!inside(rawRoot, directory)) {
    assert(path.dirname(directory) === root, 'Legacy review must be directly inside reviews/');
    const destination = path.join(rawRoot, `${dateStamp()}--${review.id}`);
    await moveWithin(root, directory, destination);
    directory = destination;
  }
  // Only this derived renderer has machine-specific paths; PNGs/HTML stay intact.
  await writeFile(path.join(directory, 'capture-contact-sheet.js'), captureScript(directory, review));
  let current = null;
  if (await exists(statePath)) current = JSON.parse(await readFile(statePath, 'utf8'));
  const relativeDirectory = path.relative(root, directory).split(path.sep).join('/');
  const sameReview = current?.directory === relativeDirectory;
  if (!sameReview) {
    const previousPngs = (await readdir(root, { withFileTypes: true })).filter(e => e.isFile() && /\.png$/i.test(e.name));
    const previousRaw = current?.directory ? path.resolve(root, current.directory) : null;
    if (previousRaw) assert(inside(rawRoot, previousRaw) && previousRaw !== directory, 'Previous raw review must remain inside raw/');
    if (previousPngs.length || (previousRaw && await exists(previousRaw))) {
      const date = /^\d{4}-\d{2}-\d{2}$/.test(current?.date ?? '') ? current.date : dateStamp();
      const archive = await newDirectory(path.join(root, 'archive'), `${date}--${slug.test(current?.id ?? '') ? current.id : 'previous-review'}`);
      for (const file of previousPngs) await moveWithin(root, path.join(root, file.name), path.join(archive, file.name));
      if (previousRaw && await exists(previousRaw)) await moveWithin(root, previousRaw, path.join(archive, 'review'));
      if (current) await writeFile(path.join(archive, 'publication.json'), JSON.stringify(current, null, 2) + '\n', { flag: 'wx' });
    }
  }
  await mkdir(path.join(root, 'archive'), { recursive: true });
  for (const file of files) {
    const target = path.join(root, file.name);
    if (sameReview && await exists(target)) {
      assert((await readFile(target)).equals(file.bytes), `Share PNG changed; create a new review instead of overwriting: ${file.name}`);
    } else await writeFile(target, file.bytes, { flag: 'wx' });
  }
  await writeFile(statePath, JSON.stringify({ id: review.id, date: sameReview ? current.date : dateStamp(), directory: relativeDirectory, files: files.map(f => f.name) }, null, 2) + '\n');
  return { folder: root, readyPngs: files.length, files: files.map(f => f.name), raw: directory };
}

const styles = `
*{box-sizing:border-box}body{margin:0;background:#11171e;color:#e4ebf3;font:14px/1.5 system-ui,sans-serif}a{color:#8fd5ff}button,select{font:inherit;color:inherit;background:#253342;border:1px solid #5b738b;border-radius:6px;padding:7px 10px;cursor:pointer}button:focus-visible,a:focus-visible,select:focus-visible{outline:3px solid #68d5ff;outline-offset:2px}header,main{max-width:1800px;margin:auto;padding:24px}header{border-bottom:1px solid #354555}h1{font-size:26px;margin:0 0 6px}h2{font-size:18px;margin:0 0 14px}h3{font-size:15px;margin:0}.muted{color:#b0c0d0}.tools{display:flex;gap:16px;flex-wrap:wrap;align-items:end;margin-top:18px}.tools label{display:grid;gap:5px}nav{display:flex;gap:16px;flex-wrap:wrap;margin-top:16px}.comparison{margin-bottom:30px;scroll-margin-top:12px}.pair{display:grid;grid-template-columns:repeat(var(--columns),minmax(0,1fr));gap:16px}figure{margin:0;min-width:0;padding:12px;border:1px solid #3a4d60;border-radius:9px;background:#1b252f}figcaption{margin-bottom:10px}.preview{display:block;width:100%;padding:0;border:0;background:transparent;cursor:zoom-in}.preview img{display:block;width:100%;height:auto;border-radius:4px}figure>a{display:inline-block;margin-top:8px}.empty{padding:24px;border:1px dashed #52697e}dialog{width:calc(100vw - 32px);max-width:1800px;max-height:calc(100vh - 32px);padding:14px;border:1px solid #6e8ba5;border-radius:10px;color:#e4ebf3;background:#17212b}dialog::backdrop{background:#000c}.viewer-tools{display:flex;align-items:center;gap:10px;flex-wrap:wrap;margin-bottom:12px}.viewer-tools strong{margin-right:auto}.viewer-image{overflow:auto;max-height:calc(100vh - 160px);text-align:center}.viewer-image img{display:block;max-width:100%;height:auto;margin:auto;cursor:zoom-in}.viewer-image.is-original img{max-width:none;cursor:zoom-out}[hidden]{display:none!important}.sheet{padding:24px}.sheet h2{margin:20px 0 8px}.sheet figure{text-align:center;padding:12px}.sheet figcaption{text-align:left}.crop{position:relative;overflow:hidden;margin:auto;background:#0b1017}.crop img{position:absolute;max-width:none}.sheet footer{margin-top:20px;color:#b0c0d0}@media(max-width:760px){.pair{grid-template-columns:1fr}header,main{padding:16px}}
`;

function groups(review) {
  const result = new Map();
  for (const capture of review.captures) {
    if (!result.has(key(capture))) result.set(key(capture), []);
    result.get(key(capture)).push(capture);
  }
  return [...result.values()].sort((a, b) => a[0].scene.localeCompare(b[0].scene)
    || b[0].width - a[0].width || b[0].height - a[0].height
    || review.states.indexOf(a[0].state) - review.states.indexOf(b[0].state));
}
function imageUrl(capture) { return `captures/${encodeURIComponent(capture.file)}`; }
function caption(review, capture) {
  return `${review.variants.find(v => v.id === capture.variant).label} · ${capture.scene} · ${capture.state} · ${capture.width} × ${capture.height}`;
}
function page(title, body, script = '') {
  return `<!doctype html><html lang="pt-BR"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${escape(title)}</title><style>${styles}</style><body>${body}${script}</body></html>`;
}

function gallery(review) {
  const grouped = groups(review);
  const options = values => values.map(v => `<option value="${escape(v)}">${escape(v)}</option>`).join('');
  const sections = grouped.map((captures, index) => {
    const first = captures[0];
    return `<section id="comparison-${index}" class="comparison" data-scene="${first.scene}" data-state="${first.state}" data-resolution="${first.width}x${first.height}"><h2>${escape(first.scene)} · ${escape(first.state)} · ${first.width} × ${first.height}</h2><div class="pair" style="--columns:${review.variants.length}">${review.variants.map(variant => {
      const capture = captures.find(c => c.variant === variant.id);
      if (!capture) return `<figure data-variant="${variant.id}"><h3>${escape(variant.label)}</h3><p>Sem captura correspondente.</p></figure>`;
      const label = caption(review, capture);
      return `<figure data-variant="${variant.id}"><figcaption><h3>${escape(variant.label)}</h3><span class="muted">${escape(first.state)} · ${first.width} × ${first.height}</span></figcaption><button type="button" class="preview" data-capture="${capture.index}" aria-label="Ampliar ${escape(label)}"><img src="${imageUrl(capture)}" alt="${escape(label)}" width="${capture.width}" height="${capture.height}" loading="lazy"></button><a href="${imageUrl(capture)}" target="_blank" rel="noopener">Abrir PNG original</a></figure>`;
    }).join('')}</div></section>`;
  }).join('');
  const body = `<header><h1>${escape(review.title)}</h1><p class="muted">${review.captures.length} capturas · ${review.uniqueImages} PNGs únicos · originais preservados</p><p>${escape(review.description ?? '')}</p><nav><a href="contact-sheet.png">Contact sheet PNG</a><a href="contact-sheet.html">Contact sheet HTML</a><a href="review.json">Manifesto</a></nav><div class="tools"><label>Variante<select id="variant"><option value="">A/B lado a lado</option>${review.variants.map(v => `<option value="${v.id}">${escape(v.label)}</option>`).join('')}</select></label><label>Estado<select id="state"><option value="">Todos</option>${options(review.states)}</select></label><label>Resolução<select id="resolution"><option value="">Todas</option>${options([...new Set(review.captures.map(c => `${c.width}x${c.height}`))])}</select></label><label>Cena<select id="scene"><option value="">Todas</option>${options([...new Set(review.captures.map(c => c.scene))])}</select></label><button id="reset" type="button">Limpar filtros</button><output id="count" aria-live="polite"></output></div><nav aria-label="Comparações">${grouped.map((g,i) => `<a href="#comparison-${i}">${escape(g[0].state)} · ${g[0].width} × ${g[0].height}</a>`).join('')}</nav></header><main>${sections}<p class="empty" id="empty" hidden>Nenhuma captura com estes filtros.</p></main><dialog id="viewer" aria-labelledby="viewer-title"><div class="viewer-tools"><strong id="viewer-title"></strong><button id="previous" type="button" aria-label="Imagem anterior">← Anterior</button><button id="next" type="button" aria-label="Próxima imagem">Próxima →</button><label><input id="original" type="checkbox"> Tamanho original</label><button id="close" type="button" autofocus>Fechar · Esc</button></div><div class="viewer-image"><img id="large" alt=""></div></dialog>`;
  const script = `<script>
const captures=${json(review.captures.map(c => ({ url: imageUrl(c), title: caption(review, c) })))};
const filters=['variant','state','resolution','scene'].map(id=>document.getElementById(id));
const sections=[...document.querySelectorAll('.comparison')];
function filter(){let count=0;const[v,s,r,c]=filters.map(e=>e.value);for(const section of sections){section.hidden=!!((s&&section.dataset.state!==s)||(r&&section.dataset.resolution!==r)||(c&&section.dataset.scene!==c));for(const figure of section.querySelectorAll('figure')){figure.hidden=!!v&&figure.dataset.variant!==v;if(!section.hidden&&!figure.hidden&&figure.querySelector('.preview'))count++;}section.querySelector('.pair').style.setProperty('--columns',v?'1':'${review.variants.length}');}document.getElementById('count').textContent=count+' capturas visíveis';document.getElementById('empty').hidden=count>0;}
filters.forEach(e=>e.addEventListener('change',filter));document.getElementById('reset').onclick=()=>{filters.forEach(e=>e.value='');filter();};filter();
const dialog=document.getElementById('viewer'),large=document.getElementById('large'),original=document.getElementById('original');let current=0,opener;
function show(index){current=index;large.src=captures[index].url;large.alt=captures[index].title;document.getElementById('viewer-title').textContent=captures[index].title;original.checked=false;large.parentElement.classList.remove('is-original');}
function step(direction){const ids=[...document.querySelectorAll('.comparison:not([hidden]) figure:not([hidden]) .preview')].map(e=>Number(e.dataset.capture));show(ids[(ids.indexOf(current)+direction+ids.length)%ids.length]);}
document.querySelectorAll('.preview').forEach(e=>e.onclick=()=>{opener=e;show(Number(e.dataset.capture));dialog.showModal();});document.getElementById('close').onclick=()=>dialog.close();dialog.addEventListener('close',()=>opener?.focus());document.getElementById('previous').onclick=()=>step(-1);document.getElementById('next').onclick=()=>step(1);dialog.addEventListener('keydown',e=>{if(e.key==='ArrowRight'||e.key==='ArrowLeft'){e.preventDefault();step(e.key==='ArrowRight'?1:-1);}});original.onchange=()=>large.parentElement.classList.toggle('is-original',original.checked);large.onclick=()=>{original.checked=!original.checked;original.onchange();};
</script>`;
  return page(review.title, body, script);
}

function contactSheet(review) {
  const comparisons = review.contactSheet ?? groups(review).map(g => ({ scene: g[0].scene, state: g[0].state, width: g[0].width, height: g[0].height }));
  const maxWidth = (review.sheetWidth - 48 - 24 * (review.variants.length - 1)) / review.variants.length - 24;
  const rows = comparisons.map(comparison => {
    const captures = review.captures.filter(c => key(c) === key(comparison));
    assert(captures.length, `Contact sheet has no matching capture: ${key(comparison)}`);
    const crop = comparison.crop ?? { x: 0, y: 0, width: comparison.width, height: comparison.height };
    assert(['x','y','width','height'].every(k => Number.isInteger(crop[k])) && crop.x >= 0 && crop.y >= 0 && crop.width > 0 && crop.height > 0 && crop.x + crop.width <= comparison.width && crop.y + crop.height <= comparison.height, 'Contact sheet crop is outside its screenshot');
    const scale = Math.min(maxWidth / crop.width, comparison.crop ? 1.6 : 1);
    return `<section><h2>${escape(comparison.label ?? `${comparison.scene} · ${comparison.state} · ${comparison.width} × ${comparison.height}`)}</h2><div class="pair" style="--columns:${review.variants.length}">${review.variants.map(v => {
      const c = captures.find(c => c.variant === v.id);
      return `<figure><figcaption><strong>${escape(v.label)}</strong> · ${escape(comparison.state)} · ${comparison.width}px${comparison.crop ? ' · detalhe' : ''}</figcaption>${c ? `<div class="crop" style="width:${crop.width * scale}px;height:${crop.height * scale}px"><img src="${imageUrl(c)}" alt="${escape(caption(review,c))}" style="width:${c.width * scale}px;height:${c.height * scale}px;left:${-crop.x * scale}px;top:${-crop.y * scale}px"></div>` : '<p>Sem captura.</p>'}</figure>`;
    }).join('')}</div></section>`;
  }).join('');
  return page(`${review.title} — Contact sheet`, `<main class="sheet" style="width:${review.sheetWidth}px"><h1>${escape(review.title)}</h1><div class="muted">${review.captures.length} capturas · ${review.uniqueImages} PNGs únicos · detalhes recortados apenas nesta composição</div>${rows}<footer>Galeria completa: index.html · ${escape(review.id)} · capturas reais do Chromium</footer></main>`);
}

/** Generate portable, offline HTML and deduplicated PNG copies. Never overwrite. */
export async function generateReview(manifestFile, overrideId, { root = reviewsRoot } = {}) {
  root = path.resolve(root);
  const input = JSON.parse(await readFile(manifestFile, 'utf8'));
  const id = overrideId ?? input.id;
  assert(slug.test(id), 'Review ID must use lowercase words separated by hyphens');
  assert(typeof input.title === 'string' && input.title.trim(), 'Review title is required');
  assert(Array.isArray(input.variants) && input.variants.length > 0 && input.variants.length <= 4 && input.variants.every(v => slug.test(v.id) && typeof v.label === 'string') && new Set(input.variants.map(v => v.id)).size === input.variants.length, 'Supply 1–4 unique variants');
  const states = input.states ?? ['normal', 'hover', 'selected'];
  assert(Array.isArray(states) && states.every(s => slug.test(s)) && new Set(states).size === states.length, 'States must be unique slugs');
  assert(Array.isArray(input.captures) && input.captures.length, 'At least one capture is required');
  const seen = new Set(), assets = new Map(), captures = [];
  for (const capture of input.captures) {
    const scene = capture.scene ?? input.scene ?? 'main';
    assert(slug.test(scene) && states.includes(capture.state) && input.variants.some(v => v.id === capture.variant), 'Invalid capture scene, state or variant');
    assert(typeof capture.source === 'string' && /\.png$/i.test(capture.source), 'Capture source must be a PNG path relative to the project');
    const source = path.resolve(projectRoot, capture.source);
    assert(inside(projectRoot, source), 'Capture source must stay inside the project');
    const bytes = await readFile(source);
    const size = pngSize(bytes, source);
    assert(size.width === capture.width && size.height === capture.height, `Wrong dimensions for ${capture.source}: actual ${size.width}x${size.height}`);
    const normalized = { ...capture, scene, index: captures.length };
    const identity = `${key(normalized)}|${capture.variant}`;
    assert(!seen.has(identity), `Duplicate capture identity: ${identity}`);
    seen.add(identity);
    const hash = createHash('sha256').update(bytes).digest('hex');
    if (!assets.has(hash)) assets.set(hash, { bytes, captures: [] });
    assets.get(hash).captures.push(normalized);
    normalized.sha256 = hash;
    captures.push(normalized);
  }
  const filenames = new Set();
  for (const asset of assets.values()) {
    const first = asset.captures[0];
    const variant = asset.captures.length > 1 ? 'shared' : first.variant;
    const file = `${first.scene}--${variant}--${first.state}--${first.width}x${first.height}.png`;
    assert(!filenames.has(file), `Filename collision: ${file}`);
    filenames.add(file);
    for (const capture of asset.captures) capture.file = file;
  }
  const review = { schemaVersion: 1, ...input, id, states, sheetWidth: input.sheetWidth ?? 1280, captures, uniqueImages: assets.size };
  assert(Number.isInteger(review.sheetWidth) && review.sheetWidth >= 900 && review.sheetWidth <= 2400, 'sheetWidth must be 900–2400');
  // Validate all content/crops before creating output files.
  const indexHtml = gallery(review), sheetHtml = contactSheet(review);
  selectedCaptures(review); // Reject invalid curation before creating output.
  const directory = await newDirectory(path.join(root, 'raw'), `${dateStamp()}--${id}`);
  await mkdir(path.join(directory, 'captures'));
  for (const asset of assets.values()) await writeFile(path.join(directory, 'captures', asset.captures[0].file), asset.bytes, { flag: 'wx' });
  for (const [file, content] of [['index.html', indexHtml], ['contact-sheet.html', sheetHtml], ['capture-contact-sheet.js', captureScript(directory, review)], ['review.json', JSON.stringify(review, null, 2) + '\n']]) await writeFile(path.join(directory, file), content, { flag: 'wx' });
  const publication = await publishReview(directory, { root });
  return { ...publication, captures: captures.length, uniqueImages: assets.size, index: path.join(directory, 'index.html'), captureScript: path.join(directory, 'capture-contact-sheet.js') };
}

// Self-contained so the browser tool can run its generated function file even
// in a sandbox without Node imports. Only standard Playwright page APIs used.
export async function renderContactSheet(page, options) {
  const sheet = await page.context().newPage();
  try {
    try {
      await sheet.goto(options.pngUrl);
      throw new Error('Contact sheet already exists; generate a new review ID to preserve it.');
    } catch (error) {
      if (!String(error).includes('ERR_FILE_NOT_FOUND')) throw error;
    }
    await sheet.setViewportSize({ width: options.width, height: 900 });
    await sheet.goto(options.htmlUrl);
    await sheet.evaluate(async () => { await document.fonts.ready; await Promise.all([...document.images].map(image => image.decode())); });
    const dimensions = await sheet.evaluate(() => ({ width: document.documentElement.scrollWidth, height: document.documentElement.scrollHeight }));
    if (dimensions.width !== options.width) throw new Error('Contact sheet has unexpected horizontal overflow');
    await sheet.screenshot({ path: options.pngPath, fullPage: true, animations: 'disabled' });
    return { path: options.pngPath, ...dimensions, captures: options.captures, uniqueImages: options.uniqueImages };
  } finally { await sheet.close(); }
}

/** Optional local Node caller; the browser tool uses the generated JS file. */
export async function captureContactSheet(page, reviewDirectory) {
  const directory = path.resolve(projectRoot, reviewDirectory);
  assert(inside(reviewsRoot, directory), 'Contact sheet must belong to a reviews directory');
  const target = path.join(directory, 'contact-sheet.png');
  await absent(target);
  const review = JSON.parse(await readFile(path.join(directory, 'review.json'), 'utf8'));
  return renderContactSheet(page, { htmlUrl: pathToFileURL(path.join(directory, 'contact-sheet.html')).href, pngUrl: pathToFileURL(target).href, pngPath: target, width: review.sheetWidth, captures: review.captures.length, uniqueImages: review.uniqueImages });
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const [manifest, option, overrideId] = process.argv.slice(2);
  if (!manifest || (manifest === '--publish' ? !option || overrideId : option && (option !== '--id' || !overrideId))) {
    process.stderr.write('Usage: node scripts/visual-review.mjs manifest.json [--id review-id]\n       node scripts/visual-review.mjs --publish raw-review-directory\n');
    process.exitCode = 1;
  } else {
    try { process.stdout.write(JSON.stringify(manifest === '--publish' ? await publishReview(option) : await generateReview(path.resolve(manifest), overrideId), null, 2) + '\n'); }
    catch (error) { process.stderr.write(error.message + '\n'); process.exitCode = 1; }
  }
}
