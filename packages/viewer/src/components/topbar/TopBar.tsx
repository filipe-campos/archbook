import { useEffect, useId, useMemo, useRef, useState, type CSSProperties } from "react";
import { Moon, Play, Search, Sun } from "lucide-react";
import type { ArchFlow, ArchNode } from "@archbook/schema";
import type { Theme } from "../../data/useTheme";
import { NODE_KIND_STYLES } from "../kinds";
import { cx } from "../../lib/cx";
import { isTyping } from "../../lib/keyboard";
import { searchNodes } from "../../lib/search";
import styles from "./TopBar.module.css";

interface TopBarProps {
  projectName: string;
  flows: ArchFlow[];
  nodes: ArchNode[];
  activeFlowId?: string;
  theme: Theme;
  onOpenFlow: (flowId: string | undefined) => void;
  onPickNode: (nodeId: string) => void;
  onToggleTheme: () => void;
}

export function TopBar({
  projectName,
  flows,
  nodes,
  activeFlowId,
  theme,
  onOpenFlow,
  onPickNode,
  onToggleTheme,
}: TopBarProps) {
  return (
    <header className={styles.topbar}>
      <div className={styles.brand}>
        <Logo />
        <span className={styles.project}>{projectName}</span>
        <span className={styles.product}>Archbook</span>
      </div>

      {flows.length > 0 && (
        <label className={styles.field} title="Replay a flow">
          <Play size={15} />
          <select
            className={styles.select}
            value={activeFlowId ?? ""}
            onChange={(event) => onOpenFlow(event.target.value || undefined)}
            aria-label="Flow"
          >
            <option value="">Choose a flow…</option>
            {flows.map((flow) => (
              <option key={flow.id} value={flow.id}>
                {flow.name}
              </option>
            ))}
          </select>
        </label>
      )}

      <SearchBox nodes={nodes} onPick={onPickNode} />

      <button
        type="button"
        className={styles.iconButton}
        onClick={onToggleTheme}
        title={theme === "dark" ? "Switch to light theme" : "Switch to dark theme"}
      >
        {theme === "dark" ? <Sun size={17} /> : <Moon size={17} />}
      </button>
    </header>
  );
}

function SearchBox({ nodes, onPick }: { nodes: ArchNode[]; onPick: (id: string) => void }) {
  const [query, setQuery] = useState("");
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(0);
  const input = useRef<HTMLInputElement>(null);
  const listId = useId();
  const results = useMemo(() => searchNodes(nodes, query).slice(0, 8), [nodes, query]);

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "/" && !isTyping(event.target)) {
        event.preventDefault();
        input.current?.focus();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  const pick = (node: ArchNode | undefined) => {
    if (!node) return;
    onPick(node.id);
    setQuery("");
    setOpen(false);
    input.current?.blur();
  };

  const expanded = open && query !== "";
  const optionId = (index: number) => `${listId}-${index}`;
  const activeOption = expanded && results[active] ? optionId(active) : undefined;

  return (
    <div className={styles.search}>
      <label className={styles.field}>
        <Search size={15} />
        <input
          ref={input}
          className={styles.searchInput}
          placeholder="Search components or tech"
          value={query}
          role="combobox"
          aria-label="Search components"
          aria-autocomplete="list"
          aria-expanded={expanded && results.length > 0}
          aria-controls={listId}
          aria-activedescendant={activeOption}
          onChange={(event) => {
            setQuery(event.target.value);
            setActive(0);
            setOpen(true);
          }}
          onFocus={() => setOpen(true)}
          onBlur={() => setTimeout(() => setOpen(false), 120)}
          onKeyDown={(event) => {
            if (event.key === "ArrowDown") setActive((i) => Math.min(i + 1, results.length - 1));
            else if (event.key === "ArrowUp") setActive((i) => Math.max(i - 1, 0));
            else if (event.key === "Enter") pick(results[active]);
            else if (event.key === "Escape") {
              setQuery("");
              input.current?.blur();
            } else return;
            event.preventDefault();
          }}
        />
        <kbd className={styles.kbd}>/</kbd>
      </label>
      {expanded && results.length === 0 && (
        <div className={styles.results} role="status">
          <div className={styles.noResults}>No matching components</div>
        </div>
      )}
      <ul
        className={styles.results}
        id={listId}
        role="listbox"
        aria-label="Matching components"
        hidden={!expanded || results.length === 0}
      >
        {results.map((node, index) => {
          const kind = NODE_KIND_STYLES[node.kind];
          const Icon = kind.icon;
          return (
            <li
              key={node.id}
              id={optionId(index)}
              role="option"
              aria-selected={index === active}
              className={cx(styles.result, index === active && styles.resultActive)}
              style={{ "--kind": kind.color } as CSSProperties}
              onMouseDown={(event) => event.preventDefault()}
              onClick={() => pick(node)}
              onMouseEnter={() => setActive(index)}
            >
              <Icon size={17} className={styles.resultIcon} aria-hidden />
              <span className={styles.resultText}>
                <span className={styles.resultName}>{node.name}</span>
                <span className={styles.resultMeta}>{[kind.label, ...node.tech].join(" · ")}</span>
              </span>
            </li>
          );
        })}
      </ul>
    </div>
  );
}

function Logo() {
  return (
    <svg className={styles.logo} width="26" height="26" viewBox="0 0 32 32" aria-hidden>
      <rect x="3" y="3" width="11" height="11" rx="3" fill="currentColor" />
      <rect x="18" y="18" width="11" height="11" rx="3" fill="currentColor" opacity="0.55" />
      <path
        d="M14 8.5h4a3.5 3.5 0 0 1 3.5 3.5v6"
        stroke="currentColor"
        strokeWidth="2.5"
        fill="none"
      />
    </svg>
  );
}
