// 레퍼런스 묶음 준비: 폴더 + 패턴.md를 만들고, 영상이 있으면 정지 화면 시트 · 컷 · 쉼 측정(측정.json).
// 사용: npm run reference -- references/<종류>/<묶음>     (영상을 넣은 뒤 다시 실행하면 측정이 갱신된다)
//       npm run reference                                  (references/목록.md만 다시 만들기)
import fs from 'node:fs';
import path from 'node:path';
import { TYPES, p, read, write, exists, resolvePath, relParts, probe, run, slug, today, buildIndex, ok, bad, warn } from './lib.mjs';

const arg = process.argv[2];
if (!arg) { ok(`references/목록.md — 묶음 ${buildIndex()}개`); process.exit(0); }
const dir0 = arg && resolvePath(arg);
const [top, type, bundle] = dir0 ? relParts(dir0) : [];
if (!dir0 || top !== 'references' || !TYPES.includes(type) || !bundle) {
  bad(`사용법: npm run reference -- references/<종류>/<묶음>   (종류: ${TYPES.join(' · ')}) · 목록만 다시 만들기: npm run reference`);
  process.exit(1);
}
const name = slug(bundle);
const dir = p('references', type, name);
fs.mkdirSync(dir, { recursive: true });

const pf = path.join(dir, '패턴.md');
if (!exists(pf)) {
  write(pf, read(p('kit', 'forms', '패턴.md')).replaceAll('{{이름}}', name).replaceAll('{{종류}}', type).replaceAll('{{날짜}}', today()));
  ok(`references/${type}/${name}/패턴.md 를 만들었습니다`);
}

buildIndex();
const vids = fs.readdirSync(dir).filter((f) => /\.(mp4|mov|webm|m4v)$/i.test(f)).sort();
if (!vids.length) { console.log('영상이 없어 측정은 건너뜁니다 (영상만 측정합니다).'); process.exit(0); }

const r1 = (x) => Math.round(x * 10) / 10;
const results = [];
for (const v of vids) {
  const f = path.join(dir, v);
  const m = probe(f);
  if (!m || !m.duration) { warn(`${v}: 읽지 못함`); continue; }
  // 컷: 장면 변화 점수 0.3 초과. 부드러운 모션그래픽 전환은 잘 못 잡는다 → 시트를 눈으로 함께 본다
  const sc = run('ffmpeg', ['-hide_banner', '-i', f, '-vf', "select='gt(scene,0.3)',showinfo", '-an', '-f', 'null', '-']);
  const cuts = [...sc.err.matchAll(/pts_time:([\d.]+)/g)].map((x) => Number(x[1]));
  // 쉼: -30dB 아래 0.3초 이상
  const si = run('ffmpeg', ['-hide_banner', '-i', f, '-af', 'silencedetect=noise=-30dB:d=0.3', '-vn', '-f', 'null', '-']);
  const pauses = [...si.err.matchAll(/silence_duration: ([\d.]+)/g)].map((x) => Number(x[1]));
  // 시트: 2분 이하는 고르게 12장 한 장, 긴 영상은 10초마다 12장씩 여러 장
  const sheet = path.join(dir, '시트', v.replace(/\.[^.]+$/, ''));
  fs.mkdirSync(path.dirname(sheet), { recursive: true });
  const fps = m.duration <= 120 ? 12 / m.duration : 1 / 10;
  const portrait = m.height > m.width;
  run('ffmpeg', ['-v', 'error', '-y', '-i', f, '-vf', `fps=${fps},scale=${portrait ? 240 : 360}:-2,tile=${portrait ? '6x2' : '4x3'}`, `${sheet}_%02d.jpg`]);
  results.push({
    파일: v, 길이초: r1(m.duration), 크기: `${m.width}×${m.height}`, 소리: m.audio,
    컷수: cuts.length, 평균컷길이초: r1(m.duration / (cuts.length + 1)), 첫컷초: cuts[0] != null ? r1(cuts[0]) : null,
    쉼수: pauses.length, 쉼합계초: r1(pauses.reduce((a, b) => a + b, 0)),
  });
  ok(`${v}: ${r1(m.duration)}초 · 컷 ${cuts.length} · 평균 컷 ${r1(m.duration / (cuts.length + 1))}초 · 쉼 ${pauses.length}`);
}

write(path.join(dir, '측정.json'), JSON.stringify({
  $doc: '컷은 장면 변화 점수 0.3 초과(하드컷 위주), 쉼은 -30dB 아래 0.3초 이상. 숫자만 믿지 말고 시트/를 눈으로 함께 본다.',
  영상: results,
}, null, 2) + '\n');
ok(`측정.json · 시트/ → references/${type}/${name}/`);
console.log('다음: 시트를 보고 패턴.md 「핵심 패턴」 2~3개를 채우세요.');
