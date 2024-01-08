import { connect as NetConnect } from 'node:net';
import { connect as TlsConnect } from 'node:tls';

import charsetDetector from 'chardet';
import debug from 'debug';
import * as iconv from 'iconv-lite';
import defaultsdeep from 'lodash.defaultsdeep';
import { TypedEmitter } from 'tiny-typed-emitter';

import { CyclingPingTimer } from './cyclingPingTimer.js';
import { Message, parseMessage } from './parseMessage.js';

const log = debug('irc');
const lineDelimiter = /\r\n|\r|\n/;

const defaultOptions = {
  host: '',
  nick: '',
  userName: 'nodebot',
  realName: 'nodeJS IRC client',
  password: null as string | null,
  port: 6697,
  /** List of channels to join ['#general'] */
  channels: [] as string[],
  autoRejoin: false,
  autoRenick: false,
  retryCount: null as number | null,
  retryDelay: 5000,
  renickCount: null as number | null,
  renickDelay: 60000,
  secure: false,
  selfSigned: false,
  rejectUnauthorized: false,
  sasl: false,
  webirc: {
    pass: '',
    ip: '',
    host: '',
  },
  stripColors: true,
  channelPrefixes: '&#',
  messageSplit: 512,
  encoding: null as string | null,
  millisecondsOfSilenceBeforePingSent: 15 * 1000,
  millisecondsBeforePingTimeout: 8 * 1000,
  enableStrictParse: false,
};

export type IrcOptions = typeof defaultOptions;
type WhoIsData = Record<string, string | string[]>;
type Users = string | Record<string, string>;
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

type OnMessage = (nick: string, to: string, text: string, message: Message) => void;
// TODO: figure out how to pass channel names as generic
type Messages = Record<`message#${string}`, OnMessage>;

interface IrcClientEvents extends Messages {
  raw: (message: Message) => void;
  /** Emitted when a user is kicked from a channel. */
  kick: (channel: string, nick: string) => void;
  /** Emitted when a user parts a channel (including when the client itself parts a channel). */
  part: (channel: string, nick: string, reason: string, message: string) => void;
  /**
   * Emitted when a server PINGs the client.
   * The client will automatically send a PONG request just before this is emitted.
   */
  ping: (msg: string) => void;
  pong: (msg: string) => void;
  /**
   * Same as the 'message' event, but only emitted when the message is directed to the client.
   */
  pm: (nick: string, text: string, message: Message) => void;
  /**
   * Emitted when the client receives an ``/invite`
   */
  invite: (channel: string, from: string, message: Message) => void;
  /**
   * Emitted when the server sends the initial 001 line, indicating you've connected to the server.
   */
  registered: (message: Message) => void;
  error: (message: Message) => void;
  motd: (motd: string) => void;
  whois: (whois: WhoIsData) => void;
  /**
   * Emitted when the server sends a list of nicks for a channel (which happens immediately after joining or on request).
   * The nicks object passed to the callback is keyed by nickname, and has values '', '+', or '@' depending on the level of that nick in the channel.
   */
  names: (channel: string, nicks: Users) => void;
  channellist: (channelList: ChannelData[]) => void;
  channellist_item: (channel: ChannelData) => void;
  channellist_start: () => void;
  connect: () => void;
  /**
   * Emitted when a user changes nick, with the channels the user is known to be in.
   * Channels are emitted case-lowered.
   */
  nick: (nick: string, arg: string, channels: string[], message: Message) => void;
  notice: (from: string | undefined, to: string, text: string, message: Message) => void;
  opered: () => void;
  /** Emitted when the socket connection to the server emits an error event. */
  netError: (exception: string) => void;
  abort: (retryCount: number) => void;
  /**
   * Emitted whenever the server responds with a message the bot doesn't recognize and doesn't handle.
   * This must not be relied on to emit particular event codes, as the codes the bot does and does not handle can change between minor versions.
   * It should instead be used as a handler to do something when the bot does not recognize a message, such as warning a user.
   */
  unhandled: (message: Message) => void;
  /**
   * Emitted when a user joins a channel (including when the client itself joins a channel).
   */
  join: (channel: string, nick: string, message: string) => void;
  topic: (channel: string, topic: string, nick: string, message: Message) => void;
  quit: (who: string, reason: string, channels: string[], message: Message) => void;
  /**
   * Emitted when a message is sent.
   * The ``to`` parameter can be either a nick (which is most likely this client's nick and represents a private message), or a channel (which represents a message to that channel).
   */
  message: OnMessage;
  // Emitted when a message is sent from the client.
  selfMessage: (to: string, text: string) => void;
  /** Emitted whenever a user performs an action (e.g. ``/me waves``) */
  action: (from: string, to: string, text: string, message: Message) => void;
  /**
   * Emitted when a user is killed from the IRC server.
   * The ``channels`` parameter is an array of channels the killed user was in, those known to the client (that is, the ones the bot was present in).
   * Channels are emitted case-lowered.
   */
  kill: (nick: string, reason: string, channels: string[], message: Message) => void;
  /**
   * Emitted when a mode is added to a user or channel.
   * The ``channel`` parameter is the channel which the mode is being set on/in.
   * The ``by`` parameter is the user setting the mode.
   * The ``mode`` parameter is the single character mode identifier.
   * If the mode is being set on a user, ``argument`` is the nick of the user.  If the mode is being set on a channel, ``argument`` is the argument to the mode.
   * If a channel mode doesn't have any arguments, ``argument`` will be 'undefined'.
   * See the ``raw`` event for details on the ``message`` object.
   */
  '+mode': (
    channel: string,
    by: string,
    mode: string,
    argument: string | undefined,
    message: Message,
  ) => void;
  /**
   * Emitted when a mode is removed from a user or channel.
   * The other arguments are as in the ``+mode`` event.
   */
  '-mode': (
    channel: string,
    by: string,
    mode: string,
    argument: string | undefined,
    message: Message,
  ) => void;
  /** Emitted when a CTCP notice or privmsg was received */
  ctcp: (
    from: string,
    to: string,
    text: string,
    type: 'notice' | 'privmsg',
    message: Message,
  ) => void;
  /** Emitted when a CTCP notice is received. */
  'ctcp-notice': (from: string, to: string, text: string, message: Message) => void;
  /** Emitted when a CTCP privmsg was received. */
  'ctcp-privmsg': (from: string, to: string, text: string, message: Message) => void;
  /** Emitted when a CTCP VERSION request is received. */
  'ctcp-version': (from: string, to: string, message: Message) => void;
}

