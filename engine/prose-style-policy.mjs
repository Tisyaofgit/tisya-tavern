import stock from '../presets/Tisya-Matrix.json' with {type:'json'};
import {digest} from './common.mjs';

// W15: only exact, whole known stock prompts are projected for this request.
// The bounded digests cover the imported predecessor and returned packet, plus
// the three previously supported stock variants. Any authored byte change stays
// untouched. compilePrompts excludes explicit config.prompts before this call.
export const PROSE_STYLE_REVISIONS=Object.freeze([
  {
    "identifier": "tisya_new_chat",
    "legacyDigests": [
      "65efef703e60930e5338e00591a9451f4067bc243e3d6d04d90b85df965242d9",
      "997551a0674697d8fd752593c6f9923e9858d4e54bd435764e541815c4d57186"
    ]
  },
  {
    "identifier": "tisya_layer_authority",
    "legacyDigests": [
      "1acf0c9be266fbe9618324a0bca81706a4b45d6d79386de4995e009e04fb38a7",
      "d58df37b638ebf228ab72eb4edfb3cd5bdf159d0d75456123d24911789305492"
    ]
  },
  {
    "identifier": "main",
    "legacyDigests": [
      "66621f364c176c6a82596a05a4ae5ffc045c46889eb7bc805a39698a9f261348",
      "0940d353d757a000f84bf560d6a9bcb927f3db4e60f8a07d64ce2c9cece39893",
      "0f344ceb6d3d2ea69b67561604d090a87bda415f663d2867f7283a5424eae273",
      "61725e450b6398e936608f1488e6ccf218c80593730a9a14e95c52930da42829"
    ]
  },
  {
    "identifier": "nsfw",
    "legacyDigests": [
      "431dd60fcaf56a94152b04d5a4eba8cf7563f6e00359d07050a5e139129bc703",
      "117f13c1ef1048e5010688d38808e128da00290d10db7ec9ffe114d7f67419dd"
    ]
  },
  {
    "identifier": "tisya_identity_attestation",
    "legacyDigests": [
      "1798de553bfa0ce46e120cb004f999c2077388dab9449adfca019eeb5053228e",
      "6d41224bfca79903cec85b250b52cc25382f3978945689f2323609d2fad2080e"
    ]
  },
  {
    "identifier": "tisya_user_relation",
    "legacyDigests": [
      "34e5b60628817907986503dec2bf6363d7f64f581cf17ba656a336764a61f162",
      "95bfba4a0793226cb6dfb5a1f6390315a1ab4ce66bef13d3d2cb503e1961807c"
    ]
  },
  {
    "identifier": "tisya_scene_anchor",
    "legacyDigests": [
      "6ca3a27a14eb06e0929151b0cc7e185225529637e93df136e3f1b02e31d1b513",
      "e49924cd31c7a3f75cda37669d4297070aba6d7744fd8b4f51106a953c922210"
    ]
  },
  {
    "identifier": "tisya_task_start",
    "legacyDigests": [
      "557149191b467d9a39690de1f101246ad68bbdeef7141c619980e474537dc05c",
      "bee530323aa71621cb5d2b15e2f803065e094637d0c3a431408721378fb2b93e",
      "8163170d302b2e1654b08ce0c6de2631bb9be35870e46fd6a205183cc4cbcfa5",
      "e6583c71b2fd6499d3adbd0669ed127ea5fbae9f595d910b5221ce48dad6bddc"
    ]
  },
  {
    "identifier": "tisya_pref_narrative",
    "legacyDigests": [
      "30e77834411fa11ca6b475d53f66e8a16c9084413be354bd087d359af95d84bd",
      "fafdfc72fba7ed2979c2bc4f3d9e0de9cb7c7f035da36115539aac0f12554c4c",
      "f7fc997c08534b020f8e12d047d52a86a15e074f89b4e1ff665d5c6146cf4a46",
      "3c392365b90a355773f23d42863e3966adfad3dd98068a96fa816995853b1033"
    ]
  },
  {
    "identifier": "tisya_pref_style",
    "legacyDigests": [
      "9ecac866a17857c2e0c8cd6da3bb6aa24d6c02b6cc642f0050d448201af86fbc",
      "8b8117a6b5f4ee5b82d49c2373808c5297386e3597704d0639f67b7f07df800a",
      "a8a9bf067c82a157fe66692ea8794fecda764fe5d56463ba4211b284c0343e89",
      "8af853ec4f41d84d1fa4ca23ac34f6de7ddbc204c0451a64cbd59791c8c7286b"
    ]
  },
  {
    "identifier": "tisya_material_style_card",
    "legacyDigests": [
      "d802befd25a1faf8a4e0cd1731d655f3b6789e7e97cc3876da3f5d94aa2f85fa",
      "5b756426a80d3802903d847c97780363fdd3f07a879a02145eb09ab5d9befd75",
      "e6c3dff43b1468c29312d69bdd290eb187f7ec9d74db3cc006b1e30b781bd44a"
    ]
  },
  {
    "identifier": "tisya_pref_lexical_ban",
    "legacyDigests": [
      "22dea0a604a31e558b79c51c48d9eba98c22af50b3acb5854c12482d80191017",
      "81c5c692103c5366a304d35e85c3ff7043e19d38e0d2b0dc64c0745b790a27a2",
      "7360222c024bbb8758fd8a9e6080952d09b7b8e39a7f5b6daa6652a071c57810"
    ]
  },
  {
    "identifier": "tisya_pref_plot",
    "legacyDigests": [
      "40385e715bae1922e9be1502f62d5cedbc4f9aed3daa96323304f6ee1ebb9e62",
      "216d611958673d0b54a2848c9c2675a191297ff225d11678cae312f8cbdf4c6f",
      "0a4eb4fe13931b6b0bc398bc8f1faabb3c9572d5f41872a2dd1234613d1fa63e",
      "7e6983f0a5146eb56398ef8193f317a85aab96d4b7d36239988e163e2c5f86c1"
    ]
  },
  {
    "identifier": "tisya_pref_portrayal",
    "legacyDigests": [
      "cae13ab79af7faac19ac809276c55e11d15b1a68d3189ade22793731c9db32f6",
      "fed9a2327d353041baeddb1af4744131e2de83d8b9a7c819cfe04544db51ce46"
    ]
  },
  {
    "identifier": "tisya_kb_techniques",
    "legacyDigests": [
      "a7a38bc98548aeef02f1fe15c64636e406380b1eeaede977ab7a9ea66d0053d5",
      "9f1f9ddbeaaae38993c217ac25050fee4d2b7bae81b32f6c18059f8562762370",
      "a32012b7ef5f970d52f432f63a8664e303497c883142daa8fadc7d37cbebe8ee",
      "2d5bf8fcf443af337bff962630ee867149065206773fd8fed2f9625af44bf572"
    ]
  },
  {
    "identifier": "tisya_material_boundary_open",
    "legacyDigests": [
      "61cf2d1d70a1b18bf80c3dc1a48c52ace9bda6e268dab15d8901cb1d38ed246b",
      "da623d26e8b6d8a5e2da3b106dd96bdaccb13b0aa4dfdc68f3d688400bbb27b5"
    ]
  },
  {
    "identifier": "tisya_material_boundary_close",
    "legacyDigests": [
      "a28ce7c2772c55d9aec0ef484493c868bdf2bb6a4e49c574131b4b95d5f27a95",
      "6cdbfd7c9881b8f44be70d23dd63001252f4026741b03c097ac5bde1f424a5ca"
    ]
  },
  {
    "identifier": "tisya_history_open",
    "legacyDigests": [
      "0c3a9b76d505f261590f3171e7bfeb64f9b87cf807d4f6140beae9509382f596",
      "f0ed1223ecd98c247a05fb072c2aa6741c5522e1a5095093d640ceda63aa5546"
    ]
  },
  {
    "identifier": "tisya_calibrate",
    "legacyDigests": [
      "5b143c9e4df82e511416cf5c9eb128cef2d77ba74407b0f4093f72fbb1dac3b7",
      "a0a688e2537c63c64c2c6beef98ea9503331f61b04428dd7553be33511ba3cad"
    ]
  },
  {
    "identifier": "tisya_session_reset",
    "legacyDigests": [
      "67c4d30aa9bfa6b451c184698479278724bac00bbc4e4678d2443f4f9d2ae8d2",
      "9152d2c9e5f22766c1c87ea7a162823ea712e403e68d6908e47826e95b2bb4d1",
      "f6bc2820a3511eaea74ea6e50dfbb801b37936cc0b08966f37bf25699a3e0029"
    ]
  },
  {
    "identifier": "tisya_creative_guide",
    "legacyDigests": [
      "613e2d81678ad7d0bd2b646667cbf7f210988b91011f55b524ec4595405dfcbe",
      "ce8e91e3b581a399957f5188ffb681b8c32b34da3ef1aa39d9831c61c94a197e"
    ]
  },
  {
    "identifier": "tisya_registry",
    "legacyDigests": [
      "0f91d74b12eddf7044b521b786a463c4d7aa3629bd9675c91b39fb3add24d086",
      "49861ed94656c3187dfd40a46c3a2bedee38712f084c66d7bf66548deba7b401",
      "a4c0d2dd1223542ed1d7f89b8a4ad16cd832860ccf4e24e8c358b1ab4d7127cb",
      "92bd8b3b7c758feaefe56ef347dadc5a8845f94c9fc5d304f6828eff87341e3d"
    ]
  },
  {
    "identifier": "tisya_flow_gate",
    "legacyDigests": [
      "ca9b616620368c9acdfcb1f19b23c76f6836169bc0e5760a3b199f956735ef6d",
      "e05841ca48992e8fba9c6fc1c3eca1b066b0a6c57e31b44203d74fafdcff37c5"
    ]
  },
  {
    "identifier": "tisya_think_commit",
    "legacyDigests": [
      "64a550997a486151b05b1e1ffd026cded269d2507b49e9caa6e142eddb8c3de5",
      "41c71d0e01d2078d209a3ed1aa88fc802f88eacc112040b0b087e6c092c1bc5d"
    ]
  },
  {
    "identifier": "tisya_prepare_trigger",
    "legacyDigests": [
      "e145a467ce3a6f66066a7df1f29fcb8debce05ebde8a8b67410c0030cd81c541",
      "ce28c6423e091544aacde789d3765afa7ecc40c3d064a513b1cca2b37d6694ef"
    ]
  }
].map(row=>Object.freeze({...row,legacyDigests:Object.freeze(row.legacyDigests)})));
const current=new Map(stock.prompts.map(row=>[row.identifier,row.content]));
const known=new Map(PROSE_STYLE_REVISIONS.map(row=>[row.identifier,new Set(row.legacyDigests)]));

export function resolveProseStyleText(identifier,text){
 if(typeof text!=='string'||!known.get(identifier)?.has(digest(text)))return text;
 return current.get(identifier)??text;
}
