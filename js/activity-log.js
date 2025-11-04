// ============================================
// ACTIVITY LOG - JavaScript
// ============================================

// Global Variables
let currentUser = null;
let allActivities = [];
let filteredActivities = [];
let currentView = 'timeline';
let currentPage = 1;
const itemsPerPage = 20;

// Activity type icon mapping
const ACTIVITY_ICONS = {
    'Authentication': 'fa-shield-alt',
    'Project': 'fa-folder',
    'Protocol': 'fa-cog',
    'Simulation': 'fa-play-circle',
    'File': 'fa-file',
    'System': 'fa-server'
};

// ============================================
// INITIALIZATION
// ============================================

document.addEventListener('DOMContentLoaded', async function() {
    console.log('Activity Log page initializing...');
    
    // Check authentication
    await checkAuthentication();
    
    // Load user data
    await loadUserData();
    
    // Load activity logs
    await loadActivityLogs();
    
    // Initialize event listeners
    initializeEventListeners();
});

// ============================================
// AUTHENTICATION
// ============================================

async function checkAuthentication() {
    try {
        const userEmail = localStorage.getItem('userEmail');
        const authToken = localStorage.getItem('authToken');
        
        console.log('Checking auth - userEmail:', userEmail, 'token:', authToken ? 'exists' : 'missing');
        
        if (!userEmail || !authToken) {
            console.log('No user logged in, redirecting to login...');
            setTimeout(() => {
                window.location.href = '/login.html';
            }, 100);
            return;
        }
        
        console.log('User authenticated:', userEmail);
    } catch (error) {
        console.error('Authentication error:', error);
        setTimeout(() => {
            window.location.href = '/login.html';
        }, 100);
    }
}

// ============================================
// USER DATA LOADING
// ============================================

async function loadUserData() {
    try {
        const authToken = localStorage.getItem('authToken');
        const userEmail = localStorage.getItem('userEmail');
        
        // Validate authentication
        if (!authToken) {
            console.error('❌ No auth token found, redirecting to login...');
            localStorage.clear();
            window.location.href = '/login.html';
            return;
        }

        console.log('📡 Fetching user data from database for:', userEmail);

        // ✅ ALWAYS fetch from database via API
        const response = await fetch('/api/me', {
            headers: {
                'Authorization': `Bearer ${authToken}`
            }
        });
        
        // Handle authentication errors
        if (!response.ok) {
            if (response.status === 403 || response.status === 401) {
                console.error('❌ Invalid or expired token (Status:', response.status + '), redirecting to login...');
                localStorage.clear();
                window.location.href = '/login.html';
                return;
            }
            
            // Other errors
            const errorText = await response.text();
            throw new Error(`API returned status ${response.status}: ${errorText}`);
        }
        
        // Parse response
        const data = await response.json();
        
        if (!data.user) {
            throw new Error('No user data in API response');
        }
        
        const user = data.user;
        
        console.log('✅ User data fetched from database:', {
            id: user.id,
            email: user.email,
            name: user.name,
            role: user.role
        });
        
        // Update localStorage with fresh data from database
        localStorage.setItem('userName', user.name);
        localStorage.setItem('userEmail', user.email);
        localStorage.setItem('userRole', user.role);
        if (user.id) {
            localStorage.setItem('userId', String(user.id));
        }
        
        // Set current user object
        currentUser = {
            id: user.id,
            email: user.email,
            name: user.name,
            role: user.role,
            created_at: user.created_at,
            last_login: user.last_login
        };
        
        console.log('✅ Current user set:', currentUser.name, '(' + currentUser.role + ')');
        
        // Update UI elements
        const userNameElements = [
            document.getElementById('userName'),
            document.getElementById('topBarUserName')
        ];
        
        userNameElements.forEach(element => {
            if (element) {
                element.textContent = currentUser.name;
            }
        });
        
        const userRoleElement = document.getElementById('userRole');
        if (userRoleElement) {
            userRoleElement.textContent = currentUser.role;
        }
        
        // Update avatar
        updateUserAvatar(currentUser.name);
        
    } catch (error) {
        console.error('❌ Error loading user data:', error);
        
        // If API fails, redirect to login (no fallback to localStorage)
        console.error('🔴 Cannot load user data from database, clearing session...');
        localStorage.clear();
        
        // Show error message before redirect
        alert('Failed to load user data. Please login again.\n\nError: ' + error.message);
        
        window.location.href = '/login.html';
    }
}

function updateUserAvatar(name) {
    if (!name || name === 'User') return;
    
    const avatarElements = [
        document.getElementById('userAvatar'),
        document.querySelector('.user-avatar-small')
    ];
    
    const initials = name
        .split(' ')
        .map(word => word.charAt(0).toUpperCase())
        .slice(0, 2)
        .join('');
    
    avatarElements.forEach(element => {
        if (element) {
            element.innerHTML = initials || '<i class="fas fa-user"></i>';
        }
    });
}

// ============================================
// LOAD ACTIVITY LOGS
// ============================================

