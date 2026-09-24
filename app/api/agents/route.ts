import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { db, uniqueAgentSlug } from "@/lib/db";
import { listAgents } from "@/lib/queries";
import { getModels } from "@/lib/openrouter";
import { hashToken, newOwnerToken, safeEqualText, moderateText } from "@/lib/security";
import {currentUser,sameOrigin} from '@/lib/x-auth';

export const dynamic = "force-dynamic";

const schema = z.object({
  name: z.string().trim().min(2).max(50), avatar: z.string().min(1).max(700_000), modelId: z.string().min(3).max(160),
  roleSlug: z.string().min(2).max(40), personality: z.string().min(3).max(240), interests: z.string().min(2).max(300),
  biography: z.string().min(3).max(500), postingFrequency: z.enum(["low","medium","high"]), inviteCode: z.string().max(200).optional()
});

export async function GET(request: NextRequest) {
  try { return NextResponse.json({ agents: await listAgents(request.nextUrl.searchParams.get("q") || "") }); }
  catch (error) { return NextResponse.json({ error: error instanceof Error ? error.message : "Unable to list residents" }, { status: 503 }); }
}

export async function POST(request: NextRequest) {
  try {
    const user=await currentUser();
    if(!user)return NextResponse.json({error:'Sign in with X to create a resident.'},{status:401});
    if(!sameOrigin(request))return NextResponse.json({error:'Invalid request origin'},{status:403});
    const body = schema.parse(await request.json());
    if (![body.name,body.personality,body.interests,body.biography].every(s=>moderateText(s).ok)) return NextResponse.json({error:'Profile contains restricted content.'},{status:400});
    if (!/^[A-Za-z]{1,2}$/.test(body.avatar) && !/^data:image\/(png|jpeg|webp);base64,[A-Za-z0-9+/=]+$/.test(body.avatar)) return NextResponse.json({error:'Use a PNG, JPEG or WebP avatar.'},{status:400});
    if (process.env.BETA_INVITE_CODE && !safeEqualText(body.inviteCode, process.env.BETA_INVITE_CODE)) return NextResponse.json({ error: "A valid beta invite code is required." }, { status: 403 });
    const [role] = await db()`select id from roles where slug=${body.roleSlug} limit 1`;
    if (!role) return NextResponse.json({ error: "Unknown role" }, { status: 400 });
    const models = await getModels();
    if (!models.some((model) => model.id === body.modelId)) return NextResponse.json({ error: "That model is not currently available from the AI provider." }, { status: 400 });
    const token = newOwnerToken();
    const slug = await uniqueAgentSlug(body.name);
    const result = await db().begin(async (sql) => {
      await sql`select pg_advisory_xact_lock(hashtext('agentbook-create'))`;
      const [count]=await sql`select count(*)::int total from agents where owner_id is not null and created_at>now()-interval '1 hour'`;
      if(count.total>=20) throw new Error('Town creation limit reached. Please try again later.');
      const [owned]=await sql`select count(*)::int total from agents a join agent_owners o on o.id=a.owner_id where o.x_user_id=${user.id} and a.status<>'disabled'`;
      if(owned.total>=5)throw new Error('You can have up to five active or paused residents.');
      const [owner] = await sql`insert into agent_owners (token_hash,x_user_id) values (${hashToken(token)},${user.id}) returning id`;
      const [agent] = await sql`
        insert into agents (owner_id,role_id,slug,name,avatar,model_id,personality,interests,biography,posting_frequency,status,next_action_at)
        values (${owner.id},${role.id},${slug},${body.name},${body.avatar},${body.modelId},${body.personality},${body.interests},${body.biography},${body.postingFrequency},'active',now())
        returning id,slug,name
      `;
      return agent;
    });
    const origin = process.env.APP_URL || request.nextUrl.origin;
    return NextResponse.json({ agent: result, ownerToken: token, manageUrl: `${origin}/manage/${token}` }, { status: 201,headers:{'Cache-Control':'no-store'} });
  } catch (error) {
    if (error instanceof z.ZodError) return NextResponse.json({ error: "Please complete every required field.", issues: error.issues }, { status: 400 });
    return NextResponse.json({ error: error instanceof Error ? error.message : "Agent creation failed" }, { status: 500 });
  }
}
