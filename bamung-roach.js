// bamung-roach.js — 어항 속 바퀴벌레의 생김새·몸짓·꾸미기
// 모델은 1라운드(game.html)의 이질바퀴를 그대로 옮겨 왔다. 같은 놈이어야 하므로 모양·색은 손대지 않고,
// 어항에서 가까이 볼 때를 위해 머리·눈 구의 면 수만 늘렸다.
// 이 파일이 하는 일: ① 모델 ② 몸짓(걷기·쉬기·더듬이 손질·먹기·뒤집혀 버둥대기·헤엄·죽음) ③ 꾸미기(매니큐어·스티커·보석·모자·글씨)
import * as THREE from 'three';
import { DecalGeometry } from 'three/addons/geometries/DecalGeometry.js';

const clamp=(v,a,b)=>v<a?a:v>b?b:v;
const lerp=(a,b,t)=>a+(b-a)*t;
const rand=(a=1,b)=>b===undefined?Math.random()*a:a+Math.random()*(b-a);
const TAU=Math.PI*2;
const damp=(a,b,rate,dt)=>lerp(a,b,1-Math.exp(-rate*dt));

// ───────── 바퀴벌레 (이질바퀴) ─────────
// 몸 좌표: +z 머리, +y 위, x 좌우. 몸길이 약 1.2단위 = 실제 ROACH_L×1.2.
// 실험실 표본과 같은 종으로 맞춘다: 적갈색 광택, 앞가슴 등판은 옅은 테두리 안에 짙은 나비 무늬, 가시 돋친 납작한 다리.
const ROACH_TOP=0.15;   // 등(날개 위) 높이 — 뒤집힌 바퀴를 바닥에 눕힐 때 쓴다
// yaw: 넓적다리가 뻗는 방향(0=앞, π=뒤), ky: 무릎에서 종아리가 더 꺾이는 각도(+면 뒤로).
// 앞다리는 앞으로, 가운데·뒷다리는 뒤로 꺾여야 바퀴 윤곽이 나온다.
const LEG_DEF=[
  {z:0.30, yaw:0.75, ky:-0.35, fl:0.28, tl:0.30, w:0.85, tar:0.15},
  {z:0.06, yaw:1.90, ky:0.60,  fl:0.34, tl:0.40, w:1.0,  tar:0.19},
  {z:-0.20,yaw:2.25, ky:0.55,  fl:0.44, tl:0.56, w:1.15, tar:0.27},
];
const HIP_Y=0.05, LEG_ELEV=0.3;
for(const d of LEG_DEF){ const hK=HIP_Y+d.fl*Math.sin(LEG_ELEV); d.knee=-(LEG_ELEV+Math.asin(Math.min(0.98,hK/d.tl))); }

const _col=new THREE.Color();
const rgb=h=>{ _col.setHex(h); return [_col.r,_col.g,_col.b]; };
const rgbMix=(a,b,t)=>[a[0]+(b[0]-a[0])*t,a[1]+(b[1]-a[1])*t,a[2]+(b[2]-a[2])*t];
const rgbMul=(a,k)=>[a[0]*k,a[1]*k,a[2]*k];
const sstep=(a,b,x)=>{ const t=clamp((x-a)/(b-a),0,1); return t*t*(3-2*t); };
const hash3=(x,y,z)=>{ const s=Math.sin(x*127.1+y*311.7+z*74.7)*43758.5453; return s-Math.floor(s); };
function vnoise(x,y,z){ const xi=Math.floor(x),yi=Math.floor(y),zi=Math.floor(z),xf=x-xi,yf=y-yi,zf=z-zi; const u=xf*xf*(3-2*xf),v=yf*yf*(3-2*yf),w=zf*zf*(3-2*zf);
  const c=(a,b,d)=>hash3(xi+a,yi+b,zi+d);
  return lerp(lerp(lerp(c(0,0,0),c(1,0,0),u),lerp(c(0,1,0),c(1,1,0),u),v),lerp(lerp(c(0,0,1),c(1,0,1),u),lerp(c(0,1,1),c(1,1,1),u),v),w); }
function mulberry(a){ return ()=>{ a|=0; a=a+0x6D2B79F5|0; let t=Math.imul(a^a>>>15,1|a); t=t+Math.imul(t^t>>>7,61|t)^t; return ((t^t>>>14)>>>0)/4294967296; }; }
const V3=(x,y,z)=>new THREE.Vector3(x,y,z);
const Y_AXIS=V3(0,1,0);
function mtx(px=0,py=0,pz=0,rx=0,ry=0,rz=0,sx=1,sy=sx,sz=sx,order='XYZ'){ return new THREE.Matrix4().compose(V3(px,py,pz),new THREE.Quaternion().setFromEuler(new THREE.Euler(rx,ry,rz,order)),V3(sx,sy,sz)); }
// 피벗(px,py,pz)을 중심으로 돌린 뒤 (ox,oy,oz)만큼 옮긴다
function pivotM(px,py,pz,rx,ry,rz,ox=0,oy=0,oz=0){ return new THREE.Matrix4().makeTranslation(px+ox,py+oy,pz+oz).multiply(mtx(0,0,0,rx,ry,rz,1,1,1,'YXZ')).multiply(new THREE.Matrix4().makeTranslation(-px,-py,-pz)); }

// 여러 조각을 정점색이 든 한 덩어리로 합친다. 조각마다: 배치 → 변형(warp) → 전체 변환(M), 법선은 합친 뒤 조각별로 다시 구한다.
class GeoBuilder{
  constructor(){ this.pos=[]; this.nrm=[]; this.col=[]; this.idx=[]; }
  add(geo,cs,place,warp,M,post){
    const P=geo.attributes.position, C=geo.attributes.color, n=P.count;
    const v=new THREE.Vector3(), w=new THREE.Vector3(); const pa=new Float32Array(n*3), ca=[];
    for(let i=0;i<n;i++){
      v.fromBufferAttribute(P,i); w.copy(v); if(place) w.applyMatrix4(place);
      let c=typeof cs==='function'?cs(v,w,i):cs?cs:[C.getX(i),C.getY(i),C.getZ(i)];
      if(post) c=post(c,w,i);
      if(warp) warp(w,i);
      if(M) w.applyMatrix4(M);
      pa[i*3]=w.x; pa[i*3+1]=w.y; pa[i*3+2]=w.z; ca.push(c[0],c[1],c[2]);
    }
    const g=new THREE.BufferGeometry(); g.setAttribute('position',new THREE.BufferAttribute(pa,3));
    if(geo.index) g.setIndex(Array.from(geo.index.array)); g.computeVertexNormals();
    const base=this.pos.length/3, N=g.attributes.normal;
    for(let i=0;i<n;i++){ this.pos.push(pa[i*3],pa[i*3+1],pa[i*3+2]); this.nrm.push(N.getX(i),N.getY(i),N.getZ(i)); this.col.push(ca[i*3],ca[i*3+1],ca[i*3+2]); }
    if(geo.index){ const I=geo.index.array; for(let k=0;k<I.length;k++) this.idx.push(base+I[k]); } else for(let k=0;k<n;k++) this.idx.push(base+k);
    g.dispose(); return this;
  }
  build(){ const g=new THREE.BufferGeometry(); g.setAttribute('position',new THREE.Float32BufferAttribute(this.pos,3)); g.setAttribute('normal',new THREE.Float32BufferAttribute(this.nrm,3)); g.setAttribute('color',new THREE.Float32BufferAttribute(this.col,3)); g.setIndex(this.idx); g.computeBoundingSphere(); return g; }
}
// 격자 곡면 (u 0..1 × v 0..1). wrapV면 v 방향으로 닫는다.
function gridGeo(U,Vn,fn,wrapV=false,flip=false){
  const pos=[],idx=[]; const VV=wrapV?Vn:Vn+1;
  for(let i=0;i<=U;i++) for(let j=0;j<VV;j++){ const p=fn(i/U,j/Vn); pos.push(p[0],p[1],p[2]); }
  for(let i=0;i<U;i++) for(let j=0;j<Vn;j++){ const a=i*VV+j, b=(i+1)*VV+j, c=(i+1)*VV+(wrapV?(j+1)%VV:j+1), d=i*VV+(wrapV?(j+1)%VV:j+1); flip?idx.push(a,c,b,a,d,c):idx.push(a,b,c,a,c,d); }
  const g=new THREE.BufferGeometry(); g.setAttribute('position',new THREE.Float32BufferAttribute(pos,3)); g.setIndex(idx); return g;
}
const UNIT_SPH=new THREE.SphereGeometry(1,18,13);
const UNIT_SPH_S=new THREE.SphereGeometry(1,12,9);
const UNIT_CONE=new THREE.ConeGeometry(1,1,4);
// +x 방향으로 뻗은 가늘어지는 원통 (다리·수염·꼬리털)
function limbGeo(len,r0,r1,flat=1,radial=6,segs=3){ const g=new THREE.CylinderGeometry(r1,r0,len,radial,segs,true); g.rotateZ(-Math.PI/2); g.translate(len/2,0,0); if(flat!==1) g.scale(1,flat,1); return g; }

