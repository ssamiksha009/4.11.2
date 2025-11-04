document.getElementById('logoutBtn').addEventListener('click', function() {
    window.location.href = '/login.html';
});

function updateTestSummary() {
    fetch('/api/get-custom-summary')
        .then(response => response.json())
        .then(data => {
            const summaryContainer = document.getElementById('testSummary');
            if (!data || data.length === 0) {
                summaryContainer.innerHTML = '<div class="summary-item">No tests available</div>';
                return;
            }
            
            summaryContainer.innerHTML = data.map(item => `
                <div class="summary-item">
                    <span class="test-name">${item.tests || 'Unknown'}:</span>
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

// Call when page loads
window.addEventListener('load', updateTestSummary);

// Submit button handling
document.getElementById('submitBtn').addEventListener('click', async function() {
    const errorMessage = document.getElementById('errorMessage');
    // reset error UI
    if (errorMessage) {
        errorMessage.textContent = '';
        errorMessage.style.color = '';
        errorMessage.style.display = 'none';
    }

    // Validate required inputs (keep simple: only HTML required fields)
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
        if (errorMessage) {
            errorMessage.style.color = '#d9534f';
            errorMessage.textContent = 'Please correct the highlighted errors before submitting.';
            errorMessage.style.display = 'block';
        }
        return;
    }

    // Persist current input values into projects.inputs when projectId present
    try {
      const pid = getProjectId();
      if (pid) {
        const ids = [
          'rimWidth', 'rimDiameter', 'nominalWidth', 'outerDiameter',
          'p1', 'p2', 'p3', 'l1', 'l2', 'l3', 'l4', 'l5',
          'vel', 'ia', 'sa', 'sr', 'aspectRatio'
        ];
        await saveInputs(pid, collectInputs(ids));
      }
    } catch (e) {
      console.warn('Failed to save inputs for project:', e);
    }

    // Check if project already exists before proceeding
    const projectName = sessionStorage.getItem('currentProject') || 'DefaultProject';
    checkProjectExists(projectName, 'Custom');
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
        // Check for mesh file and upload if present
        const meshFile = document.getElementById('meshFile').files[0];
        if (meshFile) {
            const meshFormData = new FormData();
            meshFormData.append('meshFile', meshFile);
            
            const meshResponse = await fetch('/api/upload-mesh-file', {
                method: 'POST',
                body: meshFormData
            });
            
            const meshData = await meshResponse.json();
            if (!meshData.success) {
                throw new Error(meshData.message || 'Failed to upload mesh file');
            }
            // Continue with Excel processing
            await processCustomExcel();
        } else {
            // No mesh file, proceed directly with Excel processing
            await processCustomExcel();
        }
        
        const projectName = sessionStorage.getItem('currentProject') || 'DefaultProject';
        const protocolName = 'Custom'; // or derive from context
        // ✅ Generate batch file AFTER creating folders
        const batchResponse = await fetch('/api/generate-batch-file', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                projectName: projectName,
                protocol: protocolName // e.g., 'MF62', 'FTire', etc.
            })
        });
        
        const batchData = await batchResponse.json();
        
        if (batchData.success) {
            console.log(`✅ Batch file generated: ${batchData.testCount} commands`);
        } else {
            console.warn(`⚠️ Batch file generation failed: ${batchData.message}`);
        }
        
    } catch (error) {
        const errorMessage = document.getElementById('errorMessage');
        errorMessage.style.color = '#d9534f';
        errorMessage.textContent = error.message || 'Error processing submission. Please try again.';
    }
}

// Extract Excel processing to a separate function
function processCustomExcel() {
    const errorMessage = document.getElementById('errorMessage');
    
    // Continue with Excel processing
    fetch('/api/read-protocol-excel')
        .then(response => response.arrayBuffer())
        .then(data => {
            const workbook = XLSX.read(new Uint8Array(data), {type: 'array'});
            const outputWorkbook = XLSX.utils.book_new();
            
            workbook.SheetNames.forEach((sheetName) => {
                const worksheet = workbook.Sheets[sheetName];
                const jsonData = XLSX.utils.sheet_to_json(worksheet, {header: 1});
                
                // Replace values in the sheet
                const replacements = {
                    'P1': document.getElementById('p1').value.trim() || null,
                    'P2': document.getElementById('p2').value.trim() || null,
                    'P3': document.getElementById('p3').value.trim() || null,
                    'L1': document.getElementById('l1').value.trim() || null,
                    'L2': document.getElementById('l2').value.trim() || null,
                    'L3': document.getElementById('l3').value.trim() || null,
                    'L4': document.getElementById('l4').value.trim() || null,
                    'L5': document.getElementById('l5').value.trim() || null,
                    'VEL': document.getElementById('vel').value.trim() || null,
                    'IPref': document.getElementById('p1').value.trim() || null
                };

                const iaValue = document.getElementById('ia').value.trim();
                const srValue = document.getElementById('sr').value.trim();
                const saValue = document.getElementById('sa').value.trim();

                // Create a new sheet while preserving all original data and adding original P/L values
                const newSheet = jsonData.map((row, rowIndex) => {
                    if (!Array.isArray(row)) return row;
                    
                    // Store original P and L values for this row
                    const originalPValues = [];
                    const originalLValues = [];
                    
                    const modifiedRow = row.map((cell, columnIndex) => {
                        if (cell === null || cell === undefined) return cell;
                        
                        const cellStr = String(cell).trim();
                        
                        // Store original P values before replacement
                        if (cellStr.match(/^P[1-3]$/) || cellStr.toLowerCase() === 'ipref') {
                            originalPValues.push(cellStr);
                        }
                        
                        // Store original L values before replacement
                        if (cellStr.match(/^L[1-5]$/)) {
                            originalLValues.push(cellStr);
                        }

                        // Handle IA replacements
                        if (cellStr === 'IA') {
                            return iaValue;
                        }
                        if (cellStr === '-IA') {
                            return (-Math.abs(parseFloat(iaValue))).toString();
                        }

                        // Handle SR replacements
                        if (cellStr === 'SR') {
                            return srValue;
                        }
                        if (cellStr === '-SR') {
                            return (-Math.abs(parseFloat(srValue))).toString();
                        }

                        // Handle SA replacements
                        if (cellStr === 'SA') {
                            return saValue;
                        }
                        if (cellStr === '-SA') {
                            return (-Math.abs(parseFloat(saValue))).toString();
                        }

                        // Handle IPref case-insensitively
                        if (cellStr.toLowerCase() === 'ipref') {
                            return document.getElementById('p1').value.trim() || cell;
                        }

                        // Handle Velocities
                        if (cellStr.toLowerCase() === 'vel') {
                            return replacements['VEL'];
                        }

                        // Handle other direct replacements
                        if (replacements.hasOwnProperty(cellStr) && replacements[cellStr] !== null) {
                            return replacements[cellStr];
                        }
                        
                        // Return original value for all other cells
                        return cell;
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

                // Convert the modified data back to a worksheet
                const modifiedWorksheet = XLSX.utils.aoa_to_sheet(newSheet);
                
                // Add the modified sheet to the output workbook
                XLSX.utils.book_append_sheet(outputWorkbook, modifiedWorksheet, sheetName);
            });

            // Instead of downloading, send to server
            const excelBuffer = XLSX.write(outputWorkbook, { bookType: 'xlsx', type: 'array' });
            
            // Create form data to send
            const formData = new FormData();
            formData.append('excelFile', new Blob([excelBuffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' }), 'output.xlsx');

            // Send to server
            return fetch('/api/save-excel', {
                method: 'POST',
                body: formData
            });
        })
        .then(response => response.json())
        .then(data => {
            if (!data.success) {
                throw new Error(data.message || 'Error storing data');
            }

            // Read the saved Excel file to extract and store data
            return fetch('/api/read-output-excel')
                .then(response => response.arrayBuffer())
                .then(data => {
                    const workbook = XLSX.read(new Uint8Array(data), {type: 'array'});
                    const extractedData = [];

                    workbook.SheetNames.forEach((sheetName) => {
                        const worksheet = workbook.Sheets[sheetName];
                        const jsonData = XLSX.utils.sheet_to_json(worksheet, {header: 1});
                        
                        // Find the header row
                        let headerRowIndex = jsonData.findIndex(row => 
                            row && row.includes('Number Of Tests'));
                        
                        if (headerRowIndex === -1) return;
                        
                        const headerRow = jsonData[headerRowIndex];                        const columns = {
                            runs: headerRow.indexOf('Number Of Tests'),
                            tests: headerRow.indexOf('Tests'),
                            ips: headerRow.indexOf('Inflation Pressure [PSI]'),
                            loads: headerRow.indexOf('Loads [Kg]'),
                            inclination_angle: headerRow.indexOf('Inclination Angle [°]'),
                            slip_angle: headerRow.indexOf('Slip Angle [°]'),
                            slip_ratio: headerRow.indexOf('Slip Ratio [%]'),
                            test_velocity: headerRow.indexOf('Test Velocity [Kmph]'),
                            cleat_orientation: headerRow.indexOf('Cleat Orientation (w.r.t axial direction) [°]'),
                            displacement: headerRow.indexOf('Displacement [mm]'),
                            job: headerRow.indexOf('Job'),
                            old_job: headerRow.indexOf('Old Job'),
                            template_tydex: headerRow.indexOf('Template Tydex'),
                            tydex_name: headerRow.indexOf('Tydex name')
                        };

                        // P and L columns are the next two columns after tydex_name
                        const pColumnIndex = columns.tydex_name + 1;
                        const lColumnIndex = columns.tydex_name + 2;

                        // Extract data rows
                        for (let i = headerRowIndex + 1; i < jsonData.length; i++) {
                            const row = jsonData[i];
                            if (!row || !row[columns.runs]) continue;                            extractedData.push({
                                number_of_runs: parseInt(row[columns.runs]),
                                tests: row[columns.tests]?.toString() || '',
                                inflation_pressure: row[columns.ips]?.toString() || '',
                                loads: row[columns.loads]?.toString() || '',
                                inclination_angle: row[columns.inclination_angle]?.toString() || '',
                                slip_angle: row[columns.slip_angle]?.toString() || '',
                                slip_ratio: row[columns.slip_ratio]?.toString() || '',
                                test_velocity: row[columns.test_velocity]?.toString() || '',
                                cleat_orientation: row[columns.cleat_orientation]?.toString() || '',
                                displacement: row[columns.displacement]?.toString() || '',
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
                        throw new Error('No valid data found in Excel file');
                    }

                    // Store the extracted data
                    return fetch('/api/store-custom-data', {
                        method: 'POST',
                        headers: {
                            'Content-Type': 'application/json'
                        },
                        body: JSON.stringify({ data: extractedData })
                    });
                });
        })
        .then(response => response.json())
        .then(data => {
            if (!data.success) {
                throw new Error(data.message || 'Error storing data');
            }

            // Generate parameters.inc file
            const parameterData = {
                load1_kg: document.getElementById('l1').value,
                load2_kg: document.getElementById('l2').value,
                load3_kg: document.getElementById('l3').value,
                load4_kg: document.getElementById('l4').value,
                load5_kg: document.getElementById('l5').value,
                pressure1: document.getElementById('p1').value,
                pressure2: document.getElementById('p2').value,
                pressure3: document.getElementById('p3').value,
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

            return fetch('/api/generate-parameters', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Referer': '/custom.html'
                },
                body: JSON.stringify(parameterData)
            });
        })
        .then(response => response.json())
        .then(data => {
            if (!data.success) {
                throw new Error(data.message || 'Error generating parameter file');
            }
            
            const projectName = sessionStorage.getItem('currentProject') || 'DefaultProject';
            return fetch('/api/create-protocol-folders', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({
                    projectName: projectName,
                    protocol: 'Custom'
                })
            });
        })
            .then(response => response.json())
    .then(data => {
        if (!data.success) {
            throw new Error(data.message || 'Error creating protocol folders');
        }
        
        // Save matrix to permanent project table
        const pid = getProjectId();
        if (pid) {
            return fetch('/api/store-project-matrix', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ projectId: pid, protocol: 'Custom' })
            });
        }
        return { ok: true };
    })
    .then(() => {
        return fetch('/api/generate-batch-file', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                projectName: sessionStorage.getItem('currentProject'),
                protocol: 'Custom'
            })
        });
    })
    .then(response => response.json())
    .then(data => {
        if (data.success) {
            console.log(`Batch file generated: ${data.testCount} tests`);
        }
        updateTestSummary();
        window.location.href = '/select.html';
    })
    .catch(error => {
        errorMessage.style.color = '#d9534f';
        errorMessage.textContent = error.message || 'Error processing file. Please try again.';
    });
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
    'p1', 'p2', 'p3', 'l1', 'l2', 'l3', 'l4', 'l5',
    'vel', 'ia', 'sa', 'sr', 'aspectRatio'
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