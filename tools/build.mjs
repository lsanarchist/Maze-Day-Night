/**
 * Creates a single HTML file with all application modules and styles inlined.
 * With npm-installed Three.js it also embeds the official library as data URLs.
 * Without the dependency, uses pinned CDN imports and reports that explicitly.
 * No bundler dependency, network request, eval(), or source-code minification.
 */
import fs from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
const root = fileURLToPath(new URL('../', import.meta.url));
const read = p => fs.readFile(path.join(root, p), 'utf8');
let html = await read('index.html');
const css = await read('src/style.css');
const files = ['day-night.js','core.js','config.js','icons.js','environment.js','canvas-view.js','three-view.js','app.js'];
let code = '';
for (const file of files) {
  const source = (await read(`src/${file}`)).replace(/^import\s.+?;\s*$/gm, '').replace(/^export\s+/gm, '');
  code += `\n// ========== ${file} ==========\n${source}\n`;
}
html = html.replace('<link rel="stylesheet" href="./src/style.css">', `<style>\n${css}\n</style>`);
html = html.replace('<script type="module" src="./src/app.js"></script>', `<script type="module">\n${code.replaceAll('</script', '<\\/script')}\n</script>`);
let offline = false;
try {
  const dataURL = code => `data:text/javascript;base64,${Buffer.from(code).toString('base64')}`;
  const core = dataURL(await read('node_modules/three/build/three.core.js'));
  const module = dataURL((await read('node_modules/three/build/three.module.js')).replaceAll("'./three.core.js'", JSON.stringify(core)));
  const controls = dataURL(await read('node_modules/three/examples/jsm/controls/OrbitControls.js'));
  const license = await read('node_modules/three/LICENSE');
  const imports = {three: module, 'three/addons/controls/OrbitControls.js': controls};
  html = html.replace(/<script type="importmap">[\s\S]*?<\/script>/, `<script type="importmap">${JSON.stringify({imports})}</script>`);
  html = html.replace('</head>', `<!-- Three.js license\n${license.replaceAll('--', '—')}\n-->\n</head>`);
  offline = true;
} catch (error) {
  if (error.code !== 'ENOENT') throw error;
}
await fs.mkdir(path.join(root, 'dist'), {recursive:true});
await fs.writeFile(path.join(root, 'dist/index.html'), html);
console.log(`Built dist/index.html (${Math.round(Buffer.byteLength(html)/1024)} KB).`);
console.log(offline ? 'Three.js embedded: full 2D/3D runs without internet.' : 'Three.js uses CDN: 3D needs internet. Run npm install && npm run build for a fully offline HTML.');
