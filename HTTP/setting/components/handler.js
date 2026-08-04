import { HANDLE } from '../styles.js'

// libs/sortable.js finds rows and handles by this '≡' text — keep the literal.
export const Handler = () => {
  return View({ style: HANDLE }, [
    Text({}, '≡'),
  ])
}
