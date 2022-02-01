import { CodeNames, CODES, CommandTypes } from './codes.js';
import ircColors from './ircColors.js';

export type Message = {
  args: string[];
  prefix: string;
  nick?: string;
  user?: string;
  host?: string;
  server?: string;
  command: CodeNames;
  rawCommand: string;
  commandType: CommandTypes | 'normal';
};

/**
 * parseMessage(line, stripColors)
 *
 * takes a raw "line" from the IRC server and turns it into an object with
 * useful keys
 * @param line Raw message from IRC server.
 * @param stripColors If true, strip IRC colors.
 * @param enableStrictParse If true, will try to conform to RFC2812 strictly for parsing usernames (and disallow eg CJK characters).
 * @return A parsed message object.
 */
export function parseMessage(
  line: string,
  stripColors?: boolean,
  enableStrictParse?: boolean,
): Message {
  const message: Partial<Message> = {
    args: [],
  };

  if (stripColors) {
    line = ircColors.stripColorsAndStyle(line);
  }

  // Parse prefix
  let match = /^:([^ ]+) +/.exec(line);
  if (match) {
    message.prefix = match[1];
    line = line.replace(/^:[^ ]+ +/, '');
    if (enableStrictParse) {
      match = /^([_a-zA-Z0-9~[\]\\`^{}|-]*)(!([^@]+)@(.*))?$/.exec(message.prefix);
    } else {
      match =
        /^([\u1100-\u11FF\u3040-\u309fF\u30A0-\u30FF\u3130-\u318F\u31F0-\u31FF\uA960-\uA97F\uAC00-\uD7AF\uD7B0-\uD7FF_a-zA-Z0-9~[\]\\/?`^{}|-]*)(!([^@]+)@(.*))?$/.exec(
          message.prefix,
        );
    }

    if (match) {
      message.nick = match[1];
      message.user = match[3];
      message.host = match[4];
    } else {
      message.server = message.prefix;
    }
  }

  // Parse command
  match = /^([^ ]+) */.exec(line);
  message.command = match?.[1];
  message.rawCommand = match?.[1];
  message.commandType = 'normal';
  line = line.replace(/^[^ ]+ +/, '');

  const codeData = CODES[message.rawCommand as keyof typeof CODES];
  if (codeData) {
    if ('name' in codeData) {
      message.command = codeData.name;
    }

    message.commandType = codeData.type;
  }

  let middle: string | undefined = line;
  let trailing: string | undefined;
  // Parse parameters
  if (line.search(/^:|\s+:/) !== -1) {
    match = /(.*?)(?:^:|\s+:)(.*)/.exec(line);
    middle = match?.[1].trimRight();
    trailing = match?.[2];
  }

  if (middle?.length) {
    message.args = middle.split(/ +/);
  }

  if (trailing?.length) {
    message.args.push(trailing);
  }

  return message as Message;
}
