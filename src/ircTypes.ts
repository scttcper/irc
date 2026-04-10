import type { Message } from './parseMessage.js';

export type WhoIsData = Record<string, string | string[]>;
export type Users = string | Record<string, string>;

export type ChannelData = {
  key?: string;
  serverName?: string;
  name?: string;
  users: Record<string, string>;
  modeParams?: Record<string, any>;
  mode?: string;
  topic?: string;
  topicBy?: string;
  created?: string;
};

export type SupportedFeatures = {
  channel: {
    idlength: Record<string, number>;
    length: number;
    limit: number[];
    modes: Record<string, string>;
    types: string;
  };
  kicklength: number;
  maxlist: number[];
  maxtargets: Record<string, number>;
  modes: number;
  nicklength: number;
  topiclength: number;
  usermodes: string;
};

export type OnMessage = (nick: string, to: string, text: string, message: Message) => void;
export type Messages = Record<`message#${string}`, OnMessage>;

export interface IrcClientEvents extends Messages {
  raw: (message: Message) => void;
  kick: (channel: string, nick: string, by: string, reason: string) => void;
  part: (channel: string, nick: string, reason: string) => void;
  ping: (msg: string) => void;
  pong: (msg: string) => void;
  pm: (nick: string, text: string, message: Message) => void;
  invite: (channel: string, from: string, message: Message) => void;
  registered: (message: Message) => void;
  error: (message: Message) => void;
  motd: (motd: string) => void;
  whois: (whois: WhoIsData) => void;
  names: (channel: string, nicks: Users) => void;
  channellist: (channelList: ChannelData[]) => void;
  channellist_item: (channel: ChannelData) => void;
  channellist_start: () => void;
  connect: () => void;
  nick: (nick: string, arg: string, channels: string[], message: Message) => void;
  notice: (from: string | undefined, to: string, text: string, message: Message) => void;
  opered: () => void;
  netError: (exception: string) => void;
  abort: (retryCount: number) => void;
  unhandled: (message: Message) => void;
  join: (channel: string, nick: string) => void;
  topic: (channel: string, topic: string, nick: string, message: Message) => void;
  quit: (who: string, reason: string, channels: string[], message: Message) => void;
  message: OnMessage;
  selfMessage: (to: string, text: string) => void;
  action: (from: string, to: string, text: string, message: Message) => void;
  kill: (nick: string, reason: string, channels: string[], message: Message) => void;
  '+mode': (
    channel: string,
    by: string,
    mode: string,
    argument: string | undefined,
    message: Message,
  ) => void;
  '-mode': (
    channel: string,
    by: string,
    mode: string,
    argument: string | undefined,
    message: Message,
  ) => void;
  ctcp: (
    from: string,
    to: string,
    text: string,
    type: 'notice' | 'privmsg',
    message: Message,
  ) => void;
  'ctcp-notice': (from: string, to: string, text: string, message: Message) => void;
  'ctcp-privmsg': (from: string, to: string, text: string, message: Message) => void;
  'ctcp-version': (from: string, to: string, message: Message) => void;
}