const ROACH_PAL={
  adult:{ pro:{center:0x5a2710,mid:0x7a3814,blot:0x2a0f05,rim:0xc89250,under:0x6a4024},
    head:0x3e1d0c, face:0x8a5530, eye:0x0b0604, mouth:0x2a1208,
    thD:0x2e1408, thV:0x6a3c1e, coxa:0x86522a, coxaRim:0x4a2812,
    abD:0x3a1809, abEdge:0x9a6636, abV:0x7a4824, abBand:0x3e200e, abMem:0xbc9868,
    wing:0x6e3413, wingBase:0x3a1807, wingEdge:0xa8662e, veinK:0.6,
    fem:0x5e2d11, femBase:0xa06c3a, tib:0x6c3718, tar:0x86502a, spine:0x2a1308, joint:0xa87244,
    ant:0x5c2d12, ant2:0x3c1b0a, cerc:0x603118 },
  nymph:{ pro:{center:0xe4d8bc,mid:0xeee4ce,blot:0xc9b48e,rim:0xf7f1e2,under:0xe6dcc4},
    head:0xe8dcc2, face:0xf2eadb, eye:0x1a120c, mouth:0xcbb894,
    thD:0xe6dac0, thV:0xf1e8d6, coxa:0xefe6d4, coxaRim:0xd4c4a4,
    abD:0xe4d8bc, abEdge:0xf4ecdc, abV:0xefe6d2, abBand:0xbfa782, abMem:0xf7f1e4,
    wing:0xe4d8bc, wingBase:0xd4c4a4, wingEdge:0xf4ecdc, veinK:0.9,
    fem:0xe0d2b4, femBase:0xeee4d0, tib:0xdaC8a6, tar:0xe4d6ba, spine:0xb09472, joint:0xefe4cc,
    ant:0xd8c6a4, ant2:0xbfa782, cerc:0xdccaa8 },
};
const _palRGB=new Map();
function palRGB(pal){ if(_palRGB.has(pal)) return _palRGB.get(pal); const o={}; for(const k in pal){ const v=pal[k]; o[k]=typeof v==='object'?Object.fromEntries(Object.entries(v).map(([a,b])=>[a,rgb(b)])):(k==='veinK'?v:rgb(v)); } _palRGB.set(pal,o); return o; }

// 앞가슴 등판 — 실험실 표본과 같은 방패 모양. 머리 쪽은 반원, 배 쪽은 완만한 D자, 가장자리는 얇게 들린다.
const _proGeo=new Map();
function pronotumGeo(pal){
  if(_proGeo.has(pal)) return _proGeo.get(pal);
  const C=palRGB(pal).pro, N=32,K=7,W=.78,LF=.66,LR=.43,PW=3.3; const pos=[],col=[],idx=[];
  const edge=a=>{ const sx=Math.sin(a),cz=Math.cos(a); const r=cz>=0?1/Math.sqrt((sx/W)**2+(cz/LF)**2):1/Math.pow(Math.pow(Math.abs(sx)/W,PW)+Math.pow(Math.abs(cz)/LR,PW),1/PW); return [sx*r,cz*r]; };
  const topY=(u,a)=>{ const f=Math.max(0,Math.cos(a)),H=lerp(.13,lerp(.1,.16,(Math.cos(a)+1)/2),sstep(0,.55,u)); return .012+H*Math.pow(Math.max(0,1-u*u),.78)+.016*sstep(.74,.93,u)*(1-sstep(.93,1,u))-.08*f*u*u; };
  const botY=(u,a)=>{ const f=Math.max(0,Math.cos(a)); return -.008+.05*Math.max(0,1-u*u)-.08*f*u*u; };
  const tint=(u,x,z,under)=>{ if(under) return C.under; let c=rgbMix(C.mid,C.center,sstep(.75,.2,u)); const bl=Math.exp(-(((Math.abs(x)-.17)/.12)**2+((z-.02)/.24)**2)); c=rgbMix(c,C.blot,bl*.85); const mid=Math.exp(-((x/.05)**2+((z+.05)/.35)**2)); c=rgbMix(c,C.blot,mid*.35); return rgbMix(c,C.rim,sstep(.7,.84,u)); };
  const B=1+K*N;
  for(const under of [false,true]){ pos.push(0,under?botY(0,0):topY(0,0),0); const t=tint(0,0,0,under); col.push(...t);
    for(let k=1;k<=K;k++){ const u=k/K; for(let j=0;j<N;j++){ const a=j/N*TAU,[ex,ez]=edge(a),x=ex*u,z=ez*u; pos.push(x,under?botY(u,a):topY(u,a),z); col.push(...tint(u,x,z,under)); } } }
  const ring=(base,k,j)=>base+1+(k-1)*N+((j%N)+N)%N;
  for(const [base,flip] of [[0,false],[B,true]]){ for(let j=0;j<N;j++){ const a=base,b=ring(base,1,j),d=ring(base,1,j+1); flip?idx.push(a,d,b):idx.push(a,b,d); }
    for(let k=1;k<K;k++) for(let j=0;j<N;j++){ const a=ring(base,k,j),b=ring(base,k+1,j),cc=ring(base,k+1,j+1),d=ring(base,k,j+1); flip?idx.push(a,cc,b,a,d,cc):idx.push(a,b,cc,a,cc,d); } }
  for(let j=0;j<N;j++){ const t0=ring(0,K,j),t1=ring(0,K,j+1),b0=ring(B,K,j),b1=ring(B,K,j+1); idx.push(t0,b0,b1,t0,b1,t1); }
  const g=new THREE.BufferGeometry(); g.setAttribute('position',new THREE.Float32BufferAttribute(pos,3)); g.setAttribute('color',new THREE.Float32BufferAttribute(col,3)); g.setIndex(idx);
  _proGeo.set(pal,g); return g;
}
// 몸 조각들. o: {M, warp, post, ...}
function addPronotum(B,pal,o={}){
  // 옆과 앞 가장자리는 가슴을 덮으며 아래로 휜다
  const droop=(w,i)=>{ const lx=w.x/0.195, lz=(w.z-0.30)/0.165; w.y-=0.03*lx*lx+0.022*Math.max(0,lz)*Math.max(0,lz); if(o.warp) o.warp(w,i); };
  B.add(pronotumGeo(pal),null,mtx(0,0.104,0.30,0.1,0,0,0.25,0.2,0.25),droop,o.M,o.post); }
function addHead(B,pal,o={}){
  const C=palRGB(pal);
  B.add(UNIT_SPH,(v)=>rgbMix(C.head,C.face,sstep(0.1,0.9,v.z*0.7-v.y*0.5)),mtx(0,0.04,0.405,0.6,0,0,0.078,0.052,0.058),o.warp,o.M,o.post);
  for(const s of [1,-1]) B.add(UNIT_SPH_S,C.eye,mtx(s*0.054,0.052,0.418,0.2,0,s*0.35,0.018,0.034,0.026),o.warp,o.M,o.post);
  B.add(UNIT_SPH_S,C.mouth,mtx(0,0.008,0.452,0,0,0,0.03,0.018,0.02),o.warp,o.M,o.post);
  for(const s of [1,-1]){ const g=limbGeo(0.075,0.009,0.005,1,5,2); B.add(g,C.face,mtx(s*0.028,0.012,0.445,0,-Math.PI/2+s*0.25,-0.75),o.warp,o.M,o.post); }
}
function addThorax(B,pal,o={}){
  const C=palRGB(pal);
  B.add(UNIT_SPH,(v)=>rgbMix(C.thV,C.thD,sstep(-0.2,0.4,v.y)),mtx(0,0.064,0.13,0,0,0,0.15,0.042,0.18),o.warp,o.M,o.post);
  LEG_DEF.forEach((d,i)=>{ for(const s of [1,-1]){
    const ix=s*0.035, iz=d.z+[0.03,0.0,0.05][i], hx=s*0.13, hz=d.z; const cx=(ix+hx)/2, cz=(iz+hz)/2, len=Math.hypot(hx-ix,hz-iz);
    B.add(UNIT_SPH_S,(v)=>rgbMix(C.coxa,C.coxaRim,sstep(0.55,0.95,Math.hypot(v.x,v.z))),mtx(cx,0.028,cz,0,Math.atan2(-(hz-iz),hx-ix),0,len*0.62,0.013,0.05*(i===2?1.3:1)),o.warp,o.M,o.post); } });
}
// 배: 여섯 마디 판이 겹친 납작한 몸통. v0~v1로 잘라서 만들 수 있다(짓이겨져 끊긴 배).
function addAbdomen(B,pal,o={}){
  const C=palRGB(pal), v0=o.v0??0, v1=o.v1??1, zf=0.1, zr=-0.56, SEG=6.2;
  const prof=v=>{ const w=Math.max(0.035,0.205*Math.pow(Math.max(0,Math.sin(Math.PI*Math.min(1,0.2+v*0.82))),0.55)); return {w,hd:0.052*(1-0.55*v*v),hv:0.05*(1-0.5*v*v)}; };
  const U=Math.max(3,Math.round(22*(v1-v0))), Vn=18;
  const g=gridGeo(U,Vn,(uu,j)=>{ const v=lerp(v0,v1,uu), z=lerp(zf,zr,v), f=(v*SEG)%1; const {w,hd,hv}=prof(v); const lip=1+0.05*sstep(0.72,0.94,f)-0.06*sstep(0.96,1,f);
    const th=j*TAU, co=Math.cos(th), si=Math.sin(th);
    const x=w*lip*Math.sign(co)*Math.pow(Math.abs(co),2/2.4), y=si>=0?hd*lip*Math.pow(si,2/2.0):-hv*Math.pow(-si,2/3.2);
    // 끊긴 끝은 안쪽으로 오므린다
    const cap=Math.min(1,(v0>0?sstep(0.18,0,uu):sstep(0.08,0,uu)*0.6)+(v1<1?sstep(0.82,1,uu):sstep(0.9,1,v)*0.95));
    return [x*(1-cap*0.9),0.068+y*(1-cap*0.75),z]; },true);
  B.add(g,(p,w,i)=>{ const row=Math.floor(i/Vn), uu=row/U, v=lerp(v0,v1,uu), f=(v*SEG)%1, th=(i%Vn)/Vn*TAU, si=Math.sin(th), co=Math.abs(Math.cos(th));
    let c; if(si>=0){ c=rgbMix(C.abEdge,C.abD,sstep(0.05,0.5,si)); c=rgbMix(c,C.abBand,sstep(0.8,0.96,f)*0.8); }
    else { c=rgbMix(C.abV,C.abEdge,sstep(0.75,1,co)*0.5); c=rgbMix(c,C.abBand,sstep(0.82,0.96,f)*0.9); c=rgbMix(c,C.abMem,sstep(0.12,0,f)*0.7); }
    return c; },null,o.warp,o.M,o.post);
}
// 앞날개(겉날개) 한 장. side +1 / -1. 오른쪽 날개(-1)가 위로 겹친다.
function addWing(B,pal,side,o={}){
  const C=palRGB(pal), uMax=o.uMax??1, z0=0.22, z1=-0.64, lift=side<0?0.007:0, T=0.007;
  const shape=(u,v)=>{ const te=clamp((u-0.76)/0.24,0,1); const hs=(0.035+0.095*Math.pow(Math.max(0,Math.sin(Math.PI*clamp(u*0.95+0.08,0,0.86))),0.45))*Math.sqrt(Math.max(0.0004,1-te*te));
    const cx=0.088+0.004*Math.sin(Math.PI*u)-0.05*sstep(0.55,1,u); const xin=cx-hs, xout=cx+hs; const x=lerp(xin,xout,v);
    const z=lerp(z0,z1,u);
    const yb=0.096+0.034*sstep(0,0.22,u)-0.03*sstep(0.3,1,u);
    // 안쪽 절반은 평평한 등, 바깥쪽은 옆구리로 휘어 내려간다
    const y=yb+0.01*Math.cos(Math.PI*0.5*clamp((v-0.3)/0.7,0,1))-0.052*Math.pow(sstep(0.5,1,v),1.25)-0.004*sstep(0.12,0,v)+lift*(1-v);
    return [side*x,y,z]; };
  const U=Math.max(4,Math.round(22*uMax)), Vn=10;
  const tear=o.tear||0;
  const top=gridGeo(U,Vn,(uu,v)=>{ const u=uu*uMax; const p=shape(u,v); return p; },false,side>0);
  const bot=gridGeo(U,Vn,(uu,v)=>{ const u=uu*uMax; const p=shape(u,v); p[1]-=T*(1-0.6*v); return p; },false,side<0);
  const colAt=(i)=>{ const row=Math.floor(i/(Vn+1)), u=row/U*uMax, v=(i%(Vn+1))/Vn;
    let c=rgbMix(C.wingBase,C.wing,sstep(0.02,0.2,u)); c=rgbMix(c,C.wingEdge,sstep(0.6,1,v)*0.55+sstep(0.75,1,u)*0.25);
    const fv=(v*7.5-u*2.0*(1-v)+10)%1; if(fv<0.13) c=rgbMul(c,C.veinK);
    if(v>0.3&&((u*30)%1)<0.07) c=rgbMul(c,0.86);
    if(v<0.38&&u<0.42&&((Math.hypot(u*1.4,v)*10)%1)<0.13) c=rgbMul(c,0.7);
    if(tear&&u>uMax-0.08) c=rgbMul(c,0.6);
    return c; };
  B.add(top,(p,w,i)=>colAt(i),null,o.warp,o.M,o.post);
  B.add(bot,(p,w,i)=>rgbMul(colAt(i),0.75),null,o.warp,o.M,o.post);
}
function addCerci(B,pal,o={}){ const C=palRGB(pal); for(const s of [1,-1]){ const g=limbGeo(0.12,0.013,0.004,0.8,5,6);
  B.add(g,(v)=>((v.x*70)%2<1)?C.cerc:rgbMul(C.cerc,0.7),mtx(s*0.04,0.058,-0.53,0,Math.PI/2-s*0.35,0.08),o.warp,o.M,o.post); } }