export class IrcClient extends TypedEmitter<IrcClientEvents> {
  opt: IrcOptions;
  connection!: {
    currentBuffer: Buffer;
    cyclingPingTimer: CyclingPingTimer;
    socket?: ReturnType<typeof NetConnect> | ReturnType<typeof TlsConnect>;
    renickInterval?: ReturnType<typeof setInterval>;
    requestedDisconnect?: boolean;
    attemptedLastRenick?: boolean;
  };

  nick = '';
  nickMod = 0;
  hostMask = '';
  maxLineLength?: number;
  _whoisData: Record<string, WhoIsData> = {};
  // Features supported by the server
  // (Initial values are RFC 1459 defaults. Zeros signify no default or unlimited value.)
  supported = {
    channel: {
      // eslint-disable-next-line @typescript-eslint/consistent-type-assertions
      idlength: {} as Record<string, number>,
      length: 200,
      limit: [] as number[],
      // eslint-disable-next-line @typescript-eslint/consistent-type-assertions
      modes: { a: '', b: '', c: '', d: '' } as Record<string, string>,
      types: '',
    },
    kicklength: 0,
    maxlist: [] as number[],
    // eslint-disable-next-line @typescript-eslint/consistent-type-assertions
    maxtargets: {} as Record<string, number>,
    modes: 3,
    nicklength: 9,
    topiclength: 0,
    usermodes: '',
  };

  motd?: string;
  modeForPrefix: Record<string, string> = {};
  prefixForMode: Record<string, string> = {};
  chans: Record<string, ChannelData> = {};
  channellist: ChannelData[] = [];
  retryTimeout?: ReturnType<typeof setTimeout>;

  constructor(host: string, nick: string, opt: Partial<IrcOptions> = {}) {
    super();
    this.opt = defaultsdeep({ host, nick }, opt, defaultOptions);
    this.supported.channel.types = this.opt.channelPrefixes;

    this.addListener('raw', message => this._handleRawMessage(message));
    this.addListener('kick', (channel: string, nick: string) => {
      if (this.opt.autoRejoin && nick.toLowerCase() === this.nick.toLowerCase()) {
        this.join(channel);
      }
    });
    this.addListener('motd', () => {
      this.opt.channels.forEach(channel => {
        this.join(channel);
      });
    });
  }

  connect(retryCount = 0) {
    const connection: IrcClient['connection'] = {
      currentBuffer: Buffer.from(''),
      cyclingPingTimer: new CyclingPingTimer(this.opt),
    };
    const connectFn: any = this.opt.secure ? TlsConnect : NetConnect;
    connection.socket = connectFn(
      this.opt.port,
      this.opt.host,
      {
        rejectUnauthorized: this.opt.rejectUnauthorized,
      },
      () => {
        // Callback called only after successful socket connection
        if (!this.opt.encoding) {
          this.connection.socket.setEncoding('utf-8');
        }

        this._connectionHandler();
      },
    );

    connection.socket.addListener('data', chunk => this.handleData(chunk));
    connection.socket.addListener('end', () => {
      this.debug('Connection got "end" event');
    });
    connection.socket.addListener('close', () => {
      this.debug('Connection got "close" event');
      // don't reconnect if this is an old connection closing
      if (connection !== this.connection) {
        this.debug('Non-latest connection is being discarded');
        return;
      }

      // skip if this connection is supposed to close
      if (connection?.requestedDisconnect) {
        return;
      }

      this.debug('Disconnected: reconnecting');
      connection.cyclingPingTimer.stop();
      this.cancelAutoRenick();
      // connection = null;
      // limit to retryCount reconnections
      if (this.opt.retryCount !== null && retryCount >= this.opt.retryCount) {
        this.debug('Maximum retry count (' + this.opt.retryCount + ') reached. Aborting');
        this.emit('abort', this.opt.retryCount);
        return;
      }

      // actually reconnect
      this.debug('Waiting ' + this.opt.retryDelay + 'ms before retrying');
      this.retryTimeout = setTimeout(() => {
        this.connect(retryCount + 1);
      }, this.opt.retryDelay);
    });

    connection.cyclingPingTimer.on('pingTimeout', () => {
      if (connection !== this.connection) {
        // Only care about a timeout event if it came from the current connection
        return;
      }

      this.end();
    });

    let pingCounter = 1;
    connection.cyclingPingTimer.on('wantPing', () => {
      if (connection !== this.connection) {
        // Only care about a wantPing event if it came from the current connection
        return;
      }

      this.send('PING', (pingCounter++).toString());
    });

    connection.socket.addListener('error', (exception: string) => {
      this.emit('netError', exception);
      this.debug(`Network error: ${exception}`);
    });
    this.connection = connection;
  }

