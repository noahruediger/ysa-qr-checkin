"""python3 .overnight/smoke.py [out_dir] — loads the app in headless Chrome against the mock
server, clicks through the main screens at phone and laptop sizes, fails on any JS error,
and saves screenshots. Starts/stops the mock server itself."""
import subprocess, sys, time, os, json
from playwright.sync_api import sync_playwright
here = os.path.dirname(os.path.abspath(__file__))
out = sys.argv[1] if len(sys.argv) > 1 else '/tmp/smoke'
os.makedirs(out, exist_ok=True)
srv = subprocess.Popen(['node', os.path.join(here, 'mock-server.js'), '8765'], stdout=subprocess.PIPE)
time.sleep(1.2)
errors = []
try:
    with sync_playwright() as p:
        b = p.chromium.launch(executable_path='/usr/bin/google-chrome', args=['--no-sandbox', '--autoplay-policy=no-user-gesture-required'])
        for label, vp in [('phone', {'width': 390, 'height': 844}), ('laptop', {'width': 1440, 'height': 900})]:
            ctx = b.new_context(viewport=vp, service_workers='block')
            ctx.add_init_script("""localStorage.setItem('qrCheckinBackendUrl','http://localhost:8765/exec');
              localStorage.setItem('qrCheckinStaffName','Smoke Tester'); localStorage.setItem('qrCheckinStaffRole','Admin');""")
            pg = ctx.new_page()
            pg.on('pageerror', lambda e: errors.append(f'{label} pageerror: {e}'))
            pg.on('console', lambda m: errors.append(f'{label} console.{m.type}: {m.text}') if m.type == 'error' and 'Failed to load resource' not in m.text else None)
            pg.goto('http://localhost:8765/', wait_until='networkidle')
            pg.wait_for_timeout(1500)
            # name prompt may appear; fill it if so
            pg.screenshot(path=f'{out}/{label}-1-start.png')
            for tab in ['dashboard', 'people', 'other', 'print', 'settings']:
                btn = pg.locator(f'[data-action="selectTab"][data-tab="{tab}"]').first
                if btn.count() and btn.is_visible():
                    btn.click(); pg.wait_for_timeout(400)
                    pg.screenshot(path=f'{out}/{label}-tab-{tab}.png')
            # open a person via People list
            pg.locator('[data-action="selectTab"][data-tab="people"]').first.click(); pg.wait_for_timeout(300)
            item = pg.locator('[data-action="scan"]').first
            if item.count():
                item.click(); pg.wait_for_timeout(500); pg.screenshot(path=f'{out}/{label}-person.png')
            extra = os.environ.get('SMOKE_EXTRA')
            if extra: exec(open(extra).read())
            ctx.close()
        b.close()
finally:
    srv.terminate()
print('\n'.join(errors) if errors else 'smoke: no JS errors')
print('screenshots in', out)
sys.exit(1 if errors else 0)