// 몸통 (다리·더듬이 제외) 한 덩어리
function buildRoachBody(pal,o={}){
  const B=new GeoBuilder(), w=o.wings!==false;
  addAbdomen(B,pal,o); addThorax(B,pal,o); addPronotum(B,pal,o); addHead(B,pal,o); addCerci(B,pal,o);
  if(w){ addWing(B,pal,1,o); addWing(B,pal,-1,o); }
  return B.build();
}
// 가시: base에서 dir 방향으로
function addSpine(B,col,bx,by,bz,dir,len,r,M){ const q=new THREE.Quaternion().setFromUnitVectors(Y_AXIS,dir); const m=new THREE.Matrix4().compose(V3(bx+dir.x*len*0.5,by+dir.y*len*0.5,bz+dir.z*len*0.5),q,V3(r,len,r)); if(M) m.premultiply(M); B.add(UNIT_CONE,col,m); }
// 넓적다리: 납작하고 도톰하다. 배 쪽 모서리에 짧은 가시 한 줄.
function addFemur(B,i,pal,M){
  const C=palRGB(pal), d=LEG_DEF[i], w=d.w, L=d.fl;
  const g=limbGeo(L,0.03*w,0.02*w,0.55,7,5);
  B.add(g,(v)=>rgbMix(C.femBase,C.fem,sstep(0.02,0.3*L,v.x)),M,(p)=>{ const t=clamp(p.x/L,0,1), k=1+0.22*Math.sin(Math.PI*Math.pow(t,0.8)); p.y*=k; p.z*=k; });
  B.add(UNIT_SPH_S,C.joint,mtx(0.01,0,0,0,0,0,0.022*w,0.013*w,0.022*w).premultiply(M||new THREE.Matrix4()));
  const n=[3,4,5][i];
  for(let k=0;k<n;k++){ const t=0.42+0.5*k/Math.max(1,n-1), sd=k%2?1:-1, r=0.022*w*(1-0.35*t)*1.2; const a=sd*2.3;
    const dir=V3(Math.cos(0.75),Math.sin(0.75)*Math.cos(a)*0.55,Math.sin(0.75)*Math.sin(a)).normalize();
    addSpine(B,C.spine,t*L,Math.cos(a)*r*0.5,Math.sin(a)*r,dir,0.028*w,0.0055*w,M); }
}
// 종아리 + 발목마디 5개 + 발톱. 종아리엔 굵은 가시가 사방으로 돋는다.
function addTibia(B,i,pal,M){
  const C=palRGB(pal), d=LEG_DEF[i], w=d.w, L=d.tl;
  const g=limbGeo(L,0.019*w,0.0125*w,0.72,6,4);
  B.add(g,(v)=>rgbMix(C.joint,C.tib,sstep(0,0.15*L,v.x)),M);
  const n=[7,9,12][i], A=[0.75,-0.75,2.35,-2.35];
  for(let k=0;k<n;k++){ const t=0.12+0.83*k/(n-1), a=A[k%4]+(hash3(i,k,1)-0.5)*0.4, r=lerp(0.019,0.0125,t)*w;
    const tilt=0.5+hash3(i,k,2)*0.2, dir=V3(Math.cos(tilt),Math.sin(tilt)*Math.cos(a),Math.sin(tilt)*Math.sin(a)).normalize();
    addSpine(B,C.spine,t*L,Math.cos(a)*r*0.72,Math.sin(a)*r,dir,(0.042+0.024*hash3(i,k,3))*w*(i===2?1.12:1),0.0062*w,M); }
  for(const a of [2.7,-2.7,Math.PI]){ const dir=V3(Math.cos(0.32),Math.sin(0.32)*Math.cos(a),Math.sin(0.32)*Math.sin(a)).normalize(); addSpine(B,C.spine,L*0.99,Math.cos(a)*0.01*w,Math.sin(a)*0.012*w,dir,0.05*w,0.0065*w,M); }
  // 발목마디: 종아리가 바닥을 향해 꺾인 만큼 되돌려 바닥에 눕힌다
  const tA=-(LEG_ELEV+d.knee)*0.92, seg=[0.4,0.18,0.14,0.1,0.18]; let m=new THREE.Matrix4().makeTranslation(L,0,0).multiply(mtx(0,0,0,0,0.12,tA));
  for(let k=0;k<5;k++){ const sl=d.tar*seg[k], r0=(0.011-k*0.0008)*w, r1=r0*0.8; const sg=limbGeo(sl,r0,r1,0.8,5,1);
    const mm=m.clone(); if(M) mm.premultiply(M); B.add(sg,(v)=>rgbMix(C.tar,C.joint,sstep(sl*0.75,sl,v.x)*0.7),mm);
    m=m.multiply(new THREE.Matrix4().makeTranslation(sl,0,0)).multiply(mtx(0,0,0,0,0,-0.06)); }
  for(const s of [1,-1]){ const dir=V3(0.8,-0.45,s*0.35).normalize(); const mm=m.clone(); if(M) mm.premultiply(M); addSpine(B,C.spine,0,0,0,dir,0.022*w,0.004*w,mm); }
}
function antGeo(pal){ const C=palRGB(pal); const g=new THREE.CylinderGeometry(0.0048,0.0074,0.38,4,8,true); const B=new GeoBuilder(); B.add(g,(v)=>(Math.floor((v.y+0.19)/0.38*8)%2)?C.ant:C.ant2); return B.build(); }
const ROACH_GEO={};
function roachGeos(kind='adult'){
  if(ROACH_GEO[kind]) return ROACH_GEO[kind];
  const pal=ROACH_PAL[kind], nymph=kind==='nymph';
  const body=buildRoachBody(pal,{wings:!nymph});
  const fem=[],tib=[]; for(let i=0;i<3;i++){ let B=new GeoBuilder(); addFemur(B,i,pal); fem.push(B.build()); B=new GeoBuilder(); addTibia(B,i,pal); tib.push(B.build()); }
  return ROACH_GEO[kind]={pal,body,fem,tib,ant:antGeo(pal)};
}
// 한 다리 전체(넓적다리+종아리)를 무릎 각도 하나로 굳힌 모양 — 시체용
function legWholeGeo(i,ky,kz,pal=ROACH_PAL.adult){ const B=new GeoBuilder(); addFemur(B,i,pal); addTibia(B,i,pal,new THREE.Matrix4().makeTranslation(LEG_DEF[i].fl,0,0).multiply(mtx(0,0,0,0,ky,kz))); return B.build(); }



// ══════════════════════════════════════════════════════════════════
// 어항용 바퀴: 몸짓
// ══════════════════════════════════════════════════════════════════
export const ROACH_L=0.13;            // 1라운드와 같은 크기 (게임 단위)
export const ROACH_TOP_Y=0.15;        // 등 높이(몸 단위)
const ANT_N=6, ANT_SEG=0.19;
const MAT={
  shell:new THREE.MeshPhysicalMaterial({color:0xffffff,vertexColors:true,roughness:0.4,metalness:0,clearcoat:0.65,clearcoatRoughness:0.24}),
  limb:new THREE.MeshStandardMaterial({color:0xffffff,vertexColors:true,roughness:0.46}),
};
const _v1=new THREE.Vector3(), _v2=new THREE.Vector3();

