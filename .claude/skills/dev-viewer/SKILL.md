---
name: dev-viewer
description: How to work on packages/viewer, the Vite + React + React Flow + ELK app that renders architecture.json. Use when adding or changing viewer components, hooks, layout, search, playback, styling, accessibility, or viewer tests and e2e specs.
---

# Developing the viewer

Layer overview and ESLint boundaries: `CONTRIBUTING.md`, section "Viewer layers". Read it first.

## Where code goes

| Folder        | Holds                                                                                  | Rule                                                                                   |
| ------------- | -------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------- |
| `Viewer.tsx`  | Composition of hooks and components                                                    | No logic of its own                                                                    |
| `components/` | `canvas/`, `panel/`, `timeline/`, `topbar/`, `ReloadBanner`, `ErrorScreen`, `kinds.ts` | Contexts and the kind-to-icon map live here                                            |
| `hooks/`      | Playback, selection, shortcuts, flow route, canvas focus, reduced motion               |                                                                                        |
| `data/`       | `useArchitecture` (loading and reload), `useHashRoute`, `useTheme`                     |                                                                                        |
| `graph/`      | ELK layout (`layout.ts`), canvas elements, highlight, flow usage                       | Pure: no `react`, `react-dom`, `lucide-react`; `@xyflow/react` only with `import type` |
| `lib/`        | Pure helpers (`playback`, `route`, `search`, `safeUrl`, `sourceUrl`, `loadState`, ...) | Same purity rule as `graph/`                                                           |

- Look items up through `indexArchitecture` from `@archbook/schema`, built once per document. Never search arrays by id in components.
- Styles are CSS modules (`*.module.css`) plus `styles/theme.css`.
- Prefer putting logic in `graph/` or `lib/` so it can be unit tested in Node.

## Running

- `pnpm dev:example` serves `examples/shop-checkout/archbook/architecture.json` with hot reload. Use `ARCHBOOK_FILE=/abs/path/architecture.json pnpm dev:example` for another file.
- `vite.config.ts` aliases `@archbook/schema` to its source, so the schema does not need building first.
- `dev-server.ts` mounts the same live reload hub as `archbook dev` (`createLiveReloadHub` from `@archbook/schema/node`). Reloads keep the last valid document and show `ReloadBanner`.

## Constraints that break silently

- **CSP.** The build injects `CONTENT_SECURITY_POLICY` from `csp.ts` (build only). No inline scripts, no external URLs, no `eval`. Zod runs jitless: `src/zodJitless.ts` must stay the first import in `main.tsx`.
- **Bundle size.** The main bundle stays under 500 kB. Heavy, rarely used code is loaded with `lazy()`/dynamic `import()` (see `panel/Markdown.tsx`).
- **ELK.** Layout runs in a worker (`elk-worker.min.js?url`) and falls back to `elk.bundled.js` on the main thread only when `Worker` is unavailable. An e2e test asserts the fallback is never requested in a normal run.
- **Reduced motion.** Anything animated must respect `usePrefersReducedMotion` (no travelling dot, camera jumps instead of gliding).
- **Accessibility.** Nodes and unlabelled edges are tab stops opened with Enter or Space; labelled edges are reached through their label button; hidden elements get `aria-hidden`. Search follows the WAI-ARIA combobox pattern, the timeline announces steps with `aria-live="polite"`. A key handled by a focused element must not also fire the global shortcut. Keep these patterns when adding UI.
- **Links.** Any URL from the document goes through `safeHref` (`lib/safeUrl.ts`).

## Tests

- Unit tests: `packages/viewer/test/*.test.ts`, Node environment.
- Component tests: `*.test.tsx` starting with `// @vitest-environment happy-dom`, using `@testing-library/react` with `cleanup` in `afterEach`.
- Anything that needs the real canvas (layout, `ResizeObserver`, CSP) goes to Playwright in `e2e/` (`viewer.spec.ts` for the built site, `dev.spec.ts` for `archbook dev`). The `problems` fixture fails a test on console errors, page errors or CSP violations.
- Coverage limits live in `packages/viewer/vitest.config.ts`. Raise them when coverage grows, never lower them.

```sh
pnpm --filter @archbook/viewer typecheck
pnpm --filter @archbook/viewer test
pnpm build && pnpm test:e2e   # once: pnpm exec playwright install chromium
```
