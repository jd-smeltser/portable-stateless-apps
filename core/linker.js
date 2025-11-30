/**
 * Linker - Universal @-mention linking component
 *
 * Attach to any textarea/input to enable @-linking to any record in the registry.
 * Shows a dropdown picker when user types @, inserts a link reference.
 */

import Registry from './registry.js';

// ============================================
// Link Format
// ============================================

// Links in text are stored as: @[Title](id)
// This is markdown-ish but with ID reference

const LINK_REGEX = /@\[([^\]]+)\]\(([^)]+)\)/g;

/**
 * Parse links from text
 * Returns array of { title, id, start, end }
 */
export function parseLinks(text) {
  const links = [];
  let match;
  while ((match = LINK_REGEX.exec(text)) !== null) {
    links.push({
      title: match[1],
      id: match[2],
      start: match.index,
      end: match.index + match[0].length,
      raw: match[0]
    });
  }
  return links;
}

/**
 * Extract just the IDs of linked records
 */
export function extractLinkIds(text) {
  return parseLinks(text).map(l => l.id);
}

/**
 * Render text with links as clickable elements
 */
export function renderLinkedText(text, onClick) {
  let result = text;
  const links = parseLinks(text);

  // Replace in reverse order to preserve indices
  for (let i = links.length - 1; i >= 0; i--) {
    const link = links[i];
    const record = Registry.get(link.id);
    const exists = !!record;
    const className = exists ? 'inline-link' : 'inline-link broken';
    const replacement = `<span class="${className}" data-link-id="${link.id}">${link.title}</span>`;
    result = result.slice(0, link.start) + replacement + result.slice(link.end);
  }

  return result;
}

// ============================================
// Time Expression Parsing
// ============================================

/**
 * Parse time expressions like @1pm, @tomorrow2pm, @monday9am, @2:30pm
 * Returns { timestamp, label } or null
 */
function parseTimeExpression(query) {
  if (!query) return null;

  const q = query.toLowerCase().trim();

  // Patterns: 1pm, 2:30pm, 14:00, etc.
  const timePattern = /^(\d{1,2})(?::(\d{2}))?\s*(am|pm)?$/;
  // Patterns with day prefix: tomorrow1pm, monday2pm, tue9am
  const dayTimePattern = /^(today|tomorrow|mon|tue|wed|thu|fri|sat|sun|monday|tuesday|wednesday|thursday|friday|saturday|sunday)(\d{1,2})(?::(\d{2}))?\s*(am|pm)?$/;

  let date = new Date();
  let hours = null;
  let minutes = 0;

  // Try day+time pattern first
  const dayMatch = q.match(dayTimePattern);
  if (dayMatch) {
    const [, dayStr, hourStr, minStr, ampm] = dayMatch;
    hours = parseInt(hourStr);
    minutes = minStr ? parseInt(minStr) : 0;

    // Handle day offset
    const dayMap = {
      'today': 0,
      'tomorrow': 1,
      'sun': 0, 'sunday': 0,
      'mon': 1, 'monday': 1,
      'tue': 2, 'tuesday': 2,
      'wed': 3, 'wednesday': 3,
      'thu': 4, 'thursday': 4,
      'fri': 5, 'friday': 5,
      'sat': 6, 'saturday': 6
    };

    if (dayStr === 'today') {
      // Keep current date
    } else if (dayStr === 'tomorrow') {
      date.setDate(date.getDate() + 1);
    } else {
      // Find next occurrence of this weekday
      const targetDay = dayMap[dayStr];
      const currentDay = date.getDay();
      let daysUntil = targetDay - currentDay;
      if (daysUntil <= 0) daysUntil += 7;
      date.setDate(date.getDate() + daysUntil);
    }

    // Handle am/pm
    if (ampm === 'pm' && hours < 12) hours += 12;
    if (ampm === 'am' && hours === 12) hours = 0;
    if (!ampm && hours < 8) hours += 12; // Assume PM for low numbers without am/pm
  } else {
    // Try time-only pattern
    const timeMatch = q.match(timePattern);
    if (timeMatch) {
      const [, hourStr, minStr, ampm] = timeMatch;
      hours = parseInt(hourStr);
      minutes = minStr ? parseInt(minStr) : 0;

      // Handle am/pm
      if (ampm === 'pm' && hours < 12) hours += 12;
      if (ampm === 'am' && hours === 12) hours = 0;
      if (!ampm && hours < 8) hours += 12; // Assume PM for low numbers without am/pm

      // If the time has already passed today, use tomorrow
      const now = new Date();
      if (date.toDateString() === now.toDateString()) {
        const targetMinutes = hours * 60 + minutes;
        const nowMinutes = now.getHours() * 60 + now.getMinutes();
        if (targetMinutes <= nowMinutes) {
          date.setDate(date.getDate() + 1);
        }
      }
    } else {
      return null;
    }
  }

  if (hours === null || hours > 23 || minutes > 59) return null;

  date.setHours(hours, minutes, 0, 0);

  return {
    timestamp: date.getTime(),
    date: date,
    hours,
    minutes
  };
}

