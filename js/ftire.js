document.getElementById('logoutBtn').addEventListener('click', function() {
    window.location.href = '/login.html';
});

function updateTestSummary() {
    fetch('/api/get-ftire-summary')
        .then(response => {
            if (!response.ok) throw new Error('Network response was not ok');
            return response.json();
        })
        .then(data => {
            const summaryContainer = document.getElementById('testSummary');
            summaryContainer.innerHTML = data.map(item => `
                <div class="summary-item">
                    <span class="test-name">${item.tests}:</span>
                    <span class="test-count">${item.count}</span>
                </div>
            `).join('');
        })
        .catch(error => {
            console.error('Error fetching test summary:', error);
            const summaryContainer = document.getElementById('testSummary');
            summaryContainer.innerHTML = '<div class="error-message">Unable to load test summary</div>';
        });
}

window.addEventListener('load', updateTestSummary);

document.getElementById('submitBtn').addEventListener('click', async function() {
    const errorMessage = document.getElementById('errorMessage');
    errorMessage.textContent = '';
    
    // Check if all inputs are filled and valid
    const inputs = document.querySelectorAll('input[required]');
    let allValid = true;
    
    inputs.forEach(input => {
        if (!input.value || !input.checkValidity()) {
            allValid = false;
            input.classList.add('invalid');
        } else {
            input.classList.remove('invalid');
        }
    });

    if (!allValid) {
        errorMessage.textContent = '* All fields are mandatory and must be positive numbers';
        errorMessage.style.display = 'block';
        return;
    }
    
    // Persist current input values into projects.inputs when projectId present
    try {
      const pid = getProjectId();
      if (pid) {
        const ids = [
          'rimWidth', 'rimDiameter', 'nominalWidth', 'outerDiameter',
          'p1', 'l1', 'l2', 'l3', 'vel', 'ia', 'sa', 'sr', 'aspectRatio'
        ];
        await saveInputs(pid, collectInputs(ids));
      }
    } catch (e) {
      console.warn('Failed to save inputs for project:', e);
    }

    const projectName = sessionStorage.getItem('currentProject') || 'DefaultProject';
    checkProjectExists(projectName, 'FTire');
});

// Add function to check project existence and show confirmation
function checkProjectExists(projectName, protocol) {
    fetch('/api/check-project-exists', {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json'
        },
        body: JSON.stringify({
            projectName: projectName,
            protocol: protocol
        })
    })
    .then(response => response.json())
    .then(data => {
        if (!data.success) {
            throw new Error(data.message || 'Error checking project existence');
        }
        
        // ✅ ONLY show prompt if project EXISTS IN DATABASE
        if (data.exists && data.project && data.project.id) {
            // Project exists, show confirmation dialog
            const userConfirmed = confirm(`Project "${data.folderName}" already exists. Do you want to Replace it?`);
            if (userConfirmed) {
                // User confirmed, proceed with workflow
                proceedWithSubmission();
            } else {
                // User cancelled, do nothing (stay on same page)
                return;
            }
        } else {
            // Project doesn't exist, proceed normally
            proceedWithSubmission();
        }
    })
    .catch(error => {
        const errorMessage = document.getElementById('errorMessage');
        errorMessage.style.color = '#d9534f';
        errorMessage.textContent = error.message || 'Error checking project status. Please try again.';
    });
}

