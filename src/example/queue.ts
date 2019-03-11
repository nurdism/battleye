/* tslint:disable:all */

import { readCfg, Socket } from '..'

const options = {
  max: 50,
  reserved: 10,
  bypass: [
    'cb856a24fca7caabb9a389c458b6562f'
  ]
}

readCfg(process.cwd())
  .then(cfg => {
    console.log(cfg)

    const socket = new Socket({
      port: 2310,     // listen port
      ip: '0.0.0.0',  // listen ip
    })

    const connection = socket.connection({
      password: cfg.rconpassword,       // rcon password
      ip: cfg.rconip,                   // rcon ip
      port: parseInt(cfg.rconport, 10)  // rcon port
    }, {
      reconnect: true,            // reconnect on timeout
      reconnectTimeout: 500,      // how long (in ms) to try reconnect
      keepAlive: true,            // send keepAlive packet
      keepAliveInterval: 15000,   // keepAlive packet interval (in ms)
      timeout: true,              // timeout packets
      timeoutInterval: 1000,      // timeout packet check interval (in ms)
      timeoutThresholded: 5,      // packets to resend
      timeoutTime: 2000,          // interval to resend packet (in ms)
    })

    socket.on('listening', (socket) => {
      const addr = socket.address()
      console.log(`Socket listening on ${typeof addr === 'string' ? addr : `${addr.address}:${addr.port}`}`)
    })

    socket.on('error', (err) => { console.error(`SOCKET ERROR:`, err) })
    connection.on('error', (err) => { console.error(`CONNECTION ERROR:`, err) })

    let players = {}
    const regConnected = RegExp('Player #([0-9]{1,3}) (.*) - BE GUID: ([a-f0-9]{32})')
    const regDisconnected = RegExp('Player #([0-9]{1,3}) (.*) disconnected')
    const regList = RegExp('([0-9]{1,3})(.*)([a-f0-9]{32})', 'gm')

    //^([0-9]+)[\s]+([0-9]{1,3}.[0-9]{1,3}.[0-9]{1,3}.[0-9]{1,3}:[0-9]+)[\s]+([0-9]+)[\s]+([a-f0-9]{32})\(OK\)[\s]+((.*)(\(.*\))|(.*))

    connection.on('message', (message) => {
      const count = Object.keys(players).length
      if (regConnected.test(message)) {
        const match = message.match(regConnected)
        if (count >= (options.max - options.reserved)) {
          if (!options.bypass.includes(match[3])) {
            //connection.command(`kick ${match[1]} server is currently full, please try again later.`).catch(console.error)
            console.log(`Kicked player #${match[1]} ${match[2]} (${match[3]})`)
            return
          }
        }

        players[match[1]] = match[3]
        console.log(`Added player #${match[1]} ${match[2]} (${match[3]}) to queue`)
      }

      if (regDisconnected.test(message)) {
        const match = message.match(regDisconnected)
        delete players[match[1]]
        console.log(`Deleted player #${match[1]} ${match[2]} from queue`)
      }
    })

    connection.on('connected', () => {
      console.error(`Connected to ${connection.ip}:${connection.port}`)

      connection
      .command('players')
      .then(response => {
        let match
        while((match = regList.exec(response.data)) !== null) {
          players[match[1]] = match[3]
        }
        console.log(`Loaded player list, currently ${Object.keys(players).length} players on server`)
      })
      .catch(console.error)
    })

    connection.on('disconnected', (reason) => {
      console.warn(`Disconnected from ${connection.ip}:${connection.port},`, reason)
      players = {}
    })
  })
  .catch(err => { console.error(`Error reading config:`, err) })


