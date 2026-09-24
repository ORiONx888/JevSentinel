import { noul, TypeSafeClient } from "@typesafe-ai/sdk";

const client = new TypeSafeClient();

const { answers, model, usage } = await client.systemOne({
  model: "jev-latest",
  state: {
    system: "JevSentinel",
    purpose: "Verify the official TypeSafe JEV SDK integration.",
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

console.log("Official TypeSafe JEV SDK call successful.");
console.log(JSON.stringify({ model, answers, usage }, null, 2));
