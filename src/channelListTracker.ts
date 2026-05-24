import type { ChannelData } from './ircTypes.js';
import type { Message } from './parseMessage.js';

export class ChannelListTracker {
  items: ChannelData[] = [];
  private open = false;

  replace(items: ChannelData[]): void {
    this.items = items;
    this.open = false;
  }

  start(): void {
    this.items = [];
    this.open = true;
  }

  add(message: Message): ChannelData {
    if (!this.open) {
      this.start();
    }

    const channel = {
      name: message.args[1],
      users: {},
      userCount: Number.parseInt(message.args[2], 10),
      topic: message.args[3],
    };
    this.items.push(channel);
    return channel;
  }

  end(): ChannelData[] {
    this.open = false;
    return this.items;
  }
}
