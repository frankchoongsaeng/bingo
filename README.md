# Friday Night Bingo

A real-time multiplayer bingo game with a retro social-hall look — cream
tickets on a felt-green table, glossy called balls, and ink-dauber marks.
Open a session, share the code, and daub your way to a BINGO with friends,
live over the internet.

- **Classic 75-ball bingo.** Each player gets a 5×5 card (B/I/N/G/O columns with
  a free centre square).
- **Take turns calling.** Once the host starts, players take turns picking a
  square on their own card and calling that number. Every call plays for everyone
  and is pushed instantly over Server-Sent Events, then the turn passes to the
  next player.
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

### Deploying (Docker / Coolify / any host)

The frontend and backend are **one service**: `server.js` serves the built SPA
*and* the `/api/bingo` API on the same port. Deploy them together — do **not**
serve `dist/` from a static file server on its own. A static host answers `GET`
requests (so the app loads) but rejects the API's `POST` requests with
**`405 Method Not Allowed`**, so creating or joining a room fails.

A `Dockerfile` is included that builds the SPA and runs the single Node server:

```bash
docker build -t friday-night-bingo .
docker run -p 3000:3000 friday-night-bingo   # http://localhost:3000
```

Any host that runs the container — or simply runs `npm run build && npm start`
behind a reverse proxy — works the same way.

#### Coolify

The safest option is the **Docker Compose** build pack pointed at the included
`docker-compose.yaml`, then attach your domain to the `bingo` service on port
**`3000`**. A Compose deployment always *runs* the container, so it can't fall
back to static file serving.

If you use the **Dockerfile** build pack instead, make sure the application is
**not** marked as a static site:

- Turn **off** any "Static Site" option. Coolify serves static sites with
  Caddy's file server, which answers `GET` (so the page loads) but rejects the
  API's `POST` requests with **`405 Method Not Allowed`** — the classic "the app
  loads but I can't create a room" symptom. If a `POST` to
  `/api/bingo/rooms` comes back with `Server: Caddy` and `Allow: GET, HEAD`,
  the site is being served statically and the Node server isn't running.
- Set **Ports Exposes** to **`3000`**.
- Confirm the deployment actually succeeded (a failed build leaves the previous
  static deployment live) and that your domain is attached to *this* resource.

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
