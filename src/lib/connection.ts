import * as utils from './utils'

import { EventEmitter } from 'events'
import { clearTimeout } from 'timers'
import { InvalidPassword, NoConnection, PacketOverflow, ServerDisconnect, ServerTimeout, UnknownCommand, UnknownPacketType, MaxRetries } from './errors'
import { Packet, PacketDirection, PacketType } from './packet'
import { Socket } from './socket'

export interface IConnectionDetails {
  name: string,
  ip: string,
  port: number,
  password: string,
}

export interface IConnectionOptions {
  reconnect?: boolean,
  reconnectTimeout?: number,
  keepAlive?: boolean,
  keepAliveInterval?: number,
  timeout?: boolean,
  timeoutInterval?: number,
  serverTimeout?: number,
  packetTimeout?: number,
  packetTimeoutThresholded?: number,
}

export interface IPacketPromise {
  bytes: number,
  packet: Packet,
  resolve (value?: IPacketResponse | PromiseLike<IPacketResponse>): void,
  reject (reason?: Error): void,
}

export interface IPacketResponse {
  command?: string,
  data?: string,
  connected?: boolean,
  bytes: number,
  sent: Packet,
  received?: Packet,
  connection: Connection,
}

export declare interface Connection { // eslint-disable-line @typescript-eslint/interface-name-prefix
  on(event: 'message', listener: (message: string, packet: Packet) => void): this,
  on(event: 'command', listener: (data: string, resolved: boolean, packet: Packet) => void): this,
  on(event: 'connected', listener: () => void): this,
  on(event: 'disconnected', listener: (reason: string | Error) => void): this,
  on(event: 'debug', listener: (message: string) => void): this,
  on(event: 'error', listener: (error: Error) => void): this,
}

interface IOptions {
  reconnect: boolean,
  reconnectTimeout: number,
  keepAlive: boolean,
  keepAliveInterval: number,
  timeout: boolean,
  timeoutInterval: number,
  serverTimeout: number,
  packetTimeout: number,
  packetTimeoutThresholded: number,
}

/**
 * Connection to battleye rcon server
 *
 * @export
 * @class Connection
 * @extends {emitter}
 * @implements {IConnection}
 */
export class Connection extends EventEmitter {
  private readonly socket: Socket
  private readonly options: IOptions
  private keepAlive: NodeJS.Timeout | undefined
  private timeout: NodeJS.Timeout | undefined
  private packets: Array<IPacketPromise | undefined>
  private multipart: Array<Packet[]>
  private readonly info: {
    name: string,
    id: string,
    ip: string,
    password: string,
    port: number,
    sent: number,
    received: number,
    sequence: number,
    connected: boolean,
    lastPacket?: Packet,
  }

  /**
   * Creates an instance of Connection.
   *
   * @param {Socket} socket
   * @param {IConnectionDetails} details
   * @param {IConnectionOptions} [options={}]
   * @memberof Connection
   */
  constructor(socket: Socket, details: IConnectionDetails, options: IConnectionOptions = {}) {
    super()

    const { name, ip, port, password } = details

    this.info = {
      name,
      id: utils.hashAddress(ip, port),
      ip,
      password,
      port,
      sent: 0,
      received: 0,
      sequence: -1,
      connected: false
    }

    this.socket = socket
    this.packets = new Array(255)
    this.multipart = new Array(255)

    for (let i = 0; i < 255; i++) {
      this.multipart[i] = []
    }

    this.options = {
      reconnect: true,
      reconnectTimeout: 500,
      keepAlive: true,
      keepAliveInterval: 15000,
      timeout: true,
      timeoutInterval: 1000,
      serverTimeout: 30000,
      packetTimeout: 1000,
      packetTimeoutThresholded: 5,
      ...options
    }
  }

