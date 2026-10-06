// bappu-ball.js — 바뿌볼 공통 모듈
// 투명 슬라임 덩어리 + 그 위에 붙은 실제 게임 바퀴벌레(부위별 인스턴스) + 부서진 조각.
// 1라운드(게임 창 안)와 slime-lab.html(별도 창) 둘 다 이 파일로 같은 공을 그린다.
// THREE는 호출하는 쪽의 것을 받아 쓴다 (게임 렌더러는 다른 three.js 인스턴스로 만든 도형을 읽지 못한다).

import {GooLayer} from './bappu-goo.js';
export const ROACH_COUNT=90;
export const FLOOR=0.70;          // 공 단위(반지름 1)에서 바닥면 높이. 공은 무게로 이만큼 주저앉아 있다.
const PI=Math.PI, TAU=PI*2;
const clamp=(v,a,b)=>v<a?a:v>b?b:v;
const lerp=(a,b,t)=>a+(b-a)*t;
const sstep=(a,b,x)=>{const t=clamp((x-a)/(b-a),0,1);return t*t*(3-2*t);};
const hash=(x)=>{const s=Math.sin(x*127.1+311.7)*43758.5453;return s-Math.floor(s);};
const dsstep=(a,b,x)=>{const t=(x-a)/(b-a);return t<=0||t>=1?0:6*t*(1-t)/(b-a);};

// ───────── 주무르기 흐름 ─────────
// 속의 조각·부스러기·알갱이·진물은 손가락이 한 일만큼 '흐름'을 따라 옮겨진다. 흐름은 소용돌이(curl)로 만들어 부피를 보존한다:
// 어디로 들어간 만큼 다른 데서 나오므로 한쪽에 몰리거나 비지 않는다 (공 뒤쪽이나 한가운데에 뭉쳐 풍선처럼 되지 않는다).
// 반지름 MIX_RB 구면에서는 표면을 따라서만 흐르므로 조각이 슬라임 밖으로 밀려 나가지도 않는다.
//  · 누르기(깊어지는 동안): 손가락 밑으로 모여 가라앉고, 둘레 속에서 다시 떠오르는 고리 소용돌이
//  · 끌기: 겉은 손가락을 따라가고, 손가락 앞쪽은 접혀 들어가고, 뒤쪽은 떠오르는 굴림 소용돌이
const MIX_RB=1.0;                // 흐름 경계 (이 구면에서 흐름은 표면과 나란하다)
const MIX_RMAX=0.955;            // 조각이 있을 수 있는 가장 바깥
const MIX_PRESS=0.35;            // 한 번 꾹 누를 때(k 0→1) 손가락 바로 밑 조각이 가라앉는 정도 (겉 0.9 → 0.7쯤)
const MIX_PRESS_W=0.9;           // 고리 소용돌이 굵기 (압입 폭 배율)
const MIX_S0=-0.25, MIX_S1=0.4;  // 고리 소용돌이가 미치는 깊이: 손가락 쪽 반구 + 중심 조금 너머까지
const MIX_DRAG=0.7;              // 끈 거리 대비 손가락 바로 밑 조각이 따라오는 정도
const MIX_ROLL_C=0.55, MIX_ROLL_W=0.85;  // 굴림 소용돌이 중심 깊이(반지름 배율), 굵기(압입 폭 배율)
const MIX_STEP=0.03;             // 적분 한 걸음 상한 (빠르게 문질러도 흐름을 건너뛰지 않게)
const MIX_RUB=0.12;              // 마모: 문지른 거리 1(라디안)이 꾹 누르기 한 번의 몇 배 일인지

// ───────── 바퀴 모델 부위 정의 (game.html buildRoachBody의 정점 순서 그대로) ─────────
// 몸통 한 덩어리는 배(414) → 가슴·고관절(610) → 앞가슴판(450) → 머리(406) → 꼬리털(84) → 오른날개(506) → 왼날개(506) 순으로 정점이 쌓여 있다.
const BODY_COUNT=2976;
const ABD=[0,414], THX=[414,1024], PRO=[1024,1474], HEAD=[1474,1880], CER=[1880,1964], WR=[1964,2470], WL=[2470,2976];
// 부위 목록. kind: shell(등껍질 재질) / wing(반투명 날개) / fem,tib(다리) / ant(더듬이)
// pivot: 부위가 꺾이거나 떨어질 때의 회전 중심 (바퀴 로컬 좌표)
export const PIECES=[
  {id:'abdF',  kind:'shell', pivot:[0,0.068,-0.06]},
  {id:'abdB',  kind:'shell', pivot:[0,0.060,-0.42]},
  {id:'thorax',kind:'shell', pivot:[0,0.064,0.13]},
  {id:'pro',   kind:'shell', pivot:[0,0.100,0.30]},
  {id:'head',  kind:'shell', pivot:[0,0.040,0.405]},
  {id:'cerci', kind:'shell', pivot:[0,0.058,-0.53]},
  {id:'wRA',   kind:'wing',  pivot:[0.088,0.096,0.22]},
  {id:'wRB',   kind:'wing',  pivot:[0.088,0.090,-0.21]},
  {id:'wLA',   kind:'wing',  pivot:[-0.088,0.096,0.22]},
  {id:'wLB',   kind:'wing',  pivot:[-0.088,0.090,-0.21]},
  {id:'fem0',kind:'fem',leg:0},{id:'tib0',kind:'tib',leg:0},
  {id:'fem1',kind:'fem',leg:1},{id:'tib1',kind:'tib',leg:1},
  {id:'fem2',kind:'fem',leg:2},{id:'tib2',kind:'tib',leg:2},
  {id:'ant',kind:'ant'},
];
export const BODY_PIECES=10;       // 앞 10개가 몸통 조각
const NP=PIECES.length;            // 17 종류
// 바퀴 한 마리가 차지하는 인스턴스 슬롯: 몸통 10 + 다리 12(6종×좌우) + 더듬이 6마디
const SLOT_BODY=10, SLOT_LEG=12, SLOT_ANT=6, SLOTS=SLOT_BODY+SLOT_LEG+SLOT_ANT; // 28

// 다리 상수 (game.html LEG_DEF와 같다; extract 시 실제 값으로 덮어쓴다)
const LEG_DEF_DEFAULT=[
  {z:0.30,yaw:0.75,ky:-0.35,fl:0.28,tl:0.30,w:0.85,tar:0.15,knee:-0.758},
  {z:0.06,yaw:1.90,ky:0.60, fl:0.34,tl:0.40,w:1.0, tar:0.19,knee:-0.686},
  {z:-0.20,yaw:2.25,ky:0.55,fl:0.44,tl:0.56,w:1.15,tar:0.27,knee:-0.627},
];
const HIP_X=0.13, HIP_Y=0.05;
const ANT_BASE=[0.032,0.052,0.462];

// ───────── 게임 바퀴 모델에서 도형 뽑기 (게임 창 안에서 실행) ─────────
// model: makeRoach()가 돌려준 {g, parts:{body, legs:[{hip,fem,knee,s,i,d}], ants:[{base,segs,s}]}}
export function extractRoachGeos(THREE,model){
  const body=model.parts.body.geometry;
  const P=body.attributes.position, N=body.attributes.normal, C=body.attributes.color;
  if(!P||P.count!==BODY_COUNT||!body.index||!C) throw new Error('roach body geometry layout mismatch ('+(P&&P.count)+')');
  const idx=body.index.array;
  // 각 정점이 어느 조각에 속하는지 표를 만든다
  const pieceOf=new Uint8Array(BODY_COUNT);
  const mark=(r,v)=>{for(let i=r[0];i<r[1];i++)pieceOf[i]=v;};
  mark(THX,2);mark(PRO,3);mark(HEAD,4);mark(CER,5);
  for(let i=ABD[0];i<ABD[1];i++) pieceOf[i]=(Math.floor(i/18)<=11)?0:1;             // 배: 앞 12줄 / 뒤
  for(let i=WR[0];i<WR[1];i++){ const k=(i-WR[0])%253; pieceOf[i]=(Math.floor(k/11)<=11)?6:7; } // 오른날개 뿌리쪽/끝쪽
  for(let i=WL[0];i<WL[1];i++){ const k=(i-WL[0])%253; pieceOf[i]=(Math.floor(k/11)<=11)?8:9; }
  const lists=Array.from({length:BODY_PIECES},()=>[]);
  for(let t=0;t<idx.length;t+=3){
    const a=idx[t],b=idx[t+1],c=idx[t+2];
    const pa=pieceOf[a],pb=pieceOf[b],pc=pieceOf[c];
    // 경계 삼각형은 더 뒤(끝) 쪽 조각으로 보낸다
    const p=Math.max(pa,pb,pc)===Math.min(pa,pb,pc)?pa:Math.max(pa,pb,pc);
    lists[p].push(a,b,c);
  }
  const legs=[], tibs=[], legDef=[];
  for(let i=0;i<3;i++){
    const lg=model.parts.legs.find(l=>l.i===i&&l.s>0);
    legDef.push({...lg.d});
    const fg=lg.fem.children[0].geometry, tg=lg.knee.children[0].geometry;
    legs.push(attrs(fg)); tibs.push(attrs(tg));
  }
  const ag=model.parts.ants[0].segs[0].children[0].geometry;
  return {
    body:{position:P.array.slice(),normal:N.array.slice(),color:C.array.slice()},
    bodyIndex:lists.map(l=>Uint16Array.from(l)),
    fem:legs, tib:tibs, ant:attrs(ag), legDef,
  };
  function attrs(g){ return {position:g.attributes.position.array.slice(),normal:g.attributes.normal.array.slice(),color:g.attributes.color.array.slice(),index:g.index?Uint16Array.from(g.index.array):null}; }
}

