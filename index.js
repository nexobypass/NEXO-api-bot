import { Client, GatewayIntentBits, Events, EmbedBuilder, SlashCommandBuilder, Routes } from 'discord.js';
import crypto from 'crypto';
import https from 'https';

// ─── Config ─────────────────────────────────────────────────
// All secrets come from environment variables. Set these on your
// hosting platform (or in a .env file):
//   BOT_TOKEN     — Discord bot token from the Developer Portal
//   CLIENT_ID     — Application ID from the Developer Portal
//   GUILD_ID      — (optional) server ID for instant command
//                   registration. Omit for global commands (1hr
//                   propagation delay).
//   DATABASE_URL  — Turso/libsql URL for the NEXO API database
//                   (same one Cloudflare Pages uses)
//   ADMIN_SECRET  — HMAC secret for signing session cookies
//                   (same one the bypass route uses)

const BOT_TOKEN = process.env.BOT_TOKEN;
const CLIENT_ID = process.env.CLIENT_ID;
const GUILD_ID = process.env.GUILD_ID; // optional

// ─── API key generation ─────────────────────────────────────
// Generates a 32-char alphanumeric key, inserts it into the
// ApiKey table in the Turso database, and returns it.
async function generateApiKey(label) {
  const key = crypto.randomBytes(16).toString('hex'); // 32 chars
  const id = crypto.randomUUID();
  const now = new Date().toISOString();

  // Insert into the Turso database via raw SQL over HTTP.
  // We use the libsql HTTP API (Turso's REST endpoint) to avoid
  // pulling in the @libsql/client dependency.
  const dbUrl = process.env.DATABASE_URL;
  if (!dbUrl || !dbUrl.startsWith('libsql://')) {
    throw new Error('DATABASE_URL not set or not a libsql:// URL');
  }

  // Parse authToken from the URL
  let authToken = '';
  let urlWithoutToken = dbUrl;
  try {
    const parsed = new URL(dbUrl);
    authToken = parsed.searchParams.get('authToken') || '';
    parsed.searchParams.delete('authToken');
    urlWithoutToken = parsed.toString().replace(/\?$/, '');
  } catch {}

  // Execute SQL via Turso's HTTP API
  const sql = `INSERT INTO "ApiKey" ("id", "key", "label", "premium", "active", "useCount", "lastUsedAt", "createdAt", "updatedAt") VALUES ('${id}', '${key}', '${label}', 1, 1, 0, NULL, '${now}', '${now}')`;
  
  const result = await tursoExecute(urlWithoutToken, authToken, sql);
  if (!result.ok) {
    throw new Error(`DB error: ${result.error || 'unknown'}`);
  }

  return key;
}

// ─── Turso HTTP API helper ──────────────────────────────────
// Calls Turso's /v2/pipeline endpoint to execute raw SQL.
async function tursoExecute(dbUrl, authToken, sql) {
  // Convert libsql:// to https:// for the REST API
  const httpUrl = dbUrl.replace('libsql://', 'https://').replace('http://', 'https://');
  
  const body = JSON.stringify({
    requests: [{ type: 'execute', stmt: { sql } }],
  });

  return new Promise((resolve) => {
    const url = new URL(`${httpUrl}/v2/pipeline`);
    if (authToken) url.searchParams.set('authToken', authToken);

    const options = {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...(authToken ? { Authorization: `Bearer ${authToken}` } : {}),
      },
    };

    const req = https.request(url, options, (res) => {
      let data = '';
      res.on('data', (chunk) => (data += chunk));
      res.on('end', () => {
        try {
          const json = JSON.parse(data);
          resolve({ ok: res.statusCode === 200, error: json.error || undefined });
        } catch {
          resolve({ ok: res.statusCode === 200, error: data });
        }
      });
    });

    req.on('error', (err) => resolve({ ok: false, error: err.message }));
    req.write(body);
    req.end();
  });
}

// ─── Bot setup ──────────────────────────────────────────────
const client = new Client({
  intents: [GatewayIntentBits.Guilds],
});

client.once(Events.ClientReady, (c) => {
  console.log(`✅ Bot logged in as ${c.user.tag}`);
});

// ─── Owner/admin IDs ───────────────────────────────────────
// Set these in env vars. Only these users can run /apikeydm.
//   OWNER_IDS — comma-separated Discord user IDs who can use the command
// Leave empty to allow everyone (not recommended).
const OWNER_IDS = (process.env.OWNER_IDS || '')
  .split(',')
  .map((s) => s.trim())
  .filter(Boolean);

