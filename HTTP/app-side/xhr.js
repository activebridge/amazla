// An extracted value is whatever sat at that key — a number, an object, or
// undefined when the path misses. Only a string has .length, so anything else
// used to throw here and surface as "Invalid request: TypeError".
const truncate = (value, len = 200) => {
  const text = typeof value === 'string' ? value : JSON.stringify(value)
  if (text === undefined) return String(value)
  return text.length > len ? `${text.substring(0, len)}…` : text
}

const parse = str => {
  try {
    const matches = [...str.matchAll(/^(?<key>.*)=(?<value>.*)$/gm)]
    const pairs = matches.reduce((object, { groups: { key, value } }) => {
      object[key] = value
      return object
    }, {})
    return pairs
  } catch(error) {
    return { Error: error }
  }
}

// Ticking "Parse JSON response" is the user saying this body is JSON — which is
// the only reliable signal there is. Servers are careless with content-type:
// error bodies in particular come back as text/plain while being JSON, and
// sniffing the header left the key unapplied on exactly the responses it was
// set for. If it turns out not to be JSON, the raw text is still the best
// answer available.
const extract = (text, key) => {
  let json
  try {
    json = JSON.parse(text)
  } catch (error) {
    return text
  }
  if (!key) return json
  return key.split('.').reduce((value, step) => value?.[step], json)
}

export const xhr = async (action) => {
  try {
    const response = await fetch({
      url: action.url,
      method: action.method,
      headers: parse(action.headers),
      body: ['GET', undefined].includes(action.method) ? undefined : JSON.stringify(parse(action.body)),
    })

    const key = response.ok ? action.successKey : action.errorKey
    const text = await response.text()
    const body = action.json ? extract(text, key) : text
    return { body: truncate(body), status: response.status, success: response.ok }
  } catch (error) {
    return { body: `Invalid request: ${error}`, status: 0, success: false }
  }
}
