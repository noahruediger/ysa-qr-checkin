# SMOKE_EXTRA scenario: another phone marks someone lost; this phone should show the red banner.
if label == 'phone':
    pg.evaluate("""fetch('http://localhost:8765/exec',{method:'POST',body:JSON.stringify({action:'setLost',id:'YSA-0004',value:true,by:'Other Phone'})})""")
    pg.locator('[data-action="selectTab"][data-tab="people"]').first.click()
    pg.wait_for_timeout(11000)
    txt = pg.locator('#alertStack').inner_text() if pg.locator('#alertStack').is_visible() else ''
    pg.screenshot(path=f'{out}/{label}-lost-banner.png')
    if 'LOST' not in txt: errors.append('lost banner did not appear: ' + repr(txt))
    pg.locator('[data-action="dismissLost"]').first.click(); pg.wait_for_timeout(300)
    if pg.locator('#alertStack').is_visible(): errors.append('lost banner did not dismiss')
    pg.evaluate("""fetch('http://localhost:8765/exec',{method:'POST',body:JSON.stringify({action:'setLost',id:'YSA-0004',value:false})})""")
