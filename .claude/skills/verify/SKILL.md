---
name: verify
description: Verify VortexBrain changes end-to-end by driving the built app in headless Chromium against vite preview. Use before committing any change that touches src/.
---

# Verifying VortexBrain

## Build & serve

```bash
npm run build
nohup npm run preview >/tmp/preview.log 2>&1 &   # serves dist/ on http://localhost:4173
curl -s -o /dev/null -w '%{http_code}' http://localhost:4173   # expect 200
```

The service worker (once PLAN-pwa-offline lands) only exists in the built app — never verify offline/PWA behavior against `npm run dev`.

## Drive with Playwright

`playwright-core` is not a project dep — install it in a scratch dir, not here.
The pre-installed Chromium executable is at:

```
/opt/pw-browsers/chromium-1194/chrome-linux/chrome
```

(`/opt/pw-browsers/chromium` is a bare marker file, NOT the executable — launch fails with it. `ls /opt/pw-browsers/` if the versioned dir number changed.)

```js
import { chromium } from 'playwright-core'
const browser = await chromium.launch({
  executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome',
})
```

## Gotcha that will burn you

After clicking **"+ Nova nota"** or switching notes, the editor REMOUNTS
(keyed by note id) with a brief window where the old editor is still
mounted. Playwright types faster than the remount, so a `fill()` right
after the click lands in the OLD note's editor and autosave "renames" the
wrong note. This is test-speed artifact, not an app bug. Always gate:

```js
await page.getByRole('button', { name: '+ Nova nota' }).click()
await page.waitForFunction(() => document.querySelector('.editor-bar input')?.value === '')
// only now fill()
```

Same after switching notes: wait for the title input to show the target
note's title before reading/typing.

## Useful selectors / flows

- New note: button `+ Nova nota`; title input `getByLabel('Título')`; body `getByLabel('Conteúdo')`; delete: button `Apagar`
- Autosave debounce is 500 ms — `waitForTimeout(800)` before asserting persistence
- Note list entries are buttons named by title; empty title shows `(sem título)`
- Inspect raw IndexedDB (e.g. soft-delete tombstones) via `page.evaluate` with `indexedDB.open('vortexbrain')` — table `notes`
- Multi-tab sync: open a second page in the SAME context; writes in one appear in the other via Dexie liveQuery (no reload)

## Second gotcha: duplicated button names

Note titles appear as buttons in MULTIPLE places (sidebar list, backlinks
panel, search results) — a bare `getByRole('button', { name: <title> })`
hits Playwright strict-mode violations once backlinks exist. Scope clicks:
`.note-list button`, `.backlinks button`, `.search-results button`.

## PWA / service-worker verification

- Use `chromium.launchPersistentContext(userDataDir)` — SW state must
  survive between "install" and "detect update" phases.
- On FIRST load the SW installs but does NOT control the page
  (registerType 'prompt', no clientsClaim). `navigator.serviceWorker.controller`
  stays null until the next navigation — reload once before asserting.
- Offline test: load once online → `ctx.setOffline(true)` → reload.
- Update-toast test: rebuild (`npm run build`) with a changed visible
  string while preview serves dist/ from disk, reload → `.update-toast`
  appears; clicking it activates the new SW. Restore the source + rebuild
  in a `finally`.
- Import confirm(): register `page.on('dialog', d => d.accept())` BEFORE
  triggering `setInputFiles`.

## Flows worth driving on any notes-related change

1. Create → type → wait 800 ms → reload → content persisted
2. Type then switch note within 500 ms → no keystrokes lost (unmount flush)
3. Body `<img src=x onerror=...>` → renders as literal text, 0 imgs in preview
4. Delete → gone from list, tombstone (`deletedAt !== null`) still in IndexedDB
