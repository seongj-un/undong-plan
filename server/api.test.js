'use strict';

// 서버 API 계약 테스트. 실행: node --test "server/*.test.js"
// Node.js 표준 라이브러리(node:test, node:assert, fetch)만 사용한다.

const { describe, it, before, after } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const http = require('node:http');
const net = require('node:net');
const os = require('node:os');
const path = require('node:path');
const { createServer, loadRuntime, buildPublicCatalog, parsePort, DEFAULT_PORT } = require('./server.js');

const JSON_TYPE = 'application/json; charset=utf-8';
const SUMMARY_KEYS = ['difficulty', 'equipmentIds', 'id', 'name', 'primaryBodyPartId', 'secondaryBodyPartIds'];
const DETAIL_KEYS = [...SUMMARY_KEYS, 'cautions', 'instructions', 'review', 'sources'].sort();
const RECOMMENDATION_KEYS = ['catalogVersion', 'items', 'message', 'requestedCount', 'returnedCount', 'rulesVersion', 'status'];
const ALL_EQUIPMENT = ['eq_chest_press', 'eq_lat_pulldown', 'eq_leg_press'];
const CATALOG_EQUIPMENT = ['eq_chest_press', 'eq_lat_pulldown', 'eq_leg_extension', 'eq_leg_press', 'eq_seated_high_row', 'eq_shoulder_press'];
const silentLogger = { info() {}, error() {} };

async function start(options = {}) {
  const server = createServer({ logger: silentLogger, ...options });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  const port = server.address().port;
  const base = `http://127.0.0.1:${port}`;
  const request = async (path, { method = 'GET', headers, body } = {}) => {
    const res = await fetch(base + path, { method, headers, body });
    const text = await res.text();
    assert.equal(res.headers.get('content-type'), JSON_TYPE, `${method} ${path}의 Content-Type`);
    return { status: res.status, headers: res.headers, text, json: text ? JSON.parse(text) : null };
  };
  const post = (body, headers = { 'Content-Type': 'application/json' }) => request('/api/v1/recommendations/today', {
    method: 'POST', headers, body: typeof body === 'string' || body instanceof Uint8Array ? body : JSON.stringify(body)
  });
  const close = () => new Promise(resolve => {
    server.close(resolve);
    server.closeAllConnections();
  });
  return { server, port, request, post, close };
}

function assertError(res, status, code, details) {
  assert.equal(res.status, status, res.text);
  assert.deepEqual(Object.keys(res.json), ['error']);
  assert.deepEqual(Object.keys(res.json.error), ['code', 'message', 'details']);
  assert.equal(res.json.error.code, code);
  assert.equal(typeof res.json.error.message, 'string');
  assert.ok(res.json.error.message.length > 0);
  assert.ok(Array.isArray(res.json.error.details));
  if (details) assert.deepEqual(res.json.error.details, details);
}

const fields = res => res.json.error.details.map(detail => detail.field);
const ids = res => res.json.data.map(item => item.id);
const itemIds = res => res.json.data.items.map(item => item.exercise.id);

function assertRecommendation(res, status, expectedIds, requestedCount) {
  assert.equal(res.status, 200, res.text);
  assert.deepEqual(Object.keys(res.json.data).sort(), RECOMMENDATION_KEYS);
  assert.equal(res.json.data.status, status);
  assert.equal(res.json.data.rulesVersion, 'draft-v0.1');
  assert.equal(res.json.data.requestedCount, requestedCount);
  assert.equal(res.json.data.returnedCount, res.json.data.items.length);
  assert.deepEqual(itemIds(res), expectedIds);
  assert.ok(res.json.data.message.length > 0);
  res.json.data.items.forEach(item => {
    assert.deepEqual(Object.keys(item).sort(), ['exercise', 'reason', 'reasonCodes']);
    assert.deepEqual(Object.keys(item.exercise).sort(), SUMMARY_KEYS);
    assert.ok(item.reason.length > 0);
  });
}

// ---------------------------------------------------------------------------
// 실제 catalog.js(로컬 안내 초안) 기준
// ---------------------------------------------------------------------------

