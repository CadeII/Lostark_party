export const SKILL_WEIGHTS = Object.freeze({
  S: 1,
  A: 0.8,
  B: 0.5,
});

export const DEFAULT_OPTIONS = Object.freeze({
  maxFourPartyCandidates: 700,
  // 기본값은 같은 raid family를 전역으로 소모하지 않는다.
  // 캐릭터별 사용 기록만 막아서 여러 파티가 같은 family를 순차적으로 갈 수 있게 한다.
  consumeRaidFamily: false,
  enforceUniqueOwnerAcrossRaid: true,
  allowReserveOwnerOverlap: true,
  // 캐릭터 사용 기록은 전체 1회가 아니라 raid family 단위로만 막는다.
  // 예: 같은 캐릭터/각인은 cathedral, serka, end를 각각 1회씩 갈 수 있다.
  trackCharacterUsageByRaidFamily: true,
  // 8인 레이드에 owner가 7명만 입력되면 1자리를 외부 구인 공석으로 허용한다.
  allowExternalEmptySlotForEightRaid: true,
  externalEmptySlotOwnerCount: 7,
  maxExternalSlotsPerEightRaid: 1,
  weights: Object.freeze({
    spread: 1.0,
    stdDev: 0.6,
    betweenPartyTotalDiff: 0.8,
    reserve: 900,
    // 공석은 외부 구인의 불확실성이 있으므로 약간의 패널티를 준다.
    externalSlot: 650,
    // 헤드+백 조합이 헤드+타대, 백+타대보다 앞서도록 보너스를 준다.
    headBackPairBonus: 360,
    headBackCoverageBonus: 180,
    sameAttackTypePenalty: 90,
    metaMissing: 100000,
    invalid: 1000000,
    higherRaidBonus: 0.12,
    totalPowerBonus: 0.03,
  }),
});

function mergeOptions(options = {}) {
  return {
    ...DEFAULT_OPTIONS,
    ...options,
    weights: {
      ...DEFAULT_OPTIONS.weights,
      ...(options.weights ?? {}),
    },
  };
}

export function getRaidFamily(key = "") {
  return String(key).split("_")[0] || String(key);
}

export function getOwners(characters) {
  return [...new Set(characters.map((character) => character.owner))].sort((a, b) =>
    a.localeCompare(b, "ko"),
  );
}

export function getCharacterIdentity(character) {
  if (isExternalSlot(character)) return `external:${character.id}`;

  return [character.owner, character.name, character.className, character.build].join("::");
}

export function getCharacterRaidUsageKey(character, raidFamily) {
  if (isExternalSlot(character)) return null;
  return `${getCharacterIdentity(character)}::${raidFamily}`;
}

export function getMatchCharacterRaidUsageKeys(match) {
  if (!match?.raidFamily) return [];

  const keys = match.parties
    ?.flatMap((party) => party.members ?? [])
    .map((member) => getCharacterRaidUsageKey(member, match.raidFamily))
    .filter(Boolean) ?? [];

  return [...new Set(keys)];
}

function makeCharacterId(character, index) {
  return `${index}:${character.owner}:${character.name}:${character.className}:${character.build}`;
}

function getBuildMeta(character, classMeta) {
  return classMeta?.[character.className]?.builds?.[character.build] ?? null;
}

export function isExternalSlot(member) {
  return Boolean(member?.externalSlot);
}

function createExternalSlot(raid, role) {
  const roleText = role === "SUPPORT" ? "서포터" : "딜러";

  return {
    id: `external:${raid.key}:${role}`,
    owner: "외부 구인",
    name: `공석 ${roleText}`,
    className: "외부",
    build: "공석",
    level: raid.minLevel,
    power: null,
    skill: "-",
    reserve: false,
    externalSlot: true,
    role,
    synergies: [],
    attackType: role === "DPS" ? "미정" : "서폿",
    skillWeight: 0,
    effectivePower: null,
    metaMissing: false,
  };
}

export function enrichCharacters(characters, classMeta) {
  return characters.map((character, index) => {
    const meta = getBuildMeta(character, classMeta);
    const skillWeight = SKILL_WEIGHTS[character.skill] ?? 0;

    return {
      ...character,
      id: makeCharacterId(character, index),
      reserve: Boolean(character.reserve),
      externalSlot: false,
      role: meta?.role ?? "UNKNOWN",
      synergies: [...(meta?.synergies ?? [])],
      attackType: meta?.attackType ?? (meta?.role === "DPS" ? "타대" : "서폿"),
      skillWeight,
      effectivePower: Math.round((Number(character.power) || 0) * skillWeight),
      metaMissing: !meta,
    };
  });
}

