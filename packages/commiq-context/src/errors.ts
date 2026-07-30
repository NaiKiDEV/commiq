export class ContextCheckError extends Error {
  constructor(message: string, name: string) {
    super(message);
    this.name = name;
  }
}

export class GuardError extends ContextCheckError {
  constructor(message: string) {
    super(message, "GuardError");
  }
}

export class AssertionError extends ContextCheckError {
  constructor(message: string) {
    super(`Assertion failed: ${message}`, "AssertionError");
  }
}
