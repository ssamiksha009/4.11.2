// ============================================
// ACTIVITY MONITOR - JavaScript
// ============================================

// Global Variables
let currentManager = null;
let allActivities = [];
let filteredActivities = [];
let currentPage = 1;
let itemsPerPage = 25;
let totalPages = 1;
let autoRefreshInterval = null;
let activityTrendChart = null;
let activityTypesChart = null;

// ============================================
// INITIALIZATION
// ============================================

document.addEventListener('DOMContentLoaded', async function() {
    console.log('Activity Monitor initializing...');
    
    // Check authentication
    await checkAuthentication();
    
    // Load manager data
    await loadManagerData();
    
    // Load activity data
    await loadActivityData();
    
    // Initialize event listeners
    initializeEventListeners();

});

// ============================================
// AUTHENTICATION
// ============================================

async function checkAuthentication() {
    try {
        const authToken = localStorage.getItem('authToken');
        
        if (!authToken) {
            console.log('No authentication token found, redirecting to login...');
            setTimeout(() => {
                window.location.href = '/login.html';
            }, 100);
            return;
        }
        
        // Decode JWT to get role
        const payload = JSON.parse(atob(authToken.split('.')[1]));
        
        if (payload.role !== 'manager') {
            console.log('User is not a manager, redirecting to user dashboard...');
            setTimeout(() => {
                window.location.href = '/user-dashboard.html';
            }, 100);
            return;
        }
        
        console.log('Manager authenticated:', payload.email);
        
    } catch (error) {
        console.error('Authentication error:', error);
        setTimeout(() => {
            window.location.href = '/login.html';
        }, 100);
    }
}

// ============================================
// MANAGER DATA LOADING
// ============================================

async function loadManagerData() {
    try {
        const response = await fetch('/api/me', {
            headers: {
                'Authorization': `Bearer ${localStorage.getItem('authToken')}`
            }
        });
        
        if (!response.ok) {
            throw new Error('Failed to fetch manager data');
        }
        
        const data = await response.json();
        currentManager = data.user;
        
        // Update UI with manager data
        updateManagerUI();
        
    } catch (error) {
        console.error('Error loading manager data:', error);
        
        // Fallback to JWT data
        const authToken = localStorage.getItem('authToken');
        if (authToken) {
            const payload = JSON.parse(atob(authToken.split('.')[1]));
            currentManager = {
                email: payload.email,
                role: payload.role,
                name: payload.email.split('@')[0]
            };
            updateManagerUI();
        }
    }
}

function updateManagerUI() {
    const managerName = document.getElementById('managerName');
    const managerAvatar = document.getElementById('managerAvatar');
    
    const displayName = currentManager.name || currentManager.email.split('@')[0];
    
    if (managerName) {
        managerName.textContent = displayName.charAt(0).toUpperCase() + displayName.slice(1);
    }
    
    if (managerAvatar && currentManager.email) {
        managerAvatar.textContent = currentManager.email.charAt(0).toUpperCase();
    }
}

// ============================================
// ACTIVITY DATA LOADING
// ============================================

// ============================================
// HELPER FUNCTION: Fetch Engineer Emails
// ============================================

async function fetchEngineerEmails(authToken) {
    try {
        const response = await fetch('/api/manager/users', {
            headers: {
                'Authorization': `Bearer ${authToken}`
            }
        });

        if (!response.ok) {
            console.error('Failed to fetch engineer list');
            return [];
        }

        const data = await response.json();
        const engineers = data.users || [];
        
        // Extract emails of users with role 'engineer'
        return engineers
            .filter(user => user.role === 'engineer')
            .map(user => user.email);

    } catch (error) {
        console.error('Error fetching engineer emails:', error);
        return [];
    }
}

async function loadActivityData() {
    try {
        const authToken = localStorage.getItem('authToken');
        
        if (!authToken) {
            throw new Error('No authentication token');
        }
        
        // Show loading state
        showLoadingState();
        
        // Fetch activity logs
        const response = await fetch('/api/activity-log?limit=1000', {
    headers: {
        'Authorization': `Bearer ${authToken}`
    }
});

if (!response.ok) {
    throw new Error('Failed to fetch activity logs');
}

const data = await response.json();

// ✅ FILTER: Show ONLY engineer activities (exclude manager activities)
const engineerEmails = await fetchEngineerEmails(authToken);
allActivities = (data.logs || []).filter(log => 
    engineerEmails.includes(log.user_email)
);

filteredActivities = [...allActivities];

console.log('✅ Loaded', allActivities.length, 'engineer activities (managers excluded)');
        
        // Update all components
        updateKPIs();
        updateCharts();
        populateUserFilter();
        updateActivityTable();
        updateLastUpdated();
        
    } catch (error) {
        console.error('❌ Error loading activity data:', error);
        showToast('Failed to load activity data. Please refresh the page.', 'error');
    }
}

// ============================================
// KPI UPDATES
// ============================================

function updateKPIs() {
    // Total Activities
    document.getElementById('totalActivities').textContent = allActivities.length;
    
    // Active Users Today
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    
    const uniqueUsersToday = new Set(
        allActivities
            .filter(a => new Date(a.created_at) >= today)
            .map(a => a.user_email)
    ).size;
    
    document.getElementById('activeUsersToday').textContent = uniqueUsersToday;
    
    // Projects Modified (this week)
    const weekAgo = new Date();
    weekAgo.setDate(weekAgo.getDate() - 7);
    
    const projectsModified = new Set(
        allActivities
            .filter(a => 
                new Date(a.created_at) >= weekAgo && 
                a.activity_type === 'Project' &&
                a.project_name
            )
            .map(a => a.project_name)
    ).size;
    
    document.getElementById('projectsModified').textContent = projectsModified;
    
    // Failed Actions (last 7 days)
    const failedActions = allActivities.filter(a => 
        new Date(a.created_at) >= weekAgo && 
        a.status === 'failed'
    ).length;
    
    document.getElementById('failedActions').textContent = failedActions;
    
    // Update change indicators
    updateKPIChanges();
}

