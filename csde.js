/* jshint esversion: 6 */

console.log("Hello!");

if (typeof require !== 'undefined' && require !== null) {
    joint = require('jointjs');
    $ = require('jquery');
}

const defaultLink = new joint.dia.Link({
	attrs: {
		'.marker-target': { d: 'M 10 0 L 0 5 L 10 10 z', },
		'.link-tools .tool-remove circle, .marker-vertex': { r: 8 },

	},
}).set('smooth', true);

const allowableConnections = [
	['dialogue.Text', 'dialogue.Text'],
	['dialogue.Text', 'dialogue.Node'],
	['dialogue.Text', 'dialogue.Choice'],
	['dialogue.Text', 'dialogue.Set'],
	['dialogue.Text', 'dialogue.Branch'],
	['dialogue.Node', 'dialogue.Text'],
	['dialogue.Node', 'dialogue.Node'],
	['dialogue.Node', 'dialogue.Choice'],
	['dialogue.Node', 'dialogue.Set'],
	['dialogue.Node', 'dialogue.Branch'],
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
        '<button class="delete">x</button>'+
        'Hello!'+
    '</div>',

    initialize: function() {
        // console.log("initializing...");
        joint.dia.ElementView.prototype.initialize.apply(this, arguments);

        this.$box = $(_.template(this.template)());
        this.$box.$delete = this.$box.find('button.delete');


        this.$box.$delete.click(this.model.remove, this.model);
        //this.$box.$delete.click(_.bind(this.model.remove, this.model));

        // Update the box position whenever the underlying model changes.
        this.model.on('change', this.updateBox, this);
        // Remove the box when the model gets removed from the graph.
        this.model.on('remove', this.removeBox, this);

        // Not sure if the lines below are required or not.
        this.$box.find('input').on('mousedown click', event => { event.stopPropagation(); });
        this.$box.find('textarea').on('mousedown click', event => { event.stopPropagation(); });

        //this.initialize();
        this.updateBox();
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

    removeBox: function(event) {
        this.$box.remove();
    }
});

joint.shapes.dialogue.Text     = joint.shapes.dialogue.Base.extend({
    defaults: joint.util.deepSupplement({
        type: 'dialogue.Text',
        size: { width: 450, height: 200 },
        textarea: 'Start writing',
        actor: '', // Value to be set later.
        text: '',  // Value to be set later.
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
});
/*console.dir(joint.shapes.dialogue.Base);
console.log(new joint.shapes.dialogue.Base().defaults.type);*/

$(document).ready(() => { // Initialization function
    let graph = new joint.dia.Graph();

    let paper = new joint.dia.Paper({
        el: $('#paper'),
        model: graph,
        width: 16000,
        height: 8000,
        gridSize: 16,
        //defaultLink: defaultLink,
        //validateConnection: validateConnection,
        //validateMagnet: validateMagnet,
        //snapLinks: { radius: 75 }
    });


    let test1 = new joint.shapes.dialogue.Text({
        position: {x: 80, y: 80},
        //size: { width: 170, height: 100 }
    });
    let test2 = new joint.shapes.dialogue.Base({
        position: {x: 320, y: 80},
        //size: { width: 170, height: 100 }
    });

    var link = new joint.dia.Link({
        source: {id: test1.id},
        target: {id: test2.id}
    });

    graph.addCells([test1, test2, link]);

}); // End of init.


function validateConnection(cellViewSource, magnetSource, cellViewTarget, magnetTarget, end, linkView) {
	// Prevent linking to itself.
	if (magnetSource == magnetTarget || cellViewSource == cellViewTarget)
		return false;

	// Can't connect to an output port
	if (magnetTarget.attributes.magnet.nodeValue !== 'passive')
		return false;

    // See if this connection type is in the list.
    let sourceType = cellViewSource.model.attributes.type;
	let targetType = cellViewTarget.model.attributes.type;
    return allowableConnections.find(rule => sourceType == rule[0] && targetType == rule[1]);
}

function validateMagnet(cellView, magnet) {
	if (magnet.getAttribute('magnet') === 'passive')
		return false;

	// If unlimited connections attribute is null, we can only ever connect to one object
	// If it is not null, it is an array of type strings which are allowed to have unlimited connections
	let unlimitedConnections = magnet.getAttribute('unlimitedConnections');
	let links = graph.getConnectedLinks(cellView.model);

    links.forEach(link => {
        if (link.attributes.source.id === cellView.model.id && link.attributes.source.port === magnet.attributes.port.nodeValue) {
            // This port already has a connection
            if (unlimitedConnections && link.attributes.target.id) {
                let targetCell = graph.getCell(link.attributes.target.id);

                // It's okay because this target type has unlimited connections
                return unlimitedConnections.contains(targetCell.attributes.type);
            }
            return false;
        }
    });
    return true;
}
