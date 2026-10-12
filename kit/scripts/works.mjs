// 작업 목록 다시 만들기: works/목록.md (전체) · works/<브랜드>/목록.md · works/목록.json (연동용) + references/목록.md
// 사용: npm run works
import { buildAll, ok } from './lib.mjs';

const all = buildAll();
const by = {};
for (const x of all) (by[x.브랜드] ||= { 진행: 0, 완성: 0 })[x.상태 === '완성' ? '완성' : '진행']++;
for (const [b, c] of Object.entries(by)) console.log(`· ${b}: 진행 중 ${c.진행} · 완성 ${c.완성}`);
ok(`works/목록.md · works/<브랜드>/목록.md · works/목록.json — 작업 ${all.length}개`);
