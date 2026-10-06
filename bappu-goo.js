// bappu-goo.js — 바뿌볼 진물 층 (v3)
// 바퀴가 부서질 때 그 자리 밑에 크림색 진물(소화관 갈색 줄 포함)이 생기고,
// 주무르면 손가락이 지나간 방향으로 늘어나고 접히면서 줄무늬가 된다. 점도가 높아서 저절로는 안 섞이고,
// 늘어나 얇아진 만큼만 슬라임에 녹아 공 전체가 탁해진다.
// 덩어리 하나는 겹친 세 마디의 납작한 띠로 그린다. 늘어나면 너비는 그대로 두고 두께만 얇아진다 (물감이 점성 액체 속에서 얇은 막으로 펴지듯).
// 반투명: 두꺼운 덩어리는 크림색으로 진하고, 얇게 펴질수록 비쳐 보이며, 가장자리는 흐려진다 — 가늘고 딱딱한 이쑤시개 윤곽이 생기지 않는다.
// 갈림·녹음은 손가락이 겉에서 실제로 누르고 문지른 일(ball.mixWork)만큼만 일어난다. 흐름에 실려 움직인 거리는 마모가 아니다.
// 탁함은 세 겹: 진물이 표면 가까이 스친 자리의 얼룩(정점별) + 주무를수록 공기가 접혀 들어간 우윳빛 흐림(전체) + 녹아든 진물 색(전체).
// 조각도 주무를수록 갈린다: 껍질·날개·다리 조각 → 부스러기(shard) → 알갱이(crumb) → 때(grime, 색만 남음). 때가 쌓일수록 공 색이 갈색 쪽으로 탁해진다.
// bappu-ball.js 가 생성자에서 만들고, setStage / knead / update / 상태 저장 / reset / dispose 에서 호출한다.

const clamp=(v,a,b)=>v<a?a:v>b?b:v;
const lerp=(a,b,t)=>a+(b-a)*t;
const sstep=(a,b,x)=>{const t=clamp((x-a)/(b-a),0,1);return t*t*(3-2*t);};
const rnd=(a,b)=>a+Math.random()*(b-a);
// 셰이더 끝(톤매핑·sRGB 변환 뒤)에서 섞는 색이라 변환 없이 화면 색 그대로 넣는다
const disp=(T,hex)=>new T.Color().setRGB(((hex>>16)&255)/255,((hex>>8)&255)/255,(hex&255)/255);

const LEN_MAX=0.14;      // 이보다 길어진 줄기(반 길이)는 겹치게 둘로 나뉜다 → 이어진 줄무늬
const LEN_HARD=0.22;     // 나눌 자리가 없을 때 늘어날 수 있는 끝 (반 길이)
const SPLIT_PER_FRAME=6; // 한 프레임에 나뉘는 덩어리 수 상한 (한꺼번에 잘게 쪼개지지 않게)
const FOLLOW=0.01;       // 진물은 슬라임보다 걸쭉해서 섞는 흐름이 늘이는 만큼의 이 비율만 늘어난다 (자리·방향은 흐름을 그대로 따른다)
const STRAIN=0.07;       // 손가락이 끄는 만큼 진물이 그 방향으로 늘어나는 정도 (곱으로 늘어난다: 손가락 바로 밑에서 한 번 문지르면 1.15배쯤)
const ALIGN=3.6;         // 끄는 방향으로 진물이 돌아눕는 빠르기
const FLAT0=[1.25,1.9];  // 처음 단면의 납작한 정도 (너비/두께)
const FLAT_MAX=12;       // 이 이상은 안 납작해진다 (그 뒤로는 너비도 같이 준다)
const THK_MIN=0.002;     // 두께(반)가 이보다 얇아지면 슬라임에 녹아든다
const RMAX=0.955;        // 가장 바깥 (조각과 같다). 안쪽 한계는 없다 — 흐름이 부피를 보존하므로 속에 쌓이지 않는다
const SEG=3;             // 덩어리 하나를 겹친 세 마디로 그린다
const SEG_OFF=[-0.55,0,0.55], SEG_CURVE=[0.55,1,0.55], SEG_RAD=[0.93,1.07,0.93];   // 마디가 구슬처럼 도드라지지 않게 매끈하게 겹친다
const ALPHA_THIN=0.5, ALPHA_THICK=0.86;   // 얇게 펴진 막 ~ 두꺼운 덩어리의 불투명도 (약간 비치는 정도)
const CURL=0.2;          // 가만히 있어도 길이의 이만큼 굽어 있다
const BEND_GAIN=2.2, BEND_MAX=0.6;   // 흐름 차이 → 굽힘 목표, 길이 대비 최대 굽힘
const GRIND=0.09;        // 갈리는 속도 (겉에서 꾹 누르기 한 번 = 일 1)
const CRUMB_WEAR=0.05;   // 알갱이가 문질러져 때가 되는 속도
const DISSOLVE=0.12;     // 녹는 속도
const HAZE=0.09;         // 뿌얘지는 속도
const DYE=0.008;         // 바퀴 물이 드는 속도 (게임적 과장: 주무를수록 연갈색으로 짙어진다. 클수록 빨리 물든다)