  debug(...args: Parameters<typeof console.log>) {
    log(...args);
  }

  join(channel: string) {
    this.once(`join${channel.toLowerCase()}` as any, () => {
      // Append to opts.channel on successful join, so it rejoins on reconnect.
      const channelIndex = this._findChannelFromStrings(channel);
      if (channelIndex === -1) {
        this.opt.channels.push(channel);
      }
    });

    this.send('JOIN', channel);
  }

  part(channel: string) {
    this.send('PART', channel);
  }

  say(target: string, text: string) {
    this._speak('PRIVMSG', target, text);
  }

  notice(target: string, text: string) {
    this._speak('PRIVMSG', target, text);
  }

  handleData = (chunk: string | Buffer) => {
    this.connection.cyclingPingTimer.notifyOfActivity();

    if (typeof chunk === 'string') {
      this.connection.currentBuffer = Buffer.concat([
        this.connection.currentBuffer,
        Buffer.from(chunk),
      ]);
    } else {
      this.connection.currentBuffer = Buffer.concat([this.connection.currentBuffer, chunk]);
    }

    const lines = this.convertEncoding(this.connection.currentBuffer)
      .toString()
      .split(lineDelimiter);

    if (lines.pop()) {
      // if buffer doesn't end \r\n, there are more chunks.
      return;
    }

    // Reset buffer
    this.connection.currentBuffer = Buffer.from('');

    for (const line of lines.filter(n => n)) {
      this.debug('Received:', line);
      const message = parseMessage(line, this.opt.stripColors);
      this.emit('raw', message);
    }
  };

  send(...args: string[]) {
    // e.g. NICK, nickname

    // if the last arg contains a space, starts with a colon, or is empty, prepend a colon
    if (
      /\s/.exec(args[args.length - 1]) ||
      /^:/.exec(args[args.length - 1]) ||
      args[args.length - 1] === ''
    ) {
      args[args.length - 1] = ':' + args[args.length - 1];
    }

    if (this.connection.requestedDisconnect) {
      this.debug('(Disconnected) SEND:', args.join(' '));
    } else {
      this.debug('SEND:', args.join(' '));
      this.connection.socket.write(args.join(' ') + '\r\n');
    }
  }

  /** Request a whois for the specified ``nick``. */
  async whois(nick: string): Promise<{ nick?: string; user?: string; host?: string }> {
    const promise = new Promise<{ nick?: string; user?: string; host?: string }>(resolve => {
      this.addListener('whois', info => {
        if ((info.nick as string)?.toLowerCase() === nick.toLowerCase()) {
          resolve(info);
        }
      });
    });

    this.send('WHOIS', nick);
    return promise;
  }

  end() {
    if (this.connection.socket) {
      this.connection.requestedDisconnect = true;
      this.connection.cyclingPingTimer.stop();
      this.cancelAutoRenick();
      this.connection.socket.destroy();
    }
  }

  private emitChannelEvent(
    eventName: 'notice' | 'part' | 'kick' | 'join' | 'names',
    channel: string,
    ...args: string[] | [string] | [Users]
  ) {
    // @ts-expect-error
    this.emit(eventName, channel, ...args);
    // @ts-expect-error
    this.emit(eventName + channel, ...args);
  }

  private cancelAutoRenick(): void {
    if (this.connection?.renickInterval) {
      clearInterval(this.connection.renickInterval);
    }
  }

  private convertEncoding(str: string | Buffer) {
    if (this.opt.encoding) {
      return convertEncodingHelper(str, this.opt.encoding, (err, charset) => {
        this.debug(err, { str, charset });
      });
    }

    return str;
  }

  private _speak(kind: string, target: string, text: string) {
    const maxLength = Math.min(this.maxLineLength - target.length, this.opt.messageSplit);
    if (typeof text === 'undefined') {
      return;
    }

    text
      .toString()
      .split(/\r?\n/)
      .filter(line => {
        return line.length > 0;
      })
      .forEach(line => {
        const linesToSend = this._splitLongLines(line, maxLength);
        linesToSend.forEach(toSend => {
          this.send(kind, target, toSend);
          if (kind === 'PRIVMSG') {
            this.emit('selfMessage', target, toSend);
          }
        });
      });
  }

