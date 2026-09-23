import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { hashToken, newOwnerToken } from "@/lib/security";
import { cookieOptions } from "@/lib/x-auth";
import { challengeCookie, decodeAddress, townCookie, townOriginAllowed, townRateLimited, verifyWallet } from "@/lib/jolly-town-auth";
export const dynamic = "force-dynamic";

export async function POST(request: NextRequest) {
  if (!townOriginAllowed(request)) return NextResponse.json({ error: "Invalid request origin" }, { status: 403 });
  if (townRateLimited(request, "wallet", 30)) return NextResponse.json({ error: "Too many sign-in attempts. Please try again in a few minutes." }, { status: 429 });
  try {
    const body = await request.json();
    if (typeof body.address !== "string") throw new Error("Choose a Solana wallet.");
    decodeAddress(body.address);
    if (!body.signature) {
      const previous = request.cookies.get(challengeCookie)?.value;
      if (previous && previous.length <= 100) await db()`delete from jolly_town_challenges where token_hash=${hashToken(previous)}`;
      await db()`delete from jolly_town_challenges where expires_at<now()`;
      const token = newOwnerToken(), expires = new Date(Date.now() + 300000).toISOString();
      const origin = request.headers.get("origin")!;
      const message = `${new URL(origin).host} wants you to sign in with your Solana account:\n${body.address}\n\nJoin Jolly Town. This signature verifies wallet ownership and does not authorize a transaction.\n\nURI: ${origin}/town\nVersion: 1\nChain ID: solana:mainnet\nNonce: ${token}\nIssued At: ${new Date().toISOString()}\nExpiration Time: ${expires}`;
      await db()`insert into jolly_town_challenges(token_hash,wallet,message,origin,expires_at) values(${hashToken(token)},${body.address},${message},${origin},${expires})`;
      const response = NextResponse.json({ message });
      response.cookies.set(challengeCookie, token, { ...cookieOptions, maxAge: 300 });
      return response;
    }
    if (typeof body.signature !== "string" || body.signature.length > 128) throw new Error("Invalid signature.");
    const token = request.cookies.get(challengeCookie)?.value;
    if (!token || token.length > 100) throw new Error("Sign-in expired. Reconnect your wallet.");
    const [challenge] = await db()`delete from jolly_town_challenges where token_hash=${hashToken(token)} and expires_at>now() returning wallet,message,origin`;
    if (!challenge || challenge.wallet !== body.address || challenge.origin !== request.headers.get("origin") || !verifyWallet(body.address, String(challenge.message), body.signature)) throw new Error("Wallet signature could not be verified.");
    const session = newOwnerToken();
    await db()`delete from jolly_town_sessions where expires_at<now()`;
    await db()`insert into jolly_town_sessions(token_hash,wallet,expires_at) values(${hashToken(session)},${body.address},now()+interval '7 days')`;
    const response = NextResponse.json({ authenticated: true });
    response.cookies.set(townCookie, session, { ...cookieOptions, maxAge: 7 * 86400 });
    response.cookies.set(challengeCookie, "", { ...cookieOptions, maxAge: 0 });
    return response;
  } catch (error) { return NextResponse.json({ error: error instanceof Error && /wallet|sign|Solana|Choose/i.test(error.message) ? error.message : "Could not connect your wallet." }, { status: 400 }); }
}
export async function DELETE(request: NextRequest) {
  if (!townOriginAllowed(request)) return NextResponse.json({ error: "Invalid request origin" }, { status: 403 });
  const token = request.cookies.get(townCookie)?.value;
  if (token && token.length <= 100) await db()`delete from jolly_town_sessions where token_hash=${hashToken(token)}`;
  const response = NextResponse.json({ disconnected: true });
  response.cookies.set(townCookie, "", { ...cookieOptions, maxAge: 0 }); return response;
}
