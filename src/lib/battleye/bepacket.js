import { crc32 } from './'
import { InvalidPacket, InvalidSequence, PacketError } from './beerror'

const TYPE = {
  0: 'LOGIN',
  1: 'COMMAND',
  2: 'MESSAGE',
  LOGIN: 0,
  COMMAND: 1,
  MESSAGE: 2
}

const DIR = {
  0: 'REQUEST',
  1: 'REPLY',
  2: 'SPLIT',
  REQUEST: 0,
  REPLY: 1,
  SPLIT: 2
}

class BEPacket {
  constructor (type, dir, attributes) {
    this._created = new Date()
    this._attributes = new Map()
    this._type = Number.isInteger(type) ? type : null
    this._dir = Number.isInteger(dir) ? dir : DIR.REQUEST
    this._retries = 0

    if (typeof attributes === 'object' && Object.keys(attributes).length > 0) {
      for (let key in attributes) {
        if (attributes[key] !== undefined) {
          this.set(key, attributes[key])
        }
      }
    }
  }

  resend () {
    this._retries++
    return this
  }

  set (attribute, value) {
    attribute = attribute.trim()
    if (attribute === undefined || attribute.length === 0) { return this }
    if (value === undefined) { return this }
    this._attributes.set(attribute, value)
    return this
  }

  has (attribute) {
    return this._attributes.has(attribute)
  }

  get (attribute) {
    return this._attributes.get(attribute)
  }

  copy (packet, overwrite = false) {
    if (!(packet instanceof BEPacket)) { throw new TypeError('packet not an instance of BEPacket') }
    packet._attributes.forEach((value, key) => {
      if (overwrite && this._attributes.has(value)) { return }
      this._attributes.set(key, value)
    })
    return this
  }

  clear () {
    this._attributes.clear()
    return this
  }

  ping (packet) {
    return (packet.timestamp - this.timestamp)
  }

  get timestamp () {
    return this._created.getTime()
  }

  get timeout () {
    if (((new Date().getTime()) - (this._created.getTime())) >= ((this._retries + 1) * 2000)) {
      return !(this._retries >= 4)
    } // Retry five times over 10s period
  }

  get sequence () {
    const sequence = this._attributes.get('sequence')
    return Number.isInteger(sequence) ? sequence : null
  }

  set sequence (sequence) {
    sequence = parseInt(sequence, 10)
    if (sequence < 0 || sequence > 255) {
      throw new InvalidSequence(sequence)
    }
    this._attributes.set('sequence', sequence)
  }

  get type () {
    return this._type
  }

  get dir () {
    return this._dir
  }

  get length () {
    return this._attributes.size
  }

  get valid () {
    return (Number.isInteger(this._type) && Number.isInteger(this._dir))
  }

  serialize () {
    if (!this.valid) {
      throw new InvalidPacket(this)
    }

    let payload
    switch (this._type) {
      case TYPE.LOGIN:
        if (this.has('password')) {
          const password = this.get('password')
          payload = Buffer.alloc(password.length + 2)
          payload.writeUInt8(0xFF, 0)
          payload.writeUInt8(this._type, 1)
          payload.write(password, 2)
        }
        break
      case TYPE.COMMAND:
        if (this.has('command')) {
          const cmd = this.get('command')
          payload = Buffer.alloc(cmd.length + 3)
          payload.writeUInt8(0xFF, 0)
          payload.writeUInt8(this._type, 1)
          payload.writeUInt8(this.sequence, 2)
          payload.write(cmd, 3)
        }
        break
    }

    if (payload === undefined) {
      payload = Buffer.alloc(3)
      payload.writeUInt8(0xFF, 0)
      payload.writeUInt8(this._type, 1)
      payload.writeUInt8(this.sequence, 2)
    }

    const crc = crc32(payload)
    const header = Buffer.from([0x42, 0x45, 0x00, 0x00, 0x00, 0x00])
    header.writeInt32BE(crc.readInt32LE(0), 2)

    return Buffer.concat([header, payload], header.length + payload.length)
  }

  static from (buffer) {
    const length = buffer.length
    if (length < 9) { throw new PacketError('Packet must contain at least 9 bytes') }

    const header = buffer.toString('utf8', 0, 2)
    if (header !== 'BE') { throw new PacketError('Invalid header text') }

    const payload = buffer.slice(6, length)
    const checksum = buffer.readInt32BE(2)
    const crc = crc32(payload).readInt32LE(0)

    if (checksum !== crc) { throw new PacketError('Packet checksum verification failed.') }
    if (payload.readUInt8(0) !== 0xFF) { throw new PacketError('Packet missing 0xFF flag after checksum.') }

    let type = payload.readUInt8(1)
    let dir = DIR.REPLY
    let attributes = {}

    switch (type) {
      case TYPE.LOGIN:
        attributes['login'] = (payload.readUInt8(2) === 1)
        break
      case TYPE.COMMAND:
        attributes['sequence'] = payload.readUInt8(2)
        if (payload.length > 4 && payload.readUInt8(3) === 0) { // multipart packet
          attributes['total'] = payload.readUInt8(4)
          attributes['index'] = payload.readUInt8(5)
          attributes['part'] = payload.slice(6, payload.length)
          dir = DIR.SPLIT
        } else {
          attributes['data'] = payload.slice(3, payload.length).toString()
        }
        break
      case TYPE.MESSAGE:
        attributes['sequence'] = payload.readUInt8(2)
        attributes['message'] = payload.slice(3, payload.length).toString()
        break
      default:
        // error?
        break
    }

    return new BEPacket(type, dir, attributes)
  }
}

export {
  TYPE,
  DIR,
  BEPacket
}