// Extract the submission logic to a separate function
async function proceedWithSubmission() {
    try {
        // Handle mesh file upload if provided
        const meshFile = document.getElementById('meshFile').files[0];
        if (meshFile) {
            const formData = new FormData();
            formData.append('meshFile', meshFile);
            
            // Upload the mesh file
            const uploadResponse = await fetch('/api/upload-mesh-file', {
                method: 'POST',
                body: formData
            });
            const uploadData = await uploadResponse.json();
            if (!uploadData.success) {
                throw new Error(uploadData.message || 'Failed to upload mesh file');
            }
        } 

        // Continue with Excel processing after successful mesh file upload
        const parameterData = {
            load1_kg: document.getElementById('l1').value,
            load2_kg: document.getElementById('l2').value,
            load3_kg: document.getElementById('l3').value,
            pressure1: document.getElementById('p1').value,
            speed_kmph: document.getElementById('vel').value,
            IA: document.getElementById('ia').value,
            SA: document.getElementById('sa').value,
            SR: document.getElementById('sr').value,
            width: document.getElementById('rimWidth').value,
            diameter: document.getElementById('rimDiameter').value,
            Outer_diameter: document.getElementById('outerDiameter').value,
            nomwidth: document.getElementById('nominalWidth').value,
            aspratio: document.getElementById('aspectRatio').value
        };

        // Generate parameter file
        const paramResponse = await fetch('/api/generate-parameters', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify(parameterData)
        });
        const paramData = await paramResponse.json();
        if (!paramData.success) {
            throw new Error(paramData.message || 'Error generating parameter file');
        }
        console.log('Fetching FTire protocol file...');
        // Explicitly request ftire.xlsx
        const excelResponse = await fetch('/api/read-protocol-excel', {
            headers: {
                'Referer': '/FTire.html'  // Ensure correct referer
            }
        });
        if (!excelResponse.ok) {
            throw new Error(`Error reading protocol file: ${excelResponse.statusText}`);
        }
        const excelData = await excelResponse.arrayBuffer();
        const workbook = XLSX.read(new Uint8Array(excelData), {type: 'array'});
        const outputWorkbook = XLSX.utils.book_new();
        
        workbook.SheetNames.forEach((sheetName) => {
            const worksheet = workbook.Sheets[sheetName];
            const jsonData = XLSX.utils.sheet_to_json(worksheet, {header: 1});
            
            const replacements = {
                'P1': document.getElementById('p1').value.trim() || null,
                'L1': document.getElementById('l1').value.trim() || null,
                'L2': document.getElementById('l2').value.trim() || null,
                'L3': document.getElementById('l3').value.trim() || null,
                'VEL': document.getElementById('vel').value.trim() || null,
                'Vel': document.getElementById('vel').value.trim() || null,
                'vel': document.getElementById('vel').value.trim() || null,
                'SR': document.getElementById('sr').value.trim() || null,
                'SA': document.getElementById('sa').value.trim() || null,
                'IA': document.getElementById('ia').value.trim() || null
            };

            // Create new sheet with replacements and preserve original P/L values
            const newSheet = jsonData.map((row, rowIndex) => {
                if (!Array.isArray(row)) return row;
                
                // Store original P and L values for this row
                const originalPValues = [];
                const originalLValues = [];
                
                const modifiedRow = row.map(cell => {
                    if (cell === null || cell === undefined) return cell;
                    const cellStr = String(cell).trim();
                    
                    // Store original P values before replacement
                    if (cellStr.match(/^P[1-3]$/)) {
                        originalPValues.push(cellStr);
                    }
                    
                    // Store original L values before replacement
                    if (cellStr.match(/^L[1-5]$/)) {
                        originalLValues.push(cellStr);
                    }
                    
                    // Handle velocity cases
                    if (cellStr.toLowerCase() === 'vel') {
                        return document.getElementById('vel').value.trim();
                    }
                    
                    // Handle IA, SA, SR replacements including negative values
                    if (cellStr === 'IA' || cellStr === '-IA') {
                        const iaValue = parseFloat(document.getElementById('ia').value.trim());
                        return cellStr.startsWith('-') ? (-Math.abs(iaValue)).toString() : iaValue.toString();
                    }
                    
                    if (cellStr === 'SA' || cellStr === '-SA') {
                        const saValue = parseFloat(document.getElementById('sa').value.trim());
                        return cellStr.startsWith('-') ? (-Math.abs(saValue)).toString() : saValue.toString();
                    }
                    
                    if (cellStr === 'SR' || cellStr === '-SR') {
                        const srValue = parseFloat(document.getElementById('sr').value.trim());
                        return cellStr.startsWith('-') ? (-Math.abs(srValue)).toString() : srValue.toString();
                    }
                    
                    // Handle other direct replacements
                    return replacements[cellStr] || cell;
                });
                
                // Add original P and L values as new columns at the end
                const extendedRow = [...modifiedRow];
                
                // Add header for first row
                if (rowIndex === 0) {
                    extendedRow.push('Original P Values', 'Original L Values');
                } else {
                    extendedRow.push(
                        originalPValues.join(', '),
                        originalLValues.join(', ')
                    );
                }
                
                return extendedRow;
            });

            const modifiedWorksheet = XLSX.utils.aoa_to_sheet(newSheet);
            XLSX.utils.book_append_sheet(outputWorkbook, modifiedWorksheet, sheetName);
        });

        // Save modified workbook and insert into database
        const excelBuffer = XLSX.write(outputWorkbook, { bookType: 'xlsx', type: 'array' });
        const formData = new FormData();
        formData.append('excelFile', new Blob([excelBuffer]), 'output.xlsx');

        const saveResponse = await fetch('/api/save-excel', {
            method: 'POST',
            body: formData
        });
        const saveData = await saveResponse.json();
        if (!saveData.success) {
            throw new Error(saveData.message || 'Error saving file');
        }

        // Read the output file and extract data for database
        const readResponse = await fetch('/api/read-output-excel');
        const readData = await readResponse.arrayBuffer();
        const workbookRead = XLSX.read(new Uint8Array(readData), {type: 'array'});
        const extractedData = [];

        workbookRead.SheetNames.forEach((sheetName) => {
            const worksheet = workbookRead.Sheets[sheetName];
            const jsonData = XLSX.utils.sheet_to_json(worksheet, {header: 1});
            
            // Find header row with exact Excel column names
            let headerRowIndex = jsonData.findIndex(row => 
                row && Array.isArray(row) && row.includes('S.No')
            );
            
            if (headerRowIndex === -1) {
                console.error('Excel structure:', jsonData);
                throw new Error('Invalid Excel format: Missing required headers');
            }
            
            const headerRow = jsonData[headerRowIndex];
            console.log('Found headers:', headerRow);

            // Match exact Excel column names and order
            const columns = {
                runs: headerRow.indexOf('S.No'),
                tests: headerRow.indexOf('Test'),
                loads: headerRow.indexOf('Load (N)'),
                pressure: headerRow.indexOf('IP (Kpa)'),
                velocity: headerRow.indexOf('Speed (kmph)'),
                longitudinalSlip: headerRow.indexOf('Longitudinal Slip (%)'),
                slipAngle: headerRow.indexOf('Slip Angle (deg)'),
                inclinationAngle: headerRow.indexOf('Inclination Angle (deg)'),
                cleatOrientation: headerRow.indexOf('Cleat Orientation [w.r.t axial direction] (deg)'),
                job: headerRow.indexOf('Job'),
                old_job: headerRow.indexOf('Old Job'),
                template_tydex: headerRow.indexOf('Template Tydex'),
                tydex_name: headerRow.indexOf('Tydex name')
            };

            // P and L columns are the next two columns after tydex_name
            const pColumnIndex = columns.tydex_name + 1;
            const lColumnIndex = columns.tydex_name + 2;

            // Extract data in exact order matching the database columns
            for (let i = headerRowIndex + 1; i < jsonData.length; i++) {
                const row = jsonData[i];
                if (!row || !row[columns.runs]) continue;

                // Clean up text fields to remove carriage returns and extra whitespace
                extractedData.push({
                    number_of_runs: parseInt(row[columns.runs]) || 0,
                    tests: (row[columns.tests]?.toString() || '').replace(/\r\n/g, ' ').trim(),
                    loads: row[columns.loads]?.toString() || '',
                    inflation_pressure: row[columns.pressure]?.toString() || '',
                    test_velocity: row[columns.velocity]?.toString() || '',
                    longitudinal_slip: row[columns.longitudinalSlip]?.toString() || '',
                    slip_angle: row[columns.slipAngle]?.toString() || '',
                    inclination_angle: row[columns.inclinationAngle]?.toString() || '',
                    cleat_orientation: row[columns.cleatOrientation]?.toString() || '',
                    job: row[columns.job]?.toString() || '',
                    old_job: row[columns.old_job]?.toString() || '',
                    template_tydex: row[columns.template_tydex]?.toString() || '',
                    tydex_name: row[columns.tydex_name]?.toString() || '',
                    p: row[pColumnIndex]?.toString() || '',
                    l: row[lColumnIndex]?.toString() || ''
                });
            }
        });

        if (extractedData.length === 0) {
            console.error('No data extracted from Excel file');
            throw new Error('No valid data found in Excel file');
        }

        console.log('Extracted data:', extractedData); // Debug log

        // Store the extracted data
        const storeResponse = await fetch('/api/store-ftire-data', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({ data: extractedData })
        });
        const storeData = await storeResponse.json();
        if (!storeData.success) {
            throw new Error(storeData.message || 'Error storing data');
        }
        
        const projectName = sessionStorage.getItem('currentProject') || 'DefaultProject';
        const folderResponse = await fetch('/api/create-protocol-folders', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                projectName: projectName,
                protocol: 'FTire'
            })
        });
        const folderData = await folderResponse.json();
        if (!folderData.success) {
            throw new Error(folderData.message || 'Error creating protocol folders');
        }
        
        // Save matrix to permanent project table
        const pid = getProjectId();
        if (pid) {
            const matrixResponse = await fetch('/api/store-project-matrix', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ projectId: pid, protocol: 'FTire' })
            });
            const matrixData = await matrixResponse.json();
            if (!matrixData.success) {
                throw new Error(matrixData.message || 'Error saving project matrix');
            }
        }

        // ✅ Generate batch file AFTER creating folders
        const batchResponse = await fetch('/api/generate-batch-file', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                projectName: projectName,
                protocol: 'FTire'
            })
        });
        
        const batchData = await batchResponse.json();
        
        if (batchData.success) {
            console.log(`✅ Batch file generated: ${batchData.testCount} commands`);
        } else {
            console.warn(`⚠️ Batch file generation failed: ${batchData.message}`);
        }
        
        updateTestSummary();
        window.location.href = '/select.html';
    } catch (error) {
        const errorMessage = document.getElementById('errorMessage');
        errorMessage.style.color = '#d9534f';
        errorMessage.textContent = error.message || 'Error processing file. Please try again.';
    }
}