export class GooLayer{
  constructor(ball){
    this.ball=ball; const T=ball.T; this.T=T;
    this.cap=ball.count*5;        // 덩어리 수 상한 (인스턴스는 ×SEG). 많으면 공 속이 죽처럼 진물로 꽉 찬다
    this.blobs=[];
    this.dissolved=0;              // 녹아든 진물 부피
    this.grime=0;                  // 갈려서 색만 남은 조각의 양
    this._zero=new ball.T.Matrix4().makeScale(0,0,0);
    this.volRef=ball.count*3*2.0e-4*0.42; // 이만큼 녹으면 색이 꽤 탁해진다 (전체 진물의 ~40%)
     this.haze=0; this.tint=0; this.dye=0; this.dyeShown=0;      // 화면에 반영 중인 값 (부드럽게 따라감)
    this.gooDirty=false;
    this._tmp=Array.from({length:12},()=>new T.Vector3());
    this._q=new T.Quaternion(); this._m=new T.Matrix4(); this._s=new T.Vector3(); this._c=new T.Color(); this._tc=new T.Color();
    this._Y=new T.Vector3(0,1,0);
    this._segP=Array.from({length:SEG},()=>new T.Vector3()); this._segT=new T.Vector3(); this._bendV=new T.Vector3(); this._ax=new T.Vector3(); this._az=new T.Vector3();
    this.buildMesh();
    this.buildStain();
    this.hookShader(ball.matFront,{aMurk:0.74,haze:0xf3efe6,goo:0xd8c79e,tint:0xc4b58e,grime:0x8f7d60,dye:0xb98b58,dyeA:0.18});
    this.hookShader(ball.matBack,{aMurk:0.46,haze:0xe9e3d6,goo:0xcdbb93,tint:0xb9aa84,grime:0x857355,dye:0xa67848,dyeA:0.12});
    // 물든 막: 공 속에 보이는 것(조각·진물·뒷벽·공 너머 바닥)에 연갈색을 곱한다. 투명도는 그대로 두고 색만 물들인다 (갈색 물에 담근 것처럼)
    // 속 내용물보다 나중에, 앞면 광택보다 먼저 그린다. 밖으로 삐져나온 조각 끝은 막 바깥이라 물들지 않는다
    this.dyeMat=new T.MeshBasicMaterial({color:0xffffff,transparent:true,depthWrite:false,toneMapped:false,blending:T.CustomBlending,blendEquation:T.AddEquation,blendSrc:T.DstColorFactor,blendDst:T.ZeroFactor,blendSrcAlpha:T.ZeroFactor,blendDstAlpha:T.OneFactor});
    this.dyeShell=new T.Mesh(ball.slimeGeo,this.dyeMat); this.dyeShell.renderOrder=20; this.dyeShell.frustumCulled=false; this.dyeShell.visible=false;
    ball.group.add(this.dyeShell);
    this._dyeMul=new T.Color().setRGB(0.95,0.71,0.46,T.SRGBColorSpace); this._white=new T.Color(1,1,1);   // 끝까지 물들었을 때 곱하는 색 (연갈색)



  }

  // ── 진물 덩어리 메시: 납작한 타원체 띠, 크림색 몸통에 갈색 소화관 줄, 반투명 ──
  buildMesh(){
    const T=this.T, geo=new T.SphereGeometry(1,12,8);
    const P=geo.attributes.position, n=P.count, col=new Float32Array(n*3);
    const cream=new T.Color(0xd9a447), gut=new T.Color(0x4f2a10);   // 노르스름한 크림색 곤죽, 소화관 갈색 (뿌연 슬라임 속에서도 묻히지 않게 진하게)
    for(let i=0;i<n;i++){
      const x=P.getX(i), y=P.getY(i), z=P.getZ(i);
      // 줄기 방향(y)을 따라 달리는 갈색 줄: x≈0 면 근처를 구불구불 지난다. 방향에 따라 보였다 안 보였다 한다
      const vein=sstep(0.30,0.06,Math.abs(x+0.22*Math.sin(y*5.5+z*2.0)))*sstep(-0.95,-0.55,y)*sstep(0.95,0.55,y);
      const wob=0.92+0.08*Math.sin(y*9.0+z*5.0);
      col[i*3]  =lerp(cream.r,gut.r,vein)*wob;
      col[i*3+1]=lerp(cream.g,gut.g,vein)*wob;
      col[i*3+2]=lerp(cream.b,gut.b,vein)*wob;
    }
    geo.setAttribute('color',new T.Float32BufferAttribute(col,3));
    // 마디마다 불투명도 (두께에 따라)
    this.alphaAttr=new T.InstancedBufferAttribute(new T.Float32BufferAttribute(this.cap*SEG,1).array.fill(1),1);   // 배열은 T로 만든다: 1라운드는 다른 창(게임 창)의 THREE가 그려서, 이 파일에서 만든 배열은 받지 않는다
    this.alphaAttr.setUsage(T.DynamicDrawUsage);
    geo.setAttribute('aGooA',this.alphaAttr);
    this.mat=new T.MeshPhysicalMaterial({color:0xffffff,vertexColors:true,roughness:0.3,metalness:0,clearcoat:0.75,clearcoatRoughness:0.2,envMap:this.ball.envMap,envMapIntensity:0.6,transparent:true,opacity:1,depthWrite:false});
    // 면이 보는 방향과 비스듬할수록 비쳐 보이게: 띠를 옆에서 봐도 딱딱한 선이 안 생긴다
    this.mat.onBeforeCompile=(sh)=>{
      sh.vertexShader='attribute float aGooA;\nvarying float vGooA;\n'+sh.vertexShader.replace('#include <begin_vertex>','#include <begin_vertex>\nvGooA=aGooA;');
      sh.fragmentShader='varying float vGooA;\n'+sh.fragmentShader.replace('#include <opaque_fragment>',
        '#include <opaque_fragment>\n{ float nv=abs(dot(normalize(normal),normalize(vViewPosition))); gl_FragColor.a*=vGooA*mix(0.25,1.0,smoothstep(0.05,0.7,nv)); }');
    };
    this.mat.customProgramCacheKey=()=>'bappu-goo-ribbon';
    this.mesh=new T.InstancedMesh(geo,this.mat,this.cap*SEG);
    this.mesh.count=0; this.mesh.frustumCulled=false; this.mesh.renderOrder=4;
    this.mesh.instanceMatrix.setUsage(T.DynamicDrawUsage);
    this.mesh.instanceColor=new T.InstancedBufferAttribute(new T.Float32BufferAttribute(this.cap*SEG*3,3).array.fill(1),3);
    this.mesh.instanceColor.setUsage(T.DynamicDrawUsage);
    const zero=new T.Matrix4().makeScale(0,0,0); for(let i=0;i<this.cap*SEG;i++) this.mesh.setMatrixAt(i,zero);
    this.ball.group.add(this.mesh);
  }

