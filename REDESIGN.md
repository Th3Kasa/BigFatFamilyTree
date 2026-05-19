# Family Tree — Miro-Inspired Redesign Spec

> **Status:** Foundation + login + canvas + person drawer implemented in this PR. Remaining surfaces (transcripts, admin) follow the same patterns documented below.

---

## 1. Design Philosophy

The product is a **collaborative spatial archive** of a family — not a CRUD app. Every redesign decision is anchored to four principles:

| Principle | What it means in practice |
|---|---|
| **Spatial-first** | The canvas is the primary surface. Lists, forms, and details live as overlays *on top of* the canvas, never as separate pages. Mental model = Miro/Figma. |
| **Zero double-entry** | Each fact is captured once. Selections, filters, audio context, language preference, and identity flow through the app as ambient state. Forms pre-populate from context. |
| **Conversational onboarding** | Adding a person ≠ filling a form. It's *placing them* on the canvas, then enriching them via a drawer, inline edits, and proposal cards. |
| **Bilingual native** | Arabic + English are first-class. `dir="auto"` everywhere, typographic pairing tuned for both scripts. Language toggle is ambient, not buried. |

---

## 2. Component Stack

| Layer | Library | Why |
|---|---|---|
| **Primitives** | shadcn/ui (Radix + Tailwind) | Owned source, accessible, infinitely themeable. No black-box CSS. |
| **Canvas** | @xyflow/react (already in repo) | Best-in-class spatial canvas; keep it. |
| **Auto-layout** | @dagrejs/dagre (already) | Hierarchical fallback when positions are null. Keep. |
| **Motion** | framer-motion | Drawer slide-ins, presence transitions, layout animation on canvas. |
| **Command palette** | cmdk | Universal ⌘K — find any person, jump to transcript, run action. The "everything bar". |
| **Drawers / sheets** | vaul (mobile) + Radix Dialog (desktop) | Bottom drawer on mobile, right sheet on desktop — the *same* component contract. |
| **Toasts** | sonner | Non-blocking confirmations. Async save state without modals. |
| **Icons** | lucide-react | Outlined, unified weight, no emoji. |
| **Forms** | react-hook-form + zod | Type-safe + zero re-render storm. Already idiomatic for shadcn. |
| **Date input** | react-day-picker (via shadcn Calendar) | Handles imprecise dates (year-only, decade-only) — critical for genealogy. |
| **A11y / focus** | Radix (built-in) | Focus trapping, ARIA, keyboard nav included. |
| **Theming** | CSS variables in `globals.css` | Dark/light + a custom "warm parchment" mode for archival feel. |

### Why not also…
- **react-query** — Server Components + actions already cover this. Adding it would double the mental model.
- **zustand** — Canvas state lives in React Flow + URL params. Form state in RHF. No need for a global store.
- **next-intl** — Existing simple `LangToggle` is fine; the project's bilingual model is binary (ar/en), not locale-rich.

---

## 3. Design Tokens

Defined as CSS variables in `app/globals.css`, consumed via Tailwind theme.

```css
:root {
  /* Neutrals — warm, not cold */
  --background:        oklch(0.99 0.005 80);   /* parchment */
  --foreground:        oklch(0.18 0.01 80);
  --muted:             oklch(0.96 0.008 80);
  --muted-foreground:  oklch(0.48 0.01 80);
  --border:            oklch(0.92 0.008 80);
  --input:             oklch(0.94 0.008 80);
  --ring:              oklch(0.65 0.16 50);

  /* Brand — burnished olive, citrus accent */
  --primary:           oklch(0.42 0.07 130);   /* olive */
  --primary-foreground: oklch(0.99 0 0);
  --accent:            oklch(0.78 0.14 75);    /* warm amber */
  --accent-foreground: oklch(0.18 0.01 80);

  /* Semantic */
  --destructive:       oklch(0.55 0.20 28);
  --success:           oklch(0.60 0.13 145);
  --warning:           oklch(0.72 0.15 70);

  /* Surface elevation — used for Miro-style floating panels */
  --surface-1:         oklch(1 0 0 / 0.92);
  --surface-2:         oklch(1 0 0 / 0.96);
  --shadow-floating:   0 1px 2px rgb(20 20 20 / 0.06), 0 8px 24px rgb(20 20 20 / 0.08);
  --shadow-deep:       0 1px 2px rgb(20 20 20 / 0.08), 0 12px 40px rgb(20 20 20 / 0.12);

  --radius: 0.75rem;
}

[data-theme="dark"] { /* full dark counterpart */ }
[data-theme="archive"] { /* high-contrast warm parchment for reading mode */ }
```

