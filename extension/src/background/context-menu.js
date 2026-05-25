/**
 * FreeClipboard Extension - Context Menu Handler
 * Dynamic right-click menu with context-aware options
 */

import { getCaptureHandler } from './capture-handler.js';

class ContextMenuManager {
  constructor(captureHandler) {
    this.capture = captureHandler;
    this.menuId = 'freeclipboard';
    this.currentContext = {};
  }

  // ============================================
  // INITIALIZATION
  // ============================================

  async initialize() {
    // Remove existing menus
    await chrome.contextMenus.removeAll();

    // Create parent menu
    chrome.contextMenus.create({
      id: this.menuId,
      title: '📋 FreeClipboard',
      contexts: ['all']
    });

    // Create dynamic submenu
    this.createSubmenu();

    // Setup click handler
    chrome.contextMenus.onClicked.addListener(this.handleClick.bind(this));

    // Update menu based on context
    chrome.tabs.onActivated.addListener(() => this.updateMenu());
    chrome.windows.onFocusChanged.addListener(() => this.updateMenu());
  }

  createSubmenu() {
    // Save options
    chrome.contextMenus.create({
      parentId: this.menuId,
      id: 'save-selection',
      title: '💾 Save Selection',
      contexts: ['selection']
    });

    chrome.contextMenus.create({
      parentId: this.menuId,
      id: 'save-image',
      title: '🖼️ Save Image',
      contexts: ['image']
    });

    chrome.contextMenus.create({
      parentId: this.menuId,
      id: 'save-link',
      title: '🔗 Save Link',
      contexts: ['link']
    });

    chrome.contextMenus.create({
      parentId: this.menuId,
      id: 'save-page',
      title: '📄 Save Page Info',
      contexts: ['page']
    });

    // Separator
    chrome.contextMenus.create({
      parentId: this.menuId,
      id: 'sep-1',
      type: 'separator',
      contexts: ['all']
    });

    // AI features
    chrome.contextMenus.create({
      parentId: this.menuId,
      id: 'ai-summarize',
      title: '🤖 Summarize',
      contexts: ['selection']
    });

    chrome.contextMenus.create({
      parentId: this.menuId,
      id: 'ai-translate',
      title: '🌐 Translate',
      contexts: ['selection']
    });

    chrome.contextMenus.create({
      parentId: this.menuId,
      id: 'ai-explain',
      title: '💡 Explain',
      contexts: ['selection']
    });

    // Separator
    chrome.contextMenus.create({
      parentId: this.menuId,
      id: 'sep-2',
      type: 'separator',
      contexts: ['all']
    });

    // Quick actions
    chrome.contextMenus.create({
      parentId: this.menuId,
      id: 'add-todo',
      title: '✅ Add as Todo',
      contexts: ['selection']
    });

    chrome.contextMenus.create({
      parentId: this.menuId,
      id: 'create-note',
      title: '📝 Create Note',
      contexts: ['selection']
    });

    chrome.contextMenus.create({
      parentId: this.menuId,
      id: 'save-snippet',
      title: '⚡ Save as Snippet',
      contexts: ['selection']
    });

    // Separator
    chrome.contextMenus.create({
      parentId: this.menuId,
      id: 'sep-3',
      type: 'separator',
      contexts: ['all']
    });

    // Tools
    chrome.contextMenus.create({
      parentId: this.menuId,
      id: 'quick-search',
      title: '🔍 Quick Search',
      contexts: ['all']
    });

    chrome.contextMenus.create({
      parentId: this.menuId,
      id: 'open-dashboard',
      title: '🌐 Open Dashboard',
      contexts: ['all']
    });
  }

  // ============================================
  // DYNAMIC UPDATES
  // ============================================

  async updateMenu() {
    // Can update menu items based on current page, user plan, etc.
    // For now, static menu is sufficient
  }

  // ============================================
  // CLICK HANDLER
  // ============================================

