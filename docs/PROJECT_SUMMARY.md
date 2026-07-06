# Big Fat Family Tree — Project Summary

## What It Is

**Big Fat Family Tree** is a collaborative, spatial family history archive built for multiple generations — family stories and future histories to be stored. It's a Next.js web application that lets users visualize, document, and preserve a family's history through an interactive, canvas-based interface inspired by design tools like Miro and Figma.

---

## Core Features

### 1. Spatial Canvas (Primary Interface)
- Interactive, pan-and-zoom family tree visualization powered by **@xyflow/react**
- Nodes represent family members, edges represent relationships
- Auto-layout via **Dagre** (hierarchical graph layout) when position data is missing
- Responsive: desktop shows full canvas + side panels, mobile uses a bottom sheet
- Optional 3D "constellation" view (lazy-loaded, view-only)

### 2. Family Member Management
- Add, edit, and manage people with bilingual metadata (English + Arabic)
- Captures: names (given + family), gender, photos, relationships
- Soft delete support (`deleted_at` field)
- Person drawer: side panel for detailed editing without leaving the canvas
- Forms use **react-hook-form** + **zod** for type-safe validation

### 3. Relationship Tracking
- Defines connections between family members (parent-child, spousal, etc.)
- Relationship types, status, and visual ordering
- Supports complex family structures (remarriage, step-relations)

### 4. Bilingual Support
- Arabic (RTL) + English (LTR) as first-class citizens
- `dir="auto"` on all elements, typographic pairing tuned for both scripts
- Language toggle in top bar (ambient state)
- Uses **IBM Plex Sans Arabic** + **Inter** fonts

### 5. Authentication & Authorization
- Supabase Auth integration
- User profiles with role-based access (role field in profiles table)
- Admin panel for privileged operations
- Separate auth flow: `/login` and `/(auth)` routes

### 6. Transcripts Module
- Records family narratives: audio recordings + pasted Arabic transcript text
- In-app audio playback via signed URLs (private storage bucket)
- Extraction proposals (LLM-assisted structured data) planned — schema exists, pipeline not built yet

### 7. Command Palette (⌘K)
- Universal search + action runner
- Find any person, jump to transcript, execute commands
- Acts as the "everything bar"

### 8. Dark Mode + Custom Theming
- Light / dark / system themes with a switcher in the top bar (an "archive" parchment palette exists in CSS but is not yet exposed in the UI)
- Design tokens as CSS variables (oklch color space for perceptual uniformity)
- Fraunces Variable font for display (names, titles) + Inter for UI

### 9. Events Timeline
- Per-person life events (birth, marriage, migration, stories, custom) with fuzzy dates (year/decade/around)
- Editors and admins add and delete events from the person profile; viewers see a read-only timeline

---

## Tech Stack

| Layer | Technology | Why |
|-------|-----------|-----|
| **Framework** | Next.js 16 (App Router) | Full-stack React with Server Components, Server Actions |
| **Styling** | Tailwind CSS 4 + CSS Variables | Utility-first + semantic tokens |
| **UI Primitives** | shadcn/ui (Radix + Tailwind) | Accessible, themeable components (Dialog, Popover, Tabs, etc.) |
| **Canvas** | @xyflow/react | Best-in-class spatial graph visualization |
| **Graph Layout** | @dagrejs/dagre | Hierarchical auto-layout for family trees |
| **Motion** | framer-motion | Drawer slide-ins, transitions, animations |
| **Forms** | react-hook-form + zod | Type-safe form state without re-render storms |
| **Command Palette** | cmdk | Accessible command/search interface |
| **Drawers/Sheets** | Radix Dialog | Responsive sheet/modal surfaces |
| **Notifications** | sonner | Non-blocking toast notifications |
| **Database** | Supabase (PostgreSQL) | Auth, storage, Row-Level Security (RLS) policies |
| **3D Graphics** | Three.js + @react-three/fiber | Optional 3D visualization layer |
| **Language Support** | IBM Plex Sans Arabic + Inter | Native bilingual typography |
| **Rate Limiting** | Upstash Redis + Ratelimit | Login rate limiting |
| **Type Safety** | TypeScript strict | Full type coverage |
| **Testing** | Vitest | Unit/integration tests with Vitest UI |

