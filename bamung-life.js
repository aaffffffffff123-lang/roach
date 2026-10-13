// bamung-life.js — 테라리움 속 바퀴들의 행동
// World: 테라리움 벽·소품 자리·바람·불빛을 알고, 바퀴가 쓸 자리를 골라 준다.
// Pet  : 한 마리. 쉬기·돌아다니기·더듬이 손질·먹고 마시기·숨기·놀이기구 타기·유리 벽 타기·늙어 죽기.
// 대화 : 둘이 마주치면 가끔 마주 보고 서서 한마디씩 주고받는다 (대사는 bamung-talk.js).
// 실제 습성: 대부분 쉬고, 좁은 틈을 좋아하고(벽·틈에 몸을 붙임), 빛과 바람을 피하고, 죽은 동료 근처는 피해 간다.
import * as THREE from 'three';
import { PetModel, applyDeco, ROACH_L } from './bamung-roach.js';
import { TALKS } from './bamung-talk.js';

const TAU=Math.PI*2, PI=Math.PI;
const clamp=(v,a,b)=>v<a?a:v>b?b:v;
const lerp=(a,b,t)=>a+(b-a)*t;
const rand=(a=1,b)=>b===undefined?Math.random()*a:a+Math.random()*(b-a);
const wrap=a=>((a+PI)%TAU+TAU)%TAU-PI;
const damp=(a,b,r,dt)=>lerp(a,b,1-Math.exp(-r*dt));
const sstep=(a,b,x)=>{ const t=clamp((x-a)/(b-a),0,1); return t*t*(3-2*t); };
const pick=a=>a[Math.floor(Math.random()*a.length)];

export const TANK={hw:0.46,hd:0.78,h:0.72,band:0.58};   // 안쪽 반폭·반깊이·높이, 바셀린 띠 높이(이 위로는 못 올라감)
const PR=0.036;          // 바퀴 몸 반지름 (부딪힘 판정)
const WALL=0.05;         // 유리 벽에서 몸 가운데까지: 다리가 유리를 뚫고 나가 보이지 않게
const DAY=86400000;
const talkLineDur=t=>{ const n=String(t).replace(/\s/g,'').length; return clamp(1.25+0.1*n,2.1,4.8); };   // 한마디가 떠 있다가 다음 말이 나올 때까지

const _q=new THREE.Quaternion(), _m=new THREE.Matrix4(), _v=new THREE.Vector3(), _v2=new THREE.Vector3(), _v3=new THREE.Vector3(), _up=new THREE.Vector3(0,1,0);
function frameQuat(up,fwd,out){
  const n=_v.copy(up).normalize(); const f=_v2.copy(fwd).addScaledVector(n,-fwd.dot(n)); if(f.lengthSq()<1e-8) f.set(0,0,1).addScaledVector(n,-n.z); f.normalize();
  const x=_v3.crossVectors(n,f).normalize(); _m.makeBasis(x,n,f); return out.setFromRotationMatrix(_m);
}

// ───────── 길 (소품이 준 꺾은선을 매끈한 곡선으로) ─────────
export class Path{
  constructor(pts,nrm){
    const P=pts.map(p=>p.clone()), N=nrm.map(n=>n.clone().normalize());
    const curve=new THREE.CatmullRomCurve3(P,false,'centripetal',0.3);
    const len=curve.getLength(); const n=Math.max(8,Math.ceil(len/0.005));
    this.p=[]; this.n=[]; this.t=[]; this.s=[];
    const raw=curve.getSpacedPoints(n);
    // 꺾은선 위 가장 가까운 꼭짓점들의 법선을 거리 비례로 섞는다
    const segs=[]; let acc=0; for(let i=0;i<P.length-1;i++){ const l=P[i].distanceTo(P[i+1]); segs.push([acc,l]); acc+=l; }
    for(let i=0;i<=n;i++){
      const p=raw[i]; this.p.push(p);
      let best=1e9, nn=N[0];
      for(let k=0;k<P.length-1;k++){ const a=P[k], b=P[k+1]; const ab=_v.subVectors(b,a), L2=ab.lengthSq()||1e-9; const t=clamp(_v2.subVectors(p,a).dot(ab)/L2,0,1); const q=_v3.copy(a).addScaledVector(ab,t); const d=q.distanceToSquared(p); if(d<best){ best=d; nn=N[k].clone().lerp(N[k+1],t).normalize(); } }
      this.n.push(nn);
    }
    for(let i=0;i<=n;i++){ const a=this.p[Math.max(0,i-1)], b=this.p[Math.min(n,i+1)]; this.t.push(b.clone().sub(a).normalize()); }
    let s=0; this.s.push(0); for(let i=1;i<=n;i++){ s+=this.p[i].distanceTo(this.p[i-1]); this.s.push(s); }
    this.len=s;
  }
  at(s,out){ s=clamp(s,0,this.len); let lo=0,hi=this.s.length-1; while(hi-lo>1){ const m=(lo+hi)>>1; if(this.s[m]<=s) lo=m; else hi=m; } const t=(s-this.s[lo])/Math.max(1e-9,this.s[hi]-this.s[lo]);
    out.p.copy(this.p[lo]).lerp(this.p[hi],t); out.n.copy(this.n[lo]).lerp(this.n[hi],t).normalize(); out.t.copy(this.t[lo]).lerp(this.t[hi],t).normalize(); return out; }
}

