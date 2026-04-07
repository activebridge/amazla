import { Header } from './components/header.js'
import { Body } from './components/body.js'
import { Footer } from './components/footer.js'
import { GLOBAL, COLORS } from './styles.js'

const STYLES = {
  root: {
    ...GLOBAL.root,
    background: COLORS.background,
  },
  scrollWrapper: {
    ...GLOBAL.scrollContainer,
  },
  contentWrapper: {
    maxWidth: '100%',
    margin: '0 auto',
  },
}

export const AppSettingsPage = () => {
  return View({ style: STYLES.root }, [
    View({ style: STYLES.scrollWrapper }, [
      View({ style: STYLES.contentWrapper }, [
        Header(),
        Body(),
        Footer(),
      ]),
    ]),
  ])
}
