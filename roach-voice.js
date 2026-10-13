// roach-voice.js — 동물의 숲 주민처럼 글자마다 「미미미」 하고 나는 바퀴 목소리 (대화 창 · 테라리움이 같이 쓴다)
// 한 글자(음절)마다 짧은 소리 하나: 모음에 따라 소리 빛깔(포먼트)이 바뀌고, 첫소리에 따라 쉿(ㅅ·ㅈ·ㅊ)·톡(ㄱ·ㄷ·ㅂ) 소리가 살짝 붙는다.
// 박자는 talk-bubble.js의 typeSteps와 같아서, 말풍선에 글자가 찍히는 대로 소리가 난다.
import { typeSteps } from './talk-bubble.js';

// 모음 → [첫째, 둘째 포먼트] (사람 어른 기준 Hz. 목소리마다 formant 배수만큼 올려 작은 몸 소리로 만든다)
const VOWEL={a:[820,1320],e:[540,1900],eo:[640,1060],o:[470,860],u:[370,900],eu:[410,1450],i:[310,2400]};
// 한글 중성 21개 → 모음 갈래 (ㅏㅐㅑㅒㅓㅔㅕㅖㅗㅘㅙㅚㅛㅜㅝㅞㅟㅠㅡㅢㅣ)
const JUNG=['a','e','a','e','eo','e','eo','e','o','a','e','e','o','u','eo','e','i','u','eu','i','i'];
// 초성 19개 → 첫소리 갈래 (ㄱㄲㄴㄷㄸㄹㅁㅂㅃㅅㅆㅇㅈㅉㅊㅋㅌㅍㅎ)
const CHO=['stop','stop','nasal','stop','stop','liquid','nasal','stop','stop','hiss','hiss','none','hiss','hiss','hiss','stop','stop','stop','breath'];
function sound(ch){
  const c=ch.codePointAt(0);
  if(c>=0xAC00&&c<=0xD7A3){ const k=c-0xAC00; return {v:JUNG[Math.floor((k%588)/28)],on:CHO[Math.floor(k/588)],coda:k%28!==0}; }
  const l=ch.toLowerCase();
  if('aeiou'.includes(l)) return {v:{a:'a',e:'e',i:'i',o:'o',u:'u'}[l],on:'none',coda:false};
  if(/[0-9a-z]/.test(l)) return {v:'eo',on:'stop',coda:false};
  return {v:'eu',on:'none',coda:false};
}

const NOISE=new WeakMap();
function noiseBuf(ctx){ let b=NOISE.get(ctx); if(b) return b; const n=Math.floor(ctx.sampleRate*0.5); b=ctx.createBuffer(1,n,ctx.sampleRate); const d=b.getChannelData(0); for(let i=0;i<n;i++) d[i]=Math.random()*2-1; NOISE.set(ctx,b); return b; }

function hash(str,k){ let h=2166136261^k; for(const ch of String(str)) { h^=ch.codePointAt(0); h=Math.imul(h,16777619); } return ((h>>>0)%10007)/10007; }
/** 바퀴마다 늘 같은 목소리. pitch(Hz)가 높을수록 앳되고, formant가 클수록 가늘고, speed가 클수록 빨리 말한다. 몸이 크면 조금 낮다 */
export function voiceOf(seed,size=1){
  const s=Math.max(0.7,Math.min(1.4,size||1));
  return {pitch:Math.round((440+190*hash(seed,1))/Math.pow(s,0.9)),formant:+(1.18+0.24*hash(seed,2)).toFixed(3),speed:+(0.9+0.2*hash(seed,3)).toFixed(3)};
}

/**
 * text를 한 글자씩 소리 낸다. ctx: AudioContext, dest: 이어 붙일 노드(소리 크기·압축은 그쪽이 맡는다)
 * o: {gain 전체 크기, when 시작 시각(ctx 시간, 없으면 바로)}
 * 돌려주는 값: {stop()} — 도중에 끊을 때 (말풍선 글자를 한 번에 다 띄울 때)
 */