function updateKPIChanges() {
    const now = new Date();
    const yesterday = new Date(now);
    yesterday.setDate(yesterday.getDate() - 1);
    yesterday.setHours(0, 0, 0, 0);
    
    const today = new Date(now);
    today.setHours(0, 0, 0, 0);
    
    // Activities today vs yesterday
    const activitiesToday = allActivities.filter(a => new Date(a.created_at) >= today).length;
    const activitiesYesterday = allActivities.filter(a => {
        const date = new Date(a.created_at);
        return date >= yesterday && date < today;
    }).length;
    
    const activityChange = activitiesYesterday > 0 
        ? Math.round(((activitiesToday - activitiesYesterday) / activitiesYesterday) * 100)
        : (activitiesToday > 0 ? 100 : 0);
    
    updateKPIChange('totalActivitiesChange', activityChange, 'vs yesterday');
}

function updateKPIChange(elementId, percentageChange, label) {
    const element = document.getElementById(elementId);
    if (!element) return;
    
    element.classList.remove('positive', 'negative');
    
    let icon = 'fa-minus';
    let changeClass = '';
    let displayText = `No change`;
    
    if (percentageChange > 0) {
        icon = 'fa-arrow-up';
        changeClass = 'positive';
        displayText = `+${percentageChange}% ${label}`;
    } else if (percentageChange < 0) {
        icon = 'fa-arrow-down';
        changeClass = 'negative';
        displayText = `${percentageChange}% ${label}`;
    } else {
        displayText = `No change ${label}`;
    }
    
    if (changeClass) {
        element.classList.add(changeClass);
    }
    
    element.innerHTML = `<i class="fas ${icon}"></i> ${displayText}`;
}

// ============================================
// CHARTS
// ============================================

function updateCharts() {
    createActivityTrendChart();
    createActivityTypesChart();
}

