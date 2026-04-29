const STYLE = {
  fontSize: '28px',
  backgroundImage: 'linear-gradient(92deg, #FCA5A5 0%, #F472B6 28%, #A78BFA 58%, #60A5FA 100%)',
  WebkitBackgroundClip: 'text',
  backgroundClip: 'text',
  WebkitTextFillColor: 'transparent',
  color: 'transparent',
  textShadow: '0 2px 12px rgba(0, 0, 0, 0.4)',
  fontWeight: '700',
  marginBottom: '4px',
  textAlign: 'center',
}

export const H2 = (text) => Text({ style: STYLE }, text)
