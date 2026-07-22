// index.html(단일 번들)을 dist/ 정적 사이트로 풀어낸다.
//
// 단일 index.html은 폰트·JS를 gzip+base64 매니페스트로 인라인하고 브라우저에서
// 풀어내는 구조라 첫 로드가 느리다. 이 스크립트는 같은 내용을 빌드 타임에
// 개별 파일(assets/)로 풀어 템플릿 HTML을 그대로 dist/index.html로 쓴다.
// 마크업·스타일·스크립트 내용은 변경하지 않는다 — 리소스 참조 경로만 바뀐다.
//
// 사용: node scripts/build-static-site.mjs  (출력: dist/)

import { promises as fs } from 'node:fs';
import path from 'node:path';
import zlib from 'node:zlib';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const outDir = path.join(root, 'dist');

const html = await fs.readFile(path.join(root, 'index.html'), 'utf8');

function block(type) {
  const m = html.match(
    new RegExp(`<script type="__bundler/${type}">([\\s\\S]*?)</script>`)
  );
  if (!m) throw new Error(`__bundler/${type} 블록을 찾지 못했습니다`);
  return JSON.parse(m[1]);
}

const manifest = block('manifest');
const extResources = block('ext_resources');
let template = block('template');

await fs.rm(outDir, { recursive: true, force: true });
await fs.mkdir(path.join(outDir, 'assets', 'fonts'), { recursive: true });
await fs.mkdir(path.join(outDir, 'assets', 'vendor'), { recursive: true });

// ---------------------------------------------------------------------------
// 자산 이름 결정
// ---------------------------------------------------------------------------
const extForMime = {
  'text/javascript': '.js',
  'font/woff2': '.woff2',
  'font/woff': '.woff',
  'font/ttf': '.ttf',
  'image/jpeg': '.jpg',
  'image/png': '.png',
  'image/svg+xml': '.svg',
};

// @font-face 블록에서 uuid → 읽기 좋은 폰트 파일명 유도
const fontNames = {};
for (const ff of template.match(/@font-face\s*{[^}]*}/g) ?? []) {
  const family = ff.match(/font-family:\s*"?([^;"}]+)"?/)?.[1]?.trim();
  const weight = ff.match(/font-weight:\s*(\d+)/)?.[1];
  for (const [, uuid, format] of ff.matchAll(
    /url\("([0-9a-f-]{36})"\)\s*format\(["']?(\w+)["']?\)/g
  )) {
    const ext = { woff2: '.woff2', woff: '.woff', truetype: '.ttf' }[format] ?? '';
    const base = [family?.toLowerCase().replace(/\s+/g, '-'), weight]
      .filter(Boolean)
      .join('-');
    fontNames[uuid] = `${base}${ext}`;
  }
}

const extByUuid = Object.fromEntries(extResources.map((e) => [e.uuid, e.id]));

function assetPathFor(uuid, mime) {
  if (fontNames[uuid]) return `assets/fonts/${fontNames[uuid]}`;
  const extUrl = extByUuid[uuid];
  if (extUrl) return `assets/vendor/${path.posix.basename(new URL(extUrl).pathname)}`;
  const ext = extForMime[mime] ?? '';
  return `assets/${uuid.slice(0, 8)}${ext}`;
}

// ---------------------------------------------------------------------------
// 매니페스트 자산을 파일로 쓰고 템플릿의 uuid 참조를 경로로 치환
// ---------------------------------------------------------------------------
const written = [];
let runtimePath = null;
for (const [uuid, entry] of Object.entries(manifest)) {
  let bytes = Buffer.from(entry.data, 'base64');
  if (entry.compressed) bytes = zlib.gunzipSync(bytes);

  let rel = assetPathFor(uuid, entry.mime);
  if (
    entry.mime === 'text/javascript' &&
    !extByUuid[uuid] &&
    template.includes(`src="${uuid}"`)
  ) {
    rel = 'assets/dc-runtime.js';
    runtimePath = rel;
  }
  await fs.writeFile(path.join(outDir, rel), bytes);
  written.push({ rel, size: bytes.length });
  template = template.split(uuid).join(rel);
}

// ---------------------------------------------------------------------------
// 인라인 base64 이미지(1MB+)를 파일로 추출
// ---------------------------------------------------------------------------
let imgIndex = 0;
template = template.replace(
  /data:(image\/(?:jpeg|png));base64,([A-Za-z0-9+/=]{10000,})/g,
  (_, mime, b64) => {
    const rel = `assets/inline-${imgIndex++}${extForMime[mime]}`;
    const bytes = Buffer.from(b64, 'base64');
    fs.writeFile(path.join(outDir, rel), bytes);
    written.push({ rel, size: bytes.length });
    return rel;
  }
);

// ---------------------------------------------------------------------------
// dc-runtime이 CDN 대신 로컬 vendor 파일을 쓰도록 __resources 주입
// (원본 로더가 런타임에 주입하던 것과 동일한 매핑)
// ---------------------------------------------------------------------------
const resourceMap = {};
for (const e of extResources) {
  const entry = manifest[e.uuid];
  if (entry) resourceMap[e.id] = assetPathFor(e.uuid, entry.mime);
}
const resourcesScript = `<script>window.__resources = ${JSON.stringify(
  resourceMap
).replaceAll('</script>', '<\\/script>')};</script>`;

const headOpen = template.match(/<head[^>]*>/i);
if (!headOpen) throw new Error('템플릿에서 <head>를 찾지 못했습니다');
const insertAt = headOpen.index + headOpen[0].length;
template =
  template.slice(0, insertAt) + resourcesScript + template.slice(insertAt);

await fs.writeFile(path.join(outDir, 'index.html'), template);

const total = written.reduce((s, w) => s + w.size, 0);
console.log(`dist/index.html  ${(Buffer.byteLength(template) / 1e6).toFixed(2)} MB`);
for (const w of written.sort((a, b) => b.size - a.size)) {
  console.log(`dist/${w.rel}  ${(w.size / 1e3).toFixed(0)} KB`);
}
console.log(`자산 ${written.length}개, 총 ${(total / 1e6).toFixed(1)} MB`);
if (!runtimePath) console.warn('경고: dc-runtime 스크립트를 식별하지 못했습니다');
