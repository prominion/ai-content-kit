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
// 루트 기준 경로 조각: works/reels/2026-10-20-x → ['works', 'reels', '2026-10-20-x']
export const relParts = (f) => nfc(path.relative(ROOT, f)).split(path.sep);

// 외부 명령 실행
export function run(cmd, args, opts = {}) {
  const r = spawnSync(cmd, args, { encoding: 'utf8', shell: process.platform === 'win32' && /^(npx|npm)$/.test(cmd), ...opts });
  return { ok: r.status === 0, out: (r.stdout || '').trim(), err: (r.stderr || '').trim() };
}

// 키트 기본 글꼴(Pretendard)을 <dir>/assets/fonts/ 로 복사한다. 이미 있는 파일은 두고, 복사한 개수를 돌려준다
export function copyFonts(dir) {
  const src = p('kit', 'assets', 'fonts');
  const dest = path.join(dir, 'assets', 'fonts');
  if (!exists(src)) return 0;
  fs.mkdirSync(dest, { recursive: true });
  let n = 0;
  for (const f of fs.readdirSync(src)) {
    if (!/^Pretendard-/.test(f) || exists(path.join(dest, f))) continue;
    fs.copyFileSync(path.join(src, f), path.join(dest, f));
    n++;
  }
  return n;
}

