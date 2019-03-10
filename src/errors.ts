
/**
 * NoConnection
 *
 * @export
 * @class NoConnection
 * @extends {Error}
 */
export class NoConnection extends Error {
  constructor () { super('Not connected') }
}

/**
 * ConnectionExists
 *
 * @export
 * @class ConnectionExists
 * @extends {Error}
 */
export class ConnectionExists extends Error {
  constructor () { super('A connection with that IP/Port already exists') }
}

/**
 * UnknownConnection
 *
 * @export
 * @class UnknownConnection
 * @extends {Error}
 */
export class UnknownConnection extends Error {
  constructor (id: string, ip: string, port: number) { super(`Unknown server: ${id} ${ip !== undefined && port !== undefined ? `(${ip}:${port})` : ''}`) }
}

/**
 * UnknownCommand
 *
 * @export
 * @class UnknownCommand
 * @extends {Error}
 */
export class UnknownCommand extends Error {
  constructor (cmd: string) { super(`Unknown command: '${cmd}'`) }
}

/**
 * UnknownPacketType
 *
 * @export
 * @class UnknownPacketType
 * @extends {Error}
 */
export class UnknownPacketType extends Error {
  constructor (type: number) { super(`Unknown packet type: '${type}'`) }
}

/**
 * ServerTimeout
 *
 * @export
 * @class ServerTimeout
 * @extends {Error}
 */
export class ServerTimeout extends Error {
  constructor () { super('Server connection timed out') }
}

/**
 * ServerDisconnect
 *
 * @export
 * @class ServerDisconnect
 * @extends {Error}
 */
export class ServerDisconnect extends Error {
  constructor () { super('Server was manually disconnected') }
}

/**
 * InvalidPassword
 *
 * @export
 * @class InvalidPassword
 * @extends {Error}
 */
export class InvalidPassword extends Error {
  constructor () { super('Server password is invalid') }
}

/**
 * InvalidPacket
 *
 * @export
 * @class InvalidPacket
 * @extends {Error}
 */
export class InvalidPacket extends Error {
  constructor () { super('Packet is not valid') }
}

/**
 * InvalidSequence
 *
 * @export
 * @class InvalidSequence
 * @extends {Error}
 */
export class InvalidSequence extends Error {
  constructor (sequence: number) { super(`Invalid sequence number: #${sequence}`) }
}

/**
 * PacketError
 *
 * @export
 * @class PacketError
 * @extends {Error}
 */
export class PacketError extends Error {
  constructor (message: string) { super(`Packet Error: ${message}`) }
}

/**
 * PacketOverflow
 *
 * @export
 * @class PacketOverflow
 * @extends {Error}
 */
export class PacketOverflow extends Error {
  constructor () { super('Packet Overflow Occurred') }
}
