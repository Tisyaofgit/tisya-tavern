'use strict';
// Public compiler entry retained for the host and EJS bridge.
const {render,SOURCE}=require('./tisya-protocol.cjs');
module.exports={renderRest:render,SOURCE};
