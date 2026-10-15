/** Zero-dependency local-only development server. Does not expose files above the project. */
import http from 'node:http';
import fs from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
const root = fileURLToPath(new URL('../', import.meta.url));
const port = Number(process.env.PORT || 5173);
const types = {'.html':'text/html; charset=utf-8','.js':'text/javascript; charset=utf-8','.mjs':'text/javascript; charset=utf-8','.css':'text/css; charset=utf-8','.json':'application/json; charset=utf-8','.svg':'image/svg+xml','.png':'image/png','.md':'text/plain; charset=utf-8'};
let localThree = false;
try {await fs.access(path.join(root, 'node_modules/three/build/three.module.js')); localThree = true;} catch {}
const server = http.createServer(async (req, res) => {
  try {
    const url = new URL(req.url, `http://127.0.0.1:${port}`);
    const pathname = decodeURIComponent(url.pathname);
    if (pathname.includes('\0')) throw new Error('Bad path');
    const file = path.resolve(root, '.' + (pathname === '/' ? '/index.html' : pathname));
    if (!file.startsWith(root)) {res.writeHead(403); res.end('Forbidden'); return;}
    let data = await fs.readFile(file);
    if (path.extname(file) === '.html' && localThree) {
      data = Buffer.from(data.toString('utf8').replaceAll('https://cdn.jsdelivr.net/npm/three@0.180.0/', '/node_modules/three/'));
    }
    res.writeHead(200, {'Content-Type': types[path.extname(file)] || 'application/octet-stream', 'Cache-Control':'no-store', 'X-Content-Type-Options':'nosniff'});
    res.end(data);
  } catch {res.writeHead(404, {'Content-Type':'text/plain; charset=utf-8'}); res.end('Not found');}
});
server.on('error', error => {console.error(`Не вдалося запустити сервер: ${error.message}`); process.exitCode = 1;});
server.listen(port, '127.0.0.1', () => console.log(`Maze Lab → http://localhost:${port}\nThree.js: ${localThree ? 'локально (офлайн)' : 'CDN (потрібен інтернет; npm install для офлайн)'}\nCtrl+C — зупинити.`));
