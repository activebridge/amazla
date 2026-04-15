/**
 * Pre-built vehicle state patches for CarSimulator tests.
 *
 * Usage:
 *   import { lockedCar, unlockedCar, allDoorsOpen } from './helpers/scenarios.js'
 *   sim.setState(unlockedCar())
 */

const allClosed = {
  frontDriverDoor:    0,
  frontPassengerDoor: 0,
  rearDriverDoor:     0,
  rearPassengerDoor:  0,
  rearTrunk:          0,
  frontTrunk:         0,
  chargePort:         0,
}

export const lockedCar    = (extra = {}) => ({ locked: true,  ...allClosed, sleepStatus: 0, userPresence: 0, ...extra })
export const unlockedCar  = (extra = {}) => ({ locked: false, ...allClosed, sleepStatus: 0, userPresence: 0, ...extra })
export const trunkOpen    = (extra = {}) => ({ ...unlockedCar(), rearTrunk:   1, ...extra })
export const frunkOpen    = (extra = {}) => ({ ...unlockedCar(), frontTrunk:  1, ...extra })
export const allDoorsOpen = (extra = {}) => ({
  locked:             false,
  frontDriverDoor:    1,
  frontPassengerDoor: 1,
  rearDriverDoor:     1,
  rearPassengerDoor:  1,
  rearTrunk:          0,
  frontTrunk:         0,
  chargePort:         0,
  sleepStatus:        0,
  userPresence:       0,
  ...extra,
})
export const sleeping = (extra = {}) => ({ ...lockedCar(), sleepStatus: 1, ...extra })
export const userPresent = (extra = {}) => ({ ...unlockedCar(), userPresence: 1, ...extra })