// ══════════════════════════════════════════════════════════════════
// 테라리움
// ══════════════════════════════════════════════════════════════════
export class World{
  constructor({sfx,events}={}){
    this.props=[]; this.pets=[]; this.sfx=sfx||{}; this.events=events||{}; this.time=0;
    this.talk=null; this.talkSeq=0; this.talkCD=rand(8,14); this.talkOn=true; this.talkBag=[];
  }
  // 소품 자기 좌표 → 테라리움 좌표
  lp(prop,x,y,z,out=new THREE.Vector3()){ const c=Math.cos(prop.rot), s=Math.sin(prop.rot); return out.set(prop.x+x*c+z*s,y,prop.z-x*s+z*c); }
  ln(prop,x,y,z,out=new THREE.Vector3()){ const c=Math.cos(prop.rot), s=Math.sin(prop.rot); return out.set(x*c+z*s,y,-x*s+z*c); }
  lh(prop,h){ return h+prop.rot; }
  /** 이 점이 소품 발자리 안인가 (부풀린 만큼 포함). 안이면 바깥으로 밀어낼 방향과 거리를 준다 */
  inFoot(prop,x,z,inf){
    const c=Math.cos(prop.rot), s=Math.sin(prop.rot), dx=x-prop.x, dz=z-prop.z; const lx=dx*c-dz*s, lz=dx*s+dz*c;
    let best=null;
    for(const f of prop.foot){
      if(f.r!==undefined){ const ex=lx-f.x, ez=lz-f.z, d=Math.hypot(ex,ez), R=f.r+inf; if(d<R){ const k=d>1e-6?1/d:0; const o={nx:ex*k||1,nz:ez*k,pen:R-d}; if(!best||o.pen<best.pen) best=o; } }
      else { const ex=lx-f.x, ez=lz-f.z, ax=f.hw+inf-Math.abs(ex), az=f.hd+inf-Math.abs(ez); if(ax>0&&az>0){ const o=ax<az?{nx:Math.sign(ex)||1,nz:0,pen:ax}:{nx:0,nz:Math.sign(ez)||1,pen:az}; if(!best||o.pen<best.pen) best=o; } }
    }
    if(!best) return null;
    // 법선을 테라리움 좌표로
    const nx=best.nx*c+best.nz*s, nz=-best.nx*s+best.nz*c; return {nx,nz,pen:best.pen};
  }
  /** 바닥에서 (x,z)에 몸을 둘 수 있게 밀어낸 자리 */
  resolve(x,z,pet){
    const m=WALL; let hit=null;
    if(x<-TANK.hw+m){ x=-TANK.hw+m; hit={nx:1,nz:0}; } if(x>TANK.hw-m){ x=TANK.hw-m; hit={nx:-1,nz:0}; }
    if(z<-TANK.hd+m){ z=-TANK.hd+m; hit={nx:0,nz:1}; } if(z>TANK.hd-m){ z=TANK.hd-m; hit={nx:0,nz:-1}; }
    for(let it=0;it<2;it++) for(const p of this.props){ if(pet&&pet.ignore===p) continue; const o=this.inFoot(p,x,z,PR*0.6); if(o){ x+=o.nx*o.pen; z+=o.nz*o.pen; hit=o; } }
    return {x,z,hit};
  }
  freeAt(x,z,r=PR){ const wm=Math.max(r,WALL); if(Math.abs(x)>TANK.hw-wm||Math.abs(z)>TANK.hd-wm) return false; for(const p of this.props) if(this.inFoot(p,x,z,r)) return false; return true; }
  randomFree(tries=30,nearWall=false){
    for(let i=0;i<tries;i++){ let x,z; if(nearWall){ const side=Math.floor(rand(4)); const t=rand(-1,1); const m=WALL+0.004; x=side<2?(side?TANK.hw-m:-TANK.hw+m):t*(TANK.hw-m); z=side<2?t*(TANK.hd-m):(side===2?TANK.hd-m:-TANK.hd+m); } else { x=rand(-TANK.hw+0.06,TANK.hw-0.06); z=rand(-TANK.hd+0.06,TANK.hd-0.06); }
      if(this.freeAt(x,z,PR+0.01)) return {x,z}; }
    return {x:rand(-0.3,0.3),z:rand(-0.2,0.2)};
  }
  /** 바람(선풍기)과 불빛(스탠드) */
  windAt(x,z){ let wx=0,wz=0,k=0; for(const p of this.props){ const f=p.field?.(); if(!f||f.type!=='wind') continue; const o=this.lp(p,f.x,0,f.z), h=this.lh(p,f.h); const dx=x-o.x, dz=z-o.z, d=Math.hypot(dx,dz); if(d>f.range||d<1e-4) continue; const a=Math.abs(wrap(Math.atan2(dx,dz)-h)); if(a>f.cone) continue; const s=f.k*(1-d/f.range)*(1-a/f.cone*0.6); wx+=Math.sin(h)*s; wz+=Math.cos(h)*s; k=Math.max(k,s); } return {wx,wz,k}; }
  lightAt(x,z){ let k=0; for(const p of this.props){ const f=p.field?.(); if(!f||f.type!=='light') continue; const o=this.lp(p,f.x,0,f.z); const d=Math.hypot(x-o.x,z-o.z); if(d<f.r) k=Math.max(k,1-d/f.r*0.5); } return k; }
  lightCenter(x,z){ for(const p of this.props){ const f=p.field?.(); if(!f||f.type!=='light') continue; const o=this.lp(p,f.x,0,f.z); if(Math.hypot(x-o.x,z-o.z)<f.r) return o; } return null; }
  slotsOf(types){ const out=[]; for(const p of this.props) for(const s of p.slots){ if(types.includes(s.type)&&!(s.mode==='tuck'&&!types.includes('tuck'))) out.push(s); } return out; }
  /** 비어 있는 자리 하나 (가까울수록 잘 고른다) */
  findSlot(pet,types,filter){
    let best=null, bw=0;
    for(const p of this.props){ if(p.editing) continue; for(const s of p.slots){
      const kind=s.type==='path'?s.mode:s.type; if(!types.includes(kind)) continue;
      if(filter&&!filter(s)) continue;
      if(s.type==='cabin'){ const q=s.queue||(s.queue=[]); if(q.length>=3||q.length+(s.riders||0)>=6) continue; }
      else if(s.busy) continue;
      if(s.type==='wheel'&&s.second){ const first=p.slots.find(x=>x.type==='wheel'&&!x.second); if(!first?.busy) continue; }
      const e=this.slotEntry(s); const d=Math.hypot(e.x-pet.x,e.z-pet.z); const w=Math.random()/(0.25+d);
      if(w>bw){ bw=w; best=s; }
    } }
    return best;
  }
  slotEntry(s){ const p=s.prop;
    if(s.type==='hide') return {x:this.lp(p,s.entry.x,0,s.entry.z).x,z:this.lp(p,s.entry.x,0,s.entry.z).z,h:this.lh(p,s.entry.h)};
    if(s.type==='path'){ const a=this.lp(p,...s.pts[0]); const b=this.lp(p,...s.pts[1]); return {x:a.x,z:a.z,h:Math.atan2(b.x-a.x,b.z-a.z)}; }
    if(s.type==='cabin'){ const a=this.lp(p,s.board.x,0,s.board.z); return {x:a.x,z:a.z,h:this.lh(p,s.board.h)}; }
    if(s.type==='cup'||s.type==='wheel'){ const a=this.lp(p,s.approach.x,0,s.approach.z); return {x:a.x,z:a.z,h:this.lh(p,s.approach.h)}; }
    const a=this.lp(p,s.x,0,s.z); return {x:a.x,z:a.z,h:this.lh(p,s.h)};
  }
  /** 소품의 꺾은선 길을 테라리움 좌표 Path로 */
  slotPath(s,which='pts'){
    const p=s.prop; const key='_path'+which;
    if(s[key]&&s[key].rot===p.rot&&s[key].x===p.x&&s[key].z===p.z) return s[key].path;
    const src=which==='ladder'?p.pool.ladder:s;
    const pts=src.pts.map(q=>this.lp(p,q[0],q[1],q[2])), nrm=src.nrm.map(q=>this.ln(p,q[0],q[1],q[2]));
    const path=new Path(pts,nrm); s[key]={path,rot:p.rot,x:p.x,z:p.z}; return path;
  }
  corpses(){ return this.pets.filter(p=>p.dead&&!p.buried); }

