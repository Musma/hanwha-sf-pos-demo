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

chairMain = assertReplace(
  chairMain,
  '>실행계획 착수일<span style="color:#7a7f85;">▾</span>',
  '>실행계획 착수/완료일<span style="color:#7a7f85;">▾</span>',
  '주간 작업 물량 조회조건 라벨',
);

const weeklyVolumeColumns = [
  '프로젝트', '블록', '실행계획 액티비티', '실행계획<br>착수일', '실행계획<br>완료일',
  '기준계획<br>착수일', '기준계획<br>완료일', '실적<br>착수일', '실적<br>완료일',
  '블록<br>L', '블록<br>B', '블록<br>H', '중량', '내입/외업<br>구분', '작업장',
];
const weeklyVolumeRows = [
  ['2579', '511', '중조의장', '07/27', '08/01', '06/27', '07/01', '-', '-', '19', '22', '-', '144.6', '내업', '내업1공장 2bay 서편'],
  ['2579', '512', '중조의장', '07/27', '08/01', '06/27', '07/01', '-', '-', '18', '13', '-', '168.3', '내업', '내업1공장 2bay 서편'],
  ['2579', '501', '대조의장', '07/27', '08/15', '06/27', '07/15', '-', '-', '18', '22', '-', '144', '외업', '외업1공장'],
  ['2579', '502', '대조의장', '07/28', '08/06', '06/28', '07/06', '-', '-', '18', '22', '-', '170', '외업', '외업1공장'],
  ['2583', '50A', 'PE의장', '06/28', '07/28', '05/28', '06/28', '-', '-', '-', '-', '-', '-', '외업', 'PE 2장'],
  ['2583', '50B', 'PE의장', '07/30', '09/05', '06/30', '08/05', '-', '-', '-', '-', '-', '-', '외업', 'PE 2장'],
  ['2602', '507', '중조의장', '07/30', '08/07', '06/30', '07/07', '-', '-', '19', '22', '-', '163', '내업', '내업2공장'],
  ['2602', '508', '중조의장', '08/01', '08/10', '07/01', '07/10', '-', '-', '17', '22', '-', '132', '내업', '내업2공장'],
];
const weeklyVolumeHeader = weeklyVolumeColumns
  .map((label) => `<th style="background:#ffff00;border:1px solid #b9b9b9;padding:3px 6px;color:#111;font-weight:700;line-height:1.25;position:sticky;top:0;">${label}</th>`)
  .join('');
const weeklyVolumeBody = weeklyVolumeRows
  .map((row) => `<tr style="height:22px;">${row.map((value) => `<td style="border:1px solid #b9b9b9;padding:3px 6px;color:#222;">${value}</td>`).join('')}</tr>`)
  .join('\n');
const weeklyVolumeModalStart = chairMain.indexOf('<div id="wwv-modal"');
const weeklyVolumeTableStart = chairMain.indexOf('<table ', weeklyVolumeModalStart);
const weeklyVolumeTableEnd = chairMain.indexOf('</table>', weeklyVolumeTableStart) + '</table>'.length;
if (weeklyVolumeModalStart < 0 || weeklyVolumeTableStart < 0 || weeklyVolumeTableEnd < '</table>'.length) {
  throw new Error('주간 작업 물량 모달 표를 찾지 못했습니다.');
}
chairMain =
  chairMain.slice(0, weeklyVolumeTableStart) +
  `<table style="border-collapse:collapse;font-size:11px;width:100%;white-space:nowrap;text-align:center;">
            <thead><tr>${weeklyVolumeHeader}</tr></thead>
            <tbody>${weeklyVolumeBody}</tbody>
          </table>` +
  chairMain.slice(weeklyVolumeTableEnd);

const envLabelsMarkup = `<label style="display:flex;align-items:center;gap:3px;"><span style="display:inline-flex;align-items:center;justify-content:center;width:14px;height:14px;background:#ed7100;border:1px solid #c95d00;border-radius:2px;color:#fff;font-size:10px;">✓</span>주간작업물량</label>
        <label style="display:flex;align-items:center;gap:3px;"><span style="display:inline-flex;align-items:center;justify-content:center;width:14px;height:14px;background:#ed7100;border:1px solid #c95d00;border-radius:2px;color:#fff;font-size:10px;">✓</span>Gantt Chart</label>
        <label style="display:flex;align-items:center;gap:3px;color:#7a7f85;"><span style="display:inline-block;width:14px;height:14px;background:#fff;border:1px solid var(--line);border-radius:2px;"></span>부하 그래프</label>
        <label style="display:flex;align-items:center;gap:3px;"><span style="display:inline-flex;align-items:center;justify-content:center;width:14px;height:14px;background:#ed7100;border:1px solid #c95d00;border-radius:2px;color:#fff;font-size:10px;">✓</span>정반블록배치</label>`;
const envItemsMarkup = `<sc-for list="{{ envItems }}" as="ev" hint-placeholder-count="4">
          <label data-env="{{ ev.key }}" role="checkbox" aria-checked="{{ ev.ariaChecked }}" tabIndex="0" onClick="{{ ev.onClick }}" onKeyDown="{{ ev.onKeyDown }}" style="{{ ev.labelStyle }}"><span style="{{ ev.boxStyle }}">{{ ev.tick }}</span>{{ ev.label }}</label>
        </sc-for>`;

if (!chairMain.includes('{{ envItems }}')) {
  chairMain = assertReplace(chairMain, envLabelsMarkup, envItemsMarkup, '환경설정 체크박스');

  // 표(tbody) 안의 sc-for는 HTML 파서의 foster parenting으로 테이블 밖으로
  // 밀려나 동작하지 않으므로, 행을 빌드 시점에 정적으로 전개하고
  // display 속성 바인딩으로 표시 여부를 제어한다.
  const ltForStart = chairMain.indexOf('<sc-for list="{{ ltrows }}"');
  if (ltForStart < 0) throw new Error('주간 작업 물량 목록을 찾지 못했습니다.');
  const ltForEnd = chairMain.indexOf('</sc-for>', ltForStart) + '</sc-for>'.length;
  const ltForBlock = chairMain.slice(ltForStart, ltForEnd);

  const trStart = chairMain.indexOf('<tr style="background: {{ r.bg }};">');
  if (trStart < 0) throw new Error('주간 작업 물량 행 템플릿을 찾지 못했습니다.');
  const trEnd = chairMain.indexOf('</tr>', trStart) + '</tr>'.length;
  const rowTemplateRaw = chairMain.slice(trStart, trEnd);
  const rowTemplate = assertReplace(
    rowTemplateRaw,
    '<tr style="background: {{ r.bg }};">',
    '<tr style="background: {{ r.bg }};display: {{ weeklyRowDisplay }};">',
    '주간 작업 물량 행 표시 바인딩',
  );
  const chairRowSource = extractMethod(chair.template, alreadyUnified ? 'buildChairData' : 'renderVals')
    .replace(/,\s*sideItems:\s*this\.buildSideItems\(\)/, '');
  const chairRowData = new Function(`return (function ${chairRowSource})();`)();
  const staticRows = chairRowData.ltrows
    .map((r) => rowTemplate.replace(/\{\{\s*r\.([A-Za-z0-9_$]+)\s*\}\}/g, (_, k) => String(r[k] ?? '')))
    .join('\n            ');

  if (trStart > ltForStart && trStart < ltForEnd) {
    // 행 템플릿이 sc-for 안에 있는 원본 형태
    chairMain = assertReplace(chairMain, ltForBlock, staticRows, '주간 작업 물량 행 정적 전개');
  } else {
    // foster parenting이 반영되어 sc-for와 행 템플릿이 분리된 번들 형태
    chairMain = assertReplace(chairMain, rowTemplateRaw, staticRows, '주간 작업 물량 행 정적 전개');
    chairMain = assertReplace(chairMain, ltForBlock, '', '빈 주간 작업 물량 sc-for 제거');
  }

  const ganttMarker = '<div style="width:1032px;position:relative;">';
  const ganttStart = chairMain.indexOf(ganttMarker);
  if (ganttStart < 0) throw new Error('Gantt 본문을 찾지 못했습니다.');
  const ganttBody = extractBalanced(chairMain, ganttStart, /<div\b[^>]*>/, /<\/div>/);
  chairMain = assertReplace(
    chairMain,
    ganttBody,
    `<sc-if value="{{ showGantt }}" hint-placeholder-val="{{ false }}">${ganttBody}</sc-if>`,
    'Gantt 본문 조건부 표시',
  );

  chairMain = assertReplace(
    chairMain,
    '>Record 1 of 53</span>',
    '>{{ ltRecordText }}</span>',
    '주간 작업 물량 레코드 표시',
  );

  // 정반 블록 배치: 순검정 캔버스를 차분한 다크 톤으로, 6px 블록 라벨은
  // 검정 배경에서 읽히도록 크기와 명도를 올린다.
  chairMain = chairMain.replaceAll('background:#000;', 'background:#15171b;');
  chairMain = assertReplace(
    chairMain,
    'font-size:6px;font-weight:700;color:#e40c01;',
    'font-size:7px;font-weight:700;color:#ff5a4e;',
    '정반 블록 라벨',
  );
}
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

