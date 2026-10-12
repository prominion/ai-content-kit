# 공용 소재

모든 브랜드가 함께 쓰는 폰트 · BGM · 효과음 (무료 · 공용). 한 브랜드만 쓰는 것은 `brand/<브랜드>/assets/`(폰트 · bgm · 효과음)에 두고 그 브랜드의 `소재.md`에 적는다.
찾는 순서: 그 브랜드 → 여기(공용) → (효과음만) `.claude/skills/media-use/audio/assets/sfx/`의 무료 효과음 20개 (Pixabay 라이선스 · 출처 표기 불필요, 목록은 그 폴더 `manifest.json`). 영상에 쓸 때는 작업의 `편집/assets/`로 **복사**한다 (HyperFrames 렌더는 프로젝트 안 파일만 읽는다). 이번 영상 한 편에만 쓰는 BGM은 그 작업의 `원본/`에.

| 파일 | 종류 | 분위기 · 쓰임 | 길이 | 출처 · 라이선스 |
|---|---|---|---|---|
| `fonts/Pretendard-Regular · SemiBold · Bold · ExtraBold.woff2` | 폰트 | **키트 기본 글꼴.** 본문 400 · 강조 600 · 제목 700~800. 영상 · GIF · 상세페이지 · 캐러셀 공통 | — | Pretendard v1.3.9 (github.com/orioncactus/pretendard), SIL OFL 1.1 — `fonts/Pretendard-LICENSE.txt` |

기본 글꼴은 Pretendard 하나만 들어 있다. 다른 폰트 · BGM · 효과음은 사용자가 직접 넣는다 (브랜드 전용이면 `brand/<브랜드>/assets/`).
`npm run new`(영상 종류)와 `npm run gif`는 Pretendard를 작업의 `편집/assets/fonts/`로 복사해 둔다. `@font-face`는 `fonts/pretendard.css`에 있다.
새 파일을 넣으면 위 표에 한 줄 추가한다. 출처 · 라이선스를 모르는 파일은 넣지 않는다.
