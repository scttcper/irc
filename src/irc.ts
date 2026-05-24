import { connect as NetConnect } from 'node:net';
import { connect as TlsConnect } from 'node:tls';

import debug from 'debug';
import defaultsdeep from 'lodash.defaultsdeep';
import { TypedEmitter } from 'tiny-typed-emitter';

import {
  getCapabilityRegistrationCommands,
  getSaslPlainAuthenticateChunks,
  handleCapMessage,
} from './capabilityNegotiation.js';
import { applyChannelModeChange, applyChannelModeSnapshot } from './channelModes.js';
import { ChannelStore } from './channelStore.js';
import { type CtcpType, formatCtcpMessage, isCtcpMessage, parseCtcpMessage } from './ctcp.js';
import { CyclingPingTimer } from './cyclingPingTimer.js';
import { utf8ByteLength } from './ircEncoding.js';
import {
  applyIsupport,
  defaultChannelModes,
  defaultChannelTypes,
  defaultModeForPrefix,
  defaultPrefixForMode,
} from './ircIsupport.js';
import { defaultOptions, type IrcOptions } from './ircOptions.js';
import {
  type ChannelData,
  type IrcClientEvents,
  type SupportedFeatures,
  type Users,
} from './ircTypes.js';
import { LineReader } from './lineReader.js';
import { splitOutgoingMessage } from './messageSplitter.js';
import { Message, parseMessage } from './parseMessage.js';
import { WhoisTracker, type WhoisResult } from './whoisTracker.js';

const log = debug('irc');

type CtcpContext = {
  from: string;
  to: string;
  text: string;
  type: CtcpType;
  message: Message;
};

type ChannelEventArgs = {
  join: [nick: string];
  kick: [nick: string, by: string, reason: string];
  names: [users: Users];
  part: [nick: string, reason: string];
};

function containsInvalidLineByte(value: string): boolean {
  for (let i = 0; i < value.length; i++) {
    const code = value.charCodeAt(i);
    if (code === 0 || code === 10 || code === 13) {
      return true;
    }
  }

  return false;
}

function mustBeTrailingParam(value: string): boolean {
  if (value === '' || value.charCodeAt(0) === 58) {
    return true;
  }

  for (let i = 0; i < value.length; i++) {
    const code = value.charCodeAt(i);
    if (code === 32 || code === 9 || code === 11 || code === 12) {
      return true;
    }
  }

  return false;
}

export type { ChannelData } from './ircTypes.js';
export type { IrcOptions } from './ircOptions.js';

export class IrcClient extends TypedEmitter<IrcClientEvents> {
  readonly opt: IrcOptions;
  connection!: {
    cyclingPingTimer: CyclingPingTimer;
    lineReader: LineReader;
    socket?: ReturnType<typeof NetConnect> | ReturnType<typeof TlsConnect>;
    renickInterval?: ReturnType<typeof setInterval>;
    requestedDisconnect?: boolean;
    attemptedLastRenick?: boolean;
  };

  nick = '';
  nickMod = 0;
  hostMask = '';
  maxLineLength?: number;
  private readonly channelStore = new ChannelStore();
  private readonly whoisTracker = new WhoisTracker();
  // Features supported by the server
  // (Initial values are RFC 1459 defaults. Zeros signify no default or unlimited value.)
  // ISUPPORT defaults: https://modern.ircdocs.horse/#feature-advertisement
  supported: SupportedFeatures = {
    channel: {
      idlength: {},
      length: 200,
      limit: {},
      modes: { ...defaultChannelModes },
      types: defaultChannelTypes,
    },
    kicklength: 0,
    maxlist: {},
    maxtargets: {},
    modes: 3,
    nicklength: 9,
    topiclength: 0,
    usermodes: '',
  };

  motd?: string;
  modeForPrefix: Record<string, string> = { ...defaultModeForPrefix };
  prefixForMode: Record<string, string> = { ...defaultPrefixForMode };
  channellist: ChannelData[] = [];
  private channellistOpen = false;
  retryTimeout?: ReturnType<typeof setTimeout>;
  /** Channels joined at runtime, tracked separately from the initial options. */
  private _autoJoinChannels: string[] = [];