// Activity Trend Chart (Last 30 Days - 1 Day = 1 Data Point)
function createActivityTrendChart() {
    const ctx = document.getElementById('activityTrendChart');
    if (!ctx) return;
    
    if (activityTrendChart) {
        activityTrendChart.destroy();
    }
    
    // Get last 30 days (1 day = 1 data point)
    const labels = [];
    const data = [];
    
    for (let i = 29; i >= 0; i--) {
        const date = new Date();
        date.setDate(date.getDate() - i);
        
        // Format label (e.g., "Jan 15")
        labels.push(date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' }));
        
        const dayStart = new Date(date.setHours(0, 0, 0, 0));
        const dayEnd = new Date(date.setHours(23, 59, 59, 999));
        
        const count = allActivities.filter(a => {
            const activityDate = new Date(a.created_at);
            return activityDate >= dayStart && activityDate <= dayEnd;
        }).length;
        
        data.push(count);
    }
    
    activityTrendChart = new Chart(ctx, {
        type: 'line',
        data: {
            labels: labels,
            datasets: [{
                label: 'Activities',
                data: data,
                borderColor: '#e74c3c',
                backgroundColor: 'rgba(231, 76, 60, 0.1)',
                tension: 0.3, // Slightly reduced tension for better visibility
                fill: true,
                pointBackgroundColor: '#e74c3c',
                pointBorderColor: '#fff',
                pointBorderWidth: 2,
                pointRadius: 3, // Smaller points to avoid clutter
                pointHoverRadius: 6,
                pointHoverBackgroundColor: '#c0392b',
                pointHoverBorderWidth: 3
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false, // Allow chart to fill container height
            plugins: {
                legend: {
                    display: true,
                    position: 'top',
                    labels: {
                        font: {
                            size: 12,
                            weight: '600'
                        }
                    }
                },
                tooltip: {
                    mode: 'index',
                    intersect: false,
                    backgroundColor: 'rgba(44, 62, 80, 0.95)',
                    padding: 12,
                    titleFont: {
                        size: 14,
                        weight: '700'
                    },
                    bodyFont: {
                        size: 13
                    },
                    callbacks: {
                        title: function(context) {
                            return context[0].label;
                        },
                        label: function(context) {
                            const count = context.parsed.y;
                            return `Activities: ${count}`;
                        }
                    }
                }
            },
            scales: {
                x: {
                    ticks: {
                        maxRotation: 45,
                        minRotation: 45,
                        font: {
                            size: 10
                        },
                        autoSkip: true,
                        maxTicksLimit: 15 // Show every other day to avoid overlap
                    },
                    grid: {
                        display: false
                    }
                },
                y: {
                    beginAtZero: true,
                    ticks: {
                        stepSize: 1,
                        font: {
                            size: 11
                        }
                    },
                    grid: {
                        color: 'rgba(0, 0, 0, 0.05)'
                    }
                }
            },
            interaction: {
                mode: 'nearest',
                axis: 'x',
                intersect: false
            }
        }
    });
}

// Activity Types Chart (Doughnut Chart)
function createActivityTypesChart() {
    const ctx = document.getElementById('activityTypesChart');
    if (!ctx) return;
    
    if (activityTypesChart) {
        activityTypesChart.destroy();
    }
    
    // Initialize category counts
    const typeCounts = {
        'Authentication': 0,
        'Project Operations': 0,
        'Simulations': 0,
        'Data Operations': 0
    };
    
    // Categorize activities
    allActivities.forEach(activity => {
        const action = (activity.action || '').toLowerCase();
        const activityType = (activity.activity_type || '').toLowerCase();
        const description = (activity.description || '').toLowerCase();
        
        // Authentication: Login, Logout, Password Reset
        if (action.includes('login') || action.includes('logout') || 
            action.includes('password') || activityType.includes('login') ||
            activityType.includes('authentication') || activityType.includes('auth')) {
            typeCounts['Authentication']++;
        }
        // Simulations: Job executions, Abaqus runs
        else if (action.includes('run') || action.includes('execute') || 
                 action.includes('simulation') || action.includes('job') ||
                 action.includes('abaqus') || activityType.includes('simulation')) {
            typeCounts['Simulations']++;
        }
        // Data Operations: Tydex generation, exports, uploads, file operations
        else if (action.includes('tydex') || action.includes('generate') ||
                 action.includes('export') || action.includes('upload') ||
                 action.includes('download') || action.includes('file') ||
                 description.includes('tydex') || activityType.includes('data')) {
            typeCounts['Data Operations']++;
        }
        // Project Operations: Create, update, delete, complete projects
        else if (action.includes('project') || activityType.includes('project') ||
                 action.includes('create') || action.includes('update') ||
                 action.includes('delete') || action.includes('complete') ||
                 action.includes('modify') || action.includes('archive')) {
            typeCounts['Project Operations']++;
        }
        // Default to Project Operations if uncategorized
        else {
            typeCounts['Project Operations']++;
        }
    });
    
    // Filter out categories with zero count
    const labels = [];
    const data = [];
    const colors = [];
    
    const colorMap = {
        'Authentication': '#3498db',        // Blue
        'Project Operations': '#27ae60',    // Green
        'Simulations': '#f39c12',           // Orange
        'Data Operations': '#9b59b6'        // Purple
    };
    
    Object.entries(typeCounts).forEach(([label, count]) => {
        if (count > 0) {
            labels.push(label);
            data.push(count);
            colors.push(colorMap[label]);
        }
    });
    
    // Handle no data case
    if (labels.length === 0) {
        const chartContainer = ctx.parentElement;
        chartContainer.innerHTML = `
            <div style="display: flex; flex-direction: column; align-items: center; justify-content: center; height: 300px; color: var(--text-secondary);">
                <i class="fas fa-chart-pie" style="font-size: 64px; opacity: 0.3; margin-bottom: 20px;"></i>
                <p style="font-size: 16px; font-weight: 600;">No Activity Data</p>
                <small style="font-size: 13px;">Activity types will appear here once logged</small>
            </div>
        `;
        return;
    }
    
    activityTypesChart = new Chart(ctx, {
        type: 'doughnut',
        data: {
            labels: labels,
            datasets: [{
                data: data,
                backgroundColor: colors,
                borderWidth: 3,
                borderColor: '#ffffff',
                hoverBorderWidth: 4,
                hoverOffset: 8
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: true,
            cutout: '65%',
            plugins: {
                legend: {
                    display: true,
                    position: 'bottom',
                    labels: {
                        padding: 15,
                        font: {
                            size: 13,
                            weight: '600',
                            family: "'Inter', sans-serif"
                        },
                        usePointStyle: true,
                        pointStyle: 'circle',
                        color: '#2c3e50',
                        generateLabels: function(chart) {
                            const data = chart.data;
                            if (data.labels.length && data.datasets.length) {
                                return data.labels.map((label, i) => {
                                    const value = data.datasets[0].data[i];
                                    const total = data.datasets[0].data.reduce((a, b) => a + b, 0);
                                    const percentage = ((value / total) * 100).toFixed(1);
                                    return {
                                        text: `${label} (${percentage}%)`,
                                        fillStyle: data.datasets[0].backgroundColor[i],
                                        hidden: false,
                                        index: i
                                    };
                                });
                            }
                            return [];
                        }
                    }
                },
                tooltip: {
                    backgroundColor: 'rgba(44, 62, 80, 0.95)',
                    padding: 14,
                    cornerRadius: 8,
                    titleFont: {
                        size: 15,
                        weight: '700'
                    },
                    bodyFont: {
                        size: 14,
                        weight: '500'
                    },
                    callbacks: {
                        label: function(context) {
                            const label = context.label || '';
                            const value = context.parsed || 0;
                            const total = context.dataset.data.reduce((a, b) => a + b, 0);
                            const percentage = ((value / total) * 100).toFixed(1);
                            return ` ${label}: ${value} (${percentage}%)`;
                        }
                    }
                }
            },
            animation: {
                animateRotate: true,
                animateScale: true,
                duration: 800
            }
        }
    });
    
    console.log('Activity Types Chart created:', typeCounts);
}

// Chart refresh functions
window.refreshActivityTrendChart = function() {
    createActivityTrendChart();
    showToast('Activity trend chart refreshed', 'success');
};

window.refreshActivityTypesChart = function() {
    console.log('Refreshing activity types chart...');
    console.log('Total activities:', allActivities.length);
    
    // Log sample activities for debugging
    if (allActivities.length > 0) {
        console.log('Sample activity:', {
            action: allActivities[0].action,
            activity_type: allActivities[0].activity_type,
            description: allActivities[0].description
        });
    }
    
    createActivityTypesChart();
    showToast('Activity types chart refreshed', 'success');
};

// ============================================
// FILTERS
// ============================================

function populateUserFilter() {
    const userFilter = document.getElementById('userFilter');
    if (!userFilter) return;
    
    // Get unique users
    const uniqueUsers = [...new Set(allActivities.map(a => a.user_email))].sort();
    
    // Clear existing options (except "All Users")
    userFilter.innerHTML = '<option value="all">All Users</option>';
    
    // Add user options
    uniqueUsers.forEach(email => {
        const option = document.createElement('option');
        option.value = email;
        option.textContent = email;
        userFilter.appendChild(option);
    });
}

function applyFilters() {
    const searchValue = document.getElementById('searchInput').value.toLowerCase();
    const dateRange = document.getElementById('dateRangeFilter').value;
    const userFilter = document.getElementById('userFilter').value;
    const activityTypeFilter = document.getElementById('activityTypeFilter').value;
    const statusFilter = document.getElementById('statusFilter').value;
    
    console.log('Applying filters:', { searchValue, dateRange, userFilter, activityTypeFilter, statusFilter });
    
    // Start with all activities
    filteredActivities = [...allActivities];
    
    // Apply search filter
    if (searchValue) {
        filteredActivities = filteredActivities.filter(activity => {
            const searchFields = [
                activity.user_email || '',
                activity.user_name || '',
                activity.action || '',
                activity.description || '',
                activity.project_name || '',
                activity.ip_address || '',
                activity.browser || ''
            ].map(field => String(field).toLowerCase());
            
            return searchFields.some(field => field.includes(searchValue));
        });
    }
    
    // Apply date range filter
    if (dateRange !== 'all') {
        const now = new Date();
        let startDate = null;
        let endDate = null;
        
        switch(dateRange) {
            case 'today':
                startDate = new Date(now);
                startDate.setHours(0, 0, 0, 0);
                endDate = new Date(now);
                endDate.setHours(23, 59, 59, 999);
                break;
                
            case 'yesterday':
                startDate = new Date(now);
                startDate.setDate(startDate.getDate() - 1);
                startDate.setHours(0, 0, 0, 0);
                endDate = new Date(startDate);
                endDate.setHours(23, 59, 59, 999);
                break;
                
            case 'last7days':
                startDate = new Date(now);
                startDate.setDate(startDate.getDate() - 7);
                startDate.setHours(0, 0, 0, 0);
                endDate = new Date(now);
                endDate.setHours(23, 59, 59, 999);
                break;
                
            case 'last30days':
                startDate = new Date(now);
                startDate.setDate(startDate.getDate() - 30);
                startDate.setHours(0, 0, 0, 0);
                endDate = new Date(now);
                endDate.setHours(23, 59, 59, 999);
                break;
                
            case 'custom':
                const customStart = document.getElementById('startDate').value;
                const customEnd = document.getElementById('endDate').value;
                if (customStart && customEnd) {
                    startDate = new Date(customStart);
                    startDate.setHours(0, 0, 0, 0);
                    endDate = new Date(customEnd);
                    endDate.setHours(23, 59, 59, 999);
                }
                break;
        }
        
        if (startDate && endDate) {
            filteredActivities = filteredActivities.filter(a => {
                const activityDate = new Date(a.created_at);
                return activityDate >= startDate && activityDate <= endDate;
            });
        }
    }
    
    // Apply user filter
    if (userFilter !== 'all') {
        filteredActivities = filteredActivities.filter(a => 
            a.user_email === userFilter
        );
    }
    
    // Apply activity type filter
    if (activityTypeFilter !== 'all') {
        filteredActivities = filteredActivities.filter(a => 
            a.activity_type === activityTypeFilter
        );
    }
    
    // Apply status filter
    if (statusFilter !== 'all') {
        filteredActivities = filteredActivities.filter(a => 
            a.status === statusFilter
        );
    }
    
    console.log(`Filtered ${filteredActivities.length} activities from ${allActivities.length} total`);
    
    // Reset to first page
    currentPage = 1;
    
    // Update table
    updateActivityTable();
    
    showToast(`Filters applied. Showing ${filteredActivities.length} activities.`, 'success');
}

function clearFilters() {
    // Reset all filter inputs to default values
    document.getElementById('searchInput').value = '';
    document.getElementById('dateRangeFilter').value = 'all';
    document.getElementById('userFilter').value = 'all';
    document.getElementById('activityTypeFilter').value = 'all';
    document.getElementById('statusFilter').value = 'all';
    
    // Hide custom date range
    const customDateRange = document.getElementById('customDateRange');
    if (customDateRange) {
        customDateRange.style.display = 'none';
        document.getElementById('startDate').value = '';
        document.getElementById('endDate').value = '';
    }
    
    // Reset filtered activities to all activities
    filteredActivities = [...allActivities];
    
    // Reset to first page
    currentPage = 1;
    
    // Update table
    updateActivityTable();
    
    console.log('Filters cleared, showing all activities:', allActivities.length);
    
    showToast('Filters cleared', 'info');
}

// ============================================
// ACTIVITY TABLE
// ============================================

function updateActivityTable() {
    const tbody = document.getElementById('activityTableBody');
    const tableInfo = document.getElementById('tableInfo');
    
    if (!tbody) return;
    
    // Calculate pagination
    totalPages = Math.ceil(filteredActivities.length / itemsPerPage);
    const startIndex = (currentPage - 1) * itemsPerPage;
    const endIndex = startIndex + itemsPerPage;
    const pageActivities = filteredActivities.slice(startIndex, endIndex);
    
    // Update table info
    if (tableInfo) {
        const showing = pageActivities.length;
        const total = filteredActivities.length;
        tableInfo.textContent = `Showing ${showing} of ${total} activities`;
    }
    
    // Check if no activities
    if (pageActivities.length === 0) {
    tbody.innerHTML = `
        <tr>
            <td colspan="8" class="loading-spinner">
                <i class="fas fa-inbox"></i>
                <p>No activities found</p>
            </td>
        </tr>
    `;
    updatePagination();
    return;
}
    
    // Generate table rows
    tbody.innerHTML = pageActivities.map(activity => {
    const statusClass = `status-${activity.status || 'success'}`;
    const time = formatDateTime(activity.created_at);
    const userName = activity.user_name || activity.user_email.split('@')[0];
    const projectName = activity.project_name || '-';
    const browser = activity.browser || 'Unknown';
    const ip = activity.ip_address || 'Unknown';
    
    return `
        <tr>
            <td>
                <span class="activity-id">ACT-${activity.id}</span>
            </td>
            <td>
                <span class="activity-time">${time}</span>
            </td>
            <td>
                <span class="activity-user">${escapeHtml(userName)}</span>
                <br>
                <small style="color: var(--text-light);">${escapeHtml(activity.user_email)}</small>
            </td>
            <td>
                <span class="activity-action">${escapeHtml(activity.action)}</span>
                ${activity.description ? `<br><small style="color: var(--text-secondary);">${escapeHtml(activity.description)}</small>` : ''}
            </td>
            <td>
                <span class="activity-project">${escapeHtml(projectName)}</span>
            </td>
            <td>
                <span class="activity-ip">${escapeHtml(ip)}</span>
            </td>
            <td>
                <span class="activity-browser">
                    ${getBrowserIcon(browser)} ${escapeHtml(browser)}
                </span>
            </td>
            <td>
                <span class="status-badge ${statusClass}">
                    ${activity.status ? activity.status.toUpperCase() : 'SUCCESS'}
                </span>
            </td>
        </tr>
    `;
}).join('');
    
    // Update pagination controls
    updatePagination();
}

function updatePagination() {
    const paginationInfo = document.getElementById('paginationInfo');
    const pageNumbers = document.getElementById('pageNumbers');
    const firstPageBtn = document.getElementById('firstPageBtn');
    const prevPageBtn = document.getElementById('prevPageBtn');
    const nextPageBtn = document.getElementById('nextPageBtn');
    const lastPageBtn = document.getElementById('lastPageBtn');
    
    // Update pagination info
    if (paginationInfo) {
        paginationInfo.textContent = `Page ${currentPage} of ${totalPages}`;
    }
    
    // Update button states
    if (firstPageBtn) firstPageBtn.disabled = currentPage === 1;
    if (prevPageBtn) prevPageBtn.disabled = currentPage === 1;
    if (nextPageBtn) nextPageBtn.disabled = currentPage === totalPages || totalPages === 0;
    if (lastPageBtn) lastPageBtn.disabled = currentPage === totalPages || totalPages === 0;
    
    // Generate page numbers
    if (pageNumbers) {
        pageNumbers.innerHTML = '';
        
        const maxPageButtons = 5;
        let startPage = Math.max(1, currentPage - Math.floor(maxPageButtons / 2));
        let endPage = Math.min(totalPages, startPage + maxPageButtons - 1);
        
        if (endPage - startPage < maxPageButtons - 1) {
            startPage = Math.max(1, endPage - maxPageButtons + 1);
        }
        
        for (let i = startPage; i <= endPage; i++) {
            const pageBtn = document.createElement('div');
            pageBtn.className = 'page-number' + (i === currentPage ? ' active' : '');
            pageBtn.textContent = i;
            pageBtn.onclick = () => goToPage(i);
            pageNumbers.appendChild(pageBtn);
        }
    }
}

function goToPage(page) {
    if (page < 1 || page > totalPages) return;
    currentPage = page;
    updateActivityTable();
}

function goToFirstPage() {
    goToPage(1);
}

function goToPreviousPage() {
    goToPage(currentPage - 1);
}

function goToNextPage() {
    goToPage(currentPage + 1);
}

function goToLastPage() {
    goToPage(totalPages);
}

function changeItemsPerPage() {
    const select = document.getElementById('itemsPerPage');
    itemsPerPage = parseInt(select.value);
    currentPage = 1;
    updateActivityTable();
}

// ============================================
// ACTIVITY DETAILS MODAL
// ============================================

async function viewActivityDetails(activityId) {
    const modal = document.getElementById('activityDetailsModal');
    const modalBody = document.getElementById('modalActivityDetails');
    
    if (!modal || !modalBody) return;
    
    // Show modal with loading state
    modal.classList.add('active');
    modalBody.innerHTML = `
        <div class="loading-spinner">
            <i class="fas fa-spinner fa-spin"></i>
            <p>Loading details...</p>
        </div>
    `;
    
    try {
        // Find activity in local data first
        const activity = allActivities.find(a => a.id === activityId);
        
        if (!activity) {
            throw new Error('Activity not found');
        }
        
        // Generate detailed view
        const metadata = activity.metadata ? JSON.parse(activity.metadata) : {};
        
        modalBody.innerHTML = `
            <div class="activity-detail-item">
                <div class="activity-detail-label">Activity ID</div>
                <div class="activity-detail-value">ACT-${activity.id}</div>
            </div>
            
            <div class="activity-detail-item">
                <div class="activity-detail-label">User</div>
                <div class="activity-detail-value">
                    <strong>${escapeHtml(activity.user_name || 'Unknown')}</strong><br>
                    <small>${escapeHtml(activity.user_email)}</small>
                </div>
            </div>
            
            <div class="activity-detail-item">
                <div class="activity-detail-label">Action</div>
                <div class="activity-detail-value">${escapeHtml(activity.action)}</div>
            </div>
            
            <div class="activity-detail-item">
                <div class="activity-detail-label">Activity Type</div>
                <div class="activity-detail-value">${escapeHtml(activity.activity_type || 'General')}</div>
            </div>
            
            ${activity.description ? `
                <div class="activity-detail-item">
                    <div class="activity-detail-label">Description</div>
                    <div class="activity-detail-value">${escapeHtml(activity.description)}</div>
                </div>
            ` : ''}
            
            ${activity.project_name ? `
                <div class="activity-detail-item">
                    <div class="activity-detail-label">Project</div>
                    <div class="activity-detail-value">${escapeHtml(activity.project_name)}</div>
                </div>
            ` : ''}
            
            <div class="activity-detail-item">
                <div class="activity-detail-label">Timestamp</div>
                <div class="activity-detail-value">${formatDateTime(activity.created_at)}</div>
            </div>
            
            <div class="activity-detail-item">
                <div class="activity-detail-label">IP Address</div>
                <div class="activity-detail-value">${escapeHtml(activity.ip_address || 'Unknown')}</div>
            </div>
            
            <div class="activity-detail-item">
                <div class="activity-detail-label">Browser</div>
                <div class="activity-detail-value">${getBrowserIcon(activity.browser)} ${escapeHtml(activity.browser || 'Unknown')}</div>
            </div>
            
            <div class="activity-detail-item">
                <div class="activity-detail-label">Device Type</div>
                <div class="activity-detail-value">${escapeHtml(activity.device_type || 'Unknown')}</div>
            </div>
            
            <div class="activity-detail-item">
                <div class="activity-detail-label">Status</div>
                <div class="activity-detail-value">
                    <span class="status-badge status-${activity.status || 'success'}">
                        ${activity.status ? activity.status.toUpperCase() : 'SUCCESS'}
                    </span>
                </div>
            </div>
            
            ${Object.keys(metadata).length > 0 ? `
                <div class="activity-detail-item">
                    <div class="activity-detail-label">Additional Metadata</div>
                    <div class="activity-detail-value">
                        <pre style="background: var(--bg-tertiary); padding: 10px; border-radius: 6px; font-size: 12px; overflow-x: auto;">${JSON.stringify(metadata, null, 2)}</pre>
                    </div>
                </div>
            ` : ''}
        `;
        
    } catch (error) {
        console.error('Error loading activity details:', error);
        modalBody.innerHTML = `
            <div style="text-align: center; padding: 40px; color: var(--danger-color);">
                <i class="fas fa-exclamation-circle" style="font-size: 48px; margin-bottom: 15px;"></i>
                <p>Failed to load activity details</p>
                <small>${error.message}</small>
            </div>
        `;
    }
}

// ============================================
// USER INFORMATION SIDEBAR
// ============================================

async function openUserInfoSidebar() {
    const sidebar = document.getElementById('userInfoSidebar');
    const overlay = document.getElementById('userInfoOverlay');
    const sidebarBody = document.getElementById('userInfoContent');
    
    if (!sidebar || !overlay || !sidebarBody) return;
    
    // Show sidebar with loading state
    sidebar.classList.add('active');
    overlay.classList.add('active');
    
    sidebarBody.innerHTML = `
        <div class="loading-spinner">
            <i class="fas fa-spinner fa-spin"></i>
            <p>Loading user information...</p>
        </div>
    `;
    
    try {
        // Fetch current user data from API
        const authToken = localStorage.getItem('authToken');
        
        if (!authToken) {
            throw new Error('No authentication token found');
        }
        
        const response = await fetch('/api/me', {
            headers: {
                'Authorization': `Bearer ${authToken}`
            }
        });
        
        if (!response.ok) {
            throw new Error('Failed to fetch user information');
        }
        
        const data = await response.json();

// Handle both old and new response formats
const user = data.user || data;

if (!user || !user.email) {
    throw new Error('User data not found');
}

// Format dates with more details
const accountCreated = user.created_at ? formatFullDateTime(user.created_at) : 'Not available';
const lastLogin = user.last_login ? formatFullDateTime(user.last_login) : 'Never logged in';

// Get user initials for avatar
const userName = user.name || user.email.split('@')[0];
const userInitial = userName.charAt(0).toUpperCase();

// Calculate account age display
let accountAgeDisplay = 'Just created';
if (user.account_age_days) {
    if (user.account_age_days >= 365) {
        const years = Math.floor(user.account_age_days / 365);
        accountAgeDisplay = `${years} year${years > 1 ? 's' : ''} old`;
    } else if (user.account_age_days >= 30) {
        const months = Math.floor(user.account_age_days / 30);
        accountAgeDisplay = `${months} month${months > 1 ? 's' : ''} old`;
    } else {
        accountAgeDisplay = `${user.account_age_days} day${user.account_age_days > 1 ? 's' : ''} old`;
    }
}

// Get project count display
const projectCountDisplay = user.project_count !== undefined 
    ? `${user.project_count} project${user.project_count !== 1 ? 's' : ''}` 
    : 'No projects';
        
        // Generate user info HTML
sidebarBody.innerHTML = `
    <div class="user-info-header">
        <div class="user-info-name">${escapeHtml(userName)}</div>
        <div class="user-info-subtitle">Manager Account</div>
    </div>
            
            <div class="user-info-grid">
                <div class="user-info-item">
                    <div class="user-info-label">
                        <i class="fas fa-id-card"></i>
                        User ID
                    </div>
                    <div class="user-info-value user-id">${escapeHtml(user.id)}</div>
                </div>
                
                <div class="user-info-item">
                    <div class="user-info-label">
                        <i class="fas fa-user"></i>
                        Full Name
                    </div>
                    <div class="user-info-value">${escapeHtml(userName)}</div>
                </div>
                
                <div class="user-info-item">
                    <div class="user-info-label">
                        <i class="fas fa-envelope"></i>
                        Email Address
                    </div>
                    <div class="user-info-value user-email">${escapeHtml(user.email)}</div>
                </div>
                
                <div class="user-info-item">
                    <div class="user-info-label">
                        <i class="fas fa-user-shield"></i>
                        Account Role
                    </div>
                    <div class="user-info-value user-role role-${user.role}">
                        ${user.role.charAt(0).toUpperCase() + user.role.slice(1)}
                    </div>
                </div>
                
                <div class="user-info-item">
                    <div class="user-info-label">
                        <i class="fas fa-calendar-plus"></i>
                        Account Created
                    </div>
                    <div class="user-info-value">${accountCreated}</div>
                </div>
                
                <div class="user-info-item">
                    <div class="user-info-label">
                        <i class="fas fa-clock"></i>
                        Last Login
                    </div>
                    <div class="user-info-value">${lastLogin}</div>
                </div>
            </div>
        `;
        
    } catch (error) {
        console.error('Error loading user information:', error);
        sidebarBody.innerHTML = `
            <div style="text-align: center; padding: 60px 20px; color: var(--danger-color);">
                <i class="fas fa-exclamation-circle" style="font-size: 48px; margin-bottom: 15px;"></i>
                <p style="font-size: 16px; font-weight: 600; margin-bottom: 8px;">Failed to load user information</p>
                <small style="font-size: 13px;">${escapeHtml(error.message)}</small>
            </div>
        `;
    }
}

function closeUserInfoSidebar() {
    const sidebar = document.getElementById('userInfoSidebar');
    const overlay = document.getElementById('userInfoOverlay');
    
    if (sidebar) {
        sidebar.classList.remove('active');
    }
    
    if (overlay) {
        overlay.classList.remove('active');
    }
}

// Helper function to format full date and time
function formatFullDateTime(dateString) {
    if (!dateString) return '-';
    
    const date = new Date(dateString);
    
    return date.toLocaleDateString('en-US', {
        weekday: 'short',
        year: 'numeric',
        month: 'short',
        day: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
        hour12: true
    });
}


function closeActivityDetailsModal() {
    const modal = document.getElementById('activityDetailsModal');
    if (modal) {
        modal.classList.remove('active');
    }
}

// ============================================
// EVENT LISTENERS
// ============================================

function initializeEventListeners() {
    // Logout button
    const logoutBtn = document.getElementById('logoutBtn');
    if (logoutBtn) {
        logoutBtn.addEventListener('click', handleLogout);
    }
    
    // Refresh button
    const refreshBtn = document.getElementById('refreshBtn');
    if (refreshBtn) {
        refreshBtn.addEventListener('click', handleRefresh);
    }

// User menu button
const userMenuBtn = document.getElementById('userMenuBtn');
if (userMenuBtn) {
    userMenuBtn.addEventListener('click', openUserInfoSidebar);
}
    
    // Apply filters button
    const applyFiltersBtn = document.getElementById('applyFiltersBtn');
    if (applyFiltersBtn) {
        applyFiltersBtn.addEventListener('click', applyFilters);
    }
    
    // Clear filters button
    const clearFiltersBtn = document.getElementById('clearFiltersBtn');
    if (clearFiltersBtn) {
        clearFiltersBtn.addEventListener('click', clearFilters);
    }
    
    // Date range filter change
    const dateRangeFilter = document.getElementById('dateRangeFilter');
    if (dateRangeFilter) {
        dateRangeFilter.addEventListener('change', handleDateRangeChange);
    }
    
    // Search input (real-time search with debounce)
    const searchInput = document.getElementById('searchInput');
    if (searchInput) {
        let searchTimeout;
        searchInput.addEventListener('input', () => {
            clearTimeout(searchTimeout);
            searchTimeout = setTimeout(applyFilters, 500);
        });
    }
    
    // Pagination buttons
    const firstPageBtn = document.getElementById('firstPageBtn');
    const prevPageBtn = document.getElementById('prevPageBtn');
    const nextPageBtn = document.getElementById('nextPageBtn');
    const lastPageBtn = document.getElementById('lastPageBtn');
    
    if (firstPageBtn) firstPageBtn.addEventListener('click', goToFirstPage);
    if (prevPageBtn) prevPageBtn.addEventListener('click', goToPreviousPage);
    if (nextPageBtn) nextPageBtn.addEventListener('click', goToNextPage);
    if (lastPageBtn) lastPageBtn.addEventListener('click', goToLastPage);
    
    // Items per page
    const itemsPerPageSelect = document.getElementById('itemsPerPage');
    if (itemsPerPageSelect) {
        itemsPerPageSelect.addEventListener('change', changeItemsPerPage);
    }
    
// User info overlay is handled by onclick in HTML
// No additional event listener needed  
// ESC key to close modals and sidebar
document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') {
        closeActivityDetailsModal();
        closeUserInfoSidebar();
    }
});
}

function handleDateRangeChange() {
    const dateRange = document.getElementById('dateRangeFilter').value;
    const customDateRange = document.getElementById('customDateRange');
    
    if (dateRange === 'custom') {
        customDateRange.style.display = 'block';
        // Don't auto-apply when switching to custom - wait for date selection
    } else {
        customDateRange.style.display = 'none';
        // Auto-apply filter when selecting predefined ranges
        applyFilters();
    }
}

async function handleRefresh() {
    const refreshBtn = document.getElementById('refreshBtn');
    
    try {
        if (refreshBtn) {
            refreshBtn.disabled = true;
            refreshBtn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Refreshing...';
        }
        
        await loadActivityData();
        
        showToast('Activity data refreshed successfully!', 'success');
        
    } catch (error) {
        console.error('Error refreshing:', error);
        showToast('Failed to refresh data', 'error');
    } finally {
        if (refreshBtn) {
            refreshBtn.disabled = false;
            refreshBtn.innerHTML = '<i class="fas fa-sync-alt"></i> Refresh';
        }
    }
}

function handleLogout() {
    if (confirm('Are you sure you want to logout?')) {
        stopAutoRefresh();
        localStorage.removeItem('userEmail');
        localStorage.removeItem('authToken');
        window.location.href = '/login.html';
    }
}

// ============================================
// UTILITY FUNCTIONS
// ============================================

function showLoadingState() {
    const tbody = document.getElementById('activityTableBody');
    if (tbody) {
        tbody.innerHTML = `
            <tr>
                <td colspan="9" class="loading-spinner">
                    <i class="fas fa-spinner fa-spin"></i>
                    <p>Loading activities...</p>
                </td>
            </tr>
        `;
    }
}

function updateLastUpdated() {
    const lastUpdated = document.getElementById('lastUpdated');
    if (lastUpdated) {
        const now = new Date();
        lastUpdated.textContent = now.toLocaleTimeString('en-US', { 
            hour: '2-digit', 
            minute: '2-digit',
            second: '2-digit'
        });
    }
}

function formatDateTime(dateString) {
    if (!dateString) return '-';
    
    const date = new Date(dateString);
    
    // ✅ Format as: "DD-MMM-YYYY HH:MM:SS AM/PM"
    const day = String(date.getDate()).padStart(2, '0');
    const month = date.toLocaleString('en-US', { month: 'short' });
    const year = date.getFullYear();
    
    let hours = date.getHours();
    const minutes = String(date.getMinutes()).padStart(2, '0');
    const seconds = String(date.getSeconds()).padStart(2, '0');
    const ampm = hours >= 12 ? 'PM' : 'AM';
    
    hours = hours % 12;
    hours = hours ? hours : 12; // Convert 0 to 12
    const hoursFormatted = String(hours).padStart(2, '0');
    
    return `${day}-${month}-${year} ${hoursFormatted}:${minutes}:${seconds} ${ampm}`;
}

function getBrowserIcon(browser) {
    if (!browser) return '<i class="fas fa-globe"></i>';
    
    const browserLower = browser.toLowerCase();
    
    if (browserLower.includes('chrome')) return '<i class="fab fa-chrome"></i>';
    if (browserLower.includes('firefox')) return '<i class="fab fa-firefox"></i>';
    if (browserLower.includes('safari')) return '<i class="fab fa-safari"></i>';
    if (browserLower.includes('edge')) return '<i class="fab fa-edge"></i>';
    if (browserLower.includes('opera')) return '<i class="fab fa-opera"></i>';
    if (browserLower.includes('internet explorer')) return '<i class="fab fa-internet-explorer"></i>';
    
    return '<i class="fas fa-globe"></i>';
}

function escapeHtml(text) {
    if (!text) return '';
    const map = {
        '&': '&amp;',
        '<': '&lt;',
        '>': '&gt;',
        '"': '&quot;',
        "'": '&#039;'
    };
    return String(text).replace(/[&<>"']/g, m => map[m]);
}

function showToast(message, type = 'info') {
    // Create toast element
    const toast = document.createElement('div');
    toast.style.cssText = `
        position: fixed;
        top: 20px;
        right: 20px;
        padding: 15px 20px;
        border-radius: 8px;
        color: white;
        font-weight: 600;
        z-index: 10000;
        display: flex;
        align-items: center;
        gap: 10px;
        box-shadow: 0 4px 12px rgba(0, 0, 0, 0.2);
        transition: opacity 0.3s;
        max-width: 400px;
    `;
    
    // Set background color based on type
    const colors = {
        'success': '#27ae60',
        'error': '#e74c3c',
        'warning': '#f39c12',
        'info': '#3498db'
    };
    
    toast.style.background = colors[type] || colors['info'];
    
    // Set icon
    const icons = {
        'success': 'fa-check-circle',
        'error': 'fa-exclamation-circle',
        'warning': 'fa-exclamation-triangle',
        'info': 'fa-info-circle'
    };
    
    toast.innerHTML = `
        <i class="fas ${icons[type] || icons['info']}"></i>
        <span>${message}</span>
    `;
    
    document.body.appendChild(toast);
    
    // Auto remove after 3 seconds
    setTimeout(() => {
        toast.style.opacity = '0';
        setTimeout(() => {
            if (document.body.contains(toast)) {
                document.body.removeChild(toast);
            }
        }, 300);
    }, 3000);
}

// ============================================
// GLOBAL WINDOW FUNCTIONS
// ============================================

window.viewActivityDetails = viewActivityDetails;
window.closeActivityDetailsModal = closeActivityDetailsModal;
window.openUserInfoSidebar = openUserInfoSidebar;
window.closeUserInfoSidebar = closeUserInfoSidebar;

// ============================================
// CONSOLE WELCOME MESSAGE
// ============================================

console.log('%c Activity Monitor Loaded! ', 'background: #e74c3c; color: white; font-size: 16px; font-weight: bold; padding: 10px;');
console.log('%c Real-time activity tracking and analytics ', 'font-size: 14px; color: #2c3e50;');

// ============================================
// END OF ACTIVITY MONITOR JAVASCRIPT
// ============================================