import { generateTOTP, getTimeRemaining } from '../../libs/totp'
import { Handler } from './handler.js'
import { Body } from './body.js'
import { Timer } from './timer.js'
import { DeleteButton } from './delete_button.js'

const STYLE = {
  background: 'black',
  position: 'relative',
  overflow: 'hidden',
  scrollSnapAlign: 'start',
  maxHeight: '200px',
  opacity: 1,
  marginBottom: '12px',
  borderRadius: '16px',
  boxShadow: '4px 4px 8px #0a0a0a, -2px -2px 6px #1a1a1a',
}

const BODY_WRAPPER = {
  display: 'flex',
  flexDirection: 'row',
  overflowX: 'auto',
  overflowY: 'hidden',
  scrollSnapType: 'x mandatory',
  scrollbarWidth: 'none',
  alignItems: 'stretch',
  WebkitOverflowScrolling: 'touch',
  overscrollBehaviorX: 'none',
  width: '100%',
}

const BODY_CONTENT = {
  display: 'flex',
  flexDirection: 'row',
  alignItems: 'center',
  gap: '12px',
  flexShrink: 0,
  width: '100%',
  paddingLeft: '20px',
  paddingRight: '20px',
  boxSizing: 'border-box',
  scrollSnapAlign: 'start',
  paddingTop: '16px',
  paddingBottom: '16px',
}

export const Card = (account) => {
  const code = generateTOTP(account.secret, account.digits)
  const remaining = getTimeRemaining()
  const isLow = remaining <= 5
  const degrees = (remaining / 30) * 360

  return View({ style: STYLE }, [
    View({ style: BODY_WRAPPER }, [
      View({ style: BODY_CONTENT }, [
        Handler(),
        Body(account, code, isLow),
        Timer(degrees, isLow),
      ]),
      DeleteButton(account),
    ]),
  ])
}