  // ── 표면 얼룩: 슬라임 정점마다 뿌연 정도 (aStain) ──
  buildStain(){
    const T=this.T, geo=this.ball.slimeGeo, n=geo.attributes.position.count;
    const prm=geo.parameters||{};
    this.ws=prm.widthSegments||44; this.hs=prm.heightSegments||30;
    if((this.ws+1)*(this.hs+1)!==n){ this.ws=0; }       // 모르는 배치면 얼룩은 끈다
    this.stainAttr=new T.Float32BufferAttribute(new Float32Array(n),1);
    this.stainAttr.setUsage(T.DynamicDrawUsage);
    geo.setAttribute('aStain',this.stainAttr);
    this.residue=new Float32Array(n);   // 진물이 스치며 남긴 얼룩 (쌓인다)
    this.present=new Float32Array(n);   // 지금 진물이 가까이 있는 자리 (매번 새로 센다)
  }

  hookShader(mat,o){
    const T=this.T, prev=mat.onBeforeCompile, prevKey=mat.customProgramCacheKey;
    const self=this;
    mat.onBeforeCompile=function(sh,renderer){
      if(prev) prev.call(this,sh,renderer);
      sh.uniforms.uHaze={value:self.haze}; sh.uniforms.uTint={value:self.tint}; sh.uniforms.uDye={value:self.dyeShown};
      sh.uniforms.uAMurk={value:o.aMurk};
      sh.uniforms.uHazeCol={value:disp(T,o.haze)}; sh.uniforms.uGooCol={value:disp(T,o.goo)}; sh.uniforms.uTintCol={value:disp(T,o.tint)}; sh.uniforms.uDyeCol={value:disp(T,o.dye)};
      mat.userData.gooUniforms=sh.uniforms; mat.userData.gooTint=[disp(T,o.tint),disp(T,o.grime)];
      sh.vertexShader='attribute float aStain;\nvarying float vStain;\n'+sh.vertexShader.replace('#include <begin_vertex>','#include <begin_vertex>\nvStain=aStain;');
      const old='gl_FragColor.a=clamp(mix(uAMin,uAMax,f)+spec*1.6,0.0,1.0)*opacity;';
      if(sh.fragmentShader.indexOf(old)<0){ console.warn('bappu-goo: slime shader hook not found'); return; }
      // 물듦(dy): 겉막은 살짝만 짙어지고, 뿌옇게 낀 막의 색이 갈색 쪽으로 간다 (속은 물든 막 dyeShell이 곱해서 물들인다)
      sh.fragmentShader='varying float vStain;\nuniform float uHaze;uniform float uTint;uniform float uDye;uniform float uAMurk;uniform vec3 uHazeCol;uniform vec3 uGooCol;uniform vec3 uTintCol;uniform vec3 uDyeCol;\n'
        +sh.fragmentShader.replace(old,
          'float stn=clamp(vStain,0.0,1.0); float hz=clamp(uHaze,0.0,1.0); float tn=clamp(uTint,0.0,1.0); float dy=clamp(uDye,0.0,1.0);\n'
         +'float m=1.0-(1.0-stn)*(1.0-hz*0.8)*(1.0-tn)*(1.0-dy*'+o.dyeA.toFixed(3)+');\n'
         +'float aBase=mix(uAMin,uAMax,f); float aMurk=mix(uAMurk,max(uAMax,uAMurk)+0.06,f);\n'
         +'gl_FragColor.a=clamp(mix(aBase,aMurk,m)+spec*1.6*(1.0-0.5*m),0.0,1.0)*opacity;\n'
         +'float lum=dot(gl_FragColor.rgb,vec3(0.299,0.587,0.114));\n'
         +'vec3 mcol=mix(mix(uHazeCol,uTintCol,tn),uGooCol,stn*0.85);\n'
         +'mcol=mix(mcol,uDyeCol,min(1.0,dy*1.5));\n'
         +'gl_FragColor.rgb=mix(gl_FragColor.rgb,mcol*(0.40+0.72*lum),max(m*0.92,dy*0.3))+vec3(spec)*0.3*m;');
    };
    mat.customProgramCacheKey=function(){ return (prevKey?prevKey.call(this):'')+'-goo'; };
  }





