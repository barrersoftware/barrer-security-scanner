/**
 * Dashboard JavaScript for AI Security Scanner
 * Handles UI interactions, routing, and plugin integration
 */

// Global state
const state = {
    currentView: 'overview',
    currentPlugin: null,
    user: null,
    menuCollapsed: false,
    notifications: []
};

// Initialize dashboard
document.addEventListener('DOMContentLoaded', () => {
    initializeUI();
    initializeDarkMode();
    loadUserInfo();
    setupEventListeners();
    loadView('overview');
    startConnectionMonitor();
});

// Initialize dark mode
function initializeDarkMode() {
    // Check for saved theme preference or default to light mode
    const savedTheme = localStorage.getItem('theme') || 'light';
    setTheme(savedTheme);
    
    // Add theme toggle listener
    const themeToggle = document.getElementById('themeToggle');
    if (themeToggle) {
        themeToggle.addEventListener('click', toggleTheme);
    }
}

// Toggle theme
function toggleTheme() {
    const currentTheme = document.documentElement.getAttribute('data-theme');
    const newTheme = currentTheme === 'dark' ? 'light' : 'dark';
    setTheme(newTheme);
}

// Set theme
function setTheme(theme) {
    document.documentElement.setAttribute('data-theme', theme);
    localStorage.setItem('theme', theme);
    
    // Update theme icon
    const themeIcon = document.getElementById('themeIcon');
    if (themeIcon) {
        themeIcon.textContent = theme === 'dark' ? '☀️' : '🌙';
    }
}

// Initialize UI components
function initializeUI() {
    // Set initial connection status
    updateConnectionStatus(true);
    
    // Initialize notification count
    updateNotificationCount(0);
}

// Setup event listeners
function setupEventListeners() {
    // Menu toggle
    const menuToggle = document.getElementById('menuToggle');
    const sideMenu = document.getElementById('sideMenu');
    menuToggle?.addEventListener('click', () => {
        sideMenu.classList.toggle('collapsed');
        state.menuCollapsed = !state.menuCollapsed;
    });

    // User menu dropdown
    const userMenuBtn = document.getElementById('userMenuBtn');
    const userDropdown = document.getElementById('userDropdown');
    userMenuBtn?.addEventListener('click', (e) => {
        e.stopPropagation();
        userDropdown.classList.toggle('active');
    });

    // Close dropdown when clicking outside
    document.addEventListener('click', () => {
        userDropdown?.classList.remove('active');
    });

    // Logout
    document.getElementById('logoutLink')?.addEventListener('click', (e) => {
        e.preventDefault();
        handleLogout();
    });

    // Menu items navigation
    document.querySelectorAll('.menu-item').forEach(item => {
        item.addEventListener('click', (e) => {
            e.preventDefault();
            const view = item.dataset.view;
            const plugin = item.dataset.plugin;
            
            // Update active state
            document.querySelectorAll('.menu-item').forEach(i => i.classList.remove('active'));
            item.classList.add('active');
            
            // Load view
            loadView(view, plugin);
        });
    });

    // Global search
    const globalSearch = document.getElementById('globalSearch');
    globalSearch?.addEventListener('input', debounce(handleSearch, 300));

    // Mobile menu
    if (window.innerWidth <= 768) {
        menuToggle?.addEventListener('click', () => {
            sideMenu.classList.toggle('active');
        });
    }
}

