const { test, expect } = require('@playwright/test');
const { openPage, ytState, mockApis } = require('./helpers');

const CJK = /[぀-ヿ一-鿿]/;
const albums = page => page.evaluate(() => ALBUMS.map(a => ({ id: a.id, tracks: a.tracks })));
const zhMap = page => page.evaluate(() => ZH);
const pick = (page, id) => page.locator(`.album-card[data-id="${id}"]`).click();

// ───────────── 1. Titles: official-only rule, Chinese for Japanese titles ─────────────
test.describe('titles', () => {
  test('data: every Japanese-titled song has a Chinese title, and nothing else does', async ({ page }) => {
    await openPage(page);
    const all = await albums(page), zh = await zhMap(page);
    const withJp = new Set(), allNames = new Set();
    all.forEach(a => a.tracks.forEach(t => { allNames.add(t[0]); if (t[1]) withJp.add(t[0]); }));
    const missing = [...withJp].filter(n => !zh[n]);
    expect(missing).toEqual([]);                                   // rule: translate Japanese titles
    const dead = Object.keys(zh).filter(n => !allNames.has(n));
    expect(dead).toEqual([]);                                      // no stale keys
    const englishOnly = Object.keys(zh).filter(n => !withJp.has(n));
    expect(englishOnly).toEqual([]);                               // rule: English-only official titles stay English
    Object.values(zh).forEach(v => expect(v).toMatch(CJK));
  });

  test('ZH mode: every row of every album shows the Chinese title over the original; English-only rows stay English', async ({ page }) => {
    await openPage(page);
    for (const a of await albums(page)) {
      await pick(page, a.id);
      const rows = page.locator('#track-list .guide-item');
      await expect(rows).toHaveCount(a.tracks.length);
      const zh = await zhMap(page);
      for (let i = 0; i < a.tracks.length; i++) {
        const [en, jp] = a.tracks[i];
        await expect(rows.nth(i).locator('.guide-title')).toHaveText(zh[en] || en);
        const sub = rows.nth(i).locator('.guide-title-jp');
        if (zh[en]) await expect(sub).toHaveText(jp ? en + ' ' + jp : en);
        else await expect(sub).toHaveCount(jp ? 1 : 0);
      }
    }
  });

  test('EN mode: no Chinese anywhere in track titles, album names or now-playing', async ({ page }) => {
    await openPage(page, { lang: 'en' });
    for (const a of await albums(page)) {
      const title = await page.evaluate(id => ALBUMS.find(x => x.id === id).title, a.id);
      await pick(page, a.id);
      const titles = await page.locator('#track-list .guide-title').allTextContents();
      titles.forEach(t => expect(t).not.toMatch(CJK));
      await expect(page.locator('#now-album')).toHaveText(title);
    }
    (await page.locator('.album-name').allTextContents()).forEach(t => expect(t).not.toMatch(CJK));
    await expect(page.locator('#lyrics-title')).not.toHaveText(CJK);
  });

  test('the same song has the same Chinese title on every album', async ({ page }) => {
    await openPage(page);
    const seen = {};
    for (const [album, idx] of [['pre-prema', 4], ['live', 3], ['best-of', 4]]) {          // all “Hana”
      await page.evaluate(([a, i]) => window.playAlbumTrack(a, i), [album, idx]);
      seen[album] = await page.locator('#lyrics-title').textContent();
    }
    expect(new Set(Object.values(seen))).toEqual(new Set(['花']));
  });

  test('switching language relabels everything live, without reloading', async ({ page }) => {
    await openPage(page);
    await pick(page, 'hehn');
    await page.getByRole('button', { name: 'EN' }).click();
    await expect(page.locator('#track-list .guide-title').nth(1)).toHaveText('Mo-Eh-Wa');
    await expect(page.locator('.album-name').first()).toHaveText('Prema');
    await expect(page.locator('#track-list .guide-item').nth(1).locator('button')).toHaveAttribute('aria-label', /: Mo-Eh-Wa$/);
    await page.getByRole('button', { name: '中' }).click();
    await expect(page.locator('#track-list .guide-title').nth(1)).toHaveText('夠了啦');
    await expect(page.locator('.album-name').first()).toHaveText('Prema　至上的愛');
    await expect(page.locator('#track-list .guide-item').nth(1).locator('button')).toHaveAttribute('aria-label', /夠了啦/);
  });

  test('the Prema Disc 2 list uses the same titles and its buttons still target the right track', async ({ page }) => {
    await openPage(page);
    const items = page.locator('.prema-item');
    const n = await items.count();
    expect(n).toBe(16);                                             // 9 + 7
    const hana = items.filter({ has: page.locator('button[data-album="pre-prema"][data-idx="4"]') });
    await expect(hana.locator('.prema-t')).toContainText('花');
    await expect(hana.locator('.prema-t .orig')).toContainText('Hana');
    await page.getByRole('button', { name: 'EN' }).click();
    await expect(hana.locator('.prema-t')).toHaveText('Hana 花');
    await hana.locator('button').click();
    await expect(page.locator('#now-album')).toHaveText('Pre: Prema');
    await expect(page.locator('#track-list .playing .guide-title')).toHaveText('Hana');
  });
});