  // ── 바퀴 r이 st 단계로 넘어갈 때 (bappu-ball setStage 에서, r.stage 는 아직 이전 단계) ──
  onStage(r,st){
    const B=this.ball, T=this.T, nW=this._tmp[0].copy(B.anchorDir[r.anchor]).applyQuaternion(B.rollQ);
    for(let s=r.stage+1;s<=st;s++){
      if(s===2) this.spawn(nW,1,0.050,0.070,0.034,0.042);           // 눌려서 배어 나옴
      else if(s===3) this.spawn(nW,1,0.060,0.090,0.040,0.050);      // 찢어짐
      else if(s===4) this.spawn(nW,1,0.075,0.110,0.048,0.062);      // 박살
    }
  }
  spawn(nW,n,l0,l1,r0,r1){
    const T=this.T;
    for(let k=0;k<n;k++){
      if(this.blobs.length>=this.cap) return;
      const t=this._tmp[1].set(Math.random()-0.5,Math.random()-0.5,Math.random()-0.5); t.addScaledVector(nW,-nW.dot(t)); if(t.lengthSq()<1e-6)t.set(1,0,0); t.normalize();
      const rest=new T.Vector3().copy(nW).multiplyScalar(rnd(0.80,0.88)).addScaledVector(t,rnd(-0.07,0.07));
      const ax=new T.Vector3().copy(t).applyAxisAngle(nW,rnd(0,Math.PI*2)); ax.addScaledVector(nW,rnd(-0.25,0.25)).normalize();
      const len=rnd(l0,l1), rad=rnd(r0,r1);
      const b={rest,axis:ax,len,rad,vol:len*rad*rad,flat:rnd(FLAT0[0],FLAT0[1]),tone:Math.random(),grow:0,p:new T.Vector3(),q:new T.Quaternion(),fresh:true};
      this.initBend(b);
      this.ball.interiorPoint(rest,b.p);
      this.blobs.push(b);
    }
    this.gooDirty=true;
  }

  /** 정지 좌표 rest 자리에 작은 진물 하나 (배 조각이 갈릴 때) */
  spawnAt(rest,l0,l1,r0,r1){
    const T=this.T; if(this.blobs.length>=this.cap) return;
    const nW=this._tmp[1].copy(rest); if(nW.lengthSq()<1e-6) nW.set(0,1,0); nW.normalize();
    const ax=new T.Vector3(Math.random()-0.5,Math.random()-0.5,Math.random()-0.5); ax.addScaledVector(nW,-nW.dot(ax)*0.7); if(ax.lengthSq()<1e-6)ax.set(1,0,0); ax.normalize();
    const len=rnd(l0,l1), rad=rnd(r0,r1);
    const b={rest:rest.clone(),axis:ax,len,rad,vol:len*rad*rad,flat:rnd(FLAT0[0],FLAT0[1]),tone:rnd(0.3,1),grow:0,p:new T.Vector3(),q:new T.Quaternion(),fresh:true};
    this.initBend(b);
    this.keepInside(b.rest); this.ball.interiorPoint(b.rest,b.p); this.blobs.push(b); this.gooDirty=true;
  }
  /** 굽힘 상태: curl 은 가만히 있어도 굽어 있는 방향(축에 수직 단위벡터), bend/bendT 는 주무를 때 생기는 굽힘(절대 길이)과 그 목표 */
  initBend(b){
    const T=this.T, c=new T.Vector3(Math.random()-0.5,Math.random()-0.5,Math.random()-0.5);
    c.addScaledVector(b.axis,-b.axis.dot(c)); if(c.lengthSq()<1e-6) c.set(0,0,1).addScaledVector(b.axis,-b.axis.z);
    b.curl=c.normalize(); b.bend=new T.Vector3(); b.bendT=new T.Vector3();
  }

