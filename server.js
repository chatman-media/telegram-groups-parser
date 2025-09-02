// @ts-nocheck
import express from 'express'
import cors from 'cors'
import { WebSocketServer } from 'ws'
import { createServer } from 'http'
import fs from 'fs'
import { spawn } from 'child_process'
import path from 'path'

const app = express()
const server = createServer(app)
const wss = new WebSocketServer({ server })

app.use(cors())
app.use(express.json())

let currentProcess = null
let wsClients = new Set()

// WebSocket connections
wss.on('connection', (ws) => {
  wsClients.add(ws)
  console.log('WebSocket client connected')

  // Отправляем текущую статистику новому клиенту
  const stats = getCurrentStats()
  ws.send(JSON.stringify({ type: 'stats', data: stats }))

  ws.on('close', () => {
    wsClients.delete(ws)
    console.log('WebSocket client disconnected')
  })
})

// Периодическое обновление статистики (каждые 5 секунд)
setInterval(() => {
  if (wsClients.size > 0) {
    broadcastStats()
  }
}, 5000)

// Broadcast message to all WebSocket clients
function broadcast(message) {
  wsClients.forEach(client => {
    if (client.readyState === 1) { // WebSocket.OPEN
      client.send(JSON.stringify(message))
    }
  })
}

// Get current statistics
function getCurrentStats() {
  try {
    const stats = {}

    // Queries stats
    if (fs.existsSync('queries.txt')) {
      const queries = fs.readFileSync('queries.txt', 'utf8').split('\n').filter(Boolean)
      stats.queries = { total: queries.length }

      const processed = loadJSON('processed_queries.json', [])
      stats.queries.processed = processed.length
    }

    // Cities and words stats
    if (fs.existsSync('cities.txt')) {
      const cities = fs.readFileSync('cities.txt', 'utf8').split('\n').filter(Boolean)
      stats.cities = { count: cities.length }
    }

    if (fs.existsSync('words.txt')) {
      const words = fs.readFileSync('words.txt', 'utf8').split('\n').filter(Boolean)
      stats.words = { count: words.length }
    }

    // Calculate combinations for cities mode
    if (stats.cities && stats.words) {
      const config = loadJSON('config.json', {})
      const twoLevelConfig = config.search?.twoLevelParsing
      
      if (twoLevelConfig?.enabled) {
        // Двухуровневый парсинг
        const firstLevelCombinations = stats.cities.count * Math.min(stats.words.count, twoLevelConfig.firstLevel.maxWords)
        const secondLevelCombinations = twoLevelConfig.secondLevel.useAllWords ? 
          stats.cities.count * stats.words.count : 0
        
        stats.combinations = {
          total: firstLevelCombinations + secondLevelCombinations,
          processed: stats.queries ? stats.queries.processed : 0,
          twoLevel: {
            enabled: true,
            firstLevel: {
              total: firstLevelCombinations,
              limit: twoLevelConfig.firstLevel.limitPerQuery,
              maxWords: twoLevelConfig.firstLevel.maxWords
            },
            secondLevel: {
              total: secondLevelCombinations,
              limit: twoLevelConfig.secondLevel.limitPerQuery,
              useAllWords: twoLevelConfig.secondLevel.useAllWords
            }
          }
        }
      } else {
        // Обычный режим
        stats.combinations = {
          total: stats.cities.count * stats.words.count,
          processed: stats.queries ? stats.queries.processed : 0,
          twoLevel: { enabled: false }
        }
      }
    }

    // Groups stats
    const groups = loadJSON('groups.json', [])
    if (Array.isArray(groups)) {
      stats.groups = {
        total: groups.length,
        withParticipants: groups.filter(g => g.participants_count > 0).length
      }

      // Group types
      stats.groupTypes = {}
      groups.forEach(group => {
        const type = group.type || 'unknown'
        stats.groupTypes[type] = (stats.groupTypes[type] || 0) + 1
      })

      // Top groups
      stats.topGroups = groups
        .filter(g => g.participants_count > 0)
        .sort((a, b) => (b.participants_count || 0) - (a.participants_count || 0))
        .slice(0, 10)
    }

    // Extracted IDs stats
    if (fs.existsSync('group_ids.txt')) {
      const ids = fs.readFileSync('group_ids.txt', 'utf8').split('\n').filter(Boolean)
      stats.extractedIds = { count: ids.length }
    }

    // File sizes
    stats.fileSizes = {}
    const fileList = [
      'queries.txt', 'cities.txt', 'words.txt', 'config.json',
      'groups.json', 'group_ids.txt', 'processed_queries.json'
    ]

    fileList.forEach(filename => {
      if (fs.existsSync(filename)) {
        stats.fileSizes[filename] = fs.statSync(filename).size
      }
    })

    return stats
  } catch (error) {
    console.error('Error getting stats:', error)
    return {}
  }
}