  private _splitLongLines(words: string, maxLength = 450, destination: string[] = []): string[] {
    // If maxLength hasn't been initialized yet, prefer an arbitrarily low line length over crashing.
    // If no words left, return the accumulated array of splits
    if (words.length === 0) {
      return destination;
    }

    // If the remaining words fit under the byte limit (by utf-8, for Unicode support), push to the accumulator and return
    if (Buffer.byteLength(words, 'utf8') <= maxLength) {
      destination.push(words);
      return destination;
    }

    // else, attempt to write maxLength bytes of message, truncate accordingly
    const truncatingBuffer = Buffer.alloc(maxLength + 1);
    const writtenLength = truncatingBuffer.write(words, 'utf8');
    const truncatedStr = truncatingBuffer.toString('utf8', 0, writtenLength);
    // and then check for a word boundary to try to keep words together
    const len = truncatedStr.length - 1;
    let c = truncatedStr[len];
    let cutPos = len;
    let wsLength = 1;
    if (/\s/.exec(c)) {
      cutPos = len;
    } else {
      let offset = 1;
      while (len - offset > 0) {
        c = truncatedStr[len - offset];
        if (/\s/.exec(c)) {
          cutPos = len - offset;
          break;
        }

        offset++;
      }

      if (len - offset <= 0) {
        cutPos = len;
        wsLength = 0;
      }
    }

    // and push the found region to the accumulator, remove from words, split rest of message
    const part = truncatedStr.substring(0, cutPos);
    destination.push(part);
    return this._splitLongLines(
      words.substring(cutPos + wsLength, words.length),
      maxLength,
      destination,
    );
  }

  /**
   * @param message rpl_welcome
   */
  private async _handleWelcome(message: Message) {
    // Set nick to whatever the server decided it really is
    // (normally this is because you chose something too long and the server has shortened it)
    this.nick = message.args[0];
    // Note our hostmask to use it in splitting long messages
    // We don't send our hostmask when issuing PRIVMSGs or NOTICEs, but servers on the other side will include it in messages and will truncate what we send accordingly
    const welcomeStringWords = message.args[1].split(/\s+/);
    this.hostMask = welcomeStringWords[welcomeStringWords.length - 1];
    this._updateMaxLineLength();
    this.emit('registered', message);
    const res = await this.whois(this.nick);
    this.nick = res.nick ?? '';
    this.hostMask = res.user + '@' + res.host;
    this._updateMaxLineLength();
  }

  private _handleRawMessage(message: Message): void {
    switch (message.command) {
      case 'rpl_welcome':
        this._handleWelcome(message).catch(err => this.debug(err));
        return;
      case 'rpl_myinfo':
        this.supported.usermodes = message.args[3];
        break;
      case 'rpl_isupport':
        this.handleIsupport(message.args);
        break;
      case 'rpl_yourhost':
      case 'rpl_created':
      case 'rpl_luserclient':
      case 'rpl_luserop':
      case 'rpl_luserchannels':
      case 'rpl_luserme':
      case 'rpl_localusers':
      case 'rpl_globalusers':
      case 'rpl_statsconn':
      case 'rpl_luserunknown':
      case 'rpl_whoishost':
      case '396':
      case '042':
        // Random welcome stuff, ignoring
        break;
      case 'err_nicknameinuse':
        this._handleNicknameinuse(message);
        break;
      case 'PING':
        this.send('PONG', message.args[0]);
        this.emit('ping', message.args[0]);
        break;
      case 'PONG':
        this.emit('pong', message.args[0]);
        break;
      case 'NOTICE':
        this._handleNotice(message);
        break;
      case 'MODE':
        this._handleMode(message);
        break;
      case 'NICK':
        this._handleNick(message);
        break;
      case 'rpl_motdstart':
        this.motd = message.args[1] + '\n';
        break;
      case 'rpl_motd':
        this.motd += message.args[1] + '\n';
        break;
      case 'rpl_endofmotd':
      case 'err_nomotd':
        this.motd += message.args[1] + '\n';
        this.emit('motd', this.motd);
        break;
      case 'rpl_namreply':
        this._handleNam(message);
        break;
      case 'rpl_endofnames':
        this._handleEndofnames(message);
        break;
      case 'rpl_topic':
        this._handleRplTopic(message);
        break;
      case 'rpl_away':
        this._addWhoisData(message.args[1], 'away', message.args[2], true);
        break;
      case 'rpl_whoisuser':
        this._addWhoisData(message.args[1], 'user', message.args[2]);
        this._addWhoisData(message.args[1], 'host', message.args[3]);
        this._addWhoisData(message.args[1], 'realname', message.args[5]);
        break;
      case 'rpl_whoisidle':
        this._addWhoisData(message.args[1], 'idle', message.args[2]);
        break;
      case 'rpl_whoischannels':
        // TODO - clean this up?
        this._addWhoisData(message.args[1], 'channels', message.args[2].trim().split(/\s+/));
        break;
      case 'rpl_whoisserver':
        this._addWhoisData(message.args[1], 'server', message.args[2]);
        this._addWhoisData(message.args[1], 'serverinfo', message.args[3]);
        break;
      case 'rpl_whoisoperator':
        this._addWhoisData(message.args[1], 'operator', message.args[2]);
        break;
      case '330': // rpl_whoisaccount?
        this._addWhoisData(message.args[1], 'account', message.args[2]);
        this._addWhoisData(message.args[1], 'accountinfo', message.args[3]);
        break;
      case 'rpl_endofwhois':
        this.emit('whois', this._clearWhoisData(message.args[1]));
        break;
      case 'rpl_whoreply':
        this._addWhoisData(message.args[5], 'user', message.args[2]);
        this._addWhoisData(message.args[5], 'host', message.args[3]);
        this._addWhoisData(message.args[5], 'server', message.args[4]);
        this._addWhoisData(message.args[5], 'realname', /[0-9]+\s*(.+)/g.exec(message.args[7])[1]);
        // emit right away because rpl_endofwho doesn't contain nick
        this.emit('whois', this._clearWhoisData(message.args[5]));
        break;
      case 'rpl_liststart':
        this.channellist = [];
        this.emit('channellist_start');
        break;
      case 'rpl_list':
        this._handleList(message);
        break;
      case 'rpl_listend':
        this.emit('channellist', this.channellist);
        break;
      case 'rpl_topicwhotime':
        this._handleTopicwhotime(message);
        break;
      case 'TOPIC':
        this._handleTopic(message);
        break;
      case 'rpl_channelmodeis':
        this._handleChannelmodeis(message);
        break;
      case 'rpl_creationtime':
        this._handleCreationtime(message);
        break;
      case 'JOIN':
        this._handleJoin(message);
        break;
      case 'PART':
        this._handlePart(message);
        break;
      case 'KICK':
        this._handleKick(message);
        break;
      case 'KILL':
        this._handleKill(message);
        break;
      case 'PRIVMSG':
        this._handlePrivmsg(message);
        break;
      case 'INVITE':
        this.emit('invite', message.args[1], message.nick, message);
        break;
      case 'QUIT':
        this._handleQuit(message);
        break;
      // for sasl
      case 'CAP':
        this._handleCap(message);
        break;
      case 'AUTHENTICATE':
        this._handleAuthenticate(message);
        break;
      case 'rpl_loggedin':
        break;
      case 'rpl_saslsuccess':
        this.send('CAP', 'END');
        break;
      case 'err_umodeunknownflag':
        this.debug(message);
        this.emit('error', message);
        break;
      case 'err_erroneusnickname':
        this.debug(message);
        this.emit('error', message);
        break;
      // Commands relating to OPER
      case 'err_nooperhost':
        this.debug(message);
        this.emit('error', message);
        break;
      case 'rpl_youreoper':
        this.emit('opered');
        break;
      default:
        if (message.commandType === 'error') {
          this.debug(message);
          this.emit('error', message);
        } else {
          this.debug('Unhandled message:', message);
          this.emit('unhandled', message);
          break;
        }
    }
  }

