import { createCipheriv, createDecipheriv, randomBytes } from "crypto";

const ALGORITHM = "aes-256-gcm";
const ENCRYPTION_KEY = process.env.TOKEN_ENCRYPTION_KEY ?? "";

function getKey(): Buffer {
  if (!ENCRYPTION_KEY) {
    throw new Error("TOKEN_ENCRYPTION_KEY env var is required for secret encryption");
  }
  return Buffer.from(ENCRYPTION_KEY, "hex");
}

export function encryptSecret(plaintext: string): { encrypted: string; iv: string } {
  const iv = randomBytes(16);
  const cipher = createCipheriv(ALGORITHM, getKey(), iv);
  let encrypted = cipher.update(plaintext, "utf8", "hex");
  encrypted += cipher.final("hex");
  const authTag = cipher.getAuthTag().toString("hex");
  return {
    encrypted: encrypted + ":" + authTag,
    iv: iv.toString("hex"),
  };
}

export function decryptSecret(encryptedWithTag: string, ivHex: string): string {
  const [encrypted, authTag] = encryptedWithTag.split(":");
  const iv = Buffer.from(ivHex, "hex");
  const decipher = createDecipheriv(ALGORITHM, getKey(), iv);
  decipher.setAuthTag(Buffer.from(authTag, "hex"));
  let decrypted = decipher.update(encrypted, "hex", "utf8");
  decrypted += decipher.final("utf8");
  return decrypted;
}
