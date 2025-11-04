document.getElementById('logoutBtn').addEventListener('click', function() {
    window.location.href = '/login.html';
});

function updateTestSummary() {
    fetch('/api/get-test-summary')
        .then(response => response.json())
        .then(data => {
            const summaryContainer = document.getElementById('testSummary');
            summaryContainer.innerHTML = data.map(item => `
                <div class="summary-item">
                    <span class="test-name">${item.tests}:</span>
                    <span class="test-count">${item.count}</span>
                </div>
            `).join('');
        })
        .catch(error => console.error('Error fetching test summary:', error));
}

// Call when page loads
window.addEventListener('load', updateTestSummary);

// Submit button handling
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
              'p1','p2','p3','l1','l2','l3','vel','ia','sa','sr','aspectRatio',
              'rimDiameter','rimWidth','nominalWidth','outerDiameter'
            ];
            await saveInputs(pid, collectInputs(ids));
        }
    } catch (e) {
        console.warn('Failed to save inputs for project:', e);
    }

    // Check if project already exists before proceeding
    const projectName = sessionStorage.getItem('currentProject') || 'DefaultProject';
    checkProjectExists(projectName, 'MF62');
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
            const uploadResp = await fetch('/api/upload-mesh-file', {
                method: 'POST',
                body: formData
            });
            const uploadData = await uploadResp.json();
            if (!uploadData.success) {
                throw new Error(uploadData.message || 'Failed to upload mesh file');
            }
            // Continue with Excel processing after successful mesh file upload
            await processMFExcel();
        } else {
            // Proceed without mesh file upload
            await processMFExcel();
        }

        // ✅ Generate batch file AFTER creating folders
        const projectName = sessionStorage.getItem('currentProject');
        const protocolName = 'MF62';
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
        errorMessage.textContent = error.message || 'Error uploading mesh file. Please try again.';
    }
}

// Extract Excel processing to a separate function
function processMFExcel() {
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
                  const replacements = {
                    'P1': document.getElementById('p1').value.trim() || null,
                    'P2': document.getElementById('p2').value.trim() || null,
                    'P3': document.getElementById('p3').value.trim() || null,
                    'L1': document.getElementById('l1').value.trim() || null,
                    'L2': document.getElementById('l2').value.trim() || null,
                    'L3': document.getElementById('l3').value.trim() || null,
                    'VEL': document.getElementById('vel').value.trim() || null,
                    'Vel': document.getElementById('vel').value.trim() || null,
                    'vel': document.getElementById('vel').value.trim() || null
                };

                const iaValue = document.getElementById('ia').value.trim();
                const srValue = document.getElementById('sr').value.trim();
                const saValue = document.getElementById('sa').value.trim();

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

                        // Case-insensitive velocity check
                        if (cellStr.toLowerCase() === 'vel') {
                            return document.getElementById('vel').value.trim();
                        }

                        // Handle special values
                        if (cellStr === 'IA') return iaValue;
                        if (cellStr === '-IA') return (-Math.abs(parseFloat(iaValue))).toString();
                        if (cellStr === 'SR') return srValue;
                        if (cellStr === '-SR') return (-Math.abs(parseFloat(srValue))).toString();
                        if (cellStr === 'SA') return saValue;
                        if (cellStr === '-SA') return (-Math.abs(parseFloat(saValue))).toString();

                        // Handle direct replacements
                        if (replacements.hasOwnProperty(cellStr) && replacements[cellStr] !== null) {
                            return replacements[cellStr];
                        }
                        
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

                const modifiedWorksheet = XLSX.utils.aoa_to_sheet(newSheet);
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
                        
                        const headerRow = jsonData[headerRowIndex];
                        const columns = {
                            runs: headerRow.indexOf('Number Of Tests'),
                            tests: headerRow.indexOf('Tests'),
                            ips: headerRow.indexOf('Inflation Pressure [PSI]'),
                            loads: headerRow.indexOf('Loads[Kg]'),
                            inclination_angle: headerRow.indexOf('Inclination Angle[°]'),
                            slip_angle: headerRow.indexOf('Slip Angle[°]'),
                            slip_ratio: headerRow.indexOf('Slip Ratio [%]'),
                            test_velocity: headerRow.indexOf('Test Velocity [Kmph]'),
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
                            if (!row || !row[columns.runs]) continue;

                            extractedData.push({
                                number_of_runs: parseInt(row[columns.runs]),
                                tests: row[columns.tests]?.toString() || '',
                                ips: row[columns.ips]?.toString() || '',
                                loads: row[columns.loads]?.toString() || '',
                                inclination_angle: row[columns.inclination_angle]?.toString() || '',
                                slip_angle: row[columns.slip_angle]?.toString() || '',
                                slip_ratio: row[columns.slip_ratio]?.toString() || '',
                                test_velocity: row[columns.test_velocity]?.toString() || '',
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
                    return fetch('/api/store-excel-data', {
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
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify(parameterData)
            });
        })        .then(response => response.json())
        .then(data => {
            if (!data.success) {
                throw new Error(data.message || 'Error generating parameter file');
            }
            
            // Create protocol-based folder structure immediately
            const projectName = sessionStorage.getItem('currentProject') || 'DefaultProject';
            return fetch('/api/create-protocol-folders', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({
                    projectName: projectName,
                    protocol: 'MF62'
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
            body: JSON.stringify({ projectId: pid, protocol: 'MF62' })
        });
    }
    return { ok: true };
})
.then(() => {
    // Generate batch file after project creation
    return fetch('/api/generate-batch-file', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
            projectName: sessionStorage.getItem('currentProject'),
            protocol: 'MF62'
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
  'p1','p2','p3','l1','l2','l3','vel','ia','sa','sr','aspectRatio',
  'rimDiameter','rimWidth','nominalWidth','outerDiameter'
];
  const pid = getProjectId();
  if (pid) {
        // Try to fetch saved inputs and prefill the form if available
        try {
            const proj = await fetchProject(pid);
            if (proj && proj.project && proj.project.inputs) {
                prefill(proj.project.inputs);
            }
        } catch (e) {
            console.warn('No saved inputs to prefill:', e);
        }
        try { await saveInputs(pid, collectInputs(ids)); } catch (e) { console.error(e); }
      }
    });