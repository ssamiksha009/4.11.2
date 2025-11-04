// Check if user is authenticated
function checkAuth() {
    const token = localStorage.getItem('authToken');
    
    // If no token is found, redirect to login page
    if (!token) {
        window.location.href = 'login.html';
        return;
    }
    
    // Verify token validity with the server
    fetch('/api/verify-token', {
        method: 'GET',
        headers: {
            'Authorization': `Bearer ${token}`
        }
    })
    .then(response => {
        if (!response.ok) {
            throw new Error('Token verification failed');
        }
        return response.json();
    })
    .catch(error => {
        console.error('Auth error:', error);
        // If token is invalid, clear it and redirect to login
        localStorage.removeItem('authToken');
        window.location.href = 'login.html';
    });
}

// Handle logout
function logout() {
    // Clear auth token
    localStorage.removeItem('authToken');
    // Redirect to login page
    window.location.href = 'login.html';
}

const logoutBtn = document.getElementById('logoutBtn');
if (logoutBtn) {
    logoutBtn.addEventListener('click', logout);
}

// Check authentication when page loads
document.addEventListener('DOMContentLoaded', checkAuth);