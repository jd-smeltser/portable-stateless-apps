/**
 * BYOK AI Client - Gemini
 * Stores API key locally, calls Gemini directly from browser
 */

const AI_DB_NAME = 'ai-settings';
const AI_STORE = 'config';

// Initialize Dexie DB for AI settings
const aiDb = new Dexie(AI_DB_NAME);
aiDb.version(1).stores({
  [AI_STORE]: 'key'
});

export const AI = {
  MODELS: {
    PRO: 'gemini-2.5-pro',
    FLASH: 'gemini-2.5-flash',
    LITE: 'gemini-2.5-flash-lite'
  },

  /**
   * Store API key in IndexedDB
   */
  async setApiKey(apiKey) {
    await aiDb[AI_STORE].put({ key: 'gemini_api_key', value: apiKey });
  },

  /**
   * Get stored API key
   */
  async getApiKey() {
    const record = await aiDb[AI_STORE].get('gemini_api_key');
    return record?.value || null;
  },

  /**
   * Check if API key is configured
   */
  async hasApiKey() {
    const key = await this.getApiKey();
    return !!key;
  },

  /**
   * Clear stored API key
   */
  async clearApiKey() {
    await aiDb[AI_STORE].delete('gemini_api_key');
  },

  /**
   * Call Gemini API
   */
  async call(prompt, options = {}) {
    const apiKey = await this.getApiKey();
    if (!apiKey) {
      throw new Error('No API key configured');
    }

    const model = options.model || this.MODELS.FLASH;
    const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`;

    let response;
    try {
      response = await fetch(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          contents: [{
            parts: [{ text: prompt }]
          }],
          generationConfig: {
            temperature: options.temperature ?? 0.7,
            maxOutputTokens: options.maxTokens ?? 1024
          }
        })
      });
    } catch (e) {
      throw new Error(`Network error: ${e.message}`);
    }

    // Check content type - if HTML, it's an error page
    const contentType = response.headers.get('content-type') || '';
    if (contentType.includes('text/html')) {
      throw new Error(`API returned HTML (likely 403 Forbidden). Check your API key at aistudio.google.com`);
    }

    if (!response.ok) {
      const error = await response.json().catch(() => ({}));
      throw new Error(error.error?.message || `API error: ${response.status}`);
    }

    const data = await response.json();
    const text = data.candidates?.[0]?.content?.parts?.[0]?.text;

    if (!text) {
      console.error('Unexpected API response:', JSON.stringify(data));
      throw new Error('No text in API response. Check console for details.');
    }

    return text;
  },

  /**
   * Brain dump → Single micro-focus action
   * Uses Pro model for complex reasoning
   */
  async extractMicroFocus(brainDump) {
    const systemPrompt = `You are an ADHD coach. The user has brain fog and is overwhelmed.

Your job: Extract ONE tiny, concrete action from their brain dump.

Rules:
- Pick the smallest possible first step
- It should take less than 2 minutes
- Be extremely specific (not "work on project" but "open the project folder")
- No lists, no options, just ONE thing
- Use casual, warm language
- Keep response under 50 words

Format your response exactly like this:
[One sentence acknowledging their overwhelm without dwelling on it]

Your focus: [THE ONE MICRO ACTION]

[Optional: One encouraging sentence, max 10 words]`;

    const prompt = `${systemPrompt}

User's brain dump:
"${brainDump}"`;

    return this.call(prompt, {
      model: this.MODELS.PRO,
      temperature: 0.7,
      maxTokens: 150
    });
  },

  /**
   * Validate if a task is small enough
   * Uses Flash for speed
   */
  async validateTaskSize(task) {
    const prompt = `Is this task small enough to do in under 5 minutes? Task: "${task}"

If yes, respond with just: ✓
If no, respond with a smaller first step in under 15 words.`;

    return this.call(prompt, {
      model: this.MODELS.FLASH,
      temperature: 0.3,
      maxTokens: 50
    });
  },

  /**
   * Generate encouragement after completing a task
   * Uses Flash-Lite for speed/cost
   */
  async getEncouragement(completedTask) {
    const prompt = `The user just completed: "${completedTask}"

Give a brief, genuine encouragement (under 15 words). No emojis. Be warm but not cheesy.`;

    return this.call(prompt, {
      model: this.MODELS.LITE,
      temperature: 0.9,
      maxTokens: 30
    });
  }
};

export default AI;
