import { showToast, createModal, MODAL_CONFIRM } from '@zos/interaction'
import { notify } from '@zos/notification'
import { exit, home } from '@zos/router'
import { Vibrator, VIBRATOR_SCENE_NOTIFICATION, VIBRATOR_SCENE_DURATION, } from '@zos/sensor'

const vibrator = new Vibrator()

export const response = (result, { config: { output, exit: close } }, widget = false) => {
  if (close && result.success) setTimeout(home, 2000)
  if (output == 'alert' && !widget) {
    const alert = createModal({
      content: result.status,
      text: result.body,
      src: 'alert_icon.png',
      show: true,
      okButton: 'x.png',
      onClick: () => {
      }
      // autoHide: true,
    })
    return
  }
  if (output == 'notification') return notice(result)
  showToast({ content: result.body })
  const scene = result.success ? VIBRATOR_SCENE_NOTIFICATION : VIBRATOR_SCENE_DURATION
  vibrator.setMode(scene)
  vibrator.start()
}

const notice = result => {
  notify({
    title: `${result.status}`,
    content: result.body,
    actions: [],
  })
}
