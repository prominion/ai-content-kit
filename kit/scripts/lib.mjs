// 스크립트 공통 도구: 경로 · 종류 · 이름 정리 · 머리말 읽기 · 외부 명령 · 영상 정보
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

export const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
export const TYPES = ['detail-page', 'reels', 'longform', 'carousel', 'ad-creative'];
export const VIDEO_TYPES = ['reels', 'longform', 'ad-creative'];

export const p = (...xs) => path.join(ROOT, ...xs);
export const exists = (f) => fs.existsSync(f);
export const read = (f) => fs.readFileSync(f, 'utf8');
export const write = (f, s) => { fs.mkdirSync(path.dirname(f), { recursive: true }); fs.writeFileSync(f, s); };
export const today = () => new Date().toLocaleDateString('sv-SE', { timeZone: 'Asia/Seoul' }); // YYYY-MM-DD
export const hfVersion = () => JSON.parse(read(p('package.json'))).config.hyperframes;

// macOS는 한글 파일 이름을 자모로 풀어(NFD) 돌려준다 → NFC로 맞춘다
export const nfc = (s) => s.normalize('NFC');
// 폴더 이름: 공백은 하이픈, 경로에 못 쓰는 글자 제거
export const slug = (s) => nfc(s).trim().replace(/\s+/g, '-').replace(/[\\/:*?"<>|]/g, '').replace(/-+/g, '-');

// npm run 으로 실행하면 INIT_CWD가 사용자가 있던 폴더다. 거기 → 루트 순서로 경로를 찾는다
export function resolvePath(arg) {
  const bases = [process.env.INIT_CWD, process.cwd(), ROOT].filter(Boolean);
  return bases.map((b) => path.resolve(b, arg)).find(exists) || path.resolve(ROOT, arg);
}
// 루트 기준 경로 조각: works/브랜드1/reels/2026-10-20-x → ['works', '브랜드1', 'reels', '2026-10-20-x']
export const relParts = (f) => nfc(path.relative(ROOT, f)).split(path.sep);

// 외부 명령 실행
export function run(cmd, args, opts = {}) {
  const r = spawnSync(cmd, args, { encoding: 'utf8', shell: process.platform === 'win32' && /^(npx|npm)$/.test(cmd), ...opts });
  return { ok: r.status === 0, out: (r.stdout || '').trim(), err: (r.stderr || '').trim() };
}

// ffprobe: 길이(초) · 가로 · 세로 · 소리 유무
export function probe(file) {
  const r = run('ffprobe', ['-v', 'error', '-show_entries', 'format=duration:stream=codec_type,width,height', '-of', 'json', file]);
  if (!r.ok) return null;
  const j = JSON.parse(r.out);
  const v = (j.streams || []).find((s) => s.codec_type === 'video') || {};
  return {
    duration: Number(j.format?.duration || 0),
    width: v.width, height: v.height,
    audio: (j.streams || []).some((s) => s.codec_type === 'audio'),
  };
}

// 머리말 읽기: key: 값 / key: [a, b] / 숫자 · true/false 정도만 (단순 YAML)
export function frontmatter(text) {
  const m = text.match(/^---\n([\s\S]*?)\n---/);
  const out = {};
  if (!m) return out;
  for (const line of m[1].split('\n')) {
    const k = line.match(/^([^:#]+):\s*(.*)$/);
    if (!k) continue;
    let v = k[2].trim();
    if (v.startsWith('[') && v.endsWith(']')) v = v.slice(1, -1).split(',').map((x) => x.trim().replace(/^["']|["']$/g, '')).filter(Boolean);
    else if (/^-?\d+(\.\d+)?$/.test(v)) v = Number(v);
    else if (v === 'true' || v === 'false') v = v === 'true';
    else v = v.replace(/^["']|["']$/g, '');
    out[k[1].trim()] = v;
  }
  return out;
}

// 폴더 안 파일 전부 (재귀, 숨김 · node_modules 제외)
export function walk(dir, out = []) {
  if (!exists(dir)) return out;
  for (const d of fs.readdirSync(dir, { withFileTypes: true })) {
    if (d.name.startsWith('.') || d.name === 'node_modules') continue;
    const f = path.join(dir, d.name);
    d.isDirectory() ? walk(f, out) : out.push(f);
  }
  return out;
}

// 브랜드(사업): brand/<이름>/profile.md 가 있는 폴더. 기본은 brand/목록.md 의 「기본: <이름>」
export const brandNames = () => (exists(p('brand'))
  ? fs.readdirSync(p('brand'), { withFileTypes: true }).filter((d) => d.isDirectory() && exists(p('brand', d.name, 'profile.md'))).map((d) => nfc(d.name)).sort()
  : []);
export const defaultBrand = () => (exists(p('brand', '목록.md')) ? (read(p('brand', '목록.md')).match(/^기본:\s*(.+)$/m) || [])[1]?.trim() : null) || null;
export const brandTemplate = (f) => read(p('kit', 'forms', 'brand', f));

// 작업 폴더: works/<브랜드>/<종류>/<작업>/ (작업.md가 있는 곳)
export function jobOf(f) {
  const [top, brand, type, name] = relParts(f);
  return top === 'works' && brand && TYPES.includes(type) && name && exists(p('works', brand, type, name, '작업.md'))
    ? { brand, type, name, dir: p('works', brand, type, name), id: `${brand}/${type}/${name}` } : null;
}
export function allJobs() {
  const out = [];
  const sub = (d) => (exists(d) ? fs.readdirSync(d, { withFileTypes: true }).filter((x) => x.isDirectory() && !x.name.startsWith('.')).map((x) => nfc(x.name)).sort() : []);
  for (const b of sub(p('works'))) for (const t of sub(p('works', b)).filter((x) => TYPES.includes(x))) {
    for (const n of sub(p('works', b, t))) { const j = jobOf(p('works', b, t, n)); if (j) out.push(j); }
  }
  return out;
}

// 작업.md 「2. 재료」의 `경로` 목록. 경로는 루트 기준(brand/… · references/… · works/…),
// 루트에 없으면 작업 폴더 기준(원본/… 등)으로 찾는다
export function materialPaths(jobDir) {
  const memo = read(path.join(jobDir, '작업.md'));
  const sec = (memo.split('## 2. 재료')[1] || '').split(/\n## /)[0];
  const raw = [...sec.matchAll(/`([^`]+)`/g)].map((m) => m[1].trim()).filter((s) => s.includes('/'));
  const resolve = (s) => [p(s), path.resolve(jobDir, s)].find(exists) || null;
  return { sec, raw, paths: raw.map((s) => ({ s, f: resolve(s) })) };
}

// 경로 → 레퍼런스 묶음 { type, bundle } (references/<종류>/<묶음>/… 이 아니면 null)
export function bundleOf(f) {
  const [top, type, bundle] = relParts(f);
  return top === 'references' && TYPES.includes(type) && bundle ? { type, bundle } : null;
}
const refsOf = (j) => [...new Set(materialPaths(j.dir).paths.map((x) => x.f && bundleOf(x.f)).filter(Boolean).map((b) => `${b.type}/${b.bundle}`))];

// 임시 파일에 쓰고 바꿔치기 — 여러 세션이 동시에 만들어도 반쯤 쓴 파일이 보이지 않는다
function writeAtomic(f, s) { const tmp = `${f}.${process.pid}.tmp`; write(tmp, s); fs.renameSync(tmp, f); }
const cell = (s) => String(s ?? '').replace(/\|/g, '/').replace(/\n/g, ' ');

// references/목록.md — 내용은 references/ · works/에서 매번 새로 계산한다 (동시에 돌려도 결과가 같다)
export function buildIndex(jobs = allJobs()) {
  const usage = {}; // 'reels/묶음' → { used: [작업], good: n }
  for (const j of jobs) {
    const good = frontmatter(read(path.join(j.dir, '작업.md'))).평가 === '좋음';
    for (const r of refsOf(j)) {
      const u = (usage[r] ||= { used: [], good: 0 });
      u.used.push(j.id);
      if (good) u.good++;
    }
  }
  const lines = ['# 레퍼런스 목록', '', '<!-- 자동 생성 (npm run reference · npm run check). 손으로 고치지 않는다. 쓴 작업 · 좋음은 works/**/작업.md에서 센다 -->', ''];
  let total = 0;
  for (const t of TYPES) {
    const rdir = p('references', t);
    const bundles = exists(rdir) ? fs.readdirSync(rdir, { withFileTypes: true }).filter((d) => d.isDirectory() && !d.name.startsWith('.')).map((d) => nfc(d.name)) : [];
    if (!bundles.length) continue;
    const rows = bundles.map((b) => {
      const pf = path.join(rdir, b, '패턴.md');
      return { b, fm: exists(pf) ? frontmatter(read(pf)) : {}, u: usage[`${t}/${b}`] || { used: [], good: 0 } };
    }).sort((x, y) => y.u.good - x.u.good || y.u.used.length - x.u.used.length || x.b.localeCompare(y.b));
    lines.push(`## ${t}`, '', '| 묶음 | 한줄 | 태그 | 쓴 작업 | 좋음 | 최근 작업 |', '|---|---|---|---|---|---|');
    for (const { b, fm, u } of rows) {
      lines.push(`| [${b}](<${t}/${b}/패턴.md>) | ${cell(fm.한줄 || '(패턴 미작성)')} | ${[].concat(fm.태그 || []).join(' · ')} | ${u.used.length} | ${u.good} | ${u.used.at(-1) || ''} |`);
    }
    lines.push('');
    total += rows.length;
  }
  if (!total) lines.push('(아직 레퍼런스가 없습니다)', '');
  writeAtomic(p('references', '목록.md'), lines.join('\n'));
  return total;
}

// 작업 하나의 요약 (작업 목록 · 다른 서비스 연동용)
export function jobSummary(j) {
  const memo = read(path.join(j.dir, '작업.md'));
  const fm = frontmatter(memo);
  const sec = (h) => (memo.split(`## ${h}`)[1] || '').split(/\n## /)[0].replace(/<!--[\s\S]*?-->/g, '');
  const outDir = path.join(j.dir, '완성');
  const versions = exists(outDir) ? fs.readdirSync(outDir, { withFileTypes: true }).filter((d) => d.isDirectory() && !d.name.startsWith('.')).map((d) => nfc(d.name)).sort() : [];
  const confirmed = fm.확정 && versions.includes(fm.확정) ? fm.확정 : '';
  const logs = sec('5. 기록').split('\n').map((l) => l.replace(/^\s*-\s*/, '').trim()).filter(Boolean);
  const request = sec('1. 요청').split('\n').map((l) => l.replace(/^>\s?/, '').trim()).filter(Boolean)[0] || '';
  return {
    브랜드: j.brand, 종류: j.type, 작업: j.name, 경로: `works/${j.id}`,
    상태: fm.상태 || '진행 중', 만든날: fm['만든 날'] || '', 평가: fm.평가 || '',
    확정: confirmed, 확정경로: confirmed ? `works/${j.id}/완성/${confirmed}` : '',
    버전: versions, 레퍼런스: refsOf(j), 요청: request.startsWith('(') ? '' : request, 최근기록: logs.at(-1) || '',
  };
}

// works/목록.md (전체) · works/<브랜드>/목록.md · works/목록.json (연동용)
// 「진행 중」과 「완성」을 나눠 한눈에 보여 준다
export function buildWorkLists(jobs = allJobs()) {
  const all = jobs.map(jobSummary).sort((a, b) => (b.만든날 || '').localeCompare(a.만든날 || '') || a.작업.localeCompare(b.작업));
  const isDone = (x) => x.상태 === '완성';
  const render = (title, list, showBrand, base) => {
    const link = (x, target) => `<${path.relative(base, p(target)).split(path.sep).join('/')}>`;
    const doing = list.filter((x) => !isDone(x));
    const done = list.filter(isDone);
    const B = showBrand ? ' 브랜드 |' : '';
    const BS = showBrand ? '---|' : '';
    const out = [`# ${title}`, '', '<!-- 자동 생성 (npm run new · npm run check · npm run works). 손으로 고치지 않는다. 내용은 각 작업.md에서 읽는다 -->', '',
      `진행 중 ${doing.length} · 완성 ${done.length}`, '', `## 🔨 진행 중 (${doing.length})`, ''];
    if (doing.length) {
      out.push(`|${B} 종류 | 작업 | 상태 | 시작 | 최근 기록 |`, `|${BS}---|---|---|---|---|`);
      for (const x of doing) out.push(`|${showBrand ? ` ${x.브랜드} |` : ''} ${x.종류} | [${x.작업}](${link(x, `${x.경로}/작업.md`)}) | ${x.상태} | ${x.만든날} | ${cell(x.최근기록)} |`);
    } else out.push('(없음)');
    out.push('', `## ✅ 완성 (${done.length})`, '');
    if (done.length) {
      out.push(`|${B} 종류 | 작업 | 확정본 | 버전 | 평가 | 레퍼런스 | 만든 날 |`, `|${BS}---|---|---|---|---|---|---|`);
      for (const x of done) {
        const final = x.확정 ? `[${x.확정}](${link(x, x.확정경로)})` : x.버전.length ? `(미확정) [${x.버전.at(-1)}](${link(x, `${x.경로}/완성/${x.버전.at(-1)}`)})` : '—';
        out.push(`|${showBrand ? ` ${x.브랜드} |` : ''} ${x.종류} | [${x.작업}](${link(x, `${x.경로}/작업.md`)}) | ${final} | ${x.버전.length} | ${x.평가} | ${x.레퍼런스.join(', ')} | ${x.만든날} |`);
      }
    } else out.push('(없음)');
    return `${out.join('\n')}\n`;
  };
  if (!exists(p('works'))) fs.mkdirSync(p('works'), { recursive: true });
  writeAtomic(p('works', '목록.md'), render('전체 작업 목록', all, true, p('works')));
  for (const b of [...new Set([...brandNames(), ...all.map((x) => x.브랜드)])]) {
    const list = all.filter((x) => x.브랜드 === b);
    if (!list.length && !exists(p('works', b))) continue;
    writeAtomic(p('works', b, '목록.md'), render(`${b} 작업 목록`, list, false, p('works', b)));
  }
  writeAtomic(p('works', '목록.json'), `${JSON.stringify({ $doc: '자동 생성. 다른 서비스(구글 시트 · Todoist · 노션) 연동은 이 파일을 읽는다. 원본은 각 작업.md', 작업: all }, null, 2)}\n`);
  return all;
}

// 목록 두 가지를 한 번에
export function buildAll() { const jobs = allJobs(); buildIndex(jobs); return buildWorkLists(jobs); }

export const ok = (s) => console.log(`✅ ${s}`);
export const warn = (s) => console.log(`⚠️  ${s}`);
export const bad = (s) => console.log(`❌ ${s}`);
