'use strict';

const C=document.getElementById('stage');
const ctx=C.getContext('2d',{alpha:false});
const $=s=>document.querySelector(s);
const $$=s=>[...document.querySelectorAll(s)];
const clamp=(v,a,b)=>v<a?a:v>b?b:v;
const lerp=(a,b,t)=>a+(b-a)*t;
const rand=(a=1,b)=>b===undefined?Math.random()*a:a+Math.random()*(b-a);
const TAU=Math.PI*2;
const dist=(a,b,c,d)=>Math.hypot(a-c,b-d);
const now=()=>performance.now()/1000;
const smooth=t=>t*t*(3-2*t);

let W=1,H=1,DPR=1;
let portrait=false;
let tray={x:0,y:0,w:1,h:1};
let chamberRect={x:0,y:0,w:1,h:1};
let detailRect={x:0,y:0,w:1,h:1};
let lastT=now();
let freezeUntil=0;
let shake=0;
let tool='bait';
let pointer={down:false,id:null,x:0,y:0,px:0,py:0,startX:0,startY:0,moved:0};
let hover={x:0,y:0,live:false};
let specimen=null;
let selectedPart=null;
let toolFx=[];
let panFx=[];
let stains=[];
let particles=[];
let roaches=[];
let corpses=[];
let baits=[];
let scrapeToneAt=0;
let toastTimer=0;
let hintTimer=0;
let intro=true;

const scraper={x:0,y:0,a:0,load:0,drag:false,lastX:0,lastY:0};
const press={
  p:0,target:0,drag:false,cycleReady:true,
  live:[],chunks:[],looseMass:0,layers:[],fluid:0,cup:0,
  drips:[],wallStreaks:[],squirts:[],presses:0,crushedThisCycle:0
};

const HINTS={
  bait:'작업대에 닭고기를 놓으면 바퀴들이 몰려든다.',
  pan:'바퀴 무더기나 이미 눌린 시체를 누른다. 같은 자리를 다시 치면 더 잘게 부서진다.',
  scraper:'눌린 시체 위를 누른 채 밀어 긁는다. 통 안으로 가져가 손을 떼면 털어 넣는다.',
  tweezer:'살아 있는 바퀴 한 마리를 누르면 접사 작업대로 가져온다. 접사에서는 다리 끝을 잡아당긴다.',
  clipper:'접사 작업대에서 다리·더듬이·날개·배마디를 누르면 딱 잘린다.',
  snips:'접사 작업대에서 몸통을 가로질러 드래그하면 토막이 난다.',
  press:'투명 통의 가로 손잡이를 잡아 아래로 끝까지 끌어내린다.'
};

