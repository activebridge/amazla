import { INPUT_STYLE, INPUT_LABEL_STYLE } from '../styles.js'

export const Input = ({ label, placeholder, value, onChange, multiline = false, rows = 1 }) =>
  TextInput({
    label,
    placeholder,
    value,
    multiline,
    rows,
    subStyle: INPUT_STYLE,
    labelStyle: INPUT_LABEL_STYLE,
    onChange,
  })