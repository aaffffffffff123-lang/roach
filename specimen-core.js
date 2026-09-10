import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';

export { THREE };
export const TAU=Math.PI*2;
export const clamp=(v,a,b)=>v<a?a:v>b?b:v;
export const lerp=(a,b,t)=>a+(b-a)*t;
export const rand=(a=1,b)=>b===undefined?Math.random()*a:a+Math.random()*(b-a);
export const smooth=t=>t*t*(3-2*t);
export const damp=(a,b,rate,dt)=>lerp(a,b,1-Math.exp(-rate*dt));
export const angleWrap=a=>((a+Math.PI)%TAU+TAU)%TAU-Math.PI;
export const angleDamp=(a,b,rate,dt)=>a+angleWrap(b-a)*(1-Math.exp(-rate*dt));
export const now=()=>performance.now()/1000;

export function roundedRectShape(w,h,r){
  const s=new THREE.Shape();
  const x=-w/2,z=-h/2;
  s.moveTo(x+r,z);
  s.lineTo(x+w-r,z); s.quadraticCurveTo(x+w,z,x+w,z+r);
  s.lineTo(x+w,z+h-r); s.quadraticCurveTo(x+w,z+h,x+w-r,z+h);
  s.lineTo(x+r,z+h); s.quadraticCurveTo(x,z+h,x,z+h-r);
  s.lineTo(x,z+r); s.quadraticCurveTo(x,z,x+r,z);
  return s;
}

export function canvasTexture(size,draw){
  const c=document.createElement('canvas'); c.width=c.height=size;
  const g=c.getContext('2d'); draw(g,size);
  const t=new THREE.CanvasTexture(c); t.colorSpace=THREE.SRGBColorSpace; t.anisotropy=8;
  return t;
}

export function capsuleGeometry(radius,length,radial=10,cap=6){
  return new THREE.CapsuleGeometry(radius,Math.max(0.001,length-radius*2),cap,radial);
}

export function orientCylinder(mesh,a,b){
  const mid=a.clone().add(b).multiplyScalar(.5),dir=b.clone().sub(a),len=dir.length();
  mesh.position.copy(mid); mesh.scale.y=len; mesh.quaternion.setFromUnitVectors(new THREE.Vector3(0,1,0),dir.normalize());
}

