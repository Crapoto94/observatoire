---
name: Territorial Observatory Design System
colors:
  surface: '#faf8ff'
  surface-dim: '#d2d9f4'
  surface-bright: '#faf8ff'
  surface-container-lowest: '#ffffff'
  surface-container-low: '#f2f3ff'
  surface-container: '#eaedff'
  surface-container-high: '#e2e7ff'
  surface-container-highest: '#dae2fd'
  on-surface: '#131b2e'
  on-surface-variant: '#43474c'
  inverse-surface: '#283044'
  inverse-on-surface: '#eef0ff'
  outline: '#74777d'
  outline-variant: '#c4c6cd'
  surface-tint: '#4d6077'
  primary: '#000e1d'
  on-primary: '#ffffff'
  primary-container: '#0f2438'
  on-primary-container: '#788ca4'
  inverse-primary: '#b4c8e3'
  secondary: '#006a61'
  on-secondary: '#ffffff'
  secondary-container: '#86f2e4'
  on-secondary-container: '#006f66'
  tertiary: '#000e18'
  on-tertiary: '#ffffff'
  tertiary-container: '#002539'
  on-tertiary-container: '#0092d0'
  error: '#ba1a1a'
  on-error: '#ffffff'
  error-container: '#ffdad6'
  on-error-container: '#93000a'
  primary-fixed: '#d0e4ff'
  primary-fixed-dim: '#b4c8e3'
  on-primary-fixed: '#071d30'
  on-primary-fixed-variant: '#35485e'
  secondary-fixed: '#89f5e7'
  secondary-fixed-dim: '#6bd8cb'
  on-secondary-fixed: '#00201d'
  on-secondary-fixed-variant: '#005049'
  tertiary-fixed: '#c9e6ff'
  tertiary-fixed-dim: '#89ceff'
  on-tertiary-fixed: '#001e2f'
  on-tertiary-fixed-variant: '#004c6e'
  background: '#faf8ff'
  on-background: '#131b2e'
  surface-variant: '#dae2fd'
typography:
  display-lg:
    fontFamily: Plus Jakarta Sans
    fontSize: 36px
    fontWeight: '700'
    lineHeight: 44px
    letterSpacing: -0.025em
  headline-lg:
    fontFamily: Plus Jakarta Sans
    fontSize: 28px
    fontWeight: '600'
    lineHeight: 36px
    letterSpacing: -0.02em
  headline-md:
    fontFamily: Plus Jakarta Sans
    fontSize: 22px
    fontWeight: '600'
    lineHeight: 28px
    letterSpacing: -0.015em
  headline-sm:
    fontFamily: Plus Jakarta Sans
    fontSize: 18px
    fontWeight: '600'
    lineHeight: 24px
    letterSpacing: -0.01em
  body-lg:
    fontFamily: Inter
    fontSize: 16px
    fontWeight: '400'
    lineHeight: 24px
    letterSpacing: -0.005em
  body-md:
    fontFamily: Inter
    fontSize: 14px
    fontWeight: '400'
    lineHeight: 20px
    letterSpacing: 0em
  body-sm:
    fontFamily: Inter
    fontSize: 12px
    fontWeight: '400'
    lineHeight: 16px
    letterSpacing: 0.005em
  metric-xl:
    fontFamily: Inter
    fontSize: 32px
    fontWeight: '700'
    lineHeight: 38px
    letterSpacing: -0.03em
  metric-md:
    fontFamily: Inter
    fontSize: 20px
    fontWeight: '600'
    lineHeight: 26px
    letterSpacing: -0.02em
  data-tabular:
    fontFamily: JetBrains Mono
    fontSize: 13px
    fontWeight: '500'
    lineHeight: 18px
    letterSpacing: -0.01em
  label-sm:
    fontFamily: Inter
    fontSize: 11px
    fontWeight: '600'
    lineHeight: 14px
    letterSpacing: 0.04em
  label-mono:
    fontFamily: JetBrains Mono
    fontSize: 11px
    fontWeight: '500'
    lineHeight: 14px
    letterSpacing: 0.02em
rounded:
  sm: 0.125rem
  DEFAULT: 0.25rem
  md: 0.375rem
  lg: 0.5rem
  xl: 0.75rem
  full: 9999px
spacing:
  gutter: 1rem
  gutter-lg: 1.5rem
  margin: 1rem
  margin-md: 1.5rem
  margin-lg: 2rem
  space-xs: 0.25rem
  space-sm: 0.5rem
  space-md: 0.75rem
  space-lg: 1rem
  space-xl: 1.5rem
---

## Brand & Style