class AudioFX{
  constructor(){this.ctx=null;this.master=null;this.noiseBuf=null;this.scrapeLoop=null}
  ensure(){
    if(!this.ctx){
      const AC=window.AudioContext||window.webkitAudioContext;
      if(!AC)return;
      this.ctx=new AC();
      this.master=this.ctx.createGain();
      this.master.gain.value=.78;
      const comp=this.ctx.createDynamicsCompressor();
      comp.threshold.value=-15;comp.ratio.value=5;comp.attack.value=.002;comp.release.value=.14;
      this.master.connect(comp);comp.connect(this.ctx.destination);
      const len=this.ctx.sampleRate*2;
      this.noiseBuf=this.ctx.createBuffer(1,len,this.ctx.sampleRate);
      const d=this.noiseBuf.getChannelData(0);
      for(let i=0;i<len;i++)d[i]=Math.random()*2-1;
    }
    if(this.ctx.state==='suspended')this.ctx.resume();
  }
  env(g,t,a,d,p){
    g.gain.setValueAtTime(.0001,t);
    g.gain.exponentialRampToValueAtTime(Math.max(.0002,p),t+a);
    g.gain.exponentialRampToValueAtTime(.0001,t+a+d);
  }
  noise({delay=0,dur=.08,gain=.4,freq=1800,q=1,type='bandpass',end=null,pan=0,rate=1}={}){
    if(!this.ctx)return;
    const t=this.ctx.currentTime+delay,s=this.ctx.createBufferSource(),f=this.ctx.createBiquadFilter(),g=this.ctx.createGain();
    s.buffer=this.noiseBuf;s.loop=true;s.playbackRate.value=rate;
    f.type=type;f.frequency.setValueAtTime(freq,t);f.Q.value=q;
    if(end)f.frequency.exponentialRampToValueAtTime(Math.max(30,end),t+dur);
    this.env(g,t,.002,dur,gain);
    const p=this.ctx.createStereoPanner();p.pan.value=clamp(pan,-1,1);
    s.connect(f);f.connect(g);g.connect(p);p.connect(this.master);
    s.start(t,rand(0,1.5));s.stop(t+dur+.04);
  }
  tone({delay=0,dur=.1,gain=.25,freq=160,end=null,type='sine',pan=0}={}){
    if(!this.ctx)return;
    const t=this.ctx.currentTime+delay,o=this.ctx.createOscillator(),g=this.ctx.createGain(),p=this.ctx.createStereoPanner();
    o.type=type;o.frequency.setValueAtTime(freq,t);if(end)o.frequency.exponentialRampToValueAtTime(Math.max(20,end),t+dur);
    this.env(g,t,.002,dur,gain);p.pan.value=clamp(pan,-1,1);
    o.connect(g);g.connect(p);p.connect(this.master);o.start(t);o.stop(t+dur+.04);
  }
  panHit(n=1,pan=0){
    this.tone({dur:.12,gain:.55,freq:105,end:38,pan});
    for(const f of [1180,2780,4250])this.tone({dur:.34,gain:.08,freq:f*(.99+Math.random()*.02),pan});
    this.noise({dur:.03,gain:.55,freq:3400,q:.7,pan});
    for(let i=0;i<Math.max(1,n);i++)this.crunch(i*.028,Math.min(1,.5+n*.035),pan+rand(-.18,.18));
  }
  crunch(delay=0,g=.65,pan=0){
    this.tone({delay,dur:.07,gain:.36*g,freq:135+rand(-20,40),end:38,type:'triangle',pan});
    const n=4+Math.floor(rand(4));
    for(let i=0;i<n;i++)this.noise({delay:delay+i*rand(.006,.014),dur:rand(.012,.028),gain:.42*g,freq:rand(2400,6200),q:1.7,pan,rate:rand(.85,1.4)});
    this.noise({delay:delay+.008,dur:.14,gain:.32*g,freq:650,q:1.5,type:'lowpass',end:160,pan});
  }
  wet(g=.6,pan=0){
    this.noise({dur:.25,gain:.4*g,freq:520,q:2,type:'lowpass',end:110,pan,rate:.7});
    this.tone({dur:.22,gain:.2*g,freq:85,end:28,type:'triangle',pan});
  }
  scrape(speed=.5){
    const t=now();if(t<scrapeToneAt)return;scrapeToneAt=t+.055;
    this.noise({dur:.055,gain:.15+.22*clamp(speed,0,1),freq:rand(850,1800),q:5,end:rand(260,620),pan:rand(-.35,.35)});
    if(Math.random()<.25)this.noise({dur:.015,gain:.2,freq:rand(2600,5000),q:2});
  }
  clip(){
    this.tone({dur:.024,gain:.48,freq:1600,end:620,type:'square'});
    this.noise({delay:.005,dur:.02,gain:.45,freq:4200,q:2.4});
    this.crunch(.012,.3,rand(-.3,.3));
  }
  snip(){
    this.noise({dur:.018,gain:.5,freq:3500,q:1.6});
    this.tone({dur:.035,gain:.25,freq:900,end:300,type:'square'});
    this.crunch(.025,.36,rand(-.25,.25));
  }
  pluck(){
    this.tone({dur:.055,gain:.25,freq:520,end:120,type:'square'});
    this.noise({dur:.07,gain:.28,freq:1200,q:4,end:300});
  }
  dump(m=.5){
    this.tone({dur:.12,gain:.3+.25*clamp(m/5,0,1),freq:95,end:35,type:'triangle'});
    for(let i=0;i<Math.min(8,2+Math.floor(m));i++)this.noise({delay:i*.035,dur:.025,gain:.22,freq:rand(1000,3600),q:2});
    this.wet(.45);
  }
  pressCreak(p=.5){
    if(now()<this._creak)return;this._creak=now()+.08;
    this.tone({dur:.08,gain:.09+.1*p,freq:rand(90,160),end:rand(55,90),type:'sawtooth'});
    this.noise({dur:.07,gain:.1+.12*p,freq:rand(350,900),q:7,end:180});
  }
  squirt(g=1){
    this.noise({dur:.28,gain:.4*g,freq:860,q:2.5,type:'lowpass',end:120});
    for(let i=0;i<5;i++)this.noise({delay:i*.035,dur:.02,gain:.24*g,freq:rand(1200,3300),q:1.8});
    this.wet(.7*g);
  }
}
const SFX=new AudioFX();

