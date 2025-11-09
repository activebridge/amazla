const truncate = (text, len = 200) => (text.length > len) ? `${text.substring(0, len)}…` : text

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

const extract = (response, key) => {
  if (!key) return response
  return key.split('.').reduce((value, key) => { return value?.[key] }, response)
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
    const contentType = response.headers['content-type']
    const isJSON = contentType && contentType.includes('application/json')
    const body = (action.json && isJSON) ? extract(await response.json(), key) : await response.text()
    return { body: truncate(body), status: response.status, success: response.ok }
  } catch (error) {
    return { body: `Invalid request: ${error}`, status: 0, success: false }
  }
}
