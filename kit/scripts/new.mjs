// 새 작업 폴더 + 작업.md.
// 편집/은 ① 브랜드 대표 템플릿이 있으면 그것을 복사 ② 없고 영상 종류(reels · longform · ad-creative)면 새 HyperFrames 프로젝트 ③ 아니면 빈 폴더.
// 영상 종류는 편집/BRIEF.md를 작업.md에서 만들어 둔다 — HyperFrames는 BRIEF.md가 있으면 인터뷰 없이 바로 만든다 (general-video 워크플로).
// 사용: npm run new -- <종류> "<이름>" [--brand <브랜드>] [--request "<요청 원문>"] [--no-hf]
import fs from 'node:fs';
import path from 'node:path';
import {
  TYPES, VIDEO_TYPES, p, exists, read, write, run, slug, today, hfVersion, brandNames, defaultBrand, brandTemplate, buildWorkLists, ok, bad, warn,
} from './lib.mjs';

const args = process.argv.slice(2);
const opt = (k) => { const i = args.indexOf(k); if (i < 0) return null; const v = args[i + 1]; args.splice(i, 2); return v; };
const flag = (k) => { const i = args.indexOf(k); if (i < 0) return false; args.splice(i, 1); return true; };
const request = opt('--request') || '';
const brandArg = opt('--brand');
const noHF = flag('--no-hf');
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
let from = '';
if (exists(tpl)) {
  fs.cpSync(tpl, edit, { recursive: true, filter: (f) => path.basename(f) !== '템플릿.md' });
  for (const d of ['renders', 'assets']) if (VIDEO_TYPES.includes(type)) fs.mkdirSync(path.join(edit, d), { recursive: true });
  from = `brand/${brand}/templates/${type}`;
  ok(`편집/ — 대표 템플릿에서 시작 (${from})`);
} else if (VIDEO_TYPES.includes(type) && !noHF) {
  const res = type === 'longform' ? 'landscape' : 'portrait';
  const v = hfVersion();
  const r = run('npx', ['--yes', `hyperframes@${v}`, 'init', edit, '--non-interactive', '--example=blank', `--resolution=${res}`, '--skill=general-video'],
    { cwd: p(), env: { ...process.env, HYPERFRAMES_SKIP_SKILLS: '1' } });
  if (!r.ok) { bad(`HyperFrames 프로젝트를 만들지 못했습니다:\n${(r.err || r.out).slice(0, 500)}`); process.exit(1); }
  // init이 만든 CLAUDE.md(HyperFrames 규칙 · 명령표)는 지우지 않고 키트 규칙을 앞에 붙인다. AGENTS.md도 그대로 둔다
  const hfClaude = path.join(edit, 'CLAUDE.md');
  write(hfClaude, `# 편집 (HyperFrames 프로젝트)\n\n규칙은 루트 \`CLAUDE.md\`와 \`works/${type}/CLAUDE.md\`를 따른다. 브리프는 이 폴더의 \`BRIEF.md\`(작업.md에서 만들어짐) — 인터뷰 · 피칭 없이 바로 만든다. \`npx hyperframes …\`와 \`npm run dev / check / render\`는 이 폴더 안에서 실행한다.\n폰트 · 효과음 · 음성은 이 폴더의 \`assets/\`로 복사해서 쓴다 (상위 경로 참조 금지). 렌더는 메인 세션이 한 번에 하나씩 한다.\n\n---\n\n${exists(hfClaude) ? read(hfClaude) : ''}`);
  for (const d of ['assets', 'compositions', 'renders']) fs.mkdirSync(path.join(edit, d), { recursive: true });
  ok(`편집/ — HyperFrames ${v} 프로젝트 (${res})`);
} else fs.mkdirSync(edit, { recursive: true });

write(path.join(dir, '작업.md'), read(p('kit', 'forms', '작업.md'))
  .replaceAll('{{이름}}', name).replaceAll('{{종류}}', type).replaceAll('{{브랜드}}', brand).replaceAll('{{날짜}}', today())
  .replaceAll('{{요청}}', request || '(요청 원문을 그대로 적는다)')
  .replace('## 5. 기록\n<!--', `## 5. 기록\n${from ? `- [결정] 대표 템플릿에서 시작 — ${from}\n` : ''}<!--`));
for (const d of ['원본', '완성']) fs.mkdirSync(path.join(dir, d), { recursive: true });

// 영상 종류: 편집/BRIEF.md — HyperFrames가 "브리프 질문을 하지 않는" 토큰. 머리말은 brief-format.md 어휘 그대로
if (VIDEO_TYPES.includes(type)) {
  const spec = { reels: ['1080x1920', '30s'], 'ad-creative': ['1080x1920', '30s'], longform: ['1920x1080', '300s'] }[type];
  const msg = (request || rawName).replace(/"/g, "'").split('\n')[0].slice(0, 80);
  write(path.join(edit, 'BRIEF.md'), [
    '---', 'workflow: general-video', 'flow: automation', 'storyboard: no', `message: "${msg}"`,
    `aspect: ${spec[0]}`, 'language: ko', `length: ${spec[1]}`, '---', '',
    '## Intent', '', request || `${type} 작업 「${name}」. 요청 원문은 ../작업.md 「1. 요청」.`, '',
    '## Assets', '', '../작업.md 「2. 재료」의 경로를 그대로 쓴다 (브랜드 profile · 레퍼런스 패턴.md · 원본/). 쓰는 파일은 이 폴더 assets/로 복사한다.', '',
    '## Notes', '', `- 규격 · 기본값: ../../CLAUDE.md (works/${type}/CLAUDE.md). 길이 · 비율은 거기 머리말이 우선.`,
    '- 브리프 · 피칭 · 스토리보드 질문을 하지 않는다. 정한 것은 ../작업.md 「5. 기록」에 적는다.',
    '- 렌더는 메인 세션이 한 번에 하나씩 한다. 렌더 직전 "렌더할까요?" 한 번만 묻는다.',
    '- 전사는 `npx hyperframes transcribe … --model small --language ko` (기본 모델은 영어로 번역한다).', '',
  ].join('\n'));
}

buildWorkLists();
ok(`만들었습니다: works/${type}/${name}/  (브랜드: ${brand} — 목록은 brand/${brand}/작업목록.md)`);
console.log(`다음: 작업.md 「2. 재료」에 레퍼런스 · 원본을 연결하세요.`);