describe('실제 catalog.js: 부위·기구 조회', () => {
  let api;
  before(async () => { api = await start(); });
  after(() => api.close());

  it('GET /api/v1/body-parts는 부위 7개를 식별자 오름차순으로 반환한다', async () => {
    const res = await api.request('/api/v1/body-parts');
    assert.equal(res.status, 200);
    assert.deepEqual(ids(res), ['arms', 'back', 'chest', 'core', 'glutes', 'legs', 'shoulders']);
    assert.deepEqual(res.json.data.find(part => part.id === 'chest'), { id: 'chest', name: '가슴', description: '가슴 부위 운동을 찾아보세요.' });
    res.json.data.forEach(part => assert.deepEqual(Object.keys(part), ['id', 'name', 'description']));
  });

  it('부위 목록에 쿼리를 보내면 400 VALIDATION_ERROR', async () => {
    const res = await api.request('/api/v1/body-parts?sort=name');
    assertError(res, 400, 'VALIDATION_ERROR');
    assert.deepEqual(fields(res), ['query.sort']);
  });

  it('HEAD 요청은 본문 없이 GET과 같은 상태를 반환한다', async () => {
    const res = await api.request('/api/v1/body-parts', { method: 'HEAD' });
    assert.equal(res.status, 200);
    assert.equal(res.text, '');
  });

  it('GET /api/v1/equipment는 q 생략 시 전체 기구를 Equipment 형식으로 반환한다', async () => {
    const res = await api.request('/api/v1/equipment');
    assert.equal(res.status, 200);
    assert.deepEqual(ids(res), CATALOG_EQUIPMENT);
    res.json.data.forEach(item => {
      assert.deepEqual(Object.keys(item), ['id', 'name', 'aliases', 'description', 'image']);
      assert.equal(item.image, null);
    });
  });

  it('기구 검색은 이름·별칭 부분 일치이며 영문 대소문자를 무시한다', async () => {
    const cases = [
      ['체스트', ['eq_chest_press']],
      ['CHEST PRESS', ['eq_chest_press']],
      ['Lat Pull-Down', ['eq_lat_pulldown']],
      ['풀다운', ['eq_lat_pulldown']],
      ['  프레스  ', ['eq_chest_press', 'eq_leg_press', 'eq_shoulder_press']],
      ['ＬＥＧ', ['eq_leg_extension', 'eq_leg_press']],
      ['press', ['eq_chest_press', 'eq_leg_press', 'eq_shoulder_press']],
      ['레그익스텐션', ['eq_leg_extension']],
      ['LEG EXTENSION', ['eq_leg_extension']],
      ['숄더프레스', ['eq_shoulder_press']],
      ['Shoulder Press', ['eq_shoulder_press']],
      ['시티드로우', ['eq_seated_high_row']],
      ['SEATED ROW', ['eq_seated_high_row']]
    ];
    for (const [q, expected] of cases) {
      const res = await api.request(`/api/v1/equipment?q=${encodeURIComponent(q)}`);
      assert.equal(res.status, 200, q);
      assert.deepEqual(ids(res), expected, q);
    }
  });

  it('검색 결과가 없으면 200과 빈 배열', async () => {
    const res = await api.request(`/api/v1/equipment?q=${encodeURIComponent('스미스 머신')}`);
    assert.equal(res.status, 200);
    assert.deepEqual(res.json, { data: [] });
  });

  it('q를 생략하면 전체, 빈 q나 공백 q를 보내면 400', async () => {
    assert.equal((await api.request('/api/v1/equipment')).json.data.length, 6);
    for (const path of ['/api/v1/equipment?q=', '/api/v1/equipment?q', '/api/v1/equipment?q=%20%20%20']) {
      const res = await api.request(path);
      assertError(res, 400, 'VALIDATION_ERROR');
      assert.deepEqual(fields(res), ['query.q'], path);
    }
  });

  it('q는 앞뒤 공백 제거 후 50자까지 허용하고 51자는 400', async () => {
    const fifty = await api.request(`/api/v1/equipment?q=${'a'.repeat(50)}`);
    assert.equal(fifty.status, 200);
    assert.deepEqual(fifty.json.data, []);
    const koreanFifty = await api.request(`/api/v1/equipment?q=${encodeURIComponent('가'.repeat(50))}`);
    assert.equal(koreanFifty.status, 200);
    const padded = await api.request(`/api/v1/equipment?q=${encodeURIComponent(` ${'a'.repeat(50)} `)}`);
    assert.equal(padded.status, 200);
    const tooLong = await api.request(`/api/v1/equipment?q=${'a'.repeat(51)}`);
    assertError(tooLong, 400, 'VALIDATION_ERROR');
    assert.deepEqual(fields(tooLong), ['query.q']);
  });

  it('정의하지 않은 쿼리와 중복 쿼리는 400 VALIDATION_ERROR', async () => {
    const unknown = await api.request('/api/v1/equipment?foo=1');
    assertError(unknown, 400, 'VALIDATION_ERROR');
    assert.deepEqual(fields(unknown), ['query.foo']);
    const duplicated = await api.request('/api/v1/equipment?q=a&q=b');
    assertError(duplicated, 400, 'VALIDATION_ERROR');
    assert.deepEqual(fields(duplicated), ['query.q']);
    const both = await api.request('/api/v1/equipment?q=a&foo=1&q=b');
    assert.deepEqual(fields(both), ['query.q', 'query.foo']);
  });

  it('GET /api/v1/equipment/{id}는 Equipment 한 개, 없으면 404 EQUIPMENT_NOT_FOUND', async () => {
    for (const id of CATALOG_EQUIPMENT) {
      const found = await api.request(`/api/v1/equipment/${id}`);
      assert.equal(found.status, 200);
      assert.equal(found.json.data.id, id);
      assert.deepEqual(Object.keys(found.json.data), ['id', 'name', 'aliases', 'description', 'image']);
    }
    assertError(await api.request('/api/v1/equipment/eq_smith_machine'), 404, 'EQUIPMENT_NOT_FOUND', []);
    assertError(await api.request('/api/v1/equipment/%E0%A4%A'), 404, 'EQUIPMENT_NOT_FOUND', []);
    const withQuery = await api.request('/api/v1/equipment/eq_leg_press?q=a');
    assertError(withQuery, 400, 'VALIDATION_ERROR');
    assert.deepEqual(fields(withQuery), ['query.q']);
  });
});

