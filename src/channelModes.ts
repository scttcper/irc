import type { ChannelData, SupportedFeatures } from './ircTypes.js';

export type ChannelModeEvent = {
  eventName: '+mode' | '-mode';
  mode: string;
  argument: string | undefined;
};

type ChannelModes = SupportedFeatures['channel']['modes'];

export function applyChannelModeChange({
  channel,
  modes,
  modeArgs,
  prefixForMode,
  supported,
}: {
  channel: ChannelData;
  modes: string;
  modeArgs: string[];
  prefixForMode: Record<string, string>;
  supported: ChannelModes;
}): ChannelModeEvent[] {
  const events: ChannelModeEvent[] = [];
  let adding = true;

  for (const mode of modes) {
    if (mode === '+') {
      adding = true;
      continue;
    }

    if (mode === '-') {
      adding = false;
      continue;
    }

    const eventName = adding ? '+mode' : '-mode';
    let argument: string | undefined;

    if (mode in prefixForMode) {
      argument = modeArgs.shift();
      updateUserPrefix(channel, argument, prefixForMode[mode], adding);
    } else if (supported.a.includes(mode)) {
      argument = modeArgs.shift();
      updateChannelMode(channel, mode, adding, argument ? [argument] : []);
    } else if (supported.b.includes(mode)) {
      argument = modeArgs.shift();
      updateChannelMode(channel, mode, adding, argument);
    } else if (supported.c.includes(mode)) {
      argument = adding ? modeArgs.shift() : undefined;
      updateChannelMode(channel, mode, adding, argument);
    } else if (supported.d.includes(mode)) {
      updateChannelMode(channel, mode, adding);
    } else {
      continue;
    }

    events.push({ eventName, mode, argument });
  }

  return events;
}

export function applyChannelModeSnapshot({
  channel,
  modeArgs,
  modes,
  supported,
}: {
  channel: ChannelData;
  modeArgs: string[];
  modes: string;
  supported: ChannelModes;
}): void {
  channel.mode = modes;
  channel.modeParams = {};

  for (const mode of modes.replaceAll(/[+-]/g, '')) {
    if (channelModeHasSnapshotArg(mode, supported)) {
      const modeArg = modeArgs.shift();
      if (modeArg) {
        channel.modeParams[mode] = [modeArg];
      }
    }
  }
}

function updateChannelMode(
  channel: ChannelData,
  mode: string,
  adding: boolean,
  param?: string | string[],
): void {
  channel.mode ??= '';
  channel.modeParams ??= {};

  if (adding) {
    if (!channel.mode.includes(mode)) {
      channel.mode += mode;
    }

    if (typeof param === 'undefined') {
      channel.modeParams[mode] = [];
    } else if (Array.isArray(param)) {
      channel.modeParams[mode] = channel.modeParams[mode]
        ? [...channel.modeParams[mode], ...param]
        : param;
    } else {
      channel.modeParams[mode] = [param];
    }

    return;
  }

  if (Array.isArray(param)) {
    channel.modeParams[mode] = (channel.modeParams[mode] ?? []).filter(value => value !== param[0]);
  }

  if (!Array.isArray(param) || channel.modeParams[mode].length === 0) {
    channel.mode = channel.mode.replace(mode, '');
    // eslint-disable-next-line @typescript-eslint/no-dynamic-delete
    delete channel.modeParams[mode];
  }
}

function updateUserPrefix(
  channel: ChannelData,
  nick: string | undefined,
  prefix: string,
  adding: boolean,
): void {
  if (!nick || !Object.hasOwn(channel.users, nick)) {
    return;
  }

  if (adding) {
    if (!channel.users[nick].includes(prefix)) {
      channel.users[nick] += prefix;
    }
  } else {
    channel.users[nick] = channel.users[nick].replace(prefix, '');
  }
}

function channelModeHasSnapshotArg(mode: string, supported: ChannelModes): boolean {
  const { a, b, c, d } = supported;
  if (a.includes(mode) || b.includes(mode) || c.includes(mode)) {
    return true;
  }

  if (d.includes(mode)) {
    return false;
  }

  return mode === 'b' || mode === 'k' || mode === 'l';
}
