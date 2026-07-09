import { img } from './../../../pages/ui.js'

// Model Y top-view image layers for the current lock / door / closure state.
// Shared by the main page (page/index.js) and the secondary widget so the car
// visual can never diverge between them. `state` is any object carrying the flat
// VCSEC booleans — the live Tesla singleton on the page, or a cached-state
// stand-in in the widget (store.lastVehicleState). The caller owns UI.reset() and
// all surrounding chrome (status label, control buttons, connecting veil).
export function CarImages(state) {
  state.locked && img({ w: 352, h: 460, src: 'Y_Top_View_Dark.png' })
  !state.locked && img({ w: 352, h: 460, src: 'Y_Top_View.png' })
  state.frunkOpen && img({ w: 352, h: 460, src: 'Y_Frunk.png' })
  state.trunkOpen && img({ w: 352, h: 460, src: 'Y_Trunk.png' })
  state.pf && img({ w: 352, h: 460, src: 'Y_Right_Front_Door.png' })
  state.pr && img({ w: 352, h: 460, src: 'Y_Right_Back_Door.png' })
  state.df && img({ w: 352, h: 460, src: 'Y_Left_Front_Door.png' })
  state.dr && img({ w: 352, h: 460, src: 'Y_Left_Back_Door.png' })
}
