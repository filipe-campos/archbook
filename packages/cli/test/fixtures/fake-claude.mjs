#!/usr/bin/env node
// Stands in for `claude -p --output-format stream-json` in tests. Behavior comes from env vars.
import { appendFileSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";

const args = process.argv.slice(2);
const prompt = args[args.indexOf("-p") + 1] ?? "";
const scenario = process.env.FAKE_CLAUDE_SCENARIO ?? "success";
const slashCommands = (process.env.FAKE_CLAUDE_SLASH ?? "").split(",").filter(Boolean);
if (process.env.FAKE_CLAUDE_LOG) {
  appendFileSync(process.env.FAKE_CLAUDE_LOG, `${JSON.stringify({ prompt, args })}\n`);
}

const emit = (message) => process.stdout.write(`${JSON.stringify(message)}\n`);
const write = (content) => {
  mkdirSync("archbook", { recursive: true });
  writeFileSync("archbook/architecture.json", content);
};
const succeed = () => {
  emit({
    type: "result",
    subtype: "success",
    is_error: false,
    result: "Documented 2 nodes.",
    total_cost_usd: 0.42,
    duration_ms: 61000,
    num_turns: 3,
  });
  process.exit(0);
};
const waitForever = () => setInterval(() => {}, 1000);

emit({ type: "system", subtype: "init", slash_commands: slashCommands });
emit({
  type: "assistant",
  message: {
    content: [{ type: "tool_use", id: "t1", name: "Read", input: { file_path: "src/server.ts" } }],
  },
});

switch (scenario) {
  case "success":
    write(readFileSync(process.env.FAKE_CLAUDE_DOC, "utf8"));
    succeed();
    break;
  case "fail":
    write('{ "version": "0.1", "nodes": [');
    emit({
      type: "result",
      subtype: "error_during_execution",
      is_error: true,
      errors: ["Something broke"],
    });
    process.exit(1);
    break;
  case "malformed":
    write("{ nope");
    succeed();
    break;
  case "hang":
    write('{ "partial": ');
    waitForever();
    break;
  case "fallback":
    if (prompt.startsWith("/")) waitForever();
    else {
      write(readFileSync(process.env.FAKE_CLAUDE_DOC, "utf8"));
      succeed();
    }
    break;
}
