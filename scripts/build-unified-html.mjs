import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const pagesDir = path.join(root, 'prototype-pages');
const files = fs.readdirSync(pagesDir);

function findFile(normalizedName) {
  const found = files.find((file) => file.normalize('NFC') === normalizedName);
  if (!found) throw new Error(`파일을 찾을 수 없습니다: ${normalizedName}`);
  return path.join(pagesDir, found);
}

const chairPath = findFile('의장 주간작업계획 수립.html');
const workfrontMainPath = findFile('워크프론트 점검 메인.html');
const workfrontDetailPath = findFile('워크프론트 점검 서브.html');
const outputPath = path.join(root, 'index.html');

function decodeBundle(filePath) {
  const bundle = fs.readFileSync(filePath, 'utf8');
  const match = bundle.match(/<script type="__bundler\/template">\s*([\s\S]*?)\s*<\/script>/);
  if (!match) throw new Error(`번들 템플릿을 찾을 수 없습니다: ${path.basename(filePath)}`);
  return { bundle, json: match[1], template: JSON.parse(match[1]) };
}

function assertReplace(source, searchValue, replacement, label) {
  if (!source.includes(searchValue)) throw new Error(`교체 대상을 찾을 수 없습니다: ${label}`);
  return source.replace(searchValue, replacement);
}

function extractBalanced(source, start, openPattern, closePattern) {
  const tokenPattern = new RegExp(`${openPattern.source}|${closePattern.source}`, 'gi');
  tokenPattern.lastIndex = start;
  let depth = 0;
  let match;
  while ((match = tokenPattern.exec(source))) {
    const isClose = match[0].startsWith('</');
    depth += isClose ? -1 : 1;
    if (depth === 0) return source.slice(start, tokenPattern.lastIndex);
  }
  throw new Error('균형이 맞는 HTML 요소를 찾지 못했습니다.');
}

function extractMain(template, markerText) {
  const marker = markerText || '<div style="flex:1;display:flex;flex-direction:column;min-width:0;';
  const start = template.indexOf(marker);
  if (start < 0) throw new Error('화면 본문을 찾지 못했습니다.');
  return extractBalanced(template, start, /<div\b[^>]*>/, /<\/div>/);
}

function extractMethod(template, methodName) {
  const classStart = template.indexOf('class Component extends DCLogic');
  const classSource = template.slice(classStart);
  const signaturePattern = new RegExp(`^\\s{2}${methodName}\\([^\\n]*\\)\\s*\\{`, 'm');
  const signatureMatch = signaturePattern.exec(classSource);
  if (!signatureMatch) throw new Error(`메서드를 찾지 못했습니다: ${methodName}`);
  const start = classStart + signatureMatch.index + signatureMatch[0].indexOf(methodName);
  const braceStart = template.indexOf('{', start);
  let depth = 0;
  let quote = null;
  let escaped = false;
  for (let index = braceStart; index < template.length; index += 1) {
    const char = template[index];
    if (quote) {
      if (escaped) escaped = false;
      else if (char === '\\') escaped = true;
      else if (char === quote) quote = null;
      continue;
    }
    if (char === "'" || char === '"' || char === '`') {
      quote = char;
      continue;
    }
    if (char === '{') depth += 1;
    if (char === '}') {
      depth -= 1;
      if (depth === 0) return template.slice(start, index + 1);
    }
  }
  throw new Error(`메서드 범위를 찾지 못했습니다: ${methodName}`);
}

function replaceComponentScript(template, componentSource) {
  const pattern = /<script type="text\/x-dc" data-dc-script="">\s*class Component extends DCLogic[\s\S]*?<\/script>/;
  if (!pattern.test(template)) throw new Error('컴포넌트 스크립트를 찾지 못했습니다.');
  return template.replace(
    pattern,
    `<script type="text/x-dc" data-dc-script="">\n${componentSource}\n</script>`,
  );
}

const chair = decodeBundle(chairPath);
const workfrontMain = decodeBundle(workfrontMainPath);
const workfrontDetail = decodeBundle(workfrontDetailPath);

const alreadyUnified = chair.template.includes('<!-- unified-navigation:start -->');
let chairMain = alreadyUnified
  ? chair.template.match(/<!-- unified:chair:start -->([\s\S]*?)<!-- unified:chair:end -->/)[1].trim()
  : extractMain(chair.template);
let workfrontMainView = extractMain(workfrontMain.template);
let workfrontDetailView = extractMain(workfrontDetail.template);