// ───────────── 2. Lyrics lookup, translation, toggle ─────────────
test.describe('lyrics translation', () => {
  test('looks lyrics up by the Japanese title first, parentheses removed, then the English one', async ({ page }) => {
    const { log, before } = mockApis({ lyrics: () => null });
    await openPage(page, { before });
    await expect.poll(() => log.lrc.length).toBe(2);                        // initial song (English title only): 2 artist spellings
    log.lrc.length = 0;
    await page.evaluate(() => window.playAlbumTrack('pre-prema', 5));      // Michi Teyu Ku (Overflowing) 満ちてゆく
    await expect.poll(() => log.lrc.filter(q => q.includes('満ちてゆく')).length).toBeGreaterThan(0);
    await expect.poll(() => log.lrc.length).toBe(4);
    expect(log.lrc.slice(0, 2)).toEqual(['Fujii Kaze 満ちてゆく', 'Fujii Kaze Michi Teyu Ku']);
    expect(log.lrc.slice(2)).toEqual(['藤井風 満ちてゆく', '藤井風 Michi Teyu Ku']);
  });

  test('ZH mode: Japanese and English lines are both translated to zh-TW, blank lines skipped', async ({ page }) => {
    const { log, before } = mockApis();
    await openPage(page, { before });
    const lines = page.locator('#lyrics-lines .lyric-line');
    await expect(lines).toHaveCount(2);
    await expect(lines.nth(0).locator('.lyric-tr')).toHaveText('TR[ja|zh-TW]花が咲く');
    await expect(lines.nth(1).locator('.lyric-tr')).toHaveText('TR[en|zh-TW]I love you');
    expect(log.mm).toEqual([['花が咲く', 'ja|zh-TW'], ['I love you', 'en|zh-TW']]);
  });

  test('EN mode: English lines are left alone, Japanese lines go to English', async ({ page }) => {
    const { log, before } = mockApis();
    await openPage(page, { before, lang: 'en' });
    const lines = page.locator('#lyrics-lines .lyric-line');
    await expect(lines.nth(0).locator('.lyric-tr')).toHaveText('TR[ja|en]花が咲く');
    await expect(lines.nth(1).locator('.lyric-tr')).toHaveText('');
    expect(log.mm).toEqual([['花が咲く', 'ja|en']]);
  });

  test('the toggle hides translations, stops requests, and is remembered after reload', async ({ page }) => {
    const { log, before } = mockApis();
    await openPage(page, { before });
    const btn = page.locator('#tr-btn'), box = page.locator('#lyrics-lines');
    await expect(btn).toHaveText('譯文：開');
    await expect(page.locator('.lyric-tr').first()).toBeVisible();
    await btn.click();
    await expect(btn).toHaveText('譯文：關');
    await expect(page.locator('.lyric-tr').first()).toBeHidden();
    await expect(box).not.toHaveClass(/show-tr/);
    // next song while off: no translation requests at all
    const before0 = log.mm.length;
    await page.evaluate(() => window.playAlbumTrack('prema', 1));
    await expect(page.locator('#lyrics-lines .lyric-line')).toHaveCount(2);
    expect(log.mm.length).toBe(before0);
    await page.reload();
    await expect(page.locator('#tr-btn')).toHaveAttribute('aria-pressed', 'false');
    await expect(page.locator('#lyrics-lines')).not.toHaveClass(/show-tr/);
  });

  test('turning it back on fills the lines, using the cache for lines already translated', async ({ page }) => {
    const { log, before } = mockApis();
    await openPage(page, { before });
    await expect(page.locator('.lyric-tr').first()).toHaveText(/TR/);
    await page.locator('#tr-btn').click();
    await page.locator('#tr-btn').click();
    await expect(page.locator('.lyric-tr').nth(1)).toHaveText('TR[en|zh-TW]I love you');
    expect(log.mm.length).toBe(2);                                  // no repeat requests
  });

  test('switching language re-translates into the new language and clears the old text', async ({ page }) => {
    const { before } = mockApis();
    await openPage(page, { before });
    await expect(page.locator('.lyric-tr').nth(0)).toHaveText('TR[ja|zh-TW]花が咲く');
    await page.getByRole('button', { name: 'EN' }).click();
    await expect(page.locator('.lyric-tr').nth(0)).toHaveText('TR[ja|en]花が咲く');
    await expect(page.locator('.lyric-tr').nth(1)).toHaveText('');
  });

  test('a failed, empty, or unchanged translation shows nothing and keeps the original line', async ({ page }) => {
    const { before } = mockApis({ translate: (text) => text === '花が咲く' ? { status: 429, text: 'QUOTA' } : text });
    await openPage(page, { before });
    const lines = page.locator('#lyrics-lines .lyric-line');
    await expect(lines).toHaveCount(2);
    await expect(lines.nth(0)).toContainText('花が咲く');
    await expect(lines.nth(0).locator('.lyric-tr')).toHaveText('');   // quota error text never shown
    await expect(lines.nth(1).locator('.lyric-tr')).toHaveText('');   // identical to source
  });

  test('a late translation for the previous song never lands on the new song', async ({ page }) => {
    let open; const gate = new Promise(r => { open = r; });
    const { log, before } = mockApis({
      gate,
      lyrics: q => q.includes('Casket') ? '[00:01.00] old line' : '[00:01.00] 新しい歌詞',
    });
    await openPage(page, { before });
    await expect.poll(() => log.mm.length).toBeGreaterThan(0);        // first song is waiting on the gate
    await page.evaluate(() => window.playAlbumTrack('prema', 1));
    await expect(page.locator('#lyrics-lines .lyric-line')).toContainText('新しい歌詞');
    open();
    await expect(page.locator('#lyrics-lines .lyric-tr')).toHaveText('TR[ja|zh-TW]新しい歌詞');
  });

  test('no lyrics found: loading text first, then the localised empty message; toggle stays usable', async ({ page }) => {
    const { before } = mockApis({ lyrics: () => null });
    await openPage(page, { before });
    await expect(page.locator('#lyrics-empty')).toHaveText('找不到此曲的同步歌詞。');
    await expect(page.locator('#lyrics-lines .lyric-line')).toHaveCount(0);
    await page.getByRole('button', { name: 'EN' }).click();
    await expect(page.locator('#lyrics-empty')).toHaveText('No synced lyrics found for this track.');
    await page.locator('#tr-btn').click();
    await expect(page.locator('#tr-btn')).toHaveText('Translation: off');
  });

  test('clicking a lyric line seeks the video to its timestamp', async ({ page }) => {
    const { before } = mockApis();
    await openPage(page, { before });
    await page.locator('#lyrics-lines .lyric-line').nth(1).click();
    expect((await ytState(page)).calls).toContainEqual(['seekTo', 5]);
  });

  test('lyric text is inserted as text, never as HTML', async ({ page }) => {
    const { before } = mockApis({ lyrics: () => '[00:01.00] <img src=x onerror="window.__xss=1">', translate: () => '<b>boom</b>' });
    await openPage(page, { before });
    await expect(page.locator('#lyrics-lines .lyric-line')).toHaveCount(1);
    await expect(page.locator('#lyrics-lines img, #lyrics-lines b')).toHaveCount(0);
    expect(await page.evaluate(() => window.__xss)).toBeUndefined();
  });
});