// 산 바퀴의 현재 다리·더듬이 자세를 숫자로 굳힌다 (공에 붙은 뒤 인스턴스가 같은 자세로 서도록)
export function bakeRoachPose(model){
  const legs=new Float32Array(24);
  for(const lg of model.parts.legs){
    const k=(lg.s>0?0:3)+lg.i;
    legs[k*4]=lg.hip.rotation.y; legs[k*4+1]=lg.fem.rotation.z; legs[k*4+2]=lg.knee.rotation.z; legs[k*4+3]=lg.knee.rotation.y;
  }
  return {legs, antPhase:Math.random()*TAU};
}

// 다른 창으로 보낼 때 그대로 structured clone 된다 (TypedArray라 복사 비용 작음)
export function serializeGeos(geos){ return geos; }

// ───────── 공 ─────────
export class BappuBall{
  /**
   * @param THREE  호스트 쪽 three.js
   * @param opts   {geos, radius, segments, materials?:{shell,limb}, shadow:boolean, count}
   */
  constructor(THREE,opts){
    this.T=THREE; const T=THREE;
    this.geos=opts.geos;
    this.R=opts.radius||1;                 // 호스트 단위 반지름
    this.count=opts.count||ROACH_COUNT;
    this.roachScale=opts.roachScale||(0.13/this.R); // 바퀴 모델 배율(게임 0.13) → 공 단위
    this.lift=0;                           // 0 바닥에 놓임 ~ 1 공중
    this.crushCount=0;
    this.murk=0; this._murkShown=0;
    this.crumbSize=opts.crumbSize||0.06;
    this.castShadow=opts.castShadow!==false;
    this.group=new T.Group(); this.group.name='bappu-ball'; this.group.scale.setScalar(this.R);
    this.rollQ=new T.Quaternion();         // 공이 구른 만큼의 회전 (바퀴만 돈다, 슬라임 덩어리는 대칭이라 안 돌려도 된다)
    this.rollQInv=new T.Quaternion();
    this.time=0;
    this.squat=0;                          // 0~1 오래 놓여 더 퍼진 정도
    this.dents=[];                         // 손가락 압입
    this.wob={v:0,vel:0};                  // 전체 출렁임 (세로 모드)
    this.spreadV=0;                        // 전체 옆 퍼짐 (압입 부피 보존)
    this.fade=1;
    this.dirty=true;
    this.legDef=(this.geos.legDef&&this.geos.legDef.length===3)?this.geos.legDef:LEG_DEF_DEFAULT;
    this._tmp=Array.from({length:24},()=>new T.Vector3());
    this._q=[0,1,2,3].map(()=>new T.Quaternion());
    this._m=[0,1,2,3,4,5].map(()=>new T.Matrix4());
    this._e=new T.Euler();
    this._flows=[];
    this._mv=[0,1,2,3].map(()=>new T.Vector3());
    this.buildAnchors();
    this.buildSlime(opts.segments||[44,30]);
    this.buildRoaches(opts.materials);
    this.buildPieceCenters();
    this.buildCrumbs();
    this.goo=new GooLayer(this);
    if(opts.shadow!==false) this.buildShadow();
    this.roaches=Array.from({length:this.count},(_,i)=>this.emptyRoach(i));
    this.brokenCount=0;
  }

  // ── 바퀴가 붙는 자리 80곳: 피보나치 구 + 흔들림 ──
  buildAnchors(){
    const T=this.T, n=this.count;
    this.anchorDir=[]; this.anchorT1=[]; this.anchorT2=[];
    const g=PI*(3-Math.sqrt(5));
    for(let i=0;i<n;i++){
      const y=1-(i+0.5)/n*2, r=Math.sqrt(1-y*y), th=g*i+hash(i*7.3)*0.35;
      const d=new T.Vector3(Math.cos(th)*r,y,Math.sin(th)*r).normalize();
      const a=Math.abs(d.y)<0.9?new T.Vector3(0,1,0):new T.Vector3(1,0,0);
      const t1=new T.Vector3().crossVectors(a,d).normalize(), t2=new T.Vector3().crossVectors(d,t1).normalize();
      this.anchorDir.push(d); this.anchorT1.push(t1); this.anchorT2.push(t2);
    }
    this.anchorUsed=new Uint8Array(n);
  }
  // 로컬 방향 n에서 가장 가까운 빈 자리. 없으면 -1
  nearestFreeAnchor(nLocal){
    let best=-1,bd=-2;
    for(let i=0;i<this.count;i++){ if(this.anchorUsed[i])continue; const d=this.anchorDir[i].dot(nLocal); if(d>bd){bd=d;best=i;} }
    return best;
  }
  freeAnchorCount(){ let c=0; for(let i=0;i<this.count;i++) if(!this.anchorUsed[i]) c++; return c; }
  // 빈 자리가 가장 뭉쳐 있는 방향 (찍을 때 깨끗한 면이 바닥을 보도록)
  cleanestDir(out){
    let best=-1,bs=-1;
    for(let i=0;i<this.count;i++){ if(this.anchorUsed[i])continue; let s=0; for(let j=0;j<this.count;j++){ if(this.anchorUsed[j])continue; const d=this.anchorDir[i].dot(this.anchorDir[j]); if(d>0.72)s+=d; } if(s>bs){bs=s;best=i;} }
    if(best<0){ out.set(0,-1,0); return out; }
    return out.copy(this.anchorDir[best]);
  }
  // 공을 돌려서 로컬 방향 dirLocal이 월드 -y(바닥)를 보게 한다 (y축 둘레 비틀기는 랜덤)
  faceDown(dirLocal){
    const T=this.T, q=this._q[0], twist=this._q[1];
    q.setFromUnitVectors(dirLocal,new T.Vector3(0,-1,0));
    twist.setFromAxisAngle(new T.Vector3(0,1,0),Math.random()*TAU);
    this.rollQ.copy(twist).multiply(q); this.rollQInv.copy(this.rollQ).invert(); this.dirty=true;
  }
  // 바닥 위를 dx,dz(호스트 단위)만큼 굴렀다
  roll(dx,dz){
    const T=this.T, d=Math.hypot(dx,dz); if(d<1e-6)return;
    const rr=this.R*(0.78-0.08*this.squat);          // 주저앉은 공의 실제 구름 반지름
    const axis=this._tmp[0].set(dz,0,-dx).normalize();  // up × Δ
    const q=this._q[0].setFromAxisAngle(axis,d/rr);
    this.rollQ.premultiply(q); this.rollQInv.copy(this.rollQ).invert(); this.dirty=true;
  }

  // ── 슬라임 덩어리 ──
  buildSlime([ws,hs]){
    const T=this.T;
    const geo=new T.SphereGeometry(1,ws,hs);
    this.slimeGeo=geo;
    this.slimeBase=geo.attributes.position.array.slice();
    this.envMap=makeEnvMap(T);
    const common={color:0xf1fbfd,roughness:0.13,metalness:0,transparent:true,depthWrite:false,clearcoat:1,clearcoatRoughness:0.16,envMap:this.envMap,envMapIntensity:1.7,specularIntensity:1.6,ior:1.45};
    this.matBack=new T.MeshPhysicalMaterial({...common,opacity:1,side:T.BackSide,color:0xc9efe9});
    this.matFront=new T.MeshPhysicalMaterial({...common,opacity:1,side:T.FrontSide});
  
    slimeFresnel(T,this.matFront,0.12,0.58,0x7fe3d3,0.6);
    slimeFresnel(T,this.matBack,0.04,0.32,0x5fd0c0,0.35);




    // 뒷벽(공 안쪽 먼 면)은 속 내용물보다 먼저 그린다. 진물·알갱이·날개가 뒷벽 뒤에 있는 것처럼 뿌옇게 덮이지 않게
    this.slimeBack=new T.Mesh(geo,this.matBack); this.slimeBack.renderOrder=1; this.slimeBack.frustumCulled=false;
    this.slime=new T.Mesh(geo,this.matFront); this.slime.renderOrder=21; this.slime.frustumCulled=false;
    this.group.add(this.slimeBack,this.slime);
    // 속 기포 몇 개 (투명 슬라임 느낌)
    const bub=new T.SphereGeometry(1,8,6);
    this.bubbles=new T.InstancedMesh(bub,new T.MeshPhysicalMaterial({color:0xffffff,roughness:0.05,transparent:true,opacity:0.35,depthWrite:false,envMap:this.envMap,envMapIntensity:0.8}),14);
    this.bubbles.renderOrder=19; this.bubbles.frustumCulled=false;
    this.bubbleRest=[];
    const m=new T.Matrix4(), v=new T.Vector3();
    for(let i=0;i<14;i++){ const d=new T.Vector3(hash(i*3.1)-0.5,hash(i*5.7)-0.5,hash(i*9.3)-0.5).normalize().multiplyScalar(0.25+hash(i*2.2)*0.55); this.bubbleRest.push({p:d,s:0.012+hash(i*4.4)*0.02}); m.makeScale(1,1,1).setPosition(d); this.bubbles.setMatrixAt(i,m); }
    this.group.add(this.bubbles);
  }

