/**
 * Focus - ADHD-friendly productivity app
 * Progressive levels that unlock as habits form
 */

// =============================================================================
// DATABASE
// =============================================================================

const db = new Dexie('FocusDB');

db.version(1).stores({
  tasks: '++id, status, createdAt',
  stats: 'id'
});

// =============================================================================
// XP ENGINE
// =============================================================================

const XP = {
  // Level thresholds
  CHECKIN_XP: 100,
  TASK_XP: 150,
  LEVEL_3_THRESHOLD: 500,

  // Initialize stats if first run
  async init() {
    const stats = await db.stats.get(1);
    if (!stats) {
      await db.stats.add({
        id: 1,
        level: 1,
        xp: 0,
        streak: 0,
        lastActiveDate: this.yesterday() // So they can play today
      });
    }
    return this.sync();
  },

  // Check for streak decay on app load
  async sync() {
    const stats = await db.stats.get(1);
    if (!stats) return;

    const daysSince = this.daysBetween(stats.lastActiveDate, new Date());

    // Already active today - nothing to do
    if (daysSince === 0) return stats;

    // Missed more than 1 day - reset streak, apply mercy rule
    if (daysSince > 1) {
      const updates = { streak: 0 };

      // Mercy rule: drop from level 3+ back to level 2
      if (stats.level > 2) {
        updates.level = 2;
      }

      await db.stats.update(1, updates);
    }

    return db.stats.get(1);
  },

  // Record activity (check-in or task completion)
  async record(xpAmount) {
    const stats = await db.stats.get(1);
    if (!stats) return;

    const today = new Date();
    const isNewDay = this.daysBetween(stats.lastActiveDate, today) >= 1;

    let newStreak = stats.streak;
    if (isNewDay) newStreak += 1;

    let newXp = stats.xp + xpAmount;
    let newLevel = stats.level;

    // Level up checks
    if (newLevel === 1 && newStreak >= 1) newLevel = 2;
    if (newLevel === 2 && newXp >= this.LEVEL_3_THRESHOLD) newLevel = 3;

    await db.stats.update(1, {
      xp: newXp,
      level: newLevel,
      streak: newStreak,
      lastActiveDate: today
    });

    return db.stats.get(1);
  },

  // Helpers
  daysBetween(date1, date2) {
    const d1 = new Date(date1).setHours(0, 0, 0, 0);
    const d2 = new Date(date2).setHours(0, 0, 0, 0);
    return Math.floor((d2 - d1) / (1000 * 60 * 60 * 24));
  },

  yesterday() {
    const d = new Date();
    d.setDate(d.getDate() - 1);
    return d;
  },

  isToday(date) {
    return this.daysBetween(date, new Date()) === 0;
  }
};

// =============================================================================
// APP
// =============================================================================

const app = document.getElementById('app');
let currentStats = null;

async function init() {
  currentStats = await XP.init();
  render();
}

function render() {
  if (!currentStats) return;

  app.classList.add('fade-out');

  setTimeout(() => {
    if (currentStats.level === 1) {
      renderLevelOne();
    } else {
      renderLevelTwo();
    }
    app.classList.remove('fade-out');
  }, 200);
}

// =============================================================================
// LEVEL 1: THE BUTTON
// =============================================================================

function renderLevelOne() {
  const doneToday = XP.isToday(currentStats.lastActiveDate) && currentStats.streak > 0;

  if (doneToday) {
    app.innerHTML = `
      <div class="success-view">
        <div class="success-icon">🔥</div>
        <h1 class="success-title">System Online.</h1>
        <p class="success-streak">Streak: ${currentStats.streak} Day${currentStats.streak > 1 ? 's' : ''}</p>
        <p class="success-hint">Come back tomorrow to unlock Level 2.</p>
      </div>
    `;
  } else {
    app.innerHTML = `
      <div class="button-view">
        <button class="initiate-btn" id="initiate-btn">
          <span class="btn-text">INITIATE</span>
          <span class="btn-glow"></span>
        </button>
      </div>
    `;

    document.getElementById('initiate-btn').addEventListener('click', async () => {
      const btn = document.getElementById('initiate-btn');
      btn.classList.add('pressed');

      currentStats = await XP.record(XP.CHECKIN_XP);

      setTimeout(render, 400);
    });
  }
}

// =============================================================================
// LEVEL 2: SINGULARITY (One Task)
// =============================================================================

async function renderLevelTwo() {
  const activeTasks = await db.tasks.where('status').equals('active').toArray();
  const hasActiveTask = activeTasks.length > 0;

  app.innerHTML = `
    <div class="singularity-view">
      <header class="stats-bar">
        <span class="stat">Level ${currentStats.level}</span>
        <span class="stat">${currentStats.xp} XP</span>
        <span class="stat">🔥 ${currentStats.streak}</span>
      </header>

      <form class="task-input-form" id="task-form">
        <input
          type="text"
          id="task-input"
          placeholder="${hasActiveTask ? 'Complete current objective.' : 'One Objective.'}"
          ${hasActiveTask ? 'disabled' : ''}
          autocomplete="off"
        >
      </form>

      <div class="task-area" id="task-area">
        ${hasActiveTask ? '' : '<div class="empty-state">Waiting for input...</div>'}
      </div>
    </div>
  `;

  // Render active task card
  if (hasActiveTask) {
    renderTaskCard(activeTasks[0]);
  }

  // Form handler
  document.getElementById('task-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    if (hasActiveTask) return;

    const input = document.getElementById('task-input');
    const title = input.value.trim();
    if (!title) return;

    await db.tasks.add({
      title,
      status: 'active',
      createdAt: new Date()
    });

    renderLevelTwo();
  });
}

function renderTaskCard(task) {
  const area = document.getElementById('task-area');

  area.innerHTML = `
    <div class="task-card" id="task-card">
      <h2 class="task-title">${escapeHtml(task.title)}</h2>
      <div class="task-action">TAP TO COMPLETE</div>
    </div>
  `;

  document.getElementById('task-card').addEventListener('click', async () => {
    const card = document.getElementById('task-card');
    card.classList.add('completing');

    await db.tasks.update(task.id, {
      status: 'completed',
      completedAt: new Date()
    });

    currentStats = await XP.record(XP.TASK_XP);

    setTimeout(renderLevelTwo, 500);
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

// =============================================================================
// INIT
// =============================================================================

init();
