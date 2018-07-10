/* jshint esversion: 6 */

var csde = (function csdeMaster(){

    let _$container = null;
    let _graph = null;
    let _characters = resetCharacters();
    let _mouseObj = {};



    const _defaultLink = new joint.dia.Link({
    	attrs: {
    		'.marker-target': { d: 'M 10 0 L 0 5 L 10 10 z', },
    		'.link-tools .tool-remove circle, .marker-vertex': { r: 8 },

    	},
    }).connector('smooth');

    // Register new models and views
    joint.shapes.dialogue = {};

    joint.shapes.dialogue.Base     = joint.shapes.basic.Rect.extend({
        defaults: joint.util.deepSupplement({
            type: 'dialogue.Base',
            size: { width: 250, height: 135 },
            name: '',
            //inPorts: ['input'],
            //outPorts: ['output'],
            attrs: {
                rect: { stroke: 'none', 'fill-opacity': 0 },
                text: { display: 'none' },
                //'.inPorts circle': { magnet: 'passive' },
                //'.outPorts circle': { magnet: true, },
            },
        }, joint.shapes.basic.Rect.prototype.defaults)
    });
    joint.shapes.dialogue.BaseView = joint.dia.ElementView.extend({
        template:
        '<div class="node">' +
            '<button class="delete">x</button>' +
            'Hello!' +
        '</div>',

        initialize: function () {
            // console.log("initializing...");
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

    joint.shapes.dialogue.Multi     = joint.shapes.dialogue.Base.extend({
        defaults: joint.util.deepSupplement({
            type: 'dialogue.Multi',
            values: null
        }, joint.shapes.dialogue.Base.prototype.defaults)
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

        initialize: function() {
            this.model.set('values', new Map());
            joint.shapes.dialogue.BaseView.prototype.initialize.apply(this, arguments);

            this.$box.$choiceContainer = this.$box.find('div.choiceContainer');

            this.$box.$add = this.$box.find('button.add');
            this.$box.$add.click(() => this.addPort());
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
                console.log("Values before removal", this.model.get('values'));
            });

            return $newChoice;
        },

        addPort: function(defaultValue = null) {
            let values = this.model.get('values');

            values.set(_generateId(), defaultValue);
            this.model.set('values', values);
            this.updateBox();
        },

        updateSize: function() {
            this.model.set('size', {
                width: this.model.get('size').width,
                height: 70 + this.$box.$choiceContainer.outerHeight(true)
            });
        }
    });

    joint.shapes.dialogue.Text     = joint.shapes.dialogue.Base.extend({
        defaults: joint.util.deepSupplement({
            type: 'dialogue.Text',
            size: { width: 450, height: 200 },
            textarea: 'Start writing',
            actor: '', // Value to be set later.
            speech: '',  // Value to be set later.
        },
        joint.shapes.dialogue.Base.prototype.defaults)
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
                let new_box = new joint.shapes.dialogue.Text({position: {x: bounding_box.x , y: bounding_box.y + bounding_box.height + 20}});

                let new_link = _defaultLink.clone();
                new_link.set('source', { id: this.model.id, port: 'output' });
                new_link.set('target', { id: new_box.id, port: 'input' });

                _graph.addCells([new_box, new_link]);
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

    joint.shapes.dialogue.Set     = joint.shapes.dialogue.Base.extend({
        defaults: joint.util.deepSupplement({
            type: 'dialogue.Set',
            // inPorts: ['input'],
            // outPorts: ['output'],
            // size: { width: 200, height: 100, },
            name: '',
            value: ''
        },
        joint.shapes.dialogue.Base.prototype.defaults),
    });
    joint.shapes.dialogue.SetView = joint.shapes.dialogue.BaseView.extend({
        template:
        '<div class="node">' +
        '<button class="delete">x</button>' +
        '<input type="text" class="name" placeholder="Variable" />' +
        '<input type="text" class="value" placeholder="Value" />' +
        '</div>',

        initialize: function() {
            joint.shapes.dialogue.BaseView.prototype.initialize.apply(this, arguments);

            this.$box.$name = this.$box.find("input.name");
            this.$box.$value = this.$box.find("input.value");

            this.$box.$name.change( event => {
                this.model.set('name', $(event.target).val());
            });

            this.$box.$value.change(event => {
                this.model.set('value', $(event.target).val());
            });
        },

        updateBox: function() {
            joint.shapes.dialogue.BaseView.prototype.updateBox.apply(this, arguments);

            if (!this.$box.$name.is(':focus'))
            this.$box.$name.val(this.model.get('name'));

            if (!this.$box.$value.is(':focus'))
            this.$box.$value.val(this.model.get('value'));

        }

    });

    joint.shapes.dialogue.Choice     = joint.shapes.dialogue.Multi.extend({
        defaults: joint.util.deepSupplement({
            type: 'dialogue.Choice',
        },
        joint.shapes.dialogue.Base.prototype.defaults),
    });
    joint.shapes.dialogue.ChoiceView = joint.shapes.dialogue.MultiView.extend({
        initialize: function() {
            joint.shapes.dialogue.MultiView.prototype.initialize.apply(this, arguments);
            this.addPort();
        }
    });

    joint.shapes.dialogue.Branch     = joint.shapes.dialogue.Multi.extend({
        defaults: joint.util.deepSupplement({
            type: 'dialogue.Branch',
            varName: null,
        }, joint.shapes.dialogue.Base.prototype.defaults)
    });
    joint.shapes.dialogue.BranchView = joint.shapes.dialogue.MultiView.extend({

        initialize: function () {
            joint.shapes.dialogue.MultiView.prototype.initialize.apply(this, arguments);

            this.$box.$varName = this.$box.$delete.after($('<input type="text" class="varName" placeholder="Variable" />'));

            this.$box.$varName.on('input propertychange', event => {
                this.model.set('varName', $(event.target).val());
            });

            this.addPort("Default");
            this.addPort();
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

    	// Can't connect to an output port
    	if (magnetTarget.attributes.magnet.nodeValue !== 'passive')
    		return false;

        const _allowableConnections = [
            ['dialogue.Text', 'dialogue.Text'],
            ['dialogue.Text', 'dialogue.Node'],
            ['dialogue.Text', 'dialogue.Choice'],
            ['dialogue.Text', 'dialogue.Set'],
            ['dialogue.Text', 'dialogue.Branch'],
            ['dialogue.Choice', 'dialogue.Text'],
            ['dialogue.Choice', 'dialogue.Node'],
            ['dialogue.Choice', 'dialogue.Set'],
            ['dialogue.Choice', 'dialogue.Branch'],
            ['dialogue.Set', 'dialogue.Text'],
            ['dialogue.Set', 'dialogue.Node'],
            ['dialogue.Set', 'dialogue.Set'],
            ['dialogue.Set', 'dialogue.Branch'],
            ['dialogue.Branch', 'dialogue.Text'],
            ['dialogue.Branch', 'dialogue.Node'],
            ['dialogue.Branch', 'dialogue.Set'],
            ['dialogue.Branch', 'dialogue.Branch'],
        ];

        // See if this connection type is in the list.
        /*let sourceType = cellViewSource.model.attributes.type;
    	let targetType = cellViewTarget.model.attributes.type;
        return _allowableConnections.find(rule => sourceType == rule[0] && targetType == rule[1]);*/

        return true;
    }

    function _validateMagnet(cellView, magnet) {
    	if (magnet.getAttribute('magnet') === 'passive')
    		return false;

    	// If unlimited connections attribute is null, we can only ever connect to one object
    	// If it is not null, it is an array of type strings which are allowed to have unlimited connections
    	let unlimitedConnections = magnet.getAttribute('unlimitedConnections');
    	let links = _graph.getConnectedLinks(cellView.model);


        for (let link of links) {
            if (link.attributes.source.id === cellView.model.id && link.attributes.source.port === magnet.attributes.port.nodeValue) {
                // This port already has a connection
                if (unlimitedConnections && link.attributes.target.id) {
                    let targetCell = _graph.getCell(link.attributes.target.id);

                    // It's okay because this target type has unlimited connections
                    return unlimitedConnections.contains(targetCell.attributes.type);
                }
                return false;
            }
        }

        return true;
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
                let pos = {
                    x: Math.round(opt.$menu.position().left + element.scrollLeft()),
                    y: Math.round(opt.$menu.position().top +  element.scrollTop())
                };

                let type = null;
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

    function initialize(baseElement) {

        if (!(baseElement instanceof jQuery)) { throw new TypeError("The base element must be a jQuery object"); }
        _$container = baseElement;
        _$container.$paper = baseElement.find('div#paper');

        _graph = new joint.dia.Graph();
        let paper = new joint.dia.Paper({
            el: _$container.$paper,
            model: _graph,
            width: 16000,
            height: 8000,
            gridSize: 16,
            preventContextMenu: false,
            // drawGrid: {name: 'doubleMesh', thickness: 0.8},
            defaultLink: _defaultLink,
            validateConnection: _validateConnection,
            validateMagnet: _validateMagnet,
            snapLinks: { radius: 75 }
        });

        _addContextMenu(_$container);

        _registerPanning(paper, _$container);
    }

    function addCharacter(newCharacter, list){
        if (!_checkCharacter(newCharacter)) {
            throw new TypeError("The character be an object with a name and url key.");
        }
        list.push(newCharacter);

        return list;
    }

    function addCharacters(newCharacters, list) {
        if (!Array.isArray(newCharacters) || !newCharacters.every(_checkCharacter)) {
            throw new TypeError("The character list must be an array of objects, with each object having a name and url key.");
        }
        list = list.concat(newCharacters);
        return list;
    }

    function resetCharacters(){
        list = [];
        return addCharacter({name: 'unknown', url: 'unknown.png'}, list);
    }

    return {
        addCharacter: character => _characters = addCharacter(character, _characters),
        addCharacters: characters => _characters = addCharacters(characters, _characters),
        clearCharacters: () => _characters = resetCharacters(),
        start: initialize
    };
})();