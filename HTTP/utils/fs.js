import * as fs from './../shared/fs'
const FILE_NAME = 'fs_actions_list.txt'

export function readFileSync() {
  return JSON.parse(fs.readFileSync(FILE_NAME) || '[{}]')
}

export function writeFileSync(data) {
  return fs.writeFileSync(FILE_NAME, JSON.stringify(data))
}
