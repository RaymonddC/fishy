// Opens the side panel when the toolbar button is clicked.

chrome.sidePanel.setPanelBehavior({ openPanelOnActionClick: true }).catch((error: unknown) => {
  console.error('Could not set the side panel behaviour', error);
});
