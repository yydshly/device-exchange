import ts from 'typescript';import fs from 'node:fs';import assert from 'node:assert/strict';
const source=fs.readFileSync(new URL('../lib/transfer.ts',import.meta.url),'utf8');
const js=ts.transpileModule(source,{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.ES2022}}).outputText;
const {Transfer,digest,MAX,frameChunk}=await import('data:text/javascript;base64,'+Buffer.from(js).toString('base64'));
const results=[];const pass=(name)=>{results.push({test:name,status:'passed'});console.log('PASS',name);};
function harness(){const sent=[],states=[],offers=[],done=[];const channel={readyState:'open',bufferedAmount:0,send:x=>sent.push(x)};const t=new Transfer(channel,{state:x=>states.push(x),offer:x=>offers.push(x),done:(meta,blob)=>done.push({meta,blob}),trust:()=>{}});return {t,sent,states,offers,done};}
const h=harness();await assert.rejects(h.t.offer(new File(['x'],'x.txt')),/配对码/);pass('cannot_offer_before_bilateral_trust');
h.t.trust();await assert.rejects(h.t.offer(new File(['x'],'x.txt')),/配对码/);await h.t.receive(JSON.stringify({kind:'trust',version:2}));assert(h.t.ready);pass('bilateral_trust_required');
await h.t.offer(new File(['test'],'test.txt',{type:'text/plain'}));assert.equal(h.sent.filter(x=>typeof x!=='string').length,0);pass('offer_has_no_file_bytes_before_accept');
const meta=h.t.outgoing.meta;await h.t.receive(JSON.stringify({kind:'accept',id:meta.id}));assert.equal(h.sent.filter(x=>typeof x!=='string').length,1);await h.t.receive(JSON.stringify({kind:'ack',id:meta.id,sha:meta.sha}));assert.equal(h.t.outgoing,null);pass('accept_sends_chunks_ack_completes');
const r=harness();r.t.trusted=r.t.remoteTrusted=true;const bytes=new TextEncoder().encode('合成文件 🐠').buffer;const m={kind:'offer',id:crypto.randomUUID(),name:'synthetic.txt',type:'text/plain',size:bytes.byteLength,sha:await digest(bytes)};
await r.t.receive(JSON.stringify(m));await assert.rejects(r.t.receive(frameChunk(m.id,0,bytes)),/unexpected/);r.t.accept();await r.t.receive(frameChunk(m.id,0,bytes));await r.t.receive(JSON.stringify({kind:'end',id:m.id}));assert.equal(await r.done[0].blob.text(),'合成文件 🐠');pass('receiver_consent_and_exact_reassembly');
const bad=harness();bad.t.trusted=bad.t.remoteTrusted=true;await bad.t.receive(JSON.stringify({...m,sha:'0'.repeat(64)}));bad.t.accept();await bad.t.receive(frameChunk(m.id,0,bytes));await assert.rejects(bad.t.receive(JSON.stringify({kind:'end',id:m.id})),/checksum/);assert.equal(bad.done.length,0);pass('checksum_mismatch_never_exposes_download');
await assert.rejects(r.t.receive(JSON.stringify({...m,size:MAX+1})),/metadata/);pass('oversize_metadata_rejected');
await r.t.receive(JSON.stringify({...m,id:crypto.randomUUID()}));r.t.reject();assert.equal(r.t.incoming,null);assert.equal(JSON.parse(r.sent.at(-1)).kind,'cancel');pass('reject_discards_transfer');
await h.t.offer(new File(['cancel'],'cancel.txt'));h.t.cancel();assert.equal(h.t.outgoing,null);pass('cancel_discards_outgoing');
const report={tested_at_utc:new Date().toISOString(),kind:'Protocol unit tests with mock channel; NOT actual WebRTC or browser verification',results};fs.writeFileSync(new URL('../docs/protocol-results.json',import.meta.url),JSON.stringify(report,null,2));