  private _handleNick(message: Message): void {
    if (message.nick === this.nick) {
      // client just changed own nick
      this.nick = message.args[0];
      this.cancelAutoRenick();
      this._updateMaxLineLength();
    }

    this.debug('NICK: ' + message.nick + ' changes nick to ' + message.args[0]);

    const channels: string[] = [];

    // Figure out what channels the user is in, update relevant nicks
    Object.entries(this.chans).forEach(([channame, chan]) => {
      if (message.nick in chan.users) {
        chan.users[message.args[0]] = chan.users[message.nick];
        // eslint-disable-next-line @typescript-eslint/no-dynamic-delete
        delete chan.users[message.nick];
        channels.push(channame);
      }
    });

    // old nick, new nick, channels
    this.emit('nick', message.nick, message.args[0], channels, message);
  }

  private _handleNam(message: Message): void {
    const channel = this.chanData(message.args[2]);
    if (!channel) {
      return;
    }

    const users = message.args[3].trim().split(/ +/);
    users.forEach(user => {
      const match = /^(.)(.*)$/.exec(user);
      if (match) {
        if (match[1] in this.modeForPrefix) {
          channel.users[match[2]] = match[1];
        } else {
          channel.users[match[1] + match[2]] = '';
        }
      }
    });
  }

  private handleIsupport(args: Message['args']): void {
    for (const arg of args) {
      const match = /([A-Z]+)=(.*)/.exec(arg);
      if (!match) {
        continue;
      }

      const param = match[1];
      const value = match[2];
      const type = ['a', 'b', 'c', 'd'] as const;

      switch (param) {
        case 'CHANLIMIT': {
          value.split(',').forEach(val => {
            const split = val.split(':');
            this.supported.channel.limit[Number(split[0])] = parseInt(split[1], 10);
          });
          break;
        }

        case 'CHANMODES': {
          const split = value.split(',');
          for (let i = 0; i < type.length; i++) {
            this.supported.channel.modes[type[i]] += split[i];
          }

          break;
        }

        case 'CHANTYPES': {
          this.supported.channel.types = value;
          break;
        }

        case 'CHANNELLEN': {
          this.supported.channel.length = parseInt(value, 10);
          break;
        }

        case 'IDCHAN': {
          value.split(',').forEach(val => {
            const split = val.split(':');
            this.supported.channel.idlength[split[0]] = parseInt(split[1], 10);
          });
          break;
        }

        case 'KICKLEN': {
          this.supported.kicklength = parseInt(value, 10);
          break;
        }

        case 'MAXLIST': {
          value.split(',').forEach(val => {
            const split = val.split(':');
            this.supported.maxlist[Number(split[0])] = parseInt(split[1], 10);
          });
          break;
        }

        case 'NICKLEN': {
          this.supported.nicklength = parseInt(value, 10);
          break;
        }

        case 'PREFIX': {
          const prefixMatch = /\((.*?)\)(.*)/.exec(value);
          if (prefixMatch) {
            const prefixSplit = [];
            prefixSplit[1] = prefixMatch[1].split('');
            prefixSplit[2] = prefixMatch[2].split('');
            while (prefixSplit[1].length) {
              this.modeForPrefix[prefixSplit[2][0]] = prefixSplit[1][0];
              this.supported.channel.modes.b += prefixSplit[1][0];
              this.prefixForMode[prefixSplit[1].shift()] = prefixSplit[2].shift();
            }
          }

          break;
        }

        case 'TARGMAX': {
          value.split(',').forEach(val => {
            const split = val.split(':');
            const value = split[1] ? parseInt(split[1], 10) : 0;
            this.supported.maxtargets[split[0]] = value;
          });
          break;
        }

        case 'TOPICLEN': {
          this.supported.topiclength = parseInt(value, 10);
          break;
        }

        default: {
          break;
        }
      }
    }
  }

