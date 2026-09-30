'use strict';

// 운동 첫걸음 서버 API. docs/api-spec.md(초안 v0.2)의 계약을 Node.js 표준 라이브러리만으로 구현한다.
// catalog.js·recommend.js 브라우저 스크립트를 node:vm 한 컨텍스트에서 읽는다.
// 검수 완료·초보자용 운동만 공개 카탈로그와 추천 후보로 쓰며, 로컬 안내 초안(review: null)은 공개하지 않는다.
// 추천 입력 원문과 쿼리 문자열은 로그에 남기지 않는다.

const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const crypto = require('node:crypto');

const HOST = '127.0.0.1';
const DEFAULT_PORT = 8787;
const MAX_BODY_BYTES = 16 * 1024;
const MAX_QUERY_LENGTH = 50;
const DEFAULT_ROOT = path.resolve(__dirname, '..');
const JSON_CONTENT_TYPE = 'application/json; charset=utf-8';
const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

// VALIDATION_ERROR·UNKNOWN_CATALOG_ID 문구는 recommend.js와 같다. 추천 오류는 recommend.js의 응답을 그대로 쓴다.
const MESSAGES = {
  VALIDATION_ERROR: '입력 형식을 확인해 주세요.',
  UNKNOWN_CATALOG_ID: '카탈로그에 없는 항목이 포함되어 있습니다.',
  INVALID_JSON: 'JSON 형식이 올바르지 않습니다.',
  EQUIPMENT_NOT_FOUND: '기구를 찾을 수 없습니다.',
  EXERCISE_NOT_FOUND: '운동을 찾을 수 없습니다.',
  UNSUPPORTED_MEDIA_TYPE: 'Content-Type은 application/json이어야 합니다.',
  INTERNAL_ERROR: '요청을 처리하지 못했습니다.',
  CATALOG_UNAVAILABLE: '카탈로그를 불러올 수 없습니다.',
  // 아래는 명세 오류 표에 없는 추가 코드다.
  BODY_TOO_LARGE: `요청 본문은 ${MAX_BODY_BYTES / 1024}KB 이하여야 합니다.`,
  NOT_FOUND: '요청한 경로를 찾을 수 없습니다.',
  METHOD_NOT_ALLOWED: '허용되지 않는 메서드입니다.',
  BAD_REQUEST: '요청을 해석할 수 없습니다.',
  REQUEST_TIMEOUT: '요청 시간이 초과되었습니다.',
  HEADERS_TOO_LARGE: '요청 헤더가 너무 큽니다.'
};

const isNonEmptyString = value => typeof value === 'string' && value !== '';
const isStringArray = value => Array.isArray(value) && value.every(item => typeof item === 'string');
const isDate = value => typeof value === 'string' && DATE_PATTERN.test(value);
const byIdAsc = (a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0);
const toPlain = value => JSON.parse(JSON.stringify(value));
// 화면(app.js)의 검색 정규화와 같다. 영문 대소문자를 구분하지 않는다.
const normalizeText = value => value.normalize('NFKC').trim().toLocaleLowerCase('en');

const ok = (payload, status = 200) => ({ status, payload: { data: payload } });
const fail = (status, code, details = [], message = MESSAGES[code]) => ({ status, payload: { error: { code, message, details } } });

function deepFreeze(value) {
  if (value && typeof value === 'object' && !Object.isFrozen(value)) {
    Object.freeze(value);
    Object.values(value).forEach(deepFreeze);
  }
  return value;
}

// ---------------------------------------------------------------------------
// 브라우저 스크립트 로드
// ---------------------------------------------------------------------------

