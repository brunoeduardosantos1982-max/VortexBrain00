# PLAN-pwa-offline — Installable PWA, offline shell, backup/restore

**Rank: 4 of 5.**
**Depends on: PLAN-notes-core (export/import needs the db). PLAN-search-links not required.**

## Goal

Make VortexBrain installable and fully functional offline, protect user data against browser storage eviction, and give the user a manual escape hatch: JSON export/import backup. A second brain that can silently lose its data is worse than no second brain — this plan is the data-durability plan.

## Fixed decisions (do not deviate or ask)

- **vite-plugin-pwa** with `registerType: 'prompt'` (NOT `autoUpdate` — see edge cases).
- Backup format: single JSON file `{ "format": "vortexbrain-backup", "version": 1, "exportedAt": <epoch ms>, "notes": Note[] }`.
- Import strategy: **merge by id, newer `updatedAt` wins**; never wholesale-replace without explicit user confirmation.
- Request persistent storage via `navigator.storage.persist()` on first note creation (not on load — see edge cases).

## Exact files to create/touch

```
vite.config.ts                    (touch: add VitePWA plugin config)
public/pwa-192.png                (generate: solid-color 192×192 PNG with a glyph)
public/pwa-512.png                (generate: 512×512)
src/pwa/updatePrompt.tsx          (toast: "Nova versão disponível → Atualizar")
src/backup/exportImport.ts        (exportBackup(): Blob, importBackup(file): Promise<ImportReport>)
src/components/BackupControls.tsx (Export / Import buttons + report display)
src/db/notes.ts                   (touch: call storage.persist() after first create)
src/App.tsx                       (touch: mount updatePrompt + BackupControls)
src/backup/exportImport.test.ts
package.json                      (add dev: vite-plugin-pwa)
```

## Implementation order

1. `npm install -D vite-plugin-pwa`. Generate the two PNGs with a tiny Node script (canvas not needed — write a solid-color PNG via any pure-JS encoder, or commit pre-made images). Do not reference icon files that don't exist.
2. `vite.config.ts`: `VitePWA({ registerType: 'prompt', manifest: { name: 'VortexBrain', short_name: 'Vortex', start_url: '/', display: 'standalone', theme_color: '#1a1a2e', background_color: '#1a1a2e', icons: [192, 512 entries, plus `purpose: 'maskable'` on the 512] }, workbox: { globPatterns: ['**/*.{js,css,html,svg,png,woff2}'] } })`.
3. `src/pwa/updatePrompt.tsx`: use `virtual:pwa-register/react` (`useRegisterSW`); when `needRefresh`, show a fixed-position toast with an "Atualizar" button calling `updateServiceWorker(true)`.
4. `src/backup/exportImport.ts`:
   - `exportBackup()`: `await db.notes.toArray()` (ALL notes including soft-deleted — deletions must survive backup/restore), wrap in envelope, `new Blob([JSON.stringify(...)], { type: 'application/json' })`.
   - `importBackup(file)`: parse; validate `format` and `version` fields and that `notes` is an array of objects with string `id` — reject anything else with a typed error, never partially import; per note: unknown id → add; known id → keep whichever has higher `updatedAt`. Return `{ added, updated, skipped }`.
   - Wrap the whole import in ONE Dexie transaction (`db.transaction('rw', db.notes, ...)`) so a malformed record mid-file can't leave a half-imported db.
5. `BackupControls.tsx`: Export triggers download named `vortexbrain-backup-YYYY-MM-DD.json` (LOCAL date); Import is `<input type="file" accept="application/json">` + confirm dialog showing the report.
6. `notes.ts`: after the first successful `createNote`, fire-and-forget `navigator.storage?.persist?.()`.
7. Tests for exportImport (round-trip, merge conflict both directions, malformed file rejection).
8. Build + preview verification (dev server does NOT exercise the service worker — see edge cases).

## Edge cases a weaker model will miss

- **`registerType: 'autoUpdate'` can reload the app while the user has an unflushed autosave debounce pending → data loss.** That's why this plan mandates `'prompt'`. Do not "simplify" to autoUpdate.
- **The service worker is not active in `npm run dev`.** All offline testing must use `npm run build && npm run preview`. A weaker model will toggle DevTools-offline against the dev server, see it fail, and start "fixing" working code.
- **First-visit offline is impossible** — the SW installs on first load. Offline test sequence: load preview page once online → DevTools → Network → Offline → reload → app must render and show notes (IndexedDB is origin-local, unaffected by offline).
- **iOS Safari evicts IndexedDB after ~7 days of site inactivity** unless installed to home screen / storage is persisted. This is WHY `storage.persist()` and export exist. Call `persist()` after a user gesture-adjacent moment (first note created), not on page load — Chrome is more likely to grant it, and Firefox shows a permission prompt that's hostile as a load-time popup.
- **Export must read from Dexie, not React state** — state holds only the selected/visible notes.
- **Include soft-deleted notes in the export.** If you export only live notes, restoring on another device resurrects notes the user deleted (they're missing from the backup, so the local copy "wins"). Deletion tombstones must travel.
- **Local date in the filename**: `new Date().toISOString().slice(0,10)` is UTC — in Brazil (UTC-3) every export after 21:00 gets tomorrow's date. Use `toLocaleDateString('sv')` (yields YYYY-MM-DD in local time) or manual getFullYear/getMonth/getDate.
- **`JSON.parse` of a 50 MB file on the main thread will jank** — acceptable at this scale, but cap it: refuse files > 100 MB with a clear message instead of freezing the tab.
- **Manifest icons**: Chrome requires a 192 and a 512; installability silently fails (no error, just no install prompt) if either 404s. Verify both URLs return 200 in preview before debugging anything else.

## Acceptance criteria

1. `npm run lint && npm run typecheck && npm test && npm run build` pass.
2. `npm run build && npm run preview`: Chrome DevTools → Application → Manifest shows no warnings; an install icon appears in the address bar.
3. Load preview once, go DevTools-offline, reload: app renders and previously created notes are visible and editable.
4. Export downloads `vortexbrain-backup-<today local>.json`; the file contains a soft-deleted note (create one, delete it, export, inspect).
5. Round-trip: export → delete the IndexedDB database in DevTools → reload → import the file → all notes and deletions restored; report shows correct counts.
6. Conflict: import a backup where a note's `updatedAt` is older than the local copy → local copy survives; newer → backup copy wins. Both covered by unit tests.
7. Import of `{"hello":"world"}` and of a truncated JSON file both fail with a user-visible message and change nothing in the db.
8. Deploy/update flow: change any source string, rebuild, reload preview → "Nova versão disponível" toast appears; clicking it activates the new version.
