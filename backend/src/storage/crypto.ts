import crypto from "node:crypto";

const algorithm = "aes-256-gcm";
const keyLength = 32;
const ivLength = 12;

function getKey() {
  const secret = process.env.INDEED_SESSION_ENCRYPTION_KEY;

  if (!secret) {
    throw new Error("INDEED_SESSION_ENCRYPTION_KEY is required.");
  }

  return crypto.createHash("sha256").update(secret).digest().subarray(0, keyLength);
}

export function encryptText(plainText: string) {
  const iv = crypto.randomBytes(ivLength);
  const cipher = crypto.createCipheriv(algorithm, getKey(), iv);
  const encrypted = Buffer.concat([cipher.update(plainText, "utf8"), cipher.final()]);
  const authTag = cipher.getAuthTag();

  return Buffer.concat([iv, authTag, encrypted]).toString("base64");
}

export function decryptText(payload: string) {
  const buffer = Buffer.from(payload, "base64");
  const iv = buffer.subarray(0, ivLength);
  const authTag = buffer.subarray(ivLength, ivLength + 16);
  const encrypted = buffer.subarray(ivLength + 16);
  const decipher = crypto.createDecipheriv(algorithm, getKey(), iv);

  decipher.setAuthTag(authTag);

  return Buffer.concat([decipher.update(encrypted), decipher.final()]).toString("utf8");
}
