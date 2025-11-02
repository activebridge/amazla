import { AsyncStorage } from "@silver-zepp/easy-storage"
import { showToast } from '@zos/interaction'

export const refreshSettings = (page) => {
  AsyncStorage.ReadJson('settings.json', (error, result) => {
    if (result) page.state.settings = result
    page.render()
    page.request({ method: 'SETTINGS' }).then(({ result }) => {
      if (result) page.state.settings = result
      page.render()
      AsyncStorage.WriteJson('settings.json', result)
      console.log('config saved!')
    }).catch(error => console.log('request error', error))
  })
}
