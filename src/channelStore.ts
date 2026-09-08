import { ircCasefold } from './ircCasefold.js';
import type { ChannelData } from './ircTypes.js';

export class ChannelStore {
  channels: Record<string, ChannelData> = Object.create(null);
  private readonly normalize: (name: string) => string;
  private userIndexes = new WeakMap<Record<string, string>, Map<string, string>>();

  constructor(normalize = ircCasefold) {
    this.normalize = normalize;
  }

  reindex(): void {
    this.userIndexes = new WeakMap();
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

  private userIndex(users: Record<string, string>): Map<string, string> {
    let index = this.userIndexes.get(users);
    if (!index) {
      index = new Map(Object.keys(users).map(nick => [this.normalize(nick), nick]));
      this.userIndexes.set(users, index);
    }
    return index;
  }

  findUser(channel: ChannelData, nick: string): string | undefined {
    if (Object.hasOwn(channel.users, nick)) {
      return nick;
    }
    const key = this.userIndex(channel.users).get(this.normalize(nick));
    return key !== undefined && Object.hasOwn(channel.users, key) ? key : undefined;
  }

  private setUser(channel: ChannelData, nick: string, prefix: string): void {
    const index = this.userIndex(channel.users);
    const normalized = this.normalize(nick);
    const previous = index.get(normalized);
    if (previous !== undefined && previous !== nick) {
      delete channel.users[previous];
    }
    Object.defineProperty(channel.users, nick, {
      value: prefix,
      enumerable: true,
      configurable: true,
      writable: true,
    });
    index.set(normalized, nick);
  }

  private deleteUser(channel: ChannelData, nick: string): void {
    delete channel.users[nick];
    this.userIndex(channel.users).delete(this.normalize(nick));
  }

  addUser(channelName: string, nick: string): void {
    const channel = this.get(channelName);
    if (channel?.users) {
      this.setUser(channel, nick, '');
    }
  }

  removeUser(channelName: string, nick: string): void {
    const channel = this.get(channelName);
    if (channel?.users) {
      // eslint-disable-next-line @typescript-eslint/no-dynamic-delete
      const key = this.findUser(channel, nick);
      if (key !== undefined) {
        this.deleteUser(channel, key);
      }
    }
  }

  renameUser(oldNick: string, newNick: string): string[] {
    const channels: string[] = [];
    for (const [channelName, channel] of Object.entries(this.channels)) {
      const key = this.findUser(channel, oldNick);
      if (key !== undefined) {
        const prefix = channel.users[key];
        // eslint-disable-next-line @typescript-eslint/no-dynamic-delete
        this.deleteUser(channel, key);
        this.setUser(channel, newNick, prefix);
        channels.push(channelName);
      }
    }

    return channels;
  }

  removeUserFromAll(nick: string): string[] {
    const channels: string[] = [];
    for (const [channelName, channel] of Object.entries(this.channels)) {
      const key = this.findUser(channel, nick);
      if (key !== undefined) {
        // eslint-disable-next-line @typescript-eslint/no-dynamic-delete
        this.deleteUser(channel, key);
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
      this.setUser(channel, nick, prefixed ? match[1] : '');
    }
  }
}