  // ───────── 대화: 둘이 마주 보고 서서 한마디씩 주고받는다 (한 번에 한 쌍만) ─────────
  /** 말을 걸거나 받을 수 있는 놈: 바닥에서 쉬거나 걷는 중이고, 막 들어온 놈은 아니다 */
  canTalk(p){
    if(p.dead||p.away||p.mode!=='floor'||p.hidden) return false;
    const a=p.act, t=a?.type;
    if(!(t==='rest'||t==='groom'||t==='investigate'||t==='meet'||(t==='walk'&&!a.slot))) return false;
    if(p.rec.arrived&&Date.now()-p.rec.arrived<45000) return false;
    return true;
  }
  /** 대화 하나 고르기: 다 한 번씩 나오기 전엔 같은 게 다시 안 나온다 */
  pickTalk(){ if(!this.talkBag.length) this.talkBag=TALKS.map((_,i)=>i).sort(()=>Math.random()-0.5); const L=TALKS[this.talkBag.pop()]; return Array.isArray(L)?L.filter(x=>typeof x==='string'&&x.trim()):[]; }
  /** 나중에 들어온 놈이 먼저 묻는다. walk면 묻는 놈이 상대 앞까지 걸어간다 */
  startTalk(p,q,walk=false){
    if(this.talk) this.endTalk();
    const lines=this.pickTalk(); if(!lines.length) return false;
    const [a,b]=(p.rec.born||0)>=(q.rec.born||0)?[p,q]:[q,p];
    const T={id:++this.talkSeq,a,b,lines,i:-1,lineT:0,next:walk?0:0.6,phase:walk?'approach':'talk',fade:0,t:0,over:false};
    this.talk=T; this.talkCD=rand(28,55); a.stuck=0; b.stuck=0;
    a.setAct({type:'talk',talk:T,other:b,role:'a',walk});
    b.setAct({type:'talk',talk:T,other:a,role:'b',walk:false});
    return true;
  }
  /** 걷다가 마주친 둘: 지난 대화에서 한참 지났으면 가끔 그대로 말을 건다 */
  meetTalk(p,q){ if(this.talk||!this.talkOn||this.talkCD>14||Math.random()<0.4) return false; if(!this.canTalk(p)||!this.canTalk(q)) return false; return this.startTalk(p,q,false); }
  endTalk(){ const T=this.talk; if(!T) return; this.talk=null; T.over=true; for(const p of [T.a,T.b]) if(p.act?.type==='talk'&&p.act.talk===T&&!p.dead) p.chooseNext(); }
  /** 매 프레임. on=false(꾸미는 중·소품 옮기는 중)면 하던 대화를 끊고 새로 걸지 않는다 */
  updateTalk(dt,on=true){
    this.talkOn=on;
    const T=this.talk;
    if(!T){
      if(!on) return;
      this.talkCD-=dt; if(this.talkCD>0) return;
      this.talkCD=rand(2.5,5);  // 짝이 없으면 조금 있다 다시 본다
      const L=this.pets.filter(p=>this.canTalk(p)); if(L.length<2) return;
      const p=pick(L); let q=null, d=1e9;
      for(const o of L){ if(o===p) continue; const e=Math.hypot(o.x-p.x,o.z-p.z); if(e<d){ d=e; q=o; } }
      if(!q||d>0.75) return;
      this.startTalk(p,q,d>0.15);
      return;
    }
    const live=x=>x.act?.type==='talk'&&x.act.talk===T&&!x.dead&&!x.away;
    if(!on||!live(T.a)||!live(T.b)){ this.endTalk(); return; }
    T.t+=dt;
    if(T.phase==='approach'){ if(T.a.act.arrived){ T.phase='talk'; T.next=0.45; } else if(T.t>8/Math.max(0.45,T.a.slowK)) this.endTalk(); return; }   // 늙어 느린 놈은 더 기다린다
    T.lineT+=dt; T.next-=dt;
    if(T.phase==='talk'){ if(T.next<=0){
      if(T.i<T.lines.length-1){ T.i++; T.lineT=0; T.next=talkLineDur(T.lines[T.i]); this.events.talkLine?.(T); }
      else { T.phase='hold'; T.next=2.6; } } }
    else if(T.phase==='hold'){ if(T.next<=0){ T.phase='fade'; T.fade=0; } }
    else if(T.phase==='fade'){ T.fade=Math.min(1,T.fade+dt/0.45); if(T.fade>=1) this.endTalk(); }
  }
}

// ══════════════════════════════════════════════════════════════════
// 한 마리
// ══════════════════════════════════════════════════════════════════
export class Pet{
  constructor(rec,world){
    this.rec=rec; this.world=world; this.id=rec.id;
    this.m=new PetModel({size:rec.size||1});
    applyDeco(this.m,rec.deco);
    const p=world.randomFree(40,Math.random()<0.6); this.x=rec.x??p.x; this.z=rec.z??p.z; this.h=rec.h??rand(TAU);
    this.mode='floor'; this.ignore=null;
    this.pos=new THREE.Vector3(this.x,0,this.z); this.quat=new THREE.Quaternion().setFromAxisAngle(_up,this.h);
    this.tPos=this.pos.clone(); this.tQuat=this.quat.clone(); this.snap=true;
    this.T={}; this.act=null; this.hunger=rand(0.2,0.8); this.thirst=rand(0.2,0.8); this.speed=0;
    this.dead=!!rec.dead; this.buried=false; this.age01=0;
    this.inspectT=0; this.runFast=0; this.meetCD=rand(3,8); this.lastStep=0; this.lookT=0; this.lookDir=new THREE.Vector3(0,0.8,0.6).normalize();
    this.F={p:new THREE.Vector3(),n:new THREE.Vector3(),t:new THREE.Vector3()};
    this.updateAge(Date.now());
    if(this.dead){ this.startDeadPose(); }
    else this.setAct({type:'rest',dur:rand(2,10)});
  }
  get name(){ return this.rec.name||`${this.rec.no}호`; }
  /** 숨는 곳 안에 들어가 안 보이는 중 */
  get hidden(){ const a=this.act; return !!a&&((a.type==='hide'&&a.ph===1)||(a.type==='path'&&a.kind==='tuck'&&a.ph===1)); }
  get days(){ const end=this.dead?(this.rec.diedAt||Date.now()):Date.now(); return Math.max(0,Math.floor((end-this.rec.born)/DAY)); }
  updateAge(now){
    const life=(this.rec.life||30)*DAY;
    this.age01=clamp((now-this.rec.born)/life,0,1.2);
    this.m.setAge(sstep(0.62,1,this.age01),this.dead?1:0);
  }
  get slowK(){ return 1-0.45*sstep(0.62,1,this.age01); }