function loadRuntime({ rootDir = DEFAULT_ROOT, includeCatalog = true } = {}) {
  const files = [...(includeCatalog ? ['catalog.js'] : []), 'recommend.js'].map(name => path.join(rootDir, name));
  const context = vm.createContext({});
  for (const file of files) {
    new vm.Script(fs.readFileSync(file, 'utf8'), { filename: file }).runInContext(context, { timeout: 1000 });
  }
  const exported = vm.runInContext(
    '({ catalog: typeof CATALOG === "undefined" ? undefined : CATALOG, recommender: typeof RECOMMENDER === "undefined" ? undefined : RECOMMENDER })',
    context
  );
  if (!exported.recommender || typeof exported.recommender.recommendToday !== 'function') {
    throw new Error('recommend.js에서 RECOMMENDER.recommendToday를 찾을 수 없습니다.');
  }
  if (includeCatalog && (exported.catalog === null || typeof exported.catalog !== 'object')) {
    throw new Error('catalog.js에서 CATALOG를 찾을 수 없습니다.');
  }
  // vm 컨텍스트는 다른 realm이므로 카탈로그는 JSON으로 복사해 평범한 객체로 쓴다.
  return { catalog: includeCatalog ? toPlain(exported.catalog) : undefined, recommender: exported.recommender };
}

// ---------------------------------------------------------------------------
// 공개 카탈로그 변환
// ---------------------------------------------------------------------------

function assertUniqueIds(items, label) {
  const seen = new Set();
  items.forEach((item, index) => {
    if (!item || typeof item !== 'object' || !isNonEmptyString(item.id)) throw new Error(`${label}[${index}]의 id가 올바르지 않습니다.`);
    if (seen.has(item.id)) throw new Error(`${label}의 id ${item.id}가 중복되었습니다.`);
    seen.add(item.id);
  });
}

const isReview = review => Boolean(review) && typeof review === 'object'
  && isDate(review.reviewedAt) && isNonEmptyString(review.reviewerLabel);
const isSource = source => Boolean(source) && typeof source === 'object'
  && isNonEmptyString(source.title) && isNonEmptyString(source.url) && isDate(source.checkedAt);

// 명세: 검수 완료·초보자용 운동만 공개한다. 상세의 공개 필수 조건(안내·출처 1개 이상, 검수 정보)도 확인한다.
// 보조 부위가 미정(null)이면 제외 부위 판단을 할 수 없으므로 공개하지 않는다.
function isPublicExercise(exercise) {
  return Boolean(exercise) && typeof exercise === 'object'
    && exercise.difficulty === 'beginner'
    && isReview(exercise.review)
    && isNonEmptyString(exercise.name)
    && isNonEmptyString(exercise.primaryBodyPartId)
    && isStringArray(exercise.secondaryBodyPartIds)
    && isStringArray(exercise.equipmentIds)
    && isStringArray(exercise.instructions) && exercise.instructions.length > 0
    && isStringArray(exercise.cautions)
    && Array.isArray(exercise.sources) && exercise.sources.length > 0 && exercise.sources.every(isSource);
}

const toImage = image => (image && typeof image === 'object'
  && ['url', 'alt', 'sourceUrl', 'usageRights'].every(key => isNonEmptyString(image[key]))
  ? { url: image.url, alt: image.alt, sourceUrl: image.sourceUrl, usageRights: image.usageRights }
  : null);

// 로컬 전용 필드(sourceBodyPartIds, summary 등)는 복사하지 않는다.
const toExerciseDetail = exercise => ({
  id: exercise.id,
  name: exercise.name,
  primaryBodyPartId: exercise.primaryBodyPartId,
  secondaryBodyPartIds: [...exercise.secondaryBodyPartIds],
  equipmentIds: [...exercise.equipmentIds],
  difficulty: exercise.difficulty,
  instructions: [...exercise.instructions],
  cautions: [...exercise.cautions],
  sources: exercise.sources.map(({ title, url, checkedAt }) => ({ title, url, checkedAt })),
  review: { reviewedAt: exercise.review.reviewedAt, reviewerLabel: exercise.review.reviewerLabel }
});

const toExerciseSummary = ({ id, name, primaryBodyPartId, secondaryBodyPartIds, equipmentIds, difficulty }) =>
  ({ id, name, primaryBodyPartId, secondaryBodyPartIds, equipmentIds, difficulty });

