import type { WhoIsData } from './ircTypes.js';
import type { Message } from './parseMessage.js';

export type WhoisResult = WhoIsData & { nick?: string; user?: string; host?: string };

type PendingWhoisRequest = {
  resolve: (info: WhoisResult) => void;
  reject: (error: Error) => void;
  timeout: ReturnType<typeof setTimeout>;
};

const defaultWhoisTimeoutMs = 30_000;

export class WhoisTracker {
  readonly data: Record<string, WhoIsData> = Object.create(null);
  private readonly pending = new Map<string, Set<PendingWhoisRequest>>();
  private readonly timeoutMs: number;

  constructor(timeoutMs = defaultWhoisTimeoutMs) {
    this.timeoutMs = timeoutMs;
  }

  request(nick: string): { promise: Promise<WhoisResult>; shouldSend: boolean } {
    const normalizedNick = nick.toLowerCase();
    let request: PendingWhoisRequest;
    const promise = new Promise<WhoisResult>((resolve, reject) => {
      const timeout = setTimeout(() => {
        this.removeRequest(normalizedNick, request);
        reject(new Error(`WHOIS timed out for ${nick}`));
      }, this.timeoutMs);

      request = { resolve, reject, timeout };
      const requests = this.pending.get(normalizedNick) ?? new Set();
      requests.add(request);
      this.pending.set(normalizedNick, requests);
    });

    return {
      promise,
      shouldSend: (this.pending.get(normalizedNick)?.size ?? 0) === 1,
    };
  }

  rejectAll(error: Error): void {
    for (const [nick, requests] of this.pending.entries()) {
      for (const request of requests) {
        clearTimeout(request.timeout);
        request.reject(error);
      }

      this.pending.delete(nick);
    }
  }

  handleMessage(message: Message): WhoIsData | undefined {
    switch (message.command) {
      case 'rpl_away': {
        this.add(message.args[1], 'away', message.args[2], true);
        return undefined;
      }
      case 'rpl_whoisuser': {
        this.add(message.args[1], 'user', message.args[2]);
        this.add(message.args[1], 'host', message.args[3]);
        this.add(message.args[1], 'realname', message.args[5]);
        return undefined;
      }
      case 'rpl_whoisidle': {
        this.add(message.args[1], 'idle', message.args[2]);
        return undefined;
      }
      case 'rpl_whoischannels': {
        const existingChannels = this.data[message.args[1]]?.channels;
        const channels = Array.isArray(existingChannels) ? existingChannels : [];
        this.add(message.args[1], 'channels', [
          ...channels,
          ...message.args[2].trim().split(/\s+/),
        ]);
        return undefined;
      }
      case 'rpl_whoisserver': {
        this.add(message.args[1], 'server', message.args[2]);
        this.add(message.args[1], 'serverinfo', message.args[3]);
        return undefined;
      }
      case 'rpl_whoisoperator': {
        this.add(message.args[1], 'operator', message.args[2]);
        return undefined;
      }
      case '330': {
        this.add(message.args[1], 'account', message.args[2]);
        this.add(message.args[1], 'accountinfo', message.args[3]);
        return undefined;
      }
      case 'rpl_endofwhois': {
        return this.complete(message.args[1]);
      }
      case 'rpl_whoreply': {
        this.add(message.args[5], 'user', message.args[2]);
        this.add(message.args[5], 'host', message.args[3]);
        this.add(message.args[5], 'server', message.args[4]);
        const realnameMatch = /[0-9]+\s*(.+)/g.exec(message.args[7]);
        this.add(message.args[5], 'realname', realnameMatch?.[1] ?? message.args[7]);
        return this.complete(message.args[5]);
      }
      default: {
        return undefined;
      }
    }
  }

  private add(nick: string, key: string, value: string | string[], onlyIfExists?: boolean): void {
    if (onlyIfExists && !this.data[nick]) {
      return;
    }

    this.data[nick] = this.data[nick] ?? { nick };
    this.data[nick][key] = value;
  }

  private complete(nick: string): WhoIsData {
    this.add(nick, 'nick', nick);
    const info = this.data[nick];
    // eslint-disable-next-line @typescript-eslint/no-dynamic-delete
    delete this.data[nick];
    this.resolve(nick, info);
    return info;
  }

  private removeRequest(nick: string, request: PendingWhoisRequest): void {
    clearTimeout(request.timeout);
    const requests = this.pending.get(nick);
    if (!requests) {
      return;
    }

    requests.delete(request);
    if (requests.size === 0) {
      this.pending.delete(nick);
    }
  }

  private resolve(nick: string, info: WhoisResult): void {
    const requests = this.pending.get(nick.toLowerCase());
    if (!requests) {
      return;
    }

    for (const request of requests) {
      clearTimeout(request.timeout);
      request.resolve(info);
    }

    this.pending.delete(nick.toLowerCase());
  }
}
