/**
 * FreeClipboard Extension - AI Sidebar
 * In-page AI assistant panel for summarization, translation, explanation, and reply generation
 */

(function() {
  'use strict';

  // Prevent double injection
  if (window.__fcAISidebar) return;
  window.__fcAISidebar = true;

  // ============================================
  // CONFIGURATION
  // ============================================

  const CONFIG = {
    SIDEBAR_WIDTH: 380,
    ANIMATION_DURATION: 300,
    DEFAULT_ACTION: 'summarize',
    MAX_TEXT_LENGTH: 10000,
    API_TIMEOUT: 15000
  };

  // ============================================
  // STATE
  // ============================================

  let sidebarElement = null;
  let overlayElement = null;
  let isOpen = false;
  let isProcessing = false;
  let currentRequest = null;
  let currentResult = null;

  // ============================================
  // INITIALIZATION
  // ============================================

  function init() {
    console.log('[FreeClipboard AI] Sidebar initialized');

    // Listen for messages from extension
    window.addEventListener('message', handleWindowMessage);

    // Close on Escape key
    document.addEventListener('keydown', handleKeydown);

    // Notify that we're ready
    window.postMessage({ type: 'FC_AI_SIDEBAR_READY' }, '*');
  }

  function handleWindowMessage(event) {
    // Validate message origin and structure
    if (!event.data || typeof event.data !== 'object') return;
    if (event.data.type !== 'FC_AI_REQUEST') return;

    const { action, text, options = {} } = event.data;

    // Validate required fields
    if (!text || typeof text !== 'string') {
      console.error('[FreeClipboard AI] Invalid text provided');
      return;
    }

    // Validate action
    const validActions = ['summarize', 'translate', 'explain', 'reply', 'analyze'];
    const finalAction = validActions.includes(action) ? action : CONFIG.DEFAULT_ACTION;

    // Open sidebar with request
    openSidebar(finalAction, text, options);
  }

  function handleKeydown(e) {
    if (e.key === 'Escape' && isOpen) {
      closeSidebar();
    }
  }

  // ============================================
  // SIDEBAR CREATION & MANAGEMENT
  // ============================================

  function openSidebar(action, text, options = {}) {
    console.log('[FreeClipboard AI] Opening sidebar:', action);

    // If already open, update with new request
    if (isOpen) {
      updateSidebar(action, text, options);
      return;
    }

    // Store current request
    currentRequest = {
      action,
      text: truncateText(text),
      options,
      timestamp: Date.now()
    };

    // Reset state
    currentResult = null;
    isProcessing = false;

    // Create overlay
    createOverlay();

    // Create sidebar element
    sidebarElement = buildSidebarElement();
    document.body.appendChild(sidebarElement);

    // Inject styles
    injectStyles();

    // Animate in
    requestAnimationFrame(() => {
      if (overlayElement) overlayElement.classList.add('fc-overlay-visible');
      sidebarElement.classList.add('fc-sidebar-visible');
    });

    isOpen = true;

    // Process AI request
    processAIRequest(action, currentRequest.text, options);
  }

  function createOverlay() {
    // Remove existing if any
    removeOverlay();

    overlayElement = document.createElement('div');
    overlayElement.id = 'fc-ai-overlay';
    overlayElement.className = 'fc-ai-overlay';
    overlayElement.setAttribute('aria-hidden', 'true');

    // Close on click
    overlayElement.addEventListener('click', (e) => {
      if (e.target === overlayElement) {
        closeSidebar();
      }
    });

    document.body.appendChild(overlayElement);
  }

  function removeOverlay() {
    if (overlayElement) {
      overlayElement.remove();
      overlayElement = null;
    }
  }

  function buildSidebarElement() {
    const sidebar = document.createElement('div');
    sidebar.id = 'fc-ai-sidebar';
    sidebar.className = 'fc-ai-sidebar';
    sidebar.setAttribute('role', 'dialog');
    sidebar.setAttribute('aria-label', 'FreeClipboard AI Assistant');

    // Truncate text for preview
    const previewText = currentRequest.text.substring(0, 180);
    const isTruncated = currentRequest.text.length > 180;

    sidebar.innerHTML = `
      <!-- Header -->
      <div class="fc-ai-header">
        <div class="fc-ai-header-title">
          <span class="fc-ai-header-icon">🤖</span>
          <span>FreeClipboard AI</span>
        </div>
        <button class="fc-ai-close-btn" id="fc-ai-close" title="Close (Esc)" aria-label="Close sidebar">
          <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
            <path d="M12 4L4 12M4 4L12 12" stroke="currentColor" stroke-width="2" stroke-linecap="round"/>
          </svg>
        </button>
      </div>

      <!-- Content -->
      <div class="fc-ai-content">
        <!-- Original Text Section -->
        <div class="fc-ai-section">
          <div class="fc-ai-section-label">
            <span>Original Text</span>
            <span class="fc-ai-text-stats" id="fc-ai-stats"></span>
          </div>
          <div class="fc-ai-original-text" id="fc-ai-original">
            ${escapeHtml(previewText)}${isTruncated ? '...' : ''}
          </div>
        </div>

        <!-- Action Tabs -->
        <div class="fc-ai-section">
          <div class="fc-ai-section-label">Choose Action</div>
          <div class="fc-ai-tabs" id="fc-ai-tabs">
            <button class="fc-ai-tab ${currentRequest.action === 'summarize' ? 'active' : ''}" 
                    data-action="summarize" title="Summarize text">
              <span>📝</span>
              <span>Summarize</span>
            </button>
            <button class="fc-ai-tab ${currentRequest.action === 'translate' ? 'active' : ''}" 
                    data-action="translate" title="Translate text">
              <span>🌐</span>
              <span>Translate</span>
            </button>
            <button class="fc-ai-tab ${currentRequest.action === 'explain' ? 'active' : ''}" 
                    data-action="explain" title="Explain text">
              <span>💡</span>
              <span>Explain</span>
            </button>
            <button class="fc-ai-tab ${currentRequest.action === 'reply' ? 'active' : ''}" 
                    data-action="reply" title="Generate reply">
              <span>💬</span>
              <span>Reply</span>
            </button>
          </div>
        </div>

        <!-- Language Selector (for translate) -->
        <div class="fc-ai-section fc-ai-lang-section hidden" id="fc-ai-lang-section">
          <div class="fc-ai-section-label">Target Language</div>
          <select class="fc-ai-select" id="fc-ai-lang-select">
            <option value="en">English</option>
            <option value="es">Spanish</option>
            <option value="fr">French</option>
            <option value="de">German</option>
            <option value="it">Italian</option>
            <option value="pt">Portuguese</option>
            <option value="ru">Russian</option>
            <option value="zh">Chinese</option>
            <option value="ja">Japanese</option>
            <option value="ko">Korean</option>
            <option value="ar">Arabic</option>
            <option value="hi">Hindi</option>
            <option value="ur">Urdu</option>
          </select>
        </div>

        <!-- Result Section -->
        <div class="fc-ai-section fc-ai-result-section">
          <div class="fc-ai-section-label">
            <span>Result</span>
            <span class="fc-ai-status" id="fc-ai-status"></span>
          </div>
          <div class="fc-ai-result-area" id="fc-ai-result">
            <div class="fc-ai-loading">
              <div class="fc-ai-spinner"></div>
              <p>AI is analyzing your text...</p>
              <span class="fc-ai-loading-hint">This may take a few seconds</span>
            </div>
          </div>
        </div>
      </div>

      <!-- Footer -->
      <div class="fc-ai-footer">
        <button class="fc-ai-btn fc-ai-btn-secondary" id="fc-ai-copy-btn" disabled>
          <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
            <rect x="2" y="2" width="8" height="8" rx="1" stroke="currentColor" stroke-width="1.5"/>
            <path d="M5 5H12V12H5V5Z" stroke="currentColor" stroke-width="1.5"/>
          </svg>
          <span>Copy</span>
        </button>
        <button class="fc-ai-btn fc-ai-btn-primary" id="fc-ai-save-btn" disabled>
          <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
            <path d="M2 7L5.5 10.5L12 4" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/>
          </svg>
          <span>Save to Clips</span>
        </button>
      </div>
    `;

    // Attach event listeners
    attachSidebarEvents(sidebar);

    return sidebar;
  }

  function attachSidebarEvents(sidebar) {
    // Close button
    const closeBtn = sidebar.querySelector('#fc-ai-close');
    if (closeBtn) {
      closeBtn.addEventListener('click', closeSidebar);
    }

    // Tab switching
    const tabs = sidebar.querySelectorAll('.fc-ai-tab');
    tabs.forEach(tab => {
      tab.addEventListener('click', () => {
        const newAction = tab.dataset.action;
        if (newAction && newAction !== currentRequest?.action) {
          switchTab(newAction);
        }
      });
    });

    // Language selector
    const langSelect = sidebar.querySelector('#fc-ai-lang-select');
    if (langSelect) {
      langSelect.addEventListener('change', () => {
        if (currentRequest?.action === 'translate') {
          processAIRequest('translate', currentRequest.text, {
            targetLang: langSelect.value
          });
        }
      });
    }

    // Copy button
    const copyBtn = sidebar.querySelector('#fc-ai-copy-btn');
    if (copyBtn) {
      copyBtn.addEventListener('click', copyResultToClipboard);
    }

    // Save button
    const saveBtn = sidebar.querySelector('#fc-ai-save-btn');
    if (saveBtn) {
      saveBtn.addEventListener('click', saveResultToClips);
    }
  }

  // ============================================
  // AI PROCESSING
  // ============================================

  async function processAIRequest(action, text, options = {}) {
    if (isProcessing) return;
    isProcessing = true;

    updateStatus('processing');
    showLoading();

    try {
      // Prepare request based on action
      const requestData = prepareRequest(action, text, options);

      // Send to background script
      const response = await sendMessageToBackground({
        type: 'AI_REQUEST',
        data: requestData
      });

      if (response?.success) {
        currentResult = response.data;
        displayResult(action, response.data);
        updateStatus('complete');
        enableActionButtons();
      } else {
        throw new Error(response?.error || 'AI processing failed');
      }

    } catch (err) {
      console.error('[FreeClipboard AI] Processing error:', err);
      displayError(err.message || 'Failed to process request. Please try again.');
      updateStatus('error');
    }

    isProcessing = false;
  }

  function prepareRequest(action, text, options) {
    const baseRequest = {
      action,
      content: text.substring(0, CONFIG.MAX_TEXT_LENGTH)
    };

    switch (action) {
      case 'summarize':
        return {
          ...baseRequest,
          maxLength: options.maxLength || 150,
          style: options.style || 'concise'
        };

      case 'translate':
        return {
          ...baseRequest,
          targetLanguage: options.targetLang || 'en',
          preserveFormatting: true
        };

      case 'explain':
        return {
          ...baseRequest,
          level: options.level || 'simple',
          includeExamples: true
        };

      case 'reply':
        return {
          ...baseRequest,
          tone: options.tone || 'professional',
          context: options.context || ''
        };

      case 'analyze':
        return {
          ...baseRequest,
          analysisType: options.analysisType || 'sentiment'
        };

      default:
        return baseRequest;
    }
  }

  // ============================================
  // RESULT DISPLAY
  // ============================================

  function displayResult(action, data) {
    const resultArea = sidebarElement?.querySelector('#fc-ai-result');
    if (!resultArea) return;

    let html = '';

    switch (action) {
      case 'summarize':
        html = renderSummaryResult(data);
        break;
      case 'translate':
        html = renderTranslateResult(data);
        break;
      case 'explain':
        html = renderExplainResult(data);
        break;
      case 'reply':
        html = renderReplyResult(data);
        break;
      case 'analyze':
        html = renderAnalyzeResult(data);
        break;
      default:
        html = renderGenericResult(data);
    }

    resultArea.innerHTML = html;
  }

  function renderSummaryResult(data) {
    if (typeof data === 'string') {
      return `<div class="fc-ai-result-text">${escapeHtml(data)}</div>`;
    }

    return `
      <div class="fc-ai-result-summary">
        <div class="fc-ai-result-main">${escapeHtml(data.summary || data)}</div>
        ${data.keyPoints ? `
          <div class="fc-ai-result-section">
            <h4>Key Points</h4>
            <ul>
              ${data.keyPoints.map(p => `<li>${escapeHtml(p)}</li>`).join('')}
            </ul>
          </div>
        ` : ''}
        ${data.readingTime ? `
          <div class="fc-ai-result-meta">
            ⏱️ Reading time: ${data.readingTime} min
          </div>
        ` : ''}
      </div>
    `;
  }

  function renderTranslateResult(data) {
    return `
      <div class="fc-ai-result-translation">
        <div class="fc-ai-result-main">${escapeHtml(data.translation || data)}</div>
        ${data.detectedLanguage ? `
          <div class="fc-ai-result-meta">
            Detected: ${data.detectedLanguage} → ${data.targetLanguage || 'English'}
          </div>
        ` : ''}
      </div>
    `;
  }

  function renderExplainResult(data) {
    if (typeof data === 'string') {
      return `<div class="fc-ai-result-text">${escapeHtml(data)}</div>`;
    }

    return `
      <div class="fc-ai-result-explanation">
        <div class="fc-ai-result-section">
          <h4>Simple Explanation</h4>
          <p>${escapeHtml(data.simple || data)}</p>
        </div>
        ${data.technical ? `
          <div class="fc-ai-result-section">
            <h4>Technical Details</h4>
            <p>${escapeHtml(data.technical)}</p>
          </div>
        ` : ''}
        ${data.examples ? `
          <div class="fc-ai-result-section">
            <h4>Examples</h4>
            <ul>
              ${data.examples.map(ex => `<li>${escapeHtml(ex)}</li>`).join('')}
            </ul>
          </div>
        ` : ''}
      </div>
    `;
  }

  function renderReplyResult(data) {
    return `
      <div class="fc-ai-result-reply">
        <div class="fc-ai-result-main">${escapeHtml(data.reply || data)}</div>
        ${data.alternatives ? `
          <div class="fc-ai-result-section">
            <h4>Alternative Replies</h4>
            <div class="fc-ai-alternatives">
              ${data.alternatives.map((alt, i) => `
                <button class="fc-ai-alt-btn" data-index="${i}">
                  ${escapeHtml(alt.substring(0, 60))}...
                </button>
              `).join('')}
            </div>
          </div>
        ` : ''}
      </div>
    `;
  }

  function renderAnalyzeResult(data) {
    return `
      <div class="fc-ai-result-analysis">
        ${data.sentiment ? `
          <div class="fc-ai-result-section">
            <h4>Sentiment</h4>
            <div class="fc-ai-sentiment-bar">
              <div class="fc-ai-sentiment-positive" style="width: ${data.sentiment.positive || 0}%"></div>
              <div class="fc-ai-sentiment-neutral" style="width: ${data.sentiment.neutral || 0}%"></div>
              <div class="fc-ai-sentiment-negative" style="width: ${data.sentiment.negative || 0}%"></div>
            </div>
            <div class="fc-ai-sentiment-labels">
              <span>😊 Positive</span>
              <span>😐 Neutral</span>
              <span>😟 Negative</span>
            </div>
          </div>
        ` : ''}
        ${data.entities ? `
          <div class="fc-ai-result-section">
            <h4>Key Entities</h4>
            <div class="fc-ai-entities">
              ${data.entities.map(e => `
                <span class="fc-ai-entity" data-type="${e.type}">${escapeHtml(e.name)}</span>
              `).join('')}
            </div>
          </div>
        ` : ''}
      </div>
    `;
  }

  function renderGenericResult(data) {
    const text = typeof data === 'string' ? data : JSON.stringify(data, null, 2);
    return `<div class="fc-ai-result-text"><pre>${escapeHtml(text)}</pre></div>`;
  }

  // ============================================
  // UI STATE MANAGEMENT
  // ============================================

  function showLoading() {
    const resultArea = sidebarElement?.querySelector('#fc-ai-result');
    if (!resultArea) return;

    resultArea.innerHTML = `
      <div class="fc-ai-loading">
        <div class="fc-ai-spinner"></div>
        <p>AI is analyzing your text...</p>
        <span class="fc-ai-loading-hint">This may take a few seconds</span>
      </div>
    `;

    disableActionButtons();
  }

  function displayError(message) {
    const resultArea = sidebarElement?.querySelector('#fc-ai-result');
    if (!resultArea) return;

    resultArea.innerHTML = `
      <div class="fc-ai-error">
        <div class="fc-ai-error-icon">⚠️</div>
        <h4>Something went wrong</h4>
        <p>${escapeHtml(message)}</p>
        <button class="fc-ai-btn fc-ai-btn-secondary fc-ai-retry-btn" id="fc-ai-retry">
          Try Again
        </button>
      </div>
    `;

    const retryBtn = resultArea.querySelector('#fc-ai-retry');
    if (retryBtn) {
      retryBtn.addEventListener('click', () => {
        if (currentRequest) {
          processAIRequest(currentRequest.action, currentRequest.text, currentRequest.options);
        }
      });
    }
  }

  function updateStatus(status) {
    const statusEl = sidebarElement?.querySelector('#fc-ai-status');
    if (!statusEl) return;

    const statusMap = {
      processing: '<span class="fc-ai-status-processing">● Processing</span>',
      complete: '<span class="fc-ai-status-complete">✓ Complete</span>',
      error: '<span class="fc-ai-status-error">✗ Error</span>'
    };

    statusEl.innerHTML = statusMap[status] || '';
  }

  function enableActionButtons() {
    const copyBtn = sidebarElement?.querySelector('#fc-ai-copy-btn');
    const saveBtn = sidebarElement?.querySelector('#fc-ai-save-btn');

    if (copyBtn) {
      copyBtn.disabled = false;
      copyBtn.classList.remove('disabled');
    }
    if (saveBtn) {
      saveBtn.disabled = false;
      saveBtn.classList.remove('disabled');
    }
  }

  function disableActionButtons() {
    const copyBtn = sidebarElement?.querySelector('#fc-ai-copy-btn');
    const saveBtn = sidebarElement?.querySelector('#fc-ai-save-btn');

    if (copyBtn) {
      copyBtn.disabled = true;
      copyBtn.classList.add('disabled');
    }
    if (saveBtn) {
      saveBtn.disabled = true;
      saveBtn.classList.add('disabled');
    }
  }

  // ============================================
  // TAB SWITCHING
  // ============================================

  function switchTab(newAction) {
    if (!currentRequest || isProcessing) return;

    // Update UI tabs
    sidebarElement.querySelectorAll('.fc-ai-tab').forEach(tab => {
      tab.classList.toggle('active', tab.dataset.action === newAction);
    });

    // Show/hide language selector
    const langSection = sidebarElement.querySelector('#fc-ai-lang-section');
    if (langSection) {
      langSection.classList.toggle('hidden', newAction !== 'translate');
    }

    // Update request
    currentRequest.action = newAction;
    currentRequest.timestamp = Date.now();

    // Process new action
    processAIRequest(newAction, currentRequest.text, currentRequest.options);
  }

  function updateSidebar(action, text, options) {
    // Update original text if different
    if (text !== currentRequest?.text) {
      currentRequest = {
        action,
        text: truncateText(text),
        options,
        timestamp: Date.now()
      };

      const originalEl = sidebarElement?.querySelector('#fc-ai-original');
      if (originalEl) {
        const preview = currentRequest.text.substring(0, 180);
        const isTruncated = currentRequest.text.length > 180;
        originalEl.innerHTML = escapeHtml(preview) + (isTruncated ? '...' : '');
      }

      // Update stats
      updateTextStats();
    }

    // Switch to new action
    switchTab(action);
  }

  function updateTextStats() {
    const statsEl = sidebarElement?.querySelector('#fc-ai-stats');
    if (!statsEl || !currentRequest) return;

    const words = currentRequest.text.split(/\s+/).length;
    const chars = currentRequest.text.length;
    statsEl.textContent = `${chars} chars · ${words} words`;
  }

  // ============================================
  // ACTIONS
  // ============================================

  async function copyResultToClipboard() {
    if (!currentResult) return;

    const text = extractTextFromResult(currentResult);
    if (!text) return;

    try {
      await navigator.clipboard.writeText(text);
      showToast('Copied to clipboard!');
    } catch (err) {
      console.error('Copy failed:', err);
      showToast('Failed to copy');
    }
  }

  async function saveResultToClips() {
    if (!currentResult || !currentRequest) return;

    const text = extractTextFromResult(currentResult);
    if (!text) return;

    try {
      await sendMessageToBackground({
        type: 'CAPTURE_CLIP',
        data: {
          content: text,
          content_type: 'ai-result',
          source_url: window.location.href,
          source_title: document.title,
          metadata: {
            ai_action: currentRequest.action,
            original_text: currentRequest.text.substring(0, 500),
            processed_at: new Date().toISOString()
          }
        }
      });

      showToast('Saved to FreeClipboard!');
    } catch (err) {
      console.error('Save failed:', err);
      showToast('Failed to save');
    }
  }

  function extractTextFromResult(data) {
    if (typeof data === 'string') return data;
    return data.summary || data.translation || data.reply || data.simple || JSON.stringify(data);
  }

  // ============================================
  // SIDEBAR CLOSING
  // ============================================

  function closeSidebar() {
    if (!isOpen) return;

    console.log('[FreeClipboard AI] Closing sidebar');

    // Animate out
    if (overlayElement) {
      overlayElement.classList.remove('fc-overlay-visible');
      overlayElement.classList.add('fc-overlay-hiding');
    }

    if (sidebarElement) {
      sidebarElement.classList.remove('fc-sidebar-visible');
      sidebarElement.classList.add('fc-sidebar-hiding');
    }

    // Remove after animation
    setTimeout(() => {
      removeSidebar();
      removeOverlay();
      isOpen = false;
      currentRequest = null;
      currentResult = null;
      isProcessing = false;
    }, CONFIG.ANIMATION_DURATION);
  }

  function removeSidebar() {
    if (sidebarElement) {
      sidebarElement.remove();
      sidebarElement = null;
    }
  }

  // ============================================
  // TOAST NOTIFICATION
  // ============================================

  function showToast(message) {
    // Remove existing toasts
    document.querySelectorAll('.fc-ai-toast').forEach(t => t.remove());

    const toast = document.createElement('div');
    toast.className = 'fc-ai-toast';
    toast.textContent = message;

    document.body.appendChild(toast);

    // Auto-remove
    setTimeout(() => {
      toast.classList.add('fc-ai-toast-hiding');
      setTimeout(() => toast.remove(), 300);
    }, 2500);
  }

  // ============================================
  // COMMUNICATION
  // ============================================

  function sendMessageToBackground(message) {
    return new Promise((resolve, reject) => {
      try {
        chrome.runtime.sendMessage(message, (response) => {
          if (chrome.runtime.lastError) {
            reject(new Error(chrome.runtime.lastError.message));
          } else {
            resolve(response);
          }
        });

        // Timeout fallback
        setTimeout(() => {
          reject(new Error('Request timeout'));
        }, CONFIG.API_TIMEOUT);

      } catch (err) {
        reject(err);
      }
    });
  }

  // ============================================
  // UTILITIES
  // ============================================

  function truncateText(text, maxLength = CONFIG.MAX_TEXT_LENGTH) {
    if (!text || text.length <= maxLength) return text;
    return text.substring(0, maxLength);
  }

  function escapeHtml(text) {
    if (!text) return '';
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
  }

  // ============================================
  // STYLES INJECTION
  // ============================================

  function injectStyles() {
    if (document.getElementById('fc-ai-sidebar-styles')) return;

    const style = document.createElement('style');
    style.id = 'fc-ai-sidebar-styles';
    style.textContent = `
      /* ============================================
         FreeClipboard AI Sidebar Styles
         ============================================ */

      /* Overlay */
      .fc-ai-overlay {
        position: fixed;
        top: 0;
        left: 0;
        right: 0;
        bottom: 0;
        background: rgba(0, 0, 0, 0.6);
        backdrop-filter: blur(4px);
        z-index: 2147483646;
        opacity: 0;
        transition: opacity ${CONFIG.ANIMATION_DURATION}ms ease;
      }

      .fc-ai-overlay.fc-overlay-visible {
        opacity: 1;
      }

      .fc-ai-overlay.fc-overlay-hiding {
        opacity: 0;
      }

      /* Sidebar */
      .fc-ai-sidebar {
        position: fixed;
        top: 0;
        right: 0;
        bottom: 0;
        width: ${CONFIG.SIDEBAR_WIDTH}px;
        max-width: 100vw;
        background: #0f0f0f;
        border-left: 1px solid #2a2a2a;
        z-index: 2147483647;
        display: flex;
        flex-direction: column;
        font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif;
        font-size: 13px;
        color: #e5e5e5;
        transform: translateX(100%);
        transition: transform ${CONFIG.ANIMATION_DURATION}ms cubic-bezier(0.16, 1, 0.3, 1);
        box-shadow: -8px 0 32px rgba(0, 0, 0, 0.4);
      }

      .fc-ai-sidebar.fc-sidebar-visible {
        transform: translateX(0);
      }

      .fc-ai-sidebar.fc-sidebar-hiding {
        transform: translateX(100%);
      }

      /* Header */
      .fc-ai-header {
        display: flex;
        align-items: center;
        justify-content: space-between;
        padding: 16px 20px;
        border-bottom: 1px solid #2a2a2a;
        flex-shrink: 0;
      }

      .fc-ai-header-title {
        display: flex;
        align-items: center;
        gap: 10px;
        font-size: 16px;
        font-weight: 600;
        color: #fff;
      }

      .fc-ai-header-icon {
        font-size: 20px;
      }

      .fc-ai-close-btn {
        background: #1a1a1a;
        border: 1px solid #333;
        color: #888;
        width: 32px;
        height: 32px;
        border-radius: 8px;
        cursor: pointer;
        display: flex;
        align-items: center;
        justify-content: center;
        transition: all 0.2s;
      }

      .fc-ai-close-btn:hover {
        background: #2a2a2a;
        color: #fff;
      }

      /* Content */
      .fc-ai-content {
        flex: 1;
        overflow-y: auto;
        padding: 16px 20px;
        display: flex;
        flex-direction: column;
        gap: 20px;
      }

      .fc-ai-content::-webkit-scrollbar {
        width: 6px;
      }

      .fc-ai-content::-webkit-scrollbar-track {
        background: transparent;
      }

      .fc-ai-content::-webkit-scrollbar-thumb {
        background: #333;
        border-radius: 3px;
      }

      /* Sections */
      .fc-ai-section {
        display: flex;
        flex-direction: column;
        gap: 8px;
      }

      .fc-ai-section-label {
        display: flex;
        justify-content: space-between;
        align-items: center;
        font-size: 11px;
        font-weight: 600;
        text-transform: uppercase;
        letter-spacing: 0.05em;
        color: #666;
      }

      .fc-ai-text-stats {
        font-size: 11px;
        color: #888;
        text-transform: none;
        font-weight: 400;
      }

      .fc-ai-status {
        font-size: 11px;
        font-weight: 500;
      }

      .fc-ai-status-processing {
        color: #f59e0b;
      }

      .fc-ai-status-complete {
        color: #22c55e;
      }

      .fc-ai-status-error {
        color: #ef4444;
      }

      /* Original Text */
      .fc-ai-original-text {
        background: #1a1a1a;
        border: 1px solid #2a2a2a;
        border-radius: 10px;
        padding: 12px;
        font-size: 12px;
        line-height: 1.6;
        color: #a0a0a0;
        max-height: 120px;
        overflow-y: auto;
      }

      /* Tabs */
      .fc-ai-tabs {
        display: grid;
        grid-template-columns: repeat(2, 1fr);
        gap: 8px;
      }

      .fc-ai-tab {
        background: #1a1a1a;
        border: 1px solid #2a2a2a;
        border-radius: 8px;
        padding: 10px;
        color: #888;
        font-size: 12px;
        cursor: pointer;
        transition: all 0.2s;
        display: flex;
        align-items: center;
        justify-content: center;
        gap: 6px;
        font-family: inherit;
      }

      .fc-ai-tab:hover {
        background: #222;
        color: #ccc;
      }

      .fc-ai-tab.active {
        background: #7C3AED;
        color: #fff;
        border-color: #7C3AED;
      }

      .fc-ai-tab span:first-child {
        font-size: 14px;
      }

      /* Language Selector */
      .fc-ai-lang-section.hidden {
        display: none;
      }

      .fc-ai-select {
        background: #1a1a1a;
        border: 1px solid #2a2a2a;
        border-radius: 8px;
        padding: 10px 12px;
        color: #e5e5e5;
        font-size: 13px;
        font-family: inherit;
        cursor: pointer;
        outline: none;
      }

      .fc-ai-select:focus {
        border-color: #7C3AED;
      }

      .fc-ai-select option {
        background: #1a1a1a;
        color: #e5e5e5;
      }

      /* Result Area */
      .fc-ai-result-section {
        flex: 1;
        min-height: 150px;
      }

      .fc-ai-result-area {
        background: #1a1a1a;
        border: 1px solid #2a2a2a;
        border-radius: 10px;
        padding: 16px;
        min-height: 150px;
      }

      /* Loading */
      .fc-ai-loading {
        display: flex;
        flex-direction: column;
        align-items: center;
        justify-content: center;
        gap: 16px;
        padding: 40px 20px;
        text-align: center;
      }

      .fc-ai-spinner {
        width: 32px;
        height: 32px;
        border: 3px solid #2a2a2a;
        border-top-color: #7C3AED;
        border-radius: 50%;
        animation: fc-ai-spin 0.8s linear infinite;
      }

      @keyframes fc-ai-spin {
        to { transform: rotate(360deg); }
      }

      .fc-ai-loading p {
        color: #a0a0a0;
        font-size: 14px;
        margin: 0;
      }

      .fc-ai-loading-hint {
        color: #666;
        font-size: 12px;
      }

      /* Results */
      .fc-ai-result-text,
      .fc-ai-result-main {
        font-size: 13px;
        line-height: 1.7;
        color: #e5e5e5;
        white-space: pre-wrap;
      }

      .fc-ai-result-text pre {
        white-space: pre-wrap;
        word-break: break-word;
        margin: 0;
        font-family: inherit;
      }

      .fc-ai-result-section {
        margin-top: 16px;
      }

      .fc-ai-result-section h4 {
        font-size: 12px;
        font-weight: 600;
        color: #a78bfa;
        margin: 0 0 8px;
        text-transform: uppercase;
        letter-spacing: 0.05em;
      }

      .fc-ai-result-section ul {
        margin: 0;
        padding-left: 18px;
      }

      .fc-ai-result-section li {
        margin: 6px 0;
        color: #ccc;
      }

      .fc-ai-result-section p {
        margin: 0;
        color: #ccc;
        line-height: 1.6;
      }

      .fc-ai-result-meta {
        margin-top: 12px;
        padding-top: 12px;
        border-top: 1px solid #2a2a2a;
        font-size: 12px;
        color: #666;
      }

      /* Sentiment Bar */
      .fc-ai-sentiment-bar {
        display: flex;
        height: 8px;
        border-radius: 4px;
        overflow: hidden;
        margin: 8px 0;
      }

      .fc-ai-sentiment-positive {
        background: #22c55e;
      }

      .fc-ai-sentiment-neutral {
        background: #f59e0b;
      }

      .fc-ai-sentiment-negative {
        background: #ef4444;
      }

      .fc-ai-sentiment-labels {
        display: flex;
        justify-content: space-between;
        font-size: 11px;
        color: #666;
      }

      /* Entities */
      .fc-ai-entities {
        display: flex;
        flex-wrap: wrap;
        gap: 6px;
      }

      .fc-ai-entity {
        background: #7C3AED22;
        color: #a78bfa;
        padding: 4px 10px;
        border-radius: 12px;
        font-size: 12px;
      }

      /* Error */
      .fc-ai-error {
        display: flex;
        flex-direction: column;
        align-items: center;
        gap: 12px;
        padding: 40px 20px;
        text-align: center;
      }

      .fc-ai-error-icon {
        font-size: 40px;
      }

      .fc-ai-error h4 {
        margin: 0;
        color: #ef4444;
        font-size: 14px;
      }

      .fc-ai-error p {
        margin: 0;
        color: #888;
        font-size: 13px;
      }

      .fc-ai-retry-btn {
        margin-top: 8px;
      }

      /* Footer */
      .fc-ai-footer {
        display: flex;
        gap: 10px;
        padding: 16px 20px;
        border-top: 1px solid #2a2a2a;
        flex-shrink: 0;
      }

      .fc-ai-btn {
        flex: 1;
        display: flex;
        align-items: center;
        justify-content: center;
        gap: 8px;
        padding: 12px;
        border-radius: 10px;
        font-size: 13px;
        font-weight: 500;
        cursor: pointer;
        transition: all 0.2s;
        font-family: inherit;
        border: none;
      }

      .fc-ai-btn:disabled,
      .fc-ai-btn.disabled {
        opacity: 0.4;
        cursor: not-allowed;
      }

      .fc-ai-btn-primary {
        background: #7C3AED;
        color: #fff;
      }

      .fc-ai-btn-primary:hover:not(:disabled) {
        background: #6D28D9;
      }

      .fc-ai-btn-secondary {
        background: #1a1a1a;
        color: #ccc;
        border: 1px solid #333;
      }

      .fc-ai-btn-secondary:hover:not(:disabled) {
        background: #222;
        color: #fff;
      }

      .fc-ai-btn svg {
        flex-shrink: 0;
      }

      /* Toast */
      .fc-ai-toast {
        position: fixed;
        bottom: 24px;
        right: 24px;
        background: #7C3AED;
        color: #fff;
        padding: 12px 20px;
        border-radius: 10px;
        font-size: 14px;
        font-weight: 500;
        z-index: 2147483647;
        animation: fc-ai-toast-in 0.3s ease;
        box-shadow: 0 8px 24px rgba(124, 58, 237, 0.3);
      }

      .fc-ai-toast.fc-ai-toast-hiding {
        animation: fc-ai-toast-out 0.3s ease forwards;
      }

      @keyframes fc-ai-toast-in {
        from {
          opacity: 0;
          transform: translateY(10px) scale(0.95);
        }
        to {
          opacity: 1;
          transform: translateY(0) scale(1);
        }
      }

      @keyframes fc-ai-toast-out {
        from {
          opacity: 1;
          transform: translateY(0) scale(1);
        }
        to {
          opacity: 0;
          transform: translateY(10px) scale(0.95);
        }
      }

      /* Utility */
      .hidden {
        display: none !important;
      }
    `;

    document.head.appendChild(style);
    console.log('[FreeClipboard AI] Styles injected');
  }

  // ============================================
  // START
  // ============================================

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
