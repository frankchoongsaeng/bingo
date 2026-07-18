# Realtime Bingo

A real-time multiplayer bingo game. Create a room, share the code, and race
your friends to a bingo — live over the internet.

- **Classic 75-ball bingo.** Each player gets a 5×5 card (B/I/N/G/O columns with
  a free centre square).
- **Take turns calling.** Once the host starts, players take turns picking which
  number to call. Every call plays for everyone and is pushed instantly over
  Server-Sent Events, then the turn passes to the next player.
- **Spell out BINGO.** The default win mode is to complete five lines — one for
  each letter of B-I-N-G-O. You can also play for any single line or a full
  blackout.
- **Race to win.** Cards auto-daub called numbers. The first player to complete
  the winning pattern and hit **BINGO!** wins — the server is the sole judge, so
  premature claims are rejected.
- **Zero setup for players.** No accounts. Pick a name, share a 5-letter room
  code, play.

## Tech

- **Frontend:** React + Vite single-page app, [React Router](https://reactrouter.com/)
  for routing, Tailwind CSS v4, and a handful of
  [shadcn/ui](https://ui.shadcn.com/) components.
- **Backend:** A small Express server (`server.js`) that mounts an in-memory game
  engine (`server/bingo.js`) exposing a JSON + SSE API under `/api/bingo`.
- **State is in-memory.** The app runs as a single Node process and keeps rooms
  in a `Map` — nothing is persisted, so rooms reset when the server restarts.
  That's the right lifetime for casual party sessions and means there's no
  database to configure.

## Getting started

```bash
npm install
npm run dev
```

Then open <http://localhost:3000>. To try a real multiplayer game, open the
room link in a second browser (or send it to a friend on the same network /
over the internet) and join with a different name.

### Production build

```bash
npm run build   # type-checks, then builds the SPA into dist/
npm start       # serves the built app + API on PORT (default 3000)
```

## How it works

The game engine lives entirely in `server/bingo.js`:

- `POST /api/bingo/rooms` — create a room and become its host.
- `POST /api/bingo/rooms/:code/join` — join a room's lobby.
- `GET  /api/bingo/rooms/:code/events` — the live Server-Sent Events stream.
- `POST /api/bingo/rooms/:code/start` — host starts the game (turn passes to the host first).
- `POST /api/bingo/rooms/:code/call` — on your turn, call a number for everyone.
- `POST /api/bingo/rooms/:code/claim` — claim a bingo (server-validated).
- `POST /api/bingo/rooms/:code/restart` — host resets to the lobby with fresh cards.
- `POST /api/bingo/rooms/:code/leave` — leave (the host role is handed off if needed).

Every player holds an opaque per-room identity (a `playerId` + secret `token`)
persisted in `localStorage`, so a page reload rejoins the same seat and card.

## Configuration

| Setting        | Where                     | Notes                                   |
| -------------- | ------------------------- | --------------------------------------- |
| Win pattern    | Room creation             | BINGO — five lines (default), any single line, or blackout. |
| `PORT`         | Environment variable      | Server port; defaults to `3000`.        |

## License

MIT
