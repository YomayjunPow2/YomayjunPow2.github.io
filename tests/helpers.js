// Fake YouTube IFrame API: records which playlists are mounted and which tracks are played.
// Callbacks fire from microtasks, because page.clock fakes setTimeout.
const YT_STUB = `
  window.__yt = { created: [], calls: [], index: 0, opts: null };
  window.YT = {
    PlayerState: { PLAYING: 1 },
    Player: function (id, opts) {
      window.__yt.created.push({ id: id, vars: opts.playerVars });
      window.__yt.opts = opts;
      this.playVideoAt = i => window.__yt.calls.push(['playVideoAt', i]);
      this.pauseVideo = () => window.__yt.calls.push(['pauseVideo']);
      this.destroy = () => {};
      this.getCurrentTime = () => 0;
      this.getPlaylistIndex = () => window.__yt.index;
      this.seekTo = (t) => window.__yt.calls.push(['seekTo', t]);
      this.playVideo = () => {};
      Promise.resolve().then(() => opts.events && opts.events.onReady && opts.events.onReady({}));
    },
  };
  Promise.resolve().then(() => window.onYouTubeIframeAPIReady && window.onYouTubeIframeAPIReady());
`;

// Opens the Fujii Kaze page with a fixed clock, a chosen language, and no real network
// (everything that is not served from localhost is blocked, except the stubbed YouTube API).
async function openPage(page, { now = '2026-10-15T12:00:00+08:00', lang = 'zh-TW', before } = {}) {
  await page.clock.install({ time: new Date(now) });
  await page.addInitScript(l => localStorage.setItem('fk_lang', l), lang);
  await page.route('https://www.youtube.com/iframe_api', route =>
    route.fulfill({ contentType: 'text/javascript', body: YT_STUB }));
  await page.route(url => !/^http:\/\/127\.0\.0\.1:4173\//.test(url.href) && url.href !== 'https://www.youtube.com/iframe_api',
    route => route.abort());
  if (before) await before(page);
  await page.goto('/fujii-kaze-prema.html');
}

const ytState = page => page.evaluate(() => window.__yt);

// Stubs lrclib.net and MyMemory. Returns logs of the requests the page made.
// lyrics(q) -> LRC string or null; translate(text, langpair) -> string or { status, text }.
function mockApis({ lyrics, translate, gate } = {}) {
  const log = { lrc: [], mm: [] };
  const lrcDefault = () => '[00:01.00] 花が咲く\n[00:05.00] I love you\n[00:09.00] ';
  const trDefault = (text, lp) => 'TR[' + lp + ']' + text;
  const before = async page => {
    await page.route('https://lrclib.net/api/search**', async route => {
      const q = new URL(route.request().url()).searchParams.get('q');
      log.lrc.push(q);
      const l = (lyrics || lrcDefault)(q);
      await route.fulfill({ contentType: 'application/json', body: JSON.stringify(l == null ? [] : [{ syncedLyrics: l }]) });
    });
    await page.route('https://api.mymemory.translated.net/get**', async route => {
      const u = new URL(route.request().url());
      const text = u.searchParams.get('q'), lp = u.searchParams.get('langpair');
      log.mm.push([text, lp]);
      if (gate) await gate;
      const r = (translate || trDefault)(text, lp);
      const o = typeof r === 'string' ? { status: 200, text: r } : r;
      await route.fulfill({ contentType: 'application/json', body: JSON.stringify({ responseStatus: o.status, responseData: { translatedText: o.text } }) });
    });
  };
  return { log, before };
}

module.exports = { openPage, ytState, mockApis };
