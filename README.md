# FlashCards — ReDI Study App (Sample Project)

> **For teachers only** — share this with students *after* they finish their own version.

A complete flashcard study app built with plain HTML, CSS, and JavaScript. No frameworks, no build tools, no npm. Open `index.html` in a browser and you're running.

---

## How to run

```bash
# Option 1 — just open it
open index.html        # macOS
start index.html       # Windows

# Option 2 — local server (avoids any file:// quirks)
python -m http.server 8080
# then visit http://localhost:8080
```

---

## What it does

| Feature | Notes |
|---------|-------|
| Add / delete cards | Saved immediately to `sessionStorage` |
| Study session | Cards shuffled (Fisher–Yates), 3D flip animation on click or Space/Enter |
| Mark correct / incorrect | Arrow keys or buttons; progress bar and score track the session |
| Export deck | Downloads a `.json` file via `Blob` + `URL.createObjectURL` |
| Import deck | Reads a `.json` file with `FileReader` |
| Responsive | Mobile-first; works from 320 px to desktop |
| Two-player mode (extra credit) | Players alternate per card, self-mark; winner declared at the end |
| Keyboard shortcuts | `Space`/`Enter` flip · `→` correct · `←` incorrect · `Esc` exit |
| Accessibility | Semantic HTML, labelled inputs, `aria-live` regions, visible focus ring |

---

## File tour

```
sample-project/
├── index.html   — HTML structure; one page, five <section> views toggled by JS
├── styles.css   — all styles: design tokens, layout, 3D card flip, animations
├── script.js    — all logic: state, storage, shuffle, views, export/import
└── README.md    — this file
```

### Architecture decision: single-page vs. multiple HTML files

The app uses **one HTML file** with multiple `<section>` elements. Only one section has the `.active` class at a time; CSS `display: none` hides the rest. Advantages over separate pages:
- All JavaScript state stays alive in memory — no need to pass data via `sessionStorage` between page loads.
- One URL — no broken relative-path issues when opening from the filesystem.
- Simpler to reason about: the entire app is one small `state` object.

---

## Key concepts in the code

### State object (`script.js:27`)
All mutable data lives in one `state` object. This makes debugging straightforward: you always know where to look.

### sessionStorage (`script.js:88`)
Cards are saved with `sessionStorage.setItem()` after every change. Data persists across refreshes but is wiped when the tab closes — appropriate for a school environment with shared computers.

### Fisher–Yates shuffle (`script.js:110`)
The correct, unbiased shuffle algorithm. The common `arr.sort(() => Math.random() - 0.5)` trick is biased and should not be used in teaching.

### CSS 3D card flip (`styles.css:178`)
Five CSS properties work together:
1. `.card-scene` — sets `perspective` (camera distance).
2. `.card-inner` — sets `transform-style: preserve-3d` and a `transition`; adding `.flipped` rotates it 180°.
3. `.card-face` — both faces use `backface-visibility: hidden` so they disappear when facing away.
4. `.card-back` — starts pre-rotated 180° so it's hidden by default.

### Export / Import (`script.js:298 / 324`)
Export: `Blob` → `URL.createObjectURL` → hidden `<a>` click.
Import: `FileReader.readAsText` with an `onload` callback; result parsed as JSON.

### Event delegation (`script.js:398`)
The delete button uses one listener on the parent `<ul>` instead of a listener per card. This avoids memory leaks and works for dynamically-added elements.
