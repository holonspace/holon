# Design System — shadcn/ui Cyan × Sharp

Inspired by: [shadcn/ui preset b1s91W1gW](https://ui.shadcn.com/create?preset=b1s91W1gW)  
Theme: `cyan` · Radius: `none` · Chart: `cyan`

---

## 1. Visual Theme & Atmosphere

This design system embodies **precision over decoration** — a financial-grade dashboard aesthetic where every element earns its place through clarity, not style. The philosophy is strict neutrality interrupted by a single, purposeful cyan accent. No gradients. No rounded corners. No decorative shadows.

The design language borrows from professional trading terminals and enterprise data tools: sharp geometry signals reliability, dense information hierarchy signals capability, and the restrained use of color ensures the data is always the hero — not the chrome around it.

**Dark mode is a first-class citizen.** The dark palette is not simply an inverted light mode — it uses a layered near-black system (`#0a0a0a` page → `#171717` cards → `#1f1f1f` muted surfaces) and shifts the primary cyan to a deeper tone (`#0e7490`) while using a brighter cyan (`#22d3ee`) for active sidebar states. Borders become white at 10% opacity rather than gray. The result is a dark theme that feels purpose-built for data-dense UIs, not a cosmetic afterthought.

**Key Characteristics:**
- **Zero border-radius** everywhere — corners are square, geometry is honest
- **Single accent color**: Cyan (light: `#0284c7` / dark: `#0e7490`) reserved for primary actions and active states
- **White canvas** (light) / **layered near-black** (dark) — maximum contrast, zero ambiguity
- **No box shadows** — depth comes from 1px borders and ring shadows only
- **Font Inter** — clean, screen-optimized, widely legible at dense information density
- **14px default** — compact and information-dense, not spacious
- Sidebar-driven navigation with a visually distinct background from the main content area

---

## 2. Color Palette & Roles

### Light Mode (Default)

| Role | CSS Variable | OKLCH | Approx Hex | Description |
|------|-------------|-------|------------|-------------|
| Background | `--background` | `oklch(1 0 0)` | `#ffffff` | Page background, pure white |
| Foreground | `--foreground` | `oklch(0.145 0 0)` | `#0a0a0a` | Primary text, near black |
| Card | `--card` | `oklch(1 0 0)` | `#ffffff` | Card surface, same as background |
| Card Foreground | `--card-foreground` | `oklch(0.145 0 0)` | `#0a0a0a` | Text inside cards |
| Popover | `--popover` | `oklch(1 0 0)` | `#ffffff` | Dropdown, tooltip bg |
| Popover Foreground | `--popover-foreground` | `oklch(0.145 0 0)` | `#0a0a0a` | Text in popovers |
| **Primary** | `--primary` | `oklch(0.52 0.105 223.128)` | `#0284c7` | Cyan — buttons, active states |
| Primary Foreground | `--primary-foreground` | `oklch(0.984 0.019 200.873)` | `#f0f9ff` | Text on cyan bg |
| Secondary | `--secondary` | `oklch(0.967 0.001 286.375)` | `#f5f5f5` | Secondary button bg, subtle fills |
| Secondary Foreground | `--secondary-foreground` | `oklch(0.21 0.006 285.885)` | `#1a1a1a` | Text on secondary |
| Muted | `--muted` | `oklch(0.97 0 0)` | `#f7f7f7` | Muted backgrounds, hover states |
| Muted Foreground | `--muted-foreground` | `oklch(0.556 0 0)` | `#737373` | Labels, captions, secondary text |
| Accent | `--accent` | `oklch(0.97 0 0)` | `#f7f7f7` | Hover highlight bg (= muted) |
| Accent Foreground | `--accent-foreground` | `oklch(0.205 0 0)` | `#1f1f1f` | Text on accent |
| Destructive | `--destructive` | `oklch(0.577 0.245 27.325)` | `#e40014` | Error, delete actions |
| Border | `--border` | `oklch(0.922 0 0)` | `#e5e5e5` | Dividers, outlines |
| Input | `--input` | `oklch(0.922 0 0)` | `#e5e5e5` | Input field borders |
| Ring | `--ring` | `oklch(0.708 0 0)` | `#a1a1a1` | Focus ring |
| Sidebar | `--sidebar` | `oklch(0.985 0 0)` | `#fafafa` | Sidebar background |
| Sidebar Foreground | `--sidebar-foreground` | `oklch(0.145 0 0)` | `#0a0a0a` | Sidebar text |
| Sidebar Primary | `--sidebar-primary` | `oklch(0.609 0.126 221.723)` | `#06b6d4` | Active nav item color |
| Sidebar Primary Fg | `--sidebar-primary-foreground` | `oklch(0.984 0.019 200.873)` | `#f0f9ff` | Text on active nav |
| Sidebar Accent | `--sidebar-accent` | `oklch(0.97 0 0)` | `#f7f7f7` | Nav item hover/active bg |
| Sidebar Accent Fg | `--sidebar-accent-foreground` | `oklch(0.205 0 0)` | `#1f1f1f` | Text on accent nav |
| Sidebar Border | `--sidebar-border` | `oklch(0.922 0 0)` | `#e5e5e5` | Sidebar right border |
| Sidebar Ring | `--sidebar-ring` | `oklch(0.708 0 0)` | `#a1a1a1` | Focus ring in sidebar |

### Dark Mode

| Role | CSS Variable | OKLCH | Approx Hex | Description |
|------|-------------|-------|------------|-------------|
| Background | `--background` | `oklch(0.145 0 0)` | `#0a0a0a` | Page bg, deepest layer |
| Foreground | `--foreground` | `oklch(0.985 0 0)` | `#fafafa` | Primary text, near white |
| Card | `--card` | `oklch(0.205 0 0)` | `#171717` | Card surface, one step up from bg |
| Card Foreground | `--card-foreground` | `oklch(0.985 0 0)` | `#fafafa` | Text inside cards |
| Popover | `--popover` | `oklch(0.205 0 0)` | `#171717` | Dropdown, tooltip bg |
| Popover Foreground | `--popover-foreground` | `oklch(0.985 0 0)` | `#fafafa` | Text in popovers |
| **Primary** | `--primary` | `oklch(0.45 0.085 224.283)` | `#0e7490` | Darker cyan for dark bg |
| Primary Foreground | `--primary-foreground` | `oklch(0.984 0.019 200.873)` | `#f0f9ff` | Text on primary button |
| Secondary | `--secondary` | `oklch(0.274 0.006 286.033)` | `#262626` | Secondary button bg |
| Secondary Foreground | `--secondary-foreground` | `oklch(0.985 0 0)` | `#fafafa` | Text on secondary |
| Muted | `--muted` | `oklch(0.269 0 0)` | `#1f1f1f` | Muted surface, slightly above bg |
| Muted Foreground | `--muted-foreground` | `oklch(0.708 0 0)` | `#a1a1a1` | Secondary text, captions |
| Accent | `--accent` | `oklch(0.269 0 0)` | `#1f1f1f` | Hover bg (= muted) |
| Accent Foreground | `--accent-foreground` | `oklch(0.985 0 0)` | `#fafafa` | Text on accent |
| Destructive | `--destructive` | `oklch(0.704 0.191 22.216)` | `#ff6568` | Brighter red for dark bg |
| Border | `--border` | `oklch(1 0 0 / 10%)` | `rgba(255,255,255,0.10)` | White 10% — all dividers |
| Input | `--input` | `oklch(1 0 0 / 15%)` | `rgba(255,255,255,0.15)` | White 15% — input borders |
| Ring | `--ring` | `oklch(0.556 0 0)` | `#737373` | Focus ring |
| Sidebar | `--sidebar` | `oklch(0.205 0 0)` | `#171717` | Sidebar bg = card bg |
| Sidebar Foreground | `--sidebar-foreground` | `oklch(0.985 0 0)` | `#fafafa` | Sidebar text |
| Sidebar Primary | `--sidebar-primary` | `oklch(0.715 0.143 215.221)` | `#22d3ee` | **Brighter** cyan — active nav |
| Sidebar Primary Fg | `--sidebar-primary-foreground` | `oklch(0.302 0.056 229.695)` | `#0c4a6e` | Text on active sidebar item |
| Sidebar Accent | `--sidebar-accent` | `oklch(0.269 0 0)` | `#1f1f1f` | Nav item hover/active bg |
| Sidebar Accent Fg | `--sidebar-accent-foreground` | `oklch(0.985 0 0)` | `#fafafa` | Text on accent nav |
| Sidebar Border | `--sidebar-border` | `oklch(1 0 0 / 10%)` | `rgba(255,255,255,0.10)` | Sidebar divider |
| Sidebar Ring | `--sidebar-ring` | `oklch(0.556 0 0)` | `#737373` | Focus ring in sidebar |

> **Critical dark mode insight:** In dark mode, the sidebar and cards share the same `#171717` background — separation comes from the white 10% border, not background contrast. Also, the active sidebar accent uses a **brighter** cyan (`#22d3ee`) compared to the primary action cyan (`#0e7490`) — the opposite relationship from light mode.

### Chart Palette (Cyan Scale — Same for Both Modes)

| Token | OKLCH | Approx Hex | Tailwind Equiv | Use |
|-------|-------|------------|----------------|-----|
| `--chart-1` | `oklch(0.865 0.127 207.078)` | `#67e8f9` | cyan-300 | Lightest — area fills, BG tints |
| `--chart-2` | `oklch(0.715 0.143 215.221)` | `#22d3ee` | cyan-400 | Light — secondary series |
| `--chart-3` | `oklch(0.609 0.126 221.723)` | `#06b6d4` | cyan-500 | Mid — primary chart color |
| `--chart-4` | `oklch(0.52 0.105 223.128)` | `#0284c7` | cyan-600 | Dark — emphasis |
| `--chart-5` | `oklch(0.45 0.085 224.283)` | `#0e7490` | cyan-700 | Darkest — max value bars |

---

## 3. Typography Rules

**Font Family:** `Inter, "Inter Fallback"` — single typeface for all contexts, both modes.

| Role | Size | Weight | Line Height | Letter Spacing | Use |
|------|------|--------|-------------|----------------|-----|
| Display Hero | 48px | 500 | 1.1 | 0 | Largest metric values (`$0.00`) |
| Metric Large | 30px | 600 | 1.2 | 0 | Key financials (`$420,000`) |
| Metric Medium | 24px | 600–700 | 1.2 | 0 | Secondary stats (`$2,500.00`) |
| Metric Small | 24px | 500 | 1.2 | 0 | Tertiary figures, dates |
| Body / UI | 14px | 400 | 1.43 | normal | Default: table cells, labels, nav |
| Body Emphasis | 14px | 500 | 1.43 | normal | Button labels, active items |
| Caption | 12px | 400 | 1.33 | normal | Badges, timestamps, micro-labels |
| Base | 16px | 400 | 1.5 | normal | Browser root only |

**Principles:**
- **14px is the workhorse** — dominates at 31 instances vs. 12px (8) and 16px (9)
- **No custom letter-spacing** — Inter runs at default tracking at all sizes
- **Weight range 400–700** — 400 for reading, 500 for interaction, 600/700 for display numbers only
- **Typography is mode-agnostic** — same sizes, weights, and rhythm in both light and dark

---

## 4. Component Styles

Each component lists light mode followed by its dark mode overrides.

### Button — Primary

```css
/* Light */
background:    var(--primary);           /* #0284c7 */
color:         var(--primary-foreground);/* #f0f9ff */
border-radius: 0px;
padding:       0 10px;
height:        32px;
font-size:     14px;
font-weight:   500;
border:        1px solid transparent;
transition:    background-color 150ms;
hover:         filter brightness(1.1);

/* Dark override */
background:    var(--primary);           /* #0e7490 — deeper cyan */
color:         var(--primary-foreground);/* #f0f9ff — unchanged */
```

### Button — Secondary

```css
/* Light */
background:    var(--secondary);         /* #f5f5f5 */
color:         var(--secondary-foreground); /* #1a1a1a */
border-radius: 0px;
padding:       0 10px;
height:        32px;
font-size:     14px;
font-weight:   500;
border:        1px solid transparent;

/* Dark override */
background:    var(--secondary);         /* #262626 */
color:         var(--secondary-foreground); /* #fafafa */
```

### Button — Ghost / Outline (e.g. "Cancel")

```css
/* Light */
background:    transparent;
color:         var(--foreground);        /* #0a0a0a */
border:        1px solid var(--border);  /* #e5e5e5 */
border-radius: 0px;
padding:       0 10px;
height:        32px;
font-size:     14px;

/* Dark override */
background:    rgba(255, 255, 255, 0.045); /* white 4.5% tint */
color:         var(--foreground);          /* #fafafa */
border:        1px solid rgba(255, 255, 255, 0.15); /* white 15% */
```

### Button — Icon (Square)

```css
/* Light */
background:    var(--muted);             /* #f7f7f7 */
color:         var(--foreground);
border-radius: 0px;
padding:       0;
height:        28px;
width:         28px;

/* Dark override */
background:    var(--muted);             /* #1f1f1f */
color:         var(--foreground);        /* #fafafa */
```

### Input / Select

```css
/* Light */
background:    transparent;
border:        1px solid var(--input);   /* #e5e5e5 */
border-radius: 0px;
padding:       4px 10px 4px 6px;
height:        32px;
font-size:     14px;
color:         var(--foreground);
focus-ring:    1px var(--ring);          /* #a1a1a1 */

/* Dark override */
border:        1px solid var(--input);   /* rgba(255,255,255,0.15) */
color:         var(--foreground);        /* #fafafa */
focus-ring:    1px var(--ring);          /* #737373 */
placeholder:   var(--muted-foreground);  /* #a1a1a1 */
```

### Card

```css
/* Light */
background:    var(--card);              /* #ffffff */
border-radius: 0px;
border:        none;
box-shadow:    0 0 0 1px oklch(0.145 0 0 / 0.10); /* black 10% ring */
padding-top:   16px;

/* Dark override */
background:    var(--card);              /* #171717 */
box-shadow:    0 0 0 1px oklch(1 0 0 / 0.10);     /* white 10% ring */
```

> **Key difference:** The card ring shadow inverts from black-10% (light) to white-10% (dark). This is what makes cards visible on their respective backgrounds while maintaining the "no visible border" aesthetic.

### Card Header

```css
/* Both modes */
padding:       0 16px 12px;
font-size:     14px;
font-weight:   500;
color:         var(--card-foreground);   /* #0a0a0a / #fafafa */
```

### Badge — Default

```css
/* Light */
background:    var(--secondary);         /* #f5f5f5 */
color:         var(--secondary-foreground); /* #1a1a1a */
border-radius: 0px;
padding:       2px 8px;
font-size:     12px;
font-weight:   500;

/* Dark override */
background:    var(--secondary);         /* #262626 */
color:         var(--secondary-foreground); /* #fafafa */
```

### Badge — Destructive / Alert

```css
/* Light */
background:    oklch(0.577 0.245 27.325 / 0.1); /* red 10% */
color:         var(--destructive);       /* #e40014 */

/* Dark override */
background:    oklch(0.704 0.191 22.216 / 0.15); /* brighter red 15% */
color:         var(--destructive);       /* #ff6568 */
```

### Badge — Outline

```css
/* Light */
background:    transparent;
color:         var(--foreground);
border:        1px solid var(--border);  /* #e5e5e5 */

/* Dark override */
border:        1px solid var(--border);  /* rgba(255,255,255,0.10) */
color:         var(--foreground);        /* #fafafa */
```

### Sidebar

```css
/* Light */
background:    var(--sidebar);           /* #fafafa — near-white, not white */
width:         ~180px;
border-right:  1px solid var(--sidebar-border); /* #e5e5e5 */
padding:       8px;

/* Dark override */
background:    var(--sidebar);           /* #171717 — same as card */
border-right:  1px solid var(--sidebar-border); /* rgba(255,255,255,0.10) */
```

```css
/* Nav Item — Both modes */
height:        32px;
padding:       0 8px;
border-radius: 0px;
font-size:     14px;
color:         var(--sidebar-foreground);

/* Active Nav Item — Light */
background:    var(--sidebar-accent);    /* #f7f7f7 */
color:         var(--sidebar-primary);   /* #06b6d4 */
font-weight:   500;

/* Active Nav Item — Dark */
background:    var(--sidebar-accent);    /* #1f1f1f */
color:         var(--sidebar-primary);   /* #22d3ee — BRIGHTER cyan in dark */
font-weight:   500;
```

### Avatar

```css
/* Both modes */
width:         32px;
height:        32px;
border-radius: 50%;

/* Light */
background:    var(--muted);             /* #f7f7f7 */

/* Dark */
background:    var(--muted);             /* #1f1f1f */
```

### Data Table

```css
/* Both modes — base */
font-size:     14px;
border:        none (outer);

/* Row */
border-bottom: 1px solid var(--border);  /* #e5e5e5 / rgba(255,255,255,0.10) */
height:        36–40px;

/* Header */
font-weight:   500;
font-size:     12px;
color:         var(--muted-foreground);  /* #737373 / #a1a1a1 */

/* Hover row */
background:    var(--muted);             /* #f7f7f7 / #1f1f1f */
```

### Separator / Divider

```css
/* Light */
background:    var(--border);            /* #e5e5e5 */
height:        1px;

/* Dark */
background:    var(--border);            /* rgba(255,255,255,0.10) */
```

---

## 5. Layout Principles

### Spacing Scale
Base unit: **4px** — applies identically in both modes.

| Token | Value | Use |
|-------|-------|-----|
| 1 | 4px | Icon gaps, micro spacing |
| 2 | 8px | Compact padding, nav item gaps |
| 3 | 12px | Card section gaps |
| 4 | 16px | Card padding, standard spacing |
| 5 | 20px | Component separation |
| 6 | 24px | Section spacing |
| 8 | 32px | Large section gaps |

### Grid System
- **Sidebar layout**: Fixed sidebar (~180px) + fluid main content
- **Card grid**: 2–4 column responsive CSS Grid within main content
- **Dashboard widgets**: `grid-template-columns: repeat(auto-fill, minmax(280px, 1fr))`
- **Max content width**: No enforced max — fills available space after sidebar
- Gap between cards: **12–16px**

### Whitespace Philosophy
- **Information density over breathing room** — cards are tight, padding is conservative
- **Cards use 16px padding** — not generous, but readable
- **32px height** for all interactive elements (buttons, inputs, nav items)
- **Sections use borders, not gaps** — 1px border creates hierarchy without large spacing

### Dark Mode Layout Notes
- Background `#0a0a0a` is the deepest layer — no content sits here directly
- Cards at `#171717` float on top of the background — the white 10% ring shadow creates the boundary
- Sidebar at `#171717` (same as card) — differentiated from page only by its positional role
- Muted surfaces at `#1f1f1f` — used for hover states, icon buttons, table rows

### Border Radius Scale

| Value | Use |
|-------|-----|
| **0px** | Everything — buttons, inputs, cards, badges, modals, tables, selects |
| **50%** | Circle avatars only |

> Zero-radius is the foundational identity. Never use `rounded-*` on any rectangular element.

---

## 6. Depth & Elevation

### Light Mode

| Level | Tailwind / CSS | Use |
|-------|---------------|-----|
| Page (0) | `bg-background` | Page canvas |
| Surface (1) | `bg-card` + `shadow-[0_0_0_1px_oklch(0.145_0_0/0.10)]` | Cards — black 10% ring |
| Dropdown (2) | `bg-popover` + `shadow-[0_4px_12px_rgba(0,0,0,0.08)]` | Popovers, select panels |
| Modal (3) | `bg-card` + `shadow-[0_8px_24px_rgba(0,0,0,0.12)]` + `bg-black/50` overlay | Dialogs |
| Focus | `outline-ring/50 ring-ring` | Keyboard nav |

### Dark Mode

| Level | Tailwind / CSS | Use |
|-------|---------------|-----|
| Page (0) | `bg-background` | Deepest canvas — auto resolves `#0a0a0a` |
| Surface (1) | `bg-card` + `shadow-[0_0_0_1px_oklch(1_0_0/0.10)]` | Cards — white 10% ring |
| Muted Surface | `bg-muted` | Hover bg, icon buttons, table rows |
| Dropdown (2) | `bg-popover` + `shadow-[0_4px_16px_rgba(0,0,0,0.4)]` | Popovers — heavier shadow |
| Modal (3) | `bg-card` + `shadow-[0_8px_32px_rgba(0,0,0,0.6)]` + `bg-black/70` | Dialogs |
| Focus | `outline-ring/50 ring-ring` | Same class, dark value auto-resolves |

**Shadow Philosophy:**
- Cards never use traditional drop shadows — they use a **1px ring shadow** that acts like a hairline border
- In light mode the ring is `black 10%`; in dark mode it flips to `white 10%`
- Dropdown/modal shadows are heavier in dark mode (0.4–0.6 opacity) because `#171717` on `#0a0a0a` needs more separation

---

## 7. Do's and Don'ts

### Do
- Use `border-radius: 0` on all rectangular elements — zero radius is the defining identity
- Reserve cyan for primary CTAs (light: `#0284c7` / dark: `#0e7490`) and active sidebar (light: `#06b6d4` / dark: `#22d3ee`)
- Use `1px solid var(--border)` for separation — in light: `#e5e5e5`, in dark: `rgba(255,255,255,0.10)`
- Use 14px for all UI text; 12px for captions/badges; 24px+ only for display numbers
- Rely on font-weight (500 vs 400) rather than size to establish hierarchy
- Apply `var(--muted-foreground)` for secondary labels — light: `#737373`, dark: `#a1a1a1`
- Use the card ring shadow pattern (`0 0 0 1px`) — it adjusts automatically via CSS variables
- Test both modes after every component — the color relationships are intentionally different

### Don't
- Don't add border-radius to buttons, inputs, cards, or badges — 0px is intentional
- Don't introduce new accent colors — cyan is the only hue in the system
- Don't use gradients anywhere — all backgrounds are solid colors only
- Don't use `font-weight: 700` outside of metric display numbers
- Don't use `#0284c7` as the primary in dark mode — use `#0e7490` (the dark primary is darker, not lighter)
- Don't use `#f7f7f7` (light muted) for hover states in dark mode — use `#1f1f1f`
- Don't use opaque gray borders in dark mode — use `rgba(255,255,255,0.10)`, not `#e5e5e5`
- Don't omit the ring shadow on cards — without it, white cards on white bg and dark cards on dark bg disappear
- Don't mix warm and neutral grays — the palette is purely achromatic with one cyan accent

---

## 8. TailwindCSS Color Usage — Strict Rules

> **This section is mandatory.** All agents and developers MUST follow these rules when writing Tailwind classes.

### How Variables Are Wired

This project uses **Tailwind v4** with `@theme inline` in `globals.css`. Every CSS variable (`--primary`, `--border`, etc.) is mapped to a Tailwind color token (`--color-primary`, `--color-border`, etc.). This means you write semantic token names directly as Tailwind utility classes — **no `var()` wrapper needed.**

```css
/* globals.css — @theme inline maps CSS vars to Tailwind tokens */
@theme inline {
  --color-primary:    var(--primary);
  --color-background: var(--background);
  --color-border:     var(--border);
  /* ... all tokens mapped this way */
}
```

### Rule 1 — No Hardcoded Colors, Ever

**NEVER** write hardcoded color values in Tailwind classes — no hex, rgb, oklch, named colors, or Tailwind palette scales.

```html
<!-- ❌ FORBIDDEN — hardcoded hex -->
<div class="bg-[#0284c7] text-[#ffffff] border-[#e5e5e5]">

<!-- ❌ FORBIDDEN — Tailwind color scale (bypasses the design system) -->
<div class="bg-cyan-600 text-white border-neutral-200">

<!-- ❌ FORBIDDEN — raw oklch arbitrary value -->
<div class="bg-[oklch(0.52_0.105_223.128)]">

<!-- ✅ CORRECT — semantic token, auto adapts to light/dark -->
<div class="bg-primary text-primary-foreground border-border">
```

### Rule 2 — Use the Semantic Token Directly

All defined tokens are available as Tailwind utility classes. Reference them by name:

| Need | Tailwind Class |
|------|---------------|
| Page background | `bg-background` |
| Card surface | `bg-card` |
| Popover / dropdown bg | `bg-popover` |
| Primary button | `bg-primary text-primary-foreground` |
| Secondary button | `bg-secondary text-secondary-foreground` |
| Muted surface / hover | `bg-muted` |
| Body text | `text-foreground` |
| Secondary / label text | `text-muted-foreground` |
| Card text | `text-card-foreground` |
| Divider / border | `border-border` |
| Input border | `border-input` |
| Focus ring | `ring-ring` |
| Destructive / error | `bg-destructive text-destructive` |
| Sidebar background | `bg-sidebar` |
| Sidebar active item | `text-sidebar-primary bg-sidebar-accent` |
| Chart color 1–5 | `fill-chart-1` … `fill-chart-5` |

### Rule 3 — Opacity Modifier on Tokens Is Allowed

Tailwind's `/opacity` modifier works natively with semantic tokens:

```html
<!-- ✅ Opacity modifier — correct and encouraged -->
<div class="bg-primary/10">          <!-- 10% primary fill -->
<div class="ring-ring/50">           <!-- 50% opacity ring -->
<div class="bg-destructive/20">      <!-- destructive tint -->
<div class="hover:bg-muted/50">      <!-- hover muted at 50% -->
```

```html
<!-- ❌ Never add opacity to hardcoded values -->
<div class="bg-[#0284c7]/10">
```

### Rule 4 — When No Token Exists, Define One in `globals.css` First

If the design requires a color with no existing token (e.g. a status color, a custom overlay), follow this two-step process:

**Step 1 — Add the variable to `globals.css` under both `:root` and `.dark`:**

```css
/* globals.css */
:root {
  --status-success: oklch(0.65 0.15 145);
  --status-warning: oklch(0.75 0.15 80);
}

.dark {
  --status-success: oklch(0.72 0.17 145);
  --status-warning: oklch(0.80 0.15 80);
}
```

**Step 2 — Map it in `@theme inline`:**

```css
@theme inline {
  --color-status-success: var(--status-success);
  --color-status-warning: var(--status-warning);
}
```

**Step 3 — Use the token in Tailwind:**

```html
<!-- ✅ New token defined → used as semantic class -->
<span class="bg-status-success/10 text-status-success">Active</span>
```

> Always define **both** `:root` and `.dark` variants. A token with no dark value is incomplete.

### Rule 5 — Dark Mode via CSS Variables, Not `dark:` Color Prefix

The `.dark` class on `<html>` automatically resolves all CSS variables to their dark values. Do **not** override colors with Tailwind's `dark:` prefix — the variable handles it.

```html
<!-- ❌ WRONG — duplicates logic already in the variable system -->
<div class="bg-white dark:bg-[#171717] text-black dark:text-white">

<!-- ✅ CORRECT — variable resolves automatically in both modes -->
<div class="bg-card text-card-foreground">
```

> `dark:` prefix is acceptable for **non-color** properties only (e.g. `dark:shadow-lg`, `dark:opacity-80`).

### Quick Reference Cheatsheet

```
✅ bg-background          ❌ bg-white / bg-neutral-950 / bg-[#0a0a0a]
✅ bg-card                ❌ bg-[#ffffff] / bg-[#171717]
✅ bg-primary             ❌ bg-cyan-600 / bg-[#0284c7]
✅ text-foreground        ❌ text-black / text-[#0a0a0a]
✅ text-muted-foreground  ❌ text-neutral-500 / text-[#737373]
✅ border-border          ❌ border-neutral-200 / border-[#e5e5e5]
✅ bg-primary/10          ✅ opacity modifier on token is fine
✅ bg-status-success      ✅ custom token — if defined in globals.css first
```

---

## 9. Responsive Behavior

| Breakpoint | Width | Behavior |
|------------|-------|----------|
| Mobile | < 640px | Sidebar collapses to overlay/drawer, single-column card grid |
| Tablet | 640px–1024px | Sidebar icon-only or hidden, 2-col cards |
| Desktop | 1024px–1280px | Full sidebar + 3-col grid |
| Wide | > 1280px | Full sidebar + 4-col grid, denser layout |

### Touch Targets
- All interactive elements: minimum **32px height**
- Icon buttons: **28px** (supplement with adequate touch padding)
- Table rows: **36–40px** for comfortable touch

### Typography Scaling
- Display numbers (30–48px) → reduce to 24–32px on mobile
- 14px body/UI text holds at all breakpoints
- Card padding: 16px desktop → 12px mobile

### Navigation
- Desktop: persistent left sidebar, ~180px wide
- Tablet: collapsible sidebar with toggle
- Mobile: bottom drawer or hamburger → full-screen overlay

---

## 9. Agent Prompt Guide

### Quick Color Reference

**Light Mode**
```
Primary cyan:      #0284c7  (oklch 0.52 0.105 223.128)
Background:        #ffffff
Card:              #ffffff
Muted bg:          #f7f7f7
Foreground:        #0a0a0a
Muted text:        #737373
Border:            #e5e5e5  (1px)
Sidebar bg:        #fafafa
Active nav:        #06b6d4  cyan
Destructive:       #e40014
```

**Dark Mode**
```
Primary cyan:      #0e7490  (oklch 0.45 0.085 224.283)
Background:        #0a0a0a
Card:              #171717
Muted bg:          #1f1f1f
Foreground:        #fafafa
Muted text:        #a1a1a1
Border:            rgba(255,255,255,0.10)
Sidebar bg:        #171717  (same as card)
Active nav:        #22d3ee  brighter cyan
Destructive:       #ff6568
```

**Shared**
```
Radius:            0px (none, everywhere)
Chart scale:       #67e8f9 → #22d3ee → #06b6d4 → #0284c7 → #0e7490
Font:              Inter
Base UI size:      14px
```

### Example Component Prompts

- **"Create a metric card"**
  Light: white card, `box-shadow: 0 0 0 1px rgba(0,0,0,0.10)`, 0px radius, 16px padding. Header: 12px muted label `#737373`. Body: 30px weight-600 number `#0a0a0a`. Footer: 12px badge on `#f5f5f5`.
  Dark: card bg `#171717`, `box-shadow: 0 0 0 1px rgba(255,255,255,0.10)`. Same structure, all text `#fafafa`, muted `#a1a1a1`, badge bg `#262626`.

- **"Build a data table"**
  14px Inter, no outer border. Row border-bottom: `1px solid #e5e5e5` (light) / `rgba(255,255,255,0.10)` (dark). Header: 12px weight-500 muted text. Hover row: `#f7f7f7` (light) / `#1f1f1f` (dark). 36px row height.

- **"Design sidebar navigation"**
  Light: `#fafafa` bg, `1px solid #e5e5e5` right border. Dark: `#171717` bg, `1px solid rgba(255,255,255,0.10)` right border. Nav items: 32px height, 0px radius, 14px. Active: cyan text (`#06b6d4` light / `#22d3ee` dark), muted-bg background.

- **"Create a bar chart"**
  Cyan scale bars: `#0284c7` primary, `#06b6d4` secondary, `#67e8f9` lightest fill. No rounded bar tops. Grid lines: `#e5e5e5` (light) / `rgba(255,255,255,0.10)` (dark). Labels: 12px muted-foreground. Chart palette is the same in both modes.

- **"Build a form section"**
  Inputs: 32px height, 0px radius, border `#e5e5e5` (light) / `rgba(255,255,255,0.15)` (dark), 14px Inter, transparent bg. Submit button: primary cyan, 32px height, 0px radius, 10px horizontal padding. Labels: 14px weight-500.

- **"Design a full dashboard layout"**
  Left sidebar ~180px. Light: sidebar `#fafafa`, content `#ffffff`. Dark: sidebar `#171717`, page bg `#0a0a0a`, cards `#171717` (distinguished by ring shadow only). Card grid: auto-fill, ~280px min, 12–16px gap. All cards: 0px radius, ring shadow.

### Iteration Guide
1. **Zero radius everywhere** — `border-radius: 0` on all rectangular elements, no exceptions
2. **One hue, two tones** — cyan `#0284c7` (light primary) and `#0e7490` (dark primary) — never introduce new colors
3. **Borders are white in dark mode** — always `rgba(255,255,255,0.10)`, never a gray hex
4. **Card ring shadow is the depth system** — black-10% in light, white-10% in dark
5. **Active sidebar cyan is brighter in dark** — `#22d3ee` (dark) vs `#06b6d4` (light) — intentional inversion
6. **14px default, no deviations for labels** — only go larger for display numbers, smaller for captions
7. **Monochromatic charts** — always the same 5-step cyan scale regardless of mode
8. **Muted backgrounds layer** — dark mode has three levels: `#0a0a0a` → `#171717` → `#1f1f1f`
