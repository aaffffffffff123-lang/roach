// talk-bubble.js — 바퀴 두 마리가 주고받는 말풍선 (죽일 때 뜨는 대화 창 · 테라리움 · 테라리움 사진이 같이 쓴다)
// 하얀 타원에 가는 테두리, 말한 놈 쪽으로 짧은 꼬리. 왼쪽 놈 말은 왼쪽 줄에, 오른쪽 놈 말은 오른쪽 줄에 쌓인다.
// 새 말은 머리 바로 위에 붙고, 먼저 한 말은 위로 밀려 올라간다. 다 말하고 나면 맨 위가 첫마디다.

const TAU=Math.PI*2;
const clamp=(v,a,b)=>v<a?a:v>b?b:v;
export const BUBBLE_FAMILY='Gaegu, "Apple SD Gothic Neo", "Noto Sans KR", sans-serif';
const N=2.5;                 // 타원을 살짝 각지게(초타원) — 글자 귀퉁이가 테두리에 안 닿게
const fontOf=px=>`700 ${px}px ${BUBBLE_FAMILY}`;

/** 띄어쓰기 단위로 maxW 안에서 줄을 나눈다. '\n'은 그대로 줄바꿈 */
export function wrapLines(g,text,maxW){
  const out=[];
  for(const para of String(text).split('\n')){
    let cur='';
    for(const w of para.split(' ')){
      if(!w) continue;
      const t=cur?cur+' '+w:w;
      if(!cur||g.measureText(t).width<=maxW){ cur=t; continue; }
      out.push(cur); cur=w;
    }
    // 띄어쓰기 없이 너무 긴 말은 글자 단위로 자른다
    while(cur&&g.measureText(cur).width>maxW*1.15){ const ch=Array.from(cur); if(ch.length<2) break; let k=ch.length-1; while(k>1&&g.measureText(ch.slice(0,k).join('')).width>maxW) k--; out.push(ch.slice(0,k).join('')); cur=ch.slice(k).join(''); }
    out.push(cur);
  }
  return out.length?out:[''];
}

/** 글자 크기를 재서 모든 줄이 들어가는 초타원 반지름을 구한다 */
export function measureBubble(g,text,px,maxW){
  g.font=fontOf(px);
  const lines=wrapLines(g,text,maxW), lh=px*1.18, ws=lines.map(l=>g.measureText(l).width), th=lines.length*lh;
  const ry=th/2+px*0.56;
  let rx=0;
  lines.forEach((l,i)=>{ const yc=-th/2+(i+0.5)*lh; const ye=Math.abs(yc)+lh*0.4; const k=Math.pow(Math.max(0.08,1-Math.pow(Math.min(0.97,ye/ry),N)),1/N); rx=Math.max(rx,ws[i]/2/k); });
  rx+=px*0.72;
  return {lines,ws,lh,rx,ry,px};
}

/**
 * items  : [{text, side:'L'|'R'}] 말한 순서대로 (지금까지 나온 말만)
 * anchors: {L:{x,y}, R:{x,y}} 각자 머리 바로 위 화면 좌표
 * o      : {px 글자 크기, maxW 한 줄 최대 폭, lift 머리에서 띄울 높이, bounds:{l,t,r,b}}
 * 돌려주는 값: [{text,side,cx,cy,rx,ry,lines,ws,lh,px,tx,ty}] (tx,ty = 꼬리가 가리킬 머리)
 */
export function layoutBubbles(g,items,anchors,o){
  const px=o.px, maxW=o.maxW, B=o.bounds||{l:0,t:0,r:1e9,b:1e9};
  const gapY=px*1.05, stagger=px*0.95, lift=o.lift??px*1.1, sideGap=px*0.3;
  const AL=anchors.L, AR=anchors.R, mid=(AL.x+AR.x)/2;
  const M=items.map(it=>({text:it.text,side:it.side,...measureBubble(g,it.text,px,maxW)}));
  // 아래(가장 최근 말)부터 위로 쌓는다: 같은 줄 말은 겹치지 않게, 바로 뒤 말보다 아랫변도 윗변도 조금씩 위로
  // (그래야 위에서부터 읽으면 말한 순서가 된다)
  const base=Math.min(AL.y,AR.y)-lift;
  const colTop={L:Infinity,R:Infinity};
  let prevBottom=Infinity, prevTop=Infinity;
  for(let i=M.length-1;i>=0;i--){
    const b=M[i], h=2*b.ry;
    let bottom=Math.min(base,prevBottom-stagger,colTop[b.side]-gapY,prevTop-px*0.5+h);
    b.cy=bottom-b.ry; colTop[b.side]=bottom-h; prevBottom=bottom; prevTop=bottom-h;
    const A=b.side==='L'?AL:AR;
    b.cx=b.side==='L'?Math.min(A.x,mid-sideGap-b.rx*0.9):Math.max(A.x,mid+sideGap+b.rx*0.9);
    b.cx=clamp(b.cx,B.l+b.rx,Math.max(B.l+b.rx,B.r-b.rx));
    b.tx=A.x; b.ty=A.y;
  }
  // 위로 넘치면 통째로 내린다 (머리를 조금 가리더라도 글은 다 보이게)
  let top=Infinity, bot=-Infinity; for(const b of M){ top=Math.min(top,b.cy-b.ry); bot=Math.max(bot,b.cy+b.ry); }
  if(top<B.t){ const sh=Math.min(B.t-top,Math.max(0,B.b-bot)); for(const b of M) b.cy+=sh; }
  // 꼬리가 같은 줄 아래 말풍선에 닿지 않게 길이를 줄인다
  for(const b of M){ b.tailMax=Infinity; for(const c of M){ if(c===b||c.side!==b.side) continue; const gap=(c.cy-c.ry)-(b.cy+b.ry); if(gap>-1&&gap<b.tailMax+px) b.tailMax=Math.min(b.tailMax,Math.max(px*0.35,gap-px*0.22)); } }
  return M;
}

