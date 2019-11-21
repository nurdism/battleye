
import * as crypto from 'crypto'
import * as fs from 'fs'
import * as path from 'path'

export function hashAddress (ip: string, port: number) {
  return crypto.createHash('md5').update(`${ip}:${port}`).digest('hex')
}

export interface IBEConfig {
  rconpassword?: string
  rconport?: number
  rconip?: string
  maxping?: number
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

    fs.readFile(file, (err, data) => {
      if (err !== null) {
        reject(err)
        return
      }

      if (data.toString() === '' || data === null) {
        reject(new Error('No data found in cfg!'))
        return
      }

      const config: IBEConfig = {}
      const regex = /([a-z]\w*) (.*)/gmi
      let matches
      while ((matches = regex.exec(data.toString())) !== null) {
        switch (matches[1].toLowerCase()) {
          case 'rconpassword':
            config.rconpassword = matches[2]
            break
          case 'rconport':
            config.rconport = parseInt(matches[2], 10)
            break
          case 'rconip':
            config.rconip = matches[2]
            break
          case 'maxping':
            config.maxping = parseInt(matches[2], 10)
            break
        }
      }

      resolve(config)
    })
  })
}
