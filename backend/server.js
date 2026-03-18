const express = require('express');
const cors = require('cors');
const http = require('http');
const { Client, GatewayIntentBits } = require('discord.js');

const app = express();
const PORT = process.env.PORT || 3002;

app.use(cors());
app.use(express.json());

const discordClient = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent
  ]
});

app.get('/health', (req, res) => {
  res.json({ status: 'ok' });
});

app.post('/v1/chat/completions', async (req, res) => {
  try {
    const response = await fetch('http://localhost:18789/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': 'Bearer bd1177ff2d28a2c4ceew1e08fee975fc9'
      },
      body: JSON.stringify(req.body)
    });
    
    const data = await response.json();
    res.json(data);
  } catch (error) {
    console.error('Error proxying to OpenClaw gateway:', error);
    res.status(500).json({ error: 'Failed to proxy request' });
  }
});

app.post('/api/analyze-linkedin', async (req, res) => {
  try {
    const { profileUrl, profileData } = req.body;
    
    const analysis = {
      profileUrl: profileUrl || 'provided',
      skills: profileData?.skills || [],
      experience: profileData?.experience || [],
      recommendations: [],
      score: 0
    };
    
    if (profileData?.skills) {
      analysis.score += profileData.skills.length * 10;
    }
    if (profileData?.experience) {
      analysis.score += profileData.experience.length * 15;
    }
    
    if (analysis.score < 30) {
      analysis.recommendations.push('Consider adding more skills to your profile');
    }
    if (!profileData?.experience || profileData.experience.length < 2) {
      analysis.recommendations.push('Add more work experience to increase visibility');
    }
    
    res.json({ success: true, analysis });
  } catch (error) {
    console.error('Error analyzing LinkedIn profile:', error);
    res.status(500).json({ success: false, error: 'Failed to analyze profile' });
  }
});

const server = app.listen(PORT, () => {
  console.log('ETHV Backend server running on port ' + PORT);
  console.log('Health endpoint: http://localhost:' + PORT + '/health');
  console.log('Chat completions: http://localhost:' + PORT + '/v1/chat/completions');
  console.log('LinkedIn analysis: http://localhost:' + PORT + '/api/analyze-linkedin');
});

process.on('SIGTERM', () => {
  console.log('SIGTERM received, shutting down gracefully');
  server.close(() => {
    discordClient.destroy();
    process.exit(0);
  });
});

module.exports = app;