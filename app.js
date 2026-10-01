'use strict';

(() => {
  const byId = id => document.getElementById(id);
  const bodyName = id => CATALOG.bodyParts.find(part => part.id === id)?.name ?? '미정';
  const equipmentById = id => CATALOG.equipment.find(item => item.id === id);
  const sorted = items => [...items].sort((a, b) => a.id.localeCompare(b.id, 'en'));
  const escapeHtml = value => String(value).replace(/[&<>"']/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[char]));
  const normalize = value => value.normalize('NFKC').trim().toLocaleLowerCase('en');
  let selectedBodyPart = 'all';
  let dialogTrigger = null;
  const dialog = byId('detail-dialog');

  function exerciseCard(exercise) {
    const names = exercise.equipmentIds.map(id => equipmentById(id).name);
    return `<article class="exercise-card">
      <div class="card-visual tone-${exercise.primaryBodyPartId}" aria-hidden="true"><span class="visual-ring"></span><span class="visual-letter">${escapeHtml(bodyName(exercise.primaryBodyPartId))}</span><span class="visual-index">${escapeHtml(names[0].replace(' 머신', ''))}</span></div>
      <div class="card-content"><div class="tags"><span>${exercise.sourceBodyPartIds.map(bodyName).map(escapeHtml).join(' · ')}</span><span class="draft-tag">안내 초안</span></div>
      <h3>${escapeHtml(exercise.name)}</h3><p class="card-copy">${escapeHtml(exercise.summary)}</p>
      <p class="equipment-label">사용 기구</p><div class="equipment-links">${exercise.equipmentIds.map(id => `<button class="text-button" data-equipment="${id}">${escapeHtml(equipmentById(id).name)} <span aria-hidden="true">↗</span></button>`).join('')}</div>
      <button class="detail-button" data-exercise="${exercise.id}" aria-label="${escapeHtml(exercise.name)} 사용법 보기">사용법 보기 <span aria-hidden="true">→</span></button></div>
    </article>`;
  }

  function renderExercises() {
    // 검수 전에는 원문 대상 부위로 탐색한다. 보조 부위를 추정하지 않는다.
    const exercises = sorted(CATALOG.exercises.filter(exercise => selectedBodyPart === 'all' || exercise.sourceBodyPartIds.includes(selectedBodyPart)));
    byId('exercise-list-title').textContent = selectedBodyPart === 'all' ? '전체 운동' : `${bodyName(selectedBodyPart)} 운동`;
    byId('exercise-count').textContent = `${exercises.length}개의 운동`;
    byId('exercise-list').innerHTML = exercises.length ? exercises.map(exerciseCard).join('') : '<div class="empty-state"><strong>아직 등록된 운동이 없어요.</strong><p>다른 부위를 선택해 운동과 기구를 찾아보세요.</p></div>';
    byId('body-options').querySelectorAll('button').forEach(button => button.setAttribute('aria-pressed', String(button.dataset.bodyPart === selectedBodyPart)));
  }

  function renderEquipment() {
    const query = normalize(byId('equipment-query').value);
    const equipment = sorted(CATALOG.equipment.filter(item => !query || [item.name, ...item.aliases].some(name => normalize(name).includes(query))));
    byId('equipment-count').textContent = `${equipment.length}개의 기구`;
    byId('equipment-list').innerHTML = equipment.length ? equipment.map(item => `<article class="equipment-card"><p class="eyebrow">WEIGHT MACHINE</p><h3>${escapeHtml(item.name)}</h3><p class="card-copy">${escapeHtml(item.description)}</p><p class="alias-label">별칭 · ${item.aliases.map(escapeHtml).join(', ')}</p><p class="photo-note">사진 미제공 · 사용 권한 확인 대기</p><button class="detail-button" data-equipment="${item.id}" aria-label="${escapeHtml(item.name)} 상세 보기">기구 상세 보기 <span aria-hidden="true">→</span></button></article>`).join('') : '<div class="empty-state"><strong>검색 결과가 없어요.</strong><p>다른 기구 이름이나 별칭으로 검색해 보세요.</p><button class="text-button" data-reset-search>전체 기구 보기 →</button></div>';
  }

  function sourceList(sources) {
    return `<ul class="source-list">${sources.map(source => `<li><a href="${escapeHtml(source.url)}" target="_blank" rel="noopener noreferrer">${escapeHtml(source.title)} <span aria-hidden="true">↗</span><span class="sr-only"> (새 탭)</span></a><span>확인일 ${escapeHtml(source.checkedAt)}</span></li>`).join('')}</ul>`;
  }

  function showDetail(html, trigger) {
    if (!dialog.open) dialogTrigger = trigger;
    byId('detail-content').innerHTML = html;
    if (!dialog.open) dialog.showModal();
    // 내용 간 이동 시에도 제목부터 읽고, 이전 상세의 스크롤을 초기화한다.
    dialog.scrollTop = 0;
    byId('detail-title').focus({ preventScroll: true });
  }

  function showExercise(id, trigger) {
    const exercise = CATALOG.exercises.find(item => item.id === id);
    if (!exercise) return;
    showDetail(`<p class="detail-kicker">운동 사용 안내 · 초안</p><h2 id="detail-title" tabindex="-1">${escapeHtml(exercise.name)}</h2><p class="detail-description">${escapeHtml(exercise.summary)}</p>
      <dl class="detail-facts"><div><dt>주 사용 부위</dt><dd>${escapeHtml(bodyName(exercise.primaryBodyPartId))} <small>분류 초안</small></dd></div><div><dt>보조 부위</dt><dd>미정 · 전문가 검수 대기</dd></div><div><dt>출처의 대상 부위</dt><dd>${exercise.sourceBodyPartIds.map(bodyName).map(escapeHtml).join(' · ')}</dd></div><div><dt>필요한 기구</dt><dd>${exercise.equipmentIds.map(equipmentId => `<button class="text-button" data-equipment="${equipmentId}">${escapeHtml(equipmentById(equipmentId).name)} ↗</button>`).join('')}</dd></div></dl>
      <h3>기본 사용 순서</h3><ol class="instructions">${exercise.instructions.map(step => `<li>${escapeHtml(step)}</li>`).join('')}</ol>
      <div class="cautions"><h3>동작 중 확인할 점</h3><ul>${exercise.cautions.map(caution => `<li>${escapeHtml(caution)}</li>`).join('')}</ul></div>
      <h3>출처와 확인일</h3>${sourceList(exercise.sources)}<p class="review-note">한국어 안내는 위 출처의 요약입니다. 전문가 검수는 미완료이며 개인별 적합성은 확인하지 않았습니다. 실제 조절 방법은 사용하는 기구의 안내를 확인하세요.</p>`, trigger);
  }

  function showEquipment(id, trigger) {
    const item = equipmentById(id);
    if (!item) return;
    const exercises = sorted(CATALOG.exercises.filter(exercise => exercise.equipmentIds.includes(id)));
    const sources = [...new Map(exercises.flatMap(exercise => exercise.sources).map(source => [source.url, source])).values()];
    showDetail(`<p class="detail-kicker">기구 안내</p><h2 id="detail-title" tabindex="-1">${escapeHtml(item.name)}</h2><p class="detail-description">${escapeHtml(item.description)}</p><dl class="detail-facts"><div><dt>검색할 수 있는 별칭</dt><dd>${item.aliases.map(escapeHtml).join(', ')}</dd></div><div><dt>기구 사진</dt><dd>미제공 · 사진 사용 권한 확인 대기</dd></div></dl><h3>이 기구를 사용하는 운동</h3><div class="related-exercises">${exercises.map(exercise => `<button class="related-button" data-exercise="${exercise.id}"><span>${escapeHtml(exercise.name)}<small>${exercise.sourceBodyPartIds.map(bodyName).map(escapeHtml).join(' · ')}</small></span><span aria-hidden="true">→</span></button>`).join('')}</div><h3>연결 근거</h3>${sourceList(sources)}<p class="review-note">같은 이름의 머신도 모델마다 구조와 조절 방법이 다를 수 있습니다. 사진과 전문가 검수는 준비 중입니다.</p>`, trigger);
  }

  function resetSearch() {
    byId('equipment-query').value = '';
    renderEquipment();
    byId('equipment-query').focus();
  }

  function showView(name) {
    ['body', 'equipment', 'recommend'].forEach(view => { byId(`${view}-view`).hidden = view !== name; });
    document.querySelectorAll('[data-view]').forEach(item => item.setAttribute('aria-pressed', String(item.dataset.view === name)));
  }

  const STATUS_LABELS = { recommended: '추천 완료', partial: '일부만 추천', needs_equipment_confirmation: '기구 확인 필요', no_candidates: '추천 후보 없음' };
  const FIELD_LABELS = { equipmentAvailability: '기구 확인 여부', availableEquipmentIds: '사용할 수 있는 기구', preferredBodyPartIds: '선호 부위', excludedBodyPartIds: '제외 부위', maxItems: '최대 추천 수' };

  function renderRecommendForm() {
    byId('available-equipment').innerHTML = sorted(CATALOG.equipment).map(item => `<div class="equipment-choice"><label><input type="checkbox" name="availableEquipment" value="${item.id}"><span>${escapeHtml(item.name)}<small>별칭 · ${item.aliases.slice(0, 2).map(escapeHtml).join(', ')}</small></span></label><button type="button" class="text-button" data-equipment="${item.id}" aria-label="${escapeHtml(item.name)} 설명 보기">설명</button></div>`).join('');
    const chips = name => CATALOG.bodyParts.map(part => `<label><input type="checkbox" name="${name}" value="${part.id}"> ${escapeHtml(part.name)}</label>`).join('');
    byId('preferred-parts').innerHTML = chips('preferredBodyPart');
    byId('excluded-parts').innerHTML = chips('excludedBodyPart');
    syncEquipmentChoices();
  }

  // 확인하지 않은 기구를 사용 가능한 기구로 간주하지 않도록 확인 전에는 선택을 막는다.
  function syncEquipmentChoices() {
    const confirmed = byId('recommend-form').querySelector('input[name="equipmentAvailability"]:checked')?.value === 'confirmed';
    byId('available-equipment').querySelectorAll('input').forEach(input => {
      input.disabled = !confirmed;
      if (!confirmed) input.checked = false;
    });
    byId('equipment-choice-help').textContent = confirmed ? '확인한 기구만 선택하세요. 쓸 수 있는 기구가 없다면 비워 두세요.' : '‘네, 확인했어요’를 고르면 선택할 수 있어요. 이름을 모르면 설명에서 별칭을 확인하세요.';
  }

  function readRecommendRequest() {
    const form = byId('recommend-form');
    const checked = name => [...form.querySelectorAll(`input[name="${name}"]:checked`)].map(input => input.value);
    const availability = form.querySelector('input[name="equipmentAvailability"]:checked')?.value;
    const request = {
      availableEquipmentIds: availability === 'confirmed' ? checked('availableEquipment') : [],
      preferredBodyPartIds: checked('preferredBodyPart'),
      excludedBodyPartIds: checked('excludedBodyPart'),
      maxItems: Number(byId('max-items').value)
    };
    if (availability) request.equipmentAvailability = availability;
    return request;
  }

  function recommendCard(item) {
    const exercise = item.exercise;
    const draft = !CATALOG.exercises.find(entry => entry.id === exercise.id)?.review;
    const secondary = exercise.secondaryBodyPartIds ? exercise.secondaryBodyPartIds.map(bodyName).join(' · ') || '없음' : '미정 · 전문가 검수 대기';
    return `<li class="recommend-card"><div class="tags"><span>주 사용 부위 · ${escapeHtml(bodyName(exercise.primaryBodyPartId))}</span>${draft ? '<span class="draft-tag">검수 전 초안</span>' : ''}</div>
      <h3>${escapeHtml(exercise.name)}</h3>
      <dl class="recommend-facts"><div><dt>보조 부위</dt><dd>${escapeHtml(secondary)}</dd></div><div><dt>사용 기구</dt><dd>${exercise.equipmentIds.map(id => `<button class="text-button" data-equipment="${id}">${escapeHtml(equipmentById(id).name)} <span aria-hidden="true">↗</span></button>`).join(' ')}</dd></div></dl>
      <p class="reason"><strong>추천 이유</strong>${escapeHtml(item.reason)}</p>
      <button class="detail-button" data-exercise="${exercise.id}" aria-label="${escapeHtml(exercise.name)} 사용법 보기">사용법 보기 <span aria-hidden="true">→</span></button></li>`;
  }

  function renderRecommendation(request, response) {
    const results = byId('recommend-results');
    if (response.error) {
      const lines = response.error.code === 'CONFLICTING_BODY_PARTS'
        ? request.preferredBodyPartIds.filter(id => request.excludedBodyPartIds.includes(id)).map(id => `${bodyName(id)}: 선호 부위와 제외 부위에 모두 선택되어 있어요. 한쪽에서 선택을 해제해 주세요.`)
        : response.error.details.map(detail => `${FIELD_LABELS[detail.field.replace(/\[\d+\]$/, '')] ?? detail.field}: ${detail.reason}`);
      results.innerHTML = `<div class="result-banner status-error" tabindex="-1"><p class="eyebrow">입력 수정 필요</p><strong>${escapeHtml(response.error.message)}</strong><ul>${lines.map(line => `<li>${escapeHtml(line)}</li>`).join('')}</ul><p class="muted">입력은 그대로 두었어요. 수정한 뒤 다시 추천을 받아 보세요.</p></div>`;
    } else {
      const { status, message, requestedCount, returnedCount, items, rulesVersion } = response.data;
      const action = status === 'needs_equipment_confirmation' ? '<button type="button" class="secondary-button" data-go-view="equipment">기구로 찾기에서 확인하기 <span aria-hidden="true">→</span></button>' : '';
      const draftNote = RECOMMENDER.INCLUDE_UNREVIEWED_DRAFT ? ' 전문가 검수 전 안내 초안을 미리보기로 사용합니다.' : '';
      results.innerHTML = `<div class="result-banner status-${status}" tabindex="-1"><p class="eyebrow">${STATUS_LABELS[status]}</p><strong>${escapeHtml(message)}</strong><p class="muted">요청 ${requestedCount}개 · 추천 ${returnedCount}개</p>${action}</div>
        ${items.length ? `<ol class="recommend-list">${items.map(recommendCard).join('')}</ol>` : ''}
        <p class="review-note">추천은 입력 조건과 정렬 규칙(${escapeHtml(rulesVersion)})으로 계산한 결과이며 운동 처방이 아닙니다. 무게·세트·횟수는 제공하지 않아요.${draftNote}</p>`;
    }
    results.querySelector('.result-banner').focus();
  }

  byId('body-options').innerHTML = [{ id: 'all', name: '전체' }, ...CATALOG.bodyParts].map(part => `<button type="button" data-body-part="${part.id}" aria-pressed="${part.id === 'all'}">${escapeHtml(part.name)} <span aria-hidden="true">↗</span></button>`).join('');
  byId('body-options').addEventListener('click', event => {
    const button = event.target.closest('[data-body-part]');
    if (!button) return;
    selectedBodyPart = button.dataset.bodyPart;
    renderExercises();
  });
  document.querySelector('.view-switch').addEventListener('click', event => {
    const button = event.target.closest('[data-view]');
    if (!button) return;
    showView(button.dataset.view);
  });
  document.addEventListener('click', event => {
    const button = event.target.closest('[data-exercise], [data-equipment], [data-reset-search], [data-go-view]');
    if (!button) return;
    if (button.dataset.goView) {
      showView(button.dataset.goView);
      document.querySelector(`.view-switch [data-view="${button.dataset.goView}"]`).focus();
    } else if (button.hasAttribute('data-reset-search')) resetSearch();
    else if (button.dataset.exercise) showExercise(button.dataset.exercise, button);
    else showEquipment(button.dataset.equipment, button);
  });
  byId('equipment-query').addEventListener('input', renderEquipment);
  byId('equipment-search').addEventListener('submit', event => { event.preventDefault(); renderEquipment(); });
  byId('clear-search').addEventListener('click', resetSearch);
  byId('recommend-form').addEventListener('change', event => { if (event.target.name === 'equipmentAvailability') syncEquipmentChoices(); });
  byId('recommend-form').addEventListener('submit', event => {
    event.preventDefault();
    const request = readRecommendRequest();
    renderRecommendation(request, RECOMMENDER.recommendToday(request));
  });
  dialog.addEventListener('close', () => {
    if (dialogTrigger?.isConnected) dialogTrigger.focus({ preventScroll: true });
    dialogTrigger = null;
  });
  byId('catalog-count').textContent = `운동 ${CATALOG.exercises.length}개 · 기구 ${CATALOG.equipment.length}개`;
  renderExercises();
  renderEquipment();
  renderRecommendForm();
})();
