# cockpit-lxc

Manage LXC system containers from the [Cockpit](https://cockpit-project.org/) web
console. Incus is the container manager; the plugin reaches `incusd` over its local REST
socket through `cockpit-bridge`, so it inherits Cockpit's authentication rather than
introducing a second credential.

Status: **Phase 1**. The package builds, installs and renders, but the container list is
not implemented yet. See
[the spec proposal](cockpit-lxc-0-container-management-plugin.md) for the full plan.

## Requirements

On the managed host:

- `cockpit` >= 300
- `incus` >= 6.0 LTS, both the daemon and the `incus` CLI binary. The CLI is not optional:
  the terminal and the event stream are carried by it, because both of the corresponding
  Incus endpoints are websocket-based and `cockpit.http()` cannot perform the upgrade.

To build:

- Node.js and npm
- GNU make, for the install targets

## Build and install

```sh
npm install
make build            # bundle into dist/
make devinstall       # symlink dist/ into ~/.local/share/cockpit/lxc
```

`devinstall` is the fast loop: Cockpit picks packages up from the user path without a
restart, so `npm run watch` in one terminal is enough to see changes on reload.

For a system-wide install:

```sh
sudo make install     # copies dist/ into /usr/share/cockpit/lxc
```

## Checks

```sh
make check            # typecheck + eslint + stylelint
```

`make check` is the gate. It runs the TypeScript compiler, ESLint and Stylelint, and CI
fails on any of them.

## The 4px grid

Every spacing, sizing and positional length in this plugin resolves to a multiple of 4px.
This is not a review guideline, it is a build gate.

PatternFly 6's spacer scale is built on a 0.25rem increment, which at Cockpit's 16px root
font size is exactly 4px, so styles written purely in PatternFly tokens are on the grid by
construction:

```css
.lxc-detail__section {
    padding-block: var(--pf-t--global--spacer--md);      /* 16px */
    gap: var(--pf-t--global--spacer--sm);                /*  8px */
    margin-block-end: var(--pf-t--global--spacer--lg);   /* 24px */
}
```

Tokens do not cover every case, so `build/stylelint-4px-grid.js` is the backstop. It
rejects `px` and `rem` literals that do not resolve to a multiple of 4px in the properties
that determine layout geometry. Custom properties are checked too, so a
`--lxc-gap: 10px` cannot smuggle an off-grid value in behind a `var()` reference.

`border-*` and `outline-*` are deliberately exempt: a 1px border is not spacing.

To see the grid while working, append `?grid=1` to the page URL. A development-only
overlay paints the 4px baseline over the page. It is constant-folded out of production
builds.

### If the rule is wrong for a line

Use a scoped disable and say why. The comment is visible in review, which is the point:

```css
/* stylelint-disable-next-line cockpit-lxc/four-px-grid --
   xterm reports a fractional cell height; the remainder is absorbed by the
   flex spacer below rather than by rounding the viewport off-grid. */
block-size: 417px;
```

## Layout

```
build.js                     esbuild driver
build/stylelint-4px-grid.js  the 4px gate
src/
  manifest.json              Cockpit package manifest
  index.html                 import map resolving "cockpit" to ../base1/cockpit.js
  index.tsx                  React entry point
  app.tsx                    page shell
  grid-overlay.tsx           ?grid=1 development overlay
  backend/                   the only place that may import cockpit
    driver.ts                the ContainerDriver interface
    types.ts                 domain types
    errors.ts                failure taxonomy
  types/                     hand-maintained ambient declarations
```

### The backend boundary

Only `src/backend/` may import `cockpit`. Everything above it programs against the
`ContainerDriver` interface. `eslint.config.js` enforces this with `no-restricted-imports`.

The boundary exists so that the UI does not encode Incus's wire format, which is what
would make a future driver for another container manager a rewrite rather than an
addition. It is not speculative generality: the same seam is what makes the driver
testable without a live Incus.

## License

LGPL-2.1-or-later, matching Cockpit.