This design system establishes an institutional yet forward-looking visual identity tailored for modern civic tech, urban analytics, and spatial data governance. It blends the authority and dispassionate rigor of leading statistical institutes (such as INSEE and the OECD) with the dynamic precision and clarity of cutting-edge geographic intelligence tooling (such as Mapbox Studio and modern urban planning dashboards).

The interface prioritizes dense, multi-layered information architectures without visual fatigue. The aesthetic is modern-corporate and structured minimalism, leaning heavily into crisp architectural outlines, structured data density, and crystalline visual cues. The design inspires high institutional trust, analytical precision, transparency, and accessible intelligence for urban planners, policy analysts, elected officials, and data-conscious citizens.

## Colors

The palette is engineered to support both high-contrast navigational scaffolding and clear, multi-variable data visualizations.

- **Primary (`#0F2438`):** Deep maritime slate navy serves as the primary structural color for global headers, main navigational panels, primary action states, and high-emphasis textual markers.
- **Secondary (`#0D9488`):** Crisp deep teal provides focused visual authority for selected spatial layers, affirmative states, and interactive metric controls.
- **Tertiary (`#0EA5E9`):** Luminous electric cyan/sky blue is reserved for real-time live data points, active hover strokes, focal cartographic highlights, and progressive indicators.
- **Neutral (`#0F172A`):** Deep slate provides sharp, readable typography across light background fields.

### Background and Surface Tokens
- **Canvas Base:** `#F8FAFC` (Slate Tint 50) for outer canvas backgrounds to reduce screen glare during extended analytical work.
- **Surface Elevation:** `#FFFFFF` for primary cards, analytical sheets, and floating tool panels.
- **Dividers & Structural Borders:** `#E2E8F0` for hairline 1px borders, grid separators, and table rules.
- **Muted Surfaces:** `#F1F5F9` for table headers, inactive filter wells, and pill track backgrounds.

### Categorical & Semantic Data Palette
For urban domain indicators and multi-series charting, the palette enforces distinct, colorblind-safe categorical coordinates:
- **Demographics & Social:** Indigo (`#6366F1`)
- **Urban Density & Mobility:** Cyan / Teal (`#0D9488` / `#06B6D4`)
- **Environment & Ecology:** Emerald (`#10B981`)
- **Housing & Real Estate:** Amber (`#F59E0B`)
- **Critical Alerts & Tension Deltas:** Rose/Coral (`#F43F5E`)

## Typography

Typography balances clean institutional structure with quantitative legibility:
- **Headlines (`Plus Jakarta Sans`):** Features geometric authority with friendly, humanized balance. Applied to dashboard section headers, territorial names (e.g., Metropoles, Iris zones), and modal titles.
- **Body & Controls (`Inter`):** Selected for its neutral clarity, systematic screen legibility, and rich OpenType features. All numeric representations in `Inter` body copy and KPI metrics (`metric-xl`, `metric-md`) must enforce OpenType tabular figures (`font-variant-numeric: tabular-nums;`) to prevent layout shifts during live data re-renders.
- **Data & Metadata (`JetBrains Mono`):** Dedicated to technical coordinates, geocodes (INSEE/postal codes), standard error deviations, timestamps, raw tabular metrics, and map legend scales.

## Layout & Spacing

The layout is architected around high spatial utilization with an analytical 12-column grid and modular split-screen split panes for spatial analysis.

### Layout Mechanics
- **Dashboard Workspace:** Utilizes an edge-to-edge full-viewport height (`100vh`) shell. The primary canvas can split into a dual-aspect interface: a spatial map viewport anchored alongside an analytical data dock (fixed 420px to 640px depending on screen resolution).
- **Responsive Adaptations:**
  - **Desktop (>=1280px):** 12-column fluid grid, 24px margins, 16px to 24px gutters. Dual-pane view active (concurrent map + analytical indicator cards).
  - **Tablet (768px - 1279px):** 8-column layout, 20px margins, 16px gutters. Side analytics pane converts into a bottom-docked sheet with swipe-up inspection capabilities.
  - **Mobile (<768px):** 4-column layout, 16px margins, 12px gutters. Full toggle switches between "Map View" and "Data Indicators List." Filter bars transition to horizontally scrollable swipe containers with pinned trigger controls.

## Elevation & Depth

Visual hierarchy is communicated via clean tonal layering and low-contrast hairline outlines rather than heavy theatrical drop shadows. This preserves visual accuracy and focus for complex map charts and micro-visualizations.

