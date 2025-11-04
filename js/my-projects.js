// ============================================
// MY PROJECTS - JavaScript
// ============================================

// Global Variables
let currentUser = null;
let allProjects = [];
let filteredProjects = [];
let currentView = 'grid';
let currentPage = 1;
const itemsPerPage = 12;
let selectedProjectForDelete = null;
let showArchived = false; // Track if showing archived projects

// ============================================
// INITIALIZATION
// ============================================

document.addEventListener('DOMContentLoaded', async function() {
    console.log('My Projects page initializing...');
    
    // Check authentication
    await checkAuthentication();
    
    // Load user data
    await loadUserData();
    
    // Load projects
    await loadProjects();
    
    // Initialize event listeners
    initializeEventListeners();

    // ✅ Initialize charts (ADD THIS)
    if (typeof Chart !== 'undefined') {
        initializeCharts();
    }

    
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
        const userEmail = localStorage.getItem('userEmail');
        const authToken = localStorage.getItem('authToken');
        
        // Fetch user data from database
        let fetchedName = null;
        let fetchedRole = null;
        
        if (authToken) {
            try {
                const response = await fetch('/api/me', {
                    headers: {
                        'Authorization': `Bearer ${authToken}`
                    }
                });
                
                if (response.ok) {
                    const data = await response.json();
                    if (data.user) {
                        fetchedName = data.user.name;
                        fetchedRole = data.user.role;
                        
                        // Store in localStorage for future use
                        if (fetchedName) {
                            localStorage.setItem('userName', fetchedName);
                        }
                        if (fetchedRole) {
                            localStorage.setItem('userRole', fetchedRole);
                        }
                    }
                }
            } catch (fetchError) {
                console.warn('Could not fetch user data from API, using localStorage fallback:', fetchError);
            }
        }
        
        // Fallback to localStorage if API fetch failed
        const userName = fetchedName || localStorage.getItem('userName') || 'User';
        const userRole = fetchedRole || localStorage.getItem('userRole') || 'Engineer';
        
        currentUser = {
            email: userEmail,
            name: userName,
            role: userRole
        };
        
        console.log('✅ Loaded user data:', currentUser);
        
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
        
        // Update user avatar with initials if name is available
        updateUserAvatar(currentUser.name);
        
    } catch (error) {
        console.error('Error loading user data:', error);
        // Set fallback values
        currentUser = {
            email: localStorage.getItem('userEmail') || '',
            name: 'User',
            role: 'Engineer'
        };
    }
}

