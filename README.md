# Telegram Groups Parser

**Languages:** [English](#english) | [Русский](README.ru.md)

A tool for searching and filtering Telegram groups/channels by keywords and participant count.

## English

### Features
- Search Telegram groups/channels by keywords
- Filter results by minimum participant count
- Resume interrupted operations (progress tracking)
- Rate limiting and flood protection
- Separate search and filtering processes for better performance

### Setup

1. **Install dependencies:**
   ```bash
   npm install telegram
   ```

2. **Create Telegram API credentials:**
   - Go to https://my.telegram.org/apps
   - Create a new application
   - Get your `API_ID` and `API_HASH`

3. **Configure environment:**
   Create `.env` file:
   ```env
   API_ID=your_api_id
   API_HASH=your_api_hash
   PHONE_NUMBER=+1234567890
   TG_2FA=your_2fa_password  # Optional, only if you have 2FA enabled
   ```

4. **Prepare search queries:**
   Create `queries.txt` file with one search term per line:
   ```
   crypto trading
   bitcoin
   ethereum
   programming
   ```

### Usage

#### Step 1: Search for groups
```bash
node parse.js
```
This will:
- Search for groups/channels using keywords from `queries.txt`
- Save results with participant counts to `groups.json`
- Track progress in `processed_queries.json`
- Resume from where it left off if interrupted

#### Step 2: Extract group IDs (optional)
```bash
node extract_ids.js                    # Extract IDs with participant filtering
node extract_ids.js --with-usernames   # Extract IDs with usernames
node extract_ids.js --no-filter        # Extract all IDs without filtering
node extract_ids.js --help             # Show help
```
This will:
- Read groups from `groups.json`
- Filter by minimum participant count (from config)
- Extract only group IDs (one per line)
- Save to `group_ids.txt`

### Configuration

Edit `config.json` to customize settings:

```json
{
  "search": {
    "queriesFile": "queries.txt",
    "limitPerQuery": 20,
    "saveFile": "groups.json",
    "processedQueriesFile": "processed_queries.json"
  },
  "extract": {
    "inputFile": "groups.json",
    "outputFile": "group_ids.txt",
    "includeUsernames": false,
    "minParticipants": 1000,
    "filterByParticipants": true
  },
  "throttle": {
    "betweenQueriesMs": 3000,
    "betweenRequestsMs": 1200,
    "maxRetries": 3,
    "retryBackoffMultiplier": 2,
    "floodWaitCapSec": 900
  }
}
```

### Reset Progress
```bash
node parse.js --reset-progress        # Reset search progress
```

### Output Format

Groups are saved in JSON format:
```json
[
  {
    "id": "123456789",
    "title": "Group Name",
    "username": "group_username",
    "type": "supergroup",
    "access_hash": "hash_value",
    "participants_count": 1500
  }
]
```



## Files / Файлы

- `parse.js` - Main search script / Основной скрипт поиска
- `extract_ids.js` - ID extraction script / Скрипт извлечения ID
- `config.json` - Configuration / Конфигурация
- `queries.txt` - Search keywords / Ключевые слова для поиска
- `groups.json` - All found groups with participant counts / Все найденные группы с количеством участников
- `group_ids.txt` - Extracted group IDs / Извлеченные ID групп
- `processed_queries.json` - Search progress / Прогресс поиска
- `session.json` - Telegram session / Сессия Telegram

## Troubleshooting / Решение проблем

### Common Issues / Частые проблемы

1. **"Password is empty" error / Ошибка "Password is empty"**
   - Add your 2FA password to `.env` file / Добавьте пароль 2FA в файл `.env`
   - Or enter it when prompted / Или введите его при запросе

2. **FLOOD_WAIT errors / Ошибки FLOOD_WAIT**
   - The script automatically handles these / Скрипт автоматически обрабатывает их
   - Increase delays in config if needed / Увеличьте задержки в конфиге при необходимости

3. **Session expired / Сессия истекла**
   - Delete `session.json` and re-authenticate / Удалите `session.json` и авторизуйтесь заново

4. **No groups found / Группы не найдены**
   - Check your search terms in `queries.txt` / Проверьте поисковые термины в `queries.txt`
   - Try more general keywords / Попробуйте более общие ключевые слова