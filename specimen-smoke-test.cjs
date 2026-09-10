const puppeteer=require('puppeteer-core');

(async()=>{
  const chrome=process.env.CHROME_BIN;
  if(!chrome)throw new Error('CHROME_BIN is not set');
  const errors=[];
  const browser=await puppeteer.launch({
    executablePath:chrome,
    headless:true,
    args:['--no-sandbox','--disable-dev-shm-usage','--use-gl=swiftshader','--enable-webgl','--ignore-gpu-blocklist']
  });
  try{
    const page=await browser.newPage();
    await page.setViewport({width:430,height:900,deviceScaleFactor:1});
    page.on('pageerror',e=>errors.push(`pageerror: ${e.stack||e.message}`));
    page.on('response',r=>{if(r.status()>=400&&!r.url().endsWith('/favicon.ico'))errors.push(`response ${r.status()}: ${r.url()}`)});
    page.on('requestfailed',r=>{if(!r.url().endsWith('/favicon.ico'))errors.push(`request: ${r.url()} :: ${r.failure()?.errorText||'failed'}`)});
    await page.goto('http://127.0.0.1:8765/specimen.html',{waitUntil:'networkidle0',timeout:60000});
    await page.waitForFunction(()=>window.__specimenApp&&window.__specimenThree,{timeout:20000});
    await page.click('#startBtn');
    await new Promise(r=>setTimeout(r,1800));
    const initial=await page.evaluate(()=>{
      const app=window.__specimenApp,THREE=window.__specimenThree;
      const box=new THREE.Box3().setFromObject(app.specimen.root),size=new THREE.Vector3();box.getSize(size);
      return {
        parts:app.specimen.parts.size,
        selectable:app.specimen.selectables.length,
        renderCalls:app.workbench.renderer.info.render.calls,
        size:{x:size.x,y:size.y,z:size.z},
        state:app.specimen.lifeState(),
        mobility:app.specimen.vitals.mobility
      };
    });
    if(initial.parts<120)throw new Error(`part graph too small: ${initial.parts}`);
    if(initial.selectable<120)throw new Error(`selectable graph too small: ${initial.selectable}`);
    if(initial.renderCalls<1)throw new Error('renderer did not draw');
    if(initial.size.x>4.2||initial.size.z>4.2)throw new Error(`model bounds exploded: ${JSON.stringify(initial.size)}`);

    const changed=await page.evaluate(()=>{
      const app=window.__specimenApp,THREE=window.__specimenThree,s=app.specimen;
      const pron=s.parts.get('pronotum'),wp=pron.group.getWorldPosition(new THREE.Vector3());
      s.addPin(pron,wp);
      s.addPuncture(pron,wp,new THREE.Vector3(0,1,0),.48);
      s.applyShock(pron,wp);
      const tib=s.parts.get('RF_tibia');
      const cut=s.midCut(tib,.52,'clipper');
      app.ui.refresh();
      return {pins:s.pins.length,puncture:pron.puncture,shock:s.vitals.shock,cut,detached:s.detachedCount,life:s.lifeState()};
    });
    if(changed.pins!==1||changed.puncture<=0||changed.shock<=0||!changed.cut||changed.detached<1){
      throw new Error(`state mutation failed: ${JSON.stringify(changed)}`);
    }
    await new Promise(r=>setTimeout(r,700));
    await page.screenshot({path:'specimen-ci.png',fullPage:true});
    if(errors.length)throw new Error(errors.join('\n'));
    console.log(JSON.stringify({initial,changed},null,2));
  }finally{
    await browser.close();
  }
})().catch(err=>{console.error(err);process.exit(1)});
