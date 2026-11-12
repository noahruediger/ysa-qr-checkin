"""python3 .overnight/approval-test.py — two browsers against a mock Sheet with approvals on:
the first phone becomes Admin; a second phone signs up, waits, gets approved, then opens."""
import subprocess, time, os, sys
from playwright.sync_api import sync_playwright
here = os.path.dirname(os.path.abspath(__file__))
env = dict(os.environ, APPROVALS='1')
srv = subprocess.Popen(['node', os.path.join(here, 'mock-server.js'), '8772'], stdout=subprocess.PIPE, env=env)
time.sleep(1.2); errs = []; out = '/tmp/smoke'
def ctx_for(b, name, role, w=1440):
    c = b.new_context(viewport={'width': w, 'height': 900}, service_workers='block')
    js = "localStorage.setItem('qrCheckinBackendUrl','http://localhost:8772/exec');"
    if name: js += f"localStorage.setItem('qrCheckinStaffName','{name}');localStorage.setItem('qrCheckinStaffRole','{role}');"
    c.add_init_script(js); return c
try:
    with sync_playwright() as p:
        b = p.chromium.launch(executable_path='/usr/bin/google-chrome', args=['--no-sandbox'])
        admin = ctx_for(b, 'Noah', 'Admin').new_page(); admin.on('pageerror', lambda e: errs.append('admin: ' + str(e)))
        admin.goto('http://localhost:8772/', wait_until='networkidle'); admin.wait_for_timeout(1800)
        if admin.locator('#bootScreen').is_visible(): errs.append('admin blocked by boot screen')
        phone = ctx_for(b, None, None, 390).new_page(); phone.on('pageerror', lambda e: errs.append('phone: ' + str(e)))
        phone.goto('http://localhost:8772/', wait_until='networkidle'); phone.wait_for_timeout(1500)
        if not phone.locator('#staffNameInput').is_visible(): errs.append('new phone did not get the sign-up box')
        phone.fill('#staffNameInput', 'Ella Glen'); phone.select_option('#staffRoleSelect', 'Admin')
        phone.locator('[data-action="saveStaffName"]').click(); phone.wait_for_timeout(1500)
        phone.screenshot(path=f'{out}/approval-waiting.png')
        if 'Waiting for approval' not in phone.locator('#bootScreen').inner_text(): errs.append('no waiting screen')
        if phone.locator('.lookup-item').count(): errs.append('waiting phone can see people')
        # admin sees request (heartbeat refresh) and approves as Security
        admin.locator('[data-action="selectTab"][data-tab="settings"]').first.click(); admin.wait_for_timeout(300)
        admin.locator('[data-action="refreshStaff"]').click(); admin.wait_for_timeout(1200)
        admin.screenshot(path=f'{out}/approval-admin.png', full_page=True)
        sel = admin.locator('select.staff-role-mini').first
        if not sel.count(): errs.append('admin has no approve controls')
        else:
            sel.select_option('Security')
            admin.locator('[data-action="approveStaff"]').first.click(); admin.wait_for_timeout(1500)
        phone.wait_for_timeout(9500)
        if phone.locator('#bootScreen').is_visible(): errs.append('phone still waiting after approval')
        phone.locator('[data-action="selectTab"][data-tab="people"]').first.click(); phone.wait_for_timeout(400)
        if not phone.locator('.lookup-item').count(): errs.append('approved phone sees no people')
        phone.locator('[data-action="selectTab"][data-tab="settings"]').first.click(); phone.wait_for_timeout(400)
        if 'Security' not in phone.locator('.staff-me').inner_text(): errs.append('phone role not Security: ' + phone.locator('.staff-me').inner_text())
        phone.screenshot(path=f'{out}/approval-phone-in.png')
        b.close()
finally:
    srv.terminate()
print('\n'.join(errs) if errs else 'approval test OK'); sys.exit(1 if errs else 0)
