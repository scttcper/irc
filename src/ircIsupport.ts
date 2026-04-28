import type { SupportedFeatures } from './ircTypes.js';
import type { Message } from './parseMessage.js';

type PrefixMap = Record<string, string>;

export const defaultChannelTypes = '#&';
export const defaultChannelModes = { a: '', b: 'ov', c: '', d: '' };
export const defaultModeForPrefix = { '+': 'v', '@': 'o' };
export const defaultPrefixForMode = { o: '@', v: '+' };
/** Decodes ISUPPORT value escapes like `\x20` into their byte value. */
const isupportEscapeRegex = /\\x([0-9A-Fa-f]{2})/g;
/** Matches `TOKEN`, `TOKEN=value`, and `-TOKEN` forms from RPL_ISUPPORT. */
const isupportTokenRegex = /^(-?)([A-Z0-9./]+)(?:=(.*))?$/;

function clearPrefixMaps(modeForPrefix: PrefixMap, prefixForMode: PrefixMap): void {
  for (const prefix of Object.keys(modeForPrefix)) {
    // eslint-disable-next-line @typescript-eslint/no-dynamic-delete
    delete modeForPrefix[prefix];
  }

  for (const mode of Object.keys(prefixForMode)) {
    // eslint-disable-next-line @typescript-eslint/no-dynamic-delete
    delete prefixForMode[mode];
  }
}

function unescapeValue(value: string): string {
  return value.replaceAll(isupportEscapeRegex, (_match, hex: string) =>
    String.fromCharCode(Number.parseInt(hex, 16)),
  );
}

function resetPrefixMaps(modeForPrefix: PrefixMap, prefixForMode: PrefixMap): void {
  clearPrefixMaps(modeForPrefix, prefixForMode);
  Object.assign(modeForPrefix, defaultModeForPrefix);
  Object.assign(prefixForMode, defaultPrefixForMode);
}

function removeModes(value: string, modes: Iterable<string>): string {
  const remove = new Set(modes);
  let result = '';
  for (const mode of value) {
    if (!remove.has(mode)) {
      result += mode;
    }
  }

  return result;
}

export function applyIsupport(
  args: Message['args'],
  supported: SupportedFeatures,
  modeForPrefix: PrefixMap,
  prefixForMode: PrefixMap,
): void {
  for (const arg of args) {
    const match = isupportTokenRegex.exec(arg);
    if (!match) {
      continue;
    }

    const removed = match[1] === '-';
    const param = match[2];
    const value = unescapeValue(match[3] ?? '');
    const type = ['a', 'b', 'c', 'd'] as const;

    // RPL_ISUPPORT tokens and removals: https://modern.ircdocs.horse/#rplisupport-005
    switch (param) {
      case 'CHANLIMIT': {
        if (removed) {
          supported.channel.limit = {};
          break;
        }

        value.split(',').forEach(val => {
          const split = val.split(':');
          const limit = Number.parseInt(split[1], 10);
          for (const prefix of split[0]) {
            supported.channel.limit[prefix] = limit;
          }
        });
        break;
      }

      case 'CHANMODES': {
        if (removed) {
          supported.channel.modes = { ...defaultChannelModes };
          break;
        }

        const split = value.split(',');
        supported.channel.modes = { a: '', b: '', c: '', d: '' };
        for (let i = 0; i < type.length; i++) {
          supported.channel.modes[type[i]] += split[i];
        }
        supported.channel.modes.b += Object.keys(prefixForMode).join('');

        break;
      }

      case 'CHANTYPES': {
        if (removed) {
          supported.channel.types = defaultChannelTypes;
          break;
        }

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
          const length = Number.parseInt(split[1], 10);
          for (const prefix of split[0]) {
            supported.channel.idlength[prefix] = length;
          }
        });
        break;
      }

      case 'KICKLEN': {
        supported.kicklength = Number.parseInt(value, 10);
        break;
      }

      case 'MAXLIST': {
        if (removed) {
          supported.maxlist = {};
          break;
        }

        value.split(',').forEach(val => {
          const split = val.split(':');
          const max = Number.parseInt(split[1], 10);
          for (const prefix of split[0]) {
            supported.maxlist[prefix] = max;
          }
        });
        break;
      }

      case 'MODES': {
        if (removed) {
          supported.modes = 3;
          break;
        }

        supported.modes = Number.parseInt(value, 10);
        break;
      }

      case 'NICKLEN': {
        supported.nicklength = Number.parseInt(value, 10);
        break;
      }

      case 'PREFIX': {
        const previousPrefixModes = Object.keys(prefixForMode);
        clearPrefixMaps(modeForPrefix, prefixForMode);
        supported.channel.modes.b = removeModes(supported.channel.modes.b, previousPrefixModes);
        if (removed) {
          resetPrefixMaps(modeForPrefix, prefixForMode);
          supported.channel.modes.b += 'ov';
          break;
        }

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
        if (removed) {
          supported.maxtargets = {};
          break;
        }

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
