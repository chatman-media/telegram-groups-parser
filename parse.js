import { TelegramClient } from "telegram";
import { StringSession } from "telegram/sessions/index.js";
import { Api } from "telegram/tl/index.js";
import fs from "fs";
import readline from "readline";
import { config as dotenv } from "dotenv";

dotenv();

// -------- utils --------
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

function ask(question, { silent = false } = {}) {
  return new Promise((resolve) => {
    const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
    if (silent) {
      // простое "мьют" эхо — не крипто-секьюр, но лучше, чем ничего
      const _writeToOutput = rl._writeToOutput;
      rl._writeToOutput = function (stringToWrite) {
        if (rl.stdoutMuted) return;
        _writeToOutput.call(rl, stringToWrite);
      };
      rl.stdoutMuted = true;
    }
    rl.question(question, (answer) => {
      rl.close();
      resolve(answer.trim());
    });
    if (silent) process.stdout.write(""); // старт без эха
  });
}

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
  sessionFile: "session.json",
  stringSession: "",
  search: {
    queriesFile: "queries.txt",
    limitPerQuery: 20,
    saveFile: "groups.json",
    processedQueriesFile: "processed_queries.json",
  },
  throttle: {
    betweenQueriesMs: 3000,
    betweenRequestsMs: 1200,
    maxRetries: 3,
    retryBackoffMultiplier: 2,
    floodWaitCapSec: 900, // 15 минут
  },
  ...loadJSON("config.json", {}),
};

const apiId = Number(process.env.API_ID);
const apiHash = process.env.API_HASH;
const phoneNumber = process.env.PHONE_NUMBER;
if (!apiId || !apiHash || !phoneNumber) {
  console.error("Заполни .env: API_ID, API_HASH, PHONE_NUMBER");
  process.exit(1);
}

// приоритет источника StringSession
const fromEnv = process.env.STRING_SESSION || "";
const fromConfig = cfg.stringSession || "";
const fromFile = loadJSON(cfg.sessionFile, { session: "" })?.session || "";
const initialSessionStr = fromEnv || fromConfig || fromFile || "";

const stringSession = new StringSession(initialSessionStr);
const client = new TelegramClient(stringSession, apiId, apiHash, { connectionRetries: 5 });

// -------- auth/login with retry --------
async function ensureLoggedIn() {
  // Если уже есть строка сессии — пробуем подключиться
  if (initialSessionStr) {
    try {
      await client.connect();
      console.log("✅ Подключился по готовой StringSession.");
      // Нормализуем — сохраним как session.json
      fs.writeFileSync(cfg.sessionFile, JSON.stringify({ session: client.session.save() }, null, 2));
      return;
    } catch (e) {
      console.warn("⚠️ Не удалось подключиться по текущей сессии, попробуем интерактивный логин…", e?.message || e);
    }
  }

  // Иначе — интерактивный логин с автоповтором кода
  const maxCodeRetries = 5;
  const twoFAEnv = process.env.TG_2FA || null;

  let startOptions = {
    phoneNumber: async () => phoneNumber,
    phoneCode: async () => {
      const code = await ask("Введите код из Telegram: ");
      if (!code) throw new Error("EMPTY_CODE");
      return code;
    },
    onError: (err) => console.error("Ошибка авторизации:", err),
  };

  // Добавляем password только если есть 2FA в env
  if (twoFAEnv) {
    startOptions.password = async () => twoFAEnv;
  }

  for (let attempt = 1; attempt <= maxCodeRetries; attempt++) {
    try {
      console.log(`🔐 Авторизация (попытка ${attempt}/${maxCodeRetries})`);
      await client.start(startOptions);

      console.log("✅ Авторизация успешна.");
      fs.writeFileSync(cfg.sessionFile, JSON.stringify({ session: client.session.save() }, null, 2));
      console.log(`💾 Сессия сохранена в ${cfg.sessionFile}`);
      return;
    } catch (err) {
      const msg = (err && (err.message || err.errorMessage)) || String(err);
      // Если нужен пароль 2FA, но мы его не предоставили
      if (/SESSION_PASSWORD_NEEDED|Password is empty|Account has 2FA enabled/i.test(msg)) {
        console.log("🔐 Требуется пароль 2FA");
        const pwd = await ask("Введите пароль 2FA: ", { silent: true });
        if (pwd) {
          // Повторяем попытку с паролем
          startOptions.password = async () => pwd;
          continue;
        } else {
          console.error("⛔ Пароль 2FA обязателен для этого аккаунта");
          throw new Error("2FA password required");
        }
      }

      // типичные варианты ошибок кода
      const codeInvalid =
        /PHONE_CODE_INVALID|PHONE_CODE_EXPIRED|CODE_INVALID|PHONE_CODE_EMPTY|EMPTY_CODE/i.test(
          msg
        );

      if (codeInvalid && attempt < maxCodeRetries) {
        console.warn("❌ Код неверный/истёк. Повторим ввод…");
        continue;
      }
      console.error("⛔ Не удалось авторизоваться:", msg);
      throw err;
    }
  }
}

