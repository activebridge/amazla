// hmFS-backed text storage — works on every runtime, unlike @zos/fs. The logging
// in the upstream copy of this file is commented out on purpose: it printed every
// file's full contents.
// const logger = DeviceRuntimeCore.HmLogger.getLogger('fs.js')

// Text is stored as UTF-8. Two legacies have to keep reading, so writes pick one
// encoding and reads sniff:
//   - the v3 build wrote through @zos/fs, which is UTF-8;
//   - the upstream `str2ab` here wrote UTF-16LE (two bytes per char), so older
//     installs carry UTF-16 files.
// Guessing wrong yields mojibake and a JSON.parse throw, which reads as "all my
// actions are gone" until the phone syncs them back.
// UTF-8 is what we write from here on: half the bytes, and it matches the majority
// of installs. TextEncoder/TextDecoder don't exist in QuickJS, hence the hand roll.

// fromCharCode has an argument-count ceiling — feed it in chunks.
const CHUNK = 4096
function charsToString(chars) {
  if (chars.length <= CHUNK) return String.fromCharCode.apply(null, chars)
  let out = ''
  for (let i = 0; i < chars.length; i += CHUNK) {
    out += String.fromCharCode.apply(null, chars.slice(i, i + CHUNK))
  }
  return out
}

function encodeUtf8(str) {
  const bytes = []
  for (let i = 0; i < str.length; i++) {
    let cp = str.charCodeAt(i)
    // Recombine a surrogate pair into its code point (emoji in an issuer name).
    if (cp >= 0xd800 && cp <= 0xdbff && i + 1 < str.length) {
      const lo = str.charCodeAt(i + 1)
      if (lo >= 0xdc00 && lo <= 0xdfff) {
        cp = ((cp - 0xd800) << 10) + (lo - 0xdc00) + 0x10000
        i++
      }
    }
    if (cp < 0x80) {
      bytes.push(cp)
    } else if (cp < 0x800) {
      bytes.push(0xc0 | (cp >> 6), 0x80 | (cp & 0x3f))
    } else if (cp < 0x10000) {
      bytes.push(0xe0 | (cp >> 12), 0x80 | ((cp >> 6) & 0x3f), 0x80 | (cp & 0x3f))
    } else {
      bytes.push(
        0xf0 | (cp >> 18),
        0x80 | ((cp >> 12) & 0x3f),
        0x80 | ((cp >> 6) & 0x3f),
        0x80 | (cp & 0x3f),
      )
    }
  }
  return new Uint8Array(bytes)
}

function decodeUtf8(bytes) {
  const chars = []
  for (let i = 0; i < bytes.length; ) {
    const b = bytes[i]
    let cp
    if (b < 0x80) {
      cp = b
      i += 1
    } else if (b >= 0xc0 && b < 0xe0) {
      cp = ((b & 0x1f) << 6) | (bytes[i + 1] & 0x3f)
      i += 2
    } else if (b >= 0xe0 && b < 0xf0) {
      cp = ((b & 0x0f) << 12) | ((bytes[i + 1] & 0x3f) << 6) | (bytes[i + 2] & 0x3f)
      i += 3
    } else {
      cp =
        ((b & 0x07) << 18) |
        ((bytes[i + 1] & 0x3f) << 12) |
        ((bytes[i + 2] & 0x3f) << 6) |
        (bytes[i + 3] & 0x3f)
      i += 4
    }
    if (cp > 0xffff) {
      cp -= 0x10000
      chars.push(0xd800 + (cp >> 10), 0xdc00 + (cp & 0x3ff))
    } else {
      chars.push(cp)
    }
  }
  return charsToString(chars)
}

function decodeUtf16le(bytes) {
  const chars = []
  for (let i = 0; i + 1 < bytes.length; i += 2) chars.push(bytes[i] | (bytes[i + 1] << 8))
  return charsToString(chars)
}

