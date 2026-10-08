'use strict';
const {createStrictJSON}=require('./json-parser.cjs');
const suffix={depth:'JSON_DEPTH',duplicate:'DUPLICATE_KEY',number:'JSON_NUMBER',syntax:'JSON_SYNTAX'};
const strictJSON=createStrictJSON({maxDepth:64,nullPrototype:true,onError(kind){const code='TISHA_JSON_'+suffix[kind];throw Object.assign(new Error(code),{code});}});
module.exports={strictJSON};
