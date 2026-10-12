// HTML을 원하는 폭으로 찍는다 (헤드리스 Chrome). Chrome 창은 약 590px보다 좁아지지 않아서, 화면 크기를 직접 바꿔 찍는다.
// 사용: npm run shot -- <HTML 파일> [--width 375]
//         페이지 전체를 위에서부터 1600px씩 나눠 PNG로 → 편집/검사/<버전>-<폭>/01.png … (상세페이지 모바일 확인)
//       npm run shot -- <HTML 파일> --width 1080 --selector ".card" --out <폴더>
//         고른 요소마다 그 크기 그대로 PNG 한 장씩 → <폴더>/01.png … (캐러셀 카드 1080×1350 만들기)
// 브라우저는 HyperFrames가 받아 두는 Chrome을 쓴다 (없으면 처음 한 번 내려받는다). 스크롤해서 나타나는 요소도 다 나온 뒤에 찍는다.
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { p, exists, run, resolvePath, relParts, hfVersion, ok, bad } from './lib.mjs';

const args = process.argv.slice(2);
const opt = (k, d = null) => { const i = args.indexOf(k); if (i < 0) return d; const v = args[i + 1]; args.splice(i, 2); return v; };
const width = Number(opt('--width', '375'));
const selector = opt('--selector');
const outArg = opt('--out');
const seg = Number(opt('--seg', '1600'));
const file = args[0] && resolvePath(args[0]);
if (!file || !exists(file) || !/\.html?$/i.test(file)) { bad('사용법: npm run shot -- <HTML 파일> [--width 375] [--selector ".card" --out <폴더>]'); process.exit(1); }

// 저장 위치: 작업 폴더 안 HTML이면 편집/검사/<버전>-<폭>/, 아니면 HTML 옆 검사/
function defaultOut() {
  const [top, type, job, sub, ver] = relParts(file);
  const name = `${sub === '완성' && ver ? ver : path.basename(file).replace(/\.[^.]+$/, '')}-${width}`;
  return top === 'works' && type && job ? p('works', type, job, '편집', '검사', name) : path.join(path.dirname(file), '검사', name);
}
const out = outArg ? resolvePath(outArg) : defaultOut();

// 브라우저 찾기: HyperFrames 관리 Chrome → 시스템 Chrome
function findChrome() {
  const r = run('npx', ['--yes', `hyperframes@${hfVersion()}`, 'browser', 'ensure'], { cwd: os.tmpdir() });
  const found = (r.out.match(/(\/[^\s]*chrome[^\s]*|[A-Z]:\\[^\r\n]*chrome[^\r\n]*\.exe)/gi) || []).map((s) => s.trim()).find(exists);
  if (found) return found;
  const pathOut = run('npx', ['--yes', `hyperframes@${hfVersion()}`, 'browser', 'path'], { cwd: os.tmpdir() }).out.split('\n').map((s) => s.trim()).find(exists);
  if (pathOut) return pathOut;
  return ['/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe', '/usr/bin/google-chrome', '/usr/bin/chromium']
    .find(exists) || null;
}

const chrome = findChrome();
if (!chrome) { bad('Chrome을 찾지 못했습니다. npx --yes hyperframes@' + hfVersion() + ' browser ensure 를 먼저 실행하세요'); process.exit(1); }

const profile = fs.mkdtempSync(path.join(os.tmpdir(), 'kit-shot-'));
const proc = spawn(chrome, ['--headless=new', '--disable-gpu', '--hide-scrollbars', '--allow-file-access-from-files', '--no-first-run',
  '--remote-debugging-port=0', `--user-data-dir=${profile}`, 'about:blank'], { stdio: ['ignore', 'ignore', 'pipe'] });
const wsUrl = await new Promise((res, rej) => {
  let buf = '';
  const t = setTimeout(() => rej(new Error('Chrome이 응답하지 않습니다')), 20000);
  proc.stderr.on('data', (d) => { buf += d; const m = buf.match(/DevTools listening on (ws:\/\/\S+)/); if (m) { clearTimeout(t); res(m[1]); } });
  proc.on('exit', () => rej(new Error(`Chrome이 종료됐습니다: ${buf.slice(0, 300)}`)));
});

