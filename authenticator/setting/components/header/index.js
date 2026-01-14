import { Search } from './search.js'
import { HelpButton } from './help_button.js'
import { AddButton } from './add_button.js'

const STYLE = {
  padding: '16px',
  background: '#1D1E1F',
  display: 'flex',
  flexDirection: 'row',
  alignItems: 'center',
  gap: '12px',
  boxSizing: 'border-box',
  width: '100%',
  minWidth: '0',
  boxShadow: '0 4px 8px #0d0d0d',
}

export const Header = () => {
  return View({ style: STYLE }, [
    Search(),
    AddButton(),
    HelpButton(),
  ])
}
