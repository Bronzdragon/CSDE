/* jshint esversion: 6 */


let test = null;
var csde = (function csdeMaster(){

    let _$container = null;
    let _graph = null;
    let _characters = resetCharacters();
    let _mouseObj = {};

    const _defaultLink = new joint.dia.Link({
    	attrs: {
    		//'.marker-target': { d: 'M 10 0 L 0 5 L 10 10 z', },
    		// '/.link-tools .tool-remove circle, .marker-vertex': { r: 8 },
    	},
    }).connector('smooth');

    const style = {
        inputWidth: 64,
        outputWidth: 32
    };

    const _gridSize = 10;

    const node = {
        'text':   { width: 500, height: 200 },
        'set':    { width: 250, height: 100 },
        'choice': { width: 250, height: 200 },
        'branch': { width: 250, height: 200 }
    };

    // Register new models and views
    joint.shapes.dialogue = {};

    console.log(joint.shapes.standard.Rectangle);

    joint.shapes.standard.Rectangle.define('dialogue.Base', {
        size: { width: 256, height: 128 },
        attrs: {
            body: {
                x: 0, y: 0,
                //rx: 5, ry: 5, // For rounded corners.
                stroke: 'none',
                text: { display: 'none' },
            },
            root: { magnet: false },
        },
    });
    joint.shapes.dialogue.BaseView = joint.dia.ElementView.extend({
        template:
        '<div class="node">' +
            '<button class="delete">x</button>' +
            'Default node, please ignore.' +
        '</div>',

        initialize: function () {
            joint.dia.ElementView.prototype.initialize.apply(this, arguments);

            this.$box = $(_.template(this.template)());
            this.$box.$delete = this.$box.find('button.delete');

            this.$box.$delete.click(() => this.model.remove());

            // Update the box position whenever the underlying model changes.
            this.model.on('change', this.updateBox, this);
            // Remove the box when the model gets removed from the graph.
            this.model.on('remove', this.removeBox, this);

            // Not sure if the lines below are required or not.
            /*this.$box.find('input').on('mousedown click', event => { event.stopPropagation(); });
            this.$box.find('textarea').on('mousedown click', event => { event.stopPropagation(); });*/

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
            this.$box.css({ width: bbox.width, height: bbox.height, left: bbox.x, top: bbox.y, transform: `rotate(${this.model.get('angle') || 0}deg)` });

            return this;
        },

        removeBox: function(event) { this.$box.remove(); }
    });

    joint.shapes.dialogue.Base.define('dialogue.Multi', {
        values: null,
    });
    joint.shapes.dialogue.MultiView = joint.shapes.dialogue.BaseView.extend({
        template:
        '<div class="node">' +
            '<button class="delete">x</button>' +
            '<div class="choiceContainer"></div>' +
            '<button class="add">+</button>' +
        '</div>',

        choiceTemplate:
        '<div id="<%= TemplateId %>">' +
            '<button class="delete">-</button>' +
            '<input type="text" class="value" value="<%= templateValue %>">' +
        '</div>',

        defaultSize: 50,

        initialize: function() {
            this.model.set('values', new Map());
            joint.shapes.dialogue.BaseView.prototype.initialize.apply(this, arguments);

            this.$box.$choiceContainer = this.$box.find('div.choiceContainer');

            this.$box.$add = this.$box.find('button.add');
            this.$box.$add.click(() => this.addChoice());
        },

        updateBox: function() {
            joint.shapes.dialogue.BaseView.prototype.updateBox.apply(this, arguments);
            let values = this.model.get('values');

            for (let [id, value] of values) {
                let $choiceElement = this.$box.$choiceContainer.find('#' + id);

                if ($choiceElement.length > 0) { // If it has an associated element
                    $choiceElement.val(value);
                } else {
                    // There is a value, but no element to go along with it!
                    this.$box.$choiceContainer.append(this.createElement(id, value));
                    /*let size = this.model.get('size');

                    this.model.addPort({
                        group: 'outputs',
                        position: {
                            name: 'absolute',
                            args: {x: size.width - 64, y: size.height - 32}
                        }
                    });*/
                }
            }

            for (let element of this.$box.$choiceContainer.children()) {
                if (!values.has($(element).attr('id'))) {
                    $(element).remove();
                }
            }

            this.updateSize();
        },

        createElement: function(id, value = null) {
            let $newChoice = $(_.template(this.choiceTemplate)({
                TemplateId: id,
                templateValue: value
            }));

            $newChoice.$value = $newChoice.find('input.value');
            $newChoice.$deleteButton = $newChoice.find('button.delete');

            $newChoice.$value.on('input propertychange', event => {
                let values = this.model.get('values');
                values.set($newChoice.attr('id'), $(event.target).val());
                this.model.set('values', values);
            });

            $newChoice.$deleteButton.click(event => {
                this.model.get('values');
                let values = this.model.get('values');
                values.delete($newChoice.attr('id'));
                this.model.set('values', values);
                this.updateBox();
            });

            return $newChoice;
        },

        addChoice: function(defaultValue = null) {
            let values = this.model.get('values');

            values.set(_generateId(), defaultValue);
            this.model.set('values', values);
            this.updateBox();
        },

        updateSize: function() {
            this.model.set('size', {
                width: this.model.get('size').width,
                height: this.defaultSize + this.$box.$choiceContainer.outerHeight(true)
            });
        }
    });

    joint.shapes.dialogue.Base.define('dialogue.Text', {
        size: { width: node.text.width, height: node.text.height },
        ports: {
            groups: {
                'input': {
                    position: {
                        name: 'absolute',
                        args: { x: 0, y: 0}
                    },
                },
                'output': {position: {
                    name: 'absolute',
                    args: { x: 0, y: node.text.height / 2}
                },}
            },
        },
        actor: '', // Value to be set later.
        speech: ''  // Value to be set later.
    });
    joint.shapes.dialogue.TextView = joint.shapes.dialogue.BaseView.extend({
        template:
            '<div class="node">' +
                '<button class="delete">x</button>' +
                '<img class="portrait" alt="Character portrait" src="images\\characters\\unknown.png" />' +
                '<select class="actor" />' +
                '<textarea class="speech" rows="4" cols="27" placeholder="Speech"></textarea>' +
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
                let new_box = new joint.shapes.dialogue.Text({position: {x: bounding_box.x , y: bounding_box.y + bounding_box.height + (_gridSize * 1)}});                _graph.addCell(new_box); // The box has to be added to the graph before the ports become available.

                let new_link = _defaultLink.clone();

                new_link.source({id: this.model.id, port: this.model.getPorts().find(element => element.group === "output").id });
                new_link.target({id: new_box.id, port: new_box.getPorts().find(element => element.group === "input").id});
                _graph.addCell(new_link);

                new_box.trigger('focus');
                event.preventDefault();
            });

            this.$box.$speech.keydown(event => { // Character name switching code.
                // Using keydown instead of keypress, because it doesn't work correctly in Google Chrome
                if (!event.altKey) return;

                let options = _characters.map(element => element.name);

                //this.$box.$character_select; // Our dropdown menu.
                let offset = this.$box.$character_select.prop('selectedIndex') + 1;
                for (var i = 0; i < options.length; i++) {
                    let index = (i + offset) % options.length;
                    if (options[index].charAt(0).toLowerCase() === event.key.toLowerCase()) {
                        this.model.set('actor', options[index]);
                        break;
                    }
                }
                event.preventDefault();
            });

            this.listenTo(this.model, 'focus', this.focus);

            console.log("Creating ports.");

            this.model.input = {
                group: "input",
                markup :`<g><rect class="magnet input left" magnet="true" width="24" height="${node.text.height/2}" /></g>`,
            };
            this.model.output = {
                group: 'output',
                markup :`<g><rect class="magnet output left" magnet="true" width="24" height="${node.text.height/2}" /></g>`
            };
            this.model.addPorts([this.model.input, this.model.output]);
        },

        focus: function() {
            this.$box.$speech.focus();
        },

        updateBox: function() {
            joint.shapes.dialogue.BaseView.prototype.updateBox.apply(this, arguments);

            let selectedChar = _characters.find(element => element.name === this.model.get('actor'));
            if (!selectedChar) { selectedChar = _characters.find(element => element.name === 'unknown'); }

            this.$box.$img.attr({
                'src': `images\\characters\\${selectedChar.url}`,
                'title': selectedChar.name,
                'alt': selectedChar.name
            });

            this.$box.$character_select.val(selectedChar.name);
            this.$box.$speech.val(this.model.get('speech'));
        }
    });

    joint.shapes.dialogue.Base.define('dialogue.Set', {
        size: { width: node.set.width, height: node.set.height },
        userKey: '',
        userValue: '',
        ports: {
            groups: {
                'input': {
                    position: {
                        name: 'absolute',
                        args: { x: 0, y: 0}
                    },
                },
                'output': {position: {
                    name: 'absolute',
                    args: { x: 0, y: node.set.height / 2}
                },}
            },
        },
    });
    joint.shapes.dialogue.SetView = joint.shapes.dialogue.BaseView.extend({
        template:
        '<div class="node">' +
            '<button class="delete">x</button>' +
            '<input type="text" class="userKey" placeholder="Variable" />' +
            '<input type="text" class="UserValue" placeholder="Value" />' +
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

            this.input = {
                group: "input",
                markup :`<g><rect class="magnet input left" magnet="passive" width="24" height="${node.set.height/2}" /></g>`,
            };
            this.output = {
                group: 'output',
                markup :`<g><rect class="magnet output left" magnet="true" width="24" height="${node.set.height/2}" /></g>`
            };
            this.model.addPorts([this.input, this.output]);
        },

        updateBox: function() {
            joint.shapes.dialogue.BaseView.prototype.updateBox.apply(this, arguments);

            if (!this.$box.$userKey.is(':focus'))
                this.$box.$userKey.val(this.model.get('userKey'));

            if (!this.$box.$userValue.is(':focus'))
                this.$box.$userValue.val(this.model.get('userValue'));
        }
    });

    joint.shapes.dialogue.Multi.define('dialogue.Choice', {
    });
    joint.shapes.dialogue.ChoiceView = joint.shapes.dialogue.MultiView.extend({
        initialize: function() {
            joint.shapes.dialogue.MultiView.prototype.initialize.apply(this, arguments);
            this.addChoice();
        }
    });

    joint.shapes.dialogue.Multi.define('dialogue.Branch', {
        varName: ''
    });
    joint.shapes.dialogue.BranchView = joint.shapes.dialogue.MultiView.extend({

        defaultSize: 75,

        initialize: function () {
            joint.shapes.dialogue.MultiView.prototype.initialize.apply(this, arguments);
            //this.model.set('varName', null);

            this.$box.$varName = this.$box.$delete.after($('<input type="text" class="varName" placeholder="Variable" />'));

            this.$box.$varName.on('input propertychange', event => {
                this.model.set('varName', $(event.target).val());
            });

            this.addChoice("Default");
            this.addChoice();
        },

        updateBox: function() {
            joint.shapes.dialogue.MultiView.prototype.updateBox.apply(this, arguments);
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

    function _validateConnection(cellViewSource, magnetSource, cellViewTarget, magnetTarget, end, linkView) {
    	// Prevent linking to itself.
    	if (magnetSource == magnetTarget || cellViewSource == cellViewTarget)
    		return false;

        // Prevent inputs/outputs from linking to themselves
        let sourceType = magnetSource.getAttribute('port-group');
        if ($(magnetTarget).hasClass(sourceType))
            return false;

        // If we're connecting to an Output node, allow only one connection.
        let isOutput = magnetTarget.getAttribute("class").includes("output");
        if (isOutput) {
            let portId = magnetTarget.parentNode.getAttribute('port');
            let targetLinks = _graph.getConnectedLinks(cellViewTarget.model);
            let portHasConnections = targetLinks.some(link => {
                if (linkView.model == link) return false; // Discount the current connection.
                return (link.get('source').port === portId ||
                        link.get('target').port === portId);
            });
            if (portHasConnections) return false;
        }

        return true;
    }

    function _validateMagnet(cellView, magnet) {
        let links = _graph.getConnectedLinks(cellView.model);
        let portId = magnet.parentNode.getAttribute('port');

        let hasConnection = links.some(
            link => link.get('source').port === portId || link.get('target').port === portId
        );
        return !hasConnection;
    }

    function _checkCharacter(character){
        return character.hasOwnProperty('name') && character.hasOwnProperty('url');
    }

    function _addNodeToGraph(nodeType, location) {

        _graph.addCell(new nodeType ({ position: location }));
    }

    function _addContextMenu(element) {
        $.contextMenu({
            selector: 'div#paper',
            callback: function (itemKey, opt, rootMenu, originalEvent) {

                let type = null;
                let pos = {
                    x: Math.round((opt.$menu.position().left + element.scrollLeft()) / _gridSize) *_gridSize,
                    y: Math.round((opt.$menu.position().top +  element.scrollTop()) / _gridSize) *_gridSize
                };

                switch (itemKey) {
                    case 'text':
                        type = joint.shapes.dialogue.Text;
                        break;
                    case 'choice':
                        type = joint.shapes.dialogue.Choice;
                        break;
                    case 'set':
                        type = joint.shapes.dialogue.Set;
                        break;
                    case 'branch':
                        type = joint.shapes.dialogue.Branch;
                        break;
                    case 'base':
                        type = joint.shapes.dialogue.Base;
                        break;
                    case 'multi':
                        type = joint.shapes.dialogue.Multi;
                        break;
                    default:
                        console.log(TODO);
                        return;
                }
                _addNodeToGraph(type, pos);

            }, items: {
                //separator: { "type": "cm_separator" },
                'text': {name: 'Speech'},
                'choice': {name: 'Choice'},
                'set': {name: 'Set flag'},
                'branch': {name: 'Conditional branch'},
                'base': {name: 'DEBUG - base'},
                'multi': {name: 'DEBUG - multi'},
                'data': {
                    name: 'Data management',
                    items: {
                        'import': {name: "Import from file"},
                        'export-csde': {name: "Export (CSDE format)"},
                        'export-uvnp': {name: "Export (UVNP format)"},
                        'save': {name: "Manual Save"},
                        'load': {name: "Manual Load"},
                        'new': {name: 'Open blank file'}
                    }
                },
                //separator2: { "type": "cm_separator" }
            }
        });
    }

    function _registerPanning(paper, element) {
        _mouseObj.panning = false;
        _mouseObj.position = { x: 0, y: 0 };

        paper.on('blank:pointerdown', (event, x, y) =>{
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

    function initialize({element:baseElement , width = 800, height = 600}) {

        if (!(baseElement instanceof jQuery)) { throw new TypeError("The base element must be a jQuery object"); }
        _$container = baseElement;
        _$container.$paper = baseElement.find('div#paper');

        _graph = new joint.dia.Graph();
        let _paper = new joint.dia.Paper({
            el: _$container.$paper,
            model: _graph,
            width: width,
            height: height,
            gridSize: _gridSize,
            preventContextMenu: false,
            drawGrid: {
                name: 'dot',
                args: { color: '#333366', thickness: 1.5},

            //     args: [
            //         { color: 'black', thickness: 2 }, // settings for the primary mesh
            //         { color: 'grey', scaleFactor: 10, thickness: 1 } //settings for the secondary mesh
            // ]
            },
            defaultLink: _defaultLink,
            validateConnection: _validateConnection,
            validateMagnet: _validateMagnet,
            snapLinks: { radius: 75 },
        });

        _addContextMenu(_$container);

        _registerPanning(_paper, _$container);
    }

    function addCharacters(newCharacters, list = resetCharacters()) {
        if (!Array.isArray(newCharacters) || !newCharacters.every(_checkCharacter)) {
            throw new TypeError("The character list must be an array of objects, with each object having a name and url key.");
        }
        return list.concat(newCharacters);
    }

    function addCharacter(newCharacter, list = resetCharacters()){
        if (!_checkCharacter(newCharacter)) {
            throw new TypeError("The character must be an object with a name and url key.");
        }
        return addCharacters([newCharacter], list);
    }

    function resetCharacters(){
        return addCharacter({name: 'unknown', url: 'unknown.png'}, []);
    }

    return {
        addCharacter: character => _characters = addCharacter(character, _characters),
        addCharacters: characters => _characters = addCharacters(characters, _characters),
        clearCharacters: () => _characters = resetCharacters(),
        start: initialize
    };
})();