const uijangButton = '<div style="background:var(--brown);color:#fff;font-size:14px;font-weight:700;padding:9px 20px;border-radius:5px;">의장 W/F 점검</div>';
const routedUijangButton = '<div data-route="workfront-detail-uijang" role="button" tabIndex="0" onClick="{{ openWorkfrontDetailUijang }}" onKeyDown="{{ openWorkfrontDetailUijangKey }}" style="background:var(--brown);color:#fff;font-size:14px;font-weight:700;padding:9px 20px;border-radius:5px;cursor:pointer;">의장 W/F 점검</div>';
workfrontMainView = assertReplace(workfrontMainView, uijangButton, routedUijangButton, '의장 워크프론트 상세 진입 버튼');

let chairData = extractMethod(chair.template, alreadyUnified ? 'buildChairData' : 'renderVals')
  .replace(alreadyUnified ? 'buildChairData()' : 'renderVals()', 'buildChairData()')
  .replace(/,\s*sideItems:\s*this\.buildSideItems\(\)/, '');
// 간트 막대·정반 블록의 원색 노랑을 한 단계 차분한 노랑으로 완화한다.
chairData = chairData.replaceAll("'#ffe000'", "'#f5d647'");

let workfrontMainData = extractMethod(workfrontMain.template, 'renderVals')
  .replace('renderVals()', 'buildWorkfrontMainData()');
workfrontMainData = assertReplace(
  workfrontMainData,
  'return { groups, rows, sideItems: this.buildSideItems() };',
  'return { wfGroups: groups, wfRows: rows };',
  '워크프론트 메인 데이터 반환값',
);

// ── 워크프론트 메인 표: 시안 수치 반영 + 정적 전개 ──
// 표 안의 sc-for는 foster parenting으로 동작하지 않으므로, 시안 기준
// 데이터로 생성식을 교체한 뒤 헤더·행을 빌드 시점에 정적으로 전개한다.
workfrontMainData = assertReplace(
  workfrontMainData,
  'const oks=[20,18,20,18,20,18,20,18,20,18,20,18,20,18], bads=[10,12,10,12,8,12,8,12,8,12,8,12,8,12], chgs=[1,2], nons=[50];',
  `const okA=[20,18,22,10,25,26,27], badA=[10,12,8,20,5,4,3];
    const okB=[18,20,10,22,26,25,25], badB=[12,10,20,8,4,5,5];`,
  '워크프론트 물량 기준값',
);
workfrontMainData = assertReplace(
  workfrontMainData,
  `groups: Array.from({length:7}, (_,g)=>({
        ok: oks[(i+g)%oks.length],
        bad: bads[(i*2+g)%bads.length],
        chg: chgs[(i+g)%chgs.length],
        non: nons[(i+g)%nons.length],
      })),`,
  `groups: Array.from({length:7}, (_,g)=>({
        ok: (i%2 ? okB : okA)[g],
        bad: (i%2 ? badB : badA)[g],
        chg: i%4 < 2 ? 1 : 2,
        non: 50,
      })),`,
  '워크프론트 물량 생성식',
);

const wfMainVals = new Function(`return (function ${workfrontMainData})();`)();

function renderBindings(tpl, scope) {
  return tpl.replace(/\{\{\s*([A-Za-z_$][\w$]*)\.([A-Za-z_$][\w$]*)\s*\}\}/g, (match, obj, key) => {
    const source = scope[obj];
    if (!source || source[key] === undefined) return match;
    return String(source[key]);
  });
}

const wfOrphanStart = workfrontMainView.indexOf('<sc-for list="{{ wfGroups }}"');
const wfTableStart = workfrontMainView.indexOf('<table style="border-collapse:collapse;font-size:10.5px;');
if (wfOrphanStart < 0 || wfTableStart < 0 || wfOrphanStart > wfTableStart) {
  throw new Error('워크프론트 표 구조를 찾지 못했습니다.');
}
const wfOrphanBlock = workfrontMainView.slice(wfOrphanStart, wfTableStart);
if (!/^(?:<sc-for[^>]*>|<\/sc-for>|\s)+$/.test(wfOrphanBlock)) {
  throw new Error('워크프론트 고아 sc-for 블록에 예상 밖의 내용이 있습니다.');
}
workfrontMainView = assertReplace(workfrontMainView, wfOrphanBlock, '', '워크프론트 고아 sc-for 제거');

const wfGroupTh = '<th colspan="4" style="background:#2f3237;color:#fff;border:1px solid #4a4e53;padding:4px 8px;font-weight:600;">{{ g }}</th>';
workfrontMainView = assertReplace(
  workfrontMainView,
  wfGroupTh,
  wfMainVals.wfGroups.map((g) => wfGroupTh.replace('{{ g }}', g)).join('\n                '),
  '워크프론트 그룹 헤더 전개',
);

const wfSubStart = workfrontMainView.indexOf('<th style="background:#2e9e57');
const wfSubEndToken = '미착수</th>';
const wfSubEnd = workfrontMainView.indexOf(wfSubEndToken, wfSubStart) + wfSubEndToken.length;
if (wfSubStart < 0 || wfSubEnd <= wfSubStart) throw new Error('워크프론트 상태 헤더를 찾지 못했습니다.');
const wfSubSet = workfrontMainView.slice(wfSubStart, wfSubEnd);
workfrontMainView = assertReplace(
  workfrontMainView,
  wfSubSet,
  Array.from({ length: 7 }, () => wfSubSet).join('\n                  '),
  '워크프론트 상태 헤더 전개',
);

const wfTbodyIdx = workfrontMainView.indexOf('<tbody>');
const wfTrStart = workfrontMainView.indexOf('<tr>', wfTbodyIdx);
const wfTrEnd = workfrontMainView.indexOf('</tr>', wfTrStart) + '</tr>'.length;
if (wfTbodyIdx < 0 || wfTrStart < 0) throw new Error('워크프론트 행 템플릿을 찾지 못했습니다.');
const wfRowTpl = workfrontMainView.slice(wfTrStart, wfTrEnd);
const wfCellStart = wfRowTpl.indexOf('<td style="border:1px solid #eceef0');
const wfCellEndToken = '{{ c.non }}</td>';
const wfCellEnd = wfRowTpl.indexOf(wfCellEndToken) + wfCellEndToken.length;
if (wfCellStart < 0 || wfCellEnd <= wfCellStart) throw new Error('워크프론트 그룹 셀 템플릿을 찾지 못했습니다.');
const wfGroupCellsTpl = wfRowTpl.slice(wfCellStart, wfCellEnd);
const wfStaticRows = wfMainVals.wfRows
  .map((r) => {
    const cells = r.groups.map((c) => renderBindings(wfGroupCellsTpl, { c })).join('\n                    ');
    return renderBindings(wfRowTpl.slice(0, wfCellStart) + cells + wfRowTpl.slice(wfCellEnd), { r });
  })
  .join('\n              ');
workfrontMainView = assertReplace(workfrontMainView, wfRowTpl, wfStaticRows, '워크프론트 행 정적 전개');

let workfrontDetailData = extractMethod(workfrontDetail.template, 'renderVals')
  .replace('renderVals()', 'buildWorkfrontDetailData()');
workfrontDetailData = assertReplace(
  workfrontDetailData,
  "return { rows, allOn, allBoxBg: allOn ? '#0067c0' : '#fff', toggleAll: ()=>this.toggleAll(), sideItems: this.buildSideItems() };",
  `const detailChecks = {};
    rows.forEach((row, i) => {
      detailChecks['detailOn' + i] = row.on;
      detailChecks['detailBoxBg' + i] = row.boxBg;
      detailChecks['detailToggle' + i] = row.toggle;
    });
    const detailSelected = rows.filter((row) => row.on).length;
    const uijangAllOn = rows.slice(0, 11).every((row) => row.on);
    const uijangSelected = rows.slice(0, 11).filter((row) => row.on).length;
    return { ...detailChecks, detailSelectedText: detailSelected + '건 선택됨', detailRows: rows, allOn, allBoxBg: allOn ? '#0067c0' : '#fff', toggleAll: ()=>this.toggleAll(),
      uijangAllOn, uijangAllBoxBg: uijangAllOn ? '#0067c0' : '#fff', uijangToggleAll: ()=>this.toggleUijangAll(), uijangSelectedText: uijangSelected + '건 선택됨' };`,
  '워크프론트 상세 데이터 반환값',
);
// 자리 채움용 빈 행은 업그레이드 화면에서 제거한다.
workfrontDetailData = workfrontDetailData.replaceAll('{blank:true},', '');

