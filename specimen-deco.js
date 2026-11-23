// specimen-deco.js — 테라리움에서 꾸민 바퀴를 실험실 바퀴에 그대로 옮겨 붙인다 (specimen-lab.html에서 부른다)
//
// 꾸밈 자료는 테라리움 바퀴(bamung-roach.js)의 몸 좌표로 저장돼 있다. 실험실 바퀴는 몸 비율이 달라서
//  · 앞가슴 등판: 두 바퀴가 같은 판 모양이라 판 위의 같은 자리로 옮긴다.
//  · 겉날개: 날개 뿌리→끝, 안쪽→바깥쪽 비율이 같은 자리로 옮긴다 (다른 날개 밑에 가려지는 부분은 피한다).
//  · 그 밖(머리·배 옆 등): 비슷한 자리에서 몸 쪽으로 쏴서 처음 닿는 곳에 붙인다.
// 꾸밈은 붙은 부위의 노드 밑에 달아서, 그 부위를 뜯으면 같이 떨어진다. 집게·핀은 꾸밈을 무시하고 몸에 닿는다.
import * as THREE from 'three';
import { DecalGeometry } from 'three/addons/geometries/DecalGeometry.js';
import { hatMesh, bowMesh, stickerCanvas, gemMesh, textTex, glitterTex } from './bamung-roach.js';

const TAU=Math.PI*2;
const clamp=(v,a=0,b=1)=>Math.max(a,Math.min(b,v));
const lerp=(a,b,t)=>a+(b-a)*t;
const sstep=(a,b,v)=>{ const t=clamp((v-a)/(b-a)); return t*t*(3-2*t); };
const V=(x=0,y=0,z=0)=>new THREE.Vector3(x,y,z);

// ───────── 앞가슴 등판: 두 바퀴가 같은 판 모양 (실험실은 그대로, 테라리움은 줄이고 기울이고 처지게 했다) ─────────
const SH={W:.78,LF:.66,LR:.43,P:3.3};
function shEdge(a){ const sx=Math.sin(a),cz=Math.cos(a); const r=cz>=0?1/Math.sqrt((sx/SH.W)**2+(cz/SH.LF)**2):1/Math.pow(Math.pow(Math.abs(sx)/SH.W,SH.P)+Math.pow(Math.abs(cz)/SH.LR,SH.P),1/SH.P); return [sx*r,cz*r]; }
function shTop(u,a){ const f=Math.max(0,Math.cos(a)),H=lerp(.13,lerp(.1,.16,(Math.cos(a)+1)/2),sstep(0,.55,u)); return .012+H*Math.pow(Math.max(0,1-u*u),.78)+.016*sstep(.74,.93,u)*(1-sstep(.93,1,u))-.08*f*u*u; }
/** 판 위의 (x,z) → 판 좌표 (u: 가운데 0 ~ 가장자리 1, a: 방향) */
function shParam(x,z){ const a=Math.atan2(x,z); const [ex,ez]=shEdge(a); return {u:Math.hypot(x,z)/Math.max(1e-6,Math.hypot(ex,ez)),a}; }
const shY=(x,z)=>{ const {u,a}=shParam(x,z); return shTop(Math.min(u,1),a); };
/** 실험실 등판 윗면의 한 점과 법선 (등판 노드 좌표) */
function shPoint(u,a){ const [ex,ez]=shEdge(a); const x=ex*u,z=ez*u, e=.004; const y=shTop(u,a);
  const dx=(shY(x+e,z)-shY(x-e,z))/(2*e), dz=(shY(x,z+e)-shY(x,z-e))/(2*e);
  return {p:V(x,y,z),n:V(-dx,1,-dz).normalize()}; }
// 테라리움 등판: 단위 판 → 몸 좌표 (bamung-roach.js addPronotum과 같은 행렬과 처짐)
const PET_PRO_M=new THREE.Matrix4().compose(V(0,0.104,0.30),new THREE.Quaternion().setFromEuler(new THREE.Euler(0.1,0,0)),V(0.25,0.2,0.25));
const PET_PRO_INV=PET_PRO_M.clone().invert();
/** 테라리움 몸 좌표의 등판 위 점 → 단위 판 좌표 (u,a) */
function petProParam(x,y,z){ const lx=x/0.195, lz=(z-0.30)/0.165; const v=V(x,y+0.03*lx*lx+0.022*Math.max(0,lz)**2,z).applyMatrix4(PET_PRO_INV); return shParam(v.x,v.z); }

