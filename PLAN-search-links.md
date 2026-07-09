# PLAN-search-links — Full-text search, [[wikilinks]], backlinks

**Rank: 3 of 5.**
**Depends on: PLAN-notes-core. Blocks: nothing (quick-capture benefits but doesn't require it).**

## Goal

The features that make this a *second brain* instead of a notes app: instant full-text search across all notes (accent-insensitive — the corpus will be Portuguese), `[[Title]]` links between notes rendered as clickable navigation, and a backlinks panel showing every note that references the current one.

## Fixed decisions (do not deviate or ask)

- Search: **MiniSearch**, in-memory, rebuilt from Dexie on startup, incrementally updated on writes. No web worker in this plan (revisit only past ~5k notes).
- Wikilinks resolve **by exact title match at render time** (store the raw `[[Title]]` text in the body; never rewrite bodies to embed ids).
- Link syntax: `[[Title]]` only. No aliases (`[[Title|label]]`) in this plan.

## Exact files to create/touch

```
src/search/index.ts          (MiniSearch singleton: build, add/replace/discard, search)
src/search/normalize.ts      (accent-folding term processor — shared by index & query)
src/links/wikilinks.ts       (extractWikilinks(body): string[]  — code-block aware)
src/components/SearchBar.tsx
src/components/Backlinks.tsx
src/components/MarkdownPreview.tsx   (touch: render [[...]] as links)
src/db/notes.ts              (touch: call search-index update hooks on create/update/delete)
src/App.tsx                  (touch: mount SearchBar; Backlinks under preview)
src/search/normalize.test.ts
src/links/wikilinks.test.ts
src/search/index.test.ts
package.json                 (add: minisearch)
```

## Implementation order

1. `npm install minisearch`.
2. `src/search/normalize.ts`:
   ```ts
   export const fold = (s: string) =>
     s.normalize('NFD').replace(/\p{Diacritic}/gu, '').toLowerCase();
   ```
   Write its test FIRST: `fold('Cérebro') === 'cerebro'`, `fold('ação') === 'acao'`.
3. `src/search/index.ts`: MiniSearch with `fields: ['title','body']`, `storeFields: ['title']`, `processTerm: fold`, `searchOptions: { prefix: true, fuzzy: 0.1, processTerm: fold }`. Export `buildIndex(notes)`, `upsertNote(note)`, `removeNote(id)`, `searchNotes(q)`.
4. Hook index maintenance into `src/db/notes.ts`: after createNote → `upsertNote`; after updateNote → `upsertNote`; after softDeleteNote → `removeNote`. Keep the search module import one-directional (db → search), never search → db.
5. Build the index once on app startup from `listNotes()` — do it in a `useEffect`, set an `indexReady` flag; SearchBar renders disabled until ready.
6. `src/links/wikilinks.ts`: `extractWikilinks(body)` returns unique titles, **skipping matches inside fenced code blocks and inline code** (see edge cases for the required algorithm).
7. `Backlinks.tsx`: given current note title, scan `listNotes()` with `extractWikilinks` for notes whose links include it (client-side scan is fine at this scale).
8. `MarkdownPreview.tsx`: pre-process body → replace `[[Title]]` (outside code, reuse the same extractor logic) with a markdown link `[Title](#/note/<id>)` when a note with that exact title exists, or `[Title](#/new/<encodeURIComponent(title)>)` when it doesn't. Handle both routes in App: navigate to note / create note with that title then navigate.
9. `SearchBar.tsx`: input + results dropdown; Enter/click navigates. Debounce 150 ms.
10. Full acceptance run.

## Edge cases a weaker model will miss

- **Accent folding must be applied to BOTH indexing and querying** (`processTerm` in both the constructor and `searchOptions`). Fold only one side and "cerebro" silently stops matching "cérebro" — no error, just missing results.
- **MiniSearch `replace()` requires the doc to currently exist in the index and `add()` throws on duplicate ids.** For `upsertNote`, use `if (index.has(id)) index.replace(doc) else index.add(doc)` (MiniSearch ≥6 has `has()`; otherwise track ids in a Set). A bare `add` on update crashes with "duplicate ID".
- **`[[links]] inside code must not be links.** Required approach: split the body on fenced-code boundaries (``` and ~~~) and inline backtick spans FIRST, then regex `\[\[([^\[\]\n]+)\]\]` only over the non-code segments. A single global regex over the whole body is wrong and will linkify code samples. Test case: body with a fenced block containing `[[NotALink]]` and prose containing `[[RealLink]]` → extractor returns only `RealLink`.
- **Renaming a note breaks inbound title-based links — by design.** Do NOT auto-rewrite other notes' bodies on rename (silent data mutation, conflict-prone). Instead, the broken link falls back to the "create note" affordance, which is visible and self-healing. Put this rationale in a comment so a future model doesn't "fix" it.
- **Two notes with the same title**: resolve to the most recently updated one (deterministic), and don't crash. Add a test.
- **Link titles need escaping in the markdown-link rewrite**: a title containing `)` or `(` breaks `[Title](url)` syntax. URL-encode the href side and escape `[`/`]` on the label side.
- **Startup race**: a search fired before the index finishes building returns [] and looks like "no results". Gate the SearchBar on `indexReady` instead of returning empty silently.
- **Soft-deleted notes** must be removed from the index AND excluded from backlink scans — the deleted note otherwise keeps appearing in search results after every app restart because `buildIndex` was fed `listNotes()`… which already excludes them. So build from `listNotes()`, not `db.notes.toArray()`. Subtle but decisive.

## Acceptance criteria

1. `npm run lint && npm run typecheck && npm test && npm run build` pass.
2. Create note "Cérebro Digital" with body "memória de longo prazo". Searching `cerebro`, `memoria`, and `CÉREBRO` each finds it.
3. Note A body contains `[[Cérebro Digital]]` → preview shows a link; clicking navigates to that note; the Backlinks panel on "Cérebro Digital" lists Note A.
4. `[[Nova Nota]]` (nonexistent) renders as a create-affordance; clicking creates a note titled "Nova Nota" and navigates to it.
5. A fenced code block containing `[[NotALink]]` renders as plain code — no link, and it does not appear in any Backlinks panel.
6. Delete a note that appeared in search — it immediately stops appearing, and still doesn't appear after a reload.
7. Unit tests green for: fold(), extractWikilinks (incl. code-block case), upsert-then-update-then-search, duplicate-title resolution.
