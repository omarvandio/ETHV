const express = require('express');
const { Client, GatewayIntentBits } = require('discord.js');
const { handleMessage } = require('./commands');
const { evaluateSurvival } = require('./survival-rules');

const app = express();
app.use(express.json());
const PORT = process.env.PORT || 3000;

// Discord bot
const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent,
  ]
});

client.on('ready', () => {
  console.log(`[ETHV] Bot online: ${client.user.tag}`);
});

client.on('messageCreate', async (message) => {
  if (message.author.bot) return;
  if (!message.content.startsWith('/')) return;

  const response = await handleMessage({
    text: message.content,
    userId: message.author.id,
    channelId: message.channelId,
  });

  if (response?.text) {
    await message.channel.send(response.text);
  }
});

app.get('/', (req, res) => res.json({ agent: 'ETHV', status: 'online' }));

app.listen(PORT, () => console.log(`[ETHV] Server en puerto ${PORT}`));

const token = process.env.DISCORD_BOT_TOKEN;
if (token) {
  client.login(token);
} else {
  console.error('[ETHV] DISCORD_BOT_TOKEN no configurado');
}