  // ───────── 활동 ─────────
  setAct(a){ if(this.act) this.endAct(this.act); a.t=0; a.ph=a.ph||0; this.act=a; }
  endAct(a){
    if(a.slot){ const s=a.slot; if(s.busy===this) s.busy=null; if(s.queue){ const i=s.queue.indexOf(this); if(i>=0) s.queue.splice(i,1); } }
    if(a.poke) a.poke.userData.show=false;
    if(a.rider){ const w=a.slot?.prop?.wheel; if(w){ const i=w.riders.indexOf(a.rider); if(i>=0) w.riders.splice(i,1); } }
    if(a.cabinBusy!==undefined&&a.slot){ a.slot.cabinBusy?.delete(a.cabinBusy); a.slot.riders=Math.max(0,(a.slot.riders||1)-1); }
    this.ignore=null; this.m.g.visible=true;
  }
  /** 다음 할 일 고르기 */
  chooseNext(){
    const W=this.world; const now=Date.now();
    const newcomer=this.rec.arrived&&now-this.rec.arrived<100000;
    const old=sstep(0.62,1,this.age01);
    const opts=[];
    const add=(w,f)=>{ if(w>0) opts.push([w,f]); };
    add(3+2*old,()=>this.goRest());
    add(2.2*(1-0.5*old),()=>this.goWander());
    add(1.1,()=>this.setAct({type:'groom',dur:rand(3,7),side:Math.random()<0.5?1:-1,leg:Math.random()<0.3}));
    const hide=['hide','tuck','perch']; if(W.findSlot(this,hide)) add(newcomer?12:2.6,()=>this.goSlot(hide));
    if(W.findSlot(this,['eat'])) add(this.hunger>0.7?5:0.4,()=>this.goSlot(['eat']));
    if(W.findSlot(this,['drink'])) add(this.thirst>0.7?5:0.4,()=>this.goSlot(['drink']));
    if(!newcomer){
      for(const k of ['cabin','cup','wheel','oneway','climb']) if(W.findSlot(this,[k])) add((k==='climb'?1.2:1.0)*(1-0.6*old),()=>this.goSlot([k]));
      add(0.7*(1-0.7*old),()=>this.goGlass());
    }
    let sum=0; for(const o of opts) sum+=o[0]; let r=Math.random()*sum;
    for(const o of opts){ r-=o[0]; if(r<=0){ o[1](); return; } }
    this.goRest();
  }
  goRest(){
    const W=this.world;
    // 벽이나 다른 놈 옆에 붙어 쉬는 걸 좋아한다
    let spot=null;
    const buddies=W.pets.filter(p=>p!==this&&!p.dead&&p.mode==='floor'&&p.act?.type==='rest');
    if(buddies.length&&Math.random()<0.45){ const b=pick(buddies); const a=rand(TAU); const x=b.x+Math.sin(a)*0.075, z=b.z+Math.cos(a)*0.075; if(W.freeAt(x,z)) spot={x,z}; }
    if(!spot&&Math.random()<0.6) spot=W.randomFree(20,true);
    if(spot) this.setAct({type:'walk',tx:spot.x,tz:spot.z,spd:rand(0.08,0.15),then:()=>this.setAct({type:'rest',dur:rand(6,22)*(1+this.age01)})});
    else this.setAct({type:'rest',dur:rand(6,20)});
  }
  goWander(){ const p=this.world.randomFree(20,Math.random()<0.55); this.setAct({type:'walk',tx:p.x,tz:p.z,spd:rand(0.07,0.2),pause:Math.random()<0.5,then:()=>this.chooseNext()}); }
  goSlot(types){
    const W=this.world, s=W.findSlot(this,types); if(!s){ this.goWander(); return; }
    const e=W.slotEntry(s);
    if(s.type==='cabin'){ (s.queue||(s.queue=[])).push(this); this.setAct({type:'queue',slot:s}); return; }
    s.busy=this;
    const next=()=>this.startSlot(s);
    this.setAct({type:'walk',tx:e.x,tz:e.z,spd:rand(0.1,0.18),face:e.h,slot:s,then:next,keepSlot:true});
  }
  startSlot(s){
    const W=this.world; const kind=s.type==='path'?s.mode:s.type;
    const fresh=this.rec.arrived&&Date.now()-this.rec.arrived<100000;   // 막 들어온 놈은 금방 다시 나와 둘러본다
    if(kind==='hide') this.setAct({type:'hide',slot:s,ph:0,dur:fresh?rand(12,30):rand(25,90)});
    else if(s.type==='path') this.setAct({type:'path',slot:s,path:W.slotPath(s),s:0,dir:1,ph:0,dur:kind==='tuck'?rand(20,70):kind==='perch'?rand(12,40):rand(2,5),kind});
    else if(kind==='eat'||kind==='drink') this.setAct({type:'feed',slot:s,dur:kind==='eat'?rand(6,14):rand(4,9),kind});
    else if(kind==='cup') this.setAct({type:'cup',slot:s,ph:0,dur:rand(15,32)});
    else if(kind==='wheel') this.setAct({type:'wheel',slot:s,ph:0});
    else this.chooseNext();
  }
  goGlass(){
    // 유리 벽을 타고 올라간다 (바셀린 띠 아래까지)
    const W=this.world; let tries=12;
    while(tries--){
      const side=Math.floor(rand(4)); const t=rand(-0.8,0.8);
      const m=0.004; let wx,wz,nx,nz;
      if(side===0){ wx=-TANK.hw+m; wz=t*TANK.hd; nx=1; nz=0; } else if(side===1){ wx=TANK.hw-m; wz=t*TANK.hd; nx=-1; nz=0; } else if(side===2){ wx=t*TANK.hw; wz=-TANK.hd+m; nx=0; nz=1; } else { wx=t*TANK.hw; wz=TANK.hd-m; nx=0; nz=-1; }
      const fx=wx+nx*0.12, fz=wz+nz*0.12; if(!W.freeAt(fx,fz,PR+0.02)||!W.freeAt(wx+nx*0.04,wz+nz*0.04,PR)) continue;
      const top=rand(0.24,TANK.band-0.08);
      const pts=[V(fx,0,fz),V(wx+nx*0.03,0,wz+nz*0.03),V(wx+nx*0.004,0.012,wz+nz*0.004),V(wx,0.04,wz),V(wx,top,wz)];
      const nrm=[V(0,1,0),V(0,1,0),V(nx,0.6,nz),V(nx,0,nz),V(nx,0,nz)];
      const path=new Path(pts,nrm);
      this.setAct({type:'walk',tx:fx,tz:fz,spd:rand(0.1,0.16),face:Math.atan2(-nx,-nz),then:()=>this.setAct({type:'path',path,s:0,dir:1,ph:0,dur:rand(2,7),kind:'glass'})});
      return;
    }
    this.goWander();
  }

  // ───────── 매 프레임 ─────────
  update(dt){
    const W=this.world, a=this.act; const T=this.T;
    for(const k in T) T[k]=0;
    T.speed=0;
    if(!this.dead){
      this.hunger=Math.min(1.2,this.hunger+dt/240); this.thirst=Math.min(1.2,this.thirst+dt/200);
      if(this.inspectT>0){ this.inspectT-=dt; }
    }
    a.t+=dt;
    const fn=this['act_'+a.type]; if(fn) fn.call(this,dt,a,T); else this.chooseNext();
    // 눌렀을 때: 하던 걸 멈추고 더듬이를 들어 사람 쪽을 본다
    if(this.lookT>0&&!this.dead){ this.lookT-=dt; if(this.mode==='floor'&&(a.type==='rest'||a.type==='groom'||a.type==='feed'||a.type==='meet'||a.type==='investigate')){ T.aim=1; T.groom=0; T.legGroom=0; this.m.aimDir.copy(this.lookDir); } }
    // 꾸민 것 신경 쓰기: 한동안 더듬이로 등을 더듬는다
    if(this.inspectT>0&&this.mode==='floor'&&(a.type==='rest'||a.type==='groom')){ T.aim=1; this.m.aimDir.set(Math.sin(W.time*1.3)*0.5,0.75,-0.6).normalize(); }
    // 바람: 더듬이가 날리고, 세면 도망간다
    if(this.mode==='floor'&&!this.dead){ const w=W.windAt(this.x,this.z); if(w.k>0.05){ T.stream=1; const inv=_q.copy(this.quat).invert(); this.m.streamDir.set(w.wx,0.25,w.wz).normalize().applyQuaternion(inv); if(w.k>0.25&&a.type!=='flee'&&this.canBeStartled()) this.startFlee(this.x-w.wx,this.z-w.wz,rand(1.2,2.2)); }
      const lk=W.lightAt(this.x,this.z); if(lk>0.3&&a.type!=='flee'&&this.canBeStartled()){ const c=W.lightCenter(this.x,this.z); if(c) this.startFlee(c.x,c.z,rand(1,1.8)); } }
    // 모자: 빨리 뛰면 미끄러져 떨어진다
    if(this.m.hat&&this.speed>0.42){ this.runFast+=dt; if(this.runFast>0.5&&Math.random()<dt*2.5){ this.runFast=0; W.events.hatFall?.(this); } } else this.runFast=Math.max(0,this.runFast-dt);
    this.m.animate(dt,T);
    // 표시 위치: 목표로 부드럽게 따라간다 (탈것에 붙어 있을 땐 바로)
    if(this.snap){ this.pos.copy(this.tPos); this.quat.copy(this.tQuat); this.snap=false; }
    else { const k=this.mode==='attach'?1:1-Math.exp(-22*dt), kq=this.mode==='attach'?1:1-Math.exp(-16*dt); this.pos.lerp(this.tPos,k); this.quat.slerp(this.tQuat,kq); }
    this.m.g.position.copy(this.pos); this.m.g.quaternion.copy(this.quat);
  }
  /** 쓰던 소품이 사라졌다: 바닥으로 내려와(높은 데 있었으면 떨어져) 도망간다 */
  evict(){
    if(this.dead) return;
    const y=this.tPos.y;
    this.x=this.tPos.x; this.z=this.tPos.z;
    const r=this.world.resolve(this.x,this.z,null); this.x=r.x; this.z=r.z;
    this.m.g.visible=true;
    if(y>0.03) this.setAct({type:'drop',y0:y});
    else { this.floorPose(); this.setAct({type:'flee',h:rand(TAU),dur:rand(0.9,1.6)}); }
  }
  usesProp(p){ const a=this.act; if(!a) return false; if(a.slot?.prop===p) return true; if(a.type==='swim'&&a.pool===p) return true; return false; }
  canBeStartled(){ const t=this.act?.type; return !this.dead&&(t==='rest'||t==='walk'||t==='groom'||t==='feed'||t==='investigate'||t==='meet'||t==='talk'); }
  startFlee(ax,az,dur){ const h=Math.atan2(this.x-ax,this.z-az)+rand(-0.5,0.5); this.setAct({type:'flee',h,dur}); }
  // 바닥 자세
  floorPose(){ this.tPos.set(this.x,0,this.z); this.tQuat.setFromAxisAngle(_up,this.h); this.mode='floor'; }
  /** 바닥에서 (tx,tz) 쪽으로 한 걸음. 막히면 벽을 따라 미끄러진다. 남은 거리를 돌려준다 */
  stepFloor(dt,tx,tz,spd,T){
    const dx=tx-this.x, dz=tz-this.z, d=Math.hypot(dx,dz);
    if(d<0.004){ this.speed=damp(this.speed,0,10,dt); this.floorPose(); return d; }
    const want=Math.atan2(dx,dz); const diff=wrap(want-this.h);
    const turn=(4+spd*10)*dt; this.h+=clamp(diff,-turn,turn);
    const align=Math.cos(diff); const v=Math.min(spd*clamp(align,0.15,1)*this.slowK,d/Math.max(dt,1e-4));
    this.speed=damp(this.speed,v,12,dt);
    let nx=this.x+Math.sin(this.h)*this.speed*dt, nz=this.z+Math.cos(this.h)*this.speed*dt;
    // 죽은 놈 근처는 피해 간다
    for(const c of this.world.corpses()){ if(c===this) continue; const ex=nx-c.x, ez=nz-c.z, e=Math.hypot(ex,ez); if(e<0.13&&e>1e-4){ nx+=ex/e*(0.13-e)*0.5; nz+=ez/e*(0.13-e)*0.5; } }
    // 다른 놈과 겹치지 않게 살짝 밀기
    for(const o of this.world.pets){ if(o===this||o.mode!=='floor'||o.dead) continue; const ex=nx-o.x, ez=nz-o.z, e=Math.hypot(ex,ez); if(e<0.06&&e>1e-4){ const k=(0.06-e)*0.5; nx+=ex/e*k; nz+=ez/e*k; } }
    const r=this.world.resolve(nx,nz,this);
    if(r.hit){ // 벽에 닿으면 벽을 따라 돌아 나간다
      const tan=Math.atan2(-r.hit.nz,r.hit.nx); const t1=tan, t2=tan+PI; const pickT=Math.abs(wrap(t1-want))<Math.abs(wrap(t2-want))?t1:t2; this.h+=clamp(wrap(pickT-this.h),-turn*1.5,turn*1.5); this.stuck=(this.stuck||0)+dt; }
    else this.stuck=Math.max(0,(this.stuck||0)-dt*2);
    this.x=r.x; this.z=r.z;
    T.speed=this.speed/0.35; this.floorPose();
    this.footsteps(dt);
    return Math.hypot(tx-this.x,tz-this.z);
  }
  footsteps(dt){ this.lastStep-=dt*this.speed*30; if(this.lastStep<0){ this.lastStep=1; this.world.sfx.step?.(this.pos,this.speed); } }

