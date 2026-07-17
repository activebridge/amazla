// Shared status-key mapper used by page and widget to avoid drift.
// Returns one of:
// unpaired | unlicensed | authorized | online | checking | failed | offline
export const getConnectionStatusKey = ({ isPaired = true, isLicensed = true, connection, authorized = false }) => {
  if (!isPaired) return 'unpaired'
  if (!isLicensed) return 'unlicensed'
  if (connection.status === 'online') return authorized ? 'authorized' : 'online'
  if (connection.status === 'checking') return 'checking'
  return connection.error ? 'failed' : 'offline'
}

