import { findName, ircCasefold } from './ircCasefold.js';
import type { ChannelData } from './ircTypes.js';

export class ChannelStore {
  channels: Record<string, ChannelData> = Object.create(null);
  private readonly normalize: (name: string) => string;

  constructor(normalize = ircCasefold) {
    this.normalize = normalize;
  }

  reindex(): void {
    this.channels = Object.assign(
      Object.create(null),
      Object.fromEntries(
        Object.entries(this.channels).map(([key, channel]) => [
          this.normalize(channel.serverName ?? key),
          channel,
        ]),
      ),
    );
  }

  replace(channels: Record<string, ChannelData>): void {
    this.channels = channels;
    this.reindex();
  }

  get(name: string): ChannelData | undefined {
    return this.channels[this.normalize(name)];
  }

  ensure(name: string): ChannelData {
    const key = this.normalize(name);
    this.channels[key] = this.channels[key] ?? {
      key,
      serverName: name,
      users: Object.create(null),
      modeParams: {},
      mode: '',
    };

    return this.channels[key];
  }

  remove(name: string): void {
    const key = this.normalize(name);
    // eslint-disable-next-line @typescript-eslint/no-dynamic-delete
    delete this.channels[key];
  }

  addUser(channelName: string, nick: string): void {
    const channel = this.get(channelName);
    if (channel?.users) {
      Object.defineProperty(channel.users, nick, {
        value: '',
        enumerable: true,
        configurable: true,
        writable: true,
      });
    }
  }

  removeUser(channelName: string, nick: string): void {
    const channel = this.get(channelName);
    if (channel?.users) {
      // eslint-disable-next-line @typescript-eslint/no-dynamic-delete
      const key = findName(channel.users, nick, this.normalize);
      if (key !== undefined) {
        delete channel.users[key];
      }
    }
  }

  renameUser(oldNick: string, newNick: string): string[] {
    const channels: string[] = [];
    for (const [channelName, channel] of Object.entries(this.channels)) {
      const key = findName(channel.users, oldNick, this.normalize);
      if (key !== undefined) {
        const prefix = channel.users[key];
        // eslint-disable-next-line @typescript-eslint/no-dynamic-delete
        delete channel.users[key];
        Object.defineProperty(channel.users, newNick, {
          value: prefix,
          enumerable: true,
          configurable: true,
          writable: true,
        });
        channels.push(channelName);
      }
    }

    return channels;
  }

  removeUserFromAll(nick: string): string[] {
    const channels: string[] = [];
    for (const [channelName, channel] of Object.entries(this.channels)) {
      const key = findName(channel.users, nick, this.normalize);
      if (key !== undefined) {
        // eslint-disable-next-line @typescript-eslint/no-dynamic-delete
        delete channel.users[key];
        channels.push(channelName);
      }
    }

    return channels;
  }

  addNames(channelName: string, names: string[], modeForPrefix: Record<string, string>): void {
    const channel = this.get(channelName);
    if (!channel) {
      return;
    }

    for (const user of names) {
      const match = /^(.)(.*)$/.exec(user);
      if (!match) {
        continue;
      }

      const prefixed = Object.hasOwn(modeForPrefix, match[1]);
      const nick = prefixed ? match[2] : user;
      this.addUser(channelName, nick);
      channel.users[nick] = prefixed ? match[1] : '';
    }
  }
}
