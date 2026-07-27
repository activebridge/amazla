import { Cards } from './cards.js'
import { store } from '../store.js'

const STYLE = {
  flex: 1,
  overflowY: 'auto',
  scrollSnapType: 'y proximity',
  background: 'linear-gradient(180deg, transparent 50%, black)',
  // Its own stacking context, below the header's z-index 2. Without it every
  // card is a loose position: relative element in the root's paint order, and
  // the delete buttons punched through the help dialog, which lives inside the
  // header. Everything in here is now clamped under anything the header paints.
  position: 'relative',
  zIndex: 0,
}

export const Body = () => {
  return View({ style: STYLE }, [
    Cards(store.cards),

    Toast({
      message: store.status,
      visible: !!store.status,
      duration: 3000,
      vertical: 'bottom',
    }),
  ])
}
