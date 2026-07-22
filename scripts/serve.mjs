// dist/ 정적 사이트를 로컬에서 서빙한다. 의존성 없음.
// 사용: node scripts/serve.mjs [포트]  (기본 5173)

import http from 'node:http';
import { promises as fs } from 'node:fs';
import path from 'node:path';
import zlib from 'node:zlib';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', 'dist');
const port = Number(process.argv[2]) || 5173;

const mime = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.woff2': 'font/woff2',
  '.woff': 'font/woff',
  '.ttf': 'font/ttf',
};
const compressible = new Set(['.html', '.js', '.css', '.json', '.svg']);

const server = http.createServer(async (req, res) => {
  try {
    let urlPath = decodeURIComponent(new URL(req.url, 'http://x').pathname);
    if (urlPath.endsWith('/')) urlPath += 'index.html';
    const filePath = path.join(root, path.normalize(urlPath));
    if (!filePath.startsWith(root)) {
      res.writeHead(403).end();
      return;
    }
    const data = await fs.readFile(filePath);
    const ext = path.extname(filePath).toLowerCase();
    const headers = {
      'Content-Type': mime[ext] ?? 'application/octet-stream',
      'Cache-Control': ext === '.html' ? 'no-cache' : 'public, max-age=31536000, immutable',
    };
    const acceptsGzip = /\bgzip\b/.test(req.headers['accept-encoding'] ?? '');
    if (acceptsGzip && compressible.has(ext)) {
      headers['Content-Encoding'] = 'gzip';
      res.writeHead(200, headers).end(zlib.gzipSync(data));
    } else {
      res.writeHead(200, headers).end(data);
    }
  } catch {
    res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' }).end('404 Not Found');
  }
});

server.listen(port, () => {
  console.log(`SF-POS 정적 사이트: http://localhost:${port}/`);
});
