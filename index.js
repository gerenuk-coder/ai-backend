require('dotenv').config();
const express = require('express');
const cors = require('cors');
const fetch = require('node-fetch');

const app = express();
const PORT = process.env.PORT || 3000;
const AIML_API_KEY = process.env.AIML_API_KEY;

// Environment variable safety
if (!AIML_API_KEY) {
  console.error('CRITICAL ERROR: AIML_API_KEY is missing in environment variables.');
  console.error('Please add it to your .env file and restart the server.');
  process.exit(1);
}

// Middleware
app.use(cors());
app.use(express.json());

// Helper for API headers
const getHeaders = () => ({
  'Authorization': `Bearer ${AIML_API_KEY}`,
  'Content-Type': 'application/json'
});

const BASE_URL = 'https://api.aimlapi.com';

/**
 * Endpoint: POST /generate-image
 * Input: { prompt }
 * Call AIMLAPI image endpoint (stable-diffusion-xl)
 */
app.post('/generate-image', async (req, res) => {
  const { prompt } = req.body;

  if (!prompt) {
    return res.status(400).json({ error: 'Prompt is required' });
  }

  // Timeout protection (30 seconds)
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 30000);

  try {
    console.log(`Generating image for prompt: "${prompt}"`);
    const response = await fetch(`${BASE_URL}/v1/images/generations`, {
      method: 'POST',
      headers: getHeaders(),
      signal: controller.signal,
      body: JSON.stringify({
        model: 'stable-diffusion-xl',
        prompt: prompt,
        n: 1,
        size: '1024x1024'
      })
    });

    const data = await response.json();
    clearTimeout(timeoutId);

    if (!response.ok) {
      console.error('Image API Error Response:', JSON.stringify(data, null, 2));
      return res.status(response.status).json({
        error: data.error?.message || 'Failed to generate image',
        details: data
      });
    }

    // Return the first image URL
    const imageUrl = data.data?.[0]?.url;
    res.json({ imageUrl });
  } catch (error) {
    clearTimeout(timeoutId);
    const isTimeout = error.name === 'AbortError';
    console.error(`Error generating image: ${isTimeout ? 'Request timed out' : error.message}`);
    res.status(isTimeout ? 408 : 500).json({
      error: isTimeout ? 'API request timed out after 30 seconds' : error.message
    });
  }
});

/**
 * Endpoint: POST /generate-video
 * Input: { prompt }
 * Call AIMLAPI video endpoint
 */
app.post('/generate-video', async (req, res) => {
  const { prompt } = req.body;

  if (!prompt) {
    return res.status(400).json({ error: 'Prompt is required' });
  }

  // Timeout protection (30 seconds)
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 30000);

  try {
    console.log(`Generating video for prompt: "${prompt}"`);
    const response = await fetch(`${BASE_URL}/v2/video/generations`, {
      method: 'POST',
      headers: getHeaders(),
      signal: controller.signal,
      body: JSON.stringify({
        model: 'kling-video/v1/standard/text-to-video',
        prompt: prompt
      })
    });

    const data = await response.json();
    clearTimeout(timeoutId);

    if (!response.ok) {
      console.error('Video Generation API Error Response:', JSON.stringify(data, null, 2));
      return res.status(response.status).json({
        error: data.error?.message || 'Failed to start video generation',
        details: data
      });
    }

    // Return the job_id (id)
    res.json({ job_id: data.id });
  } catch (error) {
    clearTimeout(timeoutId);
    const isTimeout = error.name === 'AbortError';
    console.error(`Error starting video generation: ${isTimeout ? 'Request timed out' : error.message}`);
    res.status(isTimeout ? 408 : 500).json({
      error: isTimeout ? 'API request timed out after 30 seconds' : error.message
    });
  }
});

/**
 * Endpoint: GET /video-status/:id
 * Call AIMLAPI status endpoint
 */
app.get('/video-status/:id', async (req, res) => {
  const { id } = req.params;

  // Timeout protection (30 seconds)
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 30000);

  try {
    console.log(`Checking status for video job ID: ${id}`);
    const response = await fetch(`${BASE_URL}/v2/video/generations?id=${id}`, {
      method: 'GET',
      headers: getHeaders(),
      signal: controller.signal
    });

    const data = await response.json();
    clearTimeout(timeoutId);

    if (!response.ok) {
      console.error('Video Status API Error Response:', JSON.stringify(data, null, 2));
      return res.status(response.status).json({
        error: data.error?.message || 'Failed to fetch video status',
        details: data
      });
    }

    // Safely extract video URL using multiple fallbacks
    const videoUrl = data.video?.url ||
      data.output?.video_url ||
      data.data?.video_url ||
      null;

    // Return status, extracted video URL, and full raw response
    res.json({
      status: data.status,
      videoUrl: videoUrl,
      raw: data
    });
  } catch (error) {
    clearTimeout(timeoutId);
    const isTimeout = error.name === 'AbortError';
    console.error(`Error checking video status: ${isTimeout ? 'Request timed out' : error.message}`);
    res.status(isTimeout ? 408 : 500).json({
      error: isTimeout ? 'API request timed out after 30 seconds' : error.message
    });
  }
});

// Basic health check
app.get('/', (req, res) => {
  res.send('AI Generation Backend is running');
});

// Start Server
app.listen(PORT, () => {
  console.log(`Server is running on http://localhost:${PORT}`);
});
