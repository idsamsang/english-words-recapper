// Add stemming function at the top of the file
function getStemmedWord(word) {
  word = word.toLowerCase();
  
  // Only stem if the word is long enough
  if (word.length <= 3) return word;
  
  // Store original word to check against final result
  const originalWord = word;
  
  // Handle plural forms
  if (word.length > 4) {
    if (word.endsWith('ies')) {
      word = word.slice(0, -3) + 'y';  // stories -> story
    } else if (word.endsWith('es')) {
      word = word.slice(0, -2);  // boxes -> box
    } else if (word.endsWith('s')) {
      word = word.slice(0, -1);  // cats -> cat
    }
  }
  
  // If stemming would make the word too short, return original
  if (word.length <= 2) return originalWord;
  
  return word;
}

// Store for highlighted words and their data
let highlightedWords = new Map();
let wordData = new Map();
let isHighlightingEnabled = false;
let currentPopup = null;
let hoverTimer = null;
let currentHighlightedElement = null;

// Initialize highlighting with performance optimization
async function initializeHighlighting() {
  const state = await chrome.storage.local.get(['highlightingEnabled', 'words']);
  isHighlightingEnabled = state.highlightingEnabled || false;
  
  if (isHighlightingEnabled && state.words) {
    wordData = new Map(
      state.words.map(w => [w.word.toLowerCase(), w])
    );
    highlightedWords = new Map(wordData);
    await highlightWords(wordData);
  }
}

// Function to detect if page is in dark mode
function isDarkMode() {
  if (document.documentElement.getAttribute('data-theme') === 'dark') return true;
  
  if (window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches) {
    const bodyBg = window.getComputedStyle(document.body).backgroundColor;
    const htmlBg = window.getComputedStyle(document.documentElement).backgroundColor;
    
    const getRGB = (color) => {
      const match = color.match(/\d+/g);
      return match ? match.map(Number) : [255, 255, 255];
    };
    
    const isDark = (color) => {
      const [r, g, b] = getRGB(color);
      return (r + g + b) / 3 < 128;
    };
    
    return isDark(bodyBg) || isDark(htmlBg);
  }
  
  return false;
}

// Function to get highlight color based on familiarity
function getHighlightColor(familiarity) {
  const darkMode = isDarkMode();
  
  const lightModeColors = {
    0: '#FFE58F',
    1: '#FFF0B3',
    2: '#FFF4C1',
    3: '#FFF8D6',
    4: '#FFFBE8',
    5: '#FFFEFC'
  };
  
  const darkModeColors = {
    0: 'rgba(255, 196, 0, 0.8)',
    1: 'rgba(255, 196, 0, 0.65)',
    2: 'rgba(255, 196, 0, 0.5)',
    3: 'rgba(255, 196, 0, 0.35)',
    4: 'rgba(255, 196, 0, 0.25)',
    5: 'rgba(255, 196, 0, 0.15)'
  };
  
  const colors = darkMode ? darkModeColors : lightModeColors;
  return colors[familiarity] || colors[0];
}

// Function to get all text nodes under a node
function textNodesUnder(node) {
  let all = [];
  
  // Skip the word popup element and its children
  if (node.id === 'word-popup' || 
      (node.parentElement && node.parentElement.id === 'word-popup')) {
    return all;
  }

  const walk = document.createTreeWalker(
    node,
    NodeFilter.SHOW_TEXT,
    {
      acceptNode: function(node) {
        const parent = node.parentElement;
        if (!parent) return NodeFilter.FILTER_REJECT;
        
        // Skip script, style, and already highlighted elements
        const tagName = parent.tagName.toLowerCase();
        if (tagName === 'script' || 
            tagName === 'style' || 
            tagName === 'noscript' || 
            tagName === 'textarea' ||
            parent.classList.contains('highlighted-word') ||
            parent.id === 'word-popup' ||
            parent.closest('#word-popup')) {
          return NodeFilter.FILTER_REJECT;
        }
        
        // Skip empty text nodes
        if (!node.nodeValue.trim()) {
          return NodeFilter.FILTER_REJECT;
        }
        
        return NodeFilter.FILTER_ACCEPT;
      }
    }
  );

  let textNode;
  while (textNode = walk.nextNode()) {
    all.push(textNode);
  }
  
  return all;
}

