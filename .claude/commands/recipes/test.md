---
description: Run a detection recipe's Grep patterns against a real project and report which ones work
argument-hint: "<recipe name> <absolute path to a project that uses it>"
---

# Test a detection recipe

Arguments: `$ARGUMENTS`

Resolve the recipe to `plugin/skills/detection-recipes/recipes/<name>.md` and confirm the project path exists. If either is missing, ask and stop.

Delegate to the `recipe-tester` agent with both paths, then relay its table and suggested fixes. Do not edit the recipe unless the user asks.
