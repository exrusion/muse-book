import assert from "node:assert/strict";
import { generateKeyPairSync, sign } from "node:crypto";
import { checkHolder, decodeAddress, townOriginAllowed, verifyWallet } from "../lib/jolly-town-auth";

async function main() {
  const { publicKey, privateKey } = generateKeyPairSync("ed25519");
  const raw = publicKey.export({ format: "der", type: "spki" }).subarray(-32);
  const alphabet = "123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz";
  let n = BigInt("0x" + raw.toString("hex")), address = "";
  while (n) { address = alphabet[Number(n % BigInt(58))] + address; n /= BigInt(58); }
  for (const byte of raw) { if (byte !== 0) break; address = "1" + address; }
  assert.deepEqual(decodeAddress(address), raw);
  const message = "jollybot.lol wants you to sign in. Nonce: test-only";
  const signature = sign(null, Buffer.from(message), privateKey).toString("base64");
  assert.equal(verifyWallet(address, message, signature), true);
  assert.equal(verifyWallet(address, message + "tampered", signature), false);
  assert.equal(verifyWallet(address, message, Buffer.alloc(64).toString("base64")), false);
  assert.throws(() => decodeAddress("invalid-wallet"));
  assert.equal(townOriginAllowed(new Request("https://jollybot.lol", { headers: { origin: "https://jollybot.lol" } })), true);
  assert.equal(townOriginAllowed(new Request("https://jollybot.lol", { headers: { origin: "https://untrusted.example" } })), false);
  const originalFetch = globalThis.fetch, mint = process.env.JOLLY_TOKEN_MINT, minimum = process.env.JOLLY_TOKEN_MIN_RAW;
  try {
    delete process.env.JOLLY_TOKEN_MINT; assert.equal(await checkHolder(address), false);
    process.env.JOLLY_TOKEN_MINT = address; process.env.JOLLY_TOKEN_MIN_RAW = "2";
    globalThis.fetch = async () => Response.json({ result: { value: [{ account: { data: { parsed: { info: { tokenAmount: { amount: "1" } } } } } }, { account: { data: { parsed: { info: { tokenAmount: { amount: "1" } } } } } }] } });
    assert.equal(await checkHolder(address), true);
    globalThis.fetch = async () => Response.json({ result: { value: [] } });
    assert.equal(await checkHolder(address), false);
    globalThis.fetch = async () => Response.json({ error: "RPC unavailable" });
    await assert.rejects(() => checkHolder(address));
  } finally {
    globalThis.fetch = originalFetch;
    if(mint===undefined) delete process.env.JOLLY_TOKEN_MINT; else process.env.JOLLY_TOKEN_MINT=mint;
    if(minimum===undefined) delete process.env.JOLLY_TOKEN_MIN_RAW; else process.env.JOLLY_TOKEN_MIN_RAW=minimum;
  }
  console.log("Jolly Town: wallet signatures, tampering, origins, token aggregation, empty balances and RPC failures passed.");
}
main().catch(error => { console.error(error); process.exitCode = 1; });