describe('실제 catalog.js: 운동 조회는 검수 완료 운동만 공개한다', () => {
  let api;
  before(async () => { api = await start(); });
  after(() => api.close());

  it('로컬 초안(review: null, 보조 부위 null)은 공개 카탈로그에서 빠진다', () => {
    const { catalog } = loadRuntime();
    assert.equal(catalog.exercises.length, 6);
    assert.deepEqual(buildPublicCatalog(catalog).exercises, []);
  });

  it('운동 목록은 현재 데이터에서 200과 빈 배열이다', async () => {
    for (const path of ['/api/v1/exercises', '/api/v1/exercises?bodyPartId=chest', '/api/v1/exercises?bodyPartId=chest&equipmentId=eq_chest_press', '/api/v1/exercises?equipmentId=eq_leg_press']) {
      const res = await api.request(path);
      assert.equal(res.status, 200, path);
      assert.deepEqual(res.json, { data: [] }, path);
    }
  });

  it('카탈로그에 없는 필터 ID는 400 UNKNOWN_CATALOG_ID', async () => {
    const res = await api.request('/api/v1/exercises?bodyPartId=neck&equipmentId=eq_smith');
    assertError(res, 400, 'UNKNOWN_CATALOG_ID', [
      { field: 'query.bodyPartId', reason: 'neck는 카탈로그에 없습니다.' },
      { field: 'query.equipmentId', reason: 'eq_smith는 카탈로그에 없습니다.' }
    ]);
  });

  it('빈 필터·중복 필터·미정의 쿼리는 400 VALIDATION_ERROR이며 ID 확인보다 먼저다', async () => {
    const empty = await api.request('/api/v1/exercises?bodyPartId=');
    assertError(empty, 400, 'VALIDATION_ERROR');
    assert.deepEqual(fields(empty), ['query.bodyPartId']);
    const duplicated = await api.request('/api/v1/exercises?bodyPartId=chest&bodyPartId=back');
    assertError(duplicated, 400, 'VALIDATION_ERROR');
    const precedence = await api.request('/api/v1/exercises?bodyPartId=neck&limit=1');
    assertError(precedence, 400, 'VALIDATION_ERROR');
    assert.deepEqual(fields(precedence), ['query.limit']);
  });

  it('로컬 초안 운동 상세는 404 EXERCISE_NOT_FOUND', async () => {
    for (const id of ['ex_chest_press', 'ex_lat_pulldown', 'ex_leg_press', 'ex_leg_extension', 'ex_shoulder_press', 'ex_seated_high_row', 'ex_missing']) {
      assertError(await api.request(`/api/v1/exercises/${id}`), 404, 'EXERCISE_NOT_FOUND', []);
    }
  });
});

