# 로스트아크 레이드 파티 자동 매칭

GitHub Pages에 바로 올릴 수 있는 정적 웹앱입니다.

## 구조

```text
.
├── index.html
├── styles.css
├── data/
│   ├── raids.js
│   ├── classMeta.js
│   └── characters.js
└── src/
    ├── app.js
    └── matcher.js
```

## 매칭 규칙

- 레이드는 `partySize` 기준 4인 또는 8인을 지원합니다.
- 4인 파티 단위로 `3 DPS + 1 SUPPORT`를 강제합니다.
- 캐릭터 보정 전투력은 `power * skillWeight`입니다.
  - `S = 1`
  - `A = 0.8`
  - `B = 0.5`
- 같은 4인 파티 안에서는 owner, 직업, 시너지가 중복될 수 없습니다.
- 8인 레이드는 4인 파티 2개로 나누어 계산합니다.
- `reserve: true` 캐릭터는 옵션이 켜져 있을 때만 후보에 포함되며, 점수상 큰 페널티를 줘서 가능한 한 일반 캐릭터를 우선 사용합니다.
- `cathedral_1`, `cathedral_2`, `cathedral_3`처럼 key prefix가 같은 레이드는 하나가 매칭되면 같은 그룹 전체를 대기열에서 제거합니다.

## GitHub Pages 배포

1. GitHub 저장소를 만듭니다.
2. 이 폴더의 파일을 저장소 루트에 업로드합니다.
3. 저장소 Settings → Pages로 이동합니다.
4. Source를 `Deploy from a branch`로 설정합니다.
5. Branch는 `main`, Folder는 `/root`로 설정합니다.
6. 배포 URL에서 `index.html`이 열리는지 확인합니다.

## 주의

`data/characters.js`에 owner, 캐릭터명, 전투력 같은 정보가 들어 있습니다. GitHub Pages로 배포하면 이 데이터는 브라우저에서 내려받는 공개 JS 파일이 됩니다.