/**
 * 몸짓 목표값 T (매 프레임 넘긴다. 빠진 값은 0):
 *  speed 0~1.6 걸음 빠르기, back 1이면 뒷걸음, groom 0/1 더듬이 손질(groomSide ±1), legGroom 0/1 다리 손질,
 *  eat 0/1 먹기·마시기, flail 0/1 뒤집혀 버둥대기, swim 0/1 헤엄, curl 0/1 죽어서 오그라든 다리, crouch 0/1 쉬기,
 *  aim 0/1 더듬이를 aimDir(몸 좌표 방향) 쪽으로, stream 0/1 바람에 더듬이가 뒤로 날림(streamDir), pitch 몸 앞뒤 기울기
 */
export class PetModel{
  constructor({size=1}={}){
    const GS=roachGeos('adult');
    this.size=size;
    this.shellMat=MAT.shell.clone(); this.limbMat=MAT.limb.clone();
    this.g=new THREE.Group();                 // 바닥·벽·탈것에 붙는 자리
    this.inner=new THREE.Group();             // 몸 자체의 끄덕임·기울임
    this.g.add(this.inner);
    this.body=new THREE.Mesh(GS.body,this.shellMat); this.body.castShadow=true; this.body.receiveShadow=true; this.inner.add(this.body);
    this.deco=new THREE.Group(); this.inner.add(this.deco);   // 꾸미기는 몸을 따라간다
    this.legs=[]; this.ants=[];
    for(const s of [1,-1]){
      const base=new THREE.Group(); base.position.set(s*0.032,0.052,0.462); base.rotation.order='YXZ'; base.rotation.set(1.25,s*0.42,0); this.inner.add(base);
      // 1라운드는 0.38 길이 3마디. 더듬이를 입으로 끌어내려 훑는 손질을 보이려고 같은 길이를 0.19씩 6마디로 나눴다
      let parent=base; const segs=[];
      for(let i=0;i<ANT_N;i++){ const seg=new THREE.Group(); const m=new THREE.Mesh(GS.ant,this.limbMat); m.position.y=ANT_SEG/2; const r=1-i*0.125; m.scale.set(r,0.5,r); seg.add(m); seg.position.y=i?ANT_SEG:0; seg.rotation.x=-0.05; parent.add(seg); parent=seg; segs.push(seg); }
      this.ants.push({base,segs,s,mesh:segs.map(sg=>sg.children[0])});
    }
    for(const s of [1,-1]) LEG_DEF.forEach((d,i)=>{
      const hip=new THREE.Group(); hip.position.set(s*0.13,HIP_Y,d.z); this.inner.add(hip);
      const fem=new THREE.Group(); hip.add(fem);
      const fm=new THREE.Mesh(GS.fem[i],this.limbMat); fm.castShadow=true; fem.add(fm);
      const knee=new THREE.Group(); knee.position.x=d.fl; fem.add(knee);
      const tm=new THREE.Mesh(GS.tib[i],this.limbMat); tm.castShadow=true; knee.add(tm);
      this.legs.push({hip,fem,knee,s,i,d,fo:rand(TAU)});
    });
    this.g.scale.setScalar(ROACH_L*size);
    this.ph=rand(TAU); this.antT=rand(TAU); this.t=rand(10); this.spd=0; this.groomPh=0;
    this.w={walk:0,groom:0,legGroom:0,eat:0,flail:0,swim:0,curl:0,crouch:0,aim:0,stream:0,tuck:0};
    this.aimDir=new THREE.Vector3(0,0.3,1).normalize(); this.streamDir=new THREE.Vector3(0,0,-1);
    this.flick=0; this.flickSide=1; this.flickT=rand(2,6);
    this.age=0; this.dead=0;
    this.animate(0,{});
  }
  /** 늙을수록 껍질 광이 죽고, 죽으면 탁해진다 (0~1) */
  setAge(k,dead=0){
    this.age=k; this.dead=dead;
    const m=this.shellMat; const dim=1-0.12*k-0.22*dead;
    m.color.setRGB(dim,dim*(1-0.03*k),dim*(1-0.06*k-0.05*dead));
    m.clearcoat=0.65*(1-0.45*k)*(1-0.6*dead); m.roughness=0.4+0.12*k+0.15*dead;
    // 늙으면 더듬이 끝마디가 부러져 짧다
    for(const a of this.ants){ const keep=k>0.55?(a.s>0?3:4):ANT_N; a.segs.forEach((sg,i)=>{ sg.children[0].visible=i<keep; }); }
  }
  animate(dt,T){
    this.t+=dt;
    const W=this.w;
    W.walk=damp(W.walk,clamp((T.speed||0)/0.35,0,1),8,dt);
    for(const k of ['groom','legGroom','eat','flail','swim','curl','crouch','aim','stream']) W[k]=damp(W[k],T[k]?1:0,k==='flail'||k==='aim'?9:k==='curl'?1.2:5,dt);
    W.tuck=damp(W.tuck,clamp(T.tuck||0,0,1),4,dt);
    this.spd=damp(this.spd,T.speed||0,10,dt);
    const back=T.back?-1:1;
    this.ph+=dt*(6+this.spd*26)*back;
    if(W.groom>0.05||W.legGroom>0.05) this.groomPh+=dt*(T.groomRate||5.2);
    const calm=W.crouch*(1-W.flail);
    this.antT+=dt*(4*(1-0.55*calm)+W.flail*9);
    // 이따금 더듬이 한쪽을 휙 튕긴다
    this.flickT-=dt; if(this.flickT<0){ this.flickT=rand(1.6,6)*(1+calm); this.flick=1; this.flickSide=Math.random()<0.5?1:-1; }
    this.flick=Math.max(0,this.flick-dt*4.5);
    const gs=T.groomSide||1, spd=this.spd, curl=W.curl, flail=W.flail*(1-curl), swim=W.swim*(1-curl);
    for(const lg of this.legs){
      const d=lg.d, s=lg.s, i=lg.i;
      const tri=((i+(s>0?0:1))%2===0)?1:-1; const sw=Math.sin(this.ph)*tri; const amp=0.10+0.32*Math.min(1.2,spd);
      let yw=d.yaw-sw*amp, lift=Math.max(0,sw)*0.45*Math.min(1.2,spd);
      let fz=LEG_ELEV+lift-0.1*calm, kz=d.knee-lift*0.2, ky=s*d.ky;
      if(i===0) yw-=0.22*W.eat; if(i===0) fz+=0.06*W.eat;
      // 더듬이 손질: 그쪽 앞다리를 들어 입 쪽으로 더듬이를 끌어내린다
      if(i===0&&s===gs&&W.groom>0.01){ const c=this.groomPh, g=W.groom;
        yw=lerp(yw,0.02+0.1*Math.sin(c),g); fz=lerp(fz,0.85+0.2*Math.sin(c+0.6),g); kz=lerp(kz,-2.0+0.3*Math.sin(c+1.4),g); ky=lerp(ky,-s*0.7,g); }
      // 다리 손질: 가운데 다리를 앞으로 끌어와 입에 문다
      if(i===1&&s===gs&&W.legGroom>0.01){ const c=this.groomPh, g=W.legGroom;
        yw=lerp(yw,0.55+0.15*Math.sin(c),g); fz=lerp(fz,0.1+0.18*Math.sin(c+0.5),g); kz=lerp(kz,-0.9+0.25*Math.sin(c+1.1),g); ky=lerp(ky,-s*0.2,g); }
      if(swim>0.01){ const sp=Math.sin(this.t*15+i*1.9+(s>0?0:Math.PI));
        yw=lerp(yw,d.yaw+sp*(i===0?0.3:0.6),swim); fz=lerp(fz,0.04+Math.max(0,sp)*0.22,swim); kz=lerp(kz,d.knee*0.55+sp*0.25,swim); ky=lerp(ky,s*d.ky*0.6,swim); }
      if(flail>0.01){ const f=this.t*(19+i*4)+lg.fo;
        yw=lerp(yw,d.yaw+Math.sin(f)*0.65,flail); fz=lerp(fz,-0.45+Math.sin(f*1.27+lg.fo)*0.55,flail); kz=lerp(kz,d.knee*0.6+Math.sin(f*0.83)*0.55,flail); }
      // 탈것에 앉았을 때: 다리를 몸 쪽으로 접어 붙인다
      if(W.tuck>0.01){ const tk=W.tuck*(1-flail); yw=lerp(yw,d.yaw<Math.PI/2?d.yaw*0.42:Math.PI-(Math.PI-d.yaw)*0.42,tk); fz=lerp(fz,0.12+0.05*Math.sin(this.t*1.3+lg.fo),tk); kz=lerp(kz,-2.25,tk); ky=lerp(ky,s*d.ky*0.3,tk); }
      if(curl>0.01){ yw=lerp(yw,d.yaw*0.9+(1-i)*0.15,curl); fz=lerp(fz,-0.58+0.12*Math.sin(lg.fo),curl); kz=lerp(kz,-2.6+0.18*Math.sin(lg.fo*2),curl); ky=lerp(ky,s*d.ky*0.2,curl); }
      lg.hip.rotation.y=s>0?(yw-Math.PI/2):(1.5*Math.PI-yw);
      lg.fem.rotation.z=fz; lg.knee.rotation.z=kz; lg.knee.rotation.y=ky;
    }
    // 더듬이 (6마디)
    const t=this.antT, ampA=1-0.5*calm;
    for(const a of this.ants){
      const s=a.s;
      let bx=1.25+Math.sin(t+s*2)*0.12*ampA+0.22*calm, by=s*(0.42+Math.sin(t*1.7+s)*0.22*ampA);
      const segX=[];
      for(let i=0;i<ANT_N;i++) segX.push(-0.05+Math.sin(t*2.3+i*0.6+s)*0.06*ampA);
      if(this.flick>0&&s===this.flickSide){ bx-=0.35*Math.sin(this.flick*Math.PI); by+=s*0.25*Math.sin(this.flick*Math.PI); }
      if(W.aim>0.01){ const dv=this.aimDir; const p=Math.acos(clamp(dv.y,-1,1)), yaw=Math.atan2(dv.x,dv.z)+s*0.2+Math.sin(t*3.1+s)*0.08; const k=W.aim;
        bx=lerp(bx,p+Math.sin(t*4+s)*0.06,k); by=lerp(by,yaw,k); for(let i=0;i<ANT_N;i++) segX[i]=lerp(segX[i],-0.02+Math.sin(t*5+i*0.7+s)*0.04,k); }
      if(W.stream>0.01){ const dv=this.streamDir; const p=Math.acos(clamp(dv.y,-1,1)), yaw=Math.atan2(dv.x,dv.z)+s*0.28; const k=W.stream*0.8;
        bx=lerp(bx,p+Math.sin(this.t*21+s)*0.08,k); by=lerp(by,yaw+Math.sin(this.t*17+s)*0.1,k); for(let i=0;i<ANT_N;i++) segX[i]=lerp(segX[i],Math.sin(this.t*25+i+s)*0.08,k); }
      if(swim>0.01){ bx=lerp(bx,0.85,swim); by=lerp(by,s*0.6,swim); }
      if(W.groom>0.01){ const g=W.groom;
        if(s===gs){
          // 앞다리가 더듬이를 얼굴 앞으로 끌어내리고, 접힌 자리(U자 바닥)가 밑동에서 끝 쪽으로 미끄러진다
          const u=(this.groomPh/TAU)%1, pass=u<0.8?u/0.8:1-(u-0.8)/0.2, b=0.4+pass*3.6;
          bx=lerp(bx,1.78+0.12*Math.sin(pass*Math.PI),g); by=lerp(by,s*(0.12-0.08*pass),g);
          for(let i=0;i<ANT_N;i++){ const k=Math.exp(-((i-b)**2)/0.55); segX[i]=lerp(segX[i],(i<b?0.16:-0.34)+1.05*k,g); }
        } else { bx=lerp(bx,1.0,g*0.7); by=lerp(by,s*0.75,g*0.7); }
      }
      if(flail>0.01){ bx=lerp(bx,1.0+Math.sin(this.t*13+s)*0.45,flail); by=lerp(by,s*(0.5+Math.sin(this.t*11+s*3)*0.4),flail); }
      if(curl>0.01){ bx=lerp(bx,1.75,curl); by=lerp(by,s*0.6,curl); for(let i=0;i<ANT_N;i++) segX[i]=lerp(segX[i],0.11,curl); }
      a.base.rotation.set(bx,by,0);
      a.segs.forEach((sg,i)=>{ sg.rotation.x=segX[i]; });
    }
    // 몸
    const wk=Math.min(1,spd/0.3)*(1-flail)*(1-swim);
    this.inner.position.y=0.006*Math.abs(Math.sin(this.ph))*wk-0.014*calm*(1-curl);
    this.inner.rotation.x=(T.pitch||0)+0.11*W.eat*(1+0.3*Math.sin(this.t*14))-0.1*W.groom+0.04*W.legGroom;
    this.inner.rotation.z=0.035*Math.sin(this.ph)*wk+(T.roll||0);
    this.body.scale.y=1+0.013*Math.sin(this.t*2.2)*(1-curl);
  }
}

