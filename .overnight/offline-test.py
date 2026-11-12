"""python3 .overnight/offline-test.py — load once online (service worker installs), go offline,
reload, and check the app still opens and the QR libraries loaded."""
import subprocess, time, os, sys
from playwright.sync_api import sync_playwright
here = os.path.dirname(os.path.abspath(__file__))
srv = subprocess.Popen(['node', os.path.join(here, 'mock-server.js'), '8766'], stdout=subprocess.PIPE)
time.sleep(1.2); ok = True
try:
    with sync_playwright() as p:
        b = p.chromium.launch(executable_path='/usr/bin/google-chrome', args=['--no-sandbox'])
        ctx = b.new_context(viewport={'width': 390, 'height': 844})
        ctx.add_init_script("localStorage.setItem('qrCheckinBackendUrl','http://localhost:8766/exec');localStorage.setItem('qrCheckinStaffName','T');localStorage.setItem('qrCheckinStaffRole','Admin');")
        pg = ctx.new_page(); errs = []
        pg.on('pageerror', lambda e: errs.append(str(e)))
        pg.goto('http://localhost:8766/', wait_until='networkidle')
        pg.evaluate("navigator.serviceWorker.ready.then(()=>true)")
        pg.wait_for_timeout(1500)
        ctx.set_offline(True)
        pg.reload(wait_until='domcontentloaded'); pg.wait_for_timeout(2500)
        libs = pg.evaluate("[typeof QRious, typeof jsQR]")
        txt = pg.locator('#screen').inner_text()
        pg.screenshot(path='/tmp/smoke/offline-reload.png')
        print('libs', libs, '| screen text chars', len(txt), '| errors', errs)
        ok = libs == ['function', 'function'] and len(txt) > 20 and not errs
        b.close()
finally:
    srv.terminate()
print('offline test', 'OK' if ok else 'FAILED'); sys.exit(0 if ok else 1)
