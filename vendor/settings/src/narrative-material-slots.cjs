'use strict';
module.exports={MATERIAL_SLOTS:{
  "version": "0.6.6",
  "policy": "预留槽省略空值；仅有来源的已选资料可填入。元资料用于创建、编辑或检索任务，不默认进入叙事。原生世界书仅注入宿主实际启用且命中的内容；禁止将全部条目作为后备。",
  "officialSources": [
    "https://docs.tavoai.dev/cn/guides/javascript-api/",
    "https://docs.tavoai.dev/cn/guides/supported-macros/"
  ],
  "fields": {
    "character": [
      "id",
      "avatar",
      "name",
      "description",
      "firstMes",
      "personality",
      "scenario",
      "mesExample",
      "creatorNotes",
      "systemPrompt",
      "postHistoryInstructions",
      "alternateGreetings",
      "tags",
      "creator",
      "characterVersion",
      "nickname",
      "groupOnlyGreetings",
      "creationDate",
      "modificationDate"
    ],
    "persona": [
      "id",
      "name",
      "description",
      "avatar",
      "active",
      "sortIndex"
    ],
    "lorebook": [
      "id",
      "name",
      "entries"
    ],
    "entry": [
      "identifier",
      "name",
      "content",
      "enabled",
      "strategy",
      "keywords",
      "secondaryKeywords",
      "secondaryKeywordStrategy",
      "scanDepth",
      "caseSensitive",
      "matchWholeWord",
      "injectionPosition",
      "injectionDepth",
      "injectionRole",
      "probability",
      "sticky",
      "cooldown",
      "delay"
    ],
    "ccv3LorebookAliases": [
      "keys",
      "secondary_keys",
      "constant",
      "position",
      "selective",
      "use_regex",
      "extensions"
    ],
    "sillyTavernLorebookAliases": [
      "key",
      "keysecondary",
      "disable",
      "order"
    ]
  },
  "slots": [
    {
      "id": "player_persona",
      "step": "cast",
      "route": "macro",
      "binding": "persona",
      "source": "persona.description"
    },
    {
      "id": "role_description",
      "step": "cast",
      "route": "macro",
      "binding": "charDescription",
      "source": "character.description"
    },
    {
      "id": "role_personality",
      "step": "cast",
      "route": "macro",
      "binding": "charPersonality",
      "source": "character.personality"
    },
    {
      "id": "card_main",
      "step": "cast",
      "route": "macro",
      "binding": "charPrompt",
      "source": "character.systemPrompt"
    },
    {
      "id": "card_post",
      "step": "cast",
      "route": "macro",
      "binding": "charInstruction",
      "source": "character.postHistoryInstructions"
    },
    {
      "id": "scene",
      "step": "plot",
      "route": "macro",
      "binding": "scenario",
      "source": "chat.overrideScenario > character.scenario"
    },
    {
      "id": "examples",
      "step": "write",
      "route": "native",
      "binding": "dialogueExamples",
      "source": "character.mesExample"
    },
    {
      "id": "world_before",
      "step": "load",
      "route": "native",
      "binding": "worldInfoBefore",
      "source": "lorebook.entries[lorebookBefore].content"
    },
    {
      "id": "world_after",
      "step": "load",
      "route": "native",
      "binding": "worldInfoAfter",
      "source": "lorebook.entries[lorebookAfter].content"
    },
    {
      "id": "history",
      "step": "load",
      "route": "native",
      "binding": "chatHistory",
      "source": "chat.messages; selected greeting; lorebook.entries[atDepth]"
    },
    {
      "id": "world_example_before",
      "step": "write",
      "route": "host",
      "binding": "dialogueExamples",
      "source": "lorebook.entries[topOfExampleMessages].content"
    },
    {
      "id": "world_example_after",
      "step": "write",
      "route": "host",
      "binding": "dialogueExamples",
      "source": "lorebook.entries[bottomOfExampleMessages].content"
    }
  ],
  "reserved": [
    {
      "id": "card_metadata",
      "step": "cast",
      "variable": "缇斯亚资料槽.角色卡元资料",
      "source": "character.id,name,nickname,avatar,tags,creator,characterVersion,creationDate,modificationDate",
      "status": "reserved",
      "tag": "card_metadata"
    },
    {
      "id": "card_notes",
      "step": "cast",
      "variable": "缇斯亚资料槽.角色卡作者备注",
      "source": "character.creatorNotes",
      "status": "reserved",
      "tag": "card_notes"
    },
    {
      "id": "card_extensions",
      "step": "cast",
      "variable": "缇斯亚资料槽.角色卡扩展",
      "source": "import.extensions / unknown fields",
      "status": "reserved",
      "tag": "card_extensions"
    },
    {
      "id": "greeting_catalog",
      "step": "cast",
      "variable": "缇斯亚资料槽.角色卡开场白目录",
      "source": "character.firstMes,alternateGreetings,groupOnlyGreetings",
      "status": "reserved",
      "tag": "greeting_catalog"
    },
    {
      "id": "card_scenario_original",
      "step": "plot",
      "variable": "缇斯亚资料槽.角色卡原始场景",
      "source": "character.scenario; {{charScenario}}",
      "status": "reserved",
      "tag": "card_scenario_original"
    },
    {
      "id": "examples_original",
      "step": "write",
      "variable": "缇斯亚资料槽.角色卡原始示例",
      "source": "character.mesExample; {{mesExamplesRaw}}",
      "status": "reserved",
      "tag": "examples_original"
    },
    {
      "id": "persona_metadata",
      "step": "cast",
      "variable": "缇斯亚资料槽.玩家元资料",
      "source": "persona.id,name,avatar,active,sortIndex",
      "status": "reserved",
      "tag": "persona_metadata"
    },
    {
      "id": "persona_extensions",
      "step": "cast",
      "variable": "缇斯亚资料槽.玩家扩展",
      "source": "persona unknown fields",
      "status": "reserved",
      "tag": "persona_extensions"
    },
    {
      "id": "world_catalog",
      "step": "load",
      "variable": "缇斯亚资料槽.世界书目录",
      "source": "lorebook.id,name",
      "status": "reserved",
      "tag": "world_catalog"
    },
    {
      "id": "world_entry_controls",
      "step": "load",
      "variable": "缇斯亚资料槽.世界书条目控制",
      "source": "entry activation / ordering metadata",
      "status": "reserved",
      "tag": "world_entry_controls"
    },
    {
      "id": "world_extensions",
      "step": "load",
      "variable": "缇斯亚资料槽.世界书扩展",
      "source": "CCv3.extensions / unknown fields",
      "status": "reserved",
      "tag": "world_extensions"
    },
    {
      "id": "archive_material",
      "step": "cast",
      "variable": "缇斯亚资料槽.关联角色档案",
      "source": "future archive resolver",
      "status": "reserved",
      "tag": "archive_material"
    },
    {
      "id": "memory_material",
      "step": "load",
      "variable": "缇斯亚资料槽.相关记忆",
      "source": "future memory resolver",
      "status": "reserved",
      "tag": "memory_material"
    },
    {
      "id": "task_material",
      "step": "anchor",
      "variable": "缇斯亚资料槽.任务附加资料",
      "source": "future task resolver",
      "status": "reserved",
      "tag": "task_material"
    }
  ],
  "unknownFields": {
    "route": "reserved extensions; preserve original key/value on future import/export",
    "injectByDefault": false
  },
  "omissions": "原生 API 不保证返回 CCv3 导入中的全部扩展字段；未暴露字段只保留导入适配接口，不能声称当前已读取。"
}};
