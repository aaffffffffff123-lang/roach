// bamung-props.js — 어항에 놓는 소품
// 소품마다 ① 생김새 ② 바퀴가 못 지나가는 자리(foot) ③ 바퀴가 쓰는 자리(slots) ④ 움직임(update)을 정한다.
// 좌표는 소품 자기 좌표: 바닥 y=0, 앞쪽(처음 놓을 때 카메라 쪽)이 +z. 바퀴 한 마리 몸길이는 0.156쯤.
// slots 종류
//  hide  : 숨는 곳. entry(바닥, 들어가는 방향 h)에서 inside로 기어 들어가 안 보이게 된다. pokes는 더듬이가 삐져나오는 자리
//  path  : 길을 따라 걷는다. pts·nrm(발이 닿는 면의 바깥 방향). mode: tuck(굴 속에 들어가 쉬고 뒷걸음으로 나옴)
//          perch(올라가 쉬다 돌아서 내려옴) climb(끝까지 갔다 돌아옴) oneway(끝까지 가면 끝) . restAt: 쉬는 자리(0~1)
//  cabin : 관람차 칸.  cup: 커피잔.  wheel: 쳇바퀴
//  drink / eat : 마시고 먹는 자리 (x,z,h: 서는 자리와 바라보는 방향)
import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import { makeFoodBait } from './food-detail.js';

const TAU=Math.PI*2, PI=Math.PI;
const clamp=(v,a,b)=>v<a?a:v>b?b:v;
const lerp=(a,b,t)=>a+(b-a)*t;
const rand=(a=1,b)=>b===undefined?Math.random()*a:a+Math.random()*(b-a);

// ───────── 재질·도형 도우미 ─────────
const std=(c,o={})=>new THREE.MeshStandardMaterial(Object.assign({color:c,roughness:0.6,metalness:0},o));
const plastic=(c,o={})=>new THREE.MeshPhysicalMaterial(Object.assign({color:c,roughness:0.3,metalness:0,clearcoat:0.75,clearcoatRoughness:0.22},o));
const metal=(c,o={})=>new THREE.MeshStandardMaterial(Object.assign({color:c,roughness:0.25,metalness:0.9},o));
function mesh(geo,mat,x=0,y=0,z=0,parent=null,cast=true){ const m=new THREE.Mesh(geo,mat); m.position.set(x,y,z); m.castShadow=cast; m.receiveShadow=true; if(parent) parent.add(m); return m; }
function rbox(w,h,d,r,mat,x,y,z,parent,seg=3){ return mesh(new RoundedBoxGeometry(w,h,d,seg,Math.min(r,w/2-1e-4,h/2-1e-4,d/2-1e-4)),mat,x,y,z,parent); }
function box(w,h,d,mat,x,y,z,parent){ return mesh(new THREE.BoxGeometry(w,h,d),mat,x,y,z,parent); }
function cyl(rt,rb,h,mat,x,y,z,parent,seg=20,open=false){ return mesh(new THREE.CylinderGeometry(rt,rb,h,seg,1,open),mat,x,y,z,parent); }
function sph(r,mat,x,y,z,parent,ws=16,hs=12){ return mesh(new THREE.SphereGeometry(r,ws,hs),mat,x,y,z,parent); }
function tubeAlong(pts,r,mat,parent,seg=48,rad=8,closed=false){ const c=new THREE.CatmullRomCurve3(pts.map(p=>new THREE.Vector3(...p)),closed); return mesh(new THREE.TubeGeometry(c,seg,r,rad,closed),mat,0,0,0,parent); }
function ctex(w,h,draw,{repeat=null,srgb=true,aniso=4}={}){ const c=document.createElement('canvas'); c.width=w; c.height=h; draw(c.getContext('2d'),w,h); const t=new THREE.CanvasTexture(c); if(srgb) t.colorSpace=THREE.SRGBColorSpace; t.anisotropy=aniso; if(repeat){ t.wrapS=t.wrapT=THREE.RepeatWrapping; t.repeat.set(repeat[0],repeat[1]); } return t; }
const noiseFill=(g,w,h,amt,alpha=1)=>{ const id=g.getImageData(0,0,w,h), d=id.data; for(let i=0;i<d.length;i+=4){ const n=(Math.random()-0.5)*amt; d[i]=clamp(d[i]+n,0,255); d[i+1]=clamp(d[i+1]+n,0,255); d[i+2]=clamp(d[i+2]+n,0,255); } g.putImageData(id,0,0); };

// ───────── 공통 텍스처 ─────────
let _kraft=null;
function kraftTex(){
  if(_kraft) return _kraft;
  _kraft=ctex(256,256,(g,w,h)=>{ g.fillStyle='#c79d64'; g.fillRect(0,0,w,h);
    for(let i=0;i<500;i++){ g.strokeStyle=`rgba(${120+Math.random()*60|0},${80+Math.random()*40|0},${40+Math.random()*30|0},${0.08+Math.random()*0.12})`; g.lineWidth=0.6+Math.random(); g.beginPath(); const x=Math.random()*w,y=Math.random()*h,a=Math.random()*TAU,l=3+Math.random()*10; g.moveTo(x,y); g.lineTo(x+Math.cos(a)*l,y+Math.sin(a)*l); g.stroke(); }
    noiseFill(g,w,h,16); },{repeat:[1,1]});
  return _kraft;
}
function kraftMat(tint='#ffffff',o={}){ return std(tint,Object.assign({map:kraftTex(),roughness:0.88},o)); }
let _pulp=null;
function pulpTex(){
  if(_pulp) return _pulp;
  _pulp=ctex(256,256,(g,w,h)=>{ g.fillStyle='#cdbfa4'; g.fillRect(0,0,w,h);
    for(let i=0;i<2600;i++){ const v=150+Math.random()*80|0; g.fillStyle=`rgba(${v},${v-8},${v-22},${0.25+Math.random()*0.35})`; g.fillRect(Math.random()*w,Math.random()*h,1+Math.random()*2.5,1+Math.random()*1.5); }
    for(let i=0;i<60;i++){ g.fillStyle=`rgba(${80+Math.random()*60|0},${110+Math.random()*60|0},${150+Math.random()*60|0},0.35)`; g.fillRect(Math.random()*w,Math.random()*h,1.5,1.5); }
    noiseFill(g,w,h,22); },{repeat:[2,2]});
  return _pulp;
}
let _wood=null;
function woodTex(){
  if(_wood) return _wood;
  _wood=ctex(256,256,(g,w,h)=>{ g.fillStyle='#d9a96a'; g.fillRect(0,0,w,h);
    for(let i=0;i<90;i++){ g.strokeStyle=`rgba(${140+Math.random()*30|0},${90+Math.random()*30|0},${45+Math.random()*20|0},${0.12+Math.random()*0.2})`; g.lineWidth=0.8+Math.random()*2; g.beginPath(); const x=Math.random()*w; g.moveTo(x,0); for(let y=0;y<=h;y+=16) g.lineTo(x+Math.sin(y*0.05+i)*4,y); g.stroke(); }
    noiseFill(g,w,h,10); },{repeat:[1,1]});
  return _wood;
}

// 더듬이 끝(숨은 놈이 틈으로 내미는 것) — 바퀴 모델과 같은 색
const ANT_TIP_MAT=std('#4a2210',{roughness:0.5});
const ANT_TIP_GEO=(()=>{ const g=new THREE.CylinderGeometry(0.0006,0.0011,1,5,6,true); g.translate(0,0.5,0); return g; })();
/** 숨은 놈의 더듬이 한 쌍. 틈에서 dir 쪽으로 len만큼 나와 천천히 흔들린다 */
export function makePoke(len=0.05){
  const grp=new THREE.Group(); const ants=[];
  for(const s of [-1,1]){ const piv=new THREE.Group(); piv.position.x=s*0.003; const m=new THREE.Mesh(ANT_TIP_GEO,ANT_TIP_MAT); m.scale.set(1,len,1); m.castShadow=true; piv.add(m); grp.add(piv); ants.push({piv,s,ph:rand(TAU)}); }
  grp.userData.ants=ants; grp.userData.len=len; grp.userData.k=0; grp.visible=false;
  return grp;
}
export function animatePoke(p,t,show,dt){
  const u=p.userData; u.k=clamp(u.k+(show?dt*1.6:-dt*3),0,1); p.visible=u.k>0.01;
  if(!p.visible) return;
  for(const a of u.ants){ a.piv.rotation.set(Math.sin(t*1.7+a.ph)*0.35+0.15*a.s,0,a.s*0.25+Math.sin(t*1.3+a.ph*2)*0.3); a.piv.children[0].scale.y=u.len*u.k; }
}

// 길 만들기 도우미: 꺾이는 자리를 둥글게 이어 준다
const V=(x,y,z)=>new THREE.Vector3(x,y,z);
function polyPath(list){ // list: [[x,y,z,nx,ny,nz],...]
  return {pts:list.map(p=>[p[0],p[1],p[2]]), nrm:list.map(p=>{ const n=V(p[3],p[4],p[5]).normalize(); return [n.x,n.y,n.z]; })};
}

// ══════════════════════════════════════════════════════════════════
// 숨을 곳
// ══════════════════════════════════════════════════════════════════
function printedFace(w,h,draw){ return ctex(w,h,(g,W,H)=>{ g.drawImage(kraftTex().image,0,0,W,H); draw(g,W,H); }); }

