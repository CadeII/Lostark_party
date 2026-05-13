import { RAIDS } from "./data/raids.js";
import { CLASS_META } from "./data/classMeta.js";
import { CHARACTERS } from "./data/characters.js";
import {
  autoMatchAll,
  enrichCharacters,
  findBestMatch,
  getOwners,
  getRaidFamily,
  removeMatchedRaidFromQueue,
} from "./matcher.js";

const state = {
  selectedOwners: new Set(getOwners(CHARACTERS).filter((owner) => owner !== "영수")),
  raidQueue: [...RAIDS],
  matched: [],
  options: {
    consumeRaidFamily: true,
    enforceUniqueOwnerAcrossRaid: true,
    allowReserveOwnerOverlap: true,
    allowExternalEmptySlotForEightRaid: true,
  },
};

const elements = {
  ownerList: document.querySelector("#ownerList"),
  ownerInput: document.querySelector("#ownerInput"),
  selectedOwnerText: document.querySelector("#selectedOwnerText"),
  raidQueue: document.querySelector("#raidQueue"),
  results: document.querySelector("#results"),
  diagnostics: document.querySelector("#diagnostics"),
  matchOneButton: document.querySelector("#matchOneButton"),
  matchAllButton: document.querySelector("#matchAllButton"),
  resetQueueButton: document.querySelector("#resetQueueButton"),
  resetResultsButton: document.querySelector("#resetResultsButton"),
  consumeRaidFamily: document.querySelector("#consumeRaidFamily"),
  enforceUniqueOwnerAcrossRaid: document.querySelector("#enforceUniqueOwnerAcrossRaid"),
  allowReserveOwnerOverlap: document.querySelector("#allowReserveOwnerOverlap"),
  allowExternalEmptySlotForEightRaid: document.querySelector("#allowExternalEmptySlotForEightRaid"),
  characterSummary: document.querySelector("#characterSummary"),
};

function updateOptionsFromUi() {
  state.options.consumeRaidFamily = elements.consumeRaidFamily.checked;
  state.options.enforceUniqueOwnerAcrossRaid = elements.enforceUniqueOwnerAcrossRaid.checked;
  state.options.allowReserveOwnerOverlap = elements.allowReserveOwnerOverlap.checked;
  state.options.allowExternalEmptySlotForEightRaid = elements.allowExternalEmptySlotForEightRaid.checked;
}

function parseOwnerInput() {
  const inputOwners = elements.ownerInput.value
    .split(/[,\.\n\s]+/)
    .map((owner) => owner.trim())
    .filter(Boolean);

  if (inputOwners.length > 0) {
    state.selectedOwners = new Set(inputOwners);
  }
}

function formatNumber(value) {
  return new Intl.NumberFormat("ko-KR").format(Math.round(value ?? 0));
}

function roleLabel(role) {
  return role === "SUPPORT" ? "서폿" : "딜러";
}

function renderOwners() {
  const owners = getOwners(CHARACTERS);
  elements.ownerList.innerHTML = owners
    .map((owner) => {
      const checked = state.selectedOwners.has(owner) ? "checked" : "";
      return `
        <label class="chip owner-chip">
          <input type="checkbox" value="${owner}" ${checked} />
          <span>${owner}</span>
        </label>
      `;
    })
    .join("");

  elements.ownerList.querySelectorAll("input").forEach((input) => {
    input.addEventListener("change", () => {
      if (input.checked) state.selectedOwners.add(input.value);
      else state.selectedOwners.delete(input.value);
      renderSelectedOwnerText();
      renderCharacterSummary();
    });
  });

  renderSelectedOwnerText();
}

function renderSelectedOwnerText() {
  const selected = [...state.selectedOwners];
  elements.selectedOwnerText.textContent = selected.length > 0
    ? `${selected.length}명 선택: ${selected.join(", ")}`
    : "선택된 owner가 없습니다.";
}

