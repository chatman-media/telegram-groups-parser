// Тестовый скрипт для проверки двухуровневого парсинга
import fs from 'fs'

function loadJSON(path, fallback = null) {
  try {
    if (!fs.existsSync(path)) return fallback
    return JSON.parse(fs.readFileSync(path, "utf8"))
  } catch {
    return fallback
  }
}

function testTwoLevelParsing() {
  console.log('🧪 Тестирование двухуровневого парсинга\n')

  // Загружаем конфигурацию
  const config = loadJSON('config.json', {})
  const twoLevelConfig = config.search?.twoLevelParsing

  if (!twoLevelConfig?.enabled) {
    console.log('❌ Двухуровневый парсинг отключен в конфигурации')
    return
  }

  console.log('✅ Двухуровневый парсинг включен')
  console.log(`📊 Первый уровень: лимит ${twoLevelConfig.firstLevel.limitPerQuery}, максимум ${twoLevelConfig.firstLevel.maxWords} слов`)
  console.log(`📋 Второй уровень: лимит ${twoLevelConfig.secondLevel.limitPerQuery}, все слова: ${twoLevelConfig.secondLevel.useAllWords}`)

  // Проверяем файлы
  if (!fs.existsSync('cities.txt')) {
    console.log('❌ Файл cities.txt не найден')
    return
  }

  if (!fs.existsSync('words.txt')) {
    console.log('❌ Файл words.txt не найден')
    return
  }

  const cities = fs.readFileSync('cities.txt', 'utf8').split('\n').filter(Boolean)
  const words = fs.readFileSync('words.txt', 'utf8').split('\n').filter(Boolean)

  console.log(`\n📍 Городов: ${cities.length}`)
  console.log(`📝 Слов: ${words.length}`)

  // Рассчитываем комбинации
  const firstLevelWords = words.slice(0, twoLevelConfig.firstLevel.maxWords)
  const firstLevelCombinations = cities.length * firstLevelWords.length
  const secondLevelCombinations = twoLevelConfig.secondLevel.useAllWords ? 
    cities.length * words.length : 0

  console.log(`\n🔄 Первый уровень: ${firstLevelCombinations} комбинаций`)
  console.log(`   Слова: ${firstLevelWords.slice(0, 5).join(', ')}${firstLevelWords.length > 5 ? '...' : ''}`)
  
  console.log(`🔄 Второй уровень: ${secondLevelCombinations} комбинаций`)
  console.log(`   Всего уникальных комбинаций: ${firstLevelCombinations + secondLevelCombinations}`)

  // Показываем примеры запросов
  console.log('\n📋 Примеры запросов:')
  console.log('Первый уровень (высокий лимит):')
  for (let i = 0; i < Math.min(3, cities.length); i++) {
    for (let j = 0; j < Math.min(3, firstLevelWords.length); j++) {
      console.log(`  "${cities[i]} ${firstLevelWords[j]}" (лимит: ${twoLevelConfig.firstLevel.limitPerQuery})`)
    }
  }

  if (secondLevelCombinations > 0) {
    console.log('\nВторой уровень (обычный лимит):')
    for (let i = 0; i < Math.min(3, cities.length); i++) {
      for (let j = 0; j < Math.min(3, words.length); j++) {
        console.log(`  "${cities[i]} ${words[j]}" (лимит: ${twoLevelConfig.secondLevel.limitPerQuery})`)
      }
    }
  }

  console.log('\n✅ Тест завершен')
}

testTwoLevelParsing()