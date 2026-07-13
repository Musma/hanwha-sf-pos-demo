# SF-POS Design Contract

## 1. Atmosphere / signature

조선 생산계획용 데스크톱 업무 시스템의 높은 정보 밀도와 즉시성을 유지한다. 어두운 애플리케이션 크롬, 밝은 작업 영역, 주황색 브랜드 포인트, 얇은 표 경계가 한 화면 안에서 일관되게 이어지는 것이 핵심이다.

## 2. Color

- `--color-brand: #ed7100`: SF-POS 로고, 활성 메뉴 경계, 핵심 강조색
- `--color-brand-hover: #d15700`: 링크 hover
- `--color-app-titlebar: #22262c`: 최상단 타이틀바
- `--color-sidebar: #3b4046`: 사이드바 배경
- `--color-sidebar-header: #4b5158`: 사이드바 그룹 헤더
- `--color-sidebar-search: #2b2f34`: 사이드바 검색 영역
- `--color-workspace: #dfe2e5`: 의장 화면 작업영역
- `--color-panel: #eef0f2`: 조회조건 및 워크프론트 배경
- `--color-header-cell: #e7eaed`: 표 헤더
- `--color-surface: #ffffff`: 카드 및 표 표면
- `--color-foreground: #2d2d2d`: 기본 텍스트
- `--color-muted: #7a7f85`: 보조 텍스트
- `--color-border: #b9bec3`: 기본 경계
- `--color-link: #0a72f2`: 링크와 focus ring
- `--color-success: #2e9e57`: 정상 상태
- `--color-danger: #d63b3b`: 비정상 상태
- `--color-workfront: #6e5c4c`: 워크프론트 선택 버튼
- `--color-workfront-active: #c0261d`: 워크프론트 활성 버튼
- `--color-statusbar: #1e1f22`: 하단 상태 표시줄

- `#f5d647`: 간트 막대·정반 블록의 계획(노랑) 상태색. 원색 `#ffe000`을 대체한다.
- `#15171b`: 정반 블록 배치 캔버스 배경. 순검정 `#000000`을 대체한다.
- `#ff5a4e`: 다크 캔버스 위 실적 라벨 텍스트. `#e40c01`을 대체한다.

기존 세 화면을 시각 변경 없이 합치기 위해 아래 색상을 읽기 전용 호환 팔레트로 인정한다. 새 컴포넌트에는 위의 의미 기반 토큰을 우선 사용한다.

`#000000 #0067c0 #008233 #0a5cc0 #0a72f2 #112233 #1a2fc0 #1a8f45 #1e1f22 #20222a #20c05a #222222 #22262c #23272c #2a1215 #2b2f34 #2d2d2d #2e9e57 #2f3237 #2f3439 #3a3e43 #3b4046 #3f4348 #45494d #4a4e53 #4a4f55 #4b5158 #555555 #5a5d60 #5a5f65 #5b6167 #5c2b2e #666666 #6a6e73 #6a6f74 #6e5c4c #6ed890 #7a7f85 #85888c #8a8f95 #8a9099 #8b9096 #8b9198 #999999 #9aa0a6 #a8adb2 #a8c8ef #aeb4bb #b0b5ba #b4b7bb #b6bbc0 #b9bec3 #c0261d #c3c8cd #c4c8cd #c4c9ce #c62d2d #c6c9cc #c6cbd1 #c7ccd2 #c95d00 #c96100 #c9cdd1 #ccd0d4 #cfd3d7 #d15700 #d4d7da #d63b3b #d6dade #d8dadd #d8dbdf #dfe2e5 #e08000 #e0a12b #e24a52 #e2e4e6 #e40c01 #e4e6e8 #e58a2a #e6e8ea #e7eaed #e8451c #e9ebed #e9edf1 #eceef0 #eceef1 #ed7100 #edeff1 #eef0f2 #f10a00 #f2f3f4 #f4f6f8 #f5e2d6 #fbfcfd #fcfdfe #ff8a80 #ffd9b0 #ffe000 #ffffff`

기본 텍스트와 표면의 대비는 4.5:1 이상을 유지한다. 흰색 텍스트를 쓰는 상태색은 굵은 12px 이상 라벨에만 사용한다.

## 3. Typography

- 글꼴: `Pretendard, -apple-system, BlinkMacSystemFont, sans-serif`
- 앱 로고: 24px / 800 / 1 / -1px
- 화면 제목: 22px 또는 24px / 800 / 1.2 / 0
- 섹션 제목: 13px 또는 14px / 700 / 1.3 / 0
- 본문: 12px / 400 / 1.4 / 0
- 표: 10.5px 또는 12px / 400 / 1.35 / 0
- 보조 라벨: 11px / 400 또는 600 / 1.3 / 0
- 툴바 강조 수치(기준일·착수·반출 등): 14px 또는 15px / 700. 18px를 넘는 본문 강조 텍스트는 두지 않는다.
- 간트 막대 라벨: 13px / 700 / letter-spacing 0.2px
- 본문 전역 letter-spacing: -0.1px

## 4. Spacing

