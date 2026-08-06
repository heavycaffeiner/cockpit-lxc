# cockpit-lxc

Manage LXC system containers from the [Cockpit](https://cockpit-project.org/) web console.
Incus is the container manager; the plugin reaches `incusd` over its local REST socket
through `cockpit-bridge`, so it inherits Cockpit's authentication rather than introducing a
second credential.

![The container list](docs/screenshot-containers.png)

## What it does

- **Lifecycle**: create, start, stop, force stop, restart, freeze, unfreeze, rename, copy
  and delete, one container at a time or a selection at once. Actions are offered per
  state, so the menu never shows something the API would reject.
- **Configuration**: every instance option the server advertises for containers, 75 of them
  on Incus 6.23. The ones reached for daily come first as translated, validated fields; the
  rest are generated from Incus's own option table with its descriptions, defaults and
  whether the change needs a restart. A raw key/value editor still covers the wildcard
  families and anything a future server accepts without documenting.
- **Devices**: network interfaces and disk mounts, with profile-supplied devices shown as
  inherited rather than silently copied onto the container.
- **Snapshots**: create, restore, rename and delete, with schedule and expiry configurable.
- **Images**: one tab for what is cached locally, with names and deletion, and one for
  browsing a remote's catalogue and downloading from it. Creating a container picks from
  the cached list, so a create never turns into a silent multi-minute download.
- **Profiles, networks and storage pools**: their own pages, each with create, edit and
  delete, because a container's configuration refers to all three.
- **Logs**: the log files Incus keeps for an instance, tailed.
- **Terminal and console**: an interactive shell and the tty console, over xterm.js.
- **Live updates**: the list follows `incus monitor`, and says so when it cannot.

### A container, in detail

Identity, the profiles it applies, and what it is using. Disk says plainly that Incus
reports no usage for a `dir` pool rather than showing `0 B`.

![The container overview](docs/screenshot-overview.png)

### Every setting the server has

The settings reached for daily come first, translated and validated, with the server's own
default beside each. Everything else Incus advertises is generated from its option table
and grouped as Incus groups it, so the count in each heading is what that server actually
carries rather than what someone remembered to type out.

![The configuration tab](docs/screenshot-configuration.png)

### Images, browsed rather than typed

The remote's catalogue, filtered, with sizes. Downloading is its own tab: a create never
turns into a silent multi-minute download.

![Pulling an image](docs/screenshot-images.png)

### A shell in the container

xterm.js over a Cockpit pty, with working resize and 256 colours. The font size is
remembered, and the sizes offered are the ones whose line height lands on the 4px grid.

![The terminal](docs/screenshot-terminal.png)

## Supported distributions

Three, and each has a package built and published by CI from the same source tarball:

| Distribution        | Package                | Built on                |
|---------------------|------------------------|-------------------------|
| RHEL and rebuilds   | `.rpm`                 | Fedora, `noarch`        |
| Debian and Ubuntu   | `.deb`                 | Debian, `Architecture: all` |
| Arch                | `.pkg.tar.zst`         | Arch, `any`             |

The plugin is a bundle of static assets with no compiled component, so the packages are
architecture-independent and the build host's distribution does not constrain where they
install. Anything else with Cockpit and Incus will very likely work from the source
install below; it is simply not something this project builds or tests.

## Requirements

On the managed host:

- `cockpit` >= 300
- `incus` >= 6.0 LTS, both the daemon and the `incus` CLI binary

The CLI is not optional. Incus exposes exec and events as websockets, which
`cockpit.http()` cannot upgrade to, so the terminal and the event stream are both carried
by the `incus` binary.

Administrative access is required: the Incus socket is owned `root:incus-admin`.

## Install

Download the package for your distribution from the
[latest release](https://github.com/heavycaffeiner/cockpit-lxc/releases/latest), check it
against the published `SHA256SUMS`, and install it:

```sh
sudo dnf install ./cockpit-lxc-*.rpm          # RHEL
sudo apt install ./cockpit-lxc_*_all.deb      # Debian
sudo pacman -U ./cockpit-lxc-*.pkg.tar.zst    # Arch
```

From source:

```sh
npm install
make build
make devinstall       # symlink dist/ into ~/.local/share/cockpit/lxc
sudo make install     # or copy into /usr/share/cockpit/lxc
```

Or build the package yourself: `make rpm`, `make deb` or `make arch`, each of which runs
`make dist` first so nothing is packaged that would not pass CI.

## Checks

```sh
make check            # typecheck + eslint + stylelint
```

`make check` is the gate and CI fails on any of it.

### Verifying against a real Cockpit

`make check` cannot tell you the plugin works, only that it compiles. Several faults have
shipped past it, and every one was invisible without a live session:

- `cockpit.superuser` does not exist on the base1 global, so calling it threw on mount
- `cockpit.http` `request()` hangs forever when `body` is omitted
- setting `Origins` in `cockpit.conf` replaces the same-origin default
- the live event stream refreshed the ETag under an open form, defeating the conflict
  detection that ETag existed for

All of them hid behind a smoke test that replaced `cockpit.js` with a stub. A stub agrees
with whatever assumption you encode in it. There are now two ways to avoid that.

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

`border-*` and `outline-*` are exempt: a 1px border is not spacing.

Append `?grid=1` to the page URL to paint the baseline over the page. The overlay is
constant-folded out of production builds; use `NODE_ENV=development npm run build` for a
readable, unminified bundle.

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
build/gen-en.mjs             bundles po/en.po and generates the key tree
build/check-catalogues.mjs   the catalogue gate, in place of xgettext
packaging/                   rpm spec and debian packaging
po/en.po, po/ko.po           the catalogues, keyed by stable message id
test/session-smoke.py        real-session verification
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

## License

LGPL-2.1-or-later, matching Cockpit. `LICENSE` carries the full text.