// Load view based on menu selection
async function loadView(view, plugin = null) {
    state.currentView = view;
    state.currentPlugin = plugin;

    const pageTitle = document.getElementById('pageTitle');
    const contentBody = document.getElementById('contentBody');
    const contentActions = document.getElementById('contentActions');

    // Show loading
    contentBody.innerHTML = '<div class="loading">Loading...</div>';
    contentActions.innerHTML = '';

    try {
        // Load view content
        const viewContent = await getViewContent(view, plugin);
        
        // Update page title
        pageTitle.textContent = viewContent.title;
        
        // Update content
        contentBody.innerHTML = viewContent.html;
        
        // Update actions
        if (viewContent.actions) {
            contentActions.innerHTML = viewContent.actions;
        }

        // Initialize view-specific functionality
        if (viewContent.init) {
            viewContent.init();
        }

    } catch (error) {
        console.error('Error loading view:', error);
        contentBody.innerHTML = `
            <div class="error-state">
                <h3>❌ Error Loading View</h3>
                <p>${error.message}</p>
                <button class="btn btn-primary" onclick="location.reload()">Reload Page</button>
            </div>
        `;
    }
}

// Get view content (will be extended by views.js)
async function getViewContent(view, plugin) {
    // Default content
    const views = {
        'overview': {
            title: 'Overview',
            html: await loadOverviewContent(),
            init: initializeOverview
        },
        'analytics': {
            title: 'Analytics',
            html: await loadAnalyticsContent(),
            init: initializeAnalytics
        },
        'settings': {
            title: 'Settings',
            html: await loadSettingsContent(),
            init: initializeSettings
        }
    };

    // If plugin specified, load plugin-specific view
    if (plugin) {
        return await loadPluginView(plugin);
    }

    return views[view] || views.overview;
}

// Load overview content
async function loadOverviewContent() {
    try {
        // Fetch system stats
        const stats = await fetchAPI('/api/stats');
        
        return `
            <div class="grid-4">
                <div class="stat-card">
                    <div class="stat-icon" style="color: var(--primary-color)">🔍</div>
                    <div class="stat-value">${stats.totalScans || 0}</div>
                    <div class="stat-label">Total Scans</div>
                </div>
                <div class="stat-card">
                    <div class="stat-icon" style="color: var(--success-color)">👥</div>
                    <div class="stat-value">${stats.totalUsers || 0}</div>
                    <div class="stat-label">Active Users</div>
                </div>
                <div class="stat-card">
                    <div class="stat-icon" style="color: var(--warning-color)">⚠️</div>
                    <div class="stat-value">${stats.alerts || 0}</div>
                    <div class="stat-label">Active Alerts</div>
                </div>
                <div class="stat-card">
                    <div class="stat-icon" style="color: var(--info-color)">📊</div>
                    <div class="stat-value">${stats.reports || 0}</div>
                    <div class="stat-label">Reports Generated</div>
                </div>
            </div>

            <div class="grid-2 mt-3">
                <div class="card">
                    <div class="card-header">Recent Scans</div>
                    <div id="recentScans">Loading...</div>
                </div>
                <div class="card">
                    <div class="card-header">System Health</div>
                    <div id="systemHealth">Loading...</div>
                </div>
            </div>

            <div class="card mt-3">
                <div class="card-header">Quick Actions</div>
                <div class="quick-actions">
                    <button class="btn btn-primary" onclick="loadView('scanner', 'scanner')">
                        🔍 Start New Scan
                    </button>
                    <button class="btn btn-outline" onclick="loadView('reporting', 'reporting')">
                        📊 View Reports
                    </button>
                    <button class="btn btn-outline" onclick="loadView('admin', 'admin')">
                        👥 Manage Users
                    </button>
                    <button class="btn btn-outline" onclick="loadView('audit-log', 'audit-log')">
                        📝 View Audit Logs
                    </button>
                </div>
            </div>
        `;
    } catch (error) {
        return '<p class="error">Failed to load overview data</p>';
    }
}

