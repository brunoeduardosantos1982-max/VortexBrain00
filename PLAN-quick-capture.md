# PLAN-quick-capture — Capture modal, daily notes, PWA share target

**Rank: 5 of 5 (do last).**
**Depends on: PLAN-notes-core. Share-target step additionally depends on PLAN-pwa-offline.**

## Goal

Remove friction from getting thoughts INTO the second brain: a keyboard-summoned quick-capture modal, an auto-created "daily note" as the default inbox, and (once the PWA plan is done) receiving shared text/URLs from other apps via the Web Share Target API.

## Fixed decisions (do not deviate or ask)

- Hotkey: **Ctrl+K / Cmd+K** opens quick capture. No other bindings.
- Daily note title format: `Diário YYYY-MM-DD` (LOCAL date), tagged `diario`.
- Quick captures append to today's daily note as a `- ` bullet line with an `HH:mm` prefix, unless the user toggles "nova nota" in the modal to create a standalone note.
- Share target uses **method GET** (query params), route `/share`.

## Exact files to create/touch

```
src/hooks/useHotkey.ts
src/components/QuickCapture.tsx      (modal: textarea, Enter=save, Esc=close, toggle "nova nota")
src/db/daily.ts                      (getOrCreateDailyNote(): Promise<Note>, appendToDaily(text))
src/pages/ShareTarget.tsx            (reads ?title=&text=&url=, appends to daily, confirms)
src/App.tsx                          (touch: mount hotkey + modal; route /share)
vite.config.ts                       (touch: add share_target to the PWA manifest)
src/db/daily.test.ts
src/components/QuickCapture.test.tsx
```

## Implementation order

1. `src/db/daily.ts`:
   - `localDateKey()` → `YYYY-MM-DD` from `getFullYear/getMonth/getDate` (never `toISOString` — see edge cases).
   - Schema change: add Dexie **`version(2)`** with `notes: 'id, title, updatedAt, deletedAt, *tags, dateKey'` and a new optional `dateKey?: string` field set only on daily notes. (Do NOT modify version(1) — the notes-core plan documents why.)
   - `getOrCreateDailyNote()`: inside `db.transaction('rw', db.notes, ...)`: query by `dateKey === localDateKey()` and `deletedAt === null`; create if absent. The transaction is what makes two simultaneous calls (two tabs, or hotkey+share racing) yield ONE note.
   - `appendToDaily(text)`: get-or-create, then append `\n- ${HH:mm} ${text}` and bump `updatedAt`.
2. Tests for `daily.ts` first: idempotency (two awaited calls → 1 note), append ordering, dateKey is local.
3. `useHotkey.ts`: `keydown` listener on `window` for `(e.ctrlKey || e.metaKey) && e.key === 'k'`; call `e.preventDefault()` **before** opening (Ctrl+K is the browser's address-bar-search — you must swallow it); ignore repeats (`e.repeat`).
4. `QuickCapture.tsx`: portal-rendered modal; autofocus textarea; Enter saves (Shift+Enter = newline), Esc closes; on save show a 1.5 s "Capturado ✓" flash then close. While the modal is open the hotkey must not re-trigger.
5. Wire into `App.tsx`.
6. Share target (only if PLAN-pwa-offline is merged): add to manifest:
   ```json
   "share_target": { "action": "/share", "method": "GET",
     "params": { "title": "title", "text": "text", "url": "url" } }
   ```
   `ShareTarget.tsx` reads the three params, appends `title — text url` (whichever are present) to the daily note, shows confirmation, then navigates home. Register a `/share` route that works under the SPA fallback.
7. Full acceptance run.

## Edge cases a weaker model will miss

- **UTC vs local date is a real bug here, not pedantry**: the user is in Brazil (UTC-3). `toISOString().slice(0,10)` flips to tomorrow at 21:00 local — every evening capture would land in the wrong daily note. All date-key math must use local getters. The unit test should stub `Date` near a UTC-midnight boundary to prove it.
- **Idempotent get-or-create needs a transaction, not a check-then-insert.** Two racing calls both see "no daily note" and create two. Dexie `'rw'` transactions on the same table serialize this. Test with `Promise.all([getOrCreateDailyNote(), getOrCreateDailyNote()])`.
- **The hotkey must not fire while typing in other inputs?** Wrong instinct — Ctrl+K should open capture even when focus is in the note editor (that's the point of a global capture key). Do NOT add an "ignore when in input" guard here; DO ignore when the capture modal itself is already open.
- **`e.preventDefault()` placement**: after any `await`, it's too late — the browser already opened its search box. Prevent first, act after.
- **Appending to a note the user has open in the editor**: the editor's local state would overwrite the appended bullet on its next autosave (lost update). Mitigation that fits this codebase: the editor is keyed by note id and hydrated from `useLiveQuery`, so ensure the editor component re-hydrates on external `updatedAt` change OR simply close/save the capture through the same `updateNote` path and accept last-write-wins **but** flush the editor's pending debounce before `appendToDaily` runs (export a `flushPendingSaves()` from the editor via a module-level registry). Pick the flush approach; document it in a comment.
- **Share target only exists for INSTALLED PWAs on Android/ChromeOS** — it cannot be tested in a desktop tab. The `/share` route must therefore also work as a plain URL (`http://localhost:4173/share?text=oi`) so it's testable everywhere; the manifest wiring is verified by manifest inspection, not by end-to-end sharing.
- **SPA fallback for `/share`**: with the default vite-plugin-pwa/workbox config, `navigateFallback` serves `index.html` for unknown routes — but if a later plan added `navigateFallbackDenylist`, `/share` must not match it. Check.
- **Shared text can be huge or contain `\r\n`** (Android apps share whole articles): normalize newlines, and if text > 2000 chars create a standalone note instead of a bullet (a 5-page bullet in the daily note is unusable) — title it from the first 60 chars.

## Acceptance criteria

1. `npm run lint && npm run typecheck && npm test && npm run build` pass.
2. Ctrl+K anywhere in the app (including while editing a note) opens the modal with the textarea focused; the browser's own search box does NOT open. Esc closes. Ctrl+K while open does nothing.
3. Capture "comprar café" at, say, 14:32 → today's `Diário YYYY-MM-DD` note contains `- 14:32 comprar café`; capturing again appends a second bullet to the SAME note (still exactly one daily note — verify in DevTools IndexedDB).
4. Toggle "nova nota" in the modal → creates a standalone note instead of appending.
5. `Promise.all` idempotency unit test passes; local-date unit test passes with a mocked date at 23:30 UTC-3.
6. Visiting `/share?title=Artigo&text=trecho&url=https://ex.com` in the preview build appends `Artigo — trecho https://ex.com` to the daily note and shows confirmation.
7. Built manifest (`dist/manifest.webmanifest`) contains the `share_target` block.
8. Capture while the daily note is open in the editor → both the pre-existing editor text and the new bullet survive (no lost update).
