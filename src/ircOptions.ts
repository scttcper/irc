export interface WebIrcOptions {
  /** Password shared with the IRC gateway for `WEBIRC` authentication. */
  pass: string;
  /** The client IP address to forward to the gateway. */
  ip: string;
  /** The client hostname to forward to the gateway. */
  host: string;
}

export interface IrcOptions {
  /** IRC server hostname. Usually inferred from the constructor argument. */
  host: string;
  /** Preferred nickname for the connection. Usually inferred from the constructor argument. */
  nick: string;
  /** Username sent in the IRC `USER` command. */
  userName: string;
  /** Real name / gecos value sent in the IRC `USER` command. */
  realName: string;
  /** Server password sent with `PASS` before registration. */
  password: string | null;
  /** TCP port used for the IRC connection. */
  port: number;
  /** Channels to join automatically after the server MOTD completes. */
  channels: string[];
  /** Rejoin a channel automatically after the client itself is kicked. */
  autoRejoin: boolean;
  /** Try to reclaim the original nickname after falling back due to nick collisions. */
  autoRenick: boolean;
  /** Maximum reconnect attempts after an unexpected disconnect. `null` means unlimited retries. */
  retryCount: number | null;
  /** Delay in milliseconds before attempting to reconnect. */
  retryDelay: number;
  /** Maximum attempts to reclaim the original nickname. `null` means keep trying forever. */
  renickCount: number | null;
  /** Delay in milliseconds between automatic nick reclaim attempts. */
  renickDelay: number;
  /** Use TLS for the connection instead of plain TCP. */
  secure: boolean;
  /** Allow self-signed TLS certificates by disabling certificate verification for the socket. */
  selfSigned: boolean;
  /** Require the server certificate to validate against trusted certificate authorities. */
  rejectUnauthorized: boolean;
  /** Negotiate SASL authentication during connection registration. */
  sasl: boolean;
  /** Optional `WEBIRC` gateway metadata to send before registration. */
  webirc: WebIrcOptions;
  /** Strip IRC colors and style control codes from parsed incoming messages. */
  stripColors: boolean;
  /** Channel prefix characters used before the server advertises `CHANTYPES`. */
  channelPrefixes: string;
  /** Soft limit, in bytes, for splitting outgoing messages before sending multiple lines. */
  messageSplit: number;
  /** Force a specific text encoding for incoming data instead of using UTF-8 / charset detection. */
  encoding: string | null;
  /** Idle time in milliseconds before the client sends a keepalive `PING`. */
  millisecondsOfSilenceBeforePingSent: number;
  /** Time in milliseconds to wait for server activity after a keepalive `PING` before timing out. */
  millisecondsBeforePingTimeout: number;
  /** Parse IRC prefixes more strictly according to RFC-style nick rules. */
  enableStrictParse: boolean;
}

const defaultOptions: IrcOptions = {
  host: '',
  nick: '',
  userName: 'nodebot',
  realName: 'nodeJS IRC client',
  password: null,
  port: 6697,
  channels: [],
  autoRejoin: false,
  autoRenick: false,
  retryCount: null,
  retryDelay: 5000,
  renickCount: null,
  renickDelay: 60_000,
  secure: false,
  selfSigned: false,
  rejectUnauthorized: true,
  sasl: false,
  webirc: {
    pass: '',
    ip: '',
    host: '',
  },
  stripColors: true,
  channelPrefixes: '&#',
  messageSplit: 512,
  encoding: null,
  millisecondsOfSilenceBeforePingSent: 15 * 1000,
  millisecondsBeforePingTimeout: 8 * 1000,
  enableStrictParse: false,
};

export { defaultOptions };