function buildPublicCatalog(raw) {
  if (!raw || typeof raw !== 'object') throw new Error('카탈로그가 객체가 아닙니다.');
  for (const key of ['bodyParts', 'equipment', 'exercises']) {
    if (!Array.isArray(raw[key])) throw new Error(`카탈로그의 ${key}가 배열이 아닙니다.`);
  }
  assertUniqueIds(raw.bodyParts, 'bodyParts');
  assertUniqueIds(raw.equipment, 'equipment');
  assertUniqueIds(raw.exercises, 'exercises');

  const bodyParts = raw.bodyParts.map(part => {
    if (!isNonEmptyString(part.name)) throw new Error(`부위 ${part.id}의 name이 올바르지 않습니다.`);
    // catalog.js에는 description이 없으므로 명세 예시 형식으로 만든다.
    return { id: part.id, name: part.name, description: isNonEmptyString(part.description) ? part.description : `${part.name} 부위 운동을 찾아보세요.` };
  }).sort(byIdAsc);

  const equipment = raw.equipment.map(item => {
    if (!isNonEmptyString(item.name) || !isStringArray(item.aliases) || typeof item.description !== 'string') {
      throw new Error(`기구 ${item.id}의 형식이 올바르지 않습니다.`);
    }
    return { id: item.id, name: item.name, aliases: [...item.aliases], description: item.description, image: toImage(item.image) };
  }).sort(byIdAsc);

  const bodyPartIds = new Set(bodyParts.map(part => part.id));
  const equipmentIds = new Set(equipment.map(item => item.id));
  const exercises = raw.exercises.filter(isPublicExercise).map(exercise => {
    const unknownPart = [exercise.primaryBodyPartId, ...exercise.secondaryBodyPartIds].find(id => !bodyPartIds.has(id));
    const unknownEquipment = exercise.equipmentIds.find(id => !equipmentIds.has(id));
    if (unknownPart !== undefined || unknownEquipment !== undefined) {
      throw new Error(`공개 운동 ${exercise.id}가 카탈로그에 없는 부위 또는 기구를 참조합니다.`);
    }
    return toExerciseDetail(exercise);
  }).sort(byIdAsc);

  return deepFreeze({ bodyParts, equipment, exercises });
}

function buildState(raw, recommender, catalogVersion) {
  const catalog = buildPublicCatalog(raw);
  const version = catalogVersion
    ?? `server-${crypto.createHash('sha256').update(JSON.stringify(catalog)).digest('hex').slice(0, 12)}`;
  return {
    catalog,
    recommender,
    catalogVersion: version,
    bodyPartIds: new Set(catalog.bodyParts.map(part => part.id)),
    equipmentById: new Map(catalog.equipment.map(item => [item.id, item])),
    exerciseById: new Map(catalog.exercises.map(exercise => [exercise.id, exercise]))
  };
}

// ---------------------------------------------------------------------------
// 쿼리 검증
// ---------------------------------------------------------------------------

function readQuery(search, allowed) {
  const params = new URLSearchParams(search);
  const counts = new Map();
  for (const key of params.keys()) counts.set(key, (counts.get(key) ?? 0) + 1);
  const values = {};
  const errors = [];
  for (const [key, count] of counts) {
    if (!allowed.includes(key)) errors.push({ field: `query.${key}`, reason: '정의되지 않은 쿼리 매개변수입니다.' });
    else if (count > 1) errors.push({ field: `query.${key}`, reason: '같은 쿼리 매개변수를 여러 번 보낼 수 없습니다.' });
    else values[key] = params.get(key);
  }
  return { values, errors };
}

function validateSearchQuery(values, errors) {
  if (values.q === undefined) return {};
  const q = values.q.trim();
  const length = [...q].length;
  if (length < 1 || length > MAX_QUERY_LENGTH) {
    errors.push({ field: 'query.q', reason: `앞뒤 공백을 제외하고 1~${MAX_QUERY_LENGTH}자여야 합니다. 전체 목록은 q를 생략해 주세요.` });
    return {};
  }
  return { q };
}

function validateExerciseFilters(values, errors) {
  const parsed = {};
  for (const key of ['bodyPartId', 'equipmentId']) {
    if (values[key] === undefined) continue;
    if (values[key] === '') errors.push({ field: `query.${key}`, reason: '비어 있지 않은 문자열이어야 합니다.' });
    else parsed[key] = values[key];
  }
  return parsed;
}

// ---------------------------------------------------------------------------
// 라우트 처리
// ---------------------------------------------------------------------------

