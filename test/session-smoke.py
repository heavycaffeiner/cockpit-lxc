#!/usr/bin/env python3
"""
Drive a real Cockpit session in headless Chromium and report what the plugin did.

Why this exists
---------------
The plugin's first smoke test replaced Cockpit's client library with a stub. A
stub agrees with every assumption you encode in it, so it cannot tell you that an
API you invented does not exist. Three faults shipped behind that agreement:

  * cockpit.superuser is not on the base1 global, so calling it threw on mount
  * cockpit.http request() hangs forever when `body` is omitted
  * setting Origins in cockpit.conf replaces the same-origin default

Every one of them is invisible without a real session, and every one of them is
caught by this script. Run it against a host before believing a build works.

Usage
-----
    python3 session-smoke.py --host https://127.0.0.1:9090 \
        --user dev --password secret --page lxc --escalate \
        --expect-rows app01,db01,web01

    # ad-hoc probing inside the plugin frame
    python3 session-smoke.py ... --eval 'w.cockpit.transport.origin'

Requirements: chromium-browser and the websocket-client package.
Exit status is 0 only when every requested check passed.
"""

import argparse
import base64
import json
import subprocess
import sys
import time
import urllib.request

try:
    import websocket  # type: ignore
except ImportError:
    sys.exit("session-smoke: needs websocket-client (pip install --user websocket-client)")


class Session:
    """A headless Chromium driven over the DevTools protocol."""

    def __init__(self, port: int, profile: str) -> None:
        self.port = port
        self._next_id = 0
        self.exceptions: list[str] = []
        self.console: list[str] = []
        self.chrome = subprocess.Popen(
            [
                "chromium-browser", "--headless", "--no-sandbox", "--disable-gpu",
                f"--remote-debugging-port={port}", "--remote-allow-origins=*",
                # The host serves a self-signed certificate on the direct port.
                "--ignore-certificate-errors",
                "--window-size=1400,900", f"--user-data-dir={profile}", "about:blank",
            ],
            stdout=subprocess.DEVNULL,
            stderr=subprocess.DEVNULL,
        )
        self.ws = websocket.create_connection(self._page_target(), suppress_origin=True)
        self.send("Runtime.enable")
        self.send("Page.enable")

    def _page_target(self) -> str:
        for _ in range(60):
            try:
                raw = urllib.request.urlopen(f"http://127.0.0.1:{self.port}/json").read()
                for target in json.loads(raw):
                    if target["type"] == "page":
                        return target["webSocketDebuggerUrl"]
            except Exception:
                pass
            time.sleep(0.5)
        raise RuntimeError("chromium devtools never came up")

    def _record(self, message: dict) -> None:
        method = message.get("method")
        if method == "Runtime.exceptionThrown":
            details = message["params"]["exceptionDetails"]
            text = (details.get("exception") or {}).get("description") or details.get("text")
            self.exceptions.append(str(text))
        elif method == "Runtime.consoleAPICalled":
            params = message["params"]
            args = " ".join(
                str(a.get("value", a.get("description", ""))) for a in params.get("args", [])
            )
            self.console.append(f"[{params['type']}] {args}")

    def send(self, method: str, params: dict | None = None) -> dict:
        self._next_id += 1
        message_id = self._next_id
        self.ws.send(json.dumps({"id": message_id, "method": method, "params": params or {}}))
        while True:
            message = json.loads(self.ws.recv())
            self._record(message)
            if message.get("id") == message_id:
                return message

    def evaluate(self, expression: str, await_promise: bool = False, timeout: int = 40):
        reply = self.send("Runtime.evaluate", {
            "expression": expression,
            "returnByValue": True,
            "awaitPromise": await_promise,
            "timeout": timeout * 1000,
        })
        result = reply.get("result", {})
        if "exceptionDetails" in result:
            return "EVAL-EXCEPTION: " + json.dumps(result["exceptionDetails"])[:400]
        return result.get("result", {}).get("value")

    def screenshot(self, path: str) -> None:
        reply = self.send("Page.captureScreenshot", {"format": "png"})
        data = reply.get("result", {}).get("data")
        if data:
            with open(path, "wb") as handle:
                handle.write(base64.b64decode(data))

    def close(self) -> None:
        try:
            self.ws.close()
        finally:
            self.chrome.terminate()


