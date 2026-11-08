import * as clack from "@clack/prompts";
import { CancelledError } from "../errors.js";

export interface Choice<T extends string> {
  value: T;
  label: string;
  hint?: string;
}

/** The questions commands ask, behind an interface so tests can answer them. */
export interface Prompter {
  readonly interactive: boolean;
  text(options: {
    message: string;
    defaultValue?: string;
    placeholder?: string;
    validate?: (value: string) => string | undefined;
  }): Promise<string>;
  multiline(options: {
    message: string;
    defaultValue?: string;
    placeholder?: string;
  }): Promise<string>;
  select<T extends string>(options: {
    message: string;
    options: Array<Choice<T>>;
    initialValue?: T;
  }): Promise<T>;
  confirm(options: { message: string; initialValue?: boolean }): Promise<boolean>;
}

function unwrap<T>(value: T): Exclude<T, symbol> {
  if (clack.isCancel(value)) throw new CancelledError();
  return value as Exclude<T, symbol>;
}

export const clackPrompter: Prompter = {
  interactive: true,
  async text({ message, defaultValue, placeholder, validate }) {
    const value = unwrap(
      await clack.text({
        message,
        placeholder: placeholder ?? defaultValue,
        defaultValue,
        validate: validate ? (input) => validate(input ?? "") : undefined,
      }),
    );
    return value.trim();
  },
  async multiline({ message, defaultValue, placeholder }) {
    return unwrap(await clack.multiline({ message, defaultValue, placeholder })).trim();
  },
  async select<T extends string>({
    message,
    options,
    initialValue,
  }: {
    message: string;
    options: Array<Choice<T>>;
    initialValue?: T;
  }) {
    // clack's Option<T> is a conditional type that a generic T cannot satisfy without a cast.
    const choices = options as Parameters<typeof clack.select<T>>[0]["options"];
    return unwrap(await clack.select<T>({ message, options: choices, initialValue })) as T;
  },
  async confirm({ message, initialValue }) {
    return unwrap(await clack.confirm({ message, initialValue }));
  },
};

/** Answers every question with its default; used with --yes and when stdin is not a terminal. */
export const defaultsPrompter: Prompter = {
  interactive: false,
  text: async ({ defaultValue }) => defaultValue ?? "",
  multiline: async ({ defaultValue }) => defaultValue ?? "",
  select: async ({ options, initialValue }) => initialValue ?? options[0]!.value,
  confirm: async ({ initialValue }) => initialValue ?? false,
};