// Helper function to update user avatar with initials
function updateUserAvatar(name) {
    if (!name || name === 'User') return;
    
    const avatarElements = [
        document.getElementById('userAvatar'),
        document.querySelector('.user-avatar-small')
    ];
    
    // Get initials from name
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

async function loadProjects() {
    try {
        showLoading(true);
        
        const authToken = localStorage.getItem('authToken');
        
        if (!authToken) {
            throw new Error('No authentication token');
        }
        
        // Fetch projects from database via API
        const response = await fetch('/api/projects', {
            headers: {
                'Authorization': `Bearer ${authToken}`
            }
        });
        
        if (!response.ok) {
            const errorText = await response.text();
            console.error('API Error:', errorText);
            throw new Error('Failed to fetch projects: ' + errorText);
        }

        let data = await response.json();

        // Handle different API response formats
        let projects;
        if (Array.isArray(data)) {
            projects = data;
        } else if (data.projects && Array.isArray(data.projects)) {
            projects = data.projects;
        } else if (data.success && Array.isArray(data.data)) {
            projects = data.data;
        } else {
            console.error('Unexpected API response format:', data);
            projects = [];
        }

        // Filter projects for current user
        const userEmail = (localStorage.getItem('userEmail') || '').toLowerCase().trim();
        console.log('🔍 Filtering for user email:', userEmail);

        // Process projects with status preservation
        allProjects = projects
            .filter(p => (p.user_email || '').toLowerCase().trim() === userEmail)
            .map(project => {
                // Preserve "In Progress" status from session storage
                if (project.project_name === sessionStorage.getItem('currentProject')) {
                    const savedStatus = sessionStorage.getItem('currentProjectStatus');
                    if (savedStatus === 'In Progress') {
                        return {
                            ...project,
                            status: 'In Progress',
                            status_updated_at: new Date().toISOString()
                        };
                    }
                }
                return project;
            })
            .sort((a, b) => new Date(b.created_at) - new Date(a.created_at));

        console.log(`✅ Loaded and processed ${allProjects.length} projects for user ${userEmail}`);
        
        // Log status distribution
        const statusCounts = allProjects.reduce((acc, p) => {
            const status = p.status || 'Unknown';
            acc[status] = (acc[status] || 0) + 1;
            return acc;
        }, {});
        console.log('📊 Project Status Distribution:', statusCounts);
        
        // Update filtered projects
        filteredProjects = [...allProjects];
        
        // Update UI
        showLoading(false);
        updateStats();
        displayProjects();
        
        // Log activity
        try {
            await fetch('/api/activity-log', {
                method: 'POST',
                headers: {
                    'Authorization': `Bearer ${authToken}`,
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({
                    activity_type: 'Projects',
                    action: 'Projects Loaded',
                    description: `Loaded ${allProjects.length} projects`,
                    status: 'success',
                    metadata: {
                        total_projects: allProjects.length,
                        status_distribution: statusCounts,
                        timestamp: new Date().toISOString()
                    }
                })
            });
        } catch (logError) {
            console.warn('Failed to log activity:', logError);
        }
        
    } catch (error) {
        console.error('❌ Error loading projects:', error);
        showLoading(false);
        
        const emptyState = document.getElementById('emptyState');
        if (emptyState) {
            emptyState.style.display = 'block';
            emptyState.innerHTML = `
                <div class="empty-icon">
                    <i class="fas fa-exclamation-circle"></i>
                </div>
                <h3>Failed to Load Projects</h3>
                <p>${error.message}</p>
                <button class="btn btn-primary" onclick="window.location.reload()">
                    <i class="fas fa-redo"></i> Retry
                </button>
            `;
        }
        
        allProjects = [];
        filteredProjects = [];
        updateStats();

        // Log error
        try {
            await fetch('/api/activity-log', {
                method: 'POST',
                headers: {
                    'Authorization': `Bearer ${localStorage.getItem('authToken')}`,
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({
                    activity_type: 'Projects',
                    action: 'Projects Load Failed',
                    description: `Failed to load projects: ${error.message}`,
                    status: 'error',
                    metadata: {
                        error_message: error.message,
                        timestamp: new Date().toISOString()
                    }
                })
            });
        } catch (logError) {
            console.warn('Failed to log error:', logError);
        }
    }
}

// ============================================
// DISPLAY FUNCTIONS
// ============================================

function showLoading(show) {
    const loadingContainer = document.getElementById('loadingContainer');
    const emptyState = document.getElementById('emptyState');
    const projectsGrid = document.getElementById('projectsGrid');
    const projectsListView = document.getElementById('projectsListView');
    
    if (show) {
        loadingContainer.style.display = 'block';
        emptyState.style.display = 'none';
        projectsGrid.style.display = 'none';
        projectsListView.style.display = 'none';
    } else {
        loadingContainer.style.display = 'none';
    }
}

function updateStats() {
    const stats = {
        total: allProjects.length,
        completed: allProjects.filter(p => p.status === 'Completed').length,
        inProgress: allProjects.filter(p => p.status === 'In Progress').length,
        notStarted: allProjects.filter(p => p.status === 'Not Started').length
    };
    
    document.getElementById('totalProjectsCount').textContent = stats.total;
    document.getElementById('completedCount').textContent = stats.completed;
    document.getElementById('inProgressCount').textContent = stats.inProgress;
    document.getElementById('notStartedCount').textContent = stats.notStarted;
}

function displayProjects() {
    const emptyState = document.getElementById('emptyState');
    const projectsGrid = document.getElementById('projectsGrid');
    const projectsListView = document.getElementById('projectsListView');
    const displayCount = document.getElementById('displayCount');
    
    displayCount.textContent = filteredProjects.length;
    
    if (filteredProjects.length === 0) {
        emptyState.style.display = 'block';
        projectsGrid.style.display = 'none';
        projectsListView.style.display = 'none';
        return;
    }
    
    emptyState.style.display = 'none';
    
    if (currentView === 'grid') {
        displayGridView();
    } else {
        displayListView();
    }
    
    updatePagination();
}

function displayGridView() {
    const projectsGrid = document.getElementById('projectsGrid');
    const projectsListView = document.getElementById('projectsListView');
    
    projectsGrid.style.display = 'grid';
    projectsListView.style.display = 'none';
    
    const startIndex = (currentPage - 1) * itemsPerPage;
    const endIndex = startIndex + itemsPerPage;
    const projectsToDisplay = filteredProjects.slice(startIndex, endIndex);

    projectsGrid.innerHTML = projectsToDisplay.map(project => {
    const statusClass = getStatusClass(project.status);
    const isArchived = project.status === 'Archived';
    
    // Calculate project duration
    let durationText = '';
    if (project.completed_at && project.created_at) {
        const start = new Date(project.created_at);
        const end = new Date(project.completed_at);
        const durationMs = end - start;
        const days = Math.floor(durationMs / (1000 * 60 * 60 * 24));
        const hours = Math.floor((durationMs % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60));
        durationText = `<div class="project-duration"><i class="fas fa-hourglass-half"></i> Duration: ${days}d ${hours}h</div>`;
    }
    
    return `
        <div class="project-card ${isArchived ? 'archived-card' : ''}" onclick="viewProjectDetails(${project.id})">
            <div class="project-card-checkbox">
                <input type="checkbox" class="project-checkbox" data-id="${project.id}" onclick="event.stopPropagation(); handleCheckboxChange()">
            </div>
            
            <!-- Kebab Menu -->
            <div class="project-kebab-menu" onclick="event.stopPropagation();">
                <button class="kebab-btn" onclick="toggleKebabMenu(${project.id})">
                    <i class="fas fa-ellipsis-v"></i>
                </button>
                <div class="kebab-dropdown" id="kebab-${project.id}" style="display: none;">
    ${!isArchived ? `
        <button onclick="markAsComplete(${project.id})">
            <i class="fas fa-check-circle"></i> Mark as Complete
        </button>
        <button onclick="markAsArchived(${project.id})">
            <i class="fas fa-archive"></i> Archive Project
        </button>
    ` : `
        <button onclick="unarchiveProject(${project.id})">
            <i class="fas fa-folder-open"></i> Unarchive Project
        </button>
    `}
    <button onclick="showRenameModal(${project.id}, '${escapeHtml(project.project_name)}')">
        <i class="fas fa-pen"></i> Rename Project
    </button>
</div>
            </div>
            
            <div class="project-card-header">
    <span class="project-id">${formatProjectId(project.id, project.created_at)}</span>
    <span class="project-status ${statusClass}">${project.status}</span>
</div>
            <h3 class="project-name">${escapeHtml(project.project_name)}</h3>
            <div class="project-meta">
                <div class="meta-item">
                    <i class="fas fa-layer-group"></i>
                    <span>${project.protocol}</span>
                </div>
                <div class="meta-item">
                    <i class="fas fa-globe"></i>
                    <span>${project.region}</span>
                </div>
                <div class="meta-item">
                    <i class="fas fa-building"></i>
                    <span>${project.department}</span>
                </div>
                <div class="meta-item">
                    <i class="fas fa-ruler"></i>
                    <span>Size: ${project.tyre_size}"</span>
                </div>
            </div>
            <div class="project-dates">
                <i class="fas fa-calendar"></i> Created: ${formatDate(project.created_at)}
                ${project.completed_at ? `<br><i class="fas fa-check-circle"></i> Completed: ${formatDate(project.completed_at)}` : ''}
                ${durationText}
            </div>
            <div class="project-actions" onclick="event.stopPropagation()">
    ${project.status === 'Completed' ? `
        <!-- Completed Projects: View + Delete -->
        <button class="action-btn btn-view" onclick="viewProject(${project.id})">
            <i class="fas fa-eye"></i> View
        </button>
    ` : `
        <!-- Not Started / In Progress: Edit + Delete -->
        <button class="action-btn btn-edit" onclick="editProject(${project.id})">
            <i class="fas fa-edit"></i> Edit
        </button>
    `}
    <button class="action-btn btn-delete" onclick="confirmDelete(${project.id})">
        <i class="fas fa-trash"></i> Delete
    </button>
</div>
        </div>
    `;
}).join('');
}

function displayListView() {
    const projectsGrid = document.getElementById('projectsGrid');
    const projectsListView = document.getElementById('projectsListView');
    const projectsTableBody = document.getElementById('projectsTableBody');
    
    projectsGrid.style.display = 'none';
    projectsListView.style.display = 'block';
    
    const startIndex = (currentPage - 1) * itemsPerPage;
    const endIndex = startIndex + itemsPerPage;
    const projectsToDisplay = filteredProjects.slice(startIndex, endIndex);
    
    projectsTableBody.innerHTML = projectsToDisplay.map(project => `
        <tr onclick="viewProjectDetails(${project.id})">
    <td><strong>${formatProjectId(project.id, project.created_at)}</strong></td>
            <td>
    ${escapeHtml(project.project_name)}
    <i class="fas fa-pen rename-icon-small" onclick="event.stopPropagation(); showRenameModal(${project.id}, '${escapeHtml(project.project_name)}')" title="Rename"></i>
</td>
            <td>${project.protocol}</td>
            <td>${project.region}</td>
            <td>${project.department}</td>
            <td>${project.tyre_size}"</td>
            <td><span class="project-status ${getStatusClass(project.status)}">${project.status}</span></td>
            <td>${formatDate(project.created_at)}</td>
            <td onclick="event.stopPropagation()">
    <div class="table-actions">
        ${project.status === 'Completed' ? `
            <!-- Completed Projects: View + Delete -->
            <button class="icon-btn btn-view" onclick="viewProject(${project.id})" title="View">
                <i class="fas fa-eye"></i>
            </button>
        ` : `
            <!-- Not Started / In Progress: Edit + Delete -->
            <button class="icon-btn btn-edit" onclick="editProject(${project.id})" title="Edit">
                <i class="fas fa-edit"></i>
            </button>
        `}
        <button class="icon-btn btn-delete" onclick="confirmDelete(${project.id})" title="Delete">
            <i class="fas fa-trash"></i>
        </button>
    </div>
</td>
        </tr>
    `).join('');
}

// ============================================
// PAGINATION
// ============================================
function updatePagination() {
    const totalPages = Math.ceil(filteredProjects.length / itemsPerPage);
    const paginationContainer = document.getElementById('paginationContainer');
    const prevBtn = document.getElementById('prevPageBtn');
    const nextBtn = document.getElementById('nextPageBtn');
    const currentPageSpan = document.getElementById('currentPage');
    const totalPagesSpan = document.getElementById('totalPages');
    const showingRange = document.getElementById('showingRange');
    const totalItems = document.getElementById('totalItems');
    
    if (filteredProjects.length === 0 || totalPages <= 1) {
        paginationContainer.style.display = 'none';
        return;
    }
    
    paginationContainer.style.display = 'flex';
    
    // Update pagination info
    currentPageSpan.textContent = currentPage;
    totalPagesSpan.textContent = totalPages;
    totalItems.textContent = filteredProjects.length;
    
    const startIndex = (currentPage - 1) * itemsPerPage + 1;
    const endIndex = Math.min(currentPage * itemsPerPage, filteredProjects.length);
    showingRange.textContent = `${startIndex}-${endIndex}`;
    
    // Update button states
    prevBtn.disabled = currentPage === 1;
    nextBtn.disabled = currentPage === totalPages;
}

function goToPage(page) {
    const totalPages = Math.ceil(filteredProjects.length / itemsPerPage);
    
    if (page < 1 || page > totalPages) return;
    
    currentPage = page;
    displayProjects();
    
    // Scroll to top
    window.scrollTo({ top: 0, behavior: 'smooth' });
}

// ============================================
// FILTER & SEARCH
// ============================================

function applyFilters() {
    const searchQuery = document.getElementById('searchInput').value.toLowerCase();
    const statusFilter = document.getElementById('statusFilter').value;
    const protocolFilter = document.getElementById('protocolFilter').value;
    const regionFilter = document.getElementById('regionFilter').value;
    const departmentFilter = document.getElementById('departmentFilter').value;
    const sortBy = document.getElementById('sortBy').value;
    
    // Start with all projects
    filteredProjects = showArchived 
        ? allProjects.filter(p => p.status === 'Archived')
        : allProjects.filter(p => p.status !== 'Archived');
    
    // Apply search filter
    if (searchQuery) {
        filteredProjects = filteredProjects.filter(project => 
            project.project_name.toLowerCase().includes(searchQuery) ||
            project.id.toString().includes(searchQuery) ||
            project.protocol.toLowerCase().includes(searchQuery)
        );
    }
    
    // Apply status filter
    if (statusFilter !== 'all') {
        filteredProjects = filteredProjects.filter(p => p.status === statusFilter);
    }
    
    // Apply protocol filter
    if (protocolFilter !== 'all') {
        filteredProjects = filteredProjects.filter(p => p.protocol === protocolFilter);
    }
    
    // Apply region filter
    if (regionFilter !== 'all') {
        filteredProjects = filteredProjects.filter(p => p.region === regionFilter);
    }
    
    // Apply department filter
    if (departmentFilter !== 'all') {
        filteredProjects = filteredProjects.filter(p => p.department === departmentFilter);
    }
    
    // Apply sorting
    applySorting(sortBy);
    
    // Reset to first page
    currentPage = 1;
    
    // Update display
    displayProjects();
}

function applySorting(sortBy) {
    switch (sortBy) {
        case 'created_at_desc':
            filteredProjects.sort((a, b) => new Date(b.created_at) - new Date(a.created_at));
            break;
        case 'created_at_asc':
            filteredProjects.sort((a, b) => new Date(a.created_at) - new Date(b.created_at));
            break;
        case 'name_asc':
            filteredProjects.sort((a, b) => a.project_name.localeCompare(b.project_name));
            break;
        case 'name_desc':
            filteredProjects.sort((a, b) => b.project_name.localeCompare(a.project_name));
            break;
        case 'status_asc':
            filteredProjects.sort((a, b) => a.status.localeCompare(b.status));
            break;
        default:
            break;
    }
}

function resetFilters() {
    document.getElementById('searchInput').value = '';
    document.getElementById('statusFilter').value = 'all';
    document.getElementById('protocolFilter').value = 'all';
    document.getElementById('regionFilter').value = 'all';
    document.getElementById('departmentFilter').value = 'all';
    document.getElementById('sortBy').value = 'created_at_desc';
    
    applyFilters();
}

// ============================================
// VIEW TOGGLE
// ============================================

function toggleView(view) {
    currentView = view;
    
    const gridBtn = document.getElementById('gridViewBtn');
    const listBtn = document.getElementById('listViewBtn');
    
    if (view === 'grid') {
        gridBtn.classList.add('active');
        listBtn.classList.remove('active');
    } else {
        gridBtn.classList.remove('active');
        listBtn.classList.add('active');
    }
    
    displayProjects();
}

// ============================================
// PROJECT ACTIONS
// ============================================
async function viewProject(projectId) {
    const project = allProjects.find(p => p.id === projectId);
    
    if (!project) {
        showToast('Project not found', 'error');
        return;
    }
    
    const status = (project.status || '').trim().toLowerCase();
    const protocol = (project.protocol || '').trim();
    
    console.log('🚀 Opening project:', {
        id: projectId,
        name: project.project_name,
        status: status,
        protocol: protocol
    });
    
    // Store project context
    sessionStorage.setItem('currentProject', project.project_name);
    sessionStorage.setItem('currentProjectId', String(projectId));
    localStorage.setItem('currentProjectName', project.project_name);
    
    let targetPage = '';
    
    // Route based on status
    if (status === 'in progress' || status === 'in-progress' || status === 'in_progress') {
        // In Progress → go to select.html with matrix and previous tydex files
        targetPage = `/select.html?projectId=${projectId}`;
        console.log('→ Navigating to select.html (In Progress)');
    } 
    else if (status === 'completed') {
        // Completed → go to select.html (read-only mode with all tydex files)
        targetPage = `/select.html?projectId=${projectId}`;
        console.log('→ Navigating to select.html (Completed)');
    } 
    else {
        // Not Started → go to protocol input page
        switch (protocol) {
            case 'MF62':
            case 'MF6.2':
                targetPage = `/mf.html?projectId=${projectId}`;
                break;
            case 'MF52':
            case 'MF5.2':
                targetPage = `/mf52.html?projectId=${projectId}`;
                break;
            case 'FTire':
                targetPage = `/ftire.html?projectId=${projectId}`;
                break;
            case 'CDTire':
                targetPage = `/cdtire.html?projectId=${projectId}`;
                break;
            case 'Custom':
                targetPage = `/custom.html?projectId=${projectId}`;
                break;
            default:
                // Fallback to select.html if protocol unknown
                targetPage = `/select.html?projectId=${projectId}`;
                console.warn('⚠ Unknown protocol, fallback to select.html');
        }
        console.log('→ Navigating to protocol input page (Not Started)');

        // ✅ ADD THIS CODE:
// Log project open
try {
    await fetch('/api/activity-log', {
        method: 'POST',
        headers: {
            'Authorization': `Bearer ${localStorage.getItem('authToken')}`,
            'Content-Type': 'application/json'
        },
        body: JSON.stringify({
            activity_type: 'Project',
            action: 'Project Opened',
            description: `Opened project "${project.project_name}" (Status: ${status})`,
            status: 'success',
            metadata: {
                project_id: projectId,
                project_name: project.project_name,
                status: status,
                protocol: project.protocol
            }
        })
    });
} catch (logError) {
    console.warn('Failed to log activity:', logError);
}
    }
    
    window.location.href = targetPage;
}

function editProject(projectId) {
    // Same as view but could have edit mode enabled
    viewProject(projectId);
}

function viewProjectDetails(projectId) {
    const project = allProjects.find(p => p.id === projectId);
    
    if (!project) {
        showToast('Project not found', 'error');
        return;
    }
    
    const modal = document.getElementById('projectModal');
    const modalBody = document.getElementById('modalBody');
    const viewProjectBtn = document.getElementById('viewProjectBtn');
    
    modalBody.innerHTML = `
        <div class="detail-grid">
            <div class="detail-item">
    <span class="detail-label">Project ID</span>
    <span class="detail-value">${formatProjectId(project.id, project.created_at)}</span>
</div>
            <div class="detail-item">
                <span class="detail-label">Status</span>
                <span class="detail-value">
                    <span class="project-status ${getStatusClass(project.status)}">${project.status}</span>
                </span>
            </div>
            <div class="detail-item">
                <span class="detail-label">Project Name</span>
                <span class="detail-value">${escapeHtml(project.project_name)}</span>
            </div>
            <div class="detail-item">
                <span class="detail-label">Protocol</span>
                <span class="detail-value">${project.protocol}</span>
            </div>
            <div class="detail-item">
                <span class="detail-label">Region</span>
                <span class="detail-value">${project.region}</span>
            </div>
            <div class="detail-item">
                <span class="detail-label">Department</span>
                <span class="detail-value">${project.department}</span>
            </div>
            <div class="detail-item">
                <span class="detail-label">Tyre Size</span>
                <span class="detail-value">${project.tyre_size}"</span>
            </div>
            <div class="detail-item">
                <span class="detail-label">Created At</span>
                <span class="detail-value">${formatDateTime(project.created_at)}</span>
            </div>
            ${project.completed_at ? `
                <div class="detail-item">
                    <span class="detail-label">Completed At</span>
                    <span class="detail-value">${formatDateTime(project.completed_at)}</span>
                </div>
            ` : ''}
            <div class="detail-item">
                <span class="detail-label">User Email</span>
                <span class="detail-value">${project.user_email || 'N/A'}</span>
            </div>
        </div>
    `;
    
    viewProjectBtn.onclick = () => {
        closeModal();
        viewProject(projectId);
    };
    
    modal.classList.add('active');
}

function confirmDelete(projectId) {
    const project = allProjects.find(p => p.id === projectId);
    
    if (!project) {
        showToast('Project not found', 'error');
        return;
    }
    
    selectedProjectForDelete = project;
    
    const deleteModal = document.getElementById('deleteModal');
    const deleteProjectName = document.getElementById('deleteProjectName');
    
    deleteProjectName.textContent = project.project_name;
    deleteModal.classList.add('active');
}

async function deleteProject() {
    if (!selectedProjectForDelete) return;
    
    try {
        // Call API to delete project
        const response = await fetch(`/api/projects/${selectedProjectForDelete.id}`, {
            method: 'DELETE',
            headers: {
                'Authorization': `Bearer ${localStorage.getItem('authToken')}`,
                'Content-Type': 'application/json'
            }
        });
        
        const result = await response.json();
        
        if (!response.ok) {
            throw new Error(result.message || 'Failed to delete project');
        }
        
        showToast('Project deleted successfully', 'success');

        // ✅ ADD THIS CODE:
// Log project deletion
try {
    await fetch('/api/activity-log', {
        method: 'POST',
        headers: {
            'Authorization': `Bearer ${localStorage.getItem('authToken')}`,
            'Content-Type': 'application/json'
        },
        body: JSON.stringify({
            activity_type: 'Project',
            action: 'Project Deleted',
            description: `Deleted project "${selectedProjectForDelete.project_name}" (ID: ${selectedProjectForDelete.id})`,
            status: 'success',
            metadata: {
                project_id: selectedProjectForDelete.id,
                project_name: selectedProjectForDelete.project_name
            }
        })
    });
} catch (logError) {
    console.warn('Failed to log activity:', logError);
}
        
        // Remove from local array
        allProjects = allProjects.filter(p => p.id !== selectedProjectForDelete.id);
        applyFilters();
        updateStats();
        
        closeDeleteModal();
        
    } catch (error) {
        console.error('Error deleting project:', error);
        showToast(`Failed to delete project: ${error.message}`, 'error');
    }
}

// ============================================
// RENAME PROJECT
// ============================================

let projectToRename = null;

function showRenameModal(projectId, currentName) {
    projectToRename = allProjects.find(p => p.id === projectId);
    
    if (!projectToRename) {
        showToast('Project not found', 'error');
        return;
    }
    
    const renameModal = document.getElementById('renameModal');
    const newProjectNameInput = document.getElementById('newProjectName');
    
    newProjectNameInput.value = currentName;
    renameModal.classList.add('active');
    
    // Focus and select text
    setTimeout(() => {
        newProjectNameInput.focus();
        newProjectNameInput.select();
    }, 100);
}

function closeRenameModal() {
    const renameModal = document.getElementById('renameModal');
    renameModal.classList.remove('active');
    projectToRename = null;
    document.getElementById('newProjectName').value = '';
}

async function renameProject() {
    if (!projectToRename) return;
    
    const newName = document.getElementById('newProjectName').value.trim();
    
    if (!newName) {
        showToast('Please enter a project name', 'warning');
        return;
    }
    
    if (newName === projectToRename.project_name) {
        showToast('Name unchanged', 'info');
        closeRenameModal();
        return;
    }
    
    try {
        const response = await fetch(`/api/projects/${projectToRename.id}/name`, {
            method: 'PATCH',
            headers: {
                'Authorization': `Bearer ${localStorage.getItem('authToken')}`,
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({ project_name: newName })
        });
        
        const result = await response.json();
        
        if (!response.ok || !result.success) {
            throw new Error(result.message || 'Failed to rename project');
        }
        
        showToast('Project renamed successfully', 'success');

        // ✅ ADD THIS CODE:
// Log project rename
try {
    await fetch('/api/activity-log', {
        method: 'POST',
        headers: {
            'Authorization': `Bearer ${localStorage.getItem('authToken')}`,
            'Content-Type': 'application/json'
        },
        body: JSON.stringify({
            activity_type: 'Project',
            action: 'Project Renamed',
            description: `Renamed project from "${projectToRename.project_name}" to "${newName}"`,
            status: 'success',
            metadata: {
                project_id: projectToRename.id,
                old_name: projectToRename.project_name,
                new_name: newName
            }
        })
    });
} catch (logError) {
    console.warn('Failed to log activity:', logError);
}

        
        // Update local data
        const projectIndex = allProjects.findIndex(p => p.id === projectToRename.id);
        if (projectIndex !== -1) {
            allProjects[projectIndex].project_name = newName;
        }
        
        applyFilters();
        closeRenameModal();
        
    } catch (error) {
        console.error('Error renaming project:', error);
        showToast(`Failed to rename project: ${error.message}`, 'error');
    }
}

// Make functions globally accessible
window.showRenameModal = showRenameModal;
window.closeRenameModal = closeRenameModal;
window.renameProject = renameProject;


// ============================================
// KEBAB MENU FUNCTIONS
// ============================================

function toggleKebabMenu(projectId) {
    // Close all other menus
    document.querySelectorAll('.kebab-dropdown').forEach(menu => {
        if (menu.id !== `kebab-${projectId}`) {
            menu.style.display = 'none';
        }
    });
    
    // Toggle current menu
    const menu = document.getElementById(`kebab-${projectId}`);
    menu.style.display = menu.style.display === 'none' ? 'block' : 'none';
}

// Close kebab menus when clicking outside
document.addEventListener('click', (e) => {
    if (!e.target.closest('.project-kebab-menu')) {
        document.querySelectorAll('.kebab-dropdown').forEach(menu => {
            menu.style.display = 'none';
        });
    }
});

async function markAsComplete(projectId) {
    const project = allProjects.find(p => p.id === projectId);
    if (!project) return;
    
    try {
        const response = await fetch('/api/mark-project-complete', {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${localStorage.getItem('authToken')}`,
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({ projectName: project.project_name })
        });
        
        const result = await response.json();
        
        if (result.success) {
            showToast('Project marked as completed', 'success');
            project.status = 'Completed';
            project.completed_at = new Date().toISOString();
            applyFilters();
            updateStats();
        } else {
            throw new Error(result.message);
        }
    } catch (error) {
        console.error('Error marking as complete:', error);
        showToast('Failed to mark project as complete', 'error');
    }
}

async function markAsArchived(projectId) {
    const project = allProjects.find(p => p.id === projectId);
    if (!project) return;
    
    if (!confirm(`Archive "${project.project_name}"? You can unarchive it later.`)) return;
    
    try {
        const response = await fetch(`/api/projects/${projectId}/archive`, {
            method: 'PATCH',
            headers: {
                'Authorization': `Bearer ${localStorage.getItem('authToken')}`,
                'Content-Type': 'application/json'
            }
        });
        
        const result = await response.json();
        
        if (result.success) {
            showToast('Project archived successfully', 'success');
            project.status = 'Archived';
            applyFilters();
            updateStats();
        } else {
            throw new Error(result.message);
        }
    } catch (error) {
        console.error('Error archiving project:', error);
        showToast('Failed to archive project', 'error');
    }
}

async function unarchiveProject(projectId) {
    const project = allProjects.find(p => p.id === projectId);
    if (!project) return;
    
    try {
        const response = await fetch(`/api/projects/${projectId}/unarchive`, {
            method: 'PATCH',
            headers: {
                'Authorization': `Bearer ${localStorage.getItem('authToken')}`,
                'Content-Type': 'application/json'
            }
        });
        
        const result = await response.json();
        
        if (result.success) {
            showToast('Project unarchived successfully', 'success');
            project.status = 'Not Started';
            applyFilters();
            updateStats();
        } else {
            throw new Error(result.message);
        }
    } catch (error) {
        console.error('Error unarchiving project:', error);
        showToast('Failed to unarchive project', 'error');
    }
}

async function duplicateProject(projectId) {
    const project = allProjects.find(p => p.id === projectId);
    if (!project) return;
    
    const newName = prompt(`Enter name for duplicated project:`, `${project.project_name} (Copy)`);
    if (!newName || !newName.trim()) return;
    
    try {
        const response = await fetch('/api/save-project', {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${localStorage.getItem('authToken')}`,
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                project_name: newName.trim(),
                region: project.region,
                department: project.department,
                tyre_size: project.tyre_size,
                protocol: project.protocol,
                status: 'Not Started',
                inputs: project.inputs || {}
            })
        });
        
        const result = await response.json();
        
        if (result.success) {
            showToast('Project duplicated successfully', 'success');
            await loadProjects();
        } else {
            throw new Error(result.message);
        }
    } catch (error) {
        console.error('Error duplicating project:', error);
        showToast('Failed to duplicate project', 'error');
    }
}

function toggleArchiveView() {
    showArchived = !showArchived;
    
    const viewArchiveBtn = document.getElementById('viewArchiveBtn');
    const viewActiveBtn = document.getElementById('viewActiveBtn');
    
    if (showArchived) {
        viewArchiveBtn.style.display = 'none';
        viewActiveBtn.style.display = 'inline-flex';
        filteredProjects = allProjects.filter(p => p.status === 'Archived');
    } else {
        viewArchiveBtn.style.display = 'inline-flex';
        viewActiveBtn.style.display = 'none';
        filteredProjects = allProjects.filter(p => p.status !== 'Archived');
    }
    
    currentPage = 1;
    displayProjects();
    updateStats();
}

// Make functions globally accessible
window.toggleKebabMenu = toggleKebabMenu;
window.markAsComplete = markAsComplete;
window.markAsArchived = markAsArchived;
window.unarchiveProject = unarchiveProject;
window.duplicateProject = duplicateProject;


// ============================================
// EXPORT & PRINT
// ============================================

function exportToCSV() {
    let csv = 'Project ID,Project Name,Protocol,Region,Department,Tyre Size,Status,Created At,Completed At\n';
    
    filteredProjects.forEach(project => {
        csv += `${project.id},`;
        csv += `"${project.project_name}",`;
        csv += `${project.protocol},`;
        csv += `${project.region},`;
        csv += `${project.department},`;
        csv += `${project.tyre_size},`;
        csv += `${project.status},`;
        csv += `${project.created_at},`;
        csv += `${project.completed_at || ''}\n`;
    });
    
    const blob = new Blob([csv], { type: 'text/csv' });
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `my-projects-${new Date().toISOString().split('T')[0]}.csv`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    window.URL.revokeObjectURL(url);
    
    showToast('Projects exported successfully', 'success');
}

function printProjects() {
    window.print();
}

// ============================================
// MODAL CONTROLS
// ============================================

function closeModal() {
    const modal = document.getElementById('projectModal');
    modal.classList.remove('active');
}

function closeDeleteModal() {
    const deleteModal = document.getElementById('deleteModal');
    deleteModal.classList.remove('active');
    selectedProjectForDelete = null;
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
    
    // Search input
    const searchInput = document.getElementById('searchInput');
    if (searchInput) {
        searchInput.addEventListener('input', debounce(applyFilters, 300));
    }
    
    // Filter dropdowns
    const filters = ['statusFilter', 'protocolFilter', 'regionFilter', 'departmentFilter', 'sortBy'];
    filters.forEach(filterId => {
        const element = document.getElementById(filterId);
        if (element) {
            element.addEventListener('change', applyFilters);
        }
    });
    
    // Reset filters button
    const resetBtn = document.getElementById('resetFiltersBtn');
    if (resetBtn) {
        resetBtn.addEventListener('click', resetFilters);
    }
    
    // View toggle buttons
    const gridViewBtn = document.getElementById('gridViewBtn');
    const listViewBtn = document.getElementById('listViewBtn');
    
    if (gridViewBtn) {
        gridViewBtn.addEventListener('click', () => toggleView('grid'));
    }
    
    if (listViewBtn) {
        listViewBtn.addEventListener('click', () => toggleView('list'));
    }
    
    // Export and Print buttons
        // Archive view toggle buttons
    const viewArchiveBtn = document.getElementById('viewArchiveBtn');
    const viewActiveBtn = document.getElementById('viewActiveBtn');
    
    if (viewArchiveBtn) {
        viewArchiveBtn.addEventListener('click', toggleArchiveView);
    }
    
    if (viewActiveBtn) {
        viewActiveBtn.addEventListener('click', toggleArchiveView);
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
    
    // Modal close buttons
    const closeModalBtn = document.getElementById('closeModalBtn');
    const closeModal1 = document.getElementById('closeModal');
    const closeDeleteModal1 = document.getElementById('closeDeleteModal');
    const cancelDeleteBtn = document.getElementById('cancelDeleteBtn');
    const confirmDeleteBtn = document.getElementById('confirmDeleteBtn');
    
    if (closeModalBtn) {
        closeModalBtn.addEventListener('click', closeModal);
    }
    
    if (closeModal1) {
        closeModal1.addEventListener('click', closeModal);
    }
    
    if (closeDeleteModal1) {
        closeDeleteModal1.addEventListener('click', closeDeleteModal);
    }
    
    if (cancelDeleteBtn) {
        cancelDeleteBtn.addEventListener('click', closeDeleteModal);
    }
    
    if (confirmDeleteBtn) {
        confirmDeleteBtn.addEventListener('click', deleteProject);
    }
    
    // Close modals on outside click
    const projectModal = document.getElementById('projectModal');
    const deleteModal = document.getElementById('deleteModal');
    
    if (projectModal) {
        projectModal.addEventListener('click', (e) => {
            if (e.target === projectModal) {
                closeModal();
            }
        });
    }
    
    if (deleteModal) {
        deleteModal.addEventListener('click', (e) => {
            if (e.target === deleteModal) {
                closeDeleteModal();
            }
        });
    }
        // Rename modal listeners
    const closeRenameModal1 = document.getElementById('closeRenameModal');
    const cancelRenameBtn = document.getElementById('cancelRenameBtn');
    const confirmRenameBtn = document.getElementById('confirmRenameBtn');
    const newProjectNameInput = document.getElementById('newProjectName');
    
    if (closeRenameModal1) {
        closeRenameModal1.addEventListener('click', closeRenameModal);
    }
    
    if (cancelRenameBtn) {
        cancelRenameBtn.addEventListener('click', closeRenameModal);
    }
    
    if (confirmRenameBtn) {
        confirmRenameBtn.addEventListener('click', renameProject);
    }
    
    if (newProjectNameInput) {
        newProjectNameInput.addEventListener('keypress', (e) => {
            if (e.key === 'Enter') {
                renameProject();
            }
        });
    }
    
    // Close rename modal on outside click
    const renameModal = document.getElementById('renameModal');
    if (renameModal) {
        renameModal.addEventListener('click', (e) => {
            if (e.target === renameModal) {
                closeRenameModal();
            }
        });
    }
    
    // Refresh button
const refreshBtn = document.getElementById('refreshBtn');
if (refreshBtn) {
    refreshBtn.addEventListener('click', handleRefresh);
}

// Hamburger menu button
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
    
    // Keyboard shortcuts
    document.addEventListener('keydown', handleKeyboardShortcuts);
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

// ============================================
// REFRESH PROJECTS
// ============================================

async function handleRefresh() {
    const refreshBtn = document.getElementById('refreshBtn');
    if (!refreshBtn) return;
    
    refreshBtn.classList.add('spinning');
    
    try {
        await loadProjects();
        showToast('Projects refreshed successfully', 'success');
    } catch (error) {
        console.error('Error refreshing projects:', error);
        showToast('Failed to refresh projects', 'error');
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
        
        // Count user's projects
        const userProjects = allProjects.filter(p => 
            (p.user_email || '').toLowerCase().trim() === (user.email || '').toLowerCase().trim()
        );
        
        const completedProjects = userProjects.filter(p => p.status === 'Completed').length;
        const inProgressProjects = userProjects.filter(p => p.status === 'In Progress').length;
        
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
                        <i class="fas fa-folder"></i>
                    </div>
                    <div class="stat-value">${userProjects.length}</div>
                    <div class="stat-label">Total Projects</div>
                </div>
                
                <div class="user-stat-card">
                    <div class="stat-icon">
                        <i class="fas fa-check-circle"></i>
                    </div>
                    <div class="stat-value">${completedProjects}</div>
                    <div class="stat-label">Completed</div>
                </div>
                
                <div class="user-stat-card">
                    <div class="stat-icon">
                        <i class="fas fa-spinner"></i>
                    </div>
                    <div class="stat-value">${inProgressProjects}</div>
                    <div class="stat-label">In Progress</div>
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

function calculateDaysSinceJoined(createdAt) {
    if (!createdAt) return 0;
    
    const created = new Date(createdAt);
    const now = new Date();
    const diffTime = Math.abs(now - created);
    const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
    
    return diffDays;
}

// Make functions globally accessible
window.handleRefresh = handleRefresh;
window.toggleUserDetailsPanel = toggleUserDetailsPanel;
window.closeUserDetailsPanel = closeUserDetailsPanel;
window.loadUserDetails = loadUserDetails;

function handleKeyboardShortcuts(event) {
    // Ctrl/Cmd + R: Refresh
    if ((event.ctrlKey || event.metaKey) && event.key === 'r') {
        event.preventDefault();
        handleRefresh();
    }
    
    // Ctrl/Cmd + U: Toggle user details
    if ((event.ctrlKey || event.metaKey) && event.key === 'u') {
        event.preventDefault();
        toggleUserDetailsPanel();
    }
    
    // Ctrl/Cmd + F: Focus search
    if ((event.ctrlKey || event.metaKey) && event.key === 'f') {
        event.preventDefault();
        document.getElementById('searchInput').focus();
    }
    
    // Ctrl/Cmd + N: New project
    if ((event.ctrlKey || event.metaKey) && event.key === 'n') {
        event.preventDefault();
        window.location.href = '/index.html';
    }
    
    // Ctrl/Cmd + E: Export
    if ((event.ctrlKey || event.metaKey) && event.key === 'e') {
        event.preventDefault();
        exportToCSV();
    }
    
    // Ctrl/Cmd + P: Print
    if ((event.ctrlKey || event.metaKey) && event.key === 'p') {
        event.preventDefault();
        printProjects();
    }
    
    // Escape: Close modals and panels
    if (event.key === 'Escape') {
        closeModal();
        closeDeleteModal();
        closeUserDetailsPanel();
    }
}

// ============================================
// UTILITY FUNCTIONS
// ============================================

function getStatusClass(status) {
    const statusMap = {
        'Completed': 'status-completed',
        'In Progress': 'status-in-progress',
        'Not Started': 'status-not-started'
    };
    return statusMap[status] || 'status-not-started';
}

function formatDate(dateString) {
    if (!dateString) return '-';
    
    const date = new Date(dateString);
    const options = { year: 'numeric', month: 'short', day: 'numeric' };
    return date.toLocaleDateString('en-US', options);
}

function formatDateTime(dateString) {
    if (!dateString) return '-';
    
    const date = new Date(dateString);
    const dateOptions = { year: 'numeric', month: 'short', day: 'numeric' };
    const timeOptions = { hour: '2-digit', minute: '2-digit' };
    
    return date.toLocaleDateString('en-US', dateOptions) + ' ' + 
           date.toLocaleTimeString('en-US', timeOptions);
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

// Format Project ID (PID-YYYY-XXXX)
function formatProjectId(id, createdDate) {
    if (!id) return 'PID-0000-0000';
    
    // Extract year from created_at date
    let year = new Date().getFullYear();
    if (createdDate) {
        const dateObj = new Date(createdDate);
        if (!isNaN(dateObj.getTime())) {
            year = dateObj.getFullYear();
        }
    }
    
    // Format: PID-YYYY-XXXX (e.g., PID-2025-0001)
    const paddedId = String(id).padStart(4, '0');
    return `PID-${year}-${paddedId}`;
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

// Bulk operations
function handleCheckboxChange() {
    const checkedBoxes = document.querySelectorAll('.project-checkbox:checked');
    const selectedCount = checkedBoxes.length;
    const bulkDeleteBtn = document.getElementById('bulkDeleteBtn');
    const selectedCountSpan = document.getElementById('selectedCount');
    
    if (bulkDeleteBtn && selectedCountSpan) {
        selectedCountSpan.textContent = selectedCount;
        bulkDeleteBtn.style.display = selectedCount > 0 ? 'inline-flex' : 'none';
    }
}

async function bulkDeleteProjects() {
    const checkedBoxes = document.querySelectorAll('.project-checkbox:checked');
    const selectedIds = Array.from(checkedBoxes).map(cb => parseInt(cb.dataset.id));
    
    if (selectedIds.length === 0) return;
    
    if (!confirm(`Delete ${selectedIds.length} selected project(s)? This cannot be undone.`)) return;
    
    try {
        const deletePromises = selectedIds.map(id => 
            fetch(`/api/projects/${id}`, {
                method: 'DELETE',
                headers: {
                    'Authorization': `Bearer ${localStorage.getItem('authToken')}`
                }
            })
        );
        
        await Promise.all(deletePromises);
        
        showToast(`Successfully deleted ${selectedIds.length} project(s)`, 'success');
        
        // Reload projects
        await loadProjects();
        
    } catch (error) {
        console.error('Bulk delete error:', error);
        showToast('Failed to delete some projects', 'error');
    }
}

// Add event listener
document.getElementById('bulkDeleteBtn')?.addEventListener('click', bulkDeleteProjects);

// ============================================
// TOAST NOTIFICATION SYSTEM
// ============================================

function showToast(message, type = 'info') {
    // Remove existing toast if any
    const existingToast = document.querySelector('.toast-notification');
    if (existingToast) {
        existingToast.remove();
    }
    
    const toast = document.createElement('div');
    toast.className = `toast-notification toast-${type}`;
    
    const icon = getToastIcon(type);
    
    toast.innerHTML = `
        <div class="toast-icon">
            <i class="fas fa-${icon}"></i>
        </div>
        <div class="toast-content">
            <p>${message}</p>
        </div>
        <button class="toast-close" onclick="this.parentElement.remove()">
            <i class="fas fa-times"></i>
        </button>
    `;
    
    document.body.appendChild(toast);
    
    // Add styles for toast if not already present
    if (!document.getElementById('toast-styles')) {
        const style = document.createElement('style');
        style.id = 'toast-styles';
        style.textContent = `
            .toast-notification {
                position: fixed;
                top: 20px;
                right: 20px;
                min-width: 300px;
                max-width: 500px;
                background: white;
                border-radius: 10px;
                box-shadow: 0 10px 25px rgba(0, 0, 0, 0.2);
                display: flex;
                align-items: center;
                gap: 15px;
                padding: 15px 20px;
                z-index: 10000;
                animation: slideInRight 0.3s ease;
            }
            
            @keyframes slideInRight {
                from {
                    transform: translateX(400px);
                    opacity: 0;
                }
                to {
                    transform: translateX(0);
                    opacity: 1;
                }
            }
            
            .toast-icon {
                width: 40px;
                height: 40px;
                border-radius: 50%;
                display: flex;
                align-items: center;
                justify-content: center;
                font-size: 20px;
                flex-shrink: 0;
            }
            
            .toast-success .toast-icon {
                background: rgba(16, 185, 129, 0.1);
                color: #10b981;
            }
            
            .toast-error .toast-icon {
                background: rgba(239, 68, 68, 0.1);
                color: #ef4444;
            }
            
            .toast-warning .toast-icon {
                background: rgba(245, 158, 11, 0.1);
                color: #f59e0b;
            }
            
            .toast-info .toast-icon {
                background: rgba(59, 130, 246, 0.1);
                color: #3b82f6;
            }
            
            .toast-content {
                flex: 1;
            }
            
            .toast-content p {
                margin: 0;
                color: #1e293b;
                font-weight: 500;
            }
            
            .toast-close {
                background: none;
                border: none;
                color: #64748b;
                cursor: pointer;
                padding: 5px;
                display: flex;
                align-items: center;
                justify-content: center;
                transition: color 0.2s;
            }
            
            .toast-close:hover {
                color: #1e293b;
            }
        `;
        document.head.appendChild(style);
    }
    
    // Show toast
    setTimeout(() => {
        toast.classList.add('show');
    }, 100);
    
    // Auto remove after 5 seconds
    setTimeout(() => {
        toast.style.animation = 'slideOutRight 0.3s ease';
        setTimeout(() => {
            if (toast.parentElement) {
                toast.remove();
            }
        }, 300);
    }, 5000);
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
// ADDITIONAL FEATURES
// ============================================

// Bulk actions (future enhancement)
function selectProject(projectId, selected) {
    // For future bulk operations
    console.log(`Project ${projectId} ${selected ? 'selected' : 'deselected'}`);
}

// Project statistics
function getProjectStats() {
    return {
        total: allProjects.length,
        completed: allProjects.filter(p => p.status === 'Completed').length,
        inProgress: allProjects.filter(p => p.status === 'In Progress').length,
        notStarted: allProjects.filter(p => p.status === 'Not Started').length,
        byProtocol: getCountByField('protocol'),
        byRegion: getCountByField('region'),
        byDepartment: getCountByField('department')
    };
}

function getCountByField(field) {
    return allProjects.reduce((acc, project) => {
        const value = project[field] || 'Unknown';
        acc[value] = (acc[value] || 0) + 1;
        return acc;
    }, {});
}

// Advanced search
function advancedSearch(criteria) {
    return allProjects.filter(project => {
        return Object.entries(criteria).every(([key, value]) => {
            if (!value || value === 'all') return true;
            return project[key] && project[key].toString().toLowerCase().includes(value.toLowerCase());
        });
    });
}

// ============================================
// CHARTS INITIALIZATION
// ============================================

let monthlyActivityChart = null;
let completionRateChart = null;

function initializeCharts() {
    createMonthlyActivityChart();
    createCompletionRateChart();
}

// Monthly Project Activity (Line Chart)
function createMonthlyActivityChart() {
    const ctx = document.getElementById('monthlyActivityChart');
    if (!ctx) return;
    
    // Destroy existing chart if it exists
    if (monthlyActivityChart) {
        monthlyActivityChart.destroy();
    }
    
    // Get last 6 months of data
    const monthlyData = getMonthlyProjectData();
    
    monthlyActivityChart = new Chart(ctx, {
        type: 'line',
        data: {
            labels: monthlyData.labels,
            datasets: [{
                label: 'Projects Created',
                data: monthlyData.values,
                borderColor: '#6366f1',
                backgroundColor: 'rgba(99, 102, 241, 0.1)',
                borderWidth: 3,
                tension: 0.4,
                fill: true,
                pointBackgroundColor: '#6366f1',
                pointBorderColor: '#fff',
                pointBorderWidth: 2,
                pointRadius: 5,
                pointHoverRadius: 7
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
                legend: {
                    display: false
                },
                tooltip: {
                    backgroundColor: '#1e293b',
                    titleColor: '#fff',
                    bodyColor: '#cbd5e1',
                    padding: 12,
                    cornerRadius: 8,
                    displayColors: false,
                    callbacks: {
                        title: function(context) {
                            return context[0].label;
                        },
                        label: function(context) {
                            return `${context.parsed.y} project${context.parsed.y !== 1 ? 's' : ''} created`;
                        }
                    }
                }
            },
            scales: {
                y: {
                    beginAtZero: true,
                    ticks: {
                        stepSize: 1,
                        color: '#64748b',
                        font: {
                            size: 11
                        }
                    },
                    grid: {
                        color: '#e2e8f0',
                        drawBorder: false
                    }
                },
                x: {
                    ticks: {
                        color: '#64748b',
                        font: {
                            size: 11
                        }
                    },
                    grid: {
                        display: false
                    }
                }
            }
        }
    });
}

// Completion Rate Trend (Area Chart)
function createCompletionRateChart() {
    const ctx = document.getElementById('completionRateChart');
    if (!ctx) return;
    
    // Destroy existing chart if it exists
    if (completionRateChart) {
        completionRateChart.destroy();
    }
    
    // Get last 8 weeks of completion data
    const completionData = getWeeklyCompletionRate();
    
    completionRateChart = new Chart(ctx, {
        type: 'line',
        data: {
            labels: completionData.labels,
            datasets: [{
                label: 'Completion Rate',
                data: completionData.values,
                borderColor: '#10b981',
                backgroundColor: 'rgba(16, 185, 129, 0.2)',
                borderWidth: 3,
                tension: 0.4,
                fill: true,
                pointBackgroundColor: '#10b981',
                pointBorderColor: '#fff',
                pointBorderWidth: 2,
                pointRadius: 5,
                pointHoverRadius: 7
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
                legend: {
                    display: false
                },
                tooltip: {
                    backgroundColor: '#1e293b',
                    titleColor: '#fff',
                    bodyColor: '#cbd5e1',
                    padding: 12,
                    cornerRadius: 8,
                    displayColors: false,
                    callbacks: {
                        title: function(context) {
                            return context[0].label;
                        },
                        label: function(context) {
                            return `Completion Rate: ${context.parsed.y}%`;
                        }
                    }
                }
            },
            scales: {
                y: {
                    beginAtZero: true,
                    max: 100,
                    ticks: {
                        stepSize: 25,
                        color: '#64748b',
                        font: {
                            size: 11
                        },
                        callback: function(value) {
                            return value + '%';
                        }
                    },
                    grid: {
                        color: '#e2e8f0',
                        drawBorder: false
                    }
                },
                x: {
                    ticks: {
                        color: '#64748b',
                        font: {
                            size: 11
                        }
                    },
                    grid: {
                        display: false
                    }
                }
            }
        }
    });
}

// Get monthly project data (last 6 months)
function getMonthlyProjectData() {
    const monthNames = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
    const labels = [];
    const values = [];
    const now = new Date();
    
    // Get last 6 months
    for (let i = 5; i >= 0; i--) {
        const date = new Date(now.getFullYear(), now.getMonth() - i, 1);
        const monthName = monthNames[date.getMonth()];
        const year = date.getFullYear();
        labels.push(`${monthName} ${year}`);
        
        // Count projects created in this month
        const projectsInMonth = allProjects.filter(p => {
            const created = new Date(p.created_at);
            return created.getMonth() === date.getMonth() && 
                   created.getFullYear() === date.getFullYear();
        }).length;
        
        values.push(projectsInMonth);
    }
    
    return { labels, values };
}

// Get weekly completion rate (last 8 weeks)
function getWeeklyCompletionRate() {
    const labels = [];
    const values = [];
    const now = new Date();
    
    // Get last 8 weeks
    for (let i = 7; i >= 0; i--) {
        const weekStart = new Date(now);
        weekStart.setDate(now.getDate() - (i * 7));
        const weekEnd = new Date(weekStart);
        weekEnd.setDate(weekStart.getDate() + 6);
        
        const weekLabel = `Week ${8 - i}`;
        labels.push(weekLabel);
        
        // Calculate completion rate for this week
        const weekProjects = allProjects.filter(p => {
            const created = new Date(p.created_at);
            return created >= weekStart && created <= weekEnd;
        });
        
        const completedInWeek = weekProjects.filter(p => p.status === 'Completed').length;
        const rate = weekProjects.length > 0 
            ? Math.round((completedInWeek / weekProjects.length) * 100) 
            : 0;
        
        values.push(rate);
    }
    
    return { labels, values };
}

// Update charts when projects change
function updateCharts() {
    if (typeof Chart !== 'undefined') {
        initializeCharts();
    }
}

// ============================================
// CONSOLE WELCOME MESSAGE
// ============================================

console.log('%c My Projects Page Loaded! ', 'background: #6366f1; color: white; font-size: 16px; font-weight: bold; padding: 10px;');
console.log('%c Keyboard shortcuts: ', 'font-weight: bold; font-size: 14px;');
console.log('  Ctrl/Cmd + F: Focus search');
console.log('  Ctrl/Cmd + N: New project');
console.log('  Ctrl/Cmd + E: Export to CSV');
console.log('  Ctrl/Cmd + P: Print list');
console.log('  Escape: Close modals');

// ============================================
// EXPORT FUNCTIONS FOR GLOBAL USE
// ============================================

window.myProjectsFunctions = {
    viewProject,
    editProject,
    viewProjectDetails,
    confirmDelete,
    deleteProject,
    exportToCSV,
    printProjects,
    getProjectStats,
    advancedSearch
};

// ============================================
// END OF MY PROJECTS JAVASCRIPT
// ============================================