// ══════════════════════════════════════════════════════════════════
// 꾸미기
// ══════════════════════════════════════════════════════════════════
// 몸 좌표에서 날개 윗면·앞가슴 등판 윗면을 그대로 본뜬 얇은 막 (매니큐어 바를 자리)
function wingShapeFn(side){
  const z0=0.22, z1=-0.64, lift=side<0?0.007:0;
  return (u,v)=>{ const te=clamp((u-0.76)/0.24,0,1); const hs=(0.035+0.095*Math.pow(Math.max(0,Math.sin(Math.PI*clamp(u*0.95+0.08,0,0.86))),0.45))*Math.sqrt(Math.max(0.0004,1-te*te));
    const cx=0.088+0.004*Math.sin(Math.PI*u)-0.05*sstep(0.55,1,u); const x=lerp(cx-hs,cx+hs,v);
    const z=lerp(z0,z1,u);
    const yb=0.096+0.034*sstep(0,0.22,u)-0.03*sstep(0.3,1,u);
    const y=yb+0.01*Math.cos(Math.PI*0.5*clamp((v-0.3)/0.7,0,1))-0.052*Math.pow(sstep(0.5,1,v),1.25)-0.004*sstep(0.12,0,v)+lift*(1-v);
    return [side*x,y,z]; };
}
function overlayGrid(U,Vn,fn,flip,u0,u1,off){
  const pos=[],uv=[],idx=[];
  for(let i=0;i<=U;i++){ const u=lerp(u0,u1,i/U); for(let j=0;j<=Vn;j++){ const v=j/Vn; const p=fn(u,v); pos.push(p[0],p[1],p[2]); uv.push(u,v); } }
  for(let i=0;i<U;i++) for(let j=0;j<Vn;j++){ const a=i*(Vn+1)+j,b=(i+1)*(Vn+1)+j,c=b+1,d=a+1; flip?idx.push(a,c,b,a,d,c):idx.push(a,b,c,a,c,d); }
  const g=new THREE.BufferGeometry(); g.setAttribute('position',new THREE.Float32BufferAttribute(pos,3)); g.setAttribute('uv',new THREE.Float32BufferAttribute(uv,2)); g.setIndex(idx); g.computeVertexNormals();
  const P=g.attributes.position,N=g.attributes.normal;
  for(let i=0;i<P.count;i++) P.setXYZ(i,P.getX(i)+N.getX(i)*off,P.getY(i)+N.getY(i)*off,P.getZ(i)+N.getZ(i)*off);
  g.computeVertexNormals(); g.computeBoundingSphere(); return g;
}
function pronotumFn(){
  const W=.78,LF=.66,LR=.43,PW=3.3;
  const edge=a=>{ const sx=Math.sin(a),cz=Math.cos(a); const r=cz>=0?1/Math.sqrt((sx/W)**2+(cz/LF)**2):1/Math.pow(Math.pow(Math.abs(sx)/W,PW)+Math.pow(Math.abs(cz)/LR,PW),1/PW); return [sx*r,cz*r]; };
  const topY=(u,a)=>{ const f=Math.max(0,Math.cos(a)),H=lerp(.13,lerp(.1,.16,(Math.cos(a)+1)/2),sstep(0,.55,u)); return .012+H*Math.pow(Math.max(0,1-u*u),.78)+.016*sstep(.74,.93,u)*(1-sstep(.93,1,u))-.08*f*u*u; };
  const M=mtx(0,0.104,0.30,0.1,0,0,0.25,0.2,0.25), v=new THREE.Vector3();
  return (u,vv)=>{ const a=vv*TAU; const [ex,ez]=edge(a); v.set(ex*u,topY(u,a),ez*u).applyMatrix4(M);
    const lx=v.x/0.195, lz=(v.z-0.30)/0.165; v.y-=0.03*lx*lx+0.022*Math.max(0,lz)*Math.max(0,lz); return [v.x,v.y,v.z]; };
}
const _overlay=new Map();
/** part: 'L'(왼쪽 날개) 'R'(오른쪽 날개) 'P'(앞가슴 등판), style 'french'이면 끝부분만 */
function overlayGeo(part,french){
  const key=part+(french?'f':'');
  if(_overlay.has(key)) return _overlay.get(key);
  let g;
  if(part==='P') g=overlayGrid(14,44,pronotumFn(),false,french?0.7:0.02,0.965,0.0065);
  else { const side=part==='L'?1:-1; g=overlayGrid(26,12,wingShapeFn(side),side>0,french?0.74:0,0.985,side<0?0.0085:0.0055); }
  _overlay.set(key,g); return g;
}

// ───────── 매니큐어 ─────────
export const POLISH_COLORS=['#e8344e','#ff7aa8','#ffb3c9','#c86bff','#6a7dff','#38b6ff','#2fcfa8','#9be05a','#ffd23f','#ff8a3d','#ffffff','#1d1d24'];
export const POLISH_STYLES=[['solid','단색'],['grad','그라데이션'],['french','프렌치'],['glitter','글리터']];
let _glitterTex=null;
function glitterTex(){
  if(_glitterTex) return _glitterTex;
  const c=document.createElement('canvas'); c.width=c.height=256; const g=c.getContext('2d');
  g.fillStyle='#fff'; g.fillRect(0,0,256,256);
  for(let i=0;i<900;i++){ const x=Math.random()*256,y=Math.random()*256,r=Math.random()*1.6+0.5, l=Math.random();
    g.fillStyle=l<0.5?`rgba(255,255,255,${0.7+Math.random()*0.3})`:l<0.8?`rgba(${200+Math.random()*55|0},${170+Math.random()*85|0},255,0.9)`:`rgba(150,120,90,0.55)`;
    g.save(); g.translate(x,y); g.rotate(Math.random()*TAU); g.fillRect(-r,-r*0.6,r*2,r*1.2); g.restore(); }
  _glitterTex=new THREE.CanvasTexture(c); _glitterTex.colorSpace=THREE.SRGBColorSpace; _glitterTex.wrapS=_glitterTex.wrapT=THREE.RepeatWrapping; _glitterTex.repeat.set(2.5,1.2); _glitterTex.anisotropy=4;
  return _glitterTex;
}
function polishMesh(part,p){
  const french=p.s==='french';
  const geo=overlayGeo(part,french);
  const col=new THREE.Color(p.c);
  const mat=new THREE.MeshPhysicalMaterial({color:col,roughness:0.14,metalness:0,clearcoat:1,clearcoatRoughness:0.04,polygonOffset:true,polygonOffsetFactor:-1,polygonOffsetUnits:-1});
  if(p.s==='grad'){
    const uv=geo.attributes.uv, cols=new Float32Array(uv.count*3), pale=new THREE.Color('#fff4ee'), c=new THREE.Color();
    for(let i=0;i<uv.count;i++){ const u=uv.getX(i); const k=part==='P'?sstep(0.15,0.95,u):sstep(0.08,0.85,u); c.copy(pale).lerp(col,k); cols[i*3]=c.r; cols[i*3+1]=c.g; cols[i*3+2]=c.b; }
    const g2=geo.clone(); g2.setAttribute('color',new THREE.BufferAttribute(cols,3)); mat.vertexColors=true; mat.color.set(0xffffff);
    const m=new THREE.Mesh(g2,mat); m.userData.ownGeo=true; return m;
  }
  if(p.s==='glitter'){ mat.map=glitterTex(); mat.metalness=0.35; mat.roughness=0.22; mat.color.copy(col).multiplyScalar(0.92); }
  const m=new THREE.Mesh(geo,mat);
  if(french){ // 프렌치: 끝은 칠한 색, 나머지는 살짝 비치는 분홍빛 바탕
    const base=new THREE.Mesh(overlayGeo(part,false),new THREE.MeshPhysicalMaterial({color:'#ffd9d4',roughness:0.1,clearcoat:1,clearcoatRoughness:0.04,transparent:true,opacity:0.38,depthWrite:false,polygonOffset:true,polygonOffsetFactor:-1,polygonOffsetUnits:-1}));
    const grp=new THREE.Group(); grp.add(base); m.renderOrder=1; grp.add(m); return grp;
  }
  return m;
}