  async handleClick(info, tab) {
    const { menuItemId, selectionText, srcUrl, linkUrl, pageUrl, mediaType } = info;

    try {
      switch (menuItemId) {
        // Save operations
        case 'save-selection':
          await this.saveSelection(selectionText, tab);
          break;
        case 'save-image':
          await this.saveImage(srcUrl, tab);
          break;
        case 'save-link':
          await this.saveLink(linkUrl, tab);
          break;
        case 'save-page':
          await this.savePage(tab);
          break;

        // AI operations
        case 'ai-summarize':
          await this.openAISidebar(tab, 'summarize', selectionText);
          break;
        case 'ai-translate':
          await this.openAISidebar(tab, 'translate', selectionText);
          break;
        case 'ai-explain':
          await this.openAISidebar(tab, 'explain', selectionText);
          break;

        // Quick actions
        case 'add-todo':
          await this.createTodo(selectionText, tab);
          break;
        case 'create-note':
          await this.createNote(selectionText, tab);
          break;
        case 'save-snippet':
          await this.saveSnippet(selectionText, tab);
          break;

        // Tools
        case 'quick-search':
          this.openQuickSearch();
          break;
        case 'open-dashboard':
          chrome.tabs.create({ url: 'https://freeclipboard.com/dashboard' });
          break;
      }
    } catch (err) {
      console.error('[ContextMenu] Action failed:', err);
      this.showError(tab.id, 'Action failed');
    }
  }

  // ============================================
  // SAVE OPERATIONS
  // ============================================

  async saveSelection(text, tab) {
    const result = await this.capture.capture({
      content: text,
      source_url: tab.url,
      source_title: tab.title,
      source_tab_id: tab.id
    }, 'context-menu-selection');

    if (result.success) {
      this.showSuccess(tab.id, 'Saved!');
    }
  }

  async saveImage(url, tab) {
    // For images, we save the URL and metadata
    // Actual image storage would be handled by the server
    const result = await this.capture.capture({
      content: url,
      content_type: 'image',
      source_url: tab.url,
      source_title: tab.title,
      metadata: {
        image_url: url,
        original_width: null, // Would need to fetch image
        original_height: null
      }
    }, 'context-menu-image');

    if (result.success) {
      this.showSuccess(tab.id, 'Image saved!');
    }
  }

  async saveLink(url, tab) {
    // Fetch link metadata
    let metadata = {};
    try {
      metadata = await this.fetchLinkMetadata(url);
    } catch (err) {
      console.log('Failed to fetch metadata:', err);
    }

    const result = await this.capture.capture({
      content: url,
      content_type: 'link',
      source_url: tab.url,
      source_title: tab.title,
      metadata
    }, 'context-menu-link');

    if (result.success) {
      this.showSuccess(tab.id, 'Link saved!');
    }
  }

  async savePage(tab) {
    // Save page info, not full content
    const pageInfo = {
      title: tab.title,
      url: tab.url,
      favicon: tab.favIconUrl
    };

    const result = await this.capture.capture({
      content: JSON.stringify(pageInfo),
      content_type: 'page',
      source_url: tab.url,
      source_title: tab.title,
      metadata: {
        page_info: pageInfo
      }
    }, 'context-menu-page');

    if (result.success) {
      this.showSuccess(tab.id, 'Page saved!');
    }
  }

  // ============================================
  // AI OPERATIONS
  // ============================================

  async openAISidebar(tab, action, text) {
    // Inject AI sidebar script
    await chrome.scripting.executeScript({
      target: { tabId: tab.id },
      files: ['src/content/ai-sidebar.js']
    });

    // Send message to sidebar
    await chrome.scripting.executeScript({
      target: { tabId: tab.id },
      func: (action, text) => {
        window.postMessage({
          type: 'FC_AI_REQUEST',
          action,
          text,
          timestamp: Date.now()
        }, '*');
      },
      args: [action, text]
    });
  }

  // ============================================
  // QUICK ACTIONS
  // ============================================

  async createTodo(text, tab) {
    const result = await this.capture.capture({
      content: `[TODO] ${text}`,
      content_type: 'todo',
      source_url: tab.url,
      source_title: tab.title,
      metadata: {
        todo_status: 'pending',
        todo_created_from: 'context-menu'
      }
    }, 'context-menu-todo');

    if (result.success) {
      this.showSuccess(tab.id, 'Todo added!');
    }
  }