// ── 워크프론트 상세(선각 W/F 점검) 표: 시안 수치 반영 + 정적 전개 ──
workfrontDetailData = assertReplace(
  workfrontDetailData,
  "{rep:'2585Z501SM1090001', work:'(발판) 2야드1 이동 사다리 설치', none:true, s1:'2025-06-06', e3:'2025-06-06'},",
  "{rep:'2585Z501ISM1090001', work:'(발판) 2야드1 이동 사다리 설치', none:true, s1:'2025-06-06', e3:'2025-06-06'},",
  '발판 사다리 설치 작업지시 번호',
);
workfrontDetailData = assertReplace(
  workfrontDetailData,
  "{rep:'2585Z501SM10A1021', work:'(발판) 중조설치', none:true, s1:'2025-06-03', e3:'2025-06-03'},",
  "{rep:'2585Z501ISM10A1021', work:'(발판) 중조설치', none:true, s1:'2025-06-03', e3:'2025-06-03'},",
  '발판 중조설치 작업지시 번호',
);
workfrontDetailData = assertReplace(
  workfrontDetailData,
  "{rep:'2585Z501SM10A1022', work:'(발판) 러그 작업용 설치', none:true, s1:'2025-05-19'},",
  "{rep:'2585Z501ISM10A1022', work:'(발판) 러그 작업용 설치', none:true, s1:'2025-05-19'},",
  '발판 러그 설치 작업지시 번호',
);
workfrontDetailData = assertReplace(
  workfrontDetailData,
  "{rep:'2585Z501USM1090001', work:'(발판) 2야드1 이동 사다리 해체', none:true, s1:'2025-06-24', e3:'2025-06-24'},",
  "{rep:'2585Z501USM1090001', work:'(발판) 2야드1 이동 사다리 해체', none:true, s1:'2025-06-06', e3:'2025-06-06'},",
  '발판 사다리 해체 일자',
);
workfrontDetailData = assertReplace(
  workfrontDetailData,
  "{rep:'2585Z501USM10A1023', work:'(발판) 중조해체', none:true, s1:'2025-05-19'},",
  "{rep:'2585Z501USM10A1023', work:'(발판) 중조해체', none:true, s1:'2025-06-24', e3:'2025-06-24'},",
  '발판 중조해체 일자',
);

const detailRowsSource = workfrontDetailData.slice(
  workfrontDetailData.indexOf('const rowsData = [') + 'const rowsData ='.length,
  workfrontDetailData.indexOf('];') + 1,
);
const detailRowsData = new Function(`return ${detailRowsSource};`)();

// ── 선각 W/F 점검 화면 재구성 ──
// 추출한 원본 마크업을 버리고, 동일한 데이터·바인딩 위에서 화면을 새로 작성한다.
const detailCheckbox = (onclick, bg, on) =>
  `<span onclick="${onclick}" style="display:inline-flex;width:15px;height:15px;align-items:center;justify-content:center;border:1px solid #8a9099;border-radius:2px;box-shadow:inset 0 1px 1px rgba(0,0,0,.08);background: ${bg};cursor:pointer;vertical-align:middle;"><sc-if value="${on}" hint-placeholder-val="{{ false }}"><i class="ti ti-check" style="font-size:11px;color:#fff;"></i></sc-if></span>`;

const detailTh = (label, extra = '') =>
  `<th style="background:#2f3237;color:#fff;border:1px solid #4a4e53;padding:6px 8px;font-weight:600;position:sticky;top:0;z-index:2;white-space:nowrap;${extra}">${label}</th>`;

const detailWfBadge = (r) => {
  if (r.wfNeed) return '<span style="display:inline-block;border:1px solid #d63b3b;color:#d63b3b;background:rgba(214,59,59,.07);font-size:10px;font-weight:700;padding:2px 7px;border-radius:2px;white-space:nowrap;">점검 필요</span>';
  if (r.wfConfirm) return '<span style="display:inline-block;border:1px solid #0a5cc0;color:#0a5cc0;background:rgba(10,92,192,.07);font-size:10px;font-weight:700;padding:2px 7px;border-radius:2px;white-space:nowrap;">점검 확정</span>';
  return '';
};

const detailStatusPill = (r) => {
  if (r.ok) return '<span style="display:inline-block;background:#2e9e57;color:#fff;font-size:10px;font-weight:700;padding:2px 9px;border-radius:2px;">정상</span>';
  if (r.bad) return '<span style="display:inline-block;background:#d63b3b;color:#fff;font-size:10px;font-weight:700;padding:2px 9px;border-radius:2px;">비정상</span>';
  return '<span style="color:#9aa0a6;">-</span>';
};

const detailRateBar = (rate) => {
  if (!rate) return '';
  return `<span style="display:inline-flex;align-items:center;gap:6px;"><span style="display:inline-block;width:52px;height:7px;background:#e7eaed;border:1px solid #d4d7da;border-radius:4px;overflow:hidden;"><span style="display:block;width:${rate};height:100%;background:#2e9e57;"></span></span><span style="font-size:10px;font-weight:700;color:#1a8f45;font-variant-numeric:tabular-nums;">${rate}</span></span>`;
};

const detailBaeChip = (bae) => {
  if (!bae) return '';
  return `<a href="#" style="display:inline-block;background:rgba(10,114,242,.08);color:#0a5cc0;font-size:10.5px;font-weight:700;text-decoration:none;padding:2px 9px;border-radius:2px;">${bae}</a>`;
};

const detailActCount = detailRowsData.filter((r) => r.actNo).length;
const detailRepCount = detailRowsData.filter((r) => r.rep).length;
const detailOkCount = detailRowsData.filter((r) => r.ok).length;
const detailBadCount = detailRowsData.filter((r) => r.bad).length;

const detailKpiCard = (label, count, accent) =>
  `<div style="min-width:148px;background:#fff;border:1px solid #c9cdd1;border-left:3px solid ${accent};border-radius:3px;padding:7px 14px 8px;">
              <div style="font-size:11px;color:#7a7f85;">${label}</div>
              <div style="font-size:19px;font-weight:800;color:#2d2d2d;line-height:1.25;font-variant-numeric:tabular-nums;">${count}<span style="font-size:11px;font-weight:600;color:#7a7f85;margin-left:2px;">건</span></div>
            </div>`;

const detailTabs = ['계획', '작업장&amp;설비', '인력', '자재', '도면', '품질', '안전']
  .map((label, i) =>
    i === 0
      ? `<div style="padding:8px 22px 6px;font-size:13px;font-weight:700;color:#ed7100;border-bottom:3px solid #ed7100;margin-bottom:-2px;">${label}</div>`
      : `<div style="padding:8px 22px 6px;font-size:13px;font-weight:600;color:#7a7f85;">${label}</div>`,
  )
  .join('\n            ');

const dateTd = (value, groupStart) =>
  `<td style="border:1px solid #e6e8ea;${groupStart ? 'border-left:2px solid #c9cdd1;' : ''}padding:5px 8px;text-align:center;color:#3a3e43;font-variant-numeric:tabular-nums;">${value ?? ''}</td>`;

const detailStaticRows = detailRowsData
  .map((r, i) => {
    const isParent = !!r.actNo;
    const id = r.actNo || r.rep || '';
    const block = id.startsWith('2585') ? id.slice(4, 8) : '';
    const rowBg = isParent ? '#f4f6f8' : '#fff';
    const checkbox = detailCheckbox(`{{ detailToggle${i} }}`, `{{ detailBoxBg${i} }}`, `{{ detailOn${i} }}`);
    return `<tr style="background:${rowBg};">
                  <td style="border:1px solid #e6e8ea;padding:4px 6px;text-align:center;height:26px;">${checkbox}</td>
                  <td style="border:1px solid #e6e8ea;padding:5px 6px;text-align:center;color:#8b9096;font-variant-numeric:tabular-nums;">${i + 1}</td>
                  <td style="border:1px solid #e6e8ea;padding:4px 6px;text-align:center;">${detailWfBadge(r)}</td>
                  <td style="border:1px solid #e6e8ea;padding:5px 8px;text-align:center;color:#3a3e43;font-variant-numeric:tabular-nums;">2585</td>
                  <td style="border:1px solid #e6e8ea;padding:5px 8px;text-align:center;color:#3a3e43;">${block}</td>
                  <td style="border:1px solid #e6e8ea;padding:5px 8px;text-align:left;color:${isParent ? '#2d2d2d;font-weight:600' : '#5a5f65'};">${r.actNo ?? ''}</td>
                  <td style="border:1px solid #e6e8ea;padding:5px 10px;text-align:left;color:#2d2d2d;${isParent ? 'font-weight:700;' : ''}">${r.actName ?? ''}</td>
                  <td style="border:1px solid #e6e8ea;padding:5px 10px;text-align:left;color:#5a5f65;">${r.rep ?? ''}</td>
                  <td style="border:1px solid #e6e8ea;padding:5px 12px;text-align:left;color:#3a3e43;">${r.work ?? ''}</td>
                  <td style="border:1px solid #e6e8ea;padding:4px 10px;text-align:center;">${detailRateBar(r.rate)}</td>
                  <td style="border:1px solid #e6e8ea;padding:4px 6px;text-align:center;">${detailStatusPill(r)}</td>
                  ${dateTd(r.s1, true)}
                  ${dateTd(r.e1)}
                  ${dateTd(r.s2, true)}
                  ${dateTd(r.e2)}
                  ${dateTd(r.s3, true)}
                  ${dateTd(r.e3)}
                  <td style="border:1px solid #e6e8ea;border-left:2px solid #c9cdd1;padding:5px 8px;text-align:center;color:#3a3e43;">${r.gong ?? ''}</td>
                  <td style="border:1px solid #e6e8ea;padding:5px 8px;text-align:center;color:#3a3e43;">${r.type ?? ''}</td>
                  <td style="border:1px solid #e6e8ea;padding:5px 8px;text-align:center;color:#3a3e43;">${r.etage ?? ''}</td>
                  <td style="border:1px solid #e6e8ea;border-left:2px solid #c9cdd1;padding:4px 10px;text-align:center;">${detailBaeChip(r.bae)}</td>
                </tr>`;
  })
  .join('\n                ');