function makeBox(){
  const W=0.3,D=0.2,H=0.1,t=0.004;
  const grp=new THREE.Group();
  const side=kraftMat();
  // 앞면: 아래 가운데에 쥐구멍 같은 입구
  const front=printedFace(512,200,(g,w,h)=>{ g.fillStyle='rgba(92,52,24,0.85)'; g.font='800 40px "Noto Sans KR","Apple SD Gothic Neo",sans-serif'; g.textAlign='center'; g.fillText('취급주의',w*0.5,h*0.33);
    g.strokeStyle='rgba(92,52,24,0.85)'; g.lineWidth=5; g.strokeRect(w*0.12,h*0.12,w*0.76,h*0.36);
    // 유리컵 그림 (깨지기 쉬움 표시)
    g.beginPath(); g.moveTo(w*0.18,h*0.17); g.lineTo(w*0.215,h*0.37); g.lineTo(w*0.245,h*0.37); g.lineTo(w*0.28,h*0.17); g.stroke(); g.beginPath(); g.moveTo(w*0.23,h*0.37); g.lineTo(w*0.23,h*0.44); g.stroke();
    g.beginPath(); g.moveTo(w*0.72,h*0.17); g.lineTo(w*0.755,h*0.37); g.lineTo(w*0.785,h*0.37); g.lineTo(w*0.82,h*0.17); g.stroke(); g.beginPath(); g.moveTo(w*0.77,h*0.37); g.lineTo(w*0.77,h*0.44); g.stroke(); });
  const fmat=std('#ffffff',{map:front,roughness:0.88});
  const sh=new THREE.Shape(); const hw=W/2, ow=0.05, oh=0.03;
  sh.moveTo(-hw,0); sh.lineTo(-ow,0); sh.lineTo(-ow,oh-0.012); sh.absarc(0,oh-0.012,ow,PI,0,true); sh.lineTo(ow,0); sh.lineTo(hw,0); sh.lineTo(hw,H); sh.lineTo(-hw,H); sh.lineTo(-hw,0);
  const fg=new THREE.ExtrudeGeometry(sh,{depth:t,bevelEnabled:false});
  { const P=fg.attributes.position, uv=fg.attributes.uv; for(let i=0;i<P.count;i++) uv.setXY(i,(P.getX(i)+hw)/W,P.getY(i)/H); }
  mesh(fg,fmat,0,0,D/2-t,grp);
  box(W,H,t,side,0,H/2,-D/2+t/2,grp);
  const sideTex=printedFace(256,160,(g,w,h)=>{ g.fillStyle='rgba(92,52,24,0.8)'; g.font='800 26px "Noto Sans KR",sans-serif'; g.textAlign='center'; g.fillText('이쪽이 위',w/2,h*0.78);
    g.lineWidth=6; g.strokeStyle='rgba(92,52,24,0.8)'; for(const x of [w*0.38,w*0.62]){ g.beginPath(); g.moveTo(x,h*0.6); g.lineTo(x,h*0.18); g.stroke(); g.beginPath(); g.moveTo(x-14,h*0.32); g.lineTo(x,h*0.16); g.lineTo(x+14,h*0.32); g.stroke(); } });
  const smat=std('#ffffff',{map:sideTex,roughness:0.88});
  for(const s of [-1,1]){ const m=box(t,H,D-2*t,smat,s*(W/2-t/2),H/2,0,grp); m.rotation.y=s>0?0:PI; }
  // 뚜껑 + 테이프
  const top=box(W+0.002,t,D+0.002,side,0,H-t/2+0.0005,0,grp);
  const tape=mesh(new THREE.BoxGeometry(0.05,0.0012,D+0.006),plastic('#e8d6a8',{transparent:true,opacity:0.72,roughness:0.15,clearcoat:1}),0,H+0.0005,0,grp);
  // 숨구멍 칼집 (더듬이가 나오는 틈)
  const slitMat=std('#2a1708',{roughness:1});
  const slits=[[-0.09,0.04,0.4],[0.0,-0.05,-0.3],[0.09,0.035,0.2]];
  for(const [x,z,r] of slits){ const s=mesh(new THREE.BoxGeometry(0.045,0.0016,0.0045),slitMat,x,H+0.0004,z,grp,false); s.rotation.y=r; }
  // 입구 안쪽 어둠
  box(ow*2-0.004,oh+0.02,0.004,std('#140b05',{roughness:1}),0,0.016,D/2-0.012,grp);
  const pokes=[
    {x:-0.09,y:H+0.001,z:0.04,dir:[0.2,1,0.25]},{x:0.09,y:H+0.001,z:0.035,dir:[-0.15,1,0.3]},{x:0,y:H+0.001,z:-0.05,dir:[0.1,1,-0.2]},
    {x:-0.028,y:0.007,z:D/2+0.001,dir:[-0.25,0.15,1]},{x:0.03,y:0.007,z:D/2+0.001,dir:[0.3,0.12,1]}];
  const inside=[[-0.08,-0.045],[0.075,-0.05],[-0.06,0.035],[0.075,0.03],[0,-0.01]];
  const slots=inside.map(([x,z],i)=>({type:'hide',entry:{x:0,z:D/2+0.09,h:PI},inside:{x,y:0,z,h:rand(TAU)},poke:pokes[i]}));
  return {group:grp,foot:[{x:0,z:0,hw:W/2,hd:D/2}],slots,height:H};
}

// 골판지 아파트: 골판지 석 장을 겹친 단면. 골마다 한 마리씩 머리를 내밀고 산다
function makeApartment(){
  const N=3, L=3, cw=0.084, lh=0.04, liner=0.003, D=0.17;
  const W=N*cw+0.01, H=L*lh+liner;
  const grp=new THREE.Group();
  const km=kraftMat('#f2e2c6');
  const dark=std('#3a2412',{roughness:1});
  // 판지(라이너)
  for(let l=0;l<=L;l++) box(W,liner,D,km,0,l*lh+liner/2,0,grp);
  // 골심: 사인파 모양 얇은 판을 앞뒤로 길게 뽑는다
  for(let l=0;l<L;l++){
    const sh=new THREE.Shape(); const y0=l*lh+liner, amp=(lh-liner)/2-0.0012, mid=y0+(lh-liner)/2, th=0.0022, n=80;
    const fx=x=>mid-Math.cos((x+W/2-0.005)/cw*TAU)*amp;
    for(let i=0;i<=n;i++){ const x=-W/2+i/n*W; i?sh.lineTo(x,fx(x)):sh.moveTo(x,fx(x)); }
    for(let i=n;i>=0;i--){ const x=-W/2+i/n*W; sh.lineTo(x,fx(x)+th); }
    const g=new THREE.ExtrudeGeometry(sh,{depth:D,bevelEnabled:false,curveSegments:2}); g.translate(0,0,-D/2);
    mesh(g,kraftMat('#e8cfa2'),0,0,0,grp);
    // 굴 안쪽 그늘: 앞뒤 단면 바로 안쪽에 어두운 막
    for(let k=0;k<N;k++){ const x=-W/2+0.005+(k+0.5)*cw; for(const zz of [D/2-0.012,-D/2+0.012]){ const m=box(cw*0.6,lh*0.55,0.002,dark,x,y0+lh*0.32,zz,grp); m.castShadow=false; } }
  }
  const slots=[];
  for(let l=0;l<L;l++) for(let k=0;k<N;k++){
    const x=-W/2+0.005+(k+0.5)*cw, yf=l*lh+liner, zb=-D/2;
    const list=[[x,0,zb-0.13,0,1,0],[x,0,zb-0.02,0,1,0]];
    if(l>0){ list.push([x,0.012,zb-0.004,0,0.4,-1]); list.push([x,yf-0.006,zb-0.004,0,0,-1]); list.push([x,yf+0.0005,zb+0.012,0,1,-0.4]); }
    list.push([x,yf,zb+0.03,0,1,0]); list.push([x,yf,D/2-0.062,0,1,0]);
    const p=polyPath(list); slots.push({type:'path',mode:'tuck',...p,restAt:1,layer:l});
  }
  return {group:grp,foot:[{x:0,z:0,hw:W/2,hd:D/2}],slots,height:H};
}

// 계란판: 세 장을 세워 기대 놓은 것. 판 사이 틈과 바깥 면에 붙어 쉰다
function eggFlatGeo(w,h,amp){
  const g=new THREE.PlaneGeometry(w,h,40,30); const P=g.attributes.position;
  for(let i=0;i<P.count;i++){ const x=P.getX(i),y=P.getY(i); const cx=Math.cos((x/w+0.5)*TAU*3), cy=Math.cos((y/h+0.5)*TAU*2.4); let d=cx*cy; d=Math.sign(d)*Math.pow(Math.abs(d),0.65); P.setZ(i,d*amp); }
  g.computeVertexNormals(); return g;
}
function makeEggs(){
  const grp=new THREE.Group(); const fw=0.24, fh=0.18, amp=0.011, gaps=[-0.052,0,0.052];
  const mat=std('#ffffff',{map:pulpTex(),roughness:0.95,side:THREE.DoubleSide});
  const geo=eggFlatGeo(fw,fh,amp);
  gaps.forEach((x,i)=>{ const m=mesh(geo,mat,x,fh/2+0.002,0,grp); m.rotation.y=PI/2; m.rotation.z=(i-1)*0.035; });
  // 바닥에 받친 판지
  box(0.16,0.004,fw+0.02,kraftMat(),0,0.002,0,grp);
  const slots=[]; const z0=fw/2+0.08;
  const addPerch=(xFace,nx,zr,yr)=>{ // xFace: 붙는 면의 x, nx: 면 바깥쪽
    const xs=xFace+nx*0.004; const list=[[xs+nx*0.06,0,z0,0,1,0],[xs+nx*0.004,0,zr+0.05,0,1,0],[xs,0.012,zr+0.03,nx,0.4,0],[xs,0.03,zr+0.01,nx,0,0],[xs,yr,zr,nx,0,0]];
    slots.push({type:'path',mode:'perch',...polyPath(list),restAt:1}); };
  addPerch(-0.052-amp,-1,0.04,0.11); addPerch(-0.052-amp,-1,-0.06,0.07);
  addPerch(0.052+amp,1,0.04,0.11); addPerch(0.052+amp,1,-0.06,0.08);
  // 틈 안쪽 (판과 판 사이)
  const inner=(x,nx,zr,yr)=>{ const xs=x+nx*0.002; const list=[[x+nx*0.012,0,z0,0,1,0],[x+nx*0.012,0,fw/2-0.02,0,1,0],[xs,0.012,fw/2-0.04,nx,0.5,0],[xs,yr,zr,nx,0,0]]; slots.push({type:'path',mode:'perch',...polyPath(list),restAt:1}); };
  inner(-0.026,1,0.0,0.1); inner(0.026,-1,-0.03,0.12);
  return {group:grp,foot:[{x:0,z:0,hw:0.075,hd:fw/2+0.005}],slots,height:fh};
}

