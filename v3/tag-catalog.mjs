const freeze=value=>{if(value&&typeof value==='object'){for(const item of Object.values(value))freeze(item);Object.freeze(value);}return value;};
const clone=value=>structuredClone(value);
const check=(ok,message)=>{if(!ok)throw Object.assign(Error('TISYA_TAG_CATALOG: '+message),{code:'TISYA_TAG_CATALOG'});};
const norm=text=>String(text).normalize('NFKC').trim().toLocaleLowerCase();
export const TAG_CATALOG_VERSION='tisya.tag-catalog.w26.1';
export const TAG_TYPES=freeze([{id:'character',label:'角色构造'},{id:'plot',label:'情节走向'}]);
const typeLabels=Object.fromEntries(TAG_TYPES.map(item=>[item.id,item.label]));
const tag=(id,label,aliases,description,trigger,expression,contrast,progression,sourceIds)=>({id,label,aliases,type:id.split('.')[0],description,usage:{trigger,expression,contrast,progression},sourceIds});

// Labels are optional authoring templates. The descriptions and usage notes are original summaries.
// Catalog presence has no score, evidence, character-fact or preference-storage effect.
export const TAG_CATALOG=freeze([
 tag('character.control','掌控感',['控场','掌控欲'],'通过判断时机、分配注意与主动选择掌握互动节奏。','局面失序、计划受阻或关系进入试探。','先处理关键变量，再给出有分量的安排。','外表从容，遇到真正重视的人或事时调整原有打算。','让一次控场改变谈判条件、行动路线或双方距离。',['dengekitaisho-editor','jj-tags']),
 tag('character.indulgence','纵容',['默许','有意偏纵'],'明知对方的小心思，仍愿意留出余地并作出回应。','熟悉的人试探一条日常规矩。','接住小动作，承担一项具体麻烦，偶尔索取小小回报。','宽纵之中仍保留独立判断与自己的安排。','使默许变成新的默契、责任或下一次试探的起点。',['kadokawa-character']),
 tag('character.reluctant-flirt','无奈钓系',['无奈式撩拨'],'以似退似让的回应主动吸引注意，保留若有若无的余味。','对方主动靠近、挑衅或索要特殊待遇。','嘴上嫌麻烦，行动却留下只对那个人开放的入口。','熟练的从容被一句意外回应打断，显出真实在意。','让试探收到新反馈，使双方重新判断彼此意图。',['jj-tags','dengekitaisho-editor']),
 tag('character.restrained-flirt','克制撩拨',['含蓄调情'],'把吸引力放在分寸、停顿与恰到好处的偏爱里。','双方已有亲近基础，又各有顾虑。','借实际交往中的一句话或一次让步留下双重含义。','言语节制，细节却暴露出投入的程度。','让对方有机会接招、误读或主动改变距离。',['jj-tags','kadokawa-character']),
 tag('character.guarded-care','嘴硬心软',['傲娇','别扭关心'],'关心被自尊、羞窘或表达习惯拐了一个弯。','想帮助对方，又不愿轻易承认在意。','先抱怨一件具体小事，再把真正有用的东西递过去。','说出的理由很小，付出的心力却很实在。','让对方发现、体谅或误会这份心意，带来后续回应。',['jj-tags','kakuyomu-explore']),
 tag('character.cool-warmth','外冷内热',['冷面热心'],'外在寡言或疏淡，情感通过观察和行动逐渐显露。','需要照料、协作或替别人留体面。','少解释自己的好意，准确处理别人漏看的细节。','对外的距离感与熟人面前的耐心形成层次。','用积累的具体回应改变他人对角色的认识。',['jj-tags','kadokawa-character']),
 tag('character.gentle-resolve','温柔坚定',['温柔有锋芒'],'态度温和，同时有清楚的原则和行动决心。','体谅他人与守住重要之事发生冲突。','把分歧说清，认真听回应，再承担自己决定的代价。','柔和语气承载难以动摇的选择。','让照顾与坚持共同推动一项有后果的决定。',['kadokawa-character','dengekitaisho-editor']),
 tag('character.sharp-care','毒舌关怀',['嘴毒心细'],'尖锐观察与细致照顾并存，言语有对象也有分寸。','熟人逞强、犯小错或把难处藏起来。','戳中具体漏洞，随后给出实际帮助或可执行办法。','评价挑剔，记住的却是对方最容易忽略的需求。','让玩笑落到改变行动的提醒或被理解的瞬间。',['jj-tags','douban-writing']),
 tag('character.relaxed-reliable','松弛可靠',['散漫靠谱'],'平时姿态随意，在需要时能稳稳接住局面。','众人焦躁，而角色恰有可用经验。','用简单动作完成关键工作，把紧张化成可以处理的问题。','悠闲表象与熟练判断形成反差。','让别人愿意托付一项任务，也让角色承担相应责任。',['dengekitaisho-editor']),
 tag('character.high-spirits','意气风发',['少年意气'],'有锐气、好胜心与对未来的鲜活期待。','遇见值得投入的目标、对手或新天地。','主动发起挑战，把热情化为一次切实尝试。','豪言遇到真实困难时，显出韧性、羞窘或新的理解。','让理想经过一次实践，留下成长与关系的变化。',['jj-tags','qidian-categories']),
 tag('character.seasoned','沉稳老练',['处变不惊'],'经验让角色看见代价、次序和旁人未察觉的难点。','复杂局面需要判断轻重缓急。','少作姿态，先核实关键事实并给局面留余地。','对熟悉事务游刃有余，在陌生领域仍需学习。','让经验改变计划，也让一次意外暴露其旧经验的边界。',['dengekitaisho-editor','kadokawa-character']),
 tag('character.professional','专业魅力',['业界精英','职业能力'],'通过专业判断、习惯与协作方式体现吸引力。','工作难题或危机进入角色擅长的领域。','呈现关键步骤、取舍与对细节的敏感。','在职责上利落，在私人关系中可能迟疑或笨拙。','让能力解决一个具体问题，同时带来新的合作与责任。',['jj-tags','kadokawa-character']),
 tag('character.sincere-awkward','笨拙真诚',['笨拙示好'],'表达不熟练，意图却坦诚而具体。','角色想靠近、道谢或补救，又缺少经验。','说话稍有卡顿，仍把重要的意思讲出来并付诸行动。','预想中的漂亮表现与实际的小失误形成亲近感。','让对方可以接住诚意，改变原先的误会或距离。',['dengekitaisho-editor','douban-writing']),
 tag('character.strategic','腹黑谋略',['腹黑','笑里藏锋'],'外在姿态与真实布局存在距离，行动围绕自身目标展开。','利益交错、信息不全或谈判存在回旋空间。','选择性透露信息，安排让他人有理由参与的下一步。','计划精密，却会被私人牵挂或错误判断改变。','让布局带来可追溯的效果，也留下可被识破的线索。',['jj-tags','dengekitaisho-editor']),
 tag('character.frank-edge','坦荡锋芒',['明争'],'把欲望、竞争和分歧摆上台面，承认自己想赢。','与旗鼓相当的人争取同一个目标。','直说条件，正面交锋，认真对待对手的回应。','言语锋利，面对他人的实力或代价时保持尊重。','让明确的立场促成比赛、协商或一次关系重估。',['kadokawa-character']),
 tag('character.proud-composure','骄矜自持',['高岭之花'],'保持自尊与选择性亲近，吸引力来自标准和自持。','有人靠近其私域、挑战标准或真正理解其追求。','通过挑选、拒绝、认可与主动靠近显示区别。','高要求背后藏着认真、寂寞或难以启齿的期待。','让一次例外有具体理由，并改变双方对关系的判断。',['jj-tags','dengekitaisho-editor']),
 tag('character.loyal-backbone','忠诚有骨',['忠犬','忠诚型'],'把承诺落实为持续行动，同时保有自己的判断。','信任受到考验，或同伴的决定出现分歧。','愿意承担艰难部分，也会认真指出问题。','坚定支持与必要的劝阻共同显出关系重量。','让忠诚经过选择与代价，而后转化为更深的信赖。',['jj-tags','kadokawa-character']),
 tag('character.deadpan','冷面吐槽',['冷幽默','吐槽役'],'以平静语气抓住荒诞之处，让对话产生节奏变化。','局面煞有介事地偏离常识或角色预期。','用一句准确观察切开夸张场面，把话题拉回实际。','表情克制，措辞中的小心思却十分鲜明。','让吐槽促成转折、缓和压力或戳破一层伪装。',['jj-tags','douban-writing']),
 tag('character.curious','好奇探究',['求知欲'],'愿意追问、试验和修正认识，兴趣有具体对象。','遇到陌生规律、反常细节或无法解释的现象。','提出能验证的问题，动手试一次，再看结果。','专注时忘记小事，重要判断上又格外谨慎。','让好奇获得线索、招来麻烦或打开新的合作。',['qidian-categories','dengekitaisho-editor']),
 tag('character.craft','匠心执拗',['匠人气'],'对一件事有长久投入，标准落实在手艺与判断里。','作品、承诺或关键细节达不到自己的标准。','重复改进一个有意义的步骤，解释取舍并接受检验。','在专业上执拗，在生活里另有松弛或稚拙的一面。','让坚持改善结果，同时显出它耗费的时间和机会。',['kadokawa-character']),
 tag('character.vulnerable-resilient','脆弱与韧性',['美强惨'],'能力、伤痕与日常愿望并存，人在困难中仍有选择。','旧伤被触动，或眼前事务要求重新行动。','让角色处理具体困难，接受帮助、拒绝要求或保存体力。','强项与难处落在不同方面，保留普通生活的喜怒。','让选择产生实际后果，恢复、停留与改变各有过程。',['jj-tags','kadokawa-character']),
 tag('character.endearing-contrast','反差萌',['反差感','萌点'],'熟悉形象中露出有来由的小偏差，增加亲近与辨识度。','角色暂时放松，或碰到自己的特别喜好。','用一件小事显出平日少见的反应。','反差来自经历、习惯或重视之物，与原有人格相连。','让这个细节进入互动，成为日后的默契或回响。',['dengekitaisho-editor','kakuyomu-explore']),
 tag('character.mask','面具差分',['公私反差'],'角色在不同关系与职责中采用不同的表达方式。','场合、对象或身份责任发生变化。','改变措辞、距离和决策方式，让同一动机显出不同侧面。','面具能提供保护，也可能妨碍真正想要的关系。','用一次差分被察觉的时刻推动理解、猜测或冲突。',['dengekitaisho-editor']),
 tag('character.animal-image','动物意象',['动物塑','猫系','犬系','狐系','鸟系'],'借动物习性联想表现姿态、注意方式与亲疏距离。','角色警觉、放松、试探或回应熟悉的人。','选择贴合角色的一个动作或感知联想，并随情境变化。','强弱、警惕与亲近可以在同一意象中转换。','让意象参与一个新动作、笑点或关系变化；物种和形态依已有设定。',['jj-tags','kakuyomu-explore']),
 tag('character.clear-hearted','天真敏锐',['赤子之心'],'愿意信任与惊喜，也能看见别人习以为常的问题。','众人接受惯例，而角色仍追问它的意义。','直接说出朴素观察，再认真听取复杂的回答。','天真与观察力并存，经历会让判断逐渐改变。','让一个简单问题揭开盲点或开启新的选择。',['kadokawa-character']),
 tag('character.ideal-selfinterest','理想与私心',['理想主义'],'远大愿望与个人需要相互牵扯，使选择有真实重量。','践行理念将损害自己珍视的人、利益或生活。','把理想落实成具体责任，同时承认想保住的东西。','在原则上坚定，在私人处境中迟疑、妥协或重新选择。','让一次选择改变行动方法、关系或对理想的理解。',['dengekitaisho-editor','douban-writing']),
 tag('character.personal-code','灰度守则',['亦正亦邪','自有底线'],'用一套有来历的判断标准面对矛盾处境。','各方都有理由，常规办法又无法兼顾。','说明自己愿意付出的代价，并对行动结果负责。','守则保护某些东西，也会显出局限和自利。','让守则受到事实检验，促成合作、冲突或修正。',['dengekitaisho-editor']),
 tag('character.selfhood','笃定自我',['自尊自持'],'对自己的愿望、价值和选择有稳定的认识。','外界评价、关系压力或诱惑要求角色让步。','清楚表达选择，承受相应结果，并回应真正有力的理由。','坚定的自我仍容纳羞怯、求助和新的学习。','让关系通过理解差异而发展，使改变来自自身决定。',['kadokawa-character','dengekitaisho-editor']),
 tag('character.playful-pride','恃才玩味',['轻佻傲气'],'有能力作底气，借挑衅、玩笑和试探观察对手。','遇见能接招的人，或局面允许冒一点社交风险。','用有具体对象的轻佻话语挑起交锋，并接住对方反击。','自信遇到失算时，显出恼意、欣赏或短暂的失措。','让玩味变成一次真正的较量或意料之外的在意。',['dengekitaisho-editor','douban-writing']),
 tag('plot.mutual-testing','双向试探',['互相试探'],'双方带着各自意图，用小步行动探明彼此。','关系尚未说定，双方都有想知道的事。','一方递出试探，另一方用自己的方式回应或反问。','看似同一段对话，双方在意的答案可能不同。','让每次试探增加信息，改变后续的行动尺度。',['jj-tags','kadokawa-character']),
 tag('plot.emotional-tension','感情拉扯',['情感张力'],'靠近与退让各有理由，欲望与顾虑推动关系变化。','亲近的愿望遇到时机、立场或自尊的阻力。','安排具体的索取、给予、受挫或补偿。','表面退让可能换来理解，主动争取也可能暴露脆弱。','让本轮关系获得新的信息、承诺、距离或难题。',['jj-tags','kadokawa-character']),
 tag('plot.unspoken','暧昧留白',['含蓄暧昧'],'重要意味留在未说尽的话与可感知的行动之间。','双方意识到关系变化，却还没有命名。','让停顿、改口或实务上的偏爱承载潜台词。','言语保持日常，细节带出特别的意味。','让对方有机会回应这份意味，并留下可继续的余韵。',['kadokawa-character','douban-writing']),
 tag('plot.slow-affection','日久生情',['慢热感情'],'吸引与信任在共同经历中逐步形成。','双方持续相处，需要一起处理小事与难题。','积累一次被看见、一次可靠回应和一次认识修正。','最初的印象与后来熟悉的细节产生差别。','让关系变化有可回望的节点，新的亲近改变日常。',['jj-tags','kakuyomu-explore']),
 tag('plot.bickering-affection','欢喜冤家',['斗嘴情缘'],'性格或习惯的摩擦为互动提供活力和认识机会。','两人需要协作，却对办法或节奏各有主张。','斗嘴围绕眼前实事展开，行动仍彼此影响。','嘴上的针锋相对与关键时刻的默契相互映照。','让争执找到一个新办法，或暴露藏在玩笑里的在意。',['jj-tags','kakuyomu-explore']),
 tag('plot.equal-rivals','强强对手',['强强','势均力敌'],'各有能力、目标与筹码的人相互检验和影响。','双方争取同一目标，或需要彼此擅长的部分。','安排真实有效的出招、应对与代价。','欣赏与竞争并存，强项也会成为对方看见的弱点。','让胜负、合作条件或彼此评价发生实质变化。',['jj-tags','dengekitaisho-editor']),
 tag('plot.growing-together','并肩成长',['共同成长'],'不同的人通过共同实践改变能力与认识。','一项共同目标超出各自现有能力。','分工、犯错、修正，再把学到的东西用于下一步。','成长速度和方向不同，关系也随之调整。','让一项新能力或新理解产生可见成果和后续挑战。',['jj-tags','kakuyomu-explore']),
 tag('plot.reciprocal-care','互相照料',['互宠','双向照顾'],'照料随处境流动，双方都有给予与接受的机会。','疲惫、失误或现实需要暴露出具体难处。','一方帮忙解决眼前问题，另一方以适合自己的方式回应。','擅长照顾的人也可能不习惯被照顾。','让照料改变信任、生活安排或彼此的责任感。',['kadokawa-character']),
 tag('plot.reunion','久别重逢',['重逢'],'熟悉感与时间带来的变化同时进入新的相处。','分开的人在新的处境里再次见面。','让一个旧习惯与一项新变化在同一场交流中碰面。','仍然了解的部分与已经陌生的部分相互映照。','让双方重新选择现在的关系，而后处理未完成的事。',['jj-tags']),
 tag('plot.reconciliation','破镜重圆',['旧情修复'],'有过断裂的关系经过面对旧因和新的行动重新建立。','双方再次接触，并有机会处理导致分开的矛盾。','让解释、承担与实际改变分别获得检验。','想念与警惕并存，旧默契未必足以解决旧问题。','用新的相处办法建立下一阶段关系，保留选择的重量。',['jj-tags','kadokawa-character']),
 tag('plot.shared-secret','共同秘密',['秘密同盟'],'共同掌握的信息改变双方的责任与关系。','两人发现一件尚未公开、又需要处理的事实。','协商保密、核实或公开的时机，各自承担一部分风险。','表面疏远与暗中协作形成张力。','让秘密产生具体行动，并面对信息扩散的后果。',['kakuyomu-explore','dengekitaisho-editor']),
 tag('plot.opposed-duties','立场冲突',['职责冲突'],'彼此可以理解，仍因责任、利益或信念而发生分歧。','同一事件要求双方作出无法同时满足的选择。','让各方说出真实理由，并用行动承担自己的立场。','私人情感与公开职责相互牵扯。','让冲突改变合作方式、信任或下一次选择的条件。',['kadokawa-character','douban-writing']),
 tag('plot.trust-crisis','信任危机',['信任考验'],'新证据或行动动摇既有信赖，迫使关系重新校准。','隐瞒、失约或看似矛盾的行为被发现。','分清已知事实与猜测，让解释和验证有实际机会。','过去的信任可能提供耐心，也可能放大受伤感。','让危机留下新的约定、距离或对关系的理解。',['kadokawa-character']),
 tag('plot.misreading','误解与澄清',['认知错位'],'信息差、情绪与经验造成错误判断，并产生后果。','人物只能接触片面线索或带着强烈预期。','呈现各自看见的证据、解释及由此采取的行动。','相同线索在不同经历的人眼中有不同意味。','通过新证据或交流改变判断，保留错误已经造成的影响。',['dengekitaisho-editor','douban-writing']),
 tag('plot.identity-reveal','身份揭晓',['掉马','马甲揭晓'],'一个重要身份被发现，改变他人对已有行为的解释。','伪装遇到必须动用真实能力或承认关系的时刻。','让已有线索汇合，揭晓过程影响眼前选择。','旧印象与新身份之间的落差带来重新理解。','让揭晓后的责任、距离和利益进入下一场互动。',['jj-tags','dengekitaisho-editor']),
 tag('plot.callback','伏笔回响',['伏笔回收','呼应'],'早先的细节在变化后的情境里获得新的意义。','事件发展到旧线索、物件或话语可以发挥作用的节点。','让旧细节参与当前行动，再显出其前后意义的差别。','曾经无意的小事变成此刻有分量的选择。','让回响解决一个问题，同时改变人物认识或留下余韵。',['dengekitaisho-editor','kadokawa-character']),
 tag('plot.everyday','日常小事',['日常','市井生活'],'从具体生活事务中写出人物关系与世界质感。','工作、饮食、住行或习惯需要共同处理。','让不同偏好与实务细节产生自然的交流和小选择。','平凡事务映出特别的重视、烦恼或能力。','让小事留下一点可延续的变化、约定或新认识。',['jj-tags','kadokawa-character']),
 tag('plot.situational-comedy','生活喜剧',['轻松喜剧','情境喜剧'],'人物认真做事，性格与处境的错位生出笑意。','计划遇到日常意外，几个人的理解或习惯不同。','把笑点落在行动、应对和真实的社交目的上。','一本正经的投入与意外结果形成反差。','让笑点改变局面，再以角色的新应对继续推进。',['jj-tags','kakuyomu-explore']),
 tag('plot.cultural-wordplay','文化巧思',['双关','谐音梗','典故回声'],'用角色熟悉的语言与文化联想制造会心一笑的意味。','交流里出现适合借用的词、物件或共同记忆。','让双关、谐音或典故服务说话人的当下目的。','字面意思与双方听懂的另一层意思相互照映。','让对方接梗、曲解或回敬，形成可记住的互动。',['douban-writing','dengekitaisho-editor']),
 tag('plot.unexpected-rapport','意外默契',['默契萌点'],'尚未明说的理解在一次配合中显露出来。','需要迅速回应、共同收场或照顾一个细节。','双方独立作出能够接合的动作，再察觉彼此的反应。','平日分歧与关键时刻的合拍形成惊喜。','让默契被承认、试探或成为下一次协作的基础。',['kadokawa-character']),
 tag('plot.journey','旅行冒险',['公路文','探索冒险'],'移动与陌生处境持续改变人物的认识和关系。','角色离开熟悉环境，朝一个具体目标前进。','让路线、补给、相遇和选择共同塑造旅程。','外部风景变化与人物内部的迟疑或期待相互映照。','每一站带走新信息、代价或关系变化，影响下一段路。',['jj-tags','qidian-categories','kakuyomu-explore']),
 tag('plot.mystery','探案解谜',['悬疑推理','谜题探索'],'以可追溯的线索和人物行动逐步重建事实。','一个异常现象或矛盾说法需要解释。','调查、比对和试探带来新证据，也产生合理的误判。','表面解释与真实因果之间存在可发现的差距。','让每轮调查改变问题，而关键揭晓回应此前线索。',['jj-tags','qidian-categories','kakuyomu-explore']),
 tag('plot.building','经营建设',['基建','经营','种田'],'通过资源、分工和改进，把一处生活或事业慢慢建起来。','现有条件无法满足具体生活或经营目标。','展开关键工序、利益协调和可见的阶段成果。','宏大愿望要经过琐碎实务，能干的人也会遇到新限制。','让成果改善条件，并引出新的责任、需求或矛盾。',['jj-tags','qidian-categories']),
 tag('plot.competition','竞技争锋',['体育竞技','比赛对决'],'能力、策略和临场判断在明确规则中相互碰撞。','双方为同一目标进入有代价的竞争。','以局势变化组织攻防，让选择影响结果。','个人强项与团队配合、心理状态之间形成拉力。','让胜负带来新的排名、认识或关系，而后进入下一挑战。',['jj-tags','qidian-categories']),
 tag('plot.comeback','逆风翻盘',['逆袭'],'处于不利位置的人通过积累和选择争取转机。','原有办法失效，或资源与机会暂时落在对手手中。','寻找可用条件，付出代价，把小优势连成新的局面。','外界判断与实际准备形成差距。','让转机有前因，结果改变各方下一步的筹码。',['jj-tags','qidian-categories']),
 tag('plot.scarcity','有限资源',['求生取舍'],'资源不足迫使人物排序愿望、承担代价并寻找办法。','时间、补给、信息或能力无法同时满足所有目标。','让分配、协作和试验产生具体得失。','平日的价值观在短缺处境中显出不同侧面。','每次选择改变可用条件，使后续难题建立在新局面上。',['jj-tags','qidian-categories']),
 tag('plot.responsibility','责任抉择',['两难选择'],'重要责任彼此冲突，人物必须决定先守住什么。','个人愿望、他人需要与职责无法同时兑现。','让角色看清实际选项、代价和自己愿意承担的部分。','正确理由可能指向不同道路。','把决定的结果带回人物关系和后续生活。',['kadokawa-character','douban-writing']),
 tag('plot.mutual-recovery','互助救赎',['救赎','共同疗愈'],'人物通过彼此帮助获得新的选择和生活可能。','一个人遇到难以独自处理的困境，另一个人愿意参与。','给予具体支持，让受助者保有行动与回应的空间。','帮助者也有局限，双方会在相处中重新认识自己。','让支持形成可持续的改变，同时保留各自的生活方向。',['jj-tags','kadokawa-character']),
 tag('plot.ensemble','群像交织',['群像'],'不同人物的独立目标在同一世界里相遇、碰撞和互相影响。','几条各自进行的事务出现利益、地点或时间上的交点。','选择本轮最有因果关联的视角与行动，保留其他线索。','每个人对同一事件有不同需求和所知。','让一条线的结果改变另一条线的条件，形成共同进程。',['jj-tags','kakuyomu-explore']),
 tag('plot.offstage','场外暗线',['旁线推进'],'未在眼前的人和事务依自己的条件继续发展。','已有时间推进、任务期限或信息传递触发变化。','依据既有目标、资源和所知安排能在该时段发生的行动。','读者或主角暂时所见，与世界正在发生的事保持层次。','在合理的消息抵达或人物相遇时，让暗线影响主场景。',['kakuyomu-explore','dengekitaisho-editor']),
 tag('plot.ordinary-heroism','小人物高光',['平凡人的高光'],'普通人的判断、手艺或勇气在具体时刻显出分量。','惯常的大人物或强力办法无法处理眼前细节。','让角色用自己的经验完成一件重要的事。','平日不起眼的习惯或能力成为此刻的关键。','让成果得到具体回应，并改变其位置或自我认识。',['kadokawa-character','douban-writing']),
 tag('plot.earned-surprise','惊喜转折',['有因转折','反套路'],'改变预期的结果仍能从既有事实和人物选择中找到来由。','局面看似只有一条去路，但仍有未被注意的条件。','让一个准备过的细节或独立动机改变进程。','第一次阅读的意外与回望时的合理相互支撑。','转折打开新的选择，并让旧问题以变化后的形式继续。',['dengekitaisho-editor']),
 tag('plot.political-game','权谋博弈',['权谋','利益博弈'],'多方围绕资源、名分和权力进行有层次的协商与较量。','任何一方都无法独自满足目标，需要结盟或交换。','明确筹码、信息差、兑现能力和每次让步的代价。','公开理由与实际利益各有作用，也会相互制约。','让一轮博弈改变联盟、规则解释或可行行动。',['jj-tags','qidian-categories']),
 tag('plot.agreement','契约关系',['恋爱合约','约定关系'],'明确约定让人物进入共同生活或行动，并逐渐碰到新需要。','双方为各自目的接受一套共同条件。','让约定在具体事务中被执行、试探、补充或重新协商。','最初的利益安排与后来形成的情感出现差别。','用新选择改变约定的意义和双方的关系。',['jj-tags']),
 tag('plot.unequal-pursuit','单向追逐',['单恋','单向倾慕'],'投入并不对等，使期待、观察和回应具有独特的分量。','一方已经在意，另一方尚未给出相同回应。','让追逐者保有自己的生活与选择，回应者有明确的个人意图。','热切期待与现实反馈之间产生误差。','让新认识促成靠近、转向、等待或放下中的一次变化。',['jj-tags','kadokawa-character']),
 tag('plot.parting','遗憾与告别',['错过','离别余韵'],'未能兑现的愿望与实际告别留下持续的意义。','时机、选择或现实条件使某种可能无法继续。','完成该说的话、该做的事，或具体呈现未能完成之处。','失去与仍然保有的东西相互映照。','让遗憾进入后续选择、关系或记忆，而故事继续向前。',['kadokawa-character','douban-writing']),
]);

