# Contributing to cockpit-lxc

This is the developer's half of the documentation. The [README](README.md) covers
installing and using the plugin.

## Getting set up

```sh
npm install
make build            # bundle into dist/
make devinstall       # symlink dist/ into ~/.local/share/cockpit/lxc
```

Cockpit picks packages up from `~/.local/share/cockpit/` without a restart, so
`make devinstall` plus `npm run watch` is the fast loop. `make devuninstall` removes the
symlink.

For a readable, unminified bundle, build with `NODE_ENV=development npm run build`.

## Checks

```sh
make check
```

That is the gate, and CI fails on any part of it:

| Check | What it catches |
|---|---|
| `check-version` | The version disagreeing between package.json, the Makefile, the rpm spec, the debian changelog and the PKGBUILD |
| `typecheck` | Ordinary type errors, and message keys that do not exist |
| `lint:js` | ESLint, including the backend boundary rule below |
| `lint:css` | Stylelint, including the 4px grid gate below |
| `check:po` | Catalogue drift and dropped placeholders |

## Verifying against a real Cockpit

`make check` cannot tell you the plugin works, only that it compiles. Several faults have
shipped past it, and every one was invisible without a live session:

- `cockpit.superuser` does not exist on the base1 global, so calling it threw on mount
- `cockpit.http` `request()` hangs forever when `body` is omitted
- setting `Origins` in `cockpit.conf` replaces the same-origin default
- the live event stream refreshed the ETag under an open form, defeating the conflict
  detection that ETag existed for
- `getContainer` fetched without `recursion=1`, so the detail view received no state at all
  and had never shown a single metric
- the Incus socket path differs by distribution, so the plugin could not reach Incus on Arch

All of the early ones hid behind a smoke test that replaced `cockpit.js` with a stub. A stub
agrees with whatever assumption you encode in it. There are now two ways to avoid that.

**`test/session-smoke.py`** runs on the managed host and needs only `chromium-browser` and
`websocket-client`. It logs in for real, optionally turns on administrative access, and
asserts what the plugin rendered:

```sh
python3 test/session-smoke.py --password "$PASSWORD" --escalate \
    --expect-rows web01,db01 --screenshot /tmp/lxc.png
```

Exit status is 0 only when every requested check passed, so it works in CI.

**`chrome-devtools-mcp`** is configured in `.mcp.json` for interactive work from a
development machine. It drives Chrome where the agent runs, so point it at a tunnelled or
Tailscale URL rather than the guest address. It is the only one of the two that surfaces
console messages, which is how the CSP problem in `docs/csp.md` was found. Usage statistics
are turned off in that config.

One trap in both: `cockpit.spawn` type-checks its argv, so an array built in a different
JavaScript realm is rejected with `not-found`. When evaluating from a parent frame,
construct it with `new w.Array()` where `w` is the plugin frame's window. The symptom looks
exactly like a missing binary and is not one.

## The 4px grid

Every spacing, sizing and positional length resolves to a multiple of 4px. This is a build
gate, not a review guideline.

PatternFly 6's spacer scale is built on a 0.25rem increment, which at Cockpit's 16px root
font size is exactly 4px, so styles written purely in tokens are on the grid by
construction:

```css
.lxc-detail__section {
    padding-block: var(--pf-t--global--spacer--md);      /* 16px */
    gap: var(--pf-t--global--spacer--sm);                /*  8px */
    margin-block-end: var(--pf-t--global--spacer--lg);   /* 24px */
}
```

Tokens do not cover every case, so `build/stylelint-4px-grid.js` is the backstop. It rejects
`px` and `rem` literals that do not resolve to a multiple of 4px in the properties that
determine layout geometry. Custom properties are checked too, so a `--lxc-gap: 10px` cannot
smuggle an off-grid value in behind a `var()`.

`border-*` and `outline-*` are exempt: a 1px border is not spacing. Component heights come
from PatternFly and are not overridden either; every control it renders is 37px, which is a
36px box plus the border the rule exempts.

Append `?grid=1` to the page URL to paint the baseline over the page. The overlay is
constant-folded out of production builds.

### If the rule is wrong for a line

Use a scoped disable and say why. The comment is visible in review, which is the point:

```css
/* stylelint-disable-next-line cockpit-lxc/four-px-grid --
   xterm reports a fractional cell height; the remainder is absorbed by the
   flex spacer below rather than by rounding the viewport off-grid. */
block-size: 417px;
```

## The layout audit