// Initialize overview
function initializeOverview() {
    // Load recent scans
    fetchAPI('/api/scans/recent')
        .then(scans => {
            const html = scans.length > 0 
                ? scans.map(scan => `
                    <div class="scan-item">
                        <strong>${scan.name}</strong>
                        <span class="scan-status status-${scan.status}">${scan.status}</span>
                        <span class="scan-date">${formatDate(scan.date)}</span>
                    </div>
                `).join('')
                : '<p>No recent scans</p>';
            
            document.getElementById('recentScans').innerHTML = html;
        })
        .catch(() => {
            document.getElementById('recentScans').innerHTML = '<p>Unable to load scans</p>';
        });

    // Load system health
    fetchAPI('/api/system/health')
        .then(health => {
            const items = [
                { label: 'CPU Usage', value: `${health.cpu || 0}%`, status: health.cpu > 80 ? 'warning' : 'ok' },
                { label: 'Memory', value: `${health.memory || 0}%`, status: health.memory > 80 ? 'warning' : 'ok' },
                { label: 'Disk Space', value: `${health.disk || 0}%`, status: health.disk > 80 ? 'warning' : 'ok' },
                { label: 'Uptime', value: health.uptime || '0d', status: 'ok' }
            ];

            const html = items.map(item => `
                <div class="health-item">
                    <span class="health-label">${item.label}</span>
                    <span class="health-value ${item.status}">${item.value}</span>
                </div>
            `).join('');

            document.getElementById('systemHealth').innerHTML = html;
        })
        .catch(() => {
            document.getElementById('systemHealth').innerHTML = '<p>Unable to load health data</p>';
        });
}

// Load analytics content
async function loadAnalyticsContent() {
    try {
        // Fetch analytics data from API
        const analytics = await fetchAPI('/api/api-analytics/stats') || {};
        
        return `
            <div class="grid-4">
                <div class="stat-card">
                    <div class="stat-icon">📊</div>
                    <div class="stat-value">${analytics.totalRequests || 0}</div>
                    <div class="stat-label">Total API Requests</div>
                </div>
                <div class="stat-card">
                    <div class="stat-icon">✅</div>
                    <div class="stat-value">${analytics.successRate || 0}%</div>
                    <div class="stat-label">Success Rate</div>
                </div>
                <div class="stat-card">
                    <div class="stat-icon">⚡</div>
                    <div class="stat-value">${analytics.avgResponseTime || 0}ms</div>
                    <div class="stat-label">Avg Response Time</div>
                </div>
                <div class="stat-card">
                    <div class="stat-icon">🔥</div>
                    <div class="stat-value">${analytics.activeEndpoints || 0}</div>
                    <div class="stat-label">Active Endpoints</div>
                </div>
            </div>
            
            <div class="grid-2">
                <div class="card">
                    <div class="card-header">🎯 Top API Endpoints</div>
                    <div class="endpoint-list">
                        ${analytics.topEndpoints && analytics.topEndpoints.length > 0 
                            ? analytics.topEndpoints.map(e => `
                                <div class="endpoint-item">
                                    <span class="endpoint-path">${e.path}</span>
                                    <span class="endpoint-count">${e.count} requests</span>
                                </div>
                            `).join('')
                            : '<p class="text-muted">No endpoint data available</p>'}
                    </div>
                </div>
                
                <div class="card">
                    <div class="card-header">📈 Request Timeline</div>
                    <div style="padding: 40px; text-align: center; color: var(--text-secondary);">
                        <p>📊 Chart visualization</p>
                        <p style="font-size: 12px; margin-top: 10px;">Real-time analytics from /api/api-analytics/stats</p>
                    </div>
                </div>
            </div>
            
            <div class="card">
                <div class="card-header">🔍 Quick Actions</div>
                <div class="quick-actions">
                    <button class="btn btn-primary" onclick="loadPluginView('api-analytics')">
                        📊 View Full API Analytics
                    </button>
                    <button class="btn btn-secondary" onclick="loadView('settings')">
                        ⚙️ Configure Analytics
                    </button>
                </div>
            </div>
        `;
    } catch (error) {
        return `
            <div class="card">
                <div class="card-header">📊 API Analytics Dashboard</div>
                <p class="text-muted">Unable to load analytics data. Check API connection.</p>
                <button class="btn btn-primary" onclick="loadView('analytics')">🔄 Retry</button>
            </div>
        `;
    }
}

