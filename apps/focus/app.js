/**
 * Focus - AI-powered ADHD productivity
 * Brain dump → One micro-action
 */

import { AI } from '../../core/ai.js';

// =============================================================================
// DATABASE
// =============================================================================

const db = new Dexie('FocusDB');

db.version(2).stores({
  focus: 'id',
  stats: 'id'
});

// =============================================================================
// STATE
// =============================================================================

const State = {
  hasApiKey: false,
  currentFocus: null,
  stats: null,
  isLoading: false,

  async init() {
    this.hasApiKey = await AI.hasApiKey();
    this.currentFocus = await db.focus.get('current');
    this.stats = await db.stats.get(1);

    if (!this.stats) {
      await db.stats.add({ id: 1, completed: 0, streak: 0, lastDate: null });
      this.stats = await db.stats.get(1);
    } else if (this.stats.completed === undefined) {
      // Migration from old schema
      await db.stats.update(1, {
        completed: 0,
        streak: this.stats.streak || 0,
        lastDate: this.stats.lastActiveDate || null
      });
      this.stats = await db.stats.get(1);
    }
  }
};

// =============================================================================
// APP
// =============================================================================

const app = document.getElementById('app');

async function init() {
  await State.init();
  render();
}

function render() {
  // Show settings if no API key
  if (!State.hasApiKey) {
    renderSetup();
    return;
  }

  // Show current focus if exists
  if (State.currentFocus) {
    renderFocus();
    return;
  }

  // Show brain dump input
  renderBrainDump();
}

// =============================================================================
// SETUP SCREEN
// =============================================================================

function renderSetup() {
  app.innerHTML = `
    <div class="setup-view">
      <div class="setup-content">
        <h1 class="setup-title">Focus</h1>
        <p class="setup-desc">AI-powered clarity for scattered minds.</p>

        <form class="setup-form" id="setup-form">
          <label class="setup-label">Gemini API Key</label>
          <input
            type="password"
            id="api-key-input"
            class="setup-input"
            placeholder="AIza..."
            autocomplete="off"
          >
          <p class="setup-hint">
            Get one free at <a href="https://aistudio.google.com/apikey" target="_blank">aistudio.google.com</a>
          </p>
          <button type="submit" class="setup-btn">Connect</button>
        </form>
      </div>
    </div>
  `;

  document.getElementById('setup-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    const key = document.getElementById('api-key-input').value.trim();
    if (!key) return;

    await AI.setApiKey(key);
    State.hasApiKey = true;
    render();
  });
}

// =============================================================================
// BRAIN DUMP SCREEN
// =============================================================================

function renderBrainDump() {
  app.innerHTML = `
    <div class="dump-view">
      <header class="header">
        <div class="stats">
          <span class="stat-item">${State.stats.completed || 0} done</span>
          <span class="stat-item">🔥 ${State.stats.streak || 0}</span>
        </div>
        <button class="settings-btn" id="settings-btn">
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <circle cx="12" cy="12" r="3"/>
            <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z"/>
          </svg>
        </button>
      </header>

      <main class="dump-main">
        <h1 class="dump-prompt">What's on your mind?</h1>
        <p class="dump-hint">Dump it all. I'll find your one thing.</p>

        <form class="dump-form" id="dump-form">
          <textarea
            id="dump-input"
            class="dump-input"
            placeholder="I need to... I'm stressed about... I can't stop thinking about..."
            rows="4"
          ></textarea>
          <button type="submit" class="dump-btn" id="dump-btn">
            <span class="btn-text">Find my focus</span>
          </button>
        </form>
      </main>
    </div>
  `;

  // Settings button
  document.getElementById('settings-btn').addEventListener('click', renderSettings);

  // Brain dump form
  document.getElementById('dump-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    const input = document.getElementById('dump-input');
    const text = input.value.trim();
    if (!text || State.isLoading) return;

    await processBrainDump(text);
  });

  // Auto-focus
  document.getElementById('dump-input').focus();
}

async function processBrainDump(text) {
  State.isLoading = true;

  const btn = document.getElementById('dump-btn');
  const form = document.getElementById('dump-form');
  btn.classList.add('loading');
  btn.innerHTML = '<span class="btn-text">Thinking...</span>';

  // Remove any existing error
  document.querySelector('.inline-error')?.remove();

  try {
    const aiResponse = await AI.extractMicroFocus(text);

    // Validate we got something
    if (!aiResponse || aiResponse.trim().length === 0) {
      throw new Error('AI returned empty response. Try again or check your API key.');
    }

    // Store the focus
    await db.focus.put({
      id: 'current',
      originalDump: text,
      aiResponse: aiResponse,
      createdAt: new Date()
    });

    State.currentFocus = await db.focus.get('current');
    State.isLoading = false;
    render();
  } catch (error) {
    State.isLoading = false;
    btn.classList.remove('loading');
    btn.innerHTML = '<span class="btn-text">Find my focus</span>';

    // Show inline error (more visible than toast)
    const errorDiv = document.createElement('div');
    errorDiv.className = 'inline-error';
    errorDiv.innerHTML = `
      <p class="error-title">Something went wrong</p>
      <p class="error-message">${escapeHtml(error.message)}</p>
    `;
    form.appendChild(errorDiv);

    // Also log to console for debugging
    console.error('Focus AI Error:', error);
  }
}

// =============================================================================
// FOCUS SCREEN
// =============================================================================

