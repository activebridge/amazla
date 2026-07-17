export const BUTTON_ACTION_OPTIONS = [
  { value: 'lockUnlock', label: 'Lock/Unlock' },
  { value: 'frunk', label: 'Frunk' },
  { value: 'trunk', label: 'Trunk' },
]

// Dispatches the configured watch-button action to handlers used by the main page.
export const runConfiguredButtonAction = (action, { locked, onLock, onUnlock, onFrunk, onTrunk }) => {
  switch (action) {
    case 'frunk':
      onFrunk()
      return
    case 'trunk':
      onTrunk()
      return
    default:
      locked ? onUnlock() : onLock()
  }
}

