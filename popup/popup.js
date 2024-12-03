// Word data structure
class Word {
  constructor(word, englishMeaning, chineseMeaning) {
    this.word = word;
    this.englishMeaning = englishMeaning;
    this.chineseMeaning = chineseMeaning;
    this.familiarity = 0; // 0 to 5, 0 being unfamiliar
    this.reviewCount = 0;
  }
}

// DOM Elements
const newWordInput = document.getElementById('newWord');
const englishMeaningInput = document.getElementById('englishMeaning');
const chineseMeaningInput = document.getElementById('chineseMeaning');
const addWordButton = document.getElementById('addWord');
const wordList = document.getElementById('wordList');
const toggleHighlightButton = document.getElementById('toggleHighlight');
const csvFileInput = document.getElementById('csvFile');
const importCsvButton = document.getElementById('importCsv');
const downloadTemplateButton = document.getElementById('downloadTemplate');
const sortBySelect = document.getElementById('sortBy');
const searchInput = document.getElementById('searchWord');
const clearSearchButton = document.getElementById('clearSearch');

// Statistics Elements
const totalWordsEl = document.getElementById('totalWords');
const masteredWordsEl = document.getElementById('masteredWords');
const reviewNeededEl = document.getElementById('reviewNeeded');
const progressFillEl = document.getElementById('progressFill');

let isHighlightingEnabled = false;
let currentSearchTerm = '';

// Initialize the popup
document.addEventListener('DOMContentLoaded', async () => {
  // Load highlighting state
  const state = await chrome.storage.local.get(['highlightingEnabled']);
  isHighlightingEnabled = state.highlightingEnabled || false;
  updateToggleButton();
  
  // Load and display words
  loadWords();
});

// Add new word
addWordButton.addEventListener('click', async () => {
  const word = newWordInput.value.trim().toLowerCase();
  const englishMeaning = englishMeaningInput.value.trim();
  const chineseMeaning = chineseMeaningInput.value.trim();

  if (!word) {
    alert('Please enter a word');
    return;
  }

  const newWord = {
    word,
    englishMeaning,
    chineseMeaning,
    familiarity: 0,
    reviewCount: 0
  };

  await saveWord(newWord);
  
  // Clear inputs
  newWordInput.value = '';
  englishMeaningInput.value = '';
  chineseMeaningInput.value = '';
  
  // Refresh word list
  loadWords();
});

// CSV Import button click handler
importCsvButton.addEventListener('click', () => {
  csvFileInput.click();
});

// Helper function to process meanings
function processMeanings(meanings) {
  if (!Array.isArray(meanings)) {
    meanings = [meanings];
  }
  
  return meanings
    .map(m => (m || '').toString().trim())
    .filter(m => m)  // Remove empty lines
    .filter(m => !m.match(/^(名词:|动词:|形容词:|副词:|时态:)$/))  // Remove category headers
    .map(m => m.replace(/^[- ]+/, '').trim())  // Remove leading dashes and spaces
    .join('\n');  // Join with newlines
}

// Helper function to clean CSV cell content
function cleanCellContent(content) {
  if (!content) return '';
  return content
    .split(/[\n\r]+/)  // Split by line breaks
    .map(line => line.trim())
    .filter(line => line && 
      !line.match(/^(名词:|动词:|形容词:|副词:|时态:|sweeper|swept|sweeping|sweeps)$/))  // Filter out headers and conjugations
    .map(line => line.replace(/^[- ]+/, '').trim())  // Remove leading dashes and spaces
    .filter(Boolean)  // Remove empty lines
    .join('\n');  // Join back with newlines
}