async function loadActivityLogs() {
    try {
        showLoading(true);
        
        const authToken = localStorage.getItem('authToken');
        
        if (!authToken) {
            throw new Error('No authentication token');
        }
        
        // ✅ Fetch activity logs from database via API
        const response = await fetch('/api/activity-log?limit=1000', {
            headers: {
                'Authorization': `Bearer ${authToken}`
            }
        });
        
        if (!response.ok) {
            throw new Error('Failed to fetch activity logs');
        }
        
        const data = await response.json();
allActivities = data.logs || [];

// ✅ FILTER OUT "Projects Loaded" activities from GUI display
allActivities = allActivities.filter(activity => {
    const action = (activity.action || '').toLowerCase();
    const description = (activity.description || '').toLowerCase();
    
    // Exclude any activity related to "projects loaded"
    return !action.includes('projects loaded') && 
           !action.includes('project loaded') &&
           !description.includes('projects loaded') &&
           !description.includes('project loaded');
});

console.log('✅ Loaded', allActivities.length, 'activity logs from database (excluding Projects Loaded)');

// Also load statistics
await loadActivityStats();

filteredActivities = [...allActivities];
        
        showLoading(false);
        updateStatistics();
        displayActivities();
        
    } catch (error) {
        console.error('❌ Error loading activity logs:', error);
        showLoading(false);
        
        // ❌ REMOVE MOCK DATA - Show error instead
        const emptyState = document.getElementById('emptyState');
        if (emptyState) {
            emptyState.style.display = 'block';
            emptyState.innerHTML = `
                <div class="empty-icon">
                    <i class="fas fa-exclamation-circle"></i>
                </div>
                <h3>Failed to Load Activity Logs</h3>
                <p>${error.message}</p>
                <button class="btn btn-primary" onclick="window.location.reload()">
                    <i class="fas fa-redo"></i> Retry
                </button>
            `;
        }
        
        allActivities = [];
        filteredActivities = [];
        updateStatistics();
    }
}

function loadMockActivities() {
    const now = new Date();
    
    allActivities = [
        {
            id: 1,
            user_email: currentUser.email,
            user_name: currentUser.name,
            activity_type: 'Authentication',
            action: 'User Login',
            description: 'User successfully logged in from Chrome browser',
            status: 'success',
            browser: 'Chrome',
            device_type: 'Desktop',
            created_at: new Date(now.getTime() - 2 * 60 * 1000).toISOString()
        },
        {
            id: 2,
            user_email: currentUser.email,
            user_name: currentUser.name,
            activity_type: 'Navigation',
            action: 'Page Visited',
            description: 'Navigated to User Dashboard',
            status: 'success',
            browser: 'Chrome',
            device_type: 'Desktop',
            created_at: new Date(now.getTime() - 5 * 60 * 1000).toISOString()
        },
        {
            id: 3,
            user_email: currentUser.email,
            user_name: currentUser.name,
            activity_type: 'Project',
            action: 'Project Created',
            description: 'Created new project "Test_Project_MF62" with protocol MF62',
            status: 'success',
            browser: 'Chrome',
            device_type: 'Desktop',
            related_entity_type: 'project',
            related_entity_id: 45,
            created_at: new Date(now.getTime() - 30 * 60 * 1000).toISOString()
        },
        {
            id: 4,
            user_email: currentUser.email,
            user_name: currentUser.name,
            activity_type: 'Protocol',
            action: 'Input Parameters Entered',
            description: 'Entered input parameters for MF62 protocol',
            status: 'success',
            browser: 'Chrome',
            device_type: 'Desktop',
            created_at: new Date(now.getTime() - 45 * 60 * 1000).toISOString()
        },
        {
            id: 5,
            user_email: currentUser.email,
            user_name: currentUser.name,
            activity_type: 'File',
            action: 'Excel File Uploaded',
            description: 'Uploaded matrix file "output.xlsx" for project processing',
            status: 'success',
            browser: 'Chrome',
            device_type: 'Desktop',
            created_at: new Date(now.getTime() - 60 * 60 * 1000).toISOString()
        },
        {
            id: 6,
            user_email: currentUser.email,
            user_name: currentUser.name,
            activity_type: 'Simulation',
            action: 'Abaqus Simulation Started',
            description: 'Started Abaqus simulation job "P1_L1_job01" in folder P1_L1',
            status: 'success',
            browser: 'Chrome',
            device_type: 'Desktop',
            created_at: new Date(now.getTime() - 2 * 60 * 60 * 1000).toISOString()
        },
        {
            id: 7,
            user_email: currentUser.email,
            user_name: currentUser.name,
            activity_type: 'Simulation',
            action: 'Simulation Completed',
            description: 'Abaqus job "P1_L1_job01" completed successfully in 450 seconds',
            status: 'success',
            browser: 'Chrome',
            device_type: 'Desktop',
            created_at: new Date(now.getTime() - 3 * 60 * 60 * 1000).toISOString()
        },
        {
            id: 8,
            user_email: currentUser.email,
            user_name: currentUser.name,
            activity_type: 'File',
            action: 'Tydex File Generated',
            description: 'Generated Tydex file "output_tydex.tdx" from template',
            status: 'success',
            browser: 'Chrome',
            device_type: 'Desktop',
            created_at: new Date(now.getTime() - 4 * 60 * 60 * 1000).toISOString()
        },
        {
            id: 9,
            user_email: currentUser.email,
            user_name: currentUser.name,
            activity_type: 'Project',
            action: 'Project Status Changed',
            description: 'Changed project status from "Not Started" to "In Progress"',
            status: 'success',
            browser: 'Chrome',
            device_type: 'Desktop',
            created_at: new Date(now.getTime() - 5 * 60 * 60 * 1000).toISOString()
        },
        {
            id: 10,
            user_email: currentUser.email,
            user_name: currentUser.name,
            activity_type: 'Navigation',
            action: 'Page Visited',
            description: 'Navigated to My Projects page',
            status: 'success',
            browser: 'Chrome',
            device_type: 'Desktop',
            created_at: new Date(now.getTime() - 24 * 60 * 60 * 1000).toISOString()
        }
    ];
    
    filteredActivities = [...allActivities];
    updateStatistics();
    displayActivities();
}

