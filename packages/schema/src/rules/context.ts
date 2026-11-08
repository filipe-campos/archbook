import type { Architecture } from "../architecture.js";
import type { ArchitectureIndex } from "../indexing.js";
import type { IssueCode, IssuePath } from "../issues.js";
import type { ValidateOptions } from "../validate.js";

export interface RuleContext {
  doc: Architecture;
  index: ArchitectureIndex;
  options: ValidateOptions;
  /** Records an issue; its severity comes from `ISSUE_CODES`. */
  report(code: IssueCode, path: IssuePath, message: string): void;
}

export type Rule = (ctx: RuleContext) => void;

type Collection = "groups" | "nodes" | "edges" | "flows";

export type ElementRule<K extends Collection> = (
  ctx: RuleContext,
  item: Architecture[K][number],
  index: number,
) => void;

/** Runs the rules on each item in turn, so an item's issues stay together in the report. */
export function eachItem<K extends Collection>(key: K, ...rules: ElementRule<K>[]): Rule {
  return (ctx) => {
    const items: ReadonlyArray<Architecture[K][number]> = ctx.doc[key];
    items.forEach((item, index) => {
      for (const rule of rules) rule(ctx, item, index);
    });
  };
}
