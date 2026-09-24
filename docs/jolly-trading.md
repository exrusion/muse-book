# Jolly trading

The `/trade` desk supports X sessions and signed EVM wallet login. Each account can create one agent per strategy and mode. Practice agents use simulated ETH and on-chain Pons V2 native-pair quotes; they never sign transactions. Practice fills include slippage and a fixed gas estimate, so results are not a promise of live execution. Graduated positions in practice mode cannot currently be priced or closed and remain visibly open.

Live agents use a separate Privy managed wallet per user and strategy. These are operator-managed wallets, not user-controlled smart accounts. The server authorization key can sign for them. No agent receives direct signing access: the backend validates policy, simulates a fixed transaction, verifies the returned signature, and persists signed bytes before broadcasting. A PostgreSQL advisory lock serializes each agent across web and worker processes. Retries rebroadcast identical signed bytes. Unknown outcomes require reconciliation before further transactions.

## Configuration

Set these on the web service and reference the same values from the worker:

- `JOLLY_PRIVY_APP_ID`: Privy application ID.
- `JOLLY_PRIVY_APP_SECRET`: Privy application secret, server only.
- `JOLLY_PRIVY_AUTH_KEY`: base64 PKCS8 P-256 authorization private key, server only. Back it up securely; losing it can prevent access to agent funds.
- `JOLLY_TRADING_RPC_URL`: HTTPS RPC for chain 4663.
- `JOLLY_ZEROX_API_KEY`: 0x API access for graduated-token exits.
- `JOLLY_ZEROX_ALLOWED_TARGETS`: verified router and allowance target addresses, comma separated. Unsupported targets fail closed.
- `JOLLY_TRADING_LIVE_ENABLED`: `false` until live integration is verified.
- Existing `JOLLY_API_KEY`, `JOLLY_API_BASE_URL`, `JOLLY_MODEL`: relay AI decision configuration. Without a valid BUY response the agent waits. The trading service caps AI requests at 500 per UTC day across all users.

The worker runs every 20 seconds, discovers confirmed factory launches, reconciles transactions, updates balances and quotes, applies exits, then evaluates entries. Strategy cooldowns are longer than the worker interval. Heartbeat must be current before an agent starts.

## Limits

Entry checks enforce per-trade amount, total open cost basis, daily buy amount and count, open-position count, loss threshold, fresh pricing, available funds and gas reserve. Day P&L includes realized changes, gas and mark-to-market changes since midnight UTC; deposits do not count as profit. Pause stops new entries while existing stop-loss, take-profit and max-hold exits continue. A daily loss breach blocks entries and attempts exits. These are execution rules, not guaranteed loss caps: slippage, liquidity, outages and price gaps can produce larger losses.

Withdrawals require an authenticated owner, paused agent, no pending transaction and a receiving-wallet signature binding the agent, amount, recipient, nonce, chain and expiry. Funding and withdrawals use ETH on Robinhood Chain only. Graduated exits receive WETH, which is unwrapped in a separate reconciled transaction.

## Before enabling live wallets

Verify provider ownership and signature authorization with a dedicated test wallet; verify chain and deployed factory/curve ABI; verify 0x chain support, quotes and targets. Exercise buy, approval, sell, graduation exit, WETH unwrap, withdrawal, insufficient gas, receipt replay, restart recovery and daily rollover with controlled test funds. Keep public live mode disabled until these checks pass. Practice mode and unit tests do not validate real-fund execution.

Run safeguards with `node --import tsx scripts/test-jolly-trading.ts` and compile with `npm run build`. Migrations run through the existing deployment migration command.
