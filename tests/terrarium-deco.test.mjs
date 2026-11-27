import test from 'node:test';
import assert from 'node:assert/strict';
import { applyChanges, sceneChanges, readTank, persistChanges, TANK_KEY } from '../bamung-store.js';

const red={c:'#ff6060',on:true}, blue={c:'#6080ff',on:true};
const pink={c:'#ff80ad',s:'solid'}, gold={c:'#e4c052',s:'dots'};
const sticker=(id,k='heart')=>({id,k,p:[0,.14,-.2],n:[0,1,0],r:0,s:.24});
const scene=(deco={})=>({nextNo:2,pets:[{id:'p',born:1,no:1,deco}]});
const appearance=s=>s.pets[0].deco;
function action(base,change){
  const next=structuredClone(base);
  change(appearance(next),next);
  return sceneChanges(base,next);
}
function replay(base,...ops){
  const out=structuredClone(base);
  for(const op of ops) applyChanges(out,JSON.parse(JSON.stringify(op)));
  return out;
}

test('모자 착용·벗기기와 다른 탭의 매니큐어가 어느 순서든 공존한다',()=>{
  for(const old of [null,red]){
    const base=scene(old?{hat:old}:{});
    const hat=action(base,d=>old?delete d.hat:d.hat=red), polish=action(base,d=>d.polish={L:pink});
    for(const ops of [[hat,polish],[polish,hat]]){
      const d=appearance(replay(base,...ops));
      assert.deepEqual(d.hat,old?undefined:red); assert.deepEqual(d.polish,{L:pink});
    }
  }
});
test('매니큐어는 부위별로 칠하거나 지우고 동일 부위는 나중에 적용한 값이 이긴다',()=>{
  const base=scene({polish:{L:pink}}), left=action(base,d=>d.polish.L=gold);
  const right=action(base,d=>d.polish.R=pink), erase=action(base,d=>delete d.polish);
  assert.deepEqual(appearance(replay(base,erase,right)).polish,{R:pink});
  assert.deepEqual(appearance(replay(base,right,erase)).polish,{R:pink});
  assert.deepEqual(appearance(replay(base,erase,left)).polish,{L:gold});
  assert.equal(appearance(replay(base,left,erase)).polish,undefined);
});
test('같은 모자의 재착용과 해제는 적용 순서대로 결정한다',()=>{
  const base=scene({hat:red}), off=action(base,d=>delete d.hat), on=action(base,d=>d.hat=blue);
  assert.equal(appearance(replay(base,on,off)).hat,undefined);
  assert.deepEqual(appearance(replay(base,off,on)).hat,blue);
});
test('같은 위치·같은 무늬의 두 스티커를 각각 보존하고 재생해도 복제하지 않는다',()=>{
  const base=scene(), a=action(base,d=>d.stickers=[sticker('a')]), b=action(base,d=>d.stickers=[sticker('b')]);
  for(const ops of [[a,b,a],[b,a,b]]) assert.deepEqual(appearance(replay(base,...ops)).stickers.map(s=>s.id).sort(),['a','b']);
});
test('스티커 한 장 되돌리기는 후속 스티커·모자·매니큐어를 보존한다',()=>{
  const base=scene(), placed=replay(base,action(base,d=>d.stickers=[sticker('a')]));
  const undo=sceneChanges(placed,base), remote=action(placed,d=>{d.hat=red; d.polish={P:gold}; d.stickers.push(sticker('b'));});
  const d=appearance(replay(placed,remote,undo,undo));
  assert.deepEqual(d.stickers,[sticker('b')]); assert.deepEqual(d.hat,red); assert.deepEqual(d.polish,{P:gold});
});
test('구형 ID 없는 중복 장식과 외부 확장 필드를 유지한다',()=>{
  const {id,...old}=sticker('unused'), base=scene({stickers:[old,old],gems:[old],extra:{v:3}});
  const add=action(base,d=>d.stickers.push(sticker('new'))), trim=action(base,d=>d.stickers.pop());
  for(const ops of [[add,trim],[trim,add]]){
    const d=appearance(replay(base,...ops));
    assert.deepEqual(d.stickers,[old,sticker('new')]); assert.deepEqual(d.gems,[old]); assert.deepEqual(d.extra,{v:3});
  }
});
test('스티커 14장과 보석 16개 중 마지막 자리는 먼저 반영된 한 개에 배정한다',()=>{
  for(const [key,limit] of [['stickers',14],['gems',16]]){
    const base=scene({[key]:Array.from({length:limit-1},(_,i)=>sticker('old'+i))});
    const a=action(base,d=>d[key].push(sticker('a'))), b=action(base,d=>d[key].push(sticker('b')));
    for(const [first,second,id] of [[a,b,'a'],[b,a,'b']]){
      const items=appearance(replay(base,first,second))[key];
      assert.equal(items.length,limit); assert.equal(items.at(-1).id,id);
    }
  }
});
test('모자가 떨어지는 도중에 벗기면 바닥에 사본이 남지 않고 반대 순서는 낙하를 유지한다',()=>{
  const base={...scene({hat:red}),fallen:[]}, off=action(base,d=>delete d.hat);
  const drop=action(base,(d,s)=>{d.hat.on=false; s.fallen.push({petId:'p',type:'hat',c:red.c});});
  assert.deepEqual(replay(base,drop,off).fallen,[]);
  const fallen=replay(base,off,drop); assert.equal(appearance(fallen).hat.on,false); assert.equal(fallen.fallen.length,1);
});
test('오래된 장면의 입주·꾸미기 저장이 정원이나 퇴거를 되돌리지 않는다',()=>{
  const base=scene(), oldEdit=action(base,d=>d.hat=red);
  const packed=scene(); packed.pets=Array.from({length:30},(_,i)=>({id:'p'+i,born:1,no:i+1}));
  const staleAdd={pets:[{id:'late',add:{id:'late',no:31,born:1,deco:{}}}]};
  assert.equal(replay(packed,staleAdd,oldEdit).pets.length,30);
  assert.deepEqual(replay(base,{pets:[{id:'p',remove:true}]},oldEdit).pets,[]);
});
test('v1과 구버전 미완료 기록을 이어 읽고 새 장식 기록을 두 번 읽어도 결과가 같다',async()=>{
  const map=new Map();
  globalThis.localStorage={get length(){return map.size;},key:i=>[...map.keys()][i],getItem:k=>map.get(k)??null,
    setItem:(k,v)=>map.set(k,String(v)),removeItem:k=>map.delete(k)};
  let unlock;
  const gate=new Promise(r=>{unlock=r;});
  Object.defineProperty(globalThis,'navigator',{configurable:true,value:{locks:{request:(_,fn)=>gate.then(fn)}}});
  const base=scene(); delete base.pets[0].deco;
  localStorage.setItem('roach_pets_v1',JSON.stringify(base));
  const legacy={pets:[{id:'p',edit:[['deco',{hat:red}]]}]};
  localStorage.setItem(TANK_KEY+'/pending/000-000-a',JSON.stringify(legacy));
  const tx=persistChanges(action(readTank(),d=>d.polish={L:pink}));
  const expected={hat:red,polish:{L:pink}};
  assert.deepEqual(appearance(readTank()),expected); assert.deepEqual(appearance(readTank()),expected);
  assert.equal(localStorage.getItem(TANK_KEY),null);
  unlock(); await tx; assert.deepEqual(appearance(readTank()),expected);
  assert.equal(map.size,2); assert.deepEqual(JSON.parse(localStorage.getItem('roach_pets_v1')),base);
});
test('동일 스티커 ID 수정·삭제는 적용 순서대로 결정하며 다른 스티커는 유지한다',()=>{
  const a=sticker('a'), b=sticker('b'), base=scene({stickers:[a,b]});
  const move=action(base,d=>{d.stickers[0].p=[.2,.1,0];});
  const off=action(base,d=>{d.stickers.shift();});
  assert.deepEqual(appearance(replay(base,move,off)).stickers,[b]);
  const restored=appearance(replay(base,off,move)).stickers;
  assert.deepEqual(restored.find(item=>item.id==='a').p,[.2,.1,0]); assert.deepEqual(restored.find(item=>item.id==='b'),b);
});
test('같은 모자에 대한 되돌리기는 새로운 변경으로 적용하고 리본과 글씨는 보존한다',()=>{
  const base=scene({hat:red}), own=replay(base,action(base,d=>{d.hat=blue;}));
  const remote=action(own,d=>{d.hat={c:'green',on:true}; d.abow={side:-1,c:'pink',on:true}; d.text={t:'안녕',c:'gold'};});
  const undo=sceneChanges(own,base);
  const d=appearance(replay(own,remote,undo)); assert.deepEqual(d.hat,red);
  assert.equal(d.abow.side,-1); assert.deepEqual(d.text,{t:'안녕',c:'gold'});
});