function makeTube(){
  const R=0.05, r=0.046, L=0.27; const grp=new THREE.Group();
  const tex=ctex(256,128,(g,w,h)=>{ g.drawImage(kraftTex().image,0,0,w,h); g.strokeStyle='rgba(90,55,25,0.45)'; g.lineWidth=2; for(let i=-2;i<4;i++){ g.beginPath(); g.moveTo(i*80,0); g.lineTo(i*80+120,h); g.stroke(); } g.fillStyle='rgba(255,255,255,0.12)'; g.fillRect(0,0,w,h*0.5); });
  const outer=mesh(new THREE.CylinderGeometry(R,R,L,40,1,true),std('#e9d2a6',{map:tex,roughness:0.9}),0,R,0,grp); outer.rotation.z=PI/2;
  const inner=mesh(new THREE.CylinderGeometry(r,r,L,40,1,true),std('#5c3a1c',{roughness:1,side:THREE.BackSide}),0,R,0,grp); inner.rotation.z=PI/2;
  for(const s of [-1,1]){ const rim=mesh(new THREE.RingGeometry(r,R,40),std('#d8bd8c',{roughness:0.9}),s*L/2,R,0,grp); rim.rotation.y=s*PI/2; }
  const slots=[];
  for(const s of [-1,1]){ const ex=s*L/2, list=[[s*(L/2+0.12),0,0,0,1,0],[s*(L/2+0.015),0,0,0,1,0],[ex*0.98,R-r+0.001,0,0,1,0],[s*0.055,R-r+0.0005,0,0,1,0]];
    slots.push({type:'path',mode:'tuck',...polyPath(list),restAt:1}); }
  return {group:grp,foot:[{x:0,z:0,hw:L/2,hd:R}],slots,height:2*R};
}

// 성냥갑 침대: 서랍을 반쯤 빼고 솜을 깔았다
function makeMatchbox(){
  const W=0.2,D=0.13,H=0.05,t=0.003,out=0.095; const grp=new THREE.Group();
  const label=ctex(512,320,(g,w,h)=>{ g.fillStyle='#f4ead2'; g.fillRect(0,0,w,h); g.fillStyle='#d9342b'; g.fillRect(14,14,w-28,h-28); g.fillStyle='#f4ead2'; g.fillRect(30,30,w-60,h-60);
    g.fillStyle='#1f4f8a'; g.beginPath(); g.arc(w*0.3,h*0.5,h*0.26,0,TAU); g.fill();
    g.fillStyle='#ffd23f'; g.beginPath(); g.moveTo(w*0.3,h*0.3); g.bezierCurveTo(w*0.36,h*0.42,w*0.34,h*0.6,w*0.3,h*0.66); g.bezierCurveTo(w*0.26,h*0.6,w*0.24,h*0.42,w*0.3,h*0.3); g.fill();
    g.fillStyle='#d9342b'; g.font='900 64px "Noto Sans KR",sans-serif'; g.textAlign='left'; g.fillText('성냥',w*0.52,h*0.5); g.font='700 26px "Noto Sans KR",sans-serif'; g.fillStyle='#1f4f8a'; g.fillText('안전성냥 · 50개비',w*0.52,h*0.66);
    noiseFill(g,w,h,10); });
  const lm=std('#ffffff',{map:label,roughness:0.75});
  const sideM=std('#d9342b',{roughness:0.7});
  const striker=std('#6b3a22',{roughness:1});
  // 겉갑: 위·아래·옆 두 장 (앞뒤는 뚫림 = x 방향)
  box(W,t,D,lm,0,H-t/2,0,grp).material=[sideM,sideM,lm,sideM,sideM,sideM];
  box(W,t,D,sideM,0,t/2,0,grp);
  for(const s of [-1,1]){ box(W,H,t,sideM,0,H/2,s*(D/2-t/2),grp); box(W*0.9,H*0.7,0.0008,striker,0,H/2,s*(D/2+0.0004),grp); }
  // 서랍 (흰 판지)
  const dm=std('#f7f1e4',{roughness:0.8});
  const dx=out, dh=H-2*t-0.002;
  const tray=new THREE.Group(); tray.position.set(dx,t+0.001,0); grp.add(tray);
  box(W-0.004,0.002,D-2*t-0.002,dm,0,0.001,0,tray);
  for(const s of [-1,1]){ box(W-0.004,dh,0.002,dm,0,dh/2,s*(D/2-t-0.002),tray); box(0.002,dh,D-2*t-0.002,dm,s*(W/2-0.003),dh/2,0,tray); }
  // 솜: 작은 덩어리 여럿을 뭉쳐 보송하게
  const cm=std('#fffdf8',{roughness:1});
  for(let i=0;i<34;i++){ const b=sph(0.014+Math.random()*0.012,cm,rand(-0.02,0.09),0.013+Math.random()*0.006,rand(-0.042,0.042),tray,10,8); b.scale.y=0.55; b.castShadow=false; }
  const slots=[];
  for(const zz of [-0.026,0.028]){ const xr=dx+0.05, list=[[xr,0,D/2+0.11,0,1,0],[xr,0,D/2+0.012,0,1,0],[xr,0.015,D/2+0.004,0,0,1],[xr,H-0.006,D/2-0.003,0,0.6,1],[xr,0.032,D/2-0.022,0,1,0],[xr,0.028,zz,0,1,0]];
    slots.push({type:'path',mode:'perch',...polyPath(list),restAt:1,lie:true}); }
  return {group:grp,foot:[{x:dx/2,z:0,hw:(W+dx)/2,hd:D/2}],slots,height:H};
}

// 인형집: 예쁜 방은 안 쓰고, 집 밑 틈으로만 기어든다
function makeHouse(){
  const W=0.21,D=0.14,H=0.15,gap=0.02; const grp=new THREE.Group();
  const wall=std('#ffd6e0',{roughness:0.7}), trim=std('#ffffff',{roughness:0.55}), roofM=std('#ff8a7a',{roughness:0.6}), doorM=plastic('#7fd1c3'), glass=plastic('#bfe8ff',{roughness:0.05,transparent:true,opacity:0.6});
  for(const [x,z] of [[-W/2+0.012,-D/2+0.012],[W/2-0.012,-D/2+0.012],[-W/2+0.012,D/2-0.012],[W/2-0.012,D/2-0.012]]) cyl(0.008,0.009,gap,trim,x,gap/2,z,grp,12);
  const body=rbox(W,H,D,0.006,wall,0,gap+H/2,0,grp);
  box(W+0.008,0.008,D+0.008,trim,0,gap+0.004,0,grp);
  // 지붕 (박공)
  const roof=new THREE.Shape(); roof.moveTo(-W/2-0.018,0); roof.lineTo(0,0.075); roof.lineTo(W/2+0.018,0); roof.lineTo(-W/2-0.018,0);
  const rg=new THREE.ExtrudeGeometry(roof,{depth:D+0.03,bevelEnabled:true,bevelThickness:0.003,bevelSize:0.003,bevelSegments:2}); rg.translate(0,0,-(D+0.03)/2);
  mesh(rg,roofM,0,gap+H,0,grp);
  // 지붕 기와 줄
  for(let i=0;i<5;i++){ const y=gap+H+0.012+i*0.013, hw=(W/2+0.016)*(1-(i*0.013+0.01)/0.075); for(const s of [-1,1]){ const r=box(hw*1.02,0.003,D+0.034,std('#e9705f',{roughness:0.6}),s*hw/2,y,0,grp); r.rotation.z=-s*Math.atan2(0.075,W/2+0.018); } }
  cyl(0.012,0.012,0.05,std('#c96a5c'),W/4,gap+H+0.05,-0.02,grp,10);
  // 앞면: 문·창문·화단
  rbox(0.042,0.07,0.006,0.004,doorM,0,gap+0.036,D/2+0.002,grp); sph(0.004,metal('#e8c95a'),0.012,gap+0.035,D/2+0.006,grp,8,6);
  for(const x of [-0.065,0.065]){ rbox(0.045,0.045,0.005,0.003,trim,x,gap+0.085,D/2+0.002,grp); box(0.035,0.035,0.004,glass,x,gap+0.085,D/2+0.004,grp); box(0.002,0.035,0.005,trim,x,gap+0.085,D/2+0.005,grp); box(0.035,0.002,0.005,trim,x,gap+0.085,D/2+0.005,grp);
    box(0.05,0.012,0.012,std('#a8744a'),x,gap+0.055,D/2+0.008,grp); for(let k=0;k<4;k++) sph(0.006,std(['#ff6f91','#ffd23f','#ff9f43','#c86bff'][k]),x-0.018+k*0.012,gap+0.064,D/2+0.009,grp,8,6); }
  // 옆 창문
  for(const s of [-1,1]){ rbox(0.005,0.04,0.04,0.003,trim,s*(W/2+0.002),gap+0.09,0,grp); box(0.004,0.03,0.03,glass,s*(W/2+0.004),gap+0.09,0,grp); }
  // 집 밑 그늘
  box(W-0.02,0.001,D-0.02,std('#2a1a10',{roughness:1}),0,0.0006,0,grp).castShadow=false;
  const insides=[[-0.05,-0.03],[0.05,-0.03],[-0.04,0.03],[0.05,0.035]];
  const entries=[{x:-0.03,z:D/2+0.09,h:PI},{x:0.04,z:D/2+0.09,h:PI},{x:-W/2-0.09,z:0.0,h:PI/2},{x:W/2+0.09,z:0.01,h:-PI/2}];
  const pokes=[{x:-0.04,y:0.007,z:D/2+0.002,dir:[-0.2,0.2,1]},{x:0.05,y:0.007,z:D/2+0.002,dir:[0.25,0.15,1]},{x:-W/2-0.002,y:0.007,z:0.02,dir:[-1,0.2,0.2]},{x:W/2+0.002,y:0.007,z:0.03,dir:[1,0.15,0.3]}];
  const slots=insides.map(([x,z],i)=>({type:'hide',entry:entries[i],inside:{x,y:0,z,h:entries[i].h},poke:pokes[i]}));
  return {group:grp,foot:[{x:0,z:0,hw:W/2+0.004,hd:D/2+0.004}],slots,height:H+0.1};
}