function listBodyParts({ state }) {
  return ok(state.catalog.bodyParts);
}

function listEquipment({ state, query }) {
  if (query.q === undefined) return ok(state.catalog.equipment);
  const needle = normalizeText(query.q);
  return ok(state.catalog.equipment.filter(item => [item.name, ...item.aliases].some(name => normalizeText(name).includes(needle))));
}

function getEquipment({ state, params }) {
  const item = params[0] === null ? undefined : state.equipmentById.get(params[0]);
  return item ? ok(item) : fail(404, 'EQUIPMENT_NOT_FOUND');
}

function listExercises({ state, query }) {
  const unknown = [];
  if (query.bodyPartId !== undefined && !state.bodyPartIds.has(query.bodyPartId)) {
    unknown.push({ field: 'query.bodyPartId', reason: `${query.bodyPartId}는 카탈로그에 없습니다.` });
  }
  if (query.equipmentId !== undefined && !state.equipmentById.has(query.equipmentId)) {
    unknown.push({ field: 'query.equipmentId', reason: `${query.equipmentId}는 카탈로그에 없습니다.` });
  }
  if (unknown.length) return fail(400, 'UNKNOWN_CATALOG_ID', unknown);
  const exercises = state.catalog.exercises.filter(exercise =>
    (query.bodyPartId === undefined || exercise.primaryBodyPartId === query.bodyPartId || exercise.secondaryBodyPartIds.includes(query.bodyPartId))
    && (query.equipmentId === undefined || exercise.equipmentIds.includes(query.equipmentId)));
  return ok(exercises.map(toExerciseSummary));
}

function getExercise({ state, params }) {
  const exercise = params[0] === null ? undefined : state.exerciseById.get(params[0]);
  return exercise ? ok(exercise) : fail(404, 'EXERCISE_NOT_FOUND');
}

function recommendToday({ state, body }) {
  // 검증과 추천 계산은 recommend.js(draft-v0.1)를 그대로 쓴다. 공개 운동만 넘기고 초안 후보 사용은 끈다.
  const result = toPlain(state.recommender.recommendToday(body, state.catalog, {
    includeUnreviewedDraft: false,
    catalogVersion: state.catalogVersion
  }));
  if (result.error) return { status: 400, payload: { error: result.error } };
  return ok(result.data);
}

const ROUTES = [
  { pattern: /^\/api\/v1\/body-parts$/, method: 'GET', query: [], handle: listBodyParts },
  { pattern: /^\/api\/v1\/equipment$/, method: 'GET', query: ['q'], validate: validateSearchQuery, handle: listEquipment },
  { pattern: /^\/api\/v1\/equipment\/([^/]+)$/, method: 'GET', query: [], handle: getEquipment },
  { pattern: /^\/api\/v1\/exercises$/, method: 'GET', query: ['bodyPartId', 'equipmentId'], validate: validateExerciseFilters, handle: listExercises },
  { pattern: /^\/api\/v1\/exercises\/([^/]+)$/, method: 'GET', query: [], handle: getExercise },
  { pattern: /^\/api\/v1\/recommendations\/today$/, method: 'POST', query: [], handle: recommendToday }
];

// ---------------------------------------------------------------------------
// HTTP 입출력
// ---------------------------------------------------------------------------

function splitUrl(rawUrl = '/') {
  const index = rawUrl.indexOf('?');
  return index === -1 ? { pathname: rawUrl, search: '' } : { pathname: rawUrl.slice(0, index), search: rawUrl.slice(index + 1) };
}

function safeDecode(segment) {
  try {
    return decodeURIComponent(segment);
  } catch {
    return null;
  }
}

// application/json만 허용한다. charset 매개변수가 있으면 utf-8이어야 한다.
function isJsonContentType(header) {
  if (typeof header !== 'string') return false;
  const [type, ...params] = header.split(';');
  if (type.trim().toLowerCase() !== 'application/json') return false;
  return params.every(param => {
    const [name, value = ''] = param.split('=');
    return name.trim().toLowerCase() !== 'charset' || value.trim().replace(/^"(.*)"$/, '$1').toLowerCase() === 'utf-8';
  });
}

class ClientAbortedError extends Error {}