describe('실제 catalog.js: 오늘의 추천', () => {
  let api;
  before(async () => { api = await start(); });
  after(() => api.close());

  it('Content-Type이 JSON이 아니면 415 UNSUPPORTED_MEDIA_TYPE', async () => {
    const valid = JSON.stringify({ equipmentAvailability: 'unknown', availableEquipmentIds: [] });
    assertError(await api.post(new TextEncoder().encode(valid), {}), 415, 'UNSUPPORTED_MEDIA_TYPE', []);
    assertError(await api.post(valid, { 'Content-Type': 'text/plain' }), 415, 'UNSUPPORTED_MEDIA_TYPE', []);
    assertError(await api.post(valid, { 'Content-Type': 'application/json; charset=iso-8859-1' }), 415, 'UNSUPPORTED_MEDIA_TYPE', []);
    const withCharset = await api.post(valid, { 'Content-Type': 'application/json; charset=UTF-8' });
    assert.equal(withCharset.status, 200);
  });

  it('JSON 구문 오류는 400 INVALID_JSON', async () => {
    for (const body of ['{', '', '{"equipmentAvailability": }', new Uint8Array([0x7b, 0xff, 0x7d])]) {
      assertError(await api.post(body), 400, 'INVALID_JSON', []);
    }
  });

  it('필수 누락·미정의 필드·null·범위 오류는 400 VALIDATION_ERROR', async () => {
    const missing = await api.post({});
    assertError(missing, 400, 'VALIDATION_ERROR');
    assert.deepEqual(fields(missing), ['equipmentAvailability', 'availableEquipmentIds']);

    const extra = await api.post({ equipmentAvailability: 'confirmed', availableEquipmentIds: [], mood: 'good' });
    assert.deepEqual(fields(extra), ['mood']);

    const nulls = await api.post({ equipmentAvailability: 'confirmed', availableEquipmentIds: [], preferredBodyPartIds: null, maxItems: null });
    assertError(nulls, 400, 'VALIDATION_ERROR');
    assert.deepEqual(fields(nulls), ['preferredBodyPartIds', 'maxItems']);

    const range = await api.post({ equipmentAvailability: 'confirmed', availableEquipmentIds: [], maxItems: 4 });
    assert.deepEqual(fields(range), ['maxItems']);

    const unknownWithIds = await api.post({ equipmentAvailability: 'unknown', availableEquipmentIds: ['eq_leg_press'] });
    assert.deepEqual(fields(unknownWithIds), ['availableEquipmentIds']);

    const duplicated = await api.post({ equipmentAvailability: 'confirmed', availableEquipmentIds: ['eq_leg_press', 'eq_leg_press'] });
    assert.deepEqual(fields(duplicated), ['availableEquipmentIds[1]']);

    assertError(await api.post([]), 400, 'VALIDATION_ERROR', []);
    assertError(await api.post('null'), 400, 'VALIDATION_ERROR', []);
  });

  it('카탈로그에 없는 ID는 400 UNKNOWN_CATALOG_ID이며 형식 오류가 있으면 VALIDATION_ERROR가 먼저다', async () => {
    const unknown = await api.post({ equipmentAvailability: 'confirmed', availableEquipmentIds: ['eq_smith'], excludedBodyPartIds: ['neck'] });
    assertError(unknown, 400, 'UNKNOWN_CATALOG_ID', [
      { field: 'availableEquipmentIds[0]', reason: 'eq_smith는 카탈로그에 없습니다.' },
      { field: 'excludedBodyPartIds[0]', reason: 'neck는 카탈로그에 없습니다.' }
    ]);
    const precedence = await api.post({ equipmentAvailability: 'confirmed', availableEquipmentIds: ['eq_smith'], maxItems: 0 });
    assertError(precedence, 400, 'VALIDATION_ERROR');
  });

  it('선호·제외 부위가 겹치면 명세 예시와 같은 400 CONFLICTING_BODY_PARTS', async () => {
    const res = await api.post({ equipmentAvailability: 'confirmed', availableEquipmentIds: ['eq_chest_press'], preferredBodyPartIds: ['chest'], excludedBodyPartIds: ['chest'] });
    assert.deepEqual(res.json, {
      error: {
        code: 'CONFLICTING_BODY_PARTS',
        message: '선호 부위와 제외 부위가 겹칩니다.',
        details: [{ field: 'preferredBodyPartIds', reason: 'chest가 excludedBodyPartIds에도 포함되어 있습니다.' }]
      }
    });
    assert.equal(res.status, 400);
  });

  it('기구 미확인(unknown)은 200 needs_equipment_confirmation', async () => {
    const res = await api.post({ equipmentAvailability: 'unknown', availableEquipmentIds: [] });
    assertRecommendation(res, 'needs_equipment_confirmation', [], 3);
    assert.match(res.json.data.catalogVersion, /^server-[0-9a-f]{12}$/);
  });

  it('확인 후 기구 없음은 200 no_candidates로 미확인과 구분한다', async () => {
    assertRecommendation(await api.post({ equipmentAvailability: 'confirmed', availableEquipmentIds: [], maxItems: 2 }), 'no_candidates', [], 2);
  });

  it('모든 기구를 선택해도 검수 완료 운동이 없어 no_candidates이며 초안을 후보로 쓰지 않는다', async () => {
    const first = await api.post({ equipmentAvailability: 'confirmed', availableEquipmentIds: CATALOG_EQUIPMENT });
    assertRecommendation(first, 'no_candidates', [], 3);
    const second = await api.post({ equipmentAvailability: 'confirmed', availableEquipmentIds: CATALOG_EQUIPMENT });
    assert.equal(second.json.data.catalogVersion, first.json.data.catalogVersion);
  });

  it('16KB를 넘는 본문은 400 VALIDATION_ERROR', async () => {
    const res = await api.post({ equipmentAvailability: 'unknown', availableEquipmentIds: [], padding: 'x'.repeat(17 * 1024) });
    assertError(res, 400, 'VALIDATION_ERROR', []);
    assert.match(res.json.error.message, /16KB/);
  });

  it('Content-Length 없이 나눠 보낸 큰 본문도 400 VALIDATION_ERROR', async () => {
    const result = await new Promise((resolve, reject) => {
      const req = http.request({ host: '127.0.0.1', port: api.port, method: 'POST', path: '/api/v1/recommendations/today', headers: { 'Content-Type': 'application/json' } }, res => {
        let text = '';
        res.setEncoding('utf8');
        res.on('data', chunk => { text += chunk; });
        res.on('end', () => resolve({ status: res.statusCode, type: res.headers['content-type'], json: JSON.parse(text) }));
      });
      req.on('error', reject);
      req.write(`{"padding":"${'x'.repeat(10 * 1024)}`);
      req.write(`${'x'.repeat(10 * 1024)}"}`);
      req.end();
    });
    assert.equal(result.status, 400);
    assert.equal(result.type, JSON_TYPE);
    assert.equal(result.json.error.code, 'VALIDATION_ERROR');
  });
});

