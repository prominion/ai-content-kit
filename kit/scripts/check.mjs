// 작업 검사. ❌가 있으면 완성이 아니다. ⚠️는 확인하라는 뜻. 끝나면 레퍼런스 목록 · 작업 목록을 다시 만든다.
// 사용: npm run check -- <작업 폴더>   예) works/reels/2026-10-20-편집노가다
// 규격은 works/<종류>/CLAUDE.md 머리말에서 읽는다.
import fs from 'node:fs';
import path from 'node:path';
import {
  p, exists, read, resolvePath, probe, frontmatter, walk, materialPaths, bundleOf, jobOf, buildAll, ok, warn, bad,
} from './lib.mjs';

const arg = process.argv[2];
const job = arg && jobOf(resolvePath(arg));
if (!job) {
  bad('작업 폴더를 찾지 못했습니다. 사용법: npm run check -- works/<종류>/<작업 이름>');
  process.exit(1);
}
const { dir, type } = job;
const spec = frontmatter(read(p('works', type, 'CLAUDE.md')));
const rel = (f) => path.relative(dir, f);
let fails = 0;
const fail = (s) => { bad(s); fails++; };
console.log(`검사: ${job.id}  (브랜드: ${job.brand || '없음'})`);
if (!job.brand || !exists(p('brand', job.brand, 'profile.md'))) fail(`작업.md 머리말 「브랜드: ${job.brand}」 — brand/ 에 그 브랜드가 없습니다`);

// 1. 작업.md 절 6개
const memo = read(path.join(dir, '작업.md'));
const sections = ['1. 요청', '2. 재료', '3. 구성', '4. 버전', '5. 기록', '6. 결과'];
const missing = sections.filter((s) => !memo.includes(`## ${s}`));
missing.length ? fail(`작업.md에 없는 절: ${missing.join(', ')}`) : ok('작업.md 절 6개');

// 2. 재료 경로가 실제로 있나 (루트 기준, 없으면 작업 폴더 기준)
const { sec, paths } = materialPaths(dir);
const sources = [];
for (const { s, f } of paths) f ? sources.push(f) : fail(`재료 경로가 없습니다: ${s}`);
if (paths.length && sources.length === paths.length) ok(`재료 경로 ${paths.length}개`);

// 3. 레퍼런스 연결 — 없으면 ❌. 일부러 안 쓰면 「- 레퍼런스: 없음」
const refs = [...new Set(sources.map(bundleOf).filter(Boolean).map((b) => `${b.type}/${b.bundle}`))];
const refLine = (sec.match(/^- 레퍼런스:(.*)$/m) || [])[1] || '';
if (refs.length) ok(`레퍼런스 ${refs.length}개 연결: ${refs.join(', ')}`);
else if (/없음/.test(refLine)) ok('레퍼런스 없이 (작업.md에 「없음」으로 적음)');
else fail('레퍼런스를 연결하지 않았습니다 — 「2. 재료」에 references/… 경로를 적거나, 쓰지 않으면 「- 레퍼런스: 없음」');