  // ── 바퀴 인스턴스 (부위별 InstancedMesh) ──
  buildRoaches(mats){
    const T=this.T, G=this.geos, n=this.count;
    const bodyPos=new T.Float32BufferAttribute(G.body.position,3), bodyNrm=new T.Float32BufferAttribute(G.body.normal,3), bodyCol=new T.Float32BufferAttribute(G.body.color,3);
    // 주의: 다른 창(realm)에서 만든 TypedArray는 instanceof 검사에 걸리므로 반드시 호스트 THREE의 ...BufferAttribute로 다시 만든다
    const mkGeo=(a)=>{ const g=new T.BufferGeometry(); g.setAttribute('position',new T.Float32BufferAttribute(a.position,3)); g.setAttribute('normal',new T.Float32BufferAttribute(a.normal,3)); g.setAttribute('color',new T.Float32BufferAttribute(a.color,3)); if(a.index)g.setIndex(new T.Uint16BufferAttribute(a.index,1)); g.computeBoundingSphere(); return g; };
    this.matShell=mats?.shell||new T.MeshPhysicalMaterial({color:0xffffff,vertexColors:true,roughness:0.4,metalness:0,clearcoat:0.65,clearcoatRoughness:0.24});
    this.matLimb=mats?.limb||new T.MeshStandardMaterial({color:0xffffff,vertexColors:true,roughness:0.46});
    this.matWing=new T.MeshPhysicalMaterial({color:0xffffff,vertexColors:true,roughness:0.32,metalness:0,clearcoat:0.8,clearcoatRoughness:0.2,transparent:true,opacity:0.93,side:T.DoubleSide});
    this.meshes=[]; this.pieceGeo=[];
    for(let p=0;p<NP;p++){
      const def=PIECES[p]; let geo, mat, cap;
      if(p<BODY_PIECES){ geo=new T.BufferGeometry(); geo.setAttribute('position',bodyPos); geo.setAttribute('normal',bodyNrm); geo.setAttribute('color',bodyCol); geo.setIndex(new T.Uint16BufferAttribute(G.bodyIndex[p],1)); geo.computeBoundingSphere(); mat=def.kind==='wing'?this.matWing:this.matShell; cap=n; }
      else if(def.kind==='fem'){ geo=mkGeo(G.fem[def.leg]); mat=this.matLimb; cap=n*2; }
      else if(def.kind==='tib'){ geo=mkGeo(G.tib[def.leg]); mat=this.matLimb; cap=n*2; }
      else { geo=mkGeo(G.ant); mat=this.matLimb; cap=n*6; }
      const im=new T.InstancedMesh(geo,mat,cap); im.count=0; im.frustumCulled=false; im.castShadow=this.castShadow; im.receiveShadow=false;
      im.instanceMatrix.setUsage(T.DynamicDrawUsage);
      const zero=new T.Matrix4().makeScale(0,0,0); for(let i=0;i<cap;i++)im.setMatrixAt(i,zero);
      im.renderOrder=def.kind==='wing'?2:1;
      this.meshes.push(im); this.pieceGeo.push(geo); this.group.add(im);
    }
    // 작은 갈색 부스러기 (조각 단계)
    const shard=new T.ConeGeometry(0.012,0.02,4); shard.translate(0,0.006,0);
    const sc=new Float32Array(shard.attributes.position.count*3); for(let i=0;i<sc.length;i+=3){ const k=0.6+hash(i)*0.5; sc[i]=0.25*k; sc[i+1]=0.12*k; sc[i+2]=0.05*k; }
    shard.setAttribute('color',new T.Float32BufferAttribute(sc,3));
    this.shardCap=this.count*4;
    this.shards=new T.InstancedMesh(shard,new T.MeshStandardMaterial({color:0xffffff,vertexColors:true,roughness:0.7}),this.shardCap);
    this.shards.count=0; this.shards.frustumCulled=false; this.shards.instanceMatrix.setUsage(T.DynamicDrawUsage); this.shards.renderOrder=1;
    this.shardList=[]; this.group.add(this.shards);
  }
  // 부위마다 도형의 가운데와 크기. 떨어진 조각은 자기 가운데를 축으로 돌고, 크기만큼 겉에서 안쪽에 머문다
  // (바퀴 몸 원점을 축으로 돌리면 머리·꼬리·다리 끝 조각이 크게 휘둘려 슬라임 밖으로 튀어나온다)
  buildPieceCenters(){
    const T=this.T; this.pieceCen=[]; this.pieceCenM=[]; this.pieceExt=[];
    for(let p=0;p<NP;p++){
      const g=this.pieceGeo[p], P=g.attributes.position.array, idx=g.index?g.index.array:null;
      const nv=P.length/3, seen=new Uint8Array(nv);
      if(idx){ for(let k=0;k<idx.length;k++) seen[idx[k]]=1; } else seen.fill(1);
      let n=0,cx=0,cy=0,cz=0;
      for(let v=0;v<nv;v++){ if(!seen[v])continue; cx+=P[v*3]; cy+=P[v*3+1]; cz+=P[v*3+2]; n++; }
      if(n){ cx/=n; cy/=n; cz/=n; }
      let ext=0; for(let v=0;v<nv;v++){ if(!seen[v])continue; ext=Math.max(ext,Math.hypot(P[v*3]-cx,P[v*3+1]-cy,P[v*3+2]-cz)); }
      this.pieceCen.push(new T.Vector3(cx,cy,cz)); this.pieceCenM.push(new T.Matrix4().makeTranslation(-cx,-cy,-cz)); this.pieceExt.push(ext);
    }
  }
  buildCrumbs(){
    const T=this.T; this.crumbCap=this.count*5; this.crumbN=0;
    this.crumbRest=new Float32Array(this.crumbCap*3);
    const attr=new T.Float32BufferAttribute(new Array(this.crumbCap*3).fill(0),3); this.crumbPos=attr.array;
    const g=new T.BufferGeometry(); g.setAttribute('position',attr); g.setDrawRange(0,0);
    // 알갱이는 둥근 점 (그냥 점은 네모로 그려진다)
    const c=document.createElement('canvas'); c.width=c.height=32; const x=c.getContext('2d');
    const gr=x.createRadialGradient(16,16,0,16,16,16); gr.addColorStop(0,'rgba(255,255,255,1)'); gr.addColorStop(0.55,'rgba(255,255,255,0.9)'); gr.addColorStop(1,'rgba(255,255,255,0)');
    x.fillStyle=gr; x.fillRect(0,0,32,32);
    this.crumbTex=new T.CanvasTexture(c);
    this.crumbs=new T.Points(g,new T.PointsMaterial({color:0x3a1a0a,size:this.crumbSize*1.25,sizeAttenuation:true,map:this.crumbTex,transparent:true,opacity:0.9,depthWrite:false}));
    this.crumbs.frustumCulled=false; this.crumbs.renderOrder=3; this.group.add(this.crumbs);
  }
  buildShadow(){
    const T=this.T, c=document.createElement('canvas'); c.width=c.height=128; const x=c.getContext('2d');
    const gr=x.createRadialGradient(64,64,10,64,64,64); gr.addColorStop(0,'rgba(40,24,12,0.55)'); gr.addColorStop(0.5,'rgba(40,24,12,0.3)'); gr.addColorStop(1,'rgba(40,24,12,0)');
    x.fillStyle=gr; x.fillRect(0,0,128,128);
    const tex=new T.CanvasTexture(c);
    this.shadow=new T.Mesh(new T.PlaneGeometry(2.3,2.3),new T.MeshBasicMaterial({map:tex,transparent:true,depthWrite:false}));
    this.shadow.rotation.x=-PI/2; this.shadow.position.y=-FLOOR+0.004; this.shadow.renderOrder=0;
    this.group.add(this.shadow);
  }

  emptyRoach(i){
    return {i,used:false,anchor:-1,spin:0,legs:new Float32Array(24),antPhase:0,stage:0,flat:0,crush:0,
      state:new Uint8Array(SLOTS),            // 0 붙어 있음, 1 떨어져 슬라임 속, 2 없음
      dmg:new Float32Array(SLOTS*4),           // 부위별 꺾임 (rx, ry, rz, sy)
      frag:new Array(SLOTS).fill(null), twitch:0, twitchLeg:0, twitchT:0, anchorMat:new this.T.Matrix4(), alive:true};
  }