function formatTimeLabel(timeMatch) {
  const date = new Date(timeMatch.timestamp);
  const now = new Date();
  const tomorrow = new Date(now);
  tomorrow.setDate(tomorrow.getDate() + 1);

  const timeStr = date.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', hour12: true });

  if (date.toDateString() === now.toDateString()) {
    return timeStr + ' today';
  } else if (date.toDateString() === tomorrow.toDateString()) {
    return timeStr + ' tomorrow';
  } else {
    const dayStr = date.toLocaleDateString('en-US', { weekday: 'short' });
    return timeStr + ' ' + dayStr;
  }
}

// ============================================
// Linker UI Component
// ============================================

let activeLinker = null;
let dropdown = null;

/**
 * Initialize the linker dropdown (call once on page load)
 */
export function initLinker() {
  if (dropdown) return;

  dropdown = document.createElement('div');
  dropdown.className = 'linker-dropdown';
  dropdown.innerHTML = '<div class="linker-list"></div>';
  dropdown.style.cssText = `
    position: fixed;
    background: #141414;
    border: 1px solid #333;
    border-radius: 8px;
    box-shadow: 0 4px 20px rgba(0,0,0,0.5);
    max-height: 240px;
    overflow-y: auto;
    z-index: 1000;
    display: none;
    min-width: 200px;
    max-width: 300px;
  `;

  document.body.appendChild(dropdown);

  // Click handler for options
  dropdown.addEventListener('click', (e) => {
    const option = e.target.closest('.linker-option');
    if (option && activeLinker) {
      if (option.dataset.action === 'create-event') {
        createEventAndLink(parseInt(option.dataset.time), option.dataset.timeLabel);
      } else {
        selectOption(option.dataset.id, option.dataset.title);
      }
    }
  });

  // Close on outside click
  document.addEventListener('click', (e) => {
    if (!dropdown.contains(e.target) && e.target !== activeLinker?.element) {
      hideDropdown();
    }
  });

  // Inject styles
  const style = document.createElement('style');
  style.textContent = `
    .linker-option {
      padding: 10px 12px;
      cursor: pointer;
      display: flex;
      align-items: center;
      gap: 8px;
      transition: background 0.1s;
    }
    .linker-option:hover, .linker-option.selected {
      background: #262626;
    }
    .linker-option-icon {
      font-size: 1rem;
      flex-shrink: 0;
    }
    .linker-option-content {
      flex: 1;
      min-width: 0;
    }
    .linker-option-title {
      font-size: 0.85rem;
      color: #e5e5e5;
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
    }
    .linker-option-type {
      font-size: 0.65rem;
      color: #737373;
      text-transform: uppercase;
    }
    .linker-empty {
      padding: 16px;
      text-align: center;
      color: #737373;
      font-size: 0.8rem;
    }
    .inline-link {
      color: #3b82f6;
      cursor: pointer;
      text-decoration: underline;
      text-decoration-style: dotted;
    }
    .inline-link:hover {
      text-decoration-style: solid;
    }
    .inline-link.broken {
      color: #ef4444;
    }
  `;
  document.head.appendChild(style);
}

/**
 * Attach linker to a textarea, input, or contenteditable element
 */