function appendStatusBar(view, label) {
  const closingIndex = view.lastIndexOf('</div>');
  const statusBar = `\n  <div style="height:22px;background:#1e1f22;border-top:1px solid #000;display:flex;align-items:center;padding:0 12px;font-size:11px;color:#d8dadd;flex-shrink:0;">${label}</div>\n`;
  return view.slice(0, closingIndex) + statusBar + view.slice(closingIndex);
}

workfrontMainView = workfrontMainView
  .replaceAll('{{ groups }}', '{{ wfGroups }}')
  .replaceAll('{{ rows }}', '{{ wfRows }}');
workfrontDetailView = workfrontDetailView.replaceAll('{{ rows }}', '{{ detailRows }}');
workfrontMainView = appendStatusBar(workfrontMainView, '워크프론트 점검');
workfrontDetailView = appendStatusBar(workfrontDetailView, '워크프론트 점검');

const detailButton = '<div style="background:var(--brown);color:#fff;font-size:14px;font-weight:700;padding:9px 20px;border-radius:5px;">선각 W/F 점검</div>';
const routedDetailButton = '<div data-route="workfront-detail" role="button" tabIndex="0" onClick="{{ openWorkfrontDetail }}" onKeyDown="{{ openWorkfrontDetailKey }}" style="background:var(--brown);color:#fff;font-size:14px;font-weight:700;padding:9px 20px;border-radius:5px;cursor:pointer;">선각 W/F 점검</div>';
workfrontMainView = assertReplace(workfrontMainView, detailButton, routedDetailButton, '워크프론트 상세 진입 버튼');

let chairData = extractMethod(chair.template, alreadyUnified ? 'buildChairData' : 'renderVals')
  .replace(alreadyUnified ? 'buildChairData()' : 'renderVals()', 'buildChairData()')
  .replace(/,\s*sideItems:\s*this\.buildSideItems\(\)/, '');

let workfrontMainData = extractMethod(workfrontMain.template, 'renderVals')
  .replace('renderVals()', 'buildWorkfrontMainData()');
workfrontMainData = assertReplace(
  workfrontMainData,
  'return { groups, rows, sideItems: this.buildSideItems() };',
  'return { wfGroups: groups, wfRows: rows };',
  '워크프론트 메인 데이터 반환값',
);

let workfrontDetailData = extractMethod(workfrontDetail.template, 'renderVals')
  .replace('renderVals()', 'buildWorkfrontDetailData()');
workfrontDetailData = assertReplace(
  workfrontDetailData,
  "return { rows, allOn, allBoxBg: allOn ? '#0067c0' : '#fff', toggleAll: ()=>this.toggleAll(), sideItems: this.buildSideItems() };",
  "return { detailRows: rows, allOn, allBoxBg: allOn ? '#0067c0' : '#fff', toggleAll: ()=>this.toggleAll() };",
  '워크프론트 상세 데이터 반환값',
);

const toggleMethod = extractMethod(workfrontDetail.template, 'toggle');
const toggleAllMethod = extractMethod(workfrontDetail.template, 'toggleAll');
let sideItemsMethod = extractMethod(chair.template, 'buildSideItems');
if (!alreadyUnified) {
  sideItemsMethod = sideItemsMethod.replace(
    "const active = '의장 주간작업계획 수립';",
    "const active = this.state.view === 'chair' ? '의장 주간작업계획 수립' : '워크프론트 점검';",
  );
  sideItemsMethod = assertReplace(
    sideItemsMethod,
    '      return { label, style };',
    `      const route = label === '의장 주간작업계획 수립'
        ? 'chair'
        : label === '워크프론트 점검'
          ? 'workfront-main'
          : undefined;
      if (route) style += 'cursor:pointer;';
      return {
        label,
        style,
        route,
        role: route ? 'button' : undefined,
        tabIndex: route ? 0 : undefined,
        onClick: route ? () => this.navigate(route) : undefined,
        onKeyDown: route ? (event) => this.handleRouteKey(event, route) : undefined,
      };`,
    '사이드바 라우트 반환값',
  );
}

