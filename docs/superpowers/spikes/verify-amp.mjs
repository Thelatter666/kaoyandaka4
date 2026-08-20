import { chromium } from '@playwright/test';
import path from 'path';
const b=await chromium.launch();
const p=await b.newPage({viewport:{width:1280,height:900},deviceScaleFactor:2});
await p.goto('file://'+path.resolve('docs/superpowers/spikes/2026-08-21-inkwell-spike.html'),{waitUntil:'load'});
const errs=[]; p.on('pageerror',e=>errs.push(e.message));
async function probe(label, setup){
  await p.evaluate(setup); await p.waitForTimeout(240);
  return await p.evaluate(l=>{
    const w=document.getElementById('wellFull');
    const svg=w.querySelector('svg');
    const inkA=svg.querySelector('.ink-a'), rel=svg.querySelector('.relief-edge');
    // 从 d 里反解波幅：取所有 y 值的极差 / 2
    const amp=d=>{const ys=[...d.matchAll(/L (-?[\d.]+) (-?[\d.]+)/g)].map(m=>parseFloat(m[2]))
      .filter(v=>Math.abs(v)<50); return ys.length? +(((Math.max(...ys)-Math.min(...ys))/2).toFixed(2)):null;};
    return { label:l, variant:w.dataset.variant,
             inkAmp:amp(inkA.getAttribute('d')), reliefAmp:amp(rel.getAttribute('d')),
             markStroke:svg.querySelector('.marks line')?.getAttribute('stroke'),
             markCount:svg.querySelectorAll('.marks line').length,
             hlStroke:getComputedStyle(svg.querySelector('.hl')).stroke };
  }, label);
}
const base=`document.querySelector('#themeSeg button[data-v="light"]').click();`;
console.log(JSON.stringify(await probe('常态 专注', new Function(`${base}
  document.querySelector('#modeSeg button[data-v="math"]').click();
  const s=document.getElementById('pct'); s.value=60; s.dispatchEvent(new Event('input'));`))));
console.log(JSON.stringify(await probe('低时 ×1.6', new Function(`${base}
  document.querySelector('#modeSeg button[data-v="math"]').click();
  const lt=document.getElementById('lowtime'); if(!lt.checked) lt.click();`))));
console.log(JSON.stringify(await probe('休息 ×1.25', new Function(`${base}
  const lt=document.getElementById('lowtime'); if(lt.checked) lt.click();
  document.querySelector('#modeSeg2 button[data-v="break"]').click();`))));
console.log(errs.length?('❌ '+errs.join(';')):'✅ 无 JS 错误');
await b.close();