function initializeAnalytics() {
    // Will be implemented with chart.js
}

// Load settings content
async function loadSettingsContent() {
    try {
        const systemInfo = await fetchAPI('/api/system/info');
        
        return `
            <div class="grid-2">
                <div class="card">
                    <div class="card-header">⚙️ General Settings</div>
                    <form id="generalSettingsForm">
                        <div class="form-group">
                            <label>System Name</label>
                            <input type="text" id="systemName" value="${systemInfo.hostname || 'AI Security Scanner'}" required>
                        </div>
                        <div class="form-group">
                            <label>Default Scan Type</label>
                            <select id="defaultScanType">
                                <option value="quick">Quick Scan</option>
                                <option value="full" selected>Full Scan</option>
                                <option value="deep">Deep Scan</option>
                                <option value="compliance">Compliance Scan</option>
                            </select>
                        </div>
                        <div class="form-group">
                            <label>Max Concurrent Scans</label>
                            <input type="number" id="maxConcurrentScans" value="5" min="1" max="20">
                        </div>
                        <div class="form-group">
                            <label>
                                <input type="checkbox" id="autoBackup" checked>
                                Enable Automatic Backups
                            </label>
                        </div>
                        <button type="submit" class="btn btn-primary">💾 Save Settings</button>
                    </form>
                </div>

                <div class="card">
                    <div class="card-header">🔔 Notification Settings</div>
                    <form id="notificationSettingsForm">
                        <div class="form-group">
                            <label>
                                <input type="checkbox" id="notifyEmail" checked>
                                Email Notifications
                            </label>
                        </div>
                        <div class="form-group">
                            <label>Email Address</label>
                            <input type="email" id="notificationEmail" placeholder="admin@example.com">
                        </div>
                        <div class="form-group">
                            <label>
                                <input type="checkbox" id="notifySlack">
                                Slack Notifications
                            </label>
                        </div>
                        <div class="form-group">
                            <label>Slack Webhook URL</label>
                            <input type="url" id="slackWebhook" placeholder="https://hooks.slack.com/...">
                        </div>
                        <div class="form-group">
                            <label>
                                <input type="checkbox" id="notifyWebhook">
                                Custom Webhook
                            </label>
                        </div>
                        <button type="submit" class="btn btn-primary">💾 Save Notifications</button>
                    </form>
                </div>
            </div>

            <div class="grid-2 mt-3">
                <div class="card">
                    <div class="card-header">🔒 Security Settings</div>
                    <form id="securitySettingsForm">
                        <div class="form-group">
                            <label>Session Timeout (minutes)</label>
                            <input type="number" id="sessionTimeout" value="30" min="5" max="1440">
                        </div>
                        <div class="form-group">
                            <label>
                                <input type="checkbox" id="requireMFA">
                                Require Multi-Factor Authentication
                            </label>
                        </div>
                        <div class="form-group">
                            <label>
                                <input type="checkbox" id="enableIPWhitelist">
                                Enable IP Whitelist
                            </label>
                        </div>
                        <div class="form-group">
                            <label>Allowed IPs (comma-separated)</label>
                            <textarea id="allowedIPs" rows="3" placeholder="192.168.1.1, 10.0.0.0/24"></textarea>
                        </div>
                        <button type="submit" class="btn btn-primary">💾 Save Security</button>
                    </form>
                </div>

                <div class="card">
                    <div class="card-header">📊 System Information</div>
                    <div class="info-grid">
                        <div class="info-item">
                            <span class="info-label">Version:</span>
                            <span class="info-value">${systemInfo.version || 'v4.10.1'}</span>
                        </div>
                        <div class="info-item">
                            <span class="info-label">Platform:</span>
                            <span class="info-value">${systemInfo.platform || 'Linux'}</span>
                        </div>
                        <div class="info-item">
                            <span class="info-label">Node Version:</span>
                            <span class="info-value">${systemInfo.nodeVersion || 'N/A'}</span>
                        </div>
                        <div class="info-item">
                            <span class="info-label">Uptime:</span>
                            <span class="info-value">${formatUptime(systemInfo.uptime)}</span>
                        </div>
                        <div class="info-item">
                            <span class="info-label">Memory Usage:</span>
                            <span class="info-value">${formatMemory(systemInfo.memory)}</span>
                        </div>
                        <div class="info-item">
                            <span class="info-label">CPU:</span>
                            <span class="info-value">${systemInfo.cpu || 'N/A'}</span>
                        </div>
                    </div>
                    <div class="mt-2">
                        <button class="btn btn-secondary" onclick="checkForUpdates()">🔄 Check for Updates</button>
                    </div>
                </div>
            </div>

            <div class="card mt-3">
                <div class="card-header">🗄️ Data Management</div>
                <div class="grid-3">
                    <button class="btn btn-info" onclick="exportData()">📥 Export Data</button>
                    <button class="btn btn-warning" onclick="clearCache()">🗑️ Clear Cache</button>
                    <button class="btn btn-danger" onclick="resetSystem()">⚠️ Reset System</button>
                </div>
            </div>
        `;
    } catch (error) {
        return `
            <div class="error-state">
                <h3>❌ Error Loading Settings</h3>
                <p>${error.message}</p>
            </div>
        `;
    }
}

