
import { crc32 } from './crc32'
import { InvalidPacket, InvalidSequence, PacketError, UnknownPacketType, NoPassword, NoCommand } from './errors'

export enum PacketType {
  Login = 0,
  Command = 1,
  Message = 2,
}

export enum PacketDirection {
  Request = 0,
  Reply = 1,
  Split = 2,
}

export interface IPacketAttributes {
  timestamp?: number,
  sent?: number,
  sequence?: number,
  total?: number,
  index?: number,
  data?: string,
  password?: string,
  command?: string,
  message?: string,
  login?: boolean,
  part?: Buffer,
  [key: string]: number | string | boolean | Buffer | undefined | Error,
}

/**
 * Packet class
 *
 * @export
 * @class Packet
 */
export class Packet {
  private attributes: IPacketAttributes
  private readonly info: {
    type: PacketType,
    direction: PacketDirection,
  }

  /**
   * Creates an instance of Packet.
   *
   * @param {PacketType} type
   * @param {PacketDirection} direction
   * @param {IPacketAttributes} [attributes={}]
   * @memberof Packet
   */
  constructor(type: PacketType, direction: PacketDirection, attributes: IPacketAttributes = {}) {
    this.info = {
      type,
      direction
    }

    this.clear()
    this.attributes = { ...attributes }
  }


  /**
   * copies packet from another packet
   *
   * @static
   * @param {Packet} packet
   * @returns {Packet}
   * @memberof Packet
   */
  public static COPY(packet: Packet): Packet {
    return new Packet(packet.type, packet.direction, { ...packet.attributes })
  }

  /**
   * creates packet from buffer
   *
   * @static
   * @param {Buffer} buffer
   * @returns {Packet}
   * @memberof Packet
   */
  public static FROM(buffer: Buffer): Packet {
    const { length } = buffer
    if (length < 9) {
      throw new PacketError('Packet must contain at least 9 bytes')
    }

    const header = buffer.toString('utf8', 0, 2)
    if (header !== 'BE') {
      throw new PacketError('Invalid header text')
    }

    const payload = buffer.slice(6, length)
    const checksum = buffer.readInt32BE(2)
    const crc = crc32(payload).readInt32LE(0)

    if (checksum !== crc) {
      throw new PacketError('Packet checksum verification failed.')
    }

    if (payload.readUInt8(0) !== 0xFF) {
      throw new PacketError('Packet missing 0xFF flag after checksum.')
    }

    const type = payload.readUInt8(1)
    const attributes: IPacketAttributes = {}
    let direction = PacketDirection.Reply

    switch (type) {
      case PacketType.Login:
        attributes.login = (payload.readUInt8(2) === 1)
        break
      case PacketType.Command:
        attributes.sequence = payload.readUInt8(2)
        if (payload.length > 4 && payload.readUInt8(3) === 0) { // multipart packet
          attributes.total = payload.readUInt8(4)
          attributes.index = payload.readUInt8(5)
          attributes.part = payload.slice(6, payload.length)
          direction = PacketDirection.Split
        } else {
          attributes.data = payload.slice(3, payload.length).toString()
        }
        break
      case PacketType.Message:
        attributes.sequence = payload.readUInt8(2)
        attributes.message = payload.slice(3, payload.length).toString()
        break
      default:
        throw new UnknownPacketType(type)
    }

    return new Packet(type, direction, attributes)
  }

  /**
   * get packet attribute
   *
   * @param {string} key
   * @returns {*}
   * @memberof Packet
   */
  public get(key: 'password'|'command'|'data'|'message'): string;
  public get(key: 'index'|'total'|'sequence'): number;
  public get(key: 'login'): boolean;
  public get(key: 'part'): Buffer;
  public get(key: 'error'): Error;
  public get(key: string): number | string | boolean | Buffer | undefined | Error { // tslint:disable-line:no-any
    return this.attributes[key]
  }

