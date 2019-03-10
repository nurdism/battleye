import * as emitter from 'events'
import * as utils from './utils'

import { clearTimeout } from 'timers'
import { InvalidPassword, NoConnection, PacketOverflow, ServerDisconnect, ServerTimeout, UnknownCommand, UnknownPacketType } from './errors'
import { Packet, PacketDirection, PacketType } from './packet'
import { Socket } from './socket'

export interface IConnectionDetails {
  ip: string
  port: number
  password?: string
}

export interface IConnectionOptions {
  reconnect?: boolean
  reconnectTimeout?: number
  keepAlive?: boolean
  keepAliveInterval?: number
  timeout?: boolean
  timeoutInterval?: number
  timeoutThresholded?: number
  timeoutTime?: number
}

export interface IPacketPromise {
  bytes: number
  packet: Packet
  resolve (value?: IPacketResponse | PromiseLike<IPacketResponse>): void
  reject (reason?: Error): void
}

export interface IPacketResponse {
  command?: string
  data?: string
  connected?: boolean
  bytes: number
  sent: Packet
  received: Packet
  connection: Connection
}

export declare interface IConnection {
  on(event: 'message',      listener: (message: string, packet: Packet) => void): this;
  on(event: 'command',      listener: (data: string, resolved: boolean, packet: Packet) => void): this;

  on(event: 'connected',    listener: () => void): this;
  on(event: 'disconnected', listener: (reason: string | Error) => void): this;
  on(event: 'debug',        listener: (message: string) => void): this;
  on(event: 'error',        listener: (error: Error) => void): this;
}

/**
 * Connection to battleye rcon server
 *
 * @export
 * @class Connection
 * @extends {emitter}
 * @implements {IConnection}
 */
export class Connection extends emitter implements IConnection {
  private readonly socket: Socket
  private readonly options: IConnectionOptions
  private keepAlive: NodeJS.Timeout
  private timeout: NodeJS.Timeout
  private packets: [IPacketPromise, [IPacketPromise]]
  private multipart: [[Packet]]
  private readonly info: {
    id: string
    ip: string
    password: string
    port: number
    sent: number
    received: number
    sequence: number
    connected: boolean
  }

  /**
   * Creates an instance of Connection.
   *
   * @param {Socket} socket
   * @param {IConnectionDetails} details
   * @param {IConnectionOptions} [options={}]
   * @memberof Connection
   */
  constructor (socket: Socket, details: IConnectionDetails, options: IConnectionOptions = {}) {
    super()

    const { ip, port, password } = details

    this.info = {
      id: utils.hashAddress(ip, port),
      ip,
      password,
      port,
      sent: 0,
      received: 0,
      sequence: -1,
      connected: false,
    }

    this.socket = socket
    this.packets = [undefined, [undefined]]
    this.multipart = [undefined]

    this.options = {
      reconnect: true,
      reconnectTimeout: 500,
      keepAlive: true,
      keepAliveInterval: 15000,
      timeout: true,
      timeoutInterval: 1000,
      timeoutThresholded: 5,
      timeoutTime: 2000,
      ...options
    }
  }

  /**
   * connect to the connection
   *
   * @returns {Promise<IPacketResponse>}
   * @memberof Connection
   */
  public connect (): Promise<IPacketResponse> {
    if (!this.socket.listening) {
      throw new NoConnection()
    }

    if (this.connected) {
      this.disconnect()
    }

    this.setup()

    return this.send(new Packet(PacketType.Login, PacketDirection.Request, { password: this.info.password }))
  }

  /**
   * sends a command packet to connection
   *
   * @param {string} command
   * @param {boolean} [resolve=true]
   * @returns {Promise<IPacketResponse>}
   * @memberof Connection
   */
  public command (command: string, resolve: boolean = true): Promise<IPacketResponse> {
    if (!this.socket.listening || !this.connected) {
      throw new NoConnection()
    }

    return this.send(new Packet(PacketType.Command, PacketDirection.Request, { command }), resolve)
  }

  /**
   * sends a packet to connection
   *
   * @param {Packet} packet
   * @param {boolean} [resolve=true]
   * @returns {Promise<IPacketResponse>}
   * @memberof Connection
   */
  public send(packet: Packet, resolve: boolean = true): Promise<IPacketResponse> {
    return this.socket.send(this, packet, resolve)
  }

  /**
   * stores command Promise
   *
   * @param {IPacketPromise} store
   * @memberof Connection
   */
  public store (store: IPacketPromise): void {
    switch (store.packet.type) {
      case PacketType.Login:
        if (this.packets[0] !== undefined) { throw new PacketOverflow() }
        this.packets[0] = store
        break
      case PacketType.Command:
        if (this.packets[1][store.packet.sequence] !== undefined) { throw new PacketOverflow() }
        this.packets[1][store.packet.sequence] = store
        break
      default:
        throw new UnknownPacketType(store.packet.type)
    }
  }

