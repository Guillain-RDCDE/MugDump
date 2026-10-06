import { app, BrowserWindow, Menu } from 'electron';

/** Send a menu event to the focused window's renderer (see preload.cjs). */
function sendToFocused(channel) {
  BrowserWindow.getFocusedWindow()?.webContents.send(channel);
}

export function installMenu() {
  const template = [
    ...(process.platform === 'darwin'
      ? [
          {
            label: app.name,
            submenu: [
              { role: 'about' },
              { type: 'separator' },
              { role: 'hide' },
              { role: 'hideOthers' },
              { role: 'unhide' },
              { type: 'separator' },
              { role: 'quit' },
            ],
          },
        ]
      : []),
    {
      label: 'File',
      submenu: [
        {
          label: 'Open .sav / .sta File…',
          accelerator: 'CmdOrCtrl+O',
          click: () => sendToFocused('menu-open-sav'),
        },
        {
          label: 'Open from Analogue Pocket…',
          accelerator: 'CmdOrCtrl+Shift+O',
          click: () => sendToFocused('menu-open-pocket'),
        },
        { type: 'separator' },
        {
          label: 'Export All Photos…',
          accelerator: 'CmdOrCtrl+Shift+E',
          click: () => sendToFocused('menu-export-all'),
        },
        ...(process.platform === 'darwin' ? [] : [{ type: 'separator' }, { role: 'quit' }]),
      ],
    },
    {
      label: 'Edit',
      submenu: [
        { role: 'undo' },
        { role: 'redo' },
        { type: 'separator' },
        { role: 'cut' },
        { role: 'copy' },
        { role: 'paste' },
        { type: 'separator' },
        { role: 'selectAll' },
      ],
    },
    {
      label: 'View',
      submenu: [
        { role: 'reload' },
        { role: 'forceReload' },
        { role: 'toggleDevTools' },
        { type: 'separator' },
        { role: 'togglefullscreen' },
      ],
    },
  ];
  Menu.setApplicationMenu(Menu.buildFromTemplate(template));
}
