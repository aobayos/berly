# BERLY

A screenwriting editor. React + TypeScript + Vite, shipping both as a web build and as an Electron desktop app, fully bilingual EN/FR.

On the desktop a project is a real `.berly` file that you open and save like any document; in the browser it lives in `localStorage` and saves continuously.

## Getting started

```sh
npm install
npm run dev            # web app on http://localhost:5173
npm run electron:dev   # desktop app (Vite + Electron together)
```

## Scripts

| Script | What it does |
| --- | --- |
| `dev` | Vite dev server (web only) |
| `build` | `tsc -b` then production web build into `dist/` |
| `lint` | oxlint |
| `preview` | serve the production web build |
| `electron:build-main` | compile the Electron main/preload into `dist-electron/` |
| `electron:dev` | build main, then run Vite and Electron together |
| `electron:build` | full build and package with electron-builder into `release/` |

There is no test suite yet.

`build` and `electron:build-main` are two separate TypeScript programs, so changes under `electron/` are not covered by `build` alone — run both.

## Layout

```
src/
  main.tsx  App.tsx  i18n.ts  index.css
  model/    pure data + transforms — no React, no DOM
  storage/  persistence facade, web backend, open-document store
  desktop/  Electron bridge facade + shared types
  shell/    app chrome: tabs, commands, menus, shortcuts, title bar
  ui/       presentational primitives shared across features
  editor/   the script editor and its panes
  bible/    character & location sheets
  library/  project/episode lists, open-project and recovery modals
electron/   main process, preload, PDF export, recents, document files
scripts/    build helpers
```

Imports are relative and the tree is kept two levels deep on purpose: the Electron main process compiles a few `src/` modules with plain `tsc` and no bundler, and `tsc` does not rewrite path aliases on emit — so a `@/` alias would break the packaged app.

Architecture notes for contributors (and for Claude Code) live in `CLAUDE.md` one directory up.
