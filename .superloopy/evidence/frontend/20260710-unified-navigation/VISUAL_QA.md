# Visual QA

## 결과

기존 세 화면의 구조와 시각 스타일을 변경하지 않고 하나의 공통 헤더 및 사이드바 안에서 전환하도록 통합했다.

- 의장 화면 기준 캡처: `screenshots/standalone-check.png` (924×540)
- 워크프론트 메인 기준 캡처: `screenshots/wf-standalone-check.png` (924×540)
- 워크프론트 상세 기준 캡처: `screenshots/wf-sub-standalone-check.png` (924×540)
- 세 캡처에서 헤더, 188px 사이드바, 작업영역, 하단 상태 표시줄이 같은 좌표 체계를 사용함을 확인했다.
- 새 라우팅은 화면 DOM을 재사용하며 기존 인라인 스타일을 수정하지 않는다.

## 인터랙션

- 사이드바에서 `의장 주간작업계획 수립`, `워크프론트 점검`만 route, click, Enter, Space 동작을 가진다.
- 다른 사이드바 항목은 route, click handler, tab stop이 없다.
- 워크프론트 메인의 `선각 W/F 점검` 버튼으로 상세 화면에 진입한다.
- 브라우저 뒤로가기를 위한 `popstate` 동기화를 포함했다.
- 상세 화면 체크박스 상태는 화면 전환 상태와 함께 유지된다.

## Anti-slop pre-flight

- 보라색 glow, beige/brass, glassmorphism, 새 카드 조합을 추가하지 않았다.
- 새 em dash 문자가 없다.
- 기존 Pretendard 업무 시스템 타이포그래피를 유지했다.
- 색상, 간격, focus 상태는 `DESIGN.md`에 선언했다.
- 새 모션이 없어 reduced-motion 예외가 없다.
- 빈 상태와 데이터 상태는 원본 화면을 그대로 보존했다.

## 제한

인앱 브라우저가 로컬 미리보기 주소에 연결되지 않아 390px, 768px, 1280px 실시간 재캡처는 수행하지 못했다. 대신 기존 924×540 렌더 캡처 세 장을 직접 확인하고, 통합 템플릿 문법·라우팅 상태 전환·반복 빌드 동일성을 자동 검증했다.

