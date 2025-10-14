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
    loadUserInfo();
    setupEventListeners();
    loadView('overview');
    startConnectionMonitor();
});

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
    return `
        <div class="card">
            <div class="card-header">API Analytics Dashboard</div>
            <p>Analytics integration coming soon...</p>
        </div>
    `;
}

function initializeAnalytics() {
    // Will be implemented with chart.js
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