  // ── 바퀴 붙이기 / 상태 ──
  /** anchor 자리에 바퀴 i를 붙인다. pose: bakeRoachPose() 결과 */
  /** 붙은 바퀴 수만큼만 그린다 (빈 슬롯까지 정점을 돌리지 않게) */
  setDrawCount(n){
    n=Math.max(0,Math.min(this.count,n));
    for(let p=0;p<NP;p++){ const k=PIECES[p].kind; this.meshes[p].count=k==='ant'?n*6:(k==='fem'||k==='tib')?n*2:n; }
  }
  attach(i,anchor,spin,pose){
    const r=this.roaches[i]; r.used=true; r.anchor=anchor; r.spin=spin; this.anchorUsed[anchor]=1;
    let top=0; for(let k=0;k<this.count;k++) if(this.roaches[k].used||k===i) top=k+1; this.setDrawCount(top);
    if(pose?.legs) r.legs.set(pose.legs); else this.defaultLegs(r.legs);
    r.antPhase=pose?.antPhase??Math.random()*TAU; r.stage=0; r.flat=0; r.state.fill(0); r.dmg.fill(0); r.frag.fill(null); r.alive=true;
    for(let s=0;s<SLOTS;s++) r.dmg[s*4+3]=1;
    this.dirty=true; return r;
  }
  defaultLegs(a){ const D=this.legDef; for(let k=0;k<6;k++){ const s=k<3?1:-1, i=k%3, d=D[i]; a[k*4]=s>0?(d.yaw-PI/2):(1.5*PI-d.yaw); a[k*4+1]=0.3; a[k*4+2]=d.knee; a[k*4+3]=s*d.ky; } }
  usedCount(){ let c=0; for(const r of this.roaches) if(r.used) c++; return c; }
  /** 월드 방향 n(공 중심에서 바깥)을 공 로컬로 */
  worldDirToLocal(nW,out){ return out.copy(nW).applyQuaternion(this.rollQInv); }
  /** 붙은 자리 anchor의 현재 월드(그룹 로컬 단위) 위치·법선·앞방향 */
  anchorFrame(anchor,spin,outP,outN,outF){
    const T=this.T, nW=this._tmp[8].copy(this.anchorDir[anchor]).applyQuaternion(this.rollQ);
    this.surfaceFrame(nW,outP,outN);
    const t1=this._tmp[9].copy(this.anchorT1[anchor]).applyQuaternion(this.rollQ), t2=this._tmp[10].copy(this.anchorT2[anchor]).applyQuaternion(this.rollQ);
    outF.copy(t1).multiplyScalar(Math.cos(spin)).addScaledVector(t2,Math.sin(spin));
    outF.addScaledVector(outN,-outF.dot(outN)).normalize();
    // 바닥에 닿는 쪽은 슬라임 속으로 눌려 들어간다
    const sink=sstep(-0.35,-0.95,nW.y)*0.22*(1-0.5*this.lift);
    outP.addScaledVector(outN,-sink-0.012);
    return outP;
  }

  // ── 변형 함수: 방향 n(월드, 단위)에서 표면점 ──
  surfacePoint(n,out){
    const sy=0.86-0.09*this.squat;
    let x=n.x, y=n.y*sy, z=n.z;
    // 바닥에 주저앉음: 바닥(-FLOOR) 아래로 내려간 만큼 평평해지고 옆으로 번진다
    const lift=this.lift;
    if(lift<1){
      const f=FLOOR+0.04*this.squat, below=-f-y;
      if(below>-0.16){
        const t=sstep(-0.16,0.06,below)*(1-lift);
        y=lerp(y,-f,t); const sp=1+0.19*t; x*=sp; z*=sp;
      }
    }
    // 전체 출렁임·퍼짐
    const w=this.wob.v, sp=1+this.spreadV*0.08-w*0.22;
    x*=sp; z*=sp; y*=1+w*0.45;
    out.set(x,y,z);
    // 손가락 압입: 누른 자리는 들어가고, 둘레는 고리처럼 부푼다. 끌면 그 방향으로 늘어난다.
    for(const d of this.dents){
      if(!d.on&&Math.abs(d.k)<0.004) continue;
      const c=clamp(n.dot(d.dir),-1,1), a=Math.acos(c), g=Math.exp(-(a*a)/(d.w*d.w));
      const ring=Math.exp(-((a-1.55*d.w)*(a-1.55*d.w))/(0.42*d.w*d.w));
      const depth=d.k*0.46*g-d.k*0.11*ring;
      out.addScaledVector(n,-depth);
      if(d.shear.lengthSq()>1e-8) out.addScaledVector(d.shear,Math.exp(-(a*a)/(2.6*d.w*d.w))*0.85);
    }
    return out;
  }
  /** 표면점과 법선 */
  surfaceFrame(n,outP,outN){
    const T=this.T, e=0.025;
    const a=Math.abs(n.y)<0.9?this._tmp[4].set(0,1,0):this._tmp[4].set(1,0,0);
    const t1=this._tmp[5].crossVectors(a,n).normalize(), t2=this._tmp[6].crossVectors(n,t1).normalize();
    this.surfacePoint(n,outP);
    const p1=this._tmp[7].copy(n).addScaledVector(t1,e).normalize(); this.surfacePoint(p1,p1).sub(outP);
    const p2=this._tmp[4].copy(n).addScaledVector(t2,e).normalize(); this.surfacePoint(p2,p2).sub(outP);
    outN.crossVectors(p1,p2).normalize();
    if(outN.dot(n)<0) outN.negate();
    return outP;
  }
  /** 속 점 p(정지 상태 로컬)가 변형 뒤에 가는 자리 — 표면이 움직인 만큼 비례해서 끌려간다 */
  interiorPoint(p,out){
    const r=p.length(); if(r<1e-5){ return out.set(0,0,0); }
    const n=this._tmp[16].copy(p).multiplyScalar(1/r);
    this.surfacePoint(n,out); return out.multiplyScalar(r);
  }

  // ── 손가락 ──
  /** 누르기 시작. dirW: 공 중심에서 누른 표면점 방향(월드). 같은 id가 있으면 갱신 */
  press(id,dirW,opts={}){
    let d=this.dents.find(x=>x.id===id);
    if(!d){ d={id,dir:new this.T.Vector3(),dir0:new this.T.Vector3(),k:0,kv:0,target:0,w:0.5,shear:new this.T.Vector3(),on:true,strong:false,t:0,drag:0}; this.dents.push(d); }
    d.dir.copy(dirW).normalize(); d.dir0.copy(d.dir); d.on=true; d.target=opts.depth??0.32; d.w=opts.width??0.5; d.t=0; d.strong=false; d.shear.set(0,0,0); d.drag=0;
    if(this.dents.length>3) this.dents.shift();
    this.dirty=true; return d;
  }
  /** 손가락 이동: 새 방향과 끈 거리(월드 벡터) */
  move(id,dirW,shearW){
    const d=this.dents.find(x=>x.id===id); if(!d) return null;
    const nd=this._tmp[0].copy(dirW).normalize();
    d.drag+=Math.acos(clamp(d.dir.dot(nd),-1,1));
    d.dir.lerp(nd,0.55).normalize();
    if(shearW){ const s=this._tmp[1].copy(shearW); const l=s.length(); if(l>0.55) s.multiplyScalar(0.55/l); d.shear.lerp(s,0.5); }
    this.dirty=true; return d;
  }
  release(id){ const d=this.dents.find(x=>x.id===id); if(!d) return null; d.on=false; d.target=0; this.wob.vel+=0.9*Math.max(0.15,d.k); this.dirty=true; return d; }
  releaseAll(){ for(const d of this.dents) if(d.on){ d.on=false; d.target=0; } this.wob.vel+=0.5; this.dirty=true; }
  dent(id){ return this.dents.find(x=>x.id===id)||null; }
  kick(v){ this.wob.vel+=v; this.dirty=true; }

 
  crush(dirW,strength=1){
    const out={
      wings:0,shells:0,legs:0,bodies:0,near:0,changed:0
    };
    const nW=this._tmp[17];
    this.crushCount++;
    for(const r of this.roaches){
      if(!r.used||r.stage>=4) continue;
      nW.copy(this.anchorDir[r.anchor])
        .applyQuaternion(this.rollQ);
      const a=Math.acos(clamp(nW.dot(dirW),-1,1));
      const add=a<0.62?2:a<1.25?1:
        Math.random()<0.4*strength?1:0;
      const st=Math.min(4,r.stage+add);
      if(a<0.62) out.near++;
      if(st>r.stage){
        const before=r.state.slice();
        this.setStage(r,st,a<0.9);
        out.changed++;
        for(let slot=0;slot<SLOTS;slot++){
          if(before[slot]!==0||r.state[slot]===0) continue;
          if(slot>=6&&slot<10) out.wings++;
          else if(slot<6) out.shells++;
          else if(slot<22) out.legs++;
        }
      }
      r.crush=Math.max(r.crush,1-Math.min(1,a/1.4));
    }
    this.wob.vel+=0.6;
    this.dirty=true;
    this.brokenCount=this.roaches
      .filter(r=>r.used&&r.stage>=4).length;
    return out;
  }




