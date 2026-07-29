import { isRound } from './../../pages/ui.js'
import * as round from './layout-round.js'
import * as square from './layout-square.js'

// zosLoader's `.[pf].layout.js` split needs screen-type platform entries, which a
// v1-config build (one common target, every device) doesn't have — so the shape
// is picked here at runtime instead. Both modules expose the same three functions.
const impl = isRound ? round : square

export const Layout = (accounts) => impl.Layout(accounts)
export const refreshCodes = () => impl.refreshCodes()
export const updateAccounts = (accounts) => impl.updateAccounts(accounts)