// ───────── 겉날개 ─────────
// 테라리움: 뿌리 z 0.22 → 끝 -0.64. side +1은 +x쪽, -1이 위로 겹친다 (bamung-roach.js addWing)
function petWing(u){ const te=clamp((u-0.76)/0.24,0,1); const hs=(0.035+0.095*Math.pow(Math.max(0,Math.sin(Math.PI*clamp(u*0.95+0.08,0,0.86))),0.45))*Math.sqrt(Math.max(0.0004,1-te*te));
  const cx=0.088+0.004*Math.sin(Math.PI*u)-0.05*sstep(0.55,1,u); return {hs,cx}; }
// 실험실: specimen-lab.html wingGeometry(s,{cx:.27,a:.5,len:3,p:2.35,drape:.45,tipDrop:.12}). s +1(오른쪽, +x)이 위로 겹친다
const LW={cx:.27,a:.5,len:3,p:2.35,drape:.45,tipDrop:.12};
function labWingW(t){ const ty=2*t-1; const hw=LW.a*Math.pow(Math.max(0,1-Math.pow(Math.abs(ty),LW.p)),1/LW.p)*(1-.14*sstep(.5,1,t)); return {hw,center:LW.cx-.07*sstep(.5,1,t)}; }
function labWingXYZ(s,t,u){ const {hw,center}=labWingW(t); const x=center-hw+2*hw*u; const y=-LW.drape*Math.pow(Math.max(0,x-.14),2)-LW.tipDrop*Math.pow(t,1.7)+.02*Math.sin(t*Math.PI); return V(s*x,y,-t*LW.len); }
function labWingPoint(s,t,u){ const e=.003; const p=labWingXYZ(s,t,u);
  const dt=labWingXYZ(s,Math.min(1,t+e),u).sub(labWingXYZ(s,Math.max(0,t-e),u)), du=labWingXYZ(s,t,Math.min(1,u+e)).sub(labWingXYZ(s,t,Math.max(0,u-e)));
  const n=V().crossVectors(dt,du); if(n.lengthSq()<1e-12) n.set(0,1,0); n.normalize(); if(n.y<0) n.negate(); return {p,n}; }   // 날개 뿌리 끝은 폭이 0이라 위쪽으로
/** 다른 날개 밑에 가려지는 안쪽 몫 (0이면 다 보인다) */
const petHidden=(side,u)=>{ if(side<0) return 0; const {hs,cx}=petWing(u); return clamp(1-cx/hs,0,0.9); };
const labHidden=(s,t)=>{ if(s>0) return 0; const {hw,center}=labWingW(t); return clamp(1-center/Math.max(1e-4,hw),0,0.9); };
/** 테라리움 날개 위 점 → 실험실 날개 (s, t, u) */
function petWingToLab(x,z,side){
  const u=clamp((0.22-z)/0.86,0,1); const {hs,cx}=petWing(u);
  const v=clamp((side*x-(cx-hs))/Math.max(1e-4,2*hs),0,1);
  const ph=petHidden(side,u), w=clamp((v-ph)/Math.max(0.05,1-ph));
  const t=clamp(u,0.03,0.96), lh=labHidden(side,t);
  return {s:side,t,u:clamp(lh+0.05+w*(0.9-lh),0.04,0.96)};
}
/** 테라리움 몸 좌표의 윗면 점이 어느 판인지: 'P' 등판, +1/-1 날개, null 그 밖 */
function petRegion(p,n){
  const [x,y,z]=p; if(n[1]<0.2) return null;
  if(z>0.205){ const {u}=petProParam(x,y,z); return u<=1.04?'P':null; }
  if(z<-0.66||z>0.24) return null;
  const uu=clamp((0.22-z)/0.86,0,1), {hs,cx}=petWing(uu);
  if(-x>=cx-hs-0.004&&-x<=cx+hs+0.004) return -1;     // 위에 겹친 날개(-1)가 먼저 보인다
  if(x>=cx-hs-0.004&&x<=cx+hs+0.004) return 1;
  return null;
}