export class AudioFX{
  constructor(){this.ctx=null;this.master=null;this.comp=null;this.noiseBuf=null;this.loops=new Map();}
  ensure(){
    if(!this.ctx){
      const C=window.AudioContext||window.webkitAudioContext; if(!C)return;
      const c=this.ctx=new C();
      this.master=c.createGain(); this.master.gain.value=.82;
      this.comp=c.createDynamicsCompressor(); this.comp.threshold.value=-16; this.comp.ratio.value=5; this.comp.attack.value=.002; this.comp.release.value=.13;
      this.master.connect(this.comp); this.comp.connect(c.destination);
      const n=c.sampleRate*2,b=c.createBuffer(1,n,c.sampleRate),d=b.getChannelData(0);
      for(let i=0;i<n;i++)d[i]=Math.random()*2-1;
      this.noiseBuf=b;
    }
    if(this.ctx.state==='suspended')this.ctx.resume();
  }
  env(g,t,a,d,p){g.gain.setValueAtTime(.0001,t);g.gain.exponentialRampToValueAtTime(Math.max(.0002,p),t+a);g.gain.exponentialRampToValueAtTime(.0001,t+a+d);}
  tone({t=0,f=220,end=60,d=.09,a=.002,g=.25,type='sine',pan=0}={}){
    if(!this.ctx)return; const c=this.ctx,T=c.currentTime+t,o=c.createOscillator(),gg=c.createGain(),pp=c.createStereoPanner();
    o.type=type;o.frequency.setValueAtTime(Math.max(20,f),T);if(end)o.frequency.exponentialRampToValueAtTime(Math.max(20,end),T+a+d);this.env(gg,T,a,d,g);pp.pan.value=clamp(pan,-1,1);o.connect(gg);gg.connect(pp);pp.connect(this.master);o.start(T);o.stop(T+a+d+.03);
  }
  noise({t=0,f=1500,end=300,d=.08,a=.002,g=.28,type='bandpass',q=1.2,pan=0,rate=1}={}){
    if(!this.ctx)return;const c=this.ctx,T=c.currentTime+t,s=c.createBufferSource(),fi=c.createBiquadFilter(),gg=c.createGain(),pp=c.createStereoPanner();
    s.buffer=this.noiseBuf;s.loop=true;s.playbackRate.value=rate;fi.type=type;fi.frequency.setValueAtTime(Math.max(20,f),T);fi.Q.value=q;if(end)fi.frequency.exponentialRampToValueAtTime(Math.max(20,end),T+a+d);this.env(gg,T,a,d,g);pp.pan.value=clamp(pan,-1,1);s.connect(fi);fi.connect(gg);gg.connect(pp);pp.connect(this.master);s.start(T,rand(0,1.5));s.stop(T+a+d+.04);
  }
  pin(){this.ensure();this.tone({f:1800,end:680,d:.035,g:.22,type:'square'});this.noise({t:.018,f:700,end:180,d:.07,g:.27,type:'lowpass'});}
  unpin(){this.ensure();this.noise({f:950,end:230,d:.09,g:.24});this.tone({t:.035,f:520,end:190,d:.06,g:.12,type:'triangle'});}
  tension(k=.5){this.ensure();this.noise({f:300+900*k,end:150,d:.025,g:.05+.12*k,q:4});}
  tear(k=1){this.ensure();for(let i=0;i<4+Math.floor(k*3);i++)this.noise({t:i*.018,f:1700+rand(2600),end:420,d:.018+rand(.018),g:.17+.08*k,q:2.4});this.noise({t:.03,f:460,end:90,d:.18,g:.32*k,type:'lowpass'});this.tone({f:120,end:35,d:.12,g:.24*k});}
  clip(thick=.3){this.ensure();this.tone({f:2450,end:850,d:.025,g:.32,type:'square'});this.noise({t:.015,f:2600,end:640,d:.04,g:.25+.18*thick,q:2});this.tone({t:.035,f:135,end:42,d:.07,g:.16+.16*thick});}
  score(depth=.2){this.ensure();this.noise({f:1800+depth*1500,end:650,d:.075,g:.10+.17*depth,q:3,rate:1.1});this.noise({t:.025,f:520,end:180,d:.09,g:.08+.12*depth,type:'lowpass'});}
  awlDent(k=.3){this.ensure();this.noise({f:850+900*k,end:240,d:.04,g:.11+.13*k,q:3});}
  awlBreak(){this.ensure();for(let i=0;i<5;i++)this.noise({t:i*.015,f:2100+rand(2600),end:520,d:.025,g:.2,q:2.5});this.tone({t:.03,f:150,end:38,d:.12,g:.3});}
  shock(){this.ensure();this.tone({f:3200,end:1100,d:.018,g:.3,type:'square'});this.noise({f:5200,end:1900,d:.025,g:.33,q:3});this.tone({t:.02,f:95,end:38,d:.11,g:.25,type:'sawtooth'});}
  startFlame(){
    this.ensure();if(!this.ctx||this.loops.has('flame'))return;const c=this.ctx,s=c.createBufferSource(),f=c.createBiquadFilter(),g=c.createGain();s.buffer=this.noiseBuf;s.loop=true;f.type='bandpass';f.frequency.value=920;f.Q.value=.7;g.gain.value=.0001;s.connect(f);f.connect(g);g.connect(this.master);s.start();g.gain.exponentialRampToValueAtTime(.19,c.currentTime+.08);this.loops.set('flame',{s,g});
  }
  stopFlame(){const L=this.loops.get('flame');if(!L||!this.ctx)return;L.g.gain.cancelScheduledValues(this.ctx.currentTime);L.g.gain.setValueAtTime(Math.max(.0001,L.g.gain.value),this.ctx.currentTime);L.g.gain.exponentialRampToValueAtTime(.0001,this.ctx.currentTime+.12);setTimeout(()=>{try{L.s.stop()}catch{}},180);this.loops.delete('flame');}
  flamePop(){this.ensure();this.noise({f:4500+rand(2800),end:2300,d:.018,g:.09,q:4});}
}

