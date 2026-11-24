import test, { beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { TANK_KEY, readTank, admitResident, sceneChanges, persistChanges } from '../bamung-store.js';

let writes;
beforeEach(()=>{
  const map=new Map();
  globalThis.localStorage={
    get length(){ return map.size; },
    key:i=>[...map.keys()][i],
    getItem:k=>map.get(k)??null,
    setItem:(k,v)=>map.set(k,String(v)),
    removeItem:k=>map.delete(k),
  };
  writes=Promise.resolve();
  Object.defineProperty(globalThis,'navigator',{configurable:true,value:{locks:{
    request(_,fn){ const result=writes.then(fn); writes=result.catch(()=>{}); return result; },
  }}});
});
const save=(base,changed)=>persistChanges(sceneChanges(base,changed));

test('옛 탭이 닫히거나 같은 바퀴를 편집해도 다른 탭의 입주·개명·퇴거가 보존된다',async()=>{
  const first=await admitResident('첫째');
  const old=readTank(), edited=structuredClone(old);
  edited.pets[0].name='새이름';
  await save(old,edited);
  await admitResident('둘째');
  const stale=structuredClone(old); stale.pets[0].x=0.12;
  await save(old,stale);
  assert.deepEqual(readTank().pets.map(p=>p.name),['새이름','둘째']);
  const latest=readTank(), removed=structuredClone(latest); removed.pets.shift();
  await save(latest,removed);
  stale.pets[0].x=0.25;
  await save(old,stale);
  assert.ok(!readTank().pets.some(p=>p.id===first.id));
});

test('로딩 전에 연속 확정한 두 마리는 새로 읽어도 남고 옛 저장도 이어진다',async()=>{
  const old={pets:[{id:'legacy',no:4,name:'먼지',born:1,deco:{}}],graves:[{no:7,name:'별'}],nextNo:1};
  localStorage.setItem('roach_pets_v1',JSON.stringify(old));
  const [a,b]=await Promise.all([admitResident('콩이'),admitResident('후추')]);
  assert.deepEqual([a.no,b.no],[8,9]); assert.notEqual(a.id,b.id);
  localStorage.setItem('roach_pets_v1','{"pets":[]}');
  assert.deepEqual(readTank().pets.map(p=>p.name),['먼지','콩이','후추']);
});

test('두 탭이 빈자리 하나를 동시에 요청하면 총 30마리에서 멈춘다',async()=>{
  await Promise.all(Array.from({length:29},()=>admitResident('')));
  const results=await Promise.all([admitResident('A'),admitResident('B')]);
  assert.equal(results.filter(Boolean).length,1);
  const saved=readTank();
  assert.equal(saved.pets.length,30);
  assert.equal(new Set(saved.pets.map(p=>p.no)).size,30);
  assert.equal(new Set(saved.pets.map(p=>p.name)).size,30);
});

test('탭이 저장 잠금을 기다리며 종료해도 변경 사항은 다음 읽기에서 복구된다',async()=>{
  await admitResident('먼지');
  const before=readTank(), after=structuredClone(before);
  after.pets[0].greeted=1;after.pets[0].name='단추';
  let release;
  writes=new Promise(resolve=>{release=resolve;});
  const flushing=save(before,after);
  assert.equal(JSON.parse(localStorage.getItem(TANK_KEY)).pets[0].name,'먼지');
  assert.equal(readTank().pets[0].name,'단추');
  release(); await flushing;
  assert.equal(localStorage.length,1);
  assert.equal(readTank().pets[0].name,'단추');
});
