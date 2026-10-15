const { test, expect } = require('@playwright/test');
const { openPage } = require('./helpers');

// Where the official site has no background text, the page compiles one from interviews and other
// published sources. Every compiled text must carry its sources, say it is not from the official site,
// and use quotes word for word.
const play = (page, album, idx) => page.evaluate(([a, i]) => window.playAlbumTrack(a, i), [album, idx]);
const bg = page => page.locator('#song-bg');

test.describe('song background from interviews and media', () => {
  test('every song of Prema has a background with at least one source link', async ({ page }) => {
    await openPage(page);
    for (let i = 0; i < 9; i++) {
      await play(page, 'prema', i);
      await expect(bg(page).locator('.bg-text')).not.toBeEmpty();
      const links = await bg(page).locator('a[href^="https://"]').evaluateAll(a => a.map(x => x.href));
      expect(links.length, 'sources for prema track ' + (i + 1)).toBeGreaterThan(0);
    }
  });

  test('is labelled as compiled from interviews and media, not the official site, in both languages', async ({ page }) => {
    await openPage(page);
    await play(page, 'prema', 1);
    await expect(bg(page).locator('.bg-head')).toContainText('不是官方網站');
    await page.getByRole('button', { name: 'EN' }).click();
    await expect(bg(page).locator('.bg-head')).toContainText('not the official site');
  });

  test('quotes are word for word from the cited source', async ({ page }) => {
    await openPage(page, { lang: 'en' });
    const cases = [
      ['prema', 1, "I simply lost all of my passion or energy."],            // NME
      ['prema', 1, 'directly expresses my burnt-out state'],                  // Apple Music notes
      ['prema', 8, 'When this melody came into my body in Bali'],             // Apple Music notes
      ['prema', 3, "Inspired by Gwen Stefani's 'Cool,' this is the oldest tune on the album."],
      ['hehn', 7, 'Don Quijote'],                                              // ja.wikipedia: 死ぬのがいいわ
      ['lasa', 1, '第2のデビュー曲、とでも言ってもいいくらい今の自分にとって大切なお祝いソング。'],
      ['lasa', 10, '初めてのタイアップ作品になりました。こんなに難しいとは思いませんでした。'],
    ];
    for (const [album, idx, quote] of cases) {
      await play(page, album, idx);
      await expect(bg(page).locator('.bg-text')).toContainText(quote);
    }
  });

  test('a song with no interview or article found says so and shows no sources', async ({ page }) => {
    await openPage(page);
    await play(page, 'hehn', 1);                                              // Mo-Eh-Wa
    await expect(bg(page)).toContainText('找不到');
    await expect(bg(page).locator('a')).toHaveCount(0);
    await page.getByRole('button', { name: 'EN' }).click();
    await expect(bg(page)).toContainText('No interview or article');
  });

  test('the official-site block is unchanged: one official link, and its own no-background line', async ({ page }) => {
    await openPage(page);
    await play(page, 'prema', 1);
    await expect(page.locator('#song-info a')).toHaveCount(1);
    await expect(page.locator('#song-info')).toContainText('官方網站沒有這首歌的背景說明');
  });

  test('data: every entry is for a real track and has Chinese, English and well-formed sources', async ({ page }) => {
    await openPage(page);
    const bad = await page.evaluate(() => {
      const titles = new Set(ALBUMS.flatMap(a => a.tracks.map(t => t[0])));
      const problems = [];
      for (const [name, b] of Object.entries(BACKGROUND)) {
        if (!titles.has(name)) problems.push(name + ': not a track');
        if (!b.zh || !b.en) problems.push(name + ': missing zh or en');
        if (!b.src || !b.src.length) problems.push(name + ': no sources');
        const urls = (b.src || []).map(s => s[1]);
        if (new Set(urls).size !== urls.length) problems.push(name + ': duplicate source');
        (b.src || []).forEach(([label, url]) => {
          if (!label) problems.push(name + ': source without label');
          if (!/^https:\/\//.test(url)) problems.push(name + ': bad url ' + url);
        });
      }
      return problems;
    });
    expect(bad).toEqual([]);
  });

  test('source links open in a new tab safely', async ({ page }) => {
    await openPage(page);
    await play(page, 'prema', 0);
    const rels = await bg(page).locator('a').evaluateAll(a => a.map(x => [x.target, x.rel]));
    expect(rels.length).toBeGreaterThan(0);
    rels.forEach(([target, rel]) => { expect(target).toBe('_blank'); expect(rel).toContain('noopener'); });
  });

  test('covers the songs the tour album is about plus the most played', async ({ page }) => {
    await openPage(page);
    const names = await page.evaluate(() => Object.keys(BACKGROUND));
    for (const n of ['Casket Girl', 'I Need U Back', 'Hachikō', 'Love Like This', 'Prema', "It Ain't Over", 'You', 'Okay, Goodbye', 'Forever Young',
                     'Hana', 'Michi Teyu Ku (Overflowing)', 'Shinunoga E-Wa', 'Kirari', 'Matsuri', 'Tabiji', 'Nan-Nan', 'damn']) {
      expect(names, n).toContain(n);
    }
  });
});
