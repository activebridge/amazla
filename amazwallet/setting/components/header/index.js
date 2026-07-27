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
  // Cards are position: relative, so they used to stack over the header and
  // swallow its shadow — the list met the header on a hard cut. Positioning the
  // header puts it back on top: hairline edge, then the falloff.
  position: 'relative',
  zIndex: 2,
  boxShadow: '0 1px 0 rgba(255, 255, 255, 0.05), 0 6px 12px rgba(0, 0, 0, 0.6)',
}

export const Header = () => {
  return View({ style: STYLE }, [
    Search(),
    AddButton(),
    HelpButton(),
  ])
}