function isAuthorized(userId) {
  // If no OWNER_IDS set, allow everyone (open mode).
  // If OWNER_IDS is set, only allow listed users.
  if (OWNER_IDS.length === 0) return true;
  return OWNER_IDS.includes(userId);
}

// ─── Slash command: /apikeydm ──────────────────────────────
// Generates a new premium API key and DMs it to the user who
// ran the command. The key is inserted into the Turso database
// (same DB the NEXO API uses), so it works immediately with
// /api/bypass.
//
// Owner-only: only users listed in OWNER_IDS env var can run it.
// Rate-limited to 1 use per user per hour via a simple in-memory map.
const cooldowns = new Map(); // userId -> timestamp
const COOLDOWN_MS = 60 * 60 * 1000; // 1 hour

client.on(Events.InteractionCreate, async (interaction) => {
  if (!interaction.isChatInputCommand()) return;
  if (interaction.commandName !== 'apikeydm') return;

  // Authorization check — only owner/admin IDs can use this
  if (!isAuthorized(interaction.user.id)) {
    await interaction.reply({
      content: '❌ You are not authorized to use this command. Only the bot owner can generate API keys.',
      ephemeral: true,
    });
    return;
  }

  // Check cooldown
  const now = Date.now();
  const lastUsed = cooldowns.get(interaction.user.id);
  if (lastUsed && now - lastUsed < COOLDOWN_MS) {
    const remaining = Math.ceil((COOLDOWN_MS - (now - lastUsed)) / 60000);
    await interaction.reply({
      content: `You're on cooldown. Try again in ${remaining} minute(s).`,
      ephemeral: true,
    });
    return;
  }

  await interaction.deferReply({ ephemeral: true });

  try {
    // Determine the target user: if the owner specified a user
    // via the optional `user` option, DM the key to them. Otherwise
    // DM it to the person who ran the command.
    const targetUser = interaction.options.getUser('user') || interaction.user;
    const isForOther = targetUser.id !== interaction.user.id;

    // Generate the key
    const label = `Discord:${targetUser.username} (${targetUser.id})`;
    const key = await generateApiKey(label);

    // Set cooldown (on the person who ran the command, not the target)
    cooldowns.set(interaction.user.id, now);

    // Build the DM embed
    const embed = new EmbedBuilder()
      .setColor(0xfb923c)
      .setTitle('🔑 Your NEXO API Key')
      .setDescription(isForOther
        ? `You've been given a premium NEXO API key by **${interaction.user.username}**. Keep it private — anyone with this key can use the NEXO bypass API.`
        : 'Here is your premium API key. Keep it private — anyone with this key can use the NEXO bypass API.')
      .addFields(
        { name: 'API Key', value: `\`${key}\``, inline: false },
        { name: 'Type', value: 'Premium', inline: true },
        { name: 'Status', value: 'Active', inline: true },
        { name: 'Created', value: `<t:${Math.floor(now / 1000)}:R>`, inline: true },
      )
      .addFields({
        name: 'How to use',
        value: '```\nGET https://nexoapi.pages.dev/api/bypass?apikey=YOUR_KEY&url=TARGET_URL\n```',
        inline: false,
      })
      .addFields({
        name: 'Rate limits',
        value: 'Default: 20 requests per minute per IP. Contact an admin for higher limits.',
        inline: false,
      })
      .setFooter({ text: 'NEXO API · Powered by alysse.top' })
      .setTimestamp();

    // Send the DM to the target user
    await targetUser.send({ embeds: [embed] });

    // Confirm to the owner in the channel (ephemeral)
    await interaction.editReply({
      content: isForOther
        ? `✅ API key generated and DM'd to **${targetUser.username}**.`
        : '✅ API key generated and sent to your DMs! Check your messages.',
    });
  } catch (err) {
    console.error('apikeydm error:', err);
    await interaction.editReply({
      content: `❌ Failed to generate API key: ${err.message}`,
    });
  }
});

// ─── Login ──────────────────────────────────────────────────
if (!BOT_TOKEN) {
  console.error('❌ BOT_TOKEN not set. Create a .env file or set the environment variable.');
  process.exit(1);
}

client.login(BOT_TOKEN);
