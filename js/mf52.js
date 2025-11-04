document.getElementById('logoutBtn').addEventListener('click', function() {
    window.location.href = '/login.html';
});

function updateTestSummary() {
    fetch('/api/get-mf52-summary')  // Changed from /api/get-test-summary to use the correct endpoint
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
          'p2', 'l1', 'l2', 'l3', 'vel', 'ia', 'sa', 'sr', 'aspectRatio'
        ];
        await saveInputs(pid, collectInputs(ids));
      }
    } catch (e) {
      console.warn('Failed to save inputs for project:', e);
    }

    const projectName = sessionStorage.getItem('currentProject') || 'DefaultProject';
    checkProjectExists(projectName, 'MF52');
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
            // Continue with Excel processing after successful mesh file upload
        }
        
        // Extract Excel processing to a separate function
        const errorMessage = document.getElementById('errorMessage');
        
        const parameterData = {
            load1_kg: document.getElementById('l1').value,
            load2_kg: document.getElementById('l2').value,
            load3_kg: document.getElementById('l3').value,
            pressure2: document.getElementById('p2').value,
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
        
        const excelResponse = await fetch('/api/read-protocol-excel');
        const excelData = await excelResponse.arrayBuffer();
        const workbook = XLSX.read(new Uint8Array(excelData), {type: 'array'});
        const outputWorkbook = XLSX.utils.book_new();
        
        workbook.SheetNames.forEach((sheetName) => {
            const worksheet = workbook.Sheets[sheetName];
            const jsonData = XLSX.utils.sheet_to_json(worksheet, {header: 1});
            
            // Replace values in the sheet
            const replacements = {
                'P2': document.getElementById('p2').value.trim() || null,
                'L1': document.getElementById('l1').value.trim() || null,
                'L2': document.getElementById('l2').value.trim() || null,
                'L3': document.getElementById('l3').value.trim() || null,
                'VEL': document.getElementById('vel').value.trim() || null,
                'Vel': document.getElementById('vel').value.trim() || null,
                'vel': document.getElementById('vel').value.trim() || null,
            };

            const iaValue = document.getElementById('ia').value.trim();
            const srValue = document.getElementById('sr').value.trim();
            const saValue = document.getElementById('sa').value.trim();

            // Create new sheet with replacements and preserve original P/L values
            const newSheet = jsonData.map((row, rowIndex) => {
                if (!Array.isArray(row)) return row;
                
                const originalPValues = [];
                const originalLValues = [];
                
                const modifiedRow = row.map(cell => {
                    if (cell === null || cell === undefined) return cell;
                    const cellStr = String(cell).trim();
                    
                    if (cellStr.match(/^P[1-3]$/)) {
                        originalPValues.push(cellStr);
                    }
                    
                    if (cellStr.match(/^L[1-5]$/)) {
                        originalLValues.push(cellStr);
                    }

                    if (cellStr.toLowerCase() === 'vel') {
                        return document.getElementById('vel').value.trim();
                    }

                    if (cellStr === 'IA') return iaValue;
                    if (cellStr === '-IA') return (-Math.abs(parseFloat(iaValue))).toString();
                    if (cellStr === 'SR') return srValue;
                    if (cellStr === '-SR') return (-Math.abs(parseFloat(srValue))).toString();
                    if (cellStr === 'SA') return saValue;
                    if (cellStr === '-SA') return (-Math.abs(parseFloat(saValue))).toString();

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

        const excelBuffer = XLSX.write(outputWorkbook, { bookType: 'xlsx', type: 'array' });
        const formData = new FormData();
        formData.append('excelFile', new Blob([excelBuffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' }), 'output.xlsx');

        const saveResponse = await fetch('/api/save-excel', {
            method: 'POST',
            body: formData
        });
        const saveData = await saveResponse.json();
        if (!saveData.success) {
            throw new Error(saveData.message || 'Error storing data');
        }

        const outputResponse = await fetch('/api/read-output-excel');
        const outputData = await outputResponse.arrayBuffer();
        const outputWorkbookData = XLSX.read(new Uint8Array(outputData), {type: 'array'});
        const extractedData = [];

        outputWorkbookData.SheetNames.forEach((sheetName) => {
            const worksheet = outputWorkbookData.Sheets[sheetName];
            const jsonData = XLSX.utils.sheet_to_json(worksheet, {header: 1});
            
            let headerRowIndex = jsonData.findIndex(row => 
                row && row.includes('Number Of Tests'));
            
            if (headerRowIndex === -1) return;
            
            const headerRow = jsonData[headerRowIndex];
            const columns = {
                runs: headerRow.indexOf('Number Of Tests'),
                tests: headerRow.indexOf('Tests'),
                inflation_pressure: headerRow.indexOf('Inflation Pressure [PSI]'),
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

            for (let i = headerRowIndex + 1; i < jsonData.length; i++) {
                const row = jsonData[i];
                if (!row || !row[columns.runs]) continue;

                extractedData.push({
                    number_of_runs: parseInt(row[columns.runs]),
                    tests: row[columns.tests]?.toString() || '',
                    inflation_pressure: row[columns.inflation_pressure]?.toString() || '',
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

        const storeResponse = await fetch('/api/store-mf52-data', {
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
                protocol: 'MF52'
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
                body: JSON.stringify({ projectId: pid, protocol: 'MF52' })
            });
            const matrixData = await matrixResponse.json();
            if (!matrixData.success) {
                throw new Error(matrixData.message || 'Error storing project matrix');
            }
        }
        
        // ✅ Generate batch file AFTER creating folders
        const batchResponse = await fetch('/api/generate-batch-file', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                projectName: projectName,
                protocol: 'MF52'
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
// ==== end helpers ====

document.addEventListener('DOMContentLoaded', async () => {
  const ids = [
    'rimWidth', 'rimDiameter', 'nominalWidth', 'outerDiameter',
    'p2', 'l1', 'l2', 'l3', 'vel', 'ia', 'sa', 'sr', 'aspectRatio'
  ];
  const pid = getProjectId();
  if (pid) {
    try {
      const proj = await fetchProject(pid);
      if (proj && proj.project && proj.project.inputs) prefill(proj.project.inputs);
    } catch (e) { /* ignore */ }
    if (pid) {
      try { await saveInputs(pid, collectInputs(ids)); } catch (e) { console.error(e); }
    }
  }
});