// Function to highlight words in the page
async function highlightWords(words) {
  if (!isHighlightingEnabled || !words || words.size === 0) return;

  try {
    // Create a map of variations to original words
    const wordVariations = new Map();
    words.forEach((wordInfo, word) => {
      const wordLower = word.toLowerCase();
      
      // Add original word and its lowercase version
      wordVariations.set(wordLower, wordInfo);
      
      // Add adverb form (-ly)
      if (wordLower.length > 2) {
        // For words ending in 'y', change y to i before adding ly
        if (wordLower.endsWith('y')) {
          wordVariations.set(wordLower.slice(0, -1) + 'ily', wordInfo);
        }
        // For words ending in 'le', change le to ly
        else if (wordLower.endsWith('le')) {
          wordVariations.set(wordLower.slice(0, -2) + 'ly', wordInfo);
        }
        // For words ending in 'ic', add ally
        else if (wordLower.endsWith('ic')) {
          wordVariations.set(wordLower + 'ally', wordInfo);
        }
        // Regular -ly ending
        else {
          wordVariations.set(wordLower + 'ly', wordInfo);
        }
      }
      
      // Add plural variations
      if (!wordLower.endsWith('s')) {
        // Regular plural
        wordVariations.set(wordLower + 's', wordInfo);
        
        // Special cases for -y endings
        if (wordLower.endsWith('y')) {
          const withoutY = wordLower.slice(0, -1);
          wordVariations.set(withoutY + 'ies', wordInfo);
        }
        // Special cases for -es endings
        else if (wordLower.endsWith('s') || wordLower.endsWith('sh') || 
                wordLower.endsWith('ch') || wordLower.endsWith('x') || 
                wordLower.endsWith('z')) {
          wordVariations.set(wordLower + 'es', wordInfo);
        }
      }
      
      // Add past tense (-ed) variations
      if (wordLower.length > 3) { // Only add if word is long enough
        // Regular -ed
        wordVariations.set(wordLower + 'ed', wordInfo);
        
        // For words ending in 'e', just add 'd'
        if (wordLower.endsWith('e')) {
          wordVariations.set(wordLower + 'd', wordInfo);
        }
        // For words ending in consonant + y, change y to ied
        else if (wordLower.endsWith('y') && 
                wordLower.length > 1 && 
                !['a','e','i','o','u'].includes(wordLower[wordLower.length - 2])) {
          wordVariations.set(wordLower.slice(0, -1) + 'ied', wordInfo);
        }
        // For words ending in consonant + consonant, double the last consonant
        else if (wordLower.length > 2 && 
                !['a','e','i','o','u'].includes(wordLower[wordLower.length - 1]) && 
                !['a','e','i','o','u'].includes(wordLower[wordLower.length - 2])) {
          wordVariations.set(wordLower + wordLower[wordLower.length - 1] + 'ed', wordInfo);
        }
      }
      
      // Add singular variations if the word is plural
      if (wordLower.endsWith('s')) {
        if (wordLower.endsWith('ies')) {
          const singular = wordLower.slice(0, -3) + 'y';
          wordVariations.set(singular, wordInfo);
        } else if (wordLower.endsWith('es')) {
          const singular = wordLower.slice(0, -2);
          wordVariations.set(singular, wordInfo);
        } else {
          const singular = wordLower.slice(0, -1);
          if (singular.length > 2) { // Only add if resulting word is long enough
            wordVariations.set(singular, wordInfo);
          }
        }
      }
      
      // Add base form if word is in past tense
      if (wordLower.endsWith('ed') && wordLower.length > 4) {
        // Handle doubled consonant (e.g., stopped -> stop)
        if (wordLower.length > 5 && 
            wordLower[wordLower.length - 3] === wordLower[wordLower.length - 4]) {
          wordVariations.set(wordLower.slice(0, -3), wordInfo);
        }
        // Handle -ied ending (e.g., replied -> reply)
        else if (wordLower.endsWith('ied')) {
          wordVariations.set(wordLower.slice(0, -3) + 'y', wordInfo);
        }
        // Regular -ed ending
        else {
          wordVariations.set(wordLower.slice(0, -2), wordInfo);
          // Also try removing just 'd' for words ending in 'e'
          wordVariations.set(wordLower.slice(0, -1), wordInfo);
        }
      }
      
      // Add base form if word is adverb
      if (wordLower.endsWith('ly') && wordLower.length > 4) {
        // Handle -ily ending (e.g., happily -> happy)
        if (wordLower.endsWith('ily')) {
          wordVariations.set(wordLower.slice(0, -3) + 'y', wordInfo);
        }
        // Handle -ally ending (e.g., dramatically -> dramatic)
        else if (wordLower.endsWith('ally')) {
          wordVariations.set(wordLower.slice(0, -4), wordInfo);
        }
        // Regular -ly ending
        else {
          wordVariations.set(wordLower.slice(0, -2), wordInfo);
        }
      }
    });

    // Create pattern with word boundaries
    const wordPattern = Array.from(wordVariations.keys())
      .sort((a, b) => b.length - a.length) // Sort by length to match longer words first
      .map(word => {
        // Escape special regex characters
        const escaped = word.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
        return `\\b${escaped}\\b`;
      })
      .join('|');

    const regex = new RegExp(wordPattern, 'gi');
    
    const nodes = Array.from(textNodesUnder(document.body));
    const CHUNK_SIZE = 50;
    
    for (let i = 0; i < nodes.length; i += CHUNK_SIZE) {
      const chunk = nodes.slice(i, i + CHUNK_SIZE);
      await new Promise(resolve => {
        requestAnimationFrame(() => {
          chunk.forEach(node => {
            try {
              highlightTextNode(node, regex, wordVariations);
            } catch (error) {
              console.warn('Error processing text node:', error);
            }
          });
          resolve();
        });
      });
    }
  } catch (error) {
    console.warn('Error in highlightWords:', error);
  }
}