// CSV file input change handler
csvFileInput.addEventListener('change', async (event) => {
  const file = event.target.files[0];
  if (file) {
    const reader = new FileReader();
    
    reader.onload = async (e) => {
      try {
        const decoder = new TextDecoder('utf-8');
        const text = decoder.decode(e.target.result);
        
        // Split into lines while preserving newlines within quoted fields
        const lines = [];
        let currentLine = [];
        let inQuotes = false;
        let currentField = '';
        
        for (let i = 0; i < text.length; i++) {
          const char = text[i];
          
          if (char === '"') {
            inQuotes = !inQuotes;
            currentField += char;
          } else if (char === ',' && !inQuotes) {
            currentLine.push(currentField);
            currentField = '';
          } else if ((char === '\n' || char === '\r') && !inQuotes) {
            if (currentField) {
              currentLine.push(currentField);
              currentField = '';
            }
            if (currentLine.length > 0) {
              lines.push(currentLine);
              currentLine = [];
            }
          } else {
            currentField += char;
          }
        }
        
        // Add the last field and line if any
        if (currentField) {
          currentLine.push(currentField);
        }
        if (currentLine.length > 0) {
          lines.push(currentLine);
        }

        const newWords = new Map();
        const errors = [];
        
        // Skip header if present
        const startIndex = lines[0].some(field => 
          field.toLowerCase().includes('word') || 
          field.toLowerCase().includes('meaning')) ? 1 : 0;
        
        // Process each line
        for (let i = startIndex; i < lines.length; i++) {
          const fields = lines[i].map(field => 
            field.trim().replace(/^"|"$/g, '')  // Remove quotes
          );
          
          const [word, englishMeaning, chineseMeaning] = fields;
          const cleanedWord = cleanWord(word);
          
          if (cleanedWord && isValidEnglishWord(cleanedWord)) {
            newWords.set(cleanedWord.toLowerCase(), {
              word: cleanedWord.toLowerCase(),
              englishMeaning: cleanCellContent(englishMeaning),
              chineseMeaning: cleanCellContent(chineseMeaning),
              familiarity: 0,
              reviewCount: 0
            });
          }
        }
        
        // Convert Map to Array and save
        const uniqueNewWords = Array.from(newWords.values());
        
        if (uniqueNewWords.length > 0) {
          const storage = await chrome.storage.local.get(['words']);
          const existingWords = storage.words || [];
          
          let duplicates = 0;
          let updated = 0;
          const finalWords = [...existingWords];
          
          uniqueNewWords.forEach(newWord => {
            const existingIndex = finalWords.findIndex(
              w => w.word.toLowerCase() === newWord.word.toLowerCase()
            );
            
            if (existingIndex === -1) {
              finalWords.push(newWord);
            } else {
              let wasUpdated = false;
              if (newWord.englishMeaning && !finalWords[existingIndex].englishMeaning) {
                finalWords[existingIndex].englishMeaning = newWord.englishMeaning;
                wasUpdated = true;
              }
              if (newWord.chineseMeaning && !finalWords[existingIndex].chineseMeaning) {
                finalWords[existingIndex].chineseMeaning = newWord.chineseMeaning;
                wasUpdated = true;
              }
              if (wasUpdated) updated++;
              duplicates++;
            }
          });
          
          await chrome.storage.local.set({ words: finalWords });
          
          const message = `Successfully imported ${uniqueNewWords.length - duplicates} new words.\n` +
                         `${duplicates} duplicates found.\n` +
                         `${updated} existing words updated with new meanings.\n` +
                         `Total words in dictionary: ${finalWords.length}`;
          alert(message);
          
          loadWords();
        }
      } catch (error) {
        console.error('Import error:', error);
        alert('Error importing file. Please check the format.');
      }
    };
    
    reader.readAsArrayBuffer(file);
  }
});

