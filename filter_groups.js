import { TelegramClient } from "telegram";
import { StringSession } from "telegram/sessions/index.js";
import { Api } from "telegram/tl/index.js";
import fs from "fs";
import { config as dotenv } from "dotenv";

dotenv();

// -------- utils --------
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

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
  filter: {
    inputFile: "groups.json",
    outputFile: "filtered_groups.json",
    processedFile: "processed_filter.json",
    minParticipants: 1000,
  },
  throttle: {
    betweenRequestsMs: 1200,
    maxRetries: 3,
    retryBackoffMultiplier: 2,
    floodWaitCapSec: 900,
  },
  ...loadJSON("config.json", {}),
};

const apiId = Number(process.env.API_ID);
const apiHash = process.env.API_HASH;

if (!apiId || !apiHash) {
  console.error("Заполни .env: API_ID, API_HASH");
  process.exit(1);
}

// Загружаем сессию
const sessionData = loadJSON(cfg.sessionFile, { session: "" });
const stringSession = new StringSession(sessionData.session || "");
const client = new TelegramClient(stringSession, apiId, apiHash, { connectionRetries: 5 });

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

// -------- filter groups by participants --------
async function filterGroups() {
  const { filter: { inputFile, outputFile, processedFile, minParticipants } } = cfg;

  if (!fs.existsSync(inputFile)) {
    console.error(`Файл с группами не найден: ${inputFile}`);
    process.exit(1);
  }

  const allGroups = loadJSON(inputFile, []);
  const processedIds = new Set(loadJSON(processedFile, []));

  // Фильтруем только необработанные группы
  const groupsToProcess = allGroups.filter(group => !processedIds.has(group.id));

  console.log(`📊 Всего групп: ${allGroups.length}`);
  console.log(`✅ Уже обработано: ${processedIds.size}`);
  console.log(`⏳ К обработке: ${groupsToProcess.length}`);
  console.log(`🎯 Минимум участников: ${minParticipants}`);

  if (groupsToProcess.length === 0) {
    console.log("✅ Все группы уже обработаны!");
    return;
  }

  // Загружаем уже отфильтрованные группы
  const filteredGroups = loadJSON(outputFile, []);
  const filteredMap = new Map();
  filteredGroups.forEach(group => filteredMap.set(group.id, group));

  let passedCount = 0;
  let rejectedCount = 0;
  let errorCount = 0;

  for (let i = 0; i < groupsToProcess.length; i++) {
    const group = groupsToProcess[i];
    console.log(`\n[${i + 1}/${groupsToProcess.length}] Проверяю: "${group.title || group.username || group.id}"`);

    try {
      let participantsCount = 0;

      // Пробуем разные способы получения информации
      if (group.type === 'channel') {
        // Для каналов используем channels.GetFullChannel
        try {
          const fullInfo = await safeInvoke(
            () => client.invoke(new Api.channels.GetFullChannel({
              channel: new Api.InputChannel({
                channelId: BigInt(group.id),
                accessHash: BigInt(group.access_hash || 0)
              })
            })),
            `GetFullChannel(${group.title || group.id})`
          );
          participantsCount = fullInfo?.fullChat?.participantsCount || 0;
        } catch (channelErr) {
          console.log(`   ⚠️ Ошибка получения информации о канале: ${channelErr.message}`);
        }
      } else {
        // Для групп используем messages.GetFullChat
        try {
          const fullInfo = await safeInvoke(
            () => client.invoke(new Api.messages.GetFullChat({
              chatId: BigInt(Math.abs(group.id))
            })),
            `GetFullChat(${group.title || group.id})`
          );
          participantsCount = fullInfo?.fullChat?.participantsCount || 0;
        } catch (groupErr) {
          console.log(`   ⚠️ Ошибка получения информации о группе: ${groupErr.message}`);
        }
      }

      // Обновляем информацию о группе
      group.participants_count = participantsCount;

      if (participantsCount >= minParticipants) {
        filteredMap.set(group.id, group);
        passedCount++;
        console.log(`   ✅ ПРОШЛА: ${participantsCount} участников`);
      } else {
        rejectedCount++;
        console.log(`   ❌ НЕ ПРОШЛА: ${participantsCount} участников (< ${minParticipants})`);
      }

    } catch (err) {
      errorCount++;
      console.error(`   ⛔ Ошибка: ${err.message}`);
      // При ошибке не добавляем в отфильтрованные, но отмечаем как обработанную
    }

    // Отмечаем как обработанную
    processedIds.add(group.id);

    // Сохраняем прогресс после каждой группы
    const currentFiltered = Array.from(filteredMap.values());
    fs.writeFileSync(outputFile, JSON.stringify(currentFiltered, null, 2), "utf8");
    fs.writeFileSync(processedFile, JSON.stringify(Array.from(processedIds), null, 2), "utf8");

    console.log(`   💾 Прогресс: ${currentFiltered.length} подходящих групп сохранено`);
  }

  console.log(`\n✅ Фильтрация завершена!`);
  console.log(`📊 Статистика:`);
  console.log(`   ✅ Прошли фильтр: ${passedCount}`);
  console.log(`   ❌ Не прошли: ${rejectedCount}`);
  console.log(`   ⛔ Ошибки: ${errorCount}`);
  console.log(`   📁 Результат сохранен в: ${outputFile}`);
}

// -------- reset progress function --------
function resetProgress() {
  const { filter: { processedFile } } = cfg;
  if (fs.existsSync(processedFile)) {
    fs.unlinkSync(processedFile);
    console.log(`🗑️ Прогресс фильтрации сброшен. Удален файл: ${processedFile}`);
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

  await client.connect();
  console.log("✅ Подключился к Telegram");

  await filterGroups();
})().catch((e) => {
  console.error("Фатальная ошибка:", e);
  process.exit(1);
});