import { utf8ByteLength } from './ircEncoding.js';

export type FormattedIrcMessage = {
  byteLength: number;
  line: string;
  params: readonly string[];
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

export function formatIrcMessage(args: readonly string[]): FormattedIrcMessage {
  for (const arg of args) {
    if (containsInvalidLineByte(arg)) {
      throw new Error('IRC message parameters cannot contain NUL, CR, or LF characters');
    }
  }

  let params: readonly string[] = args;
  const lastParamIndex = params.length - 1;
  if (mustBeTrailingParam(args[lastParamIndex])) {
    const formattedParams = [...args];
    formattedParams[lastParamIndex] = `:${formattedParams[lastParamIndex]}`;
    params = formattedParams;
  }

  const line = `${params.join(' ')}\r\n`;
  return {
    byteLength: utf8ByteLength(line),
    line,
    params,
  };
}
