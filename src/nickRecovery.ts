import type { IrcOptions } from './ircOptions.js';

type NickRecoveryOptions = Pick<IrcOptions, 'autoRenick' | 'nick' | 'renickCount' | 'renickDelay'>;

type NickRecoveryActions = {
  debug: (message: string, ...args: string[]) => void;
  getCurrentNick: () => string;
  requestPreferredNick: (nick: string) => void;
  useFallbackNick: (nick: string) => void;
};

export class NickRecovery {
  private attemptedLastRenick = false;
  private fallbackSuffix = 0;
  private readonly actions: NickRecoveryActions;
  private readonly options: NickRecoveryOptions;
  private renickInterval?: ReturnType<typeof setInterval>;

  constructor(options: NickRecoveryOptions, actions: NickRecoveryActions) {
    this.options = options;
    this.actions = actions;
  }

  beginConnection(): void {
    this.cancelAutoRenick();
    this.renickInterval = undefined;
    this.attemptedLastRenick = false;
  }

  cancelAutoRenick(): void {
    if (this.renickInterval) {
      clearInterval(this.renickInterval);
      this.renickInterval = undefined;
    }
  }

  handleNicknameInUse(takenNick: string): void {
    if (takenNick === this.options.nick && this.hasRecentPreferredNickAttempt()) {
      this.actions.debug('Attempted to automatically renick to', takenNick, 'and found it taken');
      return;
    }

    this.fallbackSuffix++;
    this.actions.useFallbackNick(`${this.options.nick}${this.fallbackSuffix}`);

    if (this.options.autoRenick) {
      this.startAutoRenick();
    }
  }

  private hasRecentPreferredNickAttempt(): boolean {
    return Boolean(this.renickInterval || this.attemptedLastRenick);
  }

  private startAutoRenick(): void {
    let renickTimes = 0;
    this.cancelAutoRenick();
    this.renickInterval = setInterval(() => {
      if (this.actions.getCurrentNick() === this.options.nick) {
        this.actions.debug(
          'Attempted to automatically renick to',
          this.options.nick,
          'and found that was the current nick',
        );
        this.cancelAutoRenick();
        return;
      }

      this.actions.requestPreferredNick(this.options.nick);
      renickTimes++;
      if (this.options.renickCount !== null && renickTimes >= this.options.renickCount) {
        this.actions.debug(`Maximum autorenick retry count (${this.options.renickCount}) reached`);
        this.cancelAutoRenick();
        this.attemptedLastRenick = true;
      }
    }, this.options.renickDelay);
  }
}
