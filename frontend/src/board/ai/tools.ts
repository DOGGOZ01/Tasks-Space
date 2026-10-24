import type { ToolDefinition } from './types'

export const BLOCK_TYPES = [
  'NoteBlock',
  'ImageBlock',
  'CustomHtmlBlock',
  'DailyTaskListBlock',
  'WeeklyTaskListBlock',
  'OverdueTaskListBlock',
] as const

export type BlockTypeName = (typeof BLOCK_TYPES)[number]

export const BLOCK_PROP_KEYS: Record<BlockTypeName, string[]> = {
  NoteBlock: ['text'],
  ImageBlock: ['imageUrl', 'imageFit', 'imageZoom', 'imageFocusX', 'imageFocusY', 'filter'],
  CustomHtmlBlock: ['html'],
  DailyTaskListBlock: [],
  WeeklyTaskListBlock: [],
  OverdueTaskListBlock: [],
}

export const HEADER_STYLE_BLOCK_TYPES = new Set<BlockTypeName>([
  'NoteBlock',
  'DailyTaskListBlock',
  'WeeklyTaskListBlock',
  'OverdueTaskListBlock',
])

export const INPUT_STYLE_BLOCK_TYPES = new Set<BlockTypeName>(['DailyTaskListBlock', 'WeeklyTaskListBlock'])

const basicBlockStyleSchema = {
  type: 'object',
  description: 'Visual style overrides: hex colors, pixel sizes, raw CSS.',
  properties: {
    background: { type: 'string', description: 'Hex color, e.g. #ff5a1f' },
    textColor: { type: 'string', description: 'Hex color' },
    borderColor: { type: 'string', description: 'Hex color' },
    borderWidth: { type: 'number', description: 'Pixels, 0-12' },
    borderRadius: { type: 'number', description: 'Pixels, 0-60' },
    opacity: { type: 'number', description: '0.1-1' },
    customCss: { type: 'string', description: "Raw CSS declarations, e.g. \"box-shadow: 2px 2px 0 #000;\"" },
  },
}

function buildBlockStyleSchema(allowCustomScripts: boolean) {
  return {
    type: 'object',
    description:
      'Visual style overrides: hex colors, pixel sizes, raw CSS. customCss/animationCss/overlayHtml are the ' +
      "SAME manual/advanced fields as the block's own 'Custom code (manual)' button (CSS / Animation / JS " +
      'overlay tabs), not separate from what the user sees there.',
    properties: {
      background: { type: 'string', description: 'Hex color, e.g. #ff5a1f' },
      textColor: { type: 'string', description: 'Hex color' },
      borderColor: { type: 'string', description: 'Hex color' },
      borderWidth: { type: 'number', description: 'Pixels, 0-12' },
      borderRadius: { type: 'number', description: 'Pixels, 0-60' },
      opacity: { type: 'number', description: '0.1-1' },
      customCss: {
        type: 'string',
        description:
          'Raw CSS declarations applied inline to this part, e.g. "box-shadow: 2px 2px 0 #000;". No ' +
          'selectors, no :hover, no @keyframes (use animationCss for those).',
      },
      animationCss: {
        type: 'string',
        description:
          'Raw CSS rules for hover/active/focus states and @keyframes animations on this part. Use a ' +
          "literal '&' to mean this element, e.g. \"&:hover { transform: scale(1.05); }\\n@keyframes pulse " +
          '{ 0% { opacity: .6; } 100% { opacity: 1; } }\\n& { animation: pulse 1.2s infinite; }". Only ' +
          "'&', '&:hover', '&:active', '&:focus', '&:focus-within' selectors are allowed; anything else is " +
          'dropped.',
      },
      ...(allowCustomScripts
        ? {
            overlayHtml: {
              type: 'string',
              description:
                'Raw HTML/CSS/JS for a sandboxed animation overlay drawn on top of this part (invisible ' +
                "iframe, pointer-events:none, can't touch the real page/DOM/cookies). Your <script> can " +
                "listen for window.addEventListener('board:trigger', e => { e.detail.event is " +
                "'hover'|'active'|'click', e.detail.active is boolean }) to react to real hover/press/click " +
                'on the real element. Only offer this when the user wants JS-driven effects (particles, ' +
                'canvas, click reactions). Use animationCss for CSS-only hover/keyframe effects.',
            },
          }
        : {}),
    },
  }
}

