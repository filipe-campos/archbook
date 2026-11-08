import { FileWarning } from "lucide-react";
import { formatIssuePath, plural, type ValidationIssue } from "@archbook/schema";
import styles from "./ErrorScreen.module.css";

const MAX_SHOWN = 50;

export function MissingScreen({ message }: { message: string }) {
  return (
    <div className={styles.screen}>
      <div className={styles.card}>
        <div className={styles.icon}>
          <FileWarning size={24} />
        </div>
        <h1 className={styles.title}>No architecture.json found</h1>
        <p className={styles.lead}>
          The viewer loads <code>architecture.json</code> from the same folder as this page, and the
          request failed ({message}).
        </p>
        <p className={styles.hint}>
          Generate one with <code>npx archbook generate</code>, then open it with{" "}
          <code>npx archbook dev</code>.
        </p>
      </div>
    </div>
  );
}

export function InvalidScreen({ errors }: { errors: ValidationIssue[] }) {
  const shown = errors.slice(0, MAX_SHOWN);
  return (
    <div className={styles.screen}>
      <div className={styles.card}>
        <div className={styles.icon}>
          <FileWarning size={24} />
        </div>
        <h1 className={styles.title}>architecture.json has {plural(errors.length, "error")}</h1>
        <p className={styles.lead}>
          Fix these and the page reloads by itself when served by <code>archbook dev</code>.
        </p>
        <ul className={styles.issues}>
          {shown.map((issue, index) => (
            <li key={index} className={styles.issue}>
              {issue.path.length > 0 && (
                <code className={styles.path}>{formatIssuePath(issue.path)}</code>
              )}
              {issue.message}
            </li>
          ))}
        </ul>
        {errors.length > shown.length && (
          <p className={styles.hint}>…and {errors.length - shown.length} more.</p>
        )}
        <p className={styles.hint}>
          Run <code>npx archbook validate</code> for the full report, including checks on source
          file paths.
        </p>
      </div>
    </div>
  );
}

export function LoadingScreen() {
  return <div className={styles.loading}>Loading architecture…</div>;
}
