import React, { useState, useEffect } from 'react'

function FilesTab({ setLogs }) {
  const [files, setFiles] = useState({})
  const [selectedFile, setSelectedFile] = useState('queries.txt')
  const [fileContent, setFileContent] = useState('')
  const [isLoading, setIsLoading] = useState(false)

  const fileDescriptions = {
    'queries.txt': 'Поисковые запросы для обычного режима',
    'cities.txt': 'Список городов для режима комбинаций',
    'words.txt': 'Список слов для режима комбинаций',
    'groups.json': 'Результаты парсинга (только чтение)',
    'group_ids.txt': 'Извлеченные ID групп (только чтение)',
    'config.json': 'Конфигурация парсера',
    '.env': 'Переменные окружения (API ключи)'
  }

  useEffect(() => {
    loadFilesList()
  }, [])

  useEffect(() => {
    if (selectedFile) {
      loadFileContent(selectedFile)
    }
  }, [selectedFile])

  const loadFilesList = async () => {
    try {
      const response = await fetch('http://localhost:3001/api/files')
      const data = await response.json()
      setFiles(data.files)
    } catch (error) {
      console.error('Error loading files:', error)
    }
  }

  const loadFileContent = async (filename) => {
    setIsLoading(true)
    try {
      const response = await fetch(`http://localhost:3001/api/files/${filename}`)
      if (response.ok) {
        const data = await response.json()
        setFileContent(data.content)
      } else {
        setFileContent('Файл не найден или недоступен для чтения')
      }
    } catch (error) {
      console.error('Error loading file content:', error)
      setFileContent('Ошибка загрузки файла')
    } finally {
      setIsLoading(false)
    }
  }

  const saveFileContent = async () => {
    if (!selectedFile || isReadOnlyFile(selectedFile)) return
    
    setIsLoading(true)
    try {
      const response = await fetch(`http://localhost:3001/api/files/${selectedFile}`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ content: fileContent })
      })
      
      if (response.ok) {
        setLogs(prev => prev + `✅ Файл ${selectedFile} сохранен\n`)
        loadFilesList() // Обновляем информацию о файлах
      } else {
        throw new Error('Ошибка сохранения файла')
      }
    } catch (error) {
      console.error('Error saving file:', error)
      setLogs(prev => prev + `❌ Ошибка сохранения ${selectedFile}: ${error.message}\n`)
    } finally {
      setIsLoading(false)
    }
  }

  const deduplicateFiles = async () => {
    setIsLoading(true)
    try {
      const response = await fetch('http://localhost:3001/api/deduplicate', {
        method: 'POST'
      })
      
      if (response.ok) {
        const result = await response.json()
        setLogs(prev => prev + `✅ Дедупликация завершена:\n${result.message}\n`)
        loadFileContent(selectedFile) // Перезагружаем текущий файл
        loadFilesList() // Обновляем информацию о файлах
      } else {
        throw new Error('Ошибка дедупликации')
      }
    } catch (error) {
      console.error('Error deduplicating:', error)
      setLogs(prev => prev + `❌ Ошибка дедупликации: ${error.message}\n`)
    } finally {
      setIsLoading(false)
    }
  }

  const isReadOnlyFile = (filename) => {
    return ['groups.json', 'group_ids.txt', 'processed_queries.json', 'session.json'].includes(filename)
  }

  const getFileStats = (filename) => {
    const fileInfo = files[filename]
    if (!fileInfo) return null
    
    return (
      <div style={{ fontSize: '12px', color: '#7f8c8d', marginTop: '5px' }}>
        Размер: {fileInfo.size} байт | Изменен: {new Date(fileInfo.modified).toLocaleString()}
        {fileInfo.lines && ` | Строк: ${fileInfo.lines}`}
      </div>
    )
  }

  return (
    <div>
      <h2>📁 Управление файлами</h2>
      <p>Просмотр и редактирование файлов конфигурации</p>

      <div style={{ marginBottom: '20px' }}>
        <button
          className="button"
          onClick={deduplicateFiles}
          disabled={isLoading}
        >
          🔄 Удалить дубли
        </button>
        
        <button
          className="button"
          onClick={loadFilesList}
          disabled={isLoading}
        >
          🔄 Обновить список
        </button>
      </div>

      <div className="form-group">
        <label>Выберите файл:</label>
        <select 
          value={selectedFile} 
          onChange={(e) => setSelectedFile(e.target.value)}
          disabled={isLoading}
        >
          {Object.keys(fileDescriptions).map(filename => (
            <option key={filename} value={filename}>
              {filename} {isReadOnlyFile(filename) ? '(только чтение)' : ''}
            </option>
          ))}
        </select>
        {fileDescriptions[selectedFile] && (
          <p style={{ fontSize: '14px', color: '#7f8c8d', marginTop: '5px' }}>
            {fileDescriptions[selectedFile]}
          </p>
        )}
        {getFileStats(selectedFile)}
      </div>

      <div className="form-group">
        <label>Содержимое файла:</label>
        <textarea
          value={fileContent}
          onChange={(e) => setFileContent(e.target.value)}
          disabled={isLoading || isReadOnlyFile(selectedFile)}
          placeholder={isLoading ? 'Загрузка...' : 'Содержимое файла'}
          style={{ 
            minHeight: '300px',
            fontFamily: 'monospace',
            backgroundColor: isReadOnlyFile(selectedFile) ? '#f8f9fa' : 'white'
          }}
        />
      </div>

      {!isReadOnlyFile(selectedFile) && (
        <div style={{ marginBottom: '20px' }}>
          <button
            className="button success"
            onClick={saveFileContent}
            disabled={isLoading}
          >
            💾 Сохранить файл
          </button>
        </div>
      )}

      <div className="file-info">
        <h4>📝 Форматы файлов:</h4>
        <p><strong>queries.txt, cities.txt, words.txt:</strong> По одной записи на строку</p>
        <p><strong>config.json:</strong> JSON конфигурация</p>
        <p><strong>.env:</strong> KEY=value формат</p>
      </div>
    </div>
  )
}

export default FilesTab