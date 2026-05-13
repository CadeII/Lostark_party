import { RAIDS } from "./data/raids.js";
import { CLASS_META } from "./data/classMeta.js";
import { CHARACTERS } from "./data/characters.js";
import { autoMatchAll, findBestMatch, isExternalSlot, matchRaid, summarizeMatch } from "./matcher.js";

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

console.log("\n[all matches]");
const all = autoMatchAll({ raids: RAIDS, selectedOwners, characters: CHARACTERS, classMeta: CLASS_META });
console.log(`matches: ${all.matches.length}`);
for (const match of all.matches) console.log(summarizeMatch(match), "\n");
console.log("remaining:", all.remainingRaids.map((raid) => raid.key));
