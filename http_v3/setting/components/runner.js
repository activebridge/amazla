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

export const Runner = ({ title, url, method, headers, body, json, successKey, errorKey }, store) => {
  const clearResult = () => store.result = null
  const extract = (response, key) => {
    return key.split('.').reduce((value, key) => { return value?.[key] }, response)
  }

  const onClick = async () => {
    try {
      const response = await fetch(url, {
        method,
        // headers: Object.fromEntries(headers.split('\n').map(line => line.split('=').map(s => s.trim()))),
        body,
      })
      const label = response.ok ? '✅ ' : '❌ '
      const key = response.ok ? successKey : errorKey
      if (json) {
        console.log('Parsing JSON response')
        const res = extract(await response.json(), key)
        console.log(res)
        store.result = truncate(`${label} ${res}`)
      } else {
        store.result = truncate(`${label} ${await response.text()}`)
      }
    } catch (error) {
      store.result = `Fetch Error. Verify you entered correct data: ${JSON.stringify(error)}`
    } finally {
      setTimeout(clearResult, 2000)
    }
  }

  const label = `▶️ Test ${title}`

  return View({}, [
    Button({ label, style, onClick }),
  ])
}
