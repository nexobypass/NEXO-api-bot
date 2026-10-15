import { REST, Routes, SlashCommandBuilder } from 'discord.js';

// Registers the /apikeydm slash command with Discord.
// Run this once: `node register-commands.js`
// The command appears globally (all servers the bot is in) within
// ~1 hour. For instant testing in one server, set GUILD_ID and
// it registers immediately.

const BOT_TOKEN = process.env.BOT_TOKEN;
const CLIENT_ID = process.env.CLIENT_ID;
const GUILD_ID = process.env.GUILD_ID;

if (!BOT_TOKEN || !CLIENT_ID) {
  console.error('❌ BOT_TOKEN and CLIENT_ID must be set.');
  console.error('Example: BOT_TOKEN=xxx CLIENT_ID=xxx node register-commands.js');
  process.exit(1);
}

const commands = [
  new SlashCommandBuilder()
    .setName('apikeydm')
    .setDescription('Generate a premium NEXO API key and DM it to you')
    .toJSON(),
];

const rest = new REST({ version: '10' }).setToken(BOT_TOKEN);

try {
  console.log('⏳ Registering slash command...');

  if (GUILD_ID) {
    // Guild-specific (instant)
    await rest.put(Routes.applicationGuildCommands(CLIENT_ID, GUILD_ID), {
      body: commands,
    });
    console.log('✅ Registered /apikeydm in guild (instant).');
  } else {
    // Global (1hr propagation)
    await rest.put(Routes.applicationCommands(CLIENT_ID), {
      body: commands,
    });
    console.log('✅ Registered /apikeydm globally (takes ~1hr to appear).');
  }
} catch (err) {
  console.error('❌ Registration failed:', err);
}
