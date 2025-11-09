import { BUTTON } from '../styles.js'

const style = {
  width: '100%',
  borderRadius: '12px',
  aspectRatio: 'auto',
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
  wordBreak: 'break-all',
}

export const Runner = ({ title }, index, store) => {
  const onClick = async () => {
    store.result = '⏳ Running…'
    store.test = index
  }

  const label = `▶️ Test ${title}`

  return View({}, [
    Button({ label, style, onClick }),
  ])
}
