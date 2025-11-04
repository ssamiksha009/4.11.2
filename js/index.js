// JavaScript to handle the form submission
document.getElementById('submitBtn').addEventListener('click', async function () {
  const project = document.getElementById('project').value.trim();
  const region = document.getElementById('region').value;
  const department = document.getElementById('department').value;
  const tyreSize = document.getElementById('tyreSize').value.trim();
  const protocol = document.getElementById('protocol').value;
  const errorMessage = document.getElementById('errorMessage');

  // Check if all fields are filled
  if (!project || !region || !department || !tyreSize || !protocol) {
    errorMessage.textContent = 'Please fill in all fields';
    return;
  }

  try {
    // Get auth token from localStorage
    const token = localStorage.getItem('authToken');
    if (!token) {
      errorMessage.textContent = 'Please login first';
      return;
    }

    // Save project to database with authentication token
    const resp = await fetch('/api/save-project', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`
      },
      body: JSON.stringify({
        project_name: project,
        region,
        department,
        tyre_size: tyreSize,
        protocol,
        status: 'Not Started'
      })
    });

    const data = await resp.json();
    sessionStorage.setItem('currentProjectId', data.id);
    if (!resp.ok || !data.success) {
      throw new Error(data.message || 'Failed to save project');
    }

    // KEEP the new id for later pages
    const { id } = data;
    sessionStorage.setItem('currentProject', project);
    sessionStorage.setItem('currentProjectId', String(id));
    sessionStorage.setItem('currentProtocol', protocol);
// ✅ ADD THIS CODE (already present in your file):
try {
    await fetch('/api/activity-log', {
        method: 'POST',
        headers: {
            'Authorization': `Bearer ${token}`,
            'Content-Type': 'application/json'
        },
        body: JSON.stringify({
            activity_type: 'Project',
            action: 'Project Created',
            description: `Created new project "${project}" with protocol ${protocol}`,
            status: 'success',
            metadata: {
                project_id: id,
                project_name: project,
                protocol: protocol,
                region: region,
                department: department,
                tyre_size: tyreSize
            },
            project_name: project  // ✅ ADD THIS LINE
        })
    });
} catch (logError) {
    console.warn('Failed to log activity:', logError);
}

    // Redirect with the id so protocol pages can save inputs against it
    const protocolPage = { MF62:'mf.html', MF52:'mf52.html', FTire:'ftire.html', CDTire:'cdtire.html', Custom:'custom.html' }[protocol];
    window.location.href = `/${protocolPage}?projectId=${encodeURIComponent(id)}`;
  } catch (err) {
    console.error('Error saving project:', err);
    errorMessage.textContent = 'Failed to save project. Please try again.';
  }
});