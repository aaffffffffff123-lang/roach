import {THREE,TAU,clamp,lerp,rand,damp,angleDamp,capsuleGeometry} from './specimen-core.js';

const V3=(x=0,y=0,z=0)=>new THREE.Vector3(x,y,z);
const Q=new THREE.Quaternion();

function shellMaterial(color=0x4a2611,rough=.48,clear=.5){
  return new THREE.MeshPhysicalMaterial({color,roughness:rough,metalness:0,clearcoat:clear,clearcoatRoughness:.28,emissive:0x000000,emissiveIntensity:0});
}
function tissueMaterial(color=0xe1cc91){return new THREE.MeshPhysicalMaterial({color,roughness:.42,clearcoat:.18,transparent:true,opacity:.98});}
function cloneMaterials(group){const out=[];group.traverse(o=>{if(o.isMesh){o.material=o.material.clone();out.push(o.material)}});return out;}
function setPartId(group,id){group.traverse(o=>{if(o.isMesh)o.userData.partId=id});}
function worldTransform(obj){const p=new THREE.Vector3(),q=new THREE.Quaternion(),s=new THREE.Vector3();obj.updateWorldMatrix(true,false);obj.matrixWorld.decompose(p,q,s);return{p,q,s};}
function makeEllipsoid(rx,ry,rz,mat,seg=28){const m=new THREE.Mesh(new THREE.SphereGeometry(1,seg,Math.max(10,Math.floor(seg*.55))),mat);m.scale.set(rx,ry,rz);m.castShadow=true;m.receiveShadow=true;return m;}
function makeTube(radius,length,mat,radial=9){const m=new THREE.Mesh(capsuleGeometry(radius,length,radial,5),mat);m.rotation.z=-Math.PI/2;m.position.x=length/2;m.castShadow=true;m.receiveShadow=true;return m;}
function makeDisc(radius,mat){const m=new THREE.Mesh(new THREE.CircleGeometry(radius,20),mat);m.rotation.y=Math.PI/2;return m;}
function curveWingGeometry(len=.9,width=.28){
  const s=new THREE.Shape();s.moveTo(0,0);s.bezierCurveTo(width*.65,.02,width,len*.55,width*.2,len);s.bezierCurveTo(.02,len*1.04,-width*.08,len*.45,0,0);return new THREE.ExtrudeGeometry(s,{depth:.018,bevelEnabled:true,bevelSize:.006,bevelThickness:.004,bevelSegments:2,curveSegments:18});
}
function mandibleGeometry(side=1){
  const s=new THREE.Shape();s.moveTo(0,0);s.lineTo(side*.16,.02);s.lineTo(side*.2,.13);s.lineTo(side*.07,.18);s.lineTo(0,.08);s.closePath();return new THREE.ExtrudeGeometry(s,{depth:.055,bevelEnabled:true,bevelSize:.008,bevelThickness:.006,bevelSegments:2});
}

