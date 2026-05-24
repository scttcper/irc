import { getCapabilityRegistrationCommands, type IrcCommand } from './capabilityNegotiation.js';
import type { IrcOptions } from './ircOptions.js';

type ConnectionRegistrationOptions = Pick<
  IrcOptions,
  'nick' | 'password' | 'realName' | 'sasl' | 'userName' | 'webirc'
>;

export function getConnectionRegistrationCommands(
  options: ConnectionRegistrationOptions,
): IrcCommand[] {
  const commands: IrcCommand[] = [];

  if (options.webirc.ip && options.webirc.pass && options.webirc.host) {
    commands.push([
      'WEBIRC',
      options.webirc.pass,
      options.userName,
      options.webirc.host,
      options.webirc.ip,
    ]);
  }

  commands.push(...getCapabilityRegistrationCommands(options.sasl));

  if (options.password) {
    commands.push(['PASS', options.password]);
  }

  commands.push(['NICK', options.nick], ['USER', options.userName, '0', '*', options.realName]);

  return commands;
}
