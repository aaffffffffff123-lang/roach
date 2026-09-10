const puppeteer=require('puppeteer-core');

(async()=>{
  const messages=[];
  const failedScripts=[];
  const browser=await puppeteer.launch({
    executablePath:process.env.CHROME_BIN,
    headless:true,
    args:['--no-sandbox','--disable-dev-shm-usage','--use-gl=swiftshader','--enable-webgl','--ignore-gpu-blocklist']
  });
  try{
    const page=await browser.newPage();
    await page.setViewport({width:430,height:900,deviceScaleFactor:1});
    const cdp=await page.target().createCDPSession();
    await cdp.send('Runtime.enable');
    await cdp.send('Debugger.enable');
    cdp.on('Debugger.scriptFailedToParse',e=>failedScripts.push({
      url:e.url,
      startLine:e.startLine,
      startColumn:e.startColumn,
      endLine:e.endLine,
      endColumn:e.endColumn,
      executionContextId:e.executionContextId,
      hash:e.hash
    }));
    cdp.on('Runtime.exceptionThrown',e=>{
      const d=e.exceptionDetails||{};
      messages.push({
        type:'exception',
        text:d.text,
        url:d.url,
        lineNumber:d.lineNumber,
        columnNumber:d.columnNumber,
        exception:d.exception&&{
          className:d.exception.className,
          description:d.exception.description,
          value:d.exception.value
        },
        stackTrace:d.stackTrace
      });
    });
    page.on('pageerror',e=>messages.push({type:'pageerror',message:e.message,stack:e.stack}));
    page.on('console',m=>{if(m.type()==='error')messages.push({type:'console',text:m.text()})});
    page.on('requestfailed',r=>messages.push({type:'requestfailed',url:r.url(),error:r.failure()?.errorText||''}));
    await page.goto('http://127.0.0.1:8765/specimen.html',{waitUntil:'networkidle0',timeout:60000});
    await new Promise(r=>setTimeout(r,1800));
    const imports=await page.evaluate(async()=>{
      const files=['specimen-core.js','specimen-anatomy.js','specimen-tools.js','specimen-main.js'];
      const out={};
      for(const file of files){
        try{
          await import(`./${file}?diagnostic=${Date.now()}-${Math.random()}`);
          out[file]={ok:true};
        }catch(e){
          out[file]={ok:false,name:e?.name,message:e?.message,stack:e?.stack};
        }
      }
      return out;
    });
    const state=await page.evaluate(()=>({
      three:typeof window.__specimenThree,
      app:typeof window.__specimenApp,
      ready:document.readyState
    }));
    console.log(JSON.stringify({state,imports,failedScripts,messages},null,2));
    if(state.app!=='object')process.exitCode=1;
  }finally{
    await browser.close();
  }
})().catch(e=>{console.error(e.stack||e);process.exit(1)});
