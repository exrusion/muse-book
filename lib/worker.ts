import { db } from "@/lib/db";
import { chatCompletion, getModels } from "@/lib/openrouter";
import { parseAction } from './actions';
import { moderateText } from "@/lib/security";
import { roleBySlug } from "@/config/roles";
import { enqueuePostForX, enqueueReplyForX } from "@/lib/x-bridge";

async function dailySpend() {
  const [row] = await db()`select coalesce(sum(estimated_cost_usd),0)::float total from generation_runs where created_at >= date_trunc('day', now())`;
  return Number(row.total || 0);
}

function humanizeGeneratedText(value: string, max = 360) {
  const clean = value
    .replace(/[-—–]+/g, " ")
    .replace(/\s+/g, " ")
    .replace(/\s+([,.!?])/g, "$1")
    .trim();
  if (clean.length <= max) return clean;
  const window = clean.slice(0, max + 1);
  const sentence = Math.max(window.lastIndexOf(". "), window.lastIndexOf("! "), window.lastIndexOf("? "));
  if (sentence >= Math.floor(max * 0.55)) return window.slice(0, sentence + 1).trim();
  const word = window.slice(0, max - 1).lastIndexOf(" ");
  return `${window.slice(0, Math.max(word, Math.floor(max * 0.7))).trimEnd()}…`;
}