// ───────── 재료 ─────────
const noRay=o=>{ o.traverse(m=>{ if(m.isMesh||m.isLine||m.isPoints) m.raycast=()=>{}; }); return o; };
function polishMat(p,grad){
  const col=new THREE.Color(p.c);
  const m=new THREE.MeshPhysicalMaterial({color:col,roughness:0.14,metalness:0,clearcoat:1,clearcoatRoughness:0.04,polygonOffset:true,polygonOffsetFactor:-2,polygonOffsetUnits:-2,side:THREE.DoubleSide});
  if(grad){ m.vertexColors=true; m.color.set(0xffffff); }
  if(p.s==='glitter'){ const t=glitterTex().clone(); t.needsUpdate=true; m.map=t; m.metalness=0.35; m.roughness=0.22; m.color.copy(col).multiplyScalar(0.92); }
  return m;
}
/** 판 좌표 격자로 얇은 막을 만든다. fn(i,j)→{p,n}, 법선 쪽으로 off만큼 띄운다 */
function gridSheet(U,Vn,fn,off,colorAt=null){
  const pos=[],nor=[],uv=[],col=[],idx=[];
  for(let i=0;i<=U;i++) for(let j=0;j<=Vn;j++){ const q=fn(i/U,j/Vn); pos.push(q.p.x+q.n.x*off,q.p.y+q.n.y*off,q.p.z+q.n.z*off); nor.push(q.n.x,q.n.y,q.n.z); uv.push(i/U,j/Vn); if(colorAt){ const c=colorAt(i/U,j/Vn); col.push(c.r,c.g,c.b); } }
  // 감는 방향을 법선 쪽에서 봐서 앞면이 되게 맞춘다 (양면 재질은 뒷면이면 법선을 뒤집어 어둡게 칠한다). 가장자리는 폭이 0일 수 있어 가운데 칸으로 잰다
  const P3=i=>V(pos[i*3],pos[i*3+1],pos[i*3+2]), mi=Math.floor(U/2), mj=Math.floor(Vn/2), a0=mi*(Vn+1)+mj, b0=a0+Vn+1;
  const flip=V().crossVectors(P3(b0).sub(P3(a0)),P3(b0+1).sub(P3(a0))).dot(V(nor[a0*3],nor[a0*3+1],nor[a0*3+2]))<0;
  for(let i=0;i<U;i++) for(let j=0;j<Vn;j++){ const a=i*(Vn+1)+j,b=(i+1)*(Vn+1)+j,c=b+1,d=a+1; if(flip) idx.push(a,c,b,a,d,c); else idx.push(a,b,c,a,c,d); }
  const g=new THREE.BufferGeometry(); g.setAttribute('position',new THREE.Float32BufferAttribute(pos,3)); g.setAttribute('normal',new THREE.Float32BufferAttribute(nor,3)); g.setAttribute('uv',new THREE.Float32BufferAttribute(uv,2));
  if(colorAt) g.setAttribute('color',new THREE.Float32BufferAttribute(col,3));
  g.setIndex(idx); g.computeBoundingSphere(); return g;
}
const PALE=new THREE.Color('#fff4ee');
function polishWing(part,s,p,top){
  const french=p.s==='french', grad=p.s==='grad', col=new THREE.Color(p.c), off=top?0.007:0.005;
  const t0=french?0.74:0.012, t1=0.985;
  const fn=(i,j)=>labWingPoint(s,lerp(t0,t1,i),j);
  const ca=grad?(i)=>PALE.clone().lerp(col,sstep(0.08,0.85,lerp(t0,t1,i))):null;
  const grp=new THREE.Group();
  const m=new THREE.Mesh(gridSheet(26,12,fn,off,ca),polishMat(p,grad)); m.renderOrder=top?3:2; grp.add(m);
  if(french){ // 프렌치: 끝만 칠하고 나머지는 살짝 비치는 분홍빛
    const base=new THREE.Mesh(gridSheet(26,12,(i,j)=>labWingPoint(s,lerp(0.012,0.985,i),j),off*0.8),new THREE.MeshPhysicalMaterial({color:'#ffd9d4',roughness:0.1,clearcoat:1,clearcoatRoughness:0.04,transparent:true,opacity:0.38,depthWrite:false,polygonOffset:true,polygonOffsetFactor:-2,polygonOffsetUnits:-2,side:THREE.DoubleSide}));
    base.renderOrder=top?3:2; grp.add(base); }
  part.node.add(grp); return grp;
}
function polishShield(part,p){
  const french=p.s==='french', grad=p.s==='grad', col=new THREE.Color(p.c), off=0.012;
  const u0=french?0.7:0.02, u1=0.965;
  const fn=(i,j)=>shPoint(lerp(u0,u1,i),j*TAU);
  const ca=grad?(i)=>PALE.clone().lerp(col,sstep(0.15,0.95,lerp(u0,u1,i))):null;
  const grp=new THREE.Group();
  grp.add(new THREE.Mesh(gridSheet(14,44,fn,off,ca),polishMat(p,grad)));
  if(french) grp.add(new THREE.Mesh(gridSheet(14,44,(i,j)=>shPoint(lerp(0.02,0.965,i),j*TAU),off*0.8),new THREE.MeshPhysicalMaterial({color:'#ffd9d4',roughness:0.1,clearcoat:1,clearcoatRoughness:0.04,transparent:true,opacity:0.38,depthWrite:false,polygonOffset:true,polygonOffsetFactor:-2,polygonOffsetUnits:-2,side:THREE.DoubleSide})));
  part.node.add(grp); return grp;
}

