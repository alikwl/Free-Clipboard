/**
 * FreeClipboard Extension - Smart Tooltip
 * Compact floating actions for selected text.
 */

(function() {
  'use strict';

  if (window.__fcSmartTooltip) return;
  window.__fcSmartTooltip = true;

  const CONFIG = {
    MIN_SELECTION_LENGTH: 10,
    MAX_SELECTION_LENGTH: 50000,
    AUTO_HIDE_DELAY: 4500,
    ANIMATION_DURATION: 160,
    SHOW_DELAY: 90
  };

  let tooltipElement = null;
  let hideTimeout = null;
  let showTimeout = null;
  let isEnabled = true;
  let isSubmitting = false;
  let suppressUntil = 0;
  let lastAnchorRect = null;

  function init() {
    chrome.storage.local.get('fc_settings', (result) => {
      const settings = result.fc_settings || {};
      isEnabled = settings.show_tooltip !== false;
    });

    chrome.storage.onChanged.addListener((changes) => {
      if (changes.fc_settings) {
        isEnabled = changes.fc_settings.newValue?.show_tooltip !== false;
      }
    });

    document.addEventListener('mouseup', handleMouseUp, true);
    document.addEventListener('selectionchange', handleSelectionChange);
    document.addEventListener('scroll', () => hideTooltip(true), true);
    window.addEventListener('resize', () => hideTooltip(true));
    document.addEventListener('keydown', (event) => {
      if (event.key === 'Escape') {
        hideTooltip(true);
      }
    });
  }

  function handleMouseUp(event) {
    if (!isEnabled || isSubmitting) return;
    if (event.button !== 0) return;
    if (Date.now() < suppressUntil) return;
    if (tooltipElement && tooltipElement.contains(event.target)) return;
    if (isInputElement(event.target)) return;

    const selection = window.getSelection();
    const text = selection?.toString()?.trim() || '';

    if (!isValidSelection(text)) {
      hideTooltip(true);
      return;
    }

    // Block stale bubble-phase tooltip listeners from creating a duplicate overlay.
    event.stopImmediatePropagation();

    const range = selection.getRangeAt(0);
    const rect = range.getBoundingClientRect();
    lastAnchorRect = rect;

    clearTimeout(showTimeout);
    showTimeout = setTimeout(() => {
      if (!window.getSelection()?.toString()?.trim()) return;
      showTooltip(rect, text);
    }, CONFIG.SHOW_DELAY);
  }

  function handleSelectionChange() {
    if (isSubmitting) return;
    const text = window.getSelection()?.toString()?.trim() || '';
    if (!text) {
      clearTimeout(showTimeout);
      hideTooltip(true);
    }
  }

  function isInputElement(element) {
    if (!element) return false;
    const tagName = element.tagName;
    if (tagName === 'INPUT' || tagName === 'TEXTAREA') return true;
    if (element.isContentEditable) return true;

    let parent = element.parentElement;
    while (parent) {
      if (parent.isContentEditable) return true;
      parent = parent.parentElement;
    }

    return false;
  }

  function isValidSelection(text) {
    if (!text) return false;
    if (text.length < CONFIG.MIN_SELECTION_LENGTH) return false;
    if (text.length > CONFIG.MAX_SELECTION_LENGTH) return false;
    if (!text.includes(' ') && text.length < 20) return false;
    return true;
  }

  function showTooltip(selectionRect, text) {
    removeTransientUi();
    addStyles();

    const position = calculatePosition(selectionRect);
    const container = document.createElement('div');
    container.id = 'fc-smart-tooltip';
    container.className = 'fc-tooltip';
    container.style.left = `${position.left}px`;
    container.style.top = `${position.top}px`;

    container.innerHTML = `
      <div class="fc-tooltip-inner">
        <div class="fc-tooltip-top">
          <span class="fc-tooltip-title">FreeClipboard</span>
          <button class="fc-tooltip-close" title="Close">x</button>
        </div>
        <div class="fc-tooltip-actions">
          <button class="fc-btn fc-btn-primary" data-action="save">Save</button>
          <button class="fc-btn fc-btn-secondary" data-action="note">Note</button>
          <button class="fc-btn fc-btn-secondary" data-action="todo">Todo</button>
          <button class="fc-btn fc-btn-secondary" data-action="ai">AI</button>
        </div>
      </div>
    `;

    container.querySelector('.fc-tooltip-close').addEventListener('click', (event) => {
      event.stopPropagation();
      hideTooltip(true);
    });

    container.querySelector('[data-action="save"]').addEventListener('click', (event) => {
      event.stopPropagation();
      void saveClip(text, 'smart-tooltip');
    });

    container.querySelector('[data-action="note"]').addEventListener('click', (event) => {
      event.stopPropagation();
      void saveWithNote(text);
    });

    container.querySelector('[data-action="todo"]').addEventListener('click', (event) => {
      event.stopPropagation();
      void createTodo(text);
    });

    container.querySelector('[data-action="ai"]').addEventListener('click', (event) => {
      event.stopPropagation();
      void openAI(text);
    });

    container.addEventListener('mousedown', (event) => event.stopPropagation());
    document.body.appendChild(container);
    tooltipElement = container;
    startAutoHide();

    requestAnimationFrame(() => {
      tooltipElement?.classList.add('fc-tooltip-visible');
    });
  }

  function calculatePosition(selectionRect) {
    const tooltipWidth = 248;
    const tooltipHeight = 62;
    const padding = 10;
    const viewportWidth = window.innerWidth;
    const viewportHeight = window.innerHeight;

    let left = selectionRect.left + (selectionRect.width / 2) - (tooltipWidth / 2);
    let top = selectionRect.top - tooltipHeight - 10;

    if (left < padding) left = padding;
    if (left + tooltipWidth > viewportWidth - padding) {
      left = viewportWidth - tooltipWidth - padding;
    }

    if (top < padding) {
      top = selectionRect.bottom + 10;
    }

    if (top + tooltipHeight > viewportHeight - padding) {
      top = viewportHeight - tooltipHeight - padding;
    }

    return { left, top };
  }

  async function saveClip(text, source) {
    await runAction({
      content: text,
      source_method: source,
      source_url: window.location.href,
      source_title: document.title
    }, 'Saved');
  }

  async function saveWithNote(text) {
    const note = prompt('Add a note (optional):');
    if (note === null) return;

    await runAction({
      content: text,
      source_method: 'smart-tooltip-note',
      source_url: window.location.href,
      source_title: document.title,
      metadata: { user_note: note }
    }, 'Saved');
  }

  async function createTodo(text) {
    await runAction({
      content: `[TODO] ${text}`,
      content_type: 'todo',
      source_url: window.location.href,
      source_title: document.title,
      metadata: { todo_status: 'pending' }
    }, 'Todo saved');
  }

  async function openAI(text) {
    await runBackgroundAction({
      type: 'AI_REQUEST',
      data: {
        action: 'summarize',
        content: text
      }
    }, 'AI sent');
  }

  async function runAction(data, successMessage) {
    if (isSubmitting) return;
    isSubmitting = true;
    suppressUntil = Date.now() + 900;
    hideTooltip(true);
    clearSelection();

    const response = await sendToBackground({
      type: 'CAPTURE_CLIP',
      data
    });

    showSuccessBadge(response?.success ? successMessage : 'Failed', !response?.success);
    finishAction();
  }

  async function runBackgroundAction(message, successMessage) {
    if (isSubmitting) return;
    isSubmitting = true;
    suppressUntil = Date.now() + 900;
    hideTooltip(true);
    clearSelection();

    const response = await sendToBackground(message);
    showSuccessBadge(response?.success ? successMessage : 'Failed', !response?.success);
    finishAction();
  }

  function hideTooltip(immediate = false) {
    if (!tooltipElement) return;

    clearTimeout(hideTimeout);

    if (immediate) {
      tooltipElement.remove();
      tooltipElement = null;
      return;
    }

    tooltipElement.classList.remove('fc-tooltip-visible');
    tooltipElement.classList.add('fc-tooltip-hiding');

    const node = tooltipElement;
    tooltipElement = null;
    setTimeout(() => node.remove(), CONFIG.ANIMATION_DURATION);
  }

  function startAutoHide() {
    clearTimeout(hideTimeout);
    hideTimeout = setTimeout(() => hideTooltip(), CONFIG.AUTO_HIDE_DELAY);
  }

  function showSuccessBadge(message, isError = false) {
    removeSuccessBadge();
    addStyles();

    const rect = lastAnchorRect || { left: window.innerWidth / 2, top: 80, width: 0 };
    const badge = document.createElement('div');
    badge.id = 'fc-smart-tooltip-success';
    badge.className = `fc-success-badge${isError ? ' fc-success-badge-error' : ''}`;
    badge.style.left = `${Math.max(12, Math.min(window.innerWidth - 120, rect.left + (rect.width / 2) - 44))}px`;
    badge.style.top = `${Math.max(12, rect.top - 6)}px`;
    badge.textContent = `${isError ? 'Failed' : `✓ ${message}`}`;
    document.body.appendChild(badge);

    requestAnimationFrame(() => badge.classList.add('fc-success-badge-visible'));
    setTimeout(() => {
      badge.classList.remove('fc-success-badge-visible');
      setTimeout(() => badge.remove(), 180);
    }, 700);
  }

  function sendToBackground(message) {
    return new Promise((resolve) => {
      chrome.runtime.sendMessage(message, (response) => {
        if (chrome.runtime.lastError) {
          console.error('[SmartTooltip] Failed to send:', chrome.runtime.lastError.message);
          resolve({ success: false, error: chrome.runtime.lastError.message });
          return;
        }

        resolve(response);
      });
    });
  }

  function clearSelection() {
    const selection = window.getSelection();
    if (selection) selection.removeAllRanges();
  }

  function finishAction() {
    setTimeout(() => {
      isSubmitting = false;
    }, 260);
  }

  function removeSuccessBadge() {
    document.getElementById('fc-smart-tooltip-success')?.remove();
  }

  function removeTransientUi() {
    clearTimeout(hideTimeout);
    clearTimeout(showTimeout);
    document.querySelectorAll('#fc-smart-tooltip, #fc-smart-tooltip-success').forEach((node) => node.remove());
    tooltipElement = null;
  }

  function addStyles() {
    if (document.getElementById('fc-tooltip-styles')) return;

    const style = document.createElement('style');
    style.id = 'fc-tooltip-styles';
    style.textContent = `
      .fc-tooltip {
        position: fixed;
        z-index: 2147483647;
        opacity: 0;
        transform: translateY(8px) scale(0.97);
        transition: opacity ${CONFIG.ANIMATION_DURATION}ms ease, transform ${CONFIG.ANIMATION_DURATION}ms ease;
        pointer-events: none;
      }

      .fc-tooltip.fc-tooltip-visible {
        opacity: 1;
        transform: translateY(0) scale(1);
        pointer-events: auto;
      }

      .fc-tooltip.fc-tooltip-hiding {
        opacity: 0;
        transform: translateY(4px) scale(0.98);
      }

      .fc-tooltip-inner {
        width: 248px;
        padding: 10px 12px;
        border-radius: 14px;
        background: rgba(21, 21, 23, 0.98);
        border: 1px solid rgba(167, 139, 250, 0.18);
        box-shadow: 0 18px 40px rgba(0, 0, 0, 0.28);
        backdrop-filter: blur(12px);
      }

      .fc-tooltip-top {
        display: flex;
        align-items: center;
        justify-content: space-between;
        margin-bottom: 8px;
      }

      .fc-tooltip-title {
        font-size: 11px;
        font-weight: 700;
        color: #c4b5fd;
      }

      .fc-tooltip-close {
        border: none;
        background: transparent;
        color: #8b8b95;
        font-size: 16px;
        line-height: 1;
        cursor: pointer;
      }

      .fc-tooltip-actions {
        display: flex;
        gap: 6px;
      }

      .fc-btn {
        border: none;
        border-radius: 8px;
        padding: 8px 11px;
        font-size: 11px;
        font-weight: 700;
        cursor: pointer;
        transition: transform 120ms ease, background 120ms ease, color 120ms ease;
      }

      .fc-btn:hover {
        transform: translateY(-1px);
      }

      .fc-btn-primary {
        background: #7c3aed;
        color: #fff;
      }

      .fc-btn-primary:hover {
        background: #6d28d9;
      }

      .fc-btn-secondary {
        background: #2b2b31;
        color: #f4f4f5;
      }

      .fc-btn-secondary:hover {
        background: #36363d;
      }

      .fc-success-badge {
        position: fixed;
        z-index: 2147483647;
        background: #15803d;
        color: #fff;
        border-radius: 999px;
        padding: 8px 12px;
        font-size: 12px;
        font-weight: 700;
        box-shadow: 0 10px 28px rgba(0, 0, 0, 0.18);
        opacity: 0;
        transform: translateY(6px) scale(0.96);
        transition: opacity 180ms ease, transform 180ms ease;
        pointer-events: none;
      }

      .fc-success-badge.fc-success-badge-visible {
        opacity: 1;
        transform: translateY(0) scale(1);
      }

      .fc-success-badge-error {
        background: #b42318;
      }
    `;

    document.head.appendChild(style);
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
