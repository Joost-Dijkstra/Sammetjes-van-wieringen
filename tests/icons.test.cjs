const {test}=require("node:test");
const assert=require("node:assert/strict");
const fs=require("node:fs");
const path=require("node:path");
const sharp=require("sharp");
const root=path.resolve(__dirname,"..");
const manifest=JSON.parse(fs.readFileSync(path.join(root,"manifest.webmanifest"),"utf8"));
const html=fs.readFileSync(path.join(root,"index.html"),"utf8");
const worker=fs.readFileSync(path.join(root,"service-worker.js"),"utf8");

test("App-iconen hebben de beloofde afmetingen en een ondoorzichtige achtergrond",async()=>{
  assert.deepEqual(manifest.icons.map(icon=>icon.sizes),["192x192","512x512"]);
  assert.ok(manifest.icons.some(icon=>icon.purpose.split(" ").includes("maskable")));
  for(const icon of manifest.icons) {
    const meta=await sharp(path.join(root,icon.src)).metadata();
    assert.equal(meta.format,"png");
    assert.equal(meta.width+"x"+meta.height,icon.sizes);
    assert.equal(meta.hasAlpha,false);
    assert.ok(worker.includes('"./'+icon.src+'"'));
  }
});

test("Browser en iPhone gebruiken nieuwe iconen die offline beschikbaar blijven",async()=>{
  for(const [rel,size] of [["icon",48],["apple-touch-icon",180]]) {
    const tag=html.match(new RegExp('<link\\s+rel="'+rel+'"[^>]*>'))?.[0];
    assert.ok(tag,rel);
    const src=tag.match(/href="([^"]+)"/)[1];
    assert.equal(src,"assets/icons/sprietje-"+size+".png");
    const meta=await sharp(path.join(root,src)).metadata();
    assert.equal(meta.width,size);
    assert.equal(meta.height,size);
    assert.ok(worker.includes('"./'+src+'"'));
  }
  assert.ok(!worker.includes("sprietje-source.png"),"De grote bronillustratie hoort niet in de mobiele offlinecache.");
  assert.equal(manifest.start_url,"./index.html");
  assert.equal(manifest.scope,"./");
});