// 소파: 벨벳 소파. 앉지 않고 방석 밑으로만 기어든다
function makeSofa(){
  const W=0.2,D=0.085,leg=0.016; const grp=new THREE.Group();
  const vel=new THREE.MeshPhysicalMaterial({color:'#2a9d8f',roughness:0.85,sheen:1,sheenColor:new THREE.Color('#9ff5e6'),sheenRoughness:0.5});
  const gold=metal('#e0b44c',{roughness:0.3});
  for(const [x,z] of [[-W/2+0.015,-D/2+0.012],[W/2-0.015,-D/2+0.012],[-W/2+0.015,D/2-0.012],[W/2-0.015,D/2-0.012]]){ const l=cyl(0.004,0.0025,leg,gold,x,leg/2,z,grp,10); }
  rbox(W,0.022,D,0.008,vel,0,leg+0.011,0,grp);
  rbox(W,0.06,0.02,0.009,vel,0,leg+0.044,-D/2+0.01,grp);
  for(const s of [-1,1]) rbox(0.024,0.04,D,0.01,vel,s*(W/2-0.012),leg+0.035,0,grp);
  const cushion=rbox(W-0.05,0.02,D-0.024,0.008,vel,0,leg+0.032,0.008,grp);
  for(const s of [-1,1]) rbox((W-0.05)/2-0.002,0.042,0.018,0.008,vel,s*(W-0.05)/4,leg+0.05,-D/2+0.026,grp);
  // 쿠션 이음매 단추
  for(const x of [-0.04,0,0.04]) sph(0.003,std('#1e6f65'),x,leg+0.057,-D/2+0.036,grp,8,6);
  const baseY=leg+0.022;
  const slots=[[-0.04,0],[0.04,0]].map(([x,z],i)=>({type:'hide',entry:{x:x*0.5,z:D/2+0.09,h:PI},inside:{x,y:baseY,z:0.0,h:PI},poke:{x:x*1.1,y:baseY+0.004,z:D/2-0.004,dir:[x>0?0.3:-0.3,0.25,1]},under:true}));
  const inst={group:grp,foot:[{x:0,z:0,hw:W/2,hd:D/2}],slots,height:0.08,dynamic:[cushion]};
  let lift=0;
  inst.update=(dt,t,ctx)=>{ const n=slots.filter(s=>s.busy&&s.busy.hidden).length; lift=lerp(lift,n*0.004,1-Math.exp(-4*dt)); cushion.position.y=leg+0.032+lift; cushion.rotation.x=-lift*1.6; };
  return inst;
}

// ══════════════════════════════════════════════════════════════════
// 놀이기구
// ══════════════════════════════════════════════════════════════════
const CABIN_COLORS=['#ff7aa8','#ffd23f','#5fd1b0','#6fb7ff','#c09bff','#ff9f68'];
function makeFerris(){
  const grp=new THREE.Group(); const AX=0.33, R=0.2, hang=0.042;
  const white=plastic('#fbfbf6',{roughness:0.35}), base=plastic('#7fc8ff',{roughness:0.4}), rimM=plastic('#ffffff',{roughness:0.3});
  rbox(0.36,0.014,0.17,0.005,base,0,0.007,0,grp);
  // 승강장 계단
  rbox(0.13,0.012,0.05,0.004,plastic('#ffe08a'),0,0.012,0.105,grp);
  // A자 기둥 (앞뒤)
  for(const z of [-0.075,0.075]){ for(const s of [-1,1]) tubeAlong([[s*0.15,0.014,z],[s*0.075,0.17,z],[0,AX,z]],0.007,white,grp,12,8); box(0.2,0.008,0.008,white,0,0.1,z,grp); }
  cyl(0.01,0.01,0.17,metal('#cfd3d6'),0,AX,0,grp,12).rotation.x=PI/2;
  const wheel=new THREE.Group(); wheel.position.set(0,AX,0); grp.add(wheel);
  for(const z of [-0.052,0.052]){ mesh(new THREE.TorusGeometry(R,0.005,8,80),rimM,0,0,z,wheel); mesh(new THREE.TorusGeometry(R*0.55,0.0035,8,56),rimM,0,0,z,wheel);
    for(let i=0;i<12;i++){ const a=i/12*TAU; const sp=mesh(new THREE.CylinderGeometry(0.0026,0.0026,R,6),rimM,Math.cos(a)*R/2,Math.sin(a)*R/2,z,wheel); sp.rotation.z=a-PI/2; } }
  sph(0.022,plastic('#ffd23f'),0,0,0,wheel,16,12).scale.z=2.6;
  const bulbM=new THREE.MeshStandardMaterial({color:'#fff6d0',emissive:'#ffd98a',emissiveIntensity:1.4,roughness:0.3});
  for(let i=0;i<28;i++){ const a=i/28*TAU; for(const z of [-0.057,0.057]) sph(0.0042,bulbM,Math.cos(a)*R,Math.sin(a)*R,z,wheel,6,5).castShadow=false; }
  const cabins=[];
  for(let i=0;i<6;i++){
    const a=i/6*TAU; const bar=mesh(new THREE.CylinderGeometry(0.0035,0.0035,0.11,8),metal('#cfd3d6'),Math.cos(a)*R,Math.sin(a)*R,0,wheel); bar.rotation.x=PI/2;
    const piv=new THREE.Group(); piv.position.set(Math.cos(a)*R,Math.sin(a)*R,0); wheel.add(piv);
    const cab=new THREE.Group(); cab.position.y=-hang; piv.add(cab);
    const col=CABIN_COLORS[i], cm=plastic(col);
    rbox(0.12,0.005,0.094,0.002,cm,0,-0.042,0,cab);                     // 바닥
    rbox(0.13,0.014,0.104,0.006,plastic('#ffffff'),0,0.044,0,cab);       // 지붕
    sph(0.008,cm,0,0.054,0,cab,10,8);
    for(const s of [-1,1]) rbox(0.005,0.084,0.094,0.002,cm,s*0.058,0.0,0,cab);   // 옆벽 (앞뒤는 창으로 뚫림)
    for(const s of [-1,1]) for(const x of [-0.055,0.055]) box(0.005,0.084,0.005,cm,x,0,s*0.045,cab);
    for(const s of [-1,1]) box(0.12,0.016,0.004,cm,0,-0.032,s*0.045,cab).castShadow=false;
    mesh(new THREE.CylinderGeometry(0.0022,0.0022,hang-0.045,6),metal('#cfd3d6'),0,hang/2+0.022,0,cab);
    const seat=new THREE.Object3D(); seat.position.set(0,-0.039,0); cab.add(seat);
    cabins.push({piv,cab,seat,a0:a,i});
  }
  const slot={type:'cabin',board:{x:0,z:0.24,h:PI}};
  const inst={group:grp,foot:[{x:0,z:0,hw:0.18,hd:0.085},{x:0,z:0.105,hw:0.065,hd:0.025}],slots:[slot],height:AX+R+0.07,cabins,maxRiders:6};
  let ang=0;
  inst.update=(dt)=>{ ang+=dt*0.12; wheel.rotation.z=ang; for(const c of cabins){ c.piv.rotation.z=-ang; } };
  inst.cabinAngle=c=>((c.a0+ang)%TAU+TAU)%TAU;
  const bottomDist=c=>Math.abs(((inst.cabinAngle(c)-1.5*PI+PI)%TAU+TAU)%TAU-PI);
  inst.cabinAtBoard=(busy)=>{ for(const c of cabins){ if(bottomDist(c)<0.12&&!busy.has(c.i)) return c; } return null; };
  inst.atBottom=c=>bottomDist(c)<0.12;
  return inst;
}

function cupGeo(r=0.058,h=0.05){ const pts=[]; for(let i=0;i<=16;i++){ const t=i/16; pts.push(new THREE.Vector2(r*0.62+r*0.36*Math.sin(t*PI*0.55)+0.002*t,t*h)); } pts.push(new THREE.Vector2(r+0.002,h+0.0015)); for(let i=16;i>=0;i--){ const t=i/16; pts.push(new THREE.Vector2(r*0.56+r*0.36*Math.sin(t*PI*0.55),0.004+t*(h-0.004))); } return new THREE.LatheGeometry(pts,36); }
function dotsTex(bg,dot){ return ctex(256,128,(g,w,h)=>{ g.fillStyle=bg; g.fillRect(0,0,w,h); g.fillStyle=dot; for(let y=10;y<h;y+=26) for(let x=(y/26%2)*13+8;x<w;x+=26){ g.beginPath(); g.arc(x,y,5,0,TAU); g.fill(); } }); }
function makeTeacups(){
  const grp=new THREE.Group(); const Rp=0.262, cr=0.084, ch=0.054, cR=0.16;
  const stripe=ctex(512,512,(g,w,h)=>{ const c=['#ffe3ef','#fff7d6']; for(let i=0;i<16;i++){ g.fillStyle=c[i%2]; g.beginPath(); g.moveTo(w/2,h/2); g.arc(w/2,h/2,w/2,i/16*TAU,(i+1)/16*TAU); g.fill(); } g.strokeStyle='#ff9ec7'; g.lineWidth=10; g.beginPath(); g.arc(w/2,h/2,w/2-8,0,TAU); g.stroke(); });
  const plat=new THREE.Group(); grp.add(plat);
  mesh(new THREE.CylinderGeometry(Rp,Rp+0.005,0.016,56),[std('#ff9ec7',{roughness:0.5}),std('#ffffff',{map:stripe,roughness:0.5}),std('#ff9ec7')],0,0.008,0,plat);
  // 가운데 찻주전자
  const pot=new THREE.Group(); pot.position.y=0.016; plat.add(pot);
  const potM=plastic('#ffffff',{roughness:0.25});
  const body=sph(0.042,potM,0,0.038,0,pot,28,18); body.scale.y=0.85;
  mesh(new THREE.TorusGeometry(0.02,0.004,8,24),plastic('#ff9ec7'),0,0.077,0,pot).rotation.x=PI/2;
  sph(0.016,plastic('#ff9ec7'),0,0.086,0,pot,12,8);
  tubeAlong([[0.038,0.03,0],[0.065,0.05,0],[0.078,0.072,0]],0.007,potM,pot,12,8);
  const hd=mesh(new THREE.TorusGeometry(0.022,0.005,8,16,PI),potM,-0.044,0.042,0,pot); hd.rotation.z=PI/2;
  const cups=[]; const cg=cupGeo(cr,ch); const cols=[['#ffb3cf','#ffffff'],['#9ee6d2','#ffffff'],['#ffe27a','#ffffff']];
  for(let i=0;i<3;i++){ const a=i/3*TAU; const holder=new THREE.Group(); holder.position.set(Math.cos(a)*cR,0.016,Math.sin(a)*cR); plat.add(holder);
    const cupG=new THREE.Group(); holder.add(cupG);
    mesh(new THREE.CylinderGeometry(cr*1.25,cr*1.1,0.006,40),std(cols[i][1],{roughness:0.35}),0,0.003,0,cupG);
    mesh(cg,new THREE.MeshPhysicalMaterial({map:dotsTex(cols[i][0],cols[i][1]),roughness:0.25,clearcoat:0.8,side:THREE.DoubleSide}),0,0.006,0,cupG);
    const h=mesh(new THREE.TorusGeometry(0.016,0.0045,8,16,PI*1.2),plastic(cols[i][0]),cr+0.004,ch*0.65,0,cupG); h.rotation.z=-PI/2-0.3;
    const seat=new THREE.Object3D(); seat.position.set(0,0.03,0); cupG.add(seat);
    cups.push({holder,cupG,seat,i,spin:rand(TAU)});
  }
  const slots=cups.map(c=>({type:'cup',idx:c.i,approach:{x:0,z:Rp+0.09,h:PI}}));
  const inst={group:grp,foot:[{x:0,z:0,r:Rp+0.006}],slots,height:0.12,cups,platR:Rp};
  let a=0;
  inst.update=(dt)=>{ a+=dt*0.2; plat.rotation.y=a; for(const c of cups){ c.spin+=dt*0.8; c.cupG.rotation.y=c.spin; } };
  return inst;
}