// Broadcast stats update
function broadcastStats() {
  const stats = getCurrentStats()
  broadcast({ type: 'stats', data: stats })
}

// Utility functions
function loadJSON(filePath, fallback = null) {
  try {
    if (!fs.existsSync(filePath)) return fallback
    return JSON.parse(fs.readFileSync(filePath, 'utf8'))
  } catch {
    return fallback
  }
}

function getFileStats(filePath) {
  try {
    if (!fs.existsSync(filePath)) return null
    const stats = fs.statSync(filePath)
    const content = fs.readFileSync(filePath, 'utf8')
    const lines = content.split('\n').filter(line => line.trim()).length

    return {
      size: stats.size,
      modified: stats.mtime,
      lines: lines
    }
  } catch {
    return null
  }
}

// API Routes

// Start parsing
app.post('/api/parse', (req, res) => {
  if (currentProcess) {
    return res.status(400).json({ error: 'Process already running' })
  }

  currentProcess = spawn('node', ['parse.js'], {
    stdio: ['pipe', 'pipe', 'pipe'],
    env: { ...process.env, FORCE_COLOR: '0' }
  })

  // Обновляем статистику каждые 2 секунды во время парсинга
  let statsUpdateInterval = setInterval(() => {
    if (currentProcess) {
      broadcastStats()
    }
  }, 2000)

  currentProcess.stdout.on('data', (data) => {
    const message = data.toString()
    broadcast({ type: 'log', message })
  })

  currentProcess.stderr.on('data', (data) => {
    const message = data.toString()
    broadcast({ type: 'log', message })
  })

  currentProcess.on('close', (code) => {
    clearInterval(statsUpdateInterval)
    broadcast({ type: 'log', message: `\n✅ Процесс завершен с кодом ${code}\n` })
    currentProcess = null
    // Обновляем статистику после завершения парсинга
    broadcastStats()
  })

  res.json({ message: 'Parsing started' })
})

// Start parsing with cities
app.post('/api/parse-cities', (req, res) => {
  if (currentProcess) {
    return res.status(400).json({ error: 'Process already running' })
  }

  currentProcess = spawn('node', ['parse.js', '--cities'], {
    stdio: ['pipe', 'pipe', 'pipe'],
    env: { ...process.env, FORCE_COLOR: '0' }
  })

  // Обновляем статистику каждые 2 секунды во время парсинга городов
  let statsUpdateInterval = setInterval(() => {
    if (currentProcess) {
      broadcastStats()
    }
  }, 2000)

  currentProcess.stdout.on('data', (data) => {
    const message = data.toString()
    broadcast({ type: 'log', message })
  })

  currentProcess.stderr.on('data', (data) => {
    const message = data.toString()
    broadcast({ type: 'log', message })
  })

  currentProcess.on('close', (code) => {
    clearInterval(statsUpdateInterval)
    broadcast({ type: 'log', message: `\n✅ Процесс завершен с кодом ${code}\n` })
    currentProcess = null
    // Обновляем статистику после завершения парсинга городов
    broadcastStats()
  })

  res.json({ message: 'Cities parsing started' })
})

// Stop current process
app.post('/api/stop', (req, res) => {
  if (currentProcess) {
    currentProcess.kill('SIGTERM')
    currentProcess = null
    broadcast({ type: 'log', message: '\n⏹️ Процесс остановлен пользователем\n' })
    // Обновляем статистику после остановки процесса
    broadcastStats()
    res.json({ message: 'Process stopped' })
  } else {
    res.status(400).json({ error: 'No process running' })
  }
})

// Reset progress
app.post('/api/reset-progress', (req, res) => {
  try {
    const processedFile = 'processed_queries.json'
    if (fs.existsSync(processedFile)) {
      fs.unlinkSync(processedFile)
      res.json({ message: `Прогресс сброшен. Удален файл: ${processedFile}` })
    } else {
      res.json({ message: 'Файл прогресса не найден, нечего сбрасывать.' })
    }
    // Обновляем статистику после сброса прогресса
    broadcastStats()
  } catch (error) {
    res.status(500).json({ error: error.message })
  }
})