async function loadActivityStats() {
    try {
        const authToken = localStorage.getItem('authToken');
        const response = await fetch('/api/activity-log/stats', {
            headers: {
                'Authorization': `Bearer ${authToken}`
            }
        });
        
        if (response.ok) {
            const data = await response.json();
            console.log('Activity stats:', data.stats);
        }
    } catch (error) {
        console.error('Error loading stats:', error);
    }
}

// ============================================
// DISPLAY FUNCTIONS
// ============================================

function showLoading(show) {
    const loadingContainer = document.getElementById('loadingContainer');
    const emptyState = document.getElementById('emptyState');
    const activityTimeline = document.getElementById('activityTimeline');
    const activityTableView = document.getElementById('activityTableView');
    
    if (show) {
        loadingContainer.style.display = 'block';
        emptyState.style.display = 'none';
        activityTimeline.style.display = 'none';
        activityTableView.style.display = 'none';
    } else {
        loadingContainer.style.display = 'none';
    }
}

function updateStatistics() {
    const now = new Date();
    const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    
    const stats = {
        total: allActivities.length,
        today: allActivities.filter(a => new Date(a.created_at) >= todayStart).length,
        success: allActivities.filter(a => a.status === 'success').length,
        failed: allActivities.filter(a => a.status === 'failed' || a.status === 'warning').length
    };
    
    document.getElementById('totalActivities').textContent = stats.total;
    document.getElementById('todayActivities').textContent = stats.today;
    document.getElementById('successActivities').textContent = stats.success;
    document.getElementById('failedActivities').textContent = stats.failed;
}

function displayActivities() {
    const emptyState = document.getElementById('emptyState');
    const displayCount = document.getElementById('displayCount');
    
    displayCount.textContent = filteredActivities.length;
    
    if (filteredActivities.length === 0) {
        emptyState.style.display = 'block';
        document.getElementById('activityTimeline').style.display = 'none';
        document.getElementById('activityTableView').style.display = 'none';
        return;
    }
    
    emptyState.style.display = 'none';
    
    if (currentView === 'timeline') {
        displayTimelineView();
    } else {
        displayTableView();
    }
    
    updatePagination();
}

function displayTimelineView() {
    const activityTimeline = document.getElementById('activityTimeline');
    const activityTableView = document.getElementById('activityTableView');
    
    activityTimeline.style.display = 'block';
    activityTableView.style.display = 'none';
    
    const startIndex = (currentPage - 1) * itemsPerPage;
    const endIndex = startIndex + itemsPerPage;
    
    // ✅ ADDITIONAL FILTER: Exclude "Projects Loaded" from display
    const cleanedActivities = filteredActivities.filter(activity => {
        const action = (activity.action || '').toLowerCase();
        const description = (activity.description || '').toLowerCase();
        
        return !action.includes('projects loaded') && 
               !action.includes('project loaded') &&
               !description.includes('projects loaded') &&
               !description.includes('project loaded');
    });
    
    const activitiesToDisplay = cleanedActivities.slice(startIndex, endIndex);
    
    activityTimeline.innerHTML = activitiesToDisplay.map(activity => {
        const activityClass = (activity.activity_type || 'system').toLowerCase().replace(/\s+/g, '-');
        const icon = ACTIVITY_ICONS[activity.activity_type] || 'fa-circle';
        const statusClass = getStatusClass(activity.status);
        const uniqueId = generateUniqueId(activity.id, activity.created_at);
        
        return `
            <div class="activity-item">
                <div class="activity-icon-wrapper">
                    <div class="activity-icon ${activityClass}">
                        <i class="fas ${icon}"></i>
                    </div>
                </div>
                <div class="activity-content">
                    <div class="activity-header">
                        <span class="activity-id">${uniqueId}</span>
                        <span class="activity-action">${escapeHtml(activity.action)}</span>
                    </div>
                    <div class="activity-description">
    ${escapeHtml(activity.description)}
    ${activity.project_name ? `<span style="color: var(--primary-color); font-weight: 600; margin-left: 5px;">in project "${activity.project_name}"</span>` : ''}
</div>
                    <div class="activity-meta">
                        <div class="meta-item">
                            <i class="fas fa-clock"></i>
                            <span>${formatRelativeTime(activity.created_at)}</span>
                        </div>
                        <div class="meta-item">
                            <i class="fas fa-calendar"></i>
                            <span>${formatDateTime(activity.created_at)}</span>
                        </div>
                        ${activity.ip_address ? `
                            <div class="meta-item">
                                <i class="fas fa-network-wired"></i>
                                <span>${activity.ip_address}</span>
                            </div>
                        ` : ''}
                        ${activity.browser ? `
                            <div class="meta-item">
                                <i class="fas fa-browser"></i>
                                <span>${activity.browser}</span>
                            </div>
                        ` : ''}
                        ${activity.device_type ? `
                            <div class="meta-item">
                                <i class="fas fa-${getDeviceIcon(activity.device_type)}"></i>
                                <span>${activity.device_type}</span>
                            </div>
                        ` : ''}
                    </div>
                </div>
                <div class="activity-status">
                    <span class="status-badge status-${statusClass}">${activity.status}</span>
                </div>
            </div>
        `;
    }).join('');
}


