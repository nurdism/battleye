import dgram from 'dgram'
import EventEmitter from 'events'
import { BEServer, BEPacket, TYPE, DIR, util } from './'
import { UnknownServer, InvalidPacket, InvalidPassword } from './beerror'

class BESocket extends EventEmitter {
  constructor (options = {}) {
    super()

    this._options = Object.assign({
      keepalive: true,
      keepaliveInterval: 5000, // 5s keep alive
      timeout: true,
      timeoutInterval: 500,
      port: null,
      ip: '0.0.0.0'
    }, options)

    this._listening = false
    this._servers = {}
    this._udp = dgram.createSocket({
      type: 'udp4'
    }, this.receive.bind(this))

    this._udp.on('error', (err) => {
      this.emit('error', err)
      this._udp.close(() => {
        for (let id in this._servers) {
          const server = this._servers[id]
          if (server instanceof BEServer) {
            server.flush(err)
          }
        }
      })
    })

    this._udp.on('listening', () => {
      this._listening = true
      this.emit('listening', this._udp)
    })

    const {
      keepalive,
      keepaliveInterval,
      timeout,
      timeoutInterval,
      port,
      ip
    } = this._options

    this._udp.bind({
      address: ip,
      port: port,
      exclusive: true
    })

    if (keepalive) {
      this._keepAlive = setInterval(async () => {
        this.emit('debug', `pinging servers: (${keepaliveInterval}ms)`)
        for (let id in this._servers) {
          const server = this._servers[id]
          if (server instanceof BEServer && server.connected) {
            server
              .command()
              .then(({ server, sent, receive }) => {
                this.emit('debug', `ping: ${server.ip}:${server.port} ${sent.ping(receive)}ms`)
              })
              .catch(e => {
                this.emit('error', e)
              })
          }
        }
      }, keepaliveInterval)
    }

    if (timeout) {
      this._timeout = setInterval(async () => {
        for (let id in this._servers) {
          const server = this._servers[id]
          if (server instanceof BEServer) {
            server.timeout()
          }
        }
      }, timeoutInterval)
    }
  }

  server (server) {
    if (!(server instanceof BEServer)) {
      this.emit('error', new TypeError('server must be an instance of BEServer'))
      return false
    }
    this._servers[server.id] = server
    return true
  }

  connected (id) {
    const server = this._servers[id]
    if (!(server instanceof BEServer)) {
      return this.emit('error', new UnknownServer(id))
    }
    this.emit('connected', server)
  }

  disconnected (id, reason) {
    const server = this._servers[id]
    if (!(server instanceof BEServer)) {
      return this.emit('error', new UnknownServer(id))
    }
    this.emit('disconnected', server, reason)
  }

  receive (buffer, info) {
    const id = util.hashAddress(info.address, info.port)
    const server = this._servers[id]

    if (!(server instanceof BEServer)) {
      return this.emit('error', new UnknownServer(id, info.address, info.port))
    }

    let packet
    try {
      packet = BEPacket.from(buffer)
    } catch (e) { return this.emit('error', e) }

    if (!packet.valid) {
      return this.emit('error', new InvalidPacket(packet))
    }

    server.received()

    switch (packet.type) {
      case TYPE.LOGIN:
        server.connected = packet.get('login')
        if (server.connected) {
          server.resolve(packet, { connected: server.connected })
          this.connected(id)
        } else {
          server.resolve(packet, new InvalidPassword())
          this.disconnected(id, 'password')
        }
        break
      case TYPE.COMMAND:
        if (server.resolve(packet, { data: packet.get('data') })) {
          this.emit('command', packet, server)
        }
        break
      case TYPE.MESSAGE:
        this.emit('message', packet.get('message'), packet, server)
        this.send(
          id,
          new BEPacket(
            TYPE.MESSAGE,
            DIR.REPLY,
            { sequence: packet.sequence }
          ),
          false
        ).catch(e => {
          this.emit('error', e)
        })
        break
      default:
        // error?
        break
    }

    this.emit('receive', packet, buffer, server, info)
  }

  send (id, packet, store = true) {
    return new Promise((resolve, reject) => {
      if (!(packet instanceof BEPacket)) {
        return reject(new TypeError(`packet must be an instance of BEPacket`))
      }

      if (!packet.valid) {
        return reject(new InvalidPacket(packet))
      }

      let server = this._servers[id]
      if (!(server instanceof BEServer)) {
        return reject(new UnknownServer(id))
      }

      if (packet.type === TYPE.COMMAND && packet.sequence === null) {
        packet.sequence = server.sequence
      }

      let buffer = null
      try {
        buffer = packet.serialize()
      } catch (err) {
        return reject(err)
      }

      this._udp.send(buffer, 0, buffer.length, server.port, server.ip, (err, bytes) => {
        if (err) { return reject(err) }

        server.sent()
        this.emit('send', packet, buffer, bytes, server)

        if (store) {
          try {
            server.store({
              packet,
              bytes,
              reject,
              resolve
            })
          } catch (e) {
            return reject(e)
          }
        } else {
          return resolve({ bytes })
        }
      })
    })
  }

  get listening () {
    return this._listening
  }
}

export {
  BESocket
}