function buildPartStylesSchema(headerTypes: string, inputTypes: string, allowCustomScripts: boolean) {
  const blockStyleSchema = buildBlockStyleSchema(allowCustomScripts)
  return {
    type: 'object',
    description:
      "Style a SPECIFIC visual part of the block. Use exactly one key per part you change. " +
      'These match the tabs/buttons in the block\'s own "..." menu 1:1. Do not guess: if the user ' +
      'says "input"/"the text field", that is `input`, never `body`; if they say "button"/"+ button", ' +
      'that is `addButton`; if they say "header"/"title bar"/"shapka", that is `header`. `body` is only ' +
      'for the overall block background/border, i.e. what the "Body style" button controls.',
    properties: {
      body: { ...blockStyleSchema, description: "The block's own background, border, etc. (the 'Body style' button). Every block type has this." },
      header: {
        ...blockStyleSchema,
        description:
          "The title bar, NOT the block body (the 'Header' button). Only blocks with a " +
          `header have this: ${headerTypes}.`,
      },
      input: {
        ...blockStyleSchema,
        description:
          'The "Add a task..." text input (the Input tab under \'Input style\'). ' +
          `Only ${inputTypes} have this.`,
      },
      addButton: {
        ...blockStyleSchema,
        description:
          'The "+" submit button next to the input, NOT the input itself (the Button tab under ' +
          `'Input style'). Only ${inputTypes} have this.`,
      },
    },
  }
}

const elementRectSchema = {
  type: 'object',
  description: "Position/size (percent of the block's OWN box, 0-100) and visibility for one sub-element.",
  properties: {
    x: { type: 'number', description: '0-100, left edge as % of the block width' },
    y: { type: 'number', description: '0-100, top edge as % of the block height' },
    width: { type: 'number', description: '5-100, as % of the block width' },
    height: { type: 'number', description: '5-100, as % of the block height' },
    hidden: { type: 'boolean', description: 'true to hide this sub-element entirely' },
  },
  required: ['x', 'y', 'width', 'height'],
}

function buildElementLayoutSchema() {
  return {
    type: 'object',
    description:
      "Reposition, resize or hide the block's sub-elements, same as the block's 'Layout' button " +
      "(header/body/add-row tabs in the mini position editor). Percentages are relative to the block's " +
      "OWN box, e.g. header {x:0,y:0,width:100,height:20} is a full-width strip across the top 20% of " +
      "the block. A custom layout applies only when EVERY element of the block has a rect here. If " +
      "you include only one key (say, to hide the header), the other elements fall back to the default " +
      "stacked layout. When changing one element, copy the current elementLayout values of the other " +
      "elements from the board state (or, if the block has none yet, use a default like " +
      "header {x:0,y:0,width:100,height:16-20}, body filling the rest, addRow a strip at the bottom).",
    properties: {
      header: { ...elementRectSchema, description: `${elementRectSchema.description} Only blocks with a header have this.` },
      body: { ...elementRectSchema, description: `${elementRectSchema.description} Every block type has this.` },
      addRow: { ...elementRectSchema, description: `${elementRectSchema.description} Only task-list blocks (with an Input style) have this.` },
    },
  }
}

const zIndexSchema = {
  type: 'number',
  description:
    'Stacking order of blocks on the canvas. Higher values are drawn on top when blocks overlap. ' +
    '0 is the default/back. Use this for "put X behind/in front of Y", "send to back", "bring to ' +
    'front" requests. Leave unset to keep the current value.',
}

function buildPropsDescription(allowCustomScripts: boolean): string {
  const htmlBlockNote = allowCustomScripts
    ? 'raw HTML/CSS with <script> tags allowed. It runs sandboxed in an iframe. A read-only ' +
      'window.taskBoardData object is available to any <script> you write: {dailyTasks, weeklyTasks, ' +
      'todayKey, startOfWeekKey}. dailyTasks/weeklyTasks are objects keyed by dateKey (a "YYYY-MM-DD" ' +
      'string, e.g. "2026-08-05"), each value an array of {id, text, done}. IMPORTANT: individual ' +
      'task objects do NOT carry their own date field, the date is ONLY the object key they are filed ' +
      'under (e.g. `for (const [dateKey, tasks] of Object.entries(window.taskBoardData.dailyTasks)) ' +
      "{ /* dateKey is that bucket's date */ }`). If you need to show or compare a dateKey as a real " +
      'date, do NOT use `new Date(dateKey)`. JS parses that string as UTC midnight, so it can ' +
      'render as the wrong calendar day depending on the viewer\'s timezone; instead split it yourself, ' +
      "e.g. `const [y, m, d] = dateKey.split('-').map(Number); const date = new Date(y, m - 1, d)`. " +
      'Nothing is rendered automatically; only what your script/HTML outputs shows up. ' +
      'Use this when the user wants a custom-designed task list/board summary rather than the built-in task blocks.'
    : 'raw HTML/CSS only. <script> tags are removed on this server; use CSS animations/transitions instead of JS'
  return (
    'Block-type-specific fields. NoteBlock: {text}. ImageBlock: {imageUrl (https:// URL), ' +
    "imageFit ('cover'|'contain'|'fill'|'none'), imageZoom (1-4), imageFocusX/imageFocusY (0-100), " +
    "filter: one of the preset NAMES 'none'|'cyberpunk'|'grayscale'|'sepia'|'vivid'|'soft' (not a raw CSS " +
    `filter string; anything else is ignored)}. CustomHtmlBlock: {html: ${htmlBlockNote}}. ` +
    'Task list blocks take no props.'
  )
}