// ───────────── 3. Song info block ─────────────
test.describe('song info', () => {
  test('every track of every album renders a complete block with a valid official link and correct position', async ({ page }) => {
    await openPage(page);
    for (const a of await albums(page)) {
      const title = await page.evaluate(id => ALBUMS.find(x => x.id === id).title, a.id);
      await pick(page, a.id);
      for (let i = 0; i < a.tracks.length; i++) {
        await page.locator('#track-list .guide-item').nth(i).locator('button').click();
        const info = page.locator('#song-info');
        await expect(info).toContainText(`${i + 1}/${a.tracks.length}`);
        await expect(info).not.toContainText('undefined');
        await expect(info.locator('a')).toHaveAttribute('href', /^https:\/\/fujiikaze\.com\/music\/[\w-]+\/$/);
      }
    }
  });

  test('album page slugs match the official music listing', async ({ page }) => {
    await openPage(page);
    expect(await page.evaluate(() => SLUG)).toEqual({
      'prema': 'prema', 'pre-prema': 'pre_prema', 'live': 'fujii_kaze_stadium_live_feelin_good',
      'best-of': 'best_of_fujii_kaze_2020-2024', 'lasa': 'love_all_serve_all', 'hehn': 'help-ever-hurt-never',
    });
  });

  test('only facts from the official pages: Prema dated, other albums undated, one song with credits', async ({ page }) => {
    await openPage(page);
    await page.evaluate(() => window.playAlbumTrack('prema', 1));
    await expect(page.locator('#song-info')).toContainText('2025-09-05');
    await page.evaluate(() => window.playAlbumTrack('hehn', 0));
    await expect(page.locator('#song-info')).not.toContainText(/\b20\d\d-\d\d-\d\d\b/);
    expect(await page.evaluate(() => Object.keys(TRACK_INFO))).toEqual(['prema:Hachikō']);
  });

  test('Hachikō: credits in Chinese with the English original beside them; English mode has no Chinese', async ({ page }) => {
    await openPage(page);
    await page.evaluate(() => window.playAlbumTrack('prema', 2));
    const info = page.locator('#song-info');
    await expect(info).toContainText('2025-06-13');
    await expect(info).toContainText('Sir Nolan');
    await expect(info.locator('[lang="en"]')).toContainText('producer 250 arranged the final version');
    await expect(info.locator('a')).toHaveAttribute('href', 'https://fujiikaze.com/music/hachiko/');
    await page.getByRole('button', { name: 'EN' }).click();
    await expect(info.locator('[lang="en"]')).toHaveCount(0);
    await expect(info).toContainText('arranged the final version');
    await expect(info).not.toContainText(CJK);
  });

  test('a song without official commentary says so in both languages instead of inventing text', async ({ page }) => {
    await openPage(page);
    await page.evaluate(() => window.playAlbumTrack('prema', 1));
    await expect(page.locator('#song-info')).toContainText('官方網站沒有這首歌的背景說明');
    await page.getByRole('button', { name: 'EN' }).click();
    await expect(page.locator('#song-info')).toContainText('gives no background text for this song');
  });

  test('block, lyrics and title follow the playing track when the playlist advances by itself', async ({ page }) => {
    const { log, before } = mockApis();
    await openPage(page, { before });
    await page.evaluate(() => { window.__yt.index = 3; window.__yt.opts.events.onStateChange({ data: 1 }); });
    await expect(page.locator('#lyrics-title')).toHaveText('Love Like This');
    await expect(page.locator('#song-info')).toContainText('4/9');
    await expect(page.locator('#track-list .playing .guide-n')).toHaveText('4');
    expect(log.lrc.some(q => q.includes('Love Like This'))).toBe(true);
  });
});

// ───────────── 4. Robustness ─────────────
test.describe('robustness', () => {
  test('no script errors while visiting every album in both languages', async ({ page }) => {
    const errors = [];
    page.on('pageerror', e => errors.push(e.message));
    const { before } = mockApis();
    await openPage(page, { before });
    for (const lang of ['EN', '中']) {
      await page.getByRole('button', { name: lang }).click();
      for (const a of await albums(page)) await page.evaluate(id => window.playAlbumTrack(id, 0), a.id);
    }
    expect(errors).toEqual([]);
  });

  test('the old fujii-kaze.html address redirects to the Prema page', async ({ page }) => {
    await page.goto('/fujii-kaze.html');
    await page.waitForURL('**/fujii-kaze-prema.html');
    await expect(page.locator('#days-left')).toBeVisible();
  });

  test('the Laufey page still links to a page that exists', async ({ request }) => {
    const html = await (await request.get('/laufey-concert.html')).text();
    expect(html).toContain('href="fujii-kaze.html"');
    expect((await request.get('/fujii-kaze.html')).ok()).toBe(true);
  });
});