workfrontDetailView = `<div style="flex:1;display:flex;flex-direction:column;min-width:0;background:#eef0f2;">
      <div style="height:30px;background:#fff;display:flex;align-items:flex-end;padding:0 0 0 6px;flex-shrink:0;border-bottom:1px solid #b6bbc0;">
        <div style="background:#eef0f2;color:#2d2d2d;font-size:12px;font-weight:500;padding:6px 12px 7px 14px;border:1px solid #b6bbc0;border-bottom:1px solid #eef0f2;border-radius:3px 3px 0 0;display:flex;align-items:center;gap:16px;position:relative;top:1px;">워크프론트 점검<i class="ti ti-x" style="font-size:13px;color:#555;"></i></div>
      </div>

      <div style="flex:1;display:flex;flex-direction:column;min-height:0;padding:14px 20px 12px;">
        <div style="display:flex;align-items:baseline;gap:12px;flex-shrink:0;">
          <div style="font-size:20px;font-weight:800;color:#222;">선각 W/F 점검</div>
          <div style="font-size:12px;color:#7a7f85;">워크프론트 점검 · 2026년 7월 1주차 (2026.07.06~07.12)</div>
          <div style="margin-left:auto;font-size:11px;color:#7a7f85;">Last Updated: 2026.06.22 08:00</div>
        </div>

        <div style="display:flex;align-items:center;gap:12px;margin-top:12px;flex-shrink:0;">
          <div style="display:inline-flex;border:1px solid #b9bec3;border-radius:4px;overflow:hidden;background:#fff;">
            <div style="background:#ed7100;color:#fff;font-size:12.5px;font-weight:700;padding:7px 20px;">선각 W/F 점검</div>
            <div style="color:#5a5f65;font-size:12.5px;font-weight:600;padding:7px 20px;border-left:1px solid #d8dbdf;">의장 W/F 점검</div>
            <div style="color:#5a5f65;font-size:12.5px;font-weight:600;padding:7px 20px;border-left:1px solid #d8dbdf;">도장 W/F 점검</div>
          </div>
          <div style="margin-left:auto;display:flex;gap:6px;">
            <span class="sf-btn" style="display:inline-flex;align-items:center;gap:4px;background:linear-gradient(#fcfdfe,#e9edf1);border:1px solid var(--line,#b9bec3);border-radius:3px;padding:6px 14px;font-size:12px;"><i class="ti ti-adjustments" style="font-size:15px;color:#5a5f65;"></i>신호등 상태 변경</span>
            <span class="sf-btn" style="display:inline-flex;align-items:center;gap:4px;background:linear-gradient(#fcfdfe,#e9edf1);border:1px solid var(--line,#b9bec3);border-radius:3px;padding:6px 14px;font-size:12px;"><i class="ti ti-device-floppy" style="font-size:15px;color:#0a72f2;"></i>저장</span>
            <span class="sf-btn" style="display:inline-flex;align-items:center;gap:5px;background:#ed7100;border:1px solid #c95d00;color:#fff;border-radius:3px;padding:6px 16px;font-size:12px;font-weight:700;"><i class="ti ti-clipboard-check" style="font-size:15px;"></i>W/F 점검 확정</span>
          </div>
        </div>

        <div style="display:flex;gap:10px;margin-top:12px;flex-shrink:0;">
          ${detailKpiCard('점검 대상 액티비티', detailActCount, '#ed7100')}
          ${detailKpiCard('작업지시', detailRepCount, '#0a72f2')}
          ${detailKpiCard('정상', detailOkCount, '#2e9e57')}
          ${detailKpiCard('비정상', detailBadCount, '#d63b3b')}
        </div>

        <div style="display:flex;gap:2px;border-bottom:2px solid #d8dbdf;margin-top:14px;flex-shrink:0;">
            ${detailTabs}
        </div>

        <div style="flex:1;display:flex;flex-direction:column;min-height:0;border:1px solid #c9cdd1;border-top:none;background:#fff;">
          <div style="display:flex;align-items:center;justify-content:space-between;background:#e7eaed;border-bottom:1px solid #cfd3d7;padding:5px 12px;flex-shrink:0;">
            <span style="font-size:12px;font-weight:700;color:#3a3e43;">작업지시 점검 목록</span>
            <span style="font-size:11px;color:#7a7f85;">액티비티 ${detailActCount}건 · 작업지시 ${detailRepCount}건 · 계획 | 변경 | 실적 일정 순</span>
          </div>
          <div style="flex:1;overflow:auto;min-height:0;">
            <table style="border-collapse:collapse;font-size:11px;width:100%;white-space:nowrap;">
              <thead>
                <tr>
                  ${detailTh(detailCheckbox('{{ toggleAll }}', '{{ allBoxBg }}', '{{ allOn }}'), 'padding:5px 6px;')}
                  ${detailTh('순번')}
                  ${detailTh('W/F점검<br>상태')}
                  ${detailTh('프로젝트')}
                  ${detailTh('블록')}
                  ${detailTh('실행계획<br>액티비티 번호')}
                  ${detailTh('액티비티 명칭')}
                  ${detailTh('작업지시 번호')}
                  ${detailTh('작업지시 내용', 'padding:6px 16px;')}
                  ${detailTh('실적<br>공정률(%)')}
                  ${detailTh('상태')}
                  ${detailTh('계획 착수', 'border-left:2px solid #5a5f65;')}
                  ${detailTh('계획 완료')}
                  ${detailTh('변경 착수', 'border-left:2px solid #5a5f65;')}
                  ${detailTh('변경 완료')}
                  ${detailTh('실적 착수', 'border-left:2px solid #5a5f65;')}
                  ${detailTh('실적 완료')}
                  ${detailTh('공종', 'border-left:2px solid #5a5f65;')}
                  ${detailTh('공정')}
                  ${detailTh('STAGE')}
                  ${detailTh('배차번호<br><span style="font-size:9px;opacity:.8;">(물류오더, 물류번호)</span>', 'border-left:2px solid #5a5f65;')}
                </tr>
              </thead>
              <tbody>
                ${detailStaticRows}
              </tbody>
            </table>
          </div>
          <div style="display:flex;align-items:center;justify-content:space-between;background:#e7eaed;border-top:1px solid #cfd3d7;padding:4px 12px;flex-shrink:0;font-size:11px;color:#4a4f55;">
            <span>총 ${detailRowsData.length}행</span>
            <span style="font-weight:600;">{{ detailSelectedText }}</span>
          </div>
        </div>
      </div>
  <div style="height:22px;background:#1e1f22;border-top:1px solid #000;display:flex;align-items:center;padding:0 12px;font-size:11px;color:#d8dadd;flex-shrink:0;">워크프론트 점검</div>
    </div>`;

// ── 의장 W/F 점검 화면: 선각 상세를 그대로 복제하고 제목과 활성 탭만 의장으로 바꾼다 ──
let workfrontDetailUijangView = workfrontDetailView;
workfrontDetailUijangView = assertReplace(
  workfrontDetailUijangView,
  '<div style="font-size:20px;font-weight:800;color:#222;">선각 W/F 점검</div>',
  '<div style="font-size:20px;font-weight:800;color:#222;">의장 W/F 점검</div>',
  '의장 상세 제목',
);
workfrontDetailUijangView = assertReplace(
  workfrontDetailUijangView,
  '<div style="background:#ed7100;color:#fff;font-size:12.5px;font-weight:700;padding:7px 20px;">선각 W/F 점검</div>',
  '<div style="color:#5a5f65;font-size:12.5px;font-weight:600;padding:7px 20px;">선각 W/F 점검</div>',
  '의장 상세 선각 탭 비활성',
);
workfrontDetailUijangView = assertReplace(
  workfrontDetailUijangView,
  '<div style="color:#5a5f65;font-size:12.5px;font-weight:600;padding:7px 20px;border-left:1px solid #d8dbdf;">의장 W/F 점검</div>',
  '<div style="background:#ed7100;color:#fff;font-size:12.5px;font-weight:700;padding:7px 20px;border-left:1px solid #d8dbdf;">의장 W/F 점검</div>',
  '의장 상세 의장 탭 활성',
);
workfrontDetailUijangView = assertReplace(
  workfrontDetailUijangView,
  detailKpiCard('점검 대상 액티비티', detailActCount, '#ed7100'),
  detailKpiCard('점검 대상 액티비티', 8, '#ed7100'),
  '의장 상세 액티비티 건수',
);
workfrontDetailUijangView = assertReplace(
  workfrontDetailUijangView,
  detailKpiCard('작업지시', detailRepCount, '#0a72f2'),
  detailKpiCard('작업지시', 3, '#0a72f2'),
  '의장 상세 작업지시 건수',
);
workfrontDetailUijangView = assertReplace(
  workfrontDetailUijangView,
  detailKpiCard('정상', detailOkCount, '#2e9e57'),
  detailKpiCard('점검 필요', 8, '#d63b3b'),
  '의장 상세 점검 필요 건수',
);
workfrontDetailUijangView = assertReplace(
  workfrontDetailUijangView,
  detailKpiCard('비정상', detailBadCount, '#d63b3b'),
  detailKpiCard('미착수', 8, '#7a7f85'),
  '의장 상세 미착수 건수',
);