export function buildTools(allowCustomScripts: boolean): ToolDefinition[] {
  const propsDescription = buildPropsDescription(allowCustomScripts)
  const partStylesSchema = buildPartStylesSchema(
    [...HEADER_STYLE_BLOCK_TYPES].join(', '),
    [...INPUT_STYLE_BLOCK_TYPES].join(', '),
    allowCustomScripts,
  )
  const elementLayoutSchema = buildElementLayoutSchema()
  const backgroundHtmlNote = allowCustomScripts
    ? 'Sandboxed HTML/CSS/JS, used when type is "html"'
    : 'Sandboxed HTML/CSS, used when type is "html". <script> tags are removed on this server'

  return [
  {
    name: 'set_background',
    description: "Set the board's shared background (applies to both desktop and mobile).",
    parameters: {
      type: 'object',
      properties: {
        type: { type: 'string', enum: ['color', 'image', 'custom', 'html'] },
        color: { type: 'string', description: 'Hex color, used when type is "color"' },
        imageUrl: { type: 'string', description: 'https:// URL, used when type is "image"' },
        imageFit: { type: 'string', enum: ['cover', 'contain', 'repeat'] },
        customCss: { type: 'string', description: 'Raw CSS declarations for background-* properties' },
        html: { type: 'string', description: backgroundHtmlNote },
      },
      required: ['type'],
    },
  },
  {
    name: 'set_header_style',
    description: 'Style one of the top bar controls: the Edit button, Log out button, or username label.',
    parameters: {
      type: 'object',
      properties: {
        target: { type: 'string', enum: ['edit', 'logout', 'username'] },
        style: basicBlockStyleSchema,
      },
      required: ['target', 'style'],
    },
  },
  {
    name: 'add_block',
    description: `Add a new block to the current board (${BLOCK_TYPES.join(', ')}).`,
    parameters: {
      type: 'object',
      properties: {
        type: { type: 'string', enum: [...BLOCK_TYPES] },
        x: { type: 'number', description: 'Pixels from the left of the canvas' },
        y: { type: 'number', description: 'Pixels from the top of the canvas' },
        width: { type: 'number' },
        height: { type: 'number' },
        props: { type: 'object', description: propsDescription },
        partStyles: partStylesSchema,
        elementLayout: elementLayoutSchema,
        zIndex: zIndexSchema,
        title: {
          type: 'string',
          description:
            "Override the header/title bar TEXT (pairs with partStyles.header for its color/etc). " +
            `Only blocks with a header have this (${[...HEADER_STYLE_BLOCK_TYPES].join(', ')}). Empty ` +
            'string resets to the default title.',
        },
        addButtonIcon: {
          type: 'string',
          description:
            'Override the "+" button\'s icon/symbol (pairs with partStyles.addButton for its color/etc). ' +
            `Only ${[...INPUT_STYLE_BLOCK_TYPES].join(', ')} have this. Keep it very short, e.g. one ` +
            'character or emoji.',
        },
      },
      required: ['type'],
    },
  },
  {
    name: 'update_block',
    description: 'Change an existing block by id (from the board state you were given).',
    parameters: {
      type: 'object',
      properties: {
        id: { type: 'string' },
        x: { type: 'number' },
        y: { type: 'number' },
        width: { type: 'number' },
        height: { type: 'number' },
        props: { type: 'object', description: propsDescription },
        partStyles: partStylesSchema,
        elementLayout: elementLayoutSchema,
        zIndex: zIndexSchema,
        title: {
          type: 'string',
          description:
            "Override the header/title bar TEXT (pairs with partStyles.header for its color/etc). " +
            `Only blocks with a header have this (${[...HEADER_STYLE_BLOCK_TYPES].join(', ')}). Empty ` +
            'string resets to the default title.',
        },
        addButtonIcon: {
          type: 'string',
          description:
            'Override the "+" button\'s icon/symbol (pairs with partStyles.addButton for its color/etc). ' +
            `Only ${[...INPUT_STYLE_BLOCK_TYPES].join(', ')} have this. Keep it very short, e.g. one ` +
            'character or emoji.',
        },
      },
      required: ['id'],
    },
  },
  {
    name: 'patch_block',
    description:
      'Make precise text edits inside ONE field of an existing block without rewriting the rest. Prefer ' +
      'this over update_block whenever the field already has content you want to keep: adding a rule to ' +
      'animationCss, changing a color inside customCss, fixing a line in html. Each edit replaces the ' +
      'exact `find` text with `replace`; `find` must appear exactly once in the current value, copied ' +
      'from the board state as plain text (not JSON-escaped). An empty `find` appends `replace` to the end ' +
      'on a new line. Edits run in order; if any one fails, nothing is changed and you get the reason.',
    parameters: {
      type: 'object',
      properties: {
        id: { type: 'string' },
        field: {
          type: 'string',
          enum: [
            'html',
            'text',
            'body.customCss',
            'body.animationCss',
            'header.customCss',
            'header.animationCss',
            'input.customCss',
            'input.animationCss',
            'addButton.customCss',
            'addButton.animationCss',
            ...(allowCustomScripts
              ? ['body.overlayHtml', 'header.overlayHtml', 'input.overlayHtml', 'addButton.overlayHtml']
              : []),
          ],
          description:
            "'html' is a CustomHtmlBlock's html, 'text' a NoteBlock's text, '<part>.<field>' a part style " +
            '(the same parts as partStyles).',
        },
        edits: {
          type: 'array',
          items: {
            type: 'object',
            properties: {
              find: { type: 'string', description: 'Exact unique text to replace. Empty string = append.' },
              replace: { type: 'string', description: 'Replacement text. Empty string = delete `find`.' },
            },
            required: ['find', 'replace'],
          },
        },
      },
      required: ['id', 'field', 'edits'],
    },
  },
  {
    name: 'patch_background',
    description:
      'Precise text edits inside the html of an "html" board background, same rules as patch_block. ' +
      'Use it to tweak a color, speed or element of the background instead of resending the whole html ' +
      'with set_background.',
    parameters: {
      type: 'object',
      properties: {
        edits: {
          type: 'array',
          items: {
            type: 'object',
            properties: {
              find: { type: 'string', description: 'Exact unique text to replace. Empty string = append.' },
              replace: { type: 'string', description: 'Replacement text. Empty string = delete `find`.' },
            },
            required: ['find', 'replace'],
          },
        },
      },
      required: ['edits'],
    },
  },
  {
    name: 'set_loading_screen',
    description:
      'Set the full-screen loading screen shown while the board loads (until every block, image and ' +
      'HTML frame is ready, 8 seconds at most). It is part of the design and shared by desktop and phone. ' +
      'Send every field you want to keep; a call with no fields resets it to the default spinner.',
    parameters: {
      type: 'object',
      properties: {
        html: {
          type: 'string',
          description: allowCustomScripts
            ? 'Sandboxed HTML/CSS/JS, rendered like the html background (a full-screen iframe).'
            : 'Sandboxed HTML/CSS, rendered like the html background. <script> tags are removed on this server',
        },
        color: { type: 'string', description: 'Hex backdrop color, shown instantly before the html has loaded' },
      },
    },
  },
  {
    name: 'patch_loading_screen',
    description: 'Precise text edits inside the loading screen html, same rules as patch_block.',
    parameters: {
      type: 'object',
      properties: {
        edits: {
          type: 'array',
          items: {
            type: 'object',
            properties: {
              find: { type: 'string', description: 'Exact unique text to replace. Empty string = append.' },
              replace: { type: 'string', description: 'Replacement text. Empty string = delete `find`.' },
            },
            required: ['find', 'replace'],
          },
        },
      },
      required: ['edits'],
    },
  },
  {
    name: 'remove_block',
    description: 'Remove an existing block by id.',
    parameters: {
      type: 'object',
      properties: {
        id: { type: 'string' },
      },
      required: ['id'],
    },
  },
  ]
}
