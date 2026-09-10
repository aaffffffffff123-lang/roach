const puppeteer=require('puppeteer-core');
(async()=>{
  const messages=[];
  const browser=await puppeteer.launch({
    executablePath:process.env.CHROME_BIN,
    headless:true,
    args:['--no-sandbox','--disable-dev-shm-usage','--use-gl=swiftshader','--enable-webgl','--ignore-gpu-blocklist']
  });
  try{
    const page=await browser.newPage();
    await page.setViewport({width:430,height:900,deviceScaleFactor:1});
    page.on('pageerror',e=>messages.push('PAGE '+String(e)));
    page.on('console',m=>messages.push('CONSOLE '+m.type()+' '+m.text()));
    page.on('requestfailed',r=>messages.push('REQUEST '+r.url()+' '+(r.failure()?.errorText||'')));
    await page.goto('http://127.0.0.1:8765/specimen.html',{waitUntil:'networkidle0',timeout:60000});
    await new Promise(r=>setTimeout(r,5000));
    const state=await page.evaluate(()=>({
      three:typeof window.__specimenThree,
      app:typeof window.__specimenApp,
      ready:document.readyState,
      scripts:[...document.scripts].map(s=>({src:s.src,type:s.type}))
    }));
    console.log(JSON.stringify({state,messages},null,2));
    if(state.app!=='object')process.exitCode=1;
  }finally{await browser.close()}
})().catch(e=>{console.error(e);process.exit(1)});