// ───────── 스티커 (문구점 스티커: 흰 테두리로 따낸 만화 그림) ─────────
export const STICKERS=[['heart','하트'],['star','별'],['flower','꽃'],['ribbon','리본'],['strawberry','딸기'],['cherry','체리'],['clover','클로버'],['rainbow','무지개'],['bear','곰'],['cat','고양이'],['moon','달'],['sparkle','반짝']];
const _stickerTex=new Map();
function stickerPath(k){
  const P=new Path2D();
  switch(k){
    case 'heart': P.moveTo(128,212); P.bezierCurveTo(60,165,26,126,30,90); P.bezierCurveTo(34,52,70,34,98,44); P.bezierCurveTo(114,50,124,62,128,74); P.bezierCurveTo(132,62,142,50,158,44); P.bezierCurveTo(186,34,222,52,226,90); P.bezierCurveTo(230,126,196,165,128,212); P.closePath(); break;
    case 'star': for(let i=0;i<10;i++){ const a=-Math.PI/2+i*Math.PI/5, r=i%2?46:100; const x=128+Math.cos(a)*r, y=136+Math.sin(a)*r; i?P.lineTo(x,y):P.moveTo(x,y); } P.closePath(); break;
    case 'sparkle': P.moveTo(128,24); P.quadraticCurveTo(140,116,232,128); P.quadraticCurveTo(140,140,128,232); P.quadraticCurveTo(116,140,24,128); P.quadraticCurveTo(116,116,128,24); P.closePath(); break;
    case 'moon': P.arc(128,128,96,0.525,4.677,false); P.arc(168,104,84,-2.114,-5.251,true); P.closePath(); break;   // 큰 원에서 작은 원을 뺀 초승달
    default: P.arc(128,128,100,0,TAU); P.closePath();
  }
  return P;
}
function drawGloss(g,x,y,rx,ry,rot=-0.5,a=0.85){ g.save(); g.translate(x,y); g.rotate(rot); const gr=g.createRadialGradient(0,0,0,0,0,rx); gr.addColorStop(0,`rgba(255,255,255,${a})`); gr.addColorStop(1,'rgba(255,255,255,0)'); g.fillStyle=gr; g.scale(1,ry/rx); g.beginPath(); g.arc(0,0,rx,0,TAU); g.fill(); g.restore(); }
/** 그림 한 장을 그린다. 바깥 흰 테두리(따낸 자리)는 그림 윤곽을 굵은 흰 선으로 한 번 더 그어 만든다 */
function drawSticker(k){
  const c=document.createElement('canvas'); c.width=c.height=256; const g=c.getContext('2d');
  const shapes=[]; // [path, fill, stroke]
  const lin=(x0,y0,x1,y1,a,b)=>{ const gr=g.createLinearGradient(x0,y0,x1,y1); gr.addColorStop(0,a); gr.addColorStop(1,b); return gr; };
  const rad=(x,y,r,a,b)=>{ const gr=g.createRadialGradient(x,y,r*0.1,x,y,r); gr.addColorStop(0,a); gr.addColorStop(1,b); return gr; };
  const circ=(x,y,r)=>{ const p=new Path2D(); p.arc(x,y,r,0,TAU); return p; };
  const ell=(x,y,rx,ry,rot=0)=>{ const p=new Path2D(); p.ellipse(x,y,rx,ry,rot,0,TAU); return p; };
  switch(k){
    case 'heart': shapes.push([stickerPath('heart'),lin(128,40,128,210,'#ff8fa8','#e8244a'),'#b0122f']); break;
    case 'star': shapes.push([stickerPath('star'),lin(128,40,128,230,'#fff07a','#ffb81f'),'#d98a00']); break;
    case 'sparkle': shapes.push([stickerPath('sparkle'),lin(60,40,200,220,'#d9f6ff','#7ec8ff'),'#3f8fd6']); break;
    case 'moon': shapes.push([stickerPath('moon'),lin(60,40,200,220,'#fff4b0','#ffd64a'),'#d49a10']); break;
    case 'flower':{ for(let i=0;i<5;i++){ const a=-Math.PI/2+i*TAU/5; shapes.push([ell(128+Math.cos(a)*56,128+Math.sin(a)*56,46,36,a),rad(128+Math.cos(a)*56,128+Math.sin(a)*56,50,'#ffffff','#ffc6dc'),'#e78bb0']); } shapes.push([circ(128,128,36),rad(120,118,40,'#fff3a0','#ffc21a'),'#d99400']); break; }
    case 'ribbon':{ const L=new Path2D(); L.moveTo(124,124); L.bezierCurveTo(90,60,24,64,30,112); L.bezierCurveTo(34,158,96,150,124,132); L.closePath(); const R=new Path2D(); R.moveTo(132,124); R.bezierCurveTo(166,60,232,64,226,112); R.bezierCurveTo(222,158,160,150,132,132); R.closePath();
      const T1=new Path2D(); T1.moveTo(118,136); T1.lineTo(86,214); T1.lineTo(106,206); T1.lineTo(116,226); T1.lineTo(134,140); T1.closePath(); const T2=new Path2D(); T2.moveTo(138,136); T2.lineTo(170,214); T2.lineTo(150,206); T2.lineTo(140,226); T2.lineTo(122,140); T2.closePath();
      const f=lin(30,60,226,160,'#ff9cc2','#ff4f8e'); shapes.push([T1,f,'#c21f5e'],[T2,f,'#c21f5e'],[L,f,'#c21f5e'],[R,f,'#c21f5e'],[ell(128,128,22,26),rad(122,120,30,'#ffb8d2','#ff4f8e'),'#c21f5e']); break; }
    case 'strawberry':{ const B=new Path2D(); B.moveTo(128,226); B.bezierCurveTo(70,200,40,140,52,104); B.bezierCurveTo(64,72,104,70,128,78); B.bezierCurveTo(152,70,192,72,204,104); B.bezierCurveTo(216,140,186,200,128,226); B.closePath();
      shapes.push([B,lin(128,70,128,226,'#ff6b6b','#d6182c'),'#a01020']);
      const Lf=new Path2D(); for(let i=0;i<5;i++){ const a=-Math.PI/2+(i-2)*0.55; Lf.moveTo(128,80); Lf.quadraticCurveTo(128+Math.cos(a-0.3)*40,74+Math.sin(a-0.3)*40,128+Math.cos(a)*58,78+Math.sin(a)*46); Lf.quadraticCurveTo(128+Math.cos(a+0.3)*40,74+Math.sin(a+0.3)*40,128,80); } shapes.push([Lf,'#3fae49','#25782c']); break; }
    case 'cherry':{ const st=new Path2D(); st.moveTo(92,170); st.quadraticCurveTo(110,90,170,40); st.moveTo(172,176); st.quadraticCurveTo(170,100,170,40); shapes.push([st,null,'#5a8a2a']); shapes.push([circ(86,178,44),rad(74,164,48,'#ff7a86','#c8102e'),'#8e0b20'],[circ(170,182,44),rad(158,168,48,'#ff7a86','#c8102e'),'#8e0b20']); const lf=new Path2D(); lf.moveTo(170,42); lf.quadraticCurveTo(208,22,226,52); lf.quadraticCurveTo(196,70,170,42); shapes.push([lf,'#5cc24a','#2f7f23']); break; }
    case 'clover':{ for(let i=0;i<4;i++){ const a=i*Math.PI/2+Math.PI/4; const cx=128+Math.cos(a)*44, cy=118+Math.sin(a)*44; const h=new Path2D(); h.ellipse(cx,cy,44,40,a,0,TAU); shapes.push([h,rad(cx,cy,48,'#9be36d','#3aa845'),'#24742c']); } const st=new Path2D(); st.moveTo(128,128); st.quadraticCurveTo(136,190,168,224); shapes.push([st,null,'#2c8a33']); break; }
    case 'rainbow':{ const cols=['#ff5a5f','#ff9f43','#ffd93d','#5ad17a','#4aa8ff','#9a6bff']; for(let i=0;i<cols.length;i++){ const r=104-i*13; const p=new Path2D(); p.arc(128,168,r,Math.PI,0); p.arc(128,168,r-13,0,Math.PI,true); p.closePath(); shapes.push([p,cols[i],null]); }
      shapes.push([ell(48,172,30,22),'#ffffff','#bcd6ea'],[ell(208,172,30,22),'#ffffff','#bcd6ea']); break; }
    case 'bear':{ shapes.push([circ(66,70,30),'#c8874e','#7d4a22'],[circ(190,70,30),'#c8874e','#7d4a22'],[circ(128,136,92),rad(110,110,100,'#e0a468','#b9733a'),'#7d4a22'],[ell(128,170,40,32),'#f6dcc0','#b98a5c']); break; }
    case 'cat':{ const H=new Path2D(); H.moveTo(44,96); H.lineTo(60,26); H.lineTo(108,62); H.quadraticCurveTo(128,56,148,62); H.lineTo(196,26); H.lineTo(212,96); H.bezierCurveTo(236,170,190,222,128,222); H.bezierCurveTo(66,222,20,170,44,96); H.closePath(); shapes.push([H,rad(110,110,130,'#ffffff','#e9e2da'),'#9a8f86']); break; }
  }
  // 1) 따낸 흰 테두리와 그림자 두께
  g.save(); g.lineJoin='round'; g.lineCap='round';
  g.shadowColor='rgba(60,40,20,0.35)'; g.shadowBlur=6; g.shadowOffsetY=3;
  for(const [p,f,s] of shapes){ g.lineWidth=f?30:40; g.strokeStyle='#ffffff'; g.stroke(p); if(f){ g.fillStyle='#ffffff'; g.fill(p); } }
  g.restore();
  g.save(); g.lineJoin='round'; g.lineCap='round';
  for(const [p,f,s] of shapes){ g.lineWidth=f?30:40; g.strokeStyle='#ffffff'; g.stroke(p); if(f){ g.fillStyle='#fff'; g.fill(p);} }
  // 2) 그림
  for(const [p,f,s] of shapes){
    if(f){ g.fillStyle=f; g.fill(p); }
    if(s){ g.lineWidth=f?5:12; g.strokeStyle=s; g.stroke(p); }
  }
  // 3) 세부
  switch(k){
    case 'heart': drawGloss(g,86,86,30,16,-0.7); break;
    case 'star': drawGloss(g,100,104,26,12,-0.6); break;
    case 'sparkle': drawGloss(g,112,104,22,10,-0.7,0.9); break;
    case 'moon': drawGloss(g,82,110,22,12,-1.2); break;
    case 'flower': for(let i=0;i<5;i++){ const a=-Math.PI/2+i*TAU/5; drawGloss(g,128+Math.cos(a)*62-8,128+Math.sin(a)*62-8,16,8,a,0.7);} drawGloss(g,118,118,14,8,-0.6); break;
    case 'ribbon': drawGloss(g,64,96,20,10,-0.6,0.7); drawGloss(g,190,96,20,10,0.6,0.7); break;
    case 'strawberry': g.fillStyle='#ffe9a8'; for(const [x,y] of [[96,120],[128,112],[160,120],[84,152],[116,150],[148,150],[176,152],[104,182],[136,184],[160,180],[124,206]]){ g.beginPath(); g.ellipse(x,y,3.2,5,0,0,TAU); g.fill(); } drawGloss(g,86,110,18,10,-0.8,0.7); break;
    case 'cherry': drawGloss(g,70,160,14,9,-0.7,0.85); drawGloss(g,154,164,14,9,-0.7,0.85); break;
    case 'clover': drawGloss(g,98,94,14,8,-0.7,0.6); drawGloss(g,152,94,14,8,-0.7,0.6); break;
    case 'bear': g.fillStyle='#f3c99a'; g.beginPath(); g.arc(66,70,15,0,TAU); g.arc(190,70,15,0,TAU); g.fill();
      g.fillStyle='#3a2416'; g.beginPath(); g.ellipse(96,130,9,11,0,0,TAU); g.ellipse(160,130,9,11,0,0,TAU); g.fill(); g.beginPath(); g.ellipse(128,158,14,10,0,0,TAU); g.fill();
      g.strokeStyle='#3a2416'; g.lineWidth=5; g.beginPath(); g.moveTo(128,166); g.lineTo(128,178); g.moveTo(128,178); g.quadraticCurveTo(116,190,106,182); g.moveTo(128,178); g.quadraticCurveTo(140,190,150,182); g.stroke();
      g.fillStyle='rgba(255,130,130,0.45)'; g.beginPath(); g.ellipse(76,160,14,9,0,0,TAU); g.ellipse(180,160,14,9,0,0,TAU); g.fill(); drawGloss(g,96,82,20,10,-0.6,0.6); break;
    case 'cat': g.fillStyle='#ffb7c9'; g.beginPath(); g.moveTo(66,44); g.lineTo(98,66); g.lineTo(72,84); g.closePath(); g.moveTo(190,44); g.lineTo(158,66); g.lineTo(184,84); g.closePath(); g.fill();
      g.fillStyle='#4a3a32'; g.beginPath(); g.ellipse(96,140,10,13,0,0,TAU); g.ellipse(160,140,10,13,0,0,TAU); g.fill(); g.fillStyle='#fff'; g.beginPath(); g.arc(99,135,3.5,0,TAU); g.arc(163,135,3.5,0,TAU); g.fill();
      g.fillStyle='#ff8fab'; g.beginPath(); g.moveTo(120,160); g.lineTo(136,160); g.lineTo(128,170); g.closePath(); g.fill();
      g.strokeStyle='#4a3a32'; g.lineWidth=4; g.beginPath(); g.moveTo(128,170); g.quadraticCurveTo(118,184,108,176); g.moveTo(128,170); g.quadraticCurveTo(138,184,148,176);
      for(const s of [-1,1]){ g.moveTo(128+s*44,164); g.lineTo(128+s*86,156); g.moveTo(128+s*44,172); g.lineTo(128+s*86,176); } g.stroke();
      g.fillStyle='rgba(255,140,160,0.4)'; g.beginPath(); g.ellipse(80,168,13,8,0,0,TAU); g.ellipse(176,168,13,8,0,0,TAU); g.fill(); break;
    case 'rainbow': drawGloss(g,90,100,26,8,-0.4,0.5); break;
  }
  g.restore();
  return c;
}
export function stickerCanvas(k){ return drawSticker(k); }
function stickerTex(k){
  if(_stickerTex.has(k)) return _stickerTex.get(k);
  const t=new THREE.CanvasTexture(drawSticker(k)); t.colorSpace=THREE.SRGBColorSpace; t.anisotropy=4;
  _stickerTex.set(k,t); return t;
}

