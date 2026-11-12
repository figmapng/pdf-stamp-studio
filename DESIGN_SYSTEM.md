# PDF Stamp Studio — Design System (`DESIGN_SYSTEM.md`)

**Version:** 1.0.0  
**Product Category:** Enterprise Legal / Financial Document Processing SaaS  
**Visual Direction:** Minimalist, precise, trustworthy, high-contrast Light-first Studio  
**Source of Truth:** This document governs every token, icon, primitive, domain widget, and screen in `src/`.

---

## 1. Visual Direction & Principles

1. **Document-First Hierarchy**: Document previews, signature zones, and validation alerts take priority over chrome. Surfaces use cool neutral paper/slate tones (`#F8FAFC` canvas, `#FFFFFF` cards) so blue/indigo signatures, emerald confirmations, and crimson warnings read unmistakably.
2. **Precision & Restraint**: Sharp, disciplined geometry (`6px`/`8px`/`12px` radii), hairline borders (`1px solid #E2E8F0`), zero gratuitous gradients, zero decorative blobs, and tabular numerals (`tabular-nums`) for coordinates, percentages, page counts, and file sizes.
3. **Safety-First Semantics**: Ambiguous, missing, or cryptographically signed states use distinct icon + text + semantic color (never color alone, conforming to WCAG 1.4.1).
4. **Light Theme Default**: High-contrast light surfaces ensure crisp legibility of dark PDF ink, blue stamps, and black/blue signatures.

---

## 2. Design Tokens

All tokens are defined in [src/styles/tokens.css](src/styles/tokens.css) and mapped to Tailwind CSS v4 utilities. Arbitrary hex colors, ad-hoc spacing, or custom shadows outside these tokens are forbidden.

### 2.1 Color Tokens

| Role | Token | Hex Value | Usage |
| :--- | :--- | :--- | :--- |
| **Background / Canvas** | `--color-bg-canvas` | `#F8FAFC` | Application viewport background |
| **Surface / Card** | `--color-bg-surface` | `#FFFFFF` | Cards, panels, modals, tables |
| **Surface / Subtle** | `--color-bg-subtle` | `#F1F5F9` | Table headers, secondary containers, tabs list |
| **Surface / Muted** | `--color-bg-muted` | `#E2E8F0` | Disabled backgrounds, progress tracks |
| **Text / Primary** | `--color-text-primary` | `#0F172A` | Headings, body copy, table values (contrast ≥ 15:1 on white) |
| **Text / Secondary** | `--color-text-secondary` | `#475569` | Descriptions, form hints, secondary metadata (contrast ≥ 7:1) |
| **Text / Muted** | `--color-text-muted` | `#64748B` | Captions, placeholders, disabled labels (contrast ≥ 4.5:1) |
| **Primary Brand** | `--color-primary` | `#4338CA` | Primary CTA buttons, active navigation, Person A accent |
| **Primary Hover** | `--color-primary-hover` | `#3730A3` | Primary hover state |
| **Primary Subtle** | `--color-primary-subtle` | `#EEF2FF` | Selected rows, active callouts, Person A overlay tint |
| **Secondary** | `--color-secondary` | `#1E293B` | High-contrast secondary actions, header brand mark |
| **Secondary Hover** | `--color-secondary-hover` | `#0F172A` | Secondary hover state |
| **Success** | `--color-success` | `#047857` | `AUTO_READY`, `COMPLETED`, Person B signature accent |
| **Success Subtle** | `--color-success-subtle` | `#ECFDF5` | Verified badges, local-only privacy pill |
| **Warning** | `--color-warning` | `#B45309` | `REVIEW_REQUIRED`, cryptographic signature caution |
| **Warning Subtle** | `--color-warning-subtle` | `#FFFBEB` | Review banners, caution cards |
| **Danger / Destructive** | `--color-danger` | `#BE123C` | `BLOCKED`, `FAILED`, Stamp overlay accent, destructive CTAs |
| **Danger Subtle** | `--color-danger-subtle` | `#FFF1F2` | Error banners, blocked badges |
| **Border / Default** | `--color-border-default` | `#CBD5E1` | Inputs, interactive borders (≥ 3:1 non-text contrast) |
| **Border / Subtle** | `--color-border-subtle` | `#E2E8F0` | Cards, dividers, table rows |
| **Focus Ring** | `--color-focus-ring` | `#4338CA` | `3px` solid outline with `2px` offset on `:focus-visible` |

### 2.2 Typography Scale & Weights

- **Font Sans**: `'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif`
- **Font Mono**: `'JetBrains Mono', ui-monospace, SFMono-Regular, Menlo, monospace` (for coordinates, byte sizes, error codes)