// ==== shared helpers ====
function getProjectId() {
  const qs = new URLSearchParams(location.search);
  return qs.get('projectId');
}
async function fetchProject(id) {
  const r = await fetch(`/api/projects/${id}`);
  if (!r.ok) throw new Error('Failed to fetch project');
  return r.json();
}
async function saveInputs(projectId, inputs) {
  await fetch(`/api/projects/${projectId}/inputs`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ inputs })
  });
}
// set input values by element id
function prefill(inputs) {
  if (!inputs) return;
  Object.keys(inputs).forEach(key => {
    const el = document.getElementById(key);
    if (el) el.value = inputs[key];
  });
}
// collect values for the ids that actually exist on this page
function collectInputs(ids) {
  const out = {};
  ids.forEach(id => {
    const el = document.getElementById(id);
    if (el && el.value !== '') out[id] = el.value;
  });
  return out;
}
// ====
document.addEventListener('DOMContentLoaded', async () => {
  const ids = [
    'rimWidth', 'rimDiameter', 'nominalWidth', 'outerDiameter',
    'p1', 'l1', 'l2', 'l3', 'vel', 'ia', 'sa', 'sr', 'aspectRatio'
  ];
  const pid = getProjectId();
  if (pid) {
    try {
      const proj = await fetchProject(pid);
      if (proj && proj.project && proj.project.inputs) prefill(proj.project.inputs);
    } catch (e) { /* ignore */ }
    try { await saveInputs(pid, collectInputs(ids)); } catch (e) { console.error(e); }
  }
});
