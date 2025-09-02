import fs from "fs";

// -------- utils --------
function loadJSON(path, fallback = null) {
  try {
    if (!fs.existsSync(path)) return fallback;
    return JSON.parse(fs.readFileSync(path, "utf8"));
  } catch {
    return fallback;
  }
}

// -------- config --------
const cfg = {
  extract: {
    inputFile: "groups.json",
    outputFile: "group_ids.txt",
    includeUsernames: false, // если true, добавит @username после ID
  },
  ...loadJSON("config.json", {}),
};

// -------- extract IDs --------
function extractIds() {
  const { extract: { inputFile, outputFile, includeUsernames, minParticipants, filterByParticipants } } = cfg;

  if (!fs.existsSync(inputFile)) {
    console.error(`Файл с группами не найден: ${inputFile}`);
    console.log("Сначала запустите parse.js для создания списка групп");
    process.exit(1);
  }

  const groups = loadJSON(inputFile, []);
  
  if (!Array.isArray(groups) || groups.length === 0) {
    console.error(`Файл ${inputFile} пуст или содержит неверные данные`);
    process.exit(1);
  }

  console.log(`📊 Всего групп в файле: ${groups.length}`);
  if (filterByParticipants) {
    console.log(`🎯 Фильтр: минимум ${minParticipants} участников`);
  }

  const ids = [];
  let withUsernames = 0;
  let withoutUsernames = 0;
  let filteredOut = 0;
  let noParticipantsData = 0;

  for (const group of groups) {
    if (!group.id) continue;

    // Фильтрация по количеству участников
    if (filterByParticipants) {
      if (group.participants_count === null || group.participants_count === undefined) {
        noParticipantsData++;
        continue; // Пропускаем группы без данных об участниках
      }
      
      if (group.participants_count < minParticipants) {
        filteredOut++;
        continue; // Пропускаем группы с малым количеством участников
      }
    }

    let line = group.id;
    
    if (includeUsernames && group.username) {
      line += ` @${group.username}`;
      withUsernames++;
    } else if (!group.username) {
      withoutUsernames++;
    }

    ids.push(line);
  }

  // Сохраняем ID в текстовый файл (по одному на строку)
  fs.writeFileSync(outputFile, ids.join('\n'), 'utf8');

  console.log(`\n📊 Статистика:`);
  console.log(`   ✅ Прошли фильтр: ${ids.length}`);
  if (filterByParticipants) {
    console.log(`   ❌ Отфильтровано (< ${minParticipants}): ${filteredOut}`);
    console.log(`   ⚠️ Без данных об участниках: ${noParticipantsData}`);
  }
  if (includeUsernames) {
    console.log(`   📝 С username: ${withUsernames}`);
    console.log(`   📝 Без username: ${withoutUsernames}`);
  }
  console.log(`💾 Сохранено в: ${outputFile}`);
  
  // Показываем первые несколько ID для примера
  if (ids.length > 0) {
    console.log(`\n📋 Первые ${Math.min(5, ids.length)} ID:`);
    ids.slice(0, 5).forEach((id, index) => {
      console.log(`   ${index + 1}. ${id}`);
    });
    
    if (ids.length > 5) {
      console.log(`   ... и еще ${ids.length - 5} ID`);
    }
  } else {
    console.log(`\n⚠️ Нет групп, соответствующих критериям фильтрации`);
  }
}

// -------- main --------
try {
  // Проверяем аргументы командной строки
  if (process.argv.includes('--help') || process.argv.includes('-h')) {
    console.log(`
Извлечение ID групп из JSON файла с фильтрацией

Использование:
  node extract_ids.js                    # Извлечь ID с фильтрацией
  node extract_ids.js --with-usernames   # Извлечь ID с username
  node extract_ids.js --no-filter        # Извлечь все ID без фильтрации
  node extract_ids.js --help             # Показать эту справку

Конфигурация в config.json:
  "extract": {
    "inputFile": "groups.json",            # Входной файл с группами
    "outputFile": "group_ids.txt",         # Выходной файл с ID
    "includeUsernames": false,             # Включать ли username
    "minParticipants": 1000,               # Минимум участников
    "filterByParticipants": true           # Включить фильтрацию
  }
`);
    process.exit(0);
  }

  // Проверяем флаги
  if (process.argv.includes('--with-usernames')) {
    cfg.extract.includeUsernames = true;
  }
  
  if (process.argv.includes('--no-filter')) {
    cfg.extract.filterByParticipants = false;
  }

  extractIds();
} catch (e) {
  console.error("Фатальная ошибка:", e);
  process.exit(1);
}