class BEError extends Error {
  constructor (opts = {}) {
    super()
    this.message = opts.message
  }
}

class NoConnection extends BEError {
  constructor () {
    super({
      message: 'Not connected!'
    })
  }
}

class UnknownServer extends BEError {
  constructor (id, ip, port) {
    super({
      message: `Unknown server: ${id} ${ip && port ? `(${ip}:${port})` : ''}`
    })
  }
}

class UnknownCommand extends BEError {
  constructor (cmd) {
    super({
      message: `Unknown command: '${cmd}'`
    })
  }
}

class ServerTimeout extends BEError {
  constructor () {
    super({
      message: 'Server connection timed out!'
    })
  }
}

class ServerFlush extends BEError {
  constructor () {
    super({
      message: 'Server flushing cache!'
    })
  }
}

class InvalidPassword extends BEError {
  constructor () {
    super({
      message: 'That password is invalid!'
    })
  }
}

class InvalidPacket extends BEError {
  constructor (packet) {
    super({
      message: 'Packet is not valid!'
    })

    this.packet = packet
  }
}

class InvalidSequence extends BEError {
  constructor (sequence) {
    super({
      message: `Invalid sequence number: #${sequence}`
    })
  }
}

class PacketError extends BEError {
  constructor (message) {
    super({
      message: `Packet Error: ${message}`
    })
  }
}

class PacketOverflow extends BEError {
  constructor () {
    super({
      message: 'Packet Overflow Occurred'
    })
  }
}

export {
  BEError,
  NoConnection,
  ServerTimeout,
  ServerFlush,
  UnknownServer,
  UnknownCommand,
  InvalidPassword,
  InvalidPacket,
  InvalidSequence,
  PacketError,
  PacketOverflow
}
