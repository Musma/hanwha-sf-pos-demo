import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const targetPath = path.join(root, 'index.html');
if (!fs.existsSync(targetPath)) throw new Error('파일을 찾을 수 없습니다: index.html');

const bundle = fs.readFileSync(targetPath, 'utf8');
const rootHtmlFiles = fs.readdirSync(root).filter((file) => file.endsWith('.html'));
if (rootHtmlFiles.length !== 1 || rootHtmlFiles[0] !== 'index.html') {
  throw new Error(`루트 HTML 구성이 올바르지 않습니다: ${rootHtmlFiles.join(', ')}`);
}
if (bundle.includes('http-equiv="refresh"')) throw new Error('index.html이 아직 리다이렉트 파일입니다.');
if (!bundle.includes('<script type="__bundler/manifest">')) {
  throw new Error('index.html에 자체 포함 리소스 번들이 없습니다.');
}
const templateMatch = bundle.match(/<script type="__bundler\/template">\s*([\s\S]*?)\s*<\/script>/);
if (!templateMatch) throw new Error('번들 템플릿을 찾을 수 없습니다.');

const template = JSON.parse(templateMatch[1]);
const fileReferences = [...template.matchAll(/(?:src|href)="([^"]+)"/g)].map((match) => match[1]);
const externalFileReferences = fileReferences.filter((reference) => /^(?:https?:|\.\.?\/)/.test(reference));
if (externalFileReferences.length > 0) {
  throw new Error(`외부 파일 의존성이 있습니다: ${externalFileReferences.join(', ')}`);
}
const componentMatch = template.match(
  /<script type="text\/x-dc" data-dc-script="">\s*(class Component extends DCLogic[\s\S]*?)<\/script>/,
);
if (!componentMatch) throw new Error('통합 컴포넌트를 찾을 수 없습니다.');

new Function(`class DCLogic {}\n${componentMatch[1]}`);

const required = [
  '<!-- unified-navigation:start -->',
  '>COMPANION WAY</td>',
  '>2585Z501ISM1090001</td>',
  '{{ detailToggle0 }}',
  'data-route="workfront-detail"',
  'data-route="workfront-detail-uijang"',
  "view: ['chair', 'workfront-main', 'workfront-detail', 'workfront-detail-uijang']",
  "'의장 주간작업계획 수립': 'chair'",
  "'워크프론트 점검': 'workfront-main'",
  '{{ envItems }}',
  '{{ weeklyRowDisplay }}',
  '{{ showGantt }}',
  '{{ ltRecordText }}',
  '{{ isHome }}',
  'id="plan-load-progress"',
  'id="plan-load-progress-bar"',
  'role="progressbar"',
  'Gantt Chart 배치를 계산하고 있습니다.',
  'id="weekly-volume-sort-button"',
  'id="weekly-volume-table-body"',
  'data-work-type="내업"',
  'data-work-type="외업"',
  '{{ weeklyVolumeSortClick }}',
  'id="weekly-volume-sort-up"',
  'id="weekly-volume-sort-down"',
  'font-size:12px;font-weight:700;line-height:1.25',
  "this.weeklyVolumeSortMode === 'asc' ? 'none' : 'desc'",
];

for (const token of required) {
  if (!template.includes(token)) throw new Error(`필수 바인딩이 없습니다: ${token}`);
}

const routeMarkupCount = (template.match(/data-route=/g) || []).length;
const componentCount = (template.match(/class Component extends DCLogic/g) || []).length;
const navigationBlockCount = (template.match(/unified-navigation:start/g) || []).length;

if (routeMarkupCount !== 3) throw new Error(`라우트 마크업 수가 올바르지 않습니다: ${routeMarkupCount}`);
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
if (!values.isHome || values.isChair || values.isWorkfrontMain || values.isWorkfrontDetail || values.isWorkfrontDetailUijang) {
  throw new Error('초기 화면이 SF-POS 메인이 아닙니다.');
}
const groupItems = values.sideItems.filter((item) => item.label.endsWith('▸') || item.label.endsWith('▾'));
if (groupItems.length !== 10) {
  throw new Error(`사이드바 대메뉴 수가 올바르지 않습니다: ${groupItems.length}`);
}
if (!groupItems.every((item) => item.label.endsWith('▸'))) {
  throw new Error('초기 상태에서 닫혀 있지 않은 대메뉴가 있습니다.');
}
const chairRouteItem = values.sideItems.find((item) => item.route === 'chair');
if (!chairRouteItem.style.includes('display:none;')) {
  throw new Error('닫힌 대메뉴의 하위 메뉴가 숨겨지지 않았습니다.');
}