  /**
   * connect to the connection
   *
   * @returns {Promise<IPacketResponse>}
   * @memberof Connection
   */
  public connect(): Promise<IPacketResponse> {
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
  public command(command: string, resolve: boolean = true): Promise<IPacketResponse> {
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
  public store(store: IPacketPromise): void {
    switch (store.packet.type) {
      case PacketType.Login:
        if (this.packets[0] !== undefined) {
          throw new PacketOverflow(store)
        }
        this.packets[0] = store
        break
      case PacketType.Command:
        if (this.packets[store.packet.sequence] !== undefined) {
          throw new PacketOverflow(store)
        }
        this.packets[store.packet.sequence] = store
        break
      default:
        throw new UnknownPacketType(store.packet.type)
    }
  }

  public async recieve(packet: Packet) {
    this.info.lastPacket = packet

    if (packet.direction === PacketDirection.Split) { // handle multipart packets
      if (this.multipart[packet.sequence].length === 0) {
        this.multipart[packet.sequence] = new Array(packet.get('total'))
      }

      this.multipart[packet.sequence][packet.get('index')] = packet

      if ((packet.get('index') + 1) === packet.get('total')) {
        try {
          let valid = true
          let buff = Buffer.alloc(0)
          for (const p of this.multipart[packet.sequence]) {
            if (p instanceof Packet) {
              buff = Buffer.concat([buff, p.get('part')], p.get('part').length + buff.length)
            } else {
              valid = false
              break
            }
          }

          if (valid) {
            this.multipart[packet.sequence] = []
            return this.resolve(new Packet(PacketType.Command, PacketDirection.Reply, { data: buff.toString(), sequence: packet.sequence }))
          }

          const resend = this.packets[packet.sequence]
          if (resend && resend.packet) { // resend packet
            if (resend.packet.sent >= 5) {
              await this.send(resend.packet, false)
            } else {
              return this.resolve(new Packet(PacketType.Command, PacketDirection.Reply, { error: new MaxRetries(), sequence: packet.sequence }))
            }
          }
        } catch (err) {
          return this.resolve(new Packet(PacketType.Command, PacketDirection.Reply, { error: err, sequence: packet.sequence }))
        }
      }

      return false
    }

    return this.resolve(packet)
  }

  /**
   * resolves Promise from packet reply
   *
   * @param {Packet} packet
   * @returns {boolean}
   * @memberof Connection
   */
  public resolve(packet: Packet): boolean {
    let resolved = false
    let store: IPacketPromise | undefined

    switch (packet.type) {
      case PacketType.Login:
        store = this.packets[0] // eslint-disable-line

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
        store = this.packets[packet.sequence]

        if (store !== undefined) {
          if (packet.get('error')) {
            store.reject(store.packet.get('error'))
          } else if (packet.get('data') === 'Unknown command') {
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
          this.packets[packet.sequence] = undefined
        }
        if (packet.get('data')) {
          this.emit('command', packet.get('data'), resolved, packet)
        }
        break
      case PacketType.Message:
        this.emit('message', packet.get('message'), packet)
        this
          .send(new Packet(PacketType.Message, PacketDirection.Reply, { sequence: packet.sequence }), false)
          .catch((e: Error) => { this.emit('error', e) })
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
  public get connected(): boolean {
    return this.info.connected
  }

  /**
   * returns connection id
   *
   * @readonly
   * @type {string}
   * @memberof Connection
   */
  public get id(): string {
    return this.info.id
  }

  /**
   * returns connection name
   *
   * @readonly
   * @type {string}
   * @memberof Connection
   */
  public get name(): string {
    return this.info.name
  }

  /**
   * returns connection ip
   *
   * @readonly
   * @type {string}
   * @memberof Connection
   */
  public get ip(): string {
    return this.info.ip
  }

  /**
   * returns connection port
   *
   * @readonly
   * @type {number}
   * @memberof Connection
   */
  public get port(): number {
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
  private setup(): void {
    const {
      keepAlive,
      keepAliveInterval,
      timeout,
      timeoutInterval,
      serverTimeout,
      packetTimeout,
      packetTimeoutThresholded
    } = this.options

    if (keepAlive === true) {
      this.keepAlive = setInterval(() => {
        if (this.connected) {
          this
          .command('')
          .then(({ sent, received }: IPacketResponse) => {
            if (received && received.timestamp && sent.timestamp) {
              this.emit('debug', `ping: ${this.ip}:${this.port} ${(received.timestamp - sent.timestamp)}ms`)
            }
          })
          .catch((e: Error) => { this.emit('error', e) })
        }
      }, keepAliveInterval)
    }

    if (timeout === true) {
      this.timeout = setInterval(async () => {
        try {
          const time = new Date().getTime()
          const { lastPacket } = this.info

          if (lastPacket && lastPacket.timestamp) {
            if (time - lastPacket.timestamp >= serverTimeout) {
              this.disconnect(new ServerTimeout())
              return
            }
          }

          for (const p of this.packets) {
            if (p !== undefined && p.packet instanceof Packet) {
              const { timestamp, sent, type, sequence } = p.packet
              if (timestamp && time - timestamp >= sent * packetTimeout) {
                await this.send(p.packet, false)
              } else if (sent >= packetTimeoutThresholded) {
                this.resolve(new Packet(type, PacketDirection.Reply, { error: new ServerTimeout(), sequence }))
              }
            }
          }
        } catch (err) {
          this.emit('error', err)
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
  public get sequence(): number {
    if (this.info.sequence >= 255) {
      this.info.sequence = -1
    }
    return this.info.sequence = this.info.sequence + 1
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
      const timeout = setTimeout(() => {
        clearTimeout(timeout)
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
  private cleanup(error: Error): void {
    if (this.timeout) {
      clearTimeout(this.timeout)
      this.timeout = undefined
    }

    if (this.keepAlive) {
      clearTimeout(this.keepAlive)
      this.keepAlive = undefined
    }


    for (const packet of this.packets) {
      if (packet !== undefined) {
        packet.reject(error)
      }
    }

    this.info.sent = 0
    this.info.received = 0
    this.info.sequence = -1
    this.info.connected = false
    this.packets = new Array(255)
    this.multipart = new Array(255)

    for (let i = 0; i < 255; i++) {
      this.multipart[i] = []
    }
  }
}

