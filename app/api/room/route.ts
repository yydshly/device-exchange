import { database } from '@/db';
const headers = { 'Cache-Control': 'no-store' };
const reply = (body: unknown, status = 200) => Response.json(body, { status, headers });
const token = () => Array.from(crypto.getRandomValues(new Uint8Array(32)), b => b.toString(16).padStart(2,'0')).join('');
async function hash(value: string) { return Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(value))),b=>b.toString(16).padStart(2,'0')).join(''); }
export async function POST(req: Request) {
 try {
  if (Number(req.headers.get('content-length') || 0) > 40000) return reply({error:'请求过大'},413);
  const raw = await req.text(); if(raw.length > 40000) return reply({error:'请求过大'},413);
  const b = JSON.parse(raw), db = database(), now = Date.now();
  await db.prepare('DELETE FROM rooms WHERE expires < ?').bind(now).run();
  if(b.action === 'create') {
   if(typeof b.offer !== 'string' || b.offer.length>30000 || !b.offer.startsWith('v=0')) return reply({error:'无效连接信息'},400);
   const id=crypto.randomUUID(), host=token(), invite=token(), expires=now+600000;
   await db.prepare('INSERT INTO rooms (id, host, invite, offer, approved, expires) VALUES (?, ?, ?, ?, 0, ?)').bind(id,await hash(host),await hash(invite),b.offer,expires).run();
   return reply({id,host,invite,expires});
  }
  if(typeof b.id!=='string' || typeof b.token!=='string' || b.token.length!==64) return reply({error:'配对无效或已过期'},403);
  const r = await db.prepare('SELECT * FROM rooms WHERE id = ?').bind(b.id).first<{id:string;host:string;invite:string;guest:string|null;offer:string;answer:string|null;approved:number;expires:number}>();
  if(!r || r.expires < now) return reply({error:'配对已关闭或超过 10 分钟，请重新创建'},410);
  const h=await hash(b.token);
  if(b.action==='join') {
   if(h!==r.invite || r.guest) return reply({error:'邀请已使用或无效，请重新配对'},403);
   const guest=token(); const result=await db.prepare('UPDATE rooms SET guest = ? WHERE id = ? AND guest IS NULL').bind(await hash(guest),b.id).run();
   if(!result.meta.changes) return reply({error:'邀请已使用'},409);
   return reply({guest,offer:r.offer,expires:r.expires});
  }
  const host=h===r.host, guest=h===r.guest;
  if(!host && !guest) return reply({error:'无权访问此配对'},403);
  if(b.action==='close') {await db.prepare('DELETE FROM rooms WHERE id = ?').bind(b.id).run();return reply({ok:true});}
  if(b.action==='answer' && guest) {
   if(typeof b.answer!=='string'|| b.answer.length>30000 || !b.answer.startsWith('v=0')) return reply({error:'无效连接信息'},400);
   await db.prepare('UPDATE rooms SET answer = ? WHERE id = ? AND answer IS NULL').bind(b.answer,b.id).run();return reply({ok:true});
  }
  if(b.action==='approve' && host && r.answer) {await db.prepare('UPDATE rooms SET approved = 1 WHERE id = ?').bind(b.id).run();return reply({ok:true});}
  if(b.action==='poll') return reply({answer:host?r.answer:null,joined:!!r.guest,approved:!!r.approved,expires:r.expires});
  return reply({error:'操作不可用'},400);
 } catch {return reply({error:'连接服务暂不可用，请稍后重新配对'},503);}
}
