import test from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createGroupStore } from "../src/groupStore.js";

test("group store encrypts and restores group credentials", () => {
  const dir = mkdtempSync(join(tmpdir(), "jevsentinel-store-"));
  const path = join(dir, "groups.enc");
  try {
    const groups = [{
      chatId: "-100123",
      apiKey: "TEST_JEV_KEY_NOT_REAL",
      activatedAt: "2026-09-25T00:00:00.000Z",
      enabled: true,
    }];
    const store = createGroupStore({ filePath: path, encryptionSecret: "test-telegram-secret" });
    store.save(groups);

    const raw = readFileSync(path, "utf8");
    assert.doesNotMatch(raw, /TEST_JEV_KEY_NOT_REAL/);

    const restored = createGroupStore({ filePath: path, encryptionSecret: "test-telegram-secret" }).load();
    assert.deepEqual(restored, groups);

    assert.throws(
      () => createGroupStore({ filePath: path, encryptionSecret: "wrong-secret" }).load(),
      /could not be decrypted or read/,
    );
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});