function makeWheel(){
  const grp=new THREE.Group(); const R=0.118, Wd=0.17, AX=0.13;
  const plasticM=new THREE.MeshPhysicalMaterial({color:'#6fe0c8',roughness:0.18,clearcoat:1,transparent:true,opacity:0.8,side:THREE.DoubleSide,depthWrite:false});
  const stand=plastic('#ff9ec7',{roughness:0.35});
  rbox(0.23,0.014,0.25,0.006,stand,0,0.007,-0.03,grp);
  const post=new THREE.Shape(); post.moveTo(-0.035,0); post.lineTo(0.035,0); post.lineTo(0.014,AX); post.absarc(0,AX,0.017,0,PI,false); post.lineTo(-0.035,0);
  const pg=new THREE.ExtrudeGeometry(post,{depth:0.012,bevelEnabled:true,bevelSize:0.003,bevelThickness:0.003,bevelSegments:2}); mesh(pg,stand,0,0.012,-Wd/2-0.034,grp);
  cyl(0.007,0.007,0.03,metal('#d8dde0'),0,AX+0.012,-Wd/2-0.014,grp,12).rotation.x=PI/2;
  const wheel=new THREE.Group(); wheel.position.set(0,AX+0.012,0); grp.add(wheel);
  const rt=ctex(256,64,(g,w,h)=>{ g.fillStyle='#ffffff'; g.fillRect(0,0,w,h); g.fillStyle='rgba(0,80,60,0.35)'; for(let x=0;x<w;x+=8) g.fillRect(x,4,3,h-8); },{repeat:[10,1]});
  const drumM=plasticM.clone(); drumM.map=rt;
  const drum=mesh(new THREE.CylinderGeometry(R,R,Wd,72,1,true),drumM,0,0,0,wheel,false); drum.rotation.x=PI/2;
  mesh(new THREE.CircleGeometry(R,56),plasticM,0,0,-Wd/2,wheel,false);
  const rimC=plastic('#4fcfb4');
  mesh(new THREE.TorusGeometry(R,0.0045,8,72),rimC,0,0,Wd/2,wheel); mesh(new THREE.TorusGeometry(R,0.0045,8,72),rimC,0,0,-Wd/2,wheel);
  for(let i=0;i<6;i++){ const a=i/6*TAU; const s=mesh(new THREE.BoxGeometry(0.005,R*0.95,0.004),rimC,Math.cos(a)*R*0.47,Math.sin(a)*R*0.47,-Wd/2+0.003,wheel); s.rotation.z=a-PI/2; }
  sph(0.014,plastic('#ff9ec7'),0,0,-Wd/2+0.005,wheel,12,10);
  const slot={type:'wheel',approach:{x:0,z:0.2,h:PI}};
  const inst={group:grp,foot:[{x:0,z:-0.03,hw:0.118,hd:0.128}],slots:[slot,{...slot,second:true}],height:AX+R+0.03};
  inst.wheel={R:R-0.003,AX:AX+0.012,W:Wd,theta:0,omega:0,riders:[]};
  inst.update=(dt,t,ctx)=>{ const w=inst.wheel; let drive=0, n=0; for(const r of w.riders){ if(r.running){ drive+=r.dir*r.runSpd/w.R; n++; } }
    const target=n?drive/n:0; const k=n?5:0.8; w.omega+=(target-w.omega)*(1-Math.exp(-k*dt)); w.theta+=w.omega*dt; wheel.rotation.z=w.theta;
    ctx?.sfx?.wheel?.(Math.abs(w.omega),inst); };
  return inst;
}

// 롤러코스터: 차는 역에 세워 두고, 바퀴는 레일 위를 걸어서 고리까지 거꾸로 매달려 지나간다
function coasterTrack(){
  const P=[]; const push=(x,y,z,nx,ny)=>P.push([x,y,z,nx,ny,0]);
  push(-0.44,0,0,0,1); push(-0.39,0.005,0,-0.12,1); push(-0.36,0.022,0,-0.25,1);
  for(let x=-0.33;x<=-0.2001;x+=0.026) push(x,0.026,0,0,1);
  for(let i=1;i<=12;i++){ const t=i/12, x=lerp(-0.2,-0.02,t), e=t*t*(3-2*t), y=lerp(0.026,0.21,e), dy=(0.21-0.026)*6*t*(1-t)/0.18; push(x,y,0,-dy,1); }
  for(let i=1;i<=12;i++){ const t=i/12, x=lerp(-0.02,0.14,t), e=t*t*(3-2*t), y=lerp(0.21,0.04,e), dy=(0.04-0.21)*6*t*(1-t)/0.16; push(x,y,0,-dy,1); }
  const cx=0.23, cy=0.13, r=0.09;
  for(let i=0;i<=36;i++){ const a=-PI/2+i/36*TAU; const x=cx+Math.cos(a)*r, y=cy+Math.sin(a)*r, z=0.06*i/36; P.push([x,y,z,cx-x,cy-y,0]); }
  for(let i=1;i<=10;i++){ const t=i/10, x=lerp(0.23,0.42,t), y=lerp(0.04,0.0,t), dy=-0.04/0.19; P.push([x,y,0.06,-dy*(1-t*0.7),1,0]); }
  return P;
}
function makeCoaster(){
  const grp=new THREE.Group(); const red=plastic('#ff4f5e',{roughness:0.28}), white=plastic('#fbfbf6'), tie=std('#8a6a4a',{roughness:0.8});
  const T=coasterTrack();
  const pts=T.map(p=>V(p[0],p[1],p[2])), nrms=T.map(p=>V(p[3],p[4],p[5]).normalize());
  for(const s of [-1,1]){ const rail=pts.map((p,i)=>{ const tan=(i<pts.length-1?pts[i+1].clone().sub(p):p.clone().sub(pts[i-1])).normalize(); const side=V(0,0,0).crossVectors(tan,nrms[i]).normalize(); return p.clone().addScaledVector(side,s*0.016).addScaledVector(nrms[i],-0.004); });
    mesh(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(rail),260,0.0038,7,false),red,0,0,0,grp); }
  const curve=new THREE.CatmullRomCurve3(pts); const N=Math.floor(curve.getLength()/0.018);
  for(let i=0;i<=N;i++){ const u=i/N, p=curve.getPointAt(u), tan=curve.getTangentAt(u); let k=0, best=1e9; for(let j=0;j<pts.length;j++){ const d=pts[j].distanceToSquared(p); if(d<best){best=d;k=j;} }
    const n=nrms[k]; const side=V(0,0,0).crossVectors(tan,n).normalize(); const m=mesh(new THREE.BoxGeometry(0.042,0.0024,0.007),tie,p.x,p.y,p.z,grp); m.position.addScaledVector(n,-0.0055);
    const mx=new THREE.Matrix4().makeBasis(side,n,tan); m.quaternion.setFromRotationMatrix(mx); }
  for(const [x,y,z] of [[-0.3,0.026,0],[-0.21,0.026,0],[-0.12,0.08,0],[-0.02,0.21,0],[0.07,0.12,0],[0.23,0.04,0.0],[0.23,0.04,0.06],[0.33,0.022,0.06]]){ cyl(0.0042,0.0042,y,white,x,y/2,z,grp,8); cyl(0.01,0.011,0.005,white,x,0.0025,z,grp,12); }
  rbox(0.15,0.008,0.065,0.003,plastic('#ffe08a'),-0.265,0.014,-0.05,grp);
  for(const x of [-0.33,-0.2]) cyl(0.0035,0.0035,0.095,white,x,0.062,-0.07,grp,8);
  rbox(0.16,0.007,0.09,0.003,plastic('#6fb7ff'),-0.265,0.112,-0.045,grp);
  const car=new THREE.Group(); car.position.set(-0.26,0.03,0); grp.add(car);
  rbox(0.1,0.028,0.044,0.01,plastic('#ffd23f'),0,0.017,0,car); rbox(0.026,0.024,0.04,0.008,plastic('#ff4f5e'),0.04,0.026,0,car);
  for(const x of [-0.022,0.01]) rbox(0.022,0.014,0.036,0.005,plastic('#ffffff'),x,0.03,0,car);
  for(const x of [-0.034,0.034]) for(const z of [-0.021,0.021]) cyl(0.008,0.008,0.005,metal('#444'),x,0.005,z,car,10).rotation.x=PI/2;
  const p=polyPath(T);
  const slots=[{type:'path',mode:'oneway',...p,lane:0},{type:'path',mode:'oneway',...p,lane:1}];
  return {group:grp,foot:[{x:-0.27,z:-0.02,hw:0.085,hd:0.06},{x:-0.06,z:0,hw:0.15,hd:0.025},{x:0.23,z:0.03,hw:0.105,hd:0.055}],slots,height:0.26};
}

function makeSlide(){
  const grp=new THREE.Group(); const yel=plastic('#ffcf33',{roughness:0.25}), blue=plastic('#4a90ff'), red=plastic('#ff5a5f');
  const PY=0.135, px0=-0.14, px1=-0.05, ex=0.2, ey=0.014, CW=0.09;
  for(const x of [px0,px1]) for(const z of [-CW/2,CW/2]) cyl(0.005,0.005,PY,blue,x,PY/2,z,grp,10);
  rbox(px1-px0+0.014,0.009,CW+0.014,0.003,red,(px0+px1)/2,PY,0,grp);
  for(const z of [-CW/2+0.004,CW/2-0.004]){ const r=cyl(0.0035,0.0035,0.16,blue,px0-0.035,PY/2,z,grp,8); r.rotation.z=-0.25; }
  for(let i=1;i<6;i++){ const y=i*PY/6; const r=cyl(0.003,0.003,CW-0.008,yel,px0-0.035+Math.tan(0.25)*(PY/2-y),y,0,grp,8); r.rotation.x=PI/2; }
  const L=Math.hypot(ex-px1,PY-ey), ang=Math.atan2(PY-ey,ex-px1);
  const chute=new THREE.Group(); chute.position.set(px1,PY,0); chute.rotation.z=-ang; grp.add(chute);
  rbox(L,0.005,CW,0.002,yel,L/2,0,0,chute);
  for(const z of [-CW/2-0.002,CW/2+0.002]) rbox(L,0.02,0.005,0.002,yel,L/2,0.009,z,chute);
  rbox(0.04,0.005,CW,0.002,yel,ex+0.016,ey-0.002,0,grp);
  for(const z of [-CW/2,CW/2]) tubeAlong([[px1,PY,z],[px1+0.006,PY+0.045,z],[px1+0.03,PY+0.038,z]],0.0035,blue,grp,10,6);
  const n=V(Math.sin(ang),Math.cos(ang),0);
  const up=(x,y,z)=>[x,y,z,0,1,0];
  const list=[up(ex+0.15,0,0),up(ex+0.045,0,0),[ex+0.02,ey+0.003,0,0,1,0],[ex-0.012,ey+0.006,0,n.x,n.y,0]];
  for(let i=1;i<=7;i++){ const t=i/7; list.push([lerp(ex-0.012,px1+0.008,t),lerp(ey+0.006,PY+0.005,t),0,n.x,n.y,0]); }
  list.push([px1-0.012,PY+0.005,0,0,1,0]); list.push([(px0+px1)/2,PY+0.005,0,0,1,0]);
  const slots=[{type:'path',mode:'climb',...polyPath(list),restAt:1,slide:true}];
  return {group:grp,foot:[{x:(px0-0.05+ex+0.035)/2,z:0,hw:(ex+0.035-px0+0.05)/2,hd:CW/2+0.008}],slots,height:PY+0.05};
}

