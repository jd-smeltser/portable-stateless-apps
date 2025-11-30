/**
 * Daily - ADHD-friendly daily focus app
 *
 * A single-page app for capturing tasks and focusing on one thing at a time.
 * Data stored locally in IndexedDB via Dexie.
 */

// ============================================
// Database Setup
// ============================================

const db = new Dexie('daily');
db.version(2).stores({
  tasks: '++id, date, text, notes, completed, isNow, order, createdAt',
  settings: 'key'
});

// ============================================
// State
// ============================================

const state = {
  currentDate: new Date(),
  tasks: [],
  doneExpanded: false,
  timerRunning: false,
  timerSeconds: 25 * 60,
  timerInterval: null,
  editingTask: null
};

// ============================================
// Utilities
// ============================================

function formatDate(date) {
  const today = new Date();
  const yesterday = new Date(today);
  yesterday.setDate(yesterday.getDate() - 1);
  const tomorrow = new Date(today);
  tomorrow.setDate(tomorrow.getDate() + 1);

  const isToday = isSameDay(date, today);
  const isYesterday = isSameDay(date, yesterday);
  const isTomorrow = isSameDay(date, tomorrow);

  if (isToday) return 'Today';
  if (isYesterday) return 'Yesterday';
  if (isTomorrow) return 'Tomorrow';

  const options = { weekday: 'short', month: 'short', day: 'numeric' };
  return date.toLocaleDateString('en-US', options);
}

function isSameDay(d1, d2) {
  return d1.getFullYear() === d2.getFullYear() &&
         d1.getMonth() === d2.getMonth() &&
         d1.getDate() === d2.getDate();
}

function getDateKey(date) {
  return date.toISOString().split('T')[0];
}

function sanitize(str) {
  const div = document.createElement('div');
  div.textContent = str;
  return div.innerHTML;
}

// ============================================
// Database Operations
// ============================================

async function loadTasks() {
  const dateKey = getDateKey(state.currentDate);
  state.tasks = await db.tasks
    .where('date')
    .equals(dateKey)
    .sortBy('order');
  render();
}

async function addTask(text) {
  const dateKey = getDateKey(state.currentDate);
  const maxOrder = state.tasks.length > 0
    ? Math.max(...state.tasks.map(t => t.order || 0))
    : 0;

  const id = await db.tasks.add({
    date: dateKey,
    text: text.trim(),
    notes: '',
    completed: false,
    isNow: false,
    order: maxOrder + 1,
    createdAt: new Date().toISOString()
  });

  await loadTasks();
  return id;
}

async function toggleComplete(id) {
  const task = await db.tasks.get(id);
  if (!task) return;

  await db.tasks.update(id, {
    completed: !task.completed,
    isNow: task.completed ? task.isNow : false // Clear NOW if completing
  });
  await loadTasks();
}

async function setAsNow(id) {
  // Clear any existing NOW task
  const dateKey = getDateKey(state.currentDate);
  await db.tasks
    .where('date')
    .equals(dateKey)
    .modify({ isNow: false });

  // Set new NOW task
  await db.tasks.update(id, { isNow: true });
  await loadTasks();
}

async function clearNow(id) {
  await db.tasks.update(id, { isNow: false });
  await loadTasks();
}

async function deleteTask(id) {
  await db.tasks.delete(id);
  await loadTasks();
}

async function updateTask(id, updates) {
  await db.tasks.update(id, updates);
  await loadTasks();
}

// ============================================
// Editor
// ============================================

function openEditor(taskId) {
  const task = state.tasks.find(t => t.id === taskId);
  if (!task) return;

  state.editingTask = task;
  const editor = document.getElementById('editor-modal');
  const titleInput = document.getElementById('editor-title');
  const notesInput = document.getElementById('editor-notes');

  titleInput.value = task.text;
  notesInput.value = task.notes || '';

  editor.classList.add('open');
  titleInput.focus();

  // Auto-resize notes textarea
  autoResizeTextarea(notesInput);
}

function closeEditor() {
  state.editingTask = null;
  const editor = document.getElementById('editor-modal');
  editor.classList.remove('open');
}

async function saveEditor() {
  if (!state.editingTask) return;

  const titleInput = document.getElementById('editor-title');
  const notesInput = document.getElementById('editor-notes');

  const text = titleInput.value.trim();
  if (!text) {
    titleInput.focus();
    return;
  }

  await updateTask(state.editingTask.id, {
    text: text,
    notes: notesInput.value
  });

  closeEditor();
}

function autoResizeTextarea(textarea) {
  textarea.style.height = 'auto';
  textarea.style.height = Math.max(120, textarea.scrollHeight) + 'px';
}

