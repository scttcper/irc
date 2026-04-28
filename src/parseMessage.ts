import { CodeNames, CODES, CommandTypes } from './codes.js';
import { stripColorsAndStyle } from './ircColors.js';

export type Message = {
  args: string[];
  prefix: string;
  nick?: string;
  user?: string;
  host?: string;
  server?: string;
  tags?: Record<string, string | true>;
  command: CodeNames;
  rawCommand: string;
  commandType: CommandTypes | 'normal';
};

const tagEscapes: Record<string, string> = {
  ':': ';',
  r: '\r',
  n: '\n',
  s: ' ',
  '\\': '\\',
};

/** Matches the optional IRCv3 message tag block at the start of a line. */
const tagPrefixRegex = /^@([^ ]+) +/;
/** Matches the optional IRC source/prefix at the start of a line. */
const sourcePrefixRegex = /^:([^ ]+) +/;
/** Matches a source as a strict RFC-style nickname, with optional user and host. */
const strictSourceRegex = /^([_a-zA-Z0-9~[\]\\`^{}|-]*)(!([^@]+)@(.*))?$/;
/** Matches a source as a looser nickname for networks that allow Unicode or extra symbols. */
const looseSourceRegex =
  /^([\u1100-\u11FF\u3040-\u309FF\u30A0-\u30FF\u3130-\u318F\u31F0-\u31FF\uA960-\uA97F\uAC00-\uD7AF\uD7B0-\uD7FF_a-zA-Z0-9~[\]\\/?`^{}|-]*)(!([^@]+)@(.*))?$/;

function parseTags(rawTags: string): Record<string, string | true> {
  const tags: Record<string, string | true> = {};
  for (const rawTag of rawTags.split(';')) {
    const separator = rawTag.indexOf('=');
    if (separator === -1) {
      tags[rawTag] = true;
      continue;
    }

    const key = rawTag.slice(0, separator);
    const value = rawTag.slice(separator + 1);
    tags[key] = value.replaceAll(/\\([:rns\\])/g, (_match, escape: string) => tagEscapes[escape]);
  }

  return tags;
}

function findTrailingStart(line: string): number {
  if (line.charCodeAt(0) === 58) {
    return 0;
  }

  for (let i = 1; i < line.length; i++) {
    if (line.charCodeAt(i) === 58 && line.charCodeAt(i - 1) === 32) {
      return i - 1;
    }
  }

  return -1;
}

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
    line = stripColorsAndStyle(line);
  }

  // IRCv3 message tags: https://modern.ircdocs.horse/#tags
  let match = tagPrefixRegex.exec(line);
  if (match) {
    message.tags = parseTags(match[1]);
    line = line.slice(match[0].length);
  }

  // Parse prefix
  match = sourcePrefixRegex.exec(line);
  if (match) {
    message.prefix = match[1];
    line = line.slice(match[0].length);
    match = (enableStrictParse ? strictSourceRegex : looseSourceRegex).exec(message.prefix);

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
  const rawCommand = match?.[1] ?? '';
  message.command = rawCommand.toUpperCase() as CodeNames;
  message.rawCommand = rawCommand.toUpperCase();
  message.commandType = 'normal';
  line = line.slice(rawCommand.length).trimStart();

  const codeData = CODES[message.rawCommand as keyof typeof CODES];
  if (codeData) {
    if ('name' in codeData) {
      message.command = codeData.name;
    }

    message.commandType = codeData.type;
  }

  let middle: string | undefined = line;
  let trailing: string | undefined;
  // Parameters/trailing parameter: https://modern.ircdocs.horse/#parameters
  const trailingStart = findTrailingStart(line);
  if (trailingStart !== -1) {
    middle = trailingStart === 0 ? '' : line.slice(0, trailingStart).trimEnd();
    trailing = line.slice(trailingStart + (trailingStart === 0 ? 1 : 2));
  }

  if (middle?.length) {
    message.args = middle.split(/ +/);
  }

  if (typeof trailing === 'string') {
    message.args.push(trailing);
  }

  return message as Message;
}