function readBody(req, limit) {
  return new Promise((resolve, reject) => {
    const declared = Number(req.headers['content-length']);
    if (Number.isFinite(declared) && declared > limit) {
      resolve({ tooLarge: true });
      return;
    }
    const chunks = [];
    let size = 0;
    let settled = false;
    const settle = (fn, value) => { if (!settled) { settled = true; fn(value); } };
    req.on('data', chunk => {
      if (settled) return;
      size += chunk.length;
      if (size > limit) {
        chunks.length = 0;
        settle(resolve, { tooLarge: true });
      } else {
        chunks.push(chunk);
      }
    });
    req.on('end', () => settle(resolve, { buffer: Buffer.concat(chunks) }));
    req.on('error', () => settle(reject, new ClientAbortedError('요청 본문을 읽는 중 연결이 끊겼습니다.')));
    req.on('close', () => { if (!req.complete) settle(reject, new ClientAbortedError('요청 본문을 받기 전에 연결이 끊겼습니다.')); });
  });
}

function parseJson(buffer) {
  try {
    return { value: JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(buffer)) };
  } catch {
    return { invalid: true };
  }
}

function send(res, { status, payload }, headers = {}) {
  const body = JSON.stringify(payload);
  res.writeHead(status, {
    'Content-Type': JSON_CONTENT_TYPE,
    'Content-Length': Buffer.byteLength(body),
    'X-Content-Type-Options': 'nosniff',
    'Cache-Control': 'no-store',
    ...headers
  });
  res.end(body);
}

function sendRaw(socket, status, reason, code) {
  const body = JSON.stringify({ error: { code, message: MESSAGES[code], details: [] } });
  socket.end(`HTTP/1.1 ${status} ${reason}\r\nContent-Type: ${JSON_CONTENT_TYPE}\r\nContent-Length: ${Buffer.byteLength(body)}\r\nConnection: close\r\n\r\n${body}`);
}

const silentLogger = { info() {}, error() {} };

/**
 * @param {object} [options]
 * @param {string} [options.rootDir] catalog.js·recommend.js가 있는 폴더. 기본값은 프로젝트 루트.
 * @param {object} [options.catalog] catalog.js 대신 쓸 원본 카탈로그(테스트용 주입).
 * @param {() => object} [options.loadCatalog] 원본 카탈로그를 돌려주는 함수(테스트용 주입). 예외를 던지면 503.
 * @param {string} [options.catalogVersion] 추천 응답의 catalogVersion. 기본값은 공개 카탈로그의 해시.
 * @param {{info: Function, error: Function}} [options.logger] 기본값은 오류만 console.error로 기록.
 */