function displayTableView() {
    const activityTimeline = document.getElementById('activityTimeline');
    const activityTableView = document.getElementById('activityTableView');
    const activityTableBody = document.getElementById('activityTableBody');
    
    activityTimeline.style.display = 'none';
    activityTableView.style.display = 'block';
    
    const startIndex = (currentPage - 1) * itemsPerPage;
    const endIndex = startIndex + itemsPerPage;
    
    // ✅ ADDITIONAL FILTER: Exclude "Projects Loaded" from display
    const cleanedActivities = filteredActivities.filter(activity => {
        const action = (activity.action || '').toLowerCase();
        const description = (activity.description || '').toLowerCase();
        
        return !action.includes('projects loaded') && 
               !action.includes('project loaded') &&
               !description.includes('projects loaded') &&
               !description.includes('project loaded');
    });
    
    const activitiesToDisplay = cleanedActivities.slice(startIndex, endIndex);
    
    activityTableBody.innerHTML = activitiesToDisplay.map(activity => {
        const statusClass = getStatusClass(activity.status);
        const uniqueId = generateUniqueId(activity.id, activity.created_at);
        
        return `
            <tr>
                <td><code class="activity-id-code">${uniqueId}</code></td>
                <td>${formatDateTime(activity.created_at)}</td>
                <td>
                    <span class="activity-type-badge ${(activity.activity_type || 'system').toLowerCase()}">
                        ${activity.activity_type || 'System'}
                    </span>
                </td>
                <td><strong>${escapeHtml(activity.action)}</strong></td>
                <td>
    ${escapeHtml(activity.description)}
    ${activity.project_name ? `<br><small style="color: var(--primary-color); font-weight: 600;">Project: ${activity.project_name}</small>` : ''}
</td>
                <td>
                    <span class="status-badge status-${statusClass}">${activity.status}</span>
                </td>
                <td>
                    ${activity.browser || 'Unknown'} / ${activity.device_type || 'Unknown'}
                </td>
                <td>
                    <span class="ip-address">${activity.ip_address || '—'}</span>
                </td>
            </tr>
        `;
    }).join('');
}

// ============================================
// PAGINATION
// ============================================

function updatePagination() {
    const totalPages = Math.ceil(filteredActivities.length / itemsPerPage);
    const paginationContainer = document.getElementById('paginationContainer');
    const prevBtn = document.getElementById('prevPageBtn');
    const nextBtn = document.getElementById('nextPageBtn');
    const currentPageSpan = document.getElementById('currentPage');
    const totalPagesSpan = document.getElementById('totalPages');
    const showingRange = document.getElementById('showingRange');
    const totalItems = document.getElementById('totalItems');
    
    if (filteredActivities.length === 0 || totalPages <= 1) {
        paginationContainer.style.display = 'none';
        return;
    }
    
    paginationContainer.style.display = 'flex';
    
    currentPageSpan.textContent = currentPage;
    totalPagesSpan.textContent = totalPages;
    totalItems.textContent = filteredActivities.length;
    
    const startIndex = (currentPage - 1) * itemsPerPage + 1;
    const endIndex = Math.min(currentPage * itemsPerPage, filteredActivities.length);
    showingRange.textContent = `${startIndex}-${endIndex}`;
    
    prevBtn.disabled = currentPage === 1;
    nextBtn.disabled = currentPage === totalPages;
}

function goToPage(page) {
    const totalPages = Math.ceil(filteredActivities.length / itemsPerPage);
    
    if (page < 1 || page > totalPages) return;
    
    currentPage = page;
    displayActivities();
    
    window.scrollTo({ top: 0, behavior: 'smooth' });
}


// ============================================
// UNIQUE ID GENERATOR
// ============================================