  allBroken(){ let u=0,b=0; for(const r of this.roaches){ if(r.used){u++; if(r.stage>=4)b++;} } return u>0&&u===b; }
  /** 단계 적용. near: 손가락 가까이(조각이 더 많이 흩어짐) */
  setStage(r,st,near){
    const D=r.dmg, S=r.state, rnd=Math.random;
    const bend=(slot,rx,ry,rz,sy)=>{ D[slot*4]+=rx; D[slot*4+1]+=ry; D[slot*4+2]+=rz; if(sy!=null)D[slot*4+3]*=sy; };
    const loose=(slot)=>{ if(S[slot]===0) this.detach(r,slot); };
    for(let s=r.stage+1;s<=st;s++){
      if(s===1){ // 날개 금 가고 들림
        bend(7,0.32+rnd()*0.3,0,(rnd()-0.5)*0.3); bend(9,0.28+rnd()*0.3,0,(rnd()-0.5)*0.3);
        bend(6,0.06,0,0.12*(rnd()-0.5)); bend(8,0.06,0,0.12*(rnd()-0.5));
        bend(3,0,0,0,0.88); r.flat=0.12;
      }else if(s===2){ // 앞가슴판 내려앉고 몸이 눌린다
        bend(3,0.25,0,(rnd()-0.5)*0.4,0.5); bend(4,0.45,0,0,0.8);
        bend(0,0,0,0,0.6); bend(1,0,0,0,0.6); bend(2,0,0,0,0.6);
        bend(7,0.5,0,(rnd()-0.5)*0.5); bend(9,0.5,0,(rnd()-0.5)*0.5); bend(6,0,0,0.35); bend(8,0,0,-0.35);
        loose(rnd()<0.5?7:9);                                  // 날개 끝 한 조각 떨어짐
        const k=Math.floor(rnd()*6); bend(10+k*2+1,0,0,0.9+rnd()*0.5); // 다리 하나 접힘
        loose(22); loose(23); loose(24); if(rnd()<0.6){ loose(25); loose(26); loose(27); } // 더듬이
        r.flat=0.42; this.spawnCrumbs(r,2+Math.floor(rnd()*3));
      }else if(s===3){ // 다리 떨어지고 날개 다 떨어짐, 배 뒤쪽 찢어짐
        loose(6);loose(7);loose(8);loose(9);
        const legs=[0,1,2,3,4,5].sort(()=>rnd()-0.5).slice(0,3+Math.floor(rnd()*2));
        for(const k of legs){ loose(10+k*2+1); if(rnd()<0.6) loose(10+k*2); }
        for(let k=0;k<6;k++){ bend(10+k*2,0,0,(rnd()-0.5)*0.6); bend(10+k*2+1,0,0,(rnd()-0.5)*0.8); }
        loose(1); loose(5); bend(3,0.15,0,(rnd()-0.5)*0.6,0.6); bend(0,0,0,0,0.6); bend(2,0,0,0,0.6);
        r.flat=0.65; this.spawnCrumbs(r,3+Math.floor(rnd()*3));
      }else if(s===4){ // 박살
        for(let slot=0;slot<SLOTS;slot++) loose(slot);
        r.flat=1; r.alive=false; this.spawnCrumbs(r,4+Math.floor(rnd()*4)); this.spawnShards(r,2+Math.floor(rnd()*3));
      }
    }
    this.goo.onStage(r,st);
    r.stage=st; if(st>=2) r.alive=false;
  }
  /** 부위 하나를 슬라임 속 조각으로 떼어낸다 */
  detach(r,slot){
    const T=this.T; if(r.state[slot]!==0) return;
    const m=this._m[0]; this.pieceMatrix(r,slot,m);
    const p=new T.Vector3(), q=new T.Quaternion(), s=new T.Vector3(); m.decompose(p,q,s);
    if(s.lengthSq()<1e-9){ r.state[slot]=2; return; }
    const mi=this.instanceSlot(r,slot)[0];
    p.copy(this.pieceCen[mi]).applyMatrix4(m);                       // 조각 자기 가운데 (여기를 축으로 돈다)
    const rmax=clamp(MIX_RMAX-0.6*this.pieceExt[mi]*Math.max(s.x,s.y,s.z),0.7,MIX_RMAX);   // 큰 조각일수록 겉에서 조금 더 안쪽
    const nW=this._tmp[18].copy(this.anchorDir[r.anchor]).applyQuaternion(this.rollQ);
    const t=this._tmp[19].set(Math.random()-0.5,Math.random()-0.5,Math.random()-0.5); t.addScaledVector(nW,-nW.dot(t)); if(t.lengthSq()<1e-6)t.set(1,0,0); t.normalize();
    // 떨어진 자리에 반쯤 박힌 채 겉에 남는다. 속으로 섞여 들어가는 건 손가락으로 주무를 때만 (knead)
    const rest=new T.Vector3().copy(nW).multiplyScalar(0.9+Math.random()*0.06).addScaledVector(t,Math.random()*0.12); rest.setLength(Math.min(rmax,rest.length()));
    const q1=new T.Quaternion().copy(q).multiply(new T.Quaternion().setFromEuler(new T.Euler((Math.random()-0.5)*1.2,(Math.random()-0.5)*1.2,(Math.random()-0.5)*1.2)));
    r.state[slot]=1;
    r.frag[slot]={p,q,s,rest,rmax,q0:q.clone(),q1,t:0,dur:0.35+Math.random()*0.4,axis:new T.Vector3(Math.random()-0.5,Math.random()-0.5,Math.random()-0.5).normalize(),last:p.clone()};
    this.fragDirty=true;
  }
  spawnCrumbs(r,n){
    const nW=this._tmp[20].copy(this.anchorDir[r.anchor]).applyQuaternion(this.rollQ);
    for(let k=0;k<n&&this.crumbN<this.crumbCap;k++){
      const i=this.crumbN++; const j=this._tmp[21].set(Math.random()-0.5,Math.random()-0.5,Math.random()-0.5).multiplyScalar(0.5);
      const p=this._tmp[22].copy(nW).multiplyScalar(0.78+Math.random()*0.17).add(j.multiplyScalar(0.5)); if(p.length()>0.95)p.setLength(0.95);
      this.crumbRest[i*3]=p.x; this.crumbRest[i*3+1]=p.y; this.crumbRest[i*3+2]=p.z;
    }
    this.crumbs.geometry.setDrawRange(0,this.crumbN); this.dirty=true;
  }
  spawnShards(r,n){
    const T=this.T, nW=this._tmp[20].copy(this.anchorDir[r.anchor]).applyQuaternion(this.rollQ);
    for(let k=0;k<n&&this.shardList.length<this.shardCap;k++){
      const rest=new T.Vector3(Math.random()-0.5,Math.random()-0.5,Math.random()-0.5).multiplyScalar(0.25).addScaledVector(nW,0.8+Math.random()*0.15); if(rest.length()>0.95)rest.setLength(0.95);
      this.shardList.push({p:new T.Vector3().copy(nW).multiplyScalar(0.98),rest,q:new T.Quaternion().setFromEuler(new T.Euler(Math.random()*TAU,Math.random()*TAU,Math.random()*TAU)),s:0.7+Math.random()*0.9,t:0});
    }
    this.shards.count=this.shardList.length; this.fragDirty=true;
  }

  // ── 상태 저장/복원 (화면을 닫았다 열어도 이어지게) ──
  getState(){
    return {goo:this.goo.getState(),murk:this.murk||0,crushCount:this.crushCount||0,roaches:this.roaches.map(r=>r.used?{anchor:r.anchor,spin:r.spin,legs:Array.from(r.legs),antPhase:r.antPhase,stage:r.stage,flat:r.flat,state:Array.from(r.state),dmg:Array.from(r.dmg),
      frag:r.frag.map(f=>f?{p:f.p.toArray(),q:f.q.toArray(),s:f.s.toArray(),rest:f.rest.toArray(),rmax:f.rmax,q1:f.q1.toArray(),t:f.t,dur:f.dur}:null)}:null),
      crumbs:Array.from(this.crumbRest.subarray(0,this.crumbN*3)),shards:this.shardList.map(s=>({p:s.p.toArray(),rest:s.rest.toArray(),q:s.q.toArray(),s:s.s,t:s.t}))};
  }
  setState(st){
    const T=this.T; this.reset();
    this.crushCount=st.crushCount||0;
    this.murk=clamp(st.murk||0,0,1); this._murkShown=this.murk;
    this.goo.setState(st.goo);
    st.roaches.forEach((d,i)=>{ if(!d)return; const r=this.attach(i,d.anchor,d.spin,{legs:Float32Array.from(d.legs),antPhase:d.antPhase}); r.stage=d.stage; r.flat=d.flat; r.alive=d.stage<2; r.state.set(d.state); r.dmg.set(d.dmg);
      d.frag.forEach((f,slot)=>{ if(!f)return; r.frag[slot]={p:new T.Vector3().fromArray(f.p),q:new T.Quaternion().fromArray(f.q),s:new T.Vector3().fromArray(f.s),rest:new T.Vector3().fromArray(f.rest),rmax:f.rmax||MIX_RMAX,q0:new T.Quaternion().fromArray(f.q),q1:new T.Quaternion().fromArray(f.q1),t:f.t,dur:f.dur,axis:new T.Vector3(1,0,0),last:new T.Vector3().fromArray(f.p)}; }); });
    this.crumbN=Math.min(this.crumbCap,Math.floor(st.crumbs.length/3)); this.crumbRest.set(st.crumbs.slice(0,this.crumbN*3)); this.crumbs.geometry.setDrawRange(0,this.crumbN);
    this.shardList=st.shards.map(s=>({p:new T.Vector3().fromArray(s.p),rest:new T.Vector3().fromArray(s.rest),q:new T.Quaternion().fromArray(s.q),s:s.s,t:s.t})); this.shards.count=this.shardList.length;
    let b=0; for(const r of this.roaches) if(r.used&&r.stage>=4) b++; this.brokenCount=b;
    this.dirty=true; this.fragDirty=true;
  }
  reset(){
    const T=this.T; this.anchorUsed.fill(0); this.roaches=this.roaches.map((_,i)=>this.emptyRoach(i)); this.dents.length=0; this.wob.v=this.wob.vel=0; this.spreadV=0; this.squat=0; this.crushCount=0; this.brokenCount=0;
    this.murk=0; this._murkShown=0;
    this.goo.reset();
    this.crumbN=0; this.crumbs.geometry.setDrawRange(0,0); this.shardList=[]; this.shards.count=0; this.rollQ.identity(); this.rollQInv.identity();
    const zero=this._m[0].makeScale(0,0,0); for(const im of this.meshes){ const cap=im.instanceMatrix.count; for(let i=0;i<cap;i++) im.setMatrixAt(i,zero); im.instanceMatrix.needsUpdate=true; }
    this.setDrawCount(0); this.dirty=true; this.fadeRoaches(1);
  }
  fadeRoaches(a){ this.fade=a; }

