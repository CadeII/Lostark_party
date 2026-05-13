# 로스트아크 레이드 파티 자동 매칭

GitHub Pages에 바로 올릴 수 있는 정적 웹 앱입니다. 별도 서버, 빌드 도구, npm 패키지가 필요 없습니다.

## 파일 구조

```text
lostark-raid-matcher/
├─ index.html
├─ styles.css
├─ app.js
├─ matcher.js
├─ .nojekyll
└─ data/
   ├─ raids.js
   ├─ classMeta.js
   └─ characters.js
```

## 매칭 규칙

- 4인 파티는 `3 DPS + 1 SUPPORT`입니다.
- 8인 레이드는 4인 파티 2개로 나눠 계산합니다.
- 캐릭터 점수는 `power × skillWeight`입니다.
  - `S = 1`
  - `A = 0.8`
  - `B = 0.5`
- 같은 4인 파티 안에서 owner, 직업, 시너지가 중복되면 제외합니다.
- `reserve: true` 캐릭터는 선택 owner에 없어도 후보로 들어갑니다.
- 기본 옵션에서는 reserve를 임시 인원으로 보고 owner 중복 예외를 허용합니다.
- 8인 레이드에서 owner 7명만 입력된 경우, 외부 구인용 `공석 1자리`를 후보로 넣습니다.
  - 공석은 딜러 또는 서폿 중 필요한 역할로 자동 배치됩니다.
  - 화면에는 확정 총점과 추정 총점을 함께 표시합니다.
  - 파티 균형 비교에는 기존 확정 인원의 평균값을 공석의 임시 추정값으로 사용합니다.
- 헤드어택과 백어택 딜러가 같은 4인 파티에 함께 들어가면 점수 보너스를 줍니다.
  - 예: `헤드어택 + 백어택` 조합이 `헤드어택 + 타대` 조합보다 더 우선됩니다.
- raid key의 앞부분, 예: `cathedral`, `serka`, `end`, 이 같으면 한 번 매칭 후 같은 family 전체를 대기열에서 제거합니다.

## 주요 옵션

`matcher.js`의 `DEFAULT_OPTIONS`에서 조정할 수 있습니다.

```js
allowExternalEmptySlotForEightRaid: true,
externalEmptySlotOwnerCount: 7,
maxExternalSlotsPerEightRaid: 1,
weights: {
  reserve: 900,
  externalSlot: 650,
  headBackPairBonus: 360,
  headBackCoverageBonus: 180,
  sameAttackTypePenalty: 90,
}
```

- `externalSlot`: 공석 사용 페널티입니다. 낮을수록 7명 입력 시 공석을 더 쉽게 사용합니다.
- `reserve`: reserve 캐릭터 사용 페널티입니다.
- `headBackPairBonus`, `headBackCoverageBonus`: 헤드+백 조합 보너스입니다. 높을수록 헤드/백 조합을 더 강하게 우선합니다.
- `sameAttackTypePenalty`: 같은 공격 타입만 몰리는 조합을 약간 낮춥니다.

## GitHub Pages 배포

1. GitHub에 새 public repository를 만듭니다.
2. 이 폴더 안의 파일들을 repository 루트에 업로드합니다.
3. repository `Settings → Pages`로 이동합니다.
4. `Deploy from a branch`를 선택합니다.
5. branch는 `main`, folder는 `/root`를 선택하고 저장합니다.
6. 배포가 끝나면 `https://<github-id>.github.io/<repository-name>/` 주소로 접속합니다.

## 로컬 테스트

브라우저 보안 정책 때문에 ES module을 `file://`로 바로 열면 안 될 수 있습니다.
아래처럼 간단한 정적 서버로 확인하세요.

```bash
cd lostark-raid-matcher
python3 -m http.server 8000
```

그다음 브라우저에서 `http://localhost:8000`으로 접속합니다.

Node 테스트도 가능합니다.

```bash
npm test
```

## 커스터마이징 포인트

- 매칭 점수 조절: `matcher.js`의 `DEFAULT_OPTIONS.weights`
- 8인 7명 공석 허용: UI 옵션 또는 `allowExternalEmptySlotForEightRaid`
- 헤드+백 우선순위: `headBackPairBonus`, `headBackCoverageBonus`, `sameAttackTypePenalty`
- reserve owner 중복 처리: UI 옵션 또는 `allowReserveOwnerOverlap`
- 8인 공격대 전체 owner 중복 금지: UI 옵션 또는 `enforceUniqueOwnerAcrossRaid`
- 같은 raid family 제거 여부: UI 옵션 또는 `consumeRaidFamily`
