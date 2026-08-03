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

// Blocks that render a visible title bar (BlockShell's "!decorative" header) --
// ImageBlock/CustomHtmlBlock are decorative and never show one, so header/title
// overrides on them would be silently invisible.
export const HEADER_STYLE_BLOCK_TYPES = new Set<BlockTypeName>([
  'NoteBlock',
  'DailyTaskListBlock',
  'WeeklyTaskListBlock',
  'OverdueTaskListBlock',
])

export const INPUT_STYLE_BLOCK_TYPES = new Set<BlockTypeName>(['DailyTaskListBlock', 'WeeklyTaskListBlock'])

const blockStyleSchema = {
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

function buildPartStylesSchema(headerTypes: string, inputTypes: string) {
  return {
    type: 'object',
    description:
      "Style a SPECIFIC visual part of the block -- pick exactly one key per part you're changing. " +
      'These match the tabs/buttons in the block\'s own "..." menu 1:1. Do not guess -- if the user ' +
      'says "input"/"the text field", that is `input`, never `body`; if they say "button"/"+ button", ' +
      'that is `addButton`; if they say "header"/"title bar"/"shapka", that is `header`. `body` is only ' +
      'for the overall block background/border, i.e. what the "Body style" button controls.',
    properties: {
      body: { ...blockStyleSchema, description: "The block's own background/border, etc -- the 'Body style' button. Every block type has this." },
      header: {
        ...blockStyleSchema,
        description:
          "The title bar specifically, NOT the block body -- the 'Header' button. Only blocks with a " +
          `header have this: ${headerTypes}.`,
      },
      input: {
        ...blockStyleSchema,
        description:
          'The "Add a task..." text input specifically -- the Input tab under \'Add row style\'. ' +
          `Only ${inputTypes} have this.`,
      },
      addButton: {
        ...blockStyleSchema,
        description:
          'The "+" submit button next to the input, NOT the input itself -- the Button tab under ' +
          `'Add row style'. Only ${inputTypes} have this.`,
      },
    },
  }
}

function buildPropsDescription(allowCustomScripts: boolean): string {
  const htmlBlockNote = allowCustomScripts
    ? 'raw HTML/CSS, and <script> tags are allowed -- it runs sandboxed in an iframe. A read-only ' +
      'window.taskBoardData object ({dailyTasks, weeklyTasks -- both {[dateKey]: {id,text,done}[]}, ' +
      'todayKey, startOfWeekKey}) is available to any <script> you write, but nothing is rendered ' +
      "automatically -- only what your own script/HTML explicitly outputs shows up. Use this when the " +
      'user wants a custom-designed task list/board summary rather than the built-in task blocks.'
    : 'raw HTML/CSS only -- <script> tags are stripped on this server, use CSS animations/transitions instead of JS'
  return (
    'Block-type-specific fields. NoteBlock: {text}. ImageBlock: {imageUrl (https:// URL), ' +
    "imageFit ('cover'|'contain'|'fill'|'none'), imageZoom (1-4), imageFocusX/imageFocusY (0-100), " +
    `filter (CSS filter string, e.g. 'grayscale(1)')}. CustomHtmlBlock: {html -- ${htmlBlockNote}}. ` +
    'Task list blocks take no props.'
  )
}

export function buildTools(allowCustomScripts: boolean): ToolDefinition[] {
  const propsDescription = buildPropsDescription(allowCustomScripts)
  const partStylesSchema = buildPartStylesSchema(
    [...HEADER_STYLE_BLOCK_TYPES].join(', '),
    [...INPUT_STYLE_BLOCK_TYPES].join(', '),
  )
  const backgroundHtmlNote = allowCustomScripts
    ? 'Sandboxed HTML/CSS/JS, used when type is "html"'
    : 'Sandboxed HTML/CSS, used when type is "html" -- <script> tags are stripped on this server'

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
        style: blockStyleSchema,
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
