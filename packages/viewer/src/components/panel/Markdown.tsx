import { lazy, Suspense } from "react";
import styles from "./Panel.module.css";

// react-markdown and remark-gfm are loaded on first use, since only descriptions need them.
const MarkdownContent = lazy(() => import("./MarkdownContent"));

export function Markdown({ children }: { children: string }) {
  return (
    <div className={styles.markdown}>
      <Suspense fallback={<p>{children}</p>}>
        <MarkdownContent>{children}</MarkdownContent>
      </Suspense>
    </div>
  );
}
