export const MAX = 25 * 1024 * 1024;
export const PROTOCOL_VERSION = 2;
const CHUNK = 16_384;
const HEADER = 40; // 36 ASCII UUID bytes + uint32 payload offset
const UUID = /^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/;
export type Meta = { id: string; name: string; size: number; type: string; sha: string };
export async function digest(bytes: ArrayBuffer) {
 return Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256', bytes)), b => b.toString(16).padStart(2, '0')).join('');
}
export function frameChunk(id: string, offset: number, bytes: ArrayBuffer): ArrayBuffer {
 if (!UUID.test(id) || !Number.isSafeInteger(offset) || offset < 0 || offset > MAX || bytes.byteLength > CHUNK) throw new Error('invalid frame');
 const frame = new Uint8Array(HEADER + bytes.byteLength);
 frame.set(new TextEncoder().encode(id));
 new DataView(frame.buffer).setUint32(36, offset);
 frame.set(new Uint8Array(bytes), HEADER);
 return frame.buffer;
}
export class Transfer {
 channel: RTCDataChannel;
 trusted = false;
 remoteTrusted = false;
 preparing: object | null = null;
 // A bounded tombstone set makes queued data from a cancelled/completed transfer harmless.
 private retired = new Set<string>();
 outgoing: { meta: Meta; bytes: ArrayBuffer; cancelled: boolean; phase: 'offered' | 'sending' | 'awaiting_ack' } | null = null;
 incoming: { meta: Meta; chunks: ArrayBuffer[]; size: number; accepted: boolean; verifying: boolean } | null = null;
 onState: (s: string) => void;
 onOffer: (m: Meta | null) => void;
 onDone: (m: Meta, b: Blob) => void;
 onTrust: () => void;
 constructor(channel: RTCDataChannel, events: { state: (s: string) => void; offer: (m: Meta | null) => void; done: (m: Meta, b: Blob) => void; trust: () => void }) {
  this.channel = channel;
  this.onState = events.state; this.onOffer = events.offer; this.onDone = events.done; this.onTrust = events.trust;
  channel.binaryType = 'arraybuffer';
  channel.onmessage = e => { void this.receive(e.data).catch(e => {
   const message = e instanceof Error ? e.message : '';
   const explanation: Record<string, string> = {
    'checksum mismatch': '文件校验未通过，未提供下载，请重新配对后重传',
    'ack mismatch': '对方校验回执异常，未确认成功，请重新配对后重传',
    'size mismatch': '接收大小不完整，未提供下载，请重新配对后重传',
    'backpressure timeout': '传输长时间未推进，已中止，请重新配对后重传',
   };
   this.fail(message.includes('协议版本') ? message : explanation[message] || '收到无效数据，已中止，请重新配对');
  }); };
  channel.onclose = () => this.fail('连接已断开，请重新配对');
  channel.onerror = () => this.fail('传输连接出错，请重新配对');
 }
 private retire(id: string) {
  this.retired.add(id);
  if (this.retired.size > 64) this.retired.delete(this.retired.values().next().value!);
 }
 get ready() { return this.trusted && this.remoteTrusted && this.channel.readyState === 'open'; }
 send(v: object) { if (this.channel.readyState !== 'open') throw new Error('连接尚未就绪'); this.channel.send(JSON.stringify(v)); }
 trust() { this.trusted = true; this.send({ kind: 'trust', version: PROTOCOL_VERSION }); this.onTrust(); }
 async offer(file: File) {
  if (!this.ready) throw new Error('请先在两端确认配对码');
  if (this.outgoing || this.preparing) throw new Error('请等待当前发送结束');
  if (file.size > MAX) throw new Error('第一版单文件上限 25 MiB');
  const reservation = {}; this.preparing = reservation;
  try {
   const bytes = await file.arrayBuffer();
   if (this.preparing !== reservation || !this.ready) return;
   const sha = await digest(bytes);
   if (this.preparing !== reservation || !this.ready) return;
   const meta = { id: crypto.randomUUID(), name: file.name.slice(0, 180), size: file.size, type: file.type, sha };
   this.outgoing = { meta, bytes, cancelled: false, phase: 'offered' };
   this.send({ kind: 'offer', ...meta }); this.onState('等待另一端同意接收');
  } finally { if (this.preparing === reservation) this.preparing = null; }
 }
 accept() {
  if (!this.ready || !this.incoming || this.incoming.accepted) return;
  this.incoming.accepted = true; this.send({ kind: 'accept', id: this.incoming.meta.id }); this.onOffer(null); this.onState('正在接收…');
 }
 reject() {
  if (this.incoming) {
   const id = this.incoming.meta.id; this.retire(id); this.incoming = null;
   this.send({ kind: 'cancel', id });
  }
  this.onOffer(null); this.onState('已拒绝接收');
 }
 cancel() {
  this.preparing = null;
  if (this.outgoing) { this.outgoing.cancelled = true; this.send({ kind: 'cancel', id: this.outgoing.meta.id }); this.outgoing = null; }
  if (this.incoming) this.reject();
  this.onState('已取消传输，可以重新发送');
 }
 fail(s: string) {
  this.preparing = null; this.trusted = false; this.remoteTrusted = false; this.onTrust();
  if (this.outgoing) this.outgoing.cancelled = true;
  if (this.incoming) this.retire(this.incoming.meta.id);
  this.outgoing = null; this.incoming = null; this.onOffer(null); this.onState(s);
 }
 dispose() {
  this.fail('连接已关闭');
  this.channel.onmessage = null; this.channel.onclose = null; this.channel.onerror = null; this.channel.onopen = null;
  this.channel.close();
 }
 async receive(data: string | ArrayBuffer) {
  if (typeof data !== 'string') {
   if (!this.ready || data.byteLength < HEADER || data.byteLength > HEADER + CHUNK) throw new Error('unexpected bytes');
   const id = new TextDecoder('utf-8', { fatal: true }).decode(data.slice(0, 36));
   if (!UUID.test(id)) throw new Error('invalid frame id');
   if (this.retired.has(id)) return;
   const offset = new DataView(data).getUint32(36), bytes = data.slice(HEADER), i = this.incoming;
   if (!i?.accepted || i.verifying || i.meta.id !== id || offset !== i.size || bytes.byteLength === 0 || i.size + bytes.byteLength > i.meta.size) throw new Error('unexpected bytes');
   i.chunks.push(bytes); i.size += bytes.byteLength;
   this.onState(`正在接收 ${Math.round(i.size / Math.max(i.meta.size, 1) * 100)}%`); return;
  }
  if (data.length > 10000) throw new Error('message too long');
  const m = JSON.parse(data);
  if (m.kind === 'trust') {
   if (m.version !== PROTOCOL_VERSION) throw new Error('协议版本不一致，请刷新两端页面后重新配对');
   this.remoteTrusted = true; this.onTrust(); return;
  }
  if (!this.ready) throw new Error('untrusted');
  if (m.kind === 'offer') {
   if (typeof m.id !== 'string' || !UUID.test(m.id) || typeof m.name !== 'string' || m.name.length > 180 || typeof m.type !== 'string' || !Number.isSafeInteger(m.size) || m.size < 0 || m.size > MAX || !/^[a-f0-9]{64}$/.test(m.sha)) throw new Error('invalid metadata');
   if (this.incoming || this.retired.has(m.id)) { this.send({ kind: 'cancel', id: m.id }); return; }
   this.incoming = { meta: m, chunks: [], size: 0, accepted: false, verifying: false }; this.onOffer(m); return;
  }
  if (m.kind === 'cancel') {
   let matched = false;
   if (this.outgoing?.meta.id === m.id) { this.outgoing!.cancelled = true; this.outgoing = null; matched = true; }
   if (this.incoming?.meta.id === m.id) { this.retire(m.id); this.incoming = null; this.onOffer(null); matched = true; }
   if (matched) this.onState('对方取消或拒绝了传输，可以重新发送'); return;
  }
  if (m.kind === 'accept') {
   const o = this.outgoing; if (!o || o.meta.id !== m.id || o.phase !== 'offered') return; o.phase = 'sending';
   for (let n = 0; n < o.bytes.byteLength; n += CHUNK) {
    const start = Date.now();
    while (this.channel.bufferedAmount > 262144) {
     if (o.cancelled) return;
     if (Date.now() - start > 15000) throw new Error('backpressure timeout');
     await new Promise(r => setTimeout(r, 20));
    }
    if (o.cancelled) return;
    this.channel.send(frameChunk(o.meta.id, n, o.bytes.slice(n, n + CHUNK)));
    this.onState(`正在发送 ${Math.min(100, Math.round((n + CHUNK) / o.bytes.byteLength * 100))}%`);
   }
   if (!o.cancelled) { o.phase = 'awaiting_ack'; this.send({ kind: 'end', id: o.meta.id }); this.onState('已发出，等待对方校验'); } return;
  }
  if (m.kind === 'end') {
   if (this.retired.has(m.id)) return;
   const i = this.incoming; if (i?.verifying) return;
   if (!i?.accepted || i.meta.id !== m.id || i.size !== i.meta.size) throw new Error('size mismatch');
   i.verifying = true;
   const blob = new Blob(i.chunks, { type: 'application/octet-stream' }), sha = await digest(await blob.arrayBuffer());
   if (this.incoming !== i) return;
   if (sha !== i.meta.sha) { this.send({ kind: 'cancel', id: m.id }); throw new Error('checksum mismatch'); }
   this.retire(i.meta.id); this.incoming = null;
   this.send({ kind: 'ack', id: m.id, sha }); this.onDone(i.meta, blob); this.onState('已收到 · SHA-256 校验一致'); return;
  }
  if (m.kind === 'ack' && this.outgoing && this.outgoing.meta.id === m.id && this.outgoing.phase === 'awaiting_ack') {
   if (m.sha !== this.outgoing.meta.sha) throw new Error('ack mismatch');
   this.outgoing = null; this.onState('发送成功 · 对方已完成 SHA-256 校验');
  }
 }
}