// Everything we store starts with an ASCII character (`[`, `{`, a digit), so in
// UTF-16LE the second byte is the zero high byte of that char. No UTF-8 text can
// have a NUL there.
function isUtf16le(bytes) {
  return bytes.length >= 2 && bytes[0] !== 0 && bytes[1] === 0
}

function ab2str(buf) {
  const bytes = new Uint8Array(buf)
  return isUtf16le(bytes) ? decodeUtf16le(bytes) : decodeUtf8(bytes)
}

function str2ab(str) {
  return encodeUtf8(str)
}

/**
 * Get metadata of a file.
 * @param {} filename
 * @returns
 */
export function statSync(filename) {
  // logger.log('statSync',filename)
  //获取文件信息
  const [fs_stat, err] = hmFS.stat(filename)
  // logger.log('res',fs_stat, err)
  if (err == 0) {
    // logger.log('fs--->size:', fs_stat.size)
    return fs_stat
  } else {
    // logger.log('fs--->err:', err)
    return null
  }
}

/**
 * Write data to a file in a single operation. If a file with that name already exists, it is overwritten; otherwise, a new file is created.
 * @param {*} filename
 * @param {*} data
 * @param {*} options
 */
export function writeFileSync(filename, data, options) {
  // logger.log('writeFileSync begin -->', filename)

  const source_buf = str2ab(data)

  //打开/创建文件
  const file = hmFS.open(filename, hmFS.O_CREAT | hmFS.O_RDWR | hmFS.O_TRUNC)
  // logger.log('writeFileSync file open success -->', file)
  //定位到文件开始位置
  hmFS.seek(file, 0, hmFS.SEEK_SET)
  //写入buffer
  hmFS.write(file, source_buf.buffer, 0, source_buf.length)
  //关闭文件
  hmFS.close(file)
  // logger.log('writeFileSync success -->', filename)
}

/**
 * Read an entire file into a buffer in a single operation.
 * @param {*} filename
 * @param {*} options
 * @returns
 */
export function readFileSync(filename, options) {
  // logger.log('readFileSync fiename:', filename)

  const fs_stat = statSync(filename)
  if (!fs_stat) return undefined

  const destination_buf = new Uint8Array(fs_stat.size)
  //打开/创建文件
  const file = hmFS.open(filename, hmFS.O_RDONLY)
  //定位到文件开始位置
  hmFS.seek(file, 0, hmFS.SEEK_SET)
  //读取buffer
  hmFS.read(file, destination_buf.buffer, 0, fs_stat.size)
  //关闭文件
  hmFS.close(file)

  const content = ab2str(destination_buf.buffer)
  //读取结果打印
  // logger.log('readFileSync', content)
  return content
}

/**
 * Delete a file.
 * @param {*} filename
 */
export function unlinkSync(filename) {
  // logger.log('unlinkSync begin -->', filename)
  const result = hmFS.remove(filename)
  // logger.log('unlinkSync result -->', result)
  return result
}

/**
 * Rename a file.
 * @param {*} filename
 */
export function renameSync(oldFilename, newFilename) {
  // logger.log('renameSync begin -->', filename)
  hmFS.rename(oldFilename, newFilename)
  // logger.log('renameSync success -->', filename)
}

/**
 * Synchronously creates a directory.
 * @param {*} path
 * @param {*} options
 */
export function mkdirSync(path, options) {
  // logger.log('mkdirSync begin -->', path)
  hmFS.mkdir(path)
  // logger.log('mkdirSync success -->', path)
}

/**
 * Reads the contents of the directory.
 * @param {*} path
 * @param {*} options
 */
export function readdirSync(path, options) {
  // logger.log('readdirSync begin -->', path)
  hmFS.readdirSync(path)
  // logger.log('readdirSync success -->', path)
}

/**
 * Just to test the fs module
 */
export function test(fileName, dataString) {
  // logger.log('saveData begin')

  writeFileSync(fileName, dataString)

  // logger.log('fs_writeFileSync -> ', dataString)

  const content = readFileSync(fileName)

  // logger.log('fs_readFileSync -> ', content)
}
