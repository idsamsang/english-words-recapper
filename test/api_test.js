// Eudic API configuration
const EUDIC_CONFIG = {
    baseUrl: 'https://api.frdic.com/api/open/v1',
    authorization: 'NIS c7RMA9e55NuUum0yj8RmhpITxMpEyZxv3wYQ7n4g6yYB4fCSsJuinQ=='
};

// Helper function to make API calls
async function callEudicAPI(endpoint, options = {}) {
    const defaultOptions = {
        headers: {
            'Authorization': EUDIC_CONFIG.authorization,
            'Content-Type': 'application/json'
        }
    };

    try {
        console.log('Making API call to:', `${EUDIC_CONFIG.baseUrl}${endpoint}`);
        console.log('With options:', { ...defaultOptions, ...options });
        
        const response = await fetch(`${EUDIC_CONFIG.baseUrl}${endpoint}`, {
            ...defaultOptions,
            ...options
        });

        console.log('Response status:', response.status);
        console.log('Response headers:', Object.fromEntries(response.headers.entries()));

        if (!response.ok) {
            throw new Error(`HTTP error! status: ${response.status}`);
        }

        const data = await response.json();
        return { success: true, data };
    } catch (error) {
        console.error('API call failed:', error);
        return { success: false, error: error.message };
    }
}

// Test authentication by getting study list
async function testAuth() {
    const resultElement = document.getElementById('auth-result');
    try {
        const result = await callEudicAPI('/studylist/category?language=en');
        if (result.success) {
            resultElement.innerHTML = `Authentication successful!\nResponse:\n${JSON.stringify(result.data, null, 2)}`;
            resultElement.className = 'success';
        } else {
            resultElement.innerHTML = `Authentication failed: ${result.error}`;
            resultElement.className = 'error';
        }
    } catch (error) {
        resultElement.innerHTML = `Error: ${error.message}`;
        resultElement.className = 'error';
    }
}

// Get study lists and populate selector
async function getStudyLists() {
    const resultElement = document.getElementById('studylist-result');
    const selectElement = document.getElementById('study-list-select');
    
    try {
        const result = await callEudicAPI('/studylist/category?language=en');
        if (result.success) {
            // Clear existing options except the first one
            while (selectElement.options.length > 1) {
                selectElement.remove(1);
            }
            
            // Add new options
            result.data.data.forEach(list => {
                const option = document.createElement('option');
                option.value = list.id;
                option.text = list.name;
                selectElement.add(option);
            });
            
            resultElement.innerHTML = JSON.stringify(result.data, null, 2);
            resultElement.className = 'success';
        } else {
            resultElement.innerHTML = `Failed to get study lists: ${result.error}`;
            resultElement.className = 'error';
        }
    } catch (error) {
        resultElement.innerHTML = `Error: ${error.message}`;
        resultElement.className = 'error';
    }
}

// Handle study list selection
function onStudyListSelect() {
    const selectElement = document.getElementById('study-list-select');
    if (selectElement.value) {
        document.getElementById('page-number').value = '1';
        getWordsFromList();
    }
}

// Get words from selected study list
async function getWordsFromList() {
    const resultElement = document.getElementById('words-result');
    const tableContainer = document.getElementById('words-table-container');
    const selectElement = document.getElementById('study-list-select');
    const pageNumber = document.getElementById('page-number').value;
    const pageSize = document.getElementById('page-size').value;
    
    if (!selectElement.value) {
        tableContainer.innerHTML = 'Please select a study list first';
        return;
    }
    
    try {
        const result = await callEudicAPI(
            `/studylist/words/${selectElement.value}?language=en&category_id=${selectElement.value}&page=${pageNumber}&page_size=${pageSize}`
        );
        
        if (result.success) {
            // Store raw data in hidden pre element
            resultElement.innerHTML = JSON.stringify(result.data, null, 2);
            
            // Create table
            const table = document.createElement('table');
            table.className = 'word-table';
            
            // Add header
            const thead = document.createElement('thead');
            const headerRow = document.createElement('tr');
            ['#', 'Word', 'Definition'].forEach(text => {
                const th = document.createElement('th');
                th.textContent = text;
                headerRow.appendChild(th);
            });
            thead.appendChild(headerRow);
            table.appendChild(thead);
            
            // Add body
            const tbody = document.createElement('tbody');
            result.data.data.forEach((word, index) => {
                const row = document.createElement('tr');
                
                // Number column
                const numCell = document.createElement('td');
                numCell.textContent = (pageNumber - 1) * pageSize + index + 1;
                row.appendChild(numCell);
                
                // Word column
                const wordCell = document.createElement('td');
                wordCell.textContent = word.word;
                row.appendChild(wordCell);
                
                // Definition column
                const defCell = document.createElement('td');
                defCell.textContent = word.exp;
                row.appendChild(defCell);
                
                tbody.appendChild(row);
            });
            table.appendChild(tbody);
            
            // Update container
            tableContainer.innerHTML = '';
            tableContainer.appendChild(table);
        } else {
            tableContainer.innerHTML = `Failed to get words: ${result.error}`;
        }
    } catch (error) {
        tableContainer.innerHTML = `Error: ${error.message}`;
    }
} 