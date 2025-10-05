import { BUTTON } from '../styles.js'

const style = {
  width: '100%',
  borderRadius: '12px',
  aspectRatio: 'auto',
  height: '48px',
  fontSize: '16px',
  fontWeight: '500',
  padding: '12px 20px',
  background: 'rgba(34, 197, 94, 0.2)',
  backdropFilter: 'blur(20px)',
  border: '1px solid rgba(34, 197, 94, 0.4)',
  color: 'white',
  cursor: 'pointer',
  boxShadow: '0 4px 16px rgba(34, 197, 94, 0.2)',
  transition: 'all 0.2s ease',
  marginTop: '10px',
}

const truncate = (text, len = 100) => (text.length > len) ? `${text.substring(0, len)}…` : text

const parse = str => {
  // try {
    const matches = [...str.matchAll(/^(?<key>.*)=(?<value>.*)$/gm)].reduce((object, { key, value }) => {
      object[key.trim()] = value.trim()
  }, {})
    console.log(matches)
    return Object.fromEntries(matches.map((key, value) => [key, value]))
  // } catch(error) {
    // return { Error: error }
  // }
}

export const Runner = ({ title, url, method, headers, body, json, successKey, errorKey }, store) => {
  const extract = (response, key) => {
    if (!key) return response
    return key.split('.').reduce((value, key) => { return value?.[key] }, response)
  }

  const onClick = async () => {
    console.log(parse(headers))
    try {
      const response = await fetch(url, {
        method,
        headers: parse(headers),
        body: null,
      })
      const label = response.ok ? '✅' : '❌'
      const key = response.ok ? successKey : errorKey
      const res = JSON.stringify(json ? extract(await response.json(), key) : await response.text())
      store.result = truncate(`${label} ${response.status} ${res}`)
    } catch (error) {
      store.result = `❌ Invalid request details ${error}`
    }
  }

  const label = `▶️ Test ${title}`

  return View({}, [
    Button({ label, style, onClick }),
  ])
}