  private _handleMode(message: Message): void {
    this.debug('MODE: ' + message.args[0] + ' sets mode: ' + message.args[1]);

    const channel = this.chanData(message.args[0]);
    if (!channel) {
      return;
    }

    const modeList = message.args[1].split('');
    let adding = true;
    const modeArgs = message.args.slice(2);
    const chanModes = (mode: string, param?: string | string[]) => {
      const isArr = param && Array.isArray(param);
      if (adding) {
        if (!channel.mode.includes(mode)) {
          channel.mode += mode;
        }

        if (typeof param === 'undefined') {
          channel.modeParams[mode] = [];
        } else if (isArr) {
          channel.modeParams[mode] = channel.modeParams[mode]
            ? channel.modeParams[mode].concat(param)
            : param;
        } else {
          channel.modeParams[mode] = [param];
        }
      } else if (mode in channel.modeParams) {
        if (isArr && Array.isArray(channel.modeParams[mode])) {
          channel.modeParams[mode] = channel.modeParams[mode].filter((v: string) => v !== param[0]);
        }

        if (!isArr || channel.modeParams[mode].length === 0) {
          channel.mode = channel.mode.replace(mode, '');
          // eslint-disable-next-line @typescript-eslint/no-dynamic-delete
          delete channel.modeParams[mode];
        }
      }
    };

    modeList.forEach(mode => {
      if (mode === '+') {
        adding = true;
        return;
      }

      if (mode === '-') {
        adding = false;
        return;
      }

      const eventName = adding ? '+mode' : '-mode';
      const supported = this.supported.channel.modes;
      let modeArg: string;
      if (mode in this.prefixForMode) {
        modeArg = modeArgs.shift();
        if (Object.prototype.hasOwnProperty.call(channel.users, modeArg)) {
          if (adding) {
            if (!channel.users[modeArg].includes(this.prefixForMode[mode])) {
              channel.users[modeArg] += this.prefixForMode[mode];
            }
          } else {
            channel.users[modeArg] = channel.users[modeArg].replace(this.prefixForMode[mode], '');
          }
        }

        this.emit(eventName, message.args[0], message.nick, mode, modeArg, message);
      } else if (supported.a.includes(mode)) {
        modeArg = modeArgs.shift();
        chanModes(mode, [modeArg]);
        this.emit(eventName, message.args[0], message.nick, mode, modeArg, message);
      } else if (supported.b.includes(mode)) {
        modeArg = modeArgs.shift();
        chanModes(mode, modeArg);
        this.emit(eventName, message.args[0], message.nick, mode, modeArg, message);
      } else if (supported.c.includes(mode)) {
        if (adding) {
          modeArg = modeArgs.shift();
        } else {
          modeArg = undefined;
        }

        chanModes(mode, modeArg);
        this.emit(eventName, message.args[0], message.nick, mode, modeArg, message);
      } else if (supported.d.includes(mode)) {
        chanModes(mode);
        this.emit(eventName, message.args[0], message.nick, mode, undefined, message);
      }
    });
  }

  private chanData(name: string, create = false): ChannelData {
    const key = name.toLowerCase();
    if (create) {
      this.chans[key] = this.chans[key] ?? {
        key,
        serverName: name,
        users: {},
        modeParams: {},
        mode: '',
      };
    }

    return this.chans[key];
  }

  private _handleNotice(message: Message): void {
    const from = message.nick;
    const to: string | undefined = message.args[0] ?? null;
    const text = message.args[1] ?? '';

    if (text.startsWith('\u0001') && text.lastIndexOf('\u0001') > 0) {
      this._handleCTCP(from, to, text, 'notice', message);
      return;
    }

    this.emit('notice', from, to, text, message);

    if (to === this.nick) {
      this.debug(
        'GOT NOTICE from ' + (from ? '"' + from + '"' : 'the server') + ': "' + text + '"',
      );
    }
  }

  // eslint-disable-next-line max-params
  private _handleCTCP(
    from: string,
    to: string,
    text: string,
    type: 'notice' | 'privmsg',
    message: Message,
  ): void {
    text = text.slice(1);
    text = text.slice(0, text.indexOf('\u0001'));
    const parts = text.split(' ');
    this.emit('ctcp', from, to, text, type, message);
    this.emit(`ctcp-${type}` as 'ctcp-notice', from, to, text, message);
    if (type === 'privmsg' && text === 'VERSION') {
      this.emit('ctcp-version', from, to, message);
    }

    if (parts[0] === 'ACTION' && parts.length > 1) {
      this.emit('action', from, to, parts.slice(1).join(' '), message);
    }

    if (parts[0] === 'PING' && type === 'privmsg' && parts.length > 1) {
      this.ctcp(from, 'notice', text);
    }
  }

