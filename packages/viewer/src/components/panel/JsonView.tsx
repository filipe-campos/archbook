import { useMemo, useState } from "react";
import { Check, Copy } from "lucide-react";
import { stringifyPayload, tokenizeJson, type JsonTokenType } from "../../lib/jsonTokens";
import styles from "./Panel.module.css";

const TOKEN_CLASS: Record<JsonTokenType, string | undefined> = {
  key: styles.jsonKey,
  string: styles.jsonString,
  number: styles.jsonNumber,
  boolean: styles.jsonLiteral,
  null: styles.jsonLiteral,
  punctuation: styles.jsonPunctuation,
  space: undefined,
};

export function JsonView({ value }: { value: unknown }) {
  const text = useMemo(() => stringifyPayload(value), [value]);
  const tokens = useMemo(() => tokenizeJson(text), [text]);
  const [copied, setCopied] = useState(false);

  const copy = () => {
    void navigator.clipboard?.writeText(text).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 1200);
    });
  };

  return (
    <pre className={styles.json}>
      <button type="button" className={styles.copy} onClick={copy} title="Copy payload">
        {copied ? <Check size={14} /> : <Copy size={14} />}
      </button>
      <code>
        {tokens.map((token, index) => (
          <span key={index} className={TOKEN_CLASS[token.type]}>
            {token.text}
          </span>
        ))}
      </code>
    </pre>
  );
}