// ── 의장 상세: 계획 ↔ 작업장&설비 탭 전환 ──
// 계획/작업장&설비 탭을 클릭 가능하게 바꾸고, 작업장&설비 탭에는 계획 탭과
// 동일한 표 인터페이스를 행 데이터만 비운 상태로 보여준다.
workfrontDetailUijangView = assertReplace(
  workfrontDetailUijangView,
  '<div style="padding:8px 22px 6px;font-size:13px;font-weight:700;color:#ed7100;border-bottom:3px solid #ed7100;margin-bottom:-2px;">계획</div>',
  '<div data-uijang-tab="plan" role="button" tabIndex="0" onClick="{{ uijangTabPlanClick }}" onKeyDown="{{ uijangTabPlanKey }}" style="{{ uijangPlanTabStyle }}">계획</div>',
  '의장 상세 계획 탭 바인딩',
);
workfrontDetailUijangView = assertReplace(
  workfrontDetailUijangView,
  '<div style="padding:8px 22px 6px;font-size:13px;font-weight:600;color:#7a7f85;">작업장&amp;설비</div>',
  '<div data-uijang-tab="facility" role="button" tabIndex="0" onClick="{{ uijangTabFacilityClick }}" onKeyDown="{{ uijangTabFacilityKey }}" style="{{ uijangFacilityTabStyle }}">작업장&amp;설비</div>',
  '의장 상세 작업장&설비 탭 바인딩',
);

const uijangTableMarker = '<div style="flex:1;display:flex;flex-direction:column;min-height:0;border:1px solid #c9cdd1;border-top:none;background:#fff;">';
const uijangTableStart = workfrontDetailUijangView.indexOf(uijangTableMarker);
if (uijangTableStart < 0) throw new Error('의장 상세 표 블록을 찾지 못했습니다.');
const originalUijangTableBlock = extractBalanced(workfrontDetailUijangView, uijangTableStart, /<div\b[^>]*>/, /<\/div>/);

const uijangRowsData = [
  { seq:'1', wf:'점검 필요', project:'2579', block:'511', actNo:'2579W511GC10C10', actName:'중조의장', rate:'0%', status:'미착수', preRate:'80%', preEnd:'07/25', planStart:'07/27', planEnd:'08/01', postStart:'08/05', actualStart:'-', actualEnd:'-', due:'11/07', workplace:'내업1공장 2bay 서편' },
  { seq:'2', wf:'점검 필요', project:'2579', block:'512', actNo:'2579W512GC10C10', actName:'중조의장', rate:'0%', status:'미착수', preRate:'80%', preEnd:'07/25', planStart:'07/27', planEnd:'08/01', postStart:'08/05', actualStart:'-', actualEnd:'-', due:'11/07', workplace:'내업1공장 2bay 서편' },
  { seq:'3', wf:'점검 필요', project:'2579', block:'501', actNo:'2579W501GA10A10', actName:'대조의장', rate:'0%', status:'미착수', preRate:'90%', preEnd:'07/25', planStart:'07/27', planEnd:'08/15', postStart:'08/16', actualStart:'-', actualEnd:'-', due:'09/01', workplace:'외업1공장' },
  { seq:'4', wf:'점검 필요', project:'2579', block:'502', actNo:'2579W502GA10A10', actName:'대조의장', rate:'0%', status:'미착수', preRate:'90%', preEnd:'07/25', planStart:'07/28', planEnd:'08/06', postStart:'08/07', actualStart:'-', actualEnd:'-', due:'09/01', workplace:'외업1공장' },
  { seq:'5', wf:'점검 필요', project:'2583', block:'50A', actNo:'2583W50AGP10P10', actName:'PE의장', rate:'0%', status:'미착수', preRate:'100%', preEnd:'06/25', planStart:'06/28', planEnd:'07/28', postStart:'08/01', actualStart:'-', actualEnd:'-', due:'08/15', workplace:'PE 2장' },
  { seq:'6', wf:'점검 필요', project:'2583', block:'50B', actNo:'2839W50BGP10P10', actName:'PE의장', rate:'0%', status:'미착수', preRate:'90%', preEnd:'07/28', planStart:'07/30', planEnd:'09/05', postStart:'09/08', actualStart:'-', actualEnd:'-', due:'10/31', workplace:'PE 2장' },
  { seq:'7', wf:'점검 필요', project:'2602', block:'507', actNo:'2602W507GC10C10', actName:'중조의장', rate:'0%', status:'미착수', preRate:'70%', preEnd:'07/28', planStart:'07/30', planEnd:'08/07', postStart:'08/09', actualStart:'-', actualEnd:'-', due:'10/15', workplace:'내업2공장' },
  { seq:'8', wf:'점검 필요', project:'2602', block:'508', actNo:'2602W508GC10C10', actName:'중조의장', rate:'0%', status:'미착수', preRate:'70%', preEnd:'07/28', planStart:'08/01', planEnd:'08/10', postStart:'08/09', actualStart:'-', actualEnd:'-', due:'10/15', workplace:'내업2공장' },
  { seq:'-', wf:'-', project:'2602', block:'508', rep:'S241W511GC10F10F01', work:'SUPPORT/철의 설치', rate:'0%', preRate:'-', planStart:'08/01', planEnd:'08/03', actualStart:'-', actualEnd:'-', due:'10/15', child:true },
  { seq:'-', wf:'-', project:'2602', block:'508', rep:'S241W511GC10F10F02', work:'PIPE 설치', rate:'0%', preRate:'-', planStart:'08/03', planEnd:'08/07', actualStart:'-', actualEnd:'-', due:'10/15', child:true },
  { seq:'-', wf:'-', project:'2602', block:'508', rep:'S241W511GC10F10W03', work:'용접/사상', rate:'0%', preRate:'-', planStart:'08/07', planEnd:'08/10', actualStart:'-', actualEnd:'-', due:'10/15', child:true },
];
const uijangHeaderStyle = 'background:#2f3237;color:#fff;border:1px solid #4a4e53;padding:6px 8px;font-weight:600;white-space:nowrap;line-height:1.25;';
const uijangGroupHeaderStyle = 'background:#2f3237;color:#fff;border:1px solid #4a4e53;border-top:3px solid #ed7100;padding:4px 8px;font-weight:700;';
const uijangCell = (value, align = 'center', groupStart = false) =>
  `<td style="border:1px solid #e6e8ea;${groupStart ? 'border-left:2px solid #c9cdd1;' : ''}padding:5px 8px;text-align:${align};color:#3a3e43;font-variant-numeric:tabular-nums;">${value ?? ''}</td>`;
const uijangStatusPill = (status) => status
  ? `<span style="display:inline-block;background:#7a7f85;color:#fff;font-size:10px;font-weight:700;padding:2px 9px;border-radius:2px;">${status}</span>`
  : '<span style="color:#9aa0a6;">-</span>';
const uijangStaticRows = uijangRowsData.map((r, i) => `<tr style="height:26px;background:${r.child ? '#fff' : '#f4f6f8'};">
                  <td style="border:1px solid #e6e8ea;padding:4px 6px;text-align:center;height:26px;">${detailCheckbox(`{{ detailToggle${i} }}`, `{{ detailBoxBg${i} }}`, `{{ detailOn${i} }}`)}</td>
                  ${uijangCell(r.seq)}
                  ${uijangCell(r.wf === '점검 필요' ? detailWfBadge({ wfNeed:true }) : '')}
                  ${uijangCell(r.project)}
                  ${uijangCell(r.block)}
                  ${uijangCell(r.actNo ? `<span style="font-weight:600;color:#2d2d2d;">${r.actNo}</span>` : '', 'left')}
                  ${uijangCell(r.actName ? `<span style="font-weight:700;color:#2d2d2d;">${r.actName}</span>` : '')}
                  ${uijangCell(r.rep ? `<span style="color:#5a5f65;">${r.rep}</span>` : '', 'left')}
                  ${uijangCell(r.work, 'left')}
                  ${uijangCell(detailRateBar(r.rate))}
                  ${uijangCell(uijangStatusPill(r.status))}
                  ${uijangCell(r.preRate)}
                  ${uijangCell(r.preEnd)}
                  ${uijangCell(r.planStart, 'center', true)}
                  ${uijangCell(r.planEnd)}
                  ${uijangCell(r.postStart, 'center', true)}
                  ${uijangCell(r.actualStart, 'center', true)}
                  ${uijangCell(r.actualEnd)}
                  ${uijangCell(r.due, 'center', true)}
                  ${uijangCell(r.workplace, 'left', true)}
                </tr>`).join('\n                ');

