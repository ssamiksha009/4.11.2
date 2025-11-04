// public/js/persist.js
// Helper functions for persisting drafts and Tydex files

/**
 * Get projectId from URL query parameter
 */
function getProjectIdFromURL() {
  const params = new URLSearchParams(window.location.search);
  return params.get('projectId');
}

/**
 * Save draft inputs and matrix for the current project+protocol
 * @param {string} projectId - The project ID
 * @param {string} protocol - Protocol name (e.g., 'MF6.2', 'MF5.2', etc.)
 * @param {object} inputsObject - The user's input parameters
 * @param {object} matrixObject - The computed test matrix
 */
async function saveDraft(projectId, protocol, inputsObject, matrixObject) {
  if (!projectId) {
    console.warn('No projectId provided to saveDraft');
    return;
  }

  try {
    const response = await fetch(`/api/projects/${projectId}/drafts/${protocol}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        inputs_json: inputsObject || {},
        matrix_json: matrixObject || {}
      })
    });

    const result = await response.json();
    
    if (result.ok) {
      console.log('Draft saved successfully');
    } else {
      console.error('Failed to save draft:', result.error);
    }
  } catch (error) {
    console.error('Error saving draft:', error);
  }
}

/**
 * Save generated Tydex file(s) to the database
 * @param {string} projectId - The project ID
 * @param {string} protocol - Protocol name
 * @param {array} tydexFiles - Array of {filename, content} objects
 */
async function saveTydexFiles(projectId, protocol, tydexFiles) {
  if (!projectId || !Array.isArray(tydexFiles)) {
    console.warn('Invalid parameters for saveTydexFiles');
    return;
  }

  for (const file of tydexFiles) {
    if (!file.filename || !file.content) continue;

    try {
      const response = await fetch(`/api/tydex/${projectId}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          protocol: protocol,
          filename: file.filename,
          content: file.content
        })
      });

      const result = await response.json();
      
      if (result.success) {
        console.log(`Tydex file ${file.filename} saved successfully`);
      } else {
        console.error(`Failed to save Tydex file ${file.filename}:`, result.message);
      }
    } catch (error) {
      console.error(`Error saving Tydex file ${file.filename}:`, error);
    }
  }
}

/**
 * Combined helper: save both draft and Tydex files
 */
async function persistDraftAndTydex(projectId, protocol, inputsObject, matrixObject, tydexFilesArray) {
  await saveDraft(projectId, protocol, inputsObject, matrixObject);
  await saveTydexFiles(projectId, protocol, tydexFilesArray);
}