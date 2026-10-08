'use strict';
const {createStrictJSON}=require('../json-parser.cjs');
module.exports={parse:createStrictJSON({maxDepth:512})};