function generateUniqueId(dbId, createdAt) {
    // Format: ACT-YYYYMMDD-XXXX
    // Example: ACT-20251007-A3F9
    
    const date = new Date(createdAt);
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    
    // Convert numeric ID to alphanumeric
    const alphanumeric = numToAlphanumeric(dbId);
    
    return `ACT-${year}${month}${day}-${alphanumeric}`;
}

function numToAlphanumeric(num) {
    // Convert number to base-36 (0-9, A-Z) and pad to 4 characters
    const base36 = num.toString(36).toUpperCase();
    return base36.padStart(4, '0');
}


// ============================================
// FILTER & SEARCH
// ============================================

function applyFilters() {
    const searchQuery = document.getElementById('searchInput').value.toLowerCase();
    const activityTypeFilter = document.getElementById('activityTypeFilter').value;
    const statusFilter = document.getElementById('statusFilter').value;
    const dateRangeFilter = document.getElementById('dateRangeFilter').value;
    
    filteredActivities = [...allActivities];
    
    // Apply search filter
    if (searchQuery) {
        filteredActivities = filteredActivities.filter(activity => 
            activity.action.toLowerCase().includes(searchQuery) ||
            activity.description.toLowerCase().includes(searchQuery) ||
            (activity.activity_type && activity.activity_type.toLowerCase().includes(searchQuery))
        );
    }
    
    // Apply activity type filter
    if (activityTypeFilter !== 'all') {
        filteredActivities = filteredActivities.filter(a => a.activity_type === activityTypeFilter);
    }
    
    // Apply status filter
    if (statusFilter !== 'all') {
        filteredActivities = filteredActivities.filter(a => a.status === statusFilter);
    }
    
    // Apply date range filter
    if (dateRangeFilter !== 'all') {
        const now = new Date();
        let filterDate;
        
        switch (dateRangeFilter) {
            case 'today':
                filterDate = new Date(now.getFullYear(), now.getMonth(), now.getDate());
                filteredActivities = filteredActivities.filter(a => new Date(a.created_at) >= filterDate);
                break;
            case 'week':
                filterDate = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
                filteredActivities = filteredActivities.filter(a => new Date(a.created_at) >= filterDate);
                break;
            case 'month':
                filterDate = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
                filteredActivities = filteredActivities.filter(a => new Date(a.created_at) >= filterDate);
                break;
            case 'custom':
                const startDate = document.getElementById('startDate').value;
                const endDate = document.getElementById('endDate').value;
                if (startDate) {
                    filteredActivities = filteredActivities.filter(a => 
                        new Date(a.created_at) >= new Date(startDate)
                    );
                }
                if (endDate) {
                    filteredActivities = filteredActivities.filter(a => 
                        new Date(a.created_at) <= new Date(endDate + 'T23:59:59')
                    );
                }
                break;
        }
    }
    
    currentPage = 1;
    displayActivities();
}

function resetFilters() {
    document.getElementById('searchInput').value = '';
    document.getElementById('activityTypeFilter').value = 'all';
    document.getElementById('statusFilter').value = 'all';
    document.getElementById('dateRangeFilter').value = 'all';
    document.getElementById('customDateRange').style.display = 'none';
    document.getElementById('startDate').value = '';
    document.getElementById('endDate').value = '';
    
    applyFilters();
}

// ============================================
// VIEW TOGGLE
// ============================================

function toggleView(view) {
    currentView = view;
    
    const timelineBtn = document.getElementById('timelineViewBtn');
    const tableBtn = document.getElementById('tableViewBtn');
    
    if (view === 'timeline') {
        timelineBtn.classList.add('active');
        tableBtn.classList.remove('active');
    } else {
        timelineBtn.classList.remove('active');
        tableBtn.classList.add('active');
    }
    
    displayActivities();
}

// ============================================
// EXPORT
// ============================================

function exportToCSV() {
    let csv = 'Timestamp,Type,Action,Description,Status,Browser,Device\n';
    
    filteredActivities.forEach(activity => {
        csv += `"${activity.created_at}",`;
        csv += `"${activity.activity_type || ''}",`;
        csv += `"${activity.action}",`;
        csv += `"${activity.description}",`;
        csv += `"${activity.status}",`;
        csv += `"${activity.browser || ''}",`;
        csv += `"${activity.device_type || ''}"\n`;
    });
    
    const blob = new Blob([csv], { type: 'text/csv' });
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `activity-log-${new Date().toISOString().split('T')[0]}.csv`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    window.URL.revokeObjectURL(url);
    
    showToast('Activity log exported successfully', 'success');
}

// Auto-refresh every 30 seconds
let autoRefreshInterval = null;
let autoRefreshEnabled = false;

