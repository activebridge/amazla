const style = {
  fontSize: '0.85rem',
  color: 'white',
  lineHeight: '1.4',
  width: '100%',
  display: 'block',
  fontFamily: 'monospace',
  background: 'rgba(0, 0, 0, 0.35)',
  padding: '8px 12px',
  borderRadius: '8px',
  border: '1px solid rgba(255, 255, 255, 0.15)',
  whiteSpace: 'pre-wrap',
  textShadow: '0 1px 2px rgba(0, 0, 0, 0.5)',
}

export const Code = (text) => Text({ style }, text)
