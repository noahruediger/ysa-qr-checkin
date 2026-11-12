# SMOKE_EXTRA: open someone already checked in via the manual-ID scanner path; expect the amber warning.
if label == 'phone':
    pg.evaluate("""fetch('http://localhost:8765/exec',{method:'POST',body:JSON.stringify({action:'checkin',id:'YSA-0001',by:'Ella'})})""")
    pg.wait_for_timeout(9500)  # rev poll picks it up
    pg.locator('#tabScanBtn').click(); pg.wait_for_timeout(600)
    inp = pg.locator('#manualId')
    if inp.count():
        inp.fill('YSA-0001'); pg.locator('[data-action="manualGo"]').first.click(); pg.wait_for_timeout(800)
        pg.screenshot(path=f'{out}/{label}-already.png')
        html = pg.content()
        if 'Already checked in' not in html: errors.append('already-checked-in warning missing')
        if 'Allergy: Bee sting' not in html: errors.append('allergy pill missing')
    else:
        errors.append('manual ID box not found on camera screen')