- **Level 0 (Base Canvas):** `#F8FAFC` flat surface.
- **Level 1 (Card & Content Tiles):** Pure white (`#FFFFFF`) with a 1px uniform perimeter stroke (`#E2E8F0`). Shadow is ultra-subtle: `0 1px 3px 0 rgba(15, 23, 42, 0.04), 0 1px 2px -1px rgba(15, 23, 42, 0.02)`.
- **Level 2 (Hovered Cards & Interactive Metric Wells):** Scaled shadow: `0 4px 6px -1px rgba(15, 23, 42, 0.06), 0 2px 4px -2px rgba(15, 23, 42, 0.03)` with a border tint transition to `#CBD5E1`.
- **Level 3 (Floating Map Tools, Overlays & Dropdowns):** `#FFFFFF` with slight backdrop blur when translucent, bordered by `#CBD5E1`, with shadow: `0 10px 15px -3px rgba(15, 23, 42, 0.08), 0 4px 6px -4px rgba(15, 23, 42, 0.04)`.
- **Level 4 (Modal Dialogs & Deep Data Sheets):** `0 20px 25px -5px rgba(15, 23, 42, 0.12), 0 8px 10px -6px rgba(15, 23, 42, 0.06)` with backdrop dimming mask using `rgba(15, 36, 56, 0.4)`.

## Shapes

The system relies on a soft geometric silhouette (`roundedness: 1`), conveying technical reliability, crisp structure, and space efficiency.

- **Components & Cards:** Containers, tables, modals, and panel cards feature a disciplined `0.25rem` (4px) or `0.5rem` (8px) radius. Sharp enough to evoke an analytical datasheet, yet soft enough to feel contemporary.
- **Territorial Pill Filters & Badges:** Use full circular caps (`rounded-full`) exclusively for status indicators, comparative delta badges, and multi-select filter tags. This distinct contrast allows high-level filters to instantly stand apart from angular data cards and spatial layers.

## Components

### Buttons
- **Primary:** Background `#0F2438`, text `#FFFFFF`, border none, 8px radius. Hover: `#1E3A5F`. Focused: 2px offset ring in `#0EA5E9`.
- **Secondary / Ghost Data Controls:** White background, 1px solid `#E2E8F0`, text `#0F172A`. Hover: `#F8FAFC` and border `#CBD5E1`.
- **Accent Action:** Background `#0D9488`, text `#FFFFFF`. Hover: `#0F766E`.

### Territorial Filter Pill Bars
- Horizontally scrollable chip groups wrapped in a subtle track.
- Active pill: `#0F2438` fill, `#FFFFFF` text, with micro checkmark icon.
- Inactive pill: `#FFFFFF` fill, 1px border `#E2E8F0`, text `#475569`. Hover: `#F1F5F9`.
- Integrated counter badges inside pills use JetBrains Mono at 11px.

### Card-Based KPIs & Metric Tiles
- Structure: 1px border `#E2E8F0`, white ground, 16px internal padding (`space-lg`).
- Top Row: Metric label (`label-sm`, uppercase, `#64748B`) paired with an informative metadata icon or info tooltip.
- Center: Prominent numerical value (`metric-xl`, `Inter` tabular-nums, `#0F172A`).
- Bottom Row: Delta pill badge showing variance vs. reference baseline.
  - Positive trend: `#ECFDF5` background, `#059669` text, arrow up.
  - Negative/critical trend: `#FFF1F2` background, `#E11D48` text, arrow down.
  - Baseline caption: `body-sm`, `#94A3B8`, e.g., "vs. baseline (2018)".

### Responsive Data Tables
- Header: `#F8FAFC`, text `#475569`, `label-sm`, uppercase with bidirectional sort arrows.
- Rows: Clean 1px `#F1F5F9` bottom borders, alternating hover state `#F8FAFC`.
- Cells: Numerical columns strictly right-aligned using `JetBrains Mono` (`data-tabular`), text left-aligned in `Inter` (`body-md`).
- Quick actions: Sticky right column for territorial export (GeoJSON, CSV) and micro sparkline visual previews.

### Interactive Map Panels & Floating Overlays
- **Floating Controls:** Grouped vertical icon bar on top-right map corner (Zoom, Reset Extent, Layer Stack, Basemap toggle). Elevated with Level 3 shadow, white surface, 1px `#E2E8F0` border.
- **Collapsible Drawer / Sidebar:** Anchored left or right, containing indicator fiches, breakdown charts, and methodological citations. Seamless collapse button with chevron to maximize spatial viewport.
- **Floating Choropleth Legend:** Bottom-left anchored card showing linear gradient swatches or categorical color bands, labeled with exact numeric bounds in `JetBrains Mono`.

### Form Inputs & Search Fields
- Territory search input features an inline search icon, instant search shortcut badge (`⌘K`), and immediate clear trigger.
- Focused state: 1px border `#0EA5E9`, subtle outer glow `rgba(14, 165, 233, 0.15)`.
