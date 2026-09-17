(function (root, factory) {
  const api = factory(typeof module === "object" && module.exports ? require("./game-rules.js") : root.SammeltjesRules);
  if (typeof module === "object" && module.exports) module.exports = api;
  else root.SammeltjesRequests = api;
})(typeof globalThis !== "undefined" ? globalThis : this, function (Rules) {
  "use strict";
  const STORAGE_KEY = "sammeltjes-friend-requests-v1";
  const enabled = (item) => Boolean(item && (item.enabled ?? item.active));
  const validId = (id) => typeof id === "string" && /^[a-z0-9-]{1,100}$/i.test(id);
  const validRecord = (item) => item && validId(item.giverId) && validId(item.targetId) && item.giverId !== item.targetId;
  function normalize(value) {
    const seen = new Set();
    const completed = (Array.isArray(value?.completed) ? value.completed : []).filter((item) => {
      if (!validRecord(item) || !Number.isFinite(Date.parse(item.completedAt)) || seen.has(item.giverId)) return false;
      seen.add(item.giverId); return true;
    }).map(({giverId, targetId, completedAt}) => ({giverId, targetId, completedAt}));
    const item = value?.active;
    const active = validRecord(item) && !seen.has(item.giverId) ? {giverId:item.giverId, targetId:item.targetId} : null;
    return {active, completed};
  }
  function offer(giver, entities, discovered, progress, now = new Date()) {
    if (!enabled(giver) || !discovered.has(giver.id) || progress.active || progress.completed.some((q) => q.giverId === giver.id)) return null;
    const candidates = entities.filter((item) => item.id !== giver.id && enabled(item) && discovered.has(item.id) && Rules.available(item, now))
      .map((item) => ({item, distance:Rules.distance(giver, item)}))
      .filter((entry) => entry.distance <= 1500)
      .sort((a,b) => a.distance - b.distance || a.item.id.localeCompare(b.item.id));
    return candidates.length ? {giverId:giver.id, targetId:candidates[0].item.id} : null;
  }
  function complete(progress, greetedId, canMeet, now = new Date()) {
    if (!progress.active || progress.active.targetId !== greetedId || !canMeet) return progress;
    return normalize({active:null, completed:[...progress.completed, {...progress.active, completedAt:now.toISOString()}]});
  }
  function tale(biome) {
    if (["lucht", "dijk"].includes(biome)) return {title:"Een groet op de wind", message:"Ik heb een groet voor {target}. Wil je die namens mij overbrengen?", story:"De wind kan ver reizen, maar een groet van een vriend komt altijd op de juiste plek. Vandaag bracht jij er eentje over het eiland."};
    if (["kust", "haven", "wad", "kwelder"].includes(biome)) return {title:"Een bericht van de kust", message:"Tussen de golven dacht ik aan {target}. Wil je even gaan kijken en de groetjes doen?", story:"Tussen het ruisen van de zee en het tikken van de scheepstouwen was er vandaag een klein moment van vriendschap. Dankzij jou."};
    if (biome === "mystiek") return {title:"Een klein lichtje", message:"Een vriendelijk gezicht maakt een dag lichter. Wil je {target} namens mij begroeten?", story:"Niet alle eilandmagie schittert. Soms is het gewoon iemand die langskomt en even aan je denkt."};
    if (biome === "schaapsveld") return {title:"Een wollige groet", message:"Ik blijf nog even bij de schapen. Wil jij ondertussen {target} de groetjes doen?", story:"Terwijl de schapen rustig verder graasden, vond een zachte groet zijn weg over het eiland. Een klein ommetje, een groot plezier."};
    if (biome === "molen") return {title:"Een molen vol verhalen", message:"De wieken draaien maar door! Wil je {target} vertellen dat ik aan hem of haar denk?", story:"De molen hield de wind gezelschap, jij hield de vriendjes verbonden. Zo kreeg een gewone wandeling een eigen klein verhaal."};
    return {title:"Een ommetje voor een vriend", message:"Tussen het eilandgroen dacht ik aan {target}. Wil je namens mij even hallo zeggen?", story:"Een pad door het groen, een vriendelijk gezicht en een groet om door te geven. Meer was er niet nodig voor een mooie eilanddag."};
  }
  return {STORAGE_KEY, normalize, offer, complete, tale, enabled};
});
