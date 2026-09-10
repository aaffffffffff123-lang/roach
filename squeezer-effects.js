function hitAt(x,y,radius=48){
  const hit=[];for(let i=roaches.length-1;i>=0;i--)if(dist(x,y,roaches[i].x,roaches[i].y)<radius)hit.push(i);
  const deadHit=[];for(let i=0;i<corpses.length;i++)if(dist(x,y,corpses[i].x,corpses[i].y)<radius*1.05)deadHit.push(i);
  const n=hit.length+deadHit.length;
  for(const i of hit.sort((a,b)=>dist(x,y,roaches[a].x,roaches[a].y)-dist(x,y,roaches[b].x,roaches[b].y)).reverse()){const r=roaches[i];corpseFromRoach(r,1,1);roaches.splice(i,1)}
  for(const i of deadHit){const c=corpses[i];c.stage=Math.min(3,c.stage+1);c.x=lerp(c.x,x,.16);c.y=lerp(c.y,y,.16);c.mass=Math.max(.28,c.mass*(c.stage===3?.82:.95))}
  if(n){makeSplat(x,y,n,clamp(.9+n*.045,1,1.8));spawnParticles(x,y,18+n*5,1+n*.025);SFX.panHit(n,clamp((x-W/2)/(W/2),-.8,.8));shake=Math.min(2.1,.55+n*.07);freezeUntil=now()+Math.min(.085,.025+n*.004);for(const r of roaches)if(dist(x,y,r.x,r.y)<radius+110)r.fear=rand(.5,1.3)}
  else{SFX.panHit(0,clamp((x-W/2)/(W/2),-.8,.8));shake=.35}
  updateStats();return n;
}
function placeBait(x,y){if(!pointInRect(x,y,tray,-4))return;if(baits.length>=3)baits.shift();baits.push({x,y,a:rand(TAU),t:0});SFX.noise({dur:.09,gain:.25,freq:850,q:1,end:260});toast('기름진 닭고기를 놓았다')}
function drawBaits(){for(const b of baits){ctx.save();ctx.translate(b.x,b.y);ctx.rotate(b.a);ctx.fillStyle='rgba(137,73,28,.22)';ctx.beginPath();ctx.ellipse(2,4,35,16,.2,0,TAU);ctx.fill();ctx.fillStyle='#c8753d';ctx.beginPath();ctx.ellipse(0,0,22,11,.1,0,TAU);ctx.fill();ctx.fillStyle='#e4a15b';ctx.beginPath();ctx.ellipse(-5,-3,14,6,-.2,0,TAU);ctx.fill();ctx.fillStyle='#f3e8d1';roundRect(ctx,-30,-3,28,6,3);ctx.fill();ctx.beginPath();ctx.arc(-30,-2,6,0,TAU);ctx.arc(-30,3,6,0,TAU);ctx.fill();ctx.restore()}}
function startPan(x,y){panFx.push({x,y,t:0,hit:false,a:rand(-.3,.3)})}
function updatePanFx(dt){for(let i=panFx.length-1;i>=0;i--){const f=panFx[i];f.t+=dt;if(!f.hit&&f.t>=.11){f.hit=true;hitAt(f.x,f.y,clamp(Math.min(W,H)*.055,38,62))}if(f.t>.42)panFx.splice(i,1)}}
function drawPanFx(){for(const f of panFx){const k=clamp(f.t/.11,0,1),up=clamp((f.t-.2)/.22,0,1),sc=lerp(1.35,1,k)*(1+.12*up),yy=lerp(-70,0,smooth(k))-up*55;ctx.save();ctx.translate(f.x,f.y+yy);ctx.rotate(f.a);ctx.scale(sc,sc);ctx.globalAlpha=1-up*.7;ctx.fillStyle='#24262a';ctx.beginPath();ctx.arc(0,0,34,0,TAU);ctx.fill();ctx.strokeStyle='#81858a';ctx.lineWidth=5;ctx.beginPath();ctx.arc(0,0,31,0,TAU);ctx.stroke();ctx.fillStyle='#1d1e21';roundRect(ctx,25,-7,78,14,7);ctx.fill();ctx.fillStyle='#725039';roundRect(ctx,68,-8,40,16,7);ctx.fill();ctx.restore()}}
function scraperHit(x,y,dx,dy){
  const speed=clamp(Math.hypot(dx,dy)/20,0,1);if(speed>.04)SFX.scrape(speed);let gained=0;const a=Math.atan2(dy,dx);
  for(let i=corpses.length-1;i>=0;i--){const c=corpses[i];if(dist(x,y,c.x,c.y)<38){gained+=c.mass;corpses.splice(i,1);const smear=makeSplat(c.x,c.y,1,.45);smear.blobs.splice(2)}}
  scraper.load+=gained;if(gained>0){spawnParticles(x,y,Math.floor(3+gained*2),.25,.35);updateStats()}scraper.x=x;scraper.y=y;scraper.a=a||scraper.a;
}
function chamberOpening(){return {x:chamberRect.x+chamberRect.w*.08,y:chamberRect.y+chamberRect.h*.02,w:chamberRect.w*.84,h:Math.max(40,chamberRect.h*.16)}}
function depositScraper(){
  if(scraper.load<=.01)return false;const open=chamberOpening();
  if(pointInRect(scraper.x,scraper.y,open,18)){addMassToChamber(scraper.load);SFX.dump(scraper.load);toast(`${scraper.load.toFixed(1)}마리분을 통에 털었다`);scraper.load=0;updateStats();return true}
  corpses.push({x:clamp(scraper.x,tray.x+20,tray.x+tray.w-20),y:clamp(scraper.y,tray.y+20,tray.y+tray.h-20),a:scraper.a,stage:3,mass:scraper.load,seed:rand(1000),pieces:12});SFX.dump(scraper.load*.5);scraper.load=0;updateStats();return false;
}
function drawScraper(){
  if(tool!=='scraper'&&!scraper.drag&&scraper.load<=0)return;const x=scraper.drag?scraper.x:hover.x,y=scraper.drag?scraper.y:hover.y;if(!hover.live&&!scraper.drag)return;ctx.save();ctx.translate(x,y);ctx.rotate(scraper.a);ctx.fillStyle='#7a7d82';ctx.strokeStyle='#e1e2e3';ctx.lineWidth=2;roundRect(ctx,-32,-10,58,20,3);ctx.fill();ctx.stroke();ctx.fillStyle='#442b1a';roundRect(ctx,20,-6,74,12,6);ctx.fill();
  if(scraper.load>0){const n=Math.min(18,3+Math.floor(scraper.load*1.8));for(let i=0;i<n;i++){ctx.fillStyle=i%4===0?'#e6d79f':'#443022';ctx.beginPath();ctx.ellipse(-22+i%6*7,rand(-7,7),rand(4,9),rand(2,5),rand(TAU),0,TAU);ctx.fill()}}ctx.restore();
}
