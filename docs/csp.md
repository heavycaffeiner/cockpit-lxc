# Why this package widens the style CSP

`src/manifest.json` declares:

```json
"content-security-policy": "img-src 'self' data:; style-src 'self' 'unsafe-inline'"
```

Cockpit's default policy is `default-src 'self'` with no `style-src`, so inline styles fall
back to `default-src` and are blocked.

## What needs it

xterm.js maintains a hidden accessibility tree when `screenReaderMode` is on, and positions
it with inline styles. Without the grant, opening the terminal logs sixteen CSP violations
per session. The list page on its own logs none, so this is the terminal and nothing else.

Cockpit's own terminal avoids the problem by setting `screenReaderMode: false`. That makes
its terminal opaque to a screen reader, which is a gap in Cockpit rather than a pattern
worth copying, and section 4.3.8 of the proposal commits this plugin to the opposite
choice: xterm renders to a canvas, so without the accessibility buffer there is nothing for
assistive technology to read at all.

## What it costs

The grant is `style-src` only. Scripts stay pinned to `'self'`, which is where the serious
risk lives: `unsafe-inline` on `script-src` would turn any injected string into executable
code, and that directive is untouched.

For styles the realistic attack is CSS-based exfiltration or UI redressing, and both need an
injection point. This package has none:

- every Incus-supplied string is rendered through React, which escapes by default
- there is no `dangerouslySetInnerHTML`, no `innerHTML`, and no template that concatenates
  API data into markup
- no stylesheet content is ever built from API data

If that stops being true, this grant stops being safe, and the honest fix at that point is
to remove the grant and lose the terminal's screen reader support rather than to keep both.

## The alternative that was rejected

Turning `screenReaderMode` off removes the need for the grant and matches Cockpit. It also
makes the terminal unusable with assistive technology. Accessibility is not a feature this
project drops for tidiness, so the narrower widening was preferred over the broader
regression.
