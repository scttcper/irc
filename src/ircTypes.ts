import type { Message } from './parseMessage.js';

export type WhoIsData = Record<string, string | string[]>;
export type Users = string | Record<string, string>;

export type ChannelData = {
  /** Optional channel key used when joining a keyed channel. */
  key?: string;
  /** Server name reported for the channel, typically from list responses. */
  serverName?: string;
  /** Canonical channel name. */
  name?: string;
  /** Known users in the channel keyed by nickname with their mode prefix value. */
  users: Record<string, string>;
  /** Parameters associated with channel modes that carry arguments. */
  modeParams?: Record<string, any>;
  /** Current raw channel mode string. */
  mode?: string;
  /** Current channel topic text. */
  topic?: string;
  /** Nickname of the user who last set the topic. */
  topicBy?: string;
  /** Channel creation time as reported by the server. */
  created?: string;
};

export type SupportedFeatures = {
  channel: {
    /** Maximum identifier length for each supported channel prefix, from `IDCHAN`. */
    idlength: Record<string, number>;
    /** Maximum channel name length, from `CHANNELLEN`. */
    length: number;
    /** Maximum number of joined channels allowed for each channel prefix, from `CHANLIMIT`. */
    limit: Record<string, number>;
    /** Channel mode categories keyed by mode type, from `CHANMODES`. */
    modes: Record<string, string>;
    /** Supported channel prefix characters, from `CHANTYPES`. */
    types: string;
  };
  /** Maximum length of a kick reason, from `KICKLEN`. */
  kicklength: number;
  /** Maximum list size for list modes like bans and invite exceptions, from `MAXLIST`. */
  maxlist: Record<string, number>;
  /** Maximum number of targets accepted by commands like `PRIVMSG`, from `MAXTARGETS`. */
  maxtargets: Record<string, number>;
  /** Maximum number of modes that can be changed in a single mode command, from `MODES`. */
  modes: number;
  /** Maximum nickname length, from `NICKLEN`. */
  nicklength: number;
  /** Maximum topic length, from `TOPICLEN`. */
  topiclength: number;
  /** Supported user mode characters, from `USERMODES`. */
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
