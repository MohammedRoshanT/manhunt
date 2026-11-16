# Project workflow

- Keep the runtime dependency-free HTML/CSS/JavaScript. Preserve the original park illustration and distinct Hunter/Runner room treatment.
- Run locally with `python -m http.server 8080`. Service workers need HTTPS or localhost; keep all asset URLs relative for project-path hosting.
- Game rules and explicit phase transitions live in `game.js`; browser rendering and session-local lobbies live in `app.js`.
- Verification: `node --test game.test.js sw.test.js`, `node --check game.js`, `node --check app.js`, `node --check sw.js`, and `git diff --check`.
- Optional browser verification: `node tools/browser-check.cjs <absolute-path-to-existing-puppeteer-core> <absolute-path-to-chromium>`. This starts its own local server under `/manhunt/` and writes screenshots outside the repository in the system temporary directory. No project dependency is required.
- `python tools/generate-icons.py` regenerates committed PNG icons using only the Python standard library.
- Voice, markers, players, boundaries, and safety notifications are demo-only. Do not request microphone or location permissions or imply real participant connectivity.
- Waiting lobbies persist in this tab’s session storage. Running matches intentionally do not survive reload. Keep that limitation visible.
- Test both timers, both win conditions, pause/safety behavior, locked assignments, team-only voice controls, and narrow layouts after changes.