export function attachLinker(element, options = {}) {
  initLinker();

  const isContentEditable = element.contentEditable === 'true' || element.isContentEditable;

  const state = {
    element,
    active: false,
    startPos: 0,
    query: '',
    selectedIndex: 0,
    options: options,
    isContentEditable
  };

  element.addEventListener('input', (e) => handleInput(state, e));
  element.addEventListener('keydown', (e) => handleKeydown(state, e));
  element.addEventListener('blur', () => {
    // Delay to allow click on dropdown
    setTimeout(() => {
      if (activeLinker === state) {
        hideDropdown();
      }
    }, 200);
  });

  return state;
}

function handleInput(state, e) {
  const { element, isContentEditable } = state;

  let text, cursorPos;

  if (isContentEditable) {
    // For contenteditable, get text and cursor position via Selection API
    text = getContentEditableText(element);
    cursorPos = getContentEditableCursorPos(element);
  } else {
    text = element.value;
    cursorPos = element.selectionStart;
  }

  // Find @ before cursor
  const textBeforeCursor = text.slice(0, cursorPos);
  const atIndex = textBeforeCursor.lastIndexOf('@');

  if (atIndex !== -1) {
    // Check if @ is start of input or preceded by whitespace
    const charBefore = atIndex > 0 ? text[atIndex - 1] : ' ';
    if (charBefore === ' ' || charBefore === '\n' || atIndex === 0) {
      const query = textBeforeCursor.slice(atIndex + 1);

      // Don't trigger if query contains space (completed or cancelled)
      if (!query.includes(' ') && !query.includes('\n')) {
        state.active = true;
        state.startPos = atIndex;
        state.query = query;
        state.selectedIndex = 0;
        activeLinker = state;
        showDropdown(state);
        return;
      }
    }
  }

  if (state.active) {
    hideDropdown();
    state.active = false;
  }
}

// Helper: Get plain text from contenteditable (preserving newlines)
function getContentEditableText(element) {
  // Get text, handling line breaks
  const clone = element.cloneNode(true);
  // Convert inline-link spans to their raw format for cursor calculation
  clone.querySelectorAll('.inline-link').forEach(link => {
    const title = link.textContent;
    const id = link.dataset.linkId;
    link.replaceWith(document.createTextNode(`@[${title}](${id})`));
  });

  let text = '';
  const walk = (node) => {
    if (node.nodeType === Node.TEXT_NODE) {
      text += node.textContent;
    } else if (node.nodeName === 'BR') {
      text += '\n';
    } else if (node.nodeName === 'DIV' && text.length > 0 && !text.endsWith('\n')) {
      text += '\n';
      node.childNodes.forEach(walk);
    } else {
      node.childNodes.forEach(walk);
    }
  };
  walk(clone);
  return text;
}

// Helper: Get cursor position in contenteditable as a character offset
function getContentEditableCursorPos(element) {
  const sel = window.getSelection();
  if (!sel.rangeCount) return 0;

  const range = sel.getRangeAt(0);
  const preRange = range.cloneRange();
  preRange.selectNodeContents(element);
  preRange.setEnd(range.startContainer, range.startOffset);

  // Count characters in the range, handling inline-link spans
  let pos = 0;
  const walk = (node) => {
    if (node.nodeType === Node.TEXT_NODE) {
      if (preRange.intersectsNode(node)) {
        const nodeRange = document.createRange();
        nodeRange.selectNodeContents(node);

        if (preRange.compareBoundaryPoints(Range.END_TO_START, nodeRange) <= 0 &&
            preRange.compareBoundaryPoints(Range.START_TO_END, nodeRange) >= 0) {
          // Node is fully or partially in range
          const start = 0;
          let end = node.length;

          // If preRange ends in this node, use the offset
          if (preRange.endContainer === node) {
            end = preRange.endOffset;
          }

          pos += end - start;
        }
      }
    } else if (node.classList && node.classList.contains('inline-link')) {
      // Inline links are non-editable, count as their raw syntax length
      const title = node.textContent;
      const id = node.dataset.linkId;
      const rawLength = `@[${title}](${id})`.length;

      // Check if cursor is after this element
      const nodeRange = document.createRange();
      nodeRange.selectNode(node);
      if (preRange.compareBoundaryPoints(Range.END_TO_START, nodeRange) >= 0) {
        pos += rawLength;
      }
    } else if (node.nodeName === 'BR') {
      const nodeRange = document.createRange();
      nodeRange.selectNode(node);
      if (preRange.compareBoundaryPoints(Range.END_TO_START, nodeRange) >= 0) {
        pos += 1;
      }
    } else if (node.nodeName === 'DIV' && node !== element) {
      // DIVs often represent line breaks in contenteditable
      const nodeRange = document.createRange();
      nodeRange.selectNode(node);
      if (preRange.compareBoundaryPoints(Range.END_TO_START, nodeRange) >= 0 && pos > 0) {
        pos += 1;
      }
      node.childNodes.forEach(walk);
    } else {
      node.childNodes.forEach(walk);
    }
  };
  walk(element);
  return pos;
}