const componentSource = `class Component extends DCLogic {
  state = {
    view: ['workfront-main', 'workfront-detail'].includes(window.location.hash.slice(1))
      ? window.location.hash.slice(1)
      : 'chair',
    checked: {},
  };

  componentDidMount() {
    this.syncFromLocation = () => {
      const hash = window.location.hash.slice(1);
      const view = ['workfront-main', 'workfront-detail'].includes(hash) ? hash : 'chair';
      if (view !== this.state.view) this.setState({ view });
    };
    window.addEventListener('popstate', this.syncFromLocation);
  }

  componentWillUnmount() {
    window.removeEventListener('popstate', this.syncFromLocation);
  }

  navigate(view) {
    if (view === this.state.view) return;
    const url = new URL(window.location.href);
    url.hash = view === 'chair' ? '' : view;
    window.history.pushState({}, '', url);
    this.setState({ view });
  }

  handleRouteKey(event, route) {
    if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault();
      this.navigate(route);
    }
  }

  ${toggleMethod}
  ${toggleAllMethod}

  renderVals() {
    const view = this.state.view;
    return {
      ...this.buildChairData(),
      ...this.buildWorkfrontMainData(),
      ...this.buildWorkfrontDetailData(),
      isChair: view === 'chair',
      isWorkfrontMain: view === 'workfront-main',
      isWorkfrontDetail: view === 'workfront-detail',
      footerTitle: view === 'chair' ? '의장 주간작업계획 수립(PPHA_C210)' : '워크프론트 점검',
      sideItems: this.buildSideItems(),
      openWorkfrontDetail: () => this.navigate('workfront-detail'),
      openWorkfrontDetailKey: (event) => this.handleRouteKey(event, 'workfront-detail'),
    };
  }

  ${chairData}

  ${workfrontMainData}

  ${workfrontDetailData}

  ${sideItemsMethod}
}`;

let unifiedTemplate = chair.template;
if (alreadyUnified) {
  const start = unifiedTemplate.indexOf('<!-- unified-navigation:start -->');
  const endMarker = '<!-- unified-navigation:end -->';
  const end = unifiedTemplate.indexOf(endMarker, start) + endMarker.length;
  unifiedTemplate = unifiedTemplate.slice(0, start) + '__UNIFIED_VIEWS__' + unifiedTemplate.slice(end);
} else {
  unifiedTemplate = assertReplace(unifiedTemplate, chairMain, '__UNIFIED_VIEWS__', '의장 본문');
}

const unifiedViews = `<!-- unified-navigation:start -->
    <sc-if value="{{ isChair }}" hint-placeholder-val="{{ true }}">
      <!-- unified:chair:start -->
      ${chairMain}
      <!-- unified:chair:end -->
    </sc-if>
    <sc-if value="{{ isWorkfrontMain }}" hint-placeholder-val="{{ false }}">
      ${workfrontMainView}
    </sc-if>
    <sc-if value="{{ isWorkfrontDetail }}" hint-placeholder-val="{{ false }}">
      ${workfrontDetailView}
    </sc-if>
    <!-- unified-navigation:end -->`;

unifiedTemplate = assertReplace(
  unifiedTemplate,
  '__UNIFIED_VIEWS__',
  unifiedViews,
  '통합 화면 삽입 위치',
);

const sideItemMarkup = '<div style="{{ si.style }}">{{ si.label }}</div>';
const routedSideItemMarkup = '<div data-route="{{ si.route }}" role="{{ si.role }}" tabIndex="{{ si.tabIndex }}" onClick="{{ si.onClick }}" onKeyDown="{{ si.onKeyDown }}" style="{{ si.style }}">{{ si.label }}</div>';
if (unifiedTemplate.includes(sideItemMarkup)) {
  unifiedTemplate = unifiedTemplate.replace(sideItemMarkup, routedSideItemMarkup);
}

if (!unifiedTemplate.includes('<title>SF-POS</title>')) {
  unifiedTemplate = unifiedTemplate.replace(
    '</helmet>',
    `<style>
:root{--green-dark:#008233;--green-main:#2e9e57;--brown:#6e5c4c;--brown-active:#c0261d;}
[data-route]:focus-visible{outline:2px solid #0a72f2;outline-offset:-2px;}
</style>
<title>SF-POS</title>
</helmet>`,
  );
}

unifiedTemplate = replaceComponentScript(unifiedTemplate, componentSource);

const encodedTemplate = JSON.stringify(unifiedTemplate).replace(/<\/script/gi, '<\\/script');
let output = chair.bundle.replace(chair.json, encodedTemplate);
output = output.replace('<title>Bundled Page</title>', '<title>SF-POS</title>');
fs.writeFileSync(outputPath, output);

console.log(`통합 HTML 생성 완료: ${path.basename(outputPath)}`);
