# @ctrl/irc [![npm](https://badgen.net/npm/v/@ctrl/irc)](https://www.npmjs.com/package/@ctrl/irc)

> A typed IRC client library for node

Based on [irc-upd](https://github.com/Throne3d/node-irc) which is a fork of [node-irc](https://github.com/martynsmith/node-irc). Also includes irc color decoding based on [irc-colors.js](https://github.com/fent/irc-colors.js)

### Use

```ts
import { IrcClient } from '@ctrl/irc';
const client = new IrcClient('irc.yourserver.com', 'myNick', {
  channels: [],
  port: 7000,
  secure: true,
});
client.connect();
```

Join a channel

```ts
client.join('#yourchannel yourpass');
```

Leave a channel

```ts
client.part('#yourchannel');
```

Send a message

```ts
// To channel
client.say('#yourchannel', 'hello');
// To user
client.say('nonbeliever', 'sup');
```

With typescript 4.1 template strings feature events can be fully typed.

```ts
// (from, message) parameters are typed via template strings matching `message#${string}`
client.addListener('message#yourchannel', (from, message) => {
  console.log(from + ' => #yourchannel: ' + message);
});
```

Debugging - subscribe to the raw messages and see what events are being parsed and re-emitted

```ts
client.on('raw', message => {
  console.log(message);
});
```

### Links

- Modern irc spec - https://modern.ircdocs.horse/
- IRC v3 Specifications https://ircv3.net/irc/
