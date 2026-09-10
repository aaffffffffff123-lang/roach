function openSpecimen(index){
  if(index<0||index>=roaches.length)return;const r=roaches.splice(index,1)[0];
  specimen={src:r,bodyCuts:0,bodyMass:1,center:{x:W/2,y:H/2},angle:0,parts:makeSpecimenParts(),loose:[],dragPart:null,cutLines:[],stains:[]};
  $('#detailButtons').classList.add('show');$('#actions').style.display='none';setTool('tweezer');toast('한 마리를 접사 작업대로 옮겼다');updateStats();
}
function makeSpecimenParts(){const p=[];for(const s of [-1,1])for(let i=0;i<3;i++)p.push({type:'leg',side:s,i,attached:true,ox:0,oy:0,a:0,mass:.055});for(const s of [-1,1])p.push({type:'antenna',side:s,i:0,attached:true,ox:0,oy:0,a:0,mass:.02});for(const s of [-1,1])p.push({type:'wing',side:s,i:0,attached:true,ox:0,oy:0,a:0,mass:.11});return p}
function specimenScale(){return clamp(Math.min(detailRect.w,detailRect.h)/330,1.1,2.35)}
function partGeometry(part){
  const S=specimenScale(),cx=W/2,cy=H/2;
  if(part.type==='leg'){const by=cy+(-42+part.i*42)*S,bx=cx+part.side*34*S,ex=cx+part.side*(95+part.i*12)*S,ey=by+(part.i-1)*25*S;return {bx,by,ex:part.attached?ex:part.ox,ey:part.attached?ey:part.oy,hit:18*S}}
  if(part.type==='antenna'){const bx=cx+part.side*14*S,by=cy-96*S,ex=cx+part.side*88*S,ey=cy-162*S;return {bx,by,ex:part.attached?ex:part.ox,ey:part.attached?ey:part.oy,hit:16*S}}
  if(part.type==='wing'){const bx=cx+part.side*12*S,by=cy-12*S,ex=cx+part.side*36*S,ey=cy+50*S;return {bx,by,ex:part.attached?ex:part.ox,ey:part.attached?ey:part.oy,hit:24*S}}
}
function drawSpecimen(){
  ctx.save();ctx.fillStyle='rgba(32,18,8,.62)';ctx.fillRect(0,0,W,H);roundRect(ctx,detailRect.x,detailRect.y,detailRect.w,detailRect.h,28);const g=ctx.createRadialGradient(W/2,H/2,10,W/2,H/2,Math.max(detailRect.w,detailRect.h)*.65);g.addColorStop(0,'#fffdf4');g.addColorStop(1,'#dcd5c2');ctx.fillStyle=g;ctx.fill();ctx.lineWidth=7;ctx.strokeStyle='#8d8a82';ctx.stroke();ctx.fillStyle='rgba(56,38,24,.62)';ctx.font='700 12px '+getComputedStyle(document.body).fontFamily;ctx.fillText('접사 해체 작업대',detailRect.x+18,detailRect.y+25);
  for(const st of specimen.stains){ctx.fillStyle=st.dark?'rgba(74,40,19,.7)':'rgba(226,211,157,.74)';ctx.beginPath();ctx.ellipse(st.x,st.y,st.rx,st.ry,st.a,0,TAU);ctx.fill()}
  const S=specimenScale(),cx=W/2,cy=H/2;ctx.lineCap='round';
  for(const p of specimen.parts){const d=partGeometry(p);if(p.type==='wing'&&p.attached)continue;ctx.strokeStyle='#261208';ctx.lineWidth=p.type==='antenna'?2*S:4*S;ctx.beginPath();ctx.moveTo(d.bx,d.by);if(p.attached)ctx.quadraticCurveTo((d.bx+d.ex)/2+p.side*18*S,(d.by+d.ey)/2,d.ex,d.ey);else{ctx.moveTo(p.ox-p.side*24*S,p.oy);ctx.lineTo(p.ox,p.oy)}ctx.stroke()}
  ctx.save();ctx.translate(cx,cy);const cut=specimen.bodyCuts;
  for(let i=0;i<4;i++){const y=(-10+i*34+(i>cut?0:i*cut*2))*S,w=(38-i*4)*S,h=30*S,bg=ctx.createLinearGradient(-w,0,w,0);bg.addColorStop(0,'#2a1408');bg.addColorStop(.5,'#70431a');bg.addColorStop(1,'#2a1408');ctx.fillStyle=bg;ctx.beginPath();ctx.ellipse(0,y,w,h*.62,0,0,TAU);ctx.fill();ctx.strokeStyle='#261208';ctx.lineWidth=2*S;ctx.beginPath();ctx.moveTo(-w*.72,y+h*.34);ctx.lineTo(w*.72,y+h*.34);ctx.stroke()}
  ctx.fillStyle='#2d1609';ctx.beginPath();ctx.ellipse(0,-78*S,29*S,25*S,0,0,TAU);ctx.fill();ctx.fillStyle='#7b5428';ctx.beginPath();ctx.ellipse(0,-49*S,41*S,27*S,0,0,TAU);ctx.fill();ctx.strokeStyle='#211006';ctx.lineWidth=2*S;ctx.beginPath();ctx.moveTo(0,-70*S);ctx.lineTo(0,78*S);ctx.stroke();
  for(const p of specimen.parts.filter(q=>q.type==='wing'&&q.attached)){ctx.save();ctx.scale(p.side,1);ctx.fillStyle='rgba(91,54,19,.82)';ctx.beginPath();ctx.ellipse(18*S,9*S,23*S,73*S,-.16,0,TAU);ctx.fill();ctx.strokeStyle='rgba(25,12,4,.6)';ctx.lineWidth=1.4*S;ctx.stroke();ctx.restore()}ctx.restore();
  for(const p of specimen.loose){ctx.save();ctx.translate(p.x,p.y);ctx.rotate(p.a);ctx.fillStyle=p.cream?'#eadca6':'#3d2718';if(p.type==='segment'){ctx.beginPath();ctx.ellipse(0,0,22*S,11*S,0,0,TAU);ctx.fill()}else ctx.fillRect(-18*S,-2*S,36*S,4*S);ctx.restore()}
  if(specimen.dragPart){const d=partGeometry(specimen.dragPart);ctx.strokeStyle='rgba(127,38,27,.8)';ctx.lineWidth=3;ctx.beginPath();ctx.arc(d.ex,d.ey,14,0,TAU);ctx.stroke()}
  if(pointer.down&&tool==='snips'){ctx.strokeStyle='rgba(127,38,27,.72)';ctx.lineWidth=3;ctx.setLineDash([8,6]);ctx.beginPath();ctx.moveTo(pointer.startX,pointer.startY);ctx.lineTo(pointer.x,pointer.y);ctx.stroke();ctx.setLineDash([])}
  drawToolFx();ctx.restore();
}
function findSpecimenPart(x,y,types=null){let best=null,bd=Infinity;for(const p of specimen.parts){if(types&&!types.includes(p.type))continue;const d=partGeometry(p),dd=dist(x,y,d.ex,d.ey);if(dd<d.hit&&dd<bd){bd=dd;best=p}}return best}
function specimenBodyHit(x,y){const S=specimenScale();return Math.abs(x-W/2)<48*S&&y>H/2-110*S&&y<H/2+100*S}
function detachPart(p,x,y,method='pluck'){
  if(!p.attached)return;p.attached=false;p.ox=x;p.oy=y;p.a=rand(TAU);specimen.loose.push({type:p.type,x,y,a:rand(TAU),mass:p.mass,cream:false});const d=partGeometry(p);specimen.stains.push({x:d.bx,y:d.by,rx:rand(3,7),ry:rand(2,5),a:rand(TAU),dark:Math.random()<.35});spawnParticles(x,y,8,.3,.5);method==='clip'?SFX.clip():SFX.pluck();shake=Math.max(shake,.18);
}
function clipAt(x,y){
  const p=findSpecimenPart(x,y,['leg','antenna','wing']);if(p){detachPart(p,x,y,'clip');toolFx.push({type:'clipper',x,y,t:0});return}
  if(specimenBodyHit(x,y)){specimen.bodyCuts=Math.min(4,specimen.bodyCuts+1);specimen.bodyMass=Math.max(.25,specimen.bodyMass-.16);specimen.loose.push({type:'segment',x:x+rand(-18,18),y:y+rand(-10,10),a:rand(TAU),mass:.16,cream:Math.random()<.25});specimen.stains.push({x,y,rx:rand(8,16),ry:rand(4,9),a:rand(TAU),dark:Math.random()<.35});spawnParticles(x,y,11,.4,.6);SFX.clip();toolFx.push({type:'clipper',x,y,t:0});shake=.25}
}
function segmentIntersectRect(x1,y1,x2,y2,r){const steps=24;for(let i=0;i<=steps;i++){const t=i/steps,x=lerp(x1,x2,t),y=lerp(y1,y2,t);if(pointInRect(x,y,r))return {x,y}}return null}
function snipLine(x1,y1,x2,y2){
  const S=specimenScale(),r={x:W/2-48*S,y:H/2-80*S,w:96*S,h:170*S},p=segmentIntersectRect(x1,y1,x2,y2,r);if(!p)return;specimen.bodyCuts=Math.min(4,specimen.bodyCuts+1);specimen.bodyMass=Math.max(.18,specimen.bodyMass-.18);specimen.loose.push({type:'segment',x:p.x+rand(-26,26),y:p.y+rand(-18,18),a:rand(TAU),mass:.18,cream:Math.random()<.3});specimen.stains.push({x:p.x,y:p.y,rx:rand(12,22),ry:rand(4,9),a:Math.atan2(y2-y1,x2-x1),dark:Math.random()<.4});spawnParticles(p.x,p.y,14,.45,.55);SFX.snip();toolFx.push({type:'snips',x:p.x,y:p.y,t:0,a:Math.atan2(y2-y1,x2-x1)});shake=.3;
}
function updateSpecimen(dt){for(const p of specimen.loose)p.a+=dt*.6}
function detailMass(){if(!specimen)return 0;const loose=specimen.loose.reduce((a,b)=>a+b.mass,0),attached=specimen.parts.filter(p=>p.attached).reduce((a,b)=>a+b.mass,0);return specimen.bodyMass+loose+attached}
function closeSpecimen(toPress=false){
  if(!specimen)return;const m=detailMass();if(toPress){addMassToChamber(m);SFX.dump(m);toast(`${m.toFixed(1)}마리분 조각을 통에 털었다`)}else{corpses.push({x:tray.x+tray.w*.5,y:tray.y+tray.h*.48,a:rand(TAU),stage:clamp(1+specimen.bodyCuts,1,3),mass:m,seed:rand(1000),pieces:12});makeSplat(tray.x+tray.w*.5,tray.y+tray.h*.48,2,.65)}specimen=null;selectedPart=null;$('#detailButtons').classList.remove('show');$('#actions').style.display='';setTool(toPress?'press':'scraper');updateStats();
}
