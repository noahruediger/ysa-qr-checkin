# SMOKE_EXTRA: desk search by phone number.
if label == 'phone':
    import json
    fx = json.load(open(os.path.join(here, 'fixture.json')))
    head = fx['Registrants'][0]; row = fx['Registrants'][5]
    phone = row[head.index('Phone')]
    pg.locator('[data-action="selectTab"][data-tab="people"]').first.click(); pg.wait_for_timeout(300)
    pg.locator('#peopleSearch').type(phone[:4] + ' ' + phone[4:7] + ' ' + phone[7:], delay=30)
    pg.wait_for_timeout(1800)
    pg.screenshot(path=f'{out}/{label}-search-phone.png')
    html = pg.content()
    if 'Matched in the Sheet' not in html or 'matched phone' not in html: errors.append('phone search result missing')