const uijangTableBlock = `<div style="flex:1;display:flex;flex-direction:column;min-height:0;border:1px solid #c9cdd1;border-top:none;background:#fff;">
          <div style="display:flex;align-items:center;justify-content:space-between;background:#e7eaed;border-bottom:1px solid #cfd3d7;padding:5px 12px;flex-shrink:0;">
            <span style="font-size:12px;font-weight:700;color:#3a3e43;">작업지시 점검 목록</span>
            <span style="font-size:11px;color:#7a7f85;">액티비티 8건 · 작업지시 3건 · 실행계획 | 실적 | 납기일 순</span>
          </div>
          <div style="flex:1;overflow:auto;min-height:0;">
            <table style="border-collapse:collapse;font-size:11px;width:100%;white-space:nowrap;">
              <thead style="position:sticky;top:0;z-index:2;">
                <tr>
                  <th rowspan="2" style="${uijangHeaderStyle}padding:5px 6px;">${detailCheckbox('{{ uijangToggleAll }}', '{{ uijangAllBoxBg }}', '{{ uijangAllOn }}')}</th>
                  <th rowspan="2" style="${uijangHeaderStyle}">순번</th>
                  <th rowspan="2" style="${uijangHeaderStyle}">W/F점검<br>상태</th>
                  <th rowspan="2" style="${uijangHeaderStyle}">프로젝트</th>
                  <th rowspan="2" style="${uijangHeaderStyle}">블록</th>
                  <th rowspan="2" style="${uijangHeaderStyle}">실행계획 액티비티 번호</th>
                  <th rowspan="2" style="${uijangHeaderStyle}">액티비티 명칭</th>
                  <th rowspan="2" style="${uijangHeaderStyle}">작업지시 번호</th>
                  <th rowspan="2" style="${uijangHeaderStyle}">작업지시 내용</th>
                  <th rowspan="2" style="${uijangHeaderStyle}">실적<br>공정률<br>(%)</th>
                  <th rowspan="2" style="${uijangHeaderStyle}">상태</th>
                  <th rowspan="2" style="${uijangHeaderStyle}">선공정<br>진행율</th>
                  <th rowspan="2" style="${uijangHeaderStyle}">선공정<br>계획<br>완료일</th>
                  <th colspan="2" style="${uijangGroupHeaderStyle}">실행계획</th>
                  <th rowspan="2" style="${uijangHeaderStyle}">후공정<br>계획<br>착수일</th>
                  <th colspan="2" style="${uijangGroupHeaderStyle}">실적</th>
                  <th style="${uijangGroupHeaderStyle}">납기일</th>
                  <th rowspan="2" style="${uijangHeaderStyle}">작업장</th>
                </tr>
                <tr>
                  <th style="${uijangHeaderStyle}">착수</th>
                  <th style="${uijangHeaderStyle}">완료</th>
                  <th style="${uijangHeaderStyle}">착수</th>
                  <th style="${uijangHeaderStyle}">완료</th>
                  <th style="${uijangHeaderStyle}">오션<br>납기일</th>
                </tr>
              </thead>
              <tbody>${uijangStaticRows}</tbody>
            </table>
          </div>
          <div style="display:flex;align-items:center;justify-content:space-between;background:#e7eaed;border-top:1px solid #cfd3d7;padding:4px 12px;flex-shrink:0;font-size:11px;color:#4a4f55;">
            <span>총 ${uijangRowsData.length}행</span>
            <span style="font-weight:600;">{{ uijangSelectedText }}</span>
          </div>
        </div>`;
workfrontDetailUijangView = assertReplace(
  workfrontDetailUijangView,
  originalUijangTableBlock,
  uijangTableBlock,
  '의장 상세 샘플 데이터 표',
);

const uijangEmptyRows = Array.from(
  { length: 15 },
  () => `<tr style="height:26px;">${'<td style="border:1px solid #e6e8ea;"></td>'.repeat(20)}</tr>`,
).join('\n                ');
let uijangFacilityBlock = uijangTableBlock;
uijangFacilityBlock = assertReplace(uijangFacilityBlock, uijangStaticRows, uijangEmptyRows, '작업장&설비 탭 행 비우기');
uijangFacilityBlock = assertReplace(
  uijangFacilityBlock,
  `<span>총 ${uijangRowsData.length}행</span>`,
  '<span>총 0행</span>',
  '작업장&설비 탭 행 수 표시',
);
uijangFacilityBlock = assertReplace(uijangFacilityBlock, '{{ uijangSelectedText }}', '0건 선택됨', '작업장&설비 탭 선택 수 표시');

workfrontDetailUijangView = assertReplace(
  workfrontDetailUijangView,
  uijangTableBlock,
  `<sc-if value="{{ isUijangPlanTab }}" hint-placeholder-val="{{ true }}">${uijangTableBlock}</sc-if>
        <sc-if value="{{ isUijangFacilityTab }}" hint-placeholder-val="{{ false }}">${uijangFacilityBlock}</sc-if>`,
  '의장 상세 탭 콘텐츠 분기',
);

const toggleMethod = extractMethod(workfrontDetail.template, 'toggle');
const toggleAllMethod = extractMethod(workfrontDetail.template, 'toggleAll');

// 사이드바: 대메뉴 10개 아코디언. 목록 길이를 고정하고 하위 메뉴는
// display 스타일 바인딩으로만 숨겨 구조 변경 없이 토글한다.
const sideItemsMethod = `buildSideItems() {
    const routes = { '의장 주간작업계획 수립': 'chair', '워크프론트 점검': 'workfront-main' };
    const groups = [
      ['실행계획 관리', [['실행계획 조회', 14], ['실행계획 배포 현황', 14]]],
      ['소조', [['소조 기본정보관리', 14], ['소조 Case별 Layout 관리', 20], ['소조 Case별 생산 달력', 20], ['소조 작업계획 수립분석', 14], ['소조 주간작업계획 수립', 20], ['소조 주간작업계획 조회', 20, true], ['소조 정반배치도 조회', 20, true], ['소조 일일 계획 관리', 20, true]]],
      ['중조', [['중조 기본정보관리', 14], ['중조 Case별 Layout 관리', 20], ['중조 Case별 생산 달력', 20], ['중조 작업계획 수립분석', 14], ['중조 주간작업계획 수립', 20], ['중조 주간작업계획 조회', 20, true], ['중조 정반배치도 조회', 20, true], ['중조 일일 계획 관리', 20, true]]],
      ['주판론지', [['주판론지 기본정보관리', 14], ['주판론지 작업계획 수립분석', 14], ['주판론지 일일 계획 관리', 20, true]]],
      ['대조', [['대조 기본정보관리', 14], ['대조 작업계획 수립분석', 14], ['대조 주간작업계획 수립', 20], ['대조 주간작업계획 조회', 20, true], ['대조 장반배치도 조회', 20, true], ['대조 일일 계획 관리', 20, true]]],
      ['의장', [['의장 기본정보관리', 14], ['의장 Case별 Layout 관리', 20], ['의장 Case별 생산 실적', 20], ['의장 작업계획 수립분석', 14], ['의장 주간작업계획 수립', 20], ['의장 주간작업계획 조회', 20, true], ['의장 장반배치도 조회', 20, true], ['의장 일일 계획 관리', 20, true]]],
      ['도장', [['도장 기본정보관리', 14], ['도장 작업계획 수립분석', 14], ['도장 주간작업계획 수립', 20], ['도장 주간작업계획 조회', 20, true], ['도장 장반배치도 조회', 20, true], ['도장 일일 계획 관리', 20, true]]],
      ['PE', [['PE 기본정보관리', 14], ['PE 작업계획 수립분석', 14], ['PE 일일 계획 관리', 20, true]]],
      ['워크프론트', [['워크프론트 점검', 14]]],
      ['시스템 관리', [['공통코드 관리', 14], ['사용자 관리', 14], ['메뉴 관리', 14], ['롤 관리', 14], ['프로그램 사용 현황', 14], ['프로그램 사용 집계', 14]]],
    ];
    const view = this.state.view;
    const active = view === 'chair' ? '의장 주간작업계획 수립' : view.startsWith('workfront') ? '워크프론트 점검' : '';
    const items = [];
    for (const [group, children] of groups) {
      const open = !!this.state.openGroups[group];
      items.push({
        label: group + (open ? ' ▾' : ' ▸'),
        style: 'background:#4b5158;color:#eef0f2;font-size:12.5px;font-weight:700;text-align:center;padding:8px 0;border-top:1px solid #2f3439;border-bottom:1px solid #2f3439;cursor:pointer;user-select:none;',
        role: 'button',
        tabIndex: 0,
        onClick: () => this.toggleGroup(group),
        onKeyDown: (event) => this.handleGroupKey(event, group),
      });
      for (const [label, indent, dim] of children) {
        const route = routes[label];
        const hidden = open ? '' : 'display:none;';
        let style;
        if (label === active) {
          style = hidden + 'padding:6px 0 7px 20px;font-size:11px;color:#ffd9b0;font-weight:700;background:rgba(237,113,0,.18);border-left:3px solid #ed7100;';
        } else if (dim) {
          style = hidden + 'padding:5px 0 6px ' + indent + 'px;font-size:11px;color:#8b9096;font-style:italic;';
        } else {
          style = hidden + 'padding:5px 0 6px ' + indent + 'px;font-size:11px;color:#c3c8cd;';
        }
        if (route) style += 'cursor:pointer;';
        items.push({
          label,
          style,
          route,
          role: route ? 'button' : undefined,
          tabIndex: route ? 0 : undefined,
          onClick: route ? () => this.navigate(route) : undefined,
          onKeyDown: route ? (event) => this.handleRouteKey(event, route) : undefined,
        });
      }
    }
    return items;
  }`;