function toggleAutoRefresh() {
    autoRefreshEnabled = !autoRefreshEnabled;
    
    const toggleBtn = document.getElementById('autoRefreshToggle');
    if (toggleBtn) {
        toggleBtn.classList.toggle('active', autoRefreshEnabled);
        toggleBtn.innerHTML = autoRefreshEnabled 
            ? '<i class="fas fa-pause"></i> Pause Live' 
            : '<i class="fas fa-play"></i> Go Live';
    }
    
    if (autoRefreshEnabled) {
        autoRefreshInterval = setInterval(async () => {
            console.log('🔄 Auto-refreshing activity log...');
            await loadActivityLogs();
        }, 30000); // 30 seconds
        
        showToast('Live updates enabled', 'success');
    } else {
        clearInterval(autoRefreshInterval);
        showToast('Live updates disabled', 'info');
    }
}

window.toggleAutoRefresh = toggleAutoRefresh;

// ============================================
// EVENT LISTENERS
// ============================================

function initializeEventListeners() {
    // Logout button
    const logoutBtn = document.getElementById('logoutBtn');
    if (logoutBtn) {
        logoutBtn.addEventListener('click', handleLogout);
    }
    
    // Search input
    const searchInput = document.getElementById('searchInput');
    if (searchInput) {
        searchInput.addEventListener('input', debounce(applyFilters, 300));
    }
    
    // Filter dropdowns
    const filters = ['activityTypeFilter', 'statusFilter', 'dateRangeFilter'];
    filters.forEach(filterId => {
        const element = document.getElementById(filterId);
        if (element) {
            element.addEventListener('change', () => {
                if (filterId === 'dateRangeFilter') {
                    const customDateRange = document.getElementById('customDateRange');
                    customDateRange.style.display = element.value === 'custom' ? 'grid' : 'none';
                }
                applyFilters();
            });
        }
    });
    
    // Custom date inputs
    const startDate = document.getElementById('startDate');
    const endDate = document.getElementById('endDate');
    if (startDate) startDate.addEventListener('change', applyFilters);
    if (endDate) endDate.addEventListener('change', applyFilters);
    
    // Reset filters button
    const resetBtn = document.getElementById('resetFiltersBtn');
    if (resetBtn) {
        resetBtn.addEventListener('click', resetFilters);
    }
    
    // View toggle buttons
    const timelineViewBtn = document.getElementById('timelineViewBtn');
    const tableViewBtn = document.getElementById('tableViewBtn');
    
    if (timelineViewBtn) {
        timelineViewBtn.addEventListener('click', () => toggleView('timeline'));
    }
    
    if (tableViewBtn) {
        tableViewBtn.addEventListener('click', () => toggleView('table'));
    }
    
    // Refresh button
    const refreshBtn = document.getElementById('refreshBtn');
    if (refreshBtn) {
        refreshBtn.addEventListener('click', handleRefresh);
    }
    
    // Export button
    const exportBtn = document.getElementById('exportBtn');
    if (exportBtn) {
        exportBtn.addEventListener('click', exportToCSV);
    }
    
    // Pagination buttons
    const prevPageBtn = document.getElementById('prevPageBtn');
    const nextPageBtn = document.getElementById('nextPageBtn');
    
    if (prevPageBtn) {
        prevPageBtn.addEventListener('click', () => goToPage(currentPage - 1));
    }
    
    if (nextPageBtn) {
        nextPageBtn.addEventListener('click', () => goToPage(currentPage + 1));
    }

    // ✅ HAMBURGER MENU - MOVED HERE (OUTSIDE handleLogout)
    const hamburgerMenuBtn = document.getElementById('hamburgerMenuBtn');
    if (hamburgerMenuBtn) {
        hamburgerMenuBtn.addEventListener('click', toggleUserDetailsPanel);
    }

    // Close panel button
    const closePanelBtn = document.getElementById('closePanelBtn');
    if (closePanelBtn) {
        closePanelBtn.addEventListener('click', closeUserDetailsPanel);
    }

    // Panel overlay
    const panelOverlay = document.createElement('div');
    panelOverlay.className = 'panel-overlay';
    panelOverlay.id = 'panelOverlay';
    document.body.appendChild(panelOverlay);

    panelOverlay.addEventListener('click', closeUserDetailsPanel);
}

function handleLogout() {
    if (confirm('Are you sure you want to logout?')) {
        localStorage.removeItem('userEmail');
        localStorage.removeItem('userName');
        localStorage.removeItem('userRole');
        localStorage.removeItem('authToken');
        window.location.href = '/login.html';
    }
}

async function handleRefresh() {
    const refreshBtn = document.getElementById('refreshBtn');
    if (!refreshBtn) return;
    
    refreshBtn.classList.add('spinning');
    
    try {
        await loadActivityLogs();
        showToast('Activity log refreshed successfully', 'success');
    } catch (error) {
        console.error('Error refreshing activity log:', error);
        showToast('Failed to refresh activity log', 'error');
    } finally {
        setTimeout(() => {
            refreshBtn.classList.remove('spinning');
        }, 500);
    }
}
// ============================================
// USER DETAILS PANEL
// ============================================

async function toggleUserDetailsPanel() {
    const panel = document.getElementById('userDetailsPanel');
    const overlay = document.getElementById('panelOverlay');
    
    if (panel.classList.contains('active')) {
        closeUserDetailsPanel();
    } else {
        panel.classList.add('active');
        overlay.classList.add('active');
        await loadUserDetails();
    }
}

