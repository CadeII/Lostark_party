import { RAIDS } from "./data/raids.js";
import { CLASS_META } from "./data/classMeta.js";
import { CHARACTERS } from "./data/characters.js";
import {
  autoMatchAll,
  findBestMatch,
  getCharacterIdentity,
  getMatchCharacterRaidUsageKeys,
  getRaidFamily,
  isExternalSlot,
  matchRaid,
  summarizeMatch,
} from "./matcher.js";

const selectedOwners = ["찬범", "재진", "강찬", "준형", "준혁", "혁준", "혜연"];

const one = findBestMatch({
  raids: RAIDS,
  selectedOwners,
  characters: CHARACTERS,
  classMeta: CLASS_META,
});

console.log("[single match]");
if (one.ok) console.log(summarizeMatch(one.match));
else console.log(one.reason, one.failures?.map((failure) => failure.reason));

console.log("\n[8-person raid with seven owners]");
const hardEnd = RAIDS.find((raid) => raid.key === "end_hard");
const eight = matchRaid(hardEnd, selectedOwners, CHARACTERS, CLASS_META);
if (!eight.ok) {
  throw new Error(`8인 7명 공석 매칭 실패: ${eight.reason}`);
}
const externalCount = eight.parties.flatMap((party) => party.members).filter(isExternalSlot).length;
if (externalCount !== 1) {
  throw new Error(`8인 7명 매칭은 공석 1자리를 포함해야 합니다. 현재 ${externalCount}자리`);
}
console.log(summarizeMatch(eight));
console.log(`external slots: ${externalCount}`);

console.log("\n[all matches: character usage is per raid family]");
const all = autoMatchAll({ raids: RAIDS, selectedOwners, characters: CHARACTERS, classMeta: CLASS_META });
console.log(`matches: ${all.matches.length}`);
for (const match of all.matches) console.log(summarizeMatch(match), "\n");
console.log("remaining:", all.remainingRaids.map((raid) => raid.key));

const matchedFamilies = new Set(all.matches.map((match) => getRaidFamily(match.raid.key)));
for (const requiredFamily of ["cathedral", "serka", "end"]) {
  if (!matchedFamilies.has(requiredFamily)) {
    throw new Error(`${requiredFamily} family 매칭이 필요합니다.`);
  }
}

const usedCharacterRaidKeys = new Set();
const familiesByCharacter = new Map();

for (const match of all.matches) {
  for (const key of getMatchCharacterRaidUsageKeys(match)) {
    if (usedCharacterRaidKeys.has(key)) {
      throw new Error(`같은 캐릭터/각인이 같은 raid family에 중복 사용되었습니다: ${key}`);
    }
    usedCharacterRaidKeys.add(key);
  }

  const family = match.raidFamily;
  const members = match.parties.flatMap((party) => party.members).filter((member) => !isExternalSlot(member));
  for (const member of members) {
    const identity = getCharacterIdentity(member);
    if (!familiesByCharacter.has(identity)) familiesByCharacter.set(identity, new Set());
    familiesByCharacter.get(identity).add(family);
  }
}

const reusedAcrossFamilies = [...familiesByCharacter.entries()].filter(([, families]) => families.size >= 2);
if (reusedAcrossFamilies.length === 0) {
  throw new Error("같은 캐릭터/각인이 서로 다른 raid family에 재사용되는 케이스가 필요합니다.");
}

console.log("reused across raid families:");
for (const [identity, families] of reusedAcrossFamilies.slice(0, 5)) {
  console.log(`- ${identity}: ${[...families].join(", ")}`);
}