export function speak(ctx,dest,text,voice,o={}){
  if(!ctx||!dest) return {stop(){}};
  try{ if(ctx.state==='suspended') ctx.resume().catch(()=>{}); }catch(e){}
  const V=voice||{pitch:480,formant:1.25,speed:1};
  const t0=Math.max(ctx.currentTime+0.01,o.when||0);
  const out=ctx.createGain(); out.gain.value=o.gain??0.1; out.connect(dest);
  const srcs=[];
  const steps=typeSteps(text,V.speed).steps.filter(s=>s.kind==='syl');
  const last=steps.length-1, ask=/\?\s*$/.test(String(text)), dur=0.072/V.speed;
  steps.forEach((st,k)=>{
    const S=sound(st.ch), F=VOWEL[S.v];
    // 억양: 살짝 오르내리다가, 끝에서 말하는 문장은 내려앉고 묻는 문장은 올라간다
    let pm=1+0.045*Math.sin(k*1.9+V.pitch*0.013)+(Math.random()-0.5)*0.05;
    if(S.v==='i') pm*=1.05; else if(S.v==='o'||S.v==='u') pm*=0.96;
    if(k===last) pm*=ask?1.2:0.9; else if(k===last-1&&ask) pm*=1.08;
    blip(ctx,out,srcs,t0+st.t,dur*(S.coda?0.7:0.84),V.pitch*pm,F[0]*V.formant,F[1]*V.formant,S.on);
  });
  const end=t0+(steps.length?steps[last].t+dur:0);
  return {end,stop(){ const n=ctx.currentTime; try{ out.gain.cancelScheduledValues(n); out.gain.setValueAtTime(out.gain.value,n); out.gain.linearRampToValueAtTime(0,n+0.03); }catch(e){} for(const s of srcs){ try{ s.stop(n+0.04); }catch(e){} } }};
}

function blip(ctx,out,srcs,t,len,f0,f1,f2,onset){
  // 첫소리: 쉿·톡·후 하는 바람 소리를 아주 짧게
  let vt=t;
  if(onset==='hiss'||onset==='breath'||onset==='stop'){
    const n=ctx.createBufferSource(); n.buffer=noiseBuf(ctx); const f=ctx.createBiquadFilter(), g=ctx.createGain();
    const L=onset==='stop'?0.008:onset==='hiss'?0.024:0.018, pk=onset==='stop'?0.5:onset==='hiss'?0.3:0.2;
    f.type=onset==='hiss'?'highpass':'bandpass'; f.frequency.value=onset==='hiss'?4800:onset==='stop'?2600:1700; f.Q.value=onset==='hiss'?0.7:1.1;
    g.gain.setValueAtTime(0.0001,t); g.gain.exponentialRampToValueAtTime(pk,t+0.002); g.gain.exponentialRampToValueAtTime(0.0001,t+L);
    n.connect(f); f.connect(g); g.connect(out); n.start(t,Math.random()*0.4); n.stop(t+L+0.02); srcs.push(n);
    if(onset!=='stop') vt=t+L*0.55;
  }
  const vl=Math.max(0.025,len-(vt-t));
  // 모음: 톱니파를 두 포먼트로 걸러 '미'·'마'·'무' 빛깔을 낸다. 머리에 살짝 높았다 내려와 앳되게 들린다
  const o=ctx.createOscillator(); o.type='sawtooth';
  const start=onset==='liquid'?0.95:1.07;
  o.frequency.setValueAtTime(f0*start,vt); o.frequency.exponentialRampToValueAtTime(f0,vt+vl*0.35); o.frequency.exponentialRampToValueAtTime(f0*0.97,vt+vl);
  const b1=ctx.createBiquadFilter(); b1.type='bandpass'; b1.frequency.value=f1; b1.Q.value=4;
  const b2=ctx.createBiquadFilter(); b2.type='bandpass'; b2.frequency.value=f2; b2.Q.value=6;
  const body=ctx.createBiquadFilter(); body.type='lowpass'; body.frequency.value=f0*2.2;
  const g1=ctx.createGain(); g1.gain.value=1; const g2=ctx.createGain(); g2.gain.value=onset==='nasal'?0.35:0.75; const gb=ctx.createGain(); gb.gain.value=0.18;
  const env=ctx.createGain();
  env.gain.setValueAtTime(0.0001,vt); env.gain.exponentialRampToValueAtTime(1,vt+0.006); env.gain.setValueAtTime(1,vt+vl*0.62); env.gain.exponentialRampToValueAtTime(0.0001,vt+vl);
  o.connect(b1); b1.connect(g1); g1.connect(env);
  o.connect(b2); b2.connect(g2); g2.connect(env);
  o.connect(body); body.connect(gb); gb.connect(env);
  env.connect(out);
  o.start(vt); o.stop(vt+vl+0.02); srcs.push(o);
}
