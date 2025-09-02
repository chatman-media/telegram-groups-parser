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

async function searchByQueries() {
  const {
    search: { queriesFile, limitPerQuery, saveFile, processedQueriesFile },
    throttle: { betweenQueriesMs },
  } = cfg;

  if (!fs.existsSync(queriesFile)) {
    console.error(`Файл с запросами не найден: ${queriesFile}`);
    process.exit(1);
  }

  const allQueries = fs
    .readFileSync(queriesFile, "utf8")
    .split(/\r?\n/)
    .map((q) => q.trim())
    .filter(Boolean);

  // Загружаем уже обработанные запросы
  const processedQueries = new Set(loadJSON(processedQueriesFile, []));

  // Фильтруем только необработанные запросы
  const queries = allQueries.filter(q => !processedQueries.has(q));

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
    const q = queries[i];
    console.log(`\n[${i + 1}/${queries.length}] Ищу: "${q}"`);

    try {
      const res = await safeInvoke(
        () =>
          client.invoke(
            new Api.contacts.Search({
              q,
              limit: limitPerQuery,
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

// -------- main --------
(async () => {
  // Проверяем аргументы командной строки
  if (process.argv.includes('--reset-progress')) {
    resetProgress();
    return;
  }

  await ensureLoggedIn();
  await searchByQueries();
})().catch((e) => {
  console.error("Фатальная ошибка:", e);
  process.exit(1);
});
