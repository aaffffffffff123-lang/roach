function updateToolFx(dt){for(let i=toolFx.length-1;i>=0;i--){toolFx[i].t+=dt;if(toolFx[i].t>.35)toolFx.splice(i,1)}}
function drawToolFx(){
  for(const f of toolFx){const k=clamp(f.t/.18,0,1),fade=1-clamp((f.t-.2)/.15,0,1);ctx.save();ctx.translate(f.x,f.y);ctx.globalAlpha=fade;
    if(f.type==='clipper'){ctx.rotate(-.7+k*.45);ctx.strokeStyle='#6e7376';ctx.lineWidth=8;ctx.lineCap='round';ctx.beginPath();ctx.moveTo(-34,-22);ctx.lineTo(2,-2);ctx.lineTo(-34,18);ctx.stroke();ctx.strokeStyle='#d5d8d9';ctx.lineWidth=3;ctx.beginPath();ctx.moveTo(-7,-4);ctx.lineTo(10,0);ctx.lineTo(-7,4);ctx.stroke()}
    else{ctx.rotate(f.a||0);ctx.strokeStyle='#7c8083';ctx.lineWidth=5;ctx.beginPath();ctx.moveTo(-44,-18);ctx.lineTo(8,0);ctx.lineTo(-44,18);ctx.stroke();ctx.strokeStyle='#e1e3e4';ctx.lineWidth=2;ctx.beginPath();ctx.moveTo(-42,-16);ctx.lineTo(8,0);ctx.lineTo(-42,16);ctx.stroke()}
    ctx.restore();
  }
}
function handleDown(x,y){
  SFX.ensure();pointer.down=true;pointer.x=pointer.px=pointer.startX=x;pointer.y=pointer.py=pointer.startY=y;pointer.moved=0;
  if(specimen){if(tool==='tweezer'){const p=findSpecimenPart(x,y,['leg','antenna','wing']);if(p){specimen.dragPart=p;selectedPart=p}}else if(tool==='clipper')clipAt(x,y);return}
  if(tool==='bait'){placeBait(x,y);return}
  if(tool==='pan'){if(pointInRect(x,y,tray))startPan(x,y);return}
  if(tool==='scraper'){scraper.drag=true;scraper.x=scraper.lastX=x;scraper.y=scraper.lastY=y;scraper.a=0;scraperHit(x,y,1,0);return}
  if(tool==='tweezer'){const i=findRoachAt(x,y);if(i>=0)openSpecimen(i);else toast('살아 있는 한 마리를 정확히 집어라');return}
  if(tool==='press'){startPressDrag(x,y);return}
}
function handleMove(x,y){
  hover.x=x;hover.y=y;hover.live=true;if(!pointer.down)return;const dx=x-pointer.x,dy=y-pointer.y;pointer.px=pointer.x;pointer.py=pointer.y;pointer.x=x;pointer.y=y;pointer.moved+=Math.hypot(dx,dy);
  if(specimen){if(tool==='tweezer'&&specimen.dragPart){const p=specimen.dragPart,d=partGeometry(p);p.ox=x;p.oy=y;if(p.attached&&dist(x,y,d.bx,d.by)>95*specimenScale())detachPart(p,x,y,'pluck')}return}
  if(tool==='scraper'&&scraper.drag){scraperHit(x,y,x-scraper.lastX,y-scraper.lastY);scraper.lastX=x;scraper.lastY=y;return}
  if(tool==='press'&&press.drag){setPressFromY(y);return}
}
function handleUp(x,y){
  if(!pointer.down)return;pointer.x=x;pointer.y=y;
  if(specimen){if(tool==='tweezer')specimen.dragPart=null;if(tool==='snips'&&pointer.moved>16)snipLine(pointer.startX,pointer.startY,x,y)}
  else{if(tool==='scraper'&&scraper.drag){scraper.x=x;scraper.y=y;depositScraper();scraper.drag=false}if(tool==='press')press.drag=false}
  pointer.down=false;pointer.id=null;
}
C.addEventListener('pointerdown',e=>{e.preventDefault();pointer.id=e.pointerId;try{C.setPointerCapture(e.pointerId)}catch{}handleDown(e.clientX,e.clientY)});
C.addEventListener('pointermove',e=>{if(pointer.id!==null&&e.pointerId!==pointer.id&&pointer.down)return;handleMove(e.clientX,e.clientY)});
C.addEventListener('pointerup',e=>{if(pointer.id!==null&&e.pointerId!==pointer.id)return;handleUp(e.clientX,e.clientY)});
C.addEventListener('pointercancel',e=>handleUp(e.clientX,e.clientY));
C.addEventListener('pointerleave',()=>{hover.live=false});
function setTool(k){
  if(specimen&&!['tweezer','clipper','snips'].includes(k)){toast('접사 작업대에서는 핀셋·손톱깎이·쪽가위만 쓴다');return}
  tool=k;$$('.tool').forEach(b=>b.classList.toggle('sel',b.dataset.tool===k));$$('.tool').forEach(b=>b.classList.toggle('off',!!specimen&&!['tweezer','clipper','snips'].includes(b.dataset.tool)));showHint(HINTS[k]);
}
$$('.tool').forEach(b=>b.addEventListener('pointerdown',e=>{e.stopPropagation();e.preventDefault();SFX.ensure();setTool(b.dataset.tool)}));
$('#spawnBtn').addEventListener('pointerdown',e=>{e.stopPropagation();e.preventDefault();SFX.ensure();spawnRoaches(12);updateStats()});
$('#liveBtn').addEventListener('pointerdown',e=>{e.stopPropagation();e.preventDefault();addLiveToChamber(8)});
$('#resetBtn').addEventListener('pointerdown',e=>{e.stopPropagation();e.preventDefault();SFX.ensure();resetAll()});
$('#backBtn').addEventListener('pointerdown',e=>{e.stopPropagation();e.preventDefault();closeSpecimen(false)});
$('#dumpBtn').addEventListener('pointerdown',e=>{e.stopPropagation();e.preventDefault();closeSpecimen(true)});
$('#startBtn').addEventListener('pointerdown',e=>{e.stopPropagation();e.preventDefault();SFX.ensure();intro=false;$('#intro').classList.add('hide');showHint(HINTS.bait,5)});
function resetAll(){
  roaches.length=0;corpses.length=0;baits.length=0;stains.length=0;particles.length=0;panFx.length=0;toolFx.length=0;scraper.load=0;scraper.drag=false;Object.assign(press,{p:0,target:0,drag:false,cycleReady:true,live:[],chunks:[],looseMass:0,layers:[],fluid:0,cup:0,drips:[],wallStreaks:[],squirts:[],presses:0,crushedThisCycle:0});specimen=null;$('#detailButtons').classList.remove('show');$('#actions').style.display='';for(let i=0;i<22;i++)roaches.push(makeRoach());placeBait(tray.x+tray.w*.52,tray.y+tray.h*.48);setTool('bait');updateStats();toast('작업대를 새로 깔았다');
}
function updateStats(){
  $('#aliveN').textContent=roaches.length+press.live.filter(q=>!q.dead).length;$('#loadN').textContent=scraper.load.toFixed(1);const layerMass=press.layers.reduce((a,b)=>a+b.mass,0);$('#jarN').textContent=(press.looseMass+layerMass+press.live.length).toFixed(1);$('#juiceN').textContent=press.cup.toFixed(1);
}
function showHint(text,dur=3.5){const h=$('#hint');h.textContent=text||'';h.classList.toggle('show',!!text);clearTimeout(hintTimer);if(text)hintTimer=setTimeout(()=>h.classList.remove('show'),dur*1000)}
function toast(text){const t=$('#toast');t.textContent=text;t.classList.add('show');clearTimeout(toastTimer);toastTimer=setTimeout(()=>t.classList.remove('show'),1100)}
function update(dt){if(!specimen)updateRoaches(dt);else updateSpecimen(dt);updateParticles(dt);updatePanFx(dt);updatePress(dt);updateToolFx(dt)}
function draw(){
  ctx.save();if(shake>.001){const a=shake*7;ctx.translate(rand(-a,a),rand(-a,a));shake*=.82}woodBackground();drawTray();drawStains();drawBaits();for(const c of corpses)drawCorpse(c);for(const r of roaches)drawRoach(r);drawParticles();drawPanFx();drawChamber();drawScraper();if(specimen)drawSpecimen();ctx.restore();
}
function frame(){requestAnimationFrame(frame);const t=now(),dt=Math.min(.04,t-lastT);lastT=t;if(t>=freezeUntil)update(dt);draw()}
resize();for(let i=0;i<22;i++)roaches.push(makeRoach());baits.push({x:tray.x+tray.w*.52,y:tray.y+tray.h*.48,a:rand(TAU),t:0});updateStats();showHint(HINTS.bait,8);frame();
window.__squeezer={roaches,corpses,baits,press,scraper,get specimen(){return specimen},setTool,addLiveToChamber,spawnRoaches,resetAll};
