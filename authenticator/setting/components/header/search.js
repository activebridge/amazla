import { initSearch } from '../../libs/search.js'
import { store } from '../../store.js'

const STYLE = {
  flex: 1,
  padding: '10px 14px',
  border: 'none',
  borderRadius: '12px',
  fontSize: '16px',
  outline: 'none',
  cursor: 'text',
  display: 'flex',
  flexDirection: 'row',
  alignItems: 'center',
  gap: '8px',
  minWidth: '0',
  boxSizing: 'border-box',
  background: '#1D1E1F',
  boxShadow: 'inset 3px 3px 6px #0d0d0d, inset -3px -3px 6px #272727',
  position: 'relative',
}

const ICON = {
  fontSize: '14px',
}

const PLACEHOLDER = {
  color: '#6e7377',
  flex: 1,
  lineHeight: '20px',
}

const COUNT = {
  fontSize: '12px',
  color: '#6e7377',
  margin: '0 22px 0 4px',
}

export const Search = () => {
  const count = store.accounts.all.length

  return View({ style: STYLE, onClick: initSearch }, [
    Text({ style: ICON }, '🔍'),
    Text({ style: PLACEHOLDER }, 'Search...'),
    count > 0 && Text({ style: COUNT }, count.toString()),
  ])
}
