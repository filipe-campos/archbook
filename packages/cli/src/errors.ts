/** Errors whose message is meant for the user, printed without a stack trace. */
export class UserError extends Error {
  constructor(
    message: string,
    readonly exitCode = 1,
  ) {
    super(message);
  }
}

export class CancelledError extends Error {
  constructor() {
    super("Cancelled.");
  }
}
