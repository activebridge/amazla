import { showToast, createModal, MODAL_CONFIRM } from '@zos/interaction'
import { notify } from '@zos/notification'
import { exit } from '@zos/router'

export const response = (result, { config: { output, exit: close } }) => {
  if (close && result.success) setTimeout(exit, 2000)
  if (output == 'alert') {
    const alert = createModal({
      content: result.body,
      text: result.body,
      src: 'alert_icon.png',
      show: true,
      cancelButton: '',
      onClick: () => {
      }
      // autoHide: true,
    })
    return
  }
  if (output == 'notification') return notice(result.body)
  showToast({ content: result.body })
}

const notice = content => {
  notify({
    title: 'HTTP',
    content,
    actions: [],
  })
}