  // ── 조각 갈기: 겉에서 손가락에 눌리고 문질린 일만큼 닳고, 다 닳으면 더 작은 것이 된다 ──
  grind(){
    const B=this.ball;
    for(const r of B.roaches){
      if(!r.used) continue;
      for(let slot=0;slot<r.frag.length;slot++){
        const f=r.frag[slot]; if(!f) continue;
        const w=B.mixWork(f.rest); if(w<1e-7) continue;
        if(f._gw==null){ f._gw=0; f._gj=rnd(0.7,1.35); }
        f._gw+=w*GRIND;
        const thr=(slot<6?1.25:slot<10?0.5:0.65)*f._gj;   // 껍질은 질기고, 날개·다리는 금방
        if(f._gw>thr) this.grindFrag(r,slot,f);
      }
    }
    for(let i=B.shardList.length-1;i>=0;i--){
      const sh=B.shardList[i];
      const w=B.mixWork(sh.rest); if(w<1e-7) continue;
      if(sh._gw==null){ sh._gw=0; sh._gj=rnd(0.7,1.35); }
      sh._gw+=w*GRIND;
      if(sh._gw>1.5*sh._gj){ B.shardList.splice(i,1); B.shards.count=B.shardList.length; B.fragDirty=true; this.addCrumbs(sh.rest,2); this.grime+=0.4; }
    }
    const CR=B.crumbRest, p=this._tmp[0];
    for(let i=B.crumbN-1;i>=0;i--){
      p.set(CR[i*3],CR[i*3+1],CR[i*3+2]);
      const w=B.mixWork(p); if(w<1e-7) continue;
      if(Math.random()<1-Math.exp(-w*CRUMB_WEAR)) this.removeCrumb(i);   // 알갱이는 문질러지다 때가 되어 사라진다
    }
  }
  grindFrag(r,slot,f){
    const B=this.ball;
    r.state[slot]=2; r.frag[slot]=null;
    const [mi,ii]=B.instanceSlot(r,slot); B.meshes[mi].setMatrixAt(ii,this._zero); B.meshes[mi].instanceMatrix.needsUpdate=true;
    if(slot<6){ this.addShards(f.rest,3); this.addCrumbs(f.rest,3); this.grime+=3; if(slot<2) this.spawnAt(f.rest,0.045,0.07,0.028,0.038); }  // 배 조각엔 진물이 더 들어 있다
    else if(slot<10){ this.addShards(f.rest,1); this.addCrumbs(f.rest,2); this.grime+=1; }
    else { this.addCrumbs(f.rest,2); this.grime+=0.5; }
    B.fragDirty=true; B.dirty=true;
  }
  addShards(rest,n){
    const B=this.ball, T=this.T;
    for(let k=0;k<n;k++){
      if(B.shardList.length>=B.shardCap){ this.addCrumbs(rest,1); continue; }
      const rr=new T.Vector3(Math.random()-0.5,Math.random()-0.5,Math.random()-0.5).multiplyScalar(0.06).add(rest); this.keepInside(rr);
      const p=new T.Vector3(); B.interiorPoint(rr,p);
      B.shardList.push({p,rest:rr,q:new T.Quaternion().setFromEuler(new T.Euler(Math.random()*6.28,Math.random()*6.28,Math.random()*6.28)),s:0.55+Math.random()*0.6,t:1.5});
    }
    B.shards.count=B.shardList.length; B.fragDirty=true;
  }
  addCrumbs(rest,n){
    const B=this.ball, v=this._tmp[1];
    for(let k=0;k<n;k++){
      if(B.crumbN>=B.crumbCap){ this.grime+=0.5; continue; }
      v.set(Math.random()-0.5,Math.random()-0.5,Math.random()-0.5).multiplyScalar(0.06).add(rest); this.keepInside(v);
      const i=B.crumbN++; B.crumbRest[i*3]=v.x; B.crumbRest[i*3+1]=v.y; B.crumbRest[i*3+2]=v.z;
    }
    B.crumbs.geometry.setDrawRange(0,B.crumbN); B.dirty=true;
  }
  removeCrumb(i){
    const B=this.ball, CR=B.crumbRest, last=B.crumbN-1;
    if(i!==last){ for(let k=0;k<3;k++) CR[i*3+k]=CR[last*3+k]; }
    B.crumbN=last; B.crumbs.geometry.setDrawRange(0,B.crumbN); B.dirty=true; this.grime+=0.25;
  }