// ============================================
// Timer
// ============================================

function formatTime(seconds) {
  const mins = Math.floor(seconds / 60);
  const secs = seconds % 60;
  return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
}

function toggleTimer() {
  if (state.timerRunning) {
    stopTimer();
  } else {
    startTimer();
  }
}

function startTimer() {
  state.timerRunning = true;
  state.timerInterval = setInterval(() => {
    state.timerSeconds--;
    updateTimerDisplay();

    if (state.timerSeconds <= 0) {
      stopTimer();
      state.timerSeconds = 25 * 60;
      // Could add notification here
      alert('Time\'s up! Take a break.');
    }
  }, 1000);
  updateTimerDisplay();
}

function stopTimer() {
  state.timerRunning = false;
  if (state.timerInterval) {
    clearInterval(state.timerInterval);
    state.timerInterval = null;
  }
  updateTimerDisplay();
}

function resetTimer() {
  stopTimer();
  state.timerSeconds = 25 * 60;
  updateTimerDisplay();
}

function updateTimerDisplay() {
  const btn = document.getElementById('timer-btn');
  if (btn) {
    btn.textContent = formatTime(state.timerSeconds) + (state.timerRunning ? ' ⏸' : ' ▶');
    btn.classList.toggle('running', state.timerRunning);
  }
}

// ============================================
// Rendering
// ============================================

function render() {
  renderDateDisplay();
  renderNowSection();
  renderTaskList();
  renderDoneSection();
}

function renderDateDisplay() {
  const display = document.getElementById('date-display');
  display.textContent = formatDate(state.currentDate);
}

function renderNowSection() {
  const section = document.getElementById('now-section');
  const container = document.getElementById('now-task');
  const nowTask = state.tasks.find(t => t.isNow && !t.completed);

  if (nowTask) {
    section.classList.remove('hidden');
    container.innerHTML = `
      <div class="now-task-content">
        <span class="now-task-text">${sanitize(nowTask.text)}</span>
      </div>
      <div class="now-task-actions">
        <button class="now-btn done" data-id="${nowTask.id}">Done ✓</button>
        <button class="now-btn skip" data-id="${nowTask.id}">Skip</button>
      </div>
    `;
  } else {
    const pendingTasks = state.tasks.filter(t => !t.completed);
    if (pendingTasks.length > 0) {
      section.classList.remove('hidden');
      container.innerHTML = `
        <div class="now-empty">
          <p>No focus set</p>
          <button class="pick-focus-btn" id="pick-first">Pick from list</button>
        </div>
      `;
    } else {
      section.classList.add('hidden');
    }
  }
}

function renderTaskList() {
  const list = document.getElementById('task-list');
  const pendingTasks = state.tasks.filter(t => !t.completed && !t.isNow);

  if (pendingTasks.length === 0) {
    const hasNow = state.tasks.some(t => t.isNow && !t.completed);
    const hasDone = state.tasks.some(t => t.completed);

    if (!hasNow && !hasDone) {
      list.innerHTML = `
        <li class="empty-state">
          <div class="empty-state-icon">○</div>
          <p>Capture your first task above</p>
        </li>
      `;
    } else if (!hasNow) {
      list.innerHTML = `
        <li class="empty-state">
          <p>All caught up!</p>
        </li>
      `;
    } else {
      list.innerHTML = '';
    }
    return;
  }

  list.innerHTML = pendingTasks.map(task => `
    <li class="task-item" data-id="${task.id}">
      <div class="task-checkbox" data-action="toggle" data-id="${task.id}"></div>
      <span class="task-text" data-action="edit" data-id="${task.id}">
        ${sanitize(task.text)}
        ${task.notes ? '<span class="has-notes">📝</span>' : ''}
      </span>
      <button class="task-focus-btn" data-action="focus" data-id="${task.id}">Focus</button>
      <button class="task-delete-btn" data-action="delete" data-id="${task.id}">×</button>
    </li>
  `).join('');
}

function renderDoneSection() {
  const section = document.getElementById('done-section');
  const list = document.getElementById('done-list');
  const countEl = document.getElementById('done-count');
  const doneTasks = state.tasks.filter(t => t.completed);

  countEl.textContent = doneTasks.length;

  if (doneTasks.length === 0) {
    section.classList.add('hidden');
    return;
  }

  section.classList.remove('hidden');
  section.classList.toggle('expanded', state.doneExpanded);

  list.innerHTML = doneTasks.map(task => `
    <li class="task-item completed" data-id="${task.id}">
      <div class="task-checkbox checked" data-action="toggle" data-id="${task.id}"></div>
      <span class="task-text" data-action="edit" data-id="${task.id}">
        ${sanitize(task.text)}
        ${task.notes ? '<span class="has-notes">📝</span>' : ''}
      </span>
      <button class="task-delete-btn" data-action="delete" data-id="${task.id}">×</button>
    </li>
  `).join('');
}

