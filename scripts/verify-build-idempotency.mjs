import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const targetPath = path.join(root, 'index.html');
if (!fs.existsSync(targetPath)) throw new Error('파일을 찾을 수 없습니다: index.html');
const buildPath = path.join(root, 'scripts', 'build-unified-html.mjs');
const hash = () => crypto.createHash('sha256').update(fs.readFileSync(targetPath)).digest('hex');
const runBuild = () => {
  const result = spawnSync(process.execPath, [buildPath], { cwd: root, encoding: 'utf8' });
  if (result.status !== 0) throw new Error(result.stderr || result.stdout || '통합 빌드 실패');
};

const before = hash();
runBuild();
const afterFirstBuild = hash();
runBuild();
const afterSecondBuild = hash();

if (before !== afterFirstBuild || afterFirstBuild !== afterSecondBuild) {
  throw new Error('통합 빌드를 반복 실행하면 결과 파일이 달라집니다.');
}

console.log(`idempotent build: ok (${before.slice(0, 12)})`);