  /**
   * resolves Promise from packet reply
   *
   * @param {Packet} packet
   * @returns {boolean}
   * @memberof Connection
   */
  public resolve (packet: Packet): boolean {
    let resolved = false;
    let store: IPacketPromise

    if (packet.direction === PacketDirection.Split) { // handle multipart packets

      if (this.multipart[packet.sequence] === undefined) {
        this.multipart[packet.sequence] = [undefined]
      }

      this.multipart[packet.sequence][packet.get('index')] = packet

      if ((packet.get('index') + 1) === packet.get('total')) {
        let buff = Buffer.alloc(0);
        for (const p of this.multipart[packet.sequence]) {
          const part = p.get('part')
          buff = Buffer.concat([buff, part], part.length + buff.length)
        }

        this.multipart.splice(packet.sequence, 1)
        return this.resolve(new Packet(PacketType.Command, PacketDirection.Reply, { data: buff.toString(), sequence: packet.sequence }))
      }

      return false
    }

    switch (packet.type) {
      case PacketType.Login:
        store = this.packets[0]

        this.info.connected = packet.get('login')

        if (store !== undefined) {
          if (this.connected) {
            store.resolve({
              connected: true,
              bytes: store.bytes,
              sent: store.packet,
              received: packet,
              connection: this
            })
          } else {
            store.reject(new InvalidPassword())
          }

          resolved = true
          this.packets[0] = undefined
        }

        if (this.connected) {
          this.emit('connected')
        } else {
          this.disconnect(new InvalidPassword())
        }
        break
      case PacketType.Command:
        store = this.packets[1][packet.sequence]

        if (store !== undefined) {
          if (packet.get('data') === 'Unknown command') {
            store.reject(new UnknownCommand(store.packet.get('command')))
          } else {
            store.resolve({
              command: store.packet.get('command'),
              data: packet.get('data'),
              bytes: store.bytes,
              sent: store.packet,
              received: packet,
              connection: this
            })
          }

          resolved = true
          this.packets[1].splice(packet.sequence, 1)
        }

        this.emit('command', packet.get('data'), resolved, packet)
        break
      case PacketType.Message:
        this.emit('message', packet.get('message'), packet)
        this
          .send(new Packet(PacketType.Message, PacketDirection.Reply, { sequence: packet.sequence }),false)
          .catch((e: Error)=> { this.emit('error', e) })
      break
      default:
        this.emit('error', new UnknownPacketType(packet.type))
    }

    return resolved
  }

  /**
   * returns weather or not connection is active
   *
   * @readonly
   * @type {boolean}
   * @memberof Connection
   */
  public get connected (): boolean {
    return this.info.connected
  }

  /**
   * returns connection id
   *
   * @readonly
   * @type {string}
   * @memberof Connection
   */
  public get id (): string {
    return this.info.id
  }

  /**
   * returns connection ip
   *
   * @readonly
   * @type {string}
   * @memberof Connection
   */
  public get ip (): string {
    return this.info.ip
  }

  /**
   * returns connection port
   *
   * @readonly
   * @type {number}
   * @memberof Connection
   */
  public get port (): number {
    return this.info.port
  }

  /**
   * kill connection
   *
   * @param {Error} reason
   * @memberof Connection
   */
  public kill(reason: Error): void {
    this.emit('error', reason)
    this.disconnect(reason)
  }

  /**
   * set's up timers for keep alive and timeouts
   *
   * @private
   * @memberof Connection
   */
  private setup (): void {
    const { keepAlive, keepAliveInterval, timeout, timeoutInterval, timeoutThresholded, timeoutTime } = this.options
    if (keepAlive && this.keepAlive === undefined) {
      this.keepAlive = setInterval(async () => {
        if (this.connected) {
          this
          .command('')
          .then(({ sent, received }: IPacketResponse) => {
            this.emit('debug', `ping: ${this.ip}:${this.port} ${(received.timestamp - sent.timestamp)}ms`)
          })
          .catch((e: Error) => { this.emit('error', e) })
        }
      }, keepAliveInterval)
    }

    if (timeout && this.timeout === undefined) {
      this.timeout = setInterval(async () => {
        const time = new Date().getTime()
        const check = (data: IPacketPromise) => {
          if (data !== undefined && data.packet instanceof Packet ) {
            if (time - data.packet.timestamp >= data.packet.sent * timeoutTime) {
              this
              .send(data.packet, false)
              .catch((e: Error) => this.emit('error', e))
            } else if (data.packet.sent >= timeoutThresholded) {
              this.disconnect(new ServerTimeout())
            }
          }
        }

        check(this.packets[0])
        for (const p of this.packets[1]) {
          check(p)
        }
      }, timeoutInterval)
    }
  }

  /**
   * returns connection packet sequence
   *
   * @readonly
   * @type {number}
   * @memberof Connection
   */
  public get sequence (): number {
    if (this.info.sequence > 255) { this.info.sequence = -1 }
    return this.info.sequence = this.info.sequence +1
  }

  /**
   * disconnects from connection
   *
   * @param {Error} [reason=new ServerDisconnect()]
   * @memberof Connection
   */
  private disconnect(reason: Error = new ServerDisconnect()): void {
    this.cleanup(reason)
    this.emit('disconnected', reason)
    const { reconnect, reconnectTimeout } = this.options
    if (reconnect && (reason instanceof ServerTimeout)) {
      setTimeout(() => {
        this
          .connect()
          .catch((e: Error) => {
            this.emit('error', e)
          })
      }, reconnectTimeout)
    }
  }

  /**
   * cleans up unresolved promises and resets connection
   *
   * @private
   * @param {Error} error
   * @memberof Connection
   */
  private cleanup (error: Error ): void {
    clearTimeout(this.timeout)
    clearTimeout(this.keepAlive)

    this.timeout = undefined
    this.keepAlive = undefined

    if (this.packets[0] !== undefined) {
      this.packets[0].reject(error)
    }

    for (const packet of this.packets[1]) {
      if (packet !== undefined) {
        packet.reject(error)
      }
    }

    this.info.sent = 0
    this.info.received = 0
    this.info.sequence = -1
    this.info.connected = false
    this.packets = [undefined, [undefined]]
    this.multipart = [undefined]
  }
}

