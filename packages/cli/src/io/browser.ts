import { spawn } from "node:child_process";

export function openBrowser(url: string) {
  const [bin, args] =
    process.platform === "darwin"
      ? ["open", [url]]
      : process.platform === "win32"
        ? ["cmd", ["/c", "start", "", url]]
        : ["xdg-open", [url]];
  spawn(bin, args as string[], { stdio: "ignore", detached: true })
    .on("error", () => {})
    .unref();
}
