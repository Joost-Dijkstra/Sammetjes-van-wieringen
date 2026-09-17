const {test} = require('node:test');
const assert = require('node:assert/strict');
const Requests = require('../friend-requests.js');
const now = new Date('2026-09-17T12:00:00Z');
const friend = (id, extra = {}) => ({id,lat:52.93,lng:5.02,active:true,availabilityMode:'all-day',...extra});
const giver=friend('giver'), near=friend('near',{lng:5.021}), far=friend('far',{lng:5.03});
const found=new Set(['giver','near','far']);
const empty=()=>Requests.normalize(null);

test('Verzoekjes kiezen een bekend, wakker vriendje dichtbij zonder toeval',()=>{
  assert.deepEqual(Requests.offer(giver,[giver,far,near],found,empty(),now),{giverId:'giver',targetId:'near'});
  assert.equal(Requests.offer(giver,[giver,near],new Set(['giver']),empty(),now),null);
  assert.equal(Requests.offer(giver,[giver,near],new Set(['near']),empty(),now),null);
});
test('Slapende, uitgeschakelde en verre vriendjes krijgen geen nieuwe opdracht',()=>{
  const unavailable=[giver,friend('near',{active:false}),friend('far',{availabilityMode:'schedule',activeFrom:'23:00',activeUntil:'04:00'})];
  assert.equal(Requests.offer(giver,unavailable,found,empty(),now),null);
  assert.equal(Requests.offer(giver,[giver,friend('near',{lng:5.1})],found,empty(),now),null);
});
test('Een vriendje buiten simulatiebereik blijft een geldig bekend vriendje',()=>{
  const target=friend('near',{enabled:true,active:false});
  assert.equal(Requests.offer(giver,[giver,target],found,empty(),now).targetId,'near');
});
test('Eentje tegelijk en slechts een beloning per vragend vriendje',()=>{
  const active={active:{giverId:'giver',targetId:'near'},completed:[]};
  assert.equal(Requests.offer(giver,[giver,near],found,active,now),null);
  const complete=Requests.complete(active,'near',true,now);
  assert.equal(Requests.offer(giver,[giver,near],found,complete,now),null);
  assert.equal(Requests.complete(complete,'near',true,now),complete);
  assert.equal(complete.completed.length,1);
});
test('Alleen de juiste, werkelijk nabije begroeting voltooit een verzoekje',()=>{
  const active={active:{giverId:'giver',targetId:'near'},completed:[]};
  assert.equal(Requests.complete(active,'far',true,now),active);
  assert.equal(Requests.complete(active,'near',false,now),active);
  const complete=Requests.complete(active,'near',true,now);
  assert.equal(complete.active,null);
  assert.equal(complete.completed[0].completedAt,now.toISOString());
  assert.notEqual(active.active,null);
});
test('Opslag verwijdert kapotte records en dubbele stempels zonder geldige voortgang te verliezen',()=>{
  const done={giverId:'giver',targetId:'near',completedAt:now.toISOString()};
  assert.deepEqual(Requests.normalize({active:done,completed:[null,done,done,{...done,giverId:'bad',completedAt:'oops'}]}),{active:null,completed:[done]});
  assert.deepEqual(Requests.normalize({active:{giverId:'a',targetId:'a'},completed:'broken'}),empty());
  assert.deepEqual(Requests.normalize({active:{giverId:'<img>',targetId:'b'}}),empty());
});
test('Verhalen sluiten aan op leefgebieden en hebben een veilige algemene terugval',()=>{
  for(const biome of ['lucht','kust','mystiek','schaapsveld','molen','veld',undefined]) {
    const tale=Requests.tale(biome); assert.ok(tale.title); assert.ok(tale.story); assert.ok(tale.message.includes('{target}'));
  }
});