function ownerKey(character, options) {
  if (isExternalSlot(character)) return `external:${character.id}`;

  if (character.reserve && options.allowReserveOwnerOverlap) {
    return `reserve:${character.id}`;
  }

  return character.owner;
}

function isLevelEligible(character, raid) {
  if (isExternalSlot(character)) return true;
  return character.level >= raid.minLevel && character.level <= raid.maxLevel;
}

function isSelectable(character, selectedOwners) {
  return selectedOwners.has(character.owner) || character.reserve;
}

function hasUsedCharacterForRaidFamily(character, raidFamily, usedCharacterRaidKeys, options) {
  if (!options.trackCharacterUsageByRaidFamily || isExternalSlot(character)) return false;
  const key = getCharacterRaidUsageKey(character, raidFamily);
  return key ? usedCharacterRaidKeys.has(key) : false;
}

function selectedOwnerCount(selectedOwners) {
  return new Set([...selectedOwners].map((owner) => owner.trim()).filter(Boolean)).size;
}

function shouldAllowExternalSlotForRaid(raid, selectedOwners, options) {
  return Boolean(
    options.allowExternalEmptySlotForEightRaid &&
      raid.partySize === 8 &&
      selectedOwnerCount(selectedOwners) === options.externalEmptySlotOwnerCount &&
      options.maxExternalSlotsPerEightRaid > 0,
  );
}

function uniqueCount(values) {
  return new Set(values).size;
}

function hasDuplicate(values) {
  return uniqueCount(values) !== values.length;
}

function combinations(items, size) {
  const result = [];
  const picked = [];

  function visit(start) {
    if (picked.length === size) {
      result.push([...picked]);
      return;
    }

    const remaining = size - picked.length;
    for (let i = start; i <= items.length - remaining; i += 1) {
      picked.push(items[i]);
      visit(i + 1);
      picked.pop();
    }
  }

  visit(0);
  return result;
}

function repeatedValues(values) {
  const counts = new Map();
  const repeated = new Set();

  for (const value of values) {
    counts.set(value, (counts.get(value) ?? 0) + 1);
    if (counts.get(value) > 1) repeated.add(value);
  }

  return [...repeated];
}

export function validateFourParty(members, options = {}) {
  const opts = mergeOptions(options);
  const reasons = [];

  if (members.length !== 4) {
    reasons.push("4인 파티가 아닙니다.");
  }

  const supports = members.filter((member) => member.role === "SUPPORT");
  const dps = members.filter((member) => member.role === "DPS");

  if (supports.length !== 1) {
    reasons.push(`서포터가 ${supports.length}명입니다. 1명이 필요합니다.`);
  }

  if (dps.length !== 3) {
    reasons.push(`딜러가 ${dps.length}명입니다. 3명이 필요합니다.`);
  }

  const ownerKeys = members.map((member) => ownerKey(member, opts));
  if (hasDuplicate(ownerKeys)) {
    reasons.push(`owner 중복: ${repeatedValues(ownerKeys).join(", ")}`);
  }

  const classNames = members.filter((member) => !isExternalSlot(member)).map((member) => member.className);
  if (hasDuplicate(classNames)) {
    reasons.push(`직업 중복: ${repeatedValues(classNames).join(", ")}`);
  }

  const memberIds = members.map((member) => member.id);
  if (hasDuplicate(memberIds)) {
    reasons.push("동일 캐릭터가 중복 배치되었습니다.");
  }

  const synergies = members.flatMap((member) => member.synergies ?? []);
  if (hasDuplicate(synergies)) {
    reasons.push(`시너지 중복: ${repeatedValues(synergies).join(", ")}`);
  }

  const metaMissing = members.filter((member) => member.metaMissing);
  if (metaMissing.length > 0) {
    reasons.push(`classMeta 누락: ${metaMissing.map((member) => `${member.className}/${member.build}`).join(", ")}`);
  }

  return {
    valid: reasons.length === 0,
    reasons,
  };
}

function standardDeviation(values) {
  if (values.length === 0) return 0;
  const average = values.reduce((sum, value) => sum + value, 0) / values.length;
  const variance = values.reduce((sum, value) => sum + (value - average) ** 2, 0) / values.length;
  return Math.sqrt(variance);
}