// -------- safe invoke with flood/ratelimit handling --------
async function safeInvoke(fn, desc = "request") {
  const {
    throttle: { maxRetries, retryBackoffMultiplier, floodWaitCapSec, betweenRequestsMs },
  } = cfg;

  let attempt = 0;
  let backoff = 1000;

  while (attempt <= maxRetries) {
    try {
      if (betweenRequestsMs > 0) await sleep(betweenRequestsMs);
      return await fn();
    } catch (err) {
      attempt++;
      const msg = (err && (err.message || err.errorMessage)) || String(err);

      // FLOOD_WAIT_x
      const floodMatch = msg.match(/FLOOD_WAIT_(\d+)/i);
      if (floodMatch) {
        const sec = Math.min(Number(floodMatch[1]) || 0, cfg.throttle.floodWaitCapSec || 900);
        console.warn(`⏳ FLOOD_WAIT: ждём ${sec} сек. (${desc})`);
        await sleep(sec * 1000);
        continue;
      }

      // миграции дата-центров — редкость, но обработаем
      const migrateMatch = msg.match(/(PHONE_MIGRATE_|NETWORK_MIGRATE_|USER_MIGRATE_)(\d+)/i);
      if (migrateMatch) {
        console.warn(`🔁 MIGRATE: ${migrateMatch[1]}${migrateMatch[2]} — повторим запрос.`);
        await sleep(1500);
        continue;
      }

      if (attempt <= maxRetries) {
        console.warn(`⚠️ Ошибка "${msg}". Повтор через ${backoff} мс. (${desc})`);
        await sleep(backoff);
        backoff *= retryBackoffMultiplier || 2;
        continue;
      }
      throw err;
    }
  }
}

// -------- deduplication logic --------
function deduplicateFile(filePath) {
  if (!fs.existsSync(filePath)) {
    console.error(`Файл не найден: ${filePath}`);
    return;
  }

  const fileName = filePath.split('/').pop();
  console.log(`🔄 Дедупликация ${fileName}...`);
  
  const allLines = fs
    .readFileSync(filePath, "utf8")
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);

  const originalCount = allLines.length;
  
  // Используем Set для удаления дублей
  const uniqueLines = [...new Set(allLines)];
  const uniqueCount = uniqueLines.length;
  const duplicatesRemoved = originalCount - uniqueCount;

  if (duplicatesRemoved > 0) {
    // Перезаписываем файл с уникальными строками
    fs.writeFileSync(filePath, uniqueLines.join('\n'), 'utf8');
    console.log(`✅ ${fileName}: удалено ${duplicatesRemoved} дублей. Осталось ${uniqueCount} уникальных строк.`);
  } else {
    console.log(`✅ ${fileName}: дубли не найдены. Всего строк: ${uniqueCount}`);
  }
}

function deduplicateAllFiles() {
  const filesToCheck = [
    cfg.search.queriesFile,
    'cities.txt',
    'words.txt'
  ];

  console.log("🔄 Проверка файлов на дубли...");
  
  filesToCheck.forEach(file => {
    if (fs.existsSync(file)) {
      deduplicateFile(file);
    }
  });
}

