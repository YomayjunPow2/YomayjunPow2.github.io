# Laufey Fan Site — Project Instructions

## Files
- `laufey-concert.html` — **main page** (hero, story, discography, album spotlight, concert info)
- `album.html` — album detail page (loaded via `?id=` query param, one page for all 8 albums)

## Critical: Always check the main page
After every change — even when only editing `album.html` — verify that `laufey-concert.html` is also consistent and correct. Both pages share:
- The same 8-album discography data (track lists, years, descriptions)
- The same i18n pattern (`data-i18n` + `translations` object with `zh-TW` and `en` keys)
- The same lyrics/backstory modal system (lyrics.ovh + MyMemory + Wikipedia)
- The same star/countdown/lang-switch UI patterns

Check for: stale text, missing i18n keys, wrong track counts, broken links, inconsistent data between the two files.

## Development
- Push directly to `main` branch
- No pull requests unless explicitly asked
