import { RAIDS } from "../data/raids.js";
import { CLASS_META } from "../data/classMeta.js";
import { CHARACTERS } from "../data/characters.js";
import {
  consumeRaidGroup,
  getKnownOwners,
  matchNextRaid,
  parseOwnerInput,
  raidGroupKey,
} from "./matcher.js";

const STORAGE_KEY = "lostark-raid-matcher.availableRaidKeys.v1";
const HISTORY_KEY = "lostark-raid-matcher.history.v1";

const elements = {
  ownerInput: document.querySelector("#ownerInput"),
  ownerChips: document.querySelector("#ownerChips"),
  queue: document.querySelector("#queue"),
  result: document.querySelector("#result"),
  warnings: document.querySelector("#warnings"),
  matchButton: document.querySelector("#matchButton"),
  resetQueueButton: document.querySelector("#resetQueueButton"),
  clearOwnersButton: document.querySelector("#clearOwnersButton"),
  useReserve: document.querySelector("#useReserve"),
  allowOwnerRepeat: document.querySelector("#allowOwnerRepeat"),
  history: document.querySelector("#history"),
};

function loadAvailableRaidKeys() {
  const stored = localStorage.getItem(STORAGE_KEY);
  if (!stored) return RAIDS.map((raid) => raid.key);
  try {
    const parsed = JSON.parse(stored);
    const raidKeys = new Set(RAIDS.map((raid) => raid.key));
    return Array.isArray(parsed) ? parsed.filter((key) => raidKeys.has(key)) : RAIDS.map((raid) => raid.key);
  } catch {
    return RAIDS.map((raid) => raid.key);
  }
}

function saveAvailableRaidKeys(keys) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(keys));
}

function loadHistory() {
  try {
    return JSON.parse(localStorage.getItem(HISTORY_KEY) || "[]");
  } catch {
    return [];
  }
}

function saveHistory(history) {
  localStorage.setItem(HISTORY_KEY, JSON.stringify(history.slice(0, 20)));
}

let availableRaidKeys = loadAvailableRaidKeys();
let selectedOwners = new Set(parseOwnerInput(elements.ownerInput.value));

function formatNumber(value, digits = 0) {
  return Number(value || 0).toLocaleString("ko-KR", {
    maximumFractionDigits: digits,
    minimumFractionDigits: digits,
  });
}

function renderOwnerChips() {
  const owners = getKnownOwners(CHARACTERS, { includeReserve: false });
  selectedOwners = new Set(parseOwnerInput(elements.ownerInput.value));

  elements.ownerChips.innerHTML = owners
    .map((owner) => {
      const selected = selectedOwners.has(owner);
      return `<button type="button" class="chip ${selected ? "selected" : ""}" data-owner="${escapeHtml(owner)}">${escapeHtml(owner)}</button>`;
    })
    .join("");
}

function renderQueue() {
  const availableSet = new Set(availableRaidKeys);
  elements.queue.innerHTML = RAIDS.map((raid) => {
    const active = availableSet.has(raid.key);
    return `<li class="queue-item ${active ? "active" : "done"}">
      <div>
        <strong>${escapeHtml(raid.name)}</strong>
        <span class="muted">${escapeHtml(raid.key)} · ${raid.partySize}인 · Lv.${raid.minLevel}~${raid.maxLevel === 9999 ? "∞" : raid.maxLevel}</span>
      </div>
      <span class="badge ${active ? "" : "muted-badge"}">${active ? "대기" : "제외"}</span>
    </li>`;
  }).join("");
}

function renderHistory() {
  const history = loadHistory();
  if (history.length === 0) {
    elements.history.innerHTML = `<p class="muted">아직 매칭 기록이 없습니다.</p>`;
    return;
  }

  elements.history.innerHTML = history.map((item) => `
    <article class="history-item">
      <strong>${escapeHtml(item.raidName)}</strong>
      <span class="muted">${escapeHtml(item.createdAt)} · 제거 그룹: ${escapeHtml(item.raidGroup)}</span>
    </article>
  `).join("");
}

