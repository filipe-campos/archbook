import type { ResultMessage } from "../../io/claude.js";
import type { ProjectValidation } from "../validation.js";
import type { GenerationSession } from "./session.js";

export type GenerationDecision =
  | { kind: "interrupted" }
  | { kind: "failed"; reason: string }
  /** The file is missing or does not match the schema: keep it aside and restore the previous one. */
  | { kind: "malformed"; missing: boolean }
  | { kind: "invalid"; result: ResultMessage; validation: ProjectValidation }
  | { kind: "success"; result: ResultMessage; validation: ProjectValidation };

export interface GenerationEvidence {
  session: GenerationSession;
  /** Content of architecture.json after the run; undefined when the file does not exist. */
  text: string | undefined;
  schemaValid: boolean;
  /** Validation of the generated file; only needed when it matches the schema. */
  validation?: ProjectValidation;
}

function failureReason(session: GenerationSession): string {
  const { result } = session;
  return (
    result?.errors?.join("\n") ||
    result?.result ||
    session.stderr.trim().split("\n").slice(-5).join("\n") ||
    (session.handlerError !== undefined ? String(session.handlerError) : "") ||
    `exit code ${session.code}`
  );
}

/** Decides what to keep after a generation run. */
export function evaluateGeneration(evidence: GenerationEvidence): GenerationDecision {
  const { session } = evidence;
  if (session.interrupted) return { kind: "interrupted" };
  const { result } = session;
  if (session.code !== 0 || !result || result.is_error) {
    return { kind: "failed", reason: failureReason(session) };
  }
  if (evidence.text === undefined || !evidence.schemaValid || !evidence.validation) {
    return { kind: "malformed", missing: evidence.text === undefined };
  }
  return {
    kind: evidence.validation.valid ? "success" : "invalid",
    result,
    validation: evidence.validation,
  };
}
