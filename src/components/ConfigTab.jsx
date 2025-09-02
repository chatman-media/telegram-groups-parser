import React, { useState, useEffect } from 'react'

function ConfigTab() {
  const [config, setConfig] = useState(null)
  const [isLoading, setIsLoading] = useState(false)
  const [isSaving, setIsSaving] = useState(false)

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
    setIsSaving(true)
    try {
      const response = await fetch('http://localhost:3001/api/config', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(config)
      })
      if (response.ok) {
        alert('Конфигурация сохранена!')
      }
    } catch (error) {
      console.error('Error saving config:', error)
      alert('Ошибка сохранения конфигурации')
    } finally {
      setIsSaving(false)
    }
  }

  const updateConfig = (path, value) => {
    const newConfig = { ...config }
    const keys = path.split('.')
    let current = newConfig
    
    for (let i = 0; i < keys.length - 1; i++) {
      if (!current[keys[i]]) current[keys[i]] = {}
      current = current[keys[i]]
    }
    
    current[keys[keys.length - 1]] = value
    setConfig(newConfig)
  }

  if (isLoading) {
    return <div>Загрузка конфигурации...</div>
  }

  if (!config) {
    return <div>Не удалось загрузить конфигурацию</div>
  }

  return (
    <div className="tab-content">
      <h2>⚙️ Настройки</h2>

      {/* Основные настройки поиска */}
      <div className="file-info">
        <h4>🔍 Настройки поиска</h4>
        
        <div className="form-group">
          <label>Лимит результатов на запрос:</label>
          <input
            type="number"
            value={config.search?.limitPerQuery || 20}
            onChange={(e) => updateConfig('search.limitPerQuery', parseInt(e.target.value))}
            min="1"
            max="200"
          />
        </div>
      </div>

      {/* Двухуровневый парсинг */}
      <div className="file-info">
        <h4>🔄 Двухуровневый парсинг</h4>
        
        <div className="form-group">
          <label>
            <input
              type="checkbox"
              checked={config.search?.twoLevelParsing?.enabled || false}
              onChange={(e) => updateConfig('search.twoLevelParsing.enabled', e.target.checked)}
            />
            Включить двухуровневый парсинг
          </label>
        </div>

        {config.search?.twoLevelParsing?.enabled && (
          <>
            <div style={{ marginLeft: '20px', padding: '10px', background: '#f8f9fa', borderRadius: '4px' }}>
              <h5>📊 Первый уровень (высокий лимит)</h5>
              
              <div className="form-group">
                <label>Лимит результатов:</label>
                <input
                  type="number"
                  value={config.search?.twoLevelParsing?.firstLevel?.limitPerQuery || 100}
                  onChange={(e) => updateConfig('search.twoLevelParsing.firstLevel.limitPerQuery', parseInt(e.target.value))}
                  min="1"
                  max="200"
                />
              </div>

              <div className="form-group">
                <label>Максимум слов (первые N слов):</label>
                <input
                  type="number"
                  value={config.search?.twoLevelParsing?.firstLevel?.maxWords || 30}
                  onChange={(e) => updateConfig('search.twoLevelParsing.firstLevel.maxWords', parseInt(e.target.value))}
                  min="1"
                  max="1000"
                />
              </div>
            </div>

            <div style={{ marginLeft: '20px', padding: '10px', background: '#f0f8ff', borderRadius: '4px', marginTop: '10px' }}>
              <h5>📋 Второй уровень (обычный лимит)</h5>
              
              <div className="form-group">
                <label>Лимит результатов:</label>
                <input
                  type="number"
                  value={config.search?.twoLevelParsing?.secondLevel?.limitPerQuery || 20}
                  onChange={(e) => updateConfig('search.twoLevelParsing.secondLevel.limitPerQuery', parseInt(e.target.value))}
                  min="1"
                  max="200"
                />
              </div>

              <div className="form-group">
                <label>
                  <input
                    type="checkbox"
                    checked={config.search?.twoLevelParsing?.secondLevel?.useAllWords || true}
                    onChange={(e) => updateConfig('search.twoLevelParsing.secondLevel.useAllWords', e.target.checked)}
                  />
                  Использовать все слова
                </label>
              </div>
            </div>
          </>
        )}
      </div>

      {/* Настройки троттлинга */}
      <div className="file-info">
        <h4>⏱️ Настройки задержек</h4>
        
        <div className="form-group">
          <label>Задержка между запросами (мс):</label>
          <input
            type="number"
            value={config.throttle?.betweenQueriesMs || 5000}
            onChange={(e) => updateConfig('throttle.betweenQueriesMs', parseInt(e.target.value))}
            min="1000"
            max="60000"
          />
        </div>

        <div className="form-group">
          <label>Задержка между API запросами (мс):</label>
          <input
            type="number"
            value={config.throttle?.betweenRequestsMs || 1200}
            onChange={(e) => updateConfig('throttle.betweenRequestsMs', parseInt(e.target.value))}
            min="100"
            max="10000"
          />
        </div>
      </div>

      {/* Настройки извлечения */}
      <div className="file-info">
        <h4>📤 Настройки извлечения ID</h4>
        
        <div className="form-group">
          <label>Минимум участников:</label>
          <input
            type="number"
            value={config.extract?.minParticipants || 600}
            onChange={(e) => updateConfig('extract.minParticipants', parseInt(e.target.value))}
            min="0"
            max="100000"
          />
        </div>

        <div className="form-group">
          <label>
            <input
              type="checkbox"
              checked={config.extract?.filterByParticipants || true}
              onChange={(e) => updateConfig('extract.filterByParticipants', e.target.checked)}
            />
            Фильтровать по количеству участников
          </label>
        </div>
      </div>

      <div style={{ marginTop: '20px' }}>
        <button
          className="button"
          onClick={saveConfig}
          disabled={isSaving}
        >
          {isSaving ? '💾 Сохранение...' : '💾 Сохранить конфигурацию'}
        </button>
        
        <button
          className="button"
          onClick={loadConfig}
          disabled={isLoading}
          style={{ marginLeft: '10px' }}
        >
          🔄 Перезагрузить
        </button>
      </div>
    </div>
  )
}

export default ConfigTab