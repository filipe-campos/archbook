import pc from "picocolors";

export function relativeTime(iso: string, now = new Date()): string {
  const seconds = Math.round((now.getTime() - new Date(iso).getTime()) / 1000);
  if (seconds < 45) return "just now";
  const minutes = Math.round(seconds / 60);
  if (minutes < 60) return `${minutes} min ago`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `${hours} h ago`;
  const days = Math.round(hours / 24);
  if (days < 14) return `${days} day${days === 1 ? "" : "s"} ago`;
  return new Date(iso).toISOString().slice(0, 10);
}

/** Left-aligned plain-text table; column widths ignore ANSI color codes. */
export function table(rows: string[][]): string {
  // eslint-disable-next-line no-control-regex
  const width = (text: string) => text.replace(/\x1b\[[0-9;]*m/g, "").length;
  const widths = rows[0]!.map((_, column) =>
    Math.max(...rows.map((row) => width(row[column] ?? ""))),
  );
  return rows
    .map((row) =>
      row
        .map((cell, column) =>
          column === row.length - 1 ? cell : cell + " ".repeat(widths[column]! - width(cell)),
        )
        .join("  "),
    )
    .join("\n");
}

export const bullet = (text: string) => `  ${pc.dim("•")} ${text}`;
export const command = (text: string) => pc.cyan(text);
