// care-mode.js — 1라운드 「구급상자」: 바닥에 깔린 바퀴벌레 시체를 족집게로 집어 와 간병 화면(care-room.html)에 눕힌다 (index.html에서 불러 쓴다)
// 시체 모양(짜부된 몸통·진물·다리 여섯 개 자리)은 게임이 바닥에 깔아 둔 그대로 넘긴다.
// 집어 간 시체는 바닥에서 없어지고 돌아오지 않는다. 바닥에 밴 진물 자국은 그대로 남는다.
// 족집게처럼: 게임 창의 three.js로 족집게를 만들어 게임 장면에 넣고, 입력은 게임 Input 앞에서 가로챈다.

const clamp=(v,a=0,b=1)=>Math.max(a,Math.min(b,v));
const lerp=(a,b,t)=>a+(b-a)*t;
const ease=t=>t*t*(3-2*t);

// 0 ~ .14초: 집게가 벌어진 채 내려온다 / .14 ~ .24초: 딸깍 집는다 / .24 ~ .86초: 바닥에서 떼어 들어 올린다
const CAP_DOWN=.14, CAP_GRIP=.24, CAP_LIFT=.86;

export function createCareMode({gameFrame,isBlocked=()=>false}){
  let env=null;               // {G,gameWindow,THREE,GSFX}
  let wrapped=null;           // 이 게임 창에 걸어 둔 래퍼 (중복 방지)
  let rig=null;               // 족집게 (게임 장면 안)
  let cap=null;               // 집어 드는 중인 시체
  let lastPointer=null, hintShown=false;
  let open=false, roomState='none', pendingOpen=false, pausedBefore=false, closeBusy=false;

  // ───────── 겉면: 레이어 · 돌아가기 ─────────
  const style=document.createElement('style');
  style.textContent=`
#careLayer{position:fixed;inset:0;z-index:20;background:#efe6d6;opacity:0;visibility:hidden;pointer-events:none;transition:opacity .22s ease-out,visibility 0s linear .22s}
#careLayer.open{opacity:1;visibility:visible;pointer-events:auto;transition:opacity .22s ease-out}
#careFrame{position:absolute;inset:0;display:block;width:100%;height:100%;border:0;background:#efe6d6}
#careBack{position:absolute;z-index:3;left:calc(12px + env(safe-area-inset-left));top:calc(12px + env(safe-area-inset-top));min-width:44px;height:44px;padding:0 15px;border:0;border-radius:999px;background:rgba(248,240,220,.94);color:#302017;font:900 13px/1 system-ui,"Apple SD Gothic Neo","Malgun Gothic",sans-serif;box-shadow:0 2px 0 rgba(114,76,43,.7),0 7px 20px rgba(0,0,0,.3);-webkit-tap-highlight-color:transparent;touch-action:manipulation}
#careBack:active{transform:translateY(2px)}
`;
  document.head.appendChild(style);
  const layer=document.createElement('div'); layer.id='careLayer'; layer.setAttribute('aria-hidden','true');
  layer.innerHTML='<iframe id="careFrame" title="간병" allow="autoplay"></iframe><button id="careBack" type="button" aria-label="게임으로 돌아가기">돌아가기</button>';
  document.body.appendChild(layer);
  const frame=layer.querySelector('#careFrame'), back=layer.querySelector('#careBack');
  back.addEventListener('pointerdown',e=>{ e.preventDefault(); e.stopPropagation(); close(); });
  window.addEventListener('keydown',e=>{ if(e.code==='Escape'&&open){ e.preventDefault(); close(); } });
  window.addEventListener('message',e=>{
    if(e.source!==frame.contentWindow) return;
    if(e.data?.type==='care-room-ready'){
      roomState='ready';
      if(pendingOpen&&cap&&cap.t>=CAP_LIFT){ pendingOpen=false; finishCapture(); }
      else if(!open){ try{ room()?.sleep?.(); }catch(err){} }
    }
    if(e.data?.type==='care-room-close') close();
  });
  const room=()=>{ try{ return frame.contentWindow?.CareRoom||null; }catch(err){ return null; } };
  // 처음 구급상자를 고를 때 한 번만 불러 두고 재운다 (집을 때마다 불러오면 로딩 공백이 생긴다)
  function preload(){ if(roomState!=='none') return; roomState='loading'; frame.src='care-room.html?embed=1'; }

  // ───────── 소리 (게임 효과음 엔진을 빌려 쓴다) ─────────
  const sfx={
    grip(){ const S=env?.GSFX; if(!S?.ctx) return; S.noise({dur:.012,gain:.5,freq:5600,q:2.2}); S.tone({dur:.035,gain:.14,freq:2900,freqEnd:1700,type:'square'}); S.noise({t:.012,dur:.06,gain:.38,freq:1500,q:1.1,freqEnd:520}); },
    miss(){ const S=env?.GSFX; if(!S?.ctx) return; S.noise({dur:.01,gain:.5,freq:5200,q:2}); },
    // 바닥에 들러붙은 시체가 떨어지는 소리: 진물이 쩍 하고 늘어났다 떨어진다
    peel(wet){ const S=env?.GSFX; if(!S?.ctx) return;
      S.noise({dur:.11,gain:.34+.28*wet,type:'lowpass',freq:900,freqEnd:260,q:2.6,att:.006});
      S.noise({t:.04,dur:.07,gain:.14+.16*wet,freq:2600,q:1.4,freqEnd:900,att:.004});
      if(wet>.2) S.tone({t:.09,dur:.04,gain:.1*wet,freq:420,freqEnd:950,type:'sine',att:.003}); },
    lift(){ const S=env?.GSFX; if(!S?.ctx) return; S.noise({dur:.18,gain:.18,freq:700,q:.9,freqEnd:2400}); },
  };

  // ───────── 족집게 모델 (게임 창 three.js로 만든다) ─────────
  function makeRig(){
    const {THREE}=env;
    const steel=new THREE.MeshStandardMaterial({color:0xc6cbcf,roughness:.28,metalness:.5});
    const dark=new THREE.MeshStandardMaterial({color:0x7d8388,roughness:.28,metalness:.5});
    const root=new THREE.Group(); root.name='care-tweezer'; root.rotation.order='YXZ';
    const arms=[];
    for(const side of [-1,1]){
      const jaw=new THREE.Group(); jaw.position.x=side*.024;
      const arm=new THREE.Mesh(new THREE.BoxGeometry(.018,.012,.36),steel); arm.position.z=.05; arm.rotation.y=-side*.035; jaw.add(arm);
      const tip=new THREE.Mesh(new THREE.BoxGeometry(.01,.011,.105),dark); tip.position.set(-side*.006,-.002,-.176); tip.rotation.y=side*.08; jaw.add(tip);
      const grip=new THREE.Mesh(new THREE.BoxGeometry(.02,.014,.09),dark); grip.position.set(side*.001,.001,.12); jaw.add(grip);
      root.add(jaw); arms.push(jaw);
    }
    const bridge=new THREE.Mesh(new THREE.BoxGeometry(.078,.022,.07),dark); bridge.position.z=.245; root.add(bridge);
    root.scale.setScalar(1.25); root.visible=false;
    root.traverse(o=>{ if(o.isMesh){ o.castShadow=true; o.receiveShadow=true; } });
    root.userData.tipLocal=new THREE.Vector3(0,-.003,-.228);
    root.userData.setGrip=v=>{ const gap=.024-clamp(v)*.017; arms[0].position.x=-gap; arms[1].position.x=gap; };
    root.userData.setGrip(0);
    return root;
  }
  function camYaw(){ const up=env.G.camUp||{x:0,z:-1}; return Math.atan2(up.x,up.z); }
  function placeTip(x,y,z,pitch,yaw=camYaw()){
    rig.rotation.set(pitch,yaw,0); rig.updateMatrix();
    const off=rig.userData.tipLocal.clone().multiplyScalar(rig.scale.x).applyQuaternion(rig.quaternion);
    rig.position.set(x-off.x,y-off.y,z-off.z);
  }
  function tipWorld(out){ rig.updateMatrixWorld(true); return rig.localToWorld(out.copy(rig.userData.tipLocal)); }
  function pointRig(sx,sy,visible){
    if(cap||!rig) return;
    const {G}=env;
    if(G.state!=='r1'||G.r1.item!=='kit'||open){ rig.visible=false; return; }
    const p=G.r1.floorPoint(sx,sy); if(!p){ rig.visible=false; return; }
    rig.visible=visible; placeTip(p.x,.05,p.z,-.32);
  }

  // ───────── 시체 고르기 ─────────
  const alive=c=>c&&c.alive&&c.V&&!(env.G.r1.underCushion?.(c.x,c.z));
  function corpseAt(sx,sy,type){
    const {G,gameWindow,THREE}=env;
    const w=gameWindow.innerWidth||gameFrame.clientWidth||innerWidth, h=gameWindow.innerHeight||gameFrame.clientHeight||innerHeight;
    const limit=type==='mouse'?38:56, v=new THREE.Vector3();
    let best=null, bd=limit*limit;
    for(const c of G.corpses?.list||[]){
      if(!alive(c)) continue;
      v.set(c.x,.01,c.z).project(G.camera); if(v.z<-1||v.z>1) continue;
      const d=((v.x*.5+.5)*w-sx)**2+((-v.y*.5+.5)*h-sy)**2;
      if(d<bd){ bd=d; best=c; }
    }
    return best;
  }
  function missSnap(sx,sy){
    const {G}=env, p=G.r1.floorPoint(sx,sy);
    if(p){ rig.visible=true; placeTip(p.x,.012,p.z,-.42); }
    rig.userData.setGrip(1); sfx.miss();
    setTimeout(()=>{ if(!rig||cap) return; rig.userData.setGrip(0); if(!(lastPointer&&lastPointer.type==='mouse')) rig.visible=false; },140);
    const any=(G.corpses?.list||[]).some(alive);
    G.ui.hint?.(any?'바퀴벌레 시체를 정확히 눌러 주세요.':'바닥에 아직 시체가 없습니다.',1.5,0,true);
  }
  function tryCapture(sx,sy,type){
    if(cap||open) return;
    const c=corpseAt(sx,sy,type);
    if(!c){ missSnap(sx,sy); return; }
    startCapture(c);
  }

  // ───────── 시체를 넘길 모양 (게임 창의 배열을 복사해 둔다) ─────────
  function attrs(geo){
    const A=geo.attributes;
    return {position:A.position.array.slice(),normal:A.normal?A.normal.array.slice():null,color:A.color?A.color.array.slice():null,index:geo.index?geo.index.array.slice():null};
  }
  function corpsePayload(c){
    const legGeos={}, legs=[];
    for(const g of c.legs){
      const L=g.L, key=L.style+L.i;
      if(!legGeos[key]) legGeos[key]=attrs(g.m.geometry);
      legs.push({key,style:L.style,i:L.i,x:L.x,y:L.y,z:L.z,rx:L.rx,ry:L.ry,rz:L.rz});
    }
    const M=c.V.shell.material;
    return {mode:c.mode,sc:c.sc,heading:c.h,charred:c.mode==='burnt',
      shell:attrs(c.V.shell.geometry),goo:c.V.goo?attrs(c.V.goo.geometry):null,legs,legGeos,
      shellColor:M?.color?.getHex?.()??0xb9ad9f};
  }
  // 바닥에서 들어 올리는 동안 보일 시체 (게임에 깔린 것과 같은 모양·재질)
  function buildCarry(c){
    const {THREE}=env, g=new THREE.Group();
    const add=(geo,mat,set)=>{ const m=new THREE.Mesh(geo,mat); m.castShadow=true; m.receiveShadow=true; set?.(m); g.add(m); return m; };
    add(c.V.shell.geometry,c.V.shell.material);
    if(c.V.goo) add(c.V.goo.geometry,c.V.goo.material);
    for(const L of c.legs) add(L.m.geometry,L.m.material,m=>{ m.position.set(L.L.x,L.L.y,L.L.z); m.rotation.set(L.L.rx,L.L.ry,L.L.rz,'YXZ'); });
    g.position.set(c.x,0,c.z); g.rotation.set(0,c.h,0); g.scale.setScalar(c.sc);
    return g;
  }

  // ───────── 집어 올리기 ─────────
  function startCapture(c){
    const {G,THREE}=env;
    G.r1.used?.add('kit'); G.r1.touch?.(); preload();
    let payload=null;
    try{ payload=corpsePayload(c); }catch(err){ console.error(err); G.ui.hint?.('이 시체는 집을 수 없습니다.',1.4,0,true); return; }
    const carry=buildCarry(c); G.r1.grp.add(carry);
    G.corpses.drop(c);                                  // 바닥에서 없앤다 (진물 자국은 바닥 그림이라 남는다)
    cap={c,carry,payload,t:0,x:c.x,z:c.z,h:c.h,yaw:camYaw(),gripped:false,lifted:false,
      wet:payload.goo?1:.15,grab:new THREE.Vector3(0,.03,0).multiplyScalar(c.sc)};
    rig.visible=true; rig.userData.setGrip(0);
    placeTip(cap.x,.2,cap.z,-.55,cap.yaw);
  }
  let _tip=null,_off=null,_e=null;
  function updateCapture(dt){
    const c=cap; if(!c) return;
    const {THREE}=env;
    _tip??=new THREE.Vector3(); _off??=new THREE.Vector3(); _e??=new THREE.Euler(0,0,0,'YXZ');
    c.t+=dt; const t=c.t;
    let tipY,grip,pitch;
    if(t<CAP_DOWN){ const k=ease(t/CAP_DOWN); tipY=lerp(.2,.03,k); grip=0; pitch=lerp(-.55,-.72,k); }
    else if(t<CAP_GRIP){ const k=(t-CAP_DOWN)/(CAP_GRIP-CAP_DOWN); tipY=.03-.006*Math.sin(k*Math.PI); grip=ease(clamp(k*1.6)); pitch=-.72; if(!c.gripped){ c.gripped=true; sfx.grip(); } }
    else{ const k=clamp((t-CAP_GRIP)/(CAP_LIFT-CAP_GRIP)); tipY=lerp(.03,.62,ease(k)); grip=1; pitch=lerp(-.72,-.95,k); if(!c.lifted){ c.lifted=true; sfx.peel(c.wet); setTimeout(()=>{ if(cap===c) sfx.lift(); },70); } }
    placeTip(c.x,tipY,c.z,pitch,c.yaw);
    rig.userData.setGrip(grip);
    if(t>=CAP_GRIP-.02){
      // 죽은 몸이라 버둥대지 않는다. 집힌 자리를 축으로 뻣뻣하게 흔들릴 뿐
      const lift=clamp((t-CAP_GRIP)/(CAP_LIFT-CAP_GRIP));
      _e.set(Math.sin(t*7.5)*.16*lift-.1*lift,c.h+Math.sin(t*4.2)*.12*lift,Math.sin(t*6.1+1)*.2*lift);
      c.carry.rotation.copy(_e);
      tipWorld(_tip); _off.copy(c.grab).applyEuler(_e);
      c.carry.position.set(_tip.x-_off.x,_tip.y-_off.y,_tip.z-_off.z);
    }
    if(t>=CAP_LIFT){
      if(roomState==='ready'&&!isBlocked()) finishCapture();
      else{
        pendingOpen=true;
        if(t>CAP_LIFT+10){                            // 10초가 지나도 간병 화면을 못 열면 시체를 내려놓고 다음에 다시 불러온다
          dropBack(); G().ui.hint?.('간병 화면을 열지 못했습니다. 잠시 뒤 다시 해 보세요.',2.2,0,true);
        }
      }
    }
  }
  const G=()=>env.G;
  // 열지 못했을 때: 들고 있던 시체를 원래 자리에 다시 깐다
  function dropBack(){
    const c=cap; if(!c) return; cap=null; pendingOpen=false; roomState='none'; frame.removeAttribute('src');
    env.G.r1.grp.remove(c.carry); rig.visible=false; rig.userData.setGrip(0);
    try{ env.G.corpses.add(c.x,c.z,c.h,c.c.mode); }catch(err){}
  }
  function finishCapture(){
    const c=cap; if(!c) return;
    cap=null; pendingOpen=false;
    env.G.r1.grp.remove(c.carry);
    rig.visible=false; rig.userData.setGrip(0);
    openRoom(c.payload);
  }

  // ───────── 간병 화면 열고 닫기 ─────────
  function openRoom(payload){
    const {G}=env; if(open) return;
    open=true; closeBusy=false;
    pausedBefore=!!G.paused; G.paused=true; G.sleep=true;            // 뒤에 가려진 게임은 그리지 않는다
    G.r1.cancel?.(); G.input.reset?.();
    layer.classList.add('open'); layer.setAttribute('aria-hidden','false'); gameFrame.classList.add('covered');
    try{ room()?.enter?.({corpse:payload,sfx:env.GSFX}); }catch(err){ console.error(err); }
  }
  function close(){
    if(!open||closeBusy||isBlocked()) return;
    closeBusy=true;
    try{ room()?.sleep?.(); }catch(err){}
    layer.classList.remove('open'); layer.setAttribute('aria-hidden','true'); gameFrame.classList.remove('covered');
    open=false;
    if(env){ const {G}=env; G.sleep=false; G.paused=pausedBefore; G.r1.touch?.(); G.input.reset?.(); if(G.state==='r1') G.ui.hint?.('구급상자로 다른 시체도 집어 올 수 있습니다.',1.6,.1,true); }
    setTimeout(()=>{ closeBusy=false; },160);
  }

  // ───────── 게임 쪽 칸 ─────────
  function addSlot(){
    const {G,gameWindow}=env, doc=gameWindow.document;
    if(doc.getElementById('kit-slot')) return;
    const slot=doc.createElement('div'); slot.id='kit-slot'; slot.className='slot'; slot.textContent='구급상자'; slot.title='구급상자';
    slot.addEventListener('pointerdown',e=>{ e.stopPropagation(); e.preventDefault(); env.GSFX?.ensure?.(); select(); });
    const col=doc.getElementById('wcol'), after=doc.getElementById('slime-slot')||doc.getElementById('tweezer-slot')||G.ui.slotEls.hand;
    col.insertBefore(slot,after?after.nextSibling:col.firstChild);
    G.ui.slotEls.kit=slot;
  }
  function select(){
    const {G}=env; if(!G||G.state!=='r1'||open||cap) return;
    G.r1.cancel?.(); G.r1.selectItem('kit'); preload();
    if(!hintShown){ hintShown=true; G.ui.hint?.('바닥의 바퀴벌레 시체를 누르면 집어 옵니다.',2.4,0,true); }
    if(lastPointer) pointRig(lastPointer.x,lastPointer.y,lastPointer.type==='mouse');
  }

  // ───────── 게임 창에 걸기 ─────────
  function install(e){
    env=e; const {G,gameWindow}=env;
    if(wrapped===G) return; wrapped=G;
    cap=null; pendingOpen=false; hintShown=false;
    addSlot();
    rig=makeRig(); G.r1.grp.add(rig);
    const isKit=()=>G.state==='r1'&&G.r1.item==='kit'&&!open;
    const origUpdate=G.r1.update.bind(G.r1);
    G.r1.update=function(dt){
      if(this.item!=='kit'&&!cap){ if(rig) rig.visible=false; return origUpdate(dt); }
      const mouse=this.G.input?.mouse, oldLive=mouse?.live, saved=this.item;
      this.item='hand'; if(mouse) mouse.live=false;
      try{ return origUpdate(dt); }
      finally{
        this.item=saved; if(mouse) mouse.live=oldLive;
        if(this.itemMeshes?.hand) this.itemMeshes.hand.visible=false;
        if(cap) updateCapture(dt);
        else if(lastPointer&&oldLive&&saved==='kit') pointRig(lastPointer.x,lastPointer.y,true);
        else if(rig) rig.visible=false;
      }
    };
    const origSelect=G.r1.selectItem.bind(G.r1);
    G.r1.selectItem=function(kind){ const out=origSelect(kind); if(kind!=='kit'&&rig&&!cap) rig.visible=false; return out; };
    const origStop=G.r1.stop.bind(G.r1);
    G.r1.stop=function(){ if(cap){ G.r1.grp.remove(cap.carry); cap=null; pendingOpen=false; } if(rig) rig.visible=false; return origStop(); };
    const oP=G.input.onPress, oD=G.input.onDrag, oR=G.input.onRelease, oC=G.input.onCancel;
    // 손가락은 뗄 때 집는다 — 화면을 옮기려고 댄 손가락에 시체가 집히지 않게. 마우스는 누를 때 집는다
    G.input.onPress=(x,y,type,id)=>{
      if(isKit()||cap){ lastPointer={x,y,type}; if(cap) return; if(type==='mouse') tryCapture(x,y,type); else rig.userData.press={x,y,type,id}; return; }
      oP?.(x,y,type,id);
    };
    G.input.onDrag=(x,y,id)=>{
      if(isKit()||cap){ lastPointer={x,y,type:G.input.lastType||'touch'}; pointRig(x,y,G.input.lastType==='mouse'); return; }
      oD?.(x,y,id);
    };
    G.input.onRelease=(id)=>{
      if(isKit()||cap){ const p=rig.userData.press; rig.userData.press=null; if(!cap&&p&&(id==null||p.id==null||p.id===id)) tryCapture(p.x,p.y,p.type); return; }
      oR?.(id);
    };
    G.input.onCancel=()=>{
      if(isKit()||cap){ if(rig) rig.userData.press=null; return; }
      oC?.();
    };
    gameWindow.addEventListener('pointermove',e=>{
      lastPointer={x:e.clientX,y:e.clientY,type:e.pointerType==='mouse'?'mouse':'touch'};
      if(G.state==='r1'&&G.r1.item==='kit'&&e.pointerType==='mouse') pointRig(e.clientX,e.clientY,true);
    },{passive:true});
    gameWindow.addEventListener('pointerleave',()=>{ if(rig&&!cap) rig.visible=false; });
  }
  /** 게임을 새로 불러올 때 (gameFrame이 다시 로드될 때) */
  function reset(){
    cap=null; pendingOpen=false; rig=null; wrapped=null; hintShown=false; lastPointer=null;
    if(open){ try{ room()?.sleep?.(); }catch(err){} layer.classList.remove('open'); layer.setAttribute('aria-hidden','true'); gameFrame.classList.remove('covered'); open=false; closeBusy=false; }
  }
  return {install,reset,select,isOpen:()=>open,isBusy:()=>open||!!cap,
    // 점검용
    _debug:{get cap(){ return cap; },get roomState(){ return roomState; },room,openRoom,close,corpseAt,tryCapture,frame}};
}
