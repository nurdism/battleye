import fs from 'fs'
import path from 'path'
import crypto from 'crypto'
import { promisify } from 'util'

function hashAddress (ip, port) {
  return crypto.createHash('md5').update(`${ip}:${port}`).digest('hex')
}

const read = promisify(fs.readFile)
async function readcfg (bepath) {
  let data

  try {
    data = await read(path.join(bepath, 'BEServer.cfg'))
  } catch (e) {}
  try {
    data = await read(path.join(bepath, 'BEServer_x64.cfg'))
  } catch (e) {}

  if (!data) {
    throw new Error('No data!')
  }

  const regex = /([a-z]\w*) (.*)/gmi

  let config = {}
  let matches
  while ((matches = regex.exec(data)) !== null) {
    config[matches[1].toLowerCase()] = matches[2]
  }

  return config
}

export {
  hashAddress,
  readcfg
}