// ───────── 이름 글씨 (등에 마커로 쓴 이름) ─────────
function textTex(text,color){
  const c=document.createElement('canvas'); c.width=512; c.height=256; const g=c.getContext('2d');
  let size=150; g.font=`700 ${size}px Gaegu, "Apple SD Gothic Neo", sans-serif`;
  while(g.measureText(text).width>470&&size>40){ size-=6; g.font=`700 ${size}px Gaegu, "Apple SD Gothic Neo", sans-serif`; }
  g.textAlign='center'; g.textBaseline='middle'; g.lineJoin='round';
  const dark=(new THREE.Color(color)).getHSL({}).l>0.6;
  g.lineWidth=size*0.16; g.strokeStyle=dark?'rgba(40,24,12,0.85)':'rgba(255,255,255,0.9)'; g.strokeText(text,256,136);
  g.fillStyle=color; g.fillText(text,256,136);
  const t=new THREE.CanvasTexture(c); t.colorSpace=THREE.SRGBColorSpace; t.anisotropy=4; return t;
}

// ───────── 보석·진주·리본 ─────────
export const GEMS=[['crystal','큐빅'],['pink','분홍 큐빅'],['mint','민트 큐빅'],['pearl','진주'],['gold','금 장식'],['bow','리본']];
const _gemGeo={};
function gemGeo(k){
  if(_gemGeo[k]) return _gemGeo[k];
  let g;
  if(k==='pearl') g=new THREE.SphereGeometry(0.5,24,16);
  else if(k==='gold'){ g=new THREE.SphereGeometry(0.5,20,10,0,TAU,0,Math.PI/2); g.scale(1,0.55,1); }
  else if(k==='bow'){ g=null; }
  else { // 브릴리언트 컷: 위는 평평한 면(테이블), 아래는 뾰족한 원뿔. 면이 각지게 보이도록 평면 음영
    const pts=[new THREE.Vector2(0,-0.42),new THREE.Vector2(0.5,0.02),new THREE.Vector2(0.44,0.14),new THREE.Vector2(0.26,0.22),new THREE.Vector2(0,0.22)];
    g=new THREE.LatheGeometry(pts,8); g.translate(0,0.36,0); g=g.toNonIndexed(); g.computeVertexNormals();
  }
  _gemGeo[k]=g; return g;
}
const GEM_COLOR={crystal:'#eaf6ff',pink:'#ff5fa2',mint:'#43e6c4'};
export function bowMesh(color){
  const grp=new THREE.Group(); const mat=new THREE.MeshPhysicalMaterial({color,roughness:0.35,sheen:1,sheenColor:new THREE.Color('#ffffff'),sheenRoughness:0.4,clearcoat:0.3});
  for(const s of [1,-1]){ const loop=new THREE.Mesh(new THREE.TorusGeometry(0.22,0.075,10,24),mat); loop.scale.set(1,0.62,0.55); loop.position.set(s*0.21,0.06,0); loop.rotation.set(Math.PI/2,0,s*0.25); grp.add(loop);
    const tail=new THREE.Mesh(new THREE.BoxGeometry(0.1,0.03,0.34),mat); tail.position.set(s*0.12,0.04,-0.2); tail.rotation.y=s*0.45; grp.add(tail); }
  const knot=new THREE.Mesh(new THREE.SphereGeometry(0.11,14,10),mat); knot.scale.set(1,0.8,0.9); knot.position.y=0.08; grp.add(knot);
  grp.traverse(o=>{ if(o.isMesh){ o.castShadow=true; o.userData.ownGeo=true; } });
  return grp;
}
function gemMesh(k){
  if(k==='bow') return bowMesh('#ff6fa8');
  let mat;
  if(k==='pearl') mat=new THREE.MeshPhysicalMaterial({color:'#fff8f0',roughness:0.22,metalness:0,clearcoat:1,clearcoatRoughness:0.1,sheen:1,sheenColor:new THREE.Color('#ffd6ea'),iridescence:0.8,iridescenceIOR:1.35});
  else if(k==='gold') mat=new THREE.MeshPhysicalMaterial({color:'#ffcf5a',roughness:0.18,metalness:1,clearcoat:0.6});
  else mat=new THREE.MeshPhysicalMaterial({color:GEM_COLOR[k]||'#fff',roughness:0.02,metalness:0.15,clearcoat:1,clearcoatRoughness:0,flatShading:true,specularIntensity:1,iridescence:k==='crystal'?0.9:0.4,iridescenceIOR:1.6,envMapIntensity:2.2});
  const m=new THREE.Mesh(gemGeo(k),mat); m.castShadow=true; return m;
}