// CDP 최소 클라이언트
const ws = new WebSocket(wsUrl);
await new Promise((res) => ws.addEventListener('open', res, { once: true }));
let id = 0;
const waiting = new Map();
const events = [];
ws.addEventListener('message', (e) => {
  const m = JSON.parse(e.data);
  if (m.id && waiting.has(m.id)) { const { res, rej } = waiting.get(m.id); waiting.delete(m.id); m.error ? rej(new Error(m.error.message)) : res(m.result); } else events.push(m);
});
const send = (method, params = {}, sessionId) => new Promise((res, rej) => { const i = ++id; waiting.set(i, { res, rej }); ws.send(JSON.stringify({ id: i, method, params, sessionId })); });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

let code = 0;
try {
  const { targetId } = await send('Target.createTarget', { url: 'about:blank' });
  const { sessionId: s } = await send('Target.attachToTarget', { targetId, flatten: true });
  const S = (m, prm) => send(m, prm, s);
  await S('Page.enable');
  await S('Emulation.setDeviceMetricsOverride', { width, height: 900, deviceScaleFactor: 1, mobile: width < 600 });
  await S('Page.navigate', { url: pathToFileURL(file).href });
  for (let t = 0; t < 100 && !events.some((e) => e.method === 'Page.loadEventFired' && e.sessionId === s); t++) await sleep(100);
  // 끝까지 스크롤해서 '스크롤하면 나타나는' 요소를 모두 켠 뒤 맨 위로
  await S('Runtime.evaluate', { awaitPromise: true, expression: `(async()=>{await document.fonts.ready;for(let y=0;y<document.documentElement.scrollHeight;y+=400){scrollTo(0,y);await new Promise(r=>setTimeout(r,60))}scrollTo(0,0);await new Promise(r=>setTimeout(r,900))})()` });
  fs.mkdirSync(out, { recursive: true });
  const shot = async (clip, name) => {
    const { data } = await S('Page.captureScreenshot', { format: 'png', clip: { ...clip, scale: 1 }, captureBeyondViewport: true });
    fs.writeFileSync(path.join(out, name), Buffer.from(data, 'base64'));
  };
  if (selector) {
    const { result } = await S('Runtime.evaluate', { returnByValue: true, expression: `[...document.querySelectorAll(${JSON.stringify(selector)})].map(e=>{const r=e.getBoundingClientRect();return {x:r.left+scrollX,y:r.top+scrollY,width:r.width,height:r.height}})` });
    const boxes = result.value || [];
    if (!boxes.length) throw new Error(`요소가 없습니다: ${selector}`);
    for (const [i, b] of boxes.entries()) await shot(b, `${String(i + 1).padStart(2, '0')}.png`);
    ok(`${boxes.length}장 · ${Math.round(boxes[0].width)}×${Math.round(boxes[0].height)} → ${path.relative(p(), out)}/`);
  } else {
    const { result } = await S('Runtime.evaluate', { returnByValue: true, expression: '({h:document.documentElement.scrollHeight,w:document.documentElement.scrollWidth})' });
    const { h, w } = result.value;
    const n = Math.ceil(h / seg);
    for (let i = 0; i < n; i++) await shot({ x: 0, y: i * seg, width, height: Math.min(seg, h - i * seg) }, `${String(i + 1).padStart(2, '0')}.png`);
    ok(`폭 ${width}px · 높이 ${h}px → ${n}장 → ${path.relative(p(), out)}/`);
    if (w > width + 1) { bad(`가로로 넘칩니다: 페이지 폭 ${w}px > 화면 ${width}px`); code = 1; }
  }
  console.log('다음: 찍은 PNG를 Read로 열어 직접 본다 (글자 잘림 · 겹침 · 색 대비 · 빈 화면).');
} catch (e) {
  bad(e.message); code = 1;
} finally {
  ws.close(); proc.kill();
  await sleep(300);
  fs.rmSync(profile, { recursive: true, force: true });
}
process.exit(code);