// -------- cities combinations logic --------
function generateCitiesQueries() {
  const citiesFile = "cities.txt";
  const wordsFile = "words.txt";
  const outputFile = "queries_cities.txt";

  if (!fs.existsSync(citiesFile)) {
    console.error(`Файл с городами не найден: ${citiesFile}`);
    return false;
  }

  if (!fs.existsSync(wordsFile)) {
    console.error(`Файл со словами не найден: ${wordsFile}`);
    return false;
  }

  console.log("🏙️ Генерация комбинаций городов и слов...");

  // Сначала дедуплицируем исходные файлы
  deduplicateFile(citiesFile);
  deduplicateFile(wordsFile);

  const cities = fs
    .readFileSync(citiesFile, "utf8")
    .split(/\r?\n/)
    .map((c) => c.trim())
    .filter(Boolean);

  let words = fs
    .readFileSync(wordsFile, "utf8")
    .split(/\r?\n/)
    .map((w) => w.trim())
    .filter(Boolean);

  console.log(`📍 Городов: ${cities.length}`);
  console.log(`📝 Слов: ${words.length}`);

  // Проверяем настройки двухуровневого парсинга
  const twoLevelConfig = cfg.search?.twoLevelParsing;
  let allCombinations = [];

  if (twoLevelConfig?.enabled) {
    console.log("🔄 Двухуровневый парсинг включен");
    
    // Первый уровень: первые N слов с высоким лимитом
    const firstLevelWords = words.slice(0, twoLevelConfig.firstLevel.maxWords);
    console.log(`📊 Первый уровень: ${firstLevelWords.length} слов, лимит ${twoLevelConfig.firstLevel.limitPerQuery}`);
    
    for (const city of cities) {
      for (const word of firstLevelWords) {
        allCombinations.push({
          query: `${city} ${word}`,
          level: 1,
          limit: twoLevelConfig.firstLevel.limitPerQuery
        });
      }
    }

    // Второй уровень: все слова с обычным лимитом
    if (twoLevelConfig.secondLevel.useAllWords) {
      console.log(`📊 Второй уровень: ${words.length} слов, лимит ${twoLevelConfig.secondLevel.limitPerQuery}`);
      
      for (const city of cities) {
        for (const word of words) {
          allCombinations.push({
            query: `${city} ${word}`,
            level: 2,
            limit: twoLevelConfig.secondLevel.limitPerQuery
          });
        }
      }
    }
  } else {
    // Обычный режим: все комбинации с одним лимитом
    console.log("🔄 Обычный режим генерации комбинаций");
    for (const city of cities) {
      for (const word of words) {
        allCombinations.push({
          query: `${city} ${word}`,
          level: 1,
          limit: cfg.search.limitPerQuery
        });
      }
    }
  }

  console.log(`🔄 Сгенерировано комбинаций: ${allCombinations.length}`);

  // Удаляем дубли по запросу
  const uniqueQueries = new Map();
  for (const combo of allCombinations) {
    const key = combo.query;
    if (!uniqueQueries.has(key) || uniqueQueries.get(key).level > combo.level) {
      uniqueQueries.set(key, combo);
    }
  }

  const uniqueCombinations = Array.from(uniqueQueries.values());
  const duplicatesRemoved = allCombinations.length - uniqueCombinations.length;

  if (duplicatesRemoved > 0) {
    console.log(`✅ Удалено ${duplicatesRemoved} дублей. Осталось ${uniqueCombinations.length} уникальных комбинаций.`);
  }

  // Сохраняем в файл с метаданными
  const output = uniqueCombinations.map(combo => 
    twoLevelConfig?.enabled ? 
      `${combo.query}|level:${combo.level}|limit:${combo.limit}` : 
      combo.query
  ).join('\n');

  fs.writeFileSync(outputFile, output, 'utf8');
  console.log(`💾 Комбинации сохранены в ${outputFile}`);

  return outputFile;
}

// -------- search logic --------
function sanitizeChat(chat) {
  // Унифицируем объект
  const id = (chat?.id && chat.id.toString && chat.id.toString()) || String(chat?.id || "");
  const username = chat?.username || null;
  const title = chat?.title || null;

  // тип: канал/супергруппа/группа
  let type = "group";
  try {
    if (chat?.megagroup) type = "supergroup";
    else if (chat?.broadcast) type = "channel";
  } catch { }
  const access_hash = chat?.accessHash || chat?.access_hash || null;

  return {
    id,
    title,
    username,
    type,
    access_hash,
    // participants_count часто недоступен из поиска; оставляем null
    participants_count: chat?.participantsCount || chat?.participants_count || null,
  };
}

