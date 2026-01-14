import { Cards } from './cards.js'
import { store } from '../store.js'

const STYLE = {
  flex: 1,
  overflowY: 'auto',
  scrollSnapType: 'y proximity',
  background: '#1D1E1F',
}

export const Body = () => {
  return View({ style: STYLE }, [
    Cards(store.accounts),

    Toast({
      message: store.status,
      visible: !!store.status,
      duration: 3000,
      vertical: 'bottom',
    }),
  ])
}