### Typography
- **UI**: `Inter Variable` (Latin) + `IBM Plex Sans Arabic` (Arabic). Fallback `system-ui`.
- **Display** (person names on canvas, page titles): `Fraunces Variable` — slight optical sizing, archival feel.
- Scale: 12 / 14 / 16 / 18 / 22 / 28 / 36 / 48 px. Anything else = wrong.

### Motion
- Snappy: 120ms ease-out for hover, focus
- Standard: 200ms ease-out for drawer open
- Spring: `damping: 30, stiffness: 300` for canvas node layout transitions

---

## 4. Anti-Double-Entry Architecture

This is the contract that makes the redesign feel intelligent.

### Ambient state — flows everywhere via URL + cookies
| State | Source | Consumers |
|---|---|---|
| **Selected person ID(s)** | `?p=<id>` URL param | Inspector drawer, "create related" buttons pre-fill `father_id`, transcript link button pre-fills `recorded_with` |
| **Language** | `lang` cookie | Forms render only the active language by default; the other is a collapsed "add translation" CTA |
| **Last-viewed transcript** | `lastTranscriptId` cookie | When opening a person, "Link audio" defaults to this transcript |
| **Viewport** | `profiles.canvas_viewport` (already exists) | Canvas restores zoom/pan per user |
| **User identity** | Supabase session | Name + avatar pre-fill on any "uploaded_by" / "actor_id" field |

### Form pre-fill rules (every form must obey)
1. **Creating a person from a selected node** → father/mother/family_name auto-populated from selection. User can override.
2. **Creating a person from a transcript** → `notes` pre-seeded with the relevant segment, `source_transcript_id` set on every event created.
3. **Adding an event** → `person_id` is locked to current context; date hints (from sibling birth dates) shown as ghost suggestions.
4. **Adding a relationship** → `person_a_id` is current context; `person_b_id` opens a search-as-you-type combobox (cmdk-style) over `people`.
5. **Uploading audio** → if user is currently viewing a person, `recorded_with` is auto-set to that person.

### Canvas as "form router"
Right-clicking a node opens a contextual menu:
- *Add child* → opens person drawer with `father_id` (or `mother_id`) pre-filled
- *Add spouse* → opens relationship drawer with `person_a_id` pre-filled
- *Add event* → opens event sub-drawer with `person_id` pre-filled
- *Link to transcript* → opens transcript picker; on select, sets `source_transcript_id` on subsequent events

The user **never types an ID, never re-selects a person they just clicked**, never re-enters a date already known to the system.

---

## 5. Information Architecture & Page Map

```
┌─────────────────────────────────────────────────────────┐
│                   Top bar (always)                      │
│  Logo │ Family · breadcrumb │ ⌘K Search │ Lang │ Avatar │
├──────┬──────────────────────────────────────────────────┤
│      │                                                  │
│  Nav │              Main surface                        │
│ rail │   (Canvas | List | Transcript | Admin)           │
│      │                                                  │
│      │                                                  │
└──────┴──────────────────────────────────────────────────┘
                                       ▲
                                       │
                          ┌────────────┴────────────┐
                          │  Inspector / Drawer     │
                          │  (overlays main)        │
                          └─────────────────────────┘
```

### 5.1 `/login` — Magic-link entry
**Layout:** centered split. Left = brand panel (illustrated tree mosaic, family name, language toggle, language-aware tagline). Right = form card.

**Components:**
- `Card` with elevated shadow
- `Input type="email"` with floating label
- `Button` — primary, full-width
- `Alert` for sent confirmation (replaces card content on success — *no separate page*)
- Mobile: stacks vertically, brand panel becomes a hero header (40vh)

**Interaction:**
- Submit → loading spinner inline → success state inline (no redirect, no toast — content swap)
- Resend link option after 30s
- "Use a different email" → resets to entry state

**Connects to:** `/auth/callback` → `/` (canvas)

### 5.2 `/` — The Canvas (primary surface)

**Layout:** full-bleed canvas with floating panels.

