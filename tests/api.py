import urllib.request,urllib.error,json,os,time
from pathlib import Path
url=os.environ['DEVICE_TEST_URL']+'/api/room'
results=[]
def call(b):
 req=urllib.request.Request(url,data=json.dumps(b).encode(),headers={'Content-Type':'application/json'},method='POST')
 try:
  with urllib.request.build_opener(urllib.request.ProxyHandler({})).open(req) as r:return r.status,json.loads(r.read())
 except urllib.error.HTTPError as e:return e.code,json.loads(e.read())
def check(name,cond):
 assert cond,name
 results.append({'test':name,'status':'passed'});print('PASS',name)
s,r=call({'action':'create','offer':'v=0\r\nsynthetic-signalling-only'});check('create_room',s==200)
s,x=call({'action':'poll','id':r['id'],'token':'0'*64});check('unauthorized_poll_rejected',s==403)
s,g=call({'action':'join','id':r['id'],'token':r['invite']});check('join_once',s==200)
s,x=call({'action':'join','id':r['id'],'token':r['invite']});check('second_join_rejected',s==403)
s,x=call({'action':'answer','id':r['id'],'token':g['guest'],'answer':'v=0\r\nsynthetic-answer'});check('guest_answer',s==200)
s,x=call({'action':'poll','id':r['id'],'token':r['host']});check('host_receives_answer',x.get('answer')=='v=0\r\nsynthetic-answer')
s,x=call({'action':'approve','id':r['id'],'token':g['guest']});check('guest_cannot_approve_as_host',s==400)
s,x=call({'action':'close','id':r['id'],'token':r['host']});check('host_revokes_room',s==200)
s,x=call({'action':'poll','id':r['id'],'token':g['guest']});check('revoked_room_inaccessible',s==410)
s,x=call({'action':'create','offer':'v=0'+'x'*40000});check('oversized_signalling_rejected',s==413)
Path('docs/api-results.json').write_text(json.dumps({'tested_at_utc':time.strftime('%Y-%m-%dT%H:%M:%SZ',time.gmtime()),'kind':'Real local production Worker + D1 API tests; no browser and no file payload','results':results},indent=2))
