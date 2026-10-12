// 레퍼런스 묶음 준비: 폴더 + 패턴.md를 만들고, 영상이 있으면 정지 화면 시트 · 컷 · 쉼 측정(측정.json),
// 이미지(상세페이지 캡처 · 캐러셀 장)가 있으면 한눈에 보는 시트.
// 사용: npm run reference -- references/<종류>/<묶음>     (자료를 넣은 뒤 다시 실행하면 시트 · 측정이 갱신된다)
//       npm run reference -- references/<종류>/<묶음> --download <주소 목록 파일> [--referer <페이지 주소>]
//                                                          이미지 주소(한 줄에 하나)를 캡처/01.jpg … 로 내려받는다 (페이지 순서대로)
//       npm run reference                                  (references/목록.md만 다시 만들기)
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { TYPES, typeOf, refDir, p, read, write, exists, resolvePath, relParts, probe, run, slug, today, buildIndex, ok, bad, warn } from './lib.mjs';

const argv = process.argv.slice(2);
const opt = (k) => { const i = argv.indexOf(k); if (i < 0) return null; const v = argv[i + 1]; argv.splice(i, 2); return v; };
const dl = opt('--download');
const referer = opt('--referer');
const arg = argv[0];
if (!arg) { ok(`references/목록.md — 묶음 ${buildIndex()}개`); process.exit(0); }
const dir0 = arg && resolvePath(arg);
const [top, folder, bundle] = dir0 ? relParts(dir0) : [];
const type = top === 'references' ? typeOf(folder) : null; // 폴더 이름(릴스)이든 코드(reels)든 받는다
if (!dir0 || !type || !bundle) {
  bad(`사용법: npm run reference -- references/<종류>/<묶음>   (종류: ${TYPES.map((t) => `${refDir(t)}(${t})`).join(' · ')}) · 목록만 다시 만들기: npm run reference`);
  process.exit(1);
}
const name = slug(bundle);
const dir = p('references', refDir(type), name);
fs.mkdirSync(dir, { recursive: true });

const pf = path.join(dir, '패턴.md');
if (!exists(pf)) {
  write(pf, read(p('kit', 'forms', '패턴.md')).replaceAll('{{이름}}', name).replaceAll('{{종류}}', refDir(type)).replaceAll('{{날짜}}', today()));
  ok(`references/${refDir(type)}/${name}/패턴.md 를 만들었습니다`);
}

buildIndex();

