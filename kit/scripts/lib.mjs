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

// 작업.md 「2. 재료」의 `경로` 목록 (작업 폴더 기준 절대 경로)
export function materialPaths(jobDir) {
  const memo = read(path.join(jobDir, '작업.md'));
  const sec = (memo.split('## 2. 재료')[1] || '').split(/\n## /)[0];
  return { sec, paths: [...sec.matchAll(/`([^`]+)`/g)].map((m) => m[1].trim()).filter((s) => s.includes('/')) };
}

// 경로 → 레퍼런스 묶음 { type, bundle } (references/<종류>/<묶음>/… 이 아니면 null)
export function bundleOf(f) {
  const [top, type, bundle] = relParts(f);
  return top === 'references' && TYPES.includes(type) && bundle ? { type, bundle } : null;
}

// references/목록.md 다시 만들기. 내용은 references/ · works/에서 매번 새로 계산하므로
// 여러 세션이 동시에 돌려도 결과가 같다 (임시 파일에 쓰고 바꿔치기)
export function buildIndex() {
  const usage = {}; // 'reels/묶음' → { used: [작업], good: n }
  for (const t of TYPES) {
    const tdir = p('works', t);
    if (!exists(tdir)) continue;
    for (const job of fs.readdirSync(tdir).sort()) {
      const jobDir = path.join(tdir, job);
      if (!exists(path.join(jobDir, '작업.md'))) continue;
      const good = frontmatter(read(path.join(jobDir, '작업.md'))).평가 === '좋음';
      const seen = new Set();
      for (const s of materialPaths(jobDir).paths) {
        const b = bundleOf(path.resolve(jobDir, s));
        if (!b || seen.has(`${b.type}/${b.bundle}`)) continue;
        seen.add(`${b.type}/${b.bundle}`);
        const u = (usage[`${b.type}/${b.bundle}`] ||= { used: [], good: 0 });
        u.used.push(`${t}/${nfc(job)}`);
        if (good) u.good++;
      }
    }
  }
  const lines = ['# 레퍼런스 목록', '', '<!-- 자동 생성 (npm run reference · npm run check). 손으로 고치지 않는다. 쓴 작업 · 좋음은 works/*/작업.md에서 센다 -->', ''];
  let total = 0;
  for (const t of TYPES) {
    const rdir = p('references', t);
    const bundles = exists(rdir) ? fs.readdirSync(rdir, { withFileTypes: true }).filter((d) => d.isDirectory() && !d.name.startsWith('.')).map((d) => nfc(d.name)) : [];
    if (!bundles.length) continue;
    const rows = bundles.map((b) => {
      const pf = path.join(rdir, b, '패턴.md');
      const fm = exists(pf) ? frontmatter(read(pf)) : {};
      const u = usage[`${t}/${b}`] || { used: [], good: 0 };
      return { b, fm, u };
    }).sort((x, y) => y.u.good - x.u.good || y.u.used.length - x.u.used.length || x.b.localeCompare(y.b));
    lines.push(`## ${t}`, '', '| 묶음 | 한줄 | 태그 | 쓴 작업 | 좋음 | 최근 작업 |', '|---|---|---|---|---|---|');
    for (const { b, fm, u } of rows) {
      const tags = [].concat(fm.태그 || []).join(' · ');
      lines.push(`| [${b}](<${t}/${b}/패턴.md>) | ${fm.한줄 || '(패턴 미작성)'} | ${tags} | ${u.used.length} | ${u.good} | ${u.used.at(-1) || ''} |`);
    }
    lines.push('');
    total += rows.length;
  }
  if (!total) lines.push('(아직 레퍼런스가 없습니다)', '');
  const out = p('references', '목록.md');
  const tmp = `${out}.${process.pid}.tmp`;
  write(tmp, lines.join('\n'));
  fs.renameSync(tmp, out);
  return total;
}

export const ok = (s) => console.log(`✅ ${s}`);
export const warn = (s) => console.log(`⚠️  ${s}`);
export const bad = (s) => console.log(`❌ ${s}`);