// Helper: Insert text at a position in contenteditable, replacing from startPos to cursor
// linkText is in format @[Title](id)
function insertInContentEditable(element, startPos, linkText) {
  const sel = window.getSelection();
  if (!sel.rangeCount) return;

  // Parse the link text to extract title and id
  const linkMatch = linkText.match(/@\[([^\]]+)\]\(([^)]+)\)/);
  if (!linkMatch) return;
  const [, title, id] = linkMatch;

  // Find the position to start deleting (the @ symbol position)
  const range = document.createRange();
  let charCount = 0;

  // Walk the DOM to find the text positions
  const findPosition = (targetPos) => {
    let found = null;
    const walk = (node) => {
      if (found) return;

      if (node.nodeType === Node.TEXT_NODE) {
        const nodeLen = node.length;
        if (charCount + nodeLen >= targetPos) {
          found = { node, offset: targetPos - charCount };
          return;
        }
        charCount += nodeLen;
      } else if (node.classList && node.classList.contains('inline-link')) {
        // Non-editable inline link - skip over it
        const linkTitle = node.textContent;
        const linkId = node.dataset.linkId;
        const rawLen = `@[${linkTitle}](${linkId})`.length;
        charCount += rawLen;
      } else if (node.nodeName === 'BR') {
        charCount += 1;
      } else if (node.nodeName === 'DIV' && node !== element) {
        if (charCount > 0) charCount += 1;
        node.childNodes.forEach(walk);
      } else {
        node.childNodes.forEach(walk);
      }
    };
    walk(element);
    return found;
  };

  const startResult = findPosition(startPos);
  if (!startResult) return;
  const startNode = startResult.node;
  const startOffset = startResult.offset;

  // Get current cursor position
  const cursorRange = sel.getRangeAt(0);

  // Create a range from startPos to current cursor
  range.setStart(startNode, startOffset);
  range.setEnd(cursorRange.startContainer, cursorRange.startOffset);

  // Delete the @query text
  range.deleteContents();

  // Create the inline-link span element
  const linkSpan = document.createElement('span');
  linkSpan.className = 'inline-link';
  linkSpan.dataset.linkId = id;
  linkSpan.contentEditable = 'false';
  linkSpan.textContent = title;

  // Create a space after the link
  const spaceNode = document.createTextNode(' ');

  // Insert elements
  range.insertNode(spaceNode);
  range.insertNode(linkSpan);

  // Move cursor after the space
  const newRange = document.createRange();
  newRange.setStartAfter(spaceNode);
  newRange.collapse(true);
  sel.removeAllRanges();
  sel.addRange(newRange);
}

function handleKeydown(state, e) {
  if (!state.active) return;

  const options = dropdown.querySelectorAll('.linker-option');

  switch (e.key) {
    case 'ArrowDown':
      e.preventDefault();
      state.selectedIndex = Math.min(state.selectedIndex + 1, options.length - 1);
      updateSelection(state);
      break;

    case 'ArrowUp':
      e.preventDefault();
      state.selectedIndex = Math.max(state.selectedIndex - 1, 0);
      updateSelection(state);
      break;

    case 'Enter':
    case 'Tab':
      if (options.length > 0) {
        e.preventDefault();
        const selected = options[state.selectedIndex];
        if (selected) {
          if (selected.dataset.action === 'create-event') {
            createEventAndLink(parseInt(selected.dataset.time), selected.dataset.timeLabel);
          } else {
            selectOption(selected.dataset.id, selected.dataset.title);
          }
        }
      }
      break;

    case 'Escape':
      e.preventDefault();
      hideDropdown();
      state.active = false;
      break;
  }
}

