export const tradingSchema=`
create table if not exists jolly_trade_sessions(token_hash text primary key, wallet text not null, expires_at timestamptz not null);
create table if not exists jolly_trade_challenges(token_hash text primary key, wallet text not null, message text not null, origin text not null, expires_at timestamptz not null);
create table if not exists jolly_trade_agents(
 id uuid primary key default gen_random_uuid(), owner_key text not null, template text not null,
 mode text not null check(mode in ('paper','live')), status text not null default 'paused' check(status in ('paused','running','loss_limit','review')),
 settings jsonb not null, wallet_id text unique, wallet_address text unique,
 paper_cash numeric(78,0) not null, cash numeric(78,0) not null default 0, equity numeric(78,0) not null default 0,
 realized numeric(78,0) not null default 0, day_key text not null default '', day_start_mark numeric(78,0) not null default 0,
 day_realized numeric(78,0) not null default 0, daily_pnl numeric(78,0) not null default 0,
 day_spend numeric(78,0) not null default 0, day_trades integer not null default 0,
 blocked_reason text, last_entry_at timestamptz, last_review_at timestamptz,
 created_at timestamptz not null default now(), updated_at timestamptz not null default now(), unique(owner_key,template,mode)
);
create index if not exists jolly_trade_agents_owner on jolly_trade_agents(owner_key);
create table if not exists jolly_trade_wallet_keys(
 agent_id uuid primary key references jolly_trade_agents(id),
 encrypted_key text not null, created_at timestamptz not null default now()
);
create table if not exists jolly_trade_positions(
 id uuid primary key default gen_random_uuid(), agent_id uuid not null references jolly_trade_agents(id),
 token text not null, curve text not null, symbol text not null, amount numeric(78,0) not null,
 entry numeric(78,0) not null, mark numeric(78,0) not null, status text not null default 'open',
 opened_at timestamptz not null default now(), marked_at timestamptz not null default now(), closed_at timestamptz
);
create index if not exists jolly_trade_positions_agent on jolly_trade_positions(agent_id,status);
create table if not exists jolly_trade_orders(
 id uuid primary key default gen_random_uuid(), agent_id uuid not null references jolly_trade_agents(id),
 kind text not null check(kind in ('buy','sell','withdraw','approve','unwrap')), status text not null,
 request_key text not null, token text, curve text, symbol text, position_id uuid references jolly_trade_positions(id),
 amount numeric(78,0) not null, token_amount numeric(78,0), minimum_out numeric(78,0),
 destination text, tx_hash text unique, signed_tx text, gas_paid numeric(78,0) not null default 0,
 created_at timestamptz not null default now(), updated_at timestamptz not null default now(), unique(agent_id,request_key)
);
create index if not exists jolly_trade_orders_agent on jolly_trade_orders(agent_id,created_at desc);
create table if not exists jolly_trade_tokens(token text primary key, curve text not null, symbol text not null default '',
 launched_at timestamptz not null, prior_quote numeric(78,0), checked_at timestamptz);
create table if not exists jolly_trade_engine(key text primary key,value jsonb not null,updated_at timestamptz not null default now());
`;
