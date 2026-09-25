import { createCipheriv, createDecipheriv, createHash, randomBytes } from "node:crypto";
import { mkdirSync, readFileSync, renameSync, writeFileSync, chmodSync } from "node:fs";
import { dirname } from "node:path";

const VERSION = 1;
const ALGORITHM = "aes-256-gcm";

function deriveKey(secret) {
  const value = String(secret ?? "").trim();
  if (!value) throw new Error("JEV group-store encryption secret is required");
  return createHash("sha256").update("JevSentinel/group-store/v1:").update(value).digest();
}

export function createGroupStore({
  filePath = process.env.JEV_GROUP_STORE_PATH ?? (process.env.NODE_ENV === "production" ? "/data/groups.enc" : "./.jev/groups.enc"),
  encryptionSecret = process.env.JEV_GROUP_STORE_KEY ?? process.env.TELEGRAM_BOT_TOKEN,
} = {}) {
  const key = deriveKey(encryptionSecret);

  function load() {
    try {
      const payload = JSON.parse(readFileSync(filePath, "utf8"));
      const decipher = createDecipheriv(ALGORITHM, key, Buffer.from(payload.iv, "base64"));
      decipher.setAuthTag(Buffer.from(payload.tag, "base64"));
      const plaintext = Buffer.concat([
        decipher.update(Buffer.from(payload.data, "base64")),
        decipher.final(),
      ]).toString("utf8");
      const parsed = JSON.parse(plaintext);
      if (parsed.version !== VERSION || !Array.isArray(parsed.groups)) throw new Error("Invalid group store");
      return parsed.groups;
    } catch (error) {
      if (error?.code === "ENOENT") return [];
      throw new Error("JEV group store could not be decrypted or read");
    }
  }

  function save(groups) {
    mkdirSync(dirname(filePath), { recursive: true });
    const iv = randomBytes(12);
    const cipher = createCipheriv(ALGORITHM, key, iv);
    const plaintext = JSON.stringify({ version: VERSION, groups });
    const data = Buffer.concat([cipher.update(plaintext, "utf8"), cipher.final()]);
    const payload = JSON.stringify({
      version: VERSION,
      iv: iv.toString("base64"),
      tag: cipher.getAuthTag().toString("base64"),
      data: data.toString("base64"),
    });
    const tempPath = `${filePath}.${process.pid}.tmp`;
    writeFileSync(tempPath, payload, { mode: 0o600 });
    chmodSync(tempPath, 0o600);
    renameSync(tempPath, filePath);
  }

  return { load, save, filePath };
}