app.toggleGroup('의장');
values = app.renderVals();
if (values.sideItems.find((item) => item.route === 'chair').style.includes('display:none;')) {
  throw new Error('의장 대메뉴를 펼쳐도 하위 메뉴가 보이지 않습니다.');
}
app.toggleGroup('의장');
if (!app.renderVals().sideItems.find((item) => item.route === 'chair').style.includes('display:none;')) {
  throw new Error('의장 대메뉴를 접어도 하위 메뉴가 사라지지 않습니다.');
}

app.navigate('chair');
values = app.renderVals();
if (!values.isChair || app.state.view !== 'chair') {
  throw new Error('의장 주간작업계획 수립 전환에 실패했습니다.');
}
if (!app.state.openGroups['의장']) {
  throw new Error('의장 화면 진입 시 의장 대메뉴가 자동으로 펼쳐지지 않습니다.');
}
const initialGantt = values.gantt.map((row) => row.bars.map((bar) => `${bar.left}:${bar.width}:${bar.label}`).join('|')).join('||');
app.state.chairPlanVersion = 1;
values = app.renderVals();
const loadedGanttA = values.gantt.map((row) => row.bars.map((bar) => `${bar.left}:${bar.width}:${bar.label}`).join('|')).join('||');
if (loadedGanttA === initialGantt || !loadedGanttA.includes('2579-501') || !loadedGanttA.includes('2602-508')) {
  throw new Error('계획 불러오기 후 첫 번째 Gantt 변경 데이터가 적용되지 않습니다.');
}
app.state.chairPlanVersion = 2;
values = app.renderVals();
const loadedGanttB = values.gantt.map((row) => row.bars.map((bar) => `${bar.left}:${bar.width}:${bar.label}`).join('|')).join('||');
if (loadedGanttB === initialGantt || loadedGanttB === loadedGanttA || !loadedGanttB.includes('2583-50B')) {
  throw new Error('계획 재불러오기 후 대체 Gantt 변경 데이터가 적용되지 않습니다.');
}
app.state.chairPlanVersion = 0;

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

app.navigate('workfront-main');
values = app.renderVals();
values.openWorkfrontDetailUijang();
values = app.renderVals();
if (!values.isWorkfrontDetailUijang || app.state.view !== 'workfront-detail-uijang') {
  throw new Error('의장 워크프론트 상세 전환에 실패했습니다.');
}

if (!values.isUijangPlanTab || values.isUijangFacilityTab) {
  throw new Error('의장 상세 초기 탭이 계획이 아닙니다.');
}
values.uijangTabFacilityClick();
values = app.renderVals();
if (!values.isUijangFacilityTab || values.isUijangPlanTab) {
  throw new Error('작업장&설비 탭 전환에 실패했습니다.');
}
values.uijangTabPlanClick();
values = app.renderVals();
if (!values.isUijangPlanTab) {
  throw new Error('계획 탭 복귀에 실패했습니다.');
}
values.uijangReview1Click();
values = app.renderVals();
if (values.uijangReview1Pressed !== 'true' || !values.uijangReview1RowStyle.includes('#fff2df') || !values.uijangReview1CellStyle.includes('#ffd7a8')) {
  throw new Error('검토 요소 1의 행·날짜 셀 강조가 동작하지 않습니다.');
}
values.uijangReview2Click();
values = app.renderVals();
if (values.uijangReview1Pressed !== 'false' || values.uijangReview2Pressed !== 'true' || !values.uijangReview2CellStyle.includes('#cfe7ff')) {
  throw new Error('검토 요소 2의 행·날짜 셀 강조가 동작하지 않습니다.');
}
values.uijangReview2Click();
values = app.renderVals();
if (values.uijangReview2Pressed !== 'false') {
  throw new Error('검토 요소 강조 해제가 동작하지 않습니다.');
}

app.toggle(0);
values = app.renderVals();
if (!values.detailRows[0].on) throw new Error('워크프론트 상세 체크박스 상태가 유지되지 않습니다.');
if (values.detailOn0 !== true || values.detailBoxBg0 !== '#0067c0') {
  throw new Error('워크프론트 상세 행별 체크박스 바인딩이 갱신되지 않습니다.');
}
if (typeof values.detailToggle1 !== 'function') {
  throw new Error('워크프론트 상세 행별 토글 바인딩이 없습니다.');
}
if (values.uijangSelectedText !== '1건 선택됨' || typeof values.uijangToggleAll !== 'function') {
  throw new Error('의장 워크프론트 선택 상태 바인딩이 올바르지 않습니다.');
}
values.uijangToggleAll();
values = app.renderVals();
if (!values.uijangAllOn || values.uijangSelectedText !== '11건 선택됨') {
  throw new Error('의장 워크프론트 전체 선택이 동작하지 않습니다.');
}
values.uijangToggleAll();
values = app.renderVals();
if (values.uijangAllOn || values.uijangSelectedText !== '0건 선택됨') {
  throw new Error('의장 워크프론트 전체 선택 해제가 동작하지 않습니다.');
}

