import React, { useState, useEffect } from 'react'

function ConfigTab({ setLogs }) {
  const [config, setConfig] = useState({})
  const [isLoading, setIsLoading] = useState(false)

  useEffect(() => {
    loadConfig()
  }, [])

  const loadConfig = async () => {
    setIsLoading(true)
    try {
      const response = await fetch('http://localhost:3001/api/config')
      if (response.ok) {
        const data = await response.json()
        setConfig(data)
      }
    } catch (error) {
      console.error('Error loading config:', error)
    } finally {
      setIsLoading(false)
    }
  }

  const saveConfig = async () => {
    setIsLoading(true)
    try {
      const response = await fetch('http://localhost:3001/api/config', {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(config)
      })
      
      if (response.ok) {
        setLogs(prev => prev + `✅ Конфигурация сохранена\n`)
      } else {
        throw new Error('Ошибка сохранения конфигурации')
      }
    } catch (error) {
      console.error('Error saving config:', error)
      setLogs(prev => prev + `❌ Ошибка сохранения конфигурации: ${error.message}\n`)
    } finally {
      setIsLoading(false)
    }
  }

  const updateConfig = (section, key, value) => {
    setConfig(prev => ({
      ...prev,
      [section]: {
        ...prev[section],
        [key]: value
      }
    }))
  }

  if (isLoading && Object.keys(config).length === 0) {
    return <div>Загрузка конфигурации...</div>
  }

  return (
    <div>
      <h2>⚙️ Конфигурация</h2>
      <p>Настройка параметров парсинга и извлечения</p>

      {/* Настройки поиска */}
      <div className="file-info">
        <h4>🔍 Настройки поиска</h4>
        
        <div className="form-group">
          <label>Лимит результатов на запрос:</label>
          <input
            type="number"
            value={config.search?.limitPerQuery || 20}
            onChange={(e) => updateConfig('search', 'limitPerQuery', parseInt(e.target.value))}
            min="1"
            max="100"
          />
          <p style={{ fontSize: '12px', color: '#7f8c8d' }}>
            Максимальное количество групп на один поисковый запрос (1-100)
          </p>
        </div>
      </div>

      {/* Настройки извлечения */}
      <div className="file-info">
        <h4>📋 Настройки извлечения ID</h4>
        
        <div className="form-group">
          <label>Минимальное количество участников:</label>
          <input
            type="number"
            value={config.extract?.minParticipants || 1000}
            onChange={(e) => updateConfig('extract', 'minParticipants', parseInt(e.target.value))}
            min="0"
          />
          <p style={{ fontSize: '12px', color: '#7f8c8d' }}>
            Группы с меньшим количеством участников будут отфильтрованы
          </p>
        </div>

        <div className="form-group">
          <label>
            <input
              type="checkbox"
              checked={config.extract?.filterByParticipants !== false}
              onChange={(e) => updateConfig('extract', 'filterByParticipants', e.target.checked)}
              style={{ marginRight: '8px' }}
            />
            Включить фильтрацию по участникам
          </label>
        </div>

        <div className="form-group">
          <label>
            <input
              type="checkbox"
              checked={config.extract?.includeUsernames === true}
              onChange={(e) => updateConfig('extract', 'includeUsernames', e.target.checked)}
              style={{ marginRight: '8px' }}
            />
            Включать @username в вывод по умолчанию
          </label>
        </div>
      </div>

      {/* Настройки ограничений */}
      <div className="file-info">
        <h4>⏱️ Настройки ограничений</h4>
        
        <div className="form-group">
          <label>Задержка между запросами (мс):</label>
          <input
            type="number"
            value={config.throttle?.betweenQueriesMs || 3000}
            onChange={(e) => updateConfig('throttle', 'betweenQueriesMs', parseInt(e.target.value))}
            min="1000"
            step="500"
          />
          <p style={{ fontSize: '12px', color: '#7f8c8d' }}>
            Пауза между поисковыми запросами для избежания блокировки
          </p>
        </div>

        <div className="form-group">
          <label>Задержка между API запросами (мс):</label>
          <input
            type="number"
            value={config.throttle?.betweenRequestsMs || 1200}
            onChange={(e) => updateConfig('throttle', 'betweenRequestsMs', parseInt(e.target.value))}
            min="500"
            step="100"
          />
        </div>

        <div className="form-group">
          <label>Максимальное количество повторов:</label>
          <input
            type="number"
            value={config.throttle?.maxRetries || 3}
            onChange={(e) => updateConfig('throttle', 'maxRetries', parseInt(e.target.value))}
            min="1"
            max="10"
          />
        </div>

        <div className="form-group">
          <label>Максимальное время ожидания FLOOD_WAIT (сек):</label>
          <input
            type="number"
            value={config.throttle?.floodWaitCapSec || 900}
            onChange={(e) => updateConfig('throttle', 'floodWaitCapSec', parseInt(e.target.value))}
            min="60"
            step="60"
          />
          <p style={{ fontSize: '12px', color: '#7f8c8d' }}>
            Максимальное время ожидания при получении FLOOD_WAIT от Telegram
          </p>
        </div>
      </div>

      <div style={{ marginTop: '30px' }}>
        <button
          className="button success"
          onClick={saveConfig}
          disabled={isLoading}
        >
          💾 Сохранить конфигурацию
        </button>
        
        <button
          className="button"
          onClick={loadConfig}
          disabled={isLoading}
        >
          🔄 Сбросить изменения
        </button>
      </div>

      <div className="file-info" style={{ marginTop: '20px' }}>
        <h4>⚠️ Рекомендации:</h4>
        <p>• Не уменьшайте задержки слишком сильно - это может привести к блокировке</p>
        <p>• Для больших объемов данных увеличьте задержки</p>
        <p>• Минимальное количество участников помогает отфильтровать неактивные группы</p>
        <p>• Изменения применяются только после перезапуска парсинга</p>
      </div>
    </div>
  )
}

export default ConfigTab