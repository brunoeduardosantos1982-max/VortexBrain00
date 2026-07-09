---
name: verify
description: Verify VortexBrain changes end-to-end by driving the built app in headless Chromium against vite preview. Use before committing any change that touches src/.
---

# Verifying VortexBrain

## Build & serve

```bash
npm run build
nohup npm run preview >/tmp/preview.log 2>&1 &
# Vite base is /VortexBrain00/ (GitHub Pages) — the app is NOT at the root:
curl -s -o /dev/null -w '%{http_code}' http://localhost:4173/VortexBrain00/   # expect 200
```

To kill a running preview, use `pkill -f "[v]ite preview"` — the bracket
trick stops pkill from matching (and killing) your own shell's cmdline,
which exits the whole Bash tool call with code 144 before later commands run.

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

## Quick-capture flows

- Wait for app mount (`+ Nova nota` button visible) BEFORE `keyboard.press('Control+k')` —
  pressing right after goto races the React listener attach.
- The capture textarea is `.capture-modal textarea`; a bare
  `getByLabel('Captura')` also matches the dialog's aria-label "Captura rápida"
  (getByLabel is substring by default) → strict-mode violation.
- Daily-note assertions: query IndexedDB records with a `dateKey` field.
- The lost-update probe worth keeping: type in the open daily note (do NOT
  wait for autosave), Ctrl+K capture, then assert BOTH texts in the db and
  that the editor textarea shows the appended bullet (rehydration).

## Flows worth driving on any notes-related change

1. Create → type → wait 800 ms → reload → content persisted
2. Type then switch note within 500 ms → no keystrokes lost (unmount flush)
3. Body `<img src=x onerror=...>` → renders as literal text, 0 imgs in preview
4. Delete → gone from list, tombstone (`deletedAt !== null`) still in IndexedDB
