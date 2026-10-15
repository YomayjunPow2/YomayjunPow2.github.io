const { test, expect } = require('@playwright/test');
const { openPage, ytState } = require('./helpers');

test.describe('wording and playback', () => {
  test('the player heading does not call full playback a preview (試聽)', async ({ page }) => {
    await openPage(page);
    await expect(page.locator('#discography')).not.toContainText('試聽');
    await expect(page.locator('#discography .card-section-head').first()).toHaveText('收聽');
  });

  test('selecting an album never starts playback by itself', async ({ page }) => {
    await openPage(page);
    await page.locator('.album-card', { hasText: 'HELP EVER HURT NEVER' }).click();
    await page.locator('.album-card', { hasText: 'Best of Fujii Kaze' }).click();
    const { created, calls } = await ytState(page);
    expect(created.every(c => c.vars.autoplay === 0)).toBe(true);
    expect(calls.filter(c => c[0] === 'playVideoAt')).toEqual([]);
  });
});

// Source: Spotify all-time stream counts as tracked by kworb.net (snapshot 2026/10/14).
// Not an official source, so the page must say so.
test.describe('most played of all time', () => {
  const TOP10 = ['Shinunoga E-Wa', 'Kirari', 'Matsuri', 'Garden', 'Michi Teyu Ku (Overflowing)', 'Hana', 'Tabiji', 'Nan-Nan', 'damn', 'YASASHISA'];
  const rows = page => page.locator('#most-played .play-row');

  test('shows the ten most played songs in descending order, with a way to see the rest', async ({ page }) => {
    await openPage(page, { lang: 'en' });
    await expect(page.locator('#most-played .info-card-label')).toHaveText('Most played of all time');
    await expect(rows(page).locator('.play-title')).toHaveText(TOP10);
    await expect(rows(page).first().locator('.play-count')).toHaveText('855,289,744');

    const counts = (await rows(page).locator('.play-count').allTextContents()).map(t => Number(t.replace(/,/g, '')));
    expect(counts).toEqual([...counts].sort((a, b) => b - a));

    await page.locator('#plays-more').click();
    await expect(rows(page)).toHaveCount(24);
    await expect(rows(page).last().locator('.play-title')).toHaveText('Hachikō');
    await page.locator('#plays-more').click();
    await expect(rows(page)).toHaveCount(10);
  });

  test('is labelled as a Spotify snapshot from a non-official source', async ({ page }) => {
    await openPage(page, { lang: 'en' });
    const note = page.locator('#most-played .source-note');
    await expect(note).toContainText('kworb.net');
    await expect(note).toContainText('2026/10/14');
    await expect(note).toContainText('not an official source');
    await page.getByRole('button', { name: '中' }).click();
    await expect(note).toContainText('不是官方來源');
  });

  test('every ranked song is the track it points at in the player data', async ({ page }) => {
    await openPage(page, { lang: 'en' });
    await page.locator('#plays-more').click();
    const mismatches = await page.evaluate(() =>
      [...document.querySelectorAll('#most-played .play-row')].filter(row => {
        const b = row.querySelector('button[data-album]');
        const t = ALBUMS.find(a => a.id === b.dataset.album).tracks[Number(b.dataset.idx)];
        return row.querySelector('.play-title').textContent !== t[0];
      }).map(r => r.querySelector('.play-title').textContent));
    expect(mismatches).toEqual([]);
  });

  test('titles follow the language switch, like the track lists', async ({ page }) => {
    await openPage(page, { lang: 'en' });
    await page.getByRole('button', { name: '中' }).click();
    await expect(rows(page).first().locator('.play-title')).toHaveText('死了也好');
    await expect(rows(page).first().locator('.play-orig')).toContainText('死ぬのがいいわ');
  });

  test('playing a ranked song starts it in its album', async ({ page }) => {
    await openPage(page, { lang: 'en' });
    await rows(page).first().locator('button').click();
    await expect(page.locator('#now-album')).toHaveText('HELP EVER HURT NEVER');
    await expect(page.locator('#track-list .playing .guide-title')).toHaveText('Shinunoga E-Wa');
    const { created, calls } = await ytState(page);
    expect(created.at(-1).vars.list).toBe('OLAK5uy_nuS1IYhaVBgIgRC4wti3aWxjOqwZo4NyA');
    expect(calls).toContainEqual(['playVideoAt', 7]);
  });
});
