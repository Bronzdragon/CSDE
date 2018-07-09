/* jshint esversion: 6 */
const {app, BrowserWindow} = require('electron');
require('electron-debug')();

let mainWindow = null;

function createWindow() {
    mainWindow = new BrowserWindow({ width: 800, height: 600});
    mainWindow.loadFile('./index.html');

    mainWindow.on('closed', () => {
        mainWindow = null;
    });

    //let app = new csde();
}

app.on('ready', createWindow);

app.on('window-all-closed', () => {
    if(process.platform !== 'darwin'){
        app.quit();
    }
});

app.on('activate', () => {
    if (mainWindow === null) {
        createWindow();
    }
});
