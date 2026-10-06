import { test } from "node:test";
import assert from "node:assert/strict";
import {
  recoveryTokens,
  recoveryRequest,
  completePasswordRecovery,
} from "../lib/password-recovery";
test("recuperação reconhece somente links de recuperação e valida senha mínima", () => {
  assert.equal(
    recoveryTokens("#access_token=x&refresh_token=y&type=signup"),
    undefined,
  );
  assert.equal(recoveryTokens("#type=recovery&access_token=x"), undefined);
  assert.deepEqual(
    recoveryTokens("#type=recovery&access_token=x&refresh_token=y"),
    { access_token: "x", refresh_token: "y" },
  );
  assert.equal(
    recoveryRequest.safeParse({
      action: "reset",
      access_token: "a".repeat(20),
      refresh_token: "r".repeat(10),
      password: "curta",
    }).success,
    false,
  );
});
test("token recusado não permite alterar senha", async () => {
  let updated = false;
  const auth = {
    setSession: async () => ({ data: { user: null }, error: {} }),
    updateUser: async () => {
      updated = true;
      return { error: null };
    },
    signOut: async () => ({ error: null }),
  };
  await assert.rejects(
    completePasswordRecovery(
      { auth },
      { access_token: "invalid", refresh_token: "invalid" },
      "NovaSenhaValida123",
    ),
    /expirou/,
  );
  assert.equal(updated, false);
});
test("recuperação valida sessão, muda senha e encerra sessões nessa ordem", async () => {
  const calls: string[] = [];
  const auth = {
    setSession: async () => {
      calls.push("verify");
      return { data: { user: { id: "u" } }, error: null };
    },
    updateUser: async () => {
      calls.push("update");
      return { error: null };
    },
    signOut: async () => {
      calls.push("logout");
      return { error: null };
    },
  };
  await completePasswordRecovery(
    { auth },
    { access_token: "token", refresh_token: "refresh" },
    "NovaSenhaValida123",
  );
  assert.deepEqual(calls, ["verify", "update", "logout"]);
});
