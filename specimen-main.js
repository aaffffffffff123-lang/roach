import {THREE,AudioFX,Workbench,clamp,now} from './specimen-core.js';
import {SpecimenRoach} from './specimen-anatomy.js';
import {ToolController,TOOL_HINTS} from './specimen-tools.js';

const $=s=>document.querySelector(s);
const $$=s=>[...document.querySelectorAll(s)];

class UI{
  constructor(app){
    this.app=app;this.labelsOn=true;this.toastTimer=0;this.hintTimer=0;
    this.life=$('#lifeText');this.mobility=$('#mobilityText');this.pin=$('#pinText');this.piece=$('#pieceText');
    this.partCard=$('#partcard');this.partName=$('#partName');this.partState=$('#partState');this.hintEl=$('#hint');this.meterEl=$('#meter');this.meterBar=$('#meter i');this.toastEl=$('#toast');this.flashEl=$('#flash');
    $$('.tool').forEach(b=>b.addEventListener('pointerdown',e=>{e.preventDefault();e.stopPropagation();app.audio.ensure();app.tools.setTool(b.dataset.tool)}));
    $('#resetBtn').addEventListener('pointerdown',e=>{e.preventDefault();e.stopPropagation();app.audio.ensure();app.resetSpecimen()});
    $('#labelBtn').addEventListener('pointerdown',e=>{e.preventDefault();e.stopPropagation();this.labelsOn=!this.labelsOn;e.currentTarget.textContent=this.labelsOn?'구조 이름 끄기':'구조 이름 켜기';if(!this.labelsOn)this.part(null)});
    $('#startBtn').addEventListener('pointerdown',e=>{e.preventDefault();e.stopPropagation();app.audio.ensure();app.started=true;$('#intro').classList.add('hide');this.hint(TOOL_HINTS.pin,5)});
  }
  selectTool(k){$$('.tool').forEach(b=>b.classList.toggle('sel',b.dataset.tool===k));}
  refresh(){
    const s=this.app.specimen;if(!s)return;this.life.textContent=s.lifeState();this.mobility.textContent=`${Math.round(s.vitals.mobility*100)}%`;this.pin.textContent=s.pins.length;this.piece.textContent=s.detachedCount;
    this.life.style.color=s.vitals.alive?(s.vitals.thoraxCore<.3?'#8f271b':''):'#8f271b';
  }
  part(name,state=''){
    if(!name||!this.labelsOn){this.partCard.classList.remove('show');return}this.partName.textContent=name;this.partState.textContent=state;this.partCard.classList.add('show');
  }
  hint(text,dur=4){clearTimeout(this.hintTimer);this.hintEl.textContent=text||'';this.hintEl.classList.toggle('show',!!text);if(text)this.hintTimer=setTimeout(()=>this.hintEl.classList.remove('show'),dur*1000);}
  meter(v,on=true){this.meterEl.classList.toggle('show',on);this.meterBar.style.width=`${Math.round(clamp(v,0,1)*100)}%`;this.meterBar.style.background=v>.85?'#e8c87e':'var(--ivory)';}
  toast(text){clearTimeout(this.toastTimer);this.toastEl.textContent=text;this.toastEl.classList.add('show');this.toastTimer=setTimeout(()=>this.toastEl.classList.remove('show'),1150);}
  flash(){this.flashEl.style.transition='none';this.flashEl.style.opacity='.7';requestAnimationFrame(()=>{this.flashEl.style.transition='opacity .12s';this.flashEl.style.opacity='0'});}
}

class App{
  constructor(){
    this.canvas=$('#gl');this.workbench=new Workbench(this.canvas);this.scene=this.workbench.scene;this.camera=this.workbench.camera;this.audio=new AudioFX();this.fx=this.workbench.fx;this.started=false;this.last=now();this.touchIds=new Set();
    this.ui=new UI(this);this.specimen=new SpecimenRoach(this);this.tools=new ToolController(this,this.specimen);this.bind();this.ui.selectTool('pin');this.ui.refresh();this.animate();
  }
  bind(){
    this.canvas.addEventListener('contextmenu',e=>e.preventDefault());
    this.canvas.addEventListener('pointerdown',e=>{
      if(e.pointerType==='touch'){
        if(this.touchIds.size>=1){this.touchIds.add(e.pointerId);this.tools.cancel();return}
        this.touchIds.add(e.pointerId);
      }
      if(!this.started)return;
      if(e.button===2)return;
      const used=this.tools.down(e);if(used){e.preventDefault();try{this.canvas.setPointerCapture(e.pointerId)}catch{}}
    });
    this.canvas.addEventListener('pointermove',e=>{
      if(!this.started)return;if(e.pointerType==='touch'&&this.touchIds.size>1)return;this.tools.move(e);
    });
    const up=e=>{if(e.pointerType==='touch')this.touchIds.delete(e.pointerId);if(!this.started)return;if(this.touchIds.size>1)return;this.tools.up(e)};
    this.canvas.addEventListener('pointerup',up);this.canvas.addEventListener('pointercancel',up);
    window.addEventListener('blur',()=>{this.touchIds.clear();this.tools.cancel()});
    window.addEventListener('keydown',e=>{
      if(!this.started)return;const map=['pin','tweezer','clipper','awl','cutter','lighter','piezo'];const n=parseInt(e.key,10);if(n>=1&&n<=7){this.audio.ensure();this.tools.setTool(map[n-1])}if(e.key.toLowerCase()==='r')this.resetSpecimen();
    });
  }
  resetSpecimen(){
    this.tools.cancel();this.tools.dispose();this.specimen.reset();this.fx.clear();this.specimen=new SpecimenRoach(this);this.tools=new ToolController(this,this.specimen);this.tools.setTool('pin');this.ui.refresh();this.ui.part(null);this.ui.toast('새 실험체를 작업대에 올렸다');
  }
  animate(){
    requestAnimationFrame(()=>this.animate());const t=now(),dt=Math.min(.04,t-this.last);this.last=t;this.workbench.update(dt);if(this.started){this.specimen.update(dt,this.workbench.time);this.tools.update(dt,this.workbench.time)}this.ui.refresh();this.workbench.render();
  }
}

window.__specimenThree=THREE;
window.__specimenApp=new App();
