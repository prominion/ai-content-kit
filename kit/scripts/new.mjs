// 새 작업 폴더 + 작업.md.
// 편집/은 ① 브랜드 대표 템플릿이 있으면 그것을 복사 (--no-template 이면 건너뜀 — "새 디자인으로" 요청)
//        ② 없고 영상 종류(reels · longform · ad-creative)면 새 HyperFrames 프로젝트 (hyperframes-core 직행, 키트 규칙 CLAUDE.md 한 장)
//        ③ 아니면 빈 폴더.
// 사용: npm run new -- <종류> "<이름>" [--brand <브랜드>] [--request "<요청 원문>"] [--no-template] [--no-hf]
import fs from 'node:fs';
import path from 'node:path';
import {
  TYPES, VIDEO_TYPES, p, exists, read, write, slug, today, hfInit, copyFonts, brandNames, defaultBrand, brandTemplate, buildWorkLists, ok, bad, warn,
} from './lib.mjs';

const args = process.argv.slice(2);
const opt = (k) => { const i = args.indexOf(k); if (i < 0) return null; const v = args[i + 1]; args.splice(i, 2); return v; };
const flag = (k) => { const i = args.indexOf(k); if (i < 0) return false; args.splice(i, 1); return true; };
const request = opt('--request') || '';
const brandArg = opt('--brand');
const noHF = flag('--no-hf');
const noTemplate = flag('--no-template');
const [type, ...rest] = args;
const rawName = rest.join(' ');
if (!TYPES.includes(type) || !rawName) {
  bad(`사용법: npm run new -- <종류> "<이름>" [--brand <브랜드>]   (종류: ${TYPES.join(' · ')})`);
  process.exit(1);
}

// 브랜드: 지정 > 기본 > 하나뿐이면 그것
const brands = brandNames();
const brand = brandArg ? slug(brandArg) : defaultBrand() || (brands.length === 1 ? brands[0] : null);
if (!brand || !brands.includes(brand)) {
  bad(brand ? `brand/${brand}/ 가 없습니다 (있는 것: ${brands.join(', ') || '없음'}). 만들기: npm run brand -- ${brand}`
    : `브랜드를 정하지 못했습니다. --brand <이름> 을 붙이거나 먼저 만드세요: npm run brand -- <이름>`);
  process.exit(1);
}
if (read(p('brand', brand, 'profile.md')) === brandTemplate('profile.md').replaceAll('{{이름}}', brand)) {
  warn(`brand/${brand}/profile.md 가 아직 빈 양식입니다 — 채우지 않으면 말투 · 색이 브랜드와 안 맞게 나옵니다`);
}
fs.mkdirSync(p('inbox'), { recursive: true });

// 폴더 이름: <날짜>-<이름>, 겹치면 -02, -03 …
const base = `${today()}-${slug(rawName)}`;
let name = base;
for (let n = 2; exists(p('works', type, name)); n++) name = `${base}-${String(n).padStart(2, '0')}`;
const dir = p('works', type, name);

// 편집/
const edit = path.join(dir, '편집');
const tpl = p('brand', brand, 'templates', type);
let logLine = '';
if (exists(tpl) && !noTemplate) {
  fs.cpSync(tpl, edit, { recursive: true, filter: (f) => path.basename(f) !== '템플릿.md' });
  if (VIDEO_TYPES.includes(type)) { for (const d of ['renders', 'assets']) fs.mkdirSync(path.join(edit, d), { recursive: true }); copyFonts(edit); }
  logLine = `[결정] 대표 템플릿에서 시작 — brand/${brand}/templates/${type}`;
  ok(`편집/ — 대표 템플릿에서 시작 (brand/${brand}/templates/${type}). 모양을 새로 하려면 --no-template`);
} else if (VIDEO_TYPES.includes(type) && !noHF) {
  const res = type === 'longform' ? 'landscape' : 'portrait';
  const r = hfInit(edit, {
    resolution: res,
    rules: `- 규칙은 루트 \`CLAUDE.md\`와 \`works/${type}/CLAUDE.md\`(규격 머리말이 우선). 요청 · 재료 · 구성 · 기록은 \`../작업.md\`.\n`
      + `- 전사는 키트 루트에서 \`npm run transcribe -- works/${type}/<작업>/원본/<촬영본>\` → 단어 시간이 이 폴더 \`transcript.json\`으로 온다.\n`
      + '- 렌더는 메인 세션이 한 번에 하나씩, 직전에 "렌더할까요?" 한 번 묻는다.\n',
  });
  if (!r.ok) { bad(`HyperFrames 프로젝트를 만들지 못했습니다:\n${r.err}`); process.exit(1); }
  ok(`편집/ — HyperFrames ${r.v} 프로젝트 (${res}) · 기본 글꼴 Pretendard`);
} else {
  fs.mkdirSync(edit, { recursive: true });
  if (type === 'carousel') copyFonts(edit); // 카드는 로컬 HTML로 찍으므로 글꼴 파일이 옆에 있어야 한다
}
if (exists(tpl) && noTemplate) {
  logLine = `[결정] 새 디자인 — 대표 템플릿(brand/${brand}/templates/${type})을 건너뜀 (--no-template)`;
  ok('편집/ — 대표 템플릿을 건너뛰고 새로 시작 (--no-template)');
}

write(path.join(dir, '작업.md'), read(p('kit', 'forms', '작업.md'))
  .replaceAll('{{이름}}', name).replaceAll('{{종류}}', type).replaceAll('{{브랜드}}', brand).replaceAll('{{날짜}}', today())
  .replaceAll('{{요청}}', request || '(요청 원문을 그대로 적는다)')
  .replace('## 5. 기록\n<!--', `## 5. 기록\n${logLine ? `- ${logLine}\n` : ''}<!--`));
for (const d of ['원본', '완성']) fs.mkdirSync(path.join(dir, d), { recursive: true });

buildWorkLists();
ok(`만들었습니다: works/${type}/${name}/  (브랜드: ${brand} — 목록은 brand/${brand}/작업목록.md)`);
console.log(`다음: 작업.md 「2. 재료」에 레퍼런스 · 원본을 연결하세요.`);