// ============================================
// Event Handlers
// ============================================

function setupEventListeners() {
  // Date navigation
  document.getElementById('prev-day').addEventListener('click', () => {
    state.currentDate.setDate(state.currentDate.getDate() - 1);
    resetTimer();
    loadTasks();
  });

  document.getElementById('next-day').addEventListener('click', () => {
    state.currentDate.setDate(state.currentDate.getDate() + 1);
    resetTimer();
    loadTasks();
  });

  // Quick capture
  const captureInput = document.getElementById('capture-input');
  captureInput.addEventListener('keydown', async (e) => {
    if (e.key === 'Enter' && captureInput.value.trim()) {
      await addTask(captureInput.value);
      captureInput.value = '';
    }
  });

  // Timer
  document.getElementById('timer-btn').addEventListener('click', toggleTimer);

  // NOW section actions
  document.getElementById('now-task').addEventListener('click', async (e) => {
    const btn = e.target.closest('button');
    if (!btn) return;

    const id = parseInt(btn.dataset.id);
    if (btn.classList.contains('done')) {
      await toggleComplete(id);
      resetTimer();
    } else if (btn.classList.contains('skip')) {
      await clearNow(id);
    }
  });

  // Pick first task as focus
  document.getElementById('now-task').addEventListener('click', async (e) => {
    if (e.target.id === 'pick-first') {
      const firstPending = state.tasks.find(t => !t.completed && !t.isNow);
      if (firstPending) {
        await setAsNow(firstPending.id);
      }
    }
  });

  // Task list actions
  document.getElementById('task-list').addEventListener('click', async (e) => {
    const el = e.target.closest('[data-action]');
    if (!el) return;

    const action = el.dataset.action;
    const id = parseInt(el.dataset.id);

    switch (action) {
      case 'toggle':
        await toggleComplete(id);
        break;
      case 'focus':
        await setAsNow(id);
        break;
      case 'delete':
        await deleteTask(id);
        break;
      case 'edit':
        openEditor(id);
        break;
    }
  });

  // Done section toggle
  document.getElementById('done-toggle').addEventListener('click', () => {
    state.doneExpanded = !state.doneExpanded;
    renderDoneSection();
  });

  // Done list actions
  document.getElementById('done-list').addEventListener('click', async (e) => {
    const el = e.target.closest('[data-action]');
    if (!el) return;

    const action = el.dataset.action;
    const id = parseInt(el.dataset.id);

    switch (action) {
      case 'toggle':
        await toggleComplete(id);
        break;
      case 'delete':
        await deleteTask(id);
        break;
      case 'edit':
        openEditor(id);
        break;
    }
  });

  // Editor modal events
  document.getElementById('editor-close').addEventListener('click', closeEditor);
  document.getElementById('editor-save').addEventListener('click', saveEditor);

  // Close editor on backdrop click
  document.getElementById('editor-modal').addEventListener('click', (e) => {
    if (e.target.id === 'editor-modal') {
      closeEditor();
    }
  });

  // Auto-resize notes textarea on input
  document.getElementById('editor-notes').addEventListener('input', (e) => {
    autoResizeTextarea(e.target);
  });

  // Save on Cmd/Ctrl+Enter in editor
  document.getElementById('editor-modal').addEventListener('keydown', (e) => {
    if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') {
      e.preventDefault();
      saveEditor();
    }
    if (e.key === 'Escape') {
      closeEditor();
    }
  });

  // Brain dump FAB (placeholder for now)
  document.getElementById('brain-dump-btn').addEventListener('click', () => {
    alert('Brain dump with AI coming soon!\n\nFor now, just type tasks in the capture box.');
  });

  // Keyboard shortcuts
  document.addEventListener('keydown', (e) => {
    // Skip shortcuts when editor is open or typing in an input
    const editorOpen = document.getElementById('editor-modal').classList.contains('open');
    const isTyping = document.activeElement.tagName === 'INPUT' ||
                     document.activeElement.tagName === 'TEXTAREA';

    if (editorOpen || isTyping) return;

    // Focus capture on '/' or 'n'
    if (e.key === '/' || e.key === 'n') {
      e.preventDefault();
      captureInput.focus();
    }

    // Toggle timer on space
    if (e.key === ' ') {
      e.preventDefault();
      toggleTimer();
    }
  });
}

// ============================================
// Initialize
// ============================================

async function init() {
  setupEventListeners();
  await loadTasks();
  updateTimerDisplay();
}

// Start the app
init();