  // ── 주무를 때 (bappu-ball knead 에서) : fn(rest,strength) 는 조각을 옮기는 그 흐름 ──
  transport(flows,fn){
    const e1=this._tmp[2], e2=this._tmp[3], d=this._tmp[4], o1=this._tmp[8], o2=this._tmp[9], mdir=this._tmp[6], nb=this._tmp[7], tang=this._tmp[5], mid=this._tmp[10], om=this._tmp[11];
    let moved=false, splits=SPLIT_PER_FRAME; const born=[];
    for(let i=this.blobs.length-1;i>=0;i--){
      const b=this.blobs[i];
      if(!b.curl) this.initBend(b);
      if(!b.flat) b.flat=FLAT0[0];
      e1.copy(b.rest).addScaledVector(b.axis,b.len); e2.copy(b.rest).addScaledVector(b.axis,-b.len); mid.copy(b.rest);
      o1.copy(e1); o2.copy(e2); om.copy(mid);
      fn(e1,1.0); fn(e2,1.0); fn(mid,1.0);
      const mv=e1.distanceTo(o1)+e2.distanceTo(o2);
      if(mv<1e-7) continue;
      moved=true;
      d.copy(e1).sub(e2); const Lf=d.length()*0.5;
      b.rest.copy(e1).add(e2).multiplyScalar(0.5);
      if(Lf>1e-5) b.axis.copy(d).normalize();
      let L=b.len+FOLLOW*(Lf-b.len);
      // 가운데가 양 끝과 다르게 밀리면 그만큼 휜다 (축에 수직인 성분만)
      mid.sub(om).addScaledVector(o1.sub(e1),0.5).addScaledVector(o2.sub(e2),0.5);
      mid.addScaledVector(b.axis,-mid.dot(b.axis));
      if(mid.lengthSq()>1e-12){ mid.multiplyScalar(BEND_GAIN*12); const bm=BEND_MAX*b.len; if(mid.length()>bm) mid.setLength(bm); b.bendT.lerp(mid,0.6); }
      // 손가락이 끄는 방향으로 돌아눕고 그만큼 늘어난다 (점성 유체는 전단층에서 끄는 쪽으로 눕고 늘어난다)
      let stretch=0; mdir.set(0,0,0);
      const rr0=b.rest.length();
      if(rr0>1e-5){
        nb.copy(b.rest).multiplyScalar(1/rr0);
        for(const f of flows){
          const mvf=f._mixMove; if(!mvf||mvf.lengthSq()<1e-12) continue;
          const a=Math.acos(clamp(nb.dot(f.dir),-1,1)), w=Math.max(0.15,f.w);
          const local=Math.exp(-a*a/(2.2*w*w)); if(local<0.01) continue;
          tang.copy(mvf).addScaledVector(nb,-mvf.dot(nb)); const l=tang.length(); if(l<1e-9) continue;
          const k=local*f._mixPower; stretch+=l*k; mdir.addScaledVector(tang,k/l);
        }
      }
      if(stretch>1e-6&&mdir.lengthSq()>1e-12){
        mdir.normalize(); if(mdir.dot(b.axis)<0) mdir.negate();
        b.axis.lerp(mdir,clamp(stretch*ALIGN,0,0.6)).normalize();
        L*=Math.exp(STRAIN*stretch);
      }
      let folded=false;
      const len0=b.len;
      if(L>=b.len){ b.len=L; }                                  // 늘어난다 → 얇아진다
      else{
        // 눌리면 짧아지되, 많이 눌리면 접혀서 나란한 두 겹이 된다
        if(L<b.len*0.62&&b.len>0.05&&this.blobs.length+born.length<this.cap&&Math.random()<0.6){
          const side=this._tmp[10].set(Math.random()-0.5,Math.random()-0.5,Math.random()-0.5); side.addScaledVector(b.axis,-b.axis.dot(side));
          if(side.lengthSq()>1e-6){
            side.normalize();
            const c=this.clone(b); c.vol=b.vol*0.5; b.vol*=0.5;
            b.len=c.len=Math.max(0.03,b.len*0.8);
            c.rest.addScaledVector(side,b.rad*1.4); b.rest.addScaledVector(side,-b.rad*1.4);
            this.keepInside(c.rest); born.push(c); folded=true;
          }
        }
        if(!folded) b.len=Math.max(L,b.len*0.9,0.02);
      }
      // 길이가 늘어난 만큼 납작해진다: 너비는 그대로, 두께만 준다 (줄면 다시 도톰해진다)
      if(!folded) b.flat=clamp(b.flat*b.len/len0,1,FLAT_MAX);
      // 겉에서 눌리고 문질리는 만큼 조금씩 슬라임에 녹는다 (얇을수록 빨리)
      const thk0=Math.sqrt(Math.max(1e-12,b.vol/b.len/b.flat));
      const thin=sstep(0.03,0.008,thk0);
      const loss=b.vol*clamp(this.ball.mixWork(b.rest)*(0.07+0.2*thin)*DISSOLVE,0,0.05);
      b.vol-=loss; this.dissolved+=loss;
      b.rad=Math.sqrt(Math.max(1e-12,b.vol)/b.len);
      this.keepInside(b.rest,b.len*0.5);
      if(b.rad/Math.sqrt(b.flat)<THK_MIN||b.vol<1e-7){ this.dissolved+=b.vol; this.blobs.splice(i,1); continue; }
      // 너무 길어지면 겹치게 둘로 나눈다 → 이어진 줄무늬. 이번 프레임에 더 못 나누면 더 안 늘어난다
      if(b.len>LEN_MAX){
        if(splits>0&&this.blobs.length+born.length<this.cap){
          splits--;
          const c=this.clone(b); c.vol=b.vol*0.5; b.vol*=0.5;
          const h=b.len*0.5; b.len=c.len=b.len*0.6;
          c.rest.addScaledVector(b.axis,h); b.rest.addScaledVector(b.axis,-h);
          b.rad=c.rad=Math.sqrt(b.vol/b.len);
          this.keepInside(c.rest,c.len*0.5); this.keepInside(b.rest,b.len*0.5); born.push(c);
        }else if(b.len>LEN_HARD){
          // 더 나눌 자리가 없으면 길고 얇은 띠로 늘어나다가 녹아 사라진다 (그만큼 자리가 난다)
          const k=LEN_HARD/b.len; b.len=LEN_HARD; b.flat=Math.max(1,b.flat*k); b.rad=Math.sqrt(b.vol/b.len);
        }
      }
      b.smear=(b.smear||0)+mv;
    }
    for(const c of born) this.blobs.push(c);
    this.grind();
    if(moved) this.gooDirty=true;
    return moved;
  }
  clone(b){
    const T=this.T;
    const c={rest:b.rest.clone(),axis:b.axis.clone(),len:b.len,rad:b.rad,vol:b.vol,flat:b.flat,tone:clamp(b.tone+rnd(-0.1,0.1),0,1),grow:b.grow,p:b.p.clone(),q:b.q.clone(),fresh:false,smear:0};
    this.initBend(c); if(b.bend){ c.bend.copy(b.bend); c.bendT.copy(b.bendT); }
    return c;
  }
  keepInside(v,margin=0){ const r=v.length(), m=Math.max(0.3,RMAX-margin); if(r>m) v.multiplyScalar(m/r); }