// ───────── 털모자 ─────────
export const HAT_COLORS=['#ff6f6f','#ffb347','#ffe066','#7bd389','#6fb7ff','#b48cff','#ff9ec7','#f4efe6'];
let _knitTex=null;
function knitTex(){
  if(_knitTex) return _knitTex;
  const c=document.createElement('canvas'); c.width=c.height=128; const g=c.getContext('2d');
  g.fillStyle='#d8d8d8'; g.fillRect(0,0,128,128);
  for(let x=0;x<128;x+=16){ for(let y=0;y<128;y+=12){ for(const s of [-1,1]){ g.save(); g.translate(x+8+s*3.5,y+6); g.rotate(s*0.5); const gr=g.createLinearGradient(-4,0,4,0); gr.addColorStop(0,'#bdbdbd'); gr.addColorStop(0.5,'#ffffff'); gr.addColorStop(1,'#bdbdbd'); g.fillStyle=gr; g.beginPath(); g.ellipse(0,0,3.6,6.5,0,0,TAU); g.fill(); g.restore(); } } }
  _knitTex=new THREE.CanvasTexture(c); _knitTex.wrapS=_knitTex.wrapT=THREE.RepeatWrapping; _knitTex.repeat.set(6,2); _knitTex.colorSpace=THREE.SRGBColorSpace; return _knitTex;
}
export function hatMesh(color){
  const grp=new THREE.Group();
  const mat=new THREE.MeshStandardMaterial({color,roughness:0.92,map:knitTex()});
  const pts=[]; for(let i=0;i<=12;i++){ const a=i/12*Math.PI/2; pts.push(new THREE.Vector2(Math.cos(a)*0.24*(1-0.06*Math.sin(a*2)),Math.sin(a)*0.26)); }
  const dome=new THREE.Mesh(new THREE.LatheGeometry(pts,28),mat); dome.position.y=0.03; grp.add(dome);
  const brimTex=knitTex().clone(); brimTex.repeat.set(10,1); brimTex.needsUpdate=true;
  const brim=new THREE.Mesh(new THREE.TorusGeometry(0.236,0.038,10,32),new THREE.MeshStandardMaterial({color:new THREE.Color(color).multiplyScalar(0.92),roughness:0.95,map:brimTex})); brim.material.userData.disposeMap=true; brim.rotation.x=Math.PI/2; brim.scale.z=1.35; brim.position.y=0.03; grp.add(brim);
  // 방울: 작은 털 뭉치를 겹쳐 보송하게
  const pom=new THREE.Group(); const pm=new THREE.MeshStandardMaterial({color:'#fffaf2',roughness:1});
  for(let i=0;i<14;i++){ const b=new THREE.Mesh(new THREE.SphereGeometry(0.045+Math.random()*0.02,8,6),pm); const a=Math.random()*TAU, e=Math.random()*Math.PI; b.position.set(Math.cos(a)*Math.sin(e)*0.06,Math.cos(e)*0.06,Math.sin(a)*Math.sin(e)*0.06); pom.add(b); }
  pom.position.y=0.33; grp.add(pom);
  grp.traverse(o=>{ if(o.isMesh){ o.castShadow=true; o.receiveShadow=true; o.userData.ownGeo=true; } });
  return grp;
}

// ───────── 꾸미기 전체를 다시 붙인다 ─────────
// deco 자료(저장되는 값):
//  polish:{L:{c,s},R:{c,s},P:{c,s}}  stickers:[{k,p:[x,y,z],n:[x,y,z],r,s}]  gems:[{k,p,n,r,s}]
//  hat:{c,on}  abow:{side,c,on}  text:{t,c}
let _projMesh=null;
function projector(){ if(!_projMesh) _projMesh=new THREE.Mesh(roachGeos('adult').body); return _projMesh; }
const _dq=new THREE.Quaternion(), _dm=new THREE.Matrix4(), _dObj=new THREE.Object3D();
function decalGeo(p,n,r,w,h,depth,lift){
  // 붙일 자리에서 몸 바깥쪽을 보는 투영 상자. 그림의 위쪽은 머리 쪽(+z)을 향하고 r만큼 돌린다
  _dObj.position.set(p[0],p[1],p[2]); if(Math.abs(n[2])>0.9) _dObj.up.set(0,1,0); else _dObj.up.set(0,0,1);
  _dObj.lookAt(p[0]+n[0],p[1]+n[1],p[2]+n[2]); _dObj.rotateZ(r||0); _dObj.updateMatrix();
  const g=new DecalGeometry(projector(),_dObj.position,_dObj.rotation,new THREE.Vector3(w,h,depth));
  const P=g.attributes.position,N=g.attributes.normal;
  for(let i=0;i<P.count;i++) P.setXYZ(i,P.getX(i)+N.getX(i)*lift,P.getY(i)+N.getY(i)*lift,P.getZ(i)+N.getZ(i)*lift);
  g.computeBoundingSphere(); return g;
}
export function applyDeco(model,deco){
  const D=model.deco;
  const drop=o=>o.traverse(m=>{ if(!m.isMesh) return; if(m.userData.ownGeo) m.geometry.dispose(); for(const mt of Array.isArray(m.material)?m.material:[m.material]){ if(!mt||m.userData.ownMat===false) continue; if(mt.userData?.disposeMap) mt.map?.dispose(); mt.dispose?.(); } });
  for(const o of [...D.children]){ D.remove(o); drop(o); }
  if(model.abow){ model.abow.parent?.remove(model.abow); drop(model.abow); }   // 더듬이 리본은 꾸미기 묶음 밖(더듬이 마디)에 달려 있어 따로 뗀다
  model.hat=null; model.abow=null;
  if(!deco) return;
  if(deco.polish) for(const part of ['L','R','P']){ const p=deco.polish[part]; if(p&&p.c){ const m=polishMesh(part,p); m.traverse(o=>{ if(o.isMesh){ o.castShadow=false; o.receiveShadow=true; } }); D.add(m); } }
  if(deco.text&&deco.text.t){ try{
      const w=0.42, h=0.21; const g=decalGeo([0,0.14,-0.22],[0,1,0],0,w,h,0.18,0.016);
      const m=new THREE.Mesh(g,new THREE.MeshStandardMaterial({map:textTex(deco.text.t,deco.text.c||'#ffffff'),transparent:true,depthWrite:false,polygonOffset:true,polygonOffsetFactor:-6,roughness:0.5}));
      m.material.userData.disposeMap=true; m.userData.ownGeo=true; m.renderOrder=3; D.add(m);
    }catch(e){ console.warn(e); } }
  for(const st of deco.stickers||[]){ try{
      const s=st.s||0.26;
      const sh=new THREE.Mesh(decalGeo(st.p,st.n,st.r,s*1.04,s*1.04,0.16,0.014),new THREE.MeshBasicMaterial({color:0x3a2412,transparent:true,opacity:0.22,depthWrite:false,polygonOffset:true,polygonOffsetFactor:-5,map:stickerTex(st.k)}));
      sh.userData.ownGeo=true; sh.renderOrder=3; D.add(sh);
      const m=new THREE.Mesh(decalGeo(st.p,st.n,st.r,s,s,0.16,0.02),new THREE.MeshPhysicalMaterial({map:stickerTex(st.k),transparent:true,depthWrite:false,polygonOffset:true,polygonOffsetFactor:-8,roughness:0.28,clearcoat:0.6,clearcoatRoughness:0.2}));
      m.userData.ownGeo=true; m.renderOrder=4; D.add(m);
    }catch(e){ console.warn(e); } }
  for(const gm of deco.gems||[]){
    const m=gemMesh(gm.k); const s=gm.s||(gm.k==='bow'?0.2:gm.k==='pearl'?0.085:0.1);
    m.scale.setScalar(s); m.position.set(gm.p[0],gm.p[1],gm.p[2]);
    _v1.set(gm.n[0],gm.n[1],gm.n[2]).normalize(); m.quaternion.setFromUnitVectors(_v2.set(0,1,0),_v1); m.rotateY(gm.r||0);
    m.position.addScaledVector(_v1,gm.k==='pearl'?s*0.35:0.006);
    D.add(m);
  }
  if(deco.hat&&deco.hat.on!==false){ const h=hatMesh(deco.hat.c||'#ff6f6f'); h.position.set(0,0.13,0.35); h.rotation.x=0.3; h.scale.setScalar(0.52); D.add(h); model.hat=h; }
  if(deco.abow&&deco.abow.on!==false){ const a=model.ants.find(x=>x.s===(deco.abow.side||1)); if(a){ const b=bowMesh(deco.abow.c||'#ff6fa8'); b.scale.setScalar(0.2); b.position.set(0,0.14,0); b.rotation.set(0,0,Math.PI/2*a.s); a.segs[0].add(b); model.abow=b; } }
}
/** 몸 표면 한 점(월드)을 몸 좌표로 바꾼다. 꾸밀 때 누른 자리를 저장하는 데 쓴다 */
export function worldHitToBody(model,hit){
  model.inner.updateMatrixWorld(true);
  const inv=new THREE.Matrix4().copy(model.inner.matrixWorld).invert();
  const p=hit.point.clone().applyMatrix4(inv);
  const n=hit.face?hit.face.normal.clone():new THREE.Vector3(0,1,0);
  return {p:[p.x,p.y,p.z],n:[n.x,n.y,n.z]};
}
export { roachGeos, LEG_DEF, HIP_Y, LEG_ELEV, GeoBuilder, ROACH_PAL };
