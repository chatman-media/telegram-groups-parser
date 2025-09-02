import React, { useState, useEffect } from 'react'
import ParseTab from './components/ParseTab'
import ExtractTab from './components/ExtractTab'
import FilesTab from './components/FilesTab'
import ConfigTab from './components/ConfigTab'
import StatsTab from './components/StatsTab'

function App() {
  const [activeTab, setActiveTab] = useState('parse')
  const [wsConnection, setWsConnection] = useState(null)
  const [logs, setLogs] = useState('')
  const [stats, setStats] = useState({})

  useEffect(() => {
    // Подключение к WebSocket для получения логов в реальном времени
    const ws = new WebSocket('ws://localhost:3001/ws')
    
    ws.onopen = () => {
      console.log('WebSocket connected')
      setWsConnection(ws)
    }
    
    ws.onmessage = (event) => {
      const data = JSON.parse(event.data)
      if (data.type === 'log') {
        setLogs(prev => prev + data.message + '\n')
      } else if (data.type === 'stats') {
        setStats(data.data)
      }
    }
    
    ws.onclose = () => {
      console.log('WebSocket disconnected')
      setWsConnection(null)
    }
    
    return () => {
      if (ws.readyState === WebSocket.OPEN) {
        ws.close()
      }
    }
  }, [])

  const tabs = [
    { id: 'parse', label: '🔍 Парсинг', component: ParseTab },
    { id: 'extract', label: '📋 Извлечение ID', component: ExtractTab },
    { id: 'files', label: '📁 Файлы', component: FilesTab },
    { id: 'config', label: '⚙️ Конфигурация', component: ConfigTab },
    { id: 'stats', label: '📊 Статистика', component: StatsTab }
  ]

  const ActiveComponent = tabs.find(tab => tab.id === activeTab)?.component

  return (
    <div className="app">
      <div className="header">
        <h1>🤖 Telegram Parser UI</h1>
        <p>Интерфейс для управления парсингом групп Telegram</p>
      </div>

      <div className="tabs">
        {tabs.map(tab => (
          <button
            key={tab.id}
            className={`tab ${activeTab === tab.id ? 'active' : ''}`}
            onClick={() => setActiveTab(tab.id)}
          >
            {tab.label}
          </button>
        ))}
      </div>

      <div className="tab-content">
        {ActiveComponent && (
          <ActiveComponent 
            logs={logs}
            setLogs={setLogs}
            stats={stats}
            wsConnection={wsConnection}
          />
        )}
      </div>
    </div>
  )
}

export default App