  /**
   * set packet attribute
   *
   * @param {string} key
   * @param {*} value
   * @returns {Packet}
   * @memberof Packet
   */
  public set(key: 'password'|'command'|'data'|'message', value: string): this;
  public set(key: 'index'|'total'|'sequence', value: number): this;
  public set(key: 'login', value: boolean): this;
  public set(key: 'part', value: Buffer): this;
  public set(key: string, value: any): Packet { // tslint:disable-line:no-any
    this.attributes[key] = value
    return this
  }

  /**
   * check if packet has attribute
   *
   * @param {string} key
   * @returns {boolean}
   * @memberof Packet
   */
  public has(key: string): boolean {
    return typeof this.attributes[key] !== 'undefined'
  }

  /**
   * clear attributes of packet
   *
   * @returns {Packet}
   * @memberof Packet
   */
  public clear(): Packet {
    this.attributes = {}
    this.attributes.timestamp = new Date().getTime() // new timestamp
    if (this.direction === PacketDirection.Request) {
      this.attributes.sent = 0
    }
    return this
  }

  /**
   * packet type
   *
   * @readonly
   * @type {number}
   * @memberof Packet
   */
  public get type(): number {
    return this.info.type
  }

  /**
   * packet direction
   *
   * @readonly
   * @type {number}
   * @memberof Packet
   */
  public get direction(): number {
    return this.info.direction
  }

  /**
   * timestamp of packet creation
   *
   * @readonly
   * @type {number}
   * @memberof Packet
   */
  public get timestamp(): number | undefined {
    return this.attributes.timestamp
  }

  /**
   * number of times packet was serialized for sending
   *
   * @readonly
   * @type {number}
   * @memberof Packet
   */
  public get sent(): number {
    return typeof this.attributes.sent === 'number' ? this.attributes.sent : 0
  }

  /**
   * packet sequence
   *
   * @type {number}
   * @memberof Packet
   */
  public get sequence(): number {
    return typeof this.attributes.sequence === 'number' ? this.attributes.sequence : -1
  }

  /**
   * packet sequence
   *
   * @memberof Packet
   */
  public set sequence(sequence: number) {
    if (sequence < 0 || sequence > 255) {
      throw new InvalidSequence(sequence)
    }
    this.attributes.sequence = sequence
  }

  /**
   * check if packet is valid
   *
   * @readonly
   * @memberof Packet
   */
  public get valid() {
    return (Number.isInteger(this.type) && Number.isInteger(this.direction))
  }

  /**
   * serialize packet to be sent to battleye
   *
   * @returns {Buffer}
   * @memberof Packet
   */
  public serialize(): Buffer {
    if (!this.valid) {
      throw new InvalidPacket()
    }

    let payload: Buffer
    switch (this.type) {
      case PacketType.Login:
        if (!this.has('password')) {
          throw new NoPassword()
        }
        const password = this.get('password')
        payload = Buffer.alloc(password.length + 2)
        payload.writeUInt8(0xFF, 0)
        payload.writeUInt8(this.type, 1)
        payload.write(password, 2)
        break
      case PacketType.Command:
        if (!this.has('command')) {
          throw new NoCommand()
        }

        const cmd = this.get('command')
        payload = Buffer.alloc(cmd.length + 3)
        payload.writeUInt8(0xFF, 0)
        payload.writeUInt8(this.type, 1)
        payload.writeUInt8(this.sequence, 2)
        payload.write(cmd, 3)
        break
      case PacketType.Message:
        payload = Buffer.alloc(3)
        payload.writeUInt8(0xFF, 0)
        payload.writeUInt8(this.type, 1)
        payload.writeUInt8(this.sequence, 2)
        break
      default:
        throw new UnknownPacketType(this.type)
    }

    const crc = crc32(payload)
    const header = Buffer.from([0x42, 0x45, 0x00, 0x00, 0x00, 0x00])
    header.writeInt32BE(crc.readInt32LE(0), 2)

    this.attributes.sent = this.attributes.sent ? this.attributes.sent + 1 : 1

    return Buffer.concat([header, payload], header.length + payload.length)
  }
}
