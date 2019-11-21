import * as dgram from 'dgram'
import { EventEmitter } from 'events'
import * as utils from './utils'

import { Connection, IConnectionDetails, IConnectionOptions, IPacketResponse } from './connection'
import { ConnectionExists, InvalidPacket, UnknownConnection } from './errors'
import { Packet, PacketType } from './packet'

export interface ISocketOptions {
  port?: number,
  ip?: string,
}

export declare interface Socket { // eslint-disable-line @typescript-eslint/interface-name-prefix
  on(event: 'listening', listener: (socket: dgram.Socket) => void): this,
  on(event: 'received', listener: (resolved: boolean, packet: Packet, buffer: Packet, connection: Connection, info: dgram.RemoteInfo) => void): this,
  on(event: 'sent', listener: (packet: Packet, buffer: Buffer, bytes: number, connection: Connection) => void): this,
  on(event: 'error', listener: (error: Error) => void): this,
}

interface IOptions {
  port: number,
  ip: string,
}

/**
 * UDP Socket for battleye rcon server to communicate with
 *
 * @export
 * @class Socket
 * @extends {emitter}
 * @implements {ISocket}
 */
export class Socket extends EventEmitter {
  private readonly options: IOptions
  private readonly socket: dgram.Socket
  private readonly connections: { [id: string]: Connection }

  private readonly info: {
    listening: boolean,
  }

  /**
   * Creates an instance of Socket.
   * @param {ISocketOptions} [options={}]
   * @memberof Socket
   */
  constructor(options: ISocketOptions = {}) {
    super()

    this.options = {
      port: 2310,
      ip: '0.0.0.0',
      ...options
    }

    const { port, ip } = this.options

    this.connections = {}
    this.info = {
      listening: false
    }

    this.socket = dgram.createSocket({
      type: 'udp4'
    }, this.receive.bind(this)) // tslint:disable-line:no-unsafe-any

    this.socket.on('error', (err: Error) => {
      this.emit('error', err)
      this.socket.close(() => {
        for (const id of Object.keys(this.connections)) {
          const connection = this.connections[id]
          if (connection instanceof Connection) {
            connection.kill(err)
          }
        }
      })
    })

    this.socket.on('listening', () => {
      this.info.listening = true
      this.emit('listening', this.socket)
    })

    this.socket.bind({
      address: ip,
      port,
      exclusive: true
    })
  }

  /**
   * creates a new connection
   *
   * @param {IConnectionDetails} details
   * @param {IConnectionOptions} [options={}]
   * @param {boolean} [connect=true]
   * @returns {Connection}
   * @memberof Socket
   */
  public connection(details: IConnectionDetails, options: IConnectionOptions = {}, connect: boolean = true): Connection {
    const conn = new Connection(this, details, options)

    if (this.connections[conn.id] !== undefined) {
      throw new ConnectionExists()
    }

    if (connect) {
      if (this.listening) {
        conn.connect().catch((e: Error) => {
          this.emit('error', e)
        })
      } else {
        this.socket.once('listening', () => {
          conn.connect().catch((e: Error) => {
            this.emit('error', e)
          })
        })
      }
    }

    this.connections[conn.id] = conn

    return conn
  }

  /**
   * receive packet from a connection and route packet to appropriate connection
   *
   * @param {Buffer} buffer
   * @param {dgram.RemoteInfo} info
   * @memberof Socket
   */
  public receive(buffer: Buffer, info: dgram.RemoteInfo): void {
    const id = utils.hashAddress(info.address, info.port)
    const connection = this.connections[id]

    if (!(connection instanceof Connection)) {
      this.emit('error', new UnknownConnection(id, info.address, info.port))
      return
    }

    let packet: Packet
    try {
      packet = Packet.FROM(buffer)
    } catch (e) {
      this.emit('error', e)
      connection.emit('error', e)
      return
    }

    if (!packet.valid) {
      this.emit('error', new InvalidPacket())
      connection.emit('error', new InvalidPacket())
      return
    }

    const resolved = connection.recieve(packet)

    this.emit('received', resolved, packet, buffer, connection, info)
    connection.emit('received', resolved, packet, buffer, info)
  }

  /**
   * send packet to connection
   *
   * @param {Connection} connection
   * @param {Packet} packet
   * @param {boolean} [resolve=true]
   * @returns {Promise<IPacketResponse>}
   * @memberof Socket
   */
  public send(connection: Connection, packet: Packet, resolve: boolean = true): Promise<IPacketResponse> {
    return new Promise((res: (value?: IPacketResponse | PromiseLike<IPacketResponse>) => void, rej: (reason?: Error) => void) => {
      if (!(packet instanceof Packet)) {
        return rej(new TypeError('packet must be an instance of BEPacket'))
      }

      if (!packet.valid) {
        return rej(new InvalidPacket())
      }

      if (!(connection instanceof Connection)) {
        return rej(new TypeError('connection must be an instance of Connection'))
      }

      if (packet.type === PacketType.Command && packet.sequence < 0) {
        packet.sequence = connection.sequence
      }

      let buffer: Buffer
      try {
        buffer = packet.serialize()
      } catch (e) {
        return rej(e) // tslint:disable-line:no-unsafe-any
      }

      this.socket.send(buffer, 0, buffer.length, connection.port, connection.ip, (err: Error | null, bytes: number) => {
        if (err !== null) {
          return rej(err)
        }

        this.emit('sent', packet, buffer, bytes, connection)

        if (resolve) {
          try {
            connection.store({
              packet,
              bytes,
              resolve: res,
              reject: rej
            })
          } catch (e) {
            return rej(e) // tslint:disable-line:no-unsafe-any
          }
        } else {
          return res({
            bytes,
            sent: packet,
            received: undefined,
            connection
          })
        }
      })
    })
  }

  /**
   * UDP socket is listening
   *
   * @readonly
   * @type {boolean}
   * @memberof Socket
   */
  get listening(): boolean {
    return this.info.listening
  }
}
