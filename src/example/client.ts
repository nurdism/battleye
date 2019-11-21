/* tslint:disable:all */

/*
Command	Description
  loadScripts	  loads the "scripts.txt" file without the need to restart the server.
  missions	    Returns a list of the available missions on the server.
  players	      Displays a list of the players on the server including BE GUIDs and pings.
  kick          [player#]	Kicks a player. His # can be found in the player list using the "players" command.
  RConPassword  [password]	Changes the RCon password.
  MaxPing       [ping]	Changes the MaxPing value. If a player has a higher ping, he will be kicked from the server.
  logout	      Logout from current server, but do not exit the program.
  Exit	        Closes the connection.
  Say           [player#]	Say something to player #. -1 equals all players on server (e.g. "Say -1 Hello World!")
  loadBans	    (Re)load the BE ban list from bans.txt.
  bans	        Show a list of all BE server bans.
  ban           [player #] [time in minutes] [reason]	Ban a player's BE GUID from the server. If time is not specified or 0, the ban will be permanent; if reason is not specified the player will be kicked with "Banned".
  addBan        [GUID] [time in minutes] [reason]	Same as "ban", but allows to ban a player that is not currently on the server.
  removeBan     [ban #]	Remove ban (get the ban # from the bans command).
  writeBans	    removes expired bans from bans file
*/

import * as readline from 'readline'
import { readCfg, Socket } from '../lib/index'

readCfg(process.cwd())
  .then(cfg => {
    console.log(cfg)

    if (!cfg.rconpassword || !cfg.rconip || !cfg.rconport) {
      throw new Error('Invalid BEServer.cfg')
    }

    const socket = new Socket({
      port: 2310,     // listen port
      ip: '0.0.0.0',  // listen ip
    })

    const connection = socket.connection({
      name: 'my-server',                // server name
      password: cfg.rconpassword,       // rcon password
      ip: cfg.rconip,                   // rcon ip
      port: cfg.rconport                // rcon port
    }, {
      reconnect: true,              // reconnect on timeout
      reconnectTimeout: 500,        // how long (in ms) to try reconnect
      keepAlive: true,              // send keepAlive packet
      keepAliveInterval: 15000,     // keepAlive packet interval (in ms)
      timeout: true,                // timeout packets
      timeoutInterval: 1000,        // interval to check packets (in ms)
      serverTimeout: 30000,         // timeout server connection (in ms)
      packetTimeout: 1000,          // timeout packet check interval (in ms)
      packetTimeoutThresholded: 5,  // packets to resend
    })

    const rl = readline.createInterface({
      input: process.stdin,
      output: process.stdout
    })

    socket.on('listening', (socket) => {
      const addr = socket.address()
      console.log(`Socket listening on ${typeof addr === 'string' ? addr : `${addr.address}:${addr.port}`}`)
    })

    socket.on('received', (resolved, packet, buffer, connection, info) => {
      console.log(`received: ${connection.ip}:${connection.port} => packet:`, packet)
    })

    socket.on('sent', (packet, buffer, bytes, connection) => {
      console.log(`sent: ${connection.ip}:${connection.port} => packet:`, packet)
    })

    socket.on('error', (err) => { console.error(`SOCKET ERROR:`, err) })

    connection.on('message', (message, packet) => {
      console.log(`message: ${connection.ip}:${connection.port} => message: ${message}`)
    })

    connection.on('command', (data, resolved, packet) => {
      console.log(`command: ${connection.ip}:${connection.port} => packet:`, packet)
    })

    connection.on('disconnected', (reason) => {
      console.warn(`disconnected from ${connection.ip}:${connection.port},`, reason)
    })

    connection.on('connected', () => {
      console.error(`connected to ${connection.ip}:${connection.port}`)
    })

    connection.on('debug', console.log)

    connection.on('error', (err) => {
      console.error(`CONNECTION ERROR:`, err)
    })

    rl.on('line', input => {
      connection
        .command(input)
        .then(response => {
          console.log(`response: ${connection.ip}:${connection.port} => ${response.command}\n${response.data}`)
        })
        .catch(console.error)

      console.log(`send: ${connection.ip}:${connection.port} => ${input}`)
    })
  })
  .catch(err => { console.error(`Error reading config:`, err) })


