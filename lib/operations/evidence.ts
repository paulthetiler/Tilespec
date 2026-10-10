import { createHash } from "node:crypto";
import { fileType, ValidationError } from "./validation";

export function inspectEvidence(bytes: Uint8Array, claimedType: string) {
  const type = fileType(bytes, claimedType);
  return { ...type, sha256: createHash("sha256").update(bytes).digest("hex") };
}
export function verifyStoredEvidence(bytes: Uint8Array, expected: { bytes: number; mime_type: string; sha256: string }) {
  const actual = inspectEvidence(bytes, expected.mime_type);
  if (bytes.length !== expected.bytes || actual.sha256 !== expected.sha256) throw new ValidationError("The stored file does not match this revision. It remains unverified. Contact the owner.");
}
