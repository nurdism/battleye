<p align="center">
  <img src="https://david-dm.org/nurdism/battleye/status.svg" alt="Dependencies Status">
  <img src="https://david-dm.org/nurdism/battleye/dev-status.svg" alt="Dev Dependencies Status">
  <img src="https://david-dm.org/nurdism/battleye/peer-status.svg" alt="Peer Dependencies Status">
  <a href="https://www.npmjs.com/package/battleye"><img src="https://img.shields.io/npm/dm/battleye.svg" alt="Downloads"></a>
  <a href="https://www.npmjs.com/package/battleye"><img src="https://img.shields.io/npm/v/battleye.svg" alt="Version"></a>
  <a href="https://www.npmjs.com/package/battleye"><img src="https://img.shields.io/npm/l/battleye.svg" alt="License"></a>
  <a href="https://discord.gg/Kzkd6V3" ><img src="https://discordapp.com/api/guilds/428366869993488401/widget.png" alt="Chat on discord"><a/>
</p>

# battleye

> Battleye rcon client built in nodejs.

## Example usage:
```js
import { BESocket, BEServer } from '../lib/battleye'

const socket = new BESocket()
const server = new BEServer(socket, {
  password: 'chaneme',
  ip: '127.0.0.1',
  port: '2309'
})

socket.on('listening', (socket) => {
  const addr = socket.address()
  console.log(`Server listening on ${addr.address}:${addr.port}`)
  server
    .login()
    .catch(e => {
      console.log(e)
    })
})

socket.on('message', (message, packet, server) => {
  console.log(`message: ${server.ip}:${server.port} => message: ${message}`)
})

socket.on('command', (packet, server) => {
  console.log(`command: ${server.ip}:${server.port} => packet:`, packet)
})

socket.on('send', (packet, buffer, bytes, server) => {
  console.log(`send: ${server.ip}:${server.port} => packet:`, packet)
})

socket.on('receive', (packet, buffer, server, info) => {
  console.log(`receive: ${server.ip}:${server.port} => packet:`, packet)
})

socket.on('connected', (server) => {
  console.log(`connected: ${server.ip}:${server.port}`)
})

socket.on('disconnected', (server, reason) => {
  console.log(`disconnect: ${server.ip}:${server.port} => ${reason}`)
})

socket.on('debug', (message) => { console.log(message) })
socket.on('warn', (message) => { console.log(message) })
socket.on('error', (err) => { console.log(`ERROR:`, err) })
```
