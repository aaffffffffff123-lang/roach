import {THREE,clamp,lerp,rand,smooth} from './specimen-core.js';

export const TOOL_LABELS={
  pin:'핀',tweezer:'족집게',clipper:'손톱깎이',awl:'송곳',cutter:'커터',lighter:'목 긴 라이터',piezo:'압전 딱딱이'
};
export const TOOL_HINTS={
  pin:'몸통이나 조각을 누르면 작업대에 고정한다. 핀 머리를 다시 누르면 뽑힌다.',
  tweezer:'부위를 누른 채 당긴다. 고정하지 않았으면 몸 전체가 끌려오고, 핀으로 고정한 뒤에는 연결부에 장력이 쌓인다.',
  clipper:'작은 부위 가까이를 누르면 가장 가까운 절단점에 입이 맞춰진 뒤 딱 닫힌다.',
  awl:'표면을 누른 채 버틴다. 일찍 떼면 함몰과 긁힘만 남고, 끝까지 누르면 균열 뒤에 갑자기 파고든다.',
  cutter:'표면 위를 드래그해 칼집을 낸다. 한 번은 선만 남고 같은 경로를 반복해야 깊어진다.',
  lighter:'누른 채 움직여 국소 가열한다. 얇은 날개와 더듬이는 먼저 말리고, 오래 가열한 외피는 검게 굳는다.',
  piezo:'표면을 누를 때마다 짧은 전기 펄스가 한 번 튄다. 누르고 있는 것보다 반복 클릭이 중요하다.'
};
const V3=(x=0,y=0,z=0)=>new THREE.Vector3(x,y,z);

function matMetal(){return new THREE.MeshStandardMaterial({color:0xc5c9cc,roughness:.22,metalness:.92});}
function matDark(){return new THREE.MeshStandardMaterial({color:0x29292c,roughness:.42,metalness:.45});}
function matPlastic(c){return new THREE.MeshPhysicalMaterial({color:c,roughness:.42,clearcoat:.55});}
function box(w,h,d,mat,x=0,y=0,z=0){const m=new THREE.Mesh(new THREE.BoxGeometry(w,h,d),mat);m.position.set(x,y,z);m.castShadow=true;return m;}
function cyl(rt,rb,h,mat,x=0,y=0,z=0,seg=12){const m=new THREE.Mesh(new THREE.CylinderGeometry(rt,rb,h,seg),mat);m.position.set(x,y,z);m.castShadow=true;return m;}