export class SpecimenRoach{
  constructor(app){
    this.app=app;this.scene=app.scene;this.fx=app.fx;this.audio=app.audio;this.workbench=app.workbench;
    this.root=new THREE.Group();this.root.name='specimenRoot';this.root.position.set(0,.065,.05);this.scene.add(this.root);
    this.parts=new Map();this.selectables=[];this.looseRoots=[];this.pins=[];this.pinSeq=1;this.fragmentSeq=1;this.marks=[];this.hoverPart=null;this.threat=null;
    this.vitals={alive:true,awareness:1,headCore:1,thoraxCore:1,abdomenCore:1,shock:0,heat:0,fatigue:0,mobility:1,reflex:1};
    this.gait=rand(TAU);this.wriggle=rand(TAU);this.fear=.45;this.dir=rand(TAU);this.dirT=rand(.4,1.5);this.rootVel=V3();this.rootYaw=0;this.toolContact=0;this.detachedCount=0;
    this.legChains=[];this.antennaChains=[];this.abdomen=[];this.coreParts=[];this.build();this.captureBases();
  }
  mat(kind='shell'){
    if(kind==='eye')return shellMaterial(0x170b06,.22,.9);
    if(kind==='joint')return shellMaterial(0x281208,.68,.2);
    if(kind==='wing')return new THREE.MeshPhysicalMaterial({color:0x6b3b18,roughness:.35,clearcoat:.65,clearcoatRoughness:.23,transparent:true,opacity:.78,side:THREE.DoubleSide,emissive:0x000000});
    if(kind==='hindwing')return new THREE.MeshPhysicalMaterial({color:0xc69d5e,roughness:.46,transparent:true,opacity:.36,side:THREE.DoubleSide,depthWrite:false,emissive:0x000000});
    if(kind==='tissue')return tissueMaterial();
    if(kind==='nerve')return new THREE.MeshStandardMaterial({color:0xf0dca8,roughness:.52,emissive:0x2b1707,emissiveIntensity:.06});
    return shellMaterial();
  }
  register(id,label,kind,group,{parentId=null,strength=.7,linear=null,vital=0,cuttable=true}={}){
    if(this.parts.has(id))throw new Error(`duplicate part ${id}`);
    const materials=cloneMaterials(group);
    const part={id,label,kind,group,parentId,children:[],strength,linear,vital,cuttable,attached:true,bodyAttached:true,detachedRoot:false,anchored:0,integrity:1,scoreDepth:0,crack:0,puncture:0,burn:0,crush:0,leak:0,nerve:1,twitch:0,marks:[],fragmentLevel:0,materials,baseColors:materials.map(m=>m.color?m.color.clone():null),baseRough:materials.map(m=>m.roughness??.5),basePos:null,baseQuat:null,baseScale:null,mesh:linear?.mesh||null,distal:linear?.distal||null};
    this.parts.set(id,part);if(parentId&&this.parts.has(parentId))this.parts.get(parentId).children.push(id);setPartId(group,id);group.userData.partId=id;group.userData.partRef=part;
    group.traverse(o=>{if(o.isMesh){this.selectables.push(o);o.castShadow=true}});
    return part;
  }
  captureBases(){for(const p of this.parts.values()){p.basePos=p.group.position.clone();p.baseQuat=p.group.quaternion.clone();p.baseScale=p.group.scale.clone();}}
  build(){
    this.buildThorax();this.buildAbdomen();this.buildHead();this.buildWings();this.buildLegs();this.buildCerci();
  }
  buildAbdomen(){
    const z0=-.24;
    for(let i=0;i<10;i++){
      const t=i/9,z=z0-i*.105,w=lerp(.38,.17,Math.pow(t,1.35)),len=.17,h=lerp(.14,.08,t);
      const g=new THREE.Group();g.position.set(0,0,z);this.root.add(g);
      const mat=shellMaterial(i%2?0x4b2611:0x542b13,.5,.45);const shell=makeEllipsoid(w,h,len,mat,30);shell.position.y=.075;g.add(shell);
      const seam=new THREE.Mesh(new THREE.TorusGeometry(w*.88,.009,6,28,Math.PI),shellMaterial(0x211006,.72,.15));seam.rotation.set(Math.PI/2,0,Math.PI/2);seam.scale.z=len/w;seam.position.set(0,.085,len*.16);g.add(seam);
      const vent=makeEllipsoid(w*.85,h*.42,len*.82,shellMaterial(0x6b3a1b,.7,.2),22);vent.position.y=.035;g.add(vent);
      const id=`abdomen_${String(i+1).padStart(2,'0')}`;const p=this.register(id,`배 ${i+1}마디`,'abdomen',g,{parentId:i?`abdomen_${String(i).padStart(2,'0')}`:'metathorax',strength:.82-i*.025,vital:i<3?.08:.045});
      p.segmentIndex=i;p.localHalf=V3(w,h,len);this.abdomen.push(p);this.coreParts.push(p);
      const tissue=makeEllipsoid(w*.67,h*.45,len*.58,this.mat('tissue'),18);tissue.position.y=.067;tissue.visible=false;tissue.userData.internal=true;g.add(tissue);p.tissue=tissue;
    }
  }
  buildThorax(){
    const specs=[
      ['metathorax','뒷가슴','thorax',-.10,.37,.16,.25,0x43210f,.95,.23],
      ['mesothorax','가운데가슴','thorax',.13,.36,.17,.24,0x4b2611,.92,.25],
      ['prothorax','앞가슴','thorax',.36,.34,.18,.23,0x3f1e0d,.92,.27]
    ];
    for(const [id,label,kind,z,rx,ry,rz,col,str,vital] of specs){const g=new THREE.Group();g.position.set(0,0,z);this.root.add(g);const m=makeEllipsoid(rx,ry,rz,shellMaterial(col,.45,.55),32);m.position.y=.085;g.add(m);const vent=makeEllipsoid(rx*.84,ry*.4,rz*.85,shellMaterial(0x673617,.7,.18),24);vent.position.y=.035;g.add(vent);const p=this.register(id,label,kind,g,{strength:str,vital});p.localHalf=V3(rx,ry,rz);this.coreParts.push(p);const tissue=makeEllipsoid(rx*.65,ry*.42,rz*.58,this.mat('tissue'),20);tissue.position.y=.075;tissue.visible=false;g.add(tissue);p.tissue=tissue;}
    const pg=new THREE.Group();pg.position.set(0,.025,.46);this.root.add(pg);const plate=makeEllipsoid(.43,.14,.31,shellMaterial(0x351809,.39,.7),36);plate.position.y=.14;plate.rotation.x=-.05;pg.add(plate);const rim=new THREE.Mesh(new THREE.TorusGeometry(.36,.015,7,38),shellMaterial(0x6c4323,.58,.35));rim.rotation.x=Math.PI/2;rim.scale.z=.72;rim.position.y=.13;pg.add(rim);const p=this.register('pronotum','앞가슴등판','plate',pg,{parentId:'prothorax',strength:1.12,vital:.08});p.localHalf=V3(.43,.14,.31);
  }
  buildHead(){
    const g=new THREE.Group();g.position.set(0,.06,.72);g.rotation.x=-.12;this.root.add(g);
    const cap=makeEllipsoid(.28,.22,.25,shellMaterial(0x3b1b0b,.43,.62),34);cap.position.y=.11;g.add(cap);
    const face=makeEllipsoid(.22,.16,.18,shellMaterial(0x4a2511,.52,.48),28);face.position.set(0,.06,.14);g.add(face);
    const p=this.register('head_capsule','머리 외피','head',g,{parentId:'prothorax',strength:.88,vital:.55});p.localHalf=V3(.28,.22,.25);this.coreParts.push(p);
    const tissue=makeEllipsoid(.17,.12,.14,this.mat('tissue'),20);tissue.position.set(0,.08,.08);tissue.visible=false;g.add(tissue);p.tissue=tissue;
    for(const side of [-1,1]){
      const eg=new THREE.Group();eg.position.set(side*.225,.145,.075);eg.rotation.y=side*.48;g.add(eg);const eye=makeEllipsoid(.095,.125,.105,this.mat('eye'),24);eye.scale.x=.82;eg.add(eye);
      const facetMat=new THREE.MeshPhysicalMaterial({color:0x27100a,roughness:.24,clearcoat:.85,emissive:0x120402,emissiveIntensity:.14});
      for(let r=0;r<5;r++)for(let c=0;c<5;c++){const yy=(r-2)*.035,zz=(c-2)*.031;if((r-2)**2+(c-2)**2>6.5)continue;const bead=new THREE.Mesh(new THREE.SphereGeometry(.012,7,5),facetMat);bead.position.set(side*.077,yy,zz);bead.scale.set(.48,1,1);eg.add(bead)}
      const id=side<0?'eye_L':'eye_R';const ep=this.register(id,side<0?'왼쪽 겹눈':'오른쪽 겹눈','eye',eg,{parentId:'head_capsule',strength:.48,vital:.03});ep.localHalf=V3(.09,.125,.105);
      const optic=new THREE.Mesh(new THREE.CylinderGeometry(.018,.012,.12,8),this.mat('nerve'));optic.rotation.z=Math.PI/2;optic.position.x=-side*.06;optic.visible=false;eg.add(optic);ep.optic=optic;
    }
    for(const side of [-1,1]){
      const mg=new THREE.Group();mg.position.set(side*.105,.035,.245);mg.rotation.y=side*.12;g.add(mg);const mesh=new THREE.Mesh(mandibleGeometry(side),shellMaterial(0x211006,.55,.3));mesh.rotation.x=-Math.PI/2;mesh.position.z=-.02;mg.add(mesh);const id=side<0?'mandible_L':'mandible_R';const mp=this.register(id,side<0?'왼쪽 큰턱':'오른쪽 큰턱','mandible',mg,{parentId:'head_capsule',strength:.58,vital:.02});mp.localHalf=V3(.12,.07,.12);
    }
    for(const side of [-1,1]){
      const x=side*.145;this.buildPalp(g,side<0?'maxillary_palp_L':'maxillary_palp_R',side<0?'왼쪽 작은턱수염':'오른쪽 작은턱수염',x,.015,.23,5,.055,side*.34,'head_capsule');
      this.buildPalp(g,side<0?'labial_palp_L':'labial_palp_R',side<0?'왼쪽 아랫입술수염':'오른쪽 아랫입술수염',side*.075,.008,.265,3,.045,side*.20,'head_capsule');
    }
    for(const side of [-1,1])this.buildAntenna(g,side);
  }
  buildPalp(parent,prefix,label,x,y,z,count,len,yaw,parentId){
    let host=parent,lastId=parentId;const chain=[];
    for(let i=0;i<count;i++){
      const pg=new THREE.Group();pg.position.set(i?0:x,i?0:y,i?0:z);pg.rotation.y=i?rand(-.08,.08):yaw;host.add(pg);const mesh=makeTube(.014-i*.0015,len,shellMaterial(0x301407,.62,.25),7);pg.add(mesh);const distal=new THREE.Object3D();distal.position.x=len;pg.add(distal);const id=`${prefix}_${i}`;const p=this.register(id,`${label} ${i+1}마디`,'palp',pg,{parentId:lastId,strength:.22,linear:{mesh,distal,length:len,radius:.014-i*.0015}});chain.push(p);host=distal;lastId=id;
    }
    return chain;
  }
  buildAntenna(head,side){
    let host=head,lastId='head_capsule';const chain=[];const prefix=side<0?'antenna_L':'antenna_R';
    for(let i=0;i<12;i++){
      const len=lerp(.10,.065,i/11),r=lerp(.012,.0045,i/11);const g=new THREE.Group();
      if(i===0){g.position.set(side*.115,.19,.225);g.rotation.y=side*-.42;g.rotation.z=side*-.08}else{g.position.x=0;g.rotation.y=side*(.03+.015*i);g.rotation.z=Math.sin(i*.8)*.025}
      host.add(g);const mesh=makeTube(r,len,shellMaterial(0x261006,.64,.2),7);g.add(mesh);const distal=new THREE.Object3D();distal.position.x=len;g.add(distal);const id=`${prefix}_${String(i).padStart(2,'0')}`;const p=this.register(id,`${side<0?'왼쪽':'오른쪽'} 더듬이 ${i+1}마디`,'antenna',g,{parentId:lastId,strength:lerp(.28,.10,i/11),linear:{mesh,distal,length:len,radius:r}});p.chainIndex=i;p.side=side;chain.push(p);host=distal;lastId=id;
    }
    this.antennaChains.push(chain);
  }
  buildWings(){
    for(const side of [-1,1]){
      const hg=new THREE.Group();hg.position.set(side*.07,.14,.13);hg.rotation.y=side*.035;this.root.add(hg);const hm=new THREE.Mesh(curveWingGeometry(.82,.28),this.mat('hindwing'));hm.rotation.x=-Math.PI/2;hm.rotation.z=side<0?Math.PI:0;hm.position.x=side*.01;hg.add(hm);const hid=side<0?'hindwing_L':'hindwing_R';const hp=this.register(hid,side<0?'왼쪽 속날개':'오른쪽 속날개','hindwing',hg,{parentId:'metathorax',strength:.26});hp.localHalf=V3(.28,.02,.82);
      const g=new THREE.Group();g.position.set(side*.035,.18,.30);g.rotation.y=side*.018;this.root.add(g);const m=new THREE.Mesh(curveWingGeometry(1.02,.30),this.mat('wing'));m.rotation.x=-Math.PI/2;m.rotation.z=side<0?Math.PI:0;m.position.x=side*.02;g.add(m);for(let i=1;i<5;i++){const vein=new THREE.Mesh(new THREE.BoxGeometry(.008,.006,.72-i*.07),shellMaterial(0x3d1b0b,.7,.15));vein.position.set(side*(.03+i*.038),.012,-.32+i*.025);vein.rotation.y=side*(.03*i);g.add(vein)}const id=side<0?'tegmen_L':'tegmen_R';const p=this.register(id,side<0?'왼쪽 앞날개':'오른쪽 앞날개','wing',g,{parentId:'mesothorax',strength:.36});p.localHalf=V3(.30,.03,1.02);
    }
  }
  buildLegs(){
    const rows=[
      {tag:'F',name:'앞',z:.34,yawR:-.52,yawL:Math.PI+.52,lens:[.16,.09,.42,.50,.13,.10,.085,.072,.06]},
      {tag:'M',name:'가운데',z:.04,yawR:-.02,yawL:Math.PI+.02,lens:[.17,.09,.48,.56,.14,.11,.09,.075,.062]},
      {tag:'H',name:'뒤',z:-.30,yawR:.52,yawL:Math.PI-.52,lens:[.18,.10,.59,.69,.17,.13,.105,.086,.07]}
    ];
    for(const row of rows)for(const side of [-1,1])this.buildLeg(row,side);
  }
  buildLeg(row,side){
    const sideTag=side<0?'L':'R',prefix=`${sideTag}${row.tag}`,labelSide=side<0?'왼쪽':'오른쪽';
    const names=['coxa','trochanter','femur','tibia','tarsus_1','tarsus_2','tarsus_3','tarsus_4','tarsus_5'];
    const labels=['밑마디','도래마디','넓적다리','종아리','첫째 발마디','둘째 발마디','셋째 발마디','넷째 발마디','다섯째 발마디'];
    let host=this.root,lastId=row.tag==='F'?'prothorax':row.tag==='M'?'mesothorax':'metathorax';const chain=[];
    for(let i=0;i<names.length;i++){
      const len=row.lens[i],radius=i<2?.045:i===2?.055:i===3?.032:lerp(.024,.010,(i-4)/5);
      const g=new THREE.Group();
      if(i===0){g.position.set(side*.24,.09,row.z);g.rotation.y=side>0?row.yawR:row.yawL;g.rotation.z=-.18}
      else{g.position.x=0;g.rotation.y=(i===1?side*.10:i===2?side*.16:i===3?side*-.24:side*.04);g.rotation.z=i===1?-.15:i===2?.18:i===3?-.46:i<6?.18:.08}
      host.add(g);const mat=i<2?this.mat('joint'):shellMaterial(i===3?0x3a1a0b:0x45210f,.58,.32);const mesh=makeTube(radius,len,mat,i<4?9:7);g.add(mesh);
      if(i===3){for(let s=1;s<=7;s++){const px=len*(s/8),sp=side*(s%2?1:-1);const cone=new THREE.Mesh(new THREE.ConeGeometry(.012,.09,5),shellMaterial(0x241006,.7,.15));cone.rotation.z=sp*Math.PI/2;cone.position.set(px,sp*.035,0);g.add(cone)}}
      const distal=new THREE.Object3D();distal.position.x=len;g.add(distal);const id=`${prefix}_${names[i]}`;const p=this.register(id,`${labelSide} ${row.name}다리 ${labels[i]}`,'leg',g,{parentId:lastId,strength:i<2?.70:i===2?.82:i===3?.68:lerp(.35,.14,(i-4)/5),linear:{mesh,distal,length:len,radius}});p.side=side;p.row=row.tag;p.segmentIndex=i;chain.push(p);host=distal;lastId=id;
    }
    const last=chain.at(-1);for(const clawSide of [-1,1]){const g=new THREE.Group();g.position.set(0,clawSide*.008,0);g.rotation.z=clawSide*.45;last.linear.distal.add(g);const tor=new THREE.Mesh(new THREE.TorusGeometry(.038,.006,5,12,Math.PI*.8),shellMaterial(0x1c0c05,.7,.1));tor.rotation.y=Math.PI/2;g.add(tor);const id=`${prefix}_claw_${clawSide<0?'A':'B'}`;const p=this.register(id,`${labelSide} ${row.name}다리 발톱 ${clawSide<0?'안쪽':'바깥쪽'}`,'claw',g,{parentId:last.id,strength:.10});p.side=side;p.row=row.tag;chain.push(p)}
    this.legChains.push({prefix,row:row.tag,side,parts:chain,phase:(row.tag==='M'?Math.PI:0)+(side<0?Math.PI:0)});
  }
  buildCerci(){
    for(const side of [-1,1]){
      let host=this.root,lastId='abdomen_10';const chain=[];
      for(let i=0;i<6;i++){
        const len=lerp(.085,.045,i/5),r=lerp(.012,.004,i/5),g=new THREE.Group();
        if(i===0){g.position.set(side*.09,.065,-1.18);g.rotation.y=side*(Math.PI*.35)}else{g.position.x=0;g.rotation.y=side*.06}
        host.add(g);const mesh=makeTube(r,len,shellMaterial(0x2c1407,.65,.18),6);g.add(mesh);const distal=new THREE.Object3D();distal.position.x=len;g.add(distal);const id=`cercus_${side<0?'L':'R'}_${i}`;const p=this.register(id,`${side<0?'왼쪽':'오른쪽'} 꼬리감각기관 ${i+1}마디`,'cercus',g,{parentId:lastId,strength:lerp(.20,.08,i/5),linear:{mesh,distal,length:len,radius:r}});p.side=side;p.chainIndex=i;chain.push(p);host=distal;lastId=id;
      }
    }
  }
  partFromObject(o){while(o){if(o.userData?.partId&&this.parts.has(o.userData.partId))return this.parts.get(o.userData.partId);o=o.parent}return null;}
  raycastObjects(){return this.selectables.filter(o=>o.visible&&o.parent);}
  getPartState(part){
    const bits=[];if(!part.bodyAttached)bits.push('분리됨');if(part.anchored)bits.push(`핀 ${part.anchored}`);if(part.scoreDepth>.08)bits.push(`칼집 ${Math.round(part.scoreDepth*100)}%`);if(part.crack>.08)bits.push(`균열 ${Math.round(part.crack*100)}%`);if(part.puncture>.08)bits.push(`파손점 ${Math.round(part.puncture*100)}%`);if(part.burn>.08)bits.push(`열손상 ${Math.round(part.burn*100)}%`);if(part.integrity<.98)bits.push(`외피 ${Math.max(0,Math.round(part.integrity*100))}%`);return bits.length?bits.join(' · '):'외피와 연결부가 멀쩡함';
  }
  setHighlight(part){
    if(this.hoverPart===part)return;if(this.hoverPart)this.applyHighlight(this.hoverPart,false);this.hoverPart=part;if(part)this.applyHighlight(part,true);
  }
  applyHighlight(part,on){for(let i=0;i<part.materials.length;i++){const m=part.materials[i];if(!m?.emissive)continue;m.emissive.set(on?0x5f3010:0x000000);m.emissiveIntensity=on?.32:0}}
  localHit(part,worldPoint,worldNormal){
    const p=part.group.worldToLocal(worldPoint.clone());const inv=part.group.getWorldQuaternion(new THREE.Quaternion()).invert();const n=worldNormal.clone().applyQuaternion(inv).normalize();return{p,n};
  }
  markCircle(part,localPoint,localNormal,r,color,opacity=.9){
    const mat=new THREE.MeshBasicMaterial({color,transparent:opacity<1,opacity,depthWrite:false,side:THREE.DoubleSide});const m=new THREE.Mesh(new THREE.CircleGeometry(r,20),mat);m.position.copy(localPoint).addScaledVector(localNormal,.004);m.quaternion.setFromUnitVectors(V3(0,0,1),localNormal);part.group.add(m);part.marks.push({mesh:m,type:'circle'});return m;
  }
  addPuncture(part,worldPoint,worldNormal,amount=.25){
    const {p,n}=this.localHit(part,worldPoint,worldNormal);part.puncture=clamp(part.puncture+amount,0,1);part.crack=clamp(part.crack+amount*.45,0,1);part.integrity=clamp(part.integrity-amount*.11,0,1);part.leak=clamp(part.leak+amount*.18,0,1);
    const r=.018+.026*part.puncture;this.markCircle(part,p,n,r,0x1e0d06,.92);
    const crackMat=new THREE.LineBasicMaterial({color:0x1b0b04,transparent:true,opacity:.82});for(let i=0;i<3+Math.floor(part.puncture*3);i++){const a=rand(TAU),len=rand(.03,.07)*(1+part.puncture),tangent=V3(Math.cos(a),0,Math.sin(a));if(Math.abs(n.y)<.75)tangent.cross(n).normalize();const pts=[p.clone().addScaledVector(n,.006),p.clone().addScaledVector(n,.006).addScaledVector(tangent,len)];const l=new THREE.Line(new THREE.BufferGeometry().setFromPoints(pts),crackMat.clone());part.group.add(l);part.marks.push({mesh:l,type:'crack'})}
    this.damageCore(part,amount*.035);this.refreshVisual(part);if(part.puncture>.5){this.fx.burst(worldPoint,worldNormal,3+Math.floor(amount*8),.28,.35);this.fx.stain(worldPoint,.018+.018*amount,false)}
  }
  addScore(part,localPoints,worldPoint,worldNormal){
    if(localPoints.length<2)return 0;const center=localPoints.reduce((a,p)=>a.add(p),V3()).multiplyScalar(1/localPoints.length);let mark=part.marks.find(m=>m.type==='score'&&m.center.distanceTo(center)<.09);
    if(mark){mark.depth=clamp(mark.depth+.27,0,1);part.group.remove(mark.outer);part.group.remove(mark.inner);mark.outer.geometry.dispose();mark.outer.material.dispose();if(mark.inner){mark.inner.geometry.dispose();mark.inner.material.dispose()}}
    else{mark={type:'score',center:center.clone(),depth:.24,points:localPoints.map(p=>p.clone())};part.marks.push(mark)}
    mark.points=localPoints.map(p=>p.clone());const curve=new THREE.CatmullRomCurve3(mark.points,false,'centripetal');const outer=new THREE.Mesh(new THREE.TubeGeometry(curve,Math.max(6,mark.points.length*2),.006+.006*mark.depth,5,false),new THREE.MeshBasicMaterial({color:0x1a0904,depthWrite:false}));part.group.add(outer);mark.outer=outer;
    if(mark.depth>.48){const inner=new THREE.Mesh(new THREE.TubeGeometry(curve,Math.max(6,mark.points.length*2),.0025+.004*mark.depth,5,false),new THREE.MeshBasicMaterial({color:mark.depth>.78?0xe6d39b:0x8d542a,depthWrite:false}));part.group.add(inner);mark.inner=inner}
    part.scoreDepth=clamp(part.scoreDepth+.14+.16*mark.depth,0,1);part.crack=clamp(part.crack+.08*mark.depth,0,1);part.integrity=clamp(part.integrity-.035-.05*mark.depth,0,1);part.leak=clamp(part.leak+.05*Math.max(0,mark.depth-.4),0,1);this.damageCore(part,.018*mark.depth);this.refreshVisual(part);
    if(mark.depth>.7){this.fx.burst(worldPoint,worldNormal,2+Math.floor(mark.depth*3),.22,.25);this.fx.stain(worldPoint,.012+.015*mark.depth,false)}
    return mark.depth;
  }
  addScorch(part,worldPoint,worldNormal,amount){
    const {p,n}=this.localHit(part,worldPoint,worldNormal);part.burn=clamp(part.burn+amount,0,1);part.integrity=clamp(part.integrity-amount*.025,0,1);this.vitals.heat=clamp(this.vitals.heat+amount*.025,0,1);this.refreshVisual(part);if(Math.random()<amount*2)this.markCircle(part,p,n,.018+part.burn*.045,part.burn>.65?0x120b07:0x4a2411,.25+.45*part.burn);if(part.kind==='wing'||part.kind==='hindwing'||part.kind==='antenna')part.group.scale.multiplyScalar(1-amount*.008);this.damageCore(part,amount*.006);
  }
  refreshVisual(part){
    for(let i=0;i<part.materials.length;i++){const m=part.materials[i],base=part.baseColors[i];if(!m?.color||!base)continue;const c=base.clone();if(part.burn>0)c.lerp(new THREE.Color(part.burn>.72?0x0f0b08:0x3a1a0e),part.burn*.88);else if(part.crack>.3)c.lerp(new THREE.Color(0x2c1208),part.crack*.22);m.color.copy(c);if('roughness'in m)m.roughness=clamp(part.baseRough[i]+part.burn*.35+part.crack*.08,.15,1)}
    if(part.tissue)part.tissue.visible=part.integrity<.55||part.crack>.72||part.puncture>.72;
    if(part.optic)part.optic.visible=!part.bodyAttached||part.integrity<.45;
  }
  damageCore(part,amount){
    if(!part.vital)return;if(part.kind==='head'||part.kind==='eye'||part.kind==='mandible')this.vitals.headCore=clamp(this.vitals.headCore-amount*part.vital,0,1);else if(part.kind==='thorax'||part.kind==='plate'||part.kind==='leg')this.vitals.thoraxCore=clamp(this.vitals.thoraxCore-amount*part.vital,0,1);else if(part.kind==='abdomen')this.vitals.abdomenCore=clamp(this.vitals.abdomenCore-amount*part.vital,0,1);
    if(this.vitals.thoraxCore<.03&&this.vitals.abdomenCore<.06)this.vitals.alive=false;
  }
  getSubtree(part){const out=[];const walk=p=>{out.push(p);for(const id of p.children){const c=this.parts.get(id);if(c)walk(c)}};walk(part);return out;}
  subtreeAnchors(part){return this.getSubtree(part).reduce((n,p)=>n+p.anchored,0);}
  addStump(parentPart,worldPoint,size=.035,clean=false){
    if(!parentPart)return;const lp=parentPart.group.worldToLocal(worldPoint.clone());const mat1=new THREE.MeshBasicMaterial({color:0x241006,side:THREE.DoubleSide}),mat2=new THREE.MeshPhysicalMaterial({color:clean?0xddc98f:0xc6a76c,roughness:.44,clearcoat:.18});const g=new THREE.Group();g.position.copy(lp);const outer=new THREE.Mesh(new THREE.SphereGeometry(size,12,8),mat1);outer.scale.set(1,.35,1);g.add(outer);const inner=new THREE.Mesh(new THREE.SphereGeometry(size*.62,10,7),mat2);inner.scale.set(1,.4,1);inner.position.y=.004;g.add(inner);parentPart.group.add(g);parentPart.marks.push({type:'stump',mesh:g});parentPart.leak=clamp(parentPart.leak+.2,0,1);
  }
  detachPart(part,{cause='tear',impulse=null,point=null}={}){
    if(!part||part.detachedRoot||!part.group.parent)return false;if(part.anchored>0)return false;
    const parent=part.parentId?this.parts.get(part.parentId):null;const jointWorld=point?.clone()||part.group.getWorldPosition(V3());
    this.scene.attach(part.group);part.detachedRoot=true;part.attached=false;if(parent)parent.children=parent.children.filter(id=>id!==part.id);const subtree=this.getSubtree(part);for(const p of subtree)p.bodyAttached=false;this.detachedCount++;
    const rec={part,group:part.group,v:impulse?.clone()||V3(rand(-.18,.18),rand(.06,.24),rand(-.18,.18)),w:V3(rand(-4,4),rand(-4,4),rand(-4,4)),twitch:1.8+rand(1.2),sleep:false};this.looseRoots.push(rec);
    if(parent)this.addStump(parent,jointWorld,part.linear?part.linear.radius*1.15:.04,cause!=='tear');this.addDetachedFace(part,cause);
    const n=V3(rand(-1,1),rand(.2,1),rand(-1,1)).normalize();this.fx.burst(jointWorld,n,cause==='tear'?7:4,.55,cause==='tear'?.38:.24);this.fx.shell(jointWorld,n,cause==='tear'?5:3,.45);this.fx.stain(jointWorld,.025+.02*part.strength,false);this.damageCore(part,.10);
    return true;
  }
  addDetachedFace(part,cause){
    const r=part.linear?part.linear.radius*1.15:.035;const mat=new THREE.MeshPhysicalMaterial({color:cause==='tear'?0xc9ae76:0xe0c98d,roughness:.42,clearcoat:.18});const face=makeDisc(r,mat);face.position.set(0,0,0);part.group.add(face);part.marks.push({type:'cutface',mesh:face});
  }
  midCut(part,ratio=.52,cause='clipper'){
    if(!part?.linear||part.detachedRoot||!part.group.parent||part.anchored>0)return false;const L=part.linear.length;if(L<.045)return this.detachPart(part,{cause});ratio=clamp(ratio,.28,.72);const cutLocal=V3(L*ratio,0,0),cutWorld=part.group.localToWorld(cutLocal.clone());
    const oldDistal=part.linear.distal,childObjs=[...oldDistal.children];const wt=worldTransform(part.group);const fg=new THREE.Group();fg.position.copy(cutWorld);fg.quaternion.copy(wt.q);this.scene.add(fg);
    const remain=L*(1-ratio),mesh=makeTube(part.linear.radius,remain,part.materials[0]?.clone()||shellMaterial(),7);fg.add(mesh);
    const newId=`${part.id}_fragment_${this.fragmentSeq++}`;const frag=this.register(newId,`${part.label} 잘린 조각`,'fragment',fg,{strength:part.strength*.55,linear:{mesh,distal:new THREE.Object3D(),length:remain,radius:part.linear.radius},cuttable:true});frag.bodyAttached=false;frag.attached=false;frag.detachedRoot=true;frag.fragmentLevel=part.fragmentLevel+1;fg.add(frag.linear.distal);frag.linear.distal.position.x=remain;
    part.children=[];for(const ch of childObjs){fg.attach(ch);const cp=this.partFromObject(ch);if(cp){cp.parentId=newId;if(!frag.children.includes(cp.id))frag.children.push(cp.id)}}
    const newLen=L*ratio;part.linear.length=newLen;part.linear.mesh.geometry.dispose();part.linear.mesh.geometry=capsuleGeometry(part.linear.radius,newLen,7,5);part.linear.mesh.rotation.z=-Math.PI/2;part.linear.mesh.position.x=newLen/2;part.linear.distal.position.x=newLen;
    this.looseRoots.push({part:frag,group:fg,v:V3(rand(-.12,.12),rand(.05,.18),rand(-.12,.12)),w:V3(rand(-5,5),rand(-5,5),rand(-5,5)),twitch:1.5+rand(1.5),sleep:false});this.detachedCount++;
    this.addStump(part,cutWorld,part.linear.radius*1.1,cause!=='tear');this.addDetachedFace(frag,cause);const n=V3(rand(-1,1),rand(.2,1),rand(-1,1)).normalize();this.fx.burst(cutWorld,n,5,.42,.28);this.fx.shell(cutWorld,n,4,.4);this.fx.stain(cutWorld,.022,false);part.integrity=clamp(part.integrity-.28,0,1);this.refreshVisual(part);return true;
  }
  nearestCutCandidate(part,worldPoint){
    if(!part?.cuttable)return null;const list=[];const base=part.group.getWorldPosition(V3());list.push({type:'joint',point:base,part,strength:part.strength,label:`${part.label} 연결부`});if(part.linear&&part.linear.length>.065){for(const ratio of [.38,.62])list.push({type:'mid',ratio,point:part.group.localToWorld(V3(part.linear.length*ratio,0,0)),part,strength:part.strength*.78,label:`${part.label} 중간`})}
    if(part.kind==='eye'||part.kind==='mandible'||part.kind==='wing'||part.kind==='hindwing')list.push({type:'joint',point:base,part,strength:part.strength,label:part.label});
    list.sort((a,b)=>a.point.distanceToSquared(worldPoint)-b.point.distanceToSquared(worldPoint));return list[0];
  }
  clipCandidate(cand){
    if(!cand)return false;const p=cand.part;if(['plate','thorax','abdomen','head'].includes(p.kind)&&!p.linear){p.crack=clamp(p.crack+.28,0,1);p.integrity=clamp(p.integrity-.07,0,1);this.refreshVisual(p);this.fx.shell(cand.point,V3(0,1,0),3,.3);if(p.crack>.78){p.tissue&&(p.tissue.visible=true);this.fx.burst(cand.point,V3(0,1,0),3,.28,.25)}this.damageCore(p,.035);return'crack'}
    if(cand.type==='mid')return this.midCut(p,cand.ratio,'clipper');return this.detachPart(p,{cause:'clipper',point:cand.point});
  }
  addPin(part,point){
    if(this.pins.length>=6)return null;const g=new THREE.Group(),shaftMat=new THREE.MeshStandardMaterial({color:0xbfc5c9,roughness:.22,metalness:.9}),headMat=new THREE.MeshPhysicalMaterial({color:0x9c2d24,roughness:.28,clearcoat:.75});const shaft=new THREE.Mesh(new THREE.CylinderGeometry(.009,.006,.42,10),shaftMat);shaft.position.y=.18;shaft.castShadow=true;g.add(shaft);const head=new THREE.Mesh(new THREE.SphereGeometry(.045,16,10),headMat);head.scale.y=.48;head.position.y=.39;head.castShadow=true;g.add(head);g.position.set(point.x,.03,point.z);const pin={id:this.pinSeq++,group:g,part,point:point.clone(),meshes:[shaft,head]};for(const m of pin.meshes){m.userData.pinId=pin.id;m.userData.pinRef=pin}this.scene.add(g);this.pins.push(pin);part.anchored++;return pin;
  }
  removePin(pin){const i=this.pins.indexOf(pin);if(i<0)return false;pin.part.anchored=Math.max(0,pin.part.anchored-1);this.scene.remove(pin.group);pin.group.traverse(o=>{o.geometry?.dispose();o.material?.dispose()});this.pins.splice(i,1);return true;}
  isRootPinned(){return [...this.parts.values()].some(p=>p.bodyAttached&&p.anchored>0);}
  partOrAncestorPinned(part){let p=part;while(p){if(p.anchored>0)return true;p=p.parentId?this.parts.get(p.parentId):null}return false;}
  moveWhole(delta){if(this.isRootPinned())return;this.root.position.add(delta);this.root.position.y=.065;this.workbench.clampDish(this.root.position,.35);}
  moveLoose(part,target){let root=part;while(root.group.parent!==this.scene&&root.parentId&&this.parts.has(root.parentId)){const p=this.parts.get(root.parentId);if(!p||p.bodyAttached)break;root=p}const rec=this.looseRoots.find(r=>r.group===root.group)||this.looseRoots.find(r=>r.part===part);if(rec&&this.subtreeAnchors(rec.part)===0){rec.group.position.lerp(target,.7);rec.group.position.y=Math.max(.06,target.y);rec.v.set(0,0,0)}}
  applyShock(part,point){
    this.vitals.shock=clamp(this.vitals.shock+.32,0,1.4);this.fear=clamp(this.fear+.75,0,2);this.toolContact=1;for(const p of this.parts.values()){const d=p.group.getWorldPosition(V3()).distanceTo(point);if(d<1.5)p.twitch=Math.max(p.twitch,clamp(1.2-d*.45,.2,1.2))}for(const r of this.looseRoots)if(r.group.position.distanceTo(point)<.8)r.twitch=Math.max(r.twitch,1.4);
  }
  applyHeat(part,point,amount){this.addScorch(part,point,V3(0,1,0),amount);part.twitch=Math.max(part.twitch,.6+amount*2);this.fear=clamp(this.fear+amount*.8,0,2);this.toolContact=1;}
  mobility(){
    let total=0;for(const chain of this.legChains){let s=1;const majors=chain.parts.filter(p=>p.kind==='leg').slice(0,4);for(const p of majors){if(!p.bodyAttached)s*=.05;else s*=clamp(p.integrity*.8+p.nerve*.2,0,1)}total+=s}this.vitals.mobility=clamp(total/6,0,1);return this.vitals.mobility;
  lifeState(){if(!this.vitals.alive)return this.vitals.reflex>.08?'반사 운동':'종료';const c=Math.min(this.vitals.headCore,this.vitals.thoraxCore,this.vitals.abdomenCore);if(c<.22)return'중추 손상';if(c<.52||this.vitals.fatigue>.65)return'쇠약';return'생존';}
  setThreat(point,intensity=.4){this.threat=point?point.clone():null;this.fear=clamp(this.fear+intensity,0,2);this.toolContact=1;}
  clearThreat(){this.threat=null;}
  rootLocalPartWorld(part,local){return part.group.localToWorld(local.clone());}
  update(dt,time){
    this.gait+=dt*(8+this.mobility()*12);this.wriggle+=dt*(4+this.vitals.shock*18);this.fear=Math.max(0,this.fear-dt*.22);this.toolContact=Math.max(0,this.toolContact-dt*1.6);this.vitals.shock=Math.max(0,this.vitals.shock-dt*.42);this.vitals.heat=Math.max(0,this.vitals.heat-dt*.018);this.vitals.fatigue=clamp(this.vitals.fatigue+dt*(this.vitals.heat*.03+Math.max(0,.3-this.vitals.mobility)*.02)-dt*.006,0,1);this.vitals.reflex=Math.max(0,this.vitals.reflex-dt*(this.vitals.alive?0:.015));
    this.updateRoot(dt,time);this.updateBody(dt,time);this.updateLegs(dt,time);this.updateAntennae(dt,time);this.updateLoose(dt,time);this.updatePins();
  }
  updateRoot(dt,time){
    const mob=this.vitals.mobility,active=this.vitals.alive?1:this.vitals.reflex;this.dirT-=dt;if(this.dirT<=0){this.dirT=rand(.35,1.2);this.dir+=rand(-1.3,1.3)}if(this.threat){const d=this.root.position.clone().sub(this.threat);this.dir=angleDamp(this.dir,Math.atan2(d.x,d.z),8,dt)}
    const asym=this.sideMobility(1)-this.sideMobility(-1);this.dir+=asym*dt*.65;const speed=(this.isRootPinned()?0:.13*mob*active*(.35+.75*clamp(this.fear,0,1.4)));this.rootYaw=angleDamp(this.rootYaw,this.dir,5,dt);this.root.rotation.y=this.rootYaw+Math.sin(time*5)*.015*this.fear;
    const delta=V3(Math.sin(this.rootYaw)*speed*dt,0,Math.cos(this.rootYaw)*speed*dt);this.root.position.add(delta);const before=this.root.position.clone();this.workbench.clampDish(this.root.position,.36);if(before.distanceTo(this.root.position)>.001){this.dir+=Math.PI*rand(.65,1.2);this.fear=.6}
    const injury=(1-mob),shock=this.vitals.shock;this.root.position.y=.065+Math.sin(this.wriggle*1.8)*(.003+.007*injury)+rand(-.002,.002)*shock;this.root.rotation.x=Math.sin(this.wriggle*1.3)*(.01+.06*injury)+rand(-.05,.05)*shock;this.root.rotation.z=Math.sin(this.wriggle*1.7+1)*(.012+.08*injury)+rand(-.06,.06)*shock;
  }
  sideMobility(side){let n=0,c=0;for(const ch of this.legChains)if(ch.side===side){c++;let s=1;for(const p of ch.parts.filter(p=>p.kind==='leg').slice(0,4))s*=p.bodyAttached?p.integrity:.03;n+=s}return c?n/c:0}
  updateBody(dt,time){
    const shock=this.vitals.shock,inj=1-this.vitals.mobility;for(let i=0;i<this.abdomen.length;i++){const p=this.abdomen[i];if(!p.bodyAttached)continue;p.group.rotation.y=Math.sin(this.wriggle+i*.55)*(.018+.07*inj)+rand(-.03,.03)*shock;p.group.rotation.x=Math.sin(this.wriggle*1.2+i*.42)*(.012+.04*inj)}
    const head=this.parts.get('head_capsule');if(head.bodyAttached){head.group.rotation.y=Math.sin(time*2.6)*(.06+.10*this.fear)+rand(-.13,.13)*shock;head.group.rotation.z=Math.sin(time*3.1)*.025+rand(-.1,.1)*shock}
    for(const p of this.parts.values()){if(p.twitch>0){p.twitch=Math.max(0,p.twitch-dt*(.7+rand(.4)));const k=p.twitch;const s=Math.sin(time*(19+rand(12))+p.id.length);p.group.rotation.z+=s*.035*k;p.group.rotation.y+=Math.cos(time*23+p.id.length)*.025*k}}
  }
  updateLegs(dt,time){
    const mob=this.vitals.mobility,shock=this.vitals.shock;for(const chain of this.legChains){const major=chain.parts.filter(p=>p.kind==='leg'),legHealth=major.slice(0,4).reduce((a,p)=>a*(p.bodyAttached?p.integrity:.02),1),phase=this.gait+chain.phase;for(let i=0;i<major.length;i++){const p=major[i];if(!p.bodyAttached)continue;const base=p.baseQuat,sw=Math.sin(phase+i*.25),lift=Math.max(0,Math.sin(phase+Math.PI/2));const y=(i===0?.12:i===1?.16:i===2?.28:i===3?-.48:.12)*sw*legHealth*mob;const z=(i===2?.20:i===3?.34:.08)*lift*legHealth;const q=new THREE.Quaternion().setFromEuler(new THREE.Euler(0,y+rand(-.08,.08)*shock,z+rand(-.12,.12)*shock,'XYZ'));p.group.quaternion.copy(base).multiply(q)}
      if(legHealth<.35&&Math.random()<dt*(2+this.fear*2)){for(const p of major)if(p.bodyAttached)p.twitch=Math.max(p.twitch,rand(.2,.7))}
    }
  }
  updateAntennae(dt,time){
    for(const chain of this.antennaChains){for(let i=0;i<chain.length;i++){const p=chain[i];if(!p.bodyAttached)continue;const base=p.baseQuat,w=Math.sin(time*(2.8+i*.05)+i*.4+p.side)*(.025+.12*this.fear)*(1-i/18),q=new THREE.Quaternion().setFromEuler(new THREE.Euler(Math.sin(time*3.7+i)*.018,p.side*w,Math.cos(time*2.5+i)*.025,'XYZ'));p.group.quaternion.copy(base).multiply(q)}}
  }
  updateLoose(dt,time){
    for(const rec of this.looseRoots){if(!rec.group.parent)continue;const anchored=this.subtreeAnchors(rec.part)>0;if(!anchored&&!rec.sleep){rec.v.y-=1.2*dt;rec.group.position.addScaledVector(rec.v,dt);rec.group.rotation.x+=rec.w.x*dt;rec.group.rotation.y+=rec.w.y*dt;rec.group.rotation.z+=rec.w.z*dt;if(rec.group.position.y<.055){rec.group.position.y=.055;rec.v.y=Math.abs(rec.v.y)*.12;rec.v.x*=.88;rec.v.z*=.88;rec.w.multiplyScalar(.93)}const before=this.root.position.clone();before.copy(rec.group.position);this.workbench.clampDish(rec.group.position,.12);if(before.distanceTo(rec.group.position)>.001){rec.v.x*=-.4;rec.v.z*=-.4}if(rec.v.length()<.01&&rec.w.length()<.12)rec.sleep=true}
      rec.twitch=Math.max(0,rec.twitch-dt*.28);if(rec.twitch>0){const k=rec.twitch*(this.vitals.alive?.65:1);rec.group.rotation.x+=Math.sin(time*22+rec.part.id.length)*.025*k;rec.group.rotation.z+=Math.cos(time*27+rec.part.id.length)*.03*k;rec.sleep=false}
    }
  }
  updatePins(){for(const pin of this.pins){if(pin.part.bodyAttached){pin.group.position.x=pin.point.x;pin.group.position.z=pin.point.z}else if(pin.part.group.parent===this.scene){pin.group.position.x=pin.part.group.position.x;pin.group.position.z=pin.part.group.position.z}}}
  reset(){
    this.scene.remove(this.root);for(const pin of [...this.pins])this.removePin(pin);for(const rec of this.looseRoots)if(rec.group.parent)this.scene.remove(rec.group);for(const p of this.parts.values())p.group.traverse(o=>{o.geometry?.dispose();if(Array.isArray(o.material))o.material.forEach(m=>m.dispose?.());else o.material?.dispose?.()});this.parts.clear();this.selectables.length=this.looseRoots.length=this.pins.length=0;
  }
}