  private ctcp(to: string, type: 'privmsg' | string, text: string) {
    return this[type === 'privmsg' ? 'say' : 'notice'](to, '\u0001' + text + '\u0001');
  }

  // finds the string in opt.channels representing channelName (if present)
  private _findChannelFromStrings(channelName: string) {
    channelName = channelName.toLowerCase();
    const index = this.opt.channels.findIndex(listString => {
      let name = listString.split(' ')[0]; // ignore the key in the string
      name = name.toLowerCase(); // check case-insensitively
      return channelName === name;
    });

    return index;
  }

  private _handleNicknameinuse(message: Message): void {
    if (typeof this.nickMod === 'undefined') {
      this.nickMod = 0;
    }

    if (
      message.args[1] === this.opt.nick &&
      (this.connection.renickInterval || this.connection.attemptedLastRenick)
    ) {
      this.debug('Attempted to automatically renick to', message.args[1], 'and found it taken');
      return;
    }

    this.nickMod++;
    this.send('NICK', this.opt.nick + this.nickMod);
    this.nick = this.opt.nick + this.nickMod;
    this._updateMaxLineLength();
    if (this.opt.autoRenick) {
      let renickTimes = 0;
      this.cancelAutoRenick();
      this.connection.renickInterval = setInterval(() => {
        if (this.nick === this.opt.nick) {
          this.debug(
            'Attempted to automatically renick to',
            this.nick,
            'and found that was the current nick',
          );
          this.cancelAutoRenick();
          return;
        }

        this.send('NICK', this.opt.nick);
        renickTimes++;
        if (this.opt.renickCount !== null && renickTimes >= this.opt.renickCount) {
          this.debug('Maximum autorenick retry count (' + this.opt.renickCount + ') reached');
          this.cancelAutoRenick();
          this.connection.attemptedLastRenick = true;
        }
      }, this.opt.renickDelay);
    }
  }

  private _addWhoisData(
    nick: string,
    key: string,
    value: string | string[],
    onlyIfExists?: boolean,
  ) {
    if (onlyIfExists && !this._whoisData[nick]) {
      return;
    }

    this._whoisData[nick] = this._whoisData[nick] ?? { nick };
    this._whoisData[nick][key] = value;
  }

  private _clearWhoisData(nick: string) {
    // Ensure that at least the nick exists before trying to return
    this._addWhoisData(nick, 'nick', nick);
    const data = this._whoisData[nick];
    // eslint-disable-next-line @typescript-eslint/no-dynamic-delete
    delete this._whoisData[nick];
    return data;
  }

  private _connectionHandler() {
    this.debug('Socket connection successful');

    // WEBIRC
    if (this.opt.webirc.ip && this.opt.webirc.pass && this.opt.webirc.host) {
      this.send(
        'WEBIRC',
        this.opt.webirc.pass,
        this.opt.userName,
        this.opt.webirc.host,
        this.opt.webirc.ip,
      );
    }

    // SASL, server password
    if (this.opt.sasl) {
      // see http://ircv3.net/specs/extensions/sasl-3.1.html
      this.send('CAP', 'REQ', 'sasl');
    } else if (this.opt.password) {
      this.send('PASS', this.opt.password);
    }

    // handshake details
    this.debug('Sending irc NICK/USER');
    this.send('NICK', this.opt.nick);
    this.nick = this.opt.nick;
    this._updateMaxLineLength();
    this.send('USER', this.opt.userName, '8', '*', this.opt.realName);

    // watch for ping timeout
    this.connection.cyclingPingTimer.start();

    this.emit('connect');
  }

  private _updateMaxLineLength() {
    // 497 = 510 - (":" + "!" + " PRIVMSG " + " :").length;
    // target is determined in _speak() and subtracted there
    this.maxLineLength = 497 - this.nick.length - this.hostMask.length;
  }

  private _handleAuthenticate(message: Message): void {
    if (message.args[0] !== '+') {
      return;
    }

    // AUTHENTICATE response (params) must be split into 400-byte chunks
    const authMessage = Buffer.from(
      this.opt.nick + '\0' + this.opt.userName + '\0' + this.opt.password,
    ).toString('base64');
    // must output a "+" after a 400-byte string to make clear it's finished
    for (let i = 0; i < (authMessage.length + 1) / 400; i++) {
      let chunk = authMessage.slice(i * 400, (i + 1) * 400);
      if (chunk === '') {
        chunk = '+';
      }

      this.send('AUTHENTICATE', chunk);
    }
  }

  private _handlePart(message: Message): void {
    // channel, who, reason
    if (this.nick === message.nick) {
      const channel = this.chanData(message.args[0]);
      // eslint-disable-next-line @typescript-eslint/no-dynamic-delete
      delete this.chans[channel.key];
    } else {
      const channel = this.chanData(message.args[0]);
      if (channel?.users) {
        // eslint-disable-next-line @typescript-eslint/no-dynamic-delete
        delete channel.users[message.nick];
      }
    }

    this.emitChannelEvent('part', message.args[0], message.nick, message.args[1]);
  }

