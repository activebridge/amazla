import { openCardDialog } from '../../libs/editDialog.js'

const WRAPPER = {
  padding: '8px',
  background: 'transparent',
  border: 'none',
  position: 'relative',
}

const ADD_BUTTON_STYLE = {
  background: 'linear-gradient(145deg, #1c7efa, #1865c5)',
  border: 'none',
  borderRadius: '50%',
  width: '36px',
  height: '36px',
  minWidth: '36px',
  minHeight: '36px',
  padding: '0',
  fontSize: '24px',
  color: 'white',
  fontWeight: '300',
  lineHeight: '36px',
  textAlign: 'center',
  cursor: 'pointer',
  boxSizing: 'border-box',
  paddingBottom: '2px',
  boxShadow: '3px 3px 6px #0d0d0d, -2px -2px 5px #272727',
}

export const AddButton = () => {
  return View({ style: WRAPPER }, [
    Button({
      label: '+',
      style: ADD_BUTTON_STYLE,
      onClick: (e) => openCardDialog(e, null),
    }),
  ])
}
