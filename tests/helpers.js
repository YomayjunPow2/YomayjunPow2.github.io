// Fake YouTube IFrame API: records which playlists are mounted and which tracks are played.
// Callbacks fire from microtasks, because page.clock fakes setTimeout.
const YT_STUB = `
  window.__yt = { created: [], calls: [] };
  window.YT = {
    PlayerState: { PLAYING: 1 },
    Player: function (id, opts) {
      window.__yt.created.push({ id: id, vars: opts.playerVars });
      this.playVideoAt = i => window.__yt.calls.push(['playVideoAt', i]);
      this.pauseVideo = () => window.__yt.calls.push(['pauseVideo']);
      this.destroy = () => {};
      this.getCurrentTime = () => 0;
      this.getPlaylistIndex = () => 0;
      this.seekTo = () => {};
      this.playVideo = () => {};
      Promise.resolve().then(() => opts.events && opts.events.onReady && opts.events.onReady({}));
    },
  };
  Promise.resolve().then(() => window.onYouTubeIframeAPIReady && window.onYouTubeIframeAPIReady());
`;

// Opens the Fujii Kaze page with a fixed clock, a chosen language, and no real network
// (everything that is not served from localhost is blocked, except the stubbed YouTube API).
async function openPage(page, { now = '2026-10-15T12:00:00+08:00', lang = 'zh-TW' } = {}) {
  await page.clock.install({ time: new Date(now) });
  await page.addInitScript(l => localStorage.setItem('fk_lang', l), lang);
  await page.route('https://www.youtube.com/iframe_api', route =>
    route.fulfill({ contentType: 'text/javascript', body: YT_STUB }));
  await page.route(url => !/^http:\/\/127\.0\.0\.1:4173\//.test(url.href) && url.href !== 'https://www.youtube.com/iframe_api',
    route => route.abort());
  await page.goto('/fujii-kaze-prema.html');
}

const ytState = page => page.evaluate(() => window.__yt);

module.exports = { openPage, ytState };
