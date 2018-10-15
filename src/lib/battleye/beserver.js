import { BESocket, BEPacket, TYPE, DIR, util } from './'
import { BEError, NoConnection, UnknownCommand, PacketOverflow, ServerTimeout, ServerFlush } from './beerror'

class BEServer {
  constructor (socket, options = {}) {
    let opts = Object.assign({
      ip: '127.0.0.1',
      port: 2302,
      password: null,
      options: null
    }, options)

    const { ip, port, password } = opts

    if (!(socket instanceof BESocket)) {
      throw new TypeError('socket is not an instance of BESocket!')
    }

    this._options = Object.assign({
      reconnect: true,
      reconnectTimeout: 5000
    }, opts.options || {})

    this._id = util.hashAddress(ip, port)
    this._ip = ip
    this._port = parseInt(port, 10)
    this._password = password
    this._connected = false
    this._socket = socket
    this._sent = 0
    this._received = 0
    this._sequence = 0
    this._packets = [null, []]
    this._data = new Map()

    socket.server(this)
  }

  login () {
    if (!this._socket.listening) {
      throw new NoConnection()
    }

    this.flush(new ServerFlush())

    return this._socket.send(
      this._id,
      new BEPacket(TYPE.LOGIN, DIR.REQUEST, { password: this._password })
    )
  }

  command (command, store) {
    if (!this._socket.listening || !this._connected) {
      throw new NoConnection()
    }

    return this._socket.send(
      this._id,
      new BEPacket(TYPE.COMMAND, DIR.REQUEST, { command }),
      store
    )
  }

  disconnect (reason) {
    this.flush(reason)
    this._socket.disconnected(this._id, reason)
    const { reconnect, reconnectTimeout } = this._options
    if (reconnect && (reason instanceof ServerTimeout)) {
      setTimeout(() => {
        this
          .login()
          .catch(e => {
            this._socket.emit('error', e)
          })
      }, reconnectTimeout)
    }
  }

  timeout () {
    const checkPacket = (packet) => {
      if (packet instanceof BEPacket) {
        const timeout = packet.timeout
        if (typeof (timeout) === 'boolean') {
          if (timeout) {
            this._socket.send(this._id, packet.resend(), false)
          } else {
            this.disconnect(new ServerTimeout())
          }
        }
      }
    }

    if (this._packets[0] !== null) { checkPacket(this._packets[0].packet) }
    this._packets[1].forEach(async (store) => { checkPacket(store.packet) })
  }

  store (data) {
    switch (data.packet.type) {
      case TYPE.LOGIN:
        if (this._packets[0]) { throw new PacketOverflow() }
        this._packets[0] = data
        break
      case TYPE.COMMAND:
        if (this._packets[1][data.packet.sequence]) { throw new PacketOverflow() }
        this._packets[1][data.packet.sequence] = data
        break
    }
  }

  resolve (packet, data) {
    let store
    switch (packet.type) {
      case TYPE.LOGIN:
        store = this._packets[0]
        break
      case TYPE.COMMAND:
        store = this._packets[1][packet.sequence]
        if (packet.get('data') === 'Unknown command') {
          data = new UnknownCommand(store.packet.get('command'))
        }
        break
    }

    if (store) {
      if (data instanceof Error) {
        store.reject(data)
      } else {
        store.resolve(Object.assign(data, {
          sent: store.packet,
          receive: packet,
          server: this
        }))
      }

      switch (packet.type) {
        case TYPE.LOGIN:
          this._packets[0] = null
          break
        case TYPE.COMMAND:
          this._packets[1].splice(packet.sequence, 1)
          break
      }

      return !(data instanceof Error)
    }

    return false
  }

  flush (error) {
    if (!(error instanceof BEError)) {
      if (typeof error === 'string') {
        error = new BEError({ message: error })
      }
    }

    if (this._packets[0] !== null) {
      this._packets[0].reject(error)
    }
    this._packets[1].forEach(packet => {
      packet.reject(error)
    })

    this._connected = false
    this._sequence = 0
    this._packets = [null, []]
    this._data = new Map()
  }

  set (key, value) {
    key = key.trim()
    if (key.length === 0) { return this }
    this._data.set(key, value)
    return this
  }

  has (key) {
    return this._data.has(key)
  }

  get (key) {
    return this._data.get(key)
  }

  clear () {
    this._data.clear()
    return this
  }

  sent () {
    this._sent++
    return this
  }

  received () {
    this._received++
    return this
  }

  get connected () {
    return this._connected
  }

  set connected (val) {
    this._connected = Boolean(val)
  }

  get id () {
    return this._id
  }

  get ip () {
    return this._ip
  }

  get port () {
    return this._port
  }

  get sequence () {
    if (this._sequence > 255) { this._sequence = -1 }
    return this._sequence++
  }
}

export {
  BEServer
}