| Token | Size / Line-Height | Weight | Tracking | Usage |
| :--- | :--- | :--- | :--- | :--- |
| `--text-display` | `1.5rem` (`24px`) / `1.25` | `700` | `-0.02em` | Showcase / Hero headings |
| `--text-h1` | `1.25rem` (`20px`) / `1.3` | `700` | `-0.015em` | Page section headings |
| `--text-h2` | `1rem` (`16px`) / `1.4` | `600` | `-0.01em` | Card & panel titles |
| `--text-h3` | `0.875rem` (`14px`) / `1.45` | `600` | `0` | Sub-section headers, fieldset legends |
| `--text-body` | `0.875rem` (`14px`) / `1.5` | `400` | `0` | Standard prose, table cells, form inputs |
| `--text-caption` | `0.75rem` (`12px`) / `1.4` | `500` | `0.01em` | Labels, helper text, metadata, badges |
| `--text-micro` | `0.6875rem` (`11px`) / `1.3` | `600` | `0.02em` | Overlay tags, table column headers |

### 2.3 Spacing Scale (4px Base Grid)

`--space-1` (`4px`), `--space-2` (`8px`), `--space-3` (`12px`), `--space-4` (`16px`), `--space-5` (`20px`), `--space-6` (`24px`), `--space-8` (`32px`), `--space-10` (`40px`), `--space-12` (`48px`).

### 2.4 Border Radius, Borders & Shadows

- **Radii**: `--radius-sm` (`6px` — inputs, small badges), `--radius-md` (`8px` — buttons, inner tiles), `--radius-lg` (`12px` — cards, dialogs), `--radius-full` (`9999px` — status pills, switches).
- **Borders**: `--border-hairline: 1px solid var(--color-border-subtle)`, `--border-control: 1px solid var(--color-border-default)`, `--border-dashed: 2px dashed var(--color-border-default)`.
- **Shadows**:
  - `--shadow-xs`: `0 1px 2px 0 rgb(15 23 42 / 0.05)`
  - `--shadow-sm`: `0 2px 6px -1px rgb(15 23 42 / 0.08)`
  - `--shadow-md`: `0 10px 25px -5px rgb(15 23 42 / 0.12)`
  - `--shadow-modal`: `0 20px 45px -12px rgb(15 23 42 / 0.25)`

### 2.5 Focus Rings, Motion, Breakpoints & Z-Index

- **Focus Ring**: `outline: 3px solid var(--color-focus-ring); outline-offset: 2px;` on `:focus-visible`.
- **Animation Durations**: `--duration-fast: 120ms`, `--duration-normal: 200ms`, `--duration-slow: 300ms` (all wrapped/respected under `prefers-reduced-motion: reduce`).
- **Breakpoints**: `sm: 640px`, `md: 768px`, `lg: 1024px`, `xl: 1280px`.
- **Z-Index Layers**:
  - `z-base`: `0`
  - `z-sticky`: `10` (sticky table columns/headers)
  - `z-dropdown`: `30` (popovers, dropdown menus, tooltips)
  - `z-toast`: `50` (live toast notifications)
  - `z-modal`: `60` (top-layer native `<dialog>` & sheets)

---

## 3. Icon System (`lucide-react` Exclusively)

- **Library**: `lucide-react` only. No emojis or secondary icon sets.
- **Standard Sizes**:
  - `xs` (`14px` / `h-3.5 w-3.5`): inline badges, table buttons, helper indicators
  - `sm` (`16px` / `h-4 w-4`): standard buttons, inputs, toolbar actions
  - `md` (`20px` / `h-5 w-5`): card headers, alert icons, navigation brand
  - `lg` (`32px`–`40px` / `h-8 w-8`–`h-10 w-10`): `EmptyState` and `FileUploader` dropzones
- **Stroke Width**: Standard `1.75` (`strokeWidth={1.75}`) for crisp rendering on high-DPI displays.
- **Accessibility**: Decorative icons inside labeled buttons always carry `aria-hidden="true"`. Standalone `IconButton` controls must pass an explicit `aria-label`.

---

## 4. Standardized Component Inventory (30 Components)

### 4.1 Base UI Primitives (`src/components/ui/`)

