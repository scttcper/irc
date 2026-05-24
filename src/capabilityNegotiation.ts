import type { IrcOptions } from './ircOptions.js';
import type { Message } from './parseMessage.js';
import { stringToBase64 } from './uint8array.js';

export type IrcCommand = string[];

export type CapResponse = {
  commands: IrcCommand[];
  error: boolean;
};

export function getCapabilityRegistrationCommands(sasl: boolean): IrcCommand[] {
  return sasl ? [['CAP', 'LS', '302']] : [];
}

export function handleCapMessage(message: Message, sasl: boolean): CapResponse {
  if (message.args[1] === 'NAK') {
    return { commands: [['CAP', 'END']], error: true };
  }

  if (message.args[1] === 'LS') {
    const caps = message.args.at(-1)?.split(/\s+/) ?? [];
    if (sasl && caps.includes('sasl')) {
      return { commands: [['CAP', 'REQ', 'sasl']], error: false };
    }

    if (message.args[2] !== '*') {
      return { commands: [['CAP', 'END']], error: false };
    }
  }

  if (message.args[1] !== 'ACK') {
    return { commands: [], error: false };
  }

  const caps = message.args[2].split(/\s+/);
  if (!caps.includes('sasl')) {
    return { commands: [], error: false };
  }

  return { commands: [['AUTHENTICATE', 'PLAIN']], error: false };
}

export function getSaslPlainAuthenticateChunks(
  options: Pick<IrcOptions, 'nick' | 'password' | 'userName'>,
): string[] {
  const authMessage = stringToBase64(`${options.nick}\0${options.userName}\0${options.password}`);
  const chunks: string[] = [];

  for (let i = 0; i < (authMessage.length + 1) / 400; i++) {
    const chunk = authMessage.slice(i * 400, (i + 1) * 400);
    chunks.push(chunk === '' ? '+' : chunk);
  }

  return chunks;
}
