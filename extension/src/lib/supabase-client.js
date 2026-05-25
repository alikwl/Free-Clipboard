/**
 * FreeClipboard Extension - Supabase Client
 * Local bundled version - NO CDN
 */

import { FC_CONFIG } from './constants-module.js';

const SESSION_STORAGE_KEY = 'sb-session';
// ============================================
// SUPABASE CLIENT (Simplified Local Implementation)
// ============================================

class SupabaseClient {
  constructor(url, key) {
    this.url = url;
    this.key = key;
    this.session = null;
    this.subscribers = new Map();
  }

  // Auth methods
  auth = {
    onAuthStateChange: (callback) => {
      this.authCallback = callback;
      return {
        data: {
          subscription: {
            unsubscribe: () => {}
          }
        }
      };
    },
    
    getSession: async () => {
      const [localResult, sessionResult] = await Promise.all([
        chrome.storage.local.get(SESSION_STORAGE_KEY),
        chrome.storage.session.get(SESSION_STORAGE_KEY)
      ]);

      const session = localResult[SESSION_STORAGE_KEY] || sessionResult[SESSION_STORAGE_KEY] || null;
      this.session = session;
      return { data: { session } };
    },
    
    getUser: async () => {
      if (!this.session) return { data: { user: null } };
      return { data: { user: this.session.user || null } };
    },
    
    signInWithOAuth: async ({ provider, options }) => {
      if (typeof chrome === 'undefined' || !chrome.identity) {
        throw new Error('Chrome Identity API not available - "identity" permission required');
      }

      const redirectUrl = chrome.identity.getRedirectURL();
      if (!redirectUrl) {
        throw new Error('Failed to get redirect URL from chrome.identity API');
      }

      const query = new URLSearchParams({
        provider,
        redirect_to: redirectUrl,
        response_type: 'code',
        scopes: options?.scopes || 'openid email profile'
      });

      const authUrl = `${this.url}/auth/v1/authorize?${query.toString()}`;
      console.log('[Supabase OAuth] Starting flow for provider:', provider);
      console.log('[Supabase OAuth] Redirect URL:', redirectUrl);
      console.log('[Supabase OAuth] Auth URL:', authUrl);

      return new Promise((resolve, reject) => {
        chrome.identity.launchWebAuthFlow(
          {
            url: authUrl,
            interactive: true
          },
          async (responseUrl) => {
            try {
              if (chrome.runtime.lastError) {
                const errorMsg = chrome.runtime.lastError.message || 'Unknown error';
                console.error('[Supabase OAuth] Runtime error:', errorMsg);

                if (/cancel/i.test(errorMsg)) {
                  reject(new Error('OAuth flow was cancelled by user'));
                } else if (/Authorization page could not be loaded/i.test(errorMsg)) {
                  reject(new Error(`Authorization page could not be loaded. Add ${redirectUrl} to Supabase Auth Redirect URLs and verify Google provider is enabled.`));
                } else if (/permission|not granted/i.test(errorMsg)) {
                  reject(new Error('Chrome Identity permission required - reload or reinstall the extension'));
                } else {
                  reject(new Error(`OAuth error: ${errorMsg}`));
                }
                return;
              }

              if (!responseUrl) {
                reject(new Error('No response URL from OAuth provider'));
                return;
              }

              console.log('[Supabase OAuth] Response URL:', responseUrl);

              const { session, user } = await this.completeAuthFromUrl(responseUrl, redirectUrl);
              console.log('[Supabase OAuth] Success - session created');
              resolve({ data: { session, user }, error: null });
            } catch (parseErr) {
              console.error('[Supabase OAuth] Failed to parse response:', parseErr);
              reject(new Error(`Failed to complete OAuth response: ${parseErr.message}`));
            }
          }
        );
      });
    },
    
    signOut: async () => {
      await Promise.all([
        chrome.storage.local.remove(SESSION_STORAGE_KEY),
        chrome.storage.session.remove(SESSION_STORAGE_KEY)
      ]);
      this.session = null;
      this.authCallback?.('SIGNED_OUT', null);
    },
    
    setSession: (session) => {
      this.session = session;
    }
  };

  // Database methods
  from(table) {
    return new QueryBuilder(this, table);
  }

