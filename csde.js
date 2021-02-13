/* jshint esversion: 6 */
let _userAgent = navigator.userAgent.toLowerCase();
let _isElectron = _userAgent.indexOf(' electron/') > -1;

const fs = require('fs');
const os = require('os');
const path = require('path');
const mkdirp = require('mkdirp');
const { webFrame, remote } = require('electron');
const { dialog } = remote
const { FindInPage } = require('electron-find');
const SETTINGS = require('./settings.json');
const Autosaver = require('./modules/autosave')


const csde = (function csdeMaster() {
    const RECYCLE_BIN_NAME = SETTINGS.recybleBinFolderName
    let _currentSceneName = '';

    let _globalLinkValue = null;
    let _$container = null;
    let _graph = null;
    let _paper = null;
    let autosave = new Autosaver(SETTINGS.autoSaveInterval, _saveBackups);
    let _characters = getDefaultCharacterList();
    let _mouseObj = {
        panning: false,
        position: { x: 0, y: 0 }
    };

    async function _saveBackups(backupScene = false) {
        const backupLocation = _getSavefileLocation();
        const dataObj = _graphToCSDE()
        const dataText = JSON.stringify(dataObj);
        
        // 1: Make Back-up save.
        const backupFileName = _getSavefileName(true);
        await _writeToFile(backupLocation, backupFileName, dataText);

        // 2: Save to auto-open file.
        const autoOpenFileName = _getSavefileName(false);
        await _writeToFile(backupLocation, autoOpenFileName, dataText);

        // 3: Backup the scenes (if required).
        if(backupScene){
            _saveScene(dataObj);
        }

        // 4: Move old back-ups (if any).
        await _trashOldFiles(backupLocation, SETTINGS.backupCount);

        // 5: Notification
        notify("Saved...", "low")
    }

    async function _saveScene(dataObject) {
        console.log("SaveScenes called...")
        const sceneFolder = path.join(process.cwd(), SETTINGS.sceneFolder);
        const dataText = JSON.stringify(dataObject);
        const { title }  = dataObject

        console.log(`About to check if ${title}${SETTINGS.fileExtension} exists...`)

        // 1: Move the current scene file to a back-up location (if it exists).
        if(await _fileExists(path.join(sceneFolder, `${title}${SETTINGS.fileExtension}`))){
            console.log("Found! Moving...")
            await _moveFile(sceneFolder, path.join(sceneFolder, RECYCLE_BIN_NAME), `${title}${SETTINGS.fileExtension}`, `${title}-${_generateId(6, '')}${SETTINGS.fileExtension}`)
            console.log("Moved!")
        } else {
            console.log("Not found. That's fine.")
        }

        console.log("Ok, going to write out our file: ", {folder: sceneFolder, name: `${title}${SETTINGS.fileExtension}`});
        // 2: Now save our current scene
        await _writeToFile(sceneFolder, `${title}${SETTINGS.fileExtension}`, dataText);
    }

    async function _createOrOpenScene(sceneName) {
        if(await _fileExists(path.join(process.cwd(), SETTINGS.sceneFolder, `${sceneName}${SETTINGS.fileExtension}`))){
            _loadFile(path.join(process.cwd(), SETTINGS.sceneFolder, `${sceneName}${SETTINGS.fileExtension}`))
        } else {
            _clearGraph()

            _setSceneName(sceneName);

            _saveScene(_graphToCSDE());
        }
    }

    async function _exportToFile(exportLocation, fileName, dataText) {
        // 1: Create back-ups first
        await _saveBackups();

        // 2: Export
        await _writeToFile(exportLocation, fileName, dataText);
    }

    async function _loadFile(filePath) {
        // 1: Create backups.
        await _saveBackups(false);

        // 2: Empty the graph.
        _clearGraph();

        // 3: Read the file.
        const data = await _readFromFile(filePath);
        if(data){
            // 4: Generate nodes & links.
            await _CSDEToGraph(data, _graph);
        } else {
            _setSceneName("");
        }
    }

    /* Makes directory path if it doesn't exist, and writes a file */
    function _writeToFile(filePath = "", fileName = "", fileText = "") {
        return new Promise(async (resolve, reject) => {
            await mkdirp(filePath);

            fs.writeFile(path.join(filePath, fileName), fileText, err => {
                if (err) { reject(err) } else { resolve(true) }
            })
        })
    }

    /* Read a file from disc. */
    async function _readFromFile(filePath) {
        return new Promise((resolve, reject) => {
            fs.readFile(filePath, (err, data) => {
                if (err) { reject(err) }

                if(data.length > 0) {
                    resolve(JSON.parse(data));
                }

                resolve(null);
            })
        })
    }

    async function _fileExists(filePath) {
        return new Promise(resolve => {
            fs.access(filePath, fs.constants.F_OK | fs.constants.R_OK | fs.constants.W_OK, (err) => {
                resolve(!err)
            })
        })
    }

    /* Moves files to a new folder */
    function _moveFile(oldPath, newPath, oldFileName, newFileName) {
        if(!newFileName) newFileName = oldFileName;

        return new Promise(async (resolve, reject) => {
            await mkdirp(newPath);

            fs.rename(path.join(oldPath, oldFileName), path.join(newPath, newFileName), (err) => {
                if (err) {
                    reject(err);
                } else {
                    resolve(true);
                }
            })
        })
    }

    /* Searches for old files in a folder and moves them to a backup folder if they exceed count */
     function _trashOldFiles(folder, count = 0) {
        if (count <= 0) return;

        console.info(`Cleaning files in '${folder}'.`);
        return new Promise((resolve, reject) => {
            fs.readdir(folder, { withFileTypes: true }, async (err, files) => {
                if (err) {
                    reject(err)
                };

                const allFiles = await Promise.all(files
                    .filter(file => file.isFile()) // Filter out folders
                    .filter(file => (/csde-[a-v0-9]{6}\.(csde|json)/).test(file.name)) // Filter out everything that doesn't fit
                    .map(file => new Promise((resolve, reject) => {
                        fs.stat(path.join(folder, file.name), (err, stats) => {
                            if (err) {
                                reject(err)
                            } else {
                                resolve({ name: file.name, ...stats })
                            }
                        })
                    }))
                );

                const filesToMove = allFiles
                    .sort((a, b) => b.mtime - a.mtime) // sort by newest modification time.
                    .slice(count) // and slice off the first count
                    .reverse(); // Move files oldest first, just in case.

                await Promise.all(filesToMove.map(
                    ({ name }) => _moveFile(folder, path.join(folder, RECYCLE_BIN_NAME), name)
                ));

                resolve(true);
            })
        })
    }

    function _clearGraph() {
        _$container.scrollTop(0);
        _$container.scrollLeft(0);

        _setSceneName("");
        _graph.clear();
    }

    function _setSceneName(newName) {
        _currentSceneName = newName;
        $("input#filename-textbox").val(newName);
    }


    const _defaultLink = new joint.dia.Link({
        router:    { name: 'metro' },
        connector: { name: 'normal' },
    });

    const _gridSize = 10;

    const _style = {
        magnet: {
            left:  { width: 24, height: 54 }, // Height should be unused, and instead should fill up their container top to bottom.
            right: { width: 24, height: 48 },
        },
        node: {
            'base':   { width: 250, height: 150 },
            'text':   { width: 500, height: 200 },
            'set':    { width: 250, height: 100 },
            'note':   { width: 400, height: 100 },
            'scene':  { width: 400, height: 100 },
            'start':  { width: 200, height: 50 },
            'multi':  { width: 300, height: 150, section: 50 },
            'choice': { width: 500, height: 200, section: 50 },
            'branch': { width: 250, height: 200, section: 50 },
        },
        icon: {
            width:  15,
            height: 15
        }
    };

    let _highlightedLinks = [];
    let _selectedNodes = new Set();

    const _linkHighlightClass = {
        highlighter: {
            name: "addClass",
            options: { className: "link-highlight" }
        }
    };

    // Register new models and views
    joint.shapes.dialogue = {};

    joint.shapes.standard.Rectangle.define('dialogue.Base', {
        size: { width: _style.node.base.width, height: _style.node.base.height },
        attrs: {
            body: {
                x: 0, y: 0,
                rx: 10, ry: 10, // For rounded corners.
                stroke: 'none',
                text: { display: 'none' },
            },
            root: { magnet: false },
        },
        ports: {
            groups: {
                'input': {
                    position: {
                        name: 'absolute',
                        args: { x: 0, y: 0}
                    }
                }, 'output': {
                    position: {
                        name: 'absolute',
                        args: { x: 0, y: _style.node.base.height / 2}
                    }
                }
            }
        }
    });
    joint.shapes.dialogue.BaseView = joint.dia.ElementView.extend({
        template:
            '<div class="node base">' +
                '<button class="delete">x</button>' +
                'Test node.' +
            '</div>',

        initialize: function () {
            joint.dia.ElementView.prototype.initialize.apply(this, arguments);

            this.addMagnets();

            this.$box = $(_.template(this.template)());

            this.$box.click(() => this.highlightAllConnectedLinks());
            this.$box.$delete = this.$box.find('button.delete');

            this.$box.$delete.click(() => this.model.remove());

            // Update the box position whenever the underlying model changes.
            this.model.on('change', this.updateBox, this);
            // Remove the box when the model gets removed from the graph.
            this.model.on('remove', this.removeBox, this);

            /****
            * This is run after this function and any function calling it ends.
            * Done so that inherited update functions can use variables set in
            * inherited initialize functions.
            ****/
            window.setTimeout(() => this.updateBox(), 0);
        },

        render: function() {
            joint.dia.ElementView.prototype.render.apply(this, arguments);
            this.paper.$el.prepend(this.$box);
            this.updateBox();

            return this;
        },

        updateBox: function() {
            let bbox = this.model.getBBox();
            this.$box.css({
                width: bbox.width, height: bbox.height,
                left: bbox.x, top: bbox.y,
                transform: `rotate(${this.model.get('angle') || 0}deg)`
            });

            for (let port of this.model.getPorts()) {
                /*jshint loopfunc: true */
                let hasLinks =_graph.getConnectedLinks(this.model).some(link => {
                    return link.get('source').port === port.id || link.get('target').port === port.id;
                });

                if (hasLinks){
                    $(`[port='${port.id}']`).addClass("connected-magnet");
                } else {
                    $(`[port='${port.id}']`).removeClass("connected-magnet");
                }
            }

            return this;
        },

        removeBox: function(event) { this.$box.remove(); },

        addMagnets: function(){
            if (!this.model.get('input')) {
                this.model.set("input", {
                    group: "input",
                    markup: "<rect />",
                    attrs: {
                        rect: {
                            class: "magnet input left",
                            magnet: true,
                            width: _style.magnet.left.width,
                            height: this.model.get('size').height / 2,
                            fill: `url(#${_style.gradient.input.left})`
                        }
                    }
                });
                this.model.addPort(this.model.get('input'));
            }
            if (!this.model.get('output')) {
                this.model.set("output", {
                    group: "output",
                    markup: "<rect />",
                    attrs: {
                        rect: {
                            class: "magnet output left",
                            magnet: true,
                            width: _style.magnet.left.width,
                            height: this.model.get('size').height / 2,
                            fill: `url(#${_style.gradient.output.left})`
                        }
                    }
                });
                this.model.addPort(this.model.get('output'));
            }
        },

        highlightAllConnectedLinks: function() {
            _clearAllLinkHighlights(); // Clear all existing highlights first
            _highlightLinks(_graph.getConnectedLinks(this.model));
        }
    });

    joint.shapes.dialogue.Base.define('dialogue.Multi', {
        size: { width: _style.node.multi.width, height: _style.node.multi.height },
        ports: {
            groups: {
                'input': {
                    position: {
                        name: 'absolute',
                        args: { x: 0, y: 0}
                    }
                }, 'output': {
                    position: {
                        name: 'absolute',
                        args: {
                            x: 0, y: 0,
                        }
                    }
                }
            }
        },
        values: [] // An array of objects, {id: ID, value: text, isDefault: boolean}
    });
    joint.shapes.dialogue.MultiView = joint.shapes.dialogue.BaseView.extend({
        template:
            '<div class="node multi">' +
                `<div class="multi header" style="height: ${_style.node.multi.section}px;">` +
                    '<button class="delete">x</button>' +
                '</div>' +
                '<div class="choiceContainer"></div>' +
                '<div class="footer">' +
                    `<div class="add-row" style="height: ${_style.node.multi.section}px;">` +
                        '<button class="add"><span class="plus">+</span></button>' +
                    '</div>' +
                '</div>' +
            '</div>',

        defaultTemplate:
            `<div style="height: ${_style.node.multi.section}px;" id="<%= TemplateId %>">` +
                '<input type="text" class="value default" value="<%= templateValue %>">' +
            '</div>',

        choiceTemplate:
            `<div style="height: ${_style.node.multi.section}px;" id="<%= TemplateId %>">` +
                '<button class="remove"></button>' +
                '<input type="text" class="value" value="<%= templateValue %>">' +
            '</div>',

        initialize: function() {
            joint.shapes.dialogue.BaseView.prototype.initialize.apply(this, arguments);

            this.$box.$header = this.$box.find('div.header');
            this.$box.$choiceContainer = this.$box.find('div.choiceContainer');
            this.$box.$footer = this.$box.find('div.footer');

            this.$box.$add = this.$box.find('button.add');
            this.$box.$add.click(() => this.addChoice());
        },

        updateBox: function() {
            joint.shapes.dialogue.BaseView.prototype.updateBox.apply(this, arguments);
            let values = this.model.get('values');

            /* Loop over all existing ports, remove all orphans. */
            for (let port of this.model.getPorts()) {
                 /*jshint loopfunc: true */
                if(port.group === "input") continue;
                if (!values.find(entry => entry.id === port.id)) {
                    this.model.removePort(port.id);
                }
            }

            /* Loop over all choice HTML elements, remove all orphans */
            for (let element of this.$box.$choiceContainer.children()) {
                 /*jshint loopfunc: true */
                let id = $(element).attr('id');
                if (!values.find(entry => entry.id === id)) {
                    this.model.removePort(id);
                    $(element).remove();
                }
            }

            // Create containers for missing values
            for (let {id, value, isDefault} of values) {
                let $choiceElement = this.$box.$choiceContainer.find('#' + id);

                if ($choiceElement.length > 0) { // If it has an associated element
                    $choiceElement.val(value);
                } else {
                    // There is a value, but no element to go along with it!
                    this.newElement(this.$box.$choiceContainer, id, {value: value, isDefault: isDefault});
                }
            }

            this.updateSize();
        },

        newElement: function(container, id, choice = {value = '', isDefault = false} = {}) {
            if (!(container instanceof jQuery)) { throw new TypeError("The container must be a jQuery object"); }
            let template = choice.isDefault ? this.defaultTemplate : this.choiceTemplate;

            let $newChoice = $(_.template(template)({
                TemplateId: id,
                templateValue: choice.value
            }));

            $newChoice.$value = $newChoice.find('input.value');
            $newChoice.$value.on('input propertychange', event => {
                let values = this.model.get('values');
                let index = values.findIndex(obj => obj.id === $newChoice.attr('id'));
                values[index].value = $(event.target).val();
                //values.set($newChoice.attr('id'), $(event.target).val());
                this.model.set('values', values);
            });

            if (!choice.isDefault) {
                $newChoice.$remove = $newChoice.find('button.remove');
                $newChoice.$remove.click(event => {
                    this.model.get('values');
                    let values = this.model.get('values');
                    let index = values.findIndex(obj => obj.id === $newChoice.attr('id'));
                    values.splice(index, 1);
                    //values.delete($newChoice.attr('id'));
                    this.model.set('values', values);
                    this.updateBox();
                });

                $newChoice.$value.keyup(event => {
                    if (event.key ==="Enter") {
                        $newChoice.$value.submit();
                    }
                });

                $newChoice.$value.submit(event => {
                    this.$box.$add.click();
                });
            }

            $newChoice.appendTo(container);

            if(!this.model.getPorts().find(port => port.id === id)){
                this.model.addPort({
                    id: id,
                    group: "output",
                    markup: "<rect />",
                    attrs: {
                        rect: {
                            class: "magnet output right",
                            magnet: true,
                            width: _style.magnet.right.width,
                            height: _style.node.multi.section,
                            fill: `url(#${_style.gradient.output.right})`
                        }
                    }
                });
            }

            $newChoice.click((event) => this.highlightChoiceConnectedLinks(event));

            return $newChoice;
        },

        addChoice: function(textValue = '', isDefault = false) {
            let values = this.model.get('values');
            values.push({id: _generateId(), value: textValue, isDefault: isDefault});
            this.model.set('values', values);
            this.updateBox();
        },

        updateSize: function() {
            let style = null;
            switch (this.model.get('type')) {
                case "dialogue.Branch":
                style = _style.node.branch;
                break;
                case "dialogue.Choice":
                style = _style.node.choice;
                break;
                default:
                style = _style.node.multi;
            }

            this.model.set('size', {
                width: style.width,
                height: this.$box.$header.outerHeight(true) +
                    this.$box.$choiceContainer.outerHeight(true) +
                    this.$box.$footer.outerHeight(true)
            });

            for (const {id, value, isDefault} of this.model.get("values")) {
                let index = this.$box.$choiceContainer.children().index(this.$box.$choiceContainer.find('#' + id));

                let magnetPos = {
                    height: this.$box.$header.outerHeight(true) + (style.section * index),
                    width: style.width - _style.magnet.right.width
                };
                this.model.portProp(id, 'attrs/rect', {x: magnetPos.width, y: magnetPos.height});
                this.model.portProp(id, 'attrs/use', {
                    x: magnetPos.width + (_style.magnet.right.width - _style.icon.width) / 2,
                    y: magnetPos.height +(_style.node.multi.section - _style.icon.height) / 2
                });
            }

        },

        addMagnets: function(){
            if (!this.model.get('input')) {
                this.model.set('input', {
                    group: "input",
                    markup: "<rect />",
                    attrs: {
                        rect: {
                            class: "magnet input left",
                            magnet: true,
                            width: _style.magnet.left.width,
                            height: _style.magnet.left.height,
                            fill: `url(#${_style.gradient.input.left})`
                        }
                    }
                });
                this.model.addPort(this.model.get('input'));
            }
        },

        highlightChoiceConnectedLinks: function(event) {
            let portIds = [ // Port IDs of the relevant outport and inport
                $(event.currentTarget).prop('id'),
                (this.model.getPorts()).find(port => port.group = "input").id
            ];

            // Get all connected links, including those we're not interested in
            let allLinks = _graph.getConnectedLinks(this.model);

            // Filter out all the links that aren't connected to one of the ports we're interested in.
            let linksToHighlight = allLinks.filter(
                link => portIds.some(portId =>
                    portId == link.get('source').port || portId == link.get('target').port
                )
            );

            _clearAllLinkHighlights();
            _highlightLinks(linksToHighlight);

            event.stopPropagation();
        }

    });

    joint.shapes.dialogue.Base.define('dialogue.Text', {
        size: { width: _style.node.text.width, height: _style.node.text.height },
        ports: { groups: { "output": { position: {args: {
            y: _style.node.text.height / 2
        } } } } },
        actor: '',  // Value to be set later.
        speech: ''  // Value to be set later.
    });
    joint.shapes.dialogue.TextView = joint.shapes.dialogue.BaseView.extend({
        template:
            `<div class="node text" height="${_style.node.text.height}">` +
                '<textarea class="speech" rows="4" cols="27" placeholder="¶"></textarea>' +
                '<div class="left">' +
                    '<button class="delete">x</button>' +
                    '<img class="portrait" alt="Character portrait" src="" />' +
                    '<select class="actor" />' +
                '</div>' +
            '</div>',

        initialize: function () {
            joint.shapes.dialogue.BaseView.prototype.initialize.apply(this, arguments); // Run the parent function first.

            this.$box.$img = this.$box.find('img.portrait');
            this.$box.$character_select = this.$box.find('select.actor');
            this.$box.$speech = this.$box.find('textarea.speech');

            // Generate list of character options
            for (let character of _characters) {
                let $character_option = $(document.createElement("option"))
                    .attr('value', character.name)
                    .text(character.name);

                this.$box.$character_select.append($character_option);
            }

            this.$box.$character_select.change(event =>{
                this.model.set('actor', $(event.target).val());
            });

            this.$box.$speech.on('input propertychange', event => {
                this.model.set('speech', $(event.target).val());
            });

            // Set enter to submit (which will spawn a new textbox).
            this.$box.$speech.keypress(event => {
                if (event.key === "Enter" && !event.shiftKey) {
                    $(event.target).submit();
                    // Cancels the keypress, so no additional enter is entered.
                    event.preventDefault();
                }
            });

            this.$box.$speech.submit(event => { // Spanw a new textbox when enter is pressed
                let bounding_box = this.model.getBBox();
                let new_box = new joint.shapes.dialogue.Text({
                    position: {
                        x: bounding_box.x ,
                        y: bounding_box.y + bounding_box.height + (_gridSize * 1)
                    }
                });

                let parentActor = "";
                let portId = this.model.getPorts().find(port => port.group === "input").id;

                /* Try to find a valid parent actor for back & forth conversations */
                for (let link of _graph.getConnectedLinks(this.model)) {
                    // Make sure the link is connected to us.
                    if (link.get('source').port !== portId && link.get('target').port !== portId) { continue; }

                    let parent = link.getSourceElement() === this.model ? link.getTargetElement() : link.getSourceElement();
                    if (parent.attributes.type !== "dialogue.Text") { continue; }

                    parentActor = parent.get("actor");
                    if (parentActor) { break; }
                }

                new_box.set("actor", parentActor);

                let new_link = _defaultLink.clone();
                _graph.addCell(new_box); // The box has to be added to the graph before the ports become available.

                new_link.source({id: this.model.id, port: this.model.getPorts().find(element => element.group === "output").id });
                new_link.target({id: new_box.id, port: new_box.getPorts().find(element => element.group === "input").id});
                _graph.addCell(new_link);


                new_box.trigger('focus');
                event.preventDefault();
            });

            this.$box.$speech.keydown(event => { // Character name switching code.
                // Using keydown instead of keypress, because it doesn't work correctly in Google Chrome
                if(!event.altKey && (SETTINGS.treatAltgrAsAlt || !event.ctrlKey))
                    return;


                let options = _characters.map(element => element.name);

                //this.$box.$character_select; // Our dropdown menu.
                let offset = this.$box.$character_select.prop('selectedIndex') + 1;
                for (let i = 0; i < options.length; i++) {
                    let index = (i + offset) % options.length;
                    if (options[index].charAt(0).toLowerCase() === event.key.toLowerCase()) {
                        this.model.set('actor', options[index]);
                        break;
                    }
                }
                event.preventDefault();
            });

            this.listenTo(this.model, 'focus', this.focus);
        },

        focus: function() {
            this.$box.$speech.focus();
        },

        updateBox: function() {
            joint.shapes.dialogue.BaseView.prototype.updateBox.apply(this, arguments);

            let selectedChar = _characters.find(element => element.name === this.model.get("actor"));
            if (!selectedChar) { selectedChar = _characters.find(element => element.name === "unknown"); }

            let imageURL = `.\\images\\characters\\${selectedChar.url}`;

            _testImage(imageURL).catch(error => {
                console.error(`This character does not have a valid image.\nCharacter name: "${selectedChar.name}", Location: "${imageURL}"`, error);
                imageURL = ".\\images\\characters\\" + _characters.find(element => element.name === "unknown").url;
            }).then(() => {
                this.$box.$img.attr({
                    'src': imageURL,
                    'title': selectedChar.name,
                    'alt': selectedChar.name
                });
            });

            _getCharacterColour(selectedChar).then(result => {
                this.model.attr({
                    body: {
                        fill: {
                           type: 'linearGradient',
                           stops: [
                               { offset: '0%', color: '#abbaab' },
                               { offset: '24%', color: '#ffffff' },
                               { offset: '24.01%', color: `hsl(${result.hue}, ${result.saturation}%, ${result.lightness}%)` },
                               { offset: '95%', color: `hsl(${result.hue}, ${result.saturation}%, 75%)` },
                               { offset: '100%', color: `hsl(${result.hue}, ${result.saturation}%, 80%)` }
                           ]
                        }
                    }
                });
            });

            this.$box.$character_select.val(selectedChar.name);
            this.$box.$speech.val(this.model.get('speech'));
        },

    });

    joint.shapes.dialogue.Base.define('dialogue.Set', {
        size: { width: _style.node.set.width, height: _style.node.set.height },
        ports: { groups: { "output": { position: { args: {
            y: _style.node.set.height / 2
        } } } } },
        userKey: '',  // Value to be set later.
        userValue: '' // Value to be set later.
    });
    joint.shapes.dialogue.SetView = joint.shapes.dialogue.BaseView.extend({
        template:
        '<div class="node set">' +
            '<button class="delete">x</button>' +
            '<input type="text" class="userKey" placeholder="Key" />' +
            '<input type="text" class="userValue" placeholder="Value" />' +
        '</div>',

        initialize: function() {
            joint.shapes.dialogue.BaseView.prototype.initialize.apply(this, arguments);

            this.$box.$userKey = this.$box.find("input.userKey");
            this.$box.$userValue = this.$box.find("input.userValue");

            this.$box.$userKey.change( event => {
                this.model.set('userKey', $(event.target).val());
            });

            this.$box.$userValue.change(event => {
                this.model.set('userValue', $(event.target).val());
            });
        },

        updateBox: function() {
            joint.shapes.dialogue.BaseView.prototype.updateBox.apply(this, arguments);

            if (!this.$box.$userKey.is(':focus')){
                this.$box.$userKey.val(this.model.get('userKey'));
            }

            if (!this.$box.$userValue.is(':focus')){
                this.$box.$userValue.val(this.model.get('userValue'));
            }
        }
    });

    joint.shapes.dialogue.Base.define('dialogue.Note', {
        size: { ..._style.node.note },
        noteText: null
    });
    joint.shapes.dialogue.NoteView = joint.shapes.dialogue.BaseView.extend({
        template:
        '<div class="node note">' +
            '<textarea class="notetext" rows="1" placeholder="..."></textarea>' +
            '<button class="delete">x</button>' +
        '</div>',
        padding: 25,

        initialize: function() {
            joint.shapes.dialogue.BaseView.prototype.initialize.apply(this, arguments);

            this.$box.$note = this.$box.find("textarea");

            this.$box.$note.width(_style.node.note.width - this.padding * 2);
            this.$box.$note.css({top: this.padding, left: this.padding, position:'absolute'});

            this.$box.$note.autoResize({animate: false, extraSpace: 0, onResize: () => this.updateBox()});
            this.$box.$note.on('blur', event => {
                this.model.set('noteText', $(event.target).val());
            })

            this.$box.$note.text(this.model.get('noteText'));

        },

        updateBox: function() {
            joint.shapes.dialogue.BaseView.prototype.updateBox.apply(this, arguments);
            this.model.resize(this.$box.$note.outerWidth() + this.padding * 2,
                this.$box.$note.outerHeight() + this.padding *2);
        },

        addMagnets: function() { /* Do nothing, we don't want magnets*/ }
    });

    joint.shapes.dialogue.Base.define('dialogue.Scene', {
        size: { ..._style.node.scene },
        url: '', // Value to be set later.
    });
    joint.shapes.dialogue.SceneView = joint.shapes.dialogue.BaseView.extend({
        template:`
            <div class="node scene">
                <button class="delete">x</button>
                <input type="text" placeholder="...">
            </div>`,
        initialize() {
            joint.shapes.dialogue.BaseView.prototype.initialize.apply(this, arguments);

            this.$box.$url = this.$box.find("input");

            this.$box.on("dblclick", (event) => {
                const url = this.$box.$url.val() 

                _createOrOpenScene(url);
            })

            this.$box.$url.on("change", event => {
                this.model.set('url', event.target.value);
            })
        },
        updateBox(){
            joint.shapes.dialogue.BaseView.prototype.updateBox.apply(this, arguments);

            if (!this.$box.$url.is(':focus')){
                this.$box.$url.val(this.model.get('url'))
            }
        },
        addMagnets(){
            // We only want one (input) magnet
            if (!this.model.get('input')) {
                this.model.set("input", {
                    group: "input",
                    markup: "<rect />",
                    attrs: {
                        rect: {
                            class: "magnet input left",
                            magnet: true,
                            width: _style.magnet.left.width,
                            height: this.model.get('size').height,
                            fill: `url(#${_style.gradient.input.left})`
                        }
                    }
                });
                this.model.addPort(this.model.get('input'));
            }
        }
    })
    
    joint.shapes.dialogue.Base.define('dialogue.Start', {
        size: { ..._style.node.start },
        ports: { groups: { "output": { position: { args: {
            x: _style.node.start.width - _style.magnet.right.width,
            y: 0

        } } } } },
    });
    joint.shapes.dialogue.StartView = joint.shapes.dialogue.BaseView.extend({
        template:`
            <div class="node start">
                <button class="delete">x</button>
                <div>❯❯❯❯❯</div>
                <!--input type="text" class="scene" placeholder="..." -->
            </div>`,
        addMagnets(){
            // We only want one (input) magnet
            if (!this.model.get('output')) {
                this.model.set("output", {
                    group: "output",
                    markup: "<rect />",
                    attrs: {
                        rect: {
                            class: "magnet output right",
                            magnet: true,
                            width: _style.magnet.right.width,
                            height: this.model.get('size').height,
                            fill: `url(#${_style.gradient.output.right})`
                        }
                    }
                });
                this.model.addPort(this.model.get('output'));
            }
        }
    });

    joint.shapes.dialogue.Multi.define('dialogue.Choice', {
    });
    joint.shapes.dialogue.ChoiceView = joint.shapes.dialogue.MultiView.extend({
        template:
            '<div class="node multi choice">' +
                `<div class="multi header" style="height: ${_style.node.choice.section}px;">` +
                    '<button class="delete">x</button>' +
                '</div>' +
                '<div class="choiceContainer"></div>' +
                '<div class="footer">' +
                    `<div class="add-row" style="height: ${_style.node.choice.section}px;">` +
                        '<button class="add"><span class="plus">+</span></button>' +
                    '</div>' +
                '</div>' +
            '</div>',

        choiceTemplate:
            `<div style="height: ${_style.node.choice.section}px;" id="<%= TemplateId %>">` +
                '<button class="remove"></button>' +
                '<input type="text" class="value" value="<%= templateValue %>">' +
            '</div>',

        defaultTemplate:
            `<div style="height: ${_style.node.choice.section}px;" id="<%= TemplateId %>">` +
                '<input type="text" class="value default" value="<%= templateValue %>">' +
            '</div>',

        initialize: function() {
            joint.shapes.dialogue.MultiView.prototype.initialize.apply(this, arguments);
            if (this.model.get('values').length < 1) {
                this.addChoice();
            }

            (function _updateColour(outer){
                if (_style.gradient.hasOwnProperty('choice')) {
                    outer.model.attr({ rect: { fill: `url(#${_style.gradient.choice})` } });
                } else {
                    window.setTimeout((o) => _updateColour(o), 50, outer);
                }
            })(this);
        }
    });

    joint.shapes.dialogue.Multi.define('dialogue.Branch', {
        size: { width: _style.node.branch.width, height: _style.node.branch.height },
        ports: { groups: { "output": { position: { args: {
            x: 0,
            y: 0
        } } } } },
        userKey: '',
    });
    joint.shapes.dialogue.BranchView = joint.shapes.dialogue.MultiView.extend({
        template:
        '<div class="node multi branch">' +
            '<div class="header">' +
                `<div class= "delete-holder" style="height: ${_style.node.branch.section}px;"><button class="delete">x</button></div>` +
                `<div style="height: ${_style.node.branch.section}px; width: 100%" ><input type="text" class="userKey" placeholder="Variable" /></div>` +
            '</div>' +
            '<div class="choiceContainer"></div>' +
            '<div class="footer">' +
                `<div class="add-row" style="height: ${_style.node.branch.section}px;">` +
                    '<button class="add"><span class="plus">+</span></button>' +
                '</div>' +
            '</div>' +
        '</div>',

        choiceTemplate:
            `<div style="height: ${_style.node.branch.section}px;" id="<%= TemplateId %>">` +
                '<button class="remove"></button>' +
                '<input type="text" class="value" value="<%= templateValue %>">' +
            '</div>',

        defaultTemplate:
        `<div style="height: ${_style.node.branch.section}px;" id="<%= TemplateId %>">` +
            '<input type="text" class="value default" value="<%= templateValue %>">' +
        '</div>',

        initialize: function () {
            joint.shapes.dialogue.MultiView.prototype.initialize.apply(this, arguments);
            //this.model.set('userKey', null);

            this.$box.$userKey = this.$box.find("input.userKey");

            this.$box.$userKey.on('input propertychange', event => {
                this.model.set('userKey', $(event.target).val());
            });

            if (this.model.get('values').length < 1) {
                this.addChoice('Default', true);
            }
            if (this.model.get('values').length < 2) {
                this.addChoice();
            }
        },

        updateBox: function() {
            joint.shapes.dialogue.MultiView.prototype.updateBox.apply(this, arguments);
            if (!this.$box.$userKey.is(':focus')){
                this.$box.$userKey.val(this.model.get('userKey'));
            }
        },
    });

    function _generateId(length = 16, prefix = "id_"){
        if (!(Number.isInteger(length = Number(length)) || length < 1)){ return null; }
        let seed = "";
        do{
            seed += Math.random().toString(32).slice(2);
        } while  (seed.length < length);
        return prefix + seed.slice(0, length);
    }

    function _pad(baseString, width, padSymbol = '0') {
      baseString += '';
      return baseString.length >= width ? baseString : new Array(width - baseString.length + 1).join(padSymbol) + baseString;
    }

    function _testImage(url, timeout = 5000) {
        return new Promise(function (resolve, reject) {
            const timer = setTimeout(function () {
                // reset .src to invalid URL so it stops previous
                // loading, but doesn't trigger new load
                img.src = "//!!!!/test.jpg";
                reject("Timeout occured");
            }, timeout);

            const img = new Image();
            img.onerror = img.onabort = function () {
                clearTimeout(timer);
                reject("Not a valid image");
            };
            img.onload = function () {
                clearTimeout(timer);
                resolve("Success");
            };
            
            img.src = url;
        });
    }

    function _getCharacterColour(character) {
        if (!character.promise) { // On cache miss.
            character.promise = new Promise((resolve, reject) => {
                if(character.color){
                    resolve(character.color)
                }

                const DEFAULTCOLOUR = {hue: 0, saturation: 0, lightness: 70};
                const imageURL = `.\\images\\characters\\${character.url}`;
                _testImage(imageURL).catch(error => {
                    resolve(DEFAULTCOLOUR);
                }).then(() => {
                    Vibrant.from(imageURL).getPalette().then(palette => {
                        let colour = palette.DarkVibrant || palette.Vibrant || palette.DarkMuted  ||palette.Muted || palette.lightVibrant || palette.lightMuted;
                        let hsl;

                        if (!colour) { // Default colour in case we messed up.
                            hsl = DEFAULTCOLOUR;
                        } else {
                            hsl = {hue: colour.getHsl()[0] * 360, saturation: colour.getHsl()[1] * 100, lightness: colour.getHsl()[2] * 100};
                            hsl.saturation = hsl.saturation * 0.80;
                            hsl.lightness = hsl.lightness * 0.60 + 30;
                        }
                        resolve(hsl);
                    });
                });
            });
        }

        return character.promise;
    }

    function _validateConnection(cellViewSource, magnetSource, cellViewTarget, magnetTarget, end, linkView) {
    	// Prevent linking to itself.
    	if (magnetSource == magnetTarget || cellViewSource == cellViewTarget)
    		return false;

        // Prevent inputs/outputs from linking to themselves
        let targetType = magnetTarget.getAttribute("class").includes("output") ? "output" : "input";
        if (magnetSource.getAttribute('port-group') === targetType)
            return false;

        // Allow many inputs, but only one output
        if (targetType == "input")
            return true;

        // Check for link count. Only allow a connection if there's only one.
        let portId = magnetTarget.getAttribute('port');
        let targetLinks = _graph.getConnectedLinks(cellViewTarget.model);
        let portHasConnections = targetLinks.some(link => {
            if (linkView.model == link) return false; // Discount the current connection.
            return (link.get('source').port === portId ||
                    link.get('target').port === portId);
        });

        return !portHasConnections;
    }

    function _validateMagnet(cellView, magnet) {
        let isOutput = magnet.getAttribute("class").includes("output");
        if (!isOutput) {
            return true;
        }

        let links = _graph.getConnectedLinks(cellView.model);
        let portId = magnet.getAttribute('port');

        let hasConnection = links.some(
            link => link.get('source').port === portId || link.get('target').port === portId
        );

        return !hasConnection;
    }

    function _isValidCharacter(character){
        return character.hasOwnProperty('name') && character.hasOwnProperty('url');
    }

    function _addNodeToGraph(nodeType, location, args = {}) {
        args.position = location;
        let newNode = new nodeType (/*{ position: location }*/args);
        _graph.addCell(newNode);
        return newNode;
    }

    function _handleFile(fileBlob) {
        let reader = new FileReader();

        reader.onloadend = event => {
            load(JSON.parse(event.target.result));
        };

        reader.readAsText(fileBlob);
    }

    function _findConnectedElements(ports = [], links = [], trim = false) {
        let outbound = [];
        for (let port of ports) {
            let portFound = false;
            for (let link of links) {
                if (link.get('source').port === port.id){
                    portFound = true;
                    outbound.push({
                        text: port.text,
                        id: link.get('target').id
                    });
                    break;
                } else if (link.get('target').port === port.id) {
                    portFound = true;
                    outbound.push({
                        text: port.text,
                        id: link.get('source').id
                    });
                    break;
                }
            }

            if (!trim && !portFound) {
                outbound.push({
                    text: port.text,
                    id: null
                });
            }
        }

        return outbound;
    }

    async function _CSDEToGraph(jsonObj, graph) {
        notify("Importing CSDE file", "med");
        //graph.clear();

        console.log(`\tVersion: ${jsonObj.version}`);

        console.log(`\tTitle: ${jsonObj.title}`);
        _setSceneName(jsonObj.title)

        jsonObj.createdNodes = [];
        return _CSDEToGraph_CreateNodes(jsonObj, graph);
        // will link into createLinks as well.
    }

    function _CSDEToGraph_CreateNodes(jsonObj, graph) {
        if (!jsonObj.nodes.length) {
            // If there are no nodes, do nothing
            return;
        }

        let node = jsonObj.nodes.pop();
        let newNode = null;
        let values = null;
        switch (node.type) {
            case "dialogue.Text":
                newNode = _addNodeToGraph(joint.shapes.dialogue.Text, node.position, {
                    id: node.id,
                    actor: node.actor,
                    speech: node.text
                });
                break;
            case "dialogue.Set":
                newNode = _addNodeToGraph(joint.shapes.dialogue.Set, node.position, {
                    id: node.id,
                    userKey: node.key,
                    userValue: node.value
                });
                break;
            case "dialogue.Branch":
                let firstChoice = true;
                values = [];
                for (let element of node.outbound) {
                    values.push({id: element.id || _generateId(), value: element.text, isDefault: firstChoice});
                    firstChoice = false;
                }
                newNode = _addNodeToGraph(joint.shapes.dialogue.Branch, node.position, {
                    id: node.id,
                    userKey: node.key,
                    values: values
                });

                break;
            case "dialogue.Choice":
                values = [];
                for (let element of node.outbound) {
                    values.push({id: element.id || _generateId(), value: element.text, isDefault: false});
                }

                newNode = _addNodeToGraph(joint.shapes.dialogue.Choice, node.position, {
                    id: node.id,
                    values: values
                });
                break;
            case "dialogue.Note": //comment
                newNode = _addNodeToGraph(joint.shapes.dialogue.Note, node.position, {
                    id: node.id,
                    noteText: node.text
                });
                break;
            case "dialogue.Scene": // Scene node
                newNode = _addNodeToGraph(joint.shapes.dialogue.Scene, node.position, {
                    id: node.id,
                    url: node.url
                });
            case "dialogue.Start": // Start node
                newNode = _addNodeToGraph(joint.shapes.dialogue.Start, node.position, {
                    id: node.id
                })
            default:
                break;
        }
    
        jsonObj.createdNodes.push(node);

        return new Promise(resolve => {
            if (jsonObj.nodes.length > 0) {
                // If there's more nodes to add to the graph, do so later. This way we don't block this thread.
                window.setImmediate(() => {
                    _CSDEToGraph_CreateNodes(jsonObj, graph).then(resolve);
                });
            } else {
                window.setImmediate(() => {
                    _CSDEToGraph_CreateLinks(jsonObj.createdNodes, graph).then(resolve);
                });
            }
        })
        // return newNode;
    }

    function _CSDEToGraph_CreateLinks(nodelist, graph) {
        let node = nodelist.pop();
        for (let link of node.outbound) {
            if (!link.id) continue;

            let new_link = _defaultLink.clone();

            let inboundId = node.id;
            let inboundPort = null;
            let outboundId = link.id;
            let outboundPort = graph.getCell(outboundId).getPorts().find(element => element.group === "input").id;

            if (["dialogue.Text", "dialogue.Set"].includes(node.type)){
                // ??? Why are these two different?
                inboundPort = graph.getCell(inboundId).getPorts().find(element => element.group === "output").id;
            } else {
                inboundPort = link.id;
            }

            new_link.source({id: inboundId,  port: inboundPort });
            new_link.target({id: outboundId, port: outboundPort});

            graph.addCell(new_link);
        }

        if (nodelist.length > 0) {
            // If there's more nodes to link, add a todo, so we don't block this thread.
            return new Promise(resolve => {
                window.setImmediate(() => {
                    _CSDEToGraph_CreateLinks(nodelist, graph).then(resolve);
                });
            });
        } else {
            notify("CSDE file has been imported.", "med");
            return Promise.resolve(true)
        }
    }

    function _graphToCSDE() {
        const _remapConnections = obj => ({
            id: newIds.get(obj.id) || null,
            text: obj.text
        })

        const nodes = [];
        const newIds = new Map();

        let nodeIdCounter = 0;
        for (let element of _graph.getElements()) {
            newIds.set(element.id, _pad(nodeIdCounter.toString(36), 4));
            nodeIdCounter++;
        }

        for (let element of _graph.getElements()) {
            let node = {
                id: newIds.get(element.id),
                type: element.get("type"),
                position: element.get('position'),
                outbound: []
            };

            let ports;
            switch (node.type) {
                case "dialogue.Text":
                    node.actor = element.get("actor") || "unknown";
                    node.text = element.get("speech") || "";
                    ports = [{
                        id: element.getPorts().find(port => port.group === "output").id,
                        text: "output"
                    }];
                    break;
                case "dialogue.Set":
                    node.key = element.get("userKey") || "";
                    node.value = element.get("userValue") || "";
                    ports = [{
                        id: element.getPorts().find(port => port.group === "output").id,
                        text: "output"
                    }];
                    break;
                case "dialogue.Branch":
                    node.key = element.get("userKey") || "";
                    ports = element.get("values").map(({id, value}) => ({
                        id: id,
                        text: value
                    }));
                    break;
                case "dialogue.Choice":
                    ports = element.get("values").map(({id, value}) => ({
                        id: id,
                        text: value
                    }));
                    break;
                case "dialogue.Start": // falls through
                    ports = [{
                        id: element.getPorts().find(port => port.group === "output").id,
                        text: "output"
                    }];
                    break;
                case "dialogue.Note":
                    node.text = element.get("noteText") || "";
                    node.outbound = [];
                    break;
                case "dialogue.Scene":
                    node.url = element.get("url") || "";
                    node.outbound = [];
                    break;
                default:
                    node.outbound = [];
                    break;
            }

            if (["dialogue.Text", "dialogue.Set", "dialogue.Branch", "dialogue.Choice", "dialogue.Start"].includes(node.type)) {
                /* All these nodes have this in common */
                node.outbound = _findConnectedElements(ports, _graph.getConnectedLinks(element), false).map(_remapConnections);
            }

            if (["dialogue.Text", "dialogue.Set", "dialogue.Branch", "dialogue.Choice", "dialogue.Note", "dialogue.Scene", "dialogue.Start"].includes(node.type)) {
                nodes.push(node);
            }
        }

        return {
            version: "0.1.1",
            title: _currentSceneName,
            nodes: nodes
        };
    }


    function _addContextMenus(element, paper) {
        // Right click menu.
        $.contextMenu({
            selector: '#context-menu-container',
            callback: function (itemKey, opt, rootMenu, originalEvent) {

                let pos = {
                    x: Math.round((opt.$menu.position().left + element.scrollLeft()) / _gridSize) *_gridSize,
                    y: Math.round((opt.$menu.position().top +  element.scrollTop()) / _gridSize) *_gridSize
                };

                switch (itemKey) { // If we've selected any of the node types, add that node type to the graph.
                    case 'Text':
                    case 'Choice':
                    case 'Set':
                    case 'Note':
                    case 'Scene':
                    case 'Start':
                    case 'Branch':
                    case 'Base':
                    case 'Multi':
                        _addNodeToGraph(joint.shapes.dialogue[itemKey], pos);
                        break;
                    default:
                        notify("This option has not yet been implemented.", "low");
                        return;
                }
            }, items: {
                'Text':   {name: 'Speech'},
                'Choice': {name: 'Choice'},
                'Set':    {name: 'Set flag'},
                'Branch': {name: 'Conditional branch'},
                'Note':   {name: 'Note'},
                'Scene':  {name: 'Scene'},
                'Start':  {name: 'Start'},
                // 'Base':   {name: 'DEBUG - base'},
                // 'Multi':  {name: 'DEBUG - multi'},
                'data': {
                    name: 'Data management',
                    items: {
                        'import': {
                            name: "Import from file",
                            callback: async () => {
                                const result = await dialog.showOpenDialog({properties: ["openFile"]});
                                if(result.canceled) return;
                                
                                const { filePaths: [ filePath ] } = result;

                                _loadFile(filePath);
                            }
                        }, 'export-csde': {
                            name: "Export (CSDE format)",
                            callback: async () => {
                                const result = await dialog.showSaveDialog()
                                if(result.canceled) return;

                                const { filePath } = result;
                                const { dir, base } = path.parse(filePath);

                                _exportToFile(dir, base, _graphToCSDE())
                            }
                        },
                        'new': {
                            name: 'Open blank file',
                            callback: _clearGraph
                        }
                    }
                }
            }
        });

        // Connector drag-off menu.
        $.contextMenu({
            selector: 'div#drop-menu',
            callback: function (itemKey, opt, rootMenu, originalEvent) {
                let position = {
                    x: Math.round((opt.$menu.position().left + element.scrollLeft()) / _gridSize) *_gridSize,
                    y: Math.round((opt.$menu.position().top +  element.scrollTop()) / _gridSize) *_gridSize
                };

                newElement = new joint.shapes.dialogue[itemKey]({position});
                _graph.addCell(newElement);

                _globalLinkValue.link.target({id: newElement.id, port: newElement.getPorts().find(element => element.group === _globalLinkValue.type).id});

                _globalLinkValue = null;
            }, items: {
                'Text': {name: 'Speech'},
                'Choice': {name: 'Choice'},
                'Set': {name: 'Set flag'},
                'Branch': {name: 'Conditional branch'},
                'Scene': {name: 'Scene'},
                'Start': {name: 'Start'},
            }
        });

        paper.on('blank:contextmenu', (event, x, y) => {
            $('#context-menu-container').contextMenu({
                x: x - _$container.scrollLeft(),
                y: y - _$container.scrollTop(),
            })
            
        })
    }

    function _registerBoxSelect(paper, graph) {
        paper.on('blank:pointerdown', (event, x, y) => {
            if (!event.shiftKey) { return; }

            const box = new joint.shapes.standard.Rectangle();
            box.resize(1, 1);
            box.position(x, y);
            box.attr('body/fill', 'transparent');
            box.attr('body/stroke', 'yellow');

            box.addTo(graph);

            event.data = {
                isDrawing: event.shiftKey,
                start: { x, y },
                box,
            }
        })

        paper.on('blank:pointermove', ({data: {start, box, isDrawing}}, x, y) => {
            if (!isDrawing) { return }

            box.position(Math.min(start.x, x), Math.min(start.y, y))
            box.resize(Math.abs(x - start.x), Math.abs(y - start.y))
        })

        paper.on('blank:pointerup', ({altKey, data: {start, isDrawing, box}}, x, y) => {
            if (!isDrawing) { return }

            const width = Math.abs(x - start.x)
            const height = Math.abs(y -start.y)
            x = Math.min(start.x, x)
            y = Math.min(start.y, y)

            box.remove()

            const views = _paper.findViewsInArea({ x, y, width, height })
            const models = views.map(view => view.model)

            if(altKey){
                return _unselectNodes(models)
            } else {
                return _selectNodes(models)
            }
        })

        // clear selection when clicking without moving.
        paper.on('blank:pointerclick', _clearSelection)

        paper.on('element:pointerdown', (elementView, event) => {
            const element = elementView.model
            if (!_selectedNodes.has(element)) { return; }
            event.data = {...event.data, origin: element.position() }
        })
        paper.on('element:pointerup', (elementView, event) => {
            const element = elementView.model
            if (!_selectedNodes.has(element)) { return; }
            const destination = element.position();
            
            const x = destination.x - event.data.origin.x
            const y = destination.y - event.data.origin.y

            const otherNodes = [..._selectedNodes].filter(n => n !== element)

            for (const node of otherNodes) {
                node.translate(x, y)
            }
        })
    }

    function _registerPanning(paper, element) {
        paper.on('blank:pointerdown', (event, x, y) => {
            if(event.shiftKey) return;
            _mouseObj.panning = true;
            _mouseObj.position = {x: event.pageX, y: event.pageY};
            $('body').css('cursor', 'move');
        });

        element.mousemove(event => {
            if (!_mouseObj.panning) return;

            element.scrollLeft(element.scrollLeft() + _mouseObj.position.x - event.pageX);
            element.scrollTop(element.scrollTop()   + _mouseObj.position.y - event.pageY);

            _mouseObj.position = {x: event.pageX, y: event.pageY};
        });

        element.mouseup(event => {
            _mouseObj.panning = false;
            $('body').css('cursor', 'default');
        });
    }

    function _registerHotkeys(paper) {
        let findInPage = new FindInPage(remote.getCurrentWebContents())

        $(document).on('keydown', event => {
            /* Save */
            if (event.ctrlKey && event.key === 's') {
                const shouldSaveScene = Boolean(_currentSceneName);
                _saveBackups(shouldSaveScene);

                event.preventDefault();
            }

            /* Find */
            if (event.ctrlKey && event.key === 'f') {
                console.log("Opening find dialogue")
                findInPage.openFindWindow()
            }
            
            /* Zoom in */
            if (event.ctrlKey && (event.key === '=' || event.key === '+')) {
                webFrame.setZoomLevel(webFrame.getZoomLevel() + 1);
            }

            /* Zoom out */
            if (event.ctrlKey && event.key === '-') {
                webFrame.setZoomLevel(webFrame.getZoomLevel() - 1);

            }

            /* Reset zoom */
            if (event.ctrlKey && event.key === '0') {
                webFrame.setZoomLevel(0);
            }
        });

        const scrollHandler = (event, x, y, delta) => {
            if(event.ctrlKey){
                // Delta is either -1 or +1, so this works out!
                webFrame.setZoomLevel(webFrame.getZoomLevel() + delta);
            }
        };
        const scrollCellHandler = (cellView, evt, x, y, delta) => {
            if(evt.ctrlKey){
                // Delta is either -1 or +1, so this works out!
                webFrame.setZoomLevel(webFrame.getZoomLevel() + delta);
            }
        };

        paper.on("cell:mousewheel", scrollCellHandler);
        paper.on("blank:mousewheel", scrollHandler);
    }

    function _getSavefileName(randomized = false) {
        const { fileExtension } = SETTINGS
        if(randomized){
            return `csde-${_generateId(6, "")}${fileExtension}`;
        } else {
            return `csde${fileExtension}`;

        }
    }

    function _getSavefileLocation(filename = '') {
        return path.join(os.homedir(), SETTINGS.fileExtension, filename);
    }

    function _createGradients() {
        let gradients = {
            input: {
                left: _paper.defineGradient({
                    type: 'linearGradient',
                    stops: [
                        { offset: '0%', color: '#D33' },
                        { offset: '85%', color: '#311' },
                        { offset: '100%', color: "#311", opacity: 0 }
                    ]
                }), right: _paper.defineGradient({
                    type: 'linearGradient',
                    stops: [
                        { offset: '0%', color: "#311", opacity: 0 },
                        { offset: '15%', color: '#311' },
                        { offset: '1000%', color: '#D33' }
                    ]
                })
            },
            output: {
                left: _paper.defineGradient({
                    type: 'linearGradient',
                    stops: [
                        { offset: '0%', color: '#DDD' },
                        { offset: '85%', color: '#333' },
                        { offset: '100%', color: "#111", opacity: 0 }
                    ]
                }), right: _paper.defineGradient({
                    type: 'linearGradient',
                    stops: [
                        { offset: '0%', color: "#111", opacity: 0 },
                        { offset: '15%', color: '#333' },
                        { offset: '100%', color: "#DDD" }
                    ]
                })
            }
        };

        let main = _characters.find(char => char.main);
        if (main) {
            _getCharacterColour(main).then(result =>{
                gradients.choice = _paper.defineGradient({
                    type: 'linearGradient',
                    stops: [
                        { offset: '0%', color: `hsl(${result.hue}, ${result.saturation}%, ${result.lightness}%)` },
                        { offset: '1000%', color: `hsl(${result.hue}, ${result.saturation}%, 77%)` },
                    ]
                });
            });
        } else {
            gradients.choice = _paper.defineGradient({
                type: 'linearGradient',
                stops: [
                    { offset: '0%', color: "#F82" },
                    { offset: '100%', color: "#FF8"}
                ]
            });
        }
        return gradients;
    }

    function _clearAllLinkHighlights() {
        for (const link of _highlightedLinks) {
            const view = link.findView(_paper);
            view.unhighlight(null, _linkHighlightClass);
        }
        _highlightedLinks = [];
    }

    function _highlightLinks(linksToHighlight) {
        if (!Array.isArray(linksToHighlight) || ! linksToHighlight.every(link => link.isLink())) {
            throw new TypeError("Please provide an array of links.");
        }

        for (const link of linksToHighlight) {
            const view = link.findView(_paper);
            view.highlight(null, _linkHighlightClass);
        }

        _highlightedLinks.push(...linksToHighlight);
    }

    function _clearSelection() {
        for (const node of _selectedNodes) {
            const view = node.findView(_paper);
            view.unhighlight()
        }
        _selectedNodes = new Set();
    }

    function _selectNodes(nodesToSelect) {
        if (!Array.isArray(nodesToSelect) || ! nodesToSelect.every(node => node.isElement())) {
            throw new TypeError("Please provide an array of Elements.");
        }

        for (const node of nodesToSelect) {
            const view = node.findView(_paper)
            view.highlight()

            _selectedNodes.add(node)
        }
    }

    function _unselectNodes(nodesToUnselect) {
        if (!Array.isArray(nodesToUnselect) || ! nodesToUnselect.every(node => node.isElement())) {
            throw new TypeError("Please provide an array of Elements.");
        }

        for(const node of nodesToUnselect) {
            const view = node.findView(_paper)
            view.unhighlight()
            _selectedNodes.delete(node)
        }
    }

    function initialize(baseElement, {width = 800, height = 600} = {}) {
        if (!(baseElement instanceof jQuery)) { throw new TypeError("The base element must be a jQuery object"); }
        _$container = baseElement;
        _$container.$paper = baseElement.find('div#paper');

        _graph = new joint.dia.Graph();
        _paper = new joint.dia.Paper({
            el: _$container.$paper,
            model: _graph,
            width: width,
            height: height,
            gridSize: _gridSize,
            preventContextMenu: false,
            drawGrid: {
                name: 'dot',
                args: { color: '#333366', thickness: 1.5},
            //     args: [ // for doubleMesh
            //         { color: 'black', thickness: 2 }, // settings for the primary mesh
            //         { color: 'grey', scaleFactor: 10, thickness: 1 } //settings for the secondary mesh
            // ]
            },
            defaultLink: _defaultLink,
            validateConnection: _validateConnection,
            validateMagnet: _validateMagnet,
            snapLinks: { radius: 100 }, // How many pixels away should a link 'snap'?
            restrictTranslate: false, // Stops elements from being dragged offscreen.
            perpendicularLinks: true, // Seems to do very little
            // markAvailable: true
            async: true,
        });

        _paper.on('link:pointerup', (cellView, evt, x, y) => {
            if (cellView.model.getTargetElement()) return; // If there is a target, we're not interested.

            const link = cellView.model;
            const portId = link.source().port;
            const origin = link.getSourceElement();
            const originType = origin.getPort(portId).group;

            _globalLinkValue = {
                link: cellView.model,
                type: (originType === "output" ? "input" : "output") // invert the type we should connect to.
            };
            $('div#drop-menu').contextMenu({
                x: x - _$container.scrollLeft(),
                y: y - _$container.scrollTop(),
            });
        });

        _graph.on('change:position add', function(cell) {
            _paper.fitToContent({padding: 4000});
        });

        _graph.on('change:source change:target', function(link) {
            let idList = [link._previousAttributes.target.id, link._previousAttributes.source.id, link.get('target').id, link.get('source').id];

            for (let id of idList) {
                if (id) {
                    _paper.findViewByModel(_graph.getCell(id)).updateBox();
                }
            }
        });

        _graph.on('remove', function(cell, collection, opt) {
            if (cell.isLink()) {
                let idList = [ cell.get('target').id, cell.get('source').id ];
                for (let id of idList) {
                    if (id) {
                        _paper.findViewByModel(_graph.getCell(id)).updateBox();
                    }
                }
            }
        });

        /* Requirements for drag/drop import */
        _$container.$paper.on("dragenter", event => {
            event.stopPropagation();
            event.preventDefault();
        });
        _$container.$paper.on("dragover", event => {
            event.stopPropagation();
            event.preventDefault();
            event.originalEvent.dataTransfer.dropEffect = 'copy';
        });
        _$container.$paper.on("drop", event => {
            event.stopPropagation();
            event.preventDefault();

            let file = event.originalEvent.dataTransfer.files[0]; // We're only intersted in one file.
            _handleFile(file);
        });
        
        // _paper.on('cell:pointerclick', function(cellView) {
        //     cellView.highlight();
        // });

        const scenenameTextbox = $("#filename-textbox")
        const scenenameSaveButton = $("#filename-button")

        scenenameTextbox.on('change', event => {
            _setSceneName(event.target.value)
        })

        scenenameSaveButton.on('click', event => {
            _saveScene(_graphToCSDE());
        });

        _style.gradient = _createGradients();

        _addContextMenus(_$container, _paper);

        _registerBoxSelect(_paper, _graph);

        _registerPanning(_paper, _$container);

        _registerHotkeys(_paper);

        /* Load if there is a state to load from. */
        const backupLocation = _getSavefileLocation();
        const autoOpenFileName = _getSavefileName(false);


        const filePath = path.join(backupLocation, autoOpenFileName);
        console.log("Opening ", filePath)
        _readFromFile(path.join(backupLocation, autoOpenFileName))
            .then(data => _CSDEToGraph(data, _graph));

        /* Enable autosave */
        autosave.start();
    }

    function notify(message, priority = "low") {
        if (!message) return;
        if ($.type(message) !== "string" || $.type(priority) !== "string") return;
        if (!["low", "med", "high"].includes(priority)) return;

        console.log("Notification: " + message);

        let timeoutDuration = 0;

        let $element = $('<div>', {
            "class": `notification prio-${priority}`
        })
        .appendTo("div#notifications")
        .text(message);

        if (priority === "high") {
            timeoutDuration = 10000;
        } else if (priority === "med") {
            timeoutDuration = 4000;
        } else { // if it is "low".
            timeoutDuration = 2000;
        }

        setTimeout(event => {
            $element.remove();
        }, timeoutDuration);
    }

    function addCharacters(newCharacters, list = getDefaultCharacterList()) {
        if (! Array.isArray(newCharacters) || ! newCharacters.every(_isValidCharacter)) {
            throw new TypeError("The character list must be an array of objects, with each object having a name and url key.");
        }
        if (('concat' in list) == false) {
            throw new TypeError("Try providing an array instead.");
        }
        return list.concat(newCharacters);
    }

    function addCharacter(newCharacter, list = getDefaultCharacterList()){
        if (! _isValidCharacter(newCharacter)) {
            throw new TypeError("The character must be an object with a name and url key.");
        }
        return addCharacters([newCharacter], list);
    }

    function getDefaultCharacterList(){
        return addCharacter({name: 'unknown', url: 'unknown.png'}, []);
    }

    return {
        addCharacter: character => _characters = addCharacter(character, _characters),
        addCharacters: characters => _characters = addCharacters(characters, _characters),
        clearCharacters: () => _characters = getDefaultCharacterList(),
        save: _saveBackups.bind(null, true),
        notify,
        autosave,
        start: initialize
    };
})();