  private _handleKick(message: Message): void {
    if (this.nick === message.args[1]) {
      const channel = this.chanData(message.args[0]);
      // eslint-disable-next-line @typescript-eslint/no-dynamic-delete
      delete this.chans[channel.key ?? ''];
    } else {
      const channel = this.chanData(message.args[0]);
      if (channel?.users) {
        // eslint-disable-next-line @typescript-eslint/no-dynamic-delete
        delete channel.users[message.args[1]];
      }
    }

    // channel, who, by, reason
    this.emitChannelEvent('kick', message.args[0], message.args[1], message.nick, message.args[2]);
  }

  private _handleList(message: Message): void {
    const channel = {
      name: message.args[1],
      users: message.args[2] as any as Record<string, string>,
      topic: message.args[3],
    };
    this.emit('channellist_item', channel);
    this.channellist.push(channel);
  }

  private _handleKill(message: Message): void {
    const nick = message.args[0];
    const channels: string[] = [];
    Object.entries(this.chans).forEach(([channame, chan]) => {
      if (nick in (chan.users as any)) {
        channels.push(channame);
        // eslint-disable-next-line @typescript-eslint/no-dynamic-delete
        delete chan.users[nick];
      }
    });
    this.emit('kill', nick, message.args[1], channels, message);
  }

  private _handlePrivmsg(message: Message): void {
    const from = message.nick;
    const to = message.args[0];
    const text = message.args[1] ?? '';
    if (text.startsWith('\u0001') && text.lastIndexOf('\u0001') > 0) {
      this._handleCTCP(from, to, text, 'privmsg', message);
      return;
    }

    this.emit('message', from, to, text, message);
    if (this.supported.channel.types.includes(to.charAt(0))) {
      this.emit(('message#' + to.toLowerCase()) as any, from, to, text, message);
    }

    if (to.toUpperCase() === this.nick.toUpperCase()) {
      this.emit('pm', from, text, message);
      this.debug('GOT MESSAGE from "' + from + '": "' + text + '"');
    }
  }

  private _handleQuit(message: Message): void {
    this.debug('QUIT: ' + message.prefix + ' ' + message.args.join(' '));
    if (this.nick === message.nick) {
      // TODO handle?
      return;
    }

    // handle other people quitting
    const channels: string[] = [];

    // Figure out what channels the user was in
    Object.entries(this.chans).forEach(([channame, chan]) => {
      if (message.nick in (chan.users as any)) {
        // eslint-disable-next-line @typescript-eslint/no-dynamic-delete
        delete chan.users[message.nick];
        channels.push(channame);
      }
    });

    // who, reason, channels
    this.emit('quit', message.nick, message.args[0], channels, message);
  }

  private _handleCap(message: Message): void {
    // client identifier name, cap subcommand, params
    if (message.args[1] === 'NAK') {
      // capabilities not handled, error
      this.debug(message);
      this.emit('error', message);
      return;
    }

    // currently only handle ACK sasl responses
    if (message.args[1] !== 'ACK') {
      return;
    }

    const caps = message.args[2].split(/\s+/);
    if (!caps.includes('sasl')) {
      return;
    }

    this.send('AUTHENTICATE', 'PLAIN');
  }

  private _handleJoin(message: Message): void {
    // channel, who
    if (this.nick === message.nick) {
      this.chanData(message.args[0], true);
    } else {
      const channel = this.chanData(message.args[0]);
      if (channel?.users) {
        channel.users[message.nick] = '';
      }
    }

    this.emitChannelEvent('join', message.args[0], message.nick);
  }

  private _handleTopic(message: Message): void {
    // channel, topic, nick
    this.emit('topic', message.args[0], message.args[1], message.nick, message);

    const channel = this.chanData(message.args[0]);
    if (channel) {
      channel.topic = message.args[1];
      channel.topicBy = message.nick;
    }
  }

  private _handleTopicwhotime(message: Message): void {
    const channel = this.chanData(message.args[1]);
    if (channel) {
      channel.topicBy = message.args[2];
      // channel, topic, nick
      this.emit('topic', message.args[1], channel.topic, channel.topicBy, message);
    }
  }

  private _handleChannelmodeis(message: Message): void {
    const channel = this.chanData(message.args[1]);
    if (channel) {
      channel.mode = message.args[2];
    }
  }

  private _handleCreationtime(message: Message): void {
    const channel = this.chanData(message.args[1]);
    if (channel) {
      channel.created = message.args[2];
    }
  }

  private _handleRplTopic(message: Message): void {
    const channel = this.chanData(message.args[1]);
    if (channel) {
      channel.topic = message.args[2];
    }
  }

  private _handleEndofnames(message: Message): void {
    const channel = this.chanData(message.args[1]);
    if (channel) {
      this.emitChannelEvent('names', message.args[1], channel.users);
      this.send('MODE', message.args[1]);
    }
  }
}

function convertEncodingHelper(
  str: string | Buffer,
  encoding: string,
  errorHandler: (e: Error, charset?: string) => void,
) {
  let charset: string | null;
  try {
    const buff = Buffer.from(str);
    charset = charsetDetector.detect(buff);
    const decoded = iconv.decode(buff, charset ?? '');
    return Buffer.from(iconv.encode(decoded, encoding));
  } catch (err) {
    if (!errorHandler) {
      throw err;
    }

    errorHandler(err as Error, charset);
  }
}
