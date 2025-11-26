import { createModal, showToast } from '@zos/interaction'
import { notify } from '@zos/notification'
import { home } from '@zos/router'
import { VIBRATOR_SCENE_DURATION, VIBRATOR_SCENE_NOTIFICATION, Vibrator } from '@zos/sensor'

const vibrator = new Vibrator()

export const response = (result, { config: { output, exit: close, vibrate } }, widget = false) => {
  if (close && result.success) setTimeout(home, 2000)
  if (output === 'alert' && !widget) {
    const _alert = createModal({
      content: result.status,
      text: result.body,
      src: 'alert_icon.png',
      show: true,
      okButton: 'x.png',
      onClick: () => {},
      // autoHide: true,
    })
    return
  }
  if (output === 'notification') return notice(result)
  showToast({ content: result.body })
  if (!vibrate) return
  const scene = result.success ? VIBRATOR_SCENE_NOTIFICATION : VIBRATOR_SCENE_DURATION
  vibrator.setMode(scene)
  vibrator.start()
}

const notice = (result) => {
  notify({
    title: `${result.status}`,
    content: result.body,
    actions: [],
  })
}
