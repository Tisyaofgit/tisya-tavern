// Shared FT01 definitions. W61 installs only the approved optional facts subrecords; other candidate groups retain their existing opt-in workflow.
export const FOUNDATION_DEFINITIONS = {
  "format": "tisya.foundation-template-catalog/1",
  "status": "candidate-not-installed",
  "version": 3,
  "principle": "九组为视图；基点、原点、会话为来源与时间层，独立权限事实另分行。",
  "schemaChanges": [
    {
      "kind": "type",
      "id": "character",
      "fields": {
        "身份细目": {
          "type": "object",
          "fields": {
            "物种": {
              "type": "refs",
              "description": "已登记物种定义的稳定引用；未知不补人类。"
            },
            "生命阶段": {
              "type": "text",
              "description": "按世界物种和历法表述；不把现实年龄默认给人物。"
            },
            "出生时期": {
              "type": "text",
              "description": "有来源的世界时间表达；不强制公历日期。"
            },
            "出身地": {
              "type": "refs",
              "description": "出生/成长来源地，不是当前位置。"
            },
            "语言": {
              "type": "texts",
              "description": "已确认可用语言；不因此自动懂秘密或暗语。"
            },
            "社会身份": {
              "type": "text",
              "description": "原点的社会位置、责任与限制；当前任职另由状态/关系维护。"
            }
          }
        },
        "形貌": {
          "type": "object",
          "fields": {
            "整体": {
              "type": "text",
              "description": "原点稳定体貌。"
            },
            "辨识特征": {
              "type": "texts",
              "description": "有依据的独特外观锚点。"
            },
            "仪态": {
              "type": "text",
              "description": "已确立的惯常动作、姿态和身体表达；语速归节奏，单次动作不算惯常。"
            },
            "惯常装束": {
              "type": "text",
              "description": "衣着习惯，非当前穿戴或库存。"
            },
            "感官印象": {
              "type": "text",
              "description": "可感知的稳定印象，不给观察者无依据的秘密知识。"
            }
          }
        },
        "性情": {
          "type": "object",
          "fields": {
            "价值取舍": {
              "type": "text",
              "description": "选择之间的优先与代价。"
            },
            "判断方式": {
              "type": "text",
              "description": "形成判断、核验证据和处理分歧的方法；具体操作流程归做事方式。"
            },
            "情绪处理": {
              "type": "text",
              "description": "稳定应对方式，非当前心情。"
            },
            "长处": {
              "type": "texts",
              "description": "性情上的优点及具体表现；技艺归擅长。"
            },
            "短处": {
              "type": "texts",
              "description": "性情上的弱点及后果；未掌握技能归不足，伤势限制归代价限制。"
            },
            "拒绝边界": {
              "type": "text",
              "description": "已确立的稳定拒绝原则；单次拒绝、未答应或尚未发生不构成原则。"
            },
            "协商条件": {
              "type": "text",
              "description": "哪些新依据可能改变决定。"
            },
            "改变条件": {
              "type": "text",
              "description": "材料明确说明的可能促成性情变化的条件；期待、尚未改变不算条件，未说明留空。"
            }
          }
        },
        "生活": {
          "type": "object",
          "fields": {
            "生计": {
              "type": "text",
              "description": "日常谋生方式。"
            },
            "作息": {
              "type": "text",
              "description": "日常起居、工作和休息的时间安排；反复小动作归习惯。"
            },
            "兴趣": {
              "type": "texts",
              "description": "稳定兴趣；单次行为不能自动确立。"
            },
            "习惯": {
              "type": "texts",
              "description": "已确认的日常反复行为；不复抄作息时间或性情判断原则。"
            },
            "长期目标": {
              "type": "text",
              "description": "长期自主愿望及已知进展；不改成已成功或已接受的任务。"
            },
            "社会责任": {
              "type": "text",
              "description": "稳定承担的职责范围；对象间持续联系另见关系，不复抄互动经过。"
            }
          }
        },
        "表达": {
          "type": "object",
          "fields": {
            "措辞": {
              "type": "text",
              "description": "用词、比喻和话题选择；语速、长短及讲述次序归节奏。"
            },
            "节奏": {
              "type": "text",
              "description": "句式与表达节奏。"
            },
            "幽默": {
              "type": "text",
              "description": "适用的幽默方式，可没有。"
            },
            "沉默条件": {
              "type": "text",
              "description": "何时不说及原因。"
            },
            "关系差异": {
              "type": "text",
              "description": "对不同对象的表达差异；具体关系经过与协作分工留在关系表。"
            },
            "禁用套路": {
              "type": "texts",
              "description": "防止机械复读的边界，不要求每轮套例句。"
            }
          }
        },
        "本领": {
          "type": "object",
          "fields": {
            "擅长": {
              "type": "texts",
              "description": "有来源的稳定能力。"
            },
            "不足": {
              "type": "texts",
              "description": "明确不会或未受训练的技能；没提及不等于不会，已会技能的限制另填。"
            },
            "做事方式": {
              "type": "text",
              "description": "运用本领的惯常操作流程；不复抄一般性情原则。"
            },
            "代价限制": {
              "type": "texts",
              "description": "已掌握本领的适用条件、使用代价和身体限制；不会的技能归不足。"
            },
            "定义引用": {
              "type": "refs",
              "description": "引用已登记能力/规则，不复制公式与资源当前值。"
            },
            "叙事表现": {
              "type": "text",
              "description": "使用本领时旁人可感知的动作或现象；不复抄通用流程，不代表本轮已成功。"
            }
          }
        },
        "人物核心": {
          "type": "object",
          "fields": {
            "性格核心标签": {
              "type": "texts",
              "description": "少量有依据的性格辨识词；概括稳定底色，不用职业、能力或单次心情代替人格，不用标签取代欲望与矛盾。"
            },
            "欲望双螺旋": {
              "type": "texts",
              "description": "彼此同时成立的核心欲望，每股各一项：想得到、守住或避免失去什么。双螺旋指多股驱动力并行，不是欲望对障碍；有几股写几股，不为凑两股捏造动机。具体计划和进度归长期目标。"
            },
            "核心矛盾": {
              "type": "text",
              "description": "上述欲望怎样冲突、互相依赖或强化；它们与信念、恐惧、现实限制怎样拉扯，每次取舍付出什么代价，其应对如何反过来影响追求。只写有依据的联系和代价，不堆砌反义词，不强造创伤或预设成长。"
            }
          }
        },
        "面具层": {
          "type": "object",
          "fields": {
            "面具呈现": {
              "type": "text",
              "description": "在什么对象或场合前，主动或习惯性维持什么外在形象；资料未说明伪装时留空，不把礼貌或一般表达自动判作虚假。"
            },
            "面具作用": {
              "type": "text",
              "description": "这层呈现用于保护、获得或回避什么，与真实欲望或反应有何落差；不复抄欲望全文，不泄露隐情内容。"
            },
            "面具裂隙": {
              "type": "text",
              "description": "哪些有依据的情境下，外在呈现与真实反应出现差异、松动或切换，旁人具体能看见什么；不是必然崩溃或已发生揭示，观察到征象不等于知道其原因。"
            }
          }
        }
      }
    },
    {
      "kind": "type",
      "id": "item",
      "fields": {
        "独有意义": {
          "type": "text",
          "description": "在目标世界中的具体意义；保留基点意义但不照搬旧世界事实。"
        },
        "使用限制": {
          "type": "text",
          "description": "来源明确的使用边界，不凭描述赋予可执行机制。"
        }
      }
    },
    {
      "kind": "type",
      "id": "place",
      "fields": {
        "空间关系": {
          "type": "object",
          "fields": {
            "上级地点": {
              "type": "ref",
              "description": "仅明确包含关系；提到或朝向不构成包含。"
            },
            "连接地点": {
              "type": "refs",
              "description": "明确可达连接；单向/许可细则由世界规则补定义。"
            },
            "有效范围": {
              "type": "text",
              "description": "地点边界与尺度，不由临近文字猜测。"
            }
          }
        }
      }
    },
    {
      "kind": "type",
      "id": "organization",
      "fields": {
        "组织目的": {
          "type": "text",
          "description": "组织存在理由与目标。"
        },
        "活动范围": {
          "type": "refs",
          "description": "已确认的地点范围；不因此继承成员所在地。"
        }
      }
    },
    {
      "kind": "table",
      "id": "facts",
      "fields": {
        "前史": {
          "type": "object",
          "fields": {
            "主体": {
              "type": "ref",
              "description": "所属对象的稳定ID。"
            },
            "时期": {
              "type": "text",
              "description": "明确早于当前开局的世界时期。"
            },
            "地点": {
              "type": "refs",
              "description": "已确认地点，不用文字邻接推导包含关系。"
            },
            "参与者": {
              "type": "refs",
              "description": "实际参与者不等于全体知情者。"
            },
            "选择": {
              "type": "text",
              "description": "材料明确的主动抉择；不能从获赠、持有或结果倒推自愿选择。"
            },
            "后果": {
              "type": "text",
              "description": "材料明确的事件结果；不把相邻叙述补成先后或因果。"
            },
            "当下影响": {
              "type": "text",
              "description": "明确由此事造成且仍持续的影响；不把别处已知事实当作此事后果。"
            },
            "原文": {
              "type": "text",
              "description": "已确认前史的原文；讨论示例不得升为事实。"
            },
            "涉及对象": {
              "type": "refs",
              "description": "本条明确涉及的其他已登记物品、组织或规则等；参与者与地点已有专格，不重复填；关联不代表参与或知情。"
            },
            "当时理解": {
              "type": "text",
              "description": "所属人物在此事当时怎样理解、相信或误解，限资料明确给出的心理或话语；不是客观定论或他人也知道，不用后来的认识倒灌。不明留空，受保护隐情仍归独立隐情。"
            }
          }
        },
        "关系底稿": {
          "type": "object",
          "fields": {
            "主体": {
              "type": "ref",
              "description": "关系方向的主体。"
            },
            "对象": {
              "type": "ref",
              "description": "持续联系另一端的稳定ID，可为人物、组织、地点或物品等；仅被提到不构成关系，同名不合并。"
            },
            "性质": {
              "type": "text",
              "description": "已确立的联系性质，如师徒、协作、长期责任或归属；责任和协作不自动成为私交。"
            },
            "形成经过": {
              "type": "text",
              "description": "该联系形成的已确认经过；不将仅同场或单次提及写成长期联系。"
            },
            "相处方式": {
              "type": "text",
              "description": "主体与本条对象的惯常互动或分工；不混入其他关系，不推断双向对称。"
            },
            "主体边界": {
              "type": "text",
              "description": "主体自己的边界与理由。"
            },
            "成立条件": {
              "type": "text",
              "description": "哪些前提使该关系成立；换U不能只改ID照搬。"
            }
          }
        },
        "隐情": {
          "type": "object",
          "fields": {
            "关联对象": {
              "type": "refs",
              "description": "秘密涉及的对象。"
            },
            "可观察线索": {
              "type": "texts",
              "description": "有依据的线索，不自动授予事实全貌。"
            },
            "揭示条件": {
              "type": "text",
              "description": "允许揭示的条件或永不揭示的约束，不等于已经公开。"
            },
            "影响范围": {
              "type": "text",
              "description": "秘密的影响，不作为人物已知信息。"
            }
          }
        },
        "世界设定": {
          "type": "object",
          "fields": {
            "领域": {
              "type": "enum",
              "values": [
                "方向",
                "法则",
                "空间",
                "生态",
                "社会",
                "生活",
                "文化",
                "时间"
              ]
            },
            "相关对象": {
              "type": "refs",
              "description": "关联的真实实体/规则ID。"
            },
            "适用范围": {
              "type": "text",
              "description": "设定适用的世界、时代和范围。"
            }
          }
        }
      }
    }
  ],
  "originViews": {
    "character": [
      {
        "id": "identity",
        "label": "身份",
        "table": "objects",
        "paths": [
          [
            "名称"
          ],
          [
            "别名"
          ],
          [
            "属性",
            "身份细目"
          ]
        ],
        "source": "MOD-P02"
      },
      {
        "id": "appearance",
        "label": "形貌",
        "table": "objects",
        "paths": [
          [
            "属性",
            "形貌"
          ]
        ],
        "source": "MOD-P03"
      },
      {
        "id": "disposition",
        "label": "性情",
        "table": "objects",
        "paths": [
          [
            "属性",
            "性情"
          ]
        ],
        "source": "MOD-P04"
      },
      {
        "id": "life",
        "label": "生活",
        "table": "objects",
        "paths": [
          [
            "属性",
            "生活"
          ]
        ],
        "source": "MOD-P05"
      },
      {
        "id": "expression",
        "label": "表达",
        "table": "objects",
        "paths": [
          [
            "属性",
            "表达"
          ]
        ],
        "source": "MOD-P06"
      },
      {
        "id": "skills",
        "label": "本领",
        "table": "objects",
        "paths": [
          [
            "属性",
            "本领"
          ]
        ],
        "source": "MOD-P07"
      },
      {
        "id": "history",
        "label": "经历",
        "table": "facts",
        "paths": [
          [
            "名称"
          ],
          [
            "命题"
          ],
          [
            "对象"
          ],
          [
            "前史"
          ]
        ],
        "source": "MOD-P08"
      },
      {
        "id": "relationships",
        "label": "关系",
        "table": "facts",
        "paths": [
          [
            "名称"
          ],
          [
            "命题"
          ],
          [
            "对象"
          ],
          [
            "关系底稿"
          ]
        ],
        "source": "MOD-P09"
      },
      {
        "id": "secrets",
        "label": "隐情",
        "table": "facts",
        "paths": [
          [
            "名称"
          ],
          [
            "命题"
          ],
          [
            "对象"
          ],
          [
            "隐情"
          ]
        ],
        "source": "MOD-P10"
      },
      {
        "id": "characterCore",
        "label": "核心",
        "table": "objects",
        "paths": [
          [
            "属性",
            "人物核心"
          ]
        ],
        "source": "MOD-P01 / FT10-W28"
      },
      {
        "id": "personaMask",
        "label": "面具",
        "table": "objects",
        "paths": [
          [
            "属性",
            "面具层"
          ]
        ],
        "source": "Luc entry 0 / FT10-W28"
      }
    ],
    "item": [
      {
        "id": "item",
        "label": "物品原点",
        "table": "objects",
        "paths": [
          [
            "名称"
          ],
          [
            "别名"
          ],
          [
            "描述"
          ],
          [
            "属性",
            "形态"
          ],
          [
            "属性",
            "用途"
          ],
          [
            "属性",
            "材质"
          ],
          [
            "属性",
            "规则"
          ],
          [
            "属性",
            "独有意义"
          ],
          [
            "属性",
            "使用限制"
          ]
        ],
        "source": "MOD-O04"
      }
    ],
    "place": [
      {
        "id": "place",
        "label": "地点原点",
        "table": "objects",
        "paths": [
          [
            "名称"
          ],
          [
            "别名"
          ],
          [
            "描述"
          ],
          [
            "属性",
            "环境"
          ],
          [
            "属性",
            "位置"
          ],
          [
            "属性",
            "特征"
          ],
          [
            "属性",
            "出入条件"
          ],
          [
            "属性",
            "空间关系"
          ]
        ],
        "source": "MOD-O03"
      }
    ],
    "organization": [
      {
        "id": "organization",
        "label": "组织原点",
        "table": "objects",
        "paths": [
          [
            "名称"
          ],
          [
            "别名"
          ],
          [
            "描述"
          ],
          [
            "属性",
            "职责"
          ],
          [
            "属性",
            "结构"
          ],
          [
            "属性",
            "立场"
          ],
          [
            "属性",
            "历史"
          ],
          [
            "属性",
            "组织目的"
          ],
          [
            "属性",
            "活动范围"
          ]
        ],
        "source": "MOD-O02"
      }
    ],
    "rule": [
      {
        "id": "rule",
        "label": "规则原点",
        "table": "objects",
        "paths": [
          [
            "名称"
          ],
          [
            "描述"
          ],
          [
            "属性",
            "适用范围"
          ],
          [
            "属性",
            "条件"
          ],
          [
            "属性",
            "效果"
          ],
          [
            "属性",
            "例外"
          ]
        ],
        "source": "MOD-W02/R03"
      }
    ],
    "world": [
      {
        "id": "world",
        "label": "世界定义",
        "table": "facts",
        "paths": [
          [
            "名称"
          ],
          [
            "命题"
          ],
          [
            "条件"
          ],
          [
            "生效时间"
          ],
          [
            "对象"
          ],
          [
            "世界设定"
          ]
        ],
        "source": "MOD-W01—W08"
      }
    ]
  },
  "coreSlots": [
    {
      "id": "essence",
      "label": "核心与不可替代性",
      "target": "traits",
      "prompt": "去掉世界外壳后必须保留什么；不要只提取标签。"
    },
    {
      "id": "choice",
      "label": "价值与选择",
      "target": "traits",
      "prompt": "价值冲突、判断及拒绝边界，有原文才保留。"
    },
    {
      "id": "motive",
      "label": "愿望与形成因果",
      "target": "traits",
      "prompt": "这里只保留经历如何形成或改变核心的依据；欲望本身归欲望双螺旋，不重复抄写，不复制旧世界人名和已完成事件。"
    },
    {
      "id": "ability",
      "label": "用途、能力与代价",
      "target": "traits",
      "prompt": "能力/物品用途的意义、限制与代价；数值另由目标世界定义。"
    },
    {
      "id": "anchor",
      "label": "辨识与象征",
      "target": "traits",
      "prompt": "只有核心必需的外形/象征才保留；其余允许世界化。"
    },
    {
      "id": "growth",
      "label": "选择携带的成长",
      "target": "growth",
      "prompt": "仅用户明确选择；作为待适配的经历意义，不冒充新会话已经发生。"
    },
    {
      "id": "links",
      "label": "所选对象的关联意义",
      "target": "links",
      "prompt": "对象齐全且明确选择才保留；不自动扩大选取或携带旧关系、背包。"
    },
    {
      "id": "personality-tags",
      "label": "性格核心标签",
      "target": "traits",
      "prompt": "人物核心的少量辨识词；与欲望、矛盾共同保留，不以同标签替换其具体意义。"
    },
    {
      "id": "desire-axis",
      "label": "欲望双螺旋",
      "target": "traits",
      "prompt": "保留多股同时成立的核心欲望及优先关系，不简化为目标对障碍；原点分别映射具体表达，不复制旧任务进度。"
    },
    {
      "id": "tension-axis",
      "label": "核心矛盾",
      "target": "traits",
      "prompt": "保留多股欲望的冲突、依赖与强化，以及它们与信念、恐惧、现实限制的拉扯和取舍代价；不强造创伤或预设成长。"
    },
    {
      "id": "persona-mask",
      "label": "面具及真实落差",
      "target": "traits",
      "prompt": "有依据才携带表层呈现的用途及与真实反应的落差；核心意义适配到原点面具层，旧世界场合、人名和已揭露状态不直接迁移。"
    }
  ],
  "sessionViews": [
    {
      "table": "scene",
      "label": "场景",
      "inheritance": "仅以明确开局场景建立；随后按来源更新，不能复制旧会话在场者。"
    },
    {
      "table": "state",
      "label": "当前状态",
      "inheritance": "明确开局值或锚点时值；逐对象/字段唯一，当前位置不能从出身地复制。"
    },
    {
      "table": "relations",
      "label": "当前关系",
      "inheritance": "逐方向、双方实体与成立前提核对；换U不自动继承旧关系。"
    },
    {
      "table": "cognition",
      "label": "人物认知",
      "inheritance": "仅明确开局知识/真实接触；原点秘密存在不等于人物知道。"
    },
    {
      "table": "holdings",
      "label": "持有流转",
      "inheritance": "明确开局归属、保管或锚点值；模板物品存在不等于拥有。"
    },
    {
      "table": "activities",
      "label": "行动计划",
      "inheritance": "有主体和依据的计划/行动，意图不是完成。"
    },
    {
      "table": "tasks",
      "label": "任务",
      "inheritance": "明确发布/接受等真实阶段；愿望不是自动接受。"
    },
    {
      "table": "timers",
      "label": "日程",
      "inheritance": "有时间基准与触发条件；到期不等于事件发生。"
    },
    {
      "table": "clues",
      "label": "线索",
      "inheritance": "已出现内容和公开范围；未揭示真相不先给人物。"
    },
    {
      "table": "events",
      "label": "事件",
      "inheritance": "当前线真实发生的过程；前史事实不伪装本轮事件。"
    },
    {
      "table": "experiences",
      "label": "习惯与回忆",
      "inheritance": "按主体和形成依据记录；开局已有与后生变化分别注明来源。"
    },
    {
      "table": "growth",
      "label": "成长",
      "inheritance": "变化及其证据，不能覆盖原点底档或默认跨世界继承。"
    }
  ],
  "inheritance": [
    {
      "id": "core-to-origin",
      "from": "基点",
      "to": "原点",
      "rule": "逐项意义适配与表达映射；不直接复制旧身份、数值、关系、持有、知情。",
      "evidence": "已选基点版本＋目标世界定义＋用户确认",
      "writes": "确认后origin.bases及coreAdaptations；模板预览零写"
    },
    {
      "id": "origin-to-session",
      "from": "原点",
      "to": "新会话",
      "rule": "固定原点版本引用；仅明确开局事实建立业务行；原点记录不自动授予知情。",
      "evidence": "所选原点版本＋开局设计/原卡明确依据",
      "writes": "session.pins及初始提交；不重置已有会话"
    },
    {
      "id": "session-delta",
      "from": "会话前态",
      "to": "会话后态",
      "rule": "真实来源驱动字段增量；前史与稳定底档不被后生变化覆盖。",
      "evidence": "本线已保留正文/授权输入/宿主结算",
      "writes": "session.commits，按修订/锁定/来源校验"
    },
    {
      "id": "session-to-core",
      "from": "会话",
      "to": "基点提取",
      "rule": "用户明确选择对象、关联、成长后提取可复用意义；不自动回流。",
      "evidence": "所选来源快照与稳定项ID",
      "writes": "origin.coreAssets新的基点版本"
    },
    {
      "id": "anchor-to-branch",
      "from": "冻结原著锚点",
      "to": "新分支",
      "rule": "只继承锚点已成立状态；新U的关系/持有/知情须逐项核对，未来不倒灌。",
      "evidence": "冻结版本＋锚点＋主体映射与干预依据",
      "writes": "分支种子及分歧记录；完整新U因果引擎仍待实现"
    }
  ],
  "unknown": "缺失保持缺失；空数组/false/0仅在明确填写时保留；不由模板补默认值。",
  "privacy": "access.readers与access.knowers按每条记录独立；同一行内不同秘密/知情范围拆成facts/cognition，不靠折叠或显示分组授权。",
  "bindings": [
    {
      "label": "基点身份",
      "path": "origin.coreAssets[].id / version",
      "type": "string / number",
      "owner": "保存基点时分配",
      "rule": "定位被选基点；版本相同还须核内容指纹"
    },
    {
      "label": "提取来源",
      "path": "origin.coreAssets[].sourceSession / source",
      "type": "string / object（整组）",
      "owner": "明确选择后提取",
      "rule": "整组source保存获选对象、成长、关联及说明；不得扩大选择集"
    },
    {
      "label": "成员来源",
      "path": "origin.coreAssets[].members[].sourceObject / sourceRevision / sourceType / kind",
      "type": "string / number / string / string",
      "owner": "整组基点保存",
      "rule": "保留源对象与修订；不是目标世界对象ID"
    },
    {
      "label": "核心与成长",
      "path": "origin.coreAssets[].members[].traits[] / growth[]",
      "type": "{id,name,value,evidence}[]",
      "owner": "逐项提取并核证据",
      "rule": "成长必须已选择；evidence对应被选来源中的连续原文"
    },
    {
      "label": "关联闭包",
      "path": "origin.coreAssets[].links[]",
      "type": "{id,sourceRow,members,name,value,evidence}[]",
      "owner": "整组基点保存",
      "rule": "members必须属于已选成员；关联意义需显式适配"
    },
    {
      "label": "目标底档",
      "path": "origin.bases[].id / rev / values",
      "type": "string / number / object",
      "owner": "确认创世或原点编辑",
      "rule": "固定修订，不以当前进度覆盖原点"
    },
    {
      "label": "适配依据",
      "path": "origin.coreAdaptations[].core",
      "type": "{book,id,version,fingerprint}",
      "owner": "确认整组适配",
      "rule": "核相同基点版本及内容后保存；不是靠名字匹配"
    },
    {
      "label": "成员映射",
      "path": "origin.coreAdaptations[].members[].member / object",
      "type": "源成员ID / 目标ID@rev",
      "owner": "确认整组适配",
      "rule": "明确哪位成员变成哪个世界版本"
    },
    {
      "label": "逐项表达",
      "path": "origin.coreAdaptations[].members[].items[]",
      "type": "{item,path,expression}[]",
      "owner": "确认整组适配",
      "rule": "每个核心/成长项均须映射；expression逐字存在于目标字段文本"
    },
    {
      "label": "关联表达",
      "path": "origin.coreAdaptations[].links[].link / targets[]",
      "type": "基点关联ID / {object,path,expression}[]",
      "owner": "确认整组适配",
      "rule": "关联成员的具体世界表达；不自动建立会话关系"
    },
    {
      "label": "会话绑定",
      "path": "session.origin / pins[]",
      "type": "原点书名 / ID@rev[]",
      "owner": "显式绑定与版本选择",
      "rule": "每个对象只选一个修订；原点更新不自动替换已选版本"
    },
    {
      "label": "版本选择历史",
      "path": "session.commits[].originSelection",
      "type": "{before,after}",
      "owner": "显式重选原点版本",
      "rule": "保留前后pins并按来源投影，不能只看当前pins还原过去"
    },
    {
      "label": "剧情来源",
      "path": "session.commits[].source / contextSource / depends",
      "type": "string或null",
      "owner": "受控提交",
      "rule": "仅应用当前故事来源链及依赖均成立的提交；contextSource为按需字段"
    },
    {
      "label": "变更前后",
      "path": "session.commits[].changes[]",
      "type": "{id,before,after} 或 {id,before,origin}",
      "owner": "受控提交",
      "rule": "after为会话行；origin指向固定原点修订，不能混为可变复制件"
    },
    {
      "label": "逐条依据",
      "path": "session.commits[].anchors[]",
      "type": "{source,row,worldTime,recordedAt,evidence,…}[]",
      "owner": "受控提交",
      "rule": "世界时间和记录时间分开；每项须有来源证据"
    },
    {
      "label": "行权限与人工值",
      "path": "row.access.readers / access.knowers / lockedFields",
      "type": "string[] / string[] / string[]",
      "owner": "逐行确认",
      "rule": "读者可见与角色知情分开；继承pins时清空knowers；人工锁保护原字段"
    },
    {
      "label": "分支时点",
      "path": "session.branchSeed / branchSeed.anchor",
      "type": "object / object",
      "owner": "显式选时间锚或分叉",
      "rule": "已有锚点投影能力；完整新U映射、因果分歧与新模板接线待验"
    }
  ]
};
