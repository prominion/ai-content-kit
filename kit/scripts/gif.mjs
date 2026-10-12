// 상세페이지 · 캐러셀에 넣을 GIF. HyperFrames로 짧은 장면을 만들고 → 렌더 → 잘라서 GIF로.
// 사용: npm run gif -- <작업 폴더> [--size 800x480]
//         처음 한 번: 편집/gif/ 에 HyperFrames 프로젝트를 만든다 (버전 고정 · Pretendard 복사 · 캔버스 크기)
//       npm run gif -- <작업 폴더> --cut "01-조립:0-2.6,02-순서:2.6-5.2" [--fps 10] [--width 640] [--src <mp4>]
//         렌더한 영상(기본: 편집/gif/renders/ 의 가장 최근 mp4)을 구간별로 잘라 편집/이미지/<이름>.gif 로 만든다
//         --cut 이 없으면 영상 전체를 GIF 하나로
import fs from 'node:fs';
import path from 'node:path';
import { p, exists, read, write, run, resolvePath, jobOf, refDir, hfInit, hfVersion, ok, bad, warn } from './lib.mjs';

const args = process.argv.slice(2);
const opt = (k, d = null) => { const i = args.indexOf(k); if (i < 0) return d; const v = args[i + 1]; args.splice(i, 2); return v; };
const size = opt('--size', '800x480');
const cut = opt('--cut');
const fps = Number(opt('--fps', '10'));
const width = Number(opt('--width', '640'));
const srcArg = opt('--src');
const job = args[0] && jobOf(resolvePath(args[0]));
if (!job) { bad('작업 폴더를 찾지 못했습니다. 사용법: npm run gif -- works/<종류>-제작/<작업> [--cut "이름:시작-끝,…"]'); process.exit(1); }

const gifDir = path.join(job.dir, '편집', 'gif');
const outDir = path.join(job.dir, '편집', '이미지');
const rel = (f) => path.relative(p(), f);

// 1) 프로젝트가 없으면 만든다
if (!exists(path.join(gifDir, 'hyperframes.json'))) {
  const [w, h] = size.split('x').map(Number);
  if (!w || !h) { bad(`--size 는 가로x세로 (예: 800x480): ${size}`); process.exit(1); }
  const r = hfInit(gifDir, {
    resolution: w >= h ? 'landscape' : 'portrait',
    rules: `- 이 프로젝트는 ${refDir(job.type)} 작업에 넣을 **GIF**용이다. 캔버스 ${w}×${h}. 장면 하나 = 2~3초, 글은 짧게, 숫자 · 후기 · 성과는 재료에 있는 것만.\n`
      + '- 여러 GIF는 한 구성에 장면(clip)을 이어 붙여 한 번에 렌더하고, `npm run gif -- <작업 폴더> --cut "이름:시작-끝,…"`으로 자른다.\n'
      + '- 렌더: `npx --yes hyperframes@' + hfVersion() + ' render --quality looks --output renders/gif.mp4` (check 통과 뒤).\n',
  });
  if (!r.ok) { bad(`HyperFrames 프로젝트를 만들지 못했습니다:\n${r.err}`); process.exit(1); }
  // 빈 예제의 1920×1080을 캔버스 크기로
  const idx = path.join(gifDir, 'index.html');
  write(idx, read(idx).replaceAll('1920', String(w)).replaceAll('1080', String(h)));
  ok(`${rel(gifDir)}/ — HyperFrames ${r.v} 프로젝트 · ${w}×${h} · Pretendard`);
  console.log('다음: index.html에 장면을 만들고 → 이 폴더에서 check → render → npm run gif -- <작업 폴더> --cut "…"');
  process.exit(0);
}

// 2) 렌더한 영상 → GIF
const renders = path.join(gifDir, 'renders');
const src = srcArg ? resolvePath(srcArg)
  : (exists(renders) ? fs.readdirSync(renders).filter((f) => /\.mp4$/i.test(f)).map((f) => path.join(renders, f)).sort((a, b) => fs.statSync(b).mtimeMs - fs.statSync(a).mtimeMs)[0] : null);
if (!src || !exists(src)) { bad(`렌더한 영상이 없습니다. ${rel(gifDir)}/ 에서 먼저 render 하세요`); process.exit(1); }

const parts = cut
  ? cut.split(',').map((s) => s.trim()).filter(Boolean).map((s) => {
    const m = s.match(/^(.+):([\d.]+)-([\d.]+)$/);
    if (!m) { bad(`--cut 형식: 이름:시작-끝 (초), 예 "01-조립:0-2.6" — 받은 값: ${s}`); process.exit(1); }
    return { name: m[1], from: Number(m[2]), to: Number(m[3]) };
  })
  : [{ name: path.basename(src).replace(/\.[^.]+$/, ''), from: null, to: null }];

fs.mkdirSync(outDir, { recursive: true });
let fails = 0;
for (const x of parts) {
  const out = path.join(outDir, `${x.name}.gif`);
  const span = x.from == null ? [] : ['-ss', String(x.from), '-t', String(x.to - x.from)];
  // 팔레트를 장면마다 새로 뽑고(64색) 디더링을 끈다 — 단색 그래픽이 깨끗하고 파일이 작다
  const vf = `fps=${fps},scale=${width}:-1:flags=lanczos,split[a][b];[a]palettegen=max_colors=64:stats_mode=diff[p];[b][p]paletteuse=dither=none`;
  const r = run('ffmpeg', ['-v', 'error', '-y', ...span, '-i', src, '-vf', vf, '-loop', '0', out]);
  if (!r.ok) { bad(`${x.name}: ${r.err.slice(0, 300)}`); fails++; continue; }
  const kb = Math.round(fs.statSync(out).size / 1024);
  (kb > 500 ? warn : ok)(`${rel(out)} · ${kb}KB${kb > 500 ? ' — 큽니다. --width 를 줄이거나 장면을 짧게' : ''}`);
}
if (!fails) console.log('다음: 결과 GIF를 정지 화면으로 뽑아 직접 보고, 상세페이지에는 data URI로 넣는다.');
process.exit(fails ? 1 : 0);
