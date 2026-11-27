// Run against the repository with playwright and three@0.170.0 installed.
const { chromium } = require('playwright');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const http = require('node:http');
const root = path.resolve(process.env.ROACH_ROOT || path.join(__dirname, '..'));
const three = process.env.THREE_ROOT || path.resolve(path.dirname(require.resolve('three')), '..');
const original = process.env.EXPECT_ORIGINAL === '1';
const server = http.createServer((req,res)=>{
  const file=decodeURIComponent(new URL(req.url,'http://localhost').pathname).slice(1);
  if(file==='probe'){ res.setHeader('Content-Type','text/html'); res.end('<!doctype html><title>저장 검증</title>'); return; }
  if(!/^[\w.-]+$/.test(file)||!fs.existsSync(path.join(root,file))){res.writeHead(404).end(); return;}
  const ext=path.extname(file);
  res.setHeader('Content-Type',({'.js':'text/javascript','.html':'text/html; charset=utf-8'})[ext] || 'application/octet-stream');
  fs.createReadStream(path.join(root,file)).pipe(res);
});
let browser,url;
const pass=name=>console.log('PASS '+name);
const load=page=>page.evaluate(async()=>{ window.storeAPI=await import('/bamung-store.js'); });
const read=page=>page.evaluate(()=>storeAPI.readTank());
const deco=async page=>(await read(page)).pets[0].deco;
const patch=(page,kind)=>page.evaluate(async kind=>{
  const next=structuredClone(window.start);
  const d=next.pets[0].deco;
  if(kind==='hat') d.hat={c:'#ff0000',on:true};
  if(kind==='polish') d.polish={L:{c:'#0000ff',s:'solid'}};
  return storeAPI.persistChanges(storeAPI.sceneChanges(window.start,next));
},kind);
async function openPair(fallback=false){
  const ctx=await browser.newContext({viewport:{width:900,height:650},deviceScaleFactor:1});
  if(fallback) await ctx.addInitScript(()=>Object.defineProperty(navigator,'locks',{value:undefined}));
  await ctx.route('https://cdn.jsdelivr.net/npm/three@0.170.0/**',route=>{
    const relative=route.request().url().split('three@0.170.0/')[1];
    const standard=path.join(three,relative);
    const flat=path.join(three,relative.replace(/^(build\/|examples\/jsm\/)/,''));
    return route.fulfill({path:fs.existsSync(standard)?standard:flat,contentType:'text/javascript',headers:{'access-control-allow-origin':'*'}});
  });
  await ctx.route(/https:\/\/(fonts\.|cdn\.jsdelivr\.net\/gh\/)/,r=>r.abort());
  const a=await ctx.newPage(), b=await ctx.newPage();
  for(const p of [a,b]){ p.setDefaultTimeout(20000); await p.goto(url+'/probe'); await load(p); }
  return {a,b,ctx};
}
async function storeScenarios(){
  for(const fallback of original?[false]:[false,true]){
    const {a,b,ctx}=await openPair(fallback);
    try{
      const backend=fallback?'IndexedDB':'Web Locks';
      assert.equal(await a.evaluate(()=>!!navigator.locks),!fallback);
      for(const order of [['hat','polish'],['polish','hat']]){
        await a.evaluate(async()=>{localStorage.clear(); await storeAPI.admitResident('먼지');});
        for(const p of [a,b]) await p.evaluate(()=>{window.start=storeAPI.readTank();});
        await patch(a,order[0]); await patch(b,order[1]);
        await b.reload(); await load(b);
        const saved=await deco(b);
        const expected=original?[order[1]]:['hat','polish'];
        assert.deepEqual(Object.keys(saved).sort(),expected);
        pass(backend+' '+order.join(' → ')+' / 새로고침 '+Object.keys(saved).join(', '));
      }
      if(original) continue;
      if(!fallback){
        // Queue two different values at the same millisecond while a third document holds the lock.
        const observer=await ctx.newPage();
        await observer.goto(url+'/probe'); await load(observer);
        await observer.evaluate(async()=>{
          await new Promise(ready=>navigator.locks.request(storeAPI.TANK_KEY,()=>new Promise(release=>{window.unlock=release;ready();})));
        });
        await Promise.all([a,b].map((p,i)=>p.evaluate(color=>{
          const before=storeAPI.readTank(), after=structuredClone(before);
          after.pets[0].deco.hat={c:color,on:true};
          const now=Date.now;
          try{
            Date.now=()=>1800000000000;
            window.queued=storeAPI.persistChanges(storeAPI.sceneChanges(before,after));
          }finally{Date.now=now;}
        },i?'#5555aa':'#aa5555')));
        const winner=await observer.evaluate(()=>{
          const entries=Object.keys(localStorage).filter(k=>k.includes('deco-pending/')).sort();
          if(entries.length!==2) throw Error('expected two pending entries');
          return JSON.parse(localStorage.getItem(entries[1])).pets[0].deco.slots.find(([key])=>key==='hat')[1].c;
        });
        assert.equal((await deco(observer)).hat.c,winner);
        await observer.evaluate(()=>unlock());
        await Promise.all([a,b].map(p=>p.evaluate(()=>queued)));
        assert.equal((await deco(b)).hat.c,winner);
        await observer.close();
        pass('같은 밀리초에 같은 모자를 저장해도 대기 중·확정 후 승자가 일치');
      }
      await a.evaluate(async()=>{localStorage.clear(); for(let i=0;i<29;i++) await storeAPI.admitResident('');});
      const last=await Promise.all([a,b].map((p,i)=>p.evaluate(n=>storeAPI.admitResident(n),'검증'+i)));
      const pets=(await read(a)).pets;
      assert.equal(last.filter(Boolean).length,1); assert.equal(pets.length,30); assert.equal(new Set(pets.map(p=>p.no)).size,30);
      pass(backend+' 동시 입주 2건 중 1건 승인, 최종 30마리');
      if(fallback) continue;
      await a.evaluate(async()=>{
        localStorage.clear(); await storeAPI.admitResident('잠금검증');
        window.start=storeAPI.readTank();
        window.hold=new Promise(ready=>navigator.locks.request(storeAPI.TANK_KEY,()=>new Promise(release=>{window.release=release;ready();})));
      });
      await b.evaluate(()=>{window.start=storeAPI.readTank();});
      await b.evaluate(()=>{
        const next=structuredClone(start); next.pets[0].deco.hat={on:true,c:'red'};
        storeAPI.persistChanges(storeAPI.sceneChanges(start,next));
      });
      assert.equal(await a.evaluate(()=>JSON.parse(localStorage.getItem(storeAPI.TANK_KEY)).pets[0].deco.hat),undefined);
      await b.close(); assert.equal((await deco(a)).hat.c,'red');
      await a.evaluate(async()=>{release();await storeAPI.admitResident('다음');});
      assert.equal((await deco(a)).hat.c,'red');
      assert.equal(await a.evaluate(()=>Object.keys(localStorage).filter(k=>k.includes('pending/')).length),0);
      pass('잠금 대기 중 탭 종료, 다른 탭에서 복구 후 대기 기록 정리');
    }finally{await ctx.close();}
  }
}
async function commitBothInSalon(){
  const {a,b,ctx}=await openPair();
  try{
    await a.evaluate(async()=>{await storeAPI.admitResident('두탭');});
    for(const p of [a,b]){
      await p.goto(url+'/bamung.html',{waitUntil:'domcontentloaded'});
      await p.waitForFunction(()=>window.Bamung?.count().total===1);
      await p.evaluate(()=>Bamung.pause());
      await p.locator('[data-a="deco"]').click();
    }
    await a.locator('[data-t="hat"]').click();
    const hat=a.locator('#decoBody .sw').first().locator('button').first();
    const color=await hat.getAttribute('aria-label');
    await hat.click();
    await b.locator('#decoBody button').filter({hasText:'전체 바르기'}).click();
    await a.locator('[data-a="decoDone"]').click();
    await b.locator('[data-a="decoDone"]').click();
    await b.reload({waitUntil:'domcontentloaded'});
    await b.waitForFunction(()=>!!window.Bamung?.count().total);
    const appearance=await b.evaluate(()=>Bamung._debug.world.pets[0].rec.deco);
    assert.deepEqual(Object.keys(appearance.polish).sort(),['L','P','R']);
    assert.equal(appearance.hat?.c,original?undefined:color);
    pass('두 3D 화면에서 모자·매니큐어를 각각 완료 후 재접속 / '+(original?'모자 유실 재현':'둘 다 보존'));
  }finally{await ctx.close();}
}
async function uiScenarios(){
  const {a,b,ctx}=await openPair();
  const errors=[];
  for(const p of [a,b]) p.on('pageerror',e=>errors.push(e.message));
  try{
    await a.evaluate(()=>{
      const rec=storeAPI.makeResident([],1,'단추');
      const old={k:'heart',p:[0,.14,-.22],n:[0,1,0],r:0,s:.24};
      rec.deco={stickers:[old,old]}; rec.greeted=1;
      localStorage.setItem('roach_pets_v1',JSON.stringify({pets:[rec],nextNo:2,props:[],fallen:[]}));
    });
    for(const p of [a,b]){
      await p.goto(url+'/bamung.html',{waitUntil:'domcontentloaded'});
      await p.waitForFunction(()=>window.Bamung?.count().total===1 && !document.querySelector('#err').textContent,null,{timeout:60000});
      await p.evaluate(()=>Bamung.pause());
      await load(p);
      await p.locator('[data-a="deco"]').click();
      await p.waitForFunction(()=>document.body.classList.contains('deco'));
    }
    pass('v1 입주자와 ID 없는 동일 스티커 2장을 두 3D 화면에서 불러옴');
    await a.locator('[data-t="hat"]').click();
    const hat=a.locator('#decoBody .sw').first().locator('button').first();
    const color=await hat.getAttribute('aria-label');
    await hat.click();
    const polish=b.locator('#decoBody button').filter({hasText:'전체 바르기'});
    await polish.click();
    await b.locator('[data-a="decoDone"]').click();
    await a.waitForFunction(()=>!!Bamung._debug.deco.pet.rec.deco.polish?.P);
    assert.equal(await a.evaluate(()=>Bamung._debug.deco.pet.rec.deco.hat.c),color);
    await a.locator('[data-a="undo"]').click();
    await a.locator('[data-a="decoDone"]').click();
    let saved=await deco(a);
    assert.equal(saved.hat,undefined); assert.deepEqual(Object.keys(saved.polish).sort(),['L','P','R']); assert.equal(saved.stickers.length,2);
    pass('모자 착용 뒤 다른 탭의 전체 매니큐어 도착, 되돌리기로 모자만 해제');
    await a.locator('[data-a="deco"]').click();
    await a.locator('[data-t="hat"]').click();
    await hat.click();
    await a.locator('[data-a="decoDone"]').click();
    await b.waitForFunction(()=>!!Bamung._debug.world.pets[0].m.hat);
    await b.locator('[data-a="deco"]').click();
    await b.locator('[data-t="hat"]').click();
    await b.locator('#decoBody button').filter({hasText:'모자 벗기기'}).click();
    await b.locator('[data-a="undo"]').click();
    assert.equal(await b.evaluate(()=>Bamung._debug.deco.pet.rec.deco.hat.c),color);
    await b.locator('#decoBody button').filter({hasText:'모자 벗기기'}).click();
    await b.locator('[data-a="decoDone"]').click();
    await a.waitForFunction(()=>!Bamung._debug.world.pets[0].m.hat);
    saved=await deco(a); assert.equal(saved.hat,undefined); assert.equal(saved.stickers.length,2); assert.ok(saved.polish.P);
    pass('모자 벗기기 → 되돌려 재착용 → 다시 벗기기, 상대 탭 3D 모자도 사라짐');
    for(const p of [a,b]){
      await p.locator('[data-a="deco"]').click();
      await p.locator('[data-t="sticker"]').click();
      // Use the actual model's body centre to hit the 3D canvas, even with a different viewport.
      const point=await p.evaluate(()=>{
        const d=Bamung._debug;
        d.tick(2);
        d.draw();
        const m=d.deco.pet.m, v=m.body.localToWorld(m.body.geometry.boundingSphere.center.clone());
        return d.screenAt(v.x,v.y,v.z);
      });
      await p.mouse.click(point.x,point.y);
      assert.equal(await p.evaluate(()=>Bamung._debug.deco.pet.rec.deco.stickers.length),3);
    }
    const idA=await a.evaluate(()=>Bamung._debug.deco.pet.rec.deco.stickers.at(-1).id);
    const idB=await b.evaluate(()=>Bamung._debug.deco.pet.rec.deco.stickers.at(-1).id);
    assert.ok(idA&&idB); assert.notEqual(idA,idB);
    await b.locator('[data-a="decoDone"]').click();
    await a.waitForFunction(()=>Bamung._debug.deco.pet.rec.deco.stickers.length===4);
    await a.locator('[data-a="undo"]').click();
    await a.locator('[data-a="decoDone"]').click();
    await a.reload({waitUntil:'domcontentloaded'});
    await a.waitForFunction(()=>!!window.Bamung?.count().total);
    await load(a);
    saved=await deco(a);
    assert.deepEqual(saved.stickers.map(s=>s.id??null),[null,null,idB]);
    assert.ok(saved.polish.L); assert.equal(saved.hat,undefined);
    assert.equal(await a.evaluate(()=>Bamung._debug.world.pets[0].rec.deco.stickers.length),3);
    pass('두 탭의 실제 캔버스에 스티커 부착, 한쪽 되돌리기·재접속 후 기존 2장과 상대 탭 1장 보존');
    await a.evaluate(()=>Bamung.pause());
    await a.locator('[data-a="deco"]').click();
    await a.locator('[data-t="text"]').click();
    const draft=a.locator('#decoBody input');
    await draft.fill('단추별');
    await b.locator('[data-a="deco"]').click();
    await b.locator('[data-t="hat"]').click();
    await b.locator('#decoBody .sw').first().locator('button').first().click();
    await b.locator('[data-a="decoDone"]').click();
    await a.waitForFunction(()=>!!Bamung._debug.deco.pet.rec.deco.hat);
    assert.equal(await draft.inputValue(),'단추별');
    await a.locator('#decoBody button').filter({hasText:'쓰기'}).click();
    await a.locator('[data-a="decoDone"]').click();
    assert.equal((await deco(a)).text.t,'단추별'); assert.ok((await deco(a)).hat);
    pass('다른 탭의 모자 변경 중 입력 중이던 글씨 유지 및 저장');
    assert.deepEqual(errors,[]);
    pass('3D 시나리오 미처리 자바스크립트 오류 0건');
  }finally{await ctx.close();}
}
(async()=>{
  await new Promise(r=>server.listen(0,'127.0.0.1',r));
  url='http://127.0.0.1:'+server.address().port;
  try{
    browser=await chromium.launch({headless:true,executablePath:process.env.CHROME_BIN||undefined,
      args:['--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader','--disable-dev-shm-usage']});
    console.log('Chromium '+browser.version()+' / '+(original?'original':'patched'));
    await storeScenarios();
    await commitBothInSalon();
    if(!original) await uiScenarios();
  }finally{if(browser) await browser.close();server.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
