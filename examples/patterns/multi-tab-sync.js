/**
 * Multi-Tab Sync Pattern Example
 * 
 * Demonstrates synchronizing state across multiple browser tabs
 * using BroadcastChannelTransport.
 * 
 * Use cases:
 * - Shopping cart sync
 * - Authentication state
 * - Theme preferences
 * - Real-time collaboration
 */

import { CrossBus, BroadcastChannelTransport } from 'crossbus';

// ============================================
// SETUP
// ============================================

// Create bus with unique peerId per tab
const tabId = `tab-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
const bus = new CrossBus({
    peerId: tabId,
    allowedOrigins: ['*'],
});

// Add BroadcastChannel transport for cross-tab communication
// Using '*' as peerId enables broadcast mode (receive from all)
bus.addTransport(new BroadcastChannelTransport('my-app-sync'), { peerId: '*' });

console.log(`[${tabId}] Tab initialized`);

// ============================================
// STATE MANAGEMENT
// ============================================

// Local state
let state = {
    cart: [],
    user: null,
    theme: 'light',
    lastSyncedAt: null,
};

// Update state locally and broadcast
function updateState(updates) {
    state = { ...state, ...updates, lastSyncedAt: Date.now() };

    // Persist to localStorage as backup
    localStorage.setItem('app-state', JSON.stringify(state));

    // Broadcast to other tabs
    bus.signal('state:sync', {
        fromTab: tabId,
        updates,
        timestamp: Date.now(),
    });

    console.log(`[${tabId}] State updated and broadcasted:`, updates);
}

// Listen for state updates from other tabs
bus.on('state:sync', (event) => {
    const { fromTab, updates, timestamp } = event.data;

    // Ignore our own updates
    if (fromTab === tabId) return;

    // Conflict resolution: use latest timestamp
    if (state.lastSyncedAt && timestamp < state.lastSyncedAt) {
        console.log(`[${tabId}] Ignoring stale update from ${fromTab}`);
        return;
    }

    // Apply updates
    state = { ...state, ...updates, lastSyncedAt: timestamp };
    localStorage.setItem('app-state', JSON.stringify(state));

    console.log(`[${tabId}] Received state from ${fromTab}:`, updates);

    // Trigger UI update
    renderState();
});

// ============================================
// SPECIFIC SYNC PATTERNS
// ============================================

// Cart sync
function addToCart(item) {
    const cart = [...state.cart, item];
    updateState({ cart });
}

function removeFromCart(itemId) {
    const cart = state.cart.filter((item) => item.id !== itemId);
    updateState({ cart });
}

// Auth sync
function login(user) {
    updateState({ user });
    bus.signal('auth:login', { user, tabId });
}

function logout() {
    updateState({ user: null });
    bus.signal('auth:logout', { tabId });
}

bus.on('auth:logout', (event) => {
    if (event.data.tabId !== tabId) {
        state.user = null;
        console.log(`[${tabId}] Logged out due to logout in another tab`);
        renderState();
    }
});

// Theme sync
function setTheme(theme) {
    updateState({ theme });
    document.documentElement.dataset.theme = theme;
}

bus.on('state:sync', (event) => {
    if (event.data.updates.theme) {
        document.documentElement.dataset.theme = event.data.updates.theme;
    }
});

// ============================================
// TAB MANAGEMENT
// ============================================

// Request state from other tabs on load
function requestStateFromOtherTabs() {
    bus.signal('state:request', { fromTab: tabId });
}

bus.on('state:request', (event) => {
    if (event.data.fromTab !== tabId) {
        // Respond with our current state
        bus.signal('state:response', {
            toTab: event.data.fromTab,
            state,
            fromTab: tabId,
        });
    }
});

bus.on('state:response', (event) => {
    if (event.data.toTab === tabId) {
        // Use received state if it's newer
        if (!state.lastSyncedAt || event.data.state.lastSyncedAt > state.lastSyncedAt) {
            state = event.data.state;
            localStorage.setItem('app-state', JSON.stringify(state));
            console.log(`[${tabId}] Initialized state from ${event.data.fromTab}`);
            renderState();
        }
    }
});

// ============================================
// INITIALIZATION
// ============================================

function init() {
    // Try to load from localStorage first
    const savedState = localStorage.getItem('app-state');
    if (savedState) {
        try {
            state = JSON.parse(savedState);
            console.log(`[${tabId}] Loaded state from localStorage`);
        } catch (e) {
            console.error('Failed to parse saved state');
        }
    }

    // Request latest state from other tabs
    requestStateFromOtherTabs();

    // Apply theme
    if (state.theme) {
        document.documentElement.dataset.theme = state.theme;
    }

    renderState();
}

function renderState() {
    // Update UI based on state
    console.log(`[${tabId}] Rendering state:`, state);
    // ... your UI update logic here
}

// ============================================
// CLEANUP
// ============================================

window.addEventListener('beforeunload', () => {
    bus.signal('tab:closing', { tabId });
    bus.destroy();
});

// Export for use
export {
    bus,
    state,
    updateState,
    addToCart,
    removeFromCart,
    login,
    logout,
    setTheme,
    init,
};

// Auto-initialize
init();