```
┌─────────────────────────────────────────────────┐
│ TopBar                                          │
├──┬──────────────────────────────────────────┬───┤
│LR│                                          │ ◐ │   ◐ = Inspector toggle
│  │           Canvas (React Flow)            │   │
│  │                                          │ ▣ │   ▣ = Minimap
│  │                                          │   │
│  │   ┌──────────────────────────────┐      │   │
│  │   │ Floating toolbar (Miro-dock) │      │   │
│  │   │  ⊕ select  ☉  ⤢  ⚙          │      │   │
│  │   └──────────────────────────────┘      │   │
│  │                              [Layout]  │   │
│  └──────────────────────────────────────────┘   │
└─────────────────────────────────────────────────┘
```

**Floating panels (all use `--shadow-floating` + `--surface-1` glass):**
- **LR — Left rail** (collapsible): groups (major families), filters (gender, has-photo, has-events, deleted), saved views
- **Toolbar dock** (bottom-center, Miro-style): select / add person / connect / pan / zoom / fit-to-view
- **Minimap** (bottom-right, like Miro)
- **Layout button** (top-right of canvas): "Auto-layout", "Save my arrangement", "Reset to auto"
- **Presence chip** (top-right): shows who else is viewing (real-time via Supabase Realtime — even if there's just one user, sets up the metaphor)
- **Inspector** (right sheet, optional, opens on node click): person summary, quick actions, recent events; expand → full profile drawer

**Node design (Miro card style):**
- Compact: 200×72 with avatar + name + dates
- Hovered: shows quick-action overlay (👁 view, ➕ add child, ⛓ link, ⋯ more)
- Selected: ring in `--accent`, brings inspector
- Placeholder (`is_placeholder`): dashed border, muted, "Add info" CTA inside

**Mobile (< 768px):**
- Canvas stays primary but adds bottom sheet for selection actions
- Floating toolbar collapses to a single FAB that expands
- Inspector becomes a vaul bottom drawer

**Connects to:** Any node → inspector → "Open full profile" → `/person/[id]` (as a drawer route via parallel routes, NOT a hard page nav)

### 5.3 `/person/[id]` — Profile (as parallel drawer route)

Implemented as a **Next.js parallel intercepting route** (`/@modal/(.)person/[id]`) so opening a person from the canvas slides in a drawer over the canvas, preserving spatial context. Direct URL navigation falls back to a full page.

**Drawer layout (desktop right-sheet, 480px / 600px expanded):**
```
┌─────────────────────────────────────┐
│ ◀ Back   Maamoun Morkos       ⋯  ✕  │
│ ────────────────────────────────── │
│  [Avatar 96px]                      │
│  Maamoun ibn Yousef ibn Ibrahim     │
│  Morkos · b. 1957 (Damascus)        │
│  ──────────────────────────────    │
│  [ Profile ] [ Events ] [ Relations ] [ Sources ]   ← tab bar
│  ──────────────────────────────    │
│  Inline editable fields, no labels  │
│  ──────────────────────────────    │
│  Events timeline (cards)            │
│  Relationships chips                │
│  Linked transcripts (audio cards)   │
│  ──────────────────────────────    │
│  [ Add event ] [ Add relation ] [ Link audio ]   ← persistent action row
└─────────────────────────────────────┘
```

**Editing:** every text field is in-place editable on click (Notion-style). Save on blur. Toast confirms. No "Edit" button needed for ~80% of cases — `/person/[id]/edit` becomes a fallback / mobile-friendly view.

**Tabs:**
- **Profile** — names (with translation toggle), gender, birth/death dates, photo, notes
- **Events** — timeline of events with imprecise-date support, add-event inline
- **Relations** — chips for spouse(s), children, parents; click chip → focus that node on canvas behind
- **Sources** — transcripts referenced + audio players inline

**Connects to:** action row → opens sub-drawer for that action; closing drawer returns to canvas with viewport preserved.

### 5.4 `/person/new` — Step-as-you-go, not a form
Triggered from canvas (`+` toolbar / right-click "Add child") OR command palette.

Single drawer with **3 quick steps** (progress dots, not stepper):
1. **Name** — given_en, given_ar, family_name. Father/mother auto-filled from context. *Submit-able here.*
2. **Photo + dates** (optional, skippable)
3. **Confirm position** — show preview of where they'll land on canvas; user can drag to reposition before final save

After save: drawer collapses, node animates in on canvas, toast offers "Add another", "Add their spouse", "Open profile".

### 5.5 `/person/[id]/edit` — Bulk-edit fallback
Same drawer as profile but in "form mode" — all fields rendered, validation visible, "Save changes" button. Used when user wants to edit many fields at once or needs validation. Most users will never hit this route; it exists for completeness + mobile-friendliness on small screens.

### 5.6 `/transcripts` — Split view (list + detail in one surface)

```
┌────────────────────────────┬─────────────────────────────┐
│  Transcripts               │   Selected transcript       │
│  ─────────────────────     │   ─────────────────────     │
│  🔍 Search                  │   ▶ Audio player (sticky)   │
│  Filter by person          │                             │
│  ─────────────────────     │   Segments timeline         │
│  📼 2024-03-12             │   ┌─────────────────────┐  │
│     Recorded with Maamoun  │   │ 0:00 — "Bismillah… "│  │
│  📼 2024-02-08             │   │ → mentions: Yousef  │  │
│     Recorded with Aida     │   └─────────────────────┘  │
│     [extracted: 4 events]  │                             │
│  📼 2023-11-22             │   Extraction proposals      │
│     ...                    │   (review queue)            │
└────────────────────────────┴─────────────────────────────┘
```

- Left pane (320px) is virtualised list (react-window if list grows large)
- Right pane shows selected; if none selected, shows upload prompt
- Mobile: left becomes a top sheet, right is the main view
- Selecting a transcript updates `?t=<id>` so refresh preserves selection

### 5.7 `/transcripts/new` — Upload as a drawer
Slides over `/transcripts`. Audio drop zone (huge, draggable), optional metadata (recorded_with — pre-filled from context if accessed from a person), language. On upload completion, drawer collapses, the new transcript becomes the selected one in split view, and a toast offers "Run extraction now".

### 5.8 `/transcripts/[id]` — Detail (same surface as split view)
Direct URL = split view with that ID pre-selected. The "page" and the "selected state" of `/transcripts` are the same component — *zero double-implementation*.

### 5.9 `/admin` — Compact dashboard
Cards in a bento-style grid: People count / Transcripts / Pending proposals / Recent audit events / Invite user / Manage roles. Each card is a self-contained tile that links to its action.

### 5.10 `/admin/audit` — Filterable log table
Data table (TanStack Table headless + shadcn `Table`). Filter row, time range picker, operation filter chips. Row click expands a `Drawer` showing `before` / `after` diff (using `react-diff-view`).

---

## 6. Navigation Patterns

### Top bar (universal)
- **Logo** — clickable, returns to canvas
- **Breadcrumb context** — "Family · Canvas" / "Family · Maamoun" / "Family · Transcripts · 2024-03-12"
- **⌘K Command palette** — universal search + action launcher (see §7)
- **Language toggle** — ar ⇄ en
- **Avatar menu** — profile, settings, sign out

### Nav rail (collapsible, persistent, desktop only)
Icon-only by default; expands on hover. Items: Canvas, Transcripts, Admin (role-gated), Trash (deleted people, role-gated).

Mobile: replaced by bottom tab bar (Canvas / Transcripts / Admin / Menu).

### Command palette (⌘K) — the productivity multiplier
- "Find person…" — fuzzy search across all `people`
- "Open transcript…" — fuzzy across `transcripts`
- "Add new person" → opens drawer
- "Switch language"
- "Auto-layout canvas"
- "Sign out"

Built on `cmdk`. Globally mounted in root layout.

---

## 7. Mobile-First Rules

| Pattern | Desktop | Mobile |
|---|---|---|
| Inspector | Right `Sheet` | Bottom `Drawer` (vaul) |
| Form | Inline / drawer | Full-screen sheet |
| List + Detail | Side-by-side | Stack, swipe back |
| Nav | Rail + top bar | Bottom tabs + top bar |
| Canvas toolbar | Floating dock | FAB that expands |
| Hover actions | Hover reveal | Long-press reveal |
| ⌘K palette | ⌘K key + button | Pull-down gesture from top bar |

Breakpoints: `sm 640`, `md 768`, `lg 1024`, `xl 1280` (Tailwind default). The drawer is the unifying primitive — every "page" can be a drawer on mobile.

---

## 8. Accessibility

- All Radix primitives are accessible by default; do not strip their props
- Focus rings: visible 2px `--ring` offset 2px on all interactive elements
- Color contrast: every text/background combo ≥ 4.5:1 (or 3:1 for ≥ 18px)
- Bilingual: `dir="auto"` on names + body text; never force LTR on Arabic content
- Keyboard: every action reachable; ⌘K opens palette; Esc closes any drawer; arrow keys navigate canvas selection
- Screen-reader: live region for toast messages; canvas nodes have ARIA labels

---

## 9. File-Level Implementation Map

```
app/
  globals.css              ← design tokens (rewritten)
  layout.tsx               ← top bar + nav rail + command palette + toaster (rewritten)
  page.tsx                 ← canvas page (rewritten)
  (auth)/login/page.tsx    ← login (rewritten)
  person/
    [id]/page.tsx          ← profile (rewritten, drawer-aware)
    [id]/edit/page.tsx     ← fallback edit form (lightly redesigned)
    new/page.tsx           ← step-as-you-go drawer (rewritten)
  @modal/                  ← NEW: parallel route slot
    (.)person/[id]/page.tsx ← intercepted drawer route
  transcripts/
    page.tsx               ← split view (rewritten)
    new/page.tsx           ← upload drawer
    [id]/page.tsx          ← thin wrapper around split view with selected id
  admin/
    page.tsx               ← bento dashboard
    audit/page.tsx         ← data table

components/
  ui/                      ← shadcn primitives (NEW: button, input, sheet, drawer, dialog, command, tooltip, avatar, badge, skeleton, separator, tabs, scroll-area, alert, popover, calendar, sonner, toggle, dropdown-menu)
  shell/                   ← NEW
    TopBar.tsx
    NavRail.tsx
    MobileNav.tsx
    CommandPalette.tsx
    Breadcrumb.tsx
    UserMenu.tsx
  canvas/                  ← rewrite of components/graph/
    Canvas.tsx
    FloatingToolbar.tsx
    MinimapPanel.tsx
    LayoutControls.tsx
    PresenceChip.tsx
    PersonNode.tsx
    NodeContextMenu.tsx
    Inspector.tsx
  person/                  ← NEW
    PersonDrawer.tsx
    PersonProfileView.tsx
    PersonNewStepper.tsx
    EventsTab.tsx
    RelationsTab.tsx
    SourcesTab.tsx
    InlineField.tsx
    PersonCombobox.tsx     ← used everywhere a person needs to be picked
  transcripts/             ← NEW
    TranscriptList.tsx
    TranscriptDetail.tsx
    AudioPlayer.tsx
    SegmentTimeline.tsx
    ProposalCard.tsx
    UploadDrawer.tsx
  admin/                   ← NEW
    BentoDashboard.tsx
    AuditTable.tsx
  forms/                   ← refactor existing
    PersonForm.tsx         ← becomes lean, RHF + zod
    RelationshipForm.tsx
    EventForm.tsx
    TranscriptForm.tsx
  providers/               ← NEW
    ThemeProvider.tsx
    ToastProvider.tsx
    CommandProvider.tsx
lib/
  utils.ts                 ← cn() helper (shadcn standard)
  hooks/
    useSelection.ts        ← reads ?p= URL param
    useLanguage.ts         ← reads lang cookie
    useCommandPalette.ts
  schemas/                 ← NEW — zod schemas matching DB types
    person.ts
    relationship.ts
    event.ts
    transcript.ts
```

### Server actions
**Untouched.** `/lib/actions/*` keeps its current contract. The redesign is purely client/UI. This is a deliberate constraint — the data layer is solid; we only change presentation.

---

## 10. Implementation Status (this PR)

✅ **Foundation** — deps installed, tokens defined, shadcn primitives generated, `lib/utils.ts`
✅ **Shell** — `layout.tsx` with TopBar + NavRail + CommandPalette + Toaster
✅ **Login** — redesigned `/login`
✅ **Canvas core** — new floating-toolbar Canvas component + Inspector
✅ **Person drawer** — `PersonDrawer`, inline editing, tab structure
✅ **Person new stepper** — `PersonNewStepper`
🚧 **Transcripts** — split-view spec ready, components scaffolded; full data wiring follows the same pattern as canvas
🚧 **Admin / audit** — bento + audit table scaffolded

Remaining work is mechanical (apply the same patterns) and can be dispatched as follow-up Sonnet/Haiku jobs using the file map in §9.
