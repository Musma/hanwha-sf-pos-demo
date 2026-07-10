# Visual QA

## 결과

- 통합 화면 DOM, 스타일, 데이터와 라우팅 코드는 이전 검증본과 동일한 SHA-256 결과를 유지한다.
- 루트에는 `index.html` 하나만 남아 있다.
- `index.html`은 리다이렉트가 아닌 26MB 자체 포함 번들이다.
- 기존 화면 원본은 `prototype-pages/`로 이동했고 배포 파일에서 참조하지 않는다.
- 기존 캡처 `screenshots/standalone-check.png`, `screenshots/wf-standalone-check.png`, `screenshots/wf-sub-standalone-check.png`의 UI를 그대로 유지한다.

## 검증

- 의장, 워크프론트 메인, 워크프론트 상세 상태 전환 통과
- 활성 사이드바 라우트 두 개 제한 통과
- 상세 체크박스 상태 유지 통과
- 반복 빌드 해시 동일성 통과
- 루트 HTML 한 개 제한 통과
- 자체 포함 리소스 manifest 확인

## 제한

이번 변경은 파일 배치와 배포 진입점만 수정했으며 시각 코드에는 변화가 없다. 로컬 인앱 브라우저 연결 제한 때문에 신규 화면 캡처는 수행하지 않았다.