The stylelint rule reads declarations. It cannot see an element that is on the grid in
every line of its own CSS and lands off it because an ancestor put it there, and it cannot
see two blocks that both use tokens and still fail to line up with each other. That is what
`test/layout/` measures: it renders each view against recorded fixtures in a pinned browser
and reads back `getBoundingClientRect`.

```
make check-layout            # in the pinned image, which is what CI runs
npm run build && npm run build:harness && npm run check:layout
```

The second form runs against whatever Chromium Playwright installed locally. It is faster
and it is fine for iterating, but the numbers are only comparable to CI's from inside the
image, because fonts rasterize differently.

Twenty scenarios by three viewports (768, 1280, 1600) by two themes. Each cell serves
`dist/` from a local server with `window.cockpit` stubbed at the transport, so no plugin
source knows the audit exists. `npm run build` first: the harness loads the built bundle,
not `src/`.

### Reading a finding

```
G1  div.lxc-page > section.lxc-config > div.pf-v6-c-form__group
    sits 22px below the block above it        (gap above: 22px)
```

The rule id says what was measured. `G` is grid conformance, `A` is alignment between
elements, `P` is separation and target size. The selector is a path you can paste into the
console. The detail is the measurement against the requirement.

A rule reports where a defect is introduced, not everywhere it is felt: a heading whose
line box is 31.19px tall pushes everything below it off the baseline by the same 0.19px,
and one finding for the heading beats three hundred for its consequences.

Failing cells write an outlined screenshot to `test/layout/screenshots/`. The picture is
evidence attached to a number; nothing in the pass or fail decision reads a pixel.

### Waivers

`test/layout/waivers.json` is the list of findings that are known and deliberate. A waiver
matches on the rule, the scenario, a selector the browser evaluates, and the measurement,
so it lapses when any of those change rather than covering the next defect at the same
place.

Two guards keep the file honest. A reason under 40 characters, or one still saying `TODO`,
fails the run before a browser starts. A waiver that matched nothing also fails the run,
which is what makes deleting it part of the same commit as the fix.

A reason has to say why the finding is correct behaviour, in terms a reader can check:

```json
{
    "rule": "G2",
    "scenario": "*",
    "selector": "span.pf-v6-c-switch__toggle",
    "value": "height: 21px",
    "reason": "PatternFly sizes the switch track from the body font size and its line height rather than from a spacer token, so 21px is 14px at 1.5. Overriding it would desynchronise the toggle from the label beside it.",
    "owner": "heavycaffeiner"
}
```

"PatternFly does this" is not a reason on its own. Which value, derived from what, and what
breaks if it is overridden.

`node test/layout/run.mjs --update-waivers` rewrites the file from the current findings,
carrying existing reasons across and stamping new entries `TODO`. It always exits non-zero.
Use it to see the shape of a change, then write the reasons by hand.

### Adding a scenario

A scenario in `test/layout/scenarios.mjs` names a route, the fixture overrides its page
needs, and optionally the steps that open a dialog or a tab. Fixtures are JSON files under
`test/layout/fixtures/`, keyed by request. A request with no fixture fails the scenario
rather than resolving empty: an empty page passes every geometry rule.

### The pinned image

`test/layout/image.json` holds the Playwright version and the image digest. The Makefile
reads it; the workflow cannot, so `.github/workflows/check.yml` repeats the reference and
`npm run check:version` fails if the two disagree or if the npm `@playwright/test` version
is not the same release. `make check` deliberately does not depend on `check-layout`:
`make dist` depends on `check`, and the packaging builds must not require Docker.

`docs/proposals/design/cockpit-lxc-2-layout-conformance-toolchain.md` is the design note.

## Repository layout

```
build.js                     esbuild driver
build/stylelint-4px-grid.js  the 4px gate
build/gen-en.mjs             bundles po/en.po and generates the key tree
build/check-catalogues.mjs   the catalogue gate, in place of xgettext
build/check-version.mjs      keeps the five version declarations in step, and
                             the audit image in step with @playwright/test
packaging/                   rpm spec, debian packaging and PKGBUILD
po/en.po, po/ko.po           the catalogues, keyed by stable message id
test/session-smoke.py        real-session verification
test/layout/                 the runtime layout audit
  run.mjs                    the matrix runner
  scenarios.mjs              what is rendered, and the steps to get there
  host/probe.ts              the in-page measurement, injected not imported
  rules/                     G, A and P, pure functions over observations
  waivers.json               reasoned exceptions, one per known finding
  image.json                 the pinned browser
docs/csp.md                  why the style CSP is widened
src/
  manifest.json              Cockpit package manifest, including its CSP
  index.html                 loads base1/cockpit.js as a classic script
  theme.ts                   follows Cockpit's dark/light setting
  prefs.ts                   browser-local presentation state
  config/fields.ts           the curated fields, and the generator that turns
                             Incus's option table into the rest
  backend/                   the only place that may import cockpit
    driver.ts                the ContainerDriver interface
    socket.ts                the candidate socket paths, which differ by distro
    i18n.ts                  translation, with English as the fallback layer
    incus/                   the Incus implementation, plus the CLI-backed
                             remote list the REST API has no endpoint for
  generated/                 written by gen-en.mjs, not edited
  views/, components/, hooks/
```

