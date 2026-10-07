import asyncio, json, hashlib, time, base64
from pathlib import Path
from playwright.async_api import async_playwright
ROOT=Path(__file__).resolve().parents[1]
import os
BASE=os.environ.get('DEVICE_TEST_URL','http://127.0.0.1:5188')
results=[]
def passed(name, **details):
 results.append({'test':name,'status':'passed',**details});print('PASS',name,flush=True)
async def main():
 async with async_playwright() as p:
  browser=await p.chromium.launch(executable_path=os.environ.get('CHROMIUM_EXECUTABLE_PATH'),headless=True,chromium_sandbox=True)
  c1=await browser.new_context(accept_downloads=True,viewport={'width':1280,'height':960})
  c2=await browser.new_context(accept_downloads=True,viewport={'width':820,'height':1180})
  a,b=await c1.new_page(),await c2.new_page()
  errors=[]
  a.on('pageerror',lambda e:errors.append(str(e)));b.on('pageerror',lambda e:errors.append(str(e)))
  await a.goto(BASE);await a.get_by_role('button',name='创建邀请',exact=True).click()
  invitation=await a.get_by_role('textbox',name='邀请链接',exact=True).input_value(timeout=20000)
  assert '#join=' in invitation
  await b.goto(invitation);await b.get_by_role('button',name='加入配对',exact=True).click()
  await a.locator('.verify strong').wait_for(timeout=25000);await b.locator('.verify strong').wait_for(timeout=25000)
  assert await a.locator('.verify strong').inner_text()==await b.locator('.verify strong').inner_text()
  await a.get_by_role('textbox',name='文本或链接',exact=True).fill('consent gate sentinel')
  assert await a.get_by_role('button',name='发送文字',exact=True).is_disabled()
  assert await a.locator('input[type=file]').is_disabled()
  await a.get_by_role('button',name='两端配对码一致，确认').click(timeout=15000)
  assert await a.get_by_role('button',name='发送文字',exact=True).is_disabled()
  await b.get_by_role('button',name='两端配对码一致，确认').click(timeout=15000)
  await a.locator('.status.success').wait_for();await b.locator('.status.success').wait_for()
  assert await a.get_by_role('button',name='发送文字',exact=True).is_enabled()
  passed('pairing_digest_and_bilateral_consent')
  # Send text, verify no receipt until accepted, then verify actual downloaded bytes.
  async def transfer(sender,receiver,name,content,mime):
   await sender.locator('input[type=file]').set_input_files({'name':name,'mimeType':mime,'buffer':content})
   await receiver.locator('.incoming').wait_for(timeout=20000)
   assert await receiver.locator('.receipt').filter(has_text=name).count()==0
   await receiver.get_by_role('button',name='同意接收',exact=True).click()
   receipt=receiver.locator('.receipt').filter(has_text=name)
   await receipt.wait_for(timeout=30000)
   expected=hashlib.sha256(content).hexdigest()
   await receipt.locator('summary').click()
   displayed_sha=await receipt.locator('code').inner_text()
   assert displayed_sha==expected, {'expected_sha256':expected,'displayed_sha256':displayed_sha}
   async with receiver.expect_download() as d:
    await receipt.get_by_role('link',name='保存文件').click()
   download=await d.value; path=await download.path();actual=Path(path).read_bytes()
   assert actual==content
   await sender.locator('.transferstatus').get_by_text('发送成功 · 对方已完成 SHA-256 校验',exact=True).wait_for(timeout=10000)
   passed('byte_exact_transfer_'+name,bytes=len(content),sha256=expected)
  await transfer(a,b,'unicode.txt','从 iPad 接着用 🐠\nhttps://example.com/测试?q=1'.encode(),'text/plain')
  png=base64.b64decode('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aFJkAAAAASUVORK5CYII=')
  await transfer(b,a,'synthetic.png',png,'image/png')
  await transfer(a,b,'binary-2m.bin',bytes(range(256))*8192,'application/octet-stream')
  await transfer(b,a,'empty.txt',b'','text/plain')
  # Receiver rejection must not release bytes or a download.
  await a.locator('input[type=file]').set_input_files({'name':'rejected.txt','mimeType':'text/plain','buffer':b'should never arrive'})
  await b.get_by_role('button',name='拒绝',exact=True).click();await a.locator('.transferstatus').get_by_text('对方取消或拒绝了传输',exact=True).wait_for()
  assert await b.locator('.receipt').filter(has_text='rejected.txt').count()==0
  passed('receiver_rejection_no_receipt')
  await a.locator('input[type=file]').set_input_files({'name':'cancelled.txt','mimeType':'text/plain','buffer':b'cancelled'})
  await b.locator('.incoming').wait_for();await a.get_by_role('button',name='取消当前传输').click();await b.locator('.incoming').wait_for(state='hidden')
  passed('sender_cancellation_clears_offer')
  await a.locator('input[type=file]').set_input_files({'name':'too-large.bin','mimeType':'application/octet-stream','buffer':bytes(25*1024*1024+1)})
  await a.locator('.transferstatus').get_by_text('第一版单文件上限 25 MiB',exact=True).wait_for();assert await b.locator('.incoming').count()==0
  passed('over_limit_rejected_before_transfer')
  # A used invitation cannot attach another device.
  c=await c2.new_page();await c.goto(invitation);await c.get_by_role('button',name='加入配对',exact=True).click();await c.locator('.transferstatus').get_by_text('邀请已使用或无效，请重新配对',exact=True).wait_for()
  passed('single_use_invitation')
  await a.screenshot(path=str(ROOT/'docs/desktop-transfer.png'),full_page=True,mask=[a.locator('.invitation')])
  await b.screenshot(path=str(ROOT/'docs/tablet-transfer.png'),full_page=True,mask=[b.locator('.invitation')])
  await a.get_by_role('button',name='关闭配对').click();await b.locator('.transferstatus').get_by_text('配对已关闭或超过 10 分钟，请重新创建',exact=True).wait_for(timeout=10000)
  passed('close_revokes_room_and_peer')
  # Responsive and proposal pages.
  await c.set_viewport_size({'width':390,'height':844});await c.goto(BASE)
  assert await c.evaluate('document.documentElement.scrollWidth <= innerWidth')
  await c.get_by_role('button',name='方案比较',exact=True).click();assert await c.get_by_text('交互方案，尚未实现',exact=True).count()==2
  await c.screenshot(path=str(ROOT/'docs/mobile-comparison.png'),full_page=True)
  passed('mobile_layout_and_honest_alternatives')
  assert not errors,errors
  passed('no_browser_runtime_errors')
  await browser.close()
 report={'status':'passed','tested_at_utc':time.strftime('%Y-%m-%dT%H:%M:%SZ',time.gmtime()),'environment':'Two isolated Chromium contexts in a single standard GitHub Linux runner; real RTCDataChannel + local production Worker/D1; synthetic files; NOT production Site login','results':results,'not_tested':['Physical iPad Safari','Separate physical devices','Different Wi-Fi or cellular networks','Lock screen or background transfer','TURN/relay','Production end-to-end pairing','Native/hybrid implementations']}
 (ROOT/'docs/e2e-results.json').write_text(json.dumps(report,ensure_ascii=False,indent=2))
try:
 asyncio.run(main())
except Exception as exc:
 report={'status':'failed','results':results,'error_type':type(exc).__name__,'error':str(exc),'environment':'Self-hosted app on loopback, not production Site'}
 (ROOT/'docs/e2e-results.json').write_text(json.dumps(report,ensure_ascii=False,indent=2))
 raise