// HyperFrames 프로젝트를 dir에 만든다 (버전 고정 · 전역 스킬 설치 끔). init이 만든 CLAUDE.md는 지우지 않고 키트 규칙을 앞에 붙인다
export function hfInit(dir, { resolution = 'portrait', skill = 'general-video', rules = '' } = {}) {
  const v = hfVersion();
  const r = run('npx', ['--yes', `hyperframes@${v}`, 'init', dir, '--non-interactive', '--example=blank', `--resolution=${resolution}`, `--skill=${skill}`],
    { cwd: p(), env: { ...process.env, HYPERFRAMES_SKIP_SKILLS: '1' } });
  if (!r.ok) return { ok: false, err: (r.err || r.out).slice(0, 500) };
  const claude = path.join(dir, 'CLAUDE.md');
  write(claude, `# 키트 규칙 (먼저 읽는다 — 아래 HyperFrames 원문과 다르면 이쪽이 우선)\n\n${rules}`
    + `- **버전 고정**: \`npx hyperframes …\`처럼 버전 없이 부르지 않는다 (최신을 받아 온다). 항상 \`npx --yes hyperframes@${v} …\` 또는 \`npm run check / render / dev\`.\n`
    + '- **`npx hyperframes skills update`는 쓰지 않는다** (홈 폴더 전역에 설치된다). 스킬은 키트 `.claude/skills/`에 이미 있다. 아래 원문의 "Standalone skill missing or stale?" 안내는 무시한다.\n'
    + '- 명령은 이 폴더 안에서 실행한다. 폰트 · 효과음 · 음성은 이 폴더 `assets/`로 복사해서 쓴다 (상위 경로 참조 금지).\n'
    + '- 기본 글꼴은 Pretendard (`assets/fonts/`, `@font-face`는 루트 `kit/assets/fonts/pretendard.css`의 네 줄을 HTML `<style>`에 붙인다).\n'
    + `\n---\n\n${exists(claude) ? read(claude) : ''}`);
  for (const d of ['assets', 'compositions', 'renders']) fs.mkdirSync(path.join(dir, d), { recursive: true });
  copyFonts(dir);
  return { ok: true, v };
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

// 작업 폴더: works/<종류>/<작업>/ (작업.md가 있는 곳). 어느 브랜드 작업인지는 작업.md 머리말 「브랜드:」
export function jobOf(f) {
  const [top, type, name] = relParts(f);
  const dir = top === 'works' && TYPES.includes(type) && name ? p('works', type, name) : null;
  if (!dir || !exists(path.join(dir, '작업.md'))) return null;
  const brand = String(frontmatter(read(path.join(dir, '작업.md'))).브랜드 || '');
  return { brand, type, name, dir, id: `${type}/${name}` };
}
export function allJobs() {
  const out = [];
  for (const t of TYPES) {
    const d = p('works', t);
    if (!exists(d)) continue;
    for (const x of fs.readdirSync(d, { withFileTypes: true })) {
      if (!x.isDirectory() || x.name.startsWith('.')) continue;
      const j = jobOf(path.join(d, x.name));
      if (j) out.push(j);
    }
  }
  return out.sort((a, b) => a.id.localeCompare(b.id));
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
  const lines = ['# 레퍼런스 목록', '', '<!-- 자동 생성 (npm run reference · npm run check). 손으로 고치지 않는다. 쓴 작업 · 좋음은 works/*/*/작업.md에서 센다 -->', ''];
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
    // 최근 작업 = 작업 폴더 이름 앞 날짜(YYYY-MM-DD)가 가장 늦은 것
    for (const r of rows) r.u.used.sort((x, y) => x.split('/').at(-1).localeCompare(y.split('/').at(-1)));
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

// brand/<브랜드>/작업목록.md (사람이 보는 목록, 브랜드마다 하나) · works/목록.json (연동용, 전체 하나)
// 결과물은 works/에 그대로 있고, 목록은 그 브랜드 작업만 모아 링크로 보여 준다. 「진행 중」과 「완성」을 나눠 한눈에
export function buildWorkLists(jobs = allJobs()) {
  const all = jobs.map(jobSummary).sort((a, b) => (b.만든날 || '').localeCompare(a.만든날 || '') || a.작업.localeCompare(b.작업));
  const isDone = (x) => x.상태 === '완성';
  const render = (b, list) => {
    const base = p('brand', b);
    const link = (target) => `<${path.relative(base, p(target)).split(path.sep).join('/')}>`;
    const doing = list.filter((x) => !isDone(x));
    const done = list.filter(isDone);
    const out = [`# ${b} 작업 목록`, '', '<!-- 자동 생성 (npm run new · npm run check · npm run works). 손으로 고치지 않는다. 결과물은 works/에 있고, 내용은 각 작업.md에서 읽는다 -->', '',
      `진행 중 ${doing.length} · 완성 ${done.length}`, '', `## 🔨 진행 중 (${doing.length})`, ''];
    if (doing.length) {
      out.push('| 종류 | 작업 | 상태 | 시작 | 최근 기록 |', '|---|---|---|---|---|');
      for (const x of doing) out.push(`| ${x.종류} | [${x.작업}](${link(`${x.경로}/작업.md`)}) | ${x.상태} | ${x.만든날} | ${cell(x.최근기록)} |`);
    } else out.push('(없음)');
    out.push('', `## ✅ 완성 (${done.length})`, '');
    if (done.length) {
      out.push('| 종류 | 작업 | 확정본 | 버전 | 평가 | 레퍼런스 | 만든 날 |', '|---|---|---|---|---|---|---|');
      for (const x of done) {
        const final = x.확정 ? `[${x.확정}](${link(x.확정경로)})` : x.버전.length ? `(미확정) [${x.버전.at(-1)}](${link(`${x.경로}/완성/${x.버전.at(-1)}`)})` : '—';
        out.push(`| ${x.종류} | [${x.작업}](${link(`${x.경로}/작업.md`)}) | ${final} | ${x.버전.length} | ${x.평가} | ${x.레퍼런스.join(', ')} | ${x.만든날} |`);
      }
    } else out.push('(없음)');
    return `${out.join('\n')}\n`;
  };
  for (const b of brandNames()) writeAtomic(p('brand', b, '작업목록.md'), render(b, all.filter((x) => x.브랜드 === b)));
  const orphan = all.filter((x) => !brandNames().includes(x.브랜드));
  if (orphan.length) console.log(`⚠️  브랜드 폴더가 없는 작업 ${orphan.length}개: ${orphan.map((x) => `${x.경로} (브랜드: ${x.브랜드 || '없음'})`).join(', ')}`);
  if (!exists(p('works'))) fs.mkdirSync(p('works'), { recursive: true });
  writeAtomic(p('works', '목록.json'), `${JSON.stringify({ $doc: '자동 생성. 다른 서비스(구글 시트 · Todoist · 노션) 연동은 이 파일을 읽는다. 원본은 각 작업.md', 작업: all }, null, 2)}\n`);
  return all;
}

// 목록 두 가지를 한 번에
export function buildAll() { const jobs = allJobs(); buildIndex(jobs); return buildWorkLists(jobs); }

export const ok = (s) => console.log(`✅ ${s}`);
export const warn = (s) => console.log(`⚠️  ${s}`);
export const bad = (s) => console.log(`❌ ${s}`);