async function searchByQueries(useCustomQueriesFile = null) {
  const {
    search: { queriesFile, limitPerQuery, saveFile, processedQueriesFile },
    throttle: { betweenQueriesMs },
  } = cfg;

  // Используем переданный файл или стандартный
  const actualQueriesFile = useCustomQueriesFile || queriesFile;

  if (!fs.existsSync(actualQueriesFile)) {
    console.error(`Файл с запросами не найден: ${actualQueriesFile}`);
    process.exit(1);
  }

  // Дедупликация всех файлов перед началом парсинга (только если используем стандартные файлы)
  if (!useCustomQueriesFile) {
    deduplicateAllFiles();
  }

  const allQueriesRaw = fs
    .readFileSync(actualQueriesFile, "utf8")
    .split(/\r?\n/)
    .map((q) => q.trim())
    .filter(Boolean);

  // Парсим запросы с метаданными (если есть)
  const allQueries = allQueriesRaw.map(line => {
    if (line.includes('|level:') && line.includes('|limit:')) {
      const parts = line.split('|');
      const query = parts[0];
      const level = parseInt(parts[1].replace('level:', ''));
      const limit = parseInt(parts[2].replace('limit:', ''));
      return { query, level, limit };
    }
    return { query: line, level: 1, limit: limitPerQuery };
  });

  // Загружаем уже обработанные запросы
  const processedQueries = new Set(loadJSON(processedQueriesFile, []));

  // Фильтруем только необработанные запросы
  const queries = allQueries.filter(q => !processedQueries.has(q.query));

  console.log(`🔎 Всего запросов: ${allQueries.length}`);
  console.log(`📋 Уже обработано: ${processedQueries.size}`);
  console.log(`⏳ К обработке: ${queries.length}`);

  if (queries.length === 0) {
    console.log("✅ Все запросы уже обработаны!");
    return;
  }

  const dedup = new Map(); // id -> entry
  const existing = loadJSON(saveFile, []);

  if (Array.isArray(existing)) {
    for (const row of existing) {
      if (row?.id) dedup.set(String(row.id), row);
    }
  }

  for (let i = 0; i < queries.length; i++) {
    const queryObj = queries[i];
    const { query: q, level, limit } = queryObj;
    
    console.log(`\n[${i + 1}/${queries.length}] Ищу: "${q}" (уровень ${level}, лимит ${limit})`);

    try {
      const res = await safeInvoke(
        () =>
          client.invoke(
            new Api.contacts.Search({
              q,
              limit: limit,
            })
          ),
        `contacts.Search("${q}")`
      );

      const chats = Array.isArray(res?.chats) ? res.chats : [];
      console.log(` → найдено объектов: ${chats.length}`);

      let newItemsCount = 0;
      for (const chat of chats) {
        const item = sanitizeChat(chat);
        if (!item.id) continue;
        if (!dedup.has(item.id)) {
          dedup.set(item.id, item);
          newItemsCount++;
        }
      }

      // Добавляем запрос в список обработанных
      processedQueries.add(q);

      // Немедленно сохраняем результаты и прогресс
      const arr = Array.from(dedup.values());
      fs.writeFileSync(saveFile, JSON.stringify(arr, null, 2), "utf8");
      fs.writeFileSync(processedQueriesFile, JSON.stringify(Array.from(processedQueries), null, 2), "utf8");

      console.log(` 💾 сохранено ${arr.length} уник. групп/каналов (+${newItemsCount} новых)`);
      console.log(` 📝 запрос "${q}" отмечен как обработанный`);

    } catch (err) {
      console.error(`⛔ Ошибка на запросе "${q}":`, err?.message || err);
      // Даже при ошибке отмечаем запрос как обработанный, чтобы не зацикливаться
      processedQueries.add(q);
      fs.writeFileSync(processedQueriesFile, JSON.stringify(Array.from(processedQueries), null, 2), "utf8");
      console.log(` 📝 запрос "${q}" отмечен как обработанный (с ошибкой)`);
    }

    if (betweenQueriesMs > 0 && i < queries.length - 1) {
      await sleep(betweenQueriesMs);
    }
  }

  console.log("\n✅ Готово.");
}

// -------- reset progress function --------
function resetProgress() {
  const { search: { processedQueriesFile } } = cfg;
  if (fs.existsSync(processedQueriesFile)) {
    fs.unlinkSync(processedQueriesFile);
    console.log(`🗑️ Прогресс сброшен. Удален файл: ${processedQueriesFile}`);
  } else {
    console.log("📝 Файл прогресса не найден, нечего сбрасывать.");
  }
}

// -------- help function --------
function showHelp() {
  console.log(`
📖 Использование: node parse.js [опции]

Опции:
  --cities           Генерировать комбинации из cities.txt и words.txt
  --reset-progress   Сбросить прогресс поиска
  --help            Показать эту справку

Примеры:
  node parse.js                    # Обычный поиск по queries.txt
  node parse.js --cities           # Поиск по комбинациям городов и слов
  node parse.js --reset-progress   # Сбросить прогресс

Файлы:
  queries.txt       - Поисковые запросы (обычный режим)
  cities.txt        - Список городов (режим --cities)
  words.txt         - Список слов (режим --cities)
  queries_cities.txt - Сгенерированные комбинации (создается автоматически)
`);
}

// -------- main --------
(async () => {
  // Проверяем аргументы командной строки
  if (process.argv.includes('--help')) {
    showHelp();
    return;
  }

  if (process.argv.includes('--reset-progress')) {
    resetProgress();
    return;
  }

  if (process.argv.includes('--cities')) {
    console.log("🏙️ Режим генерации комбинаций городов и слов");
    const citiesQueriesFile = generateCitiesQueries();
    if (citiesQueriesFile) {
      await ensureLoggedIn();
      await searchByQueries(citiesQueriesFile);
    }
    return;
  }

  await ensureLoggedIn();
  await searchByQueries();
})().catch((e) => {
  console.error("Фатальная ошибка:", e);
  process.exit(1);
});
