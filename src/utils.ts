
import * as crypto from 'crypto'
import * as fs from 'fs'
import * as path from 'path'

export function hashAddress (ip: string, port: number) {
  return crypto.createHash('md5').update(`${ip}:${port}`).digest('hex')
}

export interface IBEConfig {
  rconpassword?: string
  rconport?: string
  rconip?: string
  maxping?: string
}

export function readCfg (bepath: string): Promise<IBEConfig> {
  return new Promise((resolve: (value?: IBEConfig | PromiseLike<IBEConfig>) => void, reject: (reason?: Error) => void) => {
    const beServer = path.join(bepath, 'BEServer.cfg')
    const beServerX64 = path.join(bepath, 'BEServer_x64.cfg')

    let file = beServer
    if (!fs.existsSync(beServer)) {
      if (!fs.existsSync(beServerX64)) {
        reject(new Error('Could not find BEServer or BEServer_x64'))
        return
      } else {
        file = beServerX64
      }
    }

    fs.readFile(file, {encoding: 'utf-8'}, (err: Error, data: string) => {
      if (err !== null) {
        reject(err)
        return
      }

      if (data === '' || data === null) {
        reject(new Error('No data found in cfg!'))
        return
      }

      const regex = /([a-z]\w*) (.*)/gmi

      const config = {}
      let matches
      while ((matches = regex.exec(data)) !== null) { // tslint:disable-line:no-conditional-assignment
        config[matches[1].toLowerCase()] = matches[2] // tslint:disable-line:no-unsafe-any
      }

      resolve(config)
    })
  })
}