  constructor(host: string, nick: string, opt: Partial<IrcOptions> = {}) {
    super();
    this.opt = defaultsdeep({ host, nick }, opt, defaultOptions);
    this.supported.channel.types = this.opt.channelPrefixes;

    this.addListener('raw', message => this._handleRawMessage(message));
    this.addListener('kick', (channel: string, n: string) => {
      if (this.opt.autoRejoin && n.toLowerCase() === this.nick.toLowerCase()) {
        this.join(channel);
      }
    });
    this.addListener('motd', () => {
      for (const channel of this.opt.channels) {
        this.join(channel);
      }

      for (const channel of this._autoJoinChannels) {
        this.join(channel);
      }
    });
  }

  get chans(): Record<string, ChannelData> {
    return this.channelStore.channels;
  }

  set chans(channels: Record<string, ChannelData>) {
    this.channelStore.replace(channels);
  }

  connect(retryCount = 0) {
    this.clearRetryTimeout();
    const connection: IrcClient['connection'] = {
      cyclingPingTimer: new CyclingPingTimer(this.opt),
      lineReader: new LineReader(this.opt.encoding),
    };
    const onConnect = () => {
      // Callback called only after successful socket connection
      if (!this.opt.encoding) {
        this.connection.socket.setEncoding('utf-8');
      }

      this._connectionHandler();
    };
    if (this.opt.secure) {
      connection.socket = TlsConnect(
        {
          port: this.opt.port,
          host: this.opt.host,
          rejectUnauthorized: this.opt.selfSigned ? false : this.opt.rejectUnauthorized,
        },
        onConnect,
      );
    } else {
      connection.socket = NetConnect(
        {
          port: this.opt.port,
          host: this.opt.host,
        },
        onConnect,
      );
    }

    connection.socket.addListener('data', chunk => this.handleDataForConnection(connection, chunk));
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
      this.whoisTracker.rejectAll(new Error('Disconnected before WHOIS completed'));
      connection.cyclingPingTimer.stop();
      this.cancelAutoRenick();
      // connection = null;
      // limit to retryCount reconnections
      if (this.opt.retryCount !== null && retryCount >= this.opt.retryCount) {
        this.debug(`Maximum retry count (${this.opt.retryCount}) reached. Aborting`);
        this.emit('abort', this.opt.retryCount);
        return;
      }

      // actually reconnect
      this.debug(`Waiting ${this.opt.retryDelay}ms before retrying`);
      this.retryTimeout = setTimeout(() => {
        this.connect(retryCount + 1);
      }, this.opt.retryDelay);
    });

    connection.cyclingPingTimer.on('pingTimeout', () => {
      if (connection !== this.connection) {
        // Only care about a timeout event if it came from the current connection
        return;
      }

      this.disconnectForReconnect();
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

  debug(...args: Parameters<typeof log>) {
    log(...args);
  }

  join(channel: string) {
    const onJoin = (joinedChannel: string) => {
      if (joinedChannel.toLowerCase() !== channel.toLowerCase()) {
        return;
      }

      this.removeListener('join', onJoin);
      // Track for auto-rejoin on reconnect.
      if (!this._isChannelTracked(channel)) {
        this._autoJoinChannels.push(channel);
      }
    };
    this.addListener('join', onJoin);

    this.send('JOIN', channel);
  }

  part(channel: string) {
    this.send('PART', channel);
  }

  say(target: string, text: string) {
    this._speak('PRIVMSG', target, text);
  }

  notice(target: string, text: string) {
    this._speak('NOTICE', target, text);
  }

  handleData = (chunk: string | Uint8Array) => {
    this.handleDataForConnection(this.connection, chunk);
  };

  private handleDataForConnection = (
    connection: IrcClient['connection'],
    chunk: string | Uint8Array,
  ) => {
    if (!connection || connection !== this.connection) {
      return;
    }

    this.connection.cyclingPingTimer.notifyOfActivity();

    const lines = connection.lineReader.read(chunk);
    for (const line of lines) {
      if (!line) {
        continue;
      }

      this.debug('Received:', line);
      const message = parseMessage(line, this.opt.stripColors, this.opt.enableStrictParse);
      this.emit('raw', message);
    }
  };

  send(...args: string[]) {
    // e.g. NICK, nickname
    // IRC messages are single CRLF-delimited lines capped at 512 bytes.
    // https://modern.ircdocs.horse/#message-format
    for (const arg of args) {
      if (containsInvalidLineByte(arg)) {
        throw new Error('IRC message parameters cannot contain NUL, CR, or LF characters');
      }
    }

    // if the last arg contains a space, starts with a colon, or is empty, prepend a colon
    if (mustBeTrailingParam(args[args.length - 1])) {
      args[args.length - 1] = `:${args[args.length - 1]}`;
    }

    if (!this.connection?.socket) {
      throw new Error('Cannot send before connecting');
    }

    if (this.connection.requestedDisconnect) {
      this.debug('(Disconnected) SEND:', args.join(' '));
    } else {
      const line = `${args.join(' ')}\r\n`;
      if (utf8ByteLength(line) > 512) {
        throw new Error('IRC messages cannot exceed 512 bytes including CRLF');
      }

      this.debug('SEND:', args.join(' '));
      this.connection.socket.write(line);
    }
  }

  /** Request a whois for the specified ``nick``. */
  async whois(nick: string): Promise<WhoisResult> {
    const request = this.whoisTracker.request(nick);

    if (this.connection?.requestedDisconnect) {
      this.whoisTracker.rejectAll(new Error('Cannot WHOIS while disconnected'));
      return request.promise;
    }

    if (!this.connection?.socket) {
      this.whoisTracker.rejectAll(new Error('Cannot WHOIS before connecting'));
      return request.promise;
    }

    if (request.shouldSend) {
      this.send('WHOIS', nick);
    }

    return request.promise;
  }

  end() {
    if (this.connection?.socket) {
      this.connection.requestedDisconnect = true;
      this.clearRetryTimeout();
      this.whoisTracker.rejectAll(new Error('Disconnected before WHOIS completed'));
      this.connection.cyclingPingTimer.stop();
      this.cancelAutoRenick();
      this.connection.socket.destroy();
    }
  }

  private disconnectForReconnect() {
    if (!this.connection.socket) {
      return;
    }

    this.clearRetryTimeout();
    this.whoisTracker.rejectAll(new Error('Disconnected before WHOIS completed'));
    this.connection.cyclingPingTimer.stop();
    this.cancelAutoRenick();
    this.connection.socket.destroy();
  }

  private clearRetryTimeout() {
    if (this.retryTimeout) {
      clearTimeout(this.retryTimeout);
      this.retryTimeout = undefined;
    }
  }

  private emitChannelEvent<EventName extends keyof ChannelEventArgs>(
    eventName: EventName,
    channel: string,
    ...args: ChannelEventArgs[EventName]
  ): void {
    switch (eventName) {
      case 'join': {
        const [nick] = args as ChannelEventArgs['join'];
        this.emit('join', channel, nick);
        break;
      }
      case 'kick': {
        const [nick, by, reason] = args as ChannelEventArgs['kick'];
        this.emit('kick', channel, nick, by, reason);
        break;
      }
      case 'names': {
        const [users] = args as ChannelEventArgs['names'];
        this.emit('names', channel, users);
        break;
      }
      case 'part': {
        const [nick, reason] = args as ChannelEventArgs['part'];
        this.emit('part', channel, nick, reason);
        break;
      }
    }

    this.emitDynamicChannelEvent(`${eventName}${channel}`, args);
  }

  private emitDynamicChannelEvent(eventName: string, args: readonly unknown[]): void {
    this.emit(
      eventName as keyof IrcClientEvents,
      ...(args as Parameters<IrcClientEvents[keyof IrcClientEvents]>),
    );
  }

  private cancelAutoRenick(): void {
    if (this.connection?.renickInterval) {
      clearInterval(this.connection.renickInterval);
    }
  }

  private _speak(kind: string, target: string, text: string) {
    const maxLineLength = this.maxLineLength ?? 450;
    const maxLength = Math.min(maxLineLength - target.length, this.opt.messageSplit);
    if (typeof text === 'undefined') {
      return;
    }

    for (const toSend of splitOutgoingMessage(text, maxLength)) {
      this.send(kind, target, toSend);
      if (kind === 'PRIVMSG') {
        this.emit('selfMessage', target, toSend);
      }
    }
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
    // Clients must answer server PINGs during registration, but only start
    // client-initiated keepalives after registration completes.
    // https://modern.ircdocs.horse/#connection-registration
    this.connection.cyclingPingTimer.start();
    this.emit('registered', message);
    const res = await this.whois(this.nick);
    this.nick = res.nick ?? '';
    this.hostMask = `${res.user}@${res.host}`;
    this._updateMaxLineLength();
  }

  private _handleRawMessage(message: Message): void {
    switch (message.command) {
      case 'rpl_welcome': {
        this._handleWelcome(message).catch(err => this.debug(err));
        return;
      }
      case 'rpl_myinfo': {
        this.supported.usermodes = message.args[3];
        break;
      }
      case 'rpl_isupport': {
        applyIsupport(message.args, this.supported, this.modeForPrefix, this.prefixForMode);
        break;
      }
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
      case '042': {
        // Random welcome stuff, ignoring
        break;
      }
      case 'err_nicknameinuse': {
        this._handleNicknameinuse(message);
        break;
      }
      case 'PING': {
        this.send('PONG', message.args[0]);
        this.emit('ping', message.args[0]);
        break;
      }
      case 'PONG': {
        // PONG is "[<server>] <token>"; the server name is not the opaque token.
        // https://modern.ircdocs.horse/#pong-message
        this.emit('pong', message.args.at(-1) ?? '');
        break;
      }
      case 'NOTICE': {
        this._handleNotice(message);
        break;
      }
      case 'MODE': {
        this._handleMode(message);
        break;
      }
      case 'NICK': {
        this._handleNick(message);
        break;
      }
      case 'rpl_motdstart': {
        this.motd = `${message.args[1]}\n`;
        break;
      }
      case 'rpl_motd': {
        this.motd = `${this.motd ?? ''}${message.args[1]}\n`;
        break;
      }
      case 'rpl_endofmotd':
      case 'err_nomotd': {
        this.motd = `${this.motd ?? ''}${message.args[1]}\n`;
        this.emit('motd', this.motd);
        break;
      }
      case 'rpl_namreply': {
        this._handleNam(message);
        break;
      }
      case 'rpl_endofnames': {
        this._handleEndofnames(message);
        break;
      }
      case 'rpl_topic': {
        this._handleRplTopic(message);
        break;
      }
      case 'rpl_away':
      case 'rpl_whoisuser':
      case 'rpl_whoisidle':
      case 'rpl_whoischannels':
      case 'rpl_whoisserver':
      case 'rpl_whoisoperator':
      case '330':
      case 'rpl_endofwhois':
      case 'rpl_whoreply': {
        const whoisData = this.whoisTracker.handleMessage(message);
        if (whoisData) {
          this.emit('whois', whoisData);
        }

        break;
      }
      case 'rpl_liststart': {
        this.channellist = [];
        this.channellistOpen = true;
        this.emit('channellist_start');
        break;
      }
      case 'rpl_list': {
        // RPL_LISTSTART may be skipped, so the first RPL_LIST starts a new list.
        // https://modern.ircdocs.horse/#rplliststart-321
        if (!this.channellistOpen) {
          this.channellist = [];
          this.channellistOpen = true;
        }

        this._handleList(message);
        break;
      }
      case 'rpl_listend': {
        this.emit('channellist', this.channellist);
        this.channellistOpen = false;
        break;
      }
      case 'rpl_topicwhotime': {
        this._handleTopicwhotime(message);
        break;
      }
      case 'TOPIC': {
        this._handleTopic(message);
        break;
      }
      case 'rpl_channelmodeis': {
        this._handleChannelmodeis(message);
        break;
      }
      case 'rpl_creationtime': {
        this._handleCreationtime(message);
        break;
      }
      case 'JOIN': {
        this._handleJoin(message);
        break;
      }
      case 'PART': {
        this._handlePart(message);
        break;
      }
      case 'KICK': {
        this._handleKick(message);
        break;
      }
      case 'KILL': {
        this._handleKill(message);
        break;
      }
      case 'PRIVMSG': {
        this._handlePrivmsg(message);
        break;
      }
      case 'INVITE': {
        this.emit('invite', message.args[1], message.nick, message);
        break;
      }
      case 'QUIT': {
        this._handleQuit(message);
        break;
      }
      // for sasl
      case 'CAP': {
        this._handleCap(message);
        break;
      }
      case 'AUTHENTICATE': {
        this._handleAuthenticate(message);
        break;
      }
      case 'rpl_loggedin': {
        break;
      }
      case 'rpl_saslsuccess': {
        this.send('CAP', 'END');
        break;
      }
      case 'err_saslfail':
      case 'err_sasltoolong':
      case 'err_saslaborted':
      case 'err_saslalready': {
        this.send('CAP', 'END');
        this.debug(message);
        this.emit('error', message);
        break;
      }
      case 'err_umodeunknownflag': {
        this.debug(message);
        this.emit('error', message);
        break;
      }
      case 'err_erroneusnickname': {
        this.debug(message);
        this.emit('error', message);
        break;
      }
      // Commands relating to OPER
      case 'err_nooperhost': {
        this.debug(message);
        this.emit('error', message);
        break;
      }
      case 'rpl_youreoper': {
        this.emit('opered');
        break;
      }
      case 'ERROR': {
        this.emit('error', message);
        break;
      }
      default: {
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
  }

  private _handleNick(message: Message): void {
    if (message.nick === this.nick) {
      // client just changed own nick
      this.nick = message.args[0];
      this.cancelAutoRenick();
      this._updateMaxLineLength();
    }

    this.debug(`NICK: ${message.nick} changes nick to ${message.args[0]}`);

    const channels = this.channelStore.renameUser(message.nick, message.args[0]);

    // old nick, new nick, channels
    this.emit('nick', message.nick, message.args[0], channels, message);
  }

  private _handleNam(message: Message): void {
    const users = message.args[3].trim().split(/ +/);
    this.channelStore.addNames(message.args[2], users, this.modeForPrefix);
  }

  private _handleMode(message: Message): void {
    this.debug(`MODE: ${message.args[0]} sets mode: ${message.args[1]}`);

    const channel = this.chanData(message.args[0]);
    if (!channel) {
      return;
    }

    const events = applyChannelModeChange({
      channel,
      modeArgs: message.args.slice(2),
      modes: message.args[1],
      prefixForMode: this.prefixForMode,
      supported: this.supported.channel.modes,
    });

    for (const event of events) {
      this.emit(
        event.eventName,
        message.args[0],
        message.nick,
        event.mode,
        event.argument,
        message,
      );
    }
  }

  private chanData(name: string, create = false): ChannelData | undefined {
    if (create) {
      return this.channelStore.ensure(name);
    }

    return this.channelStore.get(name);
  }

  private _handleNotice(message: Message): void {
    const from = message.nick;
    const to: string | undefined = message.args[0] ?? null;
    const text = message.args[1] ?? '';

    if (isCtcpMessage(text)) {
      this._handleCTCP({ from, to, text, type: 'notice', message });
      return;
    }

    this.emit('notice', from, to, text, message);

    if (to === this.nick) {
      this.debug(`GOT NOTICE from ${from ? `"${from}"` : 'the server'}: "${text}"`);
    }
  }

  private _handleCTCP({ from, to, text, type, message }: CtcpContext): void {
    const ctcp = parseCtcpMessage(text, type);
    this.emit('ctcp', from, to, ctcp.text, type, message);
    if (type === 'notice') {
      this.emit('ctcp-notice', from, to, ctcp.text, message);
    } else {
      this.emit('ctcp-privmsg', from, to, ctcp.text, message);
    }

    if (ctcp.isVersionRequest) {
      this.emit('ctcp-version', from, to, message);
    }

    if (ctcp.isAction) {
      this.emit('action', from, to, ctcp.params, message);
    }

    if (ctcp.pingReply) {
      this.sendCtcp(from, 'notice', ctcp.pingReply);
    }
  }

  private sendCtcp(to: string, type: CtcpType, text: string) {
    return type === 'privmsg'
      ? this.say(to, formatCtcpMessage(text))
      : this.notice(to, formatCtcpMessage(text));
  }

  private _isChannelTracked(channelName: string): boolean {
    const lower = channelName.toLowerCase();
    const inOpt = this.opt.channels.some(entry => {
      return entry.split(' ')[0].toLowerCase() === lower;
    });
    if (inOpt) {
      return true;
    }

    return this._autoJoinChannels.some(name => name.toLowerCase() === lower);
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
    this.send('NICK', `${this.opt.nick}${this.nickMod}`);
    this.nick = `${this.opt.nick}${this.nickMod}`;
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
          this.debug(`Maximum autorenick retry count (${this.opt.renickCount}) reached`);
          this.cancelAutoRenick();
          this.connection.attemptedLastRenick = true;
        }
      }, this.opt.renickDelay);
    }
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

    for (const command of getCapabilityRegistrationCommands(this.opt.sasl)) {
      this.send(...command);
    }

    if (this.opt.password) {
      this.send('PASS', this.opt.password);
    }

    // handshake details
    this.debug('Sending irc NICK/USER');
    this.send('NICK', this.opt.nick);
    this.nick = this.opt.nick;
    this._updateMaxLineLength();
    // USER syntax: https://modern.ircdocs.horse/#user-message
    this.send('USER', this.opt.userName, '0', '*', this.opt.realName);

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

    for (const chunk of getSaslPlainAuthenticateChunks(this.opt)) {
      this.send('AUTHENTICATE', chunk);
    }
  }

  private _handlePart(message: Message): void {
    // channel, who, reason
    if (this.nick === message.nick) {
      this.channelStore.remove(message.args[0]);
    } else {
      this.channelStore.removeUser(message.args[0], message.nick);
    }

    this.emitChannelEvent('part', message.args[0], message.nick, message.args[1]);
  }

  private _handleKick(message: Message): void {
    if (this.nick === message.args[1]) {
      this.channelStore.remove(message.args[0]);
    } else {
      this.channelStore.removeUser(message.args[0], message.args[1]);
    }

    // channel, who, by, reason
    this.emitChannelEvent('kick', message.args[0], message.args[1], message.nick, message.args[2]);
  }

  private _handleList(message: Message): void {
    const channel = {
      name: message.args[1],
      users: {},
      userCount: Number.parseInt(message.args[2], 10),
      topic: message.args[3],
    };
    this.emit('channellist_item', channel);
    this.channellist.push(channel);
  }

  private _handleKill(message: Message): void {
    const nick = message.args[0];
    const channels = this.channelStore.removeUserFromAll(nick);
    this.emit('kill', nick, message.args[1], channels, message);
  }

  private _handlePrivmsg(message: Message): void {
    const from = message.nick;
    const to = message.args[0];
    const text = message.args[1] ?? '';
    if (isCtcpMessage(text)) {
      this._handleCTCP({ from, to, text, type: 'privmsg', message });
      return;
    }

    this.emit('message', from, to, text, message);
    if (this.supported.channel.types.includes(to.charAt(0))) {
      this.emit(`message#${to.toLowerCase()}` as `message#${string}`, from, to, text, message);
    }

    if (to.toUpperCase() === this.nick.toUpperCase()) {
      this.emit('pm', from, text, message);
      this.debug(`GOT MESSAGE from "${from}": "${text}"`);
    }
  }

  private _handleQuit(message: Message): void {
    this.debug(`QUIT: ${message.prefix} ${message.args.join(' ')}`);
    if (this.nick === message.nick) {
      // TODO handle?
      return;
    }

    const channels = this.channelStore.removeUserFromAll(message.nick);

    // who, reason, channels
    this.emit('quit', message.nick, message.args[0], channels, message);
  }

  private _handleCap(message: Message): void {
    const response = handleCapMessage(message, this.opt.sasl);
    for (const command of response.commands) {
      this.send(...command);
    }

    if (response.error) {
      this.debug(message);
      this.emit('error', message);
    }
  }

  private _handleJoin(message: Message): void {
    // channel, who
    if (this.nick === message.nick) {
      this.channelStore.ensure(message.args[0]);
    } else {
      this.channelStore.addUser(message.args[0], message.nick);
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
      applyChannelModeSnapshot({
        channel,
        modeArgs: message.args.slice(3),
        modes: message.args[2],
        supported: this.supported.channel.modes,
      });
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
