# 운동 첫걸음 · undong-plan

운동 초보자가 운동 부위와 기구 이름, 기본 사용법을 찾아보는 웹 화면입니다.

현재는 **부위 탐색·기구 검색·운동 상세** 3개 기능을 구현했습니다. HTML·CSS·JavaScript로 구성하며, 별도 설치나 빌드 없이 `index.html`을 브라우저에서 직접 엽니다.

## 구현한 기능

| 기능 | 제공 내용 |
| --- | --- |
| 부위 탐색 | 전체 또는 부위를 선택하면 연결된 운동과 필요한 기구 표시. 미등록 부위는 빈 결과 안내 |
| 기구 검색·상세 | 한글·영문 이름과 별칭으로 부분 검색, 검색 초기화, 빈 결과 안내, 기구 설명과 관련 운동 조회 |
| 운동 상세 | 부위·기구·사용 순서·주의점·출처·확인일·검수 대기 상태 표시. 상세 간 이동과 닫기 지원 |

- 부위 분류: 가슴, 등, 하체, 엉덩이, 어깨, 팔, 복부.
- 초기 기구와 운동: 체스트 프레스, 랫 풀다운, 레그 프레스 각 3개.
- 어깨·팔·복부 운동은 아직 등록하지 않았습니다. 레그 프레스는 하체와 엉덩이에서 확인할 수 있습니다.
- 검색은 최대 50자이며 영문 대소문자를 구분하지 않습니다. 빈 입력은 전체 기구를 표시합니다.
- 화면 전환과 상세 닫기 후에는 현재 입력을 유지합니다. 새로고침하면 전체 목록으로 시작합니다.
- <img width="319" height="2167" alt="image" src="https://github.com/user-attachments/assets/098041ca-de27-46d7-9129-c31d8053e044" />


## 실행 방법

저장소를 내려받거나 복제한 뒤 프로젝트 폴더로 이동합니다. Git으로 복제하려면 다음 명령을 사용합니다.

```sh
git clone https://github.com/seongj-un/undong-plan.git
cd undong-plan
```

프로젝트 폴더의 `index.html`을 브라우저에서 직접 열어도 됩니다. HTML과 함께 `styles.css`, `catalog.js`, `app.js`를 같은 폴더에 유지하세요.

### macOS

```sh
open index.html
```

기본 연결 앱으로 열리지 않으면 설치된 Chrome을 지정합니다.

```sh
open -a "Google Chrome" index.html
```

### Windows 명령 프롬프트

```bat
start index.html
```

화면 수정 후에는 macOS에서 `Cmd+R`, Windows에서 `F5`로 새로고침합니다. Node.js, Python, 패키지 설치, 실행 서버는 앱 사용에 필요하지 않습니다.

## 사용 순서

1. **부위로 찾기**에서 관심 있는 부위를 선택합니다.
2. 운동 카드의 기구 이름을 누르면 기구 설명과 관련 운동을 확인할 수 있습니다.
3. **사용법 보기**를 누르면 운동의 사용 순서와 원문 출처를 확인할 수 있습니다.
4. 이름으로 찾으려면 **기구로 찾기**에서 `랫풀다운`, `LAT PULLDOWN` 같은 이름·별칭을 입력합니다.
5. 상세는 **닫기** 버튼 또는 `Escape`로 닫습니다.

## 파일 구성

```text
undong-plan/
├── index.html              # 화면 구조와 진입점
├── styles.css              # 스타일과 반응형 화면
├── catalog.js              # 부위·기구·운동 데이터와 출처
├── app.js                  # 부위 탐색·검색·상세 조작
├── README.md               # 프로젝트 소개와 실행 안내
├── AGENTS.md               # 프로젝트 작업·검증 규칙
├── docs/
│   ├── project-overview.md # 목적·범위·미정 사항
│   ├── planning.md         # 요구사항과 추천 규칙 초안
│   └── api-spec.md         # 향후 서버 API 계약 초안
├── log.md                  # 작업·결정 이력
├── loop-log.md             # 브라우저 테스트와 반복 검증 결과
└── .gitignore              # 환경 파일과 macOS 보조 파일 제외
```

현재 화면은 `catalog.js`의 내장 데이터를 사용하며 서버 API를 호출하지 않습니다. 기구·운동 데이터는 `catalog.js`, 화면 동작은 `app.js`, 스타일은 `styles.css`에서 관리합니다.

## 검증 결과

2026-09-30에 **macOS Codex 내장 브라우저의 임시 HTTP 미리보기**에서 기능·반응형 검증 44개를 실행해 모두 통과했습니다. 콘솔 오류·경고는 0개였습니다.

확인 범위는 부위별 목록과 빈 결과, 이름·별칭 검색과 초기화, 기구·운동 상세, 키보드 닫기와 초점 복원, 입력 유지, 새로고침, 320·390·768·1280px 화면의 가로 넘침입니다. 자세한 실행 근거는 [반복 검증 기록](loop-log.md)을 참고하세요.

임시 미리보기는 테스트 후 종료했습니다. 프로젝트에는 자동 테스트 실행 명령이 없습니다. Chrome의 `file:` 직접 실행은 자동화 도구의 프로토콜 제한으로 별도 검증하지 않았으며, 위 HTTP 테스트와 구분합니다.

## 콘텐츠 상태와 출처

운동 안내는 아래 ACE 자료를 확인한 한국어 요약 초안입니다. **전문가 검수와 개인별 적합성 확인은 미완료**입니다. 주 사용 부위는 화면 분류 초안이며, 보조 부위는 미정으로 표시합니다. 실제 기구 모델의 조절 방법은 현장의 기구 안내를 확인하세요.

사진은 재사용 권한을 확인하지 못해 제공하지 않습니다. 확인되지 않은 검수자나 검수 날짜를 임의로 표시하지 않습니다.

출처 확인일: 2026-09-30.

- [ACE · Seated Chest Press](https://www.acefitness.org/resources/everyone/exercise-library/188/seated-chest-press/)
- [ACE · Seated Lat Pulldown](https://www.acefitness.org/resources/everyone/exercise-library/158/seated-lat-pulldown/)
- [ACE · Seated Leg Press](https://www.acefitness.org/resources/everyone/exercise-library/154/seated-leg-press/)

## 후속 범위

오늘의 규칙 기반 추천과 추천 이유·예외 안내는 기획 초안이며 아직 구현하지 않았습니다. 로그인, AI 추천, 개인 운동 기록 저장, 개인별 무게·세트·횟수 처방, 서버 API와 배포도 현재 구현에 포함되지 않습니다.

서버 기술 선택과 운동 콘텐츠 검수는 후속 결정 사항입니다. 공개 카탈로그 규모·검수 담당자·일정·예산 등은 [프로젝트 개요서](docs/project-overview.md)에서 관리합니다. 별도의 `LICENSE` 파일은 없습니다.

## 관련 문서

- [프로젝트 개요서](docs/project-overview.md)
- [기획서](docs/planning.md)
- [API 명세서 — 미구현 계약 초안](docs/api-spec.md)
- [작업 규칙](AGENTS.md)
- [작업 이력](log.md)
- [반복 검증 기록](loop-log.md)
