import type { ChannelData } from './ircTypes.js';

export class ChannelStore {
  channels: Record<string, ChannelData> = {};

  replace(channels: Record<string, ChannelData>): void {
    this.channels = channels;
  }

  get(name: string): ChannelData | undefined {
    return this.channels[name.toLowerCase()];
  }

  ensure(name: string): ChannelData {
    const key = name.toLowerCase();
    this.channels[key] = this.channels[key] ?? {
      key,
      serverName: name,
      users: {},
      modeParams: {},
      mode: '',
    };

    return this.channels[key];
  }

  remove(name: string): void {
    const key = name.toLowerCase();
    // eslint-disable-next-line @typescript-eslint/no-dynamic-delete
    delete this.channels[key];
  }

  addUser(channelName: string, nick: string): void {
    const channel = this.get(channelName);
    if (channel?.users) {
      channel.users[nick] = '';
    }
  }

  removeUser(channelName: string, nick: string): void {
    const channel = this.get(channelName);
    if (channel?.users) {
      // eslint-disable-next-line @typescript-eslint/no-dynamic-delete
      delete channel.users[nick];
    }
  }

  renameUser(oldNick: string, newNick: string): string[] {
    const channels: string[] = [];
    for (const [channelName, channel] of Object.entries(this.channels)) {
      if (oldNick in channel.users) {
        channel.users[newNick] = channel.users[oldNick];
        // eslint-disable-next-line @typescript-eslint/no-dynamic-delete
        delete channel.users[oldNick];
        channels.push(channelName);
      }
    }

    return channels;
  }

  removeUserFromAll(nick: string): string[] {
    const channels: string[] = [];
    for (const [channelName, channel] of Object.entries(this.channels)) {
      if (nick in channel.users) {
        // eslint-disable-next-line @typescript-eslint/no-dynamic-delete
        delete channel.users[nick];
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

      if (match[1] in modeForPrefix) {
        channel.users[match[2]] = match[1];
      } else {
        channel.users[match[1] + match[2]] = '';
      }
    }
  }

  updateUserPrefix(channel: ChannelData, nick: string, prefix: string, adding: boolean): void {
    if (!Object.hasOwn(channel.users, nick)) {
      return;
    }

    if (adding) {
      if (!channel.users[nick].includes(prefix)) {
        channel.users[nick] += prefix;
      }
    } else {
      channel.users[nick] = channel.users[nick].replace(prefix, '');
    }
  }
}