function attackTypeStats(members) {
  const dpsMembers = members.filter((member) => !isExternalSlot(member) && member.role === "DPS");
  const head = dpsMembers.filter((member) => member.attackType === "헤드어택").length;
  const back = dpsMembers.filter((member) => member.attackType === "백어택").length;
  const other = Math.max(0, dpsMembers.length - head - back);
  const headBackPairs = head * back;
  const repeatedAttackTypeCount = [head, back, other]
    .map((count) => Math.max(0, count - 1))
    .reduce((sum, count) => sum + count, 0);

  return {
    head,
    back,
    other,
    headBackPairs,
    hasHeadBackMix: head > 0 && back > 0,
    repeatedAttackTypeCount,
  };
}

function partyStats(members) {
  const realMembers = members.filter((member) => !isExternalSlot(member));
  const externalSlotCount = members.length - realMembers.length;
  const realScores = realMembers.map((member) => member.effectivePower).filter((score) => Number.isFinite(score));
  const knownTotal = realScores.reduce((sum, score) => sum + score, 0);
  const knownAverage = realScores.length > 0 ? knownTotal / realScores.length : 0;
  const estimatedScores = [...realScores, ...Array(externalSlotCount).fill(knownAverage)];
  const total = Math.round(estimatedScores.reduce((sum, score) => sum + score, 0));
  const min = estimatedScores.length > 0 ? Math.min(...estimatedScores) : 0;
  const max = estimatedScores.length > 0 ? Math.max(...estimatedScores) : 0;
  const attackTypes = attackTypeStats(members);

  return {
    total,
    knownTotal,
    average: members.length > 0 ? Math.round(total / members.length) : 0,
    knownAverage: realScores.length > 0 ? Math.round(knownAverage) : 0,
    min: Math.round(min),
    max: Math.round(max),
    spread: Math.round(max - min),
    stdDev: Math.round(standardDeviation(estimatedScores)),
    reserveCount: realMembers.filter((member) => member.reserve).length,
    externalSlotCount,
    realMemberCount: realMembers.length,
    attackTypes,
  };
}

function sortPartyMembers(members) {
  return [...members].sort((a, b) => {
    if (isExternalSlot(a) !== isExternalSlot(b)) return isExternalSlot(a) ? 1 : -1;
    if (a.role !== b.role) return a.role === "SUPPORT" ? 1 : -1;
    return (b.effectivePower ?? -1) - (a.effectivePower ?? -1);
  });
}

function fourPartyPenalty(stats, raid, options) {
  const w = options.weights;
  const headBackBonus =
    stats.attackTypes.headBackPairs * w.headBackPairBonus +
    (stats.attackTypes.hasHeadBackMix ? w.headBackCoverageBonus : 0);

  return (
    stats.spread * w.spread +
    stats.stdDev * w.stdDev +
    stats.reserveCount * w.reserve +
    stats.externalSlotCount * w.externalSlot +
    stats.attackTypes.repeatedAttackTypeCount * w.sameAttackTypePenalty -
    headBackBonus -
    stats.total * w.totalPowerBonus -
    raid.minLevel * w.higherRaidBonus
  );
}

function pushFourPartyCandidate(candidates, raid, members, options) {
  const sortedMembers = sortPartyMembers(members);
  const validation = validateFourParty(sortedMembers, options);
  if (!validation.valid) return;

  const stats = partyStats(sortedMembers);
  const penalty = fourPartyPenalty(stats, raid, options);

  candidates.push({
    members: sortedMembers,
    stats,
    penalty,
    validation,
    hasExternalSlot: stats.externalSlotCount > 0,
  });
}

function buildFourPartyCandidates(raid, eligibleCharacters, options = {}, settings = {}) {
  const opts = mergeOptions(options);
  const supports = eligibleCharacters.filter((character) => character.role === "SUPPORT");
  const dpsCharacters = eligibleCharacters.filter((character) => character.role === "DPS");
  const candidates = [];

  for (const support of supports) {
    for (const dpsCombo of combinations(dpsCharacters, 3)) {
      pushFourPartyCandidate(candidates, raid, [...dpsCombo, support], opts);
    }
  }

  if (settings.allowExternalSlot) {
    const externalSupport = createExternalSlot(raid, "SUPPORT");
    for (const dpsCombo of combinations(dpsCharacters, 3)) {
      pushFourPartyCandidate(candidates, raid, [...dpsCombo, externalSupport], opts);
    }

    const externalDps = createExternalSlot(raid, "DPS");
    for (const support of supports) {
      for (const dpsCombo of combinations(dpsCharacters, 2)) {
        pushFourPartyCandidate(candidates, raid, [...dpsCombo, support, externalDps], opts);
      }
    }
  }

  return candidates
    .sort((a, b) => a.penalty - b.penalty)
    .slice(0, opts.maxFourPartyCandidates);
}

