# CSDE

CSDE (which stands for Chat Style Dialog Editor), is a chat style dialogue editor. It's goal is to simplify writing non-linear dialogues, conversations and stories.

## Getting Started

These instructions will get you a copy of the project up and running on your local machine for development and testing purposes. See deployment for notes on how to deploy the project on a live system.

### Prerequisites

You will need Node.js/NMP installed.

### Installing

First, clone the repository:
```
git clone https://github.com/Bronzdragon/CSDE.git
```

Then, in that directory, simply run the NPM installer:
```
npm install
```

Then, when you're ready, run it:
```
npm start
```

## Running the tests

Currently, no tests are set up. Sorry.

## Roadmap

### Planned features still in the development pipeline:
1. Pick a license.
2. When automatically creating a text node, try to set the actor to the previous conversation participant (if there is one).
3. When magnet is connected, give feedback that it is (for example, it changes colour).
4. Conditional branch should auto-complete variables.
5. A Note type node. Two textboxes (one small one big) that are collapsible. No input/output.
6. Next page on paper edges OR dynamically adjust paper size
7. Multiple pages/tabs.
8. Glossary editor.
9. Variable manager.
10. Character importer.
11. Prevent overlapping of elements.
12. Allow selection or box-select of elements.
    * Deletion of selected elements
    * Copy/paste of selected items
    * Move multiple selected elements.
13. Per node context menu
    * Copy refence to node
    * Delete
    * Duplicate
### Features not likely to be implemented soon:
* Fullscreen mode.


## Built Using

* [JointJS](http://jointjs.com/) - A flowchart/diagramming library.
* [NodeJS](https://nodejs.org/en/) + [Electron](https://electronjs.org/) - For turning a JavaScript app into a Desktop app.
* [node-vibrant](https://github.com/akfish/node-vibrant/) A tool for getting colour palettes from images.

This project is loosely based on a project called [talkit](https://github.com/rodobodolfo/Talkit) by [rodobodolfo](https://github.com/rodobodolfo).

## License

This project currently has no license tied to it.
