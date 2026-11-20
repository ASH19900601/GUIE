// Shared interactive story data & atmospheric illustrated SVG stage renderer for GUIE UI design demos

window.GUIE_DEMO_DATA = {
  project: {
    title: '樱庭微风 · 夏日物语',
    subtitle: '长篇校园群像视觉小说',
    resolution: '1920 × 1080',
    updatedAt: '刚刚保存',
    chapters: [
      {
        id: 'ch0',
        code: '序',
        title: '序章',
        scenes: [
          { id: 'sc1', title: '黄昏教室的邀请', beats: 8, active: true, tag: '开场' },
        ],
      },
      {
        id: 'ch1',
        code: '壱',
        title: '第一章 · 放学后的微风',
        scenes: [
          { id: 'sc2', title: '中庭紫阳花圃', beats: 6, active: false },
          { id: 'sc3', title: '秘密天台观星', beats: 9, active: false },
          { id: 'sc4', title: '校门口路线汇合', beats: 5, active: false, tag: '汇合' },
        ],
      },
      {
        id: 'ch2',
        code: '弐',
        title: '第二章 · 蝉鸣与约定',
        scenes: [
          { id: 'sc5', title: '旧图书馆的借书卡', beats: 7, active: false },
          { id: 'sc6', title: '烟火大会前夜', beats: 11, active: false, muted: true, tag: '草稿' },
        ],
      },
    ],
    recentProjects: [
      {
        title: '樱庭微风 · 夏日物语',
        genre: '校园群像 · 多分支',
        scenes: 6,
        characters: 4,
        words: '18,420 字',
        edited: '12 分钟前',
        palette: ['#D87C58', '#3F2E3E', '#F4C08A'],
        accentBg: 'linear-gradient(135deg, #432C3F 0%, #9E524E 52%, #EAB47D 100%)',
      },
      {
        title: '雾港列车 1998',
        genre: '悬疑推理 · 线索收集',
        scenes: 14,
        characters: 7,
        words: '42,900 字',
        edited: '昨天 22:14',
        palette: ['#324A5F', '#1B2A41', '#9DB4C0'],
        accentBg: 'linear-gradient(135deg, #16222E 0%, #2E4B5E 58%, #8BA6B5 100%)',
      },
      {
        title: '星尘咖啡馆的最后一班夜车',
        genre: '治愈短篇 · 单线',
        scenes: 4,
        characters: 3,
        words: '7,650 字',
        edited: '3 天前',
        palette: ['#2F3E36', '#566E5E', '#D8C7A8'],
        accentBg: 'linear-gradient(135deg, #1F2D27 0%, #435D50 55%, #C9B798 100%)',
      },
    ],
  },

  characters: {
    linxia: {
      id: 'linxia',
      name: '林夏',
      role: '天文社副社长',
      color: '#C96442',
      darkColor: '#E59676',
      hair: '#3A2622',
      outfit: '#B85443',
      ribbon: '#F4DFC8',
    },
    shenqiu: {
      id: 'shenqiu',
      name: '沈秋',
      role: '旧书管理员',
      color: '#3A668C',
      darkColor: '#7CB2DE',
      hair: '#1E2A38',
      outfit: '#2F5652',
      ribbon: '#DCE9E5',
    },
  },

  initialVars: {
    affection: 2,
    rooftopKey: true,
    club: '天文社',
  },

  beats: [
    {
      id: 1,
      type: 'background',
      typeLabel: '场景',
      bg: 'classroom_dusk',
      bgName: '黄昏教室 · 橘色晚霞',
      transition: '柔和淡入 0.8s',
      bgm: null,
      sprites: [],
      speaker: null,
      text: '切换背景至「黄昏教室」，窗外夕阳斜照进三排木质课桌。',
      note: '开场定调 · 黄金时刻暖色光',
    },
    {
      id: 2,
      type: 'audio',
      typeLabel: '音乐',
      bg: 'classroom_dusk',
      bgName: '黄昏教室 · 橘色晚霞',
      bgm: '黄昏微风 (钢琴独奏 · 淡入 1.5s)',
      sprites: [],
      speaker: null,
      text: '播放背景音乐「黄昏微风」，音量 68%，柔和循环。',
      note: 'BGM · 01:42 循环',
    },
    {
      id: 3,
      type: 'narration',
      typeLabel: '旁白',
      bg: 'classroom_dusk',
      bgName: '黄昏教室 · 橘色晚霞',
      bgm: '黄昏微风',
      sprites: [],
      speaker: null,
      text: '放学铃声散尽，橘红色的晚霞穿过教室窗帘，安静地洒在木质课桌上。远处操场只剩下风吹过树梢的沙沙声。',
      note: '旁白独白',
    },
    {
      id: 4,
      type: 'sprite',
      typeLabel: '登场',
      bg: 'classroom_dusk',
      bgName: '黄昏教室 · 橘色晚霞',
      bgm: '黄昏微风',
      sprites: [
        { id: 'linxia', pos: 'left', mood: '微笑', label: '林夏 · 夏装校服' },
        { id: 'shenqiu', pos: 'right', mood: '平静', label: '沈秋 · 针织背心' },
      ],
      speaker: null,
      text: '林夏（左侧 · 微笑）与沈秋（右侧 · 平静）依次缓步走进教室。',
      note: '双人同屏 · 缓动入场',
    },
    {
      id: 5,
      type: 'dialogue',
      typeLabel: '对白',
      bg: 'classroom_dusk',
      bgName: '黄昏教室 · 橘色晚霞',
      bgm: '黄昏微风',
      sprites: [
        { id: 'linxia', pos: 'left', mood: '微笑', active: true },
        { id: 'shenqiu', pos: 'right', mood: '平静', active: false },
      ],
      speaker: 'linxia',
      mood: '微笑',
      voice: 'vo_01_linxia.wav',
      text: '今天的天空特别清澈呀！趁着天还没完全暗下来，要不要一起去看看晚霞？',
      note: '已绑定配音 · 03.4s',
    },
    {
      id: 6,
      type: 'dialogue',
      typeLabel: '对白',
      bg: 'classroom_dusk',
      bgName: '黄昏教室 · 橘色晚霞',
      bgm: '黄昏微风',
      sprites: [
        { id: 'linxia', pos: 'left', mood: '微笑', active: false },
        { id: 'shenqiu', pos: 'right', mood: '温柔', active: true },
      ],
      speaker: 'shenqiu',
      mood: '温柔',
      voice: 'vo_02_shenqiu.wav',
      text: '如果晚风没起云的话，天台今晚能看见夏季大三角。钥匙我还带在身上。',
      note: '镜头微推 · 1.04×',
    },
    {
      id: 7,
      type: 'state',
      typeLabel: '状态',
      bg: 'classroom_dusk',
      bgName: '黄昏教室 · 橘色晚霞',
      bgm: '黄昏微风',
      sprites: [
        { id: 'linxia', pos: 'left', mood: '期待', active: true },
        { id: 'shenqiu', pos: 'right', mood: '温柔', active: false },
      ],
      speaker: null,
      stateChange: '林夏好感度 +1',
      text: '记录剧情状态：林夏好感度增加 1 点（影响后续中庭隐藏对话）。',
      note: '跨周目持久状态',
    },
    {
      id: 8,
      type: 'choice',
      typeLabel: '分支',
      bg: 'classroom_dusk',
      bgName: '黄昏教室 · 橘色晚霞',
      bgm: '黄昏微风',
      sprites: [
        { id: 'linxia', pos: 'left', mood: '期待', active: true },
        { id: 'shenqiu', pos: 'right', mood: '温柔', active: true },
      ],
      speaker: null,
      prompt: '夕阳正好，你要接受谁的邀请？',
      choices: [
        {
          id: 'c1',
          label: '和林夏去中庭紫阳花圃',
          target: '中庭紫阳花圃',
          previewBg: 'courtyard_hydrangea',
          condition: null,
          replySpeaker: 'linxia',
          replyText: '太好了！那我们走楼梯口那条近路，花圃那边风铃刚换过呢。',
        },
        {
          id: 'c2',
          label: '和沈秋去秘密天台观星',
          target: '秘密天台观星',
          previewBg: 'rooftop_stars',
          condition: { key: 'rooftopKey', op: '==', value: true, desc: '需要「天台钥匙」已开启' },
          replySpeaker: 'shenqiu',
          replyText: '嗯，跟紧一点，顶楼铁门有点紧。今晚的织女星应该会很亮。',
        },
        {
          id: 'c3',
          label: '拉住林夏聊起去年的天文合宿（隐藏）',
          target: '中庭紫阳花圃 · 特别篇',
          previewBg: 'courtyard_hydrangea',
          condition: { key: 'affection', op: '>=', value: 3, desc: '需要「林夏好感度」≥ 3' },
          replySpeaker: 'linxia',
          replyText: '诶……你居然还记得那次合宿的星图吗？其实我一直把那张便签夹在书里。',
        },
      ],
      text: '玩家选择分支 · 3 个选项（含好感度与道具条件判断）',
      note: '选择前自动存档已启用',
    },
  ],
};