function sePoint(cx,cy,rx,ry,a){ const c=Math.cos(a), s=Math.sin(a); return [cx+rx*Math.sign(c)*Math.pow(Math.abs(c),2/N), cy+ry*Math.sign(s)*Math.pow(Math.abs(s),2/N)]; }
/** 말풍선 하나. b.a(0~1)가 있으면 나타나는 중 */
export function drawBubble(g,b,alpha=1){
  const a=clamp(alpha*(b.a??1),0,1); if(a<=0.01) return;
  const appear=b.a===undefined?1:1-Math.pow(1-clamp(b.a,0,1),3), s=0.9+0.1*appear;
  const {cx,cy,rx,ry,px}=b;
  // 꼬리: 말한 놈 머리 쪽으로, 아래쪽 테두리에서 짧게
  let dir=Math.atan2((b.ty-cy)/ry,(b.tx-cx)/rx); if(!isFinite(dir)) dir=Math.PI/2; dir=clamp(dir,0.42,Math.PI-0.42);
  const a1=dir-0.15, a2=dir+0.15;
  const [x1,y1]=sePoint(cx,cy,rx,ry,a1), [x2,y2]=sePoint(cx,cy,rx,ry,a2);
  const bx=(x1+x2)/2, by=(y1+y2)/2; let vx=b.tx-bx, vy=b.ty-by; const d=Math.hypot(vx,vy)||1; vx/=d; vy/=d;
  if(vy<0.35){ vy=0.35; const k=Math.hypot(vx,vy); vx/=k; vy/=k; }
  const L=Math.min(clamp(d-px*0.7,px*0.5,px*1.15),b.tailMax??Infinity), tx=bx+vx*L, ty=by+vy*L;
  g.save(); g.globalAlpha=a;
  g.translate(cx,cy); g.scale(s,s); g.translate(-cx,-cy);
  // 타원(꼬리 자리만 비우고 한 바퀴) → 꼬리 끝 → 제자리: 한 붓으로 그려 칠하고 테두리를 한 번만 긋는다
  g.beginPath();
  const n=72;
  for(let i=0;i<=n;i++){ const t=a2+(a1+TAU-a2)*i/n; const [x,y]=sePoint(cx,cy,rx,ry,t); if(i) g.lineTo(x,y); else g.moveTo(x,y); }
  g.quadraticCurveTo((x1+tx)/2+vy*px*0.08,(y1+ty)/2-vx*px*0.08,tx,ty);
  g.quadraticCurveTo((x2+tx)/2,(y2+ty)/2,x2,y2);
  g.closePath();
  g.lineJoin='round'; g.lineCap='round';
  g.shadowColor='rgba(40,25,10,.16)'; g.shadowBlur=px*0.35; g.shadowOffsetY=px*0.08;
  g.fillStyle='#ffffff'; g.fill();
  g.shadowColor='transparent'; g.shadowBlur=0; g.shadowOffsetY=0;
  g.strokeStyle='rgba(38,33,29,.92)'; g.lineWidth=Math.max(1,px*0.085); g.stroke();
  // 글
  g.fillStyle='#29231f'; g.font=fontOf(px); g.textAlign='center'; g.textBaseline='middle';
  const th=b.lines.length*b.lh;
  b.lines.forEach((l,i)=>g.fillText(l,cx,cy-th/2+(i+0.5)*b.lh+px*0.04));
  g.restore();
}
export function drawBubbles(g,boxes,alpha=1){ for(const b of boxes) drawBubble(g,b,alpha); }

/** 화면에 계속 떠 있는 말풍선들: 자리를 부드럽게 따라가고, 새 말은 살짝 커지며 나타난다 */
export class BubbleView{
  constructor(){ this.key=null; this.list=[]; this.alpha=0; }
  /** items가 null이면 대화가 없거나 끊긴 것 — 금방 사라진다. o.key가 바뀌면 새 대화. o.fade(0~1)는 끝나 가며 흐려지는 정도 */
  update(dt,g,items,anchors,o){
    if(items&&items.length&&anchors){
      if(o.key!==this.key){ this.list=[]; this.key=o.key; }
      const boxes=layoutBubbles(g,items,anchors,o), k=1-Math.exp(-18*dt);
      boxes.forEach((b,i)=>{ const c=this.list[i];
        if(!c||c.text!==b.text){ this.list[i]={...b,a:0}; return; }
        const cx=c.cx+(b.cx-c.cx)*k, cy=c.cy+(b.cy-c.cy)*k; Object.assign(c,b,{cx,cy,a:Math.min(1,c.a+dt/0.16)}); });
      this.list.length=boxes.length;
      this.alpha=1-clamp(o.fade||0,0,1);
    } else if(this.list.length){ this.alpha-=dt/0.25; if(this.alpha<=0){ this.list=[]; this.key=null; this.alpha=0; } }
  }
  get visible(){ return this.list.length>0&&this.alpha>0.01; }
  draw(g){ if(this.visible) drawBubbles(g,this.list,this.alpha); }
  clear(){ this.list=[]; this.key=null; this.alpha=0; }
}
