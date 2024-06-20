import { CLIENT_ID, CLIENT_SECRET } from '../../secrets'
import { xhr, store } from './utils'

const URL = 'https://auth.tesla.com/oauth2/v3/token'
const HEADERS = {
  'Content-Type': 'application/x-www-form-urlencoded',
}

const API_URL = 'https://fleet-api.prd.na.vn.cloud.tesla.com'
const EU_API_URL = 'https://fleet-api.prd.eu.vn.cloud.tesla.com'

const BODY = {
  get token() {
     return new URLSearchParams({
      'client_id': CLIENT_ID,
      'client_secret': CLIENT_SECRET,
      'redirect_uri': 'https://zepp-os.zepp.com/app-settings/redirect.html',
      'code': store.code,
      'audience': store.eu ? EU_API_URL : API_URL,
      'grant_type': 'authorization_code',
    }).toString()
  },

  get refresh() {
     return new URLSearchParams({
      'client_id': CLIENT_ID,
      'refresh_token': store.refresh_token,
      'grant_type': 'refresh_token',
    }).toString()
  }
}

const { removeItem, setItem } = store

const fetchToken = async () => {
  removeItem('access_token')
  removeItem('refresh_token')
  const { access_token, refresh_token } = await xhr(URL, 'POST', HEADERS, BODY.token)
  setItem('access_token', access_token)
  setItem('refresh_token', refresh_token)
  removeItem('code')
}

const refreshToken = async () => {
  const { access_token, refresh_token } = await xhr(URL, 'POST', HEADERS, BODY.refresh)
  setItem('access_token', access_token)
  setItem('refresh_token', refresh_token)
}

const Auth = {
  fetchToken: fetchToken,
  refreshToken: refreshToken,
}

export default Auth