function closeUserDetailsPanel() {
    const panel = document.getElementById('userDetailsPanel');
    const overlay = document.getElementById('panelOverlay');
    
    panel.classList.remove('active');
    overlay.classList.remove('active');
}

async function loadUserDetails() {
    const userDetailsBody = document.getElementById('userDetailsBody');
    
    try {
        // Show loading state
        userDetailsBody.innerHTML = `
            <div class="loader">
                <i class="fas fa-spinner fa-spin"></i>
            </div>
            <p style="text-align: center; color: var(--text-secondary);">Loading user details...</p>
        `;
        
        // Fetch user details from /api/me
        const response = await fetch('/api/me', {
            headers: {
                'Authorization': `Bearer ${localStorage.getItem('authToken')}`
            }
        });
        
        if (!response.ok) {
            throw new Error('Failed to fetch user details');
        }
        
        const data = await response.json();
        const user = data.user;
        
        if (!user) {
            throw new Error('No user data returned');
        }
        
        // Display user details
        userDetailsBody.innerHTML = `
            <div class="user-detail-item">
                <div class="user-detail-label">
                    <i class="fas fa-id-badge"></i> User ID
                </div>
                <div class="user-detail-value">#${user.id || 'N/A'}</div>
            </div>
            
            <div class="user-detail-item">
                <div class="user-detail-label">
                    <i class="fas fa-user"></i> Name
                </div>
                <div class="user-detail-value">${user.name || 'Not set'}</div>
            </div>
            
            <div class="user-detail-item">
                <div class="user-detail-label">
                    <i class="fas fa-envelope"></i> Email
                </div>
                <div class="user-detail-value">${user.email || 'N/A'}</div>
            </div>
            
            <div class="user-detail-item">
                <div class="user-detail-label">
                    <i class="fas fa-shield-alt"></i> Role
                </div>
                <div class="user-detail-value role-badge ${(user.role || 'engineer').toLowerCase()}">
                    ${user.role || 'Engineer'}
                </div>
            </div>
            
            <div class="user-detail-item">
                <div class="user-detail-label">
                    <i class="fas fa-calendar-plus"></i> Account Created
                </div>
                <div class="user-detail-value">${formatDateTime(user.created_at)}</div>
            </div>
            
            <div class="user-detail-item">
                <div class="user-detail-label">
                    <i class="fas fa-clock"></i> Last Login
                </div>
                <div class="user-detail-value">${formatDateTime(user.last_login)}</div>
            </div>
            
            <div class="user-stats-grid">
                <div class="user-stat-card">
                    <div class="stat-icon">
                        <i class="fas fa-chart-line"></i>
                    </div>
                    <div class="stat-value">${allActivities.length}</div>
                    <div class="stat-label">Total Activities</div>
                </div>
                
                <div class="user-stat-card">
                    <div class="stat-icon">
                        <i class="fas fa-calendar-day"></i>
                    </div>
                    <div class="stat-value">${calculateTodayActivities()}</div>
                    <div class="stat-label">Today</div>
                </div>
                
                <div class="user-stat-card">
                    <div class="stat-icon">
                        <i class="fas fa-calendar-week"></i>
                    </div>
                    <div class="stat-value">${calculateWeekActivities()}</div>
                    <div class="stat-label">This Week</div>
                </div>
                
                <div class="user-stat-card">
                    <div class="stat-icon">
                        <i class="fas fa-calendar"></i>
                    </div>
                    <div class="stat-value">${calculateDaysSinceJoined(user.created_at)}</div>
                    <div class="stat-label">Days Active</div>
                </div>
            </div>
        `;
        
    } catch (error) {
        console.error('Error loading user details:', error);
        userDetailsBody.innerHTML = `
            <div class="empty-state" style="padding: 40px 20px;">
                <div class="empty-icon">
                    <i class="fas fa-exclamation-circle"></i>
                </div>
                <h3>Failed to Load User Details</h3>
                <p>${error.message}</p>
                <button class="btn btn-primary" onclick="loadUserDetails()">
                    <i class="fas fa-redo"></i> Try Again
                </button>
            </div>
        `;
    }
}

function calculateTodayActivities() {
    const now = new Date();
    const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    return allActivities.filter(a => new Date(a.created_at) >= todayStart).length;
}

function calculateWeekActivities() {
    const weekAgo = new Date();
    weekAgo.setDate(weekAgo.getDate() - 7);
    return allActivities.filter(a => new Date(a.created_at) >= weekAgo).length;
}

function calculateDaysSinceJoined(createdAt) {
    if (!createdAt) return 0;
    
    const created = new Date(createdAt);
    const now = new Date();
    const diffTime = Math.abs(now - created);
    const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
    
    return diffDays;
}

// Make functions globally accessible
window.toggleUserDetailsPanel = toggleUserDetailsPanel;
window.closeUserDetailsPanel = closeUserDetailsPanel;
window.loadUserDetails = loadUserDetails;


// ============================================
// UTILITY FUNCTIONS
// ============================================

