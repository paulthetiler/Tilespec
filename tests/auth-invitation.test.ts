import test from "node:test";
import assert from "node:assert/strict";
import { emailConfirmationParameters, validNewPassword } from "../lib/supabase/navigation";

test("password setup requires length bounds and matching confirmation", () => {
  assert.equal(validNewPassword("a".repeat(11), "a".repeat(11)), false);
  assert.equal(validNewPassword("a".repeat(12), "a".repeat(12)), true);
  assert.equal(validNewPassword("a".repeat(128), "a".repeat(128)), true);
  assert.equal(validNewPassword("a".repeat(129), "a".repeat(129)), false);
  assert.equal(validNewPassword("school-gang-password", "different-password"), false);
  assert.equal(validNewPassword(" ".repeat(12), " ".repeat(12)), false);
  assert.equal(validNewPassword(null, null), false);
});

test("email confirmation only consumes bounded invite and recovery token hashes", () => {
  const tokenHash = "a".repeat(64);
  for (const type of ["invite", "recovery"] as const) {
    assert.deepEqual(emailConfirmationParameters(new URLSearchParams({ token_hash: tokenHash, type })), { tokenHash, type });
  }
  for (const type of ["signup", "email", "magiclink", "sms", ""]) {
    assert.equal(emailConfirmationParameters(new URLSearchParams({ token_hash: tokenHash, type })), null);
  }
  for (const token_hash of ["", "short", "a".repeat(257), "invalid/hash", "invalid\\hash", "a".repeat(24) + "\n"]) {
    assert.equal(emailConfirmationParameters(new URLSearchParams({ token_hash, type: "invite" })), null);
  }
});

test("ambiguous invitation parameters are rejected and supplied destinations have no authority", () => {
  const tokenHash = "b".repeat(64);
  const duplicateType = new URLSearchParams({ token_hash: tokenHash, type: "invite" });
  duplicateType.append("type", "recovery");
  assert.equal(emailConfirmationParameters(duplicateType), null);
  const duplicateToken = new URLSearchParams({ token_hash: tokenHash, type: "invite" });
  duplicateToken.append("token_hash", "c".repeat(64));
  assert.equal(emailConfirmationParameters(duplicateToken), null);
  const suppliedNext = new URLSearchParams({ token_hash: tokenHash, type: "invite", next: "https://attacker.example" });
  assert.deepEqual(emailConfirmationParameters(suppliedNext), { tokenHash, type: "invite" });
});