function escapeHtml(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function setWarnings(messages) {
  elements.warnings.innerHTML = messages.length
    ? `<ul>${messages.map((message) => `<li>${escapeHtml(message)}</li>`).join("")}</ul>`
    : "";
}

function partyCard(party, index) {
  const rows = party.members.map((member) => `
    <tr>
      <td><span class="role ${member.role === "SUPPORT" ? "support" : "dps"}">${member.role === "SUPPORT" ? "서폿" : "딜러"}</span></td>
      <td>${escapeHtml(member.owner)}</td>
      <td>
        <strong>${escapeHtml(member.name)}</strong>
        ${member.reserve ? `<span class="tag">임시</span>` : ""}
      </td>
      <td>${escapeHtml(member.className)} / ${escapeHtml(member.build)}</td>
      <td>${member.level}</td>
      <td>${formatNumber(member.effectivePower)}</td>
      <td>${escapeHtml(member.synergies.join(", "))}</td>
      <td>${escapeHtml(member.attackType)}</td>
    </tr>
  `).join("");

  return `<section class="party-card">
    <header>
      <h3>${index}파티</h3>
      <div class="metrics">
        <span>합산 ${formatNumber(party.metrics.totalEffectivePower)}</span>
        <span>평균 ${formatNumber(party.metrics.avgEffectivePower)}</span>
        <span>편차 ${formatNumber(party.metrics.stdev)}</span>
      </div>
    </header>
    <div class="table-wrap">
      <table>
        <thead>
          <tr>
            <th>역할</th>
            <th>Owner</th>
            <th>캐릭터</th>
            <th>직업 / 각인</th>
            <th>레벨</th>
            <th>보정 전투력</th>
            <th>시너지</th>
            <th>공격 타입</th>
          </tr>
        </thead>
        <tbody>${rows}</tbody>
      </table>
    </div>
  </section>`;
}

function renderResult(result) {
  if (!result.ok || !result.best) {
    const failed = result.attempts
      .map((attempt) => `${attempt.raid.name}: ${attempt.reason}`)
      .slice(0, 8);
    elements.result.innerHTML = `<article class="empty-result">
      <h2>매칭 가능한 레이드가 없습니다.</h2>
      <p>입력 owner, 임시 캐릭터 사용 여부, 8인 owner 중복 허용 여부를 확인해 주세요.</p>
      ${failed.length ? `<details open><summary>실패 이유</summary><ul>${failed.map((reason) => `<li>${escapeHtml(reason)}</li>`).join("")}</ul></details>` : ""}
    </article>`;
    return;
  }

  const { best } = result;
  const group = raidGroupKey(best.raid.key);
  elements.result.innerHTML = `<article class="result-card">
    <div class="result-header">
      <div>
        <p class="eyebrow">매칭 완료</p>
        <h2>${escapeHtml(best.raid.name)}</h2>
        <p class="muted">${escapeHtml(best.raid.key)} · ${best.raid.partySize}인 · Lv.${best.raid.minLevel}~${best.raid.maxLevel === 9999 ? "∞" : best.raid.maxLevel}</p>
      </div>
      <div class="score-box">
        <strong>${formatNumber(best.metrics.totalEffectivePower)}</strong>
        <span>전체 보정 전투력</span>
      </div>
    </div>

    <div class="summary-grid">
      <div><span>파티 수</span><strong>${best.parties.length}</strong></div>
      <div><span>파티 합산 차이</span><strong>${formatNumber(best.metrics.partyTotalDiff)}</strong></div>
      <div><span>임시 캐릭터</span><strong>${best.metrics.reserveCount}</strong></div>
      <div><span>8인 owner 중복</span><strong>${best.metrics.duplicateOwnersAcrossRaid}</strong></div>
    </div>

    <p class="notice">매칭이 확정되어 <strong>${escapeHtml(group)}</strong> 그룹 레이드는 대기열에서 제거되었습니다.</p>

    ${best.parties.map((party, index) => partyCard(party, index + 1)).join("")}
  </article>`;
}

function runMatch() {
  const ownerNames = parseOwnerInput(elements.ownerInput.value);
  const warnings = [];

  if (ownerNames.length < 4) {
    warnings.push("최소 4명의 owner를 입력해야 4인 파티 조건을 검사할 수 있습니다.");
  }

  const result = matchNextRaid({
    ownerNames,
    availableRaidKeys,
    raids: RAIDS,
    characters: CHARACTERS,
    classMeta: CLASS_META,
    includeReserves: elements.useReserve.checked,
    allowOwnerRepeatAcrossRaid: elements.allowOwnerRepeat.checked,
  });

  if (result.unknownOwners.length > 0) {
    warnings.push(`데이터에 없는 owner: ${result.unknownOwners.join(", ")}`);
  }

  setWarnings(warnings);
  renderResult(result);

  if (result.ok && result.best) {
    availableRaidKeys = result.nextAvailableRaidKeys;
    saveAvailableRaidKeys(availableRaidKeys);
    const history = loadHistory();
    history.unshift({
      raidKey: result.best.raid.key,
      raidName: result.best.raid.name,
      raidGroup: raidGroupKey(result.best.raid.key),
      createdAt: new Date().toLocaleString("ko-KR"),
    });
    saveHistory(history);
    renderQueue();
    renderHistory();
  }
}

function resetQueue() {
  availableRaidKeys = RAIDS.map((raid) => raid.key);
  saveAvailableRaidKeys(availableRaidKeys);
  localStorage.removeItem(HISTORY_KEY);
  renderQueue();
  renderHistory();
  elements.result.innerHTML = `<article class="empty-result"><h2>대기열을 초기화했습니다.</h2></article>`;
}

function clearOwners() {
  elements.ownerInput.value = "";
  renderOwnerChips();
  setWarnings([]);
}

elements.ownerChips.addEventListener("click", (event) => {
  const button = event.target.closest("button[data-owner]");
  if (!button) return;
  const owner = button.dataset.owner;
  const owners = new Set(parseOwnerInput(elements.ownerInput.value));
  if (owners.has(owner)) owners.delete(owner);
  else owners.add(owner);
  elements.ownerInput.value = [...owners].join("\n");
  renderOwnerChips();
});

elements.ownerInput.addEventListener("input", renderOwnerChips);
elements.matchButton.addEventListener("click", runMatch);
elements.resetQueueButton.addEventListener("click", resetQueue);
elements.clearOwnersButton.addEventListener("click", clearOwners);

renderOwnerChips();
renderQueue();
renderHistory();
