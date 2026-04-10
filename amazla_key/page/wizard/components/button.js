import { button, width, height } from '../../../../pages/ui.js'

// PrimaryButton renders a centered action button.
// y is an absolute pixel position (defaults to ~82% down the screen).
export const PrimaryButton = ({ label, onClick, y }) => {
  const w = 220
  const h = 56
  const yPos = y !== undefined ? y : (height * 0.82 | 0)
  return button({
    centered: false,
    x: ((width - w) / 2) | 0,
    y: yPos,
    w,
    h,
    text: label,
    text_size: 20,
    color: 0xffffff,
    normal_color: 0xcc2222,
    press_color: 0x991111,
    radius: 28,
    click_func: onClick,
  })
}
