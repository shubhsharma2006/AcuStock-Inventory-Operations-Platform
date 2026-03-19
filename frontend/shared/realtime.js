/**
 * AcuStock Real-Time Updates Client
 * Connects to the WebSocket server and handles real-time data synchronization
 * Includes built-in notification push handler (badge + toast)
 */
(function() {
  'use strict';

  const SOCKET_URL = (window.AcuStockConfig && window.AcuStockConfig.SOCKET_URL) || 'http://127.0.0.1:5001';
  let socket = null;
  let isConnected = false;
  let reconnectAttempts = 0;
  const MAX_RECONNECT_ATTEMPTS = 5;
  const RECONNECT_DELAY = 3000;

  // Event handlers registry
  const handlers = {
    'stock-update': [],
    'product-update': [],
    'user-update': [],
    'company-update': [],
    'low-stock-alert': [],
    'notification': [],
    'permission-update': []
  };

  // ── Built-in notification push handler ─────────────────────
  // Automatically updates the notification badge and shows a toast
  // whenever a 'notification' Socket.IO event arrives.
  function handleNotificationPush(data) {
    // 1. Bump the badge count
    const badge = document.getElementById('notification-count')
                || document.getElementById('notification-badge');
    if (badge) {
      const current = parseInt(badge.textContent) || 0;
      badge.textContent = current + 1;
      badge.style.display = 'inline-flex';
    }

    // 2. Show a toast (if the page has a showToast function)
    if (typeof showToast === 'function') {
      const icon = data.icon || '🔔';
      showToast(`${icon} ${data.title || 'New notification'}`, 'info');
    }

    // 3. Play a subtle notification sound (if audio element exists)
    const audio = document.getElementById('notification-sound');
    if (audio && typeof audio.play === 'function') {
      audio.play().catch(() => {}); // Ignore autoplay restrictions
    }
  }

  // Initialize Socket.IO connection
  function connect(userRole, userId) {
    if (typeof io === 'undefined') {
      console.warn('Socket.IO not loaded. Real-time updates disabled.');
      return;
    }

    socket = io(SOCKET_URL, {
      withCredentials: true,
      transports: ['websocket', 'polling']
    });

    socket.on('connect', () => {
      isConnected = true;
      reconnectAttempts = 0;

      // Join role-based room
      if (userRole) {
        socket.emit('join-role', userRole);
      }

      // Join user-specific room
      if (userId) {
        socket.emit('join-user', userId);
      }

      // Show connection status (if toast function exists)
      if (typeof showToast === 'function') {
        showToast('Real-time sync enabled', 'success');
      }
    });

    socket.on('disconnect', () => {
      isConnected = false;
    });

    socket.on('connect_error', (error) => {
      console.warn('Socket connection error:', error.message);
      reconnectAttempts++;
      
      if (reconnectAttempts >= MAX_RECONNECT_ATTEMPTS) {
        console.error('Max reconnection attempts reached. Real-time updates disabled.');
      }
    });

    // Register event listeners for all event types
    Object.keys(handlers).forEach(eventType => {
      socket.on(eventType, (data) => {
        // Built-in notification handler runs first
        if (eventType === 'notification') {
          handleNotificationPush(data);
        }

        // Then all registered custom handlers
        handlers[eventType].forEach(handler => {
          try {
            handler(data);
          } catch (e) {
            console.error(`Error in ${eventType} handler:`, e);
          }
        });
      });
    });
  }

  // Disconnect from server
  function disconnect() {
    if (socket) {
      socket.disconnect();
      socket = null;
      isConnected = false;
    }
  }

  // Register event handler
  function on(eventType, handler) {
    if (handlers[eventType]) {
      handlers[eventType].push(handler);
    } else {
      console.warn(`Unknown event type: ${eventType}`);
    }
  }

  // Remove event handler
  function off(eventType, handler) {
    if (handlers[eventType]) {
      const index = handlers[eventType].indexOf(handler);
      if (index > -1) {
        handlers[eventType].splice(index, 1);
      }
    }
  }

  // Check connection status
  function isSocketConnected() {
    return isConnected;
  }

  // Expose to global scope
  window.AcuStockRealtime = {
    connect,
    disconnect,
    on,
    off,
    isConnected: isSocketConnected
  };

})();
