/** IRC casemapping applies to ASCII letters and, on RFC1459 networks, []\\^. */
export function ircCasefold(value: string, mapping = 'rfc1459'): string {
  const lower = value.replaceAll(/[A-Z]/g, char => char.toLowerCase());
  if (mapping !== 'rfc1459' && mapping !== 'strict-rfc1459' && mapping !== 'rfc1459-strict') {
    return lower;
  }
  return lower.replaceAll(/[[\]\\^]/g, char => {
    switch (char) {
      case '[': {
        return '{';
      }
      case ']': {
        return '}';
      }
      case '\\': {
        return '|';
      }
      default: {
        return mapping === 'rfc1459' ? '~' : '^';
      }
    }
  });
}

export function findName(
  values: Record<string, unknown>,
  name: string,
  normalize: (name: string) => string = ircCasefold,
): string | undefined {
  if (Object.hasOwn(values, name)) {
    return name;
  }
  const normalized = normalize(name);
  return Object.keys(values).find(key => normalize(key) === normalized);
}