function getStatusClass(status) {
    const statusMap = {
        'success': 'success',
        'failed': 'failed',
        'warning': 'warning'
    };
    return statusMap[status] || 'success';
}

function getDeviceIcon(deviceType) {
    const iconMap = {
        'Desktop': 'desktop',
        'Mobile': 'mobile',
        'Tablet': 'tablet'
    };
    return iconMap[deviceType] || 'laptop';
}

function formatDateTime(dateString) {
    if (!dateString) return '-';
    
    const date = new Date(dateString);
    const dateOptions = { year: 'numeric', month: 'short', day: 'numeric' };
    const timeOptions = { hour: '2-digit', minute: '2-digit' };
    
    return date.toLocaleDateString('en-US', dateOptions) + ' ' + 
           date.toLocaleTimeString('en-US', timeOptions);
}

function formatRelativeTime(dateString) {
    if (!dateString) return '-';
    
    const date = new Date(dateString);
    const now = new Date();
    const diffInSeconds = Math.floor((now - date) / 1000);
    
    if (diffInSeconds < 60) {
        return 'Just now';
    }
    
    const diffInMinutes = Math.floor(diffInSeconds / 60);
    if (diffInMinutes < 60) {
        return `${diffInMinutes} ${diffInMinutes === 1 ? 'minute' : 'minutes'} ago`;
    }
    
    const diffInHours = Math.floor(diffInMinutes / 60);
    if (diffInHours < 24) {
        return `${diffInHours} ${diffInHours === 1 ? 'hour' : 'hours'} ago`;
    }
    
    const diffInDays = Math.floor(diffInHours / 24);
    if (diffInDays < 7) {
        return `${diffInDays} ${diffInDays === 1 ? 'day' : 'days'} ago`;
    }
    
    const diffInWeeks = Math.floor(diffInDays / 7);
    if (diffInWeeks < 4) {
        return `${diffInWeeks} ${diffInWeeks === 1 ? 'week' : 'weeks'} ago`;
    }
    
    const diffInMonths = Math.floor(diffInDays / 30);
    return `${diffInMonths} ${diffInMonths === 1 ? 'month' : 'months'} ago`;
}

function escapeHtml(text) {
    const map = {
        '&': '&amp;',
        '<': '&lt;',
        '>': '&gt;',
        '"': '&quot;',
        "'": '&#039;'
    };
    return text.replace(/[&<>"']/g, m => map[m]);
}

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

function showToast(message, type = 'info') {
    const toast = document.createElement('div');
    toast.className = `toast toast-${type}`;
    toast.innerHTML = `
        <i class="fas fa-${getToastIcon(type)}"></i>
        <span>${message}</span>
    `;
    
    toast.style.cssText = `
        position: fixed;
        top: 20px;
        right: 20px;
        background: ${type === 'success' ? '#10b981' : type === 'error' ? '#ef4444' : '#3b82f6'};
        color: white;
        padding: 15px 20px;
        border-radius: 10px;
        box-shadow: 0 10px 25px rgba(0,0,0,0.2);
        display: flex;
        align-items: center;
        gap: 10px;
        z-index: 10000;
        animation: slideInRight 0.3s ease;
    `;
    
    document.body.appendChild(toast);
    
    setTimeout(() => {
        toast.style.animation = 'slideOutRight 0.3s ease';
        setTimeout(() => {
            if (toast.parentElement) {
                document.body.removeChild(toast);
            }
        }, 300);
    }, 3000);
}

function getToastIcon(type) {
    const icons = {
        'success': 'check-circle',
        'error': 'exclamation-circle',
        'warning': 'exclamation-triangle',
        'info': 'info-circle'
    };
    return icons[type] || 'info-circle';
}

// ============================================
// HELPER FUNCTION: Log Activity
// ============================================

async function logActivity(activityType, action, description, metadata = {}, projectName = null) {
    try {
        const authToken = localStorage.getItem('authToken');
        
        if (!authToken) {
            console.warn('⚠️ No auth token found, skipping activity log');
            return;
        }
        
        // Prepare the activity log payload
        const payload = {
            activity_type: activityType,
            action: action,
            description: description,
            status: 'success',
            metadata: metadata
        };
        
        // ✅ Add project_name if provided
        if (projectName) {
            payload.project_name = projectName;
        }
        
        // Send activity log to API
        const response = await fetch('/api/activity-log', {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${authToken}`,
                'Content-Type': 'application/json'
            },
            body: JSON.stringify(payload)
        });
        
        if (!response.ok) {
            console.error('❌ Failed to log activity:', response.status, response.statusText);
        } else {
            console.log('✅ Activity logged:', action);
        }
        
    } catch (error) {
        console.error('❌ Error logging activity:', error);
    }
}

// Make logActivity globally available
window.logActivity = logActivity;

// ============================================
// CONSOLE WELCOME MESSAGE
// ============================================

console.log('%c Activity Log Page Loaded! ', 'background: #6366f1; color: white; font-size: 16px; font-weight: bold; padding: 10px;');

// ============================================
// END OF ACTIVITY LOG JAVASCRIPT
// ============================================