  // ───────── 활동별 처리 ─────────
  act_rest(dt,a,T){ T.crouch=1; this.speed=0; this.floorPose();
    if(!a.groomAt) a.groomAt=rand(3,9);
    if(a.t>a.groomAt&&a.t<a.groomAt+rand(2.5,4)){ T.groom=1; T.groomSide=a.side||(a.side=Math.random()<0.5?1:-1); }
    if(a.t>a.dur) this.chooseNext(); }
  act_groom(dt,a,T){ this.speed=0; this.floorPose(); if(a.leg) T.legGroom=1; else T.groom=1; T.groomSide=a.side; T.crouch=0.5;
    if(!a.leg&&this.m.abow&&(this.rec.deco?.abow?.side||1)===a.side&&a.t>2.2&&!a.bowDone){ a.bowDone=true; if(Math.random()<0.35) this.world.events.bowFall?.(this); }
    if(a.t>a.dur) this.chooseNext(); }
  act_walk(dt,a,T){
    if(a.pause&&a.t>a.pauseAt){ if(!a.pauseAt){} }
    if(a.pause&&!a.pauseAt) a.pauseAt=rand(1,3);
    if(a.pause&&a.t>a.pauseAt&&a.t<a.pauseAt+0.8){ this.speed=0; T.crouch=0.3; this.floorPose(); return; }
    const d=this.stepFloor(dt,a.tx,a.tz,a.spd,T);
    this.checkMeet(a);
    if(d<0.012||(this.stuck>1.4)){
      if(this.stuck>1.4&&d>0.03){ this.stuck=0; if(a.slot&&a.keepSlot){ a.slot.busy=null; a.slot=null; } this.goWander(); return; }
      if(a.face!==undefined){ const diff=wrap(a.face-this.h); this.h+=clamp(diff,-6*dt,6*dt); this.floorPose(); if(Math.abs(diff)>0.08) return; }
      const then=a.then; if(a.keepSlot) a.slot=null; then?then():this.chooseNext(); }
  }
  checkMeet(a){
    if(a.slot||this.meetCD>0){ this.meetCD-=1/60; return; }
    for(const o of this.world.pets){ if(o===this||o.dead||o.mode!=='floor'||o.act?.type!=='walk'||o.act.slot) continue; const d=Math.hypot(o.x-this.x,o.z-this.z); if(d<0.13&&d>0.04){ const face=Math.cos(wrap(Math.atan2(o.x-this.x,o.z-this.z)-this.h)); if(face>0.6&&Math.random()<0.5){ if(this.world.meetTalk(this,o)) return; this.meetCD=rand(6,14); o.meetCD=rand(6,14); this.setAct({type:'meet',other:o,dur:rand(1.2,2.6)}); o.setAct({type:'meet',other:this,dur:rand(1.2,2.6)}); return; } } }
  }
  act_meet(dt,a,T){ const o=a.other; this.speed=0; const want=Math.atan2(o.x-this.x,o.z-this.z); this.h+=clamp(wrap(want-this.h),-5*dt,5*dt); this.floorPose();
    T.aim=1; const inv=_q.copy(this.quat).invert(); this.m.aimDir.set(o.x-this.x,0.02,o.z-this.z).normalize().applyQuaternion(inv);
    if(a.t>a.dur) this.goWander(); }
  /** 대화: 묻는 놈은 상대 앞까지 걸어가고, 둘이 마주 보고 선다. 말하는 쪽은 말 꺼낼 때 고개를 살짝 들고 더듬이를 까딱인다 */
  act_talk(dt,a,T){
    const Tk=a.talk, o=a.other;
    if(!Tk||Tk.over||!o){ this.chooseNext(); return; }
    if(a.walk&&!a.arrived){
      const dx=this.x-o.x, dz=this.z-o.z, d=Math.hypot(dx,dz)||1;
      const left=this.stepFloor(dt,o.x+dx/d*0.1,o.z+dz/d*0.1,0.13,T);
      if(left<0.014||d<0.115||this.stuck>1.2){ a.arrived=true; this.stuck=0; }
      return;
    }
    this.speed=damp(this.speed,0,10,dt);
    const want=Math.atan2(o.x-this.x,o.z-this.z); this.h+=clamp(wrap(want-this.h),-4*dt,4*dt); this.floorPose();
    T.crouch=0.3; T.aim=1;
    const inv=_q.copy(this.quat).invert(); this.m.aimDir.set(o.x-this.x,0.03,o.z-this.z).normalize().applyQuaternion(inv);
    const mine=Tk.phase==='talk'&&Tk.i>=0&&((Tk.i%2===0)===(a.role==='a'));
    if(mine&&Tk.lineT<1){ const u=Tk.lineT; T.pitch=-0.07*Math.sin(PI*u); this.m.aimDir.y+=0.22*Math.sin(u*PI*3); this.m.aimDir.normalize(); }
  }
  act_flee(dt,a,T){ const tx=this.x+Math.sin(a.h)*0.3, tz=this.z+Math.cos(a.h)*0.3; this.stepFloor(dt,tx,tz,0.75,T); a.h+=rand(-1,1)*dt; if(this.stuck>0.3){ a.h+=PI*0.6; this.stuck=0; } if(a.t>a.dur) this.goRest(); }
  act_investigate(dt,a,T){
    if(!a.arrived){ const d=this.stepFloor(dt,a.tx,a.tz,0.16,T); if(d<0.015||this.stuck>1){ a.arrived=true; a.t=0; } return; }
    this.speed=0; const want=Math.atan2(a.fx-this.x,a.fz-this.z); this.h+=clamp(wrap(want-this.h),-5*dt,5*dt); this.floorPose();
    T.aim=1; const inv=_q.copy(this.quat).invert(); this.m.aimDir.set(a.fx-this.x,0.04+Math.sin(a.t*6)*0.03,a.fz-this.z).normalize().applyQuaternion(inv);
    if(a.t>a.dur) this.goWander(); }
  act_feed(dt,a,T){
    this.speed=0; this.floorPose(); T.eat=1;
    if(a.kind==='eat'){ this.hunger=Math.max(0,this.hunger-dt/8); if(Math.random()<dt*3) this.world.sfx.chew?.(this.pos); }
    else { this.thirst=Math.max(0,this.thirst-dt/6); if(Math.random()<dt*1.2) this.world.sfx.sip?.(this.pos);
      if(a.slot.pool&&a.t>1.5&&!a.rolled){ a.rolled=true; if(Math.random()<0.28){ this.fallInPool(a.slot); return; } } }
    if(a.t>a.dur) this.chooseNext(); }
  act_hide(dt,a,T){
    const W=this.world, s=a.slot, p=s.prop;
    const e=W.lp(p,s.entry.x,0,s.entry.z), ins=W.lp(p,s.inside.x,s.inside.y||0,s.inside.z);
    const IN=0.9, OUT=0.9;
    if(a.ph===0){ this.ignore=p; const k=Math.min(1,a.t/IN); this.x=lerp(e.x,ins.x,k); this.z=lerp(e.z,ins.z,k); T.speed=0.4; this.tPos.set(this.x,lerp(0,ins.y,k),this.z); this.h=W.lh(p,s.entry.h); this.tQuat.setFromAxisAngle(_up,this.h); this.mode='slot';
      if(k>=1){ a.ph=1; a.t=0; this.m.g.visible=false; if(s.poke) a.poke=this.world.events.poke?.(s,true); this.world.sfx.rustle?.(this.pos); } return; }
    if(a.ph===1){ this.m.g.visible=false; this.speed=0; if(a.t>a.dur){ a.ph=2; a.t=0; this.m.g.visible=true; this.world.events.poke?.(s,false); } return; }
    const k=Math.min(1,a.t/OUT); this.x=lerp(ins.x,e.x,k); this.z=lerp(ins.z,e.z,k); T.speed=0.4; T.back=1; this.tPos.set(this.x,lerp(ins.y,0,k),this.z);
    if(k>=1){ this.ignore=null; s.busy=null; a.slot=null; this.floorPose(); this.goWander(); }
  }
  act_path(dt,a,T){
    const path=a.path, F=this.F; this.mode='path';
    const kind=a.kind;
    const spd=(kind==='oneway'?0.13:kind==='glass'?0.1:0.11)*this.slowK;
    if(a.ph===0){ // 올라가거나 들어간다
      a.s+=spd*dt; T.speed=spd/0.35*1.1;
      const end=path.len*(a.slot?.restAt??1);
      if(a.s>=end){ a.s=end; if(kind==='oneway'){ this.leavePath(path,1); return; } a.ph=1; a.t=0; }
      this.placeOnPath(path,a.s,1,false);
      if(a.slot?.slide&&a.s>path.len*0.75){ /* 미끄럼판 위 */ }
    } else if(a.ph===1){ // 쉰다
      T.crouch=1; this.placeOnPath(path,a.s,1,false);
      if(kind==='glass'&&a.t>1.2&&a.t<2.6){ T.groom=1; T.groomSide=1; }
      if(a.t>a.dur){ a.ph=kind==='tuck'?3:2; a.t=0; }
    } else if(a.ph===2){ // 그 자리에서 돈다
      const k=Math.min(1,a.t/0.9); this.placeOnPath(path,a.s,1,false,k*PI); T.speed=0.5;
      if(k>=1){ a.ph=4; a.t=0; a.slip=a.slot?.slide&&Math.random()<0.35; a.slipAt=rand(0.25,0.6); }
    } else if(a.ph===3){ // 뒷걸음질로 나온다
      a.s-=spd*0.8*dt; T.speed=spd/0.35; T.back=1; this.placeOnPath(path,a.s,1,false);
      if(a.s<=0){ this.leavePath(path,-1); return; }
    } else if(a.ph===4){ // 돌아서 내려온다 (미끄럼틀에선 가끔 미끄러져 뒤집힌다)
      if(a.slip&&a.s<path.len*(1-a.slipAt)&&!a.slipping){ a.slipping=true; this.world.sfx.slip?.(this.pos); }
      if(a.slipping){ a.v=Math.min(0.75,(a.v||0.1)+dt*1.8); a.s-=a.v*dt; T.flail=1; this.placeOnPath(path,a.s,1,true,PI); if(a.s<=0){ a.s=0; this.leavePath(path,-1,true); } return; }
      a.s-=spd*dt; T.speed=spd/0.35; this.placeOnPath(path,a.s,1,false,PI);
      if(a.s<=0){ this.leavePath(path,-1); return; }
    }
  }
  /** 길 위 자리. flip이면 등이 면에 닿게 뒤집힌다. yaw는 면 위에서 도는 각도 */
  placeOnPath(path,s,dir,flip,yaw=0){
    const F=path.at(s,this.F); const fwd=_v3.copy(F.t).multiplyScalar(dir);
    if(yaw){ fwd.applyAxisAngle(F.n,yaw); }
    if(flip){ this.tPos.copy(F.p).addScaledVector(F.n,ROACH_L*0.17); frameQuat(F.n.clone().negate(),fwd,this.tQuat); }
    else { this.tPos.copy(F.p); frameQuat(F.n,fwd,this.tQuat); }
    this.x=F.p.x; this.z=F.p.z;
  }
  leavePath(path,end,flipped=false){
    const F=path.at(end>0?path.len:0,this.F);
    this.x=F.p.x; this.z=F.p.z; const r=this.world.resolve(this.x,this.z,null); this.x=r.x; this.z=r.z;
    const t=F.t.clone().multiplyScalar(end>0?1:-1); this.h=Math.atan2(t.x,t.z);
    const s=this.act.slot; if(s&&s.busy===this) s.busy=null; this.act.slot=null;
    if(flipped) this.setAct({type:'onback',dur:rand(1.2,2.2)});
    else { this.floorPose(); this.setAct({type:'walk',tx:this.x+Math.sin(this.h)*0.12,tz:this.z+Math.cos(this.h)*0.12,spd:0.12,then:()=>Math.random()<0.4?this.setAct({type:'groom',dur:rand(2,4),side:1}):this.chooseNext()}); }
  }
  /** 뒤집혀 버둥대다 몸을 뒤집어 일어난다 */
  act_onback(dt,a,T){
    this.mode='floor'; const up=a.t<a.dur?1:Math.max(0,1-(a.t-a.dur)/0.45);
    const roll=PI*up; _q.setFromAxisAngle(_up,this.h); const r=new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0,0,1),roll);
    this.tQuat.copy(_q).multiply(r); this.tPos.set(this.x,ROACH_L*0.17*Math.sin(roll*0.5)*1.0*(up>0.5?1:up*2),this.z);
    if(up>0.02) T.flail=1;
    if(Math.random()<dt*6&&up>0.5) this.world.sfx.scrabble?.(this.pos);
    if(a.t>a.dur+0.45){ this.floorPose(); this.setAct({type:'groom',dur:rand(2,4),side:Math.random()<0.5?1:-1}); }
  }
  // 관람차: 승강장에서 줄 서서 기다리다 빈 칸이 오면 탄다
  act_queue(dt,a,T){
    const W=this.world, s=a.slot, p=s.prop; s.cabinBusy=s.cabinBusy||new Set();
    const idx=s.queue.indexOf(this); if(idx<0){ this.chooseNext(); return; }
    const b=W.lp(p,s.board.x,0,s.board.z+idx*0.1+0.0), h=W.lh(p,s.board.h);
    const d=this.stepFloor(dt,b.x,b.z,0.13,T);
    if(d<0.015){ this.speed=0; const diff=wrap(h-this.h); this.h+=clamp(diff,-5*dt,5*dt); this.floorPose(); T.crouch=0.4;
      T.aim=1; this.m.aimDir.set(0,0.6,1).normalize();
      if(idx===0){ const c=p.cabinAtBoard(s.cabinBusy); if(c){ s.queue.shift(); s.cabinBusy.add(c.i); s.riders=(s.riders||0)+1; const act={type:'cabin',slot:s,cabin:c,ph:0,laps:rand(0.8,1.8),from:new THREE.Vector3(this.x,0,this.z)}; act.cabinBusy=c.i; this.act=null; this.setAct(act); } } }
    if(a.t>90){ this.chooseNext(); }
  }
  act_cabin(dt,a,T){
    const W=this.world, p=a.slot.prop, c=a.cabin; c.seat.updateWorldMatrix(true,false);
    const seatP=_v.setFromMatrixPosition(c.seat.matrixWorld).clone();
    const wq=c.seat.getWorldQuaternion(new THREE.Quaternion());
    const look=new THREE.Quaternion().setFromAxisAngle(_up,a.face??(a.face=Math.random()<0.5?0:PI));
    if(a.ph===0){ const k=Math.min(1,a.t/0.55); this.tPos.copy(a.from).lerp(seatP,k); this.tPos.y+=Math.sin(k*PI)*0.03; this.tQuat.copy(wq).multiply(look); T.speed=0.6; this.mode='slot'; if(k>=1){ a.ph=1; a.t=0; a.ang0=p.cabinAngle(c); a.turned=0; } return; }
    if(a.ph===1){ this.mode='attach'; this.tPos.copy(seatP); this.tQuat.copy(wq).multiply(look); T.crouch=1; T.tuck=0.6; T.aim=1; this.m.aimDir.set(0,0.4,1).normalize();
      const ride=a.t*0.12/TAU; if(ride>a.laps&&p.atBottom(c)){ a.ph=2; a.t=0; a.from2=seatP.clone(); }
      return; }
    const out=W.lp(p,a.slot.board.x,0,a.slot.board.z+0.04); const k=Math.min(1,a.t/0.6); this.tPos.copy(a.from2).lerp(out,k); this.tPos.y+=Math.sin(k*PI)*0.025; this.mode='slot'; T.speed=0.6;
    this.h=W.lh(p,0); this.tQuat.setFromAxisAngle(_up,this.h);
    if(k>=1){ this.x=out.x; this.z=out.z; a.slot.cabinBusy.delete(c.i); a.slot.riders=Math.max(0,(a.slot.riders||1)-1); a.cabinBusy=undefined; a.slot=null; this.floorPose(); this.goWander(); }
  }
  // 커피잔
  act_cup(dt,a,T){
    const W=this.world, s=a.slot, p=s.prop, cup=p.cups[s.idx]; cup.seat.updateWorldMatrix(true,false);
    const seatP=_v.setFromMatrixPosition(cup.seat.matrixWorld).clone(); const wq=cup.seat.getWorldQuaternion(new THREE.Quaternion());
    if(!a.look) a.look=new THREE.Quaternion().setFromAxisAngle(_up,rand(TAU));
    if(a.ph===0){ if(!a.from) a.from=new THREE.Vector3(this.x,0,this.z); const k=Math.min(1,a.t/0.6); this.tPos.copy(a.from).lerp(seatP,k); this.tPos.y+=Math.sin(k*PI)*0.035; this.tQuat.copy(wq).multiply(a.look); T.speed=0.6; this.mode='slot'; if(k>=1){ a.ph=1; a.t=0; } return; }
    if(a.ph===1){ this.mode='attach'; this.tPos.copy(seatP); this.tQuat.copy(wq).multiply(a.look); T.crouch=1; T.tuck=1; T.pitch=-0.14; if(a.t>a.dur){ a.ph=2; a.t=0; a.from2=seatP.clone(); const c=W.lp(p,0,0,0); const dir=_v2.subVectors(seatP,c).setY(0).normalize(); a.out=c.clone().addScaledVector(dir,p.platR+0.08); a.out.y=0; } return; }
    const k=Math.min(1,a.t/0.6); this.tPos.copy(a.from2).lerp(a.out,k); this.tPos.y+=Math.sin(k*PI)*0.03; this.mode='slot'; T.speed=0.6; this.h=Math.atan2(a.out.x-a.from2.x,a.out.z-a.from2.z); this.tQuat.setFromAxisAngle(_up,this.h);
    if(k>=1){ const r=W.resolve(a.out.x,a.out.z,null); this.x=r.x; this.z=r.z; s.busy=null; a.slot=null; this.floorPose(); this.goWander(); }
  }
  // 쳇바퀴: 들어가 달리다 뚝 멈추면 바퀴에 실려 올라갔다가 미끄러져 내려온다
  act_wheel(dt,a,T){
    const W=this.world, s=a.slot, p=s.prop, w=p.wheel;
    const axle=W.lp(p,0,w.AX,0), zOff=s.second?-0.036:0.03;
    const bottom=W.lp(p,0,w.AX-w.R,zOff);
    const toW=(phi)=>{ const lx=Math.sin(phi)*w.R, ly=-Math.cos(phi)*w.R; return W.lp(p,lx,w.AX+ly,zOff); };
    const frameAt=(phi,dirSign,out)=>{ const pp=toW(phi); const n=W.ln(p,-Math.sin(phi),Math.cos(phi),0); const t=W.ln(p,Math.cos(phi)*dirSign,Math.sin(phi)*dirSign,0); this.tPos.copy(pp); frameQuat(n,t,out); };
    if(!a.rider){ a.rider={running:false,dir:1,runSpd:0}; a.phi=0; a.facing=Math.random()<0.5?1:-1; }
    if(a.ph===0){ if(!a.from) a.from=new THREE.Vector3(this.x,0,this.z); const k=Math.min(1,a.t/0.55); this.tPos.copy(a.from).lerp(bottom,k); this.tPos.y+=Math.sin(k*PI)*0.03; this.h=W.lh(p,PI); this.tQuat.setFromAxisAngle(_up,this.h); T.speed=0.6; this.mode='slot';
      if(k>=1){ a.ph=1; a.t=0; w.riders.push(a.rider); } return; }
    this.mode='attach';
    if(a.ph===1){ // 진행 방향으로 돌아선다
      const k=Math.min(1,a.t/0.45); const base=W.lh(p,PI); const tgt=W.lh(p,a.facing>0?PI/2:-PI/2); this.h=base+wrap(tgt-base)*k; this.tPos.copy(bottom); this.tQuat.setFromAxisAngle(_up,this.h); T.speed=0.4;
      if(k>=1){ a.ph=2; a.t=0; a.runFor=rand(4,11); a.rider.running=true; a.rider.runSpd=rand(0.38,0.6); a.rider.dir=-a.facing; } return; }
    if(a.ph===2){ // 달린다
      a.phi=damp(a.phi,0.18*a.facing,4,dt); frameAt(a.phi,a.facing,this.tQuat); T.speed=a.rider.runSpd/0.35*1.25; this.speed=a.rider.runSpd; this.footsteps(dt);
      // 둘이 반대로 달리면 한 놈이 튕겨 나간다
      const other=w.riders.find(r=>r!==a.rider&&r.running&&r.dir!==a.rider.dir); if(other&&Math.random()<dt*1.2){ a.rider.running=false; a.ph=3; a.t=0; this.world.sfx.slip?.(this.pos); return; }
      if(a.t>a.runFor){ a.rider.running=false; a.ph=3; a.t=0; } return; }
    if(a.ph===3){ // 멈췄는데 바퀴가 계속 돌아 실려 올라간다
      a.phi+=w.omega*dt; frameAt(a.phi,a.facing,this.tQuat); this.speed=0; T.crouch=0.6;
      if(Math.abs(a.phi)>0.95||(Math.abs(w.omega)<0.15&&a.t>0.6)){ a.ph=4; a.t=0; a.flip=Math.abs(a.phi)>0.95&&Math.random()<0.45; if(a.flip) this.world.sfx.slip?.(this.pos); } return; }
    if(a.ph===4){ // 미끄러져 내려온다
      a.phi=damp(a.phi,0,5,dt); frameAt(a.phi,a.facing,this.tQuat); if(a.flip){ T.flail=1; const r=new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0,0,1),PI*Math.min(1,a.t/0.25)*(a.t<1.6?1:Math.max(0,1-(a.t-1.6)/0.4))); this.tQuat.multiply(r); }
      if(a.t>(a.flip?2.1:0.8)){ a.ph=5; a.t=0; } return; }
    if(a.ph===5){ // 바퀴 안에서 손질
      frameAt(0,a.facing,this.tQuat); T.groom=1; T.groomSide=a.facing; if(a.t>rand(2,3.5)){ a.ph=6; a.t=0; const i=w.riders.indexOf(a.rider); if(i>=0) w.riders.splice(i,1); a.rider=null; a.from2=bottom.clone(); } return; }
    // 나간다
    const out=W.lp(p,s.approach.x,0,s.approach.z); const k=Math.min(1,a.t/0.55); this.tPos.copy(a.from2).lerp(out,k); this.tPos.y+=Math.sin(k*PI)*0.03; this.mode='slot'; this.h=W.lh(p,0); this.tQuat.setFromAxisAngle(_up,this.h); T.speed=0.6;
    if(k>=1){ this.x=out.x; this.z=out.z; s.busy=null; a.slot=null; this.floorPose(); this.goWander(); }
  }
  // 수영장에 빠짐 → 헤엄쳐 사다리로 → 기어 나와 몸 손질
  fallInPool(s){
    const W=this.world, p=s.prop, P=p.pool; s.busy=null;
    const c=Math.cos(p.rot), si=Math.sin(p.rot); const dx=this.x-p.x, dz=this.z-p.z; let lx=dx*c-dz*si, lz=dx*si+dz*c;
    lx=clamp(lx*0.6,-P.hw+0.04,P.hw-0.04); lz=clamp(lz*0.5,-P.hd+0.03,P.hd-0.03);
    const into=W.lp(p,lx,P.waterY,lz);
    this.setAct({type:'swim',pool:p,ph:0,from:new THREE.Vector3(this.x,0,this.z),into,slotRef:s});
    W.sfx.splash?.(into);
  }
  act_swim(dt,a,T){
    const W=this.world, p=a.pool, P=p.pool;
    if(a.ph===0){ const k=Math.min(1,a.t/0.5); this.tPos.copy(a.from).lerp(a.into,k); this.tPos.y=lerp(0,P.waterY,k)+Math.sin(k*PI)*0.035-0.004*k; this.mode='slot'; T.flail=k<0.8?1:0; this.tQuat.setFromAxisAngle(_up,this.h); if(k>=1){ a.ph=1; a.t=0; this.world.events.splash?.(this,a.into); } return; }
    if(a.ph===1){ // 사다리 쪽으로 헤엄
      const ladder=W.slotPath({prop:p,_pathladder:a._lp},'ladder'); a._lp=ladder; const L0=ladder.at(0,this.F).p.clone();
      const dx=L0.x-this.tPos.x, dz=L0.z-this.tPos.z, d=Math.hypot(dx,dz);
      const want=Math.atan2(dx,dz); this.h+=clamp(wrap(want-this.h),-2.5*dt,2.5*dt);
      const v=Math.min(0.045,d/Math.max(dt,1e-3)); this.tPos.x+=Math.sin(this.h)*v*dt; this.tPos.z+=Math.cos(this.h)*v*dt; this.tPos.y=P.waterY-0.004+Math.sin(a.t*7)*0.0015;
      this.tQuat.setFromAxisAngle(_up,this.h); T.swim=1; this.mode='slot';
      if(Math.random()<dt*2) this.world.events.ripple?.(this.tPos);
      if(d<0.01||a.t>30){ a.ph=2; a.t=0; a.s=0; }
      return; }
    // 사다리를 타고 나온다
    const ladder=a._lp; a.s+=0.08*dt; T.speed=0.35; this.placeOnPath(ladder,a.s,1,false); this.mode='path';
    if(a.s>=ladder.len){ this.leavePath(ladder,1); this.setAct({type:'groom',dur:rand(5,8),side:1}); this.wet=6; }
  }
  // 새로 들어올 때: 위에서 떨어진다
  act_drop(dt,a,T){
    if(a.v===undefined){ a.v=0; a.y=a.y0??0.5; a.spin=rand(-3,3); }
    a.v-=dt*2.4; a.y+=a.v*dt; this.h+=a.spin*dt; this.mode='slot'; T.flail=1;
    if(a.y<=0){ a.y=0; this.world.sfx.drop?.(this.pos); if(Math.random()<0.4){ this.floorPose(); this.setAct({type:'onback',dur:rand(0.8,1.6)}); } else { this.floorPose(); this.setAct({type:'flee',h:rand(TAU),dur:rand(0.8,1.4)}); } return; }
    this.tPos.set(this.x,a.y,this.z); this.tQuat.setFromAxisAngle(_up,this.h);
    const r=new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(1,0,0),Math.sin(a.t*5)*0.4); this.tQuat.multiply(r);
  }
  // 늙어 죽는다: 뒤집혀 한동안 다리를 젓다가 천천히 멈춘다
  startDying(){ this.setAct({type:'dying',ph:0}); }
  act_dying(dt,a,T){
    const roll=PI*Math.min(1,a.t/0.7); _q.setFromAxisAngle(_up,this.h); this.tQuat.copy(_q).multiply(new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0,0,1),roll));
    this.tPos.set(this.x,ROACH_L*0.17*Math.min(1,a.t/0.7)+Math.sin(Math.min(1,a.t/0.7)*PI)*0.02,this.z); this.mode='floor';
    const k=sstep(25,0,a.t); if(k>0.02){ T.flail=Math.random()<k?1:0; } else T.curl=1;
    if(a.t>28){ this.dead=true; this.rec.dead=true; this.rec.diedAt=this.rec.diedAt||Date.now(); this.world.events.died?.(this); this.startDeadPose(); }
  }
  startDeadPose(){ this.dead=true; this.act=null; this.setAct({type:'dead'}); }
  act_dead(dt,a,T){ T.curl=1; this.m.w.curl=Math.max(this.m.w.curl,a.t>0.1?this.m.w.curl:1); _q.setFromAxisAngle(_up,this.h); this.tQuat.copy(_q).multiply(new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0,0,1),PI)); this.tPos.set(this.x,ROACH_L*0.17,this.z); this.mode='floor'; }
}
const V=(x,y,z)=>new THREE.Vector3(x,y,z);
