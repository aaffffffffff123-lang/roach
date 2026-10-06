// tally.js — 바뿌볼·해부 누적 수 (브라우저에 저장해서 판이 바뀌어도 쌓인다)
// 1라운드에서는 「34마리」 밑에 「바뿌볼 8개」 「해부 3마리」를 작게 함께 적는다.
// 마리 수(게임 규칙에 쓰이는 1라운드 처치 수)와는 따로 센다.
const KEYS={bappu:'roach_tally_bappu',dissect:'roach_tally_dissect'};
export const Tally={
  get(k){ try{ return Math.max(0,parseInt(localStorage.getItem(KEYS[k])||'0',10)||0); }catch(e){ return 0; } },
  add(k,n=1){ const v=this.get(k)+n; try{ localStorage.setItem(KEYS[k],String(v)); }catch(e){} return v; },
};
/** 게임 창(game.html)의 「마리」 숫자 밑에 두 줄을 붙인다. 마리 숫자가 보일 때만 같이 보인다 */
export function installTallyHud(gameWindow){
  const doc=gameWindow?.document; if(!doc||doc.getElementById('tally'))return;
  const st=doc.createElement('style');
  st.textContent=`#tally{position:fixed;left:calc(15px + env(safe-area-inset-left));top:calc(50px + env(safe-area-inset-top));font-family:var(--serif);color:var(--ink);font-size:14px;line-height:1.5;text-shadow:0 1px 0 rgba(255,255,255,.5);opacity:0;transition:opacity .4s;pointer-events:none;white-space:nowrap}#tally.show{opacity:.75}#tally div:empty{display:none}`;
  doc.head.appendChild(st);
  const el=doc.createElement('div'); el.id='tally'; el.innerHTML='<div class="b"></div><div class="d"></div>'; doc.body.appendChild(el);
  const b=el.querySelector('.b'), d=el.querySelector('.d');
  let last='';
  const sync=()=>{
    const nb=Tally.get('bappu'), nd=Tally.get('dissect'), kills=doc.getElementById('kills');
    const on=!!kills&&kills.classList.contains('show')&&(nb>0||nd>0), key=nb+'|'+nd+'|'+on;
    if(key===last)return; last=key;
    b.textContent=nb?`바뿌볼 ${nb}개`:''; d.textContent=nd?`해부 ${nd}마리`:''; el.classList.toggle('show',on);
  };
  sync(); gameWindow.setInterval(sync,400);
}