const byId=new Map(TAG_CATALOG.map(item=>[item.id,item]));
export function getTagTemplate(id){const item=byId.get(id);return item?clone(item):null;}
export function listTagTemplates({query='',type}={}){
 check(typeof query==='string','Search text must be a string');
 check(type===undefined||Object.hasOwn(typeLabels,type),'Unknown tag type');
 const words=norm(query).split(/\s+/).filter(Boolean);
 return TAG_CATALOG.filter(item=>(!type||item.type===type)&&words.every(word=>norm([item.label,...item.aliases,item.description].join(' ')).includes(word))).map(clone);
}
export function prepareTagSelection({tagId,polarity,weight,targetId}={}){
 const item=byId.get(tagId);check(item,'Unknown catalog tag');
 check(['encourage','avoid'].includes(polarity),'Choose encouragement or aversion explicitly');
 check(Number.isSafeInteger(weight)&&weight>0,'Weight must be an explicit positive integer magnitude');
 check(targetId===undefined||typeof targetId==='string'&&targetId.trim(),'Invalid target ID');
 check(item.type!=='character'||typeof targetId==='string'&&targetId.trim(),'Character tags require a target object ID');
 const u=item.usage,description=polarity==='encourage'?`${item.description}\n触发：${u.trigger}\n表现：${u.expression}\n反差：${u.contrast}\n推进：${u.progression}`:`减少“${item.label}”的叙事比重。重点避开这类表现：${u.expression}`;
 return {catalogId:item.id,label:item.label,type:item.type,description,polarity,weight,...(targetId!==undefined?{targetId}:{} )};
}
