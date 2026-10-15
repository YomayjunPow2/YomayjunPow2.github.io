const { test, expect } = require('@playwright/test');
const { openPage, ytState } = require('./helpers');

test.describe('days until the Kaohsiung show', () => {
  test('the day before the show says 1 day to go, in both languages', async ({ page }) => {
    await openPage(page, { now: '2026-10-30T20:00:00+08:00', lang: 'en' });
    await expect(page.locator('#days-left')).toHaveText('1 day to go');
    await page.getByRole('button', { name: '中' }).click();
    await expect(page.locator('#days-left')).toHaveText('還有 1 天');
  });

  test('a week out, on the day, and after the show', async ({ page }) => {
    await openPage(page, { now: '2026-10-15T12:00:00+08:00' });
    await expect(page.locator('#days-left')).toHaveText('還有 16 天');
    await page.clock.setSystemTime(new Date('2026-10-31T09:00:00+08:00'));
    await page.getByRole('button', { name: 'EN' }).click();
    await expect(page.locator('#days-left')).toHaveText('Today is the day');
    await page.clock.setSystemTime(new Date('2026-11-01T09:00:00+08:00'));
    await page.getByRole('button', { name: '中' }).click();
    await expect(page.locator('#days-left')).toHaveText('演出已結束');
  });

  test('keeps itself current when the page stays open past midnight', async ({ page }) => {
    await openPage(page, { now: '2026-10-30T23:50:00+08:00', lang: 'en' });
    await expect(page.locator('#days-left')).toHaveText('1 day to go');
    await page.clock.fastForward('00:20:00');
    await expect(page.locator('#days-left')).toHaveText('Today is the day');
  });
});

// Official sources: fujii-kaze.lnk.to smart links (playlist ids) and fujiikaze.com/music (track titles).
test.describe('listening to an album', () => {
  test('choosing an album lists its official tracks and leaves the player alone; pressing play then mounts its playlist', async ({ page }) => {
    await openPage(page);
    await page.locator('.album-card', { hasText: 'LOVE ALL SERVE ALL' }).click();

    await expect(page.locator('#view-album')).toHaveText('LOVE ALL SERVE ALL');
    await expect(page.locator('#track-list .guide-item')).toHaveCount(11);
    await expect(page.locator('#track-list .guide-title').first()).toHaveText('Kirari きらり');
    await expect(page.locator('#track-list .guide-title-jp').first()).toHaveText('閃閃發光');
    await expect(page.locator('#track-list .guide-title').last()).toHaveText('Tabiji 旅路');
    await expect(page.locator('#track-list .guide-title-jp').last()).toHaveText('旅途');

    const idle = await ytState(page);                              // browsing only: still the Prema player that was cued at load
    expect(idle.created).toHaveLength(1);
    expect(idle.created[0].vars).toMatchObject({ list: 'OLAK5uy_mZ7icpUir1knB_mb6kN29cuivilgCWr8Q', autoplay: 0 });
    expect(idle.calls).toEqual([]);

    await page.locator('#track-list .guide-item').first().locator('button').click();
    const { created } = await ytState(page);
    expect(created.at(-1).vars).toMatchObject({ listType: 'playlist', list: 'OLAK5uy_mIIJtFRIoYVkeKLz4WaN6qgU0BXemlgHA', autoplay: 1 });
    await expect(page.locator('#now-album')).toHaveText('LOVE ALL SERVE ALL');
  });

  test('the live album lists all 23 tracks', async ({ page }) => {
    await openPage(page);
    await page.locator('.album-card', { hasText: 'Feelin’ Good' }).click();
    await expect(page.locator('#track-list .guide-item')).toHaveCount(23);
    await expect(page.locator('#track-list .guide-title').nth(22)).toHaveText('Matsuri まつり');
  });

  test('Prema Disc 2 buttons play the matching Pre: Prema track', async ({ page }) => {
    await openPage(page);
    await page.locator('button[data-album="pre-prema"][data-idx="3"]').click();

    await expect(page.locator('#now-album')).toHaveText('Pre: Prema');
    await expect(page.locator('#track-list .playing .guide-title')).toHaveText("It's Alright");
    const { created, calls } = await ytState(page);
    expect(created.at(-1).vars.list).toBe('OLAK5uy_mKkUPmKZc5gtASvMP-ICUwI7EcrSu1oDA');
    expect(calls).toContainEqual(['playVideoAt', 3]);
  });

  test('Spotify shows the album embed, and picking a track returns to YouTube', async ({ page }) => {
    await openPage(page);
    await page.getByRole('button', { name: 'Spotify' }).click();
    await expect(page.locator('#sp-frame')).toHaveAttribute('src', /open\.spotify\.com\/embed\/album\/6ELurkxQnAif7u5Vv6Wly9/);
    await expect(page.locator('#player-wrap')).toBeHidden();

    await page.locator('#track-list .guide-item').nth(2).locator('button').click();
    await expect(page.locator('#player-wrap')).toBeVisible();
    await expect(page.locator('#src-yt')).toHaveAttribute('aria-pressed', 'true');
  });
});

// Official sources: KKLIVE KKTIX ticket page, hehn.fujiikaze.com/pwt, fujiikaze.com.
test.describe('official content', () => {
  const RULE = '一人一票、憑票入場，孩童亦需購票。';

  test('rules quote the official Chinese; English adds a labelled translation', async ({ page }) => {
    await openPage(page);
    await expect(page.locator('.etiq-item', { hasText: RULE })).toBeVisible();
    await expect(page.locator('.etiq-item .gloss')).toHaveCount(0);

    await page.getByRole('button', { name: 'EN' }).click();
    const item = page.locator('.etiq-item', { hasText: RULE });
    await expect(item).toBeVisible();
    await expect(item.locator('.gloss')).toContainText('English translation:');
  });

  test('show details match the official listing', async ({ page }) => {
    await openPage(page);
    const facts = page.locator('#concert');
    await expect(facts).toContainText('高雄國家體育場');
    await expect(facts).toContainText('高雄市左營區世運大道100號');
    await expect(facts).toContainText('16:00 / 19:00');
    await expect(facts).toContainText('創昕製作');
    await expect(facts).not.toContainText('Innovator Production');
    await expect(facts).toContainText('TWD$5,800');
  });

  test('official links point at the official accounts', async ({ page }) => {
    await openPage(page);
    const hrefs = await page.locator('.ext-link').evaluateAll(els => els.map(e => e.href));
    expect(hrefs).toEqual(expect.arrayContaining([
      'https://fujiikaze.com/',
      'https://hehn.fujiikaze.com/pwt/en/',
      'https://kklivetw.kktix.cc/events/34473ba4',
      'https://open.spotify.com/artist/6bDWAcdtVR3WHz2xtiIPUi',
      'https://www.youtube.com/channel/UCNIy6zQyP7SuLEIaiwymfUA',
      'https://www.instagram.com/fujiikaze/',
    ]));
  });

  test('the discography lists only releases on the official music page', async ({ page }) => {
    await openPage(page);
    const names = await page.locator('.album-name').allTextContents();
    expect(names).toEqual([
      'Prema', 'Pre: Prema', 'Fujii Kaze Stadium Live “Feelin’ Good”',
      'Best of Fujii Kaze 2020-2024', 'LOVE ALL SERVE ALL', 'HELP EVER HURT NEVER',
    ]);
    // the Chinese album title sits below the original name
    await expect(page.locator('.album-zh:visible')).toHaveText(['至上的愛']);
  });
});