function hasCharacterOverlap(firstParty, secondParty) {
  const firstIds = new Set(firstParty.members.map((member) => member.id));
  return secondParty.members.some((member) => firstIds.has(member.id));
}

function hasOwnerOverlapAcrossRaid(firstParty, secondParty, options) {
  if (!options.enforceUniqueOwnerAcrossRaid) return false;

  const firstOwners = new Set(firstParty.members.map((member) => ownerKey(member, options)));
  return secondParty.members.some((member) => firstOwners.has(ownerKey(member, options)));
}

function eightRaidPenalty(firstParty, secondParty, raid, options) {
  const w = options.weights;
  const totalDiff = Math.abs(firstParty.stats.total - secondParty.stats.total);
  return firstParty.penalty + secondParty.penalty + totalDiff * w.betweenPartyTotalDiff - raid.minLevel * w.higherRaidBonus;
}

function buildEightRaidCandidates(raid, fourPartyCandidates, options = {}, settings = {}) {
  const opts = mergeOptions(options);
  const candidates = [];

  for (let i = 0; i < fourPartyCandidates.length; i += 1) {
    for (let j = i + 1; j < fourPartyCandidates.length; j += 1) {
      const firstParty = fourPartyCandidates[i];
      const secondParty = fourPartyCandidates[j];

      if (hasCharacterOverlap(firstParty, secondParty)) continue;
      if (hasOwnerOverlapAcrossRaid(firstParty, secondParty, opts)) continue;

      const externalSlotCount = firstParty.stats.externalSlotCount + secondParty.stats.externalSlotCount;
      if (externalSlotCount > opts.maxExternalSlotsPerEightRaid) continue;

      const total = firstParty.stats.total + secondParty.stats.total;
      const knownTotal = firstParty.stats.knownTotal + secondParty.stats.knownTotal;
      const totalDiff = Math.abs(firstParty.stats.total - secondParty.stats.total);
      const reserveCount = firstParty.stats.reserveCount + secondParty.stats.reserveCount;
      const penalty = eightRaidPenalty(firstParty, secondParty, raid, opts);

      candidates.push({
        parties: [firstParty, secondParty],
        stats: {
          total,
          knownTotal,
          average: Math.round(total / 8),
          betweenPartyTotalDiff: totalDiff,
          reserveCount,
          externalSlotCount,
          realMemberCount: 8 - externalSlotCount,
        },
        penalty,
      });
    }
  }

  const sortedCandidates = candidates.sort((a, b) => a.penalty - b.penalty);

  // owner 7명 입력으로 공석 허용이 켜진 경우, 공석 1개 후보가 있으면 그 후보를 우선한다.
  if (settings.preferExternalSlotCount != null) {
    const preferred = sortedCandidates.filter(
      (candidate) => candidate.stats.externalSlotCount === settings.preferExternalSlotCount,
    );
    if (preferred.length > 0) return preferred;
  }

  return sortedCandidates;
}

function createDiagnostics(
  raid,
  selectableCharacters,
  selectedCharacters,
  eligibleCharacters,
  allowExternalSlot,
  usedCharacterRaidFiltered,
) {
  const eligibleSupports = eligibleCharacters.filter((character) => character.role === "SUPPORT").length;
  const eligibleDps = eligibleCharacters.filter((character) => character.role === "DPS").length;
  const missingMeta = selectedCharacters.filter((character) => character.metaMissing).length;
  const levelFiltered = selectedCharacters.length - eligibleCharacters.length;

  return {
    raidKey: raid.key,
    raidName: raid.name,
    raidFamily: getRaidFamily(raid.key),
    selectableCharacterCount: selectableCharacters.length,
    selectedCharacterCount: selectedCharacters.length,
    eligibleCharacterCount: eligibleCharacters.length,
    eligibleSupports,
    eligibleDps,
    missingMeta,
    levelFiltered,
    usedCharacterRaidFiltered,
    allowExternalSlot,
  };
}

