# PITCH PULSE — Global Wallet Edition

A free-to-deploy Cloudflare Worker classroom investment game. The entire interface is in English.

## Features
- Multiple independent project rooms, each with its own six-digit room code and reveal.
- A single **$10,000,000** budget per team shared across every room in the same game.
- Permanent team identity and private access code (issued by the Host once).
- One irreversible investment per team per room; backend enforces budget and locking.
- Host can reveal each room independently; investments are private before reveal.
- Host session and team session persist in the same browser via localStorage; the actual balances and investments persist in the Durable Object SQLite database.
- Refreshes every 3 seconds for near-real-time updates; no external services or paid database required.

## GitHub / Cloudflare deployment
1. Create a **new GitHub repository** and upload the *contents* of this ZIP (not the ZIP itself). Preserve `public/` folder.
2. Cloudflare Dashboard → Workers & Pages → Create → Import a repository → choose your new repository.
3. Build command: `npm install`. Deploy command: `npx wrangler deploy`.
4. Ensure your Cloudflare account supports **SQLite-backed Durable Objects on the Free plan**. Wrangler uses the `new_sqlite_classes` migration.
5. Open the generated `.workers.dev` URL. Create a game, then teams, then three rooms.
6. Save the Host browser session and copy each team access code when it appears; the codes are intentionally not exposed later. Share each room's six-digit code and the corresponding team's private access code.

## Important operational notes
- **One game = one shared wallet pool.** Create all three project rooms within the same game. Creating a second game creates fresh team wallets.
- The Host session is stored on the Host's browser. Clearing browser storage or leaving the session loses Host access (there is no Host account recovery in this version). Keep the Host device/session safe.
- Team access codes function as credentials. Anyone holding one can act as that team; share privately. There is no email/password login or identity verification.
- Funds are game credits, not real money. Amounts are stored in integer cents.
- SQLite-backed Durable Objects provide persistent state; free-plan quotas and availability follow Cloudflare's current limits.
- This is a classroom demo, not a financial platform or a hardened production authentication system.
