function addMassToChamber(m){
  press.looseMass+=m;const n=Math.min(24,Math.max(1,Math.ceil(m*2)));
  for(let i=0;i<n;i++)press.chunks.push({x:rand(.12,.88),y:rand(.04,.24),a:rand(TAU),s:rand(.5,1.2),cream:Math.random()<.25});
  if(press.chunks.length>90)press.chunks.splice(0,press.chunks.length-90);updateStats();
}
function addLiveToChamber(n=8){
  SFX.ensure();let moved=0;
  while(moved<n){if(roaches.length)roaches.pop();press.live.push({x:rand(.12,.88),y:rand(.04,.85),a:rand(TAU),phase:rand(TAU),spd:rand(.2,.55),threshold:rand(.38,.88),dead:false,seed:rand(1000)});moved++}
  press.cycleReady=true;toast(`${moved}마리를 생으로 투입했다`);updateStats();
}
function chamberInner(){return {x:chamberRect.x+chamberRect.w*.095,y:chamberRect.y+chamberRect.h*.13,w:chamberRect.w*.81,h:chamberRect.h*.70}}
function pressY(){const r=chamberInner();return r.y+press.p*r.h*.86}
function startPressDrag(x,y){if(!pointInRect(x,y,{x:chamberRect.x-20,y:chamberRect.y-30,w:chamberRect.w+40,h:chamberRect.h+45}))return false;press.drag=true;setPressFromY(y);return true}
function setPressFromY(y){const r=chamberInner();press.target=clamp((y-r.y)/(r.h*.86),0,1)}
function updatePress(dt){
  const old=press.p;press.p=press.drag?lerp(press.p,press.target,1-Math.exp(-22*dt)):lerp(press.p,0,1-Math.exp(-5.5*dt));if(Math.abs(press.p-old)>.002)SFX.pressCreak(press.p);const r=chamberInner();
  for(const q of press.live){
    if(q.dead)continue;q.phase+=dt*(15+press.p*32);q.a+=Math.sin(q.phase*.7+q.seed)*dt*(1.2+press.p*4);q.x+=Math.cos(q.a)*q.spd*dt*(1+press.p*2.8);q.y+=Math.sin(q.a)*q.spd*dt*(1+press.p*1.8);q.x=clamp(q.x,.08,.92);q.y=clamp(q.y,.02,.95);
    if(press.p>=q.threshold){q.dead=true;press.crushedThisCycle++;const sx=r.x+q.x*r.w,sy=r.y+r.h*(1-q.y*(1-press.p*.82));spawnParticles(sx,sy,12,clamp(.45+press.p*.5,.5,1),.62);SFX.crunch(rand(0,.018),.45+press.p*.25,clamp((sx-W/2)/(W/2),-.8,.8));press.fluid+=rand(.09,.17);press.wallStreaks.push({side:Math.random()<.5?-1:1,y:rand(.28,.82),len:rand(.12,.38),w:rand(.008,.025),cream:Math.random()<.7});shake=Math.max(shake,.25+press.p*.18)}
  }
  if(press.p>.93&&press.cycleReady&&(press.looseMass>0||press.live.some(q=>q.dead))){
    press.cycleReady=false;const deadMass=press.live.filter(q=>q.dead).length,batch=press.looseMass+deadMass;
    if(batch>0){press.layers.push({mass:batch,tone:rand(.1,.4),seed:rand(1000)});if(press.layers.length>9){const a=press.layers.shift();press.layers[0].mass+=a.mass}press.looseMass=0;press.chunks.length=0;press.live=press.live.filter(q=>!q.dead);const juice=batch*rand(.08,.14)+press.fluid*.35;press.fluid=0;press.cup+=juice;press.presses++;
      for(let i=0;i<Math.min(28,6+Math.floor(batch));i++)press.drips.push({x:rand(.28,.72),y:0,v:rand(.2,.8),life:rand(.4,1.1),t:0,dark:Math.random()<.25});
      for(let i=0;i<Math.min(18,4+Math.floor(batch*.6));i++){const side=Math.random()<.5?-1:1;press.squirts.push({side,y:rand(.38,.78),x:side<0?0:1,vx:side*rand(.4,1.3),vy:rand(-.7,.4),life:rand(.35,.8),t:0,cream:Math.random()<.65})}
      SFX.squirt(clamp(.55+batch*.025,.7,1.35));shake=Math.max(shake,1.1);freezeUntil=now()+.065;toast(`${batch.toFixed(1)}마리분 착즙 완료`);updateStats();
    }
  }
  if(press.p<.18)press.cycleReady=true;
  for(let i=press.drips.length-1;i>=0;i--){const d=press.drips[i];d.t+=dt;d.y+=d.v*dt;d.v+=1.8*dt;if(d.t>d.life)press.drips.splice(i,1)}
  for(let i=press.squirts.length-1;i>=0;i--){const s=press.squirts[i];s.t+=dt;s.x+=s.vx*dt;s.y+=s.vy*dt;s.vy+=1.9*dt;if(s.t>s.life)press.squirts.splice(i,1)}
}
function drawChamberRoach(q,r){const avail=1-press.p*.82,x=r.x+q.x*r.w,y=r.y+r.h-(q.y*avail+.02)*r.h;drawRoach({x,y,a:q.a,phase:q.phase},clamp(r.w/230,.7,1.15),q.dead?.28:1)}
function drawChamber(){
  const R=chamberRect,I=chamberInner(),py=pressY();ctx.save();ctx.fillStyle='rgba(65,43,25,.35)';roundRect(ctx,R.x+8,R.y+12,R.w,R.h,18);ctx.fill();ctx.fillStyle='rgba(232,241,239,.24)';roundRect(ctx,R.x,R.y,R.w,R.h,18);ctx.fill();ctx.lineWidth=5;ctx.strokeStyle='rgba(226,239,237,.82)';ctx.stroke();ctx.lineWidth=2;ctx.strokeStyle='rgba(80,91,89,.65)';roundRect(ctx,R.x+4,R.y+4,R.w-8,R.h-8,15);ctx.stroke();
  ctx.save();roundRect(ctx,I.x,I.y,I.w,I.h,8);ctx.clip();let layerY=I.y+I.h,used=0;
  for(const l of [...press.layers].reverse()){const h=clamp(5+l.mass*1.5,7,I.h*.18);layerY-=h;used+=h;const g=ctx.createLinearGradient(I.x,layerY,I.x+I.w,layerY+h);g.addColorStop(0,'rgba(55,36,24,.92)');g.addColorStop(.55,'rgba(116,87,54,.9)');g.addColorStop(1,'rgba(230,214,161,.82)');ctx.fillStyle=g;ctx.fillRect(I.x,layerY,I.w,h);ctx.strokeStyle='rgba(33,20,12,.55)';ctx.lineWidth=1;for(let i=0;i<Math.min(12,2+Math.floor(l.mass));i++){const x=I.x+((l.seed+i*37)%100)/100*I.w;ctx.beginPath();ctx.moveTo(x,layerY+rand(1,h-1));ctx.lineTo(x+rand(-7,7),layerY+rand(1,h-1));ctx.stroke()}}
  if(press.looseMass>0){const baseY=I.y+I.h-used-4;for(const q of press.chunks){ctx.save();ctx.translate(I.x+q.x*I.w,baseY-q.y*Math.min(I.h*.42,18+press.looseMass*2));ctx.rotate(q.a);ctx.fillStyle=q.cream?'#e6d79f':'#3e2a1d';ctx.beginPath();ctx.ellipse(0,0,7*q.s,3.5*q.s,0,0,TAU);ctx.fill();ctx.restore()}}
  for(const q of press.live)drawChamberRoach(q,I);
  for(const st of press.wallStreaks.slice(-55)){const x=st.side<0?I.x+2:I.x+I.w-2,y=I.y+st.y*I.h;ctx.strokeStyle=st.cream?'rgba(225,211,159,.68)':'rgba(67,38,18,.68)';ctx.lineWidth=Math.max(1,st.w*I.w);ctx.lineCap='round';ctx.beginPath();ctx.moveTo(x,y);ctx.lineTo(x+st.side*-rand(2,10),y+st.len*I.h);ctx.stroke()}
  ctx.restore();
  const plateH=Math.max(12,R.h*.038);ctx.fillStyle='#5d6265';roundRect(ctx,I.x-3,py-plateH/2,I.w+6,plateH,4);ctx.fill();ctx.strokeStyle='#c7ccce';ctx.lineWidth=2;ctx.stroke();ctx.fillStyle='#34383a';for(let x=I.x+10;x<I.x+I.w-6;x+=15){ctx.beginPath();ctx.arc(x,py,2.2,0,TAU);ctx.fill()}
  const screwX=R.x+R.w*.5;ctx.strokeStyle='#64686c';ctx.lineWidth=Math.max(7,R.w*.045);ctx.beginPath();ctx.moveTo(screwX,R.y-25);ctx.lineTo(screwX,py);ctx.stroke();ctx.strokeStyle='rgba(220,224,225,.8)';ctx.lineWidth=1.5;for(let y=R.y-22;y<py;y+=7){ctx.beginPath();ctx.moveTo(screwX-5,y);ctx.lineTo(screwX+5,y+4);ctx.stroke()}
  ctx.save();ctx.translate(screwX,R.y-25);ctx.rotate(press.p*TAU*1.7);ctx.fillStyle='#2f3234';roundRect(ctx,-R.w*.36,-6,R.w*.72,12,6);ctx.fill();ctx.fillStyle='#825432';roundRect(ctx,-R.w*.42,-8,R.w*.12,16,8);ctx.fill();roundRect(ctx,R.w*.30,-8,R.w*.12,16,8);ctx.fill();ctx.restore();
  const nozzleY=R.y+R.h+4,cupW=R.w*.48,cupH=Math.min(86,R.h*.18),cupX=R.x+R.w*.26,cupY=nozzleY+10;ctx.fillStyle='#575c5f';roundRect(ctx,R.x+R.w*.28,nozzleY-8,R.w*.44,13,5);ctx.fill();ctx.strokeStyle='rgba(235,244,242,.78)';ctx.lineWidth=3;roundRect(ctx,cupX,cupY,cupW,cupH,8);ctx.stroke();ctx.fillStyle='rgba(233,241,238,.16)';ctx.fill();const fill=clamp(press.cup/24,0,.94),fy=cupY+cupH*(1-fill);
  if(fill>0){const g=ctx.createLinearGradient(cupX,fy,cupX,cupY+cupH);g.addColorStop(0,'rgba(195,178,117,.78)');g.addColorStop(1,'rgba(71,42,22,.88)');ctx.fillStyle=g;roundRect(ctx,cupX+3,fy,cupW-6,cupY+cupH-fy-3,5);ctx.fill();ctx.fillStyle='rgba(255,250,210,.32)';ctx.fillRect(cupX+6,fy+2,cupW-12,2)}
  for(const d of press.drips){const x=I.x+d.x*I.w,y=nozzleY+d.y*(cupY+cupH-nozzleY);ctx.strokeStyle=d.dark?'rgba(66,38,18,.8)':'rgba(225,211,158,.82)';ctx.lineWidth=d.dark?2:3;ctx.beginPath();ctx.moveTo(x,y-7);ctx.lineTo(x,y+4);ctx.stroke()}
  for(const s of press.squirts){const x=(s.side<0?I.x:I.x+I.w)+s.x*R.w*.12,y=I.y+s.y*I.h;ctx.fillStyle=s.cream?'rgba(233,219,169,.9)':'rgba(75,42,21,.9)';ctx.beginPath();ctx.ellipse(x,y,4,2,Math.atan2(s.vy,s.vx),0,TAU);ctx.fill()}
  ctx.fillStyle='rgba(53,33,19,.74)';ctx.font='800 11px '+getComputedStyle(document.body).fontFamily;ctx.fillText('투명 압착통',R.x+10,R.y+18);if(tool==='press'){ctx.strokeStyle='rgba(127,38,27,.75)';ctx.lineWidth=3;roundRect(ctx,R.x-5,R.y-34,R.w+10,R.h+45,22);ctx.stroke()}ctx.restore();
}
function findRoachAt(x,y){let best=-1,bd=Infinity;for(let i=0;i<roaches.length;i++){const d=dist(x,y,roaches[i].x,roaches[i].y);if(d<26&&d<bd){bd=d;best=i}}return best}
