// bappu-goo.js — 바뿌볼 진물 층
// 바퀴가 부서질 때 그 자리 밑에 크림색 진물(소화관 갈색 줄 포함)이 생기고,
// 주무르면 손가락이 지나간 방향으로 늘어나고 접히면서 줄무늬가 된다. 점도가 높아서 저절로는 안 섞이고,
// 늘어나 가늘어진 만큼만 슬라임에 녹아 공 전체가 탁해진다.
// 탁함은 세 겹: 진물이 표면 가까이 스친 자리의 얼룩(정점별) + 주무를수록 공기가 접혀 들어간 우윳빛 흐림(전체) + 녹아든 진물 색(전체).
// 조각도 주무를수록 갈린다: 껍질·날개·다리 조각 → 부스러기(shard) → 알갱이(crumb) → 때(grime, 색만 남음). 때가 쌓일수록 공 색이 갈색 쪽으로 탁해진다.
// bappu-ball.js 가 생성자에서 만들고, setStage / knead / update / 상태 저장 / reset / dispose 에서 호출한다.

const clamp=(v,a,b)=>v<a?a:v>b?b:v;
const lerp=(a,b,t)=>a+(b-a)*t;
const sstep=(a,b,x)=>{const t=clamp((x-a)/(b-a),0,1);return t*t*(3-2*t);};
const rnd=(a,b)=>a+Math.random()*(b-a);
// 셰이더 끝(톤매핑·sRGB 변환 뒤)에서 섞는 색이라 변환 없이 화면 색 그대로 넣는다
const disp=(T,hex)=>new T.Color().setRGB(((hex>>16)&255)/255,((hex>>8)&255)/255,(hex&255)/255);

const LEN_MAX=0.32;      // 이보다 길어진 줄기는 둘로 나뉜다 (겹쳐서 이어진 줄무늬가 된다)
const STRETCH=2.0;       // 손가락이 끄는 흐름에 진물이 얼마나 잘 늘어나는지
const RAD_MIN=0.0085;    // 이보다 가늘어지면 슬라임에 녹아든다
const DEPTH_MIN=0.20;    // 공 중심 쪽 한계 (조각과 같다)
const DEPTH_MAX=0.955;

export class GooLayer{
  constructor(ball){
    this.ball=ball; const T=ball.T; this.T=T;
    this.cap=ball.count*9;
    this.blobs=[];
    this.dissolved=0;              // 녹아든 진물 부피
    this.grime=0;                  // 갈려서 색만 남은 조각의 양
    this.crumbLast=new Float32Array(ball.crumbCap*3); this.crumbLastN=0;
    this._zero=new ball.T.Matrix4().makeScale(0,0,0);
    this.volRef=ball.count*3*2.0e-4*0.42; // 이만큼 녹으면 색이 꽤 탁해진다 (전체 진물의 ~40%)
    this.haze=0; this.tint=0;      // 화면에 반영 중인 값 (부드럽게 따라감)
    this.gooDirty=false;
    this._tmp=Array.from({length:12},()=>new T.Vector3());
    this._q=new T.Quaternion(); this._m=new T.Matrix4(); this._s=new T.Vector3(); this._c=new T.Color(); this._tc=new T.Color();
    this._Y=new T.Vector3(0,1,0);
    this.buildMesh();
    this.buildStain();
    this.hookShader(ball.matFront,{aMurk:0.74,haze:0xf3efe6,goo:0xd8c79e,tint:0xc4b58e,grime:0x8f7d60});
    this.hookShader(ball.matBack,{aMurk:0.46,haze:0xe9e3d6,goo:0xcdbb93,tint:0xb9aa84,grime:0x857355});
  }

