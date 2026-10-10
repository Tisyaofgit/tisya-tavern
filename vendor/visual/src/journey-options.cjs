'use strict';
// Optional preference on the existing extensions record. Local button choices
// stay with the displayed message; they never write this preference back.
const JOURNEY_FIELDS=Object.freeze({旅程球默认状态:['收起','展开'],世界扩展默认状态:['收起','展开'],旅程外观:['日间','夜间'],显示角色心理:[true,false]});
const JOURNEY_DEFAULTS=Object.freeze({旅程球默认状态:'展开',世界扩展默认状态:'展开',旅程外观:'日间',显示角色心理:false});
module.exports={JOURNEY_FIELDS,JOURNEY_DEFAULTS};