function makeClimbWall(){
  const grp=new THREE.Group(); const H=0.27, W=0.23, tilt=0.18;
  const panel=new THREE.Group(); panel.position.set(0,0.014,-0.03); panel.rotation.x=-tilt; grp.add(panel);
  rbox(W,H,0.014,0.004,std('#ffffff',{map:woodTex(),roughness:0.7}),0,H/2,0,panel);
  const cols=['#ff5a5f','#ffcf33','#4a90ff','#3ec97b','#c86bff','#ff9f43','#2ec4d6'];
  for(let i=0;i<26;i++){ const x=rand(-W/2+0.018,W/2-0.018), y=rand(0.025,H-0.02); const s=rand(0.007,0.013);
    const h=sph(s,plastic(cols[i%cols.length],{roughness:0.5}),x,y,0.007,panel,10,8); h.scale.set(rand(0.8,1.5),rand(0.7,1.2),0.55); h.rotation.z=rand(TAU); }
  rbox(W+0.02,0.014,0.075,0.004,std('#8a6a4a',{map:woodTex(),roughness:0.8}),0,0.007,-0.03,grp);
  for(const s of [-1,1]){ const b=box(0.009,0.18,0.009,std('#8a6a4a'),s*W/2.4,0.09,-0.075,grp); b.rotation.x=0.35; }
  const nz=Math.cos(tilt), ny=Math.sin(tilt);
  const slots=[];
  for(const lx of [-0.055,0.055]){ const fz=-0.03+0.007, list=[[lx,0,0.17,0,1,0],[lx,0,0.04,0,1,0],[lx,0.015,0.02,0,1,0.3]];
    for(let i=0;i<=7;i++){ const h=0.022+i/7*(H-0.07); list.push([lx,0.014+Math.cos(tilt)*h,fz-Math.sin(tilt)*h+0.009,0,ny,nz]); }
    slots.push({type:'path',mode:'climb',...polyPath(list),restAt:1}); }
  return {group:grp,foot:[{x:0,z:-0.03,hw:W/2+0.012,hd:0.05}],slots,height:H};
}

// ══════════════════════════════════════════════════════════════════
// 먹이·물
// ══════════════════════════════════════════════════════════════════
let _rip=null;
function rippleTex(){
  if(_rip) return _rip;
  _rip=ctex(256,256,(g,w,h)=>{ g.fillStyle='rgb(128,128,255)'; g.fillRect(0,0,w,h);
    for(let i=0;i<70;i++){ const x=Math.random()*w,y=Math.random()*h,r=6+Math.random()*24; const gr=g.createRadialGradient(x,y,0,x,y,r); gr.addColorStop(0,'rgba(160,150,255,0.5)'); gr.addColorStop(0.6,'rgba(100,110,255,0.35)'); gr.addColorStop(1,'rgba(128,128,255,0)'); g.fillStyle=gr; g.beginPath(); g.arc(x,y,r,0,TAU); g.fill(); } },{repeat:[2,2],srgb:false});
  return _rip;
}
function waterMat(){ const m=new THREE.MeshPhysicalMaterial({color:'#9fdcff',roughness:0.04,metalness:0,transparent:true,opacity:0.62,clearcoat:1,clearcoatRoughness:0.02,normalMap:rippleTex(),normalScale:new THREE.Vector2(0.35,0.35)}); m.normalMap=rippleTex().clone(); m.normalMap.needsUpdate=true; m.normalMap.wrapS=m.normalMap.wrapT=THREE.RepeatWrapping; return m; }
function ringSlots(type,R,n,mouthY,off=0){ const s=[]; for(let i=0;i<n;i++){ const a=off+i/n*TAU; const x=Math.sin(a)*(R+0.072), z=Math.cos(a)*(R+0.072); s.push({type,x,z,h:a+PI,mouth:[Math.sin(a)*(R+0.005),mouthY,Math.cos(a)*(R+0.005)]}); } return s; }

function makeFountain(){
  const grp=new THREE.Group(); const R=0.075;
  const cer=new THREE.MeshPhysicalMaterial({color:'#fbf8f2',roughness:0.22,clearcoat:0.8,clearcoatRoughness:0.15});
  const outer=[]; for(const [r,y] of [[R-0.004,0],[R,0.004],[R+0.002,0.016],[R-0.002,0.02],[R-0.008,0.02],[R-0.009,0.006]]) outer.push(new THREE.Vector2(r,y));
  mesh(new THREE.LatheGeometry(outer,48),cer,0,0,0,grp);
  mesh(new THREE.CircleGeometry(R-0.008,40),std('#bfe6f2',{roughness:0.4}),0,0.006,0,grp).rotation.x=-PI/2;
  const water=mesh(new THREE.CircleGeometry(R-0.008,48),waterMat(),0,0.015,0,grp,false); water.rotation.x=-PI/2;
  // 기둥 + 윗접시
  const col=[]; for(const [r,y] of [[0.012,0.0],[0.009,0.02],[0.007,0.05],[0.011,0.062],[0.03,0.07],[0.032,0.074],[0.026,0.076],[0.006,0.072]]) col.push(new THREE.Vector2(r,y));
  mesh(new THREE.LatheGeometry(col,32),cer,0,0.006,0,grp);
  const topWater=mesh(new THREE.CircleGeometry(0.026,32),waterMat(),0,0.08,0,grp,false); topWater.rotation.x=-PI/2;
  sph(0.006,cer,0,0.086,0,grp,10,8);
  // 넘쳐흐르는 물: 윗접시 가장자리에서 아랫물로 떨어지는 얇은 물줄기
  const flowTex=ctex(64,256,(g,w,h)=>{ const gr=g.createLinearGradient(0,0,w,0); gr.addColorStop(0,'rgba(255,255,255,0)'); gr.addColorStop(0.5,'rgba(255,255,255,0.95)'); gr.addColorStop(1,'rgba(255,255,255,0)'); for(let y=0;y<h;y+=4){ g.fillStyle=gr; g.globalAlpha=0.3+Math.random()*0.7; g.fillRect(0,y,w,3); } },{repeat:[6,1]});
  const flowMat=new THREE.MeshBasicMaterial({color:'#dff6ff',map:flowTex,transparent:true,opacity:0.7,depthWrite:false,side:THREE.DoubleSide});
  const curtain=mesh(new THREE.CylinderGeometry(0.031,0.036,0.064,32,1,true),flowMat,0,0.048,0,grp,false);
  const jetMat=new THREE.MeshBasicMaterial({color:'#e8fbff',map:flowTex.clone(),transparent:true,opacity:0.8,depthWrite:false});
  jetMat.map.repeat.set(1,1); jetMat.map.needsUpdate=true;
  const jet=mesh(new THREE.CylinderGeometry(0.0015,0.003,0.03,8,1,true),jetMat,0,0.1,0,grp,false);
  const slots=ringSlots('drink',R,6,0.022,0.3);
  const inst={group:grp,foot:[{x:0,z:0,r:R+0.004}],slots,height:0.12,water:true,dynamic:[jet],waterY:0.015,waterR:R-0.008};
  inst.update=(dt,t)=>{ water.material.normalMap.offset.set(t*0.03,t*0.02); topWater.material.normalMap.offset.set(-t*0.05,t*0.04); flowTex.offset.y=-t*1.6; jetMat.map.offset.y=-t*2.2; jet.scale.y=1+Math.sin(t*9)*0.08; };
  return inst;
}

