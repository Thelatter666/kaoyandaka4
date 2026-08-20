import { chromium } from '@playwright/test';
import path from 'path';
const b=await chromium.launch();
const p=await b.newPage({viewport:{width:1280,height:900},deviceScaleFactor:2});
const URL='file://'+path.resolve('docs/superpowers/spikes/2026-08-21-inkwell-spike.html');

async function run(label, extra){
  await p.goto(URL,{waitUntil:'load'});          // 每组重新加载，彻底隔离
  await p.waitForTimeout(150);
  await p.evaluate(extra);
  await p.waitForTimeout(260);
  const buf=await p.locator('#wellFull').screenshot();
  const r=await p.evaluate(async url=>{
    const img=new Image(); await new Promise(x=>{img.onload=x;img.src=url;});
    const cv=document.createElement('canvas');cv.width=img.width;cv.height=img.height;
    const cx=cv.getContext('2d');cx.drawImage(img,0,0);
    const svg=document.querySelector('#wellFull svg');
    const t=svg.querySelector('.t-time').getBBox();
    const sub=svg.querySelector('.relief .t-sub').getBBox();
    const surfY=parseFloat(svg.querySelector('.surf-clip').getAttribute('transform').match(/-?[\d.]+/g).pop());
    const k=img.width/360;
    const L=c=>{const f=v=>{v/=255;return v<=.03928?v/12.92:Math.pow((v+.055)/1.055,2.4);};
      return .2126*f(c[0])+.7152*f(c[1])+.0722*f(c[2]);};
    const band=(x,w,y0,y1)=>{const h=Math.max(1,Math.round((y1-y0)*k));
      const d=cx.getImageData(Math.round(x*k),Math.round(y0*k),Math.round(w*k),h).data;
      const px=[];for(let i=0;i<d.length;i+=4)px.push(L([d[i],d[i+1],d[i+2]]));
      px.sort((a,b)=>a-b);
      return +(((px[Math.floor(px.length*.95)]+.05)/(px[Math.floor(px.length*.05)]+.05))).toFixed(2);};
    return { a: band(t.x,t.width,t.y,surfY), bl: band(t.x,t.width,surfY,t.y+t.height),
             s: band(sub.x,sub.width,sub.y,sub.y+sub.height) };
  },'data:image/png;base64,'+buf.toString('base64'));
  const j=v=>String(v).padStart(5);
  const pass=(r.a>=3&&r.bl>=3&&r.s>=4.5)?'✅ 全达标':'❌ 有不达标';
  console.log(`${label}\n   数字上${j(r.a)}:1  数字下${j(r.bl)}:1  副标题${j(r.s)}:1   ${pass}\n`);
  await p.screenshot({path:`docs/superpowers/spikes/route-${label.slice(0,1)}.png`});
}

const base=`document.querySelector('#themeSeg button[data-v="dark"]').click();
  document.querySelector('#modeSeg button[data-v="math"]').click();
  const s=document.getElementById('pct'); s.value=52; s.dispatchEvent(new Event('input'));`;

console.log('深色主题三条路线（每组独立重载，无状态残留）\n数字 62px 需 3:1；副标题 13px 需 4.5:1\n');
await run('A 墨不透明度 0.85（保荧光墨 + 保阴文）',
  new Function(`document.documentElement.style.setProperty('--ink-opacity','0.85');${base}`));
await run('B 双主题都「浅池底 + 深墨」（砚池内部不随主题反转）',
  new Function(`const R=document.documentElement.style;
    R.setProperty('--ink-opacity','1');
    R.setProperty('--color-ink-stone','#E8E6E1'); R.setProperty('--color-ink-stone-deep','#D6D2CA');
    R.setProperty('--color-ink-math','#7E2418'); R.setProperty('--color-ink-highlight','rgba(255,255,255,.55)');
    ${base}`));
await run('C 深色数字恒阳文近白字（保半透荧光墨，取消裁剪）',
  new Function(`${base}
    const svg=document.querySelector('#wellFull svg');
    svg.querySelector('.relief').removeAttribute('clip-path');
    svg.querySelectorAll('.relief text').forEach(n=>n.setAttribute('fill','#F2F4F7'));`));
await b.close();