// Function to highlight text node
function highlightTextNode(node, regex, wordVariations) {
  if (!node || !node.textContent || !regex) return;
  
  if (!regex.test(node.textContent)) return;
  
  regex.lastIndex = 0;
  const span = document.createElement('span');
  span.innerHTML = node.textContent.replace(regex, (match) => {
    const matchLower = match.toLowerCase();
    const wordInfo = wordVariations.get(matchLower);
    
    if (wordInfo) {
      const backgroundColor = getHighlightColor(wordInfo.familiarity);
      const darkMode = isDarkMode();
      return `<span class="highlighted-word ${darkMode ? 'dark-mode' : ''}" 
                    data-original="${wordInfo.word}"
                    data-familiarity="${wordInfo.familiarity}"
                    style="background-color: ${backgroundColor};"
             >${match}</span>`;
    }
    return match;
  });
  
  if (span.innerHTML !== node.textContent) {
    try {
      if (node.parentNode && document.contains(node.parentNode)) {
        node.parentNode.replaceChild(span, node);
        
        // Add hover handlers to new highlighted words
        span.querySelectorAll('.highlighted-word:not([data-has-listener])').forEach(el => {
          el.dataset.hasListener = 'true';
          
          el.addEventListener('mouseenter', (e) => {
            e.stopPropagation();
            if (e.target.closest('.word-popup')) return;
            
            currentHighlightedElement = el;
            if (hoverTimer) {
              clearTimeout(hoverTimer);
              hoverTimer = null;
            }
            const rect = el.getBoundingClientRect();
            const originalWord = el.dataset.original;
            createWordPopup(originalWord, rect);
          });

          el.addEventListener('mouseleave', (e) => {
            e.stopPropagation();
            if (!e.target.closest('.word-popup')) {
              removePopupWithDelay();
            }
          });

          el.addEventListener('click', (e) => {
            e.stopPropagation();
            e.preventDefault();
          });
        });
      }
    } catch (error) {
      console.warn('Error highlighting text node:', error);
    }
  }
}

// Function to detect if element has dark background
function hasDarkBackground(element) {
  let currentElement = element;
  while (currentElement) {
    const style = window.getComputedStyle(currentElement);
    const backgroundColor = style.backgroundColor;
    
    if (backgroundColor && backgroundColor !== 'rgba(0, 0, 0, 0)' && backgroundColor !== 'transparent') {
      const rgb = backgroundColor.match(/\d+/g);
      if (rgb) {
        const [r, g, b] = rgb.map(Number);
        const luminance = (0.299 * r + 0.587 * g + 0.114 * b) / 255;
        return luminance < 0.5;
      }
    }
    currentElement = currentElement.parentElement;
  }
  return false;
}