---

## Architecture

```
app/
├── (auth)/           → Login flow, auth routes
├── api/              → API routes (internal, webhooks, etc.)
├── admin/            → Admin dashboard
├── person/           → Person detail pages
├── transcripts/      → Transcript listing/editing
└── page.tsx          → Main canvas view (requires auth)

components/
├── graph/            → Canvas, graph rendering (CanvasView)
├── forms/            → Person forms, relationship forms
├── person/           → Person card, avatar, details
├── admin/            → Admin UI
├── shell/            → TopBar, NavRail, MobileNav
├── ui/               → Primitives (Button, Dialog, Popover, etc.)
├── providers/        → Theme, Command, Auth providers
└── transcripts/      → Transcript components

lib/
├── graph/            → Transform people/relationships → nodes/edges
├── actions/          → Server Actions for mutations
├── db/               → Database queries
├── auth/             → Auth helpers
├── people/           → Person logic
├── supabase/         → Client/server Supabase setup
├── lang/             → Language utilities (ar/en)
├── validation/       → Zod schemas
├── ratelimit/        → Rate limiting logic
└── utils/            → Generic helpers
```

---

## Database Schema (Inferred)

| Table | Key Columns |
|-------|------------|
| **profiles** | id, role |
| **people** | id, slug, given_en, given_ar, family_name_en, family_name_ar, father_id, mother_id, gender, is_placeholder, photo_url, pos_x, pos_y, deleted_at |
| **relationships** | id, person_a_id, person_b_id, type, status, order_index |

---

## Key Design Principles (From REDESIGN.md)

1. **Spatial-first**: Canvas is primary; lists/forms are overlays on top (Miro model)
2. **Zero double-entry**: Each fact captured once; ambient state flows everywhere (URL + cookies)
3. **Conversational onboarding**: Adding a person = placing them on canvas, then enriching via drawer
4. **Bilingual native**: Arabic + English treated as equals, not afterthought

---

## Current State

### ✅ Implemented
- Login & authentication (password, magic link, reset)
- Canvas + node/edge rendering, drag-to-link with relationship chooser, canvas legend
- Person profiles, editing, quick-add, Inspector drawer
- Events timeline with add/delete (editor/admin)
- Transcripts: upload audio, paste Arabic text, in-app playback
- Admin: user role management, audit log
- Mobile bottom sheet for people list + mobile nav with palette search
- Bilingual UI (English/Arabic toggle via ⌘K palette)
- Theme system (light/dark/system switcher)
- Server Components + Server Actions, RLS on all tables

### 🚧 In Progress / Remaining
- LLM extraction pipeline (transcripts → structured proposals → review inbox)
- Radial focus mode (from the original design spec)
- Live multi-user canvas sync (planned: push-based updates)
- Free-tier stack migration (see the zero-cost stack plan)

---

## Recent Work

The project was recently redesigned from a traditional CRUD app to a **Miro-inspired spatial interface** (see `REDESIGN.md`). The foundation includes login, canvas, and person drawer — remaining surfaces (transcripts, admin) follow the same design patterns.

---

## What Makes This Special

- **Genealogy-native date handling**: events carry a date-precision field (exact, year, decade, before/after/around) — critical for family history
- **Bilingual from the ground up**: Not a bolt-on translation layer; Arabic and English are first-class citizens
- **Human-reviewed AI (planned)**: transcript extraction will propose structured data that family editors approve before it enters the tree
- **Built for the long haul**: Designed as a living archive for multiple generations — past family stories and future histories are both first-class citizens, not an afterthought