  // ── 행렬 조립 ──
  /** 바퀴 r의 몸통 기준 행렬 (붙은 자리 기준 프레임 × 바퀴 크기 × 눌림) */
  rootMatrix(r,out){
    const T=this.T, p=this._tmp[11], n=this._tmp[12], f=this._tmp[13];
    this.anchorFrame(r.anchor,r.spin,p,n,f);
    const x=this._tmp[14].crossVectors(n,f).normalize();
    out.makeBasis(x,n,f); out.setPosition(p);
    // 손가락 압입 안에 있으면 함께 눌린다
    let press=0; for(const d of this.dents){ if(Math.abs(d.k)<0.01)continue; const nW=this._tmp[15].copy(this.anchorDir[r.anchor]).applyQuaternion(this.rollQ); const a=Math.acos(clamp(nW.dot(d.dir),-1,1)); press=Math.max(press,d.k*Math.exp(-(a*a)/(1.6*d.w*d.w))); }
    const flat=Math.max(r.flat,press*0.75);
    const s=this.roachScale; this._m[2].makeScale(s*(1+0.18*flat),s*(1-0.62*flat),s*(1+0.1*flat));
    out.multiply(this._m[2]); return out;
  }
  /** 바퀴 r의 slot 부위 행렬 (그룹 로컬) — 붙어 있을 때 */
  pieceMatrix(r,slot,out){
    const T=this.T, M=r.anchorMat, D=r.dmg, L=this._m[3], Dm=this._m[4], e=this._e;
    const dx=D[slot*4],dy=D[slot*4+1],dz=D[slot*4+2],sy=D[slot*4+3];
    if(slot<SLOT_BODY){
      const pv=PIECES[slot].pivot; L.identity();
      if(dx||dy||dz||sy!==1){ e.set(dx,dy,dz,'XYZ'); Dm.makeRotationFromEuler(e); Dm.scale(this._tmp[0].set(1,sy,1)); L.makeTranslation(pv[0],pv[1],pv[2]).multiply(Dm).multiply(this._m[5].makeTranslation(-pv[0],-pv[1],-pv[2])); }
      return out.multiplyMatrices(M,L);
    }
    if(slot<SLOT_BODY+SLOT_LEG){
      const k=Math.floor((slot-SLOT_BODY)/2), isTib=(slot-SLOT_BODY)%2===1, s=k<3?1:-1, i=k%3, d=this.legDef[i], a=r.legs;
      const hipRy=a[k*4], femRz=a[k*4+1]+(r.twitch>0&&r.twitchLeg===k?Math.sin(r.twitchT*34)*0.35*r.twitch:0), kneeRz=a[k*4+2]+(r.twitch>0&&r.twitchLeg===k?Math.sin(r.twitchT*30+1)*0.6*r.twitch:0), kneeRy=a[k*4+3];
      // hip(위치·y회전) → fem(z회전) → [knee(x이동, y·z회전)]
      e.set(0,hipRy,0,'XYZ'); L.makeRotationFromEuler(e); L.setPosition(s*HIP_X,HIP_Y,d.z);
      e.set(0,0,femRz,'XYZ'); Dm.makeRotationFromEuler(e); L.multiply(Dm);
      if(isTib){ e.set(0,kneeRy,kneeRz,'XYZ'); Dm.makeRotationFromEuler(e); Dm.setPosition(d.fl,0,0); L.multiply(Dm); }
      if(dx||dy||dz){ e.set(dx,dy,dz,'XYZ'); Dm.makeRotationFromEuler(e); L.multiply(Dm); }
      return out.multiplyMatrices(M,L);
    }
    // 더듬이: 좌우 × 3마디, 살아 있으면 흔들린다
    const k=slot-SLOT_BODY-SLOT_LEG, s=k<3?1:-1, seg=k%3, t=this.time*2.5, ph=r.antPhase, sw=r.alive?1:0;
    const w=Math.sin(t*1.7+s+ph)*0.22*sw;
    e.set(1.25+Math.sin(t+s*2+ph)*0.12*sw,s*(0.42+w),0,'YXZ'); L.makeRotationFromEuler(e); L.setPosition(s*ANT_BASE[0],ANT_BASE[1],ANT_BASE[2]);
    for(let j=0;j<=seg;j++){ e.set(-0.1+Math.sin(t*2.3+j+s+ph)*0.1*sw+(j===seg?dx:0),0,0,'XYZ'); Dm.makeRotationFromEuler(e); Dm.setPosition(0,j?0.38:0,0); L.multiply(Dm); }
    Dm.makeScale(1-seg*0.25,1,1-seg*0.25); Dm.setPosition(0,0.19,0); L.multiply(Dm);
    return out.multiplyMatrices(M,L);
  }
  instanceSlot(r,slot){ // (mesh index, instance index)
    if(slot<SLOT_BODY) return [slot,r.i];
    if(slot<SLOT_BODY+SLOT_LEG){ const k=Math.floor((slot-SLOT_BODY)/2), isTib=(slot-SLOT_BODY)%2, i=k%3, side=k<3?0:1; return [BODY_PIECES+i*2+isTib,r.i*2+side]; }
    return [NP-1,r.i*6+(slot-SLOT_BODY-SLOT_LEG)];
  }

  // ── 매 프레임 ──

  update(dt){
    this.time+=dt; const T=this.T;
    // 압입 스프링: 누르는 동안은 묵직하게, 떼면 출렁이며 돌아온다
    let any=false, sumK=0;
    // 스프링은 프레임이 느려도 터지지 않게 잘게 나눠 적분한다 (dt 0.05에 ω20이면 한 번에 적분 시 발산)
    const sub=Math.max(1,Math.ceil(dt/0.008)), h=dt/sub;
    for(let i=this.dents.length-1;i>=0;i--){
      const d=this.dents[i]; d.t+=dt;
      const w0=d.on?20:13, z=d.on?0.85:0.32;
      for(let s=0;s<sub;s++){ const acc=-w0*w0*(d.k-d.target)-2*z*w0*d.kv; d.kv+=acc*h; d.k+=d.kv*h; }
      d.k=clamp(d.k,-0.35,1.3);
      if(!d.on){ d.shear.multiplyScalar(Math.exp(-5*dt)); if(Math.abs(d.k)<0.003&&Math.abs(d.kv)<0.01&&d.shear.lengthSq()<1e-6){ this.dents.splice(i,1); this.dirty=true; continue; } }
      else d.shear.multiplyScalar(Math.exp(-1.2*dt));
      if(Math.abs(d.kv)>1e-4||d.shear.lengthSq()>1e-7) any=true; sumK+=Math.max(0,d.k);
    }
    // 전체 출렁임 + 옆 퍼짐
    const w=this.wob; for(let s=0;s<sub;s++){ const wa=-(13*13)*w.v-2*0.16*13*w.vel; w.vel+=wa*h; w.v+=w.vel*h; } w.v=clamp(w.v,-0.35,0.35);
    if(Math.abs(w.vel)>1e-3||Math.abs(w.v)>1e-3) any=true; else { w.v=0; w.vel=0; }
    const tgtSpread=sumK; this.spreadV+=(tgtSpread-this.spreadV)*(1-Math.exp(-8*dt)); if(Math.abs(this.spreadV-tgtSpread)>1e-3) any=true;
    if(any) this.dirty=true;
    this.knead(dt);
    this.goo.update(dt);
    // 살아 있는 바퀴 경련
    for(const r of this.roaches){ if(!r.used||!r.alive)continue; if(r.twitch>0){ r.twitchT+=dt; r.twitch-=dt*1.6; if(r.twitch<=0){r.twitch=0; this.markLeg(r);} else this.markLeg(r); } else if(Math.random()<dt*0.12){ r.twitch=1; r.twitchT=0; r.twitchLeg=Math.floor(Math.random()*6); } }
    if(this.dirty){ this.updateSlime(); this.updateRoaches(); this.updateCrumbs(); this.dirty=false; this.fragDirty=true; }
    else this.updateAntennae();
    this.updateFragments(dt);
  }


