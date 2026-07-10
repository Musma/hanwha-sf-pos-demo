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
    return { ...detailChecks, detailSelectedText: detailSelected + '건 선택됨', detailRows: rows, allOn, allBoxBg: allOn ? '#0067c0' : '#fff', toggleAll: ()=>this.toggleAll() };`,
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
    env: { weekly: true, gantt: true, load: false, layout: true },
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

unifiedTemplate = replaceComponentScript(unifiedTemplate, componentSource);

const encodedTemplate = JSON.stringify(unifiedTemplate).replace(/<\/script/gi, '<\\/script');
let output = chair.bundle.replace(chair.json, encodedTemplate);
output = output.replace('<title>Bundled Page</title>', '<title>SF-POS</title>');
fs.writeFileSync(outputPath, output);

console.log(`통합 HTML 생성 완료: ${path.basename(outputPath)}`);
