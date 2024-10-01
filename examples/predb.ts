import { IrcClient } from '../src/index.js';

function main() {
  const client = new IrcClient('irc.opentrackers.org', 'decent1', {
    channels: ['#pre', '#pre-info'],
    port: 6697,
    secure: true,
  });

  // client.join('#pre');
  // client.on('raw', message => {
  //   console.log(message);
  // });

  client.on('connect', () => {
    console.log('connected');
  });

  client.on('message', (user, channel, message) => {
    console.log(`${channel} <${user}> ${message}`);
  });

  client.connect();
}

main();
