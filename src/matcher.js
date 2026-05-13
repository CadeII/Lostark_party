export const SKILL_WEIGHTS = Object.freeze({
  S: 1,
  A: 0.8,
  B: 0.5,
});

const SUPPORT = "SUPPORT";
const DPS = "DPS";

export function raidGroupKey(raidKey) {
  return String(raidKey || "").split("_")[0];
}

export function consumeRaidGroup(availableRaidKeys, matchedRaidKey) {
  const consumedGroup = raidGroupKey(matchedRaidKey);
  return availableRaidKeys.filter((key) => raidGroupKey(key) !== consumedGroup);
}

export function parseOwnerInput(input) {
  return [...new Set(
    String(input || "")
      .split(/[\n,;|/\s]+/g)
      .map((name) => name.trim())
      .filter(Boolean)
  )];
}

export function getKnownOwners(characters, { includeReserve = false } = {}) {
  return [...new Set(
    characters
      .filter((character) => includeReserve || character.reserve !== true)
      .map((character) => character.owner)
  )].sort((a, b) => a.localeCompare(b, "ko"));
}

export function enrichCharacter(character, classMeta) {
  const classInfo = classMeta?.[character.className];
  const buildInfo = classInfo?.builds?.[character.build];
  const skillWeight = SKILL_WEIGHTS[character.skill] ?? 0;
  const effectivePower = Number((Number(character.power || 0) * skillWeight).toFixed(2));

  return {
    ...character,
    id: `${character.owner}::${character.name}`,
    role: normalizeRole(buildInfo?.role),
    synergies: Array.isArray(buildInfo?.synergies) ? [...buildInfo.synergies] : [],
    attackType: buildInfo?.attackType ?? "타대/기타",
    skillWeight,
    effectivePower,
    reserve: character.reserve === true,
    metaFound: Boolean(buildInfo),
    metaError: buildInfo ? null : `${character.className} / ${character.build} 메타 정보를 찾을 수 없습니다.`,
  };
}

function normalizeRole(role) {
  const value = String(role || "").toUpperCase();
  if (value === "SUPPORT" || value === "SUP") return SUPPORT;
  if (value === "DPS" || value === "딜러") return DPS;
  return "UNKNOWN";
}

export function buildCandidatePool({
  characters,
  classMeta,
  selectedOwners,
  includeReserves = true,
}) {
  const selectedOwnerSet = new Set(selectedOwners);
  const mainCharacters = characters.filter(
    (character) => selectedOwnerSet.has(character.owner) && character.reserve !== true,
  );
  const reserveCharacters = includeReserves
    ? characters.filter((character) => character.reserve === true)
    : [];

  const byId = new Map();
  [...mainCharacters, ...reserveCharacters]
    .map((character) => enrichCharacter(character, classMeta))
    .forEach((character) => byId.set(character.id, character));

  return [...byId.values()];
}

export function isLevelEligible(character, raid) {
  return character.level >= raid.minLevel && character.level <= raid.maxLevel;
}

export function validateParty(members) {
  const reasons = [];

  if (members.length !== 4) {
    reasons.push("4인 파티가 아닙니다.");
  }

  if (members.some((member) => !member.metaFound)) {
    reasons.push("직업/각인 메타 정보가 없는 캐릭터가 있습니다.");
  }

  const supportCount = members.filter((member) => member.role === SUPPORT).length;
  const dpsCount = members.filter((member) => member.role === DPS).length;
  if (supportCount !== 1 || dpsCount !== 3) {
    reasons.push("3딜러 + 1서포터 구성이 아닙니다.");
  }

  const ownerCount = new Set(members.map((member) => member.owner)).size;
  if (ownerCount !== members.length) {
    reasons.push("같은 4인 파티 안에 동일 owner가 있습니다.");
  }

  const classCount = new Set(members.map((member) => member.className)).size;
  if (classCount !== members.length) {
    reasons.push("같은 4인 파티 안에 동일 직업이 있습니다.");
  }

  const synergyMap = new Map();
  for (const member of members) {
    for (const synergy of member.synergies) {
      if (!synergyMap.has(synergy)) synergyMap.set(synergy, []);
      synergyMap.get(synergy).push(member.name);
    }
  }
  const duplicatedSynergies = [...synergyMap.entries()]
    .filter(([, names]) => names.length > 1)
    .map(([synergy]) => synergy);
  if (duplicatedSynergies.length > 0) {
    reasons.push(`중복 시너지: ${duplicatedSynergies.join(", ")}`);
  }

  return {
    ok: reasons.length === 0,
    reasons,
  };
}

function average(values) {
  if (values.length === 0) return 0;
  return values.reduce((sum, value) => sum + value, 0) / values.length;
}