// ───────── 투영 붙이기 (스티커·글씨) ─────────
const _o=new THREE.Object3D();
/** mesh 표면의 pW(월드)에 nW 쪽에서 상자로 찍는다. 그림 위쪽은 upW(머리 쪽). 결과는 node 좌표의 도형 */
function decalGeo(mesh,node,pW,nW,upW,rot,w,h,depth,lift){
  const twoSided=(Array.isArray(mesh.material)?mesh.material[0]:mesh.material)?.side===THREE.DoubleSide;
  _o.position.copy(pW); _o.up.copy(Math.abs(nW.dot(upW))>0.9?V(0,1,0):upW); _o.lookAt(pW.clone().add(nW)); _o.rotateZ(rot||0); _o.updateMatrix();
  mesh.updateMatrixWorld(true);
  let g=new DecalGeometry(mesh,_o.position,_o.rotation,V(w,h,depth));
  // 뒷면(반대쪽을 보는 면)에 찍힌 조각은 버린다
  // 뒷면(반대쪽을 보는 면)에 찍힌 조각은 버린다. 얇은 양면 판(날개)은 반대로 감긴 면도 받아서 앞(nW 쪽)을 보게 돌린다
  const P=g.attributes.position, N=g.attributes.normal, U=g.attributes.uv, pos=[],nor=[],uv=[];
  for(let i=0;i+2<P.count;i+=3){ let ok=0; for(let k=0;k<3;k++) ok+=N.getX(i+k)*nW.x+N.getY(i+k)*nW.y+N.getZ(i+k)*nW.z; ok/=3;
    let order=[0,1,2], sgn=1;
    if(ok<=0.15){ if(!(twoSided&&ok<-0.15)) continue; order=[0,2,1]; sgn=-1; }
    for(const k of order){ pos.push(P.getX(i+k),P.getY(i+k),P.getZ(i+k)); nor.push(sgn*N.getX(i+k),sgn*N.getY(i+k),sgn*N.getZ(i+k)); uv.push(U.getX(i+k),U.getY(i+k)); } }
  g.dispose(); g=new THREE.BufferGeometry(); g.setAttribute('position',new THREE.Float32BufferAttribute(pos,3)); g.setAttribute('normal',new THREE.Float32BufferAttribute(nor,3)); g.setAttribute('uv',new THREE.Float32BufferAttribute(uv,2));
  const PP=g.attributes.position, NN=g.attributes.normal;
  for(let i=0;i<PP.count;i++) PP.setXYZ(i,PP.getX(i)+NN.getX(i)*lift,PP.getY(i)+NN.getY(i)*lift,PP.getZ(i)+NN.getZ(i)*lift);
  node.updateMatrixWorld(true); g.applyMatrix4(new THREE.Matrix4().copy(node.matrixWorld).invert()); g.computeBoundingSphere();
  return PP.count?g:null;
}
function stickerTexFresh(k){ const t=new THREE.CanvasTexture(stickerCanvas(k)); t.colorSpace=THREE.SRGBColorSpace; t.anisotropy=4; return t; }

