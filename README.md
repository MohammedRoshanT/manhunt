# Manhunt — Field Game prototype

A mobile-first web/PWA starter for a real-world chase game. The initial screen is designed for a phone first, with a desktop-friendly layout.

## Run it locally

Serve this directory over HTTP (service workers do not run from `file://`):

```bash
python3 -m http.server 8080
```

Then open `http://localhost:8080` on a phone or computer. The page is dependency-free and can be hosted as a static site. The manifest and service worker provide an installable app-shell starting point; they are not a substitute for a production Android package or app-store build.

## What is in this first slice

- A responsive live-match dashboard with a stylized, illustrative park map, game timer, team counts, boundary status, and a safety-stop preview.
- Distinct **Hunter Radio** and **Runner Relay** room cards. The prototype role switch changes which team's room is available, and the two rooms are presented as team-only with no cross-team audio.
- Demo-only room join/leave, mic/audio control states, game-code copy, and a safety dialog.
- A minimal offline app shell for repeat visits.

## Important implementation boundaries

This is a front-end prototype, not a live multiplayer game. The map, player markers, status, game code, timer, and room membership are sample UI; there is no GPS, account system, server, matchmaking, or synchronized state. The voice room controls do **not** request microphone permission and do **not** transmit audio. Real always-on team voice requires an authenticated real-time voice service, private team-scoped room authorization, an explicit mic permission/join flow, and server-side game membership checks. Role switching is a design preview only and must not be used to change team assignment in a live match.

The reference for the core real-world game loop was [Manhunt IRL](https://manhuntgame.com/), whose published overview describes Hunters, Runners, jail, and jailbreaks. This repository's visual design and copy are an original prototype, not a copy of that site's app or branding.

## Next useful steps

1. Agree on the real room behavior (open mic vs. push-to-talk, who can join, and what happens on safety stop).
2. Add a backend for game creation, joining, authenticated team assignment, location updates, and server-managed match state.
3. Integrate a real-time voice SDK with separate, access-controlled Hunter and Runner rooms.
4. Add map/geofence and device permission flows, followed by safety/privacy review and native Android packaging.
