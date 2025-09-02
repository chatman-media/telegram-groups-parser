# Telegram Groups Parser

**Languages:** [English](#english) | [Русский](README.ru.md)

A tool for searching and filtering Telegram groups/channels by keywords and participant count.

## English

### Features
- Search Telegram groups/channels by keywords
- Generate city+word combinations for comprehensive regional search
- Automatic deduplication of all text files (queries, cities, words)
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

**Option A: Regular search**
```bash
node parse.js
```

**Option B: Cities combinations search**
```bash
node parse.js --cities
```

**Other options:**
```bash
node parse.js --reset-progress    # Reset search progress
node parse.js --help             # Show help
```

This will:
- Automatically remove duplicates from `queries.txt`, `cities.txt`, and `words.txt`
- Search for groups/channels using keywords from `queries.txt` (regular mode) or generated combinations (cities mode)
- Save results with participant counts to `groups.json`
- Track progress in `processed_queries.json`
- Resume from where it left off if interrupted

**Cities mode (`--cities`):**
- Generates all combinations from `cities.txt` and `words.txt`
- Creates `queries_cities.txt` with combinations like "Moscow work", "Moscow freelance", etc.
- Uses these combinations for search instead of `queries.txt`

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
    "processedQueriesFile": "processed_queries.json",
    "twoLevelParsing": {
      "enabled": true,
      "firstLevel": {
        "limitPerQuery": 100,
        "maxWords": 30
      },
      "secondLevel": {
        "limitPerQuery": 20,
        "useAllWords": true
      }
    }
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

### Web Interface

A modern web interface is available for easier management:

```bash
npm run dev     # Start development server
npm run build   # Build for production
npm start       # Start production server
```

**Features:**
- 🔍 **Parsing Control** - Start/stop parsing with real-time logs
- 📋 **ID Extraction** - Extract group IDs with filtering options
- 📁 **File Management** - Edit queries, cities, words files
- ⚙️ **Configuration** - Manage all settings including two-level parsing
- 📊 **Statistics** - Real-time stats with progress tracking

**Access:** Open http://localhost:3000 in your browser

### 🔄 Two-Level Parsing

New feature for more efficient data collection in cities mode:

**How it works:**
1. **First Level**: Uses high limit (100) for first N words (30)
2. **Second Level**: Uses regular limit (20) for all words

**Benefits:**
- More results for popular queries
- Time savings on less popular queries
- Flexible configuration

**Example:**
- 28 cities × 30 first words = 840 queries with limit 100
- 28 cities × 129 all words = 3612 queries with limit 20
- Total: 4452 queries instead of 3612 in regular mode

**Configuration parameters:**
- `twoLevelParsing.enabled` - enable two-level parsing
- `firstLevel.limitPerQuery` - results limit for first level (high)
- `firstLevel.maxWords` - number of first words for first level
- `secondLevel.limitPerQuery` - results limit for second level (regular)
- `secondLevel.useAllWords` - use all words for second level

**Testing:**
```bash
node test_two_level.js  # Check two-level parsing settings
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



## Files

- `parse.js` - Main search script
- `extract_ids.js` - ID extraction script
- `config.json` - Configuration
- `queries.txt` - Search keywords (regular mode)
- `cities.txt` - List of cities (for --cities mode)
- `words.txt` - List of words (for --cities mode)
- `queries_cities.txt` - Generated city+word combinations
- `groups.json` - All found groups with participant counts
- `group_ids.txt` - Extracted group IDs
- `processed_queries.json` - Search progress
- `session.json` - Telegram session
- `test_two_level.js` - Two-level parsing test utility

## Troubleshooting

### Common Issues

1. **"Password is empty" error**
   - Add your 2FA password to `.env` file
   - Or enter it when prompted

2. **FLOOD_WAIT errors**
   - The script automatically handles these
   - Increase delays in config if needed

3. **Session expired**
   - Delete `session.json` and re-authenticate

4. **No groups found**
   - Check your search terms in `queries.txt`
   - Try more general keywords

5. **Two-level parsing not working**
   - Check configuration in `config.json`
   - Run `node test_two_level.js` to verify settings
   - Ensure `cities.txt` and `words.txt` exist