const componentSource = `class Component extends DCLogic {
  state = {
    view: ['chair', 'workfront-main', 'workfront-detail', 'workfront-detail-uijang'].includes(window.location.hash.slice(1))
      ? window.location.hash.slice(1)
      : 'home',
    checked: {},
    env: { weekly: true, gantt: true, load: false, layout: true },
    openGroups: {},
    uijangTab: 'plan',
  };

  ownerGroup(view) {
    if (view === 'chair') return '의장';
    if (view.startsWith('workfront')) return '워크프론트';
    return null;
  }

  openGroupsFor(view, openGroups) {
    const owner = this.ownerGroup(view);
    return owner ? { ...openGroups, [owner]: true } : openGroups;
  }

  componentDidMount() {
    this.syncFromLocation = () => {
      const hash = window.location.hash.slice(1);
      const view = ['chair', 'workfront-main', 'workfront-detail', 'workfront-detail-uijang'].includes(hash) ? hash : 'home';
      if (view !== this.state.view) {
        this.setState({ view, openGroups: this.openGroupsFor(view, this.state.openGroups) });
      }
    };
    window.addEventListener('popstate', this.syncFromLocation);
    if (this.state.view !== 'home') {
      this.setState({ openGroups: this.openGroupsFor(this.state.view, this.state.openGroups) });
    }
  }

  componentWillUnmount() {
    window.removeEventListener('popstate', this.syncFromLocation);
  }

  toggleGroup(name) {
    this.setState({ openGroups: { ...this.state.openGroups, [name]: !this.state.openGroups[name] } });
  }

  handleGroupKey(event, name) {
    if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault();
      this.toggleGroup(name);
    }
  }

  navigate(view) {
    if (view === this.state.view) return;
    const url = new URL(window.location.href);
    url.hash = view === 'home' ? '' : view;
    window.history.pushState({}, '', url);
    this.setState({ view, openGroups: this.openGroupsFor(view, this.state.openGroups) });
  }

  handleRouteKey(event, route) {
    if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault();
      this.navigate(route);
    }
  }

  setUijangTab(tab) {
    if (tab !== this.state.uijangTab) this.setState({ uijangTab: tab });
  }

  handleUijangTabKey(event, tab) {
    if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault();
      this.setUijangTab(tab);
    }
  }

  buildUijangTabVals() {
    const active = 'padding:8px 22px 6px;font-size:13px;font-weight:700;color:#ed7100;border-bottom:3px solid #ed7100;margin-bottom:-2px;cursor:pointer;user-select:none;';
    const idle = 'padding:8px 22px 6px;font-size:13px;font-weight:600;color:#7a7f85;cursor:pointer;user-select:none;';
    const onFacility = this.state.uijangTab === 'facility';
    return {
      isUijangPlanTab: !onFacility,
      isUijangFacilityTab: onFacility,
      uijangPlanTabStyle: onFacility ? idle : active,
      uijangFacilityTabStyle: onFacility ? active : idle,
      uijangTabPlanClick: () => this.setUijangTab('plan'),
      uijangTabFacilityClick: () => this.setUijangTab('facility'),
      uijangTabPlanKey: (event) => this.handleUijangTabKey(event, 'plan'),
      uijangTabFacilityKey: (event) => this.handleUijangTabKey(event, 'facility'),
    };
  }

  toggleEnv(key) {
    this.setState({ env: { ...this.state.env, [key]: !this.state.env[key] } });
  }

  handleEnvKey(event, key) {
    if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault();
      this.toggleEnv(key);
    }
  }

  buildEnvItems() {
    const defs = [
      ['weekly', '주간작업물량'],
      ['gantt', 'Gantt Chart'],
      ['load', '부하 그래프'],
      ['layout', '정반블록배치'],
    ];
    return defs.map(([key, label]) => {
      const on = this.state.env[key];
      return {
        key,
        label,
        on,
        ariaChecked: on ? 'true' : 'false',
        tick: on ? '✓' : '',
        boxStyle: on
          ? 'display:inline-flex;align-items:center;justify-content:center;width:14px;height:14px;background:#ed7100;border:1px solid #c95d00;border-radius:2px;color:#fff;font-size:10px;'
          : 'display:inline-flex;width:14px;height:14px;background:#fff;border:1px solid var(--line);border-radius:2px;',
        labelStyle:
          'display:flex;align-items:center;gap:3px;cursor:pointer;user-select:none;' +
          (on ? '' : 'color:#7a7f85;'),
        onClick: () => this.toggleEnv(key),
        onKeyDown: (event) => this.handleEnvKey(event, key),
      };
    });
  }

  ${toggleMethod}
  ${toggleAllMethod}

  toggleUijangAll() {
    this.setState((state) => {
      const checked = { ...state.checked };
      const allOn = Array.from({ length: 11 }, (_, index) => !!checked[index]).every(Boolean);
      for (let index = 0; index < 11; index += 1) checked[index] = !allOn;
      return { checked };
    });
  }

  renderVals() {
    const view = this.state.view;
    const env = this.state.env;
    const chairVals = this.buildChairData();
    const weeklyTotal = chairVals.ltrows.length;
    return {
      ...chairVals,
      ...this.buildWorkfrontMainData(),
      ...this.buildWorkfrontDetailData(),
      envItems: this.buildEnvItems(),
      weeklyRowDisplay: env.weekly ? '' : 'none',
      showGantt: env.gantt,
      ltRecordText: env.weekly ? \`Record 1 of \${weeklyTotal}\` : 'Record 0 of 0',
      isHome: view === 'home',
      isChair: view === 'chair',
      isWorkfrontMain: view === 'workfront-main',
      isWorkfrontDetail: view === 'workfront-detail',
      isWorkfrontDetailUijang: view === 'workfront-detail-uijang',
      ...this.buildUijangTabVals(),
      footerTitle: view === 'chair' ? '의장 주간작업계획 수립(PPHA_C210)' : view === 'home' ? 'SF-POS' : '워크프론트 점검',
      sideItems: this.buildSideItems(),
      openWorkfrontDetail: () => this.navigate('workfront-detail'),
      openWorkfrontDetailKey: (event) => this.handleRouteKey(event, 'workfront-detail'),
      openWorkfrontDetailUijang: () => this.navigate('workfront-detail-uijang'),
      openWorkfrontDetailUijangKey: (event) => this.handleRouteKey(event, 'workfront-detail-uijang'),
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

// ── SF-POS 메인(홈) 화면 ──
const heroPath = path.join(pagesDir, 'assets', 'main-hero.jpg');
if (!fs.existsSync(heroPath)) throw new Error('메인 히어로 이미지가 없습니다: prototype-pages/assets/main-hero.jpg');
const heroDataUri = `data:image/jpeg;base64,${fs.readFileSync(heroPath).toString('base64')}`;

const homeCard = (icon, line1, line2) =>
  `<div style="width:152px;background:#f7f8f9;padding:30px 0 18px;text-align:center;">
              <i class="ti ${icon}" style="font-size:46px;color:#c96100;"></i>
              <div style="font-size:13px;color:#5a5f65;line-height:1.5;margin-top:16px;">${line1}<br>${line2}</div>
              <div style="width:24px;height:3px;background:#ed7100;margin:16px auto 0;"></div>
            </div>`;

const homeView = `<div style="flex:1;display:flex;flex-direction:column;min-width:0;background:#fff;">
      <div style="flex:1;position:relative;min-height:0;overflow:hidden;">
        <img src="${heroDataUri}" alt="" style="position:absolute;top:0;right:0;width:68%;height:100%;object-fit:cover;object-position:center;">
        <div style="position:absolute;inset:0;background:linear-gradient(90deg,#ffffff 0%,#ffffff 40%,rgba(255,255,255,.6) 56%,rgba(255,255,255,0) 76%);"></div>

        <div style="position:relative;height:100%;display:flex;flex-direction:column;padding:56px 0 0 64px;">
          <div style="font-size:54px;font-weight:800;letter-spacing:-1.5px;color:#1e1e1e;line-height:1;">SF-POS</div>
          <div style="width:36px;height:3px;background:#c9cdd1;margin:22px 0 24px;"></div>
          <div style="font-size:18px;color:#b0b5ba;line-height:1.6;">Smart Factory<br>Assembly Placement and Planning Operation System</div>
          <div style="display:flex;gap:14px;margin-top:44px;">
            ${homeCard('ti-robot', 'Assembly', 'Management')}
            ${homeCard('ti-calendar-stats', 'Planning', 'Management')}
            ${homeCard('ti-settings', 'System', 'Management')}
          </div>
        </div>
      </div>
  <div style="height:22px;background:#1e1f22;border-top:1px solid #000;display:flex;align-items:center;padding:0 12px;font-size:11px;color:#d8dadd;flex-shrink:0;">SF-POS 메인</div>
    </div>`;

const unifiedViews = `<!-- unified-navigation:start -->
    <sc-if value="{{ isHome }}" hint-placeholder-val="{{ true }}">
      ${homeView}
    </sc-if>
    <sc-if value="{{ isChair }}" hint-placeholder-val="{{ false }}">
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
    <sc-if value="{{ isWorkfrontDetailUijang }}" hint-placeholder-val="{{ false }}">
      ${workfrontDetailUijangView}
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

