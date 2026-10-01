# 오늘의 운동 부위와 기구 추천 API 명세서

부위·기구·운동 조회와 오늘의 추천을 위한 API 계약 초안이다. 2026-09-30에 이 계약의 API 6개를 `server/server.js`로 구현했다. 구현 기술(Node.js 표준 라이브러리)은 기본안 적용·사용자 확인 대기이며, 계약 자체는 특정 구현 기술 선택이 아니다. 배포 서버 주소, 프레임워크, 데이터베이스와 인증 기술은 미정이다.

작성일: 2026-09-30 · 문서 상태: 초안 v0.2 · 기능 기준: [기획서](planning.md)

## 현재 화면과 API의 관계

F01~F06의 [정적 화면](../index.html)은 내장된 `catalog.js` 데이터와 `recommend.js`로 동작하며 서버 API를 호출하지 않는다. 아래 경로는 [`server/server.js`](../server/server.js)에 구현했다. 서버는 `catalog.js`와 `recommend.js`를 `node:vm`으로 읽어 화면과 같은 추천 계산(`RECOMMENDER.recommendToday`)을 재사용하며, 추천 규칙을 따로 구현하지 않는다. F04~F06 추천 규칙과 계약은 변경하지 않는다.

현재 서버는 CORS 헤더를 보내지 않는다. 다른 출처에서 연 화면(`file:`로 연 `index.html` 포함)은 브라우저 정책상 응답을 읽을 수 없다. [MDN CORS](https://developer.mozilla.org/en-US/docs/Web/HTTP/Guides/CORS) 화면과 API의 연결 방식(CORS 허용 또는 같은 출처 제공)은 미정이다.

로컬 화면의 추천은 검수 전 초안을 미리보기 후보로 쓰고 `catalogVersion`을 `local-draft-2026-10-01`으로 표시한다. 서버는 검수 완료 운동만 후보로 쓴다. 이 로컬 미리보기 예외는 사용자 확인 대기이며 공개 API 계약의 변경이 아니다.

로컬 안내 초안은 아래 공개 API 모델과 구분한다. `review: null`, `secondaryBodyPartIds: null`은 미검수·미정 상태를 표시하기 위한 로컬 전용 표현이다. `sourceBodyPartIds: string[]`도 원문 대상 부위로 탐색하기 위한 로컬 전용 필드다. 주 사용 부위는 화면 분류 초안이다. 이러한 데이터를 검수 완료 API 응답으로 반환하지 않는다.

화면의 빈 검색어는 ‘전체 목록’ 동작이다. 서버를 연결할 때는 빈 `q`를 전송하지 않고 생략해야 아래 검증 계약과 일치한다. 기구 이름·별칭 부분 검색, 50자 제한, 영문 대소문자 무시와 목록 식별자 정렬은 초안 계약을 따른다. 사진은 `image: null`로 둔다.

## 공통 계약 제안

| 항목 | 초안 계약 |
| --- | --- |
| 경로 접두사 | `/api/v1` |
| 데이터 표현 | JSON, 한국어 표시 문구 |
| 요청·응답 헤더 | 본문이 있는 요청 및 모든 응답의 `Content-Type: application/json` |
| 인증 | 사용자가 로그인 없는 첫 버전을 확인했으므로 인증 헤더 없음 |
| 성공 | `{ "data": ... }` |
| 실패 | `{ "error": { "code": "...", "message": "...", "details": [] } }` |
| 식별자 | 카탈로그에 존재하는 비어 있지 않은 문자열, 예시는 서비스가 부여한 임시 값 |
| 필드 규칙 | 요청의 미정의 필드와 명시적 `null`은 400, 선택 필드 생략은 기본값 적용 |
| 목록 규칙 | 식별자 오름차순, 중복 없음, 초기 소규모 카탈로그는 페이지 구분 없이 전체 반환 |
| 추천 저장 | 결과·입력을 영구 저장하지 않는 초안, 추천 결과 조회 API 없음 |

이 계약은 구현 기술 채택을 의미하지 않는다. 로그인·AI·기록 저장을 추가하면 계약을 재검토하고 변경을 `log.md`에 기록한다. 추천 입력 원문은 애플리케이션 로그에 남기지 않는 방향을 제안한다.

조회는 GET, 조건 배열을 받아 계산하는 추천은 POST로 표현한다. 추천 결과를 별도 리소스로 저장하지 않으므로 성공 응답은 200으로 제안한다. HTTP 메서드와 상태 코드 의미는 [RFC 9110](https://www.rfc-editor.org/rfc/rfc9110.html)을 확인했다.

## API 목록

| 메서드 | 경로 | 용도 | 기능 |
| --- | --- | --- | --- |
| GET | `/api/v1/body-parts` | 부위 목록 | F01 |
| GET | `/api/v1/equipment` | 기구 검색과 목록 | F02 |
| GET | `/api/v1/equipment/{equipmentId}` | 기구 상세 | F02 |
| GET | `/api/v1/exercises` | 부위·기구별 운동 목록 | F01 |
| GET | `/api/v1/exercises/{exerciseId}` | 운동 상세 | F03 |
| POST | `/api/v1/recommendations/today` | 조건에 따른 추천 계산 | F04, F05, F06 |

GET에는 요청 본문이 없다. 정의하지 않은 쿼리 매개변수나 같은 매개변수의 중복 전달은 400이다.

## 공통 데이터 모델

모델의 필드는 별도 언급이 없으면 모두 응답에 포함한다. `string[]`은 문자열 배열이다.

| 모델 | 필드와 자료형 |
| --- | --- |
| BodyPart | `id: string`, `name: string`, `description: string` |
| Equipment | `id: string`, `name: string`, `aliases: string[]`, `description: string`, `image: Image 또는 null` |
| Image | `url: string`, `alt: string`, `sourceUrl: string`, `usageRights: string` |
| ExerciseSummary | `id: string`, `name: string`, `primaryBodyPartId: string`, `secondaryBodyPartIds: string[]`, `equipmentIds: string[]`, `difficulty: "beginner"` |
| ExerciseDetail | ExerciseSummary의 필드 + `instructions: string[]`, `cautions: string[]`, `sources: Source[]`, `review: Review` |
| Source | `title: string`, `url: string`, `checkedAt: string` |
| Review | `reviewedAt: string`, `reviewerLabel: string` |
| RecommendationItem | `exercise: ExerciseSummary`, `reasonCodes: string[]`, `reason: string` |

`checkedAt`과 `reviewedAt`은 `YYYY-MM-DD` 형식이다. Review는 실제 검수 결과가 있는 공개 콘텐츠에만 부여하며, 검수자 정보를 임의로 만들지 않는다. Image URL은 실제 이용 가능한 자료만 반환하고 사진이 없으면 `null`이다. `usageRights`에는 확인한 사용 권한을 설명한다.

카탈로그의 운동은 검수 완료·초보자용 콘텐츠만 공개한다. 미공개 운동 상세 요청은 404다. `equipmentIds`는 필요한 기구의 전체 목록이며 대체 가능한 기구 목록이 아니다. 대체 동작은 별도 운동으로 등록한다.

부위 식별자 제안: `chest`, `back`, `legs`, `glutes`, `shoulders`, `arms`, `core`. 한국어 이름은 기획서와 동일하다. 실제 제공 범위는 카탈로그로 결정한다.

## 부위 목록

`GET /api/v1/body-parts`

쿼리 매개변수 없음. 200의 `data`는 `BodyPart[]`이다. 아래는 형식 예시이며 전체 카탈로그가 아니다.

```json
{
  "data": [
    { "id": "chest", "name": "가슴", "description": "가슴 부위 운동을 찾아보세요." }
  ]
}
```

## 기구 목록과 상세

`GET /api/v1/equipment?q=체스트`

| 쿼리 | 자료형 | 기본값 | 검증과 의미 |
| --- | --- | --- | --- |
| `q` | string | 생략 시 전체 | 앞뒤 공백 제거 후 1~50자, 이름·별칭에 대한 부분 일치, 영문 대소문자 구분 없음 |

검색 결과 없음은 200과 `data: []`이다. 성공 모델은 `Equipment[]`이며 검색 결과도 식별자 오름차순이다.

```json
{
  "data": [
    {
      "id": "eq_chest_press",
      "name": "체스트 프레스 머신",
      "aliases": ["체스트 프레스"],
      "description": "앉아서 체스트 프레스 운동을 할 때 사용하는 머신입니다.",
      "image": null
    }
  ]
}
```

`GET /api/v1/equipment/eq_chest_press`

경로의 `equipmentId`는 카탈로그의 기구 식별자다. 쿼리는 없다. 200의 `data`는 위 목록 원소와 동일한 `Equipment` 객체 한 개다. 존재하지 않는 기구는 404 `EQUIPMENT_NOT_FOUND`다. 관련 운동은 운동 목록의 `equipmentId` 필터로 조회한다.

## 운동 목록과 상세

`GET /api/v1/exercises?bodyPartId=chest&equipmentId=eq_chest_press`

| 쿼리 | 자료형 | 기본값 | 검증과 의미 |
| --- | --- | --- | --- |
| `bodyPartId` | string | 전체 부위 | 카탈로그의 부위 ID, 주·보조 사용 부위에 해당 부위가 있는 운동 |
| `equipmentId` | string | 전체 기구 | 카탈로그의 기구 ID, 필요한 기구에 해당 기구가 있는 운동 |

두 필터를 함께 전달하면 모두 만족하는 운동만 반환한다. 잘못된 식별자는 400 `UNKNOWN_CATALOG_ID`, 유효한 조건에 결과가 없으면 200과 `data: []`이다. 성공 모델은 `ExerciseSummary[]`다.

```json
{
  "data": [
    {
      "id": "ex_chest_press",
      "name": "앉아서 체스트 프레스",
      "primaryBodyPartId": "chest",
      "secondaryBodyPartIds": [],
      "equipmentIds": ["eq_chest_press"],
      "difficulty": "beginner"
    }
  ]
}
```

이 예시는 주 사용 부위 연결과 JSON 형식을 설명한다. 보조 부위의 최종 데이터는 콘텐츠 검수로 정하며, 빈 배열을 실제 생리학적 부위 정보로 확정한 예시가 아니다.

`GET /api/v1/exercises/ex_chest_press`

경로의 `exerciseId`는 운동 식별자다. 쿼리는 없다. 200의 `data`는 `ExerciseDetail` 객체다. 존재하지 않거나 미공개인 운동은 404 `EXERCISE_NOT_FOUND`다.

상세 응답에는 요약의 필드와 다음 정보가 추가된다.

| 추가 필드 | 공개 시 필수 조건 |
| --- | --- |
| `instructions` | 출처와 검수를 거친 한국어 안내, 1개 이상 |
| `cautions` | 해당 운동에 필요한 검수된 주의사항 배열 |
| `sources` | 실제 확인한 출처와 확인일, 1개 이상 |
| `review` | 실제 검수 날짜와 표시 가능한 검수자 정보 |

검수된 사용법과 검수자 정보가 아직 없어 운동 상세의 완성된 예시 응답은 제공하지 않는다. 현재 알 수 없는 내용으로 사용법을 채우지 않는다. 형식과 필수 조건만 명세한다.

## 오늘의 추천 요청

`POST /api/v1/recommendations/today`

| 본문 필드 | 자료형 | 필수 | 기본값 및 검증 |
| --- | --- | --- | --- |
| `equipmentAvailability` | string | 예 | `unknown` 또는 `confirmed` |
| `availableEquipmentIds` | string[] | 예 | 카탈로그 기구 ID, 중복 불가, 빈 배열 허용 |
| `preferredBodyPartIds` | string[] | 아니오 | `[]`, 카탈로그 부위 ID, 중복 불가 |
| `excludedBodyPartIds` | string[] | 아니오 | `[]`, 카탈로그 부위 ID, 중복 불가 |
| `maxItems` | integer | 아니오 | `3`, 1~3 |

`unknown`에서는 `availableEquipmentIds`가 반드시 빈 배열이어야 한다. 선호 부위와 제외 부위의 교집합은 허용하지 않는다. 배열 항목은 해당 카탈로그의 ID만 허용하므로 배열 길이는 해당 카탈로그 크기를 넘을 수 없다. 모든 입력 검증을 추천 계산보다 먼저 수행한다.

```json
{
  "equipmentAvailability": "confirmed",
  "availableEquipmentIds": ["eq_chest_press"],
  "preferredBodyPartIds": ["chest"],
  "excludedBodyPartIds": [],
  "maxItems": 1
}
```

## 오늘의 추천 응답

200의 `data`는 다음 필드를 모두 가진다.

| 필드 | 자료형 | 의미 |
| --- | --- | --- |
| `status` | string | 아래 상태 표의 값 |
| `catalogVersion` | string | 계산에 사용한 카탈로그 버전 |
| `rulesVersion` | string | 추천 규칙 버전, 이 초안에서는 `draft-v0.1` |
| `requestedCount` | integer | 입력 또는 기본값으로 정한 최대 추천 수 |
| `returnedCount` | integer | 실제 추천 개수, `items.length`와 같음 |
| `items` | RecommendationItem[] | 선택된 운동과 추천 이유 |
| `message` | string | 결과 상태를 설명하는 한국어 안내 |

`catalogVersion: "example-v1"`은 아래 형식 예시 전용 값이며 실제 카탈로그가 존재한다는 뜻이 아니다.

```json
{
  "data": {
    "status": "recommended",
    "catalogVersion": "example-v1",
    "rulesVersion": "draft-v0.1",
    "requestedCount": 1,
    "returnedCount": 1,
    "items": [
      {
        "exercise": {
          "id": "ex_chest_press",
          "name": "앉아서 체스트 프레스",
          "primaryBodyPartId": "chest",
          "secondaryBodyPartIds": [],
          "equipmentIds": ["eq_chest_press"],
          "difficulty": "beginner"
        },
        "reasonCodes": ["AVAILABLE_EQUIPMENT", "PREFERRED_BODY_PART"],
        "reason": "선택한 기구를 사용하며, 선호 부위인 가슴 운동에 해당합니다."
      }
    ],
    "message": "입력 조건에 맞는 운동 1개를 찾았습니다."
  }
}
```

| 상태 | 조건 | items와 개수 | 화면 동작 |
| --- | --- | --- | --- |
| `recommended` | 요청 수만큼 후보 선택 | 요청 수와 같음 | 결과와 이유 표시 |
| `partial` | 후보가 1개 이상이지만 요청 수 미만 | 1개 이상, 요청 수 미만 | 일부 추천임을 안내 |
| `needs_equipment_confirmation` | 기구 상태가 `unknown` | `[]`, 0 | 기구 탐색과 확인 안내 |
| `no_candidates` | 기구 상태가 `confirmed`이며 후보 없음 | `[]`, 0 | 기구·부위 조건 변경 안내 |

위 네 상태는 요청을 정상 처리한 결과이므로 모두 200이다. 오류 응답과 혼동하지 않는다.

추천 이유 코드는 `AVAILABLE_EQUIPMENT`를 모든 항목에 포함한다. 선호 부위가 지정되었으면 `PREFERRED_BODY_PART`, 미지정이면 `AUTO_BODY_PART`를 뒤에 포함한다. 이 순서로 반환하며 다른 이유 코드는 이 초안에 없다.

추천 후보 필터와 순서는 [기획서의 추천 규칙](planning.md#추천-규칙-제안)을 따른다. 제외 부위는 주·보조 부위 모두에 적용하고, 선호 부위는 주 부위에만 적용한다. 날짜, 개인 기록, 난수 또는 AI 호출에 따른 변경은 초안에 없다.

## 오류와 상태 코드

| HTTP 상태 | 오류 코드 | 조건 |
| --- | --- | --- |
| 400 | `INVALID_JSON` | JSON 구문 오류 |
| 400 | `VALIDATION_ERROR` | 필수 누락, 자료형·범위·중복·미정의 필드·쿼리 오류 |
| 400 | `UNKNOWN_CATALOG_ID` | 필터 또는 추천 입력의 ID가 카탈로그에 없음 |
| 400 | `CONFLICTING_BODY_PARTS` | 선호 부위와 제외 부위가 겹침 |
| 404 | `EQUIPMENT_NOT_FOUND` | 기구 상세 조회 대상 없음 |
| 404 | `EXERCISE_NOT_FOUND` | 운동 상세 조회 대상 없음 또는 미공개 |
| 415 | `UNSUPPORTED_MEDIA_TYPE` | POST 요청의 Content-Type이 JSON이 아님 |
| 500 | `INTERNAL_ERROR` | 예기치 않은 서버 오류 |
| 503 | `CATALOG_UNAVAILABLE` | 카탈로그를 읽을 수 없어 요청을 처리할 수 없음 |

오류의 `details`는 `{ "field": string, "reason": string }` 배열이다. 본문 필드는 필드명, 배열 항목은 `availableEquipmentIds[0]`처럼 표시하며 쿼리는 `query.q`처럼 표시한다. 특정 필드가 없는 오류는 `details: []`이다. 서버 내부 정보는 오류 메시지에 포함하지 않는다.

```json
{
  "error": {
    "code": "CONFLICTING_BODY_PARTS",
    "message": "선호 부위와 제외 부위가 겹칩니다.",
    "details": [
      { "field": "preferredBodyPartIds", "reason": "chest가 excludedBodyPartIds에도 포함되어 있습니다." }
    ]
  }
}
```

## 구현 참고·명세 외 추가 사항

이 절은 2026-09-30 `server/server.js` 구현에서 정한 세부 동작이다. 위 계약을 바꾸지 않으며, 계약이 정하지 않은 부분을 구현이 어떻게 처리하는지 기록한다. 서버 기술과 아래 세부값은 사용자 확인 대기다.

### 실행과 테스트

| 항목 | 현재 구현 |
| --- | --- |
| 파일 | `server/server.js`, 테스트 `server/api.test.js` |
| 기술 | Node.js 표준 라이브러리만 사용, `package.json`·패키지 설치 없음, 확인한 버전 v24.14.0 |
| 실행 | 프로젝트 루트에서 `node server/server.js`, 주소 `http://127.0.0.1:8787/api/v1`, `PORT` 환경 변수로 포트 변경 |
| 테스트 | `node --test "server/*.test.js"`, 47개. Node.js 24에서 `node --test server/`는 폴더를 테스트 파일로 찾지 못해 실패한다. [Node.js test runner](https://nodejs.org/api/test.html#running-tests-from-the-command-line) |
| 카탈로그 읽기 | 첫 로드 후 메모리에 보관. `catalog.js`·`recommend.js` 수정 후 서버 재시작 필요. 로드에 실패하면 503을 반환하고 다음 요청에서 다시 읽음 |

### 공개 카탈로그 변환

- 공개 운동 조건: `review.reviewedAt`이 `YYYY-MM-DD`, `review.reviewerLabel`이 비어 있지 않음, `difficulty: "beginner"`, `secondaryBodyPartIds`가 배열, `instructions` 1개 이상, `cautions` 배열, `sources` 1개 이상(각 `title`·`url`·`checkedAt`).
- 현재 `catalog.js`에는 조건을 만족하는 운동이 없다. 그래서 `GET /api/v1/exercises`는 `data: []`, 운동 상세는 404 `EXERCISE_NOT_FOUND`, `confirmed` 추천은 `no_candidates`다. 부위 7개와 기구 6개는 조회된다.
- 로컬 전용 필드(`sourceBodyPartIds`, `summary`)는 응답에서 제거한다.
- `catalog.js`에 부위 설명이 없어 BodyPart의 `description`은 `"<부위 이름> 부위 운동을 찾아보세요."`로 만든다.
- 목록은 공통 목록 규칙대로 식별자 오름차순이다. 부위 목록은 `arms`, `back`, `chest`… 순서라 화면의 표시 순서(가슴·등·하체…)와 다르다.
- 추천의 `catalogVersion`은 `server-` 뒤에 공개 카탈로그 JSON의 SHA-256 앞 12자리를 붙인다. 기구·운동 등 공개 데이터가 달라지면 값도 바뀐다.
- 추천은 `recommend.js`를 `includeUnreviewedDraft: false`로 호출한다. 추천 입력 검증 순서는 `VALIDATION_ERROR` → `UNKNOWN_CATALOG_ID` → `CONFLICTING_BODY_PARTS`다.

### 명세 오류 표에 없는 상태·오류

| HTTP 상태 | 오류 코드 | 조건 |
| --- | --- | --- |
| 404 | `NOT_FOUND` | 정의되지 않은 경로 |
| 405 | `METHOD_NOT_ALLOWED` | 경로에 맞지 않는 메서드. `Allow` 헤더 포함, GET 경로는 HEAD도 허용 |
| 400 | `BAD_REQUEST` | 해석할 수 없는 HTTP 요청 |
| 408 | `REQUEST_TIMEOUT` | 요청 시간 초과. 자동 테스트 없음 |
| 431 | `HEADERS_TOO_LARGE` | 요청 헤더가 너무 큼. 자동 테스트 없음 |
| 503 | `CATALOG_UNAVAILABLE` | 기존 코드. 공개 운동이 카탈로그에 없는 부위·기구를 참조할 때도 사용 |

### 계약 해석과 세부 적용

- 요청 본문은 16KB 이하. 초과하면 오류 표에 413이 없어 400 `VALIDATION_ERROR`(`"요청 본문은 16KB 이하여야 합니다."`, `details: []`)로 응답하고 `Connection: close`를 보낸다.
- 빈 필터 값(`bodyPartId=`, `equipmentId=`)은 400 `VALIDATION_ERROR`다. 빈 `q=`도 1~50자 조건에 따라 400이다.
- POST의 `Content-Type`은 `application/json`이며 `charset`은 없거나 `utf-8`이어야 한다. 그 밖에는 415 `UNSUPPORTED_MEDIA_TYPE`이다.
- UTF-8로 해석할 수 없는 본문은 400 `INVALID_JSON`이다.
- 경로 처리 응답에는 `Content-Type: application/json; charset=utf-8`, `X-Content-Type-Options: nosniff`, `Cache-Control: no-store`를 보낸다. 해석할 수 없는 HTTP 요청에 대한 400·408·431 응답은 JSON 본문과 `Content-Type`, `Connection: close`만 보낸다.
- 로그에는 메서드·경로·상태·처리 시간만 남긴다. 쿼리 문자열과 요청 본문은 남기지 않는다.
- 오류 우선순위: 경로 404 → 메서드 405 → 쿼리 400 → 415 → 본문 크기 400 → `INVALID_JSON` → 카탈로그 503 → `UNKNOWN_CATALOG_ID`·404·추천 입력 검증.

### 구현하지 않은 부분

CORS, 화면과의 연결, 호출 제한, 서버 배포는 없다. GitHub Pages에는 정적 화면만 배포했으며 API 서버는 실행되지 않는다. Windows에서는 실행하지 않았다.

## 명세 확인 기준

- 기구 미확인과 확인 후 기구 없음의 상태가 다르다.
- 필요한 모든 기구가 입력 목록에 있는 운동만 추천한다.
- 보조 부위도 제외 조건에 걸리면 추천하지 않는다.
- 일부 추천을 채우기 위해 선호 부위나 제외 조건을 변경하지 않는다.
- 목록 결과 없음은 200, 상세 대상 없음은 404로 구분한다.
- 응답 예시의 JSON이 유효하고 기획서의 입력·상태·정렬 규칙과 일치한다.

이 기준은 구현 검증용 기준이다. `server/api.test.js`의 자동 테스트 결과는 [작업 기록](../log.md)에 둔다. 16KB 본문 제한은 현재 구현값이며, 배포 서버 주소·호출 제한·배포 운영 정책은 기술 및 운영 결정 이후 확정한다.

외부 규격 확인일: 2026-09-30. HTTP 근거: [RFC 9110](https://www.rfc-editor.org/rfc/rfc9110.html).