values = app.renderVals();
if (values.weeklyRowDisplay !== '') throw new Error('초기 상태에서 주간 작업 물량 표가 표시되지 않습니다.');
if (!values.showGantt) throw new Error('초기 상태에서 Gantt Chart가 표시되지 않습니다.');
if (!values.ltRecordText.startsWith('Record 1 of')) {
  throw new Error(`초기 레코드 표시가 올바르지 않습니다: ${values.ltRecordText}`);
}
if (values.envItems.map((item) => item.key).join(',') !== 'weekly,gantt,load,layout') {
  throw new Error('환경설정 체크박스 구성이 올바르지 않습니다.');
}

app.toggleEnv('weekly');
values = app.renderVals();
if (values.weeklyRowDisplay !== 'none') throw new Error('주간작업물량 해제 시 표 데이터가 사라지지 않습니다.');
if (values.envItems.find((item) => item.key === 'weekly').on) {
  throw new Error('주간작업물량 체크박스가 해제 상태로 바뀌지 않습니다.');
}
if (values.ltRecordText !== 'Record 0 of 0') {
  throw new Error(`해제 시 레코드 표시가 올바르지 않습니다: ${values.ltRecordText}`);
}
app.toggleEnv('weekly');
if (app.renderVals().weeklyRowDisplay !== '') throw new Error('주간작업물량 재선택 시 표 데이터가 표시되지 않습니다.');

app.toggleEnv('gantt');
values = app.renderVals();
if (values.showGantt) throw new Error('Gantt Chart 해제 시 간트차트가 사라지지 않습니다.');
app.toggleEnv('gantt');
if (!app.renderVals().showGantt) throw new Error('Gantt Chart 재선택 시 간트차트가 표시되지 않습니다.');

if (template.includes('<sc-for list="{{ wfRows }}"') || template.includes('<sc-for list="{{ wfGroups }}"')) {
  throw new Error('워크프론트 메인 표가 정적으로 전개되지 않았습니다.');
}
if (template.includes('<sc-for list="{{ detailRows }}"')) {
  throw new Error('워크프론트 상세 표가 정적으로 전개되지 않았습니다.');
}
const uijangSampleMarkers = [
  '액티비티 8건 · 작업지시 3건 · 실행계획 | 실적 | 납기일 순',
  '2579W511GC10C10',
  '2602W508GC10C10',
  'S241W511GC10F10F01',
  'S241W511GC10F10W03',
  '총 11행',
  '작업계획 검토 사항',
  '납기일까지 버퍼가 충분치 않아, 내업 작업으로 검토',
  '인력을 더 투입하여, 비오기 전 작업 완료 검토',
  'overflow:auto;max-height:390px;',
  'data-review-factor="1"',
  'data-review-factor="2"',
  'data-uijang-row="3"',
  'data-uijang-row="5"',
  'data-review-cell="plan-end"',
  'data-review-cell="post-start"',
  'data-review-cell="due"',
];
if (uijangSampleMarkers.some((marker) => !template.includes(marker))) {
  throw new Error('의장 W/F 점검 샘플 데이터가 올바르게 생성되지 않았습니다.');
}
for (const label of ['점검 필요', '미착수']) {
  const metric = template.match(new RegExp(`<div style="font-size:11px;color:#7a7f85;">${label}</div>\\s*<div[^>]*>(\\d+)`));
  if (!metric || metric[1] !== '8') {
    throw new Error(`의장 W/F 점검 ${label} 상태 건수가 샘플 데이터와 다릅니다.`);
  }
}
const wfOkRowA = values.wfRows[0].groups.map((group) => group.ok).join(',');
const wfOkRowB = values.wfRows[1].groups.map((group) => group.ok).join(',');
if (wfOkRowA !== '20,18,22,10,25,26,27') throw new Error(`워크프론트 정상 수치(홀수 행)가 시안과 다릅니다: ${wfOkRowA}`);
if (wfOkRowB !== '18,20,10,22,26,25,25') throw new Error(`워크프론트 정상 수치(짝수 행)가 시안과 다릅니다: ${wfOkRowB}`);
if (values.wfRows[0].groups[0].chg !== 1 || values.wfRows[2].groups[0].chg !== 2) {
  throw new Error('워크프론트 변경 수치 주기가 시안과 다릅니다.');
}
if (values.wfRows.some((row) => row.groups.some((group) => group.non !== 50))) {
  throw new Error('워크프론트 미착수 수치가 시안과 다릅니다.');
}

console.log('component syntax: ok');
console.log('env checkbox toggles: ok');
console.log('routing bindings: ok');
console.log('single-document views: ok');
console.log('navigation state transitions: ok');
console.log('uijang sample data: ok');
console.log('single-file hosting layout: ok');
console.log('external file dependencies: 0');