// Function to detect if popup should use dark mode
function shouldUsePopupDarkMode(position) {
  // Force light mode for now (we'll detect actual theme later)
  return false;
}

// Function to create word popup
function createWordPopup(word, rect) {
  if (currentPopup) {
    currentPopup.remove();
    currentPopup = null;
  }

  const wordInfo = wordData.get(word.toLowerCase());
  if (!wordInfo) return;

  const popup = document.createElement('div');
  popup.className = `word-popup ${isDarkMode() ? 'dark-mode' : ''} ${hasDarkBackground(currentHighlightedElement) ? 'high-contrast' : ''}`;
  
  // Fix meanings extraction and handle line breaks
  const englishMeaning = wordInfo.englishMeaning || '';
  const chineseMeaning = wordInfo.chineseMeaning || '';

  popup.innerHTML = `
    <div class="popup-content">
      <div class="word-header">
        <strong>${wordInfo.word}</strong>
        <div class="popup-actions">
          <button class="delete-word" title="Delete word">🗑️</button>
        </div>
      </div>
      <div class="word-meanings">
        <div class="meaning-section">
          ${englishMeaning ? 
            `<div class="english-meaning">${englishMeaning.split('\n').join('<br>')}</div>
             <button class="edit-btn" title="Edit English meaning">✏️</button>` :
            `<div class="english-meaning empty">Add English meaning</div>
             <button class="edit-btn" title="Add English meaning">➕</button>`
          }
        </div>
        <div class="meaning-section">
          ${chineseMeaning ? 
            `<div class="chinese-meaning">${chineseMeaning.split('\n').join('<br>')}</div>
             <button class="edit-btn" title="Edit Chinese meaning">✏️</button>` :
            `<div class="chinese-meaning empty">Add Chinese meaning</div>
             <button class="edit-btn" title="Add Chinese meaning">➕</button>`
          }
        </div>
      </div>
      <div class="popup-buttons">
        <button class="know-btn">Know</button>
        <button class="dont-know-btn">Don't Know</button>
      </div>
    </div>
  `;

  document.body.appendChild(popup);
  currentPopup = popup;

  // Position the popup
  const popupRect = popup.getBoundingClientRect();
  const viewportWidth = window.innerWidth;
  const viewportHeight = window.innerHeight;

  // Calculate horizontal position
  let left = rect.left + window.scrollX;
  if (left + popupRect.width > viewportWidth - 20) {
    left = viewportWidth - popupRect.width - 20;
  }
  if (left < 20) left = 20;

  // Calculate vertical position
  let top = rect.bottom + window.scrollY + 5;
  if (top + popupRect.height > window.scrollY + viewportHeight - 20) {
    top = rect.top + window.scrollY - popupRect.height - 5;
  }

  popup.style.left = `${left}px`;
  popup.style.top = `${top}px`;

  // Add event listeners
  setupPopupEventListeners(popup, word, wordInfo);
}