function resize(){
  DPR=Math.min(window.devicePixelRatio||1,1.75);
  W=Math.max(1,innerWidth);H=Math.max(1,innerHeight);
  C.width=Math.round(W*DPR);C.height=Math.round(H*DPR);C.style.width=W+'px';C.style.height=H+'px';
  ctx.setTransform(DPR,0,0,DPR,0,0);
  portrait=H>W*1.05;
  if(portrait){
    chamberRect={x:W*.54,y:H*.105,w:W*.41,h:H*.36};
    tray={x:W*.035,y:H*.49,w:W*.93,h:H*.37};
  }else{
    chamberRect={x:W*.705,y:H*.13,w:W*.26,h:H*.66};
    tray={x:W*.035,y:H*.13,w:W*.63,h:H*.72};
  }
  detailRect={x:W*.07,y:H*.14,w:W*.86,h:H*.68};
  for(const r of roaches){
    r.x=clamp(r.x,tray.x+20,tray.x+tray.w-20);
    r.y=clamp(r.y,tray.y+20,tray.y+tray.h-20);
  }
}
addEventListener('resize',resize);

function woodBackground(){
  const grd=ctx.createLinearGradient(0,0,W,H);
  grd.addColorStop(0,'#e2bb70');grd.addColorStop(.45,'#d2a45c');grd.addColorStop(1,'#bd8c4b');
  ctx.fillStyle=grd;ctx.fillRect(0,0,W,H);
  ctx.globalAlpha=.18;
  ctx.strokeStyle='#6e421f';ctx.lineWidth=1;
  const plank=portrait?W/4:W/6;
  for(let x=0;x<W;x+=plank){
    ctx.beginPath();ctx.moveTo(x,0);ctx.lineTo(x,H);ctx.stroke();
  }
  for(let i=0;i<60;i++){
    const y=(i*83.13)%H;
    ctx.beginPath();ctx.moveTo(0,y);
    for(let x=0;x<=W;x+=80)ctx.lineTo(x,y+Math.sin(x*.018+i)*rand(-7,7));
    ctx.stroke();
  }
  ctx.globalAlpha=1;
  const vg=ctx.createRadialGradient(W*.48,H*.45,Math.min(W,H)*.15,W*.48,H*.45,Math.max(W,H)*.78);
  vg.addColorStop(0,'rgba(255,255,255,0)');vg.addColorStop(1,'rgba(48,25,8,.25)');
  ctx.fillStyle=vg;ctx.fillRect(0,0,W,H);
}

function drawTray(){
  ctx.save();
  roundRect(ctx,tray.x,tray.y,tray.w,tray.h,18);
  const g=ctx.createLinearGradient(tray.x,tray.y,tray.x,tray.y+tray.h);
  g.addColorStop(0,'#f7e8c9');g.addColorStop(1,'#dfc18d');
  ctx.fillStyle=g;ctx.fill();
  ctx.lineWidth=4;ctx.strokeStyle='#8b673d';ctx.stroke();
  ctx.clip();
  ctx.globalAlpha=.12;ctx.strokeStyle='#7d542d';ctx.lineWidth=1;
  for(let y=tray.y+18;y<tray.y+tray.h;y+=26){ctx.beginPath();ctx.moveTo(tray.x,y);ctx.lineTo(tray.x+tray.w,y+rand(-5,5));ctx.stroke()}
  ctx.globalAlpha=1;
  ctx.restore();
  ctx.fillStyle='rgba(53,33,19,.65)';ctx.font='700 11px '+getComputedStyle(document.body).fontFamily;
  ctx.fillText('작업대',tray.x+12,tray.y+18);
}

function roundRect(g,x,y,w,h,r){
  r=Math.min(r,w/2,h/2);g.beginPath();g.moveTo(x+r,y);g.arcTo(x+w,y,x+w,y+h,r);g.arcTo(x+w,y+h,x,y+h,r);g.arcTo(x,y+h,x,y,r);g.arcTo(x,y,x+w,y,r);g.closePath();
}

function pointInRect(x,y,r,m=0){return x>=r.x-m&&x<=r.x+r.w+m&&y>=r.y-m&&y<=r.y+r.h+m}
