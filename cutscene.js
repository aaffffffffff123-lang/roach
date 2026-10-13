// cutscene.js — 1라운드에서 죽이다 보면 가끔 뜨는 바퀴 두 마리의 대화 창 (index.html에서 불러 쓴다)
// 편지가 뜰 차례에 편지 대신 뜬다. 게임을 멈추고 가운데에 창을 띄워 cutscene.html을 튼 뒤,
// 대화가 끝나면 그대로 창을 닫고 게임을 이어 간다. 창 안 장면은 처음 한 번만 불러 두고 계속 쓴다.

export function createCutscene({getG=()=>null,getSfx=()=>null,onClose=null}={}){
  const style=document.createElement('style');
  style.textContent=`
#cutLayer{position:fixed;inset:0;z-index:60;display:grid;place-items:center;padding:16px;background:rgba(248,242,230,.42);opacity:0;visibility:hidden;pointer-events:none;transition:opacity .22s ease-out,visibility 0s linear .22s;touch-action:none;-webkit-tap-highlight-color:transparent}
#cutLayer.show{opacity:1;visibility:visible;pointer-events:auto;transition:opacity .22s ease-out}
#cutWin{position:relative;width:min(92vw,74vh,540px);aspect-ratio:1/1;border-radius:14px;overflow:hidden;background:#efe6d2;box-shadow:0 18px 46px rgba(70,45,20,.34),0 0 0 1px rgba(80,55,30,.14);transform:scale(.965);transition:transform .22s ease-out}
#cutLayer.show #cutWin{transform:none}
#cutFrame{position:absolute;inset:0;display:block;width:100%;height:100%;border:0;background:#efe6d2}
`;
  document.head.appendChild(style);
  const layer=document.createElement('div'); layer.id='cutLayer'; layer.setAttribute('aria-hidden','true');
  layer.innerHTML='<div id="cutWin"><iframe id="cutFrame" title="바퀴벌레 대화" tabindex="-1"></iframe></div>';
  document.body.appendChild(layer);
  const frame=layer.querySelector('#cutFrame');

  let state='none', open=false, pausedGame=false, sleptGame=false, openedAt=0, guard=0;
  // 말이 한동안 안 넘어가면(장면이 멈췄거나 못 불렀으면) 닫는다. 다른 앱에 가 있는 동안은 기다린다
  const arm=()=>{ clearTimeout(guard); guard=setTimeout(()=>{ if(!open) return; if(document.hidden){ arm(); return; } close(); },12000); };
  document.addEventListener('visibilitychange',()=>{ if(open&&!document.hidden) arm(); });
  const api=()=>{ try{ return frame.contentWindow?.Cut||null; }catch(e){ return null; } };

  window.addEventListener('message',e=>{
    if(e.source!==frame.contentWindow) return;
    const d=e.data||{};
    if(d.type==='cut-ready') state='ready';
    if(d.type==='cut-line'){ tick(); if(open) arm(); }
    if(d.type==='cut-done') close();
  });
  // 창 바깥을 눌러도 다음 말로 (창 안은 장면이 직접 받는다). 뜨자마자 누른 건 잡던 손이니 무시한다
  layer.addEventListener('pointerdown',e=>{ e.preventDefault(); e.stopPropagation(); if(performance.now()-openedAt<1200) return; try{ api()?.advance?.(); }catch(err){} });

  /** 장면을 미리 불러 둔다 (처음 「사랑이 이긴다」 편지가 뜰 때) */
  function preload(){ if(state!=='none') return; state='loading'; frame.src='cutscene.html?embed=1'; }
  /** 튼다. 아직 준비가 안 됐으면 false (그땐 편지가 대신 뜬다) */
  function play(){
    if(open) return false;
    if(state!=='ready'){ preload(); return false; }
    const C=api(); if(!C) return false;
    const G=getG();
    open=true; openedAt=performance.now();
    pausedGame=false; sleptGame=false;
    // 게임은 멈추고 그리기도 쉰다 (창 뒤로 마지막 장면이 그대로 보인다)
    if(G&&G.state==='r1'){ pausedGame=!G.paused; sleptGame=!G.sleep; G.r1.cancel?.(); G.input.reset?.(); G.paused=true; G.sleep=true; }
    layer.classList.add('show'); layer.setAttribute('aria-hidden','false');
    try{ C.play(); }catch(err){ console.error(err); close(); return false; }
    arm();
    return true;
  }
  function close(){
    if(!open) return;
    open=false; clearTimeout(guard);
    layer.classList.remove('show'); layer.setAttribute('aria-hidden','true');
    setTimeout(()=>{ if(!open) try{ api()?.stop?.(); }catch(e){} },300);
    const G=getG();
    if(sleptGame&&G) G.sleep=false;
    if(pausedGame&&G){ G.paused=false; G.r1.touch?.(); }
    pausedGame=false; sleptGame=false;
    onClose?.();
  }
  // 말풍선이 뜰 때 작게 톡 (게임 소리로 낸다 — 폰에서도 이미 풀려 있다)
  function tick(){
    const S=getSfx(); if(!S||!S.ctx) return;
    try{ S.noise({dur:0.016,gain:0.05,freq:2300,q:1.8,att:0.002}); S.tone({dur:0.045,gain:0.02,freq:1050,freqEnd:760,att:0.003}); }catch(e){}
  }
  return {preload,play,isOpen:()=>open,reset(){ if(open) close(); },_debug:{get state(){ return state; },frame}};
}