export function matchRaid(raid, selectedOwnerNames, characters, classMeta, options = {}, usedCharacterRaidKeys = []) {
  const opts = mergeOptions(options);
  const raidFamily = getRaidFamily(raid.key);
  const usedCharacterRaidKeySet = new Set(usedCharacterRaidKeys);
  const selectedOwners = new Set(selectedOwnerNames.map((owner) => owner.trim()).filter(Boolean));
  const enrichedCharacters = enrichCharacters(characters, classMeta);
  const selectableCharacters = enrichedCharacters.filter((character) => isSelectable(character, selectedOwners));
  const selectedCharacters = selectableCharacters.filter(
    (character) => !hasUsedCharacterForRaidFamily(character, raidFamily, usedCharacterRaidKeySet, opts),
  );
  const eligibleCharacters = selectedCharacters.filter(
    (character) => !character.metaMissing && isLevelEligible(character, raid),
  );
  const usedCharacterRaidFiltered = selectableCharacters.length - selectedCharacters.length;
  const allowExternalSlot = shouldAllowExternalSlotForRaid(raid, selectedOwners, opts);
  const diagnostics = createDiagnostics(
    raid,
    selectableCharacters,
    selectedCharacters,
    eligibleCharacters,
    allowExternalSlot,
    usedCharacterRaidFiltered,
  );
  const fourPartyCandidates = buildFourPartyCandidates(raid, eligibleCharacters, opts, { allowExternalSlot });

  if (raid.partySize === 4) {
    const bestParty = fourPartyCandidates[0] ?? null;
    if (!bestParty) {
      return { ok: false, raid, reason: "조건을 만족하는 4인 파티가 없습니다.", diagnostics };
    }

    return {
      ok: true,
      raid,
      raidFamily,
      parties: [bestParty],
      stats: {
        total: bestParty.stats.total,
        knownTotal: bestParty.stats.knownTotal,
        average: bestParty.stats.average,
        reserveCount: bestParty.stats.reserveCount,
        externalSlotCount: bestParty.stats.externalSlotCount,
        realMemberCount: bestParty.stats.realMemberCount,
      },
      penalty: bestParty.penalty,
      diagnostics,
      characterRaidUsageKeys: getMatchCharacterRaidUsageKeys({ raidFamily, parties: [bestParty] }),
    };
  }

  if (raid.partySize === 8) {
    const eightRaidCandidates = buildEightRaidCandidates(raid, fourPartyCandidates, opts, {
      preferExternalSlotCount: allowExternalSlot ? 1 : null,
    });
    const bestRaid = eightRaidCandidates[0] ?? null;

    if (!bestRaid) {
      return { ok: false, raid, reason: "조건을 만족하는 8인 공격대가 없습니다.", diagnostics };
    }

    return {
      ok: true,
      raid,
      raidFamily,
      parties: bestRaid.parties,
      stats: bestRaid.stats,
      penalty: bestRaid.penalty,
      diagnostics,
      characterRaidUsageKeys: getMatchCharacterRaidUsageKeys({ raidFamily, parties: bestRaid.parties }),
    };
  }

  return { ok: false, raid, reason: `${raid.partySize}인 레이드는 아직 지원하지 않습니다.`, diagnostics };
}

export function findBestMatch({
  raids,
  selectedOwners,
  characters,
  classMeta,
  usedRaidFamilies = [],
  usedCharacterRaidKeys = [],
  options = {},
}) {
  const opts = mergeOptions(options);
  const usedFamilies = new Set(usedRaidFamilies);
  const candidates = [];
  const failures = [];

  for (const raid of raids) {
    const family = getRaidFamily(raid.key);
    if (opts.consumeRaidFamily && usedFamilies.has(family)) continue;

    const result = matchRaid(raid, selectedOwners, characters, classMeta, opts, usedCharacterRaidKeys);
    if (result.ok) candidates.push(result);
    else failures.push(result);
  }

  if (candidates.length === 0) {
    return { ok: false, reason: "매칭 가능한 레이드가 없습니다.", failures };
  }

  const [best] = candidates.sort((a, b) => a.penalty - b.penalty);
  return { ok: true, match: best, candidates, failures };
}

export function removeMatchedRaidFromQueue(raidQueue, matchedRaid, options = {}) {
  const opts = mergeOptions(options);
  if (!matchedRaid) return [...raidQueue];

  if (opts.consumeRaidFamily) {
    const family = getRaidFamily(matchedRaid.key);
    return raidQueue.filter((raid) => getRaidFamily(raid.key) !== family);
  }

  // 기본 모드에서는 raid 자체를 소모하지 않는다.
  // 같은 레이드도 남은 캐릭터가 있으면 다시 매칭될 수 있다.
  return [...raidQueue];
}

