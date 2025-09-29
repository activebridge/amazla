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

export const Runner = ({ title, url, method, headers, body, successKey, errorKey }, store) => {
  const onClick = async () => {
    const response = await fetch(url, {
      method,
      // headers: Object.fromEntries(headers.split('\n').map(line => line.split('=').map(s => s.trim()))),
      body,
    })
    store.result = await response.text()
    setTimeout(() => {
      store.result = null
    }, 2000)
  }

  const label = `▶️ Test Endpoint ${title}`
  console.log(store.result)

  return View({}, [
    Button({ label, style, onClick }),
  ])
}
