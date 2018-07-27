/* jshint esversion: 6 */
let _userAgent = navigator.userAgent.toLowerCase();
let _isElectron = _userAgent.indexOf(' electron/') > -1;

if (_isElectron) {
    console.log("Including requirements!");
    var fs = require('fs');
    var os = require('os');
    var path = require('path');
    var mkdirp = require('mkdirp');
}

var csde = (function csdeMaster(){
    class Autosaver{
        constructor(interval = 60 * 1000) {
            this._interval = interval;
            this._timeoutId = null;
        }

        get interval() {return this._interval;}
        set interval(newInterval) {
            newInterval = Number(newInterval);
            if (newInterval < 1) { throw new TypeError("Invalid number, must be positive"); }
            this._interval = newInterval;
        }

        start () {
            if (this.timeoutId) this.stop();

            this.timeoutId = window.setTimeout(() => this._autosave(), this._interval);
        }

        stop () {
            window.clearTimeout(this.timeoutId);
            this.timeoutId = null;
        }

        _autosave() {
            save();
            this.start();
        }
    }

    let _globalLinkValue = null;
    let _$container = null;
    let _graph = null;
    let autosave = new Autosaver();
    let _characters = resetCharacters();
    let _mouseObj = {
        panning: false,
        position: { x: 0, y: 0 }
    };

    const _defaultLink = new joint.dia.Link({
        router: { name: 'metro' },
        //connector: { name: 'rounded' },
    }).connector('jumpover', {
        size: 10,
        jump: 'gap'
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
            'note':    { width: 400, height: 100 },
            'multi':  { width: 300, height: 150, section: 50 },
            'choice': { width: 500, height: 200, section: 50 },
            'branch': { width: 250, height: 200, section: 50 }
        },
        icon: {
            width:  15,
            height: 15
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
                            height: this.model.get('size').height / 2
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
                            height: this.model.get('size').height / 2
                        },
                    }
                });
                this.model.addPort(this.model.get('output'));
            }
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
            '<button class="remove">-</button>' +
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

            $newChoice.$value.on("contextmenu", event => {
                event.stopPropagation();
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
                            height: _style.node.multi.section
                        }
                    }
                });
            }

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
                            height: _style.magnet.left.height
                        }
                    }
                });
                this.model.addPort(this.model.get('input'));
            }
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

            this.$box.$speech.on("contextmenu", event => {
                event.stopPropagation();
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
                    position: {x: bounding_box.x , y: bounding_box.y + bounding_box.height + (_gridSize * 1)}
                });

                let parentActor = "";
                let portId = this.model.getPorts().find(port => port.group === "input").id;

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

            let selectedChar = _characters.find(element => element.name === this.model.get("actor"));
            if (!selectedChar) { selectedChar = _characters.find(element => element.name === "unknown"); }

            let imageURL = `.\\images\\characters\\${selectedChar.url}`;
            this._testImage(imageURL).catch(error => {
                console.error('This character does not have a valid image.\nCharacter name: "' + selectedChar.name + '", Location: "' + imageURL + '"');
                imageURL = ".\\images\\characters\\" + _characters.find(element => element.name === "unknown").url;
            }).then(() => {
                this.$box.$img.attr({
                    'src': imageURL,
                    'title': selectedChar.name,
                    'alt': selectedChar.name
                });

                Vibrant.from(imageURL).getPalette().then(palette => {
                    let dominantColour = palette.DarkVibrant || palette.Vibrant || palette.DarkMuted  ||palette.Muted || palette.lightVibrant || palette.lightMuted;
                    let hsl = null, hex = null;
                    if (!dominantColour) {
                        // console.error("Cannot find colour. Using default");
                        hsl = {hue: 0, saturation: 0, lightness: 70};
                    } else {
                        hsl = {hue: dominantColour.getHsl()[0] * 360, saturation: dominantColour.getHsl()[1] * 100, lightness: dominantColour.getHsl()[2] * 100};
                        // hsl.saturation = (100 - hsl.saturation) / 2 + hsl.saturation;
                        hsl.saturation = hsl.saturation * 0.80;
                        hsl.lightness = hsl.lightness * 0.60 + 30;
                        // hsl.lightness = Math.min(hsl.lightness / 1.2, 80);
                    }

                    this.model.attr({
                        rect: {
                            fill: {
                                type: 'linearGradient',
                                stops: [
                                    { offset: '0%', color: '#abbaab' },
                                    { offset: '24%', color: '#ffffff' },
                                    { offset: '24.01%', color: `hsl(${hsl.hue}, ${hsl.saturation}%, ${hsl.lightness}%)` },
                                    { offset: '95%', color: `hsl(${hsl.hue}, ${hsl.saturation}%, 75%)` },
                                    { offset: '100%', color: `hsl(${hsl.hue}, ${hsl.saturation}%, 80%)` }
                                ]
                            }
                        }
                    });
                });
            });

            this.$box.$character_select.val(selectedChar.name);
            this.$box.$speech.val(this.model.get('speech'));
        },

        _testImage: function(url, timeoutT) {
            return new Promise(function (resolve, reject) {
                var timeout = timeoutT || 5000;
                var timer, img = new Image();
                img.onerror = img.onabort = function () {
                    clearTimeout(timer);
                    reject("Not a valid image");
                };
                img.onload = function () {
                    clearTimeout(timer);
                    resolve("Success");
                };
                timer = setTimeout(function () {
                    // reset .src to invalid URL so it stops previous
                    // loading, but doesn't trigger new load
                    img.src = "//!!!!/test.jpg";
                    reject("Timeout occured");
                }, timeout);
                img.src = url;
            });
        }
    });

    joint.shapes.dialogue.Base.define('dialogue.Set', {
        size: { width: _style.node.set.width, height: _style.node.set.height },
        ports: { groups: { "output": { position: { args: {
            y: _style.node.set.height / 2
        } } } } },
        userKey: '', // Value to be set later.
        userValue: '' // Value to be set later.
    });
    joint.shapes.dialogue.SetView = joint.shapes.dialogue.BaseView.extend({
        template:
        '<div class="node set">' +
            '<button class="delete">x</button>' +
            '<input type="text" class="userKey" placeholder="Key" />' +
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
                markup :"<rect />",
                attrs: {
                    rect: {
                        class: "magnet input left",
                        magnet: true,
                        width: _style.magnet.left.width,
                        height: _style.node.set.height/2
                    }
                }
            };
            this.output = {
                group: "output",
                markup :"<rect />",
                attrs: {
                    rect: {
                        class: "magnet output left",
                        magnet: true,
                        width: _style.magnet.left.width,
                        height: _style.node.set.height/2
                    }
                }
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

    joint.shapes.dialogue.Base.define('dialogue.Note', {
        size: { width: _style.node.note.width, height: _style.node.note.height },
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

            this.$box.$note.on("contextmenu", event => {
                event.stopPropagation();
            });


            this.$box.$note.width(_style.node.note.width - this.padding * 2);
            this.$box.$note.css({top: this.padding, left: this.padding, position:'absolute'});

            this.$box.$note.autoResize({animate: false, extraSpace: 0, onResize: () => this.updateBox()});
            this.$box.$note.on('input', event => {
                this.model.set('noteText', $(event.target).val());
            });
        },

        updateBox: function() {
            joint.shapes.dialogue.BaseView.prototype.updateBox.apply(this, arguments);
            this.model.resize(this.$box.$note.outerWidth() + this.padding * 2,
                this.$box.$note.outerHeight() + this.padding *2);

            this.$box.$note.text(this.model.get('noteText'));
            this.$box.$note.trigger('keydown');
        },

        addMagnets: function() { /* Do nothing */ }
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
            '<button class="remove">-</button>' +
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
        }
    });

    joint.shapes.dialogue.Multi.define('dialogue.Branch', {
        size: { width: _style.node.branch.width, height: _style.node.branch.height },
        ports: { groups: { "output": { position: { args: {
            x: 0,
            y: 0
        } } } } },
        userKey: ''
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
                '<button class="remove">-</button>' +
                '<input type="text" class="value" value="<%= templateValue %>">' +
            '</div>',

        defaultTemplate:
        `<div style="height: ${_style.node.branch.section}px;" id="<%= TemplateId %>">` +
            '<input type="text" class="value default" value="<%= templateValue %>">' +
        '</div>',

        initialize: function () {
            joint.shapes.dialogue.MultiView.prototype.initialize.apply(this, arguments);
            //this.model.set('userKey', null);

            this.$box.$userKey = this.$box.$delete.after($(''));

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

    function _checkCharacter(character){
        return character.hasOwnProperty('name') && character.hasOwnProperty('url');
    }

    function _addNodeToGraph(nodeType, location) {
        _graph.addCell(new nodeType ({ position: location }));
    }

    function _handleFile(fileBlob) {
        // let fileBlob = this.files[0];

        if (fileBlob.type !== "application/json") {
            notify("Unsupported file.", "high");
            return;
        }

        let reader = new FileReader();

        reader.onloadend = event => {
            load(event.target.result);
        };

        reader.readAsText(fileBlob); // Get the first file (There should be only one anyway)
    }

    function _addContextMenus(element) {
        $.contextMenu({
            selector: 'div#paper',
            callback: function (itemKey, opt, rootMenu, originalEvent) {

                let type = null;
                let pos = {
                    x: Math.round((opt.$menu.position().left + element.scrollLeft()) / _gridSize) *_gridSize,
                    y: Math.round((opt.$menu.position().top +  element.scrollTop()) / _gridSize) *_gridSize
                };

                switch (itemKey) { // If we've selected any of the node types, add that node type to the graph.
                    case 'Text':
                    case 'Choice':
                    case 'Set':
                    case 'Note':
                    case 'Branch':
                    case 'Base':
                    case 'Multi':
                        _addNodeToGraph(joint.shapes.dialogue[itemKey], pos);
                        break;
                    default:
                        console.log("File management is not yet implemented.");
                        return;
                }
            }, items: {
                'Text': {name: 'Speech'},
                'Choice': {name: 'Choice'},
                'Set': {name: 'Set flag'},
                'Branch': {name: 'Conditional branch'},
                'Note': {name: 'Note'},
                'Base': {name: 'DEBUG - base'},
                'Multi': {name: 'DEBUG - multi'},
                'data': {
                    name: 'Data management',
                    items: {
                        'import': {
                            name: "Import from file",
                            callback: () => {
                                let $file = $('<input type="file" accept="application/json,.json" />')
                                .hide()
                                .on('change', function () {
                                    _handleFile(this.files[0]); // We care about only the first file.
                                    $file.remove();
                                })
                                .appendTo("body")
                                .click();
                            }
                        }, 'export-csde': {
                            name: "Export (CSDE format)",
                            callback: () => {
                                let $link = $("<a>").
                                attr({
                                    "download": "export.json",
                                    "href": `data:application/json,${encodeURIComponent(JSON.stringify(_graph.toJSON()))}`,
                                    "target": "_blank"
                                })
                                .hide();

                                $('body').append($link);
                                $link[0].click();
                                $link.remove();
                            }
                        }, 'export-uvnp': {
                            name: "Export (UVNP format)"
                        },'new': {
                            name: 'Open blank file',
                            callback: () => _graph.clear()
                        }
                    }
                }
            }
        });

        $.contextMenu({
            selector: 'div#drop-menu',
            callback: function (itemKey, opt, rootMenu, originalEvent) {
                let pos = {
                    x: Math.round((opt.$menu.position().left + element.scrollLeft()) / _gridSize) *_gridSize,
                    y: Math.round((opt.$menu.position().top +  element.scrollTop()) / _gridSize) *_gridSize
                };

                newElement = new joint.shapes.dialogue[itemKey]({position: pos});
                _graph.addCell(newElement);


                _globalLinkValue.link.target({id: newElement.id, port: newElement.getPorts().find(element => element.group === _globalLinkValue.type).id});

                _globalLinkValue = null;
            }, items: {
                'Text': {name: 'Speech'},
                'Choice': {name: 'Choice'},
                'Set': {name: 'Set flag'},
                'Branch': {name: 'Conditional branch'}
            }
        });
    }

    function _registerPanning(paper, element) {
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

    function _registerHotkeys(element) {
        $(window).keypress(event => {
            if(event.ctrlKey && event.key === 'o'){
                // TODO: Tie this to import.
            }
            if(event.ctrlKey && event.key === 's'){
                //console.log("Gotta save!");
                save();
                /*if (!_saveObject.fileName) {
                    //_saveObject.fileName = prompt("What would you like your file to be called?", "default.json");
                }*/

                event.preventDefault();
            }
        });
    }

    function _getSafefileName() {
        return "csde.json";
    }

    function _getSafefileLocation(filename = '') {
        return path.join(os.homedir(), ".csde", filename);
    }

    function initialize(baseElement, {width = 800, height = 600} = {}) {
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
            //     args: [ // for doubleMesh
            //         { color: 'black', thickness: 2 }, // settings for the primary mesh
            //         { color: 'grey', scaleFactor: 10, thickness: 1 } //settings for the secondary mesh
            // ]
            },
            defaultLink: _defaultLink,
            validateConnection: _validateConnection,
            validateMagnet: _validateMagnet,
            snapLinks: { radius: 100 }, // How many pixels away should a link 'snap'?
            restrictTranslate: true, // Stops elements from being dragged offscreen.
            // perpendicularLinks: true, // Seems to do very little
            // markAvailable: true
        });

        _paper.on('link:pointerup', (cellView, evt, x, y) => {
            if(cellView.model.getTargetElement()) return; // If there is a target, we're not interested.

            let link = cellView.model;
            let portId = link.source().port;
            let origin = link.getSourceElement();
            let originType = origin.getPort(portId).group;

            _globalLinkValue = {
                link: cellView.model,
                type: (originType === "output" ? "input" : "output") // invert the type we should connect to.
            };
            $('div#drop-menu').contextMenu({x: x, y: y});
        });

        /* Might cause performance issues on large graphs. Will have to investigate */
        _graph.on('change:position add', function(cell) {
            // for (let link of _graph.getLinks()) {
            //     _paper.findViewByModel(link).update();
            // }
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

        joint.shapes.basic.Generic.define('svg.Gradient', {
            markup:
                `<defs>
                    <linearGradient id="CharacterColour">
                        <stop offset="0%" stop-color=" #abbaab"/>
                        <stop offset="24%" stop-color="#ffffff"/>

                        <stop offset="24%" stop-color="#F82"/>
                        <stop offset="95%" stop-color="#FF6"/>
                        <stop offset="100%" stop-color="#FF8"/>
                    </linearGradient>
                    <linearGradient id="ChoiceColour">
                        <stop offset="0%" stop-color="#F82"/>
                        <stop offset="100%" stop-color="#FF8"/>
                    </linearGradient>
                    <linearGradient id="InputPort">
                        <stop offset="0%" stop-color="#D33"/>
                        <stop offset="85%" stop-color="#311"/>
                        <stop offset="100%" stop-color="rgba(51,17,17,0.0)"/>
                    </linearGradient>
                    <linearGradient id="InputPort">
                        <stop offset="0%" stop-color="#DD3333"/>
                        <stop offset="85%" stop-color="#331111"/>
                        <stop offset="100%" stop-color="rgba(51,17,17,0.0)"/>
                    </linearGradient>
                    <linearGradient id="OutPort">
                        <stop offset="0%" stop-color="#DDD"/>
                        <stop offset="85%" stop-color="#333"/>
                        <stop offset="100%" stop-color="rgba(17,17,17,0.0)"/>
                    </linearGradient>
                    <linearGradient id="OutPortRight">
                        <stop offset="0%" stop-color="rgba(17,17,17,0.0)"/>
                        <stop offset="15%" stop-color="#333"/>
                        <stop offset="100%" stop-color="#DDD"/>
                    </linearGradient>
                    <linearGradient id="OutPortRightFull">
                        <stop offset="0%" stop-color="#abbaab"/>
                        <stop offset="15%" stop-color="#333"/>
                        <stop offset="100%" stop-color="#DDD"/>
                    </linearGradient>
                    <radialGradient id="OutPortRad" cx="1.25" cy="1.25" r="1.25">
                        <stop offset="0%" stop-color="#DDD"/>
                        <stop offset="100%" stop-color="#333"/>
                    </radialGradient>
                </defs>`
        });

        _graph.addCell(new joint.shapes.svg.Gradient());

        _addContextMenus(_$container);

        _registerPanning(_paper, _$container);

        _registerHotkeys(_$container);

        /* Load if there is a state */
        load();

        /* Enable autosave */
        autosave.start();
    }

    function notify(message, priority = "low") {
        if (!message) return;
        if (!(priority === "low" || priority === "med" || priority === "high")) return;

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
        } else {
            timeoutDuration = 2000;
        }

        setTimeout(event => {
            $element.remove();
        }, timeoutDuration);
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

    function save() {
        let json = JSON.stringify(_graph.toJSON());
        if (_isElectron) {
            mkdirp(_getSafefileLocation(), err => {
                if (err) throw err;
            });
            fs.writeFile(_getSafefileLocation(_getSafefileName()), json, 'utf8', err => {
                if (err) throw err;
            });
        } else {
            localStorage.setItem(_getSafefileName(), json);
        }

        notify("Saved.", "med");
    }

    function load(dataText = null) {
        let handleData = function (jsonText) {
            let json = JSON.parse(jsonText);
            if (json) {
                notify("Data found, loading...", 'low');
                _graph.clear();
                _graph.fromJSON(json);
            }
        };

        if (dataText) {
            handleData(dataText);
            return;
        }

        if (_isElectron) {
            mkdirp(_getSafefileLocation(), err => {
                if (err) throw err;
            });

            fs.readFile(_getSafefileLocation(_getSafefileName()), 'utf8', (err,data) => {
                if (err) {
                    if (err.code === "ENOENT") return;
                        else throw err;
                }
                handleData(data);
            });
            return;
        } else {
            handleData(localStorage.getItem(_getSafefileName()));
            return;
        }
    }

    return {
        addCharacter: character => _characters = addCharacter(character, _characters),
        addCharacters: characters => _characters = addCharacters(characters, _characters),
        clearCharacters: () => _characters = resetCharacters(),
        save: save,
        load: load,
        notify: notify,
        autosave: autosave,
        start: initialize
    };
})();