function showDropdown(state) {
  const { element, query } = state;

  // Check if query is a time expression
  const timeMatch = parseTimeExpression(query);

  // Get all records and filter by query
  let records = Registry.all();

  // Exclude current record if specified
  if (state.options.excludeId) {
    records = records.filter(r => r.id !== state.options.excludeId);
  }

  // Filter by query (skip if it's a time expression)
  if (query && !timeMatch) {
    const q = query.toLowerCase();
    records = records.filter(r => {
      const title = r.meta?.title || '';
      return title.toLowerCase().includes(q);
    });
  } else if (timeMatch) {
    // For time expressions, still show some recent records
    records = records.slice(0, 5);
  }

  // Limit results
  records = records.slice(0, timeMatch ? 5 : 10);

  // Render options
  const list = dropdown.querySelector('.linker-list');
  let html = '';

  // Add time expression option if detected
  if (timeMatch) {
    const timeLabel = formatTimeLabel(timeMatch);
    html += `
      <div class="linker-option selected"
           data-time="${timeMatch.timestamp}"
           data-time-label="${escapeAttr(timeLabel)}"
           data-action="create-event">
        <span class="linker-option-icon">📅</span>
        <div class="linker-option-content">
          <div class="linker-option-title">Create event at ${timeLabel}</div>
          <div class="linker-option-type">new event</div>
        </div>
      </div>
    `;
  }

  if (records.length === 0 && !timeMatch) {
    html = '<div class="linker-empty">No matches</div>';
  } else {
    html += records.map((record, i) => {
      const title = record.meta?.title || 'Untitled';
      const icon = record.type === 'note' ? '📝' :
                   record.type === 'task' ? '☑️' :
                   record.type === 'template' ? '📄' :
                   record.type === 'event' ? '📅' :
                   record.type === 'project' ? '📁' : '📎';

      const isSelected = timeMatch ? false : i === 0;
      return `
        <div class="linker-option ${isSelected ? 'selected' : ''}"
             data-id="${record.id}"
             data-title="${escapeAttr(title)}">
          <span class="linker-option-icon">${icon}</span>
          <div class="linker-option-content">
            <div class="linker-option-title">${escapeHtml(title)}</div>
            <div class="linker-option-type">${record.type}</div>
          </div>
        </div>
      `;
    }).join('');
  }

  list.innerHTML = html;

  // Position dropdown
  const rect = element.getBoundingClientRect();
  const cursorCoords = getCaretCoordinates(element);

  dropdown.style.left = Math.min(rect.left + cursorCoords.left, window.innerWidth - 320) + 'px';
  dropdown.style.top = Math.min(rect.top + cursorCoords.top + 24, window.innerHeight - 260) + 'px';
  dropdown.style.display = 'block';
}

function hideDropdown() {
  if (dropdown) {
    dropdown.style.display = 'none';
  }
  activeLinker = null;
}

function updateSelection(state) {
  const options = dropdown.querySelectorAll('.linker-option');
  options.forEach((opt, i) => {
    opt.classList.toggle('selected', i === state.selectedIndex);
  });

  // Scroll into view
  const selected = options[state.selectedIndex];
  if (selected) {
    selected.scrollIntoView({ block: 'nearest' });
  }
}

function selectOption(id, title) {
  if (!activeLinker) return;

  const { element, startPos, isContentEditable } = activeLinker;
  const link = `@[${title}](${id}) `;

  if (isContentEditable) {
    insertInContentEditable(element, startPos, link);
  } else {
    const text = element.value;
    const cursorPos = element.selectionStart;

    // Replace @query with @[title](id)
    const before = text.slice(0, startPos);
    const after = text.slice(cursorPos);

    element.value = before + link + after;

    // Move cursor after the link
    const newPos = startPos + link.length;
    element.setSelectionRange(newPos, newPos);
  }

  // Register the link in registry (bidirectional)
  if (activeLinker.options.recordId) {
    Registry.addLink(activeLinker.options.recordId, id);
  }

  // Trigger input event for any listeners
  element.dispatchEvent(new Event('input', { bubbles: true }));

  hideDropdown();
  activeLinker.active = false;
  element.focus();
}

