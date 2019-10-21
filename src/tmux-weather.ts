#!/usr/bin/env node

import 'core-js/library'
import { HTTP } from 'http-call'
import * as path from 'path'
import * as os from 'os'
import * as fs from 'fs-extra'
import * as execa from 'execa'
import * as notifier from 'node-notifier'

const configDir = path.join(os.homedir(), '.config', 'tmux-weather')
const cacheDir = path.join(os.homedir(), process.platform === 'darwin' ? 'Library/Caches' : '.cache', 'tmux-weather')
const debug = require('debug')('tmux-weather')

fs.mkdirpSync(cacheDir)
fs.mkdirpSync(configDir)

function logError(err: Error) {
  let p = path.join(cacheDir, 'weather.log')
  let log = fs.createWriteStream(p)
  log.write(new Date() + '\n')
  log.write(err.stack + '\n')
  console.log(`#[fg=red]${p.replace(os.homedir(), '~')}`)
  try {
    fs.removeSync(path.join(cacheDir, 'weather.json'))
  } catch (err) {
    console.error(err)
    notify(err.stack)
  }
}

function notify(msg?: string) {
  if (!notifier || !msg) return
  notifier.notify({
    title: 'tmux-weather',
    message: msg,
  })
}

function submitError(err: Error) {
  console.error(err.stack)
  notify(err.stack)
  logError(err)
}

function errorAndExit(err: Error) {
  try {
    submitError(err)
  } catch (err) {
    console.error(err.stack)
    process.exit(1)
  }
}

process.on('uncaughtException', errorAndExit)

type LatLon = {
  latitude: number
  longitude: number
}

interface IWeatherResponse {
  daily: {
    summary: string
  }
  currently: {
    icon: string
    temperature: string
  }
}

const forecastIOApiKey = require(path.join(configDir, 'forecastio.json')).token

function cache<T>(
  key: string,
  fn: (...args: any[]) => Promise<T>,
  useCacheOnFail = false,
): (...args: any[]) => Promise<T> {
  return async (...args: any[]): Promise<any> => {
    let f = path.join(cacheDir, `${key}.json`)
    try {
      let fi = await fs.stat(f)
      if (fi && minutesAgo(20) < fi.mtime) {
        return await fs.readJSON(f)
      }
    } catch (err) {
      debug(err)
      submitError(err)
      await fs.remove(f)
    }
    try {
      let body = await fn(...args)
      await fs.outputJSON(f, body)
      return body
    } catch (err) {
      if (!useCacheOnFail) throw err
      return fs.readJSON(f)
    }
  }
}

function getIcon(weather: IWeatherResponse['currently']) {
  switch (weather.icon) {
    case 'clear-day':
      // TODO: add sunrise/sunset 🌇 🌅
      return '☀️'
    case 'clear-night':
      return '🌙'
    case 'sleet':
    case 'rain':
      return '☔'
    case 'snow':
      return '❄️'
    case 'wind':
      return '💨'
    case 'fog':
      return '🌁'
    case 'cloudy':
      return '☁️'
    case 'partly-cloudy-night':
    case 'partly-cloudy-day':
      return '⛅️'
    default:
      return weather.icon
  }
}

function temp(weather: IWeatherResponse['currently']) {
  let temp = parseInt(weather.temperature)
  let color
  if (temp < 40) color = 27
  else if (temp < 50) color = 39
  else if (temp < 60) color = 50
  else if (temp < 70) color = 220
  else if (temp < 80) color = 208
  else if (temp < 90) color = 202
  else color = 196
  return `#[fg=colour${color}]${temp}`
}

function minutesAgo(minutes: number) {
  let d = new Date()
  d.setMinutes(d.getMinutes() - minutes)
  return d
}

const getLatLon = cache(
  'latlon',
  async (): Promise<LatLon> => {
    debug('fetching lat/lon...')
    const { stdout } = await execa('latlon')
    return JSON.parse(stdout)
  },
  true,
)

const getWeather = cache('weather', async ({ latitude, longitude }: LatLon) => {
  // notify('fetching weather data')
  debug('fetching weather...')
  const { body } = await HTTP.get(`https://api.forecast.io/forecast/${forecastIOApiKey}/${latitude},${longitude}`)
  return body as IWeatherResponse
})

async function run() {
  await fs.mkdirp(cacheDir)

  const { latitude, longitude } = await getLatLon()
  debug('lat %o, lon: %o', latitude, longitude)
  const weather = await getWeather({ latitude, longitude })
  debug('got weather: %s', weather.daily.summary)
  console.log(`${getIcon(weather.currently)} ${temp(weather.currently)}`)
}
run().catch(errorAndExit)