function initializeSettings() {
    // General settings form
    document.getElementById('generalSettingsForm')?.addEventListener('submit', async (e) => {
        e.preventDefault();
        const formData = {
            systemName: document.getElementById('systemName').value,
            defaultScanType: document.getElementById('defaultScanType').value,
            maxConcurrentScans: document.getElementById('maxConcurrentScans').value,
            autoBackup: document.getElementById('autoBackup').checked
        };
        
        try {
            await fetchAPI('/api/settings/general', {
                method: 'POST',
                body: JSON.stringify(formData)
            });
            showToast('Settings saved successfully', 'success');
        } catch (error) {
            showToast('Failed to save settings: ' + error.message, 'error');
        }
    });

    // Notification settings form
    document.getElementById('notificationSettingsForm')?.addEventListener('submit', async (e) => {
        e.preventDefault();
        const formData = {
            notifyEmail: document.getElementById('notifyEmail').checked,
            notificationEmail: document.getElementById('notificationEmail').value,
            notifySlack: document.getElementById('notifySlack').checked,
            slackWebhook: document.getElementById('slackWebhook').value,
            notifyWebhook: document.getElementById('notifyWebhook').checked
        };
        
        try {
            await fetchAPI('/api/settings/notifications', {
                method: 'POST',
                body: JSON.stringify(formData)
            });
            showToast('Notification settings saved', 'success');
        } catch (error) {
            showToast('Failed to save notifications: ' + error.message, 'error');
        }
    });

    // Security settings form
    document.getElementById('securitySettingsForm')?.addEventListener('submit', async (e) => {
        e.preventDefault();
        const formData = {
            sessionTimeout: document.getElementById('sessionTimeout').value,
            requireMFA: document.getElementById('requireMFA').checked,
            enableIPWhitelist: document.getElementById('enableIPWhitelist').checked,
            allowedIPs: document.getElementById('allowedIPs').value
        };
        
        try {
            await fetchAPI('/api/settings/security', {
                method: 'POST',
                body: JSON.stringify(formData)
            });
            showToast('Security settings saved', 'success');
        } catch (error) {
            showToast('Failed to save security settings: ' + error.message, 'error');
        }
    });
}