function renderRaidQueue() {
  if (state.raidQueue.length === 0) {
    elements.raidQueue.innerHTML = `<div class="empty">대기열에 남은 레이드가 없습니다.</div>`;
    return;
  }

  elements.raidQueue.innerHTML = state.raidQueue
    .map((raid) => `
      <article class="raid-card">
        <div>
          <strong>${raid.name}</strong>
          <span class="muted">${raid.key}</span>
        </div>
        <div class="raid-meta">
          <span>${raid.partySize}인</span>
          <span>${raid.minLevel}~${raid.maxLevel === 9999 ? "∞" : raid.maxLevel}</span>
          <span>family: ${getRaidFamily(raid.key)}</span>
        </div>
      </article>
    `)
    .join("");
}

function renderCharacterSummary() {
  const enriched = enrichCharacters(CHARACTERS, CLASS_META);
  const selectedOwners = state.selectedOwners;
  const active = enriched.filter((character) => selectedOwners.has(character.owner));
  const reserves = enriched.filter((character) => character.reserve);
  const supports = active.filter((character) => character.role === "SUPPORT").length;
  const dps = active.filter((character) => character.role === "DPS").length;
  const externalSlotReady = state.options.allowExternalEmptySlotForEightRaid && selectedOwners.size === 7;

  elements.characterSummary.innerHTML = `
    <div class="metric"><strong>${active.length}</strong><span>선택 owner 보유 캐릭터</span></div>
    <div class="metric"><strong>${dps}</strong><span>딜러</span></div>
    <div class="metric"><strong>${supports}</strong><span>서포터</span></div>
    <div class="metric"><strong>${reserves.length}</strong><span>reserve 후보</span></div>
    <div class="metric"><strong>${externalSlotReady ? "ON" : "OFF"}</strong><span>8인 7명 공석 허용</span></div>
  `;
}

function renderMember(member) {
  if (member.externalSlot) {
    return `
      <li class="member external-slot">
        <div class="member-main">
          <strong>외부 구인</strong>
          <span>${member.name}</span>
          <span class="badge external">공백 슬롯</span>
        </div>
        <div class="member-sub">
          <span>${roleLabel(member.role)}</span>
          <span>외부에서 모집</span>
          <span>전투력/숙련도 미정</span>
        </div>
        <div class="member-tags">
          <span>시너지 미정</span>
          <span>${member.attackType}</span>
        </div>
      </li>
    `;
  }

  const reserveBadge = member.reserve ? `<span class="badge reserve">reserve</span>` : "";
  return `
    <li class="member ${member.role.toLowerCase()}">
      <div class="member-main">
        <strong>${member.owner}</strong>
        <span>${member.name}</span>
        ${reserveBadge}
      </div>
      <div class="member-sub">
        <span>${roleLabel(member.role)}</span>
        <span>${member.className} / ${member.build}</span>
        <span>Lv.${member.level}</span>
        <span>전투력 ${formatNumber(member.power)}</span>
        <span>숙련 ${member.skill} × ${member.skillWeight}</span>
        <strong>보정 ${formatNumber(member.effectivePower)}</strong>
      </div>
      <div class="member-tags">
        ${(member.synergies ?? []).map((synergy) => `<span>${synergy}</span>`).join("")}
        <span>${member.attackType}</span>
      </div>
    </li>
  `;
}

function renderMatch(match, index) {
  const raid = match.raid;
  const hasExternal = (match.stats.externalSlotCount ?? 0) > 0;

  return `
    <section class="match-card">
      <header class="match-header">
        <div>
          <h3>${index + 1}. ${raid.name}</h3>
          <p>${raid.key} · ${raid.partySize}인 · Lv.${raid.minLevel}~${raid.maxLevel === 9999 ? "∞" : raid.maxLevel}</p>
        </div>
        <div class="score-box">
          <strong>${formatNumber(match.stats.total)}</strong>
          <span>${hasExternal ? "추정 보정 전투력" : "총 보정 전투력"}</span>
          ${hasExternal ? `<small>확정 ${formatNumber(match.stats.knownTotal)} · 공석 ${match.stats.externalSlotCount}</small>` : ""}
        </div>
      </header>
      <div class="party-grid">
        ${match.parties
          .map((party, partyIndex) => `
            <article class="party-card">
              <h4>파티 ${partyIndex + 1}</h4>
              <div class="party-stats">
                <span>${party.stats.externalSlotCount ? "추정" : "총점"} ${formatNumber(party.stats.total)}</span>
                ${party.stats.externalSlotCount ? `<span>확정 ${formatNumber(party.stats.knownTotal)}</span>` : ""}
                <span>평균 ${formatNumber(party.stats.average)}</span>
                <span>편차 ${formatNumber(party.stats.spread)}</span>
                <span>reserve ${party.stats.reserveCount}</span>
                ${party.stats.externalSlotCount ? `<span>외부 공석 ${party.stats.externalSlotCount}</span>` : ""}
                <span>헤드 ${party.stats.attackTypes.head} · 백 ${party.stats.attackTypes.back} · 타대 ${party.stats.attackTypes.other}</span>
                ${party.stats.attackTypes.hasHeadBackMix ? `<span>헤드+백 우선</span>` : ""}
              </div>
              <ul>${party.members.map(renderMember).join("")}</ul>
            </article>
          `)
          .join("")}
      </div>
    </section>
  `;
}

