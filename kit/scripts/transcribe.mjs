// 전사: 영상의 말을 시간과 함께 글로 → .md (영상을 파악할 때 · 레퍼런스 대본 · 컷 편집 · 자막)
// 사용: npm run transcribe -- <영상 파일 또는 링크> [--lang ko] [--out <파일.md>]
//   링크(유튜브 · 인스타 등): yt-dlp로 올라와 있는 자막부터 받는다 (원어 자막 > 자동 자막). 없으면 소리를 받아 전사
//   파일: HyperFrames transcribe (whisper.cpp, 내 컴퓨터에서 무료). 처음 한 번 whisper.cpp(Homebrew)와 모델(small 약 490MB)을 받는다
// 저장 위치(--out이 없을 때): references/<종류>/<묶음>/ 안 영상 → 그 묶음 대본/<이름>.md
//                              works/<종류>/<작업>/ 안 영상 → 그 작업 원본/전사-<이름>.md (+ 편집/이 HyperFrames면 단어 시간 JSON도 편집/에)
//                              그 밖 → 영상 옆 <이름>.전사.md
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { p, exists, read, write, run, resolvePath, relParts, hfVersion, ok, bad, warn } from './lib.mjs';

const args = process.argv.slice(2);
const opt = (k, d = null) => { const i = args.indexOf(k); if (i < 0) return d; const v = args[i + 1]; args.splice(i, 2); return v; };
const lang = opt('--lang', 'ko');
const outArg = opt('--out');
const input = args[0];
if (!input) { bad('사용법: npm run transcribe -- <영상 파일 또는 링크> [--lang ko] [--out <파일.md>]'); process.exit(1); }

const isUrl = /^https?:\/\//i.test(input);
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'kit-stt-'));
const mmss = (t) => `${String(Math.floor(t / 60)).padStart(2, '0')}:${String(Math.floor(t % 60)).padStart(2, '0')}`;
const hasYtdlp = () => run('yt-dlp', ['--version']).ok;

// 단어 [{text,start,end}] → 줄: 문장 끝(. ? !)이나 0.7초 넘는 쉼, 또는 6초마다 끊는다
function wordsToLines(words) {
  const lines = [];
  let cur = null;
  for (const w of words) {
    if (!cur) cur = { start: w.start, end: w.end, text: [] };
    const gap = w.start - cur.end;
    if (cur.text.length && (gap > 0.7 || w.end - cur.start > 6)) { lines.push(cur); cur = { start: w.start, end: w.end, text: [] }; }
    cur.text.push(w.text.trim());
    cur.end = w.end;
    if (/[.?!。]$/.test(w.text.trim())) { lines.push(cur); cur = null; }
  }
  if (cur && cur.text.length) lines.push(cur);
  return lines.map((l) => ({ start: l.start, text: l.text.join(' ').replace(/\s+([,.?!])/g, '$1') }));
}

// vtt → 줄 (자동 자막의 겹치는 줄을 걷어 낸다)
function vttToLines(vtt) {
  const lines = [];
  let t = 0;
  let last = '';
  for (const raw of vtt.split('\n')) {
    const m = raw.match(/^(\d\d):(\d\d):(\d\d)\.\d+ -->/);
    if (m) { t = Number(m[1]) * 3600 + Number(m[2]) * 60 + Number(m[3]); continue; }
    if (!raw.trim() || /^(WEBVTT|Kind:|Language:|NOTE)/.test(raw)) continue;
    const s = raw.replace(/<[^>]+>/g, '').replace(/&gt;/g, '>').replace(/&lt;/g, '<').replace(/&amp;/g, '&').trim();
    if (!s || s === last) continue;
    const add = last && s.startsWith(last) ? s.slice(last.length).trim() : s;
    if (add) lines.push({ start: t, text: add });
    last = s;
  }
  // 잘게 끊긴 자막 줄을 문장 끝(. ? !)이나 8초 단위로 이어 붙인다
  const merged = [];
  for (const l of lines) {
    const cur = merged.at(-1);
    if (cur && !/[.?!。]$/.test(cur.text) && l.start - cur.start < 8) cur.text += ` ${l.text}`;
    else merged.push({ ...l });
  }
  return merged;
}

function whisper(file) {
  const model = lang === 'en' ? 'small.en' : 'small'; // 기본 small.en은 비영어를 영어로 번역해 버린다
  const dir = path.join(tmp, 'hf');
  fs.mkdirSync(dir, { recursive: true });
  console.log(`전사 중 (HyperFrames · whisper ${model} · ${lang})… 처음이면 whisper.cpp 설치와 모델 다운로드로 몇 분 걸립니다`);
  const r = run('npx', ['--yes', `hyperframes@${hfVersion()}`, 'transcribe', file, '--dir', dir, '--model', model, '--language', lang, '--json'], { cwd: dir, maxBuffer: 1 << 28 });
  const res = (() => { try { return JSON.parse(r.out.split('\n').filter((l) => l.startsWith('{')).at(-1)); } catch { return null; } })();
  if (!r.ok || !res?.ok) { bad(`전사 실패: ${(r.err || r.out).split('\n').slice(-5).join(' ')}`); process.exit(1); }
  const json = JSON.parse(read(res.transcriptPath));
  const words = Array.isArray(json) ? json : json.words || json.segments || [];
  return { lines: wordsToLines(words), json: res.transcriptPath, how: `HyperFrames transcribe (whisper ${model}, ${lang})` };
}