  // Realtime
  channel(name) {
    return new RealtimeChannel(this, name);
  }

  // Functions
  functions = {
    invoke: async (name, { body }) => {
      const response = await fetch(`${this.url}/functions/v1/${name}`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${this.session?.access_token || this.key}`
        },
        body: JSON.stringify(body)
      });
      
      if (!response.ok) throw new Error(`Function error: ${response.status}`);
      return response.json();
    }
  };

  // HTTP request helper
  async request(path, options = {}) {
    await this.ensureValidSession();

    const url = `${this.url}${path}`;
    const headers = {
      'apikey': this.key,
      'Content-Type': 'application/json',
      ...options.headers
    };

    if (this.session?.access_token) {
      headers['Authorization'] = `Bearer ${this.session.access_token}`;
    }

    const response = await fetch(url, {
      ...options,
      headers
    });

    if (!response.ok) {
      const error = await response.json().catch(() => ({}));
      throw new Error(error.message || `HTTP ${response.status}`);
    }

    if (response.status === 204) {
      return null;
    }

    const text = await response.text();
    return text ? JSON.parse(text) : null;
  }

  async persistSession(session) {
    await Promise.all([
      chrome.storage.local.set({ [SESSION_STORAGE_KEY]: session }),
      chrome.storage.session.set({ [SESSION_STORAGE_KEY]: session })
    ]);
  }

  async ensureValidSession() {
    if (!this.session?.refresh_token) {
      return;
    }

    const rawExpiresAt = Number(this.session.expires_at || 0);
    const expiresAtMs = rawExpiresAt > 1e12 ? rawExpiresAt : rawExpiresAt * 1000;
    const bufferMs = 60 * 1000;
    if (expiresAtMs && expiresAtMs > Date.now() + bufferMs) {
      return;
    }

    await this.refreshSession();
  }

  async refreshSession() {
    if (!this.session?.refresh_token) {
      return null;
    }

    const response = await fetch(`${this.url}/auth/v1/token?grant_type=refresh_token`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'apikey': this.key
      },
      body: JSON.stringify({
        refresh_token: this.session.refresh_token
      })
    });

    if (!response.ok) {
      await this.signOut();
      const error = await response.json().catch(() => ({}));
      throw new Error(error.error_description || error.message || `Failed to refresh session (${response.status})`);
    }

    const refreshed = await response.json();
    const user = refreshed.user || this.session.user || await this.fetchUser(refreshed.access_token);
    const session = {
      ...this.session,
      ...refreshed,
      expires_at: refreshed.expires_at || (Math.floor(Date.now() / 1000) + Number(refreshed.expires_in || 3600)),
      user
    };

    await this.persistSession(session);
    this.session = session;
    this.authCallback?.('TOKEN_REFRESHED', session);
    return session;
  }

  async fetchUser(accessToken) {
    const response = await fetch(`${this.url}/auth/v1/user`, {
      headers: {
        'apikey': this.key,
        'Authorization': `Bearer ${accessToken}`
      }
    });

    if (!response.ok) {
      const error = await response.json().catch(() => ({}));
      throw new Error(error.error_description || error.message || `Failed to fetch user (${response.status})`);
    }

    return response.json();
  }

  async exchangeCodeForSession(code, redirectTo) {
    const response = await fetch(`${this.url}/auth/v1/token?grant_type=authorization_code`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'apikey': this.key
      },
      body: JSON.stringify({
        code,
        redirect_to: redirectTo
      })
    });

    if (!response.ok) {
      const error = await response.json().catch(() => ({}));
      throw new Error(error.error_description || error.message || `Failed to exchange authorization code (${response.status})`);
    }

    return response.json();
  }

  async completeAuthFromUrl(responseUrl, redirectTo = null) {
    const oauthUrl = new URL(responseUrl);
    const queryParams = new URLSearchParams(oauthUrl.search);
    const hashParams = new URLSearchParams(oauthUrl.hash.startsWith('#') ? oauthUrl.hash.slice(1) : oauthUrl.hash);
    const oauthError = queryParams.get('error') || hashParams.get('error');
    const oauthErrorDescription = queryParams.get('error_description') || hashParams.get('error_description');

    if (oauthError) {
      throw new Error(`OAuth provider error: ${oauthErrorDescription || oauthError}`);
    }

    const code = queryParams.get('code');
    let accessToken = hashParams.get('access_token') || queryParams.get('access_token');
    let refreshToken = hashParams.get('refresh_token') || queryParams.get('refresh_token');
    let expiresIn = Number(hashParams.get('expires_in') || queryParams.get('expires_in') || '3600');
    let sessionPayload = null;

    if (code) {
      const redirectUrl = redirectTo || (chrome.identity?.getRedirectURL ? chrome.identity.getRedirectURL() : undefined);
      sessionPayload = await this.exchangeCodeForSession(code, redirectUrl);
      accessToken = sessionPayload.access_token;
      refreshToken = sessionPayload.refresh_token;
      expiresIn = Number(sessionPayload.expires_in || '3600');
    }

    if (!accessToken) {
      const diagnostic = {
        query: oauthUrl.search,
        hash: oauthUrl.hash,
        pathname: oauthUrl.pathname
      };
      throw new Error(`No OAuth session data received from provider. Diagnostics: ${JSON.stringify(diagnostic)}`);
    }

    return this.createSessionFromTokens({
      accessToken,
      refreshToken,
      expiresIn,
      tokenType: sessionPayload?.token_type || hashParams.get('token_type') || queryParams.get('token_type') || 'bearer',
      providerToken: sessionPayload?.provider_token || hashParams.get('provider_token') || queryParams.get('provider_token') || null,
      providerRefreshToken: sessionPayload?.provider_refresh_token || hashParams.get('provider_refresh_token') || queryParams.get('provider_refresh_token') || null,
      expiresAt: sessionPayload?.expires_at
    });
  }

  async createSessionFromTokens({
    accessToken,
    refreshToken = null,
    expiresIn = 3600,
    tokenType = 'bearer',
    providerToken = null,
    providerRefreshToken = null,
    expiresAt = null
  }) {
    const user = await this.fetchUser(accessToken);
    const normalizedExpiresIn = Number(expiresIn || 3600);
    const session = {
      access_token: accessToken,
      refresh_token: refreshToken,
      token_type: tokenType,
      expires_in: normalizedExpiresIn,
      expires_at: expiresAt || (Math.floor(Date.now() / 1000) + normalizedExpiresIn),
      provider_token: providerToken,
      provider_refresh_token: providerRefreshToken,
      user
    };

    await this.persistSession(session);
    this.session = session;
    this.authCallback?.('SIGNED_IN', session);
    return { session, user };
  }
}

// ============================================
// QUERY BUILDER
// ============================================

class QueryBuilder {
  constructor(client, table) {
    this.client = client;
    this.table = table;
    this.filters = [];
    this.selectColumns = '*';
    this.orderColumn = null;
    this.orderAscending = true;
    this.rangeStart = null;
    this.rangeEnd = null;
    this.limitValue = null;
  }

  select(columns) {
    this.selectColumns = columns || '*';
    return this;
  }

  eq(column, value) {
    this.filters.push({ column, operator: 'eq', value });
    return this;
  }

  neq(column, value) {
    this.filters.push({ column, operator: 'neq', value });
    return this;
  }

  gt(column, value) {
    this.filters.push({ column, operator: 'gt', value });
    return this;
  }

  lt(column, value) {
    this.filters.push({ column, operator: 'lt', value });
    return this;
  }

  gte(column, value) {
    this.filters.push({ column, operator: 'gte', value });
    return this;
  }

  lte(column, value) {
    this.filters.push({ column, operator: 'lte', value });
    return this;
  }

  ilike(column, pattern) {
    this.filters.push({ column, operator: 'ilike', value: pattern });
    return this;
  }

  contains(column, value) {
    this.filters.push({ column, operator: 'cs', value });
    return this;
  }

  in(column, values) {
    this.filters.push({ column, operator: 'in', value: values });
    return this;
  }

  is(column, value) {
    this.filters.push({ column, operator: 'is', value });
    return this;
  }

  order(column, { ascending = true } = {}) {
    this.orderColumn = column;
    this.orderAscending = ascending;
    return this;
  }

  limit(count) {
    this.limitValue = count;
    return this;
  }

  range(start, end) {
    this.rangeStart = start;
    this.rangeEnd = end;
    return this;
  }

  // Execute query
  async execute(method = 'GET', body = null) {
    let url = `/rest/v1/${this.table}?select=${encodeURIComponent(this.selectColumns)}`;

    // Add filters
    for (const filter of this.filters) {
      url += `&${filter.column}=${filter.operator}.${encodeURIComponent(filter.value)}`;
    }

    // Add ordering
    if (this.orderColumn) {
      url += `&order=${this.orderColumn}.${this.orderAscending ? 'asc' : 'desc'}`;
    }

    // Add limit
    if (this.limitValue) {
      url += `&limit=${this.limitValue}`;
    }

    // Add range
    const headers = {};
    if (this.rangeStart !== null && this.rangeEnd !== null) {
      headers['Range'] = `${this.rangeStart}-${this.rangeEnd}`;
    }

    const options = {
      method,
      headers
    };

    if (body) {
      options.body = JSON.stringify(body);
    }

    return this.client.request(url, options);
  }

  // CRUD operations
  async insert(data, { onConflict } = {}) {
    const url = `/rest/v1/${this.table}`;
    const headers = {
      'Prefer': onConflict ? `resolution=merge-duplicates` : 'return=representation'
    };
    
    return this.client.request(url, {
      method: 'POST',
      headers,
      body: JSON.stringify(data)
    });
  }

  async upsert(data, { onConflict } = {}) {
    const url = `/rest/v1/${this.table}`;
    const headers = {
      'Prefer': 'return=representation,resolution=merge-duplicates'
    };
    
    return this.client.request(url, {
      method: 'POST',
      headers,
      body: JSON.stringify(data)
    });
  }

  async update(data) {
    let url = `/rest/v1/${this.table}`;
    const filterQuery = this.filters
      .map(filter => `${filter.column}=${filter.operator}.${encodeURIComponent(filter.value)}`)
      .join('&');

    if (filterQuery) {
      url += `?${filterQuery}`;
    }

    return this.client.request(url, {
      method: 'PATCH',
      body: JSON.stringify(data)
    });
  }

  async delete() {
    let url = `/rest/v1/${this.table}`;
    const filterQuery = this.filters
      .map(filter => `${filter.column}=${filter.operator}.${encodeURIComponent(filter.value)}`)
      .join('&');

    if (filterQuery) {
      url += `?${filterQuery}`;
    }

    return this.client.request(url, {
      method: 'DELETE'
    });
  }

  // Terminal methods
  async single() {
    const result = await this.execute();
    return { data: result[0] || null, error: null };
  }

  // Thenable for await
  then(onFulfilled, onRejected) {
    return this.execute().then(
      data => onFulfilled({ data, error: null }),
      err => onRejected ? onRejected(err) : Promise.reject(err)
    );
  }
}

// ============================================
// REALTIME CHANNEL (Simplified)
// ============================================

class RealtimeChannel {
  constructor(client, name) {
    this.client = client;
    this.name = name;
    this.listeners = [];
    this.ws = null;
    this.pollInterval = null;
  }

  on(event, filter, callback) {
    if (typeof filter === 'function') {
      callback = filter;
      filter = {};
    }
    
    this.listeners.push({ event, filter, callback });
    return this;
  }

  subscribe(callback) {
    // Simplified: poll instead of WebSocket for MV3 compatibility
    this.startPolling();
    
    if (callback) {
      callback('SUBSCRIBED');
    }
    
    return this;
  }

  unsubscribe() {
    if (this.pollInterval) {
      clearInterval(this.pollInterval);
    }
    return this;
  }

  startPolling() {
    // Poll every 5 seconds for changes
    this.pollInterval = setInterval(async () => {
      // This is a simplified version
      // In production, you'd use a proper realtime solution
    }, 5000);
  }
}

// ============================================
// FACTORY FUNCTION
// ============================================

export function createClient(url, key) {
  return new SupabaseClient(url, key);
}

// ============================================
// FREECCLIPBOARD SUPABASE WRAPPER
// ============================================

class FreeClipboardSupabase {
  constructor() {
    this.client = null;
    this.channel = null;
    this.session = null;
    this.initialized = false;
    this.subscribers = new Map(); // Event subscribers
  }

  async initialize() {
    if (this.initialized) return this.client;

    this.client = createClient(FC_CONFIG.SUPABASE_URL, FC_CONFIG.SUPABASE_ANON_KEY);

    // Restore session
    const { data: { session } } = await this.client.auth.getSession();
    if (session) {
      this.session = session;
      this.client.auth.setSession(session);
      this.startRealtimeSubscription();
    }

    // Listen for auth changes
    this.client.auth.onAuthStateChange((event, session) => {
      this.session = session;
      if (event === 'SIGNED_IN') {
        this.startRealtimeSubscription();
        this.notifySubscribers('auth', { event, session });
      } else if (event === 'SIGNED_OUT') {
        this.stopRealtimeSubscription();
        this.notifySubscribers('auth', { event, session: null });
      }
    });

    this.initialized = true;
    return this.client;
  }

  // ============================================
  // EVENT SYSTEM (This was missing!)
  // ============================================

  /**
   * Subscribe to events
   * @param {string} event - Event name: 'clip_change', 'settings_change', 'connection', 'auth'
   * @param {function} callback - Event handler
   * @returns {function} Unsubscribe function
   */
  on(event, callback) {
    if (!this.subscribers.has(event)) {
      this.subscribers.set(event, new Set());
    }
    this.subscribers.get(event).add(callback);

    // Return unsubscribe function
    return () => {
      this.subscribers.get(event)?.delete(callback);
    };
  }

  /**
   * Notify all subscribers of an event
   */
  notifySubscribers(event, data) {
    const callbacks = this.subscribers.get(event);
    if (!callbacks) return;

    callbacks.forEach(callback => {
      try {
        callback(data);
      } catch (err) {
        console.error(`[FreeClipboard Supabase] Subscriber error for ${event}:`, err);
      }
    });
  }

  // ============================================
  // AUTH METHODS
  // ============================================

  async signInWithGoogle() {
    const { data, error } = await this.client.auth.signInWithOAuth({
      provider: 'google'
    });

    if (error) throw error;

    if (data?.session) {
      this.session = data.session;
      this.startRealtimeSubscription();
    }

    return data;
  }

  async completeAuthFromUrl(url) {
    const authData = await this.client.completeAuthFromUrl(url);
    this.session = authData.session;
    this.startRealtimeSubscription();
    return authData;
  }

  async completeAuthFromToken({ accessToken, refreshToken = null, expiresIn = 3600 }) {
    const authData = await this.client.createSessionFromTokens({
      accessToken,
      refreshToken,
      expiresIn
    });
    this.session = authData.session;
    this.startRealtimeSubscription();
    return authData;
  }

  async signOut() {
    await this.client.auth.signOut();
    this.stopRealtimeSubscription();
    this.session = null;
  }

  // ============================================
  // REALTIME SUBSCRIPTION
  // ============================================

  startRealtimeSubscription() {
    if (!this.session) {
      console.log('[FreeClipboard Supabase] No session, skipping realtime');
      return;
    }

    this.stopRealtimeSubscription();

    const userId = this.session.user?.id;
    if (!userId) return;

    console.log('[FreeClipboard Supabase] Starting realtime subscription for user:', userId);

    // Create channel
    this.channel = this.client
      .channel(`clips:${userId}`)
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'clips',
          filter: `user_id=eq.${userId}`
        },
        (payload) => {
          console.log('[FreeClipboard Supabase] Realtime update:', payload);
          this.notifySubscribers('clip_change', payload);
        }
      )
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'user_settings',
          filter: `user_id=eq.${userId}`
        },
        (payload) => {
          this.notifySubscribers('settings_change', payload);
        }
      )
      .subscribe((status) => {
        console.log('[FreeClipboard Supabase] Realtime status:', status);
        this.notifySubscribers('connection', { status });
      });
  }

  stopRealtimeSubscription() {
    if (this.channel) {
      this.channel.unsubscribe();
      this.channel = null;
    }
  }

  // ============================================
  // DATABASE HELPERS
  // ============================================

  async saveClip(clip) {
    if (!this.session?.user?.id) {
      throw new Error('Not authenticated - cannot sync clip without a Supabase user');
    }

    const payload = this.toDatabaseClip(clip);
    const metadataPayload = this.toClipMetadataPayload(clip);
    console.log('[FreeClipboard Supabase] Saving clip payload:', {
      id: payload.id,
      user_id: payload.user_id,
      title: payload.title,
      pinned: payload.pinned,
      tag_count: payload.tags?.length || 0,
      session_user_id: this.session?.user?.id || null
    });

    try {
      const result = await this.client
        .from('clips')
        .upsert(payload, { onConflict: 'id' });

      await this.saveClipMetadata(metadataPayload);
      return result;
    } catch (error) {
      console.error('[FreeClipboard Supabase] saveClip failed:', {
        message: error?.message || String(error),
        payload,
        session_user_id: this.session?.user?.id || null
      });
      throw error;
    }
  }

  async getClips(options = {}) {
    const {
      limit = 20,
      offset = 0,
      search = '',
      tags = [],
      type = null,
      favorite = null,
      sortBy = 'created_at',
      sortOrder = 'desc'
    } = options;

    let query = this.client
      .from('clips')
      .select('*')
      .eq('user_id', this.session?.user?.id);

    if (search) {
      query = query.ilike('content', `%${search}%`);
    }

    if (tags.length > 0) {
      query = query.contains('tags', tags);
    }

    if (favorite !== null) {
      query = query.eq('pinned', favorite);
    }

    query = query
      .order(sortBy, { ascending: sortOrder === 'asc' })
      .range(offset, offset + limit - 1);

    const { data, error } = await query;
    if (error) throw error;

    const metadataMap = await this.getMetadataMap((data || []).map((record) => record.id));

    const clips = (data || [])
      .map(record => this.fromDatabaseClip(record, metadataMap.get(record.id)))
      .filter(clip => !type || clip.content_type === type);

    const visibleClips = clips.filter((clip) => !clip.is_deleted);

    return {
      clips: visibleClips,
      total: visibleClips.length
    };
  }

  async deleteClip(id) {
    return this.saveClipMetadata({
      clip_id: id,
      clip_type: 'other',
      entities: {
        is_deleted: true,
        deleted_at: new Date().toISOString()
      }
    });
  }

  async toggleFavorite(id, isFavorite) {
    return this.client
      .from('clips')
      .eq('id', id)
      .eq('user_id', this.session?.user?.id)
      .update({ pinned: isFavorite });
  }

  // ============================================
  // AI HELPERS
  // ============================================

  async generateTags(content) {
    return this.client.functions.invoke('ai-tags', {
      body: { content: content.substring(0, 2000) }
    });
  }

  async summarize(content, maxLength = 150) {
    return this.client.functions.invoke('ai-summarize', {
      body: { content: content.substring(0, 10000), maxLength }
    });
  }

  // ============================================
  // GETTERS
  // ============================================

  get session() {
    return this._session;
  }

  set session(value) {
    this._session = value;
  }

  async getMetadataMap(clipIds = []) {
    if (!this.session?.user?.id || clipIds.length === 0) {
      return new Map();
    }

    const { data, error } = await this.client
      .from('clip_metadata')
      .select('id, clip_id, entities, clip_type')
      .eq('user_id', this.session.user.id);

    if (error) throw error;

    return new Map(
      (data || [])
        .filter((row) => clipIds.includes(row.clip_id))
        .map((row) => [row.clip_id, row])
    );
  }

  async saveClipMetadata({ clip_id, clip_type, entities }) {
    if (!this.session?.user?.id) {
      throw new Error('Not authenticated - cannot sync clip metadata without a Supabase user');
    }

    const { data: existingRows, error: existingError } = await this.client
      .from('clip_metadata')
      .select('id')
      .eq('user_id', this.session.user.id)
      .eq('clip_id', clip_id)
      .limit(1);

    if (existingError) throw existingError;

    const normalizedEntities = this.normalizeEntities(entities);
    const payload = {
      user_id: this.session.user.id,
      clip_id,
      clip_type: clip_type || 'other',
      entities: normalizedEntities
    };

    const existingId = existingRows?.[0]?.id;
    if (existingId) {
      return this.client
        .from('clip_metadata')
        .update(payload)
        .eq('id', existingId);
    }

    return this.client
      .from('clip_metadata')
      .insert(payload);
  }

  toDatabaseClip(clip) {
    const content = clip.content || '';

    return {
      id: clip.id,
      user_id: this.session?.user?.id,
      content,
      title: clip.title || this.buildTitle(content),
      tags: Array.isArray(clip.tags) ? clip.tags : [],
      pinned: Boolean(clip.is_favorite || clip.pinned),
      created_at: clip.created_at || new Date().toISOString()
    };
  }

  toClipMetadataPayload(clip) {
    const content = clip.content || '';
    return {
      clip_id: clip.id,
      clip_type: clip.content_type || this.inferContentType(content),
      entities: {
        is_deleted: Boolean(clip.is_deleted),
        deleted_at: clip.deleted_at || null,
        source_url: clip.source_url || clip.metadata?.source_url || null,
        source_title: clip.source_title || clip.metadata?.source_title || null,
        source_app: clip.source_app || clip.metadata?.source_app || null,
        favicon: clip.metadata?.favicon || this.inferFaviconUrl(clip.source_url || clip.metadata?.source_url || ''),
        image_url: clip.metadata?.image_url || null,
        capture_method: clip.metadata?.capture_method || null,
        code_language: clip.metadata?.code_language || this.detectCodeLanguage(content),
        version_history: Array.isArray(clip.metadata?.version_history) ? clip.metadata.version_history : [],
      }
    };
  }

  fromDatabaseClip(record, metadataRecord = null) {
    const content = record.content || '';
    const entities = this.normalizeEntities(metadataRecord?.entities || {});

    return {
      id: record.id,
      user_id: record.user_id,
      content,
      title: record.title || null,
      tags: Array.isArray(record.tags) ? record.tags : [],
      content_type: this.inferContentType(content),
      is_favorite: Boolean(record.pinned),
      pinned: Boolean(record.pinned),
      is_deleted: Boolean(entities.is_deleted),
      deleted_at: entities.deleted_at || null,
      created_at: record.created_at,
      modified_at: record.created_at,
      sync_status: 'synced',
      source_url: entities.source_url || '',
      source_title: entities.source_title || record.title || null,
      source_app: entities.source_app || 'FreeClipboard Web',
      metadata: entities,
      vector_clock: {},
      parent_versions: [],
      merge_conflict: false
    };
  }

  buildTitle(content) {
    const normalized = String(content).replace(/\s+/g, ' ').trim();
    return normalized ? normalized.slice(0, 80) : 'Untitled clip';
  }

  inferContentType(content) {
    if (/^https?:\/\//i.test(content)) return 'link';
    if (/(function|const|let|var|class|import|export)\s/m.test(content)) return 'code';
    return 'text';
  }

  detectCodeLanguage(content) {
    const normalized = String(content || '');
    if (!normalized) return null;
    if (/^\s*<[^>]+>/.test(normalized) || /<\/[a-z]+>/i.test(normalized)) return 'html';
    if (/\binterface\s+\w+|\btype\s+\w+\s*=|\bimport\s+type\b/.test(normalized)) return 'typescript';
    if (/\bconst\b|\blet\b|\bfunction\b|\bexport\b/.test(normalized)) return 'javascript';
    if (/\bdef\b|\bimport\b|\bclass\b/.test(normalized)) return 'python';
    if (/\bSELECT\b|\bINSERT\b|\bUPDATE\b|\bDELETE\b/i.test(normalized)) return 'sql';
    if (/\{[\s\S]*:[\s\S]*\}/.test(normalized)) return 'json';
    return null;
  }

  inferFaviconUrl(url) {
    try {
      return `${new URL(url).origin}/favicon.ico`;
    } catch {
      return null;
    }
  }

  normalizeEntities(entities) {
    if (!entities || typeof entities !== 'object') return {};
    return { ...entities };
  }
}

// Singleton
let supabaseInstance = null;

export async function getSupabase() {
  if (!supabaseInstance) {
    supabaseInstance = new FreeClipboardSupabase();
    await supabaseInstance.initialize();
  }
  return supabaseInstance;
}

export default FreeClipboardSupabase;
