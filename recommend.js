'use strict';

// 기획서 추천 규칙 draft-v0.1과 API 명세의 추천 계약을 브라우저에서 계산한다.
// 서버 API가 아니며 입력과 결과를 저장하지 않는다. 운동 처방 근거가 아니다.
const RECOMMENDER = (() => {
  const RULES_VERSION = 'draft-v0.1';
  const CATALOG_VERSION = 'local-draft-2026-10-01';
  const BODY_PART_ORDER = ['chest', 'back', 'legs', 'glutes', 'shoulders', 'arms', 'core'];
  // 로컬 화면의 미리보기 예외: 검수 전 안내 초안도 후보로 쓴다. 서버는 false로 호출해 검수 완료 운동만 쓴다.
  const INCLUDE_UNREVIEWED_DRAFT = true;
  const FIELDS = ['equipmentAvailability', 'availableEquipmentIds', 'preferredBodyPartIds', 'excludedBodyPartIds', 'maxItems'];
  const ERROR_MESSAGES = {
    VALIDATION_ERROR: '입력 형식을 확인해 주세요.',
    UNKNOWN_CATALOG_ID: '카탈로그에 없는 항목이 포함되어 있습니다.',
    CONFLICTING_BODY_PARTS: '선호 부위와 제외 부위가 겹칩니다.'
  };
  const has = (object, key) => Object.prototype.hasOwnProperty.call(object, key);
  const byIdAsc = (a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0);
  const failure = (code, details) => ({ error: { code, message: ERROR_MESSAGES[code], details } });

  function checkIdArray(body, field, required, knownIds, errors, unknownIds) {
    if (!has(body, field)) {
      if (required) errors.push({ field, reason: '필수 항목입니다.' });
      return [];
    }
    const value = body[field];
    if (!Array.isArray(value)) {
      errors.push({ field, reason: value === null ? '명시적 null은 허용하지 않습니다.' : '문자열 배열이어야 합니다.' });
      return [];
    }
    const seen = new Set();
    value.forEach((id, index) => {
      const itemField = `${field}[${index}]`;
      if (typeof id !== 'string' || id === '') errors.push({ field: itemField, reason: '비어 있지 않은 문자열이어야 합니다.' });
      else if (seen.has(id)) errors.push({ field: itemField, reason: `${id}가 중복되었습니다.` });
      else if (!knownIds.has(id)) unknownIds.push({ field: itemField, reason: `${id}는 카탈로그에 없습니다.` });
      seen.add(id);
    });
    return value;
  }

  // 모든 입력 검증을 추천 계산보다 먼저 수행한다. 순서: 형식 → 카탈로그 ID → 부위 충돌.
  function validate(body, catalog) {
    if (body === null || typeof body !== 'object' || Array.isArray(body)) return failure('VALIDATION_ERROR', []);
    const errors = [];
    const unknownIds = [];
    Object.keys(body).filter(key => !FIELDS.includes(key)).forEach(field => errors.push({ field, reason: '정의되지 않은 필드입니다.' }));

    const availability = body.equipmentAvailability;
    if (!has(body, 'equipmentAvailability')) errors.push({ field: 'equipmentAvailability', reason: '필수 항목입니다.' });
    else if (availability !== 'unknown' && availability !== 'confirmed') errors.push({ field: 'equipmentAvailability', reason: 'unknown 또는 confirmed여야 합니다.' });

    const equipmentIds = new Set(catalog.equipment.map(item => item.id));
    const bodyPartIds = new Set(catalog.bodyParts.map(part => part.id));
    const available = checkIdArray(body, 'availableEquipmentIds', true, equipmentIds, errors, unknownIds);
    const preferred = checkIdArray(body, 'preferredBodyPartIds', false, bodyPartIds, errors, unknownIds);
    const excluded = checkIdArray(body, 'excludedBodyPartIds', false, bodyPartIds, errors, unknownIds);
    if (availability === 'unknown' && available.length) errors.push({ field: 'availableEquipmentIds', reason: '기구 확인 상태가 unknown이면 빈 배열이어야 합니다.' });

    let maxItems = 3;
    if (has(body, 'maxItems')) {
      if (Number.isInteger(body.maxItems) && body.maxItems >= 1 && body.maxItems <= 3) maxItems = body.maxItems;
      else errors.push({ field: 'maxItems', reason: body.maxItems === null ? '명시적 null은 허용하지 않습니다.' : '1~3의 정수여야 합니다.' });
    }

    if (errors.length) return failure('VALIDATION_ERROR', errors);
    if (unknownIds.length) return failure('UNKNOWN_CATALOG_ID', unknownIds);
    const conflicts = preferred.filter(id => excluded.includes(id));
    if (conflicts.length) return failure('CONFLICTING_BODY_PARTS', conflicts.map(id => ({ field: 'preferredBodyPartIds', reason: `${id}가 excludedBodyPartIds에도 포함되어 있습니다.` })));
    return { request: { equipmentAvailability: availability, availableEquipmentIds: available, preferredBodyPartIds: preferred, excludedBodyPartIds: excluded, maxItems } };
  }

  const isRecommendable = (exercise, includeDraft) => exercise.difficulty === 'beginner' && (Boolean(exercise.review) || includeDraft);
  // 보조 부위가 미정(null)인 초안은 원문 대상 부위까지 제외 판단에 넣어 보수적으로 거른다.
  const involvedBodyPartIds = exercise => [exercise.primaryBodyPartId, ...(exercise.secondaryBodyPartIds ?? exercise.sourceBodyPartIds ?? [])];
  const summary = ({ id, name, primaryBodyPartId, secondaryBodyPartIds, equipmentIds, difficulty }) => ({ id, name, primaryBodyPartId, secondaryBodyPartIds, equipmentIds, difficulty });

  function reasonText(exercise, catalog, preferred, excluded) {
    const partName = id => catalog.bodyParts.find(part => part.id === id)?.name ?? id;
    const equipment = exercise.equipmentIds.map(id => catalog.equipment.find(item => item.id === id).name).join(', ');
    const part = partName(exercise.primaryBodyPartId);
    let text = `선택한 기구(${equipment})를 모두 사용할 수 있으며, `;
    text += preferred.length ? `선호 부위인 ${part} 운동에 해당합니다.` : `선호 부위를 지정하지 않아 부위 순서 규칙에 따라 ${part} 운동을 골랐습니다.`;
    if (excluded.length) {
      const names = excluded.map(partName).join('·');
      // 보조 부위가 미정이면 확인한 범위(주 사용 부위와 출처의 대상 부위)만 말한다.
      text += exercise.secondaryBodyPartIds
        ? ` 제외한 부위(${names})는 이 운동의 사용 부위에 포함되지 않습니다.`
        : ` 제외한 부위(${names})는 주 사용 부위와 출처의 대상 부위에 포함되지 않습니다. 보조 부위는 검수 전이라 미정입니다.`;
    }
    return text;
  }

  function recommendToday(body, catalog = CATALOG, { includeUnreviewedDraft = INCLUDE_UNREVIEWED_DRAFT, catalogVersion = CATALOG_VERSION } = {}) {
    const checked = validate(body, catalog);
    if (checked.error) return checked;
    const { equipmentAvailability, availableEquipmentIds, preferredBodyPartIds, excludedBodyPartIds, maxItems } = checked.request;
    const result = (status, items, message) => ({ data: { status, catalogVersion, rulesVersion: RULES_VERSION, requestedCount: maxItems, returnedCount: items.length, items, message } });

    if (equipmentAvailability === 'unknown') return result('needs_equipment_confirmation', [], '사용할 수 있는 기구를 먼저 확인해 주세요. 기구 찾기에서 이름과 별칭으로 확인할 수 있어요.');
    if (!availableEquipmentIds.length) return result('no_candidates', [], '확인한 기구 중 사용할 수 있는 기구가 없어 추천할 운동이 없어요. 없는 기구는 추천하지 않습니다.');

    const candidates = catalog.exercises.filter(exercise => isRecommendable(exercise, includeUnreviewedDraft)
      && exercise.equipmentIds.every(id => availableEquipmentIds.includes(id))
      && !involvedBodyPartIds(exercise).some(id => excludedBodyPartIds.includes(id))
      && (!preferredBodyPartIds.length || preferredBodyPartIds.includes(exercise.primaryBodyPartId)));
    // 부위 순서대로 한 개씩 순회하고, 자리가 남으면 같은 순서로 다음 운동을 고른다.
    const groups = BODY_PART_ORDER.map(partId => candidates.filter(exercise => exercise.primaryBodyPartId === partId).sort(byIdAsc));
    const picked = [];
    for (let round = 0; picked.length < maxItems && groups.some(group => group.length > round); round += 1) {
      groups.forEach(group => { if (picked.length < maxItems && group[round]) picked.push(group[round]); });
    }

    const items = picked.map(exercise => ({
      exercise: summary(exercise),
      reasonCodes: ['AVAILABLE_EQUIPMENT', preferredBodyPartIds.length ? 'PREFERRED_BODY_PART' : 'AUTO_BODY_PART'],
      reason: reasonText(exercise, catalog, preferredBodyPartIds, excludedBodyPartIds)
    }));
    if (!items.length) return result('no_candidates', [], '입력 조건에 맞는 운동이 없어요. 조건은 그대로 두었습니다. 기구나 부위 조건을 바꿔 다시 요청해 보세요.');
    if (items.length < maxItems) return result('partial', items, `조건에 맞는 운동이 ${items.length}개뿐이라 요청한 ${maxItems}개보다 적게 추천해요. 조건은 바꾸지 않았습니다.`);
    return result('recommended', items, `입력 조건에 맞는 운동 ${items.length}개를 찾았습니다.`);
  }

  return { recommendToday, RULES_VERSION, CATALOG_VERSION, INCLUDE_UNREVIEWED_DRAFT };
})();