// ───────── 글꼴 (등에 쓴 글씨) ─────────
let fontReq=null;
function gaegu(){
  if(fontReq) return fontReq;
  if(!document.querySelector('link[data-gaegu]')){ const l=document.createElement('link'); l.rel='stylesheet'; l.href='https://fonts.googleapis.com/css2?family=Gaegu:wght@700&display=swap'; l.dataset.gaegu='1'; document.head.appendChild(l); }
  fontReq=new Promise(res=>{ let n=0; const tick=()=>{ document.fonts?.load?.('700 60px Gaegu').then(f=>{ if(f&&f.length) res(true); else if(++n<20) setTimeout(tick,250); else res(false); }).catch(()=>res(false)); }; tick(); });
  return fontReq;
}

/**
 * 실험실 바퀴(specimen)에 테라리움 꾸밈(deco)을 붙인다.
 * specimen: specimen-lab.html의 Specimen (parts: Map, flipNode). 갓 만들어진(쉬는 자세) 상태에서 부른다.
 */
export function dressSpecimen(specimen,deco){
  if(!specimen||!deco||typeof deco!=='object') return [];
  const parts=specimen.parts, body=specimen.flipNode||specimen.root;
  specimen.root.updateMatrixWorld(true);
  const made=[];
  const add=(part,obj)=>{ noRay(obj); obj.traverse(m=>{ if(m.isMesh){ m.userData.tankDeco=true; } }); made.push(obj); return obj; };
  const pro=parts.get('pronotum'), wing={1:parts.get('forewing_R'),'-1':parts.get('forewing_L')};
  const bodyQ=body.getWorldQuaternion(new THREE.Quaternion());
  const headDir=V(0,0,1).applyQuaternion(bodyQ);   // 그림 위쪽 = 머리 쪽
  /** 노드 좌표의 점·법선 → 월드 */
  const toW=(node,p,n)=>{ node.updateMatrixWorld(true); const q=node.getWorldQuaternion(new THREE.Quaternion()); return {pW:node.localToWorld(p.clone()),nW:n.clone().applyQuaternion(q).normalize()}; };
  /** 꾸밈 하나가 붙을 자리: {part, p(노드 좌표), n(노드 좌표), k(크기 배율)} */
  function spot(pp,nn){
    const reg=petRegion(pp,nn);
    if(reg==='P'&&pro){ const {u,a}=petProParam(pp[0],pp[1],pp[2]); const q=shPoint(Math.min(u,0.94),a); return {part:pro,p:q.p,n:q.n,k:4}; }
    if((reg===1||reg===-1)&&wing[reg]){ const m=petWingToLab(pp[0],pp[2],reg); const q=labWingPoint(m.s,m.t,m.u); return {part:wing[reg],p:q.p,n:q.n,k:3.5}; }
    return castSpot(pp,nn);
  }
  // 그 밖: 비슷한 자리에서 몸 쪽으로 쏴서 처음 닿는 부위
  const CAST_ROLES=new Set(['core','abdomen','wing','eye']);
  const castMeshes=[]; for(const pt of parts.values()){ if(!CAST_ROLES.has(pt.role)||pt.state?.detached) continue; for(const m of pt.meshes) if(m.isMesh) castMeshes.push(m); }
  const zMap=(()=>{ // 테라리움 z → 실험실 몸 z (머리 앞·등판 가운데·날개 뿌리·배 끝·날개 끝을 맞춘다)
    const bz=(part,which)=>{ if(!part) return null; const b=new THREE.Box3().setFromObject(part.meshes[0]); const inv=new THREE.Matrix4().copy(body.matrixWorld).invert(); b.applyMatrix4(inv); return which==='max'?b.max.z:which==='min'?b.min.z:(b.min.z+b.max.z)/2; };
    const L=[[0.47,bz(parts.get('head_core'),'max')],[0.30,bz(pro,'mid')],[0.22,body.worldToLocal(wing[1]?.node.getWorldPosition(V())||V(0,0,0.05)).z],[-0.56,bz(parts.get('abdomen_8'),'min')],[-0.64,bz(wing[1],'min')]].filter(x=>x[1]!=null).sort((a,b)=>b[0]-a[0]);
    return z=>{ if(z>=L[0][0]) return L[0][1]+(z-L[0][0])*3.5; for(let i=0;i<L.length-1;i++){ const [a,A]=L[i],[b,B]=L[i+1]; if(z<=a&&z>=b) return lerp(A,B,(a-z)/(a-b)); } const l=L[L.length-1]; return l[1]+(z-l[0])*3.5; };
  })();
  const ray=new THREE.Raycaster();
  function castSpot(pp,nn){
    const n=V(nn[0],nn[1],nn[2]).normalize();
    const pB=V(pp[0]*3.4,lerp(-0.17,0.45,clamp(pp[1]/0.15,-0.3,1.3)),zMap(pp[2]));
    const oW=body.localToWorld(pB.clone().addScaledVector(n,2.4)), dW=n.clone().applyQuaternion(bodyQ).negate();
    ray.set(oW,dW); ray.far=6; const hit=ray.intersectObjects(castMeshes,false)[0]; if(!hit) return null;
    const part=hit.object.userData.part; if(!part) return null;
    const node=part.node; node.updateMatrixWorld(true);
    const nq=node.getWorldQuaternion(new THREE.Quaternion()).invert();
    const nW=hit.face?hit.face.normal.clone().transformDirection(hit.object.matrixWorld):dW.clone().negate();
    if(nW.dot(dW)>0) nW.negate();
    return {part,p:node.worldToLocal(hit.point.clone()),n:nW.applyQuaternion(nq).normalize(),k:3.6};
  }
  const D=deco;
  // 매니큐어: 등판·겉날개 위에 얇은 막 (테라리움 'L'은 +x 날개 = 실험실 오른쪽 날개)
  if(D.polish){
    if(D.polish.P?.c&&pro) add(pro,polishShield(pro,D.polish.P));
    if(D.polish.L?.c&&wing[1]) add(wing[1],polishWing(wing[1],1,D.polish.L,true));
    if(D.polish.R?.c&&wing[-1]) add(wing[-1],polishWing(wing[-1],-1,D.polish.R,false));
  }
  // 등에 쓴 글씨: 두 날개에 걸쳐 찍는다 (테라리움: 가운데 z -0.22, 0.42×0.21)
  if(D.text?.t&&wing[1]&&wing[-1]){
    const m=petWingToLab(0,-0.22,-1);   // 가운데선 위 한 점 (위로 겹친 오른쪽 날개가 덮고 있는 자리)
    const {hw,center}=labWingW(m.t); const uMid=clamp((0-(center-hw))/(2*hw),0,1); const mid=labWingPoint(1,m.t,uMid);
    const {pW,nW}=toW(wing[1].node,mid.p,mid.n);
    const mats=[];
    // 실험실은 머리 쪽에서 내려다보니, 글씨 위쪽을 꼬리 쪽으로 돌려야 바로 읽힌다
    for(const s of [1,-1]){ const part=wing[s]; const g=decalGeo(part.meshes[0],part.node,pW,nW,headDir,Math.PI,0.42*3.5,0.21*3.5,0.7,0.012); if(!g) continue;
      const mat=new THREE.MeshStandardMaterial({map:textTex(D.text.t,D.text.c||'#ffffff'),transparent:true,depthWrite:false,polygonOffset:true,polygonOffsetFactor:-6,polygonOffsetUnits:-6,roughness:0.5});
      const mesh=new THREE.Mesh(g,mat); mesh.renderOrder=s>0?5:4; part.node.add(mesh); add(part,mesh); mats.push(mat); }
    // 글꼴이 늦게 오면 다시 쓴다
    gaegu().then(ok=>{ if(!ok) return; for(const mat of mats){ const old=mat.map; mat.map=textTex(D.text.t,D.text.c||'#ffffff'); mat.needsUpdate=true; old?.dispose?.(); } });
  }
  // 스티커
  for(const st of Array.isArray(D.stickers)?D.stickers:[]){ try{
    const sp=spot(st.p,st.n); if(!sp) continue; const s=(st.s||0.26)*sp.k; const mesh=sp.part.meshes[0];
    const {pW,nW}=toW(sp.part.node,sp.p,sp.n);
    const gSh=decalGeo(mesh,sp.part.node,pW,nW,headDir,st.r||0,s*1.04,s*1.04,s*0.6,0.014*sp.k*0.6);
    const gSt=decalGeo(mesh,sp.part.node,pW,nW,headDir,st.r||0,s,s,s*0.6,0.02*sp.k*0.6);
    if(gSh){ const sh=new THREE.Mesh(gSh,new THREE.MeshBasicMaterial({color:0x3a2412,transparent:true,opacity:0.22,depthWrite:false,polygonOffset:true,polygonOffsetFactor:-5,polygonOffsetUnits:-5,map:stickerTexFresh(st.k)})); sh.renderOrder=6; sp.part.node.add(sh); add(sp.part,sh); }
    if(gSt){ const m=new THREE.Mesh(gSt,new THREE.MeshPhysicalMaterial({map:stickerTexFresh(st.k),transparent:true,depthWrite:false,polygonOffset:true,polygonOffsetFactor:-8,polygonOffsetUnits:-8,roughness:0.28,clearcoat:0.6,clearcoatRoughness:0.2})); m.renderOrder=7; sp.part.node.add(m); add(sp.part,m); }
  }catch(e){ console.warn(e); } }
  // 보석·진주·리본
  for(const gm of Array.isArray(D.gems)?D.gems:[]){ try{
    const sp=spot(gm.p,gm.n); if(!sp) continue;
    const m=gemMesh(gm.k); const s=(gm.s||(gm.k==='bow'?0.2:gm.k==='pearl'?0.085:0.1))*sp.k*0.9;
    m.scale.setScalar(s); m.position.copy(sp.p); m.quaternion.setFromUnitVectors(V(0,1,0),sp.n); m.rotateY(gm.r||0);
    m.position.addScaledVector(sp.n,gm.k==='pearl'?s*0.35:0.006*sp.k);
    m.traverse(o=>{ if(o.isMesh){ o.castShadow=true; o.receiveShadow=true; } });
    sp.part.node.add(m); add(sp.part,m);
  }catch(e){ console.warn(e); } }
  // 털모자: 테라리움에선 등판 앞쪽 (0, 0.13, 0.35)에 쓰고 있다
  if(D.hat&&D.hat.on!==false&&pro){ try{
    const {u,a}=petProParam(0,0.13,0.35); const q=shPoint(u,a);
    const h=hatMesh(D.hat.c||'#ff6f6f'); h.scale.setScalar(0.52*4); h.position.copy(q.p).addScaledVector(q.n,0.01);
    h.quaternion.setFromUnitVectors(V(0,1,0),q.n); h.rotateX(0.2);
    pro.node.add(h); add(pro,h);
  }catch(e){ console.warn(e); } }
  // 더듬이 리본: 테라리움 side +1은 +x 더듬이 = 실험실 오른쪽 더듬이
  if(D.abow&&D.abow.on!==false){ try{
    const seg=parts.get(`antenna_${(D.abow.side||1)>0?'R':'L'}_1`)||parts.get(`antenna_${(D.abow.side||1)>0?'R':'L'}_2`);
    if(seg){ const b=bowMesh(D.abow.c||'#ff6fa8'); b.scale.setScalar(0.62); const L=seg.length||0.12;
      b.position.set(L*0.72,(seg.radius||0.03)*0.9,0); seg.node.add(b); seg.node.updateMatrixWorld(true);
      // 리본 매듭이 위를 보게: 월드 위쪽을 노드 좌표로
      const inv=seg.node.getWorldQuaternion(new THREE.Quaternion()).invert(); const upL=V(0,1,0).applyQuaternion(bodyQ).applyQuaternion(inv).normalize();
      const axL=V(1,0,0); const side=V().crossVectors(upL,axL).normalize(); const fwd=V().crossVectors(side,upL).normalize();
      b.quaternion.setFromRotationMatrix(new THREE.Matrix4().makeBasis(side,upL,fwd));
      b.traverse(o=>{ if(o.isMesh) o.castShadow=true; });
      add(seg,b); }
  }catch(e){ console.warn(e); } }
  return made;
}
