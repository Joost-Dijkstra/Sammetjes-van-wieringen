const {test}=require("node:test");
const assert=require("node:assert/strict");
const Personality=require("../companion-personality.js");
const Requests=require("../friend-requests.js");
const entities=require("../data/sammeltjes.json");
const now=new Date("2026-09-19T12:00:00Z");
const giver=entities.find(item=>item.id==="schapenherdertje");
const target=entities.find(item=>item.id==="oma-wierwortel");
const request={giverId:giver.id,targetId:target.id,templateId:"breinaalden",completedAt:"2026-09-18T12:00:00Z"};

test("Onbekende bewoners herkennen je niet op basis van oude of losse gegevens",()=>{
  const result=Personality.greeting(giver,{known:false,progress:{completed:[request]},now,entities});
  assert.equal(result.kind,"first");
  assert.ok(!result.text.includes("sokken"));
});
test("Bekende bewoners hebben passende begroetingen zonder verzonnen bezorging",()=>{
  for(const behavior of ["curious","shy","scared"]) {
    const entity={...giver,behavior};
    const result=Personality.greeting(entity,{known:true,now,entities,progress:{active:request}});
    assert.equal(result.kind,"familiar");
    assert.ok(!result.text.includes("breinaalden"));
    assert.deepEqual(result,Personality.greeting(entity,{known:true,now,entities}));
  }
});
test("Gever en ontvanger herinneren zich alleen een echt afgerond eigen verzoekje",()=>{
  for(const entity of [giver,target]) {
    const result=Personality.greeting(entity,{known:true,now,entities,progress:{completed:[request]}});
    assert.equal(result.kind,"memory");
    assert.ok(result.text.includes("sokken"));
  }
  assert.equal(Personality.greeting({id:"molenmaatje",behavior:"shy"},{known:true,now,entities,progress:{completed:[request]}}).kind,"familiar");
});
test("Een vervolgverhaal verschijnt pas op een volgende Nederlandse kalenderdag",()=>{
  const progress={completed:[{...request,completedAt:"2026-09-19T10:00:00Z"}]};
  const same=Personality.greeting(giver,{known:true,progress,now,entities});
  assert.ok(same.text.includes("breinaalden"));
  assert.ok(!same.text.includes("sokken"));
  const tomorrow=Personality.greeting(giver,{known:true,progress,now:new Date("2026-09-19T22:05:00Z"),entities});
  assert.ok(tomorrow.text.includes("sokken"));
});
test("Oude groeten, ontbrekende bewoners en toekomstige records krijgen een veilige terugval",()=>{
  const legacy={...request}; delete legacy.templateId;
  const result=Personality.greeting(giver,{known:true,progress:{completed:[legacy]},now});
  assert.ok(result.text.includes("groet"));
  assert.ok(result.text.includes("eilandvriendje"));
  const future={...request,completedAt:"2099-01-01T12:00:00Z"};
  assert.equal(Personality.greeting(giver,{known:true,progress:{completed:[future]},now}).kind,"familiar");
});
test("Alle vijftien verzoekjes hebben persoonlijke vervolgteksten voor beide rollen",()=>{
  for(const story of Requests.CATALOG) {
    const lines=Personality.FOLLOW_UPS[story.id];
    assert.equal(lines.length,2,story.id);
    for(const line of lines) assert.ok(line.length>20);
  }
});
test("Herinneringen kiezen de nieuwste afgeronde bezorging zonder opslag te veranderen",()=>{
  const latest={giverId:"boer-bietje",targetId:target.id,templateId:"bietensoep",completedAt:"2026-09-19T11:00:00Z"};
  const progress={completed:[latest,request]};
  const before=JSON.stringify(progress);
  assert.ok(Personality.greeting(target,{known:true,progress,now,entities}).text.includes("bieten"));
  assert.equal(JSON.stringify(progress),before);
});
test("Kaartreacties passen bij het ingestelde karakter en variëren niet per frame",()=>{
  for(const [behavior,motion] of [["curious","wave"],["scared","peek"],["shy","nod"]]) {
    const entity={...giver,behavior};
    const reaction=Personality.reaction(entity,true,now);
    assert.equal(reaction.motion,motion);
    assert.deepEqual(reaction,Personality.reaction(entity,true,now));
    assert.ok(reaction.text.length<45);
  }
  assert.ok(!Personality.reaction({...giver,behavior:"curious"},false,now).text.includes("weer"));
});
test("Er verschijnt pas na rustig naderen één reactie, met een globale en persoonlijke pauze",()=>{
  const candidates=[{id:"a",distance:10},{id:"b",distance:15}];
  let state=Personality.createReactions();
  state=Personality.stepReactions(state,candidates,0);
  assert.equal(state.active,null);
  state=Personality.stepReactions(state,candidates,1400);
  assert.equal(state.active,null);
  state=Personality.stepReactions(state,candidates,1500);
  assert.equal(state.active.id,"a");
  const before=JSON.stringify(state);
  assert.equal(Personality.stepReactions(state,candidates,6500).active.id,"a");
  assert.equal(JSON.stringify(state),before);
  state=Personality.stepReactions(state,candidates,7100);
  assert.equal(state.active,null);
  state=Personality.stepReactions(state,candidates,32000);
  assert.equal(state.candidateId,"b");
  state=Personality.stepReactions(state,candidates,33500);
  assert.equal(state.active.id,"b");
});
test("Weglopen of een bedekte kaart verwijdert de reactie en onderbreekt het naderen",()=>{
  let state=Personality.stepReactions(Personality.createReactions(),[{id:"a",distance:5}],0);
  state=Personality.stepReactions(state,[],1000);
  state=Personality.stepReactions(state,[{id:"a",distance:5}],1500);
  assert.equal(state.active,null);
  state=Personality.stepReactions(state,[{id:"a",distance:5}],3000);
  assert.equal(state.active.id,"a");
  state=Personality.stepReactions(state,[],3001);
  assert.equal(state.active,null);
  assert.equal(state.candidateId,null);
  assert.equal(state.cooldownUntil,33500);
});
