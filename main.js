/* jshint esversion: 6 */
const {
    app,
    BrowserWindow,
    Menu,
    MenuItem,
} = require('electron');

const fs = require('fs');
const path = require('path');
const os = require('os');
const {
    recybleBinFolderName
} = require('./settings.json');

let mainWindow = null;

function createWindow() {
    mainWindow = new BrowserWindow({
        // width: 800, height: 600,
        webPreferences: {
            spellcheck: true,
            nodeIntegration: true,
        },
        show: true,
    });
    mainWindow.setBackgroundColor("#222");

    // mainWindow.setMenu(null);
    mainWindow.loadFile('./index.html');

    mainWindow.on('closed', () => {
        mainWindow = null;
    });

    // Add spellcheck suggestions.
    mainWindow.webContents.on('context-menu', (event, params) => {
        if (!params.misspelledWord) { return }
        const menu = new Menu()

        // Add each spelling suggestion
        for (const suggestion of params.dictionarySuggestions) {
            menu.append(new MenuItem({
                label: suggestion,
                click: () => mainWindow.webContents.replaceMisspelling(suggestion)
            }))
        }

        // Allow users to add the misspelled word to the dictionary
        if (params.misspelledWord) {
            menu.append(
                new MenuItem({
                    label: 'Add to dictionary',
                    click: () => mainWindow.webContents.session.addWordToSpellCheckerDictionary(params.misspelledWord)
                })
            )
        }

        menu.popup()
    })
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
    const trashPath = path.join(os.homedir(), ".csde", recybleBinFolderName);

    fs.rmdir(trashPath, { recursive: true }, err => {
        if (err) throw err;

        fs.mkdir(trashPath, err => {
            if (err) throw err;
        });
    });

    //TODO: Delete user folder (yes, all of it).
})