| Component | Variants / Sizes | Accessibility & States |
| :--- | :--- | :--- |
| `Button` | Variants: `primary`, `secondary`, `outline`, `ghost`, `destructive`, `success`; Sizes: `sm` (`36px`), `md` (`40px`), `lg` (`44px`) | `:focus-visible` ring, `disabled`, `isLoading` spinner + `aria-busy` |
| `IconButton` | Same variants; square `36px`/`40px`/`44px` minimum target | Mandatory `aria-label`, optional `Tooltip` hint, `aria-pressed` for toggles |
| `Input` | Sizes: `sm`, `md`; optional leading icon & error state | `<label htmlFor>`, `aria-invalid`, `aria-describedby` error/hint linkage |
| `Textarea` | Resizable vertical, monospace optional | Same label/error ARIA contract as `Input` |
| `Select` | Styled native `<select>` for crisp platform & keyboard reliability | Explicit `id`/`aria-invalid`, consistent height & border tokens |
| `Checkbox` | Standard `16px` box inside ≥`24px` clickable row | Native `<input type="checkbox">` + `<label htmlFor>` |
| `RadioGroup` | `RadioGroup` + `RadioGroupItem` (`<fieldset>`/`<legend>` + native radios) | Card-style or inline layout, full arrow-key & Tab support |
| `Switch` | Accessible Radix `Switch` (`sm` / `md`) | `role="switch"`, `aria-checked`, label pairing |
| `Badge` | Variants: `neutral`, `primary`, `success`, `warning`, `danger` | High-contrast pill with optional leading icon |
| `Card` | `Card`, `CardHeader`, `CardTitle`, `CardDescription`, `CardContent`, `CardFooter` | Surface `#FFFFFF`, `1px` border, `12px` radius |
| `Dialog` | Native `<dialog>` modal (`showModal()`) | `overscroll-behavior: contain`, `Esc` dismissal, focus restoration |
| `AlertDialog` | Native `<dialog>` destructive/confirmation modal | `autofocus` on safe cancel button, explicit `returnValue` reset |
| `Sheet` | Slide-over panel (right/left) built on native `<dialog>` | Top-layer inert backdrop, visible close `IconButton` |
| `DropdownMenu` | Radix `DropdownMenu` (`Trigger`, `Content`, `Item`, `Separator`) | Arrow-key navigation, `z-dropdown`, `Esc` dismissal |
| `Tooltip` | Radix `Tooltip` (`Provider`, `Trigger`, `Content`) | Delay `250ms`, keyboard focus + hover, `Esc` dismissible |
| `Popover` | Radix `Popover` (`Trigger`, `Content`) | Anchored contextual panel with focus containment |
| `Tabs` | Radix `Tabs` (`TabsList`, `TabsTrigger`, `TabsContent`) | Active underline + background (non-color indicator), keyboard arrows |
| `Table` | Semantic `<table>`, `<caption>`, `<thead>`, `<th scope>`, `<tbody>` | Zebra/hover rows, sticky action column support |
| `DataTable` | Typed columns + search filter + `Skeleton` loading + `EmptyState` | Keyboard-operable sorting/filtering |
| `Progress` | Native `<progress class="studio-progress">` + label + `%` | Determinate and `cqi` indeterminate animation |
| `Skeleton` | `text`, `rect`, `circle` shimmer blocks | `aria-hidden="true"`, respects `prefers-reduced-motion` |
| `Toast` | `ToastProvider` + `useToast()` (`info`, `success`, `warning`, `error`) | Single centralized `aria-live="polite"` announcer |
| `EmptyState` | Centered icon (`lg`), title, description, primary CTA slot | Consistent vertical rhythm across empty views |

### 4.2 Domain Components (`src/components/domain/`)

| Component | Responsibility |
| :--- | :--- |
| `FileUploader` | Accessible drag-and-drop & `Enter`/`Space` keyboard file dropzone with error alert |
| `PDFViewerToolbar` | `role="toolbar"` with page prev/next, zoom -/+, compare original toggle, active tool selector |
| `SignaturePreview` | Checkerboard PNG preview with alpha verification, pixel dims, & transparent margin readout |
| `StampPreview` | Checkerboard PNG stamp preview with alpha verification, pixel dims, & owner metadata |
| `DetectionStatus` | `AUTO_READY` / `REVIEW_REQUIRED` / `BLOCKED` / `COMPLETED` pill + 5-dimension heuristic bars |
| `ProcessingQueueItem` | Unified queue row/card showing PDF classification, page progress, Person A/B/Stamp summary |
| `ReviewPanel` | Manual Review inspector: tool switcher, stamp owner selector, numeric X/Y/W/H/Rot, evidence & CTAs |

---

## 5. Governance & Screens

Every one of the 10 screens (`Home / Upload`, `Profile Setup`, `Asset Manager`, `Stamp Configuration`, `Document Queue`, `Detection Results`, `Manual Review Center`, `PDF Preview`, `Export Results`, `Settings and Privacy`) plus the **Design System Showcase** must be assembled exclusively from the components and tokens documented above.
