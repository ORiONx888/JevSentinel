import { noul, TypeSafeClient } from "@typesafe-ai/sdk";

const client = new TypeSafeClient();

const { answers } = await client.systemOne({
  model: "jev-latest",
  state: {
    system: "JevSentinel",
    purpose: "Verify the TypeSafe JEV connection.",
    token: {
      symbol: "TEST",
      mint: "test-mint"
    }
  },
  questions: {
    connection_ok: noul(
      "Is the supplied state sufficient for JEV to evaluate a token-risk decision?"
    )
  }
});

console.log(JSON.stringify(answers, null, 2));
