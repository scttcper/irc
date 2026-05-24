export type CtcpType = 'notice' | 'privmsg';

export type CtcpPayload = {
  text: string;
  command: string;
  params: string;
  isAction: boolean;
  isVersionRequest: boolean;
  pingReply?: string;
};

export function isCtcpMessage(text: string): boolean {
  return text.startsWith('\u0001') && text.lastIndexOf('\u0001') > 0;
}

export function parseCtcpMessage(text: string, type: CtcpType): CtcpPayload {
  const body = text.slice(1, text.indexOf('\u0001', 1));
  const [command = '', ...params] = body.split(' ');

  return {
    text: body,
    command,
    params: params.join(' '),
    isAction: command === 'ACTION' && params.length > 0,
    isVersionRequest: type === 'privmsg' && body === 'VERSION',
    pingReply: command === 'PING' && type === 'privmsg' && params.length > 0 ? body : undefined,
  };
}

export function formatCtcpMessage(text: string): string {
  return `\u0001${text}\u0001`;
}