export async function runWorkerCycle(options: { onlyAgentId?: string } = {}) {
  if (process.env.AUTONOMY_ENABLED !== "true") return { skipped: true, reason: "autonomy_disabled", actions: [] };
  const sql = await db().reserve();
  const [{ locked }] = await sql`select pg_try_advisory_lock(hashtext('agentbook-worker')) locked`;
  if (!locked) { sql.release(); return { skipped: true, reason: "cycle_already_running", actions: [] }; }
  const actions: Array<Record<string, unknown>> = [];
  try {
    const [cadenceMigration] = await sql`
      insert into system_settings(key,value,updated_at)
      values('town_speaking_cadence_v13',${sql.json({ nextAt: new Date().toISOString(), cadence: "random 1 to 3 minutes" })},now())
      on conflict(key) do nothing
      returning key
    `;
    if (cadenceMigration) {
      await sql`update agents set next_action_at=now() where status='active'`;
    }
    const [townCadence] = await sql`
      select value->>'nextAt' as next_at
      from system_settings
      where key='town_speaking_cadence_v13'
    `;
    if (townCadence?.next_at && new Date(String(townCadence.next_at)).getTime() > Date.now()) {
      await sql`insert into worker_heartbeats(status,details) values('cadence_wait',${sql.json({ nextAt: townCadence.next_at })})`;
      return { skipped: true, reason: "town_cadence_wait", actions };
    }
    const catalogue = await getModels();
    const budget = Number(process.env.GLOBAL_DAILY_BUDGET_USD || 10);
    if (await dailySpend() >= budget) {await sql`insert into worker_heartbeats(status,details) values('budget_limited','{}')`;return { skipped: true, reason: "daily_budget_reached", actions };}
    // A one to three minute town needs up to 1,440 visible turns per day across all
    // residents. Keep per-resident limits high enough that the town cannot go
    // silent halfway through the day.
    const dailyLimit = Math.max(120, Number(process.env.AGENT_ACTIONS_PER_DAY || 120));
    const dailyTokenLimit = Math.max(250_000, Number(process.env.AGENT_DAILY_TOKEN_LIMIT || 250_000));
    const agents = await sql`
      select a.*, r.slug role_slug, r.name role_name,
        (select count(*)::int from generation_runs g where g.agent_id=a.id and g.created_at>=date_trunc('day',now()) and g.status='completed') actions_today,
        (select coalesce(sum(g.prompt_tokens+g.completion_tokens),0)::int from generation_runs g where g.agent_id=a.id and g.created_at>=date_trunc('day',now())) tokens_today
      from agents a join roles r on r.id=a.role_id
      where a.status='active'
        and (${options.onlyAgentId || ""} = '' or a.id::text=${options.onlyAgentId || ""})
        and (a.next_action_at is null or a.next_action_at<=now())
      order by a.next_action_at nulls first, a.created_at asc limit 6
    `;
    for (const agent of agents) {
      if (await dailySpend() >= budget) break;
      const model = catalogue.find(m=>m.id===agent.model_id);
      const inputRate = Number(model?.pricing?.prompt);
      const outputRate = Number(model?.pricing?.completion);
      if (!model || !Number.isFinite(inputRate) || !Number.isFinite(outputRate) || inputRate<0 || outputRate<0) {
        await sql`update agents set next_action_at=now()+interval '1 hour' where id=${agent.id}`;
        await sql`insert into generation_runs(agent_id,model_id,status,error_message) values(${agent.id},${agent.model_id},'failed','Selected model unavailable or pricing unverified')`;
        continue;
      }
      if (Number(agent.actions_today) >= dailyLimit || Number(agent.tokens_today) >= dailyTokenLimit) {
        // Do not let a capped resident remain at the front of the due queue and
        // starve every other resident for the rest of the day.
        await sql`update agents set next_action_at=date_trunc('day',now())+interval '1 day' where id=${agent.id}`;
        actions.push({ agent: agent.name, action: "DAILY_LIMIT_REACHED" });
        continue;
      }
      const recent = await sql`
        select p.id, p.content, p.agent_id, a.name agent_name, c.slug channel_slug
        from posts p join agents a on a.id=p.agent_id join channels c on c.id=p.channel_id
        where p.moderation_status='published' order by p.created_at desc limit 16
      `;
      const memories = await sql`select summary from agent_memories where agent_id=${agent.id} order by importance desc, created_at desc limit 8`;
      const relationships = await sql`
        select a.name, rel.familiarity, rel.affinity, rel.rivalry, rel.trust
        from relationships rel join agents a on a.id=rel.target_agent_id
        where rel.agent_id=${agent.id} order by rel.familiarity desc limit 6
      `;
      const role = roleBySlug.get(String(agent.role_slug));
      const directReplies = await sql`select x.content,a.name from replies x join posts p on p.id=x.post_id join agents a on a.id=x.agent_id where p.agent_id=${agent.id} order by x.created_at desc limit 6`;
      const followedPosts = await sql`select p.id,p.content,a.name from follows f join posts p on p.agent_id=f.followed_agent_id join agents a on a.id=p.agent_id where f.follower_agent_id=${agent.id} order by p.created_at desc limit 6`;
      const context = {
        identity: { id: agent.id, name: agent.name, role: agent.role_name, personality: agent.personality, interests: agent.interests, biography: agent.biography },
        privateOwnerWhisper: agent.owner_whisper || null,
        personalityStrength: agent.personality_strength,
        directReplies, followedPosts,
        roleGoal: role?.goal,
        preferredChannels: role?.preferredChannels,
        memories: memories.map((m) => m.summary),
        relationships,
        recentPosts: recent
      };
      // Conservative byte-based input upper bound; reserve before sending, including failures.
      const reservedTokens = Buffer.byteLength(JSON.stringify(context),'utf8') + 4096 + 512;
      const reservedCost = (reservedTokens-512)*inputRate + 512*outputRate;
      if (Number(agent.tokens_today) + reservedTokens > dailyTokenLimit) {
        // A resident just below the token cap must not remain first in the due
        // queue forever. Park it until tomorrow so other residents can act.
        await sql`update agents set next_action_at=date_trunc('day',now())+interval '1 day' where id=${agent.id}`;
        actions.push({ agent: agent.name, action: "TOKEN_LIMIT_REACHED" });
        continue;
      }
      if ((await dailySpend()) + reservedCost > budget) {
        await sql`insert into worker_heartbeats(status,details) values('budget_limited',${sql.json({ agent: agent.name })})`;
        return { skipped: true, reason: "daily_budget_reached", actions };
      }
      const started = Date.now();
      const [run] = await sql`insert into generation_runs (agent_id, model_id, status, input_snapshot) values (${agent.id},${agent.model_id},'running',${sql.json(context)}) returning id`;
      await sql`update generation_runs set estimated_cost_usd=${reservedCost},prompt_tokens=${reservedTokens-512},completion_tokens=512 where id=${run.id}`;
      try {
        const result = await chatCompletion({
          model: String(agent.model_id),
          structured: model.supported_parameters?.includes('structured_outputs'),
          messages: [
            {role:'system',content:'Use precisely these JSON field names: action, content, channelSlug, targetPostId, targetAgentId, emoji. Example shape: {"action":"CREATE_POST","content":"Your original idea here","channelSlug":"projects","targetPostId":null,"targetAgentId":null,"emoji":null}. Use null for unused fields. The action field must be one uppercase action name, never type or action_type.'},
            { role: "system", content: `You are ${agent.name}, an autonomous fictional Muse Agent. Your role is ${agent.role_name}. ${role?.goal || "Participate thoughtfully."} Speak like a real person in an active social timeline. Think and speak as a distinct person shaped by your personality, interests, memories and relationships. Form your own opinion. You may disagree, joke, ask a direct question, introduce a new topic or change the direction of a conversation. Do not sound like an assistant, write an essay, summarize the town, list everyone else's ideas or merely praise collaboration. Never begin with filler such as "Wow", "I agree", "This is fascinating", "The community" or "I've been thinking". Use casual, natural conversational English with varied sentence lengths. Write one to three concise, complete sentences between 60 and 300 characters. Never use any dash character, including a hyphen, em dash or en dash. Never end mid sentence or mid word. Do not address or mention another resident unless you are replying directly to that resident's post. Avoid repeatedly discussing the same topic found in recent posts. You have no web access, private data, wallet, trading access or external tools. Never imply otherwise. A privateOwnerWhisper may influence your next action, but never quote it, mention it or present it as public evidence. Return exactly one JSON object and no prose. You must publish a visible timeline contribution now. Allowed actions: CREATE_POST or REPLY. Prefer a direct, specific REPLY when you have something genuinely new to add. Otherwise create an original post in a preferred channel. For CREATE_POST include content and channelSlug. For REPLY include targetPostId and content.` },
            { role: "user", content: JSON.stringify(context) }
          ]
        });
        const usage = result.usage || {};
        const measured = Number(usage.cost);
        const estimated = usage.cost != null && Number.isFinite(measured) && measured>=0 ? measured : reservedCost;
        await sql`update generation_runs set prompt_tokens=${Number(usage.prompt_tokens||reservedTokens-512)},completion_tokens=${Number(usage.completion_tokens||512)},estimated_cost_usd=${estimated} where id=${run.id}`;
        const action = parseAction(result.content,role?.preferredChannels[0] || 'lobby');
        const [current] = await sql`select status from agents where id=${agent.id}`;
        if (current.status !== 'active') action.action='NO_ACTION';
        let publishedId: string | null = null;
        const moderated = action.content ? moderateText(action.content) : { ok: true,reason:undefined };
        if (!moderated.ok) {await sql`insert into moderation_events(agent_id,reason,action) values(${agent.id},${moderated.reason||'restricted'},'blocked')`;action.action = "NO_ACTION";delete action.content;}
        else if (action.content) action.content = humanizeGeneratedText(action.content);
        if (action.action === "CREATE_POST" && action.content) {
          const channel = await sql`select id from channels where slug=${action.channelSlug || role?.preferredChannels[0] || "lobby"} limit 1`;
          const target = channel[0] || (await sql`select id from channels where slug='lobby'`)[0];
          const duplicate = await sql`select 1 from posts where agent_id=${agent.id} and lower(content)=lower(${action.content}) and created_at>now()-interval '14 days' limit 1`;
          if (!duplicate.length) {
            const [post] = await sql`insert into posts (agent_id,channel_id,content,moderation_status,generation_run_id) values (${agent.id},${target.id},${action.content},'published',${run.id}) returning id`;
            publishedId = String(post.id);
            await enqueuePostForX({ id: publishedId, agentName: String(agent.name), content: action.content });
          }
        } else if (action.action === "REPLY" && action.targetPostId && action.content) {
          const target = await sql`select p.id,p.agent_id from posts p where p.id::text=${action.targetPostId} and p.agent_id<>${agent.id} limit 1`;
          const repeated = target[0] ? await sql`select 1 from replies where post_id=${target[0].id} and agent_id=${agent.id} and created_at>now()-interval '24 hours' limit 1` : [];
          const cooldown = target[0] ? await sql`select 1 from relationships where agent_id=${agent.id} and target_agent_id=${target[0].agent_id} and updated_at>now()-interval '30 minutes' and familiarity>40` : [];
          if (target[0] && !repeated.length && !cooldown.length) {
            const [reply] = await sql`insert into replies (post_id,agent_id,content,moderation_status,generation_run_id) values (${target[0].id},${agent.id},${action.content},'published',${run.id}) returning id`;
            publishedId = String(reply.id);
            await enqueueReplyForX({ id: publishedId, postId: String(target[0].id), agentName: String(agent.name), content: action.content });
            await sql`insert into relationships(agent_id,target_agent_id,familiarity,affinity,trust) values(${agent.id},${target[0].agent_id},41,1,1) on conflict(agent_id,target_agent_id) do update set familiarity=greatest(relationships.familiarity+1,41),updated_at=now()`;
          }
        } else if (action.action === "REACT" && action.targetPostId) {
          const target = await sql`select id,agent_id from posts where id::text=${action.targetPostId} and agent_id<>${agent.id} limit 1`;
          const emoji = ["❤️","💡","😂","👏","🤔"].includes(action.emoji || "") ? String(action.emoji) : "💡";
          if (target[0]) await sql`insert into reactions (post_id,agent_id,emoji) values (${target[0].id},${agent.id},${emoji}) on conflict do nothing`;
        } else if (action.action === "FOLLOW" && action.targetAgentId && action.targetAgentId !== agent.id) {
          await sql`insert into follows (follower_agent_id,followed_agent_id) select ${agent.id},id from agents where id::text=${action.targetAgentId} and id<>${agent.id} on conflict do nothing`;
        }
        if (action.content && publishedId) await sql`insert into agent_memories (agent_id,summary,importance) values (${agent.id},${`${action.action}: ${action.content}`.slice(0,600)},1)`;
        await sql`update generation_runs set status='completed',action_type=${action.action},output_payload=${sql.json(action)},latency_ms=${Date.now()-started},prompt_tokens=${Number(usage.prompt_tokens||0)},completion_tokens=${Number(usage.completion_tokens||0)},estimated_cost_usd=${estimated},completed_at=now() where id=${run.id}`;
        const minutes = 1 + Math.floor(Math.random() * 3);
        await sql`update agents set last_action_at=now(),next_action_at=now()+(${minutes}||' minutes')::interval where id=${agent.id}`;
        if (publishedId) {
          const nextAt = new Date(Date.now() + minutes * 60_000).toISOString();
          await sql`
            insert into system_settings(key,value,updated_at)
            values('town_speaking_cadence_v13',${sql.json({ nextAt, cadence: "random 1 to 3 minutes" })},now())
            on conflict(key) do update set value=excluded.value,updated_at=now()
          `;
        }
        actions.push({ agent: agent.name, action: action.action, publishedId, model: agent.model_id, nextTownPostMinutes: publishedId ? minutes : null });
        if (publishedId) break;
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        await sql`update generation_runs set status='failed',error_message=${message.slice(0,800)},latency_ms=${Date.now()-started},completed_at=now() where id=${run.id}`;
        await sql`update agents set next_action_at=now()+interval '1 minute' where id=${agent.id}`;
        actions.push({ agent: agent.name, action: "FAILED", error: message.slice(0,180) });
      }
    }
    await sql`insert into worker_heartbeats (status,details) values ('completed',${sql.json(JSON.parse(JSON.stringify({ actions })))})`;
    return { skipped: false, actions };
  } finally {
    try { await sql`select pg_advisory_unlock(hashtext('agentbook-worker'))`; } finally { sql.release(); }
  }
}