Base unit: 1px. 기존 세 화면의 3px, 5px 같은 광학 보정값을 그대로 보존하기 위한 호환 단위다. 새 레이아웃은 2px 배수 눈금을 우선 사용한다.

- `--space-1: 2px`
- `--space-2: 4px`
- `--space-3: 6px`
- `--space-4: 8px`
- `--space-5: 10px`
- `--space-6: 12px`
- `--space-7: 14px`
- `--space-8: 16px`
- `--space-9: 18px`
- `--space-10: 20px`
- `--space-11: 22px`
- `--space-12: 24px`
- `--space-13: 26px`

## 5. Components

- 사이드바 메뉴: 높이는 콘텐츠 기준 22px 전후, 좌측 들여쓰기 14px 또는 20px, 활성 항목은 주황색 3px 좌측 경계와 반투명 배경을 사용한다.
- 사이드바 대메뉴: 실행계획 관리·소조·중조·주판론지·대조·의장·도장·PE·워크프론트·시스템 관리 10개 아코디언으로 구성한다. 초기 상태는 전부 접힘이며, 라벨 우측 ▸/▾로 상태를 표시하고 클릭 또는 Enter/Space로 토글한다. 화면 진입 시 해당 화면이 속한 대메뉴는 자동으로 펼친다.
- 클릭 가능한 사이드바 메뉴: 기존 모양을 유지하고 pointer cursor와 2px 파란 focus ring을 제공한다.
- 메인(홈) 화면: 최초 진입 화면. 흰 배경 좌측에 54px/800 SF-POS 타이틀, 36px 회색(`#c9cdd1`) 대시, 18px 보조색 서브타이틀 2줄, 3개 모듈 카드(`#f7f8f9` 표면, 46px 주황 계열 아이콘, 13px 라벨, 24px 주황 대시)를 두고, 우측 68%는 조선소 디지털트윈 렌더 이미지(`prototype-pages/assets/main-hero.jpg`, data URI 임베드)를 흰색 그라디언트로 블렌딩하여 채운다.
- 공통 명령 버튼(`.sf-btn`): 밝은 그라디언트 표면, pointer cursor, hover는 `brightness(.96)`, active는 `brightness(.9)`로 즉시 반응한다. 비활성 버튼에는 클래스와 상태 반응을 두지 않는다.
- 프라이머리 버튼: 브랜드 주황(`#ed7100`) 배경, `#c95d00` 경계, 흰색 12px/700 텍스트. 화면당 하나만 둔다.
- 세그먼트 컨트롤: 흰 표면과 1px 경계 안에서 활성 항목만 주황 배경·흰 텍스트를 사용한다.
- 카테고리 탭: 활성 탭은 주황 텍스트와 3px 주황 하단 경계, 비활성 탭은 `#7a7f85` 텍스트를 사용한다.
- KPI 카드: 흰 표면, 1px 경계, 상태색 3px 좌측 경계, 라벨 11px 보조색 + 수치 19px/800.
- 상태 배지: 점검 필요/점검 확정은 상태색 1px 경계 + 7% 틴트 배경 + 10px/700 텍스트, 정상/비정상은 상태색 솔리드 배경 + 흰 텍스트 pill을 사용한다.
- 공정률 표시: 52px×7px 트랙(`#e7eaed`)에 녹색(`#2e9e57`) 채움 막대와 10px/700 수치를 나란히 둔다.
- 표 그룹 경계: 계획·변경·실적 일정 그룹의 시작 열에 2px 세로 경계를 사용한다.
- 계층 행: 상위(액티비티) 행은 `#f4f6f8` 배경과 700 굵기 명칭, 하위(작업지시) 행은 흰 배경을 사용한다.
- 표 본문 행: hover 시 `rgba(10,114,242,.05)` 배경으로 현재 행을 표시한다.
- 스크롤바: 10px 두께, `#b0b5ba` thumb과 `#e7eaed` track의 커스텀 스크롤바를 사용한다.
- 텍스트 선택: 브랜드 주황 배경(`#ed7100`)에 흰 글자를 사용한다.
- 워크프론트 진입 버튼: 갈색 배경, 흰색 14px/700 텍스트, 9px 20px padding, 5px radius를 사용한다.
- 패널: 흰색 표면, 1px 회색 경계, 4px radius를 사용한다.
- 표: 1px 경계, 짙은 회색 헤더, 상태별 녹색·빨간색·주황색 텍스트를 사용한다.
- 비활성 메뉴: 클릭 핸들러, 링크, 키보드 tab stop을 모두 두지 않는다.

## 6. Motion

화면 전환은 즉시 이루어지며 애니메이션을 사용하지 않는다. 사용자의 `prefers-reduced-motion` 설정과 무관하게 움직이는 레이아웃이 없어야 한다. hover·active 상태 변화도 transition 없이 즉시 전환한다.

## 7. Depth

깊이는 그림자보다 배경 명도와 1px 경계로 표현한다. 기존 체크박스 내부의 작은 inset shadow 외에는 새 그림자를 추가하지 않는다.
