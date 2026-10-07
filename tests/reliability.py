"""Real RTC with explicitly labelled application pacing/fault injection, not WAN emulation."""
import asyncio,hashlib,json,os,time,re
from pathlib import Path
from playwright.async_api import async_playwright
ROOT=Path(__file__).resolve().parents[1]
BASE=os.environ.get('DEVICE_TEST_URL','http://127.0.0.1:5188')
results=[]
def passed(name,**detail):
 results.append({'test':name,'status':'passed',**detail});print('PASS',name,flush=True)
# Native RTC still transports every frame. A synthetic backpressure window keeps a
# transfer visibly active long enough to exercise user cancellation deterministically.
PACE=r"""(() => {
 const proto=RTCDataChannel.prototype,send=proto.send;
 const amount=Object.getOwnPropertyDescriptor(proto,'bufferedAmount').get;
 const until=new WeakMap();window.__rtcFrames=0;window.__corruptNext=false;
 Object.defineProperty(proto,'bufferedAmount',{get(){return Math.max(amount.call(this),Date.now()<(until.get(this)||0)?262145:0);}});
 proto.send=function(data){
  if(data instanceof ArrayBuffer){
   window.__rtcFrames++;until.set(this,Date.now()+6);
   if(window.__corruptNext&&data.byteLength>40){const copy=new Uint8Array(data.slice(0));copy[copy.length-1]^=1;data=copy.buffer;window.__corruptNext=false;}
  }
  return send.call(this,data);
 };
})();"""
async def main():
 async with async_playwright() as p:
  browser=await p.chromium.launch(headless=True,chromium_sandbox=True)
  ca=await browser.new_context(accept_downloads=True);cb=await browser.new_context(accept_downloads=True)
  await ca.add_init_script(PACE);await cb.add_init_script(PACE)
  a,b=await ca.new_page(),await cb.new_page()
  async def pair():
   await a.goto(BASE);await b.goto(BASE)
   await a.get_by_role('button',name='创建邀请',exact=True).click()
   invitation=await a.get_by_role('textbox',name='邀请链接',exact=True).input_value(timeout=20000)
   await b.get_by_role('textbox',name='另一台设备的邀请链接',exact=True).fill(invitation)
   await b.get_by_role('button',name='加入配对',exact=True).click()
   await a.locator('.verify strong').wait_for(timeout=25000);await b.locator('.verify strong').wait_for(timeout=25000)
   assert await a.locator('.verify strong').inner_text()==await b.locator('.verify strong').inner_text()
   await a.get_by_role('button',name='两端配对码一致，确认').click();await b.get_by_role('button',name='两端配对码一致，确认').click()
   await a.locator('.status.success').wait_for();await b.locator('.status.success').wait_for()
  async def active(sender,receiver,name):
   payload=bytes(range(256))*16384 # 4 MiB synthetic fixture
   before=await sender.evaluate('window.__rtcFrames')
   await sender.locator('input[type=file]').set_input_files({'name':name,'mimeType':'application/octet-stream','buffer':payload})
   await receiver.get_by_role('button',name='同意接收',exact=True).click()
   await receiver.locator('.transferstatus').get_by_text(re.compile(r'^正在接收 \d+%$')).wait_for()
   # Assert this is mid-transfer, not a cancellation of a pending offer or completed file.
   progress=await receiver.locator('.transferstatus').inner_text()
   assert progress!='正在接收 100%',progress
   assert await receiver.locator('.receipt').filter(has_text=name).count()==0
   frames=await sender.evaluate('window.__rtcFrames')-before
   assert 0<frames<256,frames
   return {'display':progress,'native_frames_sent':frames}
  async def exact_retry(sender,receiver,name):
   payload=(b'retry-after-interruption\x00\xff'*2048)
   await sender.locator('input[type=file]').set_input_files({'name':name,'mimeType':'application/octet-stream','buffer':payload})
   await receiver.get_by_role('button',name='同意接收',exact=True).click()
   receipt=receiver.locator('.receipt').filter(has_text=name);await receipt.wait_for(timeout=20000)
   await receipt.locator('summary').click()
   sha=hashlib.sha256(payload).hexdigest();assert await receipt.locator('code').inner_text()==sha
   async with receiver.expect_download() as d:await receipt.get_by_role('link',name='保存文件').click()
   downloaded=await d.value;assert Path(await downloaded.path()).read_bytes()==payload
   await sender.locator('.transferstatus').get_by_text('发送成功 · 对方已完成 SHA-256 校验',exact=True).wait_for()
   return sha
  await pair()
  progress=await active(a,b,'receiver-cancel.bin')
  await b.get_by_role('button',name='取消当前传输').click()
  await a.locator('.transferstatus').get_by_text('对方取消或拒绝了传输，可以重新发送',exact=True).wait_for()
  assert await b.locator('.receipt').filter(has_text='receiver-cancel.bin').count()==0
  sha=await exact_retry(a,b,'retry-receiver-cancel.bin')
  passed('receiver_mid_transfer_cancel_and_byte_exact_retry',cancelled_at=progress,sha256=sha)
  progress=await active(b,a,'sender-cancel.bin')
  await b.get_by_role('button',name='取消当前传输').click()
  await a.locator('.transferstatus').get_by_text('对方取消或拒绝了传输，可以重新发送',exact=True).wait_for()
  assert await a.locator('.receipt').filter(has_text='sender-cancel.bin').count()==0
  sha=await exact_retry(b,a,'retry-sender-cancel.bin')
  passed('sender_mid_transfer_cancel_and_byte_exact_retry',cancelled_at=progress,sha256=sha)
  # This simulates loss of the HTTP signalling route, not cross-network RTC loss.
  await ca.set_offline(True)
  await a.get_by_role('button',name='关闭配对').click()
  await a.get_by_role('button',name='创建邀请',exact=True).wait_for(timeout=2000)
  await a.locator('.transferstatus').get_by_text('本机已断开，服务端关闭未确认',exact=False).wait_for(timeout=10000)
  assert await a.locator('input[type=file]').is_disabled()
  await ca.set_offline(False)
  await b.get_by_role('button',name='关闭配对').click()
  await pair();sha=await exact_retry(a,b,'retry-after-signalling-outage.bin')
  passed('signalling_offline_local_close_and_fresh_pair_retry',simulation='Playwright HTTP offline only; not RTC network emulation',sha256=sha)
  await a.evaluate('window.__corruptNext=true')
  await a.locator('input[type=file]').set_input_files({'name':'corrupt.bin','mimeType':'application/octet-stream','buffer':b'controlled integrity fixture'})
  await b.get_by_role('button',name='同意接收',exact=True).click()
  await b.locator('.transferstatus').get_by_text('文件校验未通过，未提供下载',exact=False).wait_for()
  assert await b.locator('.receipt').filter(has_text='corrupt.bin').count()==0
  assert await b.locator('input[type=file]').is_disabled()
  passed('injected_payload_corruption_has_no_download',simulation='One payload byte changed before native RTC send; no transport security alteration')
  await a.get_by_role('button',name='关闭配对').click();await b.get_by_role('button',name='关闭配对').click()
  await pair();sha=await exact_retry(a,b,'retry-after-integrity-failure.bin')
  passed('fresh_pair_after_integrity_failure_byte_exact',sha256=sha)
  progress=await active(a,b,'peer-closed.bin')
  await a.close()
  await b.locator('input[type=file]').wait_for(state='attached')
  await b.wait_for_function("document.querySelector('input[type=file]').disabled",timeout=20000)
  assert await b.locator('.receipt').filter(has_text='peer-closed.bin').count()==0
  passed('peer_tab_close_during_transfer_discards_partial',cancelled_at=progress)
  await browser.close()
 report={'status':'passed','tested_at_utc':time.strftime('%Y-%m-%dT%H:%M:%SZ',time.gmtime()),'environment':'One standard Linux runner, two Chromium contexts, real native RTC channel with explicitly injected application pacing/faults','results':results,'not_tested':['iPad hardware','Separate physical devices','Real WAN/cellular or NAT','Background/resume','Production Site login']}
 (ROOT/'docs/reliability-results.json').write_text(json.dumps(report,ensure_ascii=False,indent=2)+'\n')
try:asyncio.run(main())
except Exception as exc:
 (ROOT/'docs/reliability-results.json').write_text(json.dumps({'status':'failed','results':results,'error_type':type(exc).__name__,'error':str(exc)},ensure_ascii=False,indent=2)+'\n')
 raise
