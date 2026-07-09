# PLAN-notes-core — Data model, persistence, note CRUD + markdown editing

**Rank: 2 of 5.**
**Depends on: PLAN-foundation. Blocks: PLAN-search-links, PLAN-pwa-offline, PLAN-quick-capture.**

## Goal

The heart of the product: create, edit, list, and delete markdown notes that persist locally in IndexedDB and survive reloads. After this plan, VortexBrain is a usable (if bare) note-taking app.

## Fixed decisions (do not deviate or ask)

- Storage: **Dexie** + **dexie-react-hooks** (`useLiveQuery`). Not raw IndexedDB, not localStorage, not SQLite-wasm.
- Markdown rendering: **react-markdown** with **no** `rehype-raw` plugin (HTML in notes must stay escaped — this is the XSS boundary).
- IDs: `crypto.randomUUID()`.
- Deletes are **soft** (set `deletedAt`), hard-purge is out of scope.
- Editor is a plain `<textarea>` with a side-by-side rendered preview. No rich-text/CodeMirror in this plan.

## Data model

```ts
// src/db/schema.ts
export interface Note {
  id: string;            // crypto.randomUUID()
  title: string;
  body: string;          // raw markdown
  tags: string[];
  createdAt: number;     // Date.now() — set in app code; IndexedDB has no column defaults
  updatedAt: number;
  deletedAt: number | null;
}
```

Dexie schema v1: `notes: 'id, title, updatedAt, deletedAt, *tags'` (the `*tags` multiEntry index is used by later plans; add it NOW so we never need a schema migration for it).

## Exact files to create/touch

```
src/db/schema.ts        (Note interface + Dexie subclass + `export const db`)
src/db/notes.ts         (createNote, updateNote, softDeleteNote, getNote, listNotes)
src/components/NoteList.tsx
src/components/NoteEditor.tsx
src/components/MarkdownPreview.tsx
src/App.tsx             (wire list + editor; selected-note state)
src/db/notes.test.ts
src/components/NoteEditor.test.tsx
package.json            (add: dexie, dexie-react-hooks, react-markdown; dev: fake-indexeddb)
```

## Implementation order

1. `npm install dexie dexie-react-hooks react-markdown && npm install -D fake-indexeddb`.
2. `src/db/schema.ts`: Dexie subclass, `this.version(1).stores({ notes: 'id, title, updatedAt, deletedAt, *tags' })`.
3. `src/db/notes.ts` — pure async functions, no React:
   - `createNote(partial)` fills id/createdAt/updatedAt/deletedAt.
   - `updateNote(id, patch)` always bumps `updatedAt`.
   - `listNotes()` returns non-deleted notes sorted by `updatedAt` desc. Use `db.notes.orderBy('updatedAt').reverse().filter(n => n.deletedAt === null).toArray()` — see edge cases for why not `.where('deletedAt').equals(null)`.
4. Tests for `notes.ts` first (they define the contract), using `fake-indexeddb` (see edge cases).
5. `NoteList.tsx`: `useLiveQuery(listNotes)`, click selects a note, "New note" button.
6. `NoteEditor.tsx`: controlled textarea for title + body; autosave debounced **500 ms**; **flush pending save on unmount and on note-switch** (see edge cases). Delete button calls `softDeleteNote`.
7. `MarkdownPreview.tsx`: `<ReactMarkdown>{body}</ReactMarkdown>`.
8. Wire into `App.tsx`: two-pane layout (list left, editor+preview right); when no note selected show a hint.
9. Run full acceptance suite.

## Edge cases a weaker model will miss

- **IndexedDB cannot index `null`**: `db.notes.where('deletedAt').equals(null)` throws `DataError`. Filter deleted notes in JS (`.filter()`) or store `0` instead of null — this plan chooses `null` + JS filter for type honesty. Do not "fix" it by indexing.
- **Debounced autosave loses the last keystrokes** when the component unmounts or the user switches notes before the 500 ms fires. Keep the pending value in a ref and flush it in the `useEffect` cleanup AND before switching `selectedId`. Test this: type, immediately switch note, switch back — text must be there.
- **Switching notes must reset editor state**: a naive `useState(note.body)` initializes once and shows note A's body while editing note B. Key the editor by note id (`<NoteEditor key={note.id} …/>`) — simplest correct fix.
- **`useLiveQuery` returns `undefined` on first render** (loading), not `[]`. Handle the undefined case or the list flashes an error/crash.
- **fake-indexeddb test isolation**: import `fake-indexeddb/auto` at the very top of the test file (before Dexie import resolves), and in `beforeEach` run `await db.delete(); await db.open();` — otherwise notes leak between tests and count-assertions fail intermittently.
- **Never edit Dexie `version(1)` after it has shipped** to any user; schema changes are a new `version(2)` with an `upgrade()` callback. Put a comment saying exactly this above the schema.
- **`crypto.randomUUID()` requires a secure context.** `localhost` and HTTPS are fine (our cases), but add a comment noting it — a weaker model debugging a LAN-IP dev server (`http://192.168.x.x`) will hit `crypto.randomUUID is not a function` and should serve via localhost instead of polyfilling.
- **Do not add `rehype-raw` or `dangerouslySetInnerHTML`** to render markdown. react-markdown escapes raw HTML by default; that IS the sanitization strategy. A note containing `<img src=x onerror=alert(1)>` must render as literal text.
- **Multi-tab**: `useLiveQuery` already reflects writes from other tabs (Dexie broadcasts). Don't build a manual refresh mechanism.

## Acceptance criteria

1. `npm run lint && npm run typecheck && npm test && npm run build` all pass.
2. `npm run dev`: create a note, type title+body, wait 1 s, **reload the page** — the note is still there with full text.
3. Type text and switch to another note within 500 ms, switch back — no keystrokes lost.
4. Create a note with body `<img src=x onerror=alert(1)>` — preview shows the literal text; no alert fires.
5. Delete a note — it disappears from the list; in DevTools → IndexedDB the record still exists with `deletedAt` set.
6. Open the app in two tabs; create a note in tab 1 — it appears in tab 2's list without reload.
7. Unit tests cover: create fills timestamps; update bumps `updatedAt`; listNotes excludes soft-deleted; soft-deleted note retrievable by `getNote`.