// 이미지 주소 → 캡처/NN.<확장자> (이미 있는 번호 다음부터)
if (dl) {
  const list = resolvePath(dl);
  if (!exists(list)) { bad(`주소 목록 파일이 없습니다: ${dl}`); process.exit(1); }
  const urls = read(list).split('\n').map((l) => l.trim()).filter((l) => /^https?:\/\//.test(l));
  const cap = path.join(dir, '캡처');
  fs.mkdirSync(cap, { recursive: true });
  let n = fs.readdirSync(cap).filter((f) => /^\d+\./.test(f)).length;
  const before = n;
  const headers = { 'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140 Safari/537.36' };
  if (referer) headers.Referer = referer;
  for (const u of urls) {
    try {
      const r = await fetch(u, { headers });
      if (!r.ok) { warn(`${r.status} ${u}`); continue; }
      const type = r.headers.get('content-type') || '';
      const ext = /gif/.test(type) ? 'gif' : /png/.test(type) ? 'png' : /webp/.test(type) ? 'webp' : (u.match(/\.(gif|png|jpe?g|webp)(?=$|[/?#])/i)?.[1] || 'jpg').toLowerCase();
      n++;
      fs.writeFileSync(path.join(cap, `${String(n).padStart(2, '0')}.${ext}`), Buffer.from(await r.arrayBuffer()));
    } catch (e) { warn(`${e.message} ${u}`); }
  }
  ok(`캡처/ — 주소 ${urls.length}개 중 ${n - before}개 저장 (캡처/${String(before + 1).padStart(2, '0')}~${String(n).padStart(2, '0')})`);
}

const r1 = (x) => Math.round(x * 10) / 10;
const 측정 = { $doc: '컷은 장면 변화 점수 0.3 초과(하드컷 위주), 쉼은 -30dB 아래 0.3초 이상. 숫자만 믿지 말고 시트/를 눈으로 함께 본다.', 영상: [], 이미지: [] };

// 이미지: 묶음 바로 아래와 캡처/ 안 (파일 이름 순서 = 페이지 순서)
const imgs = [dir, path.join(dir, '캡처')].filter(exists)
  .flatMap((d) => fs.readdirSync(d).filter((f) => /\.(jpe?g|png|webp|gif)$/i.test(f)).sort().map((f) => path.join(d, f)));
if (imgs.length) {
  const info = imgs.map((f) => ({ f, m: probe(f) })).filter((x) => x.m && x.m.width);
  for (const { f, m } of info) {
    const row = { 파일: path.relative(dir, f), 크기: `${m.width}×${m.height}` };
    if (/\.gif$/i.test(f)) {
      const c = run('ffprobe', ['-v', 'error', '-count_frames', '-select_streams', 'v:0', '-show_entries', 'stream=nb_read_frames', '-of', 'csv=p=0', f]);
      row.GIF프레임 = Number(c.out) || null; row.GIF초 = r1(m.duration);
    }
    측정.이미지.push(row);
  }
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'kit-sheet-'));
  const sheets = path.join(dir, '시트');
  fs.mkdirSync(sheets, { recursive: true });
  for (const f of fs.readdirSync(sheets)) if (/^이미지_\d+\.jpg$/.test(f)) fs.rmSync(path.join(sheets, f));
  const tall = info.some(({ m }) => m.height > m.width * 2); // 세로로 긴 상세페이지 캡처
  if (tall) {
    // 폭 400으로 맞춰 위아래로 이어 붙인 뒤, 1500px씩 잘라 4칸씩 나란히 (위 → 아래, 왼쪽 → 오른쪽 순서)
    info.forEach(({ f }, i) => run('ffmpeg', ['-v', 'error', '-y', '-i', f, '-frames:v', '1', '-vf', 'scale=400:-2', path.join(tmp, `${String(i).padStart(3, '0')}.png`)]));
    const parts = fs.readdirSync(tmp).sort().map((f) => path.join(tmp, f));
    const strip = path.join(tmp, 'strip.png');
    run('ffmpeg', ['-v', 'error', '-y', ...parts.flatMap((f) => ['-i', f]), '-filter_complex', `vstack=inputs=${parts.length}`, strip]);
    const H = probe(strip)?.height || 0;
    const sheetsN = Math.ceil(H / 6000);
    for (let k = 0; k < sheetsN; k++) {
      run('ffmpeg', ['-v', 'error', '-y', '-i', strip, '-vf', `pad=400:${sheetsN * 6000}:0:0:white,crop=400:6000:0:${k * 6000},untile=1x4,tile=4x1:padding=10:color=gray`, '-frames:v', '1', path.join(sheets, `이미지_${String(k + 1).padStart(2, '0')}.jpg`)]);
    }
    ok(`이미지 ${info.length}개 → 시트/이미지_01~${String(sheetsN).padStart(2, '0')}.jpg (이어 붙인 세로 ${Math.round(H)}px)`);
  } else if (info.length === 1) {
    // 한 장(계정 격자 캡처 등)은 줄이지 않고 폭 1600 이하로만
    run('ffmpeg', ['-v', 'error', '-y', '-i', info[0].f, '-frames:v', '1', '-vf', "scale='min(1600,iw)':-2", path.join(sheets, '이미지_01.jpg')]);
    ok('이미지 1개 → 시트/이미지_01.jpg');
  } else {
    // 장마다 300×375 칸에 맞춰 4×3 격자 (캐러셀 · 캡처 여러 장)
    info.forEach(({ f }, i) => run('ffmpeg', ['-v', 'error', '-y', '-i', f, '-frames:v', '1', '-vf', 'scale=300:375:force_original_aspect_ratio=decrease,pad=300:375:(ow-iw)/2:(oh-ih)/2:white', path.join(tmp, `${String(i).padStart(3, '0')}.png`)]));
    run('ffmpeg', ['-v', 'error', '-y', '-i', path.join(tmp, '%03d.png'), '-vf', 'tile=4x3:padding=10:color=gray', path.join(sheets, '이미지_%02d.jpg')]);
    ok(`이미지 ${info.length}개 → 시트/이미지_*.jpg (4×3)`);
  }
  fs.rmSync(tmp, { recursive: true, force: true });
}

const vids = fs.readdirSync(dir).filter((f) => /\.(mp4|mov|webm|m4v)$/i.test(f)).sort();
if (!vids.length && !imgs.length) { console.log('영상 · 이미지가 없어 시트는 건너뜁니다.'); process.exit(0); }

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
  측정.영상.push({
    파일: v, 길이초: r1(m.duration), 크기: `${m.width}×${m.height}`, 소리: m.audio,
    컷수: cuts.length, 평균컷길이초: r1(m.duration / (cuts.length + 1)), 첫컷초: cuts[0] != null ? r1(cuts[0]) : null,
    쉼수: pauses.length, 쉼합계초: r1(pauses.reduce((a, b) => a + b, 0)),
  });
  ok(`${v}: ${r1(m.duration)}초 · 컷 ${cuts.length} · 평균 컷 ${r1(m.duration / (cuts.length + 1))}초 · 쉼 ${pauses.length}`);
}

write(path.join(dir, '측정.json'), JSON.stringify(측정, null, 2) + '\n');
ok(`측정.json · 시트/ → references/${refDir(type)}/${name}/`);
console.log('다음: 시트를 Read로 직접 보고 패턴.md 「핵심 패턴」 2~3개를 채우세요.');
