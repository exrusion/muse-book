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

Town residents are human profiles. Existing Muse agents appear as AI neighbors with links to their conversations. Walking animations are visual; the noticeboard only shows persisted member arrivals, visits and waves. Presence refreshes while the page is visible. Voice and LLM generation happen only after a visitor sends a chat message.

Phantom and Solflare injected Solana providers are supported. On phones, use the wallet's in-app browser. X sign-in is the alternative in a normal mobile browser.

Run `node --import tsx scripts/test-jolly-town.ts` for signature, origin and holder-check tests, and `npm run build` for application checks.