function createServer(options = {}) {
  const { rootDir = DEFAULT_ROOT, catalogVersion, logger = { info() {}, error: message => console.error(message) } } = options;
  const loadCatalog = options.loadCatalog ?? (options.catalog !== undefined ? () => options.catalog : null);
  let state = null;

  // 성공한 로드만 보관한다. 실패하면 503을 돌려주고 다음 요청에서 다시 시도한다.
  function getState() {
    if (state) return state;
    try {
      if (loadCatalog) {
        const { recommender } = loadRuntime({ rootDir, includeCatalog: false });
        state = buildState(toPlain(loadCatalog()), recommender, catalogVersion);
      } else {
        const runtime = loadRuntime({ rootDir, includeCatalog: true });
        state = buildState(runtime.catalog, runtime.recommender, catalogVersion);
      }
      return state;
    } catch (error) {
      logger.error(`카탈로그를 불러오지 못했습니다: ${error && error.message}`);
      return null;
    }
  }

  async function handle(req, res) {
    const { pathname, search } = splitUrl(req.url);
    const route = ROUTES.find(candidate => candidate.pattern.test(pathname));
    if (!route) return send(res, fail(404, 'NOT_FOUND'));

    const method = req.method === 'HEAD' && route.method === 'GET' ? 'GET' : req.method;
    if (method !== route.method) {
      return send(res, fail(405, 'METHOD_NOT_ALLOWED'), { Allow: route.method === 'GET' ? 'GET, HEAD' : route.method });
    }

    const params = pathname.match(route.pattern).slice(1).map(safeDecode);
    const { values, errors } = readQuery(search, route.query);
    const query = errors.length || !route.validate ? values : route.validate(values, errors);
    if (errors.length) return send(res, fail(400, 'VALIDATION_ERROR', errors));

    let body;
    if (route.method === 'POST') {
      if (!isJsonContentType(req.headers['content-type'])) return send(res, fail(415, 'UNSUPPORTED_MEDIA_TYPE'));
      const received = await readBody(req, MAX_BODY_BYTES);
      if (received.tooLarge) {
        // 명세 오류 표에 413이 없어 400 VALIDATION_ERROR로 응답하고, 남은 본문을 받지 않도록 연결을 닫는다.
        return send(res, fail(400, 'VALIDATION_ERROR', [], MESSAGES.BODY_TOO_LARGE), { Connection: 'close' });
      }
      const parsed = parseJson(received.buffer);
      if (parsed.invalid) return send(res, fail(400, 'INVALID_JSON'));
      body = parsed.value;
    }

    const current = getState();
    if (!current) return send(res, fail(503, 'CATALOG_UNAVAILABLE'));
    return send(res, route.handle({ state: current, params, query, body }));
  }

  const server = http.createServer((req, res) => {
    const started = process.hrtime.bigint();
    // 경로와 상태만 기록한다. 쿼리 문자열과 요청 본문은 기록하지 않는다.
    res.on('finish', () => {
      const ms = Number(process.hrtime.bigint() - started) / 1e6;
      logger.info(`${req.method} ${splitUrl(req.url).pathname} ${res.statusCode} ${ms.toFixed(1)}ms`);
    });
    handle(req, res).catch(error => {
      if (error instanceof ClientAbortedError) return;
      logger.error(`요청 처리 중 예기치 않은 오류: ${error && error.stack ? error.stack : error}`);
      if (res.headersSent || res.destroyed) {
        res.destroy();
        return;
      }
      send(res, fail(500, 'INTERNAL_ERROR'));
    });
  });

  // 잘못된 HTTP 요청에도 JSON 오류 본문을 돌려준다.
  server.on('clientError', (error, socket) => {
    if (error.code === 'ECONNRESET' || !socket.writable) {
      socket.destroy();
      return;
    }
    if (error.code === 'ERR_HTTP_REQUEST_TIMEOUT') sendRaw(socket, 408, 'Request Timeout', 'REQUEST_TIMEOUT');
    else if (error.code === 'HPE_HEADER_OVERFLOW') sendRaw(socket, 431, 'Request Header Fields Too Large', 'HEADERS_TOO_LARGE');
    else sendRaw(socket, 400, 'Bad Request', 'BAD_REQUEST');
  });

  getState(); // 시작할 때 한 번 읽어 두고, 실패하면 오류를 기록한다.
  return server;
}

function parsePort(value) {
  if (value === undefined || value === '') return DEFAULT_PORT;
  if (!/^\d+$/.test(value) || Number(value) > 65535) throw new Error(`PORT 값이 올바르지 않습니다: ${value}`);
  return Number(value);
}

if (require.main === module) {
  let port;
  try {
    port = parsePort(process.env.PORT);
  } catch (error) {
    console.error(error.message);
    process.exit(1);
  }
  const server = createServer({
    logger: { info: message => console.log(message), error: message => console.error(message) }
  });
  server.on('error', error => {
    console.error(error.code === 'EADDRINUSE' ? `${port}번 포트를 이미 사용 중입니다. PORT 환경 변수로 다른 포트를 지정해 주세요.` : `서버를 시작하지 못했습니다: ${error.message}`);
    process.exit(1);
  });
  server.listen(port, HOST, () => {
    console.log(`운동 첫걸음 API 서버: http://${HOST}:${server.address().port}/api/v1`);
  });
  const shutdown = () => {
    server.close(() => process.exit(0));
    server.closeAllConnections();
  };
  process.on('SIGINT', shutdown);
  process.on('SIGTERM', shutdown);
}

module.exports = { createServer, loadRuntime, buildPublicCatalog, parsePort, HOST, DEFAULT_PORT, MAX_BODY_BYTES };
