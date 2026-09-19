const {test} = require('node:test');
const assert = require('node:assert/strict');
const Requests = require('../friend-requests.js');
const now = new Date('2026-09-17T12:00:00Z');
const friend = (id, extra = {}) => ({id,lat:52.93,lng:5.02,active:true,availabilityMode:'all-day',...extra});
const giver=friend('giver'), near=friend('near',{lng:5.021}), far=friend('far',{lng:5.03});
const found=new Set(['giver','near','far']);
const empty=()=>Requests.normalize(null);

test('Alle vijftien persoonlijke verhalen hebben bestaande vriendjes, tekst en een icoon',()=>{
  const data=require('../data/sammeltjes.json');
  const ids=new Set(data.map(i=>i.id));
  const sprite=require('node:fs').readFileSync(require('node:path').join(__dirname,'../assets/request-items.svg'),'utf8');
  assert.equal(Requests.CATALOG.length,15);
  assert.equal(new Set(Requests.CATALOG.map(q=>q.id)).size,15);
  assert.equal(new Set(Requests.CATALOG.map(q=>q.giverId)).size,15);
  for(const q of Requests.CATALOG) {
    assert.ok(ids.has(q.giverId),q.giverId);
    assert.ok(q.targets.length);
    for(const id of q.targets) {assert.ok(ids.has(id),id);assert.notEqual(id,q.giverId);}
    for(const key of ['title','message','thanks','story','item','icon']) assert.ok(q[key],q.id+':'+key);
    assert.ok(sprite.includes('id="'+q.icon+'"'),q.icon);
    if(q.fixed) assert.equal(q.targets.length,1);
  }
});
test('Vaste verhalen wisselen nooit van ontvanger, ook niet voor een nabijer vriendje',()=>{
  const giver=friend('schapenherdertje'), oma=friend('oma-wierwortel',{lng:5.08}), other=friend('boer-bietje');
  const known=new Set([giver.id,oma.id,other.id]);
  const offer=Requests.offer(giver,[giver,other,oma],known,empty(),now);
  assert.equal(offer.targetId,oma.id);
  assert.equal(offer.templateId,'breinaalden');
  assert.equal(Requests.offer(giver,[giver,other],known,empty(),now),null);
  assert.equal(Requests.offer(giver,[giver,{...oma,active:false},other],known,empty(),now),null);
});
test('Wisselcadeautjes kiezen alleen passende bekende ontvangers en blijven dichtbij',()=>{
  const giver=friend('mosselmop'), target=friend('nettenvissertje',{lng:5.025}), wrong=friend('oma-wierwortel');
  const known=new Set([giver.id,target.id,wrong.id]);
  assert.equal(Requests.offer(giver,[wrong,giver,target],known,empty(),now).targetId,target.id);
  assert.equal(Requests.offer(giver,[wrong,giver,{...target,lng:5.2}],known,empty(),now),null);
  assert.equal(Requests.offer({...giver,active:false},[giver,target],known,empty(),now),null);
  assert.equal(Requests.offer({...giver,availabilityMode:'schedule',activeFrom:'01:00',activeUntil:'02:00'},[giver,target],known,empty(),now),null);
});
test('Ieder persoonlijk verzoekje heeft met huidige woonplekken een mogelijke ontvanger',()=>{
  // Test geography separately from daily schedules, without moving production friends.
  const data=require('../data/sammeltjes.json').map(i=>({...i,availabilityMode:'all-day'}));
  const known=new Set(data.map(i=>i.id));
  for(const q of Requests.CATALOG) assert.ok(Requests.offer(data.find(i=>i.id===q.giverId),data,known,empty(),now),q.id);
});
test('Persoonlijke voorwerpen en ontvangers blijven bij herladen en bezorgen gelijk',()=>{
  const request={giverId:'schapenherdertje',targetId:'oma-wierwortel',templateId:'breinaalden'};
  const stored=Requests.normalize(JSON.parse(JSON.stringify({active:request,completed:[]})));
  assert.deepEqual(stored.active,request);
  const completed=Requests.complete(stored,request.targetId,true,now);
  assert.equal(completed.completed[0].templateId,'breinaalden');
  const tale=Requests.describe(completed.completed[0],null,{name:'Oma Wierwortel'});
  assert.ok(tale.message.includes('Oma Wierwortel'));
  assert.ok(tale.thanks.includes('sokken'));
  assert.equal(tale.personal,true);
});
test('Oude actieve groeten en verdiende stempels worden niet omgeschreven of gewist',()=>{
  const legacy={active:{giverId:'molenmaatje',targetId:'wieringer-wolkje'},completed:[{giverId:'schapenherdertje',targetId:'oma-wierwortel',completedAt:now.toISOString()}]};
  assert.deepEqual(Requests.normalize(legacy),legacy);
  assert.equal(Requests.describe(legacy.active,{biome:'molen'},{name:'Wolkje'}).personal,false);
  assert.equal(Requests.describe(legacy.completed[0],{biome:'schaapsveld'},null).personal,false);
  assert.equal(Requests.complete(legacy,'wieringer-wolkje',true,now).completed.length,2);
});
test('Onbekende of onjuiste templategegevens vallen veilig terug op een groet',()=>{
  for(const templateId of ['<img onerror=bad>','breinaalden','missing']) {
    const active=Requests.normalize({active:{giverId:'molenmaatje',targetId:'wieringer-wolkje',templateId}}).active;
    assert.deepEqual(active,{giverId:'molenmaatje',targetId:'wieringer-wolkje'});
    assert.equal(Requests.describe(active,null,null).personal,false);
  }
});

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