// Function to setup popup event listeners
function setupPopupEventListeners(popup, word, wordInfo) {
  // Mouse enter/leave events for popup
  popup.addEventListener('mouseenter', () => {
    if (hoverTimer) {
      clearTimeout(hoverTimer);
      hoverTimer = null;
    }
  });

  popup.addEventListener('mouseleave', () => {
    removePopupWithDelay();
  });

  // Delete word button
  popup.querySelector('.delete-word').addEventListener('click', async (e) => {
    e.stopPropagation();
    if (confirm(`Are you sure you want to delete "${word}"?`)) {
      const storage = await chrome.storage.local.get(['words']);
      const words = storage.words || [];
      const newWords = words.filter(w => w.word.toLowerCase() !== word.toLowerCase());
      await chrome.storage.local.set({ words: newWords });
      
      popup.remove();
      currentPopup = null;
      currentHighlightedElement = null;
      
      document.querySelectorAll('.highlighted-word').forEach(el => {
        if (el.textContent.toLowerCase() === word.toLowerCase()) {
          const text = document.createTextNode(el.textContent);
          el.parentNode.replaceChild(text, el);
        }
      });
      
      wordData.delete(word.toLowerCase());
      highlightedWords.delete(word.toLowerCase());
    }
  });

  // Edit buttons
  popup.querySelectorAll('.edit-btn').forEach((btn, index) => {
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      const meaningSection = btn.parentElement;
      const isEnglish = index === 0;
      const currentMeaning = isEnglish ? wordInfo.englishMeaning || '' : wordInfo.chineseMeaning || '';
      
      // Add editing classes
      meaningSection.classList.add('editing');
      popup.classList.add('editing-mode');
      
      // Clear any existing hide timer
      if (hoverTimer) {
        clearTimeout(hoverTimer);
        hoverTimer = null;
      }
      
      // Hide the edit button and meaning div
      btn.style.display = 'none';
      const meaningDiv = meaningSection.querySelector(isEnglish ? '.english-meaning' : '.chinese-meaning');
      if (meaningDiv) {
        meaningDiv.style.display = 'none';
      }

      // Create edit interface
      const editInterface = document.createElement('div');
      editInterface.className = 'edit-interface';
      editInterface.innerHTML = `
        <textarea class="meaning-input" placeholder="${isEnglish ? 'Enter English meaning' : 'Enter Chinese meaning'}">${currentMeaning}</textarea>
        <div class="edit-actions">
          <button class="save-btn">Save</button>
          <button class="cancel-btn">Cancel</button>
        </div>
      `;
      
      meaningSection.appendChild(editInterface);

      // Focus the textarea
      const textarea = editInterface.querySelector('.meaning-input');
      textarea.focus();

      // Save button handler
      editInterface.querySelector('.save-btn').addEventListener('click', async () => {
        const newMeaning = textarea.value.trim();
        const storage = await chrome.storage.local.get(['words']);
        const words = storage.words || [];
        const wordIndex = words.findIndex(w => w.word.toLowerCase() === word.toLowerCase());
        
        if (wordIndex !== -1) {
          if (isEnglish) {
            words[wordIndex].englishMeaning = newMeaning;
          } else {
            words[wordIndex].chineseMeaning = newMeaning;
          }
          await chrome.storage.local.set({ words });
          
          // Update local data
          wordInfo = words[wordIndex];
          wordData.set(word.toLowerCase(), wordInfo);
          
          // Update display
          if (meaningDiv) {
            meaningDiv.innerHTML = newMeaning ? newMeaning.split('\n').join('<br>') : `Add ${isEnglish ? 'English' : 'Chinese'} meaning`;
            meaningDiv.className = `${isEnglish ? 'english' : 'chinese'}-meaning${!newMeaning ? ' empty' : ''}`;
            meaningDiv.style.display = 'block';
          }
          
          // Update edit button
          btn.textContent = newMeaning ? '✏️' : '➕';
          btn.title = newMeaning ? `Edit ${isEnglish ? 'English' : 'Chinese'} meaning` : `Add ${isEnglish ? 'English' : 'Chinese'} meaning`;
          btn.style.display = 'block';
          
          // Remove editing classes
          meaningSection.classList.remove('editing');
          popup.classList.remove('editing-mode');
          editInterface.remove();
        }
      });

      // Cancel button handler
      editInterface.querySelector('.cancel-btn').addEventListener('click', () => {
        if (meaningDiv) {
          meaningDiv.style.display = 'block';
        }
        btn.style.display = 'block';
        // Remove editing classes
        meaningSection.classList.remove('editing');
        popup.classList.remove('editing-mode');
        editInterface.remove();
      });

      // Prevent popup from disappearing when clicking in the textarea
      textarea.addEventListener('mouseenter', (e) => {
        e.stopPropagation();
        if (hoverTimer) {
          clearTimeout(hoverTimer);
          hoverTimer = null;
        }
      });
    });
  });

  // Know/Don't Know buttons
  popup.querySelector('.know-btn').addEventListener('click', async (e) => {
    e.stopPropagation();
    await updateWordFamiliarity(word, true);
    popup.remove();
    currentPopup = null;
    currentHighlightedElement = null;
    highlightWords(wordData);
  });

  popup.querySelector('.dont-know-btn').addEventListener('click', async (e) => {
    e.stopPropagation();
    await updateWordFamiliarity(word, false);
    popup.remove();
    currentPopup = null;
    currentHighlightedElement = null;
    highlightWords(wordData);
  });
}