// Extract IDs
app.post('/api/extract', (req, res) => {
  if (currentProcess) {
    return res.status(400).json({ error: 'Process already running' })
  }

  const { withUsernames, noFilter } = req.body
  const args = ['extract_ids.js']

  if (withUsernames) args.push('--with-usernames')
  if (noFilter) args.push('--no-filter')

  currentProcess = spawn('node', args, {
    stdio: ['pipe', 'pipe', 'pipe'],
    env: { ...process.env, FORCE_COLOR: '0' }
  })

  let output = ''

  // Обновляем статистику каждые 2 секунды во время извлечения ID
  let statsUpdateInterval = setInterval(() => {
    if (currentProcess) {
      broadcastStats()
    }
  }, 2000)

  currentProcess.stdout.on('data', (data) => {
    const message = data.toString()
    output += message
    broadcast({ type: 'log', message })
  })

  currentProcess.stderr.on('data', (data) => {
    const message = data.toString()
    output += message
    broadcast({ type: 'log', message })
  })

  currentProcess.on('close', (code) => {
    clearInterval(statsUpdateInterval)
    broadcast({ type: 'log', message: `\n✅ Извлечение завершено с кодом ${code}\n` })
    currentProcess = null

    // Обновляем статистику после извлечения
    broadcastStats()

    // Parse stats from output if available
    const stats = {}
    if (output.includes('Всего групп:')) {
      const totalMatch = output.match(/Всего групп: (\d+)/)
      const filteredMatch = output.match(/Отфильтровано: (\d+)/)
      const savedMatch = output.match(/Сохранено: (\d+)/)

      if (totalMatch) stats.total = parseInt(totalMatch[1])
      if (filteredMatch) stats.filtered = parseInt(filteredMatch[1])
      if (savedMatch) stats.saved = parseInt(savedMatch[1])
    }

    res.json({
      message: 'Extraction completed',
      stats: Object.keys(stats).length > 0 ? stats : null
    })
  })
})

// Get files list
app.get('/api/files', (req, res) => {
  const files = {}
  const fileList = [
    'queries.txt', 'cities.txt', 'words.txt', 'config.json',
    '.env', 'groups.json', 'group_ids.txt', 'processed_queries.json'
  ]

  fileList.forEach(filename => {
    const stats = getFileStats(filename)
    if (stats) {
      files[filename] = stats
    }
  })

  res.json({ files })
})

// Get file content
app.get('/api/files/:filename', (req, res) => {
  const { filename } = req.params

  try {
    if (!fs.existsSync(filename)) {
      return res.status(404).json({ error: 'File not found' })
    }

    const content = fs.readFileSync(filename, 'utf8')
    res.json({ content })
  } catch (error) {
    res.status(500).json({ error: error.message })
  }
})

// Save file content
app.put('/api/files/:filename', (req, res) => {
  const { filename } = req.params
  const { content } = req.body

  // Prevent editing read-only files
  const readOnlyFiles = ['groups.json', 'group_ids.txt', 'processed_queries.json', 'session.json']
  if (readOnlyFiles.includes(filename)) {
    return res.status(403).json({ error: 'File is read-only' })
  }

  try {
    fs.writeFileSync(filename, content, 'utf8')
    res.json({ message: 'File saved successfully' })
  } catch (error) {
    res.status(500).json({ error: error.message })
  }
})

// Deduplicate files
app.post('/api/deduplicate', (req, res) => {
  try {
    const filesToCheck = ['queries.txt', 'cities.txt', 'words.txt']
    let results = []

    filesToCheck.forEach(filename => {
      if (fs.existsSync(filename)) {
        const content = fs.readFileSync(filename, 'utf8')
        const lines = content.split('\n').map(line => line.trim()).filter(Boolean)
        const originalCount = lines.length
        const uniqueLines = [...new Set(lines)]
        const duplicatesRemoved = originalCount - uniqueLines.length

        if (duplicatesRemoved > 0) {
          fs.writeFileSync(filename, uniqueLines.join('\n'), 'utf8')
          results.push(`${filename}: удалено ${duplicatesRemoved} дублей, осталось ${uniqueLines.length}`)
        } else {
          results.push(`${filename}: дубли не найдены (${uniqueLines.length} строк)`)
        }
      }
    })

    res.json({ message: results.join('\n') })
  } catch (error) {
    res.status(500).json({ error: error.message })
  }
})

