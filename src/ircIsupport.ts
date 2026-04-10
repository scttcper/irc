import type { SupportedFeatures } from './ircTypes.js';
import type { Message } from './parseMessage.js';

type PrefixMap = Record<string, string>;

export function applyIsupport(
  args: Message['args'],
  supported: SupportedFeatures,
  modeForPrefix: PrefixMap,
  prefixForMode: PrefixMap,
): void {
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
          supported.channel.limit[Number(split[0])] = Number.parseInt(split[1], 10);
        });
        break;
      }

      case 'CHANMODES': {
        const split = value.split(',');
        for (let i = 0; i < type.length; i++) {
          supported.channel.modes[type[i]] += split[i];
        }

        break;
      }

      case 'CHANTYPES': {
        supported.channel.types = value;
        break;
      }

      case 'CHANNELLEN': {
        supported.channel.length = Number.parseInt(value, 10);
        break;
      }

      case 'IDCHAN': {
        value.split(',').forEach(val => {
          const split = val.split(':');
          supported.channel.idlength[split[0]] = Number.parseInt(split[1], 10);
        });
        break;
      }

      case 'KICKLEN': {
        supported.kicklength = Number.parseInt(value, 10);
        break;
      }

      case 'MAXLIST': {
        value.split(',').forEach(val => {
          const split = val.split(':');
          supported.maxlist[Number(split[0])] = Number.parseInt(split[1], 10);
        });
        break;
      }

      case 'NICKLEN': {
        supported.nicklength = Number.parseInt(value, 10);
        break;
      }

      case 'PREFIX': {
        const prefixMatch = /\((.*?)\)(.*)/.exec(value);
        if (prefixMatch) {
          const prefixSplit = [];
          prefixSplit[1] = [...prefixMatch[1]];
          prefixSplit[2] = [...prefixMatch[2]];
          while (prefixSplit[1].length > 0) {
            modeForPrefix[prefixSplit[2][0]] = prefixSplit[1][0];
            supported.channel.modes.b += prefixSplit[1][0];
            prefixForMode[prefixSplit[1].shift()] = prefixSplit[2].shift();
          }
        }

        break;
      }

      case 'TARGMAX': {
        value.split(',').forEach(val => {
          const split = val.split(':');
          const numVal = split[1] ? Number.parseInt(split[1], 10) : 0;
          supported.maxtargets[split[0]] = numVal;
        });
        break;
      }

      case 'TOPICLEN': {
        supported.topiclength = Number.parseInt(value, 10);
        break;
      }

      default: {
        break;
      }
    }
  }
}
