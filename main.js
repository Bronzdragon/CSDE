/* jshint esversion: 6 */
const {
    app,
    BrowserWindow
} = require('electron');
// require('electron-debug')();
const fs = require('fs');
const path = require('path');
const os = require('os');

let mainWindow = null;

function createWindow() {
    mainWindow = new BrowserWindow({
        // width: 800, height: 600,
        webPreferences: {
            spellcheck: true,
            nodeIntegration: true,
        }
    });
    mainWindow.setBackgroundColor("#222");

    // mainWindow.setMenu(null);
    mainWindow.loadFile('./index.html');

    mainWindow.on('closed', () => {
        mainWindow = null;
    });
}

app.on('ready', createWindow);

app.on('window-all-closed', () => {
    if (process.platform !== 'darwin') {
        app.quit();
    }
});

app.on('activate', () => {
    if (mainWindow === null) {
        createWindow();
    }
});

app.on('quit', (event, exitCode) => {
    const { recybleBinFolderName } = require('./settings.json');
    const trashPath = path.join(os.homedir(), ".csde", recybleBinFolderName);

    fs.rmdir(trashPath, {recursive: true}, err => {
        if(err) throw err;

        fs.mkdir(trashPath, err => {
            if(err) throw err;
        });
    });

    //TODO: Delete user folder (yes, all of it).
})