function buildPin(){
  const g=new THREE.Group(),metal=matMetal(),red=matPlastic(0x992b22);const shaft=cyl(.008,.004,.42,metal,0,0,.21,9);shaft.rotation.x=Math.PI/2;g.add(shaft);const head=new THREE.Mesh(new THREE.SphereGeometry(.045,14,9),red);head.scale.y=.46;head.position.z=.43;g.add(head);return g;
}
function buildTweezer(){
  const g=new THREE.Group(),metal=matMetal();for(const s of [-1,1]){const arm=box(.025,.018,.62,metal,s*.038,0,.31);arm.rotation.y=s*-.06;g.add(arm);const tip=box(.014,.012,.12,metal,s*.012,0,.04);tip.rotation.y=s*.12;g.add(tip)}const bridge=box(.10,.026,.06,matDark(),0,0,.61);g.add(bridge);g.userData.jaws=g.children.slice(0,4);return g;
}
function buildClipper(){
  const g=new THREE.Group(),metal=matMetal(),dark=matDark();const body=box(.15,.045,.42,metal,0,0,.28);g.add(body);const lower=box(.13,.018,.18,dark,0,-.027,.08);g.add(lower);const jawA=box(.068,.022,.12,metal,-.04,.003,.045),jawB=box(.068,.022,.12,metal,.04,.003,.045);jawA.rotation.y=-.11;jawB.rotation.y=.11;g.add(jawA,jawB);const lever=new THREE.Group();lever.position.set(0,.055,.34);lever.add(box(.12,.018,.34,metal,0,0,.02));lever.rotation.x=-.22;g.add(lever);g.userData.lever=lever;g.userData.jaws=[jawA,jawB];return g;
}
function buildAwl(){
  const g=new THREE.Group(),metal=matMetal(),wood=matPlastic(0x7a3e20);const spike=cyl(.004,.018,.54,metal,0,0,.27,10);spike.rotation.x=Math.PI/2;g.add(spike);const ferrule=cyl(.03,.025,.11,metal,0,0,.60,12);ferrule.rotation.x=Math.PI/2;g.add(ferrule);const handle=cyl(.075,.055,.36,wood,0,0,.83,18);handle.rotation.x=Math.PI/2;g.add(handle);return g;
}
function buildCutter(){
  const g=new THREE.Group(),metal=matMetal(),yellow=matPlastic(0xd7a11b),dark=matDark();const blade=box(.065,.008,.30,metal,0,0,.15);blade.geometry.translate(0,0,-.15);g.add(blade);const h=box(.13,.06,.48,yellow,0,0,.54);g.add(h);g.add(box(.035,.065,.25,dark,.055,0,.51));for(let i=0;i<4;i++)g.add(box(.08,.006,.012,dark,0,.034,.41+i*.07));return g;
}
function buildLighter(){
  const g=new THREE.Group(),metal=matMetal(),plastic=matPlastic(0x282a2d);const tube=cyl(.018,.018,.64,metal,0,0,.32,10);tube.rotation.x=Math.PI/2;g.add(tube);const neck=box(.06,.05,.08,metal,0,0,.68);g.add(neck);const handle=box(.18,.12,.38,plastic,0,0,.89);g.add(handle);g.add(box(.08,.035,.08,matPlastic(0xa62d22),0,.075,.73));const flame=new THREE.Mesh(new THREE.ConeGeometry(.035,.16,12),new THREE.MeshBasicMaterial({color:0xffa62f,transparent:true,opacity:.9,depthWrite:false}));flame.rotation.x=-Math.PI/2;flame.position.z=-.08;flame.visible=false;g.add(flame);g.userData.flame=flame;return g;
}
function buildPiezo(){
  const g=new THREE.Group(),dark=matPlastic(0x303236),metal=matMetal(),red=matPlastic(0xa43427);g.add(box(.16,.11,.34,dark,0,0,.30));g.add(box(.09,.05,.10,red,0,.075,.38));for(const s of [-1,1]){const e=cyl(.006,.006,.28,metal,s*.045,0,.02,7);e.rotation.x=Math.PI/2;g.add(e)}g.userData.electrodes=[g.children.at(-2),g.children.at(-1)];return g;
}
function buildModel(tool){switch(tool){case'pin':return buildPin();case'tweezer':return buildTweezer();case'clipper':return buildClipper();case'awl':return buildAwl();case'cutter':return buildCutter();case'lighter':return buildLighter();case'piezo':return buildPiezo();default:return new THREE.Group()}}