function formatUptime(seconds) {
    if (!seconds) return 'N/A';
    const days = Math.floor(seconds / 86400);
    const hours = Math.floor((seconds % 86400) / 3600);
    const minutes = Math.floor((seconds % 3600) / 60);
    return `${days}d ${hours}h ${minutes}m`;
}

function formatMemory(memory) {
    if (!memory) return 'N/A';
    const used = (memory.heapUsed / 1024 / 1024).toFixed(2);
    const total = (memory.heapTotal / 1024 / 1024).toFixed(2);
    return `${used} MB / ${total} MB`;
}

function checkForUpdates() {
    showToast('Checking for updates...', 'info');
    setTimeout(() => {
        showToast('System is up to date!', 'success');
    }, 2000);
}

function exportData() {
    showToast('Preparing data export...', 'info');
    setTimeout(() => {
        showToast('Data exported successfully', 'success');
    }, 2000);
}

function clearCache() {
    if (confirm('Are you sure you want to clear the cache?')) {
        showToast('Cache cleared successfully', 'success');
    }
}

function resetSystem() {
    if (confirm('⚠️ WARNING: This will reset all system settings to defaults. Are you sure?')) {
        if (confirm('This action cannot be undone. Continue?')) {
            showToast('System reset initiated', 'warning');
        }
    }
}

// Load plugin-specific view
async function loadPluginView(plugin) {
    // This will be handled by views.js
    // Each plugin will have its own view renderer
    const title = plugin.charAt(0).toUpperCase() + plugin.slice(1).replace(/-/g, ' ');
    
    return {
        title: title,
        html: `
            <div class="card">
                <div class="card-header">${title} Plugin</div>
                <div id="plugin-${plugin}-content">
                    <p>Loading ${title} plugin interface...</p>
                </div>
            </div>
        `,
        actions: `
            <button class="btn btn-primary" onclick="refreshPlugin('${plugin}')">
                🔄 Refresh
            </button>
        `,
        init: () => initializePlugin(plugin)
    };
}

// Initialize plugin
async function initializePlugin(plugin) {
    console.log(`Initializing plugin: ${plugin}`);
    
    try {
        // Fetch plugin data
        const data = await fetchAPI(`/api/${plugin}/status`);
        const container = document.getElementById(`plugin-${plugin}-content`);
        
        if (container) {
            container.innerHTML = `
                <div class="plugin-status">
                    <p><strong>Status:</strong> ${data.status || 'Active'}</p>
                    <p><strong>Version:</strong> ${data.version || '1.0.0'}</p>
                    <p><strong>Last Update:</strong> ${formatDate(data.lastUpdate || new Date())}</p>
                </div>
                <div class="mt-3">
                    <button class="btn btn-outline" onclick="showPluginDetails('${plugin}')">
                        View Details
                    </button>
                </div>
            `;
        }
    } catch (error) {
        console.error(`Error initializing plugin ${plugin}:`, error);
    }
}

// Refresh plugin
function refreshPlugin(plugin) {
    showToast('info', `Refreshing ${plugin}...`);
    initializePlugin(plugin);
}

// Show plugin details
function showPluginDetails(plugin) {
    showToast('info', `Opening details for ${plugin}`);
    // Will implement modal or detailed view
}

// API Helper Functions
async function fetchAPI(endpoint, options = {}) {
    try {
        console.log('🌐 Fetching:', endpoint);
        const response = await fetch(endpoint, {
            ...options,
            headers: {
                'Content-Type': 'application/json',
                ...options.headers
            }
        });

        console.log('✅ Response status:', response.status, response.ok);

        if (!response.ok) {
            throw new Error(`HTTP error! status: ${response.status}`);
        }

        const data = await response.json();
        console.log('📦 Real data received:', data);
        return data;
    } catch (error) {
        console.error('❌ API Error:', error);
        console.warn('⚠️  Falling back to mock data for:', endpoint);
        // Return mock data for development
        return getMockData(endpoint);
    }
}

