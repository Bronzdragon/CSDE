/* jshint esversion: 6 */

const expect = require('chai').expect;
const talkit = require('../csde.js');

describe('talkit', () =>{
    it('exports a module.', () => {
        expect(talkit).to.be.an('object');
    });
});