  async createNote(text, tab) {
    const result = await this.capture.capture({
      content: text,
      content_type: 'note',
      source_url: tab.url,
      source_title: tab.title,
      metadata: {
        note_format: 'plain',
        note_created_from: 'context-menu'
      }
    }, 'context-menu-note');

    if (result.success) {
      this.showSuccess(tab.id, 'Note created!');
    }
  }

  async saveSnippet(text, tab) {
    // Create a reusable snippet with trigger
    const trigger = await this.promptForTrigger(tab.id);
    if (!trigger) return;

    const result = await this.capture.capture({
      content: text,
      content_type: 'snippet',
      source_url: tab.url,
      source_title: tab.title,
      metadata: {
        snippet_trigger: trigger,
        snippet_expansion: text
      }
    }, 'context-menu-snippet');

    if (result.success) {
      this.showSuccess(tab.id, `Snippet "${trigger}" saved!`);
    }
  }

  async promptForTrigger(tabId) {
    // Simple prompt - in production, use a custom modal
    const [{ result }] = await chrome.scripting.executeScript({
      target: { tabId: tabId },
      func: () => prompt('Enter trigger word (e.g., ;;sig):')
    });
    return result;
  }

  // ============================================
  // METADATA FETCHING
  // ============================================

  async fetchLinkMetadata(url) {
    // Use background fetch for CORS
    const response = await fetch(url, {
      method: 'GET',
      headers: {
        'Accept': 'text/html'
      }
    });

    const html = await response.text();
    
    // Simple regex-based metadata extraction
    const getMeta = (name) => {
      const match = html.match(new RegExp(`<meta[^>]*(?:property|name)=["']${name}["'][^>]*content=["']([^"']+)["']`, 'i'));
      return match ? match[1] : null;
    };

    return {
      title: getMeta('og:title') || getMeta('twitter:title') || '',
      description: getMeta('og:description') || getMeta('twitter:description') || '',
      image: getMeta('og:image') || getMeta('twitter:image') || '',
      site_name: getMeta('og:site_name') || '',
      favicon: `${new URL(url).origin}/favicon.ico`
    };
  }

  // ============================================
  // UI FEEDBACK
  // ============================================

  showSuccess(tabId, message) {
    // Use badge instead of notification
    chrome.action.setBadgeText({ text: '✓', tabId });
    chrome.action.setBadgeBackgroundColor({ color: '#22c55e', tabId });

    setTimeout(() => {
      chrome.action.setBadgeText({ text: '', tabId });
    }, 1500);

    // Also show in-page toast if possible
    this.injectToast(tabId, message);
  }

  showError(tabId, message) {
    chrome.action.setBadgeText({ text: '!', tabId });
    chrome.action.setBadgeBackgroundColor({ color: '#ef4444', tabId });

    setTimeout(() => {
      chrome.action.setBadgeText({ text: '', tabId });
    }, 2000);
  }

  async injectToast(tabId, message) {
    try {
      await chrome.scripting.executeScript({
        target: { tabId },
        func: (msg) => {
          // Check if our toast system exists
          if (window.FCToast) {
            window.FCToast.show(msg);
            return;
          }

          // Simple fallback toast
          const toast = document.createElement('div');
          toast.style.cssText = `
            position: fixed;
            bottom: 20px;
            right: 20px;
            background: #7C3AED;
            color: white;
            padding: 12px 20px;
            border-radius: 8px;
            font-size: 14px;
            z-index: 2147483647;
            animation: fadeIn 0.3s ease;
          `;
          toast.textContent = `📋 ${msg}`;
          document.body.appendChild(toast);
          setTimeout(() => toast.remove(), 2500);
        },
        args: [message]
      });
    } catch (err) {
      // Tab might not be scriptable
    }
  }

  openQuickSearch() {
    chrome.windows.create({
      url: chrome.runtime.getURL('src/quick-search/search.html'),
      type: 'popup',
      width: 700,
      height: 600,
      focused: true
    });
  }
}

// Singleton
let instance = null;

export async function getContextMenuManager(captureHandler) {
  if (!instance) {
    instance = new ContextMenuManager(captureHandler);
    await instance.initialize();
  }
  return instance;
}

export default ContextMenuManager;
