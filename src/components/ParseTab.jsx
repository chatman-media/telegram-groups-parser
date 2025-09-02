import React, { useState, useEffect } from 'react'

function ParseTab({ logs, setLogs, wsConnection }) {
  const [isRunning, setIsRunning] = useState(false)
  const [mode, setMode] = useState('normal')
  const [progress, setProgress] = useState({ current: 0, total: 0 })

  const startParsing = async (parseMode = 'normal') => {
    if (isRunning) return
    
    setIsRunning(true)
    setLogs('')
    
    try {
      const endpoint = parseMode === 'cities' ? '/api/parse-cities' : '/api/parse'
      const response = await fetch(`http://localhost:3001${endpoint}`, {
        method: 'POST'
      })
      
      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`)
      }
      
      const result = await response.json()
      console.log('Parse result:', result)
    } catch (error) {
      console.error('Parse error:', error)
      setLogs(prev => prev + `❌ Ошибка: ${error.message}\n`)
    } finally {
      setIsRunning(false)
    }
  }

  const stopParsing = async () => {
    try {
      await fetch('http://localhost:3001/api/stop', { method: 'POST' })
    } catch (error) {
      console.error('Stop error:', error)
    }
  }

  const resetProgress = async () => {
    try {
      const response = await fetch('http://localhost:3001/api/reset-progress', {
        method: 'POST'
      })
      const result = await response.json()
      setLogs(prev => prev + `🗑️ ${result.message}\n`)
    } catch (error) {
      console.error('Reset error:', error)
      setLogs(prev => prev + `❌ Ошибка сброса: ${error.message}\n`)
    }
  }

  return (
    <div>
      <h2>🔍 Парсинг групп Telegram</h2>
      <p>Запуск поиска групп по ключевым словам или комбинациям городов</p>

      <div className="form-group">
        <label>Режим парсинга:</label>
        <select 
          value={mode} 
          onChange={(e) => setMode(e.target.value)}
          disabled={isRunning}
        >
          <option value="normal">Обычный (queries.txt)</option>
          <option value="cities">Комбинации городов (cities.txt + words.txt)</option>
        </select>
      </div>

      <div style={{ marginBottom: '20px' }}>
        <button
          className="button"
          onClick={() => startParsing(mode)}
          disabled={isRunning}
        >
          {isRunning ? '⏳ Парсинг...' : '▶️ Запустить парсинг'}
        </button>

        <button
          className="button danger"
          onClick={stopParsing}
          disabled={!isRunning}
        >
          ⏹️ Остановить
        </button>

        <button
          className="button"
          onClick={resetProgress}
          disabled={isRunning}
        >
          🗑️ Сбросить прогресс
        </button>
      </div>

      {isRunning && (
        <div className="status running">
          ⏳ Парсинг выполняется... Режим: {mode === 'cities' ? 'Комбинации городов' : 'Обычный'}
        </div>
      )}

      {progress.total > 0 && (
        <div>
          <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '5px' }}>
            <span>Прогресс: {progress.current} / {progress.total}</span>
            <span>{Math.round((progress.current / progress.total) * 100)}%</span>
          </div>
          <div className="progress-bar">
            <div 
              className="progress-fill" 
              style={{ width: `${(progress.current / progress.total) * 100}%` }}
            />
          </div>
        </div>
      )}

      <div className="file-info">
        <h4>📝 Файлы для парсинга:</h4>
        <p><strong>Обычный режим:</strong> queries.txt - список поисковых запросов</p>
        <p><strong>Режим городов:</strong> cities.txt + words.txt - генерируются комбинации</p>
        <p><strong>Результат:</strong> groups.json - найденные группы с данными</p>
      </div>

      {logs && (
        <div className="log-container">
          {logs}
        </div>
      )}
    </div>
  )
}

export default ParseTab