// Get config
app.get('/api/config', (req, res) => {
  const config = loadJSON('config.json', {})
  res.json(config)
})

// Save config
app.put('/api/config', (req, res) => {
  try {
    const config = req.body
    fs.writeFileSync('config.json', JSON.stringify(config, null, 2), 'utf8')
    res.json({ message: 'Configuration saved successfully' })
  } catch (error) {
    res.status(500).json({ error: error.message })
  }
})

// Save config
app.put('/api/config', (req, res) => {
  try {
    fs.writeFileSync('config.json', JSON.stringify(req.body, null, 2), 'utf8')
    res.json({ message: 'Config saved successfully' })
  } catch (error) {
    res.status(500).json({ error: error.message })
  }
})

// Get statistics
app.get('/api/stats', (req, res) => {
  try {
    const stats = {}

    // Queries stats
    let totalQueries = 0
    let processedQueries = 0

    // Обычные запросы
    if (fs.existsSync('queries.txt')) {
      const queries = fs.readFileSync('queries.txt', 'utf8').split('\n').filter(Boolean)
      totalQueries += queries.length
    }

    // Комбинации городов (если файл существует)
    if (fs.existsSync('queries_cities.txt')) {
      const citiesQueries = fs.readFileSync('queries_cities.txt', 'utf8').split('\n').filter(Boolean)
      totalQueries += citiesQueries.length
    }

    // Обработанные запросы
    const processed = loadJSON('processed_queries.json', [])
    processedQueries = processed.length

    stats.queries = {
      total: totalQueries,
      processed: processedQueries
    }

    // Дополнительная информация о файлах
    stats.queryFiles = {}
    if (fs.existsSync('queries.txt')) {
      const queries = fs.readFileSync('queries.txt', 'utf8').split('\n').filter(Boolean)
      stats.queryFiles.regular = queries.length
    }
    if (fs.existsSync('queries_cities.txt')) {
      const citiesQueries = fs.readFileSync('queries_cities.txt', 'utf8').split('\n').filter(Boolean)
      stats.queryFiles.cities = citiesQueries.length
    }

    // Cities and words stats
    if (fs.existsSync('cities.txt')) {
      const cities = fs.readFileSync('cities.txt', 'utf8').split('\n').filter(Boolean)
      stats.cities = { count: cities.length }
    }

    if (fs.existsSync('words.txt')) {
      const words = fs.readFileSync('words.txt', 'utf8').split('\n').filter(Boolean)
      stats.words = { count: words.length }
    }

    // Groups stats
    const groups = loadJSON('groups.json', [])
    if (Array.isArray(groups)) {
      stats.groups = {
        total: groups.length,
        withParticipants: groups.filter(g => g.participants_count > 0).length
      }

      // Group types
      stats.groupTypes = {}
      groups.forEach(group => {
        const type = group.type || 'unknown'
        stats.groupTypes[type] = (stats.groupTypes[type] || 0) + 1
      })

      // Top groups
      stats.topGroups = groups
        .filter(g => g.participants_count > 0)
        .sort((a, b) => (b.participants_count || 0) - (a.participants_count || 0))
        .slice(0, 10)
    }

    // Extracted IDs stats
    if (fs.existsSync('group_ids.txt')) {
      const ids = fs.readFileSync('group_ids.txt', 'utf8').split('\n').filter(Boolean)
      stats.extractedIds = { count: ids.length }
    }

    // File sizes
    stats.fileSizes = {}
    const fileList = [
      'queries.txt', 'cities.txt', 'words.txt', 'config.json',
      'groups.json', 'group_ids.txt', 'processed_queries.json'
    ]

    fileList.forEach(filename => {
      if (fs.existsSync(filename)) {
        stats.fileSizes[filename] = fs.statSync(filename).size
      }
    })

    res.json(stats)
  } catch (error) {
    res.status(500).json({ error: error.message })
  }
})

const PORT = process.env.PORT || 3001

server.listen(PORT, () => {
  console.log(`🚀 Server running on http://localhost:${PORT}`)
  console.log(`📡 WebSocket server running on ws://localhost:${PORT}/ws`)
})