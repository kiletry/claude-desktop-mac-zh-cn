export class UserError extends Error {
  constructor(message, options) {
    super(message, options);
    this.name = 'UserError';
    this.exitCode = 2;
  }
}

export class CompatibilityError extends Error {
  constructor(message, options) {
    super(message, options);
    this.name = 'CompatibilityError';
    this.exitCode = 3;
  }
}

export class PermissionError extends Error {
  constructor(message, options) {
    super(message, options);
    this.name = 'PermissionError';
    this.exitCode = 4;
  }
}

export function asExitCode(error) {
  return Number.isInteger(error?.exitCode) && error.exitCode > 0
    ? error.exitCode
    : 1;
}