describe('공통 오류 응답', () => {
  let api;
  before(async () => { api = await start(); });
  after(() => api.close());

  it('정의하지 않은 경로는 404 NOT_FOUND', async () => {
    for (const path of ['/', '/api/v1', '/api/v1/body-parts/', '/api/v2/body-parts', '/api/v1/exercises/a/b']) {
      assertError(await api.request(path), 404, 'NOT_FOUND', []);
    }
  });

  it('알려진 경로의 다른 메서드는 405 METHOD_NOT_ALLOWED와 Allow 헤더', async () => {
    const postList = await api.request('/api/v1/body-parts', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{}' });
    assertError(postList, 405, 'METHOD_NOT_ALLOWED', []);
    assert.equal(postList.headers.get('allow'), 'GET, HEAD');
    const getRecommendation = await api.request('/api/v1/recommendations/today');
    assertError(getRecommendation, 405, 'METHOD_NOT_ALLOWED', []);
    assert.equal(getRecommendation.headers.get('allow'), 'POST');
    assertError(await api.request('/api/v1/equipment/eq_leg_press', { method: 'DELETE' }), 405, 'METHOD_NOT_ALLOWED', []);
  });

  it('해석할 수 없는 HTTP 요청에도 JSON 오류를 돌려준다', async () => {
    const raw = await new Promise((resolve, reject) => {
      const socket = net.connect(api.port, '127.0.0.1', () => socket.write('NOT A VALID REQUEST\r\n\r\n'));
      let text = '';
      socket.setEncoding('utf8');
      socket.on('data', chunk => { text += chunk; });
      socket.on('end', () => resolve(text));
      socket.on('error', reject);
    });
    assert.match(raw, /^HTTP\/1\.1 400 /);
    assert.match(raw, /Content-Type: application\/json; charset=utf-8/);
    assert.equal(JSON.parse(raw.split('\r\n\r\n')[1]).error.code, 'BAD_REQUEST');
  });

  it('로그에는 쿼리 문자열과 요청 본문을 남기지 않는다', async () => {
    const lines = [];
    const logged = await start({ logger: { info: line => lines.push(line), error: line => lines.push(line) } });
    try {
      await logged.request('/api/v1/equipment?q=QUERY-MARKER');
      await logged.post({ equipmentAvailability: 'confirmed', availableEquipmentIds: [], note: 'BODY-MARKER' });
      await logged.post('{"broken": "BODY-MARKER"');
    } finally {
      await logged.close();
    }
    assert.ok(lines.some(line => line.startsWith('POST /api/v1/recommendations/today 400')));
    assert.ok(lines.every(line => !line.includes('MARKER')), lines.join('\n'));
  });

  it('PORT 환경 변수 해석', () => {
    assert.equal(parsePort(undefined), DEFAULT_PORT);
    assert.equal(parsePort(''), 8787);
    assert.equal(parsePort('3000'), 3000);
    assert.throws(() => parsePort('abc'));
    assert.throws(() => parsePort('70000'));
  });
});

// ---------------------------------------------------------------------------
// 테스트 전용 가짜 카탈로그(TEST FIXTURE)
// 서버의 공개 필터와 추천 연동을 검증하기 위한 가짜 데이터다.
// 실제 검수 결과·검수자·운동 안내·출처가 아니며 서비스 데이터로 쓰지 않는다.
// ---------------------------------------------------------------------------

const FIXTURE_REVIEW = { reviewedAt: '2026-01-01', reviewerLabel: '테스트 픽스처 가짜 검수자' };
const FIXTURE_SOURCES = [{ title: '테스트 픽스처 가짜 출처', url: 'https://example.test/fixture', checkedAt: '2026-01-01' }];

function fixtureExercise(id, primaryBodyPartId, secondaryBodyPartIds, equipmentIds, overrides = {}) {
  return {
    id, name: `가짜 운동 ${id}`, primaryBodyPartId, secondaryBodyPartIds, equipmentIds, difficulty: 'beginner',
    instructions: ['테스트 픽스처 안내'], cautions: ['테스트 픽스처 주의'], sources: FIXTURE_SOURCES, review: FIXTURE_REVIEW,
    // 로컬 전용 필드. API 응답에 나오면 안 된다.
    sourceBodyPartIds: [primaryBodyPartId], summary: '로컬 전용 요약',
    ...overrides
  };
}

const FIXTURE_CATALOG = {
  bodyParts: [
    { id: 'chest', name: '가슴' }, { id: 'back', name: '등' }, { id: 'legs', name: '하체' }, { id: 'glutes', name: '엉덩이' },
    { id: 'shoulders', name: '어깨' }, { id: 'arms', name: '팔' }, { id: 'core', name: '복부' }
  ],
  equipment: [
    { id: 'eq_leg_press', name: '가짜 레그 프레스', aliases: ['Fixture Leg'], description: '테스트 픽스처 기구', image: null },
    { id: 'eq_chest_press', name: '가짜 체스트 프레스', aliases: ['Fixture Chest'], description: '테스트 픽스처 기구', image: null },
    { id: 'eq_lat_pulldown', name: '가짜 랫 풀다운', aliases: ['Fixture Lat'], description: '테스트 픽스처 기구', image: null }
  ],
  exercises: [
    fixtureExercise('fx_chest_b', 'chest', [], ['eq_chest_press']),
    fixtureExercise('fx_chest_a', 'chest', ['arms'], ['eq_chest_press']),
    fixtureExercise('fx_back_a', 'back', ['arms'], ['eq_lat_pulldown']),
    fixtureExercise('fx_back_two_machines', 'back', [], ['eq_lat_pulldown', 'eq_leg_press']),
    fixtureExercise('fx_legs_a', 'legs', ['glutes'], ['eq_leg_press']),
    // 아래 운동은 공개 조건을 만족하지 않아 목록·상세·추천에 나오면 안 된다.
    fixtureExercise('fx_draft', 'legs', [], ['eq_leg_press'], { review: null }),
    fixtureExercise('fx_intermediate', 'chest', [], ['eq_chest_press'], { difficulty: 'intermediate' }),
    fixtureExercise('fx_secondary_unknown', 'back', null, ['eq_lat_pulldown']),
    fixtureExercise('fx_no_sources', 'legs', [], ['eq_leg_press'], { sources: [] })
  ]
};
const PUBLIC_FIXTURE_IDS = ['fx_back_a', 'fx_back_two_machines', 'fx_chest_a', 'fx_chest_b', 'fx_legs_a'];

describe('테스트 픽스처 카탈로그: 공개 운동 조회', () => {
  let api;
  before(async () => { api = await start({ catalog: FIXTURE_CATALOG }); });
  after(() => api.close());

  it('운동 목록은 공개 운동만 ExerciseSummary 필드로 식별자 오름차순 반환한다', async () => {
    const res = await api.request('/api/v1/exercises');
    assert.equal(res.status, 200);
    assert.deepEqual(ids(res), PUBLIC_FIXTURE_IDS);
    res.json.data.forEach(exercise => assert.deepEqual(Object.keys(exercise).sort(), SUMMARY_KEYS));
    assert.ok(!res.text.includes('sourceBodyPartIds') && !res.text.includes('로컬 전용 요약'));
  });

  it('bodyPartId 필터는 주·보조 부위를 모두 찾고 equipmentId와 함께 쓰면 둘 다 만족해야 한다', async () => {
    assert.deepEqual(ids(await api.request('/api/v1/exercises?bodyPartId=arms')), ['fx_back_a', 'fx_chest_a']);
    assert.deepEqual(ids(await api.request('/api/v1/exercises?bodyPartId=chest')), ['fx_chest_a', 'fx_chest_b']);
    assert.deepEqual(ids(await api.request('/api/v1/exercises?equipmentId=eq_leg_press')), ['fx_back_two_machines', 'fx_legs_a']);
    assert.deepEqual(ids(await api.request('/api/v1/exercises?bodyPartId=glutes&equipmentId=eq_leg_press')), ['fx_legs_a']);
    assert.deepEqual((await api.request('/api/v1/exercises?bodyPartId=shoulders')).json, { data: [] });
  });

  it('운동 상세는 로컬 전용 필드 없이 ExerciseDetail과 review를 반환한다', async () => {
    const res = await api.request('/api/v1/exercises/fx_chest_a');
    assert.equal(res.status, 200);
    assert.deepEqual(Object.keys(res.json.data).sort(), DETAIL_KEYS);
    assert.deepEqual(res.json.data.review, FIXTURE_REVIEW);
    assert.deepEqual(res.json.data.sources, FIXTURE_SOURCES);
    assert.deepEqual(res.json.data.secondaryBodyPartIds, ['arms']);
    assert.deepEqual(res.json.data.instructions, ['테스트 픽스처 안내']);
  });

  it('미검수·비초보자·보조 부위 미정·출처 없는 운동 상세는 404', async () => {
    for (const id of ['fx_draft', 'fx_intermediate', 'fx_secondary_unknown', 'fx_no_sources']) {
      assertError(await api.request(`/api/v1/exercises/${id}`), 404, 'EXERCISE_NOT_FOUND', []);
    }
  });

  it('기구 목록도 식별자 오름차순이다', async () => {
    assert.deepEqual(ids(await api.request('/api/v1/equipment')), ALL_EQUIPMENT);
  });
});

describe('테스트 픽스처 카탈로그: 오늘의 추천', () => {
  let api;
  before(async () => { api = await start({ catalog: FIXTURE_CATALOG, catalogVersion: 'fixture-v1' }); });
  after(() => api.close());

  const confirmed = (extra = {}) => ({ equipmentAvailability: 'confirmed', availableEquipmentIds: ALL_EQUIPMENT, ...extra });

  it('선호 부위 없이 부위 순서(chest→back→legs)로 한 개씩 골라 recommended', async () => {
    const res = await api.post(confirmed());
    assertRecommendation(res, 'recommended', ['fx_chest_a', 'fx_back_a', 'fx_legs_a'], 3);
    assert.equal(res.json.data.catalogVersion, 'fixture-v1');
    res.json.data.items.forEach(item => assert.deepEqual(item.reasonCodes, ['AVAILABLE_EQUIPMENT', 'AUTO_BODY_PART']));
    assert.ok(!res.text.includes('sourceBodyPartIds') && !res.text.includes('review') && !res.text.includes('instructions'));
  });

  it('maxItems 1이면 첫 부위의 첫 운동만 recommended', async () => {
    assertRecommendation(await api.post(confirmed({ maxItems: 1 })), 'recommended', ['fx_chest_a'], 1);
  });

  it('제외 부위는 보조 부위에도 적용된다', async () => {
    const res = await api.post(confirmed({ excludedBodyPartIds: ['arms'] }));
    assertRecommendation(res, 'recommended', ['fx_chest_b', 'fx_back_two_machines', 'fx_legs_a'], 3);
    res.json.data.items.forEach(({ exercise }) => {
      assert.ok(![exercise.primaryBodyPartId, ...exercise.secondaryBodyPartIds].includes('arms'));
    });
  });

  it('선호 부위는 주 부위에만 적용되고 후보가 부족하면 조건을 완화하지 않고 partial', async () => {
    const res = await api.post(confirmed({ preferredBodyPartIds: ['chest'] }));
    assertRecommendation(res, 'partial', ['fx_chest_a', 'fx_chest_b'], 3);
    res.json.data.items.forEach(item => assert.deepEqual(item.reasonCodes, ['AVAILABLE_EQUIPMENT', 'PREFERRED_BODY_PART']));
    // arms는 보조 부위로만 쓰이므로 선호 부위로는 후보가 없다.
    assertRecommendation(await api.post(confirmed({ preferredBodyPartIds: ['arms'] })), 'no_candidates', [], 3);
  });

  it('필요한 기구가 모두 있어야 후보가 된다', async () => {
    assertRecommendation(await api.post({ equipmentAvailability: 'confirmed', availableEquipmentIds: ['eq_lat_pulldown'] }), 'partial', ['fx_back_a'], 3);
  });

  it('선호·제외를 함께 쓰면 둘 다 만족하는 운동만 남고, 없으면 no_candidates', async () => {
    assertRecommendation(await api.post(confirmed({ preferredBodyPartIds: ['chest', 'back'], excludedBodyPartIds: ['arms'] })), 'partial', ['fx_chest_b', 'fx_back_two_machines'], 3);
    assertRecommendation(await api.post(confirmed({ preferredBodyPartIds: ['legs'], excludedBodyPartIds: ['glutes'] })), 'no_candidates', [], 3);
  });

  it('미검수·비초보자 운동은 추천하지 않는다', async () => {
    const res = await api.post(confirmed({ preferredBodyPartIds: ['legs', 'chest', 'back'] }));
    assert.ok(itemIds(res).every(id => PUBLIC_FIXTURE_IDS.includes(id)));
  });
});

describe('카탈로그를 읽을 수 없을 때', () => {
  it('로드에 실패하면 503 CATALOG_UNAVAILABLE이며 내부 정보를 노출하지 않는다', async () => {
    const api = await start({ loadCatalog: () => { throw new Error('INTERNAL-PATH /secret/catalog.js'); } });
    try {
      const res = await api.request('/api/v1/body-parts');
      assertError(res, 503, 'CATALOG_UNAVAILABLE', []);
      assert.ok(!res.text.includes('INTERNAL-PATH'));
      assertError(await api.post({ equipmentAvailability: 'unknown', availableEquipmentIds: [] }), 503, 'CATALOG_UNAVAILABLE', []);
      // 카탈로그 없이 판단할 수 있는 요청 형식 오류는 먼저 알려 준다.
      assertError(await api.post('{'), 400, 'INVALID_JSON', []);
      assertError(await api.request('/api/v1/unknown'), 404, 'NOT_FOUND', []);
    } finally {
      await api.close();
    }
  });

  it('공개 운동이 카탈로그에 없는 기구를 참조하면 카탈로그 오류로 503', async () => {
    const broken = { ...FIXTURE_CATALOG, exercises: [fixtureExercise('fx_broken', 'chest', [], ['eq_missing'])] };
    const api = await start({ catalog: broken });
    try {
      assertError(await api.request('/api/v1/exercises'), 503, 'CATALOG_UNAVAILABLE', []);
    } finally {
      await api.close();
    }
  });

  it('catalog.js를 찾을 수 없으면 503', async () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'undong-api-test-'));
    try {
      fs.copyFileSync(path.join(__dirname, '..', 'recommend.js'), path.join(dir, 'recommend.js'));
      const api = await start({ rootDir: dir });
      try {
        assertError(await api.request('/api/v1/equipment'), 503, 'CATALOG_UNAVAILABLE', []);
      } finally {
        await api.close();
      }
    } finally {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });

  it('로드 실패 후 다음 요청에서 다시 시도한다', async () => {
    let calls = 0;
    const api = await start({ loadCatalog: () => { calls += 1; if (calls <= 2) throw new Error('일시 오류'); return FIXTURE_CATALOG; } });
    try {
      assertError(await api.request('/api/v1/body-parts'), 503, 'CATALOG_UNAVAILABLE', []);
      assert.equal((await api.request('/api/v1/body-parts')).status, 200);
    } finally {
      await api.close();
    }
  });
});

describe('예기치 않은 서버 오류', () => {
  it('추천 계산 중 예외가 나면 500 INTERNAL_ERROR이며 내부 정보를 노출하지 않는다', async () => {
    // 테스트 전용: 예외를 던지는 가짜 recommend.js를 임시 폴더에 만든다.
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'undong-api-test-'));
    const errors = [];
    try {
      fs.copyFileSync(path.join(__dirname, '..', 'catalog.js'), path.join(dir, 'catalog.js'));
      fs.writeFileSync(path.join(dir, 'recommend.js'), "const RECOMMENDER = { recommendToday() { throw new Error('INTERNAL-SECRET'); } };\n");
      const api = await start({ rootDir: dir, logger: { info() {}, error: line => errors.push(line) } });
      try {
        const res = await api.post({ equipmentAvailability: 'unknown', availableEquipmentIds: [] });
        assertError(res, 500, 'INTERNAL_ERROR', []);
        assert.ok(!res.text.includes('INTERNAL-SECRET'));
        assert.ok(errors.some(line => line.includes('INTERNAL-SECRET')));
        assert.equal((await api.request('/api/v1/body-parts')).status, 200);
      } finally {
        await api.close();
      }
    } finally {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });
});