// 4. 결과물 규격
const files = walk(path.join(dir, '완성'));
if (!files.length) warn('완성/이 비어 있습니다');
if (spec.output === 'video') {
  const vids = files.filter((f) => /\.(mp4|mov|webm)$/i.test(f));
  if (files.length && !vids.length) fail('완성/에 영상이 없습니다');
  for (const f of vids) {
    const m = probe(f);
    if (!m) { fail(`${rel(f)}: 영상을 읽지 못했습니다`); continue; }
    const errs = [];
    if (m.width !== spec.width || m.height !== spec.height) errs.push(`크기 ${m.width}×${m.height} (규격 ${spec.width}×${spec.height})`);
    if (m.duration < spec.min_sec || m.duration > spec.max_sec) errs.push(`길이 ${m.duration.toFixed(1)}초 (규격 ${spec.min_sec}~${spec.max_sec}초)`);
    if (spec.need_audio && !m.audio) errs.push('소리 없음');
    errs.length ? fail(`${rel(f)}: ${errs.join(' · ')}`) : ok(`${rel(f)}: ${m.width}×${m.height} · ${m.duration.toFixed(1)}초`);
  }
}
if (spec.output === 'png') {
  const groups = {};
  for (const f of files.filter((x) => /\.png$/i.test(x))) (groups[path.dirname(f)] ||= []).push(f);
  if (files.length && !Object.keys(groups).length) fail('완성/에 PNG가 없습니다');
  for (const [g, list] of Object.entries(groups)) {
    const errs = [];
    if (list.length < spec.min_count || list.length > spec.max_count) errs.push(`${list.length}장 (규격 ${spec.min_count}~${spec.max_count}장)`);
    const wrong = list.filter((f) => { const m = probe(f); return !m || m.width !== spec.width || m.height !== spec.height; });
    if (wrong.length) errs.push(`크기가 다른 장: ${wrong.map((f) => path.basename(f)).join(', ')} (규격 ${spec.width}×${spec.height})`);
    errs.length ? fail(`${rel(g)}: ${errs.join(' · ')}`) : ok(`${rel(g)}: ${list.length}장 · ${spec.width}×${spec.height}`);
  }
}
if (spec.output === 'html') {
  const htmls = files.filter((f) => /\.html?$/i.test(f));
  if (files.length && !htmls.length) fail('완성/에 HTML이 없습니다');
  for (const f of htmls) {
    const mb = fs.statSync(f).size / 1e6;
    const outside = [...read(f).matchAll(/(?:src|href)\s*=\s*["']([^"']+)["']/gi)].map((m) => m[1])
      .filter((u) => !/^(https?:|data:|#|mailto:|tel:|javascript:)/i.test(u));
    const errs = [];
    if (mb > spec.max_mb) errs.push(`${mb.toFixed(1)}MB (규격 ${spec.max_mb}MB 이하)`);
    if (spec.single_file && outside.length) errs.push(`파일 밖 자료를 가리킴 → 빌더에 붙이면 깨짐: ${outside.slice(0, 3).join(', ')}`);
    errs.length ? fail(`${rel(f)}: ${errs.join(' · ')}`) : ok(`${rel(f)}: 한 파일 · ${mb.toFixed(1)}MB`);
  }
}

// 5. 재료에 없는 숫자 (결과물 · 대본 글 속 숫자가 재료 글에 있나)
const isText = (f) => /\.(md|txt|html?)$/i.test(f);
const textOf = (f) => (/\.html?$/i.test(f)
  ? read(f).replace(/<script[\s\S]*?<\/script>|<style[\s\S]*?<\/style>/gi, ' ').replace(/data:[^"')\s]+/g, ' ').replace(/<[^>]+>/g, ' ')
  : read(f));
const outTexts = [...files, path.join(dir, '대본.md')].filter((f) => exists(f) && isText(f));
if (outTexts.length) {
  const norm = (s) => s.replace(/[,\s]/g, '');
  const src = norm(sources.filter((s) => !bundleOf(s)).flatMap((s) => (fs.statSync(s).isDirectory() ? walk(s) : [s])).filter(isText).map(textOf).join('\n'));
  const claim = /\d[\d,.]*\s*(?:%|퍼센트|억|천만|만|천|원|명|배|건|개월|시간|분)/g;
  const found = [...new Set(outTexts.flatMap((f) => textOf(f).match(claim) || []).map(norm))];
  const unsourced = found.filter((n) => !src.includes(n));
  if (unsourced.length) warn(`재료에서 찾지 못한 숫자: ${unsourced.join(', ')} — 지어낸 숫자가 아닌지 확인하세요 (재료 경로를 「2. 재료」에 적어야 검사됩니다)`);
  else if (found.length) ok(`결과물 숫자 ${found.length}개 모두 재료에 있음`);
}

// 6. 확정 버전이 실제로 있나
const fm = frontmatter(memo);
if (fm.확정 && !exists(path.join(dir, '완성', fm.확정))) fail(`확정: ${fm.확정} — 완성/${fm.확정}/ 폴더가 없습니다`);
if (fm.상태 === '완성' && !files.length) fail('상태가 「완성」인데 완성/이 비어 있습니다');

// 7. 목록 갱신 (레퍼런스 목록 · 작업 목록)
buildAll();

console.log(fails ? `\n❌ ${fails}개` : '\n통과');
process.exit(fails ? 1 : 0);
