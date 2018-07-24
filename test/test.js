/* jshint esversion: 6 */

const expect = require('chai').expect;
const csde = require('../csde.js');

describe('csde', () =>{
    it('exports a module.', () => {
        let test = new csde();
        expect(test).to.be.an('object');
    });
});