# Bound inside every frame expression: `w` is the plugin frame's window.
FRAME_PRELUDE = (
    "var __f = Array.from(document.querySelectorAll('iframe'))"
    ".filter(function (x) { return (x.getAttribute('name') || '').indexOf('%s') >= 0; })[0];"
    "if (!__f) throw new Error('plugin frame not found');"
    "var w = __f.contentWindow, d = __f.contentDocument;"
)


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--host", default="https://127.0.0.1:9090")
    parser.add_argument("--user", default="dev")
    parser.add_argument("--password", required=True)
    parser.add_argument("--page", default="lxc", help="Cockpit package name to open")
    parser.add_argument("--escalate", action="store_true",
                        help="turn on administrative access after logging in")
    parser.add_argument("--expect-rows", default="",
                        help="comma-separated container names the table must show")
    parser.add_argument("--expect-text", default="",
                        help="substring the plugin frame must contain")
    parser.add_argument("--eval", dest="expression", default="",
                        help="expression to run inside the plugin frame")
    parser.add_argument("--screenshot", default="")
    parser.add_argument("--port", type=int, default=9222)
    parser.add_argument("--profile", default="/tmp/cockpit-smoke-profile")
    args = parser.parse_args()

    subprocess.run(["rm", "-rf", args.profile], check=False)
    session = Session(args.port, args.profile)
    failures: list[str] = []

    try:
        session.send("Page.navigate", {"url": f"{args.host}/{args.page}"})
        time.sleep(5)

        login = session.evaluate(f"""
        (function () {{
            var u = document.getElementById('login-user-input');
            var p = document.getElementById('login-password-input');
            if (!u || !p) return 'no-login-form';
            u.value = {json.dumps(args.user)};
            p.value = {json.dumps(args.password)};
            u.dispatchEvent(new Event('input', {{ bubbles: true }}));
            p.dispatchEvent(new Event('input', {{ bubbles: true }}));
            document.getElementById('login-button').click();
            return 'submitted';
        }})()
        """)
        print(f"login: {login}")
        if login == "no-login-form":
            failures.append("login form never appeared")
        time.sleep(14)

        if args.escalate:
            # The shell labels the control "Limited access" until it is granted.
            clicked = session.evaluate("""
            (function () {
                var b = Array.from(document.querySelectorAll('button'))
                    .filter(function (x) { return /limited access/i.test(x.innerText || ''); });
                if (!b.length) return 'already granted or control missing';
                b[0].click();
                return 'clicked';
            })()
            """)
            time.sleep(6)
            session.evaluate("""
            (function () {
                var m = document.querySelector('[role=dialog], .pf-v6-c-modal-box');
                if (!m) return;
                var b = Array.from(m.querySelectorAll('button'))
                    .filter(function (x) { return /close/i.test(x.innerText || ''); });
                if (b.length) b[0].click();
            })()
            """)
            time.sleep(10)
            state = session.evaluate("""
            JSON.stringify(Array.from(document.querySelectorAll('button'))
                .filter(function (x) { return /access/i.test(x.innerText || ''); })
                .map(function (x) { return x.innerText.trim(); }))
            """)
            print(f"escalation: {clicked}; header now {state}")
            if "Administrative access" not in str(state):
                failures.append("administrative access was not granted")

        prelude = FRAME_PRELUDE % args.page

        report = session.evaluate(prelude + """
        JSON.stringify({
            rows: Array.from(d.querySelectorAll('tbody tr td:first-child strong'))
                .map(function (e) { return e.textContent; }),
            spinner: !!d.querySelector('.pf-v6-c-spinner'),
            dark: d.documentElement.classList.contains('pf-v6-theme-dark'),
            text: (d.body.innerText || '').replace(/\\n{2,}/g, '\\n').slice(0, 600)
        })
        """)
        print("frame:", report)

        parsed = {}
        try:
            parsed = json.loads(report) if isinstance(report, str) else {}
        except (TypeError, ValueError):
            failures.append(f"could not read the plugin frame: {report}")

        expected = [r for r in args.expect_rows.split(",") if r]
        if expected:
            actual = parsed.get("rows", [])
            missing = [r for r in expected if r not in actual]
            if missing:
                failures.append(f"rows missing from the table: {missing} (saw {actual})")

        if args.expect_text and args.expect_text not in parsed.get("text", ""):
            failures.append(f"frame did not contain {args.expect_text!r}")

        # Errors raised inside the frame are the ones that matter; a stub-based
        # test cannot see them because it never gets a frame.
        frame_errors = session.evaluate(prelude + """
        JSON.stringify((w.__smokeErrors || []).slice(0, 10))
        """)
        if frame_errors and frame_errors not in ("[]", None):
            print("frame errors:", frame_errors)

        if args.expression:
            print("eval:", session.evaluate(prelude + args.expression, await_promise=True, timeout=60))

        if args.screenshot:
            session.screenshot(args.screenshot)
            print(f"screenshot: {args.screenshot}")

        if session.exceptions:
            print("top-level exceptions:")
            for item in session.exceptions[-10:]:
                print("  ", item[:300])
    finally:
        session.close()

    if failures:
        print("\nFAILED:")
        for failure in failures:
            print("  -", failure)
        return 1

    print("\nOK")
    return 0


if __name__ == "__main__":
    sys.exit(main())
