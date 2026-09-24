# Jolly Town

The public town is `/town`; the original one-to-one mascot chat stays at `/jolly`.

Residents sign in through the existing X OAuth flow or sign a single-use, expiring Solana wallet challenge. Names, accent colours and places live in PostgreSQL. The migration runs on app startup. Public responses exclude wallet addresses, owner keys, sessions and X account identifiers.

Town membership is open before the coin launch. To enable token verification for wallet entry, configure these **server-only** Railway variables:

| Variable | Purpose |
| --- | --- |
| `JOLLY_TOKEN_MINT` | The Solana mainnet token mint. Leave unset until launch. |
| `JOLLY_SOLANA_RPC_URL` | An HTTPS Solana mainnet RPC endpoint. Defaults to public mainnet RPC. |
| `JOLLY_TOKEN_MIN_RAW` | Required amount in the token's smallest units, default `1`. For one token with 6 decimals use `1000000`. |

X entry remains open. Wallet entry checks the configured mint balance on profile creation and rechecks active membership at most every five minutes. RPC errors fail verification rather than granting access. The holder badge expires with the verification window. No transaction, approval or token transfer is requested.

Town residents are human profiles. Existing Muse agents appear as AI neighbors with links to their conversations. Signed-in members control their Jolly with WASD, arrow keys, or the on-screen direction pad. The camera follows the player; drag to orbit. AI neighbors retain cosmetic wandering. The noticeboard only shows persisted member arrivals, visits and waves. Presence refreshes while the page is visible. Voice and LLM generation happen only after a visitor sends a chat message.

Phantom and Solflare injected Solana providers are supported. On phones, use the wallet's in-app browser. X sign-in is the alternative in a normal mobile browser.

Run `node --import tsx scripts/test-jolly-town.ts` for signature, origin and holder-check tests, and `npm run build` for application checks.

## Live walking

`POST /api/jolly/town/position` authenticates the X or wallet session, validates movement speed, boundaries and building collisions, and persists only that identity’s resident. A monotonic version rejects stale updates and competing tabs. The client predicts its own movement immediately and smooths remote positions.

`GET /api/jolly/town/live` streams public positions over SSE. PostgreSQL LISTEN/NOTIFY distributes committed updates across app instances; ten-second snapshots recover missed updates and refresh online status. Clients reconnect automatically and suspend streams while hidden. No extra service or API key is required. Movement never calls an LLM or voice model.

The 3D view renders a limited set of neighbors for mobile performance; the map shows the loaded roster. This is an initial shared town, not a load-tested large-scale game server.

Run `node --import tsx scripts/test-town-movement.ts` for safe spawns, walking boundaries, collision sliding and wall-tunneling checks.

## Expanded layout

The town contains 12 destinations over a 61 × 49 land footprint (previously 33 × 31). The movement boundary covers approximately 3.1 times the original area. Existing destinations, resident coordinates, and the harbor remain in place. Lantern Market, Storybook Library, Starlight Observatory, Sunrise Heights, Blossom Park, and Sunset Square extend the town north, east, and west.

`lib/jolly-town-layout.ts` is the shared source for building footprints, streets, map coordinates, and movement bounds. The Places menu, joining form, visit API, nearest-place tracking, and guide context use the same destination catalog. No database migration is required. Static city meshes remain merged by material and the visible 3D resident limit is unchanged.

## Time, weather, and offshore ships

The town clock uses `America/New_York` (US Eastern), including daylight saving. Daylight ramps up from 6:00–7:30 AM and down from 6:30–8:00 PM Eastern. Public town responses include server time to anchor the clock; clients update every ten seconds and resync on roster refresh.

Weather is an explicitly simulated, deterministic 45-minute cycle shared by visitors: clear, cloudy, rain, or thunderstorm. The time/weather panel offers local weather previews and a lightning toggle. Storms have a single soft lightning pulse approximately every 40 seconds. Reduced motion disables lightning and movement of rain, clouds, and ships. Three ships follow offshore paths shared by the 3D scene and full map.

Run `node --import tsx scripts/test-town-weather.ts` to verify US Eastern/DST, lighting transitions, weather variety, lightning cadence, and clearance between ships and land.