  // ── 매 프레임 (bappu-ball update 에서) ──
  update(dt){
    const B=this.ball;
    this.updateHaze(dt);
    this.updateBlobs(dt);
    if(this.gooDirty){ this.updateStain(); this.gooDirty=false; }
    // 녹은 진물 색 (전체)
    const tintT=1-Math.exp(-(this.dissolved/this.volRef+this.grime/6000));
    this.tint+=(tintT-this.tint)*(1-Math.exp(-1.5*dt));
    this.haze=B._murkShown;
    this.applyUniforms();
  }
  // 주무를수록 공기가 접혀 들어가 뿌얘진다 (바퀴가 부서진 뒤부터). ball.murk 에 쌓는다
  updateHaze(dt){
    const B=this.ball; let used=0,damage=0,work=0;
    for(const r of B.roaches){ if(r.used){ used++; damage+=Math.max(0,r.stage-1)/3; } }
    damage/=Math.max(1,used);
    for(const d of B.dents){
      if(d._murkAge==null||d.t<d._murkAge){ d._murkK=0; d._murkDrag=0; }
      const k=clamp(d.k,0,1);
      if(d.on) work+=Math.max(0,k-d._murkK)+Math.max(0,d.drag-d._murkDrag)*1.3*k;
      d._murkK=k; d._murkDrag=d.drag; d._murkAge=d.t;
    }
    B.murk=clamp((B.murk||0)+(1-(B.murk||0))*damage*work*0.045*HAZE,0,0.8);
    B._murkShown=(B._murkShown||0)+(B.murk-(B._murkShown||0))*(1-Math.exp(-2*dt));

    // 바퀴 물이 드는 정도: 부서진 바퀴가 많을수록, 손가락으로 누르고 문지른 만큼 연갈색이 짙어진다. 저절로 빠지지 않는다
    this.dye+=(1-this.dye)*damage*work*DYE;
    this.dyeShown+=(this.dye-this.dyeShown)*(1-Math.exp(-2*dt));

  }
  updateBlobs(dt){
    const B=this.ball, tgt=this._tmp[6], m=this._m, sc=this._s, c=this._c, bv=this._bendV, P=this._segP, tg=this._segT, ax=this._ax, az=this._az, A=this.alphaAttr.array;
    const n=this.blobs.length, drawN=n*SEG; let any=false;
    const k=1-Math.exp(-7*dt), kb=1-Math.exp(-9*dt), decay=Math.exp(-2.5*dt);
    for(let i=0;i<n;i++){
      const b=this.blobs[i];
      if(!b.curl) this.initBend(b);
      if(!b.flat) b.flat=FLAT0[0];
      if(b.grow<1){ b.grow=Math.min(1,b.grow+dt*3.2); any=true; }
      B.interiorPoint(b.rest,tgt);
      const dx=tgt.distanceTo(b.p);
      if(dx>1e-5){ b.p.lerp(tgt,b.fresh?1:k); any=true; }
      b.fresh=false;
      // 주무를 때 생긴 굽힘은 목표를 따라갔다가 서서히 풀린다
      if(b.bendT.lengthSq()>1e-12||b.bend.lengthSq()>1e-12){ b.bend.lerp(b.bendT,kb); b.bendT.multiplyScalar(decay); if(b.bendT.lengthSq()<1e-12) b.bendT.set(0,0,0); any=true; }
      if(any||this.gooDirty||this.mesh.count!==drawN){
        const g=b.grow*b.grow*(3-2*b.grow), len=b.len*lerp(0.35,1,g), sf=Math.sqrt(b.flat);
        const wid=b.rad*sf*g, thk=b.rad/sf*g;           // 띠 너비·두께 (반)
        // 굽힘 = 저절로 굽은 것(curl) + 주무른 것(bend), 둘 다 축에 수직으로 다시 맞춘다
        b.curl.addScaledVector(b.axis,-b.axis.dot(b.curl)); if(b.curl.lengthSq()<1e-6) b.curl.set(0,0,1).addScaledVector(b.axis,-b.axis.z); b.curl.normalize();
        bv.copy(b.curl).multiplyScalar(CURL*len).add(b.bend); bv.addScaledVector(b.axis,-bv.dot(b.axis));
        for(let j=0;j<SEG;j++) P[j].copy(b.p).addScaledVector(b.axis,SEG_OFF[j]*len).addScaledVector(bv,SEG_CURVE[j]);
        c.setRGB(lerp(1,0.84,b.tone),lerp(1,0.79,b.tone),lerp(1,0.66,b.tone));
        // 두꺼운 덩어리는 진하고, 얇게 펴질수록 비친다
        const al=lerp(ALPHA_THIN,ALPHA_THICK,sstep(0.004,0.026,b.rad/sf))*lerp(0.4,1,g);
        for(let j=0;j<SEG;j++){
          tg.copy(P[Math.min(SEG-1,j+1)]).sub(P[Math.max(0,j-1)]); if(tg.lengthSq()<1e-10) tg.copy(b.axis); tg.normalize();
          // 띠: 길이 = 줄기 방향, 얇은 쪽 = 굽는 쪽(curl), 넓은 쪽 = 둘 다에 수직
          az.copy(b.curl).addScaledVector(tg,-tg.dot(b.curl)); if(az.lengthSq()<1e-8){ az.set(0,0,1).addScaledVector(tg,-tg.z); if(az.lengthSq()<1e-8) az.set(1,0,0).addScaledVector(tg,-tg.x); } az.normalize();
          ax.crossVectors(tg,az);
          m.makeBasis(ax,tg,az); m.scale(sc.set(wid*SEG_RAD[j],len*0.5,thk*SEG_RAD[j])); m.setPosition(P[j]);
          this.mesh.setMatrixAt(i*SEG+j,m); this.mesh.setColorAt(i*SEG+j,c); A[i*SEG+j]=al;
        }
      }
    }
    if(this.mesh.count!==drawN){ this.mesh.count=drawN; any=true; }
    if(any||this.gooDirty){ this.mesh.instanceMatrix.needsUpdate=true; if(this.mesh.instanceColor) this.mesh.instanceColor.needsUpdate=true; this.alphaAttr.needsUpdate=true; }
    const op=B.fade; if(this.mat.opacity!==op){ this.mat.opacity=op; }
    this.mesh.visible=n>0;
  }
  // 진물이 표면 가까이 있는 자리를 슬라임 정점에 찍는다
  updateStain(){
    if(!this.ws) return;
    const B=this.ball, base=B.slimeBase, ws=this.ws, hs=this.hs, W=ws+1;
    const pr=this.present; pr.fill(0);
    const res=this.residue, nv=this._tmp[7];
    const PI=Math.PI;
    for(const b of this.blobs){
      const r=b.rest.length(); if(r<0.60) continue;
      const near=sstep(0.62,0.86,r);
      const a0=0.05+1.1*b.rad;
      const smear=b.smear||0; b.smear=0;
      const samples=b.len>0.07?3:1;
      for(let si=0;si<samples;si++){
        const off=samples===1?0:(si-1)*b.len*0.62;
        nv.copy(b.rest).addScaledVector(b.axis,off); const rr=nv.length(); if(rr<1e-5) continue; nv.multiplyScalar(1/rr);
        const th=Math.acos(clamp(nv.y,-1,1)), fy=th/PI*hs;
        let u=Math.atan2(nv.z,-nv.x)/(2*PI); u=((u%1)+1)%1; const fx=u*ws;
        const dy=Math.ceil(a0/PI*hs)+1;
        const iy0=Math.max(0,Math.round(fy)-dy), iy1=Math.min(hs,Math.round(fy)+dy);
        for(let iy=iy0;iy<=iy1;iy++){
          const st=Math.sin(iy/hs*PI);
          const dx=st<0.06?ws:Math.min(ws>>1,Math.ceil(a0/(2*PI*st)*ws)+1);
          const cx=Math.round(fx);
          for(let j=-dx;j<=dx;j++){
            const ix=((cx+j)%ws+ws)%ws, vi=iy*W+ix;
            const c=base[vi*3]*nv.x+base[vi*3+1]*nv.y+base[vi*3+2]*nv.z;
            const ang=Math.acos(clamp(c,-1,1)); if(ang>a0*1.6) continue;
            const w=Math.exp(-(ang*ang)/(a0*a0)*1.6)*near;
            if(w*0.35>pr[vi]) pr[vi]=w*0.35;
            res[vi]=Math.min(0.78,res[vi]+w*smear*4);
          }
        }
      }
    }
    const A=this.stainAttr.array;
    for(let iy=0;iy<=hs;iy++){ const row=iy*W; for(let ix=0;ix<ws;ix++){ const vi=row+ix; A[vi]=clamp(res[vi]+pr[vi],0,1); } A[row+ws]=A[row]; }
    this.stainAttr.needsUpdate=true;
  }