function tileTex(){ return ctex(256,256,(g,w,h)=>{ g.fillStyle='#e9f6ff'; g.fillRect(0,0,w,h); const s=32; for(let y=0;y<h;y+=s) for(let x=0;x<w;x+=s){ const l=58+Math.random()*12; g.fillStyle=`hsl(${196+Math.random()*10},75%,${l}%)`; g.fillRect(x+2,y+2,s-4,s-4); } },{repeat:[3,2]}); }
function makePool(){
  const grp=new THREE.Group(); const W=0.25, D=0.16, H=0.026, rim=0.01;
  const tile=std('#ffffff',{map:tileTex(),roughness:0.25}), coping=plastic('#ffffff',{roughness:0.35});
  // 바깥벽 + 테두리 (가운데가 빈 상자)
  const sh=new THREE.Shape(); const rr=0.02; const rs=(s,w,d,r)=>{ s.moveTo(-w/2+r,-d/2); s.lineTo(w/2-r,-d/2); s.quadraticCurveTo(w/2,-d/2,w/2,-d/2+r); s.lineTo(w/2,d/2-r); s.quadraticCurveTo(w/2,d/2,w/2-r,d/2); s.lineTo(-w/2+r,d/2); s.quadraticCurveTo(-w/2,d/2,-w/2,d/2-r); s.lineTo(-w/2,-d/2+r); s.quadraticCurveTo(-w/2,-d/2,-w/2+r,-d/2); };
  rs(sh,W,D,rr); const hole=new THREE.Path(); rs(hole,W-2*rim,D-2*rim,rr-rim*0.5); sh.holes.push(hole);
  const wall=new THREE.ExtrudeGeometry(sh,{depth:H,bevelEnabled:true,bevelThickness:0.0015,bevelSize:0.0015,bevelSegments:2,curveSegments:6}); wall.rotateX(-PI/2);
  mesh(wall,[coping,tile],0,0,0,grp);
  const fl=new THREE.Shape(); rs(fl,W-2*rim,D-2*rim,rr-rim*0.5); const floorG=new THREE.ShapeGeometry(fl); floorG.rotateX(-PI/2);
  const uv=floorG.attributes.uv, P=floorG.attributes.position; for(let i=0;i<P.count;i++) uv.setXY(i,P.getX(i)*8,P.getZ(i)*8);
  mesh(floorG,std('#ffffff',{map:tileTex(),roughness:0.3}),0,0.002,0,grp);
  const wG=new THREE.ShapeGeometry(fl); wG.rotateX(-PI/2); const water=mesh(wG,waterMat(),0,H-0.006,0,grp,false);
  water.material.opacity=0.55; water.material.color.set('#7fd7ff');
  // 사다리
  const ch=metal('#e9edf0',{roughness:0.15});
  for(const z of [-0.016,0.016]) tubeAlong([[W/2-rim-0.01,0.004,z],[W/2-rim-0.008,H+0.012,z],[W/2-rim+0.004,H+0.026,z],[W/2+0.004,H+0.02,z],[W/2+0.006,H-0.005,z]],0.0022,ch,grp,16,6);
  for(let i=1;i<=2;i++) box(0.006,0.0018,0.032,ch,W/2-rim-0.009,i*H/3,0,grp);
  // 떠 있는 분홍 튜브
  const ring=mesh(new THREE.TorusGeometry(0.02,0.008,12,32),plastic('#ff7aa8',{roughness:0.2}),-0.05,H-0.004,0.01,grp); ring.rotation.x=PI/2;
  const drinks=[]; for(const [x,z,h] of [[-0.06,D/2+0.075,PI],[0.04,D/2+0.075,PI],[-0.05,-D/2-0.075,0],[0.05,-D/2-0.075,0],[-W/2-0.075,0,PI/2]]) drinks.push({type:'drink',x,z,h,mouth:[x+Math.sin(h)*0.07,H,z+Math.cos(h)*0.07],pool:true});
  const inst={group:grp,foot:[{x:0,z:0,hw:W/2+0.006,hd:D/2+0.006}],slots:drinks,height:0.05,water:true,dynamic:[ring]};
  // 빠졌을 때: 물 위를 헤엄쳐 사다리로 가서 기어 나온다
  inst.pool={waterY:H-0.006,hw:W/2-rim-0.01,hd:D/2-rim-0.01,
    ladder:polyPath([[W/2-rim-0.022,H-0.008,0,0,1,0],[W/2-rim-0.012,H-0.004,0,-1,0.2,0],[W/2-rim-0.012,H+0.006,0,-1,0.3,0],[W/2-rim+0.002,H+0.012,0,0,1,0],[W/2+0.012,H+0.002,0,1,0.6,0],[W/2+0.016,0.008,0,1,0.2,0],[W/2+0.03,0,0,0,1,0],[W/2+0.11,0,0,0,1,0]])};
  inst.update=(dt,t)=>{ water.material.normalMap.offset.set(t*0.02,-t*0.015); ring.position.y=H-0.004+Math.sin(t*1.7)*0.0015; ring.rotation.z=Math.sin(t*0.3)*0.4; ring.position.x=-0.05+Math.sin(t*0.21)*0.03; };
  return inst;
}

function makeDish(){
  const grp=new THREE.Group(); const R=0.065;
  const pts=[]; for(const [r,y] of [[0,0.002],[R-0.012,0.002],[R-0.004,0.006],[R,0.014],[R+0.003,0.0145],[R+0.002,0.012],[R-0.006,0.004],[R-0.02,0.0]]) pts.push(new THREE.Vector2(r,y));
  mesh(new THREE.LatheGeometry(pts,48),new THREE.MeshPhysicalMaterial({color:'#fdfbf6',roughness:0.18,clearcoat:0.9}),0,0,0,grp);
  mesh(new THREE.TorusGeometry(R+0.0015,0.0012,6,48),std('#7fb3e6'),0,0.0145,0,grp).rotation.x=PI/2;
  // 사과 조각: 반달 모양 쐐기. 윗면은 과육(크림색)에 바깥쪽 둘레만 빨간 껍질, 씨 두 개
  const aTex=ctex(256,256,(g,w,h)=>{ g.fillStyle='#fff1cf'; g.fillRect(0,0,w,h);
    for(let i=0;i<300;i++){ g.fillStyle=`rgba(${230+Math.random()*25|0},${210+Math.random()*30|0},${150+Math.random()*40|0},0.35)`; g.beginPath(); g.arc(Math.random()*w,Math.random()*h,1+Math.random()*2,0,TAU); g.fill(); }
    g.strokeStyle='#d8252f'; g.lineWidth=18; g.beginPath(); g.arc(w/2,h/2,w*0.47,0,TAU); g.stroke(); g.strokeStyle='#ff6b5a'; g.lineWidth=5; g.beginPath(); g.arc(w/2,h/2,w*0.43,0,TAU); g.stroke();
    g.fillStyle='#5a2e14'; for(const a of [-0.25,0.25]){ g.save(); g.translate(w/2+Math.cos(PI/2+a)*w*0.16,h/2+Math.sin(PI/2+a)*h*0.16); g.rotate(a); g.beginPath(); g.ellipse(0,0,7,12,0,0,TAU); g.fill(); g.restore(); } });
  const flesh=std('#ffffff',{map:aTex,roughness:0.45}), skin=std('#e8d8b0',{roughness:0.5});
  for(let i=0;i<3;i++){
    const ws=new THREE.Shape(), A=0.5, Ra=0.036; ws.moveTo(0,0); ws.absarc(0,0,Ra,PI/2-A,PI/2+A,false); ws.lineTo(0,0);
    const g=new THREE.ExtrudeGeometry(ws,{depth:0.014,bevelEnabled:true,bevelThickness:0.002,bevelSize:0.002,bevelSegments:2,curveSegments:16});
    const P=g.attributes.position, uv=g.attributes.uv; for(let k=0;k<P.count;k++) uv.setXY(k,P.getX(k)/(Ra*2)+0.5,P.getY(k)/(Ra*2)+0.5);
    g.translate(0,-0.016,-0.007);
    const m=mesh(g,[flesh,skin],0,0,0,grp); const a=i/3*TAU+0.4; m.rotation.set(-PI/2,0,0); m.position.set(Math.cos(a)*0.022,0.013,Math.sin(a)*0.022); m.rotateZ(-a-PI/2+0.4);
  }
  // 사료 알갱이
  const pm=std('#8a5a2a',{roughness:0.85});
  for(let i=0;i<9;i++){ const a=rand(TAU), r=rand(0.005,0.04); const p=sph(0.006,pm,Math.cos(a)*r,0.009,Math.sin(a)*r,grp,8,6); p.scale.set(1.3,0.7,1); p.rotation.y=rand(TAU); }
  return {group:grp,foot:[{x:0,z:0,r:R+0.004}],slots:ringSlots('eat',R,6,0.012,0.2),height:0.03,food:true};
}
function makeBone(){
  const grp=new THREE.Group(); const f=makeFoodBait(THREE,'bone'); grp.add(f); f.userData.food?.update?.(1,0);
  return {group:grp,foot:[{x:0,z:0,hw:0.085,hd:0.032}],slots:ringSlots('eat',0.06,5,0.012,0.4),height:0.05,food:true};
}
// 콜라: 뒤집어 놓은 병뚜껑에 콜라를 따라 두었다. 옆에 흘린 자국
function makeCola(){
  const grp=new THREE.Group(); const R=0.048;
  const capM=metal('#e8323e',{roughness:0.35,metalness:0.6});
  const pts=[]; for(let i=0;i<=20;i++){ const t=i/20; const r=R+0.004*Math.max(0,Math.cos(t*PI*21*2))*(t<0.95?1:0); pts.push(new THREE.Vector2(r*(1-0.02*t),t*0.026)); }
  pts.push(new THREE.Vector2(R-0.004,0.0265)); pts.push(new THREE.Vector2(R-0.005,0.004));
  const cap=mesh(new THREE.LatheGeometry(pts,64),capM,0,0,0,grp);
  // 주름(톱니) 테두리
  for(let i=0;i<21;i++){ const a=i/21*TAU; const r=box(0.008,0.024,0.006,capM,Math.cos(a)*(R+0.002),0.013,Math.sin(a)*(R+0.002),grp); r.rotation.y=-a; }
  mesh(new THREE.CircleGeometry(R-0.004,40),std('#d7d2c8',{roughness:0.4}),0,0.004,0,grp).rotation.x=-PI/2;
  const cola=new THREE.MeshPhysicalMaterial({color:'#3a1406',roughness:0.05,transmission:0,transparent:true,opacity:0.92,clearcoat:1,clearcoatRoughness:0.02,normalMap:rippleTex(),normalScale:new THREE.Vector2(0.15,0.15)});
  const liquid=mesh(new THREE.CircleGeometry(R-0.005,40),cola,0,0.021,0,grp,false); liquid.rotation.x=-PI/2;
  // 거품 몇 알
  for(let i=0;i<14;i++){ const a=rand(TAU), r=rand(0.01,R-0.008); const b=sph(0.0018+Math.random()*0.002,std('#c89a72',{roughness:0.3,transparent:true,opacity:0.8}),Math.cos(a)*r,0.0215,Math.sin(a)*r,grp,6,4); b.castShadow=false; }
  const spill=ctex(256,256,(g,w,h)=>{ g.fillStyle='rgba(70,26,8,0.55)'; g.beginPath(); for(let i=0;i<=40;i++){ const a=i/40*TAU, r=w*0.36*(1+0.18*Math.sin(a*3)+0.1*Math.sin(a*5)); const x=w/2+Math.cos(a)*r, y=h/2+Math.sin(a)*r*0.7; i?g.lineTo(x,y):g.moveTo(x,y); } g.closePath(); g.fill(); });
  const sp=mesh(new THREE.PlaneGeometry(0.12,0.12),new THREE.MeshPhysicalMaterial({map:spill,transparent:true,depthWrite:false,roughness:0.05,clearcoat:1,polygonOffset:true,polygonOffsetFactor:-2}),0.06,0.0012,0.04,grp,false); sp.rotation.x=-PI/2;
  return {group:grp,foot:[{x:0,z:0,r:R+0.006}],slots:ringSlots('drink',R,5,0.026,0.3),height:0.03,food:true};
}
function makeRice(){
  const grp=new THREE.Group();
  const pts=[]; for(let i=0;i<=12;i++){ const t=i/12; pts.push(new THREE.Vector2(0.022+0.026*Math.sin(t*PI/2),t*0.032)); } pts.push(new THREE.Vector2(0.046,0.033)); for(let i=12;i>=0;i--){ const t=i/12; pts.push(new THREE.Vector2(0.019+0.025*Math.sin(t*PI/2),0.003+t*0.029)); }
  const bowlTex=ctex(256,64,(g,w,h)=>{ g.fillStyle='#ffffff'; g.fillRect(0,0,w,h); g.fillStyle='#2f5ea8'; g.fillRect(0,6,w,4); g.fillRect(0,h-14,w,3); for(let x=8;x<w;x+=32){ g.beginPath(); g.arc(x,h*0.5,6,0,TAU); g.fill(); } });
  mesh(new THREE.LatheGeometry(pts,40),new THREE.MeshPhysicalMaterial({map:bowlTex,roughness:0.2,clearcoat:0.9,side:THREE.DoubleSide}),0,0,0,grp);
  const rice=new THREE.Group(); grp.add(rice); const rm=std('#fffdf7',{roughness:0.55});
  const mound=sph(0.042,rm,0,0.022,0,rice,24,12); mound.scale.y=0.45;
  for(let i=0;i<70;i++){ const a=rand(TAU), r=Math.sqrt(Math.random())*0.038; const y=0.022+0.019*Math.sqrt(Math.max(0,1-(r/0.042)**2)); const g=sph(0.0026,rm,Math.cos(a)*r,y,Math.sin(a)*r,rice,6,4); g.scale.set(1,0.6,2.2); g.rotation.set(rand(TAU),rand(TAU),0); g.castShadow=false; }
  return {group:grp,foot:[{x:0,z:0,r:0.05}],slots:ringSlots('eat',0.04,5,0.03,0.1),height:0.05,food:true};
}

