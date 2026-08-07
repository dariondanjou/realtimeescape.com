# RealTimeEscape game server

Authoritative Colyseus server. One private team session = one `burn_window` Room instance.

This is a **separate deploy target from the website.** It holds long-lived WebSocket sessions
and runs a simulation loop, so it does not belong on a serverless platform. Railway, Render and
Fly.io all work; any host that runs a long-lived Node process will do.

## Run locally

```bash
cd game-server
npm install
npm start          # listens on :2567
```

Point the web app at it:

```
NEXT_PUBLIC_GAME_SERVER_URL=ws://localhost:2567
```

## Deploy

```bash
# Railway
railway init && railway up

# Fly
fly launch --name rte-game-server && fly deploy
```

Then set `NEXT_PUBLIC_GAME_SERVER_URL=wss://<your-host>` in the Vercel project and redeploy.

## What lives here

| File | Role |
|---|---|
| `index.mjs` | Process entry, health endpoint, graceful shutdown |
| `BurnWindowRoom.mjs` | Room state schema, message handlers, lifecycle, asymmetric view scoping |
| `../shared/burn.mjs` | Maneuver generation and burn validation — shared verbatim with the web demo |

## The rules this server exists to enforce

1. **The server decides reality.** Clients render and predict; they never declare a puzzle
   solved or a burn successful.
2. **Asymmetric information is enforced here, not in the UI.** The maneuver plan is sent only to
   clients whose player is on the flight deck. Station panel state is sent only to the client at
   that station. If this leaks, the game's central mechanic is gone.
3. **A disconnect never pauses the team clock.** The seat is held for 120 seconds and any
   exclusive lease is released so nothing is orphaned.
4. **A failed burn regenerates the plan.** Retrying gives you a new problem, not another go at
   the same one.
