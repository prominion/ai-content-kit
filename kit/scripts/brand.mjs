// 브랜드(사업) 관리.
// 사용: npm run brand -- <이름>                              새 브랜드 폴더 (처음 만든 브랜드가 기본)
//       npm run brand -- <이름> --default                    기본 브랜드로 지정
//       npm run brand -- <이름> --template <작업 폴더> [--replace]
//                                                            그 작업의 편집/을 이 브랜드의 대표 템플릿으로 저장
//       npm run brand -- <이름> --rename <새 이름>             이름 바꾸기 (폴더 · 목록 · 프로필 제목 · 템플릿 · 지난 작업의 작업.md)
//       npm run brand                                        브랜드 목록 보기
import fs from 'node:fs';
import path from 'node:path';
import {
  TYPES, p, exists, read, write, nfc, slug, today, resolvePath, relParts, brandNames, defaultBrand, brandTemplate, ok, bad, warn,
} from './lib.mjs';

const args = process.argv.slice(2);
const opt = (k) => { const i = args.indexOf(k); if (i < 0) return null; const v = args[i + 1]; args.splice(i, 2); return v; };
const flag = (k) => { const i = args.indexOf(k); if (i < 0) return false; args.splice(i, 1); return true; };
const renameTo = opt('--rename');
const tplJob = opt('--template');
const replace = flag('--replace');
const makeDefault = flag('--default');
const name = args[0] && slug(args.join(' '));
const listFile = p('brand', '목록.md');

// 목록 보기
if (!name) {
  const names = brandNames();
  if (!names.length) { console.log('브랜드가 없습니다. 만들기: npm run brand -- <이름>'); process.exit(0); }
  const def = defaultBrand();
  for (const n of names) {
    const tpls = exists(p('brand', n, 'templates')) ? fs.readdirSync(p('brand', n, 'templates')).filter((t) => TYPES.includes(t)) : [];
    console.log(`${n === def ? '★' : '·'} ${n}   대표 템플릿: ${tpls.join(', ') || '없음'}`);
  }
  process.exit(0);
}

const dir = p('brand', name);

// 이름 바꾸기
if (renameTo) {
  const to = slug(renameTo);
  if (!brandNames().includes(name)) { bad(`brand/${name}/ 가 없습니다 (있는 것: ${brandNames().join(', ') || '없음'})`); process.exit(1); }
  if (!to || to === name) { bad('새 이름이 비었거나 지금 이름과 같습니다'); process.exit(1); }
  if (exists(p('brand', to))) { bad(`brand/${to}/ 가 이미 있습니다`); process.exit(1); }
  const esc = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  // 파일 글을 고친다 (바뀐 경우에만 쓴다)
  const edit = (f, fn) => { const s = nfc(read(f)); const t = fn(s); if (t !== s) { write(f, t); return true; } return false; };

  fs.renameSync(dir, p('brand', to));
  ok(`폴더: brand/${name}/ → brand/${to}/`);
  if (exists(listFile) && edit(listFile, (s) => s.replace(new RegExp(`^기본:\\s*${esc(name)}\\s*$`, 'm'), `기본: ${to}`).replace(new RegExp(`^- ${esc(name)}:`, 'm'), `- ${to}:`))) ok('brand/목록.md');
  if (edit(p('brand', to, 'profile.md'), (s) => s.replace(new RegExp(`^# ${esc(name)}\\s*$`, 'm'), `# ${to}`))) ok('profile.md 제목');
  const tdir = p('brand', to, 'templates');
  for (const t of exists(tdir) ? fs.readdirSync(tdir) : []) {
    const f = path.join(tdir, t, '템플릿.md');
    if (exists(f) && edit(f, (s) => s.replace(new RegExp(`^# ${esc(name)} — `, 'm'), `# ${to} — `))) ok(`templates/${t}/템플릿.md 제목`);
  }
  // 지난 작업: 머리말 「브랜드:」와 재료 경로 brand/<이름>/
  let n = 0;
  for (const t of TYPES) {
    const wdir = p('works', t);
    for (const job of exists(wdir) ? fs.readdirSync(wdir) : []) {
      const f = path.join(wdir, job, '작업.md');
      if (exists(f) && edit(f, (s) => s.replace(new RegExp(`^브랜드:\\s*${esc(name)}\\s*$`, 'm'), `브랜드: ${to}`).replaceAll(`brand/${name}/`, `brand/${to}/`))) n++;
    }
  }
  ok(`지난 작업의 작업.md ${n}개`);
  console.log(`다른 세션이 이 브랜드로 작업 중이었다면 그 세션에 이름이 바뀌었다고 알려 주세요.`);
  process.exit(0);
}

