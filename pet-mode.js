// pet-mode.js — 1라운드 「컵」 아이템과 바멍(테라리움) 화면 연결 (index.html에서 불러 쓴다)
// 컵으로 살아 있는 바퀴 한 마리를 덮어 데려와 이름을 지어 주고, 테라리움(bamung.html)에 넣는다.
// 몇 번이든 한 마리씩 데려올 수 있고(최대 30마리), 컵을 고르면 옆에 뜨는 「테라리움 보기」로 언제든 구경하러 간다.
// 족집게·슬라임과 같은 방식: 게임 창의 three.js로 컵을 만들어 게임 장면에 넣고, 입력은 게임 Input 앞에서 가로챈다.

const KEY='roach_pets_v1';       // 테라리움 기록 (bamung.html과 같은 자리)
const CAP=30;                    // 테라리움에 둘 수 있는 마릿수 (살아 있는 놈 + 아직 안 묻은 놈)
const NAME_MAX=8;
const CUP_R=0.15;                // 컵 입구 반지름 (바퀴 길이 0.13의 두 배 남짓)
const CUP_H=0.2;
const clamp=(v,a=0,b=1)=>Math.max(a,Math.min(b,v));
const lerp=(a,b,t)=>a+(b-a)*t;
const ease=t=>t*t*(3-2*t);
const PI=Math.PI, TAU=PI*2;

function readStore(){
  try{ const d=JSON.parse(localStorage.getItem(KEY)||'null'); if(!d||typeof d!=='object') return {total:0,nextNo:1};
    const pets=Array.isArray(d.pets)?d.pets.filter(p=>p&&p.id):[];
    let next=Math.max(1,d.nextNo|0); for(const p of pets) next=Math.max(next,(p.no|0)+1); for(const g of Array.isArray(d.graves)?d.graves:[]) next=Math.max(next,(g?.no|0)+1);
    return {total:pets.length,nextNo:next}; }
  catch(e){ return {total:0,nextNo:1}; }
}

// 이름 카드 그림: 엎은 컵 속 바퀴 한 마리
const CUP_SVG=`<svg viewBox="0 0 120 92" aria-hidden="true"><defs><linearGradient id="petCupG" x1="0" y1="0" x2="1" y2="0"><stop offset="0" stop-color="#ffffff" stop-opacity=".55"/><stop offset=".45" stop-color="#ffffff" stop-opacity=".12"/><stop offset="1" stop-color="#ffffff" stop-opacity=".45"/></linearGradient><radialGradient id="petWing" cx=".42" cy=".3" r=".8"><stop offset="0" stop-color="#c98a4b"/><stop offset=".55" stop-color="#8a4a1e"/><stop offset="1" stop-color="#4a220b"/></radialGradient></defs>
<ellipse cx="60" cy="84" rx="44" ry="6" fill="#c9a77a" opacity=".35"/>
<g transform="translate(60 66) rotate(-78)"><g stroke="#2b1406" stroke-width="1.6" fill="none" stroke-linecap="round" stroke-linejoin="round"><path d="M-2 -17 C-7 -25 -13 -28 -21 -31"/><path d="M2 -17 C7 -25 13 -28 21 -31"/><path d="M-6 -8 L-12 -11 L-16 -17"/><path d="M6 -8 L12 -11 L16 -17"/><path d="M-7 -2 L-14 1 L-19 6"/><path d="M7 -2 L14 1 L19 6"/><path d="M-6 3 L-13 10 L-17 21"/><path d="M6 3 L13 10 L17 21"/></g>
<path d="M0 -8 C8 -8 9 2 8 10 C7 18 3 22 0 22 C-3 22 -7 18 -8 10 C-9 2 -8 -8 0 -8 Z" fill="url(#petWing)"/><path d="M0 -17 C6 -17 9 -13 9 -9 C9 -7 5 -6 0 -6 C-5 -6 -9 -7 -9 -9 C-9 -13 -6 -17 0 -17 Z" fill="#c8955a"/></g>
<path d="M22 84 L34 10 Q60 4 86 10 L98 84 Z" fill="url(#petCupG)" stroke="#9fc9d6" stroke-width="2.4" stroke-linejoin="round"/>
<path d="M34 10 Q60 16 86 10" fill="none" stroke="#9fc9d6" stroke-width="2"/><path d="M41 20 L33 76" stroke="#ffffff" stroke-width="4" stroke-linecap="round" opacity=".7"/>
<path d="M20 84 Q60 90 100 84" fill="none" stroke="#9fc9d6" stroke-width="3" stroke-linecap="round"/></svg>`;

