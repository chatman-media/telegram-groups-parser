import React, { useState } from 'react'

function ExtractTab({ logs, setLogs }) {
  const [isRunning, setIsRunning] = useState(false)
  const [options, setOptions] = useState({
    withUsernames: false,
    noFilter: false
  })

  const startExtraction = async () => {
    if (isRunning) return
    
    setIsRunning(true)
    setLogs('')
    
    try {
      const response = await fetch('http://localhost:3001/api/extract', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(options)
      })
      
      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`)
      }
      
      const result = await response.json()
      setLogs(prev => prev + `✅ ${result.message}\n`)
      
      if (result.stats) {
        setLogs(prev => prev + `📊 Статистика:\n`)
        setLogs(prev => prev + `   Всего групп: ${result.stats.total}\n`)
        setLogs(prev => prev + `   Отфильтровано: ${result.stats.filtered}\n`)
        setLogs(prev => prev + `   Сохранено ID: ${result.stats.saved}\n`)
      }
    } catch (error) {
      console.error('Extract error:', error)
      setLogs(prev => prev + `❌ Ошибка: ${error.message}\n`)
    } finally {
      setIsRunning(false)
    }
  }

  return (
    <div>
      <h2>📋 Извлечение ID групп</h2>
      <p>Извлечение ID групп из результатов парсинга с фильтрацией</p>

      <div className="form-group">
        <label>
          <input
            type="checkbox"
            checked={options.withUsernames}
            onChange={(e) => setOptions(prev => ({
              ...prev,
              withUsernames: e.target.checked
            }))}
            disabled={isRunning}
            style={{ marginRight: '8px' }}
          />
          Включить @username после ID
        </label>
      </div>

      <div className="form-group">
        <label>
          <input
            type="checkbox"
            checked={options.noFilter}
            onChange={(e) => setOptions(prev => ({
              ...prev,
              noFilter: e.target.checked
            }))}
            disabled={isRunning}
            style={{ marginRight: '8px' }}
          />
          Без фильтрации по количеству участников
        </label>
      </div>

      <div style={{ marginBottom: '20px' }}>
        <button
          className="button"
          onClick={startExtraction}
          disabled={isRunning}
        >
          {isRunning ? '⏳ Извлечение...' : '📋 Извлечь ID'}
        </button>
      </div>

      {isRunning && (
        <div className="status running">
          ⏳ Извлечение ID выполняется...
        </div>
      )}

      <div className="file-info">
        <h4>📁 Файлы:</h4>
        <p><strong>Входной:</strong> groups.json - результаты парсинга</p>
        <p><strong>Выходной:</strong> group_ids.txt - список ID групп</p>
        <p><strong>Фильтрация:</strong> По минимальному количеству участников из config.json</p>
      </div>

      <div className="file-info">
        <h4>⚙️ Опции:</h4>
        <p><strong>С username:</strong> Формат "ID @username" вместо просто "ID"</p>
        <p><strong>Без фильтрации:</strong> Извлечь все ID без учета количества участников</p>
      </div>

      {logs && (
        <div className="log-container">
          {logs}
        </div>
      )}
    </div>
  )
}

export default ExtractTab