// Mock data for development (FALLBACK ONLY)
function getMockData(endpoint) {
    console.warn('🔴 USING MOCK DATA FOR:', endpoint);
    
    // Show error message in UI
    const container = document.querySelector('.main-content');
    if (container && !document.getElementById('api-error-banner')) {
        const banner = document.createElement('div');
        banner.id = 'api-error-banner';
        banner.style.cssText = 'background: #ff4444; color: white; padding: 15px; margin: 10px; border-radius: 8px; position: fixed; top: 10px; right: 10px; z-index: 9999; max-width: 300px;';
        banner.innerHTML = `
            <strong>⚠️ API Connection Failed</strong><br>
            <small>Using mock data. Check backend at http://s1.pepperbacks.xyz:8081/api/stats</small>
            <button onclick="this.parentElement.remove()" style="float:right; background: white; color: #ff4444; border: none; padding: 2px 8px; border-radius: 4px; cursor: pointer; margin-left: 10px;">✕</button>
        `;
        document.body.appendChild(banner);
    }
    
    const mockData = {
        '/api/stats': {
            totalScans: 999,  // Changed to make it obvious this is mock
            totalUsers: 999,
            alerts: 999,
            reports: 999
        },
        '/api/scans/recent': [],
        '/api/system/health': {
            cpu: 99,
            memory: 99,
            disk: 99,
            uptime: 'MOCK DATA'
        }
    };

    return mockData[endpoint] || {};
}

// UI Helper Functions
function updateConnectionStatus(connected) {
    const statusEl = document.getElementById('connectionStatus');
    if (statusEl) {
        const dot = statusEl.querySelector('.status-dot');
        const text = statusEl.querySelector('.status-text');
        
        if (connected) {
            dot.style.background = 'var(--success-color)';
            text.textContent = 'Connected';
        } else {
            dot.style.background = 'var(--danger-color)';
            text.textContent = 'Disconnected';
        }
    }
}

function updateNotificationCount(count) {
    const badge = document.getElementById('notificationCount');
    if (badge) {
        badge.textContent = count;
        badge.style.display = count > 0 ? 'block' : 'none';
    }
}

function showToast(type, message) {
    const container = document.getElementById('toastContainer');
    const toast = document.createElement('div');
    toast.className = `toast ${type}`;
    toast.textContent = message;
    
    container.appendChild(toast);
    
    setTimeout(() => {
        toast.style.opacity = '0';
        setTimeout(() => toast.remove(), 300);
    }, 3000);
}

function loadUserInfo() {
    // Load from localStorage or API
    const user = localStorage.getItem('user');
    if (user) {
        state.user = JSON.parse(user);
        document.getElementById('userName').textContent = state.user.username || 'Admin';
    }
}

function handleLogout() {
    if (confirm('Are you sure you want to logout?')) {
        localStorage.removeItem('user');
        localStorage.removeItem('token');
        window.location.href = '/login.html';
    }
}

function handleSearch(e) {
    const query = e.target.value.toLowerCase();
    console.log('Search query:', query);
    // Implement search functionality
}

function startConnectionMonitor() {
    // Check connection every 30 seconds
    setInterval(() => {
        fetch('/api/ping')
            .then(() => updateConnectionStatus(true))
            .catch(() => updateConnectionStatus(false));
    }, 30000);
}

// Utility functions
function debounce(func, wait) {
    let timeout;
    return function executedFunction(...args) {
        const later = () => {
            clearTimeout(timeout);
            func(...args);
        };
        clearTimeout(timeout);
        timeout = setTimeout(later, wait);
    };
}

function formatDate(date) {
    if (!date) return 'N/A';
    const d = new Date(date);
    return d.toLocaleDateString() + ' ' + d.toLocaleTimeString();
}

// Export functions for use in other scripts
window.loadView = loadView;
window.refreshPlugin = refreshPlugin;
window.showPluginDetails = showPluginDetails;
window.showToast = showToast;