let result;
let title = path.basename(input).replace(/\.[^.]+$/, '');
if (isUrl) {
  if (!hasYtdlp()) { bad('링크 전사에는 yt-dlp가 필요합니다: brew install yt-dlp (또는 영상 파일을 받아서 파일로 전사)'); process.exit(1); }
  const info = run('yt-dlp', ['--skip-download', '--print', '%(title)s\t%(channel)s\t%(duration_string)s', input]);
  if (info.ok) title = info.out.split('\n')[0].split('\t')[0];
  // 자막: 사람이 단 자막 > 원어 자동 자막(-orig) > 같은 언어 자동 자막. 번역 자막은 429로 자주 막혀 마지막
  const sub = run('yt-dlp', ['--skip-download', '--write-subs', '--write-auto-subs', '--sub-langs', `${lang},${lang}-orig,${lang}.*`, '--sub-format', 'vtt', '-o', path.join(tmp, 'sub.%(ext)s'), input]);
  const vtts = fs.readdirSync(tmp).filter((f) => f.endsWith('.vtt'));
  if (vtts.length) {
    const pick = vtts.find((f) => f.includes('-orig')) || vtts[0];
    result = { lines: vttToLines(read(path.join(tmp, pick))), how: `yt-dlp 자막 (${pick.replace(/^sub\.|\.vtt$/g, '')})` };
  } else {
    if (!sub.ok) warn(`자막을 받지 못했습니다 (${sub.err.split('\n').at(-1)}) — 소리를 받아 전사합니다`);
    else console.log('올라온 자막이 없어 소리를 받아 전사합니다');
    const a = run('yt-dlp', ['-x', '--audio-format', 'm4a', '-o', path.join(tmp, 'audio.%(ext)s'), input]);
    const audio = fs.readdirSync(tmp).find((f) => f.startsWith('audio.'));
    if (!a.ok || !audio) { bad(`소리를 받지 못했습니다: ${a.err.split('\n').at(-1)}`); process.exit(1); }
    result = whisper(path.join(tmp, audio));
  }
} else {
  const file = resolvePath(input);
  if (!exists(file)) { bad(`파일이 없습니다: ${input}`); process.exit(1); }
  result = whisper(file);
}

// 저장 위치
const name = title.replace(/[\\/:*?"<>|]/g, '').slice(0, 60);
let out = outArg ? resolvePath(outArg) : null;
let jsonOut = null;
if (!out) {
  const parts = isUrl ? [] : relParts(resolvePath(input));
  if (parts[0] === 'references' && parts[2]) out = p(...parts.slice(0, 3), '대본', `${name}.md`);
  else if (parts[0] === 'works' && parts[2]) {
    const job = p(...parts.slice(0, 3));
    out = path.join(job, '원본', `전사-${name}.md`);
    if (result.json && exists(path.join(job, '편집', 'hyperframes.json'))) {
      jsonOut = path.join(job, '편집', exists(path.join(job, '편집', 'transcript.json')) ? `transcript-${name}.json` : 'transcript.json');
    }
  } else out = isUrl ? path.join(process.env.INIT_CWD || p(), `${name}.전사.md`) : path.join(path.dirname(resolvePath(input)), `${name}.전사.md`);
}

write(out, [
  `# 전사: ${title}`, '',
  `- 원본: ${isUrl ? input : path.relative(p(), resolvePath(input))}`,
  `- 방법: ${result.how} · ${new Date().toLocaleDateString('sv-SE', { timeZone: 'Asia/Seoul' })}`,
  '- 자동 전사라 고유명사 · 외래어가 틀릴 수 있다 (예: 클로드→플로드, 컷→컵). 문맥으로 바로잡고, 확실하지 않으면 [?]를 붙인다. 사용자가 준 대본이 있으면 대본이 정답.',
  '', '## 본문', '',
  ...result.lines.map((l) => `[${mmss(l.start)}] ${l.text}`), '',
].join('\n'));
if (jsonOut) { fs.copyFileSync(result.json, jsonOut); ok(`단어 시간 → ${path.relative(p(), jsonOut)} (HyperFrames 자막용)`); }
ok(`${result.lines.length}줄 → ${path.relative(p(), out)}  (${result.how})`);
fs.rmSync(tmp, { recursive: true, force: true });
