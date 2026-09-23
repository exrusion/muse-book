import { createPublicKey, verify } from "node:crypto";
import { cookies } from "next/headers";
import { db } from "./db";
import { currentUser } from "./x-auth";
import { hashToken } from "./security";

export const townCookie = "jolly_town_session";
export const challengeCookie = "jolly_wallet_challenge";
const windows = new Map<string, { count: number; until: number }>();
export function townRateLimited(request: Request, bucket: string, maximum: number) {
  const key = bucket + ":" + (request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "anonymous");
  const now = Date.now(), current = windows.get(key);
  if (!current || current.until < now) {
    if (windows.size >= 10000) windows.delete(windows.keys().next().value!);
    windows.set(key, { count: 1, until: now + 600000 }); return false;
  }
  return ++current.count > maximum;
}
export function townOriginAllowed(request: Request) {
  const origin = request.headers.get("origin");
  const allowed = ["https://jollybot.lol", "https://www.jollybot.lol", process.env.APP_URL];
  if (process.env.NODE_ENV !== "production") allowed.push("http://localhost:3000", "http://localhost:3001");
  return !!origin && allowed.includes(origin);
}
export function decodeAddress(address: string) {
  if (!/^[1-9A-HJ-NP-Za-km-z]{32,44}$/.test(address)) throw new Error("Invalid Solana address");
  const alphabet = "123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz";
  let value = BigInt(0);
  for (const c of address) value = value * BigInt(58) + BigInt(alphabet.indexOf(c));
  let hex = value.toString(16); if (hex.length % 2) hex = "0" + hex;
  const leading = address.match(/^1*/)?.[0].length || 0;
  const bytes = Buffer.concat([Buffer.alloc(leading), value ? Buffer.from(hex, "hex") : Buffer.alloc(0)]);
  if (bytes.length !== 32) throw new Error("Invalid Solana address");
  return bytes;
}
export function verifyWallet(address: string, message: string, signature: string) {
  try {
    const bytes = Buffer.from(signature, "base64"); if (bytes.length !== 64) return false;
    const key = createPublicKey({ key: Buffer.concat([Buffer.from("302a300506032b6570032100", "hex"), decodeAddress(address)]), format: "der", type: "spki" });
    return verify(null, Buffer.from(message), key, bytes);
  } catch { return false; }
}
export async function townIdentity() {
  const token = (await cookies()).get(townCookie)?.value;
  if (token && token.length <= 100) {
    const [session] = await db()`select wallet from jolly_town_sessions where token_hash=${hashToken(token)} and expires_at>now()`;
    if (session) return { key: "wallet:" + session.wallet, wallet: String(session.wallet), name: "" };
  }
  const user = await currentUser();
  return user ? { key: "x:" + user.id, wallet: null, name: String(user.display_name).slice(0, 28) } : null;
}
export async function checkHolder(wallet: string) {
  const mint = process.env.JOLLY_TOKEN_MINT?.trim();
  if (!mint) return false;
  decodeAddress(mint);
  const endpoint = process.env.JOLLY_SOLANA_RPC_URL || "https://api.mainnet-beta.solana.com";
  if (new URL(endpoint).protocol !== "https:") throw new Error("Invalid RPC endpoint");
  const response = await fetch(endpoint, { method: "POST", headers: { "Content-Type": "application/json" }, signal: AbortSignal.timeout(10000), cache: "no-store", body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "getTokenAccountsByOwner", params: [wallet, { mint }, { encoding: "jsonParsed", commitment: "confirmed" }] }) });
  const body = await response.json();
  if (!response.ok || body.error || !Array.isArray(body.result?.value)) throw new Error("Holder verification is unavailable. Try again shortly.");
  const total = body.result.value.reduce((sum: bigint, item: { account?: { data?: { parsed?: { info?: { tokenAmount?: { amount?: string } } } } } }) => sum + BigInt(item.account?.data?.parsed?.info?.tokenAmount?.amount || "0"), BigInt(0));
  const minimum = BigInt(process.env.JOLLY_TOKEN_MIN_RAW || "1");
  return total >= (minimum > BigInt(0) ? minimum : BigInt(1));
}