export function createPetMode({gameFrame,onEnter=null,isBlocked=()=>false}){
  let env=null, wrapped=null;
  let cupMesh=null, cap=null, naming=null;
  let tankOpen=false, tankState='none', pendingEnter=false, pendingArrive=null, closeBusy=false, pausedBefore=false, namePaused=false;
  let info=readStore(), hintShown=false, letterDue=true, lastPointer=null, press=null;
  const TMP={};

  // ───────── 겉면: 테라리움 레이어 · 돌아가기 · 이름 카드 ─────────
  const style=document.createElement('style');
  style.textContent=`
#petLayer{position:fixed;inset:0;z-index:20;background:#e8dbc4;opacity:0;visibility:hidden;pointer-events:none;transition:opacity .22s ease-out,visibility 0s linear .22s}
#petLayer.open{opacity:1;visibility:visible;pointer-events:auto;transition:opacity .22s ease-out}
#petFrame{position:absolute;inset:0;display:block;width:100%;height:100%;border:0;background:#e8dbc4}
#petBack{position:absolute;z-index:3;left:calc(12px + env(safe-area-inset-left));top:calc(12px + env(safe-area-inset-top));min-width:44px;height:44px;padding:0 15px;border:0;border-radius:999px;background:rgba(248,240,220,.94);color:#302017;font:900 13px/1 system-ui,"Apple SD Gothic Neo","Malgun Gothic",sans-serif;box-shadow:0 2px 0 rgba(114,76,43,.7),0 7px 20px rgba(0,0,0,.3);-webkit-tap-highlight-color:transparent;touch-action:manipulation;transition:opacity .4s}
#petBack:active{transform:translateY(2px)}
#petLayer.calm #petBack{opacity:.28}
#petLayer.loading::after{content:"";position:absolute;left:50%;top:50%;width:28px;height:28px;margin:-14px 0 0 -14px;border:3px solid rgba(48,32,23,.15);border-top-color:rgba(48,32,23,.8);border-radius:50%;animation:petSpin .75s linear infinite}
@keyframes petSpin{to{transform:rotate(360deg)}}
#petName{position:fixed;inset:0;z-index:30;display:grid;place-items:center;padding:24px;background:rgba(255,236,190,.55);-webkit-backdrop-filter:blur(4px);backdrop-filter:blur(4px);opacity:0;visibility:hidden;pointer-events:none;transition:opacity .25s ease-out,visibility 0s linear .25s}
#petName.show{opacity:1;visibility:visible;pointer-events:auto;transition:opacity .25s ease-out}
#petName .card{position:relative;width:min(340px,90vw);padding:20px 20px 18px;border-radius:24px;text-align:center;background:
  radial-gradient(circle at 12px 12px,rgba(255,170,150,.3) 3.2px,transparent 3.6px) 0 0/34px 34px,
  radial-gradient(circle at 29px 29px,rgba(120,190,230,.26) 2.6px,transparent 3px) 0 0/34px 34px,#fffaf0;
  box-shadow:0 0 0 6px #fff,0 0 0 9px #f3b971,0 18px 40px rgba(110,70,20,.35);opacity:0;transform:translateY(30px) scale(.94)}
#petName.show .card{animation:petCardIn .42s .04s cubic-bezier(.25,1.4,.5,1) forwards}
@keyframes petCardIn{to{opacity:1;transform:none}}
#petName .pic{display:block;width:132px;height:auto;margin:0 auto 4px}
#petName .ttl{font:800 19px/1.3 "Noto Sans KR","Apple SD Gothic Neo",system-ui,sans-serif;color:#3a2516;letter-spacing:-.01em}
#petName .sub{margin-top:5px;font:700 12.5px/1.45 "Noto Sans KR","Apple SD Gothic Neo",system-ui,sans-serif;color:#8a6a4a;word-break:keep-all}
#petNameIn{display:block;width:100%;height:54px;margin:14px 0 0;padding:0 16px;border:2px solid #ead9bb;border-radius:16px;background:#fff;text-align:center;font:700 26px/1 "Gaegu","Noto Sans KR","Apple SD Gothic Neo",cursive;color:#3a2516;outline:none;-webkit-user-select:text;user-select:text}
#petNameIn:focus{border-color:#f3b971}
#petNameIn::placeholder{color:#cdb99a}
#petGo{display:block;width:100%;height:54px;margin-top:12px;border:0;border-radius:999px;background:#f7a93b;color:#fff;font:800 17px/1 "Noto Sans KR","Apple SD Gothic Neo",system-ui,sans-serif;box-shadow:0 4px 0 #cf7f16;-webkit-tap-highlight-color:transparent;touch-action:manipulation}
#petGo:active{transform:translateY(4px);box-shadow:0 0 0 #cf7f16}
`;
  document.head.appendChild(style);
  const layer=document.createElement('div'); layer.id='petLayer'; layer.setAttribute('aria-hidden','true');
  layer.innerHTML=`<iframe id="petFrame" title="바멍" allow="autoplay; web-share; screen-wake-lock"></iframe><button id="petBack" type="button" aria-label="게임으로 돌아가기">돌아가기</button>`;
  document.body.appendChild(layer);
  const frame=layer.querySelector('#petFrame'), back=layer.querySelector('#petBack');
  const nameEl=document.createElement('div'); nameEl.id='petName'; nameEl.setAttribute('aria-hidden','true');
  nameEl.innerHTML=`<div class="card" role="dialog" aria-label="이름 짓기">${CUP_SVG.replace('<svg ','<svg class="pic" ')}<div class="ttl">이름을 지어 주세요</div><div class="sub" id="petNameSub"></div><input id="petNameIn" type="text" maxlength="16" autocomplete="off" enterkeyhint="done" aria-label="이름"><button id="petGo" type="button">테라리움에 넣기</button></div>`;
  document.body.appendChild(nameEl);
  const nameIn=nameEl.querySelector('#petNameIn'), goBtn=nameEl.querySelector('#petGo');
  back.addEventListener('pointerdown',e=>{ e.preventDefault(); e.stopPropagation(); closeTank(); });
  goBtn.addEventListener('click',e=>{ e.preventDefault(); confirmName(); });
  nameIn.addEventListener('keydown',e=>{ if(e.key==='Enter'){ e.preventDefault(); confirmName(); } });
  window.addEventListener('keydown',e=>{ if(e.code==='Escape'&&tankOpen&&!naming){ e.preventDefault(); closeTank(); } });
  window.addEventListener('message',e=>{
    if(e.source!==frame.contentWindow) return;
    const d=e.data||{};
    if(d.type==='bamung-ready'){ tankState='ready'; layer.classList.remove('loading'); if(typeof d.total==='number') setInfo(d);
      if(tankOpen) enterTank();
      else { const L=tankApi(); if(pendingArrive&&L){ const a=pendingArrive; pendingArrive=null; try{ L.enter({arrive:a}); }catch(err){ console.error(err); } } try{ L?.sleep?.(); }catch(err){} info=readStore(); updateSlot(); } }
    if(d.type==='bamung-count') setInfo(d);
    if(d.type==='bamung-ui') layer.classList.toggle('calm',!d.show);
    if(d.type==='bamung-close') closeTank();
  });
  function setInfo(d){ info={total:d.total|0,nextNo:Math.max(1,d.nextNo|0)}; updateSlot(); }

  const tankApi=()=>{ try{ return frame.contentWindow?.Bamung||null; }catch(err){ return null; } };
  function preloadTank(){ if(tankState!=='none') return; tankState='loading'; frame.src='bamung.html?embed=1'; }
  function enterTank(){
    const L=tankApi(); if(!L) return;
    const a=pendingArrive; pendingArrive=null; pendingEnter=false;
    let added=null; try{ added=L.enter(a?{arrive:a}:{}); }catch(err){ console.error(err); }
    if(added&&letterDue){   // 처음 데려온 날: 바퀴에게서 편지가 온다 (편지가 실제로 떠야 다 본 걸로 친다)
      onEnter?.({pause:()=>{ letterDue=false; try{ (L.pause||L.sleep)(); }catch(err){} },resume:()=>{ if(tankOpen) try{ (L.resume||L.wake)(); }catch(err){} }}); }
    info=readStore(); updateSlot();
  }
  function openTank(arrive=null){
    if(tankOpen||!env||cap) return;
    const {G}=env; tankOpen=true; closeBusy=false; press=null;
    pausedBefore=namePaused?pausedBefore:!!G.paused; G.paused=true; G.sleep=true;
    G.r1.cancel?.(); G.input.reset?.();
    if(cupMesh) cupMesh.visible=false;
    layer.classList.add('open'); layer.classList.remove('calm'); layer.setAttribute('aria-hidden','false'); gameFrame.classList.add('covered');
    if(arrive) pendingArrive=arrive;
    pendingEnter=true;
    preloadTank();
    if(tankState==='ready') enterTank(); else layer.classList.add('loading');
  }
  function closeTank(){
    if(!tankOpen||closeBusy||isBlocked()) return;
    closeBusy=true; pendingEnter=false;
    try{ tankApi()?.sleep?.(); }catch(err){}
    layer.classList.remove('open','loading'); layer.setAttribute('aria-hidden','true'); gameFrame.classList.remove('covered');
    tankOpen=false; namePaused=false;
    info=readStore(); updateSlot();
    if(env){ const {G}=env; G.sleep=false; G.paused=pausedBefore; G.r1.touch?.(); G.input.reset?.(); }
    setTimeout(()=>{ closeBusy=false; },160);
  }

  // ───────── 이름 짓기 ─────────
  function showName(){
    const {G}=env; naming={};
    namePaused=true; pausedBefore=!!G.paused; G.paused=true; G.r1.cancel?.(); G.input.reset?.();
    info=readStore();
    nameIn.value=''; nameIn.placeholder=`${info.nextNo}호`;
    nameEl.querySelector('#petNameSub').textContent=`비워 두면 「${info.nextNo}호」라고 불러요.`;
    nameEl.classList.add('show'); nameEl.setAttribute('aria-hidden','false');
    sfx.card();
    setTimeout(()=>{ if(naming) try{ nameIn.focus({preventScroll:true}); }catch(err){} },420);
  }
  function confirmName(){
    if(!naming) return;
    const name=Array.from(nameIn.value.replace(/\s+/g,' ').trim()).slice(0,NAME_MAX).join('');
    naming=null; try{ nameIn.blur(); }catch(err){}
    nameEl.classList.remove('show'); nameEl.setAttribute('aria-hidden','true');
    sfx.go();
    openTank({name});
  }

  // ───────── 게임 쪽 칸 · 「테라리움 보기」 ─────────
  let tankBtn=null;
  function addSlot(){
    const {G,gameWindow}=env, doc=gameWindow.document;
    if(doc.getElementById('pet-slot')) return;
    if(!doc.getElementById('pet-slot-style')){
      const st=doc.createElement('style'); st.id='pet-slot-style';
      st.textContent=`#pet-slot{display:flex;flex-direction:column;align-items:center;justify-content:center;line-height:1.05}#pet-slot .ct{font-size:9px;font-weight:800;opacity:.72;margin-top:2px;letter-spacing:0}
#pet-tank{position:fixed;z-index:3;display:none;align-items:center;gap:5px;height:40px;padding:0 14px;border-radius:12px;background:#fdf1c9;color:#3a2516;font-size:13px;font-weight:800;letter-spacing:-.02em;white-space:nowrap;box-shadow:0 2px 0 #caa45a,0 4px 10px rgba(80,50,20,.28);-webkit-tap-highlight-color:transparent;touch-action:manipulation;cursor:pointer;transition:transform .08s}
#pet-tank.show{display:flex}#pet-tank:active{transform:translateY(2px)}#pet-tank i{font-style:normal;font-size:11px;opacity:.65}`;
      doc.head.appendChild(st);
    }
    const slot=doc.createElement('div'); slot.id='pet-slot'; slot.className='slot'; slot.title='컵';
    slot.innerHTML=`<span class="nm">컵</span><small class="ct">0/${CAP}</small>`;
    slot.addEventListener('pointerdown',e=>{ e.stopPropagation(); e.preventDefault(); env.GSFX?.ensure?.(); select(); });
    const col=doc.getElementById('wcol'), after=doc.getElementById('slime-slot')||doc.getElementById('tweezer-slot')||G.ui.slotEls.hand;
    col.insertBefore(slot,after?.nextSibling||col.firstChild);
    G.ui.slotEls.cup=slot;
    tankBtn=doc.createElement('div'); tankBtn.id='pet-tank'; tankBtn.innerHTML='테라리움 보기 <i></i>';
    tankBtn.addEventListener('pointerdown',e=>{ e.stopPropagation(); e.preventDefault(); env.GSFX?.ensure?.(); sfx.go(); openTank(null); });
    (col.parentElement||doc.body).appendChild(tankBtn);
    updateSlot();
  }
  function updateSlot(){
    const slot=env?.G?.ui?.slotEls?.cup; if(!slot) return;
    slot.querySelector('.ct').textContent=`${info.total}/${CAP}`;
    if(tankBtn) tankBtn.querySelector('i').textContent=info.total?`${info.total}마리`:'';
  }
  function placeTankBtn(){
    if(!tankBtn||!env) return;
    const {G,gameWindow}=env; const on=G.state==='r1'&&G.r1.item==='cup'&&!tankOpen&&!naming&&!cap;
    tankBtn.classList.toggle('show',on);
    if(!on) return;
    const r=G.ui.slotEls.cup.getBoundingClientRect(), col=gameWindow.document.getElementById('wcol')?.getBoundingClientRect()||r;
    tankBtn.style.top=`${Math.round(r.top+r.height/2-20)}px`; tankBtn.style.right=`${Math.round(gameWindow.innerWidth-Math.min(r.left,col.left)+8)}px`;
  }
  function select(){
    const {G}=env; if(!G||G.state!=='r1'||tankOpen||naming) return;
    G.r1.cancel?.(); G.r1.selectItem('cup');
    ensureCup(); preloadTank(); info=readStore(); updateSlot();
    if(info.total>=CAP) G.ui.hint?.(`테라리움이 꽉 찼어요. ${CAP}마리까지 키울 수 있어요.`,2.4,0,true);
    else if(!hintShown){ hintShown=true; G.ui.hint?.('살아 있는 바퀴벌레를 누르면 컵으로 덮어 데려옵니다.',2.4,0,true); }
    placeTankBtn();
    if(lastPointer?.type==='mouse') hoverCup(lastPointer.x,lastPointer.y);
  }

  // ───────── 컵 (게임 창의 three.js로 만든다) ─────────
  function ensureCup(){
    if(cupMesh) return cupMesh;
    const {G,THREE}=env;
    const g=new THREE.Group(); g.name='pet-cup';
    const clear=new THREE.MeshPhysicalMaterial({color:0xf4fbff,transparent:true,opacity:0.22,roughness:0.06,metalness:0,clearcoat:1,clearcoatRoughness:0.05,side:THREE.DoubleSide,depthWrite:false});
    const edge=new THREE.MeshPhysicalMaterial({color:0xffffff,transparent:true,opacity:0.72,roughness:0.12,clearcoat:1,depthWrite:false});
    const body=new THREE.Mesh(new THREE.CylinderGeometry(CUP_R*0.72,CUP_R,CUP_H,48,1,true),clear); body.position.y=CUP_H/2; g.add(body);
    const top=new THREE.Mesh(new THREE.CircleGeometry(CUP_R*0.72,48),clear); top.rotation.x=-PI/2; top.position.y=CUP_H; g.add(top);
    const rim=new THREE.Mesh(new THREE.TorusGeometry(CUP_R,0.007,8,64),edge); rim.rotation.x=PI/2; rim.position.y=0.007; g.add(rim);
    const lip=new THREE.Mesh(new THREE.TorusGeometry(CUP_R*0.72,0.005,8,48),edge); lip.rotation.x=PI/2; lip.position.y=CUP_H; g.add(lip);
    for(let i=0;i<10;i++){ const a=i/10*TAU; const s=new THREE.Mesh(new THREE.BoxGeometry(0.004,CUP_H*0.92,0.002),edge); const rr=(CUP_R+CUP_R*0.72)/2; s.position.set(Math.cos(a)*rr,CUP_H/2,Math.sin(a)*rr); s.rotation.y=-a+PI/2; s.rotation.z=Math.atan2(CUP_R*0.28,CUP_H)*0; g.add(s); }
    g.traverse(o=>{ if(o.isMesh){ o.renderOrder=7; o.castShadow=false; } });
    const shadow=new THREE.Mesh(new THREE.CircleGeometry(CUP_R*1.02,48),new THREE.MeshBasicMaterial({color:0x2a1a0e,transparent:true,opacity:0.16,depthWrite:false}));
    shadow.rotation.x=-PI/2; shadow.position.y=0.002; shadow.renderOrder=6; g.add(shadow); g.userData.shadow=shadow;
    g.visible=false; G.r1.grp.add(g); cupMesh=g;
    TMP.v=new THREE.Vector3();
    return g;
  }
  function hoverCup(sx,sy){
    if(!env||cap||naming||tankOpen) return; const {G}=env;
    if(G.state!=='r1'||G.r1.item!=='cup'){ if(cupMesh) cupMesh.visible=false; return; }
    const p=G.r1.floorPoint(sx,sy); if(!p){ cupMesh.visible=false; return; }
    ensureCup(); cupMesh.visible=true; cupMesh.position.set(p.x,0.18,p.z); cupMesh.scale.setScalar(1.06); cupMesh.userData.shadow.material.opacity=0.08;
  }
  /** 누른 자리에서 가장 가까운 살아 있는 바퀴 (화면 거리) */
  function candidateAt(sx,sy,type){
    const {G,THREE,gameWindow}=env; const w=gameWindow.innerWidth, h=gameWindow.innerHeight, lim=type==='mouse'?40:56;
    const t=TMP.v||new THREE.Vector3(); let best=null, bd=lim*lim;
    for(const r of G.r1.roaches){
      if(!r||r.gone||r.state==='dead'||r.state==='poison'||r.dead>0||!r.m?.g?.visible) continue;
      if(G.r1.underCushion?.(r.x,r.z)) continue;
      t.set(r.x,0.035,r.z).project(G.camera); if(t.z<-1||t.z>1) continue;
      const px=(t.x*0.5+0.5)*w, py=(-t.y*0.5+0.5)*h, d=(px-sx)**2+(py-sy)**2;
      if(d<bd){ bd=d; best=r; }
    }
    return best;
  }
  function tryCapture(sx,sy,type){
    if(cap||naming||tankOpen||!env) return;
    const {G}=env;
    info=readStore(); updateSlot();
    if(info.total>=CAP){ G.ui.hint?.(`테라리움이 꽉 찼어요. ${CAP}마리까지 키울 수 있어요.`,2.2,0,true); return; }
    const r=candidateAt(sx,sy,type), p=G.r1.floorPoint(sx,sy); if(!p&&!r) return;
    ensureCup();
    const x=r?r.x:p.x, z=r?r.z:p.z;
    if(r){ const i=G.r1.roaches.indexOf(r); if(i>=0) G.r1.roaches.splice(i,1); r.captured=true; r.startle=null; }
    cap={t:0,x,z,r,landed:false,lifted:false,scratch:0.05,ang:Math.random()*TAU,h:r?(r.h||0):0,miss:!r};
    G.r1.used?.add('cup'); G.r1.touch?.();
    cupMesh.visible=true; placeTankBtn();
  }
  // 0~.16초: 컵이 내려와 덮는다 / ~1.05초: 갇힌 바퀴가 컵 안을 뱅뱅 돈다 / ~1.45초: 컵째 들어 올린다
  const T_DOWN=0.16, T_RUN=1.05, T_LIFT=1.45, T_MISS=0.5;
  function updateCapture(dt){
    const c=cap; if(!c) return;
    c.t+=dt; const t=c.t, g=cupMesh;
    let y=0, s=1, op=0.16;
    if(t<T_DOWN){ const k=ease(t/T_DOWN); y=lerp(0.42,0,k); s=lerp(1.25,1,k); op=0.06+0.1*k; }
    else if(!c.landed){ c.landed=true; sfx.tap(); env.G.shake?.(0.05); }
    if(c.miss){
      if(t>=T_DOWN){ const k=clamp((t-T_DOWN-0.12)/(T_MISS-T_DOWN-0.12)); y=0.42*ease(k); s=1+0.25*k; op=0.16*(1-k); }
      if(t>=T_MISS){ finishMiss(); return; }
    } else if(t>=T_RUN){ const k=clamp((t-T_RUN)/(T_LIFT-T_RUN)); y=0.75*ease(k); s=1+0.5*ease(k); op=0.16*(1-k); if(!c.lifted){ c.lifted=true; sfx.lift(); } }
    g.position.set(c.x,y,c.z); g.scale.setScalar(s); g.userData.shadow.material.opacity=op;
    const r=c.r;
    if(r){ const m=r.m;
      if(t<T_RUN){ // 컵 벽을 따라 뱅뱅 돈다
        const sp=t<T_DOWN?0:7.5; c.ang+=sp*dt*(1+0.3*Math.sin(t*9)); const R=t<T_DOWN?0:Math.min(0.065,(t-T_DOWN)*0.4);
        const bx=c.x+Math.cos(c.ang)*R, bz=c.z+Math.sin(c.ang)*R; const hh=Math.atan2(-Math.sin(c.ang),Math.cos(c.ang))+PI/2;
        m.g.position.set(bx,0,bz); m.g.rotation.set(0,R>0.01?hh:c.h,0); m.pose?.(1,dt*1.6,0);
        c.scratch-=dt; if(c.scratch<=0&&t>T_DOWN){ c.scratch=0.045+Math.random()*0.06; sfx.scratch(); }
      } else { // 컵째 들려 올라간다
        const k=clamp((t-T_RUN)/(T_LIFT-T_RUN)); m.g.position.set(c.x,y*0.8+0.004,c.z); m.g.rotation.x=-0.3*k; m.pose?.(1,dt*2.2,0); m.g.visible=k<0.85; }
    }
    if(!c.miss&&t>=T_LIFT) finishCapture();
  }
  function finishMiss(){ cap=null; if(cupMesh) cupMesh.visible=false; env?.G?.ui?.hint?.('바퀴벌레 위를 눌러 컵으로 덮어 주세요.',1.4,0,true); }
  function finishCapture(){
    const c=cap; cap=null; if(!c) return;
    const {G}=env; const r=c.r;
    if(r){ r.gone=true; if(r.m?.g){ r.m.g.visible=false; G.r1.grp.remove(r.m.g); } }
    if(cupMesh) cupMesh.visible=false;
    showName();
  }
  function cancelCapture(silent){
    const c=cap; if(!c) return; cap=null;
    if(c.r&&!c.lifted){ // 아직 안 들었으면 놓아준다: 그 자리에서 다시 도망간다
      const {G}=env; const r=c.r; r.captured=false; r.gone=false; r.x=r.m.g.position.x; r.z=r.m.g.position.z; r.m.g.position.y=0; r.m.g.rotation.set(0,r.h||0,0); r.m.g.visible=true; if(!G.r1.roaches.includes(r)) G.r1.roaches.push(r); G.r1.flee?.(r,c.x,c.z);
    } else if(c.r){ const r=c.r; r.gone=true; if(r.m?.g){ r.m.g.visible=false; env.G.r1.grp.remove(r.m.g); } }
    if(cupMesh) cupMesh.visible=false;
  }

  // ───────── 소리 (게임 효과음 엔진) ─────────
  const sfx={
    tap(){ const S=env?.GSFX; if(!S?.ctx) return; S.tone({dur:0.05,gain:0.12,freq:820,freqEnd:520,type:'triangle',att:0.002}); S.noise({dur:0.035,gain:0.12,freq:2400,q:1.4,att:0.002}); S.tone({t:0.01,dur:0.07,gain:0.06,freq:180,freqEnd:110,type:'sine'}); },
    scratch(){ const S=env?.GSFX; if(!S?.ctx) return; S.noise({dur:0.02+Math.random()*0.02,gain:0.05+Math.random()*0.04,freq:3200+Math.random()*2200,q:2.4,att:0.002}); },
    lift(){ const S=env?.GSFX; if(!S?.ctx) return; S.noise({dur:0.22,gain:0.09,freq:700,freqEnd:1900,q:1,att:0.04}); },
    card(){ const S=env?.GSFX; S?.ensure?.(); if(!S?.ctx) return; [[0,784],[0.09,988],[0.18,1319]].forEach(([t,f])=>{ S.tone({t,dur:0.22,gain:0.08,freq:f,type:'triangle',att:0.006}); }); },
    go(){ const S=env?.GSFX; S?.ensure?.(); if(!S?.ctx) return; S.tone({dur:0.08,gain:0.07,freq:660,freqEnd:990,type:'sine',att:0.004}); S.noise({t:0.03,dur:0.12,gain:0.04,freq:2600,freqEnd:1200,q:1,att:0.01}); },
  };

  // ───────── 게임 창에 걸기 ─────────
  function install(e){
    env=e; const {G,gameWindow}=env;
    if(wrapped===G) return; wrapped=G;
    cupMesh=null; cap=null; naming=null; hintShown=false; info=readStore();
    addSlot();
    const isCup=()=>G.state==='r1'&&(G.r1.item==='cup'||!!cap)&&!tankOpen&&!naming;
    const origUpdate=G.r1.update.bind(G.r1);
    G.r1.update=function(dt){
      if(this.item!=='cup'&&!cap){ if(cupMesh) cupMesh.visible=false; placeTankBtn(); return origUpdate(dt); }
      const mouse=this.G.input?.mouse, oldLive=mouse?.live, saved=this.item;
      this.item='hand'; if(mouse) mouse.live=false;
      try{ return origUpdate(dt); }
      finally{ this.item=saved; if(mouse) mouse.live=oldLive; if(this.itemMeshes?.hand) this.itemMeshes.hand.visible=false; if(!this.G.paused) updateCapture(dt); placeTankBtn(); }
    };
    const origSelect=G.r1.selectItem.bind(G.r1);
    G.r1.selectItem=function(kind){ const out=origSelect(kind); if(kind!=='cup'&&cupMesh&&!cap) cupMesh.visible=false; placeTankBtn(); return out; };
    const origStop=G.r1.stop.bind(G.r1);
    G.r1.stop=function(){ if(cap){ const r=cap.r; cap=null; if(r){ r.gone=true; if(r.m?.g) G.r1.grp.remove(r.m.g); } } if(cupMesh) cupMesh.visible=false; placeTankBtn(); return origStop(); };
    const oP=G.input.onPress, oD=G.input.onDrag, oR=G.input.onRelease, oC=G.input.onCancel;
    G.input.onPress=(x,y,type,id)=>{ if(isCup()){ lastPointer={x,y,type}; press={x,y,type,id}; return; } oP?.(x,y,type,id); };
    G.input.onDrag=(x,y,id)=>{ if(isCup()){ lastPointer={x,y,type:G.input.lastType||'touch'}; if(press&&press.id===id&&Math.hypot(x-press.x,y-press.y)>(press.type==='mouse'?8:16)) press=null; if(G.input.lastType==='mouse') hoverCup(x,y); return; } oD?.(x,y,id); };
    G.input.onRelease=(id)=>{ if(isCup()){ const p=press; press=null; if(p&&(id==null||p.id==null||p.id===id)) tryCapture(p.x,p.y,p.type); return; } oR?.(id); };
    G.input.onCancel=()=>{ if(isCup()){ press=null; return; } oC?.(); };
    gameWindow.addEventListener('pointermove',ev=>{ lastPointer={x:ev.clientX,y:ev.clientY,type:ev.pointerType==='mouse'?'mouse':'touch'}; if(ev.pointerType==='mouse'&&G.state==='r1'&&G.r1.item==='cup'&&!cap) hoverCup(ev.clientX,ev.clientY); },{passive:true});
    gameWindow.addEventListener('pointerleave',()=>{ if(cupMesh&&!cap) cupMesh.visible=false; });
    gameWindow.addEventListener('resize',()=>placeTankBtn());
  }
  /** 게임을 새로 시작할 때 (gameFrame이 다시 로드될 때) */
  function reset(){
    cap=null; cupMesh=null; wrapped=null; hintShown=false; tankBtn=null;
    if(naming){ naming=null; nameEl.classList.remove('show'); nameEl.setAttribute('aria-hidden','true'); }
    if(tankOpen){ try{ tankApi()?.sleep?.(); }catch(err){} layer.classList.remove('open','loading'); layer.setAttribute('aria-hidden','true'); gameFrame.classList.remove('covered'); tankOpen=false; closeBusy=false; }
    pendingEnter=false; namePaused=false; press=null;
  }
  return {install,reset,select,open:()=>openTank(null),
    isTankOpen:()=>tankOpen,
    isOpen:()=>tankOpen||!!naming,
    isBusy:()=>tankOpen||!!naming||!!cap,
    get count(){ return info.total; },
    _debug:{get cap(){return cap;},get cup(){return cupMesh;},openTank,closeTank,tankApi,get tankState(){return tankState;},tryCapture,candidateAt,showName,confirmName}};
}