function renderResults() {
  if (state.matched.length === 0) {
    elements.results.innerHTML = `<div class="empty">아직 매칭 결과가 없습니다.</div>`;
    return;
  }

  elements.results.innerHTML = state.matched.map(renderMatch).join("");
}

function renderDiagnostics(failures = []) {
  if (!failures.length) {
    elements.diagnostics.innerHTML = "";
    return;
  }

  elements.diagnostics.innerHTML = `
    <details open>
      <summary>매칭 실패/제외 레이드 진단</summary>
      <ul>
        ${failures
          .map((failure) => {
            const d = failure.diagnostics;
            return `
              <li>
                <strong>${failure.raid.name}</strong>: ${failure.reason}
                <span class="muted">후보 ${d.eligibleCharacterCount}명, 딜러 ${d.eligibleDps}, 서폿 ${d.eligibleSupports}, 레벨 제외 ${d.levelFiltered}, meta 누락 ${d.missingMeta}, 공석 허용 ${d.allowExternalSlot ? "ON" : "OFF"}</span>
              </li>
            `;
          })
          .join("")}
      </ul>
    </details>
  `;
}

function render() {
  renderSelectedOwnerText();
  renderRaidQueue();
  renderCharacterSummary();
  renderResults();
}

function runMatchOne() {
  parseOwnerInput();
  updateOptionsFromUi();

  const result = findBestMatch({
    raids: state.raidQueue,
    selectedOwners: [...state.selectedOwners],
    characters: CHARACTERS,
    classMeta: CLASS_META,
    options: state.options,
  });

  if (!result.ok) {
    renderDiagnostics(result.failures ?? []);
    render();
    return;
  }

  state.matched.push(result.match);
  state.raidQueue = removeMatchedRaidFromQueue(state.raidQueue, result.match.raid, state.options);
  renderDiagnostics(result.failures ?? []);
  render();
}

function runMatchAll() {
  parseOwnerInput();
  updateOptionsFromUi();

  const result = autoMatchAll({
    raids: state.raidQueue,
    selectedOwners: [...state.selectedOwners],
    characters: CHARACTERS,
    classMeta: CLASS_META,
    options: state.options,
  });

  state.matched.push(...result.matches);
  state.raidQueue = result.remainingRaids;
  renderDiagnostics(result.failuresByRound.flat());
  render();
}

function resetQueue() {
  state.raidQueue = [...RAIDS];
  renderDiagnostics([]);
  render();
}

function resetResults() {
  state.matched = [];
  renderDiagnostics([]);
  render();
}

function bindEvents() {
  elements.matchOneButton.addEventListener("click", runMatchOne);
  elements.matchAllButton.addEventListener("click", runMatchAll);
  elements.resetQueueButton.addEventListener("click", resetQueue);
  elements.resetResultsButton.addEventListener("click", resetResults);

  [
    elements.consumeRaidFamily,
    elements.enforceUniqueOwnerAcrossRaid,
    elements.allowReserveOwnerOverlap,
    elements.allowExternalEmptySlotForEightRaid,
  ].forEach((input) => {
    input.addEventListener("change", () => {
      updateOptionsFromUi();
      renderCharacterSummary();
    });
  });
}

renderOwners();
bindEvents();
render();
