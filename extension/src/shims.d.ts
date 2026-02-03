declare module 'turndown' {
  export default class TurndownService {
    constructor(options?: unknown);
    addRule(key: string, rule: unknown): void;
    turndown(input: string): string;
  }
}

