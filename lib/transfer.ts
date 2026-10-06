export const MAX = 25 * 1024 * 1024;
export type Meta = {id:string;name:string;size:number;type:string;sha:string};
export async function digest(bytes: ArrayBuffer) {return Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256', bytes)),b=>b.toString(16).padStart(2,'0')).join('');}
export class Transfer {
 channel: RTCDataChannel; trusted=false; remoteTrusted=false;
 outgoing: {meta:Meta;bytes:ArrayBuffer;cancelled:boolean}|null=null;
 incoming: {meta:Meta;chunks:ArrayBuffer[];size:number;accepted:boolean}|null=null;
 onState:(s:string)=>void; onOffer:(m:Meta|null)=>void; onDone:(m:Meta,b:Blob)=>void; onTrust:()=>void;
 constructor(channel:RTCDataChannel, events:{state:(s:string)=>void;offer:(m:Meta|null)=>void;done:(m:Meta,b:Blob)=>void;trust:()=>void}) {
  this.channel=channel; this.onState=events.state;this.onOffer=events.offer;this.onDone=events.done;this.onTrust=events.trust;
  channel.binaryType='arraybuffer'; channel.onmessage=e=>{void this.receive(e.data).catch(()=>this.fail('收到无效数据，已中止'));};
  channel.onclose=()=>this.fail('连接已断开，请重新配对');channel.onerror=()=>this.fail('传输连接出错，请重新配对');
 }
 get ready(){return this.trusted&&this.remoteTrusted&&this.channel.readyState==='open';}
 send(v:object){if(this.channel.readyState!=='open')throw new Error('连接尚未就绪');this.channel.send(JSON.stringify(v));}
 trust(){this.trusted=true;this.send({kind:'trust'});this.onTrust();}
 async offer(file:File){if(!this.ready)throw new Error('请先在两端确认配对码');if(this.outgoing)throw new Error('请等待当前发送结束');if(file.size>MAX)throw new Error('第一版单文件上限 25 MiB');
  const bytes=await file.arrayBuffer(), meta={id:crypto.randomUUID(),name:file.name.slice(0,180),size:file.size,type:file.type,sha:await digest(bytes)};
  this.outgoing={meta,bytes,cancelled:false};this.send({kind:'offer',...meta});this.onState('等待另一端同意接收');
 }
 accept(){if(!this.ready||!this.incoming)return;this.incoming.accepted=true;this.send({kind:'accept',id:this.incoming.meta.id});this.onOffer(null);this.onState('正在接收…');}
 reject(){if(this.incoming){this.send({kind:'cancel',id:this.incoming.meta.id});this.incoming=null;}this.onOffer(null);this.onState('已拒绝接收');}
 cancel(){if(this.outgoing){this.outgoing.cancelled=true;this.send({kind:'cancel',id:this.outgoing.meta.id});this.outgoing=null;}if(this.incoming)this.reject();this.onState('已取消传输');}
 fail(s:string){if(this.outgoing)this.outgoing.cancelled=true;this.outgoing=null;this.incoming=null;this.onOffer(null);this.onState(s);}
 async receive(data:string|ArrayBuffer){
  if(typeof data!=='string'){
   const i=this.incoming;if(!this.ready||!i?.accepted||data.byteLength>16384||i.size+data.byteLength>i.meta.size)throw new Error('unexpected bytes');
   i.chunks.push(data);i.size+=data.byteLength;this.onState(`正在接收 ${Math.round(i.size/Math.max(i.meta.size,1)*100)}%`);return;
  }
  if(data.length>10000)throw new Error('message too long');const m=JSON.parse(data);
  if(m.kind==='trust'){this.remoteTrusted=true;this.onTrust();return;}
  if(!this.ready)throw new Error('untrusted');
  if(m.kind==='offer'){
   if(this.incoming){this.send({kind:'cancel',id:m.id});return;}
   if(typeof m.id!=='string'||typeof m.name!=='string'||m.name.length>180||typeof m.type!=='string'||!Number.isSafeInteger(m.size)||m.size<0||m.size>MAX||!/^[a-f0-9]{64}$/.test(m.sha))throw new Error('invalid metadata');
   this.incoming={meta:m,chunks:[],size:0,accepted:false};this.onOffer(m);return;
  }
  if(m.kind==='cancel') {if(this.outgoing && this.outgoing.meta.id===m.id){this.outgoing.cancelled=true;this.outgoing=null;}if(this.incoming?.meta.id===m.id){this.incoming=null;this.onOffer(null);}this.onState('对方取消或拒绝了传输');return;}
  if(m.kind==='accept'){
   const o=this.outgoing;if(!o||o.meta.id!==m.id)return;
   for(let n=0;n<o.bytes.byteLength;n+=16384){
    const start=Date.now();while(this.channel.bufferedAmount>262144){if(o.cancelled)return;if(Date.now()-start>15000)throw new Error('backpressure timeout');await new Promise(r=>setTimeout(r,20));}
    if(o.cancelled)return;this.channel.send(o.bytes.slice(n,n+16384));this.onState(`正在发送 ${Math.min(100,Math.round((n+16384)/o.bytes.byteLength*100))}%`);
   }
   if(!o.cancelled){this.send({kind:'end',id:o.meta.id});this.onState('已发出，等待对方校验');}return;
  }
  if(m.kind==='end'){
   const i=this.incoming;if(!i?.accepted||i.meta.id!==m.id||i.size!==i.meta.size)throw new Error('size mismatch');
   const blob=new Blob(i.chunks,{type:'application/octet-stream'}), sha=await digest(await blob.arrayBuffer());
   if(this.incoming!==i)return;
   if(sha!==i.meta.sha){this.send({kind:'cancel',id:m.id});throw new Error('checksum mismatch');}
   this.incoming=null;this.send({kind:'ack',id:m.id,sha});this.onDone(i.meta,blob);this.onState('已收到 · SHA-256 校验一致');return;
  }
  if(m.kind==='ack'&&this.outgoing&&this.outgoing.meta.id===m.id){if(m.sha!==this.outgoing.meta.sha)throw new Error('ack mismatch');this.outgoing=null;this.onState('发送成功 · 对方已完成 SHA-256 校验');}
 }
}
