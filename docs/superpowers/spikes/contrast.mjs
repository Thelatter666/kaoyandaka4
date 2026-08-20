import { chromium } from '@playwright/test';
import path from 'path';
const b = await chromium.launch();
const p = await b.newPage({ viewport:{width:1280,height:900}, deviceScaleFactor:2 });
await p.goto('file://'+path.resolve('docs/superpowers/spikes/2026-08-21-inkwell-spike.html'),{waitUntil:'load'});

async function measure(theme, pct, mode='math'){
  await p.evaluate(({theme,pct,mode})=>{
    document.querySelector(`#themeSeg button[data-v="${theme}"]`).click();
    (document.querySelector(`#modeSeg button[data-v="${mode}"]`)||
     document.querySelector(`#modeSeg2 button[data-v="${mode}"]`)).click();
    const s=document.getElementById('pct'); s.value=pct; s.dispatchEvent(new Event('input'));
  },{theme,pct,mode});
  await p.waitForTimeout(250);
  const buf = await p.locator('#wellFull').screenshot();
  const dataUrl = 'data:image/png;base64,' + buf.toString('base64');
  return await p.evaluate(async (url)=>{
    const img=new Image(); await new Promise(r=>{img.onload=r;img.src=url;});
    const cv=document.createElement('canvas'); cv.width=img.width; cv.height=img.height;
    const cx=cv.getContext('2d'); cx.drawImage(img,0,0);
    const svg=document.querySelector('#wellFull svg');
    const t=svg.querySelector('.t-time').getBBox();
    const surfY=parseFloat(svg.querySelector('.surf-clip').getAttribute('transform').match(/-?[\d.]+/g).pop());
    const k=img.width/360;
    const L=c=>{const f=v=>{v/=255;return v<=.03928?v/12.92:Math.pow((v+.055)/1.055,2.4);};
      return .2126*f(c[0])+.7152*f(c[1])+.0722*f(c[2]);};
    const band=(y0,y1)=>{
      const h=Math.max(1,Math.round((y1-y0)*k));
      const d=cx.getImageData(Math.round(t.x*k),Math.round(y0*k),Math.round(t.width*k),h).data;
      const px=[]; for(let i=0;i<d.length;i+=4) px.push(L([d[i],d[i+1],d[i+2]]));
      px.sort((a,b)=>a-b);
      const lo=px[Math.floor(px.length*0.05)], hi=px[Math.floor(px.length*0.95)];
      return +(((hi+.05)/(lo+.05))).toFixed(2);
    };
    const top=t.y, bot=t.y+t.height;
    return {
      surfY:+surfY.toFixed(1),
      above: surfY>top+4 ? band(top, Math.min(surfY,bot)) : null,
      below: surfY<bot-4 ? band(Math.max(surfY,top), bot) : null,
    };
  }, dataUrl);
}
console.log('WCAG 对比度（5%/95% 分位，AA 正文需 4.5:1，大字号需 3:1）\n');
for (const [theme,pct,mode] of [['light',52,'math'],['dark',52,'math'],
  ['light',20,'math'],['dark',20,'math'],['light',52,'english'],['dark',52,'break']]) {
  const r = await measure(theme,pct,mode);
  const f=v=>v===null?'  —  ':String(v).padStart(5);
  console.log(`${theme.padEnd(5)} ${String(pct).padStart(3)}% ${mode.padEnd(8)} 阳文${f(r.above)}:1   阴文${f(r.below)}:1`);
}
await b.close();