/**
 * Create a new event and link to it
 */
function createEventAndLink(timestamp, timeLabel) {
  if (!activeLinker) return;

  const { element, startPos, isContentEditable } = activeLinker;

  // Create event record
  const ts = Date.now();
  const eventState = {
    t: 'Event at ' + timeLabel,
    b: '',
    start: timestamp,
    duration: 30,
    ts
  };

  // Encode the event URL (use global LZString if available)
  const compress = typeof LZString !== 'undefined' ? LZString : window.LZString;
  const eventUrl = '/apps/calendar/#' + compress.compressToEncodedURIComponent(JSON.stringify(eventState));

  const record = Registry.add('event', eventUrl, {
    meta: {
      title: eventState.t,
      ts,
      start: timestamp,
      duration: 30
    }
  });

  const link = `@[${eventState.t}](${record.id}) `;

  if (isContentEditable) {
    insertInContentEditable(element, startPos, link);
  } else {
    const text = element.value;
    const cursorPos = element.selectionStart;

    // Replace @query with @[title](id)
    const before = text.slice(0, startPos);
    const after = text.slice(cursorPos);

    element.value = before + link + after;

    // Move cursor after the link
    const newPos = startPos + link.length;
    element.setSelectionRange(newPos, newPos);
  }

  // Register the bidirectional link
  if (activeLinker.options.recordId) {
    Registry.addLink(activeLinker.options.recordId, record.id);
  }

  // Trigger input event for any listeners
  element.dispatchEvent(new Event('input', { bubbles: true }));

  hideDropdown();
  activeLinker.active = false;
  element.focus();
}

// ============================================
// Utilities
// ============================================

function escapeHtml(str) {
  const div = document.createElement('div');
  div.textContent = str;
  return div.innerHTML;
}

function escapeAttr(str) {
  return str.replace(/"/g, '&quot;');
}

// Simple caret position estimation (works for single-line, approximate for multi-line)
function getCaretCoordinates(element) {
  const isInput = element.tagName === 'INPUT';
  const isContentEditable = element.contentEditable === 'true' || element.isContentEditable;

  if (isInput) {
    return { left: 0, top: 0 };
  }

  // For contenteditable, use Selection API to get caret rect
  if (isContentEditable) {
    const sel = window.getSelection();
    if (sel.rangeCount > 0) {
      const range = sel.getRangeAt(0).cloneRange();
      range.collapse(true);

      // Get caret rect relative to viewport
      const rect = range.getBoundingClientRect();
      const elRect = element.getBoundingClientRect();

      return {
        left: rect.left - elRect.left,
        top: rect.top - elRect.top
      };
    }
    return { left: 0, top: 0 };
  }

  // For textarea, create a mirror div
  const mirror = document.createElement('div');
  const style = window.getComputedStyle(element);

  mirror.style.cssText = `
    position: absolute;
    visibility: hidden;
    white-space: pre-wrap;
    word-wrap: break-word;
    font-family: ${style.fontFamily};
    font-size: ${style.fontSize};
    line-height: ${style.lineHeight};
    padding: ${style.padding};
    width: ${element.clientWidth}px;
  `;

  const textBeforeCursor = element.value.slice(0, element.selectionStart);
  mirror.textContent = textBeforeCursor;

  const marker = document.createElement('span');
  marker.textContent = '|';
  mirror.appendChild(marker);

  document.body.appendChild(mirror);

  const coords = {
    left: marker.offsetLeft,
    top: marker.offsetTop
  };

  document.body.removeChild(mirror);

  return coords;
}

// ============================================
// Exports
// ============================================

export default {
  init: initLinker,
  attach: attachLinker,
  parseLinks,
  extractLinkIds,
  renderLinkedText
};