// Render refined atmospheric SVG stage (16:9) without crude cartoon shapes
window.renderGuieStageSVG = function renderGuieStageSVG(beat, vars, chosenOption) {
  const bgKey = (chosenOption && chosenOption.previewBg) || beat.bg || 'classroom_dusk';
  const uid = 'st_' + Math.random().toString(36).slice(2, 7);

  let bgSvg = '';
  if (bgKey === 'classroom_dusk') {
    bgSvg = `
      <defs>
        <linearGradient id="${uid}_sky" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stop-color="#2D253B"/>
          <stop offset="38%" stop-color="#764350"/>
          <stop offset="72%" stop-color="#D47A56"/>
          <stop offset="100%" stop-color="#F2BF82"/>
        </linearGradient>
        <linearGradient id="${uid}_beam" x1="0" y1="0" x2="1" y2="0.6">
          <stop offset="0%" stop-color="#FFE0AE" stop-opacity="0.34"/>
          <stop offset="100%" stop-color="#FFE0AE" stop-opacity="0"/>
        </linearGradient>
        <radialGradient id="${uid}_sun" cx="0.68" cy="0.54" r="0.32">
          <stop offset="0%" stop-color="#FFF0C8" stop-opacity="0.92"/>
          <stop offset="45%" stop-color="#F4A86B" stop-opacity="0.35"/>
          <stop offset="100%" stop-color="#F4A86B" stop-opacity="0"/>
        </radialGradient>
      </defs>
      <rect width="640" height="360" fill="url(#${uid}_sky)"/>
      <rect width="640" height="360" fill="url(#${uid}_sun)"/>
      <!-- Distant city / mountain silhouette -->
      <path d="M0 245 Q95 215 190 232 T395 224 T640 238 L640 360 L0 360 Z" fill="#3B2532" opacity="0.62"/>
      <path d="M0 268 Q140 248 280 262 T640 256 L640 360 L0 360 Z" fill="#291B24" opacity="0.78"/>
      <!-- Classroom window mullions -->
      <g stroke="#241921" stroke-opacity="0.55" stroke-width="5">
        <line x1="128" y1="0" x2="128" y2="275"/>
        <line x1="312" y1="0" x2="312" y2="275"/>
        <line x1="496" y1="0" x2="496" y2="275"/>
        <line x1="0" y1="186" x2="640" y2="186" stroke-width="3"/>
      </g>
      <rect x="0" y="272" width="640" height="88" fill="#1E161B"/>
      <!-- Warm diagonal light beams -->
      <polygon points="130,0 310,0 500,360 250,360" fill="url(#${uid}_beam)"/>
      <polygon points="315,0 492,0 640,280 490,360" fill="url(#${uid}_beam)" opacity="0.7"/>
      <!-- Curtain softly blowing on left -->
      <path d="M0,0 L76,0 Q52,130 92,272 L0,272 Z" fill="#FBE7CA" opacity="0.16"/>
      <!-- Floating warm dust motes -->
      <g fill="#FFF2D6" opacity="0.55">
        <circle cx="220" cy="112" r="1.4"/><circle cx="285" cy="84" r="1"/>
        <circle cx="370" cy="138" r="1.6"/><circle cx="448" cy="96" r="1.1"/>
        <circle cx="192" cy="166" r="1"/><circle cx="515" cy="142" r="1.3"/>
      </g>
    `;
  } else if (bgKey === 'courtyard_hydrangea') {
    bgSvg = `
      <defs>
        <linearGradient id="${uid}_sky" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stop-color="#1E3046"/>
          <stop offset="55%" stop-color="#3F6B7A"/>
          <stop offset="100%" stop-color="#9AC1B8"/>
        </linearGradient>
      </defs>
      <rect width="640" height="360" fill="url(#${uid}_sky)"/>
      <g opacity="0.22" fill="#E8F8F5">
        <circle cx="130" cy="90" r="34"/><circle cx="480" cy="70" r="46"/><circle cx="550" cy="130" r="24"/>
      </g>
      <path d="M0 240 Q160 210 340 232 T640 220 L640 360 L0 360 Z" fill="#1B3238"/>
      <!-- Hydrangea bush silhouettes -->
      <g fill="#4A7499" opacity="0.55">
        <circle cx="85" cy="252" r="32"/><circle cx="122" cy="264" r="26"/><circle cx="535" cy="248" r="36"/><circle cx="585" cy="265" r="28"/>
      </g>
      <g fill="#7EA6C9" opacity="0.45">
        <circle cx="96" cy="246" r="16"/><circle cx="545" cy="242" r="18"/>
      </g>
      <rect y="278" width="640" height="82" fill="#132227"/>
    `;
  } else {
    bgSvg = `
      <defs>
        <linearGradient id="${uid}_sky" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stop-color="#0C1324"/>
          <stop offset="58%" stop-color="#1A2948"/>
          <stop offset="100%" stop-color="#354A6E"/>
        </linearGradient>
      </defs>
      <rect width="640" height="360" fill="url(#${uid}_sky)"/>
      <circle cx="512" cy="76" r="28" fill="#F4EFD8" opacity="0.14"/>
      <circle cx="512" cy="76" r="13" fill="#FAF6E6" opacity="0.88"/>
      <!-- Starfield -->
      <g fill="#FFFDF5">
        <circle cx="72" cy="54" r="1.4" opacity="0.9"/><circle cx="144" cy="36" r="1" opacity="0.7"/>
        <circle cx="212" cy="88" r="1.6" opacity="0.95"/><circle cx="268" cy="48" r="1.1" opacity="0.75"/>
        <circle cx="338" cy="72" r="1.8" opacity="0.9"/><circle cx="395" cy="38" r="1" opacity="0.65"/>
        <circle cx="445" cy="108" r="1.3" opacity="0.8"/><circle cx="576" cy="112" r="1.5" opacity="0.85"/>
        <circle cx="118" cy="128" r="1" opacity="0.6"/><circle cx="294" cy="134" r="1.2" opacity="0.7"/>
      </g>
      <!-- Summer triangle subtle constellation lines -->
      <path d="M212,88 L338,72 L294,134 Z" fill="none" stroke="#DCE8FF" stroke-opacity="0.22" stroke-width="0.9" stroke-dasharray="3 3"/>
      <!-- Rooftop safety fence -->
      <g stroke="#111A2B" stroke-width="2" opacity="0.75">
        <line x1="0" y1="210" x2="640" y2="210" stroke-width="3"/>
        <line x1="0" y1="246" x2="640" y2="246"/>
        <line x1="80" y1="210" x2="80" y2="290"/><line x1="200" y1="210" x2="200" y2="290"/>
        <line x1="320" y1="210" x2="320" y2="290"/><line x1="440" y1="210" x2="440" y2="290"/>
        <line x1="560" y1="210" x2="560" y2="290"/>
      </g>
      <rect y="274" width="640" height="86" fill="#0B111E"/>
    `;
  }

  // Stylized editorial anime-inspired character bust silhouettes (clean, graceful, warm rim light)
  function renderSprite(sp) {
    const isLeft = sp.pos === 'left';
    const x = isLeft ? 185 : 455;
    const dim = sp.active === false ? 0.72 : 1;
    const scale = sp.active ? 1.03 : 0.98;
    if (sp.id === 'linxia') {
      return `
        <g transform="translate(${x}, 244) scale(${scale})" opacity="${dim}">
          <!-- Back hair flowing -->
          <path d="M-38,-148 C-56,-122 -58,-68 -48,-16 L46,-16 C56,-68 52,-124 34,-148 Z" fill="#3B2420"/>
          <!-- Shoulders & sailor/cardigan outfit -->
          <path d="M-64,4 C-56,-42 -34,-64 -16,-68 L16,-68 C34,-64 56,-42 64,4 Z" fill="#C6664B"/>
          <path d="M-24,-66 L0,-34 L24,-66 Z" fill="#F9EFE4"/>
          <path d="M-7,-44 L7,-44 L3,-24 L-3,-24 Z" fill="#8C3626"/>
          <!-- Neck & face -->
          <rect x="-9" y="-82" width="18" height="22" rx="6" fill="#F7DFCE"/>
          <ellipse cx="0" cy="-114" rx="28" ry="33" fill="#FCE6D7"/>
          <!-- Soft warm blush -->
          <ellipse cx="-14" cy="-106" rx="5" ry="2.6" fill="#E89A84" opacity="0.48"/>
          <ellipse cx="14" cy="-106" rx="5" ry="2.6" fill="#E89A84" opacity="0.48"/>
          <!-- Eyes & gentle smile -->
          <ellipse cx="-11" cy="-114" rx="3.4" ry="4.4" fill="#33201C"/>
          <ellipse cx="11" cy="-114" rx="3.4" ry="4.4" fill="#33201C"/>
          <circle cx="-10" cy="-115.5" r="1.1" fill="#FFF"/>
          <circle cx="12" cy="-115.5" r="1.1" fill="#FFF"/>
          <path d="M-5,-99 Q0,-94 5,-99" fill="none" stroke="#9D5849" stroke-width="1.8" stroke-linecap="round"/>
          <!-- Bangs & warm sunset rim -->
          <path d="M-32,-120 C-30,-152 28,-154 32,-120 C22,-130 12,-122 2,-132 C-8,-122 -20,-128 -32,-120 Z" fill="#432A25"/>
          <path d="M-28,-132 Q-6,-150 24,-136" fill="none" stroke="#F4BC86" stroke-opacity="0.42" stroke-width="1.6"/>
        </g>
      `;
    }
    return `
      <g transform="translate(${x}, 244) scale(${scale})" opacity="${dim}">
        <!-- Neat mid-length dark navy hair -->
        <path d="M-34,-152 C-48,-128 -44,-76 -38,-38 L38,-38 C44,-76 48,-128 34,-152 Z" fill="#1E2B3B"/>
        <!-- Knit vest & white shirt -->
        <path d="M-62,4 C-54,-44 -34,-65 -16,-69 L16,-69 C34,-65 54,-44 62,4 Z" fill="#2F524F"/>
        <path d="M-18,-68 L0,-42 L18,-68 Z" fill="#F2F4F2"/>
        <path d="M-3,-46 L3,-46 L4,-18 L-4,-18 Z" fill="#1D3338"/>
        <!-- Neck & face -->
        <rect x="-8" y="-82" width="16" height="20" rx="5" fill="#F5E1D4"/>
        <ellipse cx="0" cy="-116" rx="26" ry="32" fill="#F9E7DB"/>
        <!-- Calm eyes & composed smile -->
        <path d="M-15,-115 Q-10,-118 -6,-115" fill="none" stroke="#1E2833" stroke-width="2.2" stroke-linecap="round"/>
        <path d="M6,-115 Q10,-118 15,-115" fill="none" stroke="#1E2833" stroke-width="2.2" stroke-linecap="round"/>
        <circle cx="-10.5" cy="-113" r="2.6" fill="#25364A"/>
        <circle cx="10.5" cy="-113" r="2.6" fill="#25364A"/>
        <path d="M-4,-99 Q0,-96.5 4,-99" fill="none" stroke="#8C635A" stroke-width="1.5" stroke-linecap="round"/>
        <!-- Side-parted bangs -->
        <path d="M-30,-122 C-28,-154 28,-154 30,-122 C18,-134 4,-128 -6,-136 C-16,-126 -24,-128 -30,-122 Z" fill="#233245"/>
        <path d="M-24,-136 Q6,-152 26,-134" fill="none" stroke="#D9E6F2" stroke-opacity="0.32" stroke-width="1.4"/>
      </g>
    `;
  }

  const spritesHtml = (beat.sprites || []).map(renderSprite).join('');

  // Subtle vignette overlay
  return `
    <svg viewBox="0 0 640 360" xmlns="http://www.w3.org/2000/svg" style="width:100%;height:100%;display:block;">
      ${bgSvg}
      ${spritesHtml}
      <rect width="640" height="360" fill="none" stroke="rgba(255,255,255,0.08)" stroke-width="2"/>
    </svg>
  `;
};

window.evaluateDemoChoice = function evaluateDemoChoice(choice, vars) {
  if (!choice.condition) return true;
  const v = vars[choice.condition.key];
  if (choice.condition.op === '==') return v === choice.condition.value;
  if (choice.condition.op === '>=') return Number(v) >= Number(choice.condition.value);
  return true;
};