function renderFocus() {
  app.innerHTML = `
    <div class="focus-view">
      <header class="header">
        <button class="back-btn" id="back-btn">
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <path d="M19 12H5M12 19l-7-7 7-7"/>
          </svg>
        </button>
        <div class="stats">
          <span class="stat-item">${State.stats.completed || 0} done</span>
          <span class="stat-item">🔥 ${State.stats.streak || 0}</span>
        </div>
      </header>

      <main class="focus-main">
        <div class="ai-response" id="ai-response">
          ${formatAIResponse(State.currentFocus.aiResponse)}
        </div>

        <button class="complete-btn" id="complete-btn">
          <span class="btn-text">Done - What's next?</span>
        </button>

        <button class="skip-btn" id="skip-btn">This doesn't feel right</button>
      </main>
    </div>
  `;

  // Back button - abandon focus
  document.getElementById('back-btn').addEventListener('click', async () => {
    await db.focus.delete('current');
    State.currentFocus = null;
    render();
  });

  // Complete button
  document.getElementById('complete-btn').addEventListener('click', async () => {
    // Update stats
    const today = new Date().toDateString();
    const isNewDay = State.stats.lastDate !== today;
    const wasYesterday = State.stats.lastDate === getYesterday();

    const newStreak = isNewDay ? (wasYesterday ? State.stats.streak + 1 : 1) : State.stats.streak;

    await db.stats.update(1, {
      completed: State.stats.completed + 1,
      streak: newStreak,
      lastDate: today
    });

    // Clear focus
    await db.focus.delete('current');

    // Refresh state
    State.currentFocus = null;
    State.stats = await db.stats.get(1);

    // Back to brain dump
    render();
  });

  // Skip button - try again
  document.getElementById('skip-btn').addEventListener('click', async () => {
    await db.focus.delete('current');
    State.currentFocus = null;
    render();
  });
}

function formatAIResponse(text) {
  // Simple markdown-ish formatting
  return text
    .split('\n')
    .map(line => {
      if (line.startsWith('Your focus:')) {
        return `<p class="focus-line">${escapeHtml(line)}</p>`;
      }
      return `<p>${escapeHtml(line)}</p>`;
    })
    .join('');
}

// =============================================================================
// SETTINGS
// =============================================================================

function renderSettings() {
  // Debug code to inspect app state
  const debugCode = `completion(JSON.stringify({
  state: FocusDebug.State,
  focus: FocusDebug.State.currentFocus,
  stats: FocusDebug.State.stats
}, null, 2))`;

  const debugUrl = `shortcuts://run-shortcut?name=Micro%20Debugger&input=${encodeURIComponent(debugCode)}`;

  app.innerHTML = `
    <div class="settings-view">
      <header class="header">
        <button class="back-btn" id="back-btn">
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <path d="M19 12H5M12 19l-7-7 7-7"/>
          </svg>
        </button>
        <h1 class="header-title">Settings</h1>
      </header>

      <main class="settings-main">
        <div class="setting-group">
          <label class="setting-label">Gemini API Key</label>
          <input
            type="password"
            id="api-key-input"
            class="setting-input"
            placeholder="AIza..."
            value="••••••••••••"
          >
          <button class="setting-btn" id="save-key-btn">Update Key</button>
        </div>

        <div class="setting-group">
          <button class="danger-btn" id="clear-key-btn">Remove API Key</button>
        </div>

        <div class="setting-group">
          <h3 class="setting-section">Data</h3>
          <button class="danger-btn" id="clear-data-btn">Clear All Data</button>
        </div>

        <div class="setting-group">
          <h3 class="setting-section">Debug</h3>
          <a href="${debugUrl}" class="setting-btn debug-link">Run Debugger</a>
        </div>
      </main>
    </div>
  `;

  document.getElementById('back-btn').addEventListener('click', render);

  document.getElementById('save-key-btn').addEventListener('click', async () => {
    const key = document.getElementById('api-key-input').value.trim();
    if (key && !key.includes('•')) {
      await AI.setApiKey(key);
      showToast('API key updated');
    }
  });

  document.getElementById('clear-key-btn').addEventListener('click', async () => {
    await AI.clearApiKey();
    State.hasApiKey = false;
    render();
  });

  document.getElementById('clear-data-btn').addEventListener('click', async () => {
    if (confirm('Clear all Focus data? This cannot be undone.')) {
      await db.delete();
      location.reload();
    }
  });
}

// =============================================================================
// HELPERS
// =============================================================================

function escapeHtml(str) {
  const div = document.createElement('div');
  div.textContent = str;
  return div.innerHTML;
}

function getYesterday() {
  const d = new Date();
  d.setDate(d.getDate() - 1);
  return d.toDateString();
}

function showError(message) {
  const existing = document.querySelector('.error-toast');
  if (existing) existing.remove();

  const toast = document.createElement('div');
  toast.className = 'error-toast';
  toast.textContent = message;
  document.body.appendChild(toast);

  setTimeout(() => toast.remove(), 4000);
}

function showToast(message) {
  const existing = document.querySelector('.toast');
  if (existing) existing.remove();

  const toast = document.createElement('div');
  toast.className = 'toast';
  toast.textContent = message;
  document.body.appendChild(toast);

  setTimeout(() => toast.remove(), 2000);
}

// =============================================================================
// INIT
// =============================================================================

// Expose for debugging
window.FocusDebug = { State, db, AI };

init();
