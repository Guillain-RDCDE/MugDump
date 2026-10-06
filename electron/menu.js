import { app, BrowserWindow, Menu } from 'electron';

/** @typedef {import('electron').MenuItemConstructorOptions} MenuItem */

/** Send a menu event to the focused window's renderer (see preload.cjs). */
function sendToFocused(channel) {
  BrowserWindow.getFocusedWindow()?.webContents.send(channel);
}

/** @type {MenuItem} */
const SEPARATOR = { type: 'separator' };

/** @param {MenuItem['role']} role */
const roleItem = (role) => /** @type {MenuItem} */ ({ role });

const isMac = process.platform === 'darwin';

export function installMenu() {
  /** @type {MenuItem[]} */
  const template = [
    ...(isMac
      ? [
          {
            label: app.name,
            submenu: [
              roleItem('about'),
              SEPARATOR,
              roleItem('hide'),
              roleItem('hideOthers'),
              roleItem('unhide'),
              SEPARATOR,
              roleItem('quit'),
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
        SEPARATOR,
        {
          label: 'Export All Photos…',
          accelerator: 'CmdOrCtrl+Shift+E',
          click: () => sendToFocused('menu-export-all'),
        },
        ...(isMac ? [] : [SEPARATOR, roleItem('quit')]),
      ],
    },
    {
      label: 'Edit',
      submenu: [
        roleItem('undo'),
        roleItem('redo'),
        SEPARATOR,
        roleItem('cut'),
        roleItem('copy'),
        roleItem('paste'),
        SEPARATOR,
        roleItem('selectAll'),
      ],
    },
    {
      label: 'View',
      submenu: [
        roleItem('reload'),
        roleItem('forceReload'),
        roleItem('toggleDevTools'),
        SEPARATOR,
        roleItem('togglefullscreen'),
      ],
    },
  ];
  Menu.setApplicationMenu(Menu.buildFromTemplate(template));
}