// ══════════════════════════════════════════════════════════════════
// 가전 (눌러서 켜고 끈다)
// ══════════════════════════════════════════════════════════════════
function makeFan(){
  const grp=new THREE.Group(); const body=plastic('#f6f4ef',{roughness:0.3}), acc=plastic('#7fc8ff');
  cyl(0.04,0.044,0.012,body,0,0.006,0,grp,32);
  const btn=cyl(0.008,0.008,0.004,plastic('#ff6f6f'),0.02,0.014,0.02,grp,12);
  cyl(0.008,0.01,0.07,body,0,0.045,0,grp,16);
  const head=new THREE.Group(); head.position.set(0,0.09,0); grp.add(head);
  const motor=mesh(new THREE.CylinderGeometry(0.018,0.02,0.035,24),body,0,0,-0.012,head); motor.rotation.x=PI/2;
  const cage=new THREE.Group(); head.add(cage);
  const wire=metal('#dfe3e6',{roughness:0.3});
  for(const r of [0.02,0.035,0.05]) mesh(new THREE.TorusGeometry(r,0.0012,6,40),wire,0,0,0.012,cage);
  mesh(new THREE.TorusGeometry(0.055,0.003,8,48),acc,0,0,0.006,cage);
  for(let i=0;i<12;i++){ const a=i/12*TAU; const s=mesh(new THREE.CylinderGeometry(0.0008,0.0008,0.055,4),wire,Math.cos(a)*0.0275,Math.sin(a)*0.0275,0.012,cage); s.rotation.z=a-PI/2; }
  const rotor=new THREE.Group(); rotor.position.z=0.004; head.add(rotor);
  const bladeM=new THREE.MeshPhysicalMaterial({color:'#9fd8ff',roughness:0.2,transparent:true,opacity:0.85,side:THREE.DoubleSide,clearcoat:1});
  for(let i=0;i<3;i++){ const sh=new THREE.Shape(); sh.moveTo(0,0.006); sh.bezierCurveTo(0.03,0.01,0.05,0.025,0.042,0.004); sh.bezierCurveTo(0.035,-0.008,0.015,-0.008,0,-0.004); const b=mesh(new THREE.ShapeGeometry(sh),bladeM,0,0,0,rotor); b.rotation.z=i/3*TAU; b.rotation.x=0.25; }
  sph(0.009,acc,0,0,0.005,rotor,12,10);
  const blur=mesh(new THREE.CircleGeometry(0.046,32),new THREE.MeshBasicMaterial({color:'#cdeeff',transparent:true,opacity:0,depthWrite:false}),0,0,0.005,head,false);
  const inst={group:grp,foot:[{x:0,z:0,r:0.045}],slots:[],height:0.15,on:false,toggle:true,dynamic:[btn]};
  let spin=0, spd=0;
  inst.tap=(ctx)=>{ inst.on=!inst.on; ctx?.sfx?.click?.(); };
  inst.update=(dt,t,ctx)=>{ spd=lerp(spd,inst.on?38:0,1-Math.exp(-(inst.on?2.2:1.1)*dt)); spin+=spd*dt; rotor.rotation.z=spin; blur.material.opacity=clamp(spd/38,0,1)*0.45; btn.position.y=inst.on?0.012:0.014; ctx?.sfx?.fan?.(spd/38,inst); };
  inst.field=()=>inst.on&&spd>10?{type:'wind',x:0,z:0.04,h:0,range:0.6,cone:0.55,k:spd/38}:null;
  return inst;
}
function makeLamp(){
  const grp=new THREE.Group(); const body=plastic('#ffb3c9',{roughness:0.3}), white=plastic('#ffffff');
  cyl(0.032,0.036,0.01,body,0,0.005,-0.03,grp,32);
  const a1=tubeAlong([[0,0.01,-0.03],[0,0.08,-0.04],[0,0.13,-0.01],[0,0.14,0.03]],0.004,body,grp,24,8);
  const shade=new THREE.Group(); shade.position.set(0,0.14,0.035); shade.rotation.x=0.7; grp.add(shade);
  mesh(new THREE.CylinderGeometry(0.012,0.03,0.035,32,1,true),new THREE.MeshPhysicalMaterial({color:'#ffb3c9',roughness:0.3,side:THREE.DoubleSide,clearcoat:0.8}),0,-0.012,0,shade);
  const bulb=sph(0.011,new THREE.MeshStandardMaterial({color:'#fffbe8',emissive:'#ffe9a8',emissiveIntensity:0}),0,-0.022,0,shade,14,10); bulb.castShadow=false;
  // 바닥에 떨어지는 빛 웅덩이
  const poolTex=ctex(256,256,(g,w,h)=>{ const gr=g.createRadialGradient(w/2,h/2,0,w/2,h/2,w/2); gr.addColorStop(0,'rgba(255,248,220,1)'); gr.addColorStop(0.55,'rgba(255,240,200,0.55)'); gr.addColorStop(1,'rgba(255,240,200,0)'); g.fillStyle=gr; g.fillRect(0,0,w,h); });
  const pool=mesh(new THREE.PlaneGeometry(0.3,0.3),new THREE.MeshBasicMaterial({map:poolTex,transparent:true,opacity:0,depthWrite:false,blending:THREE.AdditiveBlending}),0,0.0025,0.12,grp,false); pool.rotation.x=-PI/2;
  const cone=mesh(new THREE.ConeGeometry(0.11,0.15,32,1,true),new THREE.MeshBasicMaterial({color:'#fff3cf',transparent:true,opacity:0,depthWrite:false,side:THREE.DoubleSide,blending:THREE.AdditiveBlending}),0,0.07,0.1,grp,false); cone.rotation.x=0.1;
  const inst={group:grp,foot:[{x:0,z:-0.03,r:0.036}],slots:[],height:0.16,on:false,toggle:true};
  let k=0;
  inst.tap=(ctx)=>{ inst.on=!inst.on; ctx?.sfx?.click?.(); };
  inst.update=(dt)=>{ k=lerp(k,inst.on?1:0,1-Math.exp(-10*dt)); bulb.material.emissiveIntensity=k*3; pool.material.opacity=k*0.85; cone.material.opacity=k*0.07; };
  inst.field=()=>inst.on&&k>0.5?{type:'light',x:0,z:0.12,r:0.12}:null;
  return inst;
}

// ══════════════════════════════════════════════════════════════════
// 목록
// ══════════════════════════════════════════════════════════════════
export const PROP_CATS=[['hide','숨을 곳'],['ride','놀이기구'],['food','먹이·물'],['appliance','가전']];
export const PROPS={
  box:{label:'바퀴박스',cat:'hide',make:makeBox,max:2,sound:'cardboard'},
  apt:{label:'골판지 아파트',cat:'hide',make:makeApartment,max:1,sound:'cardboard'},
  eggs:{label:'계란판',cat:'hide',make:makeEggs,max:2,sound:'cardboard'},
  tube:{label:'휴지심',cat:'hide',make:makeTube,max:2,sound:'cardboard'},
  matchbox:{label:'성냥갑 침대',cat:'hide',make:makeMatchbox,max:2,sound:'cardboard'},
  house:{label:'인형집',cat:'hide',make:makeHouse,max:1,sound:'plastic'},
  sofa:{label:'소파',cat:'hide',make:makeSofa,max:1,sound:'soft'},
  ferris:{label:'관람차',cat:'ride',make:makeFerris,max:1,sound:'plastic'},
  teacups:{label:'커피잔',cat:'ride',make:makeTeacups,max:1,sound:'plastic'},
  wheel:{label:'쳇바퀴',cat:'ride',make:makeWheel,max:1,sound:'plastic'},
  coaster:{label:'롤러코스터',cat:'ride',make:makeCoaster,max:1,sound:'plastic'},
  slide:{label:'미끄럼틀',cat:'ride',make:makeSlide,max:1,sound:'plastic'},
  climb:{label:'클라이밍 벽',cat:'ride',make:makeClimbWall,max:1,sound:'wood'},
  fountain:{label:'분수',cat:'food',make:makeFountain,max:1,sound:'ceramic'},
  pool:{label:'수영장',cat:'food',make:makePool,max:1,sound:'plastic'},
  dish:{label:'먹이 접시',cat:'food',make:makeDish,max:2,sound:'ceramic'},
  bone:{label:'닭뼈',cat:'food',make:makeBone,max:1,sound:'soft'},
  cola:{label:'콜라',cat:'food',make:makeCola,max:1,sound:'can'},
  rice:{label:'밥',cat:'food',make:makeRice,max:1,sound:'ceramic'},
  fan:{label:'선풍기',cat:'appliance',make:makeFan,max:1,sound:'plastic'},
  lamp:{label:'스탠드',cat:'appliance',make:makeLamp,max:1,sound:'plastic'},
};