export class FXSystem{
  constructor(scene){
    this.scene=scene;this.particles=[];this.sparks=[];this.stains=[];
    this.softMat=new THREE.MeshPhysicalMaterial({color:0xe9d59c,roughness:.38,clearcoat:.35,transparent:true,opacity:.95});
    this.darkMat=new THREE.MeshStandardMaterial({color:0x2d1609,roughness:.75});
    this.smokeMat=new THREE.MeshBasicMaterial({color:0x51483d,transparent:true,opacity:.2,depthWrite:false});
    this.dropGeo=new THREE.SphereGeometry(1,7,5);
  }
  burst(pos,normal,count=8,power=.5,darkChance=.3){
    for(let i=0;i<count;i++){
      const m=new THREE.Mesh(this.dropGeo,Math.random()<darkChance?this.darkMat:this.softMat);
      const tangent=new THREE.Vector3(rand(-1,1),rand(.1,1),rand(-1,1)).normalize();
      tangent.addScaledVector(normal,.7).normalize();
      const r=rand(.008,.023);m.scale.set(r*rand(.7,1.7),r,r);m.position.copy(pos).addScaledVector(normal,.012);m.castShadow=true;this.scene.add(m);
      this.particles.push({m,v:tangent.multiplyScalar(rand(.18,.75)*power),life:rand(.45,1.1),spin:new THREE.Vector3(rand(-7,7),rand(-7,7),rand(-7,7)),kind:'drop'});
    }
  }
  shell(pos,normal,count=5,power=.5){
    for(let i=0;i<count;i++){
      const geo=new THREE.BoxGeometry(rand(.012,.035),rand(.004,.01),rand(.025,.065));
      const m=new THREE.Mesh(geo,this.darkMat);m.position.copy(pos).addScaledVector(normal,.01);m.rotation.set(rand(TAU),rand(TAU),rand(TAU));m.castShadow=true;this.scene.add(m);
      const v=new THREE.Vector3(rand(-1,1),rand(.2,1),rand(-1,1)).normalize().multiplyScalar(rand(.15,.6)*power);
      this.particles.push({m,v,life:rand(.55,1.25),spin:new THREE.Vector3(rand(-8,8),rand(-8,8),rand(-8,8)),kind:'shell'});
    }
  }
  smoke(pos,n=1){
    for(let i=0;i<n;i++){
      const m=new THREE.Mesh(new THREE.SphereGeometry(1,8,6),this.smokeMat.clone());const r=rand(.02,.045);m.scale.setScalar(r);m.position.copy(pos).add(new THREE.Vector3(rand(-.02,.02),rand(0,.025),rand(-.02,.02)));this.scene.add(m);
      this.particles.push({m,v:new THREE.Vector3(rand(-.03,.03),rand(.06,.13),rand(-.03,.03)),life:rand(.6,1.25),spin:new THREE.Vector3(),kind:'smoke'});
    }
  }
  spark(a,b){
    const pts=[a.clone()];const d=b.clone().sub(a),side=new THREE.Vector3(1,0,0);if(Math.abs(d.clone().normalize().dot(side))>.85)side.set(0,0,1);side.cross(d).normalize();
    for(let i=1;i<5;i++){const p=a.clone().addScaledVector(d,i/5).addScaledVector(side,rand(-.025,.025));p.y+=rand(-.015,.02);pts.push(p)}pts.push(b.clone());
    const g=new THREE.BufferGeometry().setFromPoints(pts),m=new THREE.LineBasicMaterial({color:0xdff4ff,transparent:true,opacity:1});const line=new THREE.Line(g,m);this.scene.add(line);this.sparks.push({line,life:.09});
  }
  stain(pos,size=.04,dark=false){
    const mat=new THREE.MeshBasicMaterial({color:dark?0x32180a:0xd9c18c,transparent:true,opacity:dark?.7:.55,depthWrite:false});
    const m=new THREE.Mesh(new THREE.CircleGeometry(1,18),mat);m.rotation.x=-Math.PI/2;m.rotation.z=rand(TAU);m.scale.set(size*rand(1,1.8),size*rand(.65,1.15),1);m.position.set(pos.x,.036,pos.z);this.scene.add(m);this.stains.push(m);
  }
  clear(){
    for(const p of this.particles){this.scene.remove(p.m);if(p.kind!=='drop')p.m.geometry?.dispose();if(p.m.material!==this.softMat&&p.m.material!==this.darkMat)p.m.material?.dispose()}
    for(const s of this.sparks){this.scene.remove(s.line);s.line.geometry.dispose();s.line.material.dispose()}
    for(const m of this.stains){this.scene.remove(m);m.geometry.dispose();m.material.dispose()}
    this.particles.length=this.sparks.length=this.stains.length=0;
  }
  update(dt){
    for(let i=this.particles.length-1;i>=0;i--){const p=this.particles[i];p.life-=dt;if(p.life<=0){if(p.kind==='drop'&&p.m.position.y<.09)this.stain(p.m.position,p.m.scale.x*1.5,p.m.material===this.darkMat);this.scene.remove(p.m);if(p.m.material!==this.softMat&&p.m.material!==this.darkMat)p.m.material?.dispose();if(p.kind!=='drop')p.m.geometry?.dispose();this.particles.splice(i,1);continue}
      if(p.kind==='smoke'){p.m.position.addScaledVector(p.v,dt);const k=Math.max(0,p.life);p.m.scale.multiplyScalar(1+dt*.7);p.m.material.opacity=.18*Math.min(1,k/.5);continue}
      p.v.y-=1.9*dt;p.m.position.addScaledVector(p.v,dt);p.m.rotation.x+=p.spin.x*dt;p.m.rotation.y+=p.spin.y*dt;p.m.rotation.z+=p.spin.z*dt;
      if(p.m.position.y<.035){p.m.position.y=.035;p.v.y=Math.abs(p.v.y)*.12;p.v.x*=.72;p.v.z*=.72;p.spin.multiplyScalar(.75)}
    }
    for(let i=this.sparks.length-1;i>=0;i--){const s=this.sparks[i];s.life-=dt;s.line.material.opacity=Math.max(0,s.life/.09);if(s.life<=0){this.scene.remove(s.line);s.line.geometry.dispose();s.line.material.dispose();this.sparks.splice(i,1)}}
  }
}