function standardDeviation(values) {
  if (values.length === 0) return 0;
  const avg = average(values);
  const variance = average(values.map((value) => (value - avg) ** 2));
  return Math.sqrt(variance);
}

function countBy(values) {
  const map = new Map();
  for (const value of values) map.set(value, (map.get(value) ?? 0) + 1);
  return map;
}

function sum(values) {
  return values.reduce((total, value) => total + value, 0);
}

function hasBackHeadSynergy(members) {
  return members.some((member) =>
    member.synergies.some((synergy) => synergy.includes("백헤드")),
  );
}

function positionalMemberCount(members) {
  return members.filter((member) => ["백어택", "헤드어택"].includes(member.attackType)).length;
}

export function scoreParty(members) {
  const effectivePowers = members.map((member) => member.effectivePower);
  const totalEffectivePower = sum(effectivePowers);
  const avgEffectivePower = average(effectivePowers);
  const spread = Math.max(...effectivePowers) - Math.min(...effectivePowers);
  const stdev = standardDeviation(effectivePowers);
  const reserveCount = members.filter((member) => member.reserve).length;
  const backHeadSynergy = hasBackHeadSynergy(members);
  const positionalCount = positionalMemberCount(members);

  // 백/헤드 피해 증가 시너지는 백어택/헤드어택 딜러와 있을 때 더 의미가 있으므로 소프트 보정만 줍니다.
  const wastedBackHeadPenalty = backHeadSynergy && positionalCount < 2 ? 500 : 0;
  const positionalBonus = backHeadSynergy ? Math.min(positionalCount, 4) * 40 : 0;

  return {
    totalEffectivePower,
    avgEffectivePower,
    spread,
    stdev,
    reserveCount,
    backHeadSynergy,
    positionalCount,
    qualityScore: reserveCount * 100000 + stdev + spread * 0.15 + wastedBackHeadPenalty - positionalBonus,
  };
}

function combinations(items, size) {
  const result = [];
  const picked = [];

  function dfs(start) {
    if (picked.length === size) {
      result.push([...picked]);
      return;
    }
    const remainingNeeded = size - picked.length;
    for (let index = start; index <= items.length - remainingNeeded; index += 1) {
      picked.push(items[index]);
      dfs(index + 1);
      picked.pop();
    }
  }

  dfs(0);
  return result;
}

export function makeValidFourPersonParties(candidates, raid, { maxParties = 800 } = {}) {
  const eligible = candidates.filter((character) => isLevelEligible(character, raid));
  const supports = eligible.filter((character) => character.role === SUPPORT);
  const dpsCharacters = eligible.filter((character) => character.role === DPS);
  const dpsTriples = combinations(dpsCharacters, 3);
  const parties = [];

  for (const support of supports) {
    for (const triple of dpsTriples) {
      const members = [support, ...triple];
      const validation = validateParty(members);
      if (!validation.ok) continue;
      const metrics = scoreParty(members);
      parties.push({
        members: sortPartyMembers(members),
        metrics,
        objective: metrics.qualityScore,
      });
    }
  }

  return parties
    .sort((a, b) => a.objective - b.objective)
    .slice(0, maxParties);
}

function sortPartyMembers(members) {
  return [...members].sort((a, b) => {
    if (a.role !== b.role) return a.role === SUPPORT ? -1 : 1;
    return b.effectivePower - a.effectivePower;
  });
}

function hasSharedCharacters(a, b) {
  const ids = new Set(a.members.map((member) => member.id));
  return b.members.some((member) => ids.has(member.id));
}

function duplicateOwnerCountAcrossParties(parties) {
  const owners = parties.flatMap((party) => party.members.map((member) => member.owner));
  const counts = countBy(owners);
  return [...counts.values()].reduce((duplicates, count) => duplicates + Math.max(0, count - 1), 0);
}

function summarizeRaidParties(parties) {
  const members = parties.flatMap((party) => party.members);
  const effectivePowers = members.map((member) => member.effectivePower);
  const totalEffectivePower = sum(effectivePowers);
  const partyTotalDiff = parties.length === 2
    ? Math.abs(parties[0].metrics.totalEffectivePower - parties[1].metrics.totalEffectivePower)
    : 0;
  const duplicateOwnersAcrossRaid = duplicateOwnerCountAcrossParties(parties);
  const reserveCount = members.filter((member) => member.reserve).length;

  return {
    totalEffectivePower,
    avgEffectivePower: average(effectivePowers),
    spread: Math.max(...effectivePowers) - Math.min(...effectivePowers),
    stdev: standardDeviation(effectivePowers),
    partyTotalDiff,
    duplicateOwnersAcrossRaid,
    reserveCount,
  };
}

