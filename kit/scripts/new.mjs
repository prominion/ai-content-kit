// 새 작업 폴더 + 작업.md. 영상 종류(reels · longform · ad-creative)는 편집/에 HyperFrames 프로젝트를 만든다.
// 사용: npm run new -- <종류> "<이름>" [--request "<요청 원문>"] [--no-hf]
import fs from 'node:fs';
import path from 'node:path';
import { TYPES, VIDEO_TYPES, p, exists, read, write, run, slug, today, hfVersion, ok, bad, warn } from './lib.mjs';

const args = process.argv.slice(2);
const opt = (k) => { const i = args.indexOf(k); if (i < 0) return null; const v = args[i + 1]; args.splice(i, 2); return v; };
const flag = (k) => { const i = args.indexOf(k); if (i < 0) return false; args.splice(i, 1); return true; };
const request = opt('--request') || '';
const noHF = flag('--no-hf');
const [type, ...rest] = args;
const rawName = rest.join(' ');
if (!TYPES.includes(type) || !rawName) {
  bad(`사용법: npm run new -- <종류> "<이름>"   (종류: ${TYPES.join(' · ')})`);
  process.exit(1);
}

// 처음이면 brand/를 양식으로 만든다
if (!exists(p('brand', 'profile.md'))) {
  write(p('brand', 'profile.md'), read(p('kit', 'templates', 'profile.md')));
  for (const d of ['products', 'assets']) fs.mkdirSync(p('brand', d), { recursive: true });
  warn('brand/profile.md 를 새로 만들었습니다 — 내용을 채워야 결과물이 내 브랜드에 맞습니다');
} else if (read(p('brand', 'profile.md')) === read(p('kit', 'templates', 'profile.md'))) {
  warn('brand/profile.md 가 아직 빈 양식입니다 — 채우지 않으면 말투 · 색이 브랜드와 안 맞게 나옵니다');
}
fs.mkdirSync(p('inbox'), { recursive: true });

// 폴더 이름: <날짜>-<이름>, 겹치면 -02, -03 …
const base = `${today()}-${slug(rawName)}`;
let name = base;
for (let n = 2; exists(p('works', type, name)); n++) name = `${base}-${String(n).padStart(2, '0')}`;
const dir = p('works', type, name);

write(path.join(dir, '작업.md'), read(p('kit', 'templates', '작업.md'))
  .replaceAll('{{이름}}', name).replaceAll('{{종류}}', type).replaceAll('{{날짜}}', today())
  .replaceAll('{{요청}}', request || '(요청 원문을 그대로 적는다)'));
for (const d of ['원본', '완성']) fs.mkdirSync(path.join(dir, d), { recursive: true });

// 편집/ — 영상 종류는 HyperFrames 프로젝트 (렌더는 이 폴더 안 파일만 읽는다 → 소재는 assets/로 복사)
const edit = path.join(dir, '편집');
if (VIDEO_TYPES.includes(type) && !noHF) {
  const res = type === 'longform' ? 'landscape' : 'portrait';
  const v = hfVersion();
  const r = run('npx', ['--yes', `hyperframes@${v}`, 'init', edit, '--non-interactive', '--example=blank', `--resolution=${res}`, '--skill=motion-graphics'],
    { cwd: p(), env: { ...process.env, HYPERFRAMES_SKIP_SKILLS: '1' } });
  if (!r.ok) { bad(`HyperFrames 프로젝트를 만들지 못했습니다:\n${(r.err || r.out).slice(0, 500)}`); process.exit(1); }
  fs.rmSync(path.join(edit, 'AGENTS.md'), { force: true });
  write(path.join(edit, 'CLAUDE.md'), `# 편집 (HyperFrames 프로젝트)\n\n규칙은 루트 \`CLAUDE.md\`와 \`works/${type}/CLAUDE.md\`를 따른다. \`npx hyperframes …\`와 \`npm run dev / check / render\`는 이 폴더 안에서 실행한다.\n폰트 · 효과음 · 음성은 이 폴더의 \`assets/\`로 복사해서 쓴다 (상위 경로 참조 금지).\n`);
  for (const d of ['assets', 'compositions', 'renders']) fs.mkdirSync(path.join(edit, d), { recursive: true });
  ok(`편집/ — HyperFrames ${v} 프로젝트 (${res})`);
} else fs.mkdirSync(edit, { recursive: true });

ok(`만들었습니다: works/${type}/${name}/`);
console.log(`다음: 작업.md 「2. 재료」에 레퍼런스 · 원본을 연결하세요.`);
