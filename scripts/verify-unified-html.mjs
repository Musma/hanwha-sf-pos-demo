import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const targetName = '의장 주간작업계획 수립.html';
const target = fs.readdirSync(root).find((file) => file.normalize('NFC') === targetName);

if (!target) throw new Error(`파일을 찾을 수 없습니다: ${targetName}`);

const bundle = fs.readFileSync(path.join(root, target), 'utf8');
const templateMatch = bundle.match(/<script type="__bundler\/template">\s*([\s\S]*?)\s*<\/script>/);
if (!templateMatch) throw new Error('번들 템플릿을 찾을 수 없습니다.');

const template = JSON.parse(templateMatch[1]);
const componentMatch = template.match(
  /<script type="text\/x-dc" data-dc-script="">\s*(class Component extends DCLogic[\s\S]*?)<\/script>/,
);
if (!componentMatch) throw new Error('통합 컴포넌트를 찾을 수 없습니다.');

new Function(`class DCLogic {}\n${componentMatch[1]}`);

const required = [
  '<!-- unified-navigation:start -->',
  '{{ wfGroups }}',
  '{{ wfRows }}',
  '{{ detailRows }}',
  'data-route="workfront-detail"',
  "view: ['workfront-main', 'workfront-detail']",
  "label === '의장 주간작업계획 수립'",
  "label === '워크프론트 점검'",
  "? 'chair'",
  "? 'workfront-main'",
];

for (const token of required) {
  if (!template.includes(token)) throw new Error(`필수 바인딩이 없습니다: ${token}`);
}

const routeMarkupCount = (template.match(/data-route=/g) || []).length;
const componentCount = (template.match(/class Component extends DCLogic/g) || []).length;
const navigationBlockCount = (template.match(/unified-navigation:start/g) || []).length;

if (routeMarkupCount !== 2) throw new Error(`라우트 마크업 수가 올바르지 않습니다: ${routeMarkupCount}`);
if (componentCount !== 1) throw new Error(`컴포넌트 수가 올바르지 않습니다: ${componentCount}`);
if (navigationBlockCount !== 1) throw new Error(`통합 화면 블록 수가 올바르지 않습니다: ${navigationBlockCount}`);
if (template.includes('buildSideItems() };')) throw new Error('잘못 중복된 사이드바 메서드가 있습니다.');

class MockLogic {
  setState(update) {
    const next = typeof update === 'function' ? update(this.state) : update;
    this.state = { ...this.state, ...next };
  }
}

const windowMock = {
  location: { hash: '', href: 'https://example.test/sf-pos.html' },
  history: {
    pushState(_state, _title, url) {
      const next = new URL(String(url));
      windowMock.location.href = next.href;
      windowMock.location.hash = next.hash;
    },
  },
  addEventListener() {},
  removeEventListener() {},
};

const Component = new Function(
  'DCLogic',
  'window',
  `${componentMatch[1]}\nreturn Component;`,
)(MockLogic, windowMock);
const app = new Component();

let values = app.renderVals();
const enabledRoutes = values.sideItems.filter((item) => item.route).map((item) => item.route);
if (enabledRoutes.join(',') !== 'chair,workfront-main') {
  throw new Error(`활성 사이드바 메뉴가 올바르지 않습니다: ${enabledRoutes.join(',')}`);
}
if (!values.isChair || values.isWorkfrontMain || values.isWorkfrontDetail) {
  throw new Error('초기 화면이 의장 주간작업계획 수립이 아닙니다.');
}

app.navigate('workfront-main');
values = app.renderVals();
if (!values.isWorkfrontMain || app.state.view !== 'workfront-main') {
  throw new Error('워크프론트 메인 전환에 실패했습니다.');
}

values.openWorkfrontDetail();
values = app.renderVals();
if (!values.isWorkfrontDetail || app.state.view !== 'workfront-detail') {
  throw new Error('워크프론트 상세 전환에 실패했습니다.');
}

app.toggle(0);
values = app.renderVals();
if (!values.detailRows[0].on) throw new Error('워크프론트 상세 체크박스 상태가 유지되지 않습니다.');

console.log('component syntax: ok');
console.log('routing bindings: ok');
console.log('single-document views: ok');
console.log('navigation state transitions: ok');