export function findBestMatchForRaid({
  raid,
  candidates,
  allowOwnerRepeatAcrossRaid = true,
  maxParties = 800,
}) {
  if (raid.partySize % 4 !== 0) {
    return {
      ok: false,
      raid,
      reason: "partySize는 4의 배수여야 합니다.",
    };
  }

  const partyCount = raid.partySize / 4;
  if (![1, 2].includes(partyCount)) {
    return {
      ok: false,
      raid,
      reason: "현재 구현은 4인 또는 8인 레이드만 지원합니다.",
    };
  }

  const eligible = candidates.filter((character) => isLevelEligible(character, raid));
  if (eligible.length < raid.partySize) {
    return {
      ok: false,
      raid,
      reason: `레벨 조건을 만족하는 후보가 ${eligible.length}명뿐입니다.`,
    };
  }

  const validFourParties = makeValidFourPersonParties(eligible, raid, { maxParties });
  if (validFourParties.length === 0) {
    return {
      ok: false,
      raid,
      reason: "3딜+1폿, owner/직업/시너지 중복 조건을 만족하는 4인 파티가 없습니다.",
    };
  }

  if (partyCount === 1) {
    const party = validFourParties[0];
    const raidMetrics = summarizeRaidParties([party]);
    return {
      ok: true,
      raid,
      parties: [party],
      metrics: raidMetrics,
      objective: party.objective,
    };
  }

  const raidMatches = [];
  for (let i = 0; i < validFourParties.length; i += 1) {
    for (let j = i + 1; j < validFourParties.length; j += 1) {
      const first = validFourParties[i];
      const second = validFourParties[j];
      if (hasSharedCharacters(first, second)) continue;

      const duplicateOwners = duplicateOwnerCountAcrossParties([first, second]);
      if (!allowOwnerRepeatAcrossRaid && duplicateOwners > 0) continue;

      const metrics = summarizeRaidParties([first, second]);
      const objective =
        metrics.reserveCount * 100000 +
        metrics.duplicateOwnersAcrossRaid * 15000 +
        metrics.partyTotalDiff * 2 +
        metrics.stdev +
        metrics.spread * 0.1 +
        first.metrics.qualityScore * 0.15 +
        second.metrics.qualityScore * 0.15;

      raidMatches.push({
        ok: true,
        raid,
        parties: [first, second],
        metrics,
        objective,
      });
    }
  }

  if (raidMatches.length === 0) {
    return {
      ok: false,
      raid,
      reason: allowOwnerRepeatAcrossRaid
        ? "조건을 만족하는 8인 조합이 없습니다."
        : "조건을 만족하는 8인 조합이 없습니다. 같은 owner의 다른 파티 중복 허용 옵션을 켜면 가능할 수 있습니다.",
    };
  }

  raidMatches.sort((a, b) => a.objective - b.objective);
  return raidMatches[0];
}

export function matchNextRaid({
  ownerNames,
  availableRaidKeys,
  raids,
  characters,
  classMeta,
  includeReserves = true,
  allowOwnerRepeatAcrossRaid = true,
  maxParties = 800,
}) {
  const selectedOwners = Array.isArray(ownerNames) ? ownerNames : parseOwnerInput(ownerNames);
  const knownOwners = new Set(getKnownOwners(characters, { includeReserve: false }));
  const unknownOwners = selectedOwners.filter((owner) => !knownOwners.has(owner));
  const candidates = buildCandidatePool({
    characters,
    classMeta,
    selectedOwners,
    includeReserves,
  });

  const availableSet = new Set(availableRaidKeys);
  const availableRaids = raids.filter((raid) => availableSet.has(raid.key));

  const attempts = availableRaids.map((raid) =>
    findBestMatchForRaid({
      raid,
      candidates,
      allowOwnerRepeatAcrossRaid,
      maxParties,
    }),
  );

  const matches = attempts.filter((attempt) => attempt.ok);
  matches.sort((a, b) => {
    // 기본 정책: 가능한 레이드 중 더 높은 입장 레벨을 먼저 추천합니다.
    if (b.raid.minLevel !== a.raid.minLevel) return b.raid.minLevel - a.raid.minLevel;
    if (b.raid.partySize !== a.raid.partySize) return b.raid.partySize - a.raid.partySize;
    return a.objective - b.objective;
  });

  const best = matches[0] ?? null;
  const nextAvailableRaidKeys = best
    ? consumeRaidGroup(availableRaidKeys, best.raid.key)
    : availableRaidKeys;

  return {
    ok: Boolean(best),
    selectedOwners,
    unknownOwners,
    candidates,
    best,
    attempts,
    nextAvailableRaidKeys,
  };
}