export class ToolController{
  constructor(app,specimen){
    this.app=app;this.scene=app.scene;this.camera=app.camera;this.workbench=app.workbench;this.audio=app.audio;this.fx=app.fx;this.specimen=specimen;
    this.tool='pin';this.models={};for(const k of Object.keys(TOOL_LABELS)){const m=buildModel(k);m.visible=false;m.renderOrder=8;m.traverse(o=>{if(o.isMesh){o.material=o.material.clone();o.material.depthTest=true}});this.scene.add(m);this.models[k]=m}
    this.activeModel=this.models.pin;this.activeModel.visible=true;this.hover=null;this.pointer={down:false,id:null,x:0,y:0};this.grab=null;this.hold=null;this.action=null;this.cutPath=[];this.cutPreview=null;this.lastHoverTime=0;
    this.tmp=V3();this.tmp2=V3();this.tmpQ=new THREE.Quaternion();this.tipNormal=V3(0,1,0);
  }
  dispose(){for(const m of Object.values(this.models)){this.scene.remove(m);m.traverse(o=>{o.geometry?.dispose();o.material?.dispose?.()})}this.clearPreview();}
  setSpecimen(s){this.specimen=s;this.cancel();this.hover=null;}
  setTool(k){if(!this.models[k])return;this.cancel();for(const [id,m] of Object.entries(this.models))m.visible=id===k;this.tool=k;this.activeModel=this.models[k];this.app.ui.selectTool(k);this.app.ui.hint(TOOL_HINTS[k],5);this.updateModelPose();}
  hitNormal(hit){if(hit.face){return hit.face.normal.clone().transformDirection(hit.object.matrixWorld).normalize()}return V3(0,1,0)}
  rayParts(x,y){
    const hits=this.workbench.ray(x,y,this.specimen.raycastObjects(),true);for(const h of hits){const p=this.specimen.partFromObject(h.object);if(p)return{hit:h,part:p,point:h.point.clone(),normal:this.hitNormal(h)}}return null;
  }
  rayPins(x,y){const objs=[];for(const p of this.specimen.pins)objs.push(...p.meshes);const h=this.workbench.ray(x,y,objs,true)[0];return h?.object?.userData?.pinRef||null;}
  hoverAt(x,y){
    if(this.pointer.down)return;const q=this.rayParts(x,y);this.hover=q;this.specimen.setHighlight(q?.part||null);if(q){this.app.ui.part(q.part.label,this.specimen.getPartState(q.part));this.tipNormal.copy(q.normal)}else this.app.ui.part(null);this.updateModelPose();
  }
  updateModelPose(pointOverride=null,normalOverride=null){
    const m=this.activeModel;if(!m)return;const q=pointOverride?{point:pointOverride,normal:normalOverride||V3(0,1,0)}:this.hover;if(!q){m.visible=false;return}m.visible=true;
    if(this.tool==='pin'){m.position.copy(q.point).add(V3(0,.02,0));m.quaternion.identity();m.rotation.x=-Math.PI/2;return}
    const dir=this.camera.position.clone().sub(q.point).normalize();if(this.tool==='lighter')dir.lerp(V3(0,.55,1).normalize(),.25).normalize();m.position.copy(q.point).addScaledVector(q.normal,.018);m.quaternion.setFromUnitVectors(V3(0,0,1),dir);const sc=this.tool==='clipper'?.82:this.tool==='piezo'?.84:this.tool==='tweezer'?.9:.86;m.scale.setScalar(sc);
  }
  down(e){
    if(e.button!==undefined&&e.button!==0)return false;this.audio.ensure();this.pointer.down=true;this.pointer.id=e.pointerId;this.pointer.x=e.clientX;this.pointer.y=e.clientY;
    if(this.tool==='pin'){
      const pin=this.rayPins(e.clientX,e.clientY);if(pin){this.specimen.removePin(pin);this.audio.unpin();this.app.ui.toast('핀을 뽑았다');this.app.ui.refresh();return true}
    }
    const q=this.rayParts(e.clientX,e.clientY);if(!q){this.pointer.down=false;return false}this.hover=q;this.specimen.setHighlight(q.part);this.specimen.setThreat(q.point,.28);this.app.ui.part(q.part.label,this.specimen.getPartState(q.part));
    switch(this.tool){
      case'pin':this.action={type:'pin',t:0,done:false,...q};break;
      case'tweezer':this.startGrab(q);break;
      case'clipper':this.startClip(q);break;
      case'awl':this.hold={type:'awl',t:0,stage:0,penetrated:false,...q};this.app.ui.meter(0,true);break;
      case'cutter':this.startCut(q);break;
      case'lighter':this.hold={type:'lighter',t:0,...q};this.audio.startFlame();this.models.lighter.userData.flame.visible=true;break;
      case'piezo':this.shock(q);this.pointer.down=false;break;
    }
    this.updateModelPose(q.point,q.normal);return true;
  }
  startGrab(q){
    const part=q.part,parent=part.group.parent;const pointParent=parent.worldToLocal(q.point.clone());const offset=pointParent.clone().sub(part.group.position);this.grab={part,start:q.point.clone(),last:q.point.clone(),target:q.point.clone(),normal:q.normal.clone(),parent,offset,basePos:part.group.position.clone(),tension:0,lastSound:0,detached:!part.bodyAttached};this.closeTweezers(true);this.app.ui.meter(0,true);
  }
  startClip(q){const cand=this.specimen.nearestCutCandidate(q.part,q.point);if(!cand||cand.point.distanceTo(q.point)>.24){this.app.ui.toast('절단점에 더 가까이 대라');this.pointer.down=false;return}this.action={type:'clip',t:0,done:false,cand,part:q.part,point:cand.point.clone(),normal:q.normal.clone()};this.updateModelPose(cand.point,q.normal);this.app.ui.meter(0,true);}
  startCut(q){this.cutPath=[{part:q.part,local:q.part.group.worldToLocal(q.point.clone()).add(q.part.group.worldToLocal(q.point.clone().addScaledVector(q.normal,.006)).sub(q.part.group.worldToLocal(q.point.clone()))),world:q.point.clone(),normal:q.normal.clone()}];this.makePreview();}
  move(e){
    this.pointer.x=e.clientX;this.pointer.y=e.clientY;if(!this.pointer.down){this.hoverAt(e.clientX,e.clientY);return}
    if(this.grab){this.moveGrab(e.clientX,e.clientY);return}
    if(this.hold?.type==='awl'||this.hold?.type==='lighter'){const q=this.rayParts(e.clientX,e.clientY);if(q){this.hold.part=q.part;this.hold.point=q.point;this.hold.normal=q.normal;this.hover=q;this.specimen.setThreat(q.point,.08);this.updateModelPose(q.point,q.normal)}return}
    if(this.tool==='cutter'&&this.cutPath.length){const q=this.rayParts(e.clientX,e.clientY);if(q)this.extendCut(q);return}
  }
  moveGrab(x,y){
    const g=this.grab,target=this.workbench.planePoint(x,y,Math.max(.10,g.start.y));if(!target)return;target.y=Math.max(.07,g.start.y);g.target.copy(target);const part=g.part;
    if(!part.bodyAttached){this.specimen.moveLoose(part,target);g.last.copy(target);return}
    if(!this.specimen.isRootPinned()){
      const delta=target.clone().sub(g.last);delta.y=0;this.specimen.moveWhole(delta.multiplyScalar(.82));g.last.copy(target);this.app.ui.meter(0,true);return;
    }
    const parent=part.group.parent;const targetLocal=parent.worldToLocal(target.clone()),desired=targetLocal.sub(g.offset),vec=desired.clone().sub(g.basePos);const max=.28;vec.clampLength(0,max);part.group.position.copy(g.basePos).addScaledVector(vec,.72);g.tension=vec.length();const threshold=.055+part.strength*.16;const k=clamp(g.tension/threshold,0,1.3);this.app.ui.meter(k,true);
    if(k>.45&&performance.now()-g.lastSound>110){this.audio.tension(k);g.lastSound=performance.now();part.integrity=clamp(part.integrity-.0025*k,0,1);part.twitch=Math.max(part.twitch,.18+.35*k)}
    if(k>.72){part.crack=clamp(part.crack+.006*k,0,1);this.specimen.refreshVisual(part)}
    if(k>=1){const impulse=target.clone().sub(g.start).normalize().multiplyScalar(.18+.18*k);if(this.specimen.detachPart(part,{cause:'tear',impulse,point:part.group.getWorldPosition(V3())})){this.audio.tear(clamp(part.strength,0,1));this.app.ui.toast(`${part.label} 분리`);g.detached=true;part.group.position.copy(part.group.position);this.app.ui.refresh();}else{this.app.ui.toast(part.anchored?'그 부위에 꽂힌 핀부터 뽑아야 한다':'연결부가 버틴다')};g.basePos=part.group.position.clone();g.start.copy(target);g.last.copy(target)}
  }
  extendCut(q){
    const last=this.cutPath.at(-1);if(last.world.distanceTo(q.point)<.018)return;const local=q.part.group.worldToLocal(q.point.clone());const nLocal=q.part.group.worldToLocal(q.point.clone().addScaledVector(q.normal,.007)).sub(q.part.group.worldToLocal(q.point.clone())).normalize();local.addScaledVector(nLocal,.007);this.cutPath.push({part:q.part,local,world:q.point.clone(),normal:q.normal.clone()});if(this.cutPath.length>90)this.cutPath.shift();this.makePreview();this.updateModelPose(q.point,q.normal);
  }
  makePreview(){
    this.clearPreview();if(this.cutPath.length<2)return;const pts=this.cutPath.map(p=>p.world.clone().addScaledVector(p.normal,.008));const geo=new THREE.BufferGeometry().setFromPoints(pts),mat=new THREE.LineBasicMaterial({color:0x53160e,transparent:true,opacity:.88,depthTest:false});this.cutPreview=new THREE.Line(geo,mat);this.cutPreview.renderOrder=12;this.scene.add(this.cutPreview);
  }
  clearPreview(){if(!this.cutPreview)return;this.scene.remove(this.cutPreview);this.cutPreview.geometry.dispose();this.cutPreview.material.dispose();this.cutPreview=null;}
  up(e){
    if(!this.pointer.down&&this.tool!=='piezo')return;this.pointer.down=false;this.pointer.id=null;
    if(this.grab){const g=this.grab;if(g.part.bodyAttached)g.part.group.position.lerp(g.basePos,.9);this.closeTweezers(false);this.grab=null;this.app.ui.meter(0,false);this.specimen.clearThreat();this.app.ui.refresh();return}
    if(this.hold?.type==='awl'){this.finishAwl(false);return}
    if(this.hold?.type==='lighter'){this.audio.stopFlame();this.models.lighter.userData.flame.visible=false;this.hold=null;this.specimen.clearThreat();this.app.ui.refresh();return}
    if(this.tool==='cutter'&&this.cutPath.length){this.finishCut();return}
  }
  cancel(){
    this.pointer.down=false;if(this.grab){if(this.grab.part.bodyAttached)this.grab.part.group.position.copy(this.grab.basePos);this.closeTweezers(false)}this.grab=null;if(this.hold?.type==='lighter'){this.audio.stopFlame();this.models.lighter.userData.flame.visible=false}this.hold=null;this.action=null;this.cutPath.length=0;this.clearPreview();this.app.ui?.meter(0,false);this.specimen?.clearThreat();
  }
  closeTweezers(on){const m=this.models.tweezer;const arms=m.userData.jaws||[];for(let i=0;i<arms.length;i++){const s=i%2?-1:1;arms[i].rotation.y=on?s*.08:0}}
  finishAwl(auto=false){
    const h=this.hold;if(!h)return;const amount=h.penetrated?.38:clamp(h.t/.9,0,.35);if(amount>.02)this.specimen.addPuncture(h.part,h.point,h.normal,amount);if(!h.penetrated&&h.t>.1)this.audio.awlDent(amount);this.hold=null;this.app.ui.meter(0,false);this.specimen.clearThreat();this.app.ui.refresh();if(auto)this.pointer.down=false;
  }
  finishCut(){
    const groups=[];let cur=null;for(const p of this.cutPath){if(!cur||cur.part!==p.part){cur={part:p.part,pts:[],world:[],normal:[]};groups.push(cur)}cur.pts.push(p.local);cur.world.push(p.world);cur.normal.push(p.normal)}let deepest=0,cutName='';
    for(const g of groups){if(g.pts.length<2)continue;const wp=g.world.reduce((a,p)=>a.add(p),V3()).multiplyScalar(1/g.world.length),wn=g.normal.reduce((a,p)=>a.add(p),V3()).normalize(),depth=this.specimen.addScore(g.part,g.pts,wp,wn);deepest=Math.max(deepest,depth);cutName=g.part.label;this.audio.score(depth);if(depth>.92&&g.part.scoreDepth>.72){const cand=this.specimen.nearestCutCandidate(g.part,wp);if(cand&&cand.point.distanceTo(wp)<.15){const ok=cand.type==='mid'?this.specimen.midCut(g.part,cand.ratio,'cutter'):this.specimen.detachPart(g.part,{cause:'cutter',point:cand.point});if(ok){this.audio.tear(.55);this.app.ui.toast(`${g.part.label} 절개가 연결부를 끊었다`)}}}}
    if(deepest>0&&deepest<.45)this.app.ui.toast(`${cutName}에 얕은 칼집`);else if(deepest>=.45&&deepest<.9)this.app.ui.toast(`${cutName} 칼집이 벌어졌다`);this.cutPath.length=0;this.clearPreview();this.specimen.clearThreat();this.app.ui.refresh();
  }
  shock(q){
    const m=this.models.piezo;this.updateModelPose(q.point,q.normal);m.updateWorldMatrix(true,true);const a=q.point.clone().add(this.camera.position.clone().sub(q.point).normalize().multiplyScalar(.10));this.fx.spark(a,q.point.clone().addScaledVector(q.normal,.005));this.audio.shock();this.specimen.applyShock(q.part,q.point);q.part.twitch=Math.max(q.part.twitch,1.2);if(Math.random()<.28)this.specimen.addScorch(q.part,q.point,q.normal,.025);this.app.ui.flash();this.app.ui.toast(`${q.part.label} 전기 펄스`);this.app.ui.refresh();
  }
  update(dt,time){
    if(this.action?.type==='pin'){
      const a=this.action;a.t+=dt;const k=clamp(a.t/.18,0,1),e=smooth(k);this.models.pin.position.copy(a.point).add(V3(0,lerp(.42,.02,e),0));if(!a.done&&k>=.78){a.done=true;const pin=this.specimen.addPin(a.part,a.point);if(pin){this.audio.pin();a.part.twitch=Math.max(a.part.twitch,.7);this.fx.shell(a.point,V3(0,1,0),2,.22);this.app.ui.toast(`${a.part.label} 고정`);this.app.ui.refresh()}else this.app.ui.toast('핀은 여섯 개까지만 꽂을 수 있다')}
      if(k>=1){this.action=null;this.pointer.down=false;this.specimen.clearThreat()}
    }
    if(this.action?.type==='clip'){
      const a=this.action;a.t+=dt;const k=clamp(a.t/.34,0,1);this.app.ui.meter(k,true);const m=this.models.clipper;m.userData.lever.rotation.x=lerp(-.22,.38,smooth(clamp((k-.25)/.55,0,1)));for(let i=0;i<m.userData.jaws.length;i++)m.userData.jaws[i].rotation.y=(i?-1:1)*lerp(.12,.015,smooth(k));
      if(!a.done&&k>.66){a.done=true;const result=this.specimen.clipCandidate(a.cand);this.audio.clip(a.cand.strength);a.part.twitch=Math.max(a.part.twitch,.8);this.fx.shell(a.cand.point,a.normal,3+Math.floor(a.cand.strength*3),.38);if(result==='crack')this.app.ui.toast(`${a.part.label} 외피가 갈라졌다`);else if(result)this.app.ui.toast(`${a.cand.label} 절단`);else this.app.ui.toast('핀이나 두꺼운 연결부가 절단을 막았다');this.app.ui.refresh()}
      if(k>=1){m.userData.lever.rotation.x=-.22;this.action=null;this.pointer.down=false;this.app.ui.meter(0,false);this.specimen.clearThreat()}
    }
    if(this.hold?.type==='awl'){
      const h=this.hold;h.t+=dt;const p=clamp(h.t/.9,0,1.25);this.app.ui.meter(p,true);const dir=this.camera.position.clone().sub(h.point).normalize();this.models.awl.position.copy(h.point).addScaledVector(dir,lerp(.18,.006,smooth(clamp(p,0,1))));this.models.awl.quaternion.setFromUnitVectors(V3(0,0,1),dir);
      if(h.stage<1&&p>.22){h.stage=1;this.audio.awlDent(.3);h.part.crack=clamp(h.part.crack+.06,0,1);h.part.twitch=Math.max(h.part.twitch,.35);this.specimen.refreshVisual(h.part)}
      if(h.stage<2&&p>.55){h.stage=2;this.audio.awlDent(.7);this.specimen.addPuncture(h.part,h.point,h.normal,.16);h.part.twitch=Math.max(h.part.twitch,.7)}
      if(h.stage<3&&p>.92){h.stage=3;h.penetrated=true;this.audio.awlBreak();this.specimen.addPuncture(h.part,h.point,h.normal,.52);this.fx.burst(h.point,h.normal,8,.48,.32);h.part.twitch=Math.max(h.part.twitch,1.1);this.app.ui.toast(`${h.part.label} 외피가 깨지며 관통됐다`);this.app.ui.refresh()}
      if(h.penetrated&&p>1.18)this.finishAwl(true);
    }
    if(this.hold?.type==='lighter'){
      const h=this.hold;h.t+=dt;this.specimen.applyHeat(h.part,h.point,dt*.31);if(Math.random()<dt*(3+h.part.burn*7)){this.audio.flamePop();this.fx.smoke(h.point,1)}if(Math.random()<dt*2)this.fx.stain(h.point,.009+h.part.burn*.018,true);this.app.ui.meter(h.part.burn,true);this.app.ui.part(h.part.label,this.specimen.getPartState(h.part));
      const flame=this.models.lighter.userData.flame;flame.scale.y=.75+Math.sin(time*37)*.18;flame.material.opacity=.72+Math.random()*.22;
    }
    if(this.grab){this.app.ui.part(this.grab.part.label,this.specimen.getPartState(this.grab.part));this.updateModelPose(this.grab.target,this.grab.normal)}
    else if(this.hover&&!this.pointer.down)this.updateModelPose();
  }
}
