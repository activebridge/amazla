import { formatCode } from '../../libs/totp'

const CONTAINER = {
  flex: 1,
  minWidth: 0,
  overflow: 'hidden',
}

const NAME = {
  fontSize: '14px',
  color: '#9aa0a6',
  margin: '0 0 4px 0',
  overflow: 'hidden',
  textOverflow: 'ellipsis',
  whiteSpace: 'nowrap',
}

const codeStyle = (isLow) => ({
  fontSize: '32px',
  fontWeight: '400',
  color: isLow ? '#f28b82' : '#8ab4f8',
  letterSpacing: '2px',
  margin: '0',
  textShadow: `0 0 20px ${isLow ? 'rgba(242, 139, 130, 0.8)' : 'rgba(138, 180, 248, 0.8)'}`,
  cursor: 'pointer',
})

const copyCode = (e, code, account) => {
  const win = e?.nativeEvent?.view?.window
  const doc = win?.document
  if (!doc) return

  // Try modern clipboard API first, fallback to execCommand
  const copy = () => {
    if (win.navigator?.clipboard?.writeText) {
      return win.navigator.clipboard.writeText(code)
    }

    // Fallback: create textarea and use execCommand
    const textarea = doc.createElement('textarea')
    textarea.value = code
    textarea.style.position = 'fixed'
    textarea.style.left = '-9999px'
    doc.body.appendChild(textarea)
    textarea.select()
    doc.execCommand('copy')
    doc.body.removeChild(textarea)
    return Promise.resolve()
  }

  copy()
    .then(() => account.showToast('Code copied'))
    .catch(() => account.showToast('Failed to copy'))
}

export const Body = (account, code, isLow) => {
  return View({ style: CONTAINER }, [
    Text({ paragraph: true, style: NAME }, account.displayName),
    View({
      style: { cursor: 'pointer' },
      onClick: (e) => copyCode(e, code, account),
    }, [
      Text({ paragraph: true, style: codeStyle(isLow) }, formatCode(code)),
    ]),
  ])
}
