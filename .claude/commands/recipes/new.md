---
description: Write a new detection recipe so the agents and archbook init recognize one more technology
argument-hint: "<technology> [absolute path to a project that uses it]"
---

# Write a detection recipe

Arguments: `$ARGUMENTS`

If the technology is missing, ask and stop.

1. Load the `dev-plugin` skill and read `CONTRIBUTING.md`, section "Write a detection recipe".
2. Check that no existing recipe already covers the technology (`plugin/skills/detection-recipes/recipes/`). If one does, propose extending it instead.
3. Read `_template.md` and two concrete recipes (`bullmq.md`, `stripe-webhooks.md`) to match their depth and tone.
4. Research how the technology is used in code: package names, imports, config files, the calls that reveal producers, consumers and endpoints. Use the official docs when unsure.
5. Write `recipes/<technology>.md` with the `detect` frontmatter, then update the index table and the tests listed in the skill.
6. If a sample project path was given, delegate to the `recipe-tester` agent with the recipe path and the project path, and fix the patterns it reports as noisy or dead.
7. Run `pnpm --filter archbook test`.

Report the recipe, what it detects, the test results and, if tested, what each pattern matched.
