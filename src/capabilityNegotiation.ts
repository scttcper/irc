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

export function handleCapMessage(
  message: Message,
  sasl: boolean,
  advertised = new Map<string, string | undefined>(),
): CapResponse {
  if (message.args[1] === 'NAK') {
    advertised.clear();
    return { commands: [['CAP', 'END']], error: true };
  }

  if (message.args[1] === 'LS') {
    const caps = message.args.at(-1)?.split(/\s+/) ?? [];
    for (const cap of caps) {
      const separator = cap.indexOf('=');
      advertised.set(
        separator === -1 ? cap : cap.slice(0, separator),
        separator === -1 ? undefined : cap.slice(separator + 1),
      );
    }

    if (message.args[2] === '*') {
      return { commands: [], error: false };
    }

    const mechanisms = advertised.get('sasl');
    const supportsPlain =
      advertised.has('sasl') &&
      (mechanisms === undefined || mechanisms.split(',').includes('PLAIN'));
    advertised.clear();
    return {
      commands: sasl && supportsPlain ? [['CAP', 'REQ', 'sasl']] : [['CAP', 'END']],
      error: false,
    };
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

export function handleSaslMessage(message: Pick<Message, 'command'>): CapResponse {
  switch (message.command) {
    case 'rpl_loggedin': {
      return { commands: [], error: false };
    }
    case 'rpl_saslsuccess': {
      return { commands: [['CAP', 'END']], error: false };
    }
    case 'err_saslfail':
    case 'err_sasltoolong':
    case 'err_saslaborted':
    case 'err_saslalready': {
      return { commands: [['CAP', 'END']], error: true };
    }
    default: {
      return { commands: [], error: false };
    }
  }
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