// 대표 템플릿 저장
if (tplJob) {
  if (!exists(path.join(dir, 'profile.md'))) { bad(`brand/${name}/ 가 없습니다`); process.exit(1); }
  const jobDir = resolvePath(tplJob);
  const [top, type, job] = relParts(jobDir);
  const src = path.join(jobDir, '편집');
  if (top !== 'works' || !TYPES.includes(type) || !job || !exists(src)) { bad('작업 폴더를 찾지 못했습니다: works/<종류>/<작업>'); process.exit(1); }
  const jobBrand = (read(path.join(jobDir, '작업.md')).match(/^브랜드:\s*(.+)$/m) || [])[1]?.trim();
  if (jobBrand && jobBrand !== name) warn(`이 작업은 브랜드 「${jobBrand}」의 작업입니다 — 「${name}」의 템플릿으로 저장합니다`);
  const dest = path.join(dir, 'templates', type);
  if (exists(dest)) {
    if (!replace) { bad(`brand/${name}/templates/${type}/ 가 이미 있습니다. 바꾸려면 --replace (이전 것은 templates/_이전/ 으로 옮겨 둡니다)`); process.exit(1); }
    const bak = path.join(dir, 'templates', '_이전', `${type}-${today()}-${Date.now()}`);
    fs.mkdirSync(path.dirname(bak), { recursive: true });
    fs.renameSync(dest, bak);
    ok(`이전 템플릿 → ${path.relative(p(), bak)}`);
  }
  // 이 작업에만 쓰인 것(렌더 결과 · 음성 · 생성 이미지 · 검사 결과)은 빼고 복사
  const skip = new Set(['renders', 'node_modules', '음성', '이미지', '검사', '.thumbnails']);
  fs.cpSync(src, dest, { recursive: true, filter: (f) => !skip.has(path.basename(f)) });
  write(path.join(dest, '템플릿.md'), `# ${name} — ${type} 대표 템플릿\n\n- 출처 작업: works/${type}/${job}\n- 저장일: ${today()}\n- 새 ${type} 작업은 \`npm run new\`가 이 폴더를 편집/으로 복사해서 시작한다. 글 · 영상 소스만 바꾸고 레이아웃 · 색 · 글꼴 · 자막 스타일은 유지한다.\n`);
  ok(`대표 템플릿 저장: brand/${name}/templates/${type}/ (출처 ${type}/${job})`);
  process.exit(0);
}

// 새 브랜드
if (!exists(path.join(dir, 'profile.md'))) {
  write(path.join(dir, 'profile.md'), brandTemplate('profile.md').replaceAll('{{이름}}', name));
  write(path.join(dir, 'assets', '후기', '후기.md'), brandTemplate('후기.md'));
  write(path.join(dir, 'assets', '인증', '인증.md'), brandTemplate('인증.md'));
  for (const d of ['products', 'assets/프로필', 'assets/로고', 'assets/영상소스', 'assets/voice', 'templates']) fs.mkdirSync(path.join(dir, d), { recursive: true });
  ok(`brand/${name}/ 를 만들었습니다 — profile.md 를 채우세요`);
} else if (!makeDefault) warn(`brand/${name}/ 는 이미 있습니다`);

// 목록: 처음 만든 브랜드가 기본
let list = exists(listFile) ? read(listFile) : `# 브랜드 목록\n\n<!-- 브랜드 = 사업 하나. 「기본」은 --brand 를 안 붙였을 때 쓰는 브랜드 -->\n기본: ${name}\n\n`;
if (!new RegExp(`^- ${name}:`, 'm').test(list)) list = `${list.trimEnd()}\n- ${name}: (한 줄 소개)\n`;
if (makeDefault) list = list.replace(/^기본:.*$/m, `기본: ${name}`);
write(listFile, list);
if (makeDefault) ok(`기본 브랜드: ${name}`);
