/**
 * Velos Storage - Centralized localStorage management
 * Use this instead of direct localStorage access throughout the app
 */

const KEYS = {
  AUTH_TOKEN: 'authToken',
  USER: 'user',
  THEME: 'theme',
  LAST_ACTIVE: 'lastActiveTime',
};

// ============ USER & AUTH ============

/**
 * Get the current user object from localStorage
 * @returns {Object|null} User object or null if not logged in
 */
export const getUser = () => {
  try {
    const userStr = localStorage.getItem(KEYS.USER);
    return userStr ? JSON.parse(userStr) : null;
  } catch (e) {
    console.error('[VelosStorage] Error parsing user:', e);
    return null;
  }
};

/**
 * Get the current user's ID
 * @returns {string|null} User ID or null if not logged in
 */
export const getUserId = () => {
  const user = getUser();
  return user?.userId || null;
};

/**
 * Get the auth token
 * @returns {string|null} Auth token or null
 */
export const getAuthToken = () => {
  return localStorage.getItem(KEYS.AUTH_TOKEN);
};

/**
 * Check if user is logged in (has valid token and user)
 * @returns {boolean}
 */
export const isLoggedIn = () => {
  const token = getAuthToken();
  const user = getUser();
  return !!(token && user?.userId);
};

/**
 * Set auth data after login
 * @param {string} token - Auth token
 * @param {Object} user - User object
 */
export const setAuth = (token, user) => {
  localStorage.setItem(KEYS.AUTH_TOKEN, token);
  localStorage.setItem(KEYS.USER, JSON.stringify(user));
  localStorage.setItem(KEYS.LAST_ACTIVE, Date.now().toString());
};

/**
 * Update user object (e.g., after profile update)
 * @param {Object} user - Updated user object
 */
export const updateUser = (user) => {
  localStorage.setItem(KEYS.USER, JSON.stringify(user));
};

/**
 * Logout - Clear all auth-related data
 */
export const logout = () => {
  localStorage.removeItem(KEYS.AUTH_TOKEN);
  localStorage.removeItem(KEYS.USER);
  localStorage.removeItem(KEYS.LAST_ACTIVE);
  // Also remove legacy keys that might exist
  localStorage.removeItem('token');
  localStorage.removeItem('userId');
};

// ============ PREFERENCES ============

/**
 * Get current theme
 * @returns {string} 'light' or 'dark'
 */
export const getTheme = () => {
  return localStorage.getItem(KEYS.THEME) || 'dark';
};

/**
 * Set theme
 * @param {string} theme - 'light' or 'dark'
 */
export const setTheme = (theme) => {
  localStorage.setItem(KEYS.THEME, theme);
};

// ============ SESSION ============

/**
 * Update last active time
 */
export const updateLastActive = () => {
  localStorage.setItem(KEYS.LAST_ACTIVE, Date.now().toString());
};

/**
 * Get last active time
 * @returns {number|null} Timestamp or null
 */
export const getLastActive = () => {
  const time = localStorage.getItem(KEYS.LAST_ACTIVE);
  return time ? parseInt(time, 10) : null;
};

// Default export for convenience
export default {
  getUser,
  getUserId,
  getAuthToken,
  isLoggedIn,
  setAuth,
  updateUser,
  logout,
  getTheme,
  setTheme,
  updateLastActive,
  getLastActive,
};