  // ── 진물 덩어리 메시: 늘일 수 있는 타원체, 크림색 몸통에 갈색 소화관 줄 ──
  buildMesh(){
    const T=this.T, geo=new T.SphereGeometry(1,12,8);
    const P=geo.attributes.position, n=P.count, col=new Float32Array(n*3);
    const cream=new T.Color(0xdcb86a), gut=new T.Color(0x5e3a1c);   // 크림색 곤죽, 소화관 갈색 (sRGB→linear)
    for(let i=0;i<n;i++){
      const x=P.getX(i), y=P.getY(i), z=P.getZ(i);
      // 줄기 방향(y)을 따라 달리는 갈색 줄: x≈0 면 근처. 방향에 따라 보였다 안 보였다 한다
      const vein=sstep(0.30,0.06,Math.abs(x))*sstep(-0.95,-0.55,y)*sstep(0.95,0.55,y);
      const wob=0.92+0.08*Math.sin(y*9.0+z*5.0);
      col[i*3]  =lerp(cream.r,gut.r,vein)*wob;
      col[i*3+1]=lerp(cream.g,gut.g,vein)*wob;
      col[i*3+2]=lerp(cream.b,gut.b,vein)*wob;
    }
    geo.setAttribute('color',new T.Float32BufferAttribute(col,3));
    this.mat=new T.MeshPhysicalMaterial({color:0xffffff,vertexColors:true,roughness:0.52,metalness:0,clearcoat:0.5,clearcoatRoughness:0.38,transparent:true,opacity:1});
    this.mesh=new T.InstancedMesh(geo,this.mat,this.cap);
    this.mesh.count=0; this.mesh.frustumCulled=false; this.mesh.renderOrder=4;
    this.mesh.instanceMatrix.setUsage(T.DynamicDrawUsage);
    this.mesh.instanceColor=new T.InstancedBufferAttribute(new Float32Array(this.cap*3).fill(1),3);
    this.mesh.instanceColor.setUsage(T.DynamicDrawUsage);
    const zero=new T.Matrix4().makeScale(0,0,0); for(let i=0;i<this.cap;i++) this.mesh.setMatrixAt(i,zero);
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

  // 기존 슬라임 셰이더(프레넬 알파)에 얼룩·흐림·색을 덧붙인다
  hookShader(mat,o){
    const T=this.T, prev=mat.onBeforeCompile, prevKey=mat.customProgramCacheKey;
    const self=this;
    mat.onBeforeCompile=function(sh,renderer){
      if(prev) prev.call(this,sh,renderer);
      sh.uniforms.uHaze={value:self.haze}; sh.uniforms.uTint={value:self.tint};
      sh.uniforms.uAMurk={value:o.aMurk};
      sh.uniforms.uHazeCol={value:disp(T,o.haze)}; sh.uniforms.uGooCol={value:disp(T,o.goo)}; sh.uniforms.uTintCol={value:disp(T,o.tint)};
      mat.userData.gooUniforms=sh.uniforms; mat.userData.gooTint=[disp(T,o.tint),disp(T,o.grime)];
      sh.vertexShader='attribute float aStain;\nvarying float vStain;\n'+sh.vertexShader.replace('#include <begin_vertex>','#include <begin_vertex>\nvStain=aStain;');
      const old='gl_FragColor.a=clamp(mix(uAMin,uAMax,f)+spec*1.6,0.0,1.0)*opacity;';
      if(sh.fragmentShader.indexOf(old)<0){ console.warn('bappu-goo: slime shader hook not found'); return; }
      sh.fragmentShader='varying float vStain;\nuniform float uHaze;uniform float uTint;uniform float uAMurk;uniform vec3 uHazeCol;uniform vec3 uGooCol;uniform vec3 uTintCol;\n'
        +sh.fragmentShader.replace(old,
          'float stn=clamp(vStain,0.0,1.0); float hz=clamp(uHaze,0.0,1.0); float tn=clamp(uTint,0.0,1.0);\n'
         +'float m=1.0-(1.0-stn)*(1.0-hz*0.8)*(1.0-tn);\n'
         +'float aBase=mix(uAMin,uAMax,f); float aMurk=mix(uAMurk,max(uAMax,uAMurk)+0.06,f);\n'
         +'gl_FragColor.a=clamp(mix(aBase,aMurk,m)+spec*1.6*(1.0-0.5*m),0.0,1.0)*opacity;\n'
         +'float lum=dot(gl_FragColor.rgb,vec3(0.299,0.587,0.114));\n'
         +'vec3 mcol=mix(mix(uHazeCol,uTintCol,tn),uGooCol,stn*0.85);\n'
         +'gl_FragColor.rgb=mix(gl_FragColor.rgb,mcol*(0.40+0.72*lum),m*0.92)+vec3(spec)*0.3*m;');
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
      const b={rest,axis:ax,len,rad,vol:len*rad*rad,tone:Math.random(),grow:0,p:new T.Vector3(),q:new T.Quaternion(),fresh:true};
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
    const b={rest:rest.clone(),axis:ax,len,rad,vol:len*rad*rad,tone:rnd(0.3,1),grow:0,p:new T.Vector3(),q:new T.Quaternion(),fresh:true};
    this.keepInside(b.rest); this.ball.interiorPoint(b.rest,b.p); this.blobs.push(b); this.gooDirty=true;
  }

  // ── 조각 갈기: 주물러져 움직인 만큼 닳고, 다 닳으면 더 작은 것이 된다 ──
  grind(){
    const B=this.ball;
    for(const r of B.roaches){
      if(!r.used) continue;
      for(let slot=0;slot<r.frag.length;slot++){
        const f=r.frag[slot]; if(!f) continue;
        if(!f._gl){ f._gl=f.rest.clone(); f._gw=0; f._gj=rnd(0.7,1.35); continue; }
        const d=f.rest.distanceTo(f._gl); f._gl.copy(f.rest); if(d<1e-6) continue;
        f._gw+=d;
        const thr=(slot<6?1.25:slot<10?0.5:0.65)*f._gj;   // 껍질은 질기고, 날개·다리는 금방
        if(f._gw>thr) this.grindFrag(r,slot,f);
      }
    }
    for(let i=B.shardList.length-1;i>=0;i--){
      const sh=B.shardList[i];
      if(!sh._gl){ sh._gl=sh.rest.clone(); sh._gw=0; sh._gj=rnd(0.7,1.35); continue; }
      const d=sh.rest.distanceTo(sh._gl); sh._gl.copy(sh.rest); if(d<1e-6) continue;
      sh._gw+=d;
      if(sh._gw>1.5*sh._gj){ B.shardList.splice(i,1); B.shards.count=B.shardList.length; B.fragDirty=true; this.addCrumbs(sh.rest,2); this.grime+=0.4; }
    }
    const CR=B.crumbRest, CL=this.crumbLast;
    if(this.crumbLastN!==B.crumbN){ for(let i=this.crumbLastN;i<B.crumbN;i++){ CL[i*3]=CR[i*3]; CL[i*3+1]=CR[i*3+1]; CL[i*3+2]=CR[i*3+2]; } this.crumbLastN=B.crumbN; }
    for(let i=B.crumbN-1;i>=0;i--){
      const j=i*3, d=Math.abs(CR[j]-CL[j])+Math.abs(CR[j+1]-CL[j+1])+Math.abs(CR[j+2]-CL[j+2]);
      CL[j]=CR[j]; CL[j+1]=CR[j+1]; CL[j+2]=CR[j+2];
      if(d<1e-6) continue;
      if(Math.random()<d*0.35) this.removeCrumb(i);              // 알갱이는 문질러지다 때가 되어 사라진다
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
      this.crumbLast[i*3]=v.x; this.crumbLast[i*3+1]=v.y; this.crumbLast[i*3+2]=v.z;
    }
    this.crumbLastN=B.crumbN; B.crumbs.geometry.setDrawRange(0,B.crumbN); B.dirty=true;
  }
  removeCrumb(i){
    const B=this.ball, CR=B.crumbRest, CL=this.crumbLast, last=B.crumbN-1;
    if(i!==last){ for(let k=0;k<3;k++){ CR[i*3+k]=CR[last*3+k]; CL[i*3+k]=CL[last*3+k]; } }
    B.crumbN=last; this.crumbLastN=last; B.crumbs.geometry.setDrawRange(0,B.crumbN); B.dirty=true; this.grime+=0.25;
  }

  // ── 주무를 때 (bappu-ball knead 에서) : fn(rest,strength) 는 조각을 옮기는 그 흐름 ──
  transport(flows,fn){
    const e1=this._tmp[2], e2=this._tmp[3], d=this._tmp[4], o1=this._tmp[8], o2=this._tmp[9], mdir=this._tmp[6], nb=this._tmp[7], tang=this._tmp[5];
    let moved=false; const born=[];
    for(let i=this.blobs.length-1;i>=0;i--){
      const b=this.blobs[i];
      e1.copy(b.rest).addScaledVector(b.axis,b.len); e2.copy(b.rest).addScaledVector(b.axis,-b.len);
      o1.copy(e1); o2.copy(e2);
      fn(e1,1.0); fn(e2,1.0);
      const mv=e1.distanceTo(o1)+e2.distanceTo(o2);
      if(mv<1e-7) continue;
      moved=true;
      d.copy(e1).sub(e2); let L=d.length()*0.5;
      b.rest.copy(e1).add(e2).multiplyScalar(0.5);
      if(L>1e-5) b.axis.copy(d).normalize();
      // 손가락이 끄는 방향으로 더 늘어난다 (점성 유체는 전단층에서 쭉 늘어난다)
      let stretch=0; mdir.set(0,0,0);
      const rr0=b.rest.length();
      if(rr0>1e-5){
        nb.copy(b.rest).multiplyScalar(1/rr0);
        for(const f of flows){
          const mv=f._mixMove; if(!mv||mv.lengthSq()<1e-12) continue;
          const a=Math.acos(clamp(nb.dot(f.dir),-1,1)), w=Math.max(0.15,f.w);
          const local=Math.exp(-a*a/(2.2*w*w)); if(local<0.01) continue;
          tang.copy(mv).addScaledVector(nb,-mv.dot(nb)); const l=tang.length(); if(l<1e-9) continue;
          const k=local*f._mixPower; stretch+=l*k; mdir.addScaledVector(tang,k/l);
        }
      }
      if(stretch>1e-6&&mdir.lengthSq()>1e-12){
        mdir.normalize(); if(mdir.dot(b.axis)<0) mdir.negate();
        const k=clamp(stretch*STRETCH*6,0,0.6);
        b.axis.lerp(mdir,k).normalize();
        L+=stretch*STRETCH;
      }
      let folded=false;
      if(L>=b.len){ b.len=L; }                                  // 늘어난다 → 가늘어진다
      else{
        // 눌리면 짧아지되, 많이 눌리면 접혀서 나란한 두 줄기가 된다
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
      // 문질러지는 만큼 조금씩 슬라임에 녹는다 (가늘수록 빨리)
      const thin=sstep(0.045,0.012,b.rad);
      const loss=b.vol*clamp(mv*(0.07+0.5*thin),0,0.05);
      b.vol-=loss; this.dissolved+=loss;
      b.rad=Math.sqrt(Math.max(1e-9,b.vol)/b.len);
      this.keepInside(b.rest);
      if(b.rad<RAD_MIN||b.vol<1e-7){ this.dissolved+=b.vol; this.blobs.splice(i,1); continue; }
      // 너무 길어지면 겹치게 둘로 나눈다 → 이어진 줄무늬
      if(b.len>LEN_MAX&&this.blobs.length+born.length<this.cap){
        const c=this.clone(b); c.vol=b.vol*0.5; b.vol*=0.5;
        const h=b.len*0.5; b.len=c.len=b.len*0.6;
        c.rest.addScaledVector(b.axis,h); b.rest.addScaledVector(b.axis,-h);
        b.rad=c.rad=Math.sqrt(b.vol/b.len);
        this.keepInside(c.rest); this.keepInside(b.rest); born.push(c);
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
    const c={rest:b.rest.clone(),axis:b.axis.clone(),len:b.len,rad:b.rad,vol:b.vol,tone:clamp(b.tone+rnd(-0.1,0.1),0,1),grow:b.grow,p:b.p.clone(),q:b.q.clone(),fresh:false,smear:0};
    return c;
  }
  keepInside(v){ const r=v.length(); if(r<1e-6){ v.set(0,DEPTH_MIN,0); return; } v.multiplyScalar(clamp(r,DEPTH_MIN,DEPTH_MAX)/r); }

  // ── 매 프레임 (bappu-ball update 에서) ──
  update(dt){
    const B=this.ball;
    this.updateHaze(dt);
    this.updateBlobs(dt);
    if(this.gooDirty){ this.updateStain(); this.gooDirty=false; }
    // 녹은 진물 색 (전체)
    const tintT=1-Math.exp(-(this.dissolved/this.volRef+this.grime/1100));
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
    B.murk=clamp((B.murk||0)+(1-(B.murk||0))*damage*work*0.045,0,0.8);
    B._murkShown=(B._murkShown||0)+(B.murk-(B._murkShown||0))*(1-Math.exp(-2*dt));
  }
  updateBlobs(dt){
    const B=this.ball, T=this.T, tgt=this._tmp[6], m=this._m, s=this._s, q=this._q, c=this._c;
    const n=this.blobs.length; let any=false;
    const k=1-Math.exp(-7*dt);
    for(let i=0;i<n;i++){
      const b=this.blobs[i];
      if(b.grow<1){ b.grow=Math.min(1,b.grow+dt*3.2); any=true; }
      B.interiorPoint(b.rest,tgt);
      const dx=tgt.distanceTo(b.p);
      if(dx>1e-5){ b.p.lerp(tgt,b.fresh?1:k); any=true; }
      b.fresh=false;
      if(any||this.gooDirty||this.mesh.count!==n){
        q.setFromUnitVectors(this._Y,b.axis);
        const g=b.grow*b.grow*(3-2*b.grow);
        s.set(b.rad*g,b.len*lerp(0.35,1,g),b.rad*g);
        m.compose(b.p,q,s); this.mesh.setMatrixAt(i,m);
        c.setRGB(lerp(1,0.84,b.tone),lerp(1,0.79,b.tone),lerp(1,0.66,b.tone)); this.mesh.setColorAt(i,c);
      }
    }
    if(this.mesh.count!==n){ this.mesh.count=n; any=true; }
    if(any||this.gooDirty){ this.mesh.instanceMatrix.needsUpdate=true; if(this.mesh.instanceColor) this.mesh.instanceColor.needsUpdate=true; }
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
      u.uHaze.value=this.haze; u.uTint.value=this.tint;
      const tc=mat.userData.gooTint; if(tc) u.uTintCol.value.copy(tc[0]).lerp(tc[1],clamp(this.grime/1600,0,1));
    }
  }

  // ── 상태 저장/복원/초기화 ──
  getState(){
    return {dissolved:this.dissolved,grime:this.grime,blobs:this.blobs.map(b=>({rest:b.rest.toArray(),axis:b.axis.toArray(),len:b.len,rad:b.rad,vol:b.vol,tone:b.tone})),residue:Array.from(this.residue)};
  }
  setState(st){
    this.reset(); if(!st) return;
    const T=this.T;
    this.dissolved=st.dissolved||0; this.grime=st.grime||0;
    for(const d of (st.blobs||[])){
      if(this.blobs.length>=this.cap) break;
      const b={rest:new T.Vector3().fromArray(d.rest),axis:new T.Vector3().fromArray(d.axis).normalize(),len:d.len,rad:d.rad,vol:d.vol,tone:d.tone||0,grow:1,p:new T.Vector3(),q:new T.Quaternion(),fresh:true};
      this.ball.interiorPoint(b.rest,b.p); this.blobs.push(b);
    }
    if(st.residue&&st.residue.length===this.residue.length) this.residue.set(st.residue);
    this.tint=1-Math.exp(-(this.dissolved/this.volRef+this.grime/1100));
    this.gooDirty=true;
  }
  reset(){
    this.blobs.length=0; this.dissolved=0; this.grime=0; this.tint=0; this.haze=0; this.crumbLastN=0;
    this.residue.fill(0); this.present.fill(0); this.stainAttr.array.fill(0); this.stainAttr.needsUpdate=true;
    const zero=this._m.makeScale(0,0,0); for(let i=0;i<this.cap;i++) this.mesh.setMatrixAt(i,zero);
    this.mesh.count=0; this.mesh.instanceMatrix.needsUpdate=true; this.mesh.visible=false;
    this.applyUniforms();
  }
  dispose(){ this.mesh.geometry.dispose(); this.mat.dispose(); }
}