  knead(dt){
    const T=this.T, flows=[];
    for(const d of this.dents){
      if(!d._mixDir||d.t<d._mixTime){
        d._mixK=0; d._mixDir=d.dir.clone(); d._mixDrag=d.drag||0;
        d._mixMove=new T.Vector3(); d._mixM=new T.Vector3(); d._mixB=new T.Vector3(); d._mixC=new T.Vector3();
      }
      const k=clamp(d.k,0,1), dk=k-d._mixK;
      const dragStep=(d.drag||0)-d._mixDrag;
      d._mixPower=Math.max(k,d._mixK);
      // 깊어지는 동안만 누르기 흐름. 손을 떼며 돌아오는 건 되돌리지 않는다 (눌린 모양은 surfacePoint가 보여 준다)
      d._mixDK=d.on?Math.max(0,dk):0;
      // 손가락이 실제로 움직인 프레임만 끌기 흐름 (멈춘 채 늘어난 모양이 풀리는 건 섞는 게 아니다)
      d._mixMove.copy(d.dir).sub(d._mixDir); d._mixMove.addScaledVector(d.dir,-d._mixMove.dot(d.dir));
      const ml=d._mixMove.length();
      d._mixDragAmt=0;
      if(d.on&&dragStep>1e-7&&ml>1e-7){
        d._mixDragAmt=ml*d._mixPower;            // 압입 자리가 실제로 옮겨 간 각도 × 누른 세기
        d._mixM.copy(d._mixMove).multiplyScalar(1/ml);
        d._mixB.crossVectors(d.dir,d._mixM).normalize();
        d._mixMove.multiplyScalar(0.42);        // bappu-goo: 진물이 끄는 방향으로 돌아눕는 양
      }else d._mixMove.set(0,0,0);
      d._mixC.copy(d.dir).multiplyScalar(MIX_ROLL_C);
      d._mixK=k; d._mixDir.copy(d.dir); d._mixDrag=d.drag||0; d._mixTime=d.t;
      if(d._mixDK>1e-6||d._mixDragAmt>0) flows.push(d);
    }
    this._flows=flows;
    if(!flows.length) return;

    const RB2=MIX_RB*MIX_RB;
    // 모든 손가락의 흐름을 더한 속도. 이번 프레임 동안(가상 시간 0→1) 적분하면 옮겨질 거리가 된다
    const vel=(p,out)=>{
      out.set(0,0,0);
      const rr=p.lengthSq(), H=1-rr/RB2;
      for(const d of flows){
        const D=d.dir, s=p.dot(D);
        if(d._mixDK>0&&s>MIX_S0){
          // 고리 소용돌이: 벡터 퍼텐셜 F·(D×p), F=-G(축에서 거리)·S(깊이)·H(경계). v=∇F×(D×p)+2F·D
          const w=Math.max(0.15,d.w)*MIX_PRESS_W, w2=w*w, rho2=Math.max(0,rr-s*s);
          if(rho2<9*w2){
            const G=Math.exp(-rho2/w2), S=sstep(MIX_S0,MIX_S1,s), Sp=dsstep(MIX_S0,MIX_S1,s);
            const F=-G*S*H, al=-2*F/w2+2*G*S/RB2, be=2*s*F/w2-G*Sp*H, a=MIX_PRESS*d._mixDK;
            out.addScaledVector(D,a*(al*rr+be*s+2*F)).addScaledVector(p,-a*(al*s+be));
          }
        }
        if(d._mixDragAmt>0){
          // 굴림 소용돌이: 흐름함수 Ψ=E(손가락 밑 깊이 c 둘레)·H, 축 b=D×(끄는 방향), v=∇Ψ×b
          const sg=Math.max(0.15,d.w)*MIX_ROLL_W, sg2=sg*sg, c=d._mixC;
          const qx=p.x-c.x, qy=p.y-c.y, qz=p.z-c.z, q2=qx*qx+qy*qy+qz*qz;
          if(q2<9*sg2){
            const E=Math.exp(-q2/sg2), a=MIX_DRAG*d._mixDragAmt, k1=-2*E*H/sg2, k2=-2*E/RB2, b=d._mixB;
            const gx=k1*qx+k2*p.x, gy=k1*qy+k2*p.y, gz=k1*qz+k2*p.z;
            out.x+=a*(gy*b.z-gz*b.y); out.y+=a*(gz*b.x-gx*b.z); out.z+=a*(gx*b.y-gy*b.x);
          }
        }
      }
      return out;
    };
    let amt=0; for(const d of flows) amt+=MIX_PRESS*d._mixDK*1.7+MIX_DRAG*d._mixDragAmt*1.9;   // 이번 프레임 최대 이동 거리 어림
    const steps=Math.min(10,Math.max(1,Math.ceil(amt/MIX_STEP))), h=1/steps;
    const v1=this._mv[0], v2=this._mv[1], mid=this._mv[2];
    // 중간점 적분. strength: 조각 종류마다 흐름을 타는 정도, rmax: 그 조각이 있을 수 있는 가장 바깥
    const transport=(rest,strength,rmax=MIX_RMAX)=>{
      const x=rest.x,y=rest.y,z=rest.z, hs=h*strength;
      for(let i=0;i<steps;i++){
        vel(rest,v1); mid.copy(rest).addScaledVector(v1,0.5*hs);
        vel(mid,v2); rest.addScaledVector(v2,hs);
      }
      const r2=rest.lengthSq(); if(r2>rmax*rmax) rest.multiplyScalar(rmax/Math.sqrt(r2));
      return Math.abs(rest.x-x)+Math.abs(rest.y-y)+Math.abs(rest.z-z)>1e-8;
    };

    let moved=false;
    for(const r of this.roaches){
      if(!r.used) continue;
      for(const f of r.frag)
        if(f&&transport(f.rest,1,f.rmax)) moved=true;
    }
    for(const sh of this.shardList)
      if(transport(sh.rest,1.1)) moved=true;
    if(this.goo.transport(flows,transport)) moved=true;

    const p=this._mv[3];
    for(let i=0;i<this.crumbN;i++){
      const j=i*3;
      p.set(this.crumbRest[j],this.crumbRest[j+1],this.crumbRest[j+2]);
      if(transport(p,1.15)){
        this.crumbRest[j]=p.x; this.crumbRest[j+1]=p.y; this.crumbRest[j+2]=p.z;
        moved=true;
      }
    }
    if(moved){ this.dirty=true; this.fragDirty=true; }
  }
  /** 이번 프레임 손가락이 p(정지 좌표) 자리에서 한 일 — 눌리고 문질린 만큼. 겉 가까이에서만 센다 (속은 슬라임이 감싸서 안 갈린다) */
  mixWork(p){
    const flows=this._flows; if(!flows.length) return 0;
    const r=p.length(); if(r<0.55) return 0;
    const surf=sstep(0.55,0.88,r); let w=0;
    for(const d of flows){
      const c=p.dot(d.dir)/r; if(c<0.3) continue;
      const a=Math.acos(Math.min(1,c)), ww=Math.max(0.15,d.w), a2=a*a/(ww*ww);
      w+=d._mixDK*Math.exp(-a2/0.9)+MIX_RUB*d._mixDragAmt*Math.exp(-a2/1.4);
    }
    return w*surf;
  }

  fragmentContact(dirW){
    const dir=this._tmp[20].copy(dirW).normalize();
    const n=this._tmp[21], skin=this._tmp[22];
    let hits=0;
    const sample=(p,weight)=>{
      const r=p.length();
      if(r<1e-5) return;
      n.copy(p).multiplyScalar(1/r);
      const c=n.dot(dir);
      if(c<0.86) return;
      this.surfacePoint(n,skin);
      const depth=skin.length()-r;
      if(depth < -0.15||depth > 0.24) return;
      hits+=weight*((c-0.86)/0.14)
        *(1-clamp(depth,0,0.24)/0.24);
    };
    for(const r of this.roaches){
      if(!r.used) continue;
      for(let slot=0;slot<r.frag.length;slot++){
        const f=r.frag[slot];
        if(!f) continue;
        sample(f.p,slot<10?1:0.3);
        if(hits>=4) return 1;
      }
    }
    for(const sh of this.shardList){
      sample(sh.p,0.35);
      if(hits>=4) return 1;
    }
    return clamp(hits/4,0,1);
  }



  markLeg(r){ const m=this._m[0]; for(const slot of [SLOT_BODY+r.twitchLeg*2,SLOT_BODY+r.twitchLeg*2+1]){ if(r.state[slot]!==0)continue; this.pieceMatrix(r,slot,m); const [mi,ii]=this.instanceSlot(r,slot); this.meshes[mi].setMatrixAt(ii,m); this.meshes[mi].instanceMatrix.needsUpdate=true; } }
  updateSlime(){
    const T=this.T, pos=this.slimeGeo.attributes.position, arr=pos.array, base=this.slimeBase, n=this._tmp[0], o=this._tmp[1];
    for(let i=0;i<pos.count;i++){ n.set(base[i*3],base[i*3+1],base[i*3+2]); this.surfacePoint(n,o); arr[i*3]=o.x; arr[i*3+1]=o.y; arr[i*3+2]=o.z; }
    pos.needsUpdate=true; this.slimeGeo.computeVertexNormals(); this.slimeGeo.computeBoundingSphere();
    const m=this._m[0];
    for(let i=0;i<this.bubbleRest.length;i++){ const b=this.bubbleRest[i]; this.interiorPoint(b.p,o); m.makeScale(b.s,b.s,b.s); m.setPosition(o); this.bubbles.setMatrixAt(i,m); }
    this.bubbles.instanceMatrix.needsUpdate=true;
    if(this.shadow){ const k=1-this.lift; this.shadow.scale.setScalar((0.75+0.3*(1-this.lift)+this.spreadV*0.1)*(1+0.12*this.squat)); this.shadow.material.opacity=k*0.95*this.fade; this.shadow.visible=k>0.02; }
    this.matFront.opacity=this.fade; this.matBack.opacity=this.fade; this.bubbles.material.opacity=0.35*this.fade;
  }
  updateRoaches(){
    const m=this._m[0];
    for(const r of this.roaches){
      if(!r.used)continue;
      this.rootMatrix(r,r.anchorMat);
      for(let slot=0;slot<SLOTS;slot++){
        if(r.state[slot]!==0) continue;
        this.pieceMatrix(r,slot,m); const [mi,ii]=this.instanceSlot(r,slot); this.meshes[mi].setMatrixAt(ii,m);
      }
    }
    for(const im of this.meshes) im.instanceMatrix.needsUpdate=true;
  }
  updateAntennae(){
    const m=this._m[0]; let any=false;
    for(const r of this.roaches){ if(!r.used||!r.alive)continue; for(let slot=SLOT_BODY+SLOT_LEG;slot<SLOTS;slot++){ if(r.state[slot]!==0)continue; this.pieceMatrix(r,slot,m); this.meshes[NP-1].setMatrixAt(r.i*6+slot-SLOT_BODY-SLOT_LEG,m); any=true; } }
    if(any) this.meshes[NP-1].instanceMatrix.needsUpdate=true;
  }
  updateCrumbs(){
    const o=this._tmp[1], p=this._tmp[2];
    for(let i=0;i<this.crumbN;i++){ p.set(this.crumbRest[i*3],this.crumbRest[i*3+1],this.crumbRest[i*3+2]); this.interiorPoint(p,o); this.crumbPos[i*3]=o.x; this.crumbPos[i*3+1]=o.y; this.crumbPos[i*3+2]=o.z; }
    this.crumbs.geometry.attributes.position.needsUpdate=true;
  }


