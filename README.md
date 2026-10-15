# NEXO API Bot

Discord bot for the NEXO API — generates and DMs API keys via the `/apikeydm` slash command.

## Setup

### 1. Install dependencies

```bash
cd nexo-bot
npm install
```

### 2. Create a Discord bot

1. Go to https://discord.com/developers/applications
2. Click "New Application" → name it "NEXO API Bot"
3. Go to the "Bot" tab → click "Add Bot"
4. Copy the **Bot Token**
5. Copy the **Application ID** (from the "General Information" tab)
6. Enable these **Privileged Gateway Intents**: none needed (we only use slash commands)

### 3. Set environment variables

Create a `.env` file:

```
BOT_TOKEN=your_bot_token_here
CLIENT_ID=your_application_id_here
GUILD_ID=your_test_server_id_here
DATABASE_URL=libsql://your-turso-db.turso.io?authToken=your_token
```

- `BOT_TOKEN` — from the Discord Developer Portal
- `CLIENT_ID` — Application ID from the Developer Portal
- `GUILD_ID` — (optional) your Discord server ID for instant command registration. Right-click your server name → "Copy ID" (enable Developer Mode in Discord settings first). Omit for global registration (1hr delay).
- `DATABASE_URL` — your Turso database URL (same one Cloudflare Pages uses). Must start with `libsql://`.

### 4. Register the slash command

```bash
node register-commands.js
```

### 5. Invite the bot to your server

Go to the Discord Developer Portal → your application → "OAuth2" → "URL Generator":
- Scopes: `bot`, `applications.commands`
- Bot Permissions: `Send Messages`, `Embed Links`

Copy the URL and open it in your browser to invite the bot.

### 6. Start the bot

```bash
node index.js
```

### 7. Use it

Type `/apikeydm` in any channel. The bot will:
1. Generate a 32-char premium API key
2. Insert it into your Turso database (same DB the NEXO API uses)
3. DM you the key in an embed with usage instructions
4. Reply in the channel with "✅ API key generated and sent to your DMs!"

## Features

- **`/apikeydm`** — generates a premium API key and DMs it to the user
- **Cooldown** — 1 use per user per hour (in-memory)
- **Database integration** — inserts the key directly into the Turso database, so it works immediately with the NEXO bypass API
- **DM-only delivery** — the key is never shown in the channel, only in DMs
- **Ephemeral confirmation** — the channel reply is ephemeral (only the user sees it)

## Hosting

Run it on any Node.js host:
- **Railway** — connect the repo, set env vars, deploy
- **Render** — create a background worker, set env vars
- **Fly.io** — `fly deploy`
- **A VPS** — `pm2 start index.js`

## License

MIT