  applyUniforms(){
    for(const mat of [this.ball.matFront,this.ball.matBack]){
      const u=mat.userData.gooUniforms; if(!u) continue;
      u.uHaze.value=this.haze; u.uTint.value=this.tint; if(u.uDye) u.uDye.value=this.dyeShown;
      const tc=mat.userData.gooTint; if(tc) u.uTintCol.value.copy(tc[0]).lerp(tc[1],clamp(this.grime/12000,0,1));
      // 테두리 빛(청록)도 같이 물든다 — 이게 그대로면 속이 갈색이어도 공이 여전히 맑아 보인다
      const st=mat.userData.slimeTint;
      if(st&&st.uniforms&&st.uniforms.uRim){
        if(!st.dyeRim) st.dyeRim=disp(this.T,mat===this.ball.matFront?0xbd8a55:0xa87545);
        st.uniforms.uRim.value.copy(st.rim).lerp(st.dyeRim,this.dyeShown*0.9);
      }
    }
    const k=this.dyeShown*(this.ball.fade??1);
    this.dyeShell.visible=k>0.004; this.dyeMat.color.copy(this._white).lerp(this._dyeMul,k);
  }

  // ── 상태 저장/복원/초기화 ──
  getState(){
    return {dissolved:this.dissolved,grime:this.grime,dye:this.dye,blobs:this.blobs.map(b=>({rest:b.rest.toArray(),axis:b.axis.toArray(),len:b.len,rad:b.rad,vol:b.vol,flat:b.flat,tone:b.tone})),residue:Array.from(this.residue)};
  }
  setState(st){
    this.reset(); if(!st) return;
    const T=this.T;
    this.dissolved=st.dissolved||0; this.grime=st.grime||0; this.dye=this.dyeShown=clamp(st.dye||0,0,1);
    for(const d of (st.blobs||[])){
      if(this.blobs.length>=this.cap) break;
      const b={rest:new T.Vector3().fromArray(d.rest),axis:new T.Vector3().fromArray(d.axis).normalize(),len:d.len,rad:d.rad,vol:d.vol,flat:d.flat||FLAT0[0],tone:d.tone||0,grow:1,p:new T.Vector3(),q:new T.Quaternion(),fresh:true};
      this.initBend(b); this.keepInside(b.rest); this.ball.interiorPoint(b.rest,b.p); this.blobs.push(b);
    }
    if(st.residue&&st.residue.length===this.residue.length) this.residue.set(st.residue);
    this.tint=1-Math.exp(-(this.dissolved/this.volRef+this.grime/6000));
    this.gooDirty=true;
  }
  reset(){
    this.blobs.length=0; this.dissolved=0; this.grime=0; this.tint=0; this.haze=0; this.dye=0; this.dyeShown=0;
    this.residue.fill(0); this.present.fill(0); this.stainAttr.array.fill(0); this.stainAttr.needsUpdate=true;
    const zero=this._m.makeScale(0,0,0); for(let i=0;i<this.cap*SEG;i++) this.mesh.setMatrixAt(i,zero);
    this.mesh.count=0; this.mesh.instanceMatrix.needsUpdate=true; this.mesh.visible=false;
    this.applyUniforms();
  }
  dispose(){ this.mesh.geometry.dispose(); this.mat.dispose(); this.dyeMat.dispose(); }






}