// Function to remove popup with delay
function removePopupWithDelay() {
  if (hoverTimer) {
    clearTimeout(hoverTimer);
  }
  hoverTimer = setTimeout(() => {
    if (currentPopup) {
      // Don't remove popup if either meaning section is in editing mode
      if (currentPopup.querySelector('.meaning-section.editing')) {
        return;
      }
      currentPopup.remove();
      currentPopup = null;
      currentHighlightedElement = null;
    }
  }, 300); // 300ms delay before hiding
}

// Function to update word familiarity
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

// Observer for dynamic content
const observer = new MutationObserver((mutations) => {
  if (isHighlightingEnabled && highlightedWords.size > 0) {
    let shouldHighlight = false;
    for (const mutation of mutations) {
      if (mutation.addedNodes.length > 0) {
        shouldHighlight = true;
        break;
      }
    }
    if (shouldHighlight) {
      highlightWords(wordData);
    }
  }
});

// Start observing with optimized config
observer.observe(document.body, {
  childList: true,
  subtree: true,
  characterData: false
});

// Initialize when DOM is ready
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', initializeHighlighting);
} else {
  initializeHighlighting();
}

// Listen for messages from popup
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.action === 'toggleHighlight') {
    isHighlightingEnabled = request.enabled;
    if (isHighlightingEnabled) {
      chrome.storage.local.get(['words'], async (result) => {
        if (result.words) {
          wordData = new Map(
            result.words.map(w => [w.word.toLowerCase(), w])
          );
          highlightedWords = new Map(wordData);
          await highlightWords(wordData);
        }
      });
    } else {
      if (currentPopup) {
        currentPopup.remove();
        currentPopup = null;
      }
      document.querySelectorAll('.highlighted-word').forEach(el => {
        const text = document.createTextNode(el.textContent);
        el.parentNode.replaceChild(text, el);
      });
    }
  }
});

// Add dark mode detection and update highlights when theme changes
const darkModeObserver = new MutationObserver(() => {
  if (isHighlightingEnabled && highlightedWords.size > 0) {
    // Remove existing highlights
    document.querySelectorAll('.highlighted-word').forEach(el => {
      const text = document.createTextNode(el.textContent);
      el.parentNode.replaceChild(text, el);
    });
    // Reapply highlights with new colors
    highlightWords(wordData);
  }
});

// Observe theme changes
darkModeObserver.observe(document.documentElement, {
  attributes: true,
  attributeFilter: ['data-theme', 'class']
});

// Listen for system color scheme changes
if (window.matchMedia) {
  window.matchMedia('(prefers-color-scheme: dark)').addListener(() => {
    if (isHighlightingEnabled && highlightedWords.size > 0) {
      highlightWords(wordData);
    }
  });
}

// Update popup theme when system theme changes
const mediaQuery = window.matchMedia('(prefers-color-scheme: dark)');
mediaQuery.addListener(() => {
  if (currentPopup && currentHighlightedElement) {
    const rect = currentHighlightedElement.getBoundingClientRect();
    const useDarkMode = shouldUsePopupDarkMode({
      x: rect.left,
      y: rect.top - (rect.top > window.innerHeight / 2 ? 100 : 0)
    });
    currentPopup.classList.toggle('dark-mode', useDarkMode);
  }
});

// Update CSS styles
const style = document.createElement('style');
style.textContent = `
  .highlighted-word {
    position: relative;
    z-index: 1;
    pointer-events: auto !important;
  }

  a .highlighted-word {
    pointer-events: auto !important;
    cursor: pointer !important;
    z-index: 10000;
  }

  .word-popup {
    background: #ffffff;
    color: #000000;
    border: 1px solid #ddd;
    box-shadow: 0 2px 8px rgba(0,0,0,0.15);
  }

  .word-popup.dark-mode {
    background: rgba(28, 28, 30, 0.95);
    color: #ffffff;
    border-color: rgba(255, 255, 255, 0.1);
  }
`;
document.head.appendChild(style); 