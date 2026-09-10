function makeRoach(x=rand(tray.x+30,tray.x+tray.w-30),y=rand(tray.y+30,tray.y+tray.h-30)){
  return {x,y,a:rand(TAU),spd:rand(22,45),turn:rand(-1.8,1.8),turnT:rand(.2,1.2),phase:rand(TAU),seed:rand(1000),fear:0,bait:null};
}
function spawnRoaches(n=12){for(let i=0;i<n;i++)roaches.push(makeRoach());toast(`${n}마리 더 풀었다`)}
function nearestBait(r){let best=null,bd=Infinity;for(const b of baits){const d=dist(r.x,r.y,b.x,b.y);if(d<bd){bd=d;best=b}}return bd<Math.min(tray.w,tray.h)*.85?best:null}
function updateRoaches(dt){
  for(const r of roaches){
    r.phase+=dt*(8+r.spd*.16);r.turnT-=dt;r.fear=Math.max(0,r.fear-dt);
    const b=nearestBait(r);
    if(b){const d=dist(r.x,r.y,b.x,b.y),aim=Math.atan2(b.y-r.y,b.x-r.x);r.a=angleDamp(r.a,aim,d<45?2.4:4.5,dt);r.spd=d<28?rand(1,5):clamp(r.spd+dt*18,28,58);if(d<34)r.a+=Math.sin(r.phase*.45+r.seed)*dt*1.8}
    else{if(r.turnT<=0){r.turnT=rand(.15,1.4);r.turn=rand(-2.4,2.4);r.spd=Math.random()<.2?0:rand(20,50)}r.a+=r.turn*dt}
    if(r.fear>0)r.spd=clamp(r.spd+dt*90,45,92);
    let nx=r.x+Math.cos(r.a)*r.spd*dt,ny=r.y+Math.sin(r.a)*r.spd*dt;const m=15;
    if(nx<tray.x+m||nx>tray.x+tray.w-m){r.a=Math.PI-r.a;nx=clamp(nx,tray.x+m,tray.x+tray.w-m)}
    if(ny<tray.y+m||ny>tray.y+tray.h-m){r.a=-r.a;ny=clamp(ny,tray.y+m,tray.y+tray.h-m)}
    r.x=nx;r.y=ny;
  }
}
function angleDamp(a,b,rate,dt){let d=((b-a+Math.PI)%TAU+TAU)%TAU-Math.PI;return a+d*(1-Math.exp(-rate*dt))}
function drawRoach(r,scale=1,alpha=1){
  const L=15*scale,B=6.4*scale;ctx.save();ctx.translate(r.x,r.y);ctx.rotate(r.a+Math.PI/2);ctx.globalAlpha=alpha;const run=Math.sin(r.phase);ctx.strokeStyle='#291409';ctx.lineCap='round';
  for(const s of [-1,1]){for(let i=0;i<3;i++){const z=(-5+i*5)*scale,sw=Math.sin(r.phase+i*Math.PI+s)*3.2*scale;ctx.lineWidth=Math.max(1,1.25*scale);ctx.beginPath();ctx.moveTo(s*B*.65,z);ctx.lineTo(s*(B+5*scale),z+sw);ctx.lineTo(s*(B+10*scale),z+sw*1.35+(i-1)*3*scale);ctx.stroke()}ctx.lineWidth=Math.max(.8,.9*scale);ctx.beginPath();ctx.moveTo(s*2*scale,-L*.7);ctx.quadraticCurveTo(s*8*scale,-L*1.2+run*scale,s*12*scale,-L*1.55);ctx.stroke()}
  const body=ctx.createLinearGradient(-B,0,B,0);body.addColorStop(0,'#2c1609');body.addColorStop(.5,'#694018');body.addColorStop(1,'#2b1408');ctx.fillStyle=body;ctx.beginPath();ctx.ellipse(0,1*scale,B,L,0,0,TAU);ctx.fill();ctx.fillStyle='#6f4b23';ctx.beginPath();ctx.ellipse(0,-1*scale,B*.92,L*.88,0,0,TAU);ctx.fill();ctx.strokeStyle='rgba(24,10,3,.7)';ctx.lineWidth=Math.max(.8,1*scale);ctx.beginPath();ctx.moveTo(0,-L*.75);ctx.lineTo(0,L*.72);ctx.stroke();ctx.fillStyle='#281208';ctx.beginPath();ctx.ellipse(0,-L*.72,B*.72,B*.55,0,0,TAU);ctx.fill();ctx.fillStyle='rgba(200,143,69,.25)';ctx.beginPath();ctx.ellipse(-B*.25,-L*.1,B*.28,L*.55,-.15,0,TAU);ctx.fill();ctx.restore();
}
function makeSplat(x,y,n=1,power=1){
  const s={blobs:[],lines:[],t:now()};s.blobs.push({x,y,rx:18*power+5*n,ry:12*power+3*n,a:rand(TAU),c:0});const count=Math.min(28,7+n*3);
  for(let i=0;i<count;i++){const a=rand(TAU),d=rand(8,58*power+5*n),r=rand(1.5,5.5)*power;s.blobs.push({x:x+Math.cos(a)*d,y:y+Math.sin(a)*d,rx:r*rand(1,2.5),ry:r,a,c:Math.random()<.23?1:Math.random()<.25?2:0});if(Math.random()<.55)s.lines.push({x1:x+Math.cos(a)*rand(3,12),y1:y+Math.sin(a)*rand(3,12),x2:x+Math.cos(a)*d,y2:y+Math.sin(a)*d,w:rand(.7,2.4)})}
  stains.push(s);return s;
}
function drawStains(){for(const s of stains){ctx.save();for(const b of s.blobs){ctx.fillStyle=b.c===1?'rgba(51,27,12,.72)':b.c===2?'rgba(250,239,202,.78)':'rgba(214,197,145,.84)';ctx.beginPath();ctx.ellipse(b.x,b.y,b.rx,b.ry,b.a,0,TAU);ctx.fill()}ctx.strokeStyle='rgba(105,70,34,.45)';ctx.lineCap='round';for(const l of s.lines){ctx.lineWidth=l.w;ctx.beginPath();ctx.moveTo(l.x1,l.y1);ctx.lineTo(l.x2,l.y2);ctx.stroke()}ctx.restore()}}
function spawnParticles(x,y,n=20,power=1,cream=.7){for(let i=0;i<n;i++){const a=rand(TAU),s=rand(60,260)*power;particles.push({x,y,vx:Math.cos(a)*s,vy:Math.sin(a)*s-rand(20,110)*power,life:rand(.35,.85),t:0,r:rand(1.5,4.5),cream:Math.random()<cream,dark:Math.random()<.2})}if(particles.length>500)particles.splice(0,particles.length-500)}
function updateParticles(dt){for(let i=particles.length-1;i>=0;i--){const p=particles[i];p.t+=dt;if(p.t>=p.life){particles.splice(i,1);continue}p.vy+=360*dt;p.vx*=Math.exp(-1.5*dt);p.x+=p.vx*dt;p.y+=p.vy*dt}}
function drawParticles(){for(const p of particles){const k=1-p.t/p.life;ctx.globalAlpha=k;ctx.fillStyle=p.dark?'#44210c':p.cream?'#eee0a7':'#b89a55';ctx.beginPath();ctx.ellipse(p.x,p.y,p.r*(1+p.t*1.4),p.r*.72,Math.atan2(p.vy,p.vx),0,TAU);ctx.fill()}ctx.globalAlpha=1}
function corpseFromRoach(r,stage=1,mass=1){corpses.push({x:r.x,y:r.y,a:r.a,stage,mass,seed:r.seed||rand(1000),pieces:6+Math.floor(rand(5))})}
function drawCorpse(c){
  const s=1+(c.stage-1)*.28;ctx.save();ctx.translate(c.x,c.y);ctx.rotate(c.a+Math.PI/2);ctx.strokeStyle='#2b160b';ctx.lineCap='round';ctx.globalAlpha=c.stage>=3?.72:1;const seed=c.seed;
  for(let i=0;i<Math.max(2,7-c.stage);i++){const side=i%2?1:-1,z=((i%3)-1)*7;ctx.lineWidth=1.5;ctx.beginPath();ctx.moveTo(side*5,z);ctx.lineTo(side*(10+((seed+i*7)%7)),z+Math.sin(seed+i)*6);ctx.stroke()}
  ctx.fillStyle=c.stage===1?'#4b3423':c.stage===2?'#3e2a1d':'#342117';ctx.beginPath();ctx.ellipse(0,0,10*s,16/Math.max(1,c.stage*.45),rand(-.2,.2),0,TAU);ctx.fill();ctx.fillStyle='rgba(231,218,169,.78)';ctx.beginPath();ctx.ellipse(rand(-4,4),rand(-5,5),5*s,3.5*s,rand(TAU),0,TAU);ctx.fill();ctx.strokeStyle='#76502a';ctx.lineWidth=1;for(let i=0;i<c.stage+1;i++){ctx.beginPath();ctx.moveTo(rand(-8,8),rand(-9,9));ctx.lineTo(rand(-14,14)*s,rand(-8,8)*s);ctx.stroke()}
  if(c.stage>=2){ctx.fillStyle='#5b3d25';for(let i=0;i<3+c.stage;i++){ctx.save();ctx.rotate((i/(3+c.stage))*TAU+seed);ctx.fillRect(10+rand(1,12),-1,rand(3,8),2);ctx.restore()}}ctx.restore();
}
