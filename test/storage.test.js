import test from "node:test";
import assert from "node:assert/strict";
import { hashPin } from "../storage.js";

test("device PIN hashes are stable and distinct", async () => {
  const first = await hashPin("1234");
  assert.equal(await hashPin("1234"), first);
  assert.notEqual(await hashPin("0000"), first);
  assert.match(first, /^[0-9a-f]{64}$/);
});
