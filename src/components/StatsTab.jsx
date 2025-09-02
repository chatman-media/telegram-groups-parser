import React, { useState, useEffect } from 'react'

function StatsTab({ stats }) {
  const [fileStats, setFileStats] = useState({})
  const [isLoading, setIsLoading] = useState(false)

  useEffect(() => {
    loadStats()
  }, [])

  const loadStats = async () => {
    setIsLoading(true)
    try {
      const response = await fetch('http://localhost:3001/api/stats')
      if (response.ok) {
        const data = await response.json()
        setFileStats(data)
      }
    } catch (error) {
      console.error('Error loading stats:', error)
    } finally {
      setIsLoading(false)
    }
  }

  const formatNumber = (num) => {
    return new Intl.NumberFormat('ru-RU').format(num || 0)
  }

  const formatFileSize = (bytes) => {
    if (bytes === 0) return '0 Б'
    const k = 1024
    const sizes = ['Б', 'КБ', 'МБ', 'ГБ']
    const i = Math.floor(Math.log(bytes) / Math.log(k))
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i]
  }

  if (isLoading) {
    return <div>Загрузка статистики...</div>
  }

  return (
    <div>
      <h2>📊 Статистика</h2>
      <p>Информация о файлах и прогрессе парсинга</p>

      <div style={{ marginBottom: '20px' }}>
        <button
          className="button"
          onClick={loadStats}
          disabled={isLoading}
        >
          🔄 Обновить статистику
        </button>
      </div>

      {/* Статистика файлов */}
      <div className="stats">
        <div className="stat-card">
          <h3>{formatNumber(fileStats.queries?.total)}</h3>
          <p>Всего запросов</p>
          {fileStats.queries?.processed > 0 && (
            <div style={{ fontSize: '12px', color: '#27ae60', marginTop: '5px' }}>
              Обработано: {formatNumber(fileStats.queries.processed)}
            </div>
          )}
          {fileStats.queryFiles && (
            <div style={{ fontSize: '11px', color: '#7f8c8d', marginTop: '3px' }}>
              {fileStats.queryFiles.regular && `Обычные: ${formatNumber(fileStats.queryFiles.regular)}`}
              {fileStats.queryFiles.regular && fileStats.queryFiles.cities && ' | '}
              {fileStats.queryFiles.cities && `Города: ${formatNumber(fileStats.queryFiles.cities)}`}
            </div>
          )}
        </div>

        <div className="stat-card">
          <h3>{formatNumber(fileStats.cities?.count)}</h3>
          <p>Городов</p>
        </div>

        <div className="stat-card">
          <h3>{formatNumber(fileStats.words?.count)}</h3>
          <p>Слов</p>
        </div>

        {fileStats.combinations && (
          <div className="stat-card">
            <h3>{formatNumber(fileStats.combinations.processed)}</h3>
            <p>Комбинаций обработано</p>
            <div style={{ fontSize: '11px', color: '#3498db', marginTop: '3px' }}>
              Всего: {formatNumber(fileStats.combinations.total)}
            </div>
            {fileStats.combinations.total > 0 && (
              <div style={{ fontSize: '11px', color: '#27ae60', marginTop: '2px' }}>
                Прогресс: {Math.round((fileStats.combinations.processed / fileStats.combinations.total) * 100)}%
              </div>
            )}
          </div>
        )}

        <div className="stat-card">
          <h3>{formatNumber(fileStats.groups?.total)}</h3>
          <p>Найдено групп</p>
        </div>

        <div className="stat-card">
          <h3>{formatNumber(fileStats.groups?.withParticipants)}</h3>
          <p>С данными участников</p>
        </div>

        <div className="stat-card">
          <h3>{formatNumber(fileStats.extractedIds?.count)}</h3>
          <p>Извлечено ID</p>
        </div>
      </div>

      {/* Информация о режимах */}
      <div className="file-info">
        <h4>📋 Режимы парсинга</h4>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '10px' }}>
          <div style={{ padding: '10px', background: '#f8f9fa', borderRadius: '4px' }}>
            <strong>Обычный режим</strong>
            <div>Запросов: {formatNumber(fileStats.queries?.total || 0)}</div>
            {fileStats.queries?.processed > 0 && (
              <div style={{ fontSize: '12px', color: '#27ae60' }}>
                Обработано: {formatNumber(fileStats.queries.processed)}
              </div>
            )}
          </div>
          <div style={{ padding: '10px', background: '#f8f9fa', borderRadius: '4px' }}>
            <strong>Режим городов</strong>
            <div>Комбинаций: {formatNumber(fileStats.combinations?.total || 0)}</div>
            {fileStats.cities?.count && fileStats.words?.count && (
              <div style={{ fontSize: '12px', color: '#7f8c8d' }}>
                {fileStats.cities.count} городов × {fileStats.words.count} слов
              </div>
            )}
            {fileStats.combinations?.processed > 0 && (
              <div style={{ fontSize: '12px', color: '#27ae60' }}>
                Обработано: {formatNumber(fileStats.combinations.processed)}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Прогресс парсинга */}
      {(fileStats.queries?.processed > 0 || fileStats.combinations?.processed > 0) && (
        <div className="file-info">
          <h4>📈 Прогресс парсинга</h4>
          
          {/* Обычный режим */}
          {fileStats.queries?.processed > 0 && fileStats.queries?.total > 0 && (
            <div style={{ marginBottom: '15px' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '5px' }}>
                <span>Обычный режим: {fileStats.queries.processed} / {fileStats.queries.total}</span>
                <span>{Math.round((fileStats.queries.processed / fileStats.queries.total) * 100)}%</span>
              </div>
              <div className="progress-bar">
                <div 
                  className="progress-fill" 
                  style={{ width: `${(fileStats.queries.processed / fileStats.queries.total) * 100}%` }}
                />
              </div>
            </div>
          )}

          {/* Режим городов */}
          {fileStats.combinations?.processed > 0 && fileStats.combinations?.total > 0 && (
            <div>
              <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '5px' }}>
                <span>Режим городов: {fileStats.combinations.processed} / {fileStats.combinations.total}</span>
                <span>{Math.round((fileStats.combinations.processed / fileStats.combinations.total) * 100)}%</span>
              </div>
              <div className="progress-bar">
                <div 
                  className="progress-fill" 
                  style={{ width: `${(fileStats.combinations.processed / fileStats.combinations.total) * 100}%` }}
                />
              </div>
            </div>
          )}
        </div>
      )}

      {/* Топ групп по участникам */}
      {fileStats.topGroups && fileStats.topGroups.length > 0 && (
        <div className="file-info">
          <h4>🏆 Топ групп по участникам</h4>
          <div style={{ maxHeight: '300px', overflowY: 'auto' }}>
            {fileStats.topGroups.map((group, index) => (
              <div key={group.id} style={{ 
                padding: '10px', 
                borderBottom: '1px solid #ecf0f1',
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center'
              }}>
                <div>
                  <strong>#{index + 1} {group.title}</strong>
                  {group.username && (
                    <div style={{ fontSize: '12px', color: '#7f8c8d' }}>
                      @{group.username}
                    </div>
                  )}
                </div>
                <div style={{ textAlign: 'right' }}>
                  <div style={{ fontWeight: 'bold', color: '#3498db' }}>
                    {formatNumber(group.participants_count)}
                  </div>
                  <div style={{ fontSize: '12px', color: '#7f8c8d' }}>
                    {group.type}
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Информация о файлах */}
      <div className="file-info">
        <h4>📁 Размеры файлов</h4>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '10px' }}>
          {Object.entries(fileStats.fileSizes || {}).map(([filename, size]) => (
            <div key={filename} style={{ 
              padding: '10px', 
              background: '#f8f9fa', 
              borderRadius: '4px',
              display: 'flex',
              justifyContent: 'space-between'
            }}>
              <span>{filename}</span>
              <span style={{ fontWeight: 'bold' }}>{formatFileSize(size)}</span>
            </div>
          ))}
        </div>
      </div>

      {/* Статистика по типам групп */}
      {fileStats.groupTypes && (
        <div className="file-info">
          <h4>📊 Типы групп</h4>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: '10px' }}>
            {Object.entries(fileStats.groupTypes).map(([type, count]) => (
              <div key={type} style={{ 
                padding: '15px', 
                background: '#f8f9fa', 
                borderRadius: '4px',
                textAlign: 'center'
              }}>
                <div style={{ fontSize: '20px', fontWeight: 'bold', color: '#3498db' }}>
                  {formatNumber(count)}
                </div>
                <div style={{ fontSize: '14px', color: '#7f8c8d', textTransform: 'capitalize' }}>
                  {type === 'group' ? 'Группы' : 
                   type === 'supergroup' ? 'Супергруппы' : 
                   type === 'channel' ? 'Каналы' : type}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}

export default StatsTab