  updateFragments(dt){
    const tgt=this._tmp[1], m=this._m[0];
    const dq=this._q[1], vel=this._tmp[2];
    const dir=this._tmp[17], normal=this._tmp[18];
    const localN=this._tmp[19], invQ=this._q[2];
    const touched=this._touched||(this._touched=new Uint8Array(NP));
    touched.fill(0);
    let moving=false;
    const rough=this.allBroken();
    const choices=[1,3,6,7,8,9,11,13,15,17,19,21];

    for(const r of this.roaches){
      if(!r.used)continue;
      let pick=-1;
      if(rough&&r.i%3!==2){
        const start=Math.floor(hash(r.i*7.1)*choices.length);
        for(let j=0;j<choices.length;j++){
          const slot=choices[(start+j)%choices.length];
          if(r.frag[slot]){pick=slot;break;}
        }
      }

      for(let slot=0;slot<SLOTS;slot++){
        const f=r.frag[slot];
        if(!f)continue;
        f.t+=dt;
        const sink=clamp(f.t/f.dur,0,1);
        this.interiorPoint(f.rest,tgt);
        const rate=sink<1?(1.5+sink*7):10;
        const k=1-Math.exp(-rate*dt);
        vel.copy(tgt).sub(f.p);
        f.p.addScaledVector(vel,k);
        const sp=vel.length()*k;
        if(sink<1)
          f.q.slerpQuaternions(f.q0,f.q1,sink*sink*(3-2*sink));
        else if(sp>1e-4){
          dq.setFromAxisAngle(f.axis,Math.min(0.3,sp*9));
          f.q.premultiply(dq);
        }

        const expose=slot===pick;
        if(sp>2e-5||sink<1||this.fragDirty||expose){
          const [mi,ii]=this.instanceSlot(r,slot);
          let drawPos=f.p;

          if(expose){
            dir.copy(f.rest).normalize();
            if(dir.y>-0.55){
              this.surfaceFrame(dir,tgt,normal);
              localN.copy(normal)
                .applyQuaternion(invQ.copy(f.q).invert())
                .multiply(f.s);
              const geo=this.pieceGeo[mi];
              const P=geo.attributes.position.array;
              const I=geo.index?geo.index.array:null;
              const center=this.pieceCen[mi];
              const count=I?I.length:P.length/3;
              let support=0;

              // 이 조각에 포함된 정점만 계산한다
              for(let j=0;j<count;j++){
                const v=(I?I[j]:j)*3;
                support=Math.max(support,
                  (P[v]-center.x)*localN.x+
                  (P[v+1]-center.y)*localN.y+
                  (P[v+2]-center.z)*localN.z
                );
              }

              // 중심은 묻히고 가장자리 일부만 드러낸다
              const tip=Math.min(
                0.045+hash(r.i*3.7+slot)*0.035,
                support*0.6
              );
              tgt.addScaledVector(normal,-(support-tip));
              drawPos=tgt;
            }
          }

          m.compose(drawPos,f.q,f.s).multiply(this.pieceCenM[mi]);
          this.meshes[mi].setMatrixAt(ii,m);
          touched[mi]=1;
          if(sp>2e-5||sink<1)moving=true;
        }
      }
    }

    for(let mi=0;mi<NP;mi++)
      if(touched[mi])this.meshes[mi].instanceMatrix.needsUpdate=true;

    // 작은 부스러기는 원래처럼 슬라임 안에서 움직인다
    if(this.shardList.length){
      let up=false;
      for(let i=0;i<this.shardList.length;i++){
        const s=this.shardList[i];
        s.t+=dt;
        this.interiorPoint(s.rest,tgt);
        const k=1-Math.exp(-(s.t<1.2?2.5:9)*dt);
        vel.copy(tgt).sub(s.p);
        const sp=vel.length();
        s.p.addScaledVector(vel,k);
        if(sp>2e-5||this.fragDirty){
          dq.setFromAxisAngle(
            this._tmp[3].set(1,0.3,0.2).normalize(),
            Math.min(0.2,sp*k*6)
          );
          s.q.premultiply(dq);
        }
        m.compose(s.p,s.q,this._tmp[4].setScalar(s.s));
        this.shards.setMatrixAt(i,m);
        up=true;
      }
      if(up)this.shards.instanceMatrix.needsUpdate=true;
    }
    this.fragDirty=false;
    return moving;
  }



  dispose(){ this.goo.dispose(); for(const im of this.meshes){ im.geometry.dispose(); } this.slimeGeo.dispose(); this.envMap.dispose(); this.crumbTex.dispose(); this.crumbs.geometry.dispose(); this.crumbs.material.dispose(); this.matFront.dispose(); this.matBack.dispose(); this.matWing.dispose(); if(this.shadow){ this.shadow.material.map.dispose(); this.shadow.material.dispose(); } }
}

function setSlimeMurk(mat,level){
  const s=mat.userData.slimeTint;
  if(!s) return;

  s.level=level;
  const u=s.uniforms;
  if(!u) return;

  u.uAMin.value=lerp(s.aMin,s.aMin>=0.1?0.28:0.11,level);
  u.uAMax.value=lerp(s.aMax,Math.min(0.84,s.aMax+0.08),level);
  u.uRim.value.copy(s.rim).lerp(s.warmRim,level*0.85);
}

function slimeFresnel(T,mat,aMin,aMax,rim,rimK){
  const tint=mat.userData.slimeTint={
    level:0,
    aMin,
    aMax,
    rim:new T.Color(rim),
    warmRim:new T.Color(0xe7d5b6),
    uniforms:null
  };

  mat.onBeforeCompile=(sh)=>{
    sh.uniforms.uAMin={value:aMin};
    sh.uniforms.uAMax={value:aMax};
    sh.uniforms.uRim={value:new T.Color(rim)};
    sh.uniforms.uRimK={value:rimK};

    tint.uniforms=sh.uniforms;
    setSlimeMurk(mat,tint.level);

    sh.fragmentShader=sh.fragmentShader
      .replace('uniform float opacity;','uniform float opacity;\nuniform float uAMin;uniform float uAMax;uniform vec3 uRim;uniform float uRimK;')
      .replace('#include <dithering_fragment>','#include <dithering_fragment>\n{ float f=pow(1.0-clamp(dot(normalize(normal),normalize(vViewPosition)),0.0,1.0),2.6);\n  float spec=dot(reflectedLight.directSpecular+reflectedLight.indirectSpecular,vec3(0.3333));\n  #ifdef USE_CLEARCOAT\n  spec+=dot(clearcoatSpecularDirect+clearcoatSpecularIndirect,vec3(0.3333));\n  #endif\n  gl_FragColor.a=clamp(mix(uAMin,uAMax,f)+spec*1.6,0.0,1.0)*opacity;\n  gl_FragColor.rgb=mix(gl_FragColor.rgb,gl_FragColor.rgb*0.55+uRim*0.75,f*uRimK); }');
  };

  mat.customProgramCacheKey=()=>'slime-fresnel-'+aMin+'-'+aMax;
}

// 작은 환경맵: 밝은 천장 + 창문 두 개 + 따뜻한 바닥. 투명 덩어리 광택과 등껍질 윤기용.
function makeEnvMap(T){
  const w=128,h=64,c=document.createElement('canvas'); c.width=w; c.height=h; const x=c.getContext('2d');
  const g=x.createLinearGradient(0,0,0,h); g.addColorStop(0,'#fffdf7'); g.addColorStop(0.38,'#efe9dc'); g.addColorStop(0.52,'#cdbca3'); g.addColorStop(1,'#5a3d2a');
  x.fillStyle=g; x.fillRect(0,0,w,h);
  // 창문 두 개: 투명 덩어리 위에 맺히는 밝은 반사점
  x.fillStyle='#ffffff'; x.fillRect(10,4,30,22); x.fillRect(76,6,34,20);
  x.fillStyle='rgba(255,255,255,0.7)'; x.fillRect(46,2,18,13); x.fillRect(116,8,10,14);
  const t=new T.CanvasTexture(c); t.mapping=T.EquirectangularReflectionMapping; t.colorSpace=T.SRGBColorSpace; t.needsUpdate=true; return t;
}
