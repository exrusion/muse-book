import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { db } from "@/lib/db";
import { listAgents } from "@/lib/queries";
import { moderateText } from "@/lib/security";
import { oauthStartUrl, xConfigured } from "@/lib/x-auth";
import { checkHolder, townIdentity, townOriginAllowed, townRateLimited } from "@/lib/jolly-town-auth";
import { accents, guide, places, placeIds, spawnPosition, type TownResident } from "@/lib/jolly-town-shared";
import { positionFor, publishTown } from "@/lib/jolly-town-live";
export const dynamic = "force-dynamic";
const json = (body: unknown, status = 200) => NextResponse.json(body, { status, headers: { "Cache-Control": "no-store" } });
const profileSchema = z.object({ name: z.string().trim().min(2).max(28), accent: z.enum(accents), place: z.enum(placeIds) });
function resident(row: Record<string, unknown>): TownResident {
  return { id: String(row.id), name: String(row.name), accent: String(row.accent), place: String(row.place) as TownResident["place"], kind: "member", role: "Town resident", position:positionFor(row), online: Date.now() - new Date(String(row.last_seen)).getTime() < 45000, holder: !!process.env.JOLLY_TOKEN_MINT && row.holder_mint === process.env.JOLLY_TOKEN_MINT && row.holder === true && Date.now() - new Date(String(row.holder_checked_at)).getTime() < 300000 };
}
export async function GET() {
  try {
    const [identity, agents, members, events, counts] = await Promise.all([
      townIdentity(), listAgents("", 40),
      db()`select id,name,accent,place,last_seen,holder,holder_mint,holder_checked_at,pos_x,pos_z,yaw,moving,motion_seq,last_motion_at from jolly_town_residents order by last_seen desc limit 150`,
      db()`select e.id,r.name,e.action,e.place,e.created_at from jolly_town_events e join jolly_town_residents r on r.id=e.resident_id order by e.created_at desc limit 12`,
      db()`select count(*)::int total from jolly_town_residents`
    ]);
    const [me] = identity ? await db()`select * from jolly_town_residents where owner_key=${identity.key}` : [];
    const residents: TownResident[] = [guide, ...members.map(resident), ...agents.filter(a => a.status !== "disabled").map((a, i): TownResident => ({ id: "agent:" + a.id, name: a.name, accent: accents[i % accents.length], place: places[i % places.length].id, kind: "agent", role: a.roleName, slug: a.slug }))];
    if (me && !residents.some(r => r.id === String(me.id))) residents.push(resident(me));
    return json({ serverTime: Date.now(), residents, me: me ? resident(me) : null, identity: identity ? { name: identity.name, type: identity.wallet ? "wallet" : "x" } : null, events: events.map(e => ({ id: e.id, name: e.name, action: e.action, place: e.place, createdAt: new Date(e.created_at).toISOString() })), memberCount: counts[0].total, tokenConfigured: !!process.env.JOLLY_TOKEN_MINT, xLoginUrl: xConfigured() ? oauthStartUrl("jolly-town") : null });
  } catch { return json({ error: "The town could not load. Please try again." }, 503); }
}
export async function POST(request: NextRequest) {
  if (!townOriginAllowed(request)) return json({ error: "Invalid request origin" }, 403);
  if (townRateLimited(request, "profile", 30)) return json({ error: "Please wait before saving again." }, 429);
  try {
    const identity = await townIdentity(); if (!identity) return json({ error: "Sign in with X or connect your wallet first." }, 401);
    const parsed = profileSchema.safeParse(await request.json());
    if (!parsed.success || !moderateText(parsed.data.name).ok) return json({ error: "Choose a name between 2 and 28 characters." }, 400);
    const holder = identity.wallet ? await checkHolder(identity.wallet) : false;
    if (identity.wallet && process.env.JOLLY_TOKEN_MINT && !holder) return json({ error: "This wallet does not hold the town token. You can also join through X." }, 403);
    const { name, accent, place } = parsed.data;
    const row = await db().begin(async sql => {
      const [existing] = await sql`select id from jolly_town_residents where owner_key=${identity.key}`;
      const [saved] = await sql`insert into jolly_town_residents(owner_key,name,accent,place,holder,holder_mint,holder_checked_at) values(${identity.key},${name},${accent},${place},${holder},${process.env.JOLLY_TOKEN_MINT || ""},now()) on conflict(owner_key) do update set name=excluded.name,accent=excluded.accent,pos_x=case when jolly_town_residents.place<>excluded.place then null else jolly_town_residents.pos_x end,pos_z=case when jolly_town_residents.place<>excluded.place then null else jolly_town_residents.pos_z end,motion_seq=jolly_town_residents.motion_seq+1,moving=false,place=excluded.place,holder=excluded.holder,holder_mint=excluded.holder_mint,holder_checked_at=now(),last_seen=now() returning *`;
      if (!existing) await sql`insert into jolly_town_events(resident_id,action,place) values(${saved.id},'joined',${place})`;
      return saved;
    });
    await publishTown({type:"roster"});
    return json({ me: resident(row) });
  } catch { return json({ error: "Could not save your Jolly. Please try again." }, 503); }
}
export async function PATCH(request: NextRequest) {
  if (!townOriginAllowed(request)) return json({ error: "Invalid request origin" }, 403);
  if (townRateLimited(request, "actions", 160)) return json({ error: "Take a little breather and try again soon." }, 429);
  try {
    const identity = await townIdentity(); if (!identity) return json({ error: "Sign in to join the town." }, 401);
    const action = z.object({ action: z.enum(["heartbeat", "move", "wave"]), place: profileSchema.shape.place.optional() }).safeParse(await request.json());
    if (!action.success || (action.data.action === "move" && !action.data.place)) return json({ error: "Choose a place." }, 400);
    const [me] = await db()`select * from jolly_town_residents where owner_key=${identity.key}`;
    if (!me) return json({ error: "Create your Jolly first." }, 404);
    if (identity.wallet && process.env.JOLLY_TOKEN_MINT && (me.holder_mint !== process.env.JOLLY_TOKEN_MINT || Date.now() - new Date(me.holder_checked_at).getTime() > 300000)) {
      const holder = await checkHolder(identity.wallet);
      await db()`update jolly_town_residents set holder=${holder},holder_mint=${process.env.JOLLY_TOKEN_MINT},holder_checked_at=now() where id=${me.id}`;
      if (!holder) return json({ error: "Holder access could not be verified. Reconnect a holder wallet or sign in through X." }, 403);
    } else if (identity.wallet && process.env.JOLLY_TOKEN_MINT && !me.holder) return json({ error: "A holder wallet is required. You can also join through X." }, 403);
    const place = action.data.action === "move" ? action.data.place! : String(me.place);
    const position = await db().begin(async sql => {
      await sql`select id from jolly_town_residents where id=${me.id} for update`;
      await sql`update jolly_town_residents set place=${place},last_seen=now() where id=${me.id}`;
      if(action.data.action === "move") {
        const point=spawnPosition(String(me.id),place);
        await sql`update jolly_town_residents set pos_x=${point.x},pos_z=${point.z},moving=false,motion_seq=motion_seq+1,last_motion_at=clock_timestamp() where id=${me.id}`;
      }
      if (action.data.action !== "heartbeat") {
        const [recent] = await sql`select id from jolly_town_events where resident_id=${me.id} and created_at>now()-interval '5 seconds' limit 1`;
        if (!recent) await sql`insert into jolly_town_events(resident_id,action,place) values(${me.id},${action.data.action === "move" ? "visited" : "waved"},${place})`;
      }
      const [updated]=await sql`select * from jolly_town_residents where id=${me.id}`;
      const position=positionFor(updated);
      await sql`select pg_notify('jolly_town_live',${JSON.stringify({type:"position",position})})`;
      return position;
    });
    return json({ ok: true, position });
  } catch { return json({ error: "Could not update your place in town. Try again." }, 503); }
}
export async function DELETE(request: NextRequest) {
  if (!townOriginAllowed(request)) return json({ error: "Invalid request origin" }, 403);
  try {
    const identity = await townIdentity(); if (!identity) return json({ error: "Sign in first." }, 401);
    await db()`delete from jolly_town_residents where owner_key=${identity.key}`;
    await publishTown({type:"roster"});
    return json({ removed: true });
  } catch { return json({ error: "Could not remove your town profile." }, 503); }
}
