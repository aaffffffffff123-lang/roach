// The cup can admit a resident before the 3D scene has finished loading.
export const TANK_KEY='roach_pets_v2', CAP=30;
const journal=TANK_KEY+'/pending/';
const names=[
  '콩이','깨알이','쫑긋이','꼬물이','토리','알밤이','땅콩이','보리',
  '단추','밤톨','도토리','마루','솜이','두부','모찌','호두',
  '후추','참깨','팥알이','좁쌀이','먼지','뭉치','오디','자두',
  '꼬미','송이','방울이','몽실이','구름이','달콩이','쪼리','포동이',
  '소보로','고물이','까망이','밤비','반디','쑥이','찹쌀이','조약돌',
];
export function pickPetName(pets){
  const used=new Set(pets.map(p=>p.name)), free=names.filter(n=>!used.has(n));
  return free[Math.floor(Math.random()*free.length)]||names[0];
}
export function makeResident(pets,nextNo,name){
  const now=Date.now(), size=+(0.95+Math.random()*0.11).toFixed(4);
  return {id:'p'+crypto.randomUUID(), no:nextNo, name:name||pickPetName(pets), born:now,arrived:now,
    life:+(27+Math.random()*6).toFixed(4),size,deco:{},greeted:pets.some(p=>!p.dead)?0:1};
}

const keys={
  pets:p=>p.id, graves:g=>g.no, fallen:f=>f.petId+'/'+f.type,
  missing:m=>m.id||m.name+'/'+m.at, props:(p,i)=>p.id||'legacy-'+p.k+'-'+i,
};
const equal=(a,b)=>JSON.stringify(a)===JSON.stringify(b);
function fields(before,after){
  const changes=[];
  for(const k of new Set([...Object.keys(before),...Object.keys(after)])){
    if(!equal(before[k],after[k])) changes.push(k in after?[k,after[k]]:[k]);
  }
  return changes;
}
function applyFields(record,changes){
  for(const [key,...value] of changes){
    if(value.length) record[key]=value[0]; else delete record[key];
  }
}
function keyed(list,key){return new Map((list||[]).map((item,i)=>[key(item,i),item]));}

// A snapshot only contributes what changed since this particular scene last saved.
export function sceneChanges(before,after){
  const delta={};
  for(const [name,key] of Object.entries(keys)){
    const a=keyed(before[name],key), b=keyed(after[name],key), ops=[];
    for(const [id] of a) if(!b.has(id)) ops.push({id,remove:true});
    for(const [id,item] of b){
      if(!a.has(id)) ops.push({id,add:item});
      else { const edit=fields(a.get(id),item); if(edit.length) ops.push({id,edit}); }
    }
    if(ops.length||(!Array.isArray(before[name])&&Array.isArray(after[name]))) delta[name]=ops;
  }
  const lines=fields(before.recentLines||{},after.recentLines||{});
  if(lines.length) delta.recentLines=lines;
  if(after.nextNo>before.nextNo) delta.nextNo=after.nextNo;
  return delta;
}
export function applyChanges(state,delta){
  for(const [name,key] of Object.entries(keys)){
    if(!delta[name]) continue;
    const list=keyed(state[name],key);
    for(const op of delta[name]){
      if(op.remove) list.delete(op.id);
      else if(op.add){ if(!list.has(op.id)) list.set(op.id,structuredClone(op.add)); }
      else if(list.has(op.id)) applyFields(list.get(op.id),op.edit);
    }
    state[name]=[...list.values()];
  }
  if(delta.recentLines){
    state.recentLines??={};
    applyFields(state.recentLines,delta.recentLines);
  }
  if(delta.nextNo) state.nextNo=Math.max(state.nextNo||1,delta.nextNo);
  return state;
}
function readBase(){
  const raw=localStorage.getItem(TANK_KEY)??localStorage.getItem('roach_pets_v1');
  if(!raw) return {v:1,nextNo:1,pets:[]};
  let data; try{data=JSON.parse(raw);}catch{}
  return data&&typeof data==='object'&&!Array.isArray(data)?data:{v:1,nextNo:1,pets:[]};
}
function pendingKeys(){
  const found=[];
  for(let i=0;i<localStorage.length;i++){const key=localStorage.key(i); if(key?.startsWith(journal)) found.push(key);}
  return found.sort();
}
function readWithPending(pending){
  const state=readBase();
  for(const key of pending){const raw=localStorage.getItem(key); if(raw) applyChanges(state,JSON.parse(raw));}
  return state;
}
export function readTank(){
  // A different tab can finish compaction between reading the base and its entries.
  let raw, state;
  do {
    raw=localStorage.getItem(TANK_KEY);
    state=readWithPending(pendingKeys());
  } while(raw!==localStorage.getItem(TANK_KEY));
  return state;
}
let lockDB;
function exclusive(fn){
  if(navigator.locks?.request) return navigator.locks.request(TANK_KEY,fn);
  if(!globalThis.indexedDB) return fn();
  lockDB??=new Promise((resolve,reject)=>{
    const open=indexedDB.open('roach-tank-writes',1);
    open.onupgradeneeded=()=>open.result.createObjectStore('turn');
    open.onsuccess=()=>resolve(open.result);
    open.onerror=()=>{ lockDB=null; reject(open.error); };
  });
  return lockDB.then(db=>new Promise((resolve,reject)=>{
    const tx=db.transaction('turn','readwrite');
    tx.objectStore('turn').get(0).onsuccess=()=>{
      try{ resolve(fn()); }catch(error){ reject(error); }
    };
    tx.onabort=()=>reject(tx.error);
  }));
}
function writeTank(update){
  return exclusive(()=>{
    const pending=pendingKeys(), state=readWithPending(pending);
    const result=update?.(state);
    if(pending.length||result){
      localStorage.setItem(TANK_KEY,JSON.stringify(state));
      for(const key of pending) localStorage.removeItem(key);
    }
    return result;
  });
}
let serial=0;
export function persistChanges(delta){
  if(!Object.keys(delta).length) return;
  if(!navigator.locks?.request&&!globalThis.indexedDB){
    const state=readTank(); applyChanges(state,delta);
    localStorage.setItem(TANK_KEY,JSON.stringify(state)); return;
  }
  // pagehide may end the document before its lock is granted. Leave a durable,
  // independently keyed change for the next reader, then compact under the lock.
  const key=journal+Date.now().toString(36)+'-'+String(++serial).padStart(9,'0')+'-'+crypto.randomUUID();
  localStorage.setItem(key,JSON.stringify(delta));
  return writeTank();
}
export function admitResident(name){
  return writeTank(state=>{
    const pets=Array.isArray(state.pets)?state.pets.filter(p=>p?.id&&p.born>0):[];
    if(pets.length>=CAP) return null;
    const next=Math.max(1,state.nextNo|0,...pets.map(p=>(p.no|0)+1),...(Array.isArray(state.graves)?state.graves:[]).map(g=>(g?.no|0)+1));
    const rec=makeResident(pets,next,name);
    state.pets=[...pets,rec]; state.nextNo=next+1; return rec;
  });
}