// Download template
downloadTemplateButton.addEventListener('click', () => {
  const template = '\uFEFF' + // Add BOM for Excel UTF-8 compatibility
                  'word,english_meaning(optional),chinese_meaning(optional)\n' +
                  'example,an illustration,例子\n' +
                  'hello,a greeting,你好\n' +
                  'world,the earth and all life on it,世界\n' +
                  'learn,to gain knowledge,学习\n' +
                  'book,,书';
  
  const blob = new Blob([template], { type: 'text/csv;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  
  const a = document.createElement('a');
  a.href = url;
  a.download = 'word-list-template.csv';
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
});

// Toggle highlighting
toggleHighlightButton.addEventListener('click', async () => {
  isHighlightingEnabled = !isHighlightingEnabled;
  await chrome.storage.local.set({ highlightingEnabled: isHighlightingEnabled });
  
  // Send message to content script
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (tab?.id) {
    chrome.tabs.sendMessage(tab.id, { 
      action: 'toggleHighlight', 
      enabled: isHighlightingEnabled 
    });
  }
  
  updateToggleButton();
});

// Sort change handler
sortBySelect.addEventListener('change', loadWords);

// Save word to storage
async function saveWord(wordObj) {
  const storage = await chrome.storage.local.get(['words']);
  const words = storage.words || [];
  words.push(wordObj);
  await chrome.storage.local.set({ words });
}

// Update statistics
async function updateStatistics() {
  const storage = await chrome.storage.local.get(['words']);
  const words = storage.words || [];
  
  const total = words.length;
  const mastered = words.filter(w => w.familiarity >= 4).length;
  const needReview = words.filter(w => w.familiarity <= 2).length;
  
  totalWordsEl.textContent = total;
  masteredWordsEl.textContent = mastered;
  reviewNeededEl.textContent = needReview;
  
  const progressPercentage = total > 0 ? (mastered / total) * 100 : 0;
  progressFillEl.style.width = `${progressPercentage}%`;
}

// Load and display words
async function loadWords() {
  const storage = await chrome.storage.local.get(['words']);
  const words = storage.words || [];
  
  // Filter words based on search term
  let filteredWords = words;
  if (currentSearchTerm) {
    filteredWords = words.filter(word => 
      word.word.toLowerCase().includes(currentSearchTerm) ||
      word.englishMeaning?.toLowerCase().includes(currentSearchTerm) ||
      word.chineseMeaning?.toLowerCase().includes(currentSearchTerm)
    );
  }
  
  // Sort filtered words
  const sortedWords = sortWords(filteredWords, sortBySelect.value);
  
  // Clear current list
  wordList.innerHTML = '';
  
  if (filteredWords.length === 0 && currentSearchTerm) {
    wordList.innerHTML = `
      <div class="no-results">
        No words found matching "${currentSearchTerm}"
      </div>
    `;
    return;
  }
  
  // Create word elements
  sortedWords.forEach(word => {
    const wordElement = createWordElement(word);
    wordList.appendChild(wordElement);
  });
  
  // Update statistics (only show stats for total collection, not filtered)
  updateStatistics();
}

// Sort words
function sortWords(words, sortBy) {
  switch (sortBy) {
    case 'familiarity':
      return [...words].sort((a, b) => a.familiarity - b.familiarity);
    case 'alphabetical':
      return [...words].sort((a, b) => a.word.localeCompare(b.word));
    case 'recent':
      return [...words].sort((a, b) => b.reviewCount - a.reviewCount);
    default:
      return words;
  }
}

// Update toggle button state
function updateToggleButton() {
  toggleHighlightButton.textContent = isHighlightingEnabled ? 
    'Disable Highlighting' : 'Enable Highlighting';
  toggleHighlightButton.className = isHighlightingEnabled ? 
    'active' : '';
}

// Create word element (your existing createWordElement function)
function createWordElement(wordObj) {
  const div = document.createElement('div');
  div.className = 'word-item';
  
  div.innerHTML = `
    <div class="word-content">
      <div class="word-header">
        <strong>${wordObj.word}</strong>
        <div class="word-actions">
          <button class="review-btn know-btn" title="I know this word">✓</button>
          <button class="review-btn dont-know-btn" title="I don't know this word">✗</button>
          <button class="delete-word" title="Delete word">🗑️</button>
        </div>
      </div>
      <div class="meanings">
        ${wordObj.englishMeaning ? `<div class="english-meaning">EN: ${wordObj.englishMeaning.replace(/\n/g, '<br>')}</div>` : ''}
        ${wordObj.chineseMeaning ? `<div class="chinese-meaning">CN: ${wordObj.chineseMeaning.replace(/\n/g, '<br>')}</div>` : ''}
      </div>
      <span class="familiarity">
        Familiarity: ${wordObj.familiarity}/5
      </span>
    </div>
  `;

  // Add review handlers
  const knowBtn = div.querySelector('.know-btn');
  const dontKnowBtn = div.querySelector('.dont-know-btn');

  knowBtn.addEventListener('click', async (e) => {
    e.stopPropagation();
    await updateWordFamiliarity(wordObj.word, true);
    loadWords(); // Refresh the list to show updated familiarity
  });

  dontKnowBtn.addEventListener('click', async (e) => {
    e.stopPropagation();
    await updateWordFamiliarity(wordObj.word, false);
    loadWords(); // Refresh the list to show updated familiarity
  });

  // Add delete handler
  const deleteBtn = div.querySelector('.delete-word');
  deleteBtn.addEventListener('click', async (e) => {
    e.stopPropagation();
    if (confirm(`Are you sure you want to delete "${wordObj.word}"?`)) {
      const storage = await chrome.storage.local.get(['words']);
      const words = storage.words || [];
      const newWords = words.filter(w => w.word.toLowerCase() !== wordObj.word.toLowerCase());
      await chrome.storage.local.set({ words: newWords });
      loadWords();
      
      const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
      if (tab?.id) {
        chrome.tabs.sendMessage(tab.id, { 
          action: 'toggleHighlight',
          enabled: isHighlightingEnabled
        });
      }
    }
  });
  
  return div;
}

// Update word familiarity
async function updateWordFamiliarity(word, known) {
  const storage = await chrome.storage.local.get(['words']);
  const words = storage.words || [];
  
  const wordIndex = words.findIndex(w => w.word.toLowerCase() === word.toLowerCase());
  if (wordIndex !== -1) {
    words[wordIndex].reviewCount++;
    if (known) {
      words[wordIndex].familiarity = Math.min(5, words[wordIndex].familiarity + 1);
    } else {
      words[wordIndex].familiarity = Math.max(0, words[wordIndex].familiarity - 1);
    }
    await chrome.storage.local.set({ words });
  }
}

// Helper function to check if a string contains Chinese characters
function containsChinese(str) {
  return /[\u4E00-\u9FFF]/.test(str);
}

// Helper function to check if a string is a valid English word
function isValidEnglishWord(str) {
  // Updated regex to properly handle hyphenated words and compound words
  const validWordPattern = /^[a-zA-Z]+(?:['|-][a-zA-Z]+)*$/;
  const commonTLDs = /^(?:com|org|net|edu|gov|mil|int|eu)$/;
  
  return str.length >= 2 && 
         validWordPattern.test(str) && 
         !str.includes('optional') &&
         !commonTLDs.test(str.toLowerCase());
}

// Helper function to clean word from dictionary format
function cleanWord(str) {
  if (!str) return '';
  
  // Remove everything after comma or semicolon, but preserve hyphens
  let word = str.split(/[,;]/)[0];
  // Remove any punctuation except hyphens and apostrophes
  word = word.trim().replace(/[^a-zA-Z\-']/g, '');
  // Handle multiple hyphens or apostrophes
  word = word.replace(/[-']{2,}/g, '-');
  // Remove leading/trailing hyphens or apostrophes
  word = word.replace(/^[-']|[-']$/g, '');
  
  return isValidEnglishWord(word) ? word : '';
}

// Helper function to extract meaning from dictionary format
function extractMeaning(str) {
  // Get everything after the first comma or dash
  const meaningPart = str.split(/[,\-]/).slice(1).join(',');
  return meaningPart ? meaningPart.trim() : '';
}

// Add search functionality
searchInput.addEventListener('input', (e) => {
  currentSearchTerm = e.target.value.toLowerCase();
  loadWords(); // This will now filter based on search term
});

clearSearchButton.addEventListener('click', () => {
  searchInput.value = '';
  currentSearchTerm = '';
  loadWords();
  searchInput.focus();
});

// Add styles for no results message
const style = document.createElement('style');
style.textContent = `
  .no-results {
    padding: 16px;
    text-align: center;
    color: #666;
    font-style: italic;
  }
`;
document.head.appendChild(style);

// Add keyboard shortcuts
document.addEventListener('keydown', (e) => {
  // Focus search box with Ctrl/Cmd + F
  if ((e.ctrlKey || e.metaKey) && e.key === 'f') {
    e.preventDefault();
    searchInput.focus();
  }
  
  // Clear search with Escape
  if (e.key === 'Escape' && document.activeElement === searchInput) {
    searchInput.value = '';
    currentSearchTerm = '';
    loadWords();
  }
}); 