### The backend boundary

Only `src/backend/` may reach Cockpit, through either the `cockpit` import or the
`window.cockpit` global. `eslint.config.js` enforces both, because restricting the import
alone left the global as an open back door.

The boundary keeps Incus's wire format out of the UI, which is what would otherwise make a
driver for another container manager a rewrite rather than an addition. It is not
speculative generality: the same seam is what makes the driver testable without a live
Incus.

### Adding a string

Message ids are stable keys, not English text. Source text as the id is the gettext
convention and it silently orphans translations: edit the English wording and the id
changes with it, no catalogue matches any more, and the UI quietly falls back to English
without anything failing.

To add a string, put it in `po/en.po` and in every other catalogue you can, then read it:

```tsx
T.list.create_container                 // a string
T.snapshots.day_ago(days)               // an entry with plural forms
format(T.list.selected, count)          // $0, $1, ... substituted
```

`T` is generated from `po/en.po`, so the key is completed by the editor and a typo is a
compile error rather than a key showing through in the UI. Put a string more than one view
needs in the `common` namespace instead of once per view. `npm run check` fails on a key
`src` uses that `en.po` lacks, on a key `en.po` carries that nothing uses, on a key in
another catalogue that English does not have, and on a translation that drops a `$0` the
English has: a dropped placeholder silently loses whatever was going to be substituted
into it, and four Korean strings had done exactly that.

English is bundled rather than fetched. Cockpit serves exactly one translation file per
package, resolved from the request's Accept-Language, and a session in a language with no
catalogue gets an empty file rather than a fallback: a locale with no catalogue therefore
renders bundled English, and a partly translated catalogue renders English for whatever it
has not reached.

### The configuration surface

The forms are driven by Incus's own option table, fetched once per session from
`GET /1.0/metadata/configuration` and gated on the `metadata_configuration` extension. A
curated field whose key the server does not carry is not rendered, which is what stops the
plugin offering a setting the API would reject. On a server too old to describe itself the
schema is null and the curated list plus the raw editor carry on unchanged.

`docs/proposals/cockpit-lxc-1-metadata-driven-configuration.md` is the design note.

## Notable behaviour

**Writes are guarded by ETags, pinned at the first keystroke.** Incus's PUT is a true
replace, so the whole editable half of an instance goes back even when one field changed;
sending only `config` leaves the instance with no devices. The ETag is captured when
editing starts rather than taken from the latest fetch, because the live event stream
refetches constantly and adopting a fresh ETag would let a save silently overwrite the
concurrent change it was meant to catch.

**Forms display effective configuration and write instance-local configuration.** A
container inheriting a memory limit from a profile shows that limit, but an untouched field
is never written back; doing so would copy the value onto the instance and sever it from
the profile.

**Destructive actions are guarded by what they destroy.** Deleting a container needs its
name typed. Restoring a snapshot says how old it is, because that is the number that says
how much work is being discarded.

**The Incus socket is found, not assumed.** Fedora and RHEL put it at
`/run/incus/unix.socket`; Arch has no `/run/incus` and uses `/var/lib/incus/unix.socket`.
The client tries the candidates in turn and keeps the one that answers, rather than reading
`/etc/os-release` and guessing.

## Releasing

Bump the version in all five places, or `check-version` will stop you: `package.json`, the
`Makefile`, `packaging/cockpit-lxc.spec`, `packaging/debian/changelog` and
`packaging/arch/PKGBUILD`. Then tag:

```sh
git tag -a v0.1.3 -m "cockpit-lxc 0.1.3"
git push origin v0.1.3
```

The release workflow builds the source tarball once, hands the same bytes to the rpm, deb
and Arch builds, and publishes them with a `SHA256SUMS`. It refuses a tag that disagrees
with the version the packaging declares.
