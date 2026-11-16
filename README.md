# Manhunt — Field Game demo

A dependency-free, mobile-first HTML/CSS/JavaScript PWA demonstrating a complete Manhunt round on one device. All players, tags, map markers, boundary status, and voice-room controls are samples. No accounts, server, GPS, microphone permission, or live audio.

## Run it locally

Serve this directory over HTTP (service workers do not run from `file://`):

```bash
python3 -m http.server 8080
```

Then open `http://localhost:8080` on that computer. All app assets use relative paths, including the manifest and service worker, so the app also works under a GitHub Pages project path. HTTPS (or localhost) is required for service workers and installation. For a phone, use an HTTPS static host or development tunnel rather than the phone’s localhost.

## Try the complete flow

1. **Host a game** with a location label, 1–60 minute round, and 0–300 second head start. For a quick tour, choose 1 minute and 5 seconds.
2. Copy the generated code in the lobby. To try **Join a game**, return to Start and enter that code in the same tab. Joining previews a guest; “Switch to local host controls” returns control to this device’s host. This does not create a real participant.
3. Assign sample teams in the host lobby. Each side must have at least one player. Confirm assignment changes; your role locks once the match starts.
4. **Start game** begins the head start, then the round. Pause/resume works in both phases. Safety stop immediately pauses locally; closing its dialog does not resume and no alert is sent.
5. During the active round, simulate a tag, then confirm it to send a Runner to jail or dispute it to leave them free. A confirmed jailbreak releases all prisoners.
6. Jail every Runner simultaneously for a Hunter win. Let the clock expire with a free Runner for a Runner win, or use the confirmed **Simulate time running out** shortcut. **Play again** returns to the lobby without starting a countdown.

**Hunter Radio** and **Runner Relay** retain separate visual treatments. Only the assigned team’s preview controls are available. Opening a room or toggling a preview never connects a call or uses audio.

Waiting lobbies are saved in `sessionStorage` for this tab’s browser session. Codes do not connect tabs or devices; a started round is no longer joinable. Reloading ends a running round. If storage is blocked, the demo works in memory and explains the limitation. Clipboard denial shows a selectable code instead.

The cached app shell supports repeat visits offline. On iPhone Safari, use **Share → Add to Home Screen**; on supported Android browsers, use the browser’s install/add-to-home-screen option. Installation availability depends on the browser and secure hosting. This task does not include native packaging.

## Important implementation boundaries

`game.js` owns explicit setup, lobby, head-start, active, paused, and finished states and pure transitions. `app.js` handles rendering, local lobby storage, user confirmations, and the clock driver. Absolute monotonic deadlines avoid interval drift and account for background-tab delays; paused and finished states have no running interval. Demo shortcuts use the same state transitions as the regular flow.

The illustrative map is not a real location and its static markers are not tied to the roster. Safety stop cannot notify anyone or provide emergency assistance. This demo must not be relied on to supervise a real outdoor game.

The reference for the core real-world game loop was [Manhunt IRL](https://manhuntgame.com/), whose published overview describes Hunters, Runners, jail, and jailbreaks. This repository's visual design and copy are an original prototype, not a copy of that site's app or branding.

## Next useful steps

1. Add authenticated game membership, server-authoritative state/timers, durable lobby codes, reconnection, and conflict handling for tags and disputes.
2. Add explicit location consent, map/geofence validation, accuracy/stale-location cues, minimized retention, and a safety/privacy review. Never treat browser GPS or message delivery as a safety guarantee.
3. Agree on open-mic versus push-to-talk behavior, then integrate real-time voice with server-issued team-scoped room authorization, explicit permission, mute/leave behavior, and interruption handling.
4. Test installation, background behavior, accessibility, and permissions on physical iPhones and Android devices. Keep the web app as the core; evaluate Android APK packaging later.

## Checks

```bash
node --test game.test.js sw.test.js
node --check game.js
node --check app.js
node --check sw.js
git diff --check
```

`tools/browser-check.cjs` provides optional end-to-end Chromium checks using an **existing external** Puppeteer Core installation, without adding a runtime or project dependency:

```bash
node tools/browser-check.cjs /absolute/path/to/puppeteer-core /absolute/path/to/chrome
```

It serves the app under `/manhunt/`, exercises the flow and error paths, checks 320/360/1280px layouts, verifies offline assets, and saves screenshots to a temporary directory. It advances a test-only clock rather than waiting for real rounds. Chromium emulation does not replace physical iPhone Safari/Android testing.

Regenerate the original PWA icons with `python tools/generate-icons.py` (Python standard library only).
