import * as fs from './fs'
const FILE_NAME = 'fs_vehicle.txt'

export const readFile = (file = FILE_NAME) => {
  return JSON.parse(fs.readFileSync(file) || '{}')
}

export const writeFile = (data, file = FILE_NAME) => {
  return fs.writeFileSync(file, JSON.stringify(data))
}
