// Create context menu item when extension is installed
chrome.runtime.onInstalled.addListener(() => {
  chrome.contextMenus.create({
    id: 'addWordToList',
    title: 'Add "%s" to Word List',
    contexts: ['selection']
  });
});

// Handle context menu clicks
chrome.contextMenus.onClicked.addListener(async (info, tab) => {
  if (info.menuItemId === 'addWordToList') {
    const selectedWord = info.selectionText.trim();
    
    // Open popup with pre-filled word
    chrome.windows.create({
      url: chrome.runtime.getURL('popup/quick-add.html') + `?word=${encodeURIComponent(selectedWord)}`,
      type: 'popup',
      width: 400,
      height: 300
    });
  }
}); 