export class Workbench{
  constructor(canvas){
    this.canvas=canvas;
    this.renderer=new THREE.WebGLRenderer({canvas,antialias:true,powerPreference:'high-performance'});
    this.renderer.setPixelRatio(Math.min(devicePixelRatio||1,1.7));
    this.renderer.shadowMap.enabled=true;this.renderer.shadowMap.type=THREE.PCFSoftShadowMap;
    this.renderer.toneMapping=THREE.ACESFilmicToneMapping;this.renderer.toneMappingExposure=1.05;this.renderer.outputColorSpace=THREE.SRGBColorSpace;
    this.scene=new THREE.Scene();this.scene.background=new THREE.Color(0x9b7444);
    this.camera=new THREE.PerspectiveCamera(38,1,.01,30);this.camera.position.set(0,3.55,3.35);
    this.controls=new OrbitControls(this.camera,canvas);this.controls.target.set(0,.12,0);this.controls.enableDamping=true;this.controls.dampingFactor=.08;this.controls.enablePan=false;this.controls.minDistance=2.05;this.controls.maxDistance=5.6;this.controls.minPolarAngle=.18;this.controls.maxPolarAngle=1.35;
    this.controls.mouseButtons.LEFT=null;this.controls.mouseButtons.MIDDLE=THREE.MOUSE.DOLLY;this.controls.mouseButtons.RIGHT=THREE.MOUSE.ROTATE;
    this.controls.touches.ONE=null;this.controls.touches.TWO=THREE.TOUCH.DOLLY_ROTATE;
    this.raycaster=new THREE.Raycaster();this.ndc=new THREE.Vector2();this.clock=new THREE.Clock();this.time=0;
    this.dish={w:3.2,h:2.35,r:.25,y:.035};
    this.build();this.fx=new FXSystem(this.scene);this.resize();window.addEventListener('resize',()=>this.resize());
  }
  woodTexture(){return canvasTexture(1024,(g,S)=>{g.fillStyle='#a87843';g.fillRect(0,0,S,S);for(let y=0;y<S;y+=128){g.fillStyle=`hsl(${29+rand(-2,2)},${42+rand(-5,5)}%,${45+rand(-3,3)}%)`;g.fillRect(0,y,S,126);g.fillStyle='rgba(65,32,13,.22)';g.fillRect(0,y,3,S);for(let i=0;i<55;i++){g.strokeStyle=`rgba(61,32,14,${rand(.04,.16)})`;g.lineWidth=rand(.7,2.5);g.beginPath();let x=rand(S);g.moveTo(x,y+rand(126));for(let k=1;k<8;k++)g.lineTo(x+k*rand(18,45),y+rand(126));g.stroke()}}});}
  build(){
    const wood=new THREE.MeshStandardMaterial({map:this.woodTexture(),roughness:.58,metalness:.02});wood.map.wrapS=wood.map.wrapT=THREE.RepeatWrapping;wood.map.repeat.set(2.4,2.4);
    const table=new THREE.Mesh(new THREE.PlaneGeometry(8,7),wood);table.rotation.x=-Math.PI/2;table.receiveShadow=true;this.scene.add(table);
    const shape=roundedRectShape(this.dish.w,this.dish.h,this.dish.r);
    const baseMat=new THREE.MeshPhysicalMaterial({color:0xf0eadc,roughness:.55,clearcoat:.45,clearcoatRoughness:.35});
    const base=new THREE.Mesh(new THREE.ShapeGeometry(shape,28),baseMat);base.rotation.x=-Math.PI/2;base.position.y=.028;base.receiveShadow=true;this.scene.add(base);this.base=base;
    const glass=new THREE.MeshPhysicalMaterial({color:0xddeaf0,transparent:true,opacity:.28,roughness:.12,metalness:0,transmission:.15,side:THREE.DoubleSide,depthWrite:false});
    const h=.20,t=.025,w=this.dish.w,hz=this.dish.h;
    const walls=[];
    walls.push(new THREE.Mesh(new THREE.BoxGeometry(w-2*this.dish.r,h,t),glass));walls.at(-1).position.set(0,.12,-hz/2);
    walls.push(new THREE.Mesh(new THREE.BoxGeometry(w-2*this.dish.r,h,t),glass));walls.at(-1).position.set(0,.12,hz/2);
    walls.push(new THREE.Mesh(new THREE.BoxGeometry(t,h,hz-2*this.dish.r),glass));walls.at(-1).position.set(-w/2,.12,0);
    walls.push(new THREE.Mesh(new THREE.BoxGeometry(t,h,hz-2*this.dish.r),glass));walls.at(-1).position.set(w/2,.12,0);
    for(const sx of [-1,1])for(const sz of [-1,1]){const c=new THREE.Mesh(new THREE.CylinderGeometry(this.dish.r,this.dish.r,h,20,1,true,Math.atan2(sz,sx)-Math.PI/4,Math.PI/2),glass);c.position.set(sx*(w/2-this.dish.r),.12,sz*(hz/2-this.dish.r));this.scene.add(c);walls.push(c)}
    for(const q of walls){q.renderOrder=2;q.castShadow=false;this.scene.add(q)}this.walls=walls;
    const rimMat=new THREE.MeshStandardMaterial({color:0xe6dfd1,roughness:.3,metalness:.08});
    const pts=[];const seg=20;for(let i=0;i<=seg;i++){const a=i/seg*Math.PI/2;pts.push(new THREE.Vector3(w/2-this.dish.r+Math.cos(a)*this.dish.r,.23,hz/2-this.dish.r+Math.sin(a)*this.dish.r))}
    for(let i=0;i<=seg;i++){const a=Math.PI/2+i/seg*Math.PI/2;pts.push(new THREE.Vector3(-w/2+this.dish.r+Math.cos(a)*this.dish.r,.23,hz/2-this.dish.r+Math.sin(a)*this.dish.r))}
    for(let i=0;i<=seg;i++){const a=Math.PI+i/seg*Math.PI/2;pts.push(new THREE.Vector3(-w/2+this.dish.r+Math.cos(a)*this.dish.r,.23,-hz/2+this.dish.r+Math.sin(a)*this.dish.r))}
    for(let i=0;i<=seg;i++){const a=1.5*Math.PI+i/seg*Math.PI/2;pts.push(new THREE.Vector3(w/2-this.dish.r+Math.cos(a)*this.dish.r,.23,-hz/2+this.dish.r+Math.sin(a)*this.dish.r))}
    const curve=new THREE.CatmullRomCurve3(pts,true);const rim=new THREE.Mesh(new THREE.TubeGeometry(curve,110,.018,8,true),rimMat);rim.castShadow=true;this.scene.add(rim);
    const trayMat=new THREE.MeshStandardMaterial({color:0x575a5d,roughness:.32,metalness:.8});const tray=new THREE.Mesh(new THREE.BoxGeometry(1.3,.05,.34),trayMat);tray.position.set(0,.055,-1.55);tray.castShadow=true;tray.receiveShadow=true;this.scene.add(tray);
    const hemi=new THREE.HemisphereLight(0xfff6e7,0x6d4825,1.15);this.scene.add(hemi);
    const key=new THREE.DirectionalLight(0xfff2db,3.2);key.position.set(-2.5,5,2.8);key.castShadow=true;key.shadow.mapSize.set(1536,1536);Object.assign(key.shadow.camera,{left:-3,right:3,top:3,bottom:-3,near:.5,far:12});key.shadow.bias=-.0004;key.shadow.normalBias=.018;this.scene.add(key);
    const fill=new THREE.DirectionalLight(0xc7dcff,.85);fill.position.set(3,2,-2);this.scene.add(fill);
    const lamp=new THREE.SpotLight(0xffe4b6,38,7,.55,.52,1.1);lamp.position.set(1.6,4.2,1.5);lamp.target.position.set(0,0,0);lamp.castShadow=true;lamp.shadow.mapSize.set(1024,1024);this.scene.add(lamp,lamp.target);this.lamp=lamp;
  }
  insideDish(x,z,pad=.12){return Math.abs(x)<this.dish.w/2-pad&&Math.abs(z)<this.dish.h/2-pad;}
  clampDish(v,pad=.12){v.x=clamp(v.x,-this.dish.w/2+pad,this.dish.w/2-pad);v.z=clamp(v.z,-this.dish.h/2+pad,this.dish.h/2-pad);v.y=Math.max(.045,v.y);return v;}
  pointerNDC(x,y){const r=this.canvas.getBoundingClientRect();this.ndc.set((x-r.left)/r.width*2-1,-((y-r.top)/r.height)*2+1);return this.ndc;}
  ray(x,y,objects,recursive=true){this.raycaster.setFromCamera(this.pointerNDC(x,y),this.camera);return this.raycaster.intersectObjects(objects,recursive);}
  planePoint(x,y,height=.055){this.raycaster.setFromCamera(this.pointerNDC(x,y),this.camera);const p=new THREE.Vector3();const plane=new THREE.Plane(new THREE.Vector3(0,1,0),-height);return this.raycaster.ray.intersectPlane(plane,p)?p:null;}
  resize(){const w=innerWidth,h=innerHeight;this.renderer.setSize(w,h,false);this.renderer.setPixelRatio(Math.min(devicePixelRatio||1,1.7));this.camera.aspect=w/h;this.camera.updateProjectionMatrix();}
  update(dt){this.time+=dt;this.controls.update();this.fx.update(dt);}
  render(){this.renderer.render(this.scene,this.camera);}
}