if (!unifiedTemplate.includes('[data-env]:focus-visible')) {
  unifiedTemplate = assertReplace(
    unifiedTemplate,
    '[data-route]:focus-visible{outline:2px solid #0a72f2;outline-offset:-2px;}',
    '[data-route]:focus-visible,[data-env]:focus-visible{outline:2px solid #0a72f2;outline-offset:-2px;}',
    '포커스 링 스타일',
  );
}

// ── 디자인 폴리시: 데스크톱 애플리케이션 질감 ──
// 공통 명령 버튼에 클래스를 부여해 hover/active 상태를 CSS로 제어한다.
unifiedTemplate = unifiedTemplate.replaceAll(
  '<span style="display:inline-flex;align-items:center;gap:4px;background:linear-gradient(#fcfdfe,#e9edf1);',
  '<span class="sf-btn" style="display:inline-flex;align-items:center;gap:4px;background:linear-gradient(#fcfdfe,#e9edf1);',
);
// 간트 막대 라벨: 22px 굵은 글자를 표 밀도에 맞는 크기로 정돈한다.
unifiedTemplate = unifiedTemplate.replaceAll(
  'font-weight:800;font-size:22px;border:1px solid rgba(0,0,0,.22);',
  'font-weight:700;font-size:13px;letter-spacing:.2px;border:1px solid rgba(0,0,0,.28);',
);
// 정반 블록 배치 툴바: 과대 타이포를 업무 화면 밀도에 맞춘다.
unifiedTemplate = unifiedTemplate.replaceAll(
  'font-size:20px;font-weight:800;color:#e8451c;',
  'font-size:15px;font-weight:700;color:#e8451c;',
);
unifiedTemplate = unifiedTemplate.replaceAll(
  'font-size:18px;font-weight:800;color:#e8451c;',
  'font-size:14px;font-weight:700;color:#e8451c;',
);

const polishCss = `
/* desktop-polish: 상태 변화는 즉시 전환(무애니메이션), 그림자 없이 명도만 사용 */
::-webkit-scrollbar{width:10px;height:10px;}
::-webkit-scrollbar-thumb{background:#b0b5ba;border:2px solid #e7eaed;border-radius:5px;}
::-webkit-scrollbar-thumb:hover{background:#8a9099;}
::-webkit-scrollbar-track{background:#e7eaed;}
::-webkit-scrollbar-corner{background:#e7eaed;}
*{scrollbar-width:thin;scrollbar-color:#b0b5ba #e7eaed;}
::selection{background:#ed7100;color:#fff;}
body{letter-spacing:-0.1px;}
.sf-btn{cursor:pointer;user-select:none;}
.sf-btn:hover{filter:brightness(.96);}
.sf-btn:active{filter:brightness(.9);}
[data-route]{user-select:none;}
[data-route]:hover{filter:brightness(1.12);}
[data-env]:hover{filter:brightness(.94);}
tbody tr:hover td{background-color:rgba(10,114,242,.05);}
`;
if (!unifiedTemplate.includes('desktop-polish')) {
  unifiedTemplate = assertReplace(
    unifiedTemplate,
    '[data-route]:focus-visible,[data-env]:focus-visible{outline:2px solid #0a72f2;outline-offset:-2px;}',
    `[data-route]:focus-visible,[data-env]:focus-visible{outline:2px solid #0a72f2;outline-offset:-2px;}${polishCss}`,
    '데스크톱 폴리시 스타일',
  );
}

// ── 부트 커버: 문서 교체 직후 ~ React 마운트 완료 사이의 흰 화면 방지 ──
// 언패커가 documentElement를 통째로 교체하면 로더의 다크 화면이 사라지고,
// 새 문서는 런타임이 #dc-root에 마운트할 때까지 빈 배경만 보인다. 로더와
// 동일한 다크 커버를 새 문서에도 깔아두고, 마운트가 확인되면 페이드아웃한다.
const bootCover = [
  '<div id="__sf_boot_cover" style="position:fixed;inset:0;z-index:100000;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:26px;background:#17181b;opacity:1;transition:opacity .18s ease;">',
  '<div style="font:italic 800 40px/1 -apple-system,BlinkMacSystemFont,sans-serif;letter-spacing:-1px;color:#ed7100;">SF-POS</div>',
  '<div style="box-sizing:border-box;width:26px;height:26px;border-radius:50%;border:3px solid rgba(255,255,255,.1);border-top-color:rgba(237,113,0,.75);animation:__sf_boot_spin .9s linear infinite;"></div>',
  '</div>',
  '<style>@keyframes __sf_boot_spin{to{transform:rotate(360deg)}}</style>',
  '<script>(function(){',
  'var cover=document.getElementById("__sf_boot_cover");if(!cover)return;var done=false;',
  'function hide(){if(done)return;done=true;requestAnimationFrame(function(){requestAnimationFrame(function(){cover.style.opacity="0";setTimeout(function(){cover.remove();},220);});});}',
  'var t=setInterval(function(){var r=document.getElementById("dc-root");if(r&&r.firstElementChild){clearInterval(t);hide();}},50);',
  'setTimeout(function(){clearInterval(t);hide();},8000);',
  '})();</script>',
].join('');
if (!unifiedTemplate.includes('__sf_boot_cover')) {
  unifiedTemplate = assertReplace(unifiedTemplate, '<body>', `<body>${bootCover}`, '부트 커버');
}

unifiedTemplate = replaceComponentScript(unifiedTemplate, componentSource);

const encodedTemplate = JSON.stringify(unifiedTemplate).replace(/<\/script/gi, '<\\/script');
let output = chair.bundle.replace(chair.json, encodedTemplate);
output = output.replace('<title>Bundled Page</title>', '<title>SF-POS</title>');

// ── 로딩 화면: 색 블록 SVG 스케치 → 다크 배경 + 은은한 스피너 ──
output = assertReplace(
  output,
  'body { background: #dfe2e5; display: flex;',
  'body { background: #17181b; display: flex;',
  '로딩 화면 body 배경',
);
output = assertReplace(
  output,
  '#__bundler_loading { position: fixed; bottom: 20px; right: 20px; font: 13px/1.4 -apple-system, BlinkMacSystemFont, sans-serif; color: #666; background: #fff; padding: 8px 14px; border-radius: 8px; box-shadow: 0 1px 4px rgba(0,0,0,0.12); z-index: 10000; }',
  '#__bundler_loading { position: fixed; bottom: 20px; right: 20px; font: 13px/1.4 -apple-system, BlinkMacSystemFont, sans-serif; color: #9aa0a6; background: #232529; padding: 8px 14px; border-radius: 8px; z-index: 10000; }',
  '로딩 상태 토스트 스타일',
);
output = assertReplace(
  output,
  '#__bundler_thumbnail { position: fixed; inset: 0; width: 100%; height: 100%; display: flex; align-items: center; justify-content: center; background: #dfe2e5; z-index: 9999; }\n    #__bundler_thumbnail svg { width: 100%; height: 100%; object-fit: contain; }',
  [
    '#__bundler_thumbnail { position: fixed; inset: 0; display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 26px; background: #17181b; z-index: 9999; }',
    '    #__bundler_thumbnail .__bundler_logo { font: italic 800 40px/1 -apple-system, BlinkMacSystemFont, sans-serif; letter-spacing: -1px; color: #ed7100; }',
    '    #__bundler_thumbnail .__bundler_spinner { width: 26px; height: 26px; border-radius: 50%; border: 3px solid rgba(255,255,255,0.1); border-top-color: rgba(237,113,0,0.75); animation: __bundler_spin 0.9s linear infinite; }',
    '    @keyframes __bundler_spin { to { transform: rotate(360deg); } }',
  ].join('\n'),
  '로딩 썸네일 스타일',
);
const thumbnailPattern = /<div id="__bundler_thumbnail">\s*<svg[\s\S]*?<\/svg>\s*<\/div>/;
if (!thumbnailPattern.test(output)) throw new Error('교체 대상을 찾을 수 없습니다: 로딩 썸네일 마크업');
output = output.replace(
  thumbnailPattern,
  '<div id="__bundler_thumbnail"><div class="__bundler_logo">SF-POS</div><div class="__bundler_spinner"></div></div>',
);

fs.writeFileSync(outputPath, output);

console.log(`통합 HTML 생성 완료: ${path.basename(outputPath)}`);
