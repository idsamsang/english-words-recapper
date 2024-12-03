// Add stemming function at the top of the file
function getStemmedWord(word) {
  word = word.toLowerCase();
  
  // Only stem if the word is long enough
  if (word.length <= 3) return word;
  
  // Handle -ing forms first (before handling other suffixes)
  if (word.endsWith('ing')) {
    // Double consonant + ing (e.g., running -> run)
    if (word.length > 6 && word[word.length - 4] === word[word.length - 5]) {
      return word.slice(0, -4);
    }
    // Words ending with 'e' + ing (e.g., plunging -> plunge)
    if (word.length > 5) {
      return word.slice(0, -3) + 'e';
    }
    // Normal -ing
    return word.slice(0, -3);
  }
  
  // Handle plural forms
  if (word.endsWith('ies') && word.length > 4) {
    return word.slice(0, -3) + 'y';
  }
  if (word.endsWith('es') && word.length > 4) {
    return word.slice(0, -2);
  }
  if (word.endsWith('s') && word.length > 4) {
    return word.slice(0, -1);
  }
  
  // Handle -ed forms
  if (word.endsWith('ed')) {
    // Double consonant + ed (e.g., stopped -> stop)
    if (word.length > 5 && word[word.length - 3] === word[word.length - 4]) {
      return word.slice(0, -3);
    }
    // Words ending with 'e' + ed (e.g., loved -> love)
    if (word.length > 4) {
      return word.slice(0, -2);
    }
    // Normal -ed
    return word.slice(0, -2);
  }
  
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

// Process text in chunks
function* textNodesUnder(node) {
  const walk = document.createTreeWalker(
    node,
    NodeFilter.SHOW_TEXT,
    {
      acceptNode: function(node) {
        const parent = node.parentElement;
        if (!parent) return NodeFilter.FILTER_REJECT;
        
        const tagName = parent.tagName.toLowerCase();
        if (tagName === 'script' || tagName === 'style' || 
            tagName === 'noscript' || tagName === 'textarea' ||
            parent.classList.contains('highlighted-word')) {
          return NodeFilter.FILTER_REJECT;
        }
        return NodeFilter.FILTER_ACCEPT;
      }
    },
    false
  );

  let textNode;
  while (textNode = walk.nextNode()) {
    yield textNode;
  }
}

// Function to highlight words in the page
async function highlightWords(words) {
  if (!isHighlightingEnabled || words.size === 0) return;

  const wordPattern = Array.from(words.keys())
    .map(word => `\\b${word}\\b`)
    .join('|');

  const regex = new RegExp(wordPattern, 'gi');
  
  const nodes = Array.from(textNodesUnder(document.body));
  const CHUNK_SIZE = 50;
  
  for (let i = 0; i < nodes.length; i += CHUNK_SIZE) {
    const chunk = nodes.slice(i, i + CHUNK_SIZE);
    await new Promise(resolve => {
      requestAnimationFrame(() => {
        chunk.forEach(node => highlightTextNode(node, regex));
        resolve();
      });
    });
  }
}

// Function to highlight text node
function highlightTextNode(node, regex) {
  const text = node.textContent;
  if (!regex || !regex.test(text)) return;
  
  regex.lastIndex = 0;
  const span = document.createElement('span');
  span.innerHTML = text.replace(regex, (match) => {
    const matchLower = match.toLowerCase();
    const wordInfo = wordData.get(matchLower);
    
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
  
  if (span.innerHTML !== text) {
    node.parentNode.replaceChild(span, node);
    
    // Add hover handlers to new highlighted words
    span.querySelectorAll('.highlighted-word:not([data-has-listener])').forEach(el => {
      el.dataset.hasListener = 'true';
      
      el.addEventListener('mouseenter', (e) => {
        e.stopPropagation(); // Stop event bubbling
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
        e.stopPropagation(); // Stop event bubbling
        removePopupWithDelay();
      });

      // Prevent link clicks when clicking highlighted words in links
      el.addEventListener('click', (e) => {
        e.stopPropagation();
        e.preventDefault();
      });
    });
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
    if (currentHighlightedElement && 
        currentHighlightedElement.dataset.original === word) {
      return;
    }
    currentPopup.remove();
  }

  const popup = document.createElement('div');
  popup.className = 'word-popup';
  
  // Calculate popup position
  const viewportHeight = window.innerHeight;
  const popupX = rect.left + window.scrollX;
  let popupY = rect.top + window.scrollY;
  
  // Check background at popup position
  const useDarkMode = shouldUsePopupDarkMode({
    x: rect.left,
    y: rect.top - (rect.top > viewportHeight / 2 ? 100 : 0) // Check above or below word
  });
  
  if (useDarkMode) {
    popup.classList.add('dark-mode');
  }

  // Position popup above or below the word depending on space
  const spaceAbove = rect.top;
  const preferAbove = spaceAbove > viewportHeight / 2;
  
  if (preferAbove) {
    popup.style.transform = 'translateY(-100%)';
    popupY -= 10;
  } else {
    popup.style.transform = 'translateY(10px)';
    popupY += rect.height;
  }
  
  popup.style.left = `${popupX}px`;
  popup.style.top = `${popupY}px`;

  const wordInfo = wordData.get(word.toLowerCase());
  if (!wordInfo) return;

  popup.innerHTML = `
    <div class="popup-content">
      <div class="word-header">
        <strong>${word}</strong>
        <div class="popup-actions">
          <button class="delete-word" title="Delete word">🗑️</button>
        </div>
      </div>
      <div class="word-meanings">
        ${wordInfo.englishMeaning ? `<div class="english-meaning">${wordInfo.englishMeaning.split('\n').join('<br>')}</div>` : ''}
        ${wordInfo.chineseMeaning ? `<div class="chinese-meaning">${wordInfo.chineseMeaning.split('\n').join('<br>')}</div>` : ''}
      </div>
      <div class="popup-buttons">
        <button class="know-btn">Know</button>
        <button class="dont-know-btn">Don't Know</button>
      </div>
    </div>
  `;

  document.body.appendChild(popup);
  currentPopup = popup;

  // Add event listeners
  popup.addEventListener('mouseenter', () => {
    if (hoverTimer) {
      clearTimeout(hoverTimer);
      hoverTimer = null;
    }
  });

  popup.addEventListener('mouseleave', () => {
    removePopupWithDelay();
  });

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