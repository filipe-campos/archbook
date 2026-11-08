import type { CSSProperties, ReactNode } from "react";
import { ExternalLink, FileCode } from "lucide-react";
import type { ArchNode, Architecture, SourceRef } from "@archbook/schema";
import { NODE_KIND_STYLES } from "../../graph/kinds";
import { safeHref } from "../../lib/safeUrl";
import { formatSourceLabel, sourceUrl } from "../../lib/sourceUrl";
import styles from "./Panel.module.css";

export function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className={styles.section}>
      <h3 className={styles.sectionTitle}>{title}</h3>
      {children}
    </section>
  );
}

export function kindStyle(node: ArchNode): CSSProperties {
  return { "--kind": NODE_KIND_STYLES[node.kind].color } as CSSProperties;
}

export function NodeRef({ node, onSelect }: { node: ArchNode; onSelect: (id: string) => void }) {
  const Icon = NODE_KIND_STYLES[node.kind].icon;
  return (
    <button
      type="button"
      className={styles.nodeRef}
      style={kindStyle(node)}
      onClick={() => onSelect(node.id)}
      title={node.summary}
    >
      <Icon size={15} strokeWidth={2.2} />
      {node.name}
    </button>
  );
}

export function SourceList({
  sources,
  project,
}: {
  sources: SourceRef[];
  project: Architecture["project"];
}) {
  if (sources.length === 0) return null;
  return (
    <Section title="Code">
      <ul className={styles.list}>
        {sources.map((source, index) => {
          const label = (
            <>
              <FileCode size={15} />
              <span>
                {formatSourceLabel(source)}
                {source.symbol && <span className={styles.symbol}> · {source.symbol}</span>}
              </span>
            </>
          );
          const href =
            project.repoUrl && safeHref(sourceUrl(project.repoUrl, project.defaultBranch, source));
          return (
            <li key={`${source.path}:${index}`}>
              {href ? (
                <a
                  className={`${styles.linkButton} ${styles.source}`}
                  href={href}
                  target="_blank"
                  rel="noreferrer noopener"
                >
                  {label}
                  <ExternalLink size={13} className={styles.muted} />
                </a>
              ) : (
                <div className={`${styles.linkButton} ${styles.source}`}>{label}</div>
              )}
            </li>
          );
        })}
      </ul>
    </Section>
  );
}

export function Links({ links }: { links: ArchNode["links"] }) {
  if (links.length === 0) return null;
  return (
    <Section title="Links">
      <ul className={styles.list}>
        {links.map((link) => {
          const href = safeHref(link.url);
          return (
            <li key={link.url}>
              {href ? (
                <a
                  className={styles.linkButton}
                  href={href}
                  target="_blank"
                  rel="noreferrer noopener"
                >
                  {link.label}
                  <ExternalLink size={13} className={styles.muted} />
                </a>
              ) : (
                <div className={styles.linkButton}>{link.label}</div>
              )}
            </li>
          );
        })}
      </ul>
    </Section>
  );
}