export function getAvailableRaids({
  raids,
  selectedOwners,
  characters,
  classMeta,
  usedRaidFamilies = [],
  usedCharacterRaidKeys = [],
  options = {},
}) {
  const opts = mergeOptions(options);
  const usedFamilies = new Set(usedRaidFamilies);

  return raids.filter((raid) => {
    const family = getRaidFamily(raid.key);
    if (opts.consumeRaidFamily && usedFamilies.has(family)) return false;

    return matchRaid(raid, selectedOwners, characters, classMeta, opts, usedCharacterRaidKeys).ok;
  });
}

export function autoMatchAll({
  raids,
  selectedOwners,
  characters,
  classMeta,
  usedRaidFamilies = [],
  usedCharacterRaidKeys = [],
  options = {},
}) {
  const opts = mergeOptions(options);
  const matches = [];
  let queue = [...raids];
  const usedRaidFamilySet = new Set(usedRaidFamilies);
  const usedCharacterRaidKeySet = new Set(usedCharacterRaidKeys);
  const failuresByRound = [];
  const maxRounds = Math.max(20, raids.length * Math.max(1, characters.length));

  for (let round = 0; round < maxRounds; round += 1) {
    queue = getAvailableRaids({
      raids,
      selectedOwners,
      characters,
      classMeta,
      usedRaidFamilies: [...usedRaidFamilySet],
      usedCharacterRaidKeys: [...usedCharacterRaidKeySet],
      options: opts,
    });

    if (queue.length === 0) break;

    const beforeUsageSize = usedCharacterRaidKeySet.size;
    const beforeFamilySize = usedRaidFamilySet.size;
    const result = findBestMatch({
      raids: queue,
      selectedOwners,
      characters,
      classMeta,
      usedRaidFamilies: [...usedRaidFamilySet],
      usedCharacterRaidKeys: [...usedCharacterRaidKeySet],
      options: opts,
    });

    if (!result.ok) {
      failuresByRound.push(result.failures ?? []);
      break;
    }

    matches.push(result.match);
    usedRaidFamilySet.add(result.match.raidFamily);
    for (const key of getMatchCharacterRaidUsageKeys(result.match)) usedCharacterRaidKeySet.add(key);

    const usageProgressed = usedCharacterRaidKeySet.size > beforeUsageSize;
    const familyProgressed = usedRaidFamilySet.size > beforeFamilySize;
    if (!usageProgressed && !familyProgressed) {
      failuresByRound.push([
        {
          ok: false,
          raid: result.match.raid,
          reason: "사용 기록이 증가하지 않아 자동 매칭을 중단했습니다.",
          diagnostics: result.match.diagnostics,
        },
      ]);
      break;
    }
  }

  const remainingRaids = getAvailableRaids({
    raids,
    selectedOwners,
    characters,
    classMeta,
    usedRaidFamilies: [...usedRaidFamilySet],
    usedCharacterRaidKeys: [...usedCharacterRaidKeySet],
    options: opts,
  });

  return {
    matches,
    remainingRaids,
    usedRaidFamilies: [...usedRaidFamilySet],
    usedCharacterRaidKeys: [...usedCharacterRaidKeySet],
    failuresByRound,
  };
}

export function summarizeMatch(match) {
  if (!match?.ok && !match?.raid) return "매칭 결과 없음";
  const raid = match.raid;
  const externalText = match.stats?.externalSlotCount ? ` / 공석 ${match.stats.externalSlotCount}` : "";
  const lines = [`${raid.name} (${raid.key})${externalText}`];

  match.parties?.forEach((party, index) => {
    const stats = party.stats;
    const externalPartyText = stats.externalSlotCount ? ` / 공석 ${stats.externalSlotCount}` : "";
    lines.push(
      `P${index + 1} 총점 ${stats.total} / 확정 ${stats.knownTotal} / 평균 ${stats.average} / 편차 ${stats.spread}${externalPartyText}`,
    );
    for (const member of party.members) {
      const powerText = isExternalSlot(member) ? "외부 구인" : member.effectivePower;
      lines.push(`- ${member.owner} / ${member.name} / ${member.className} ${member.build} / ${member.role} / ${member.attackType} / ${powerText}`);
    }
  });

  return lines.join("\n");
}
