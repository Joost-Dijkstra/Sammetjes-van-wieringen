(function (root, factory) {
  const commonJS = typeof module === "object" && module.exports;
  const api = factory(commonJS ? require("./game-rules.js") : root.SammeltjesRules,
    commonJS ? require("./friend-requests.js") : root.SammeltjesRequests);
  if (commonJS) module.exports = api;
  else root.SammeltjesPersonality = api;
})(typeof globalThis !== "undefined" ? globalThis : this, function (Rules, Requests) {
  "use strict";
  const FOLLOW_UPS = {
    breinaalden: ["Oma heeft haar breinaalden weer. Ze breit nu sokken voor Opa! Mijn sjaaltje houdt me lekker warm.", "Dankzij jou kon ik weer verder breien. Opa's sokken krijgen vrolijke streepjes!"],
    bietensoep: ["Van mijn bieten heeft Oma soep gemaakt. Ze zegt dat er een extra beetje gezelligheid in zat.", "De bietensoep is gelukt! Ik heb een extra kommetje klaargezet. Wat fijn dat je weer langskomt."],
    "warme-sjaal": ["Dijkwacht draagt de sjaal tijdens zijn ronde. Zelfs de wind krijgt hem niet meer aan het bibberen.", "Die sjaal van Dijkdraakje zit heerlijk. Ik vergeet nu veel minder vaak mijn nek warm te houden."],
    windboek: ["Opa heeft zijn windboek weer. Ik weet nog precies welk verhaal mijn lievelingsverhaal was.", "Het windboek staat weer op de plank. Er dwarrelt soms nog een briesje uit als ik erlangs loop."],
    "bijzondere-schelp": ["Schelpenwachter heeft mijn vondst een ereplekje gegeven. Wie had dat gedacht van zo'n klein schelpje?", "De schelp uit Nettenvissertjes net staat tussen mijn lievelingsvondsten. Kom je nog eens kijken?"],
    schelpencadeau: ["Weet je die schelpjes nog die je naar {target} bracht? Ik word nog vrolijk als ik eraan denk.", "De schelpjes van Mosselmop liggen op een mooi plekje. Ik heb de mooiste natuurlijk niet stiekem teruggevraagd."],
    kruidenthee: ["Wat fijn dat je de thee bij {target} hebt gebracht. Ik heb alweer een nieuw geurig mengseltje bedacht.", "Oma's kruidenthee was heerlijk. Zelfs mijn gedachten werden er een beetje warmer van."],
    "zacht-veertje": ["Het veertje is veilig bij {target}. Bij mij was het vast alweer weggewaaid!", "Het veertje van Wolkje ligt uit de tocht. Als ik het zie, denk ik even aan jullie."],
    veldbloemen: ["Ik hoop dat {target} nog blij is met het boeketje. De hommel vroeg er laatst ook naar.", "De bloemen van Akkervonk maakten mijn plekje zo vrolijk. En nee, de hommel is nog niet teruggekomen."],
    geluksarmband: ["Het armbandje is dankzij jou bij {target}. Ik ben best een beetje trots op dat scheve knoopje.", "Kijk, het geluksarmbandje van Havenpluimpje! Dat scheve knoopje is inmiddels mijn lievelingsstukje."],
    rietfluitje: ["Heb je {target} al horen fluiten? Ik geloof dat de eenden zich een beetje aangesproken voelen.", "Ik oefen nog op Rietritters fluitje. Het klinkt nu als een eend die een heel goed humeur heeft."],
    verhalenbrief: ["Fijn dat mijn verhaal bij {target} is aangekomen. Verhalen blijven beter leven als je ze deelt.", "Opa's brief heb ik nog eens gelezen. Bij de tweede keer ontdekte ik een nieuw klein detail."],
    "gevonden-want": ["De want is weer bij {target}. Sindsdien kijk ik tijdens mijn ronde ook goed naar verdwaalde sokken.", "Mijn wanten blijven nu netjes bij elkaar. Dijkwacht en jij hebben me een hoop gezoek bespaard."],
    bloemzaadjes: ["Mijn zaadjes zijn bij {target}. Nu mogen ze rustig groeien. Dat gaat niet sneller als je ze haast geeft.", "De zaadjes van Sprietje hebben een plekje in mijn tuintje. Ik zing er heel zachtjes bij."],
    glinstersteen: ["Mijn steentje is bij {target}. Zo'n klein cadeautje kan een groot warm gevoel geven, vind je niet?", "Goudglims steentje vangt prachtig het licht. Het herinnert me aan een vriendelijk ommetje van jou."]
  };
  const AMBIENT = {
    "wieringer-wolkje":"Even uitwaaien?",
    dijkdraakje:"Ik houd de dijk gezelschap.",
    "kwelder-sprietje":"Mijn blaadjes ritselen!",
    "kapel-kabbeltje":"Ssst... luister eens.",
    rietritter:"Hoor je het riet ook?",
    mistmuis:"Ik kijk even om het hoekje.",
    akkervonk:"Wat een fijn ommetje!",
    schelpenwachter:"Er valt zoveel te ontdekken.",
    stormster:"Ik hou wel van een briesje.",
    goudglim:"Zie je dat kleine glinstertje?",
    schapenherdertje:"Ik tel nog even de schaapjes.",
    "boer-bietje":"Even pauze tussen de bietjes.",
    molenmaatje:"De wind heeft weer verhalen.",
    nettenvissertje:"Ik kijk graag naar de zee.",
    "opa-duinbaard":"Kom maar rustig even zitten.",
    "oma-wierwortel":"Ruik je mijn kruidentuintje?",
    dijkwacht:"Ik houd een oogje in het zeil.",
    havenpluimpje:"Een knoopje vol gezelligheid!",
    mosselmop:"Zoek jij ook kleine schatten?",
    waddenwriemel:"Wat zou daar glinsteren?"
  };

  function greeting(entity, {known=false, progress=null, entities=[], now=new Date()} = {}) {
    if (!known) return {kind:"first", label:"Een nieuwe ontmoeting", text:"Hallo! Wat leuk om jou te ontmoeten."};
    const history = Requests.normalize(progress).completed
      .filter(q => (q.giverId === entity.id || q.targetId === entity.id) && Date.parse(q.completedAt) <= now.getTime())
      .sort((a,b) => Date.parse(b.completedAt)-Date.parse(a.completedAt) || a.giverId.localeCompare(b.giverId));
    if (history.length) {
      const q = history[0], isGiver = q.giverId === entity.id;
      const giver = entities.find(item => item.id === q.giverId);
      const target = entities.find(item => item.id === q.targetId);
      const story = Requests.describe(q, giver, target);
      // Later story details only appear on a subsequent Dutch calendar day.
      const later = Rules.localTime(new Date(q.completedAt)).date < Rules.localTime(now).date;
      const followUp = later && story.personal && FOLLOW_UPS[q.templateId]?.[isGiver ? 0 : 1];
      const text = followUp || (story.personal
        ? isGiver ? "Wat fijn dat je " + story.item.toLowerCase() + " naar {target} hebt gebracht. Dank je wel voor je hulp!"
          : "Ik ben blij met " + story.item.toLowerCase() + " van {giver}. Wat lief dat je het kwam brengen!"
        : isGiver ? "Dank je dat je mijn groet aan {target} hebt overgebracht. Fijn dat je er weer bent!"
          : "Die groet van {giver} maakte mijn dag een beetje mooier. Gezellig dat je terug bent!");
      return {kind:"memory", label:"Samen meegemaakt", text:text.replaceAll("{giver}",giver?.name || "een eilandvriendje").replaceAll("{target}",target?.name || "een eilandvriendje")};
    }
    const minute = Rules.localTime(now).minute;
    const hello = minute < 360 ? "Wat een rustig nachtelijk bezoek." : minute < 720 ? "Goedemorgen, daar ben je weer!" : minute < 1080 ? "Hé, wat gezellig dat je er weer bent!" : "Goedenavond, fijn dat je weer langskomt!";
    const text = entity.behavior === "scared" ? "O, jij bent het! Ik kijk eerst even rustig, maar ik herken je wel."
      : entity.behavior === "shy" ? hello + " Je mag best even rustig bij me staan."
      : hello + " Ik vind het leuk om je weer te zien.";
    return {kind:"familiar", label:"Welkom terug", text};
  }

  function reaction(entity, known, now=new Date()) {
    const seed = [...entity.id + Rules.localTime(now).date].reduce((sum,char) => sum + char.charCodeAt(0),0);
    if (entity.behavior === "scared") return {motion:"peek", text:known ? "O, jij bent het!" : "Rustig aan... ik kijk even."};
    if (entity.behavior === "shy") return {motion:"nod", text:known && seed % 2 ? "Fijn dat je er weer bent." : AMBIENT[entity.id] || "Ssst... ik luister even."};
    return {motion:"wave", text:known ? seed % 2 ? "Hé, gezellig!" : AMBIENT[entity.id] || "Daar ben je weer!" : "Kom je even kennismaken?"};
  }

  const REACTION_TIMING = {dwell:1500, duration:5500, between:25000, perFriend:120000};
  function createReactions() {
    return {active:null, candidateId:null, candidateSince:0, cooldownUntil:0, lastShown:{}};
  }
  // UI supplies only nearby, awake and unobstructed candidates; no random timers.
  function stepReactions(previous, candidates, now) {
    const next = {...previous};
    if (next.active) {
      if (now < next.active.until && candidates.some(item => item.id === next.active.id)) return next;
      next.active = null;
      next.candidateId = null;
    }
    if (now < next.cooldownUntil) { next.candidateId=null; return next; }
    const target = candidates.filter(item => now - (next.lastShown[item.id] ?? -Infinity) >= REACTION_TIMING.perFriend)
      .sort((a,b) => a.distance-b.distance || a.id.localeCompare(b.id))[0];
    if (!target) { next.candidateId=null; return next; }
    if (next.candidateId !== target.id) {
      next.candidateId=target.id; next.candidateSince=now; return next;
    }
    if (now-next.candidateSince < REACTION_TIMING.dwell) return next;
    next.active={id:target.id, until:now+REACTION_TIMING.duration};
    next.cooldownUntil=now+REACTION_TIMING.duration+REACTION_TIMING.between;
    next.lastShown={...next.lastShown,[target.id]:now};
    next.candidateId=null;
    return next;
  }
  return {greeting, reaction, createReactions, stepReactions, REACTION_TIMING, FOLLOW_UPS};
});
