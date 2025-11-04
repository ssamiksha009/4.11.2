// Common functions for all protocol pages

// Logout function
function logout() {
    // Clear any session data if needed
    sessionStorage.clear();
    localStorage.clear();
    
    // Redirect to login page
    window.location.href = '/login.html';
}

// Refresh page function with animation
function refreshPage() {
    const btn = document.getElementById('refreshBtn');
    if (btn) {
        btn.classList.add('refreshing');
        setTimeout(() => {
            window.location.reload();
        }, 300); // Small delay for visual feedback
    }
}

// Add event listeners when DOM is ready
document.addEventListener('DOMContentLoaded', function() {
    // Logout button handler
    const logoutBtn = document.getElementById('logoutBtn');
    if (logoutBtn) {
        logoutBtn.addEventListener('click', logout);
    }
});