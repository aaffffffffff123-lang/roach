// slime-mode.js — 1라운드 「슬라임」 아이템과 바뿌볼 화면 연결 (index.html에서 불러 쓴다)
// 족집게와 같은 방식: 게임 창의 three.js로 공을 만들어 게임 장면에 넣고, 입력은 게임 Input 앞에서 가로챈다.
import {BappuBall,extractRoachGeos,bakeRoachPose,ROACH_COUNT,FLOOR} from './bappu-ball.js';

const R=0.25;                    // 공 반지름(게임 단위). 바퀴 길이 0.148의 3.4배 → 지름 12cm쯤
const CONTACT=0.62;              // 바닥에 닿는 면 반지름 (R 배수)
const clamp=(v,a=0,b=1)=>Math.max(a,Math.min(b,v));
const lerp=(a,b,t)=>a+(b-a)*t;
const ease=t=>t*t*(3-2*t);
const PI=Math.PI, TAU=PI*2;

export function createSlimeMode({gameFrame}){
  let env=null;                  // {G,gameWindow,THREE,GSFX}
  let ball=null, geos=null, mats=null;
  let count=0, complete=false, cardOpen=false, hintShown=false;
  let hand=null;                 // 손에 든 슬라임: 내려오는 중 / 바닥 / 들어 올리는 중
  const caps=[];                 // 붙는 중인 바퀴
  let labOpen=false, labState='none', labPendingOpen=false, labEntered=false, pausedBefore=false, closeBusy=false, cardPaused=false;
  let wrapped=null;              // 이 게임 창에 걸어 둔 래퍼 (중복 방지)
  let roachPayload=null;         // 완성된 공의 바퀴 목록 (실험실로 보냄)
  const TMP={};

  // ───────── 겉면: 레이어·버튼·완성 카드 ─────────
  const style=document.createElement('style');
  style.textContent=`
#slimeLayer{position:fixed;inset:0;z-index:20;background:#e9e0d0;opacity:0;visibility:hidden;pointer-events:none;transition:opacity .22s ease-out,visibility 0s linear .22s}
#slimeLayer.open{opacity:1;visibility:visible;pointer-events:auto;transition:opacity .22s ease-out}
#slimeFrame{position:absolute;inset:0;display:block;width:100%;height:100%;border:0;background:#e9e0d0}
#slimeBack{position:absolute;z-index:3;left:calc(12px + env(safe-area-inset-left));top:calc(12px + env(safe-area-inset-top));min-width:44px;height:44px;padding:0 15px;border:0;border-radius:999px;background:rgba(248,240,220,.94);color:#302017;font:900 13px/1 system-ui,"Apple SD Gothic Neo","Malgun Gothic",sans-serif;box-shadow:0 2px 0 rgba(114,76,43,.7),0 7px 20px rgba(0,0,0,.3);-webkit-tap-highlight-color:transparent;touch-action:manipulation}
#slimeBack:active{transform:translateY(2px)}
#slimeDone{position:fixed;inset:0;z-index:30;display:grid;place-items:center;padding:24px;background:rgba(20,14,11,.18);backdrop-filter:blur(2px);opacity:0;visibility:hidden;pointer-events:none;transition:opacity .28s ease-out,visibility 0s linear .28s}
#slimeDone.show{opacity:1;visibility:visible;pointer-events:auto;transition:opacity .28s ease-out}
#slimeDone .card{width:min(300px,86vw);padding:24px 22px 20px;border-radius:24px;background:rgba(248,240,220,.98);box-shadow:0 4px 0 #9b7648,0 20px 54px rgba(0,0,0,.35);text-align:center;transform:translateY(12px) scale(.96);transition:transform .32s cubic-bezier(.2,1.4,.4,1)}
#slimeDone.show .card{transform:none}
#slimeDone h1{margin:0 0 16px;color:#302017;font:800 30px/1.2 "Apple SD Gothic Neo","Malgun Gothic","Noto Sans KR",system-ui,sans-serif;letter-spacing:-.04em}
#slimeDone button{width:100%;padding:14px 22px;border:0;border-radius:999px;background:#302017;color:#f8f0dc;font:900 15px/1 system-ui,"Apple SD Gothic Neo","Malgun Gothic",sans-serif;box-shadow:0 3px 0 #090504;-webkit-tap-highlight-color:transparent;touch-action:manipulation}
#slimeDone button:active{transform:translateY(2px);box-shadow:0 1px 0 #090504}
`;
  document.head.appendChild(style);
  const layer=document.createElement('div'); layer.id='slimeLayer'; layer.setAttribute('aria-hidden','true');
  layer.innerHTML=`<iframe id="slimeFrame" title="바뿌볼" allow="autoplay"></iframe><button id="slimeBack" type="button" aria-label="게임으로 돌아가기">돌아가기</button>`;
  document.body.appendChild(layer);
  const frame=layer.querySelector('#slimeFrame'), back=layer.querySelector('#slimeBack');
  const card=document.createElement('div'); card.id='slimeDone'; card.setAttribute('aria-hidden','true');
  card.innerHTML=`<div class="card"><h1>바뿌볼 완성~</h1><button type="button" id="slimePlay">가지고 놀기</button></div>`;
  document.body.appendChild(card);
  const playBtn=card.querySelector('#slimePlay');
  back.addEventListener('pointerdown',e=>{ e.preventDefault(); e.stopPropagation(); closeLab(); });
  playBtn.addEventListener('click',e=>{ e.preventDefault(); hideCard(); openLab(); });
  window.addEventListener('keydown',e=>{ if(e.code==='Escape'&&labOpen){ e.preventDefault(); closeLab(); } });
  window.addEventListener('message',e=>{
    if(e.source!==frame.contentWindow)return;
    if(e.data?.type==='slime-lab-ready'){ labState='ready'; if(labPendingOpen){ labPendingOpen=false; enterLab(); } else { try{labApi()?.sleep?.();}catch(err){} } }
    if(e.data?.type==='slime-lab-close')closeLab();
  });

  const labApi=()=>{ try{return frame.contentWindow?.SlimeLab||null;}catch(err){return null;} };
  function preloadLab(){ if(labState!=='none')return; labState='loading'; frame.src='slime-lab.html?embed=1'; }
  function enterLab(){
    const L=labApi(); if(!L)return;
    try{ if(!labEntered){ L.enter({geos:env?geos:null,roaches:roachPayload}); labEntered=true; } else L.wake(); }catch(err){ console.error(err); }
  }
  function openLab(){
    if(labOpen||!env)return;
    const {G}=env; labOpen=true; closeBusy=false;
    cancelHand(true);
    pausedBefore=!!G.paused; G.paused=true; G.sleep=true;
    G.r1.cancel?.(); G.input.reset?.();
    if(ball)ball.group.visible=false;
    layer.classList.add('open'); layer.setAttribute('aria-hidden','false'); gameFrame.classList.add('covered');
    preloadLab();
    if(labState==='ready')enterLab(); else labPendingOpen=true;
  }
  function closeLab(){
    if(!labOpen||closeBusy)return;
    closeBusy=true; labPendingOpen=false;
    try{labApi()?.sleep?.();}catch(err){}
    layer.classList.remove('open'); layer.setAttribute('aria-hidden','true'); gameFrame.classList.remove('covered');
    labOpen=false;
    if(env){ const {G}=env; G.sleep=false; G.paused=pausedBefore; G.r1.touch?.(); G.input.reset?.(); }
    setTimeout(()=>{closeBusy=false;},160);
  }
  function showCard(){ if(cardOpen||!env)return; cardOpen=true; const {G}=env; cardPaused=!!G.paused; G.paused=true; G.r1.cancel?.(); G.input.reset?.(); card.classList.add('show'); card.setAttribute('aria-hidden','false'); }
  function hideCard(){ if(!cardOpen)return; cardOpen=false; card.classList.remove('show'); card.setAttribute('aria-hidden','true'); if(env){ env.G.paused=cardPaused; } }

  // ───────── 게임 쪽 칸 ─────────
  function addSlot(){
    const {G,gameWindow}=env, doc=gameWindow.document;
    if(doc.getElementById('slime-slot'))return;
    if(!doc.getElementById('slime-slot-style')){
      const st=doc.createElement('style'); st.id='slime-slot-style';
      st.textContent=`#slime-slot{display:flex;flex-direction:column;align-items:center;justify-content:center;line-height:1.05}#slime-slot .ct{font-size:9px;font-weight:800;opacity:.72;margin-top:2px;letter-spacing:0}#slime-slot.complete{background:#9fdccd;color:#17372f;box-shadow:0 2px 0 #4f9f8c,0 4px 10px rgba(40,95,82,.35)}#slime-slot.complete.sel{background:#17372f;color:#dcfff6}`;
      doc.head.appendChild(st);
    }
    const slot=doc.createElement('div'); slot.id='slime-slot'; slot.className='slot';
    slot.innerHTML=`<span class="nm">슬라임</span><small class="ct">0/${ROACH_COUNT}</small>`;
    slot.addEventListener('pointerdown',e=>{ e.stopPropagation(); e.preventDefault(); env.GSFX?.ensure?.(); select(); });
    const col=doc.getElementById('wcol'), after=doc.getElementById('tweezer-slot')||G.ui.slotEls.hand;
    col.insertBefore(slot,after?.nextSibling||col.firstChild);
    G.ui.slotEls.slime=slot;
    updateSlot();
  }
  function updateSlot(){
    const slot=env?.G?.ui?.slotEls?.slime; if(!slot)return;
    slot.querySelector('.nm').textContent=complete?'바뿌볼':'슬라임';
    const ct=slot.querySelector('.ct'); ct.textContent=`${count}/${ROACH_COUNT}`; ct.style.display=complete?'none':'';
    slot.classList.toggle('complete',complete);
  }
  function select(){
    const {G}=env; if(!G||G.state!=='r1'||labOpen||cardOpen)return;
    if(complete){ if(hand)return; openLab(); return; }
    G.r1.cancel?.(); G.r1.selectItem('slime');
    ensureBall(); preloadLab();
    if(!hintShown){ hintShown=true; G.ui.hint?.('살아 있는 바퀴벌레 위에 눌러 붙이거나, 누른 채 끌어서 굴립니다.',2.4,0,true); }
  }

  // ───────── 공 만들기 (게임 바퀴 모델을 그대로 가져온다) ─────────
  function ensureBall(){
    if(ball)return true;
    const {G,THREE}=env;
    const src=G.r1.roaches.find(r=>r?.m?.parts?.body?.geometry?.attributes?.color);
    if(!src)return false;
    try{ geos=extractRoachGeos(THREE,src.m); }catch(err){ console.error(err); return false; }
    mats={shell:src.m.parts.body.material,limb:src.m.parts.legs[0].fem.children[0].material};
    ball=new BappuBall(THREE,{geos,radius:R,roachScale:0.13/R,segments:[36,24],crumbSize:0.05,materials:mats});
    ball.lift=1; ball.group.visible=false; ball.group.renderOrder=5;
    G.r1.grp.add(ball.group);
    TMP.p=new THREE.Vector3(); TMP.n=new THREE.Vector3(); TMP.f=new THREE.Vector3(); TMP.x=new THREE.Vector3(); TMP.q=new THREE.Quaternion(); TMP.m=new THREE.Matrix4(); TMP.d=new THREE.Vector3(); TMP.s=new THREE.Vector3();
    return true;
  }

  // ───────── 소리 (게임 효과음 엔진) ─────────
  const sfx={
    land(){ const S=env?.GSFX; if(!S?.ctx)return; S.noise({dur:0.12,gain:0.22,type:'lowpass',freq:420,freqEnd:130,att:0.012}); S.noise({t:0.02,dur:0.06,gain:0.08,freq:900,q:3,freqEnd:300,att:0.01}); S.tone({t:0.004,dur:0.08,gain:0.1,freq:76,freqEnd:48,type:'sine'}); },
    stick(n){ const S=env?.GSFX; if(!S?.ctx)return; S.noise({dur:0.07,gain:0.14+n*0.03,freq:700,q:1.2,freqEnd:260,att:0.008}); for(let i=0;i<2+n;i++){ const f=300+Math.random()*500; S.tone({t:0.02+i*0.035,dur:0.035,gain:0.035,freq:f,freqEnd:f*1.6,type:'sine',att:0.004}); } },
    peel(k){ const S=env?.GSFX; if(!S?.ctx)return; S.noise({dur:0.16,gain:0.13+k*0.08,freq:520,q:1.6,freqEnd:1400,att:0.03}); S.noise({t:0.05,dur:0.09,gain:0.07,type:'lowpass',freq:380,freqEnd:160,att:0.02}); for(let i=0;i<3;i++){ const f=350+Math.random()*450; S.tone({t:0.04+i*0.04,dur:0.03,gain:0.03,freq:f,freqEnd:f*1.8,type:'sine',att:0.004}); } },
    roll(){ const S=env?.GSFX; if(!S?.ctx)return; S.noise({dur:0.05,gain:0.05,type:'lowpass',freq:300,freqEnd:180,att:0.01}); },
  };

  // ───────── 찍기·굴리기 ─────────
  function screenDownDir(){ const {G,THREE}=env; return TMP.d.copy(G.camUp).negate(); } // 화면 아래쪽(플레이어 몸쪽)
  function beginPress(x,y,id){
    const {G}=env; if(hand||!ensureBall())return;
    const p=G.r1.floorPoint(x,y); if(!p)return;
    env.GSFX?.ensure?.();
    hand={x:p.x,z:p.z,fx:p.x,fz:p.z,h:1,phase:'drop',t:0,pid:id,stuck:0,lastStick:0,moved:0,sinceRoll:0};
    ball.cleanestDir(TMP.n); ball.faceDown(TMP.n);
    ball.lift=1; ball.squat=0; ball.dents.length=0; ball.wob.v=ball.wob.vel=0; ball.spreadV=0; ball.fade=1;
    ball.group.visible=true; placeBall();
    G.r1.used?.add('slime'); G.r1.touch?.();
  }
  function moveHand(x,y,id){ if(!hand||hand.pid!==id)return; const p=env.G.r1.floorPoint(x,y); if(!p)return; hand.fx=p.x; hand.fz=p.z; env.G.r1.touch?.(); }
  function releaseHand(id){ if(!hand||(id!=null&&hand.pid!=null&&id!==hand.pid))return; startLift(); }
  function startLift(){
    if(!hand||hand.phase==='lift')return;
    const k=hand.phase==='down'?1:0.4;
    hand.phase='lift'; hand.t=0; hand.liftX=hand.x; hand.liftZ=hand.z;
    ball.release('hand'); ball.kick(0.9*k);
    if(hand.stuck>0)sfx.peel(Math.min(1,hand.stuck*0.4)); else sfx.peel(0.2);
  }
  function cancelHand(instant){
    if(!hand)return;
    if(instant){ hand=null; if(ball){ ball.group.visible=false; ball.lift=1; ball.dents.length=0; } finishAllCaps(); }
    else startLift();
  }
  function placeBall(){
    const {G}=env; const lift=hand?hand.h:1;
    ball.lift=lift;
    let x=hand.x, z=hand.z, y=R*(FLOOR+0.04*ball.squat)*(1-lift)+R*FLOOR*lift+lift*R*0.55+0.003;
    if(hand.phase==='lift'){ const k=clamp(hand.t/0.42); const d=screenDownDir(); x+=d.x*k*k*3.6; z+=d.z*k*k*3.6; }
    ball.group.position.set(x,y,z);
  }
  /** 바닥에 닿아 있는 동안: 손가락 따라 미끄러지며 구르고, 밑에 깔린 산 바퀴가 붙는다 */
  function updateDown(dt){
    const {G}=env;
    const dx=hand.fx-hand.x, dz=hand.fz-hand.z, dist=Math.hypot(dx,dz);
    const k=1-Math.exp(-15*dt);
    const mx=dx*k, mz=dz*k;
    if(Math.hypot(mx,mz)>1e-5){ hand.x+=mx; hand.z+=mz; ball.roll(mx,mz); hand.moved+=Math.hypot(mx,mz); hand.sinceRoll+=Math.hypot(mx,mz); if(hand.sinceRoll>0.22){ hand.sinceRoll=0; sfx.roll(); } }
    ball.squat=Math.min(1,ball.squat+dt*0.3);
    // 손가락이 위에서 누르는 자국
    const d=ball.dent('hand'); if(d){ d.target=0.5+Math.min(0.3,dist*1.2); }
    // 붙이기
    const now=performance.now()/1000;
    const rolling=hand.moved>0.02;
    const capPerPress=rolling?999:4, gap=rolling?0.07:0;
    if(hand.stuck<capPerPress&&now-hand.lastStick>=gap&&count+caps.length<ROACH_COUNT){
      let best=null,bd=1e9;
      for(const r of G.r1.roaches){
        if(!r||r.gone||r.state==='dead'||r.dead>0||!r.m?.g?.visible)continue;
        if(G.r1.underCushion?.(r.x,r.z))continue;
        const dd=Math.hypot(r.x-hand.x,r.z-hand.z); if(dd<=R*CONTACT&&dd<bd){bd=dd;best=r;}
      }
      if(best){ stick(best); hand.stuck++; hand.lastStick=now; }
    }
  }
  /** 바퀴 한 마리가 슬라임 바닥에 눌려 붙는다 */
  function stick(r){
    const {G,THREE}=env;
    // 닿은 자리 방향 → 공 로컬에서 가장 가까운 빈 자리
    const dirW=TMP.d.set(r.x-hand.x,-0.6*R,r.z-hand.z).normalize();
    const local=TMP.s.copy(dirW); ball.worldDirToLocal(local,local);
    const a=ball.nearestFreeAnchor(local); if(a<0)return;
    const idx=count+caps.length; if(idx>=ROACH_COUNT)return;
    const i=G.r1.roaches.indexOf(r); if(i>=0)G.r1.roaches.splice(i,1);
    r.gone=true; r.captured=true;
    // 바닥에서의 머리 방향을 그대로 유지한 채 붙는다
    const t1=TMP.p.copy(ball.anchorT1[a]).applyQuaternion(ball.rollQ), t2=TMP.n.copy(ball.anchorT2[a]).applyQuaternion(ball.rollQ);
    const hd=TMP.f.set(Math.sin(r.h||0),0,Math.cos(r.h||0));
    const spin=Math.atan2(hd.dot(t2),hd.dot(t1));
    ball.anchorUsed[a]=1;                               // 자리를 먼저 잡아 둔다 (붙는 동안 다른 놈이 못 쓰게)
    const g=r.m.g; g.updateMatrixWorld(true);
    caps.push({r,m:r.m,g,idx,anchor:a,spin,t:0,p0:g.position.clone(),q0:g.quaternion.clone(),done:false});
    sfx.stick(1);
  }
  const _pq=[];
  function updateCaps(dt){
    const {G,THREE}=env;
    for(let i=caps.length-1;i>=0;i--){
      const c=caps[i]; c.t+=dt;
      const ballGone=!hand||!ball.group.visible;
      if(c.t<0.14&&!ballGone){ // 눌린다
        c.m.pose(0,dt,Math.min(0.85,c.t/0.14*0.85));
        continue;
      }
      const k=ballGone?1:ease(clamp((c.t-0.14)/0.36));
      // 붙는 자리의 현재 월드 위치·방향 (공이 구르고 출렁이는 대로 따라간다)
      ball.anchorFrame(c.anchor,c.spin,TMP.p,TMP.n,TMP.f);
      const pw=TMP.p.multiplyScalar(R).add(ball.group.position);
      TMP.x.crossVectors(TMP.n,TMP.f).normalize();
      TMP.m.makeBasis(TMP.x,TMP.n,TMP.f); TMP.q.setFromRotationMatrix(TMP.m);
      c.m.pose(0,dt,0.85*(1-k));                       // pose가 scale을 다시 쓰므로 먼저 부른다
      c.g.position.lerpVectors(c.p0,pw,k);
      c.g.quaternion.slerpQuaternions(c.q0,TMP.q,k);
      const L=0.13, st=Math.sin(PI*k);
      c.g.scale.set(L*(1-0.12*st),L*(1+0.45*st),L*(1-0.05*st));
      if(k>=1)finishCap(c,i);
    }
  }
  function finishCap(c,i){
    const {G}=env;
    caps.splice(i,1);
    c.m.pose(0,0,0); c.g.scale.setScalar(0.13);
    const pose=bakeRoachPose(c.m);
    c.g.visible=false; G.r1.grp.remove(c.g);
    ball.anchorUsed[c.anchor]=0; ball.attach(c.idx,c.anchor,c.spin,pose);
    count++; updateSlot();
    if(count>=ROACH_COUNT&&!complete){ complete=true; updateSlot(); buildPayload(); }
  }
  function finishAllCaps(){ for(let i=caps.length-1;i>=0;i--)finishCap(caps[i],i); }
  function buildPayload(){ roachPayload=ball.roaches.map(r=>r.used?{anchor:r.anchor,spin:r.spin,legs:Array.from(r.legs),antPhase:r.antPhase}:null); }

  function update(dt){
    if(!ball)return;
    if(hand){
      hand.t+=dt;
      if(hand.phase==='drop'){
        const k=Math.min(1,hand.t/0.15); hand.h=1-ease(k); placeBall();
        if(k>=1){ hand.phase='down'; hand.t=0; hand.h=0; ball.kick(1.3); ball.press('hand',TMP.d.set(0,1,0),{depth:0.55,width:0.55}); sfx.land(); placeBall(); }
      }else if(hand.phase==='down'){ updateDown(dt); placeBall(); }
      else if(hand.phase==='lift'){
        const k=clamp(hand.t/0.42); hand.h=ease(k); hand.x=hand.liftX; hand.z=hand.liftZ; placeBall();
        ball.fade=1-ease(clamp((k-0.55)/0.45));
        if(k>=1){ hand=null; ball.group.visible=false; ball.lift=1; ball.fade=1; finishAllCaps(); if(complete&&!cardOpen)showCard(); }
      }
      if(ball.group.visible){ ball.dirty=true; ball.update(dt); }
    }
    updateCaps(dt);
  }

  // ───────── 게임 창에 걸기 ─────────
  function install(e){
    env=e; const {G,gameWindow}=env;
    if(wrapped===G)return; wrapped=G;
    ball=null; geos=null; hand=null; caps.length=0; count=0; complete=false; roachPayload=null; hintShown=false;
    addSlot();
    const isSlime=()=>G.state==='r1'&&G.r1.item==='slime'&&!labOpen&&!cardOpen;
    const origUpdate=G.r1.update.bind(G.r1);
    G.r1.update=function(dt){
      if(this.item!=='slime'&&!hand&&!caps.length) return origUpdate(dt);
      const mouse=this.G.input?.mouse, oldLive=mouse?.live, saved=this.item;
      if(saved==='slime'){ this.item='hand'; if(mouse)mouse.live=false; }
      try{ return origUpdate(dt); }
      finally{ this.item=saved; if(mouse)mouse.live=oldLive; if(saved==='slime'&&this.itemMeshes?.hand)this.itemMeshes.hand.visible=false; if(!this.G.paused)update(dt); }
    };
    const origSelect=G.r1.selectItem.bind(G.r1);
    G.r1.selectItem=function(kind){ const out=origSelect(kind); if(kind!=='slime'&&hand)startLift(); return out; };
    const origStop=G.r1.stop.bind(G.r1);
    G.r1.stop=function(){ if(hand){ hand=null; } for(const c of caps){ c.g.visible=false; } caps.length=0; if(ball)ball.group.visible=false; return origStop(); };
    // 「처음부터」(G.restartAll → r1.start)로 새 판을 시작하면 슬라임 진행도 처음으로
    const origStart=G.r1.start.bind(G.r1);
    G.r1.start=function(){ newGame(); return origStart(); };
    const oP=G.input.onPress, oD=G.input.onDrag, oR=G.input.onRelease, oC=G.input.onCancel;
    G.input.onPress=(x,y,type,id)=>{ if(isSlime()){ if(complete){ if(!hand)openLab(); return; } beginPress(x,y,id); return; } oP?.(x,y,type,id); };
    G.input.onDrag=(x,y,id)=>{ if(isSlime()||hand){ moveHand(x,y,id); return; } oD?.(x,y,id); };
    G.input.onRelease=(id)=>{ if(hand){ releaseHand(id); return; } if(isSlime())return; oR?.(id); };
    G.input.onCancel=()=>{ if(hand){ startLift(); return; } if(isSlime())return; oC?.(); };
    gameWindow.addEventListener('blur',()=>{ if(hand)startLift(); });
  }
  /** 같은 창에서 새 판 시작 (처음부터) */
  function newGame(){
    hand=null; for(const c of caps){ c.g.visible=false; } caps.length=0; count=0; complete=false; roachPayload=null; hintShown=false;
    if(ball){ ball.reset(); ball.lift=1; ball.group.visible=false; }
    hideCard();
    if(labOpen){ try{labApi()?.sleep?.();}catch(err){} layer.classList.remove('open'); layer.setAttribute('aria-hidden','true'); gameFrame.classList.remove('covered'); labOpen=false; closeBusy=false; }
    labPendingOpen=false; labEntered=false;
    if(labState==='ready'){ try{labApi()?.reset?.();}catch(err){} }
    updateSlot();
  }
  /** 게임을 새로 시작할 때 (gameFrame이 다시 로드될 때) */
  function reset(){
    hand=null; caps.length=0; count=0; complete=false; roachPayload=null; ball=null; geos=null; mats=null; wrapped=null; hintShown=false;
    hideCard();
    if(labOpen){ try{labApi()?.sleep?.();}catch(err){} layer.classList.remove('open'); layer.setAttribute('aria-hidden','true'); gameFrame.classList.remove('covered'); labOpen=false; closeBusy=false; }
    labPendingOpen=false; labEntered=false;
    if(labState==='ready'){ try{labApi()?.reset?.();}catch(err){} }
  }
  return {install,reset,isOpen:()=>labOpen||cardOpen,select,get count(){return count;},get complete(){return complete;},
    // 디버그·테스트용
    _debug:{get ball(){return ball;},get hand(){return hand;},get caps(){return caps;},openLab,closeLab,get labState(){return labState;},labApi,
      forceComplete(){ if(!env||!ensureBall())return false; const {G}=env; while(count<ROACH_COUNT){ const r=G.r1.roaches.find(r=>r&&!r.gone&&r.state!=='dead'); if(!r)break; const a=ball.nearestFreeAnchor(ball.anchorDir[count%ROACH_COUNT]); if(a<0)break; const i=G.r1.roaches.indexOf(r); G.r1.roaches.splice(i,1); r.gone=true; r.m.pose(0,0,0); const pose=bakeRoachPose(r.m); r.m.g.visible=false; G.r1.grp.remove(r.m.g); ball.attach(count,a,Math.random()*TAU,pose); count++; G.r1.spawn?.(); } updateSlot(); if(count>=ROACH_COUNT){ complete=true; updateSlot(); buildPayload(); if(!hand)showCard(); } return count; }}};
}
