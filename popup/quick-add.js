// Get URL parameters
const urlParams = new URLSearchParams(window.location.search);
const selectedWord = urlParams.get('word');

// DOM Elements
const newWordInput = document.getElementById('newWord');
const englishMeaningInput = document.getElementById('englishMeaning');
const chineseMeaningInput = document.getElementById('chineseMeaning');
const addWordButton = document.getElementById('addWord');
const cancelButton = document.getElementById('cancelBtn');

// Pre-fill the word input
newWordInput.value = selectedWord;

// Add word handler
addWordButton.addEventListener('click', async () => {
  const word = newWordInput.value.trim().toLowerCase();
  const englishMeaning = englishMeaningInput.value.trim();
  const chineseMeaning = chineseMeaningInput.value.trim();

  if (!word || !englishMeaning || !chineseMeaning) {
    alert('Please fill in all fields');
    return;
  }

  // Get existing words
  const storage = await chrome.storage.local.get(['words']);
  const words = storage.words || [];

  // Check if word already exists
  const existingWord = words.find(w => w.word.toLowerCase() === word.toLowerCase());
  if (existingWord) {
    if (!confirm('This word already exists. Do you want to update it?')) {
      return;
    }
    // Update existing word
    existingWord.englishMeaning = englishMeaning;
    existingWord.chineseMeaning = chineseMeaning;
  } else {
    // Add new word
    words.push({
      word,
      englishMeaning,
      chineseMeaning,
      familiarity: 0,
      reviewCount: 0
    });
  }

  // Save to storage
  await chrome.storage.local.set({ words });

  // Close the popup
  window.close();
});

// Cancel button handler
cancelButton.addEventListener('click', () => {
  window.close();
});

// Handle Enter key
document.addEventListener('keydown', (e) => {
  if (e.key === 'Enter' && document.activeElement !== addWordButton) {
    if (document.activeElement === englishMeaningInput) {
      chineseMeaningInput.focus();
    } else if (document.activeElement === chineseMeaningInput) {
      addWordButton.click();
    }
  } else if (e.key === 'Escape') {
    window.close();
  }
}); 