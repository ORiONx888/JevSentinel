const apiKey = process.env.TYPESAFE_API_KEY;

if (!apiKey) {
  console.error("JEV API key is not configured.");
  process.exit(1);
}

const response = await fetch("https://api.typesafe.ai/v1/systemone", {
  method: "POST",
  headers: {
    Authorization: `Bearer ${apiKey}`,
    "Content-Type": "application/json"
  },
  body: JSON.stringify({
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
      connection_ok: {
        type: "noul",
        instructions:
          "Is the supplied state sufficient for JEV to evaluate a token-risk decision?"
      }
    }
  })
});

if (!response.ok) {
  const body = await response.text();
  console.error(`JEV request failed: HTTP ${response.status}`);
  console.error(body.slice(0, 1000));
  process.exit(1);
}

const result = await response.json();

console.log("JEV API connection successful.");
console.log(JSON.stringify(result.answers ?? result, null, 2));
