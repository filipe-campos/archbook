import { TriangleAlert } from "lucide-react";
import { formatIssuePath } from "@archbook/schema";
import type { ReloadError } from "../lib/loadState";
import styles from "./ReloadBanner.module.css";

const MAX_SHOWN = 3;

export function ReloadBanner({ error }: { error: ReloadError }) {
  const lines =
    error.kind === "invalid"
      ? error.errors
          .slice(0, MAX_SHOWN)
          .map((issue) =>
            issue.path.length > 0
              ? `${formatIssuePath(issue.path)}: ${issue.message}`
              : issue.message,
          )
      : [`The file could not be loaded (${error.message}).`];
  const hidden = error.kind === "invalid" ? error.errors.length - lines.length : 0;
  const title =
    error.kind === "invalid"
      ? `architecture.json has ${error.errors.length} ${error.errors.length === 1 ? "error" : "errors"}`
      : "architecture.json is missing";

  return (
    <div className={styles.banner} role="status">
      <TriangleAlert size={16} className={styles.icon} aria-hidden />
      <div>
        <p className={styles.title}>{title}. Showing the last valid version.</p>
        <ul className={styles.lines}>
          {lines.map((line, index) => (
            <li key={index}>{line}</li>
          ))}
        </ul>
        {hidden > 0 && <p className={styles.more}>…and {hidden} more.</p>}
      </div>
    </div>
  );
}
