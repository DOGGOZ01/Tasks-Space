import { ROOT_NODE } from '@craftjs/core'
import type { ReactElement } from 'react'
import type { BlockStyle } from '../blockStyle'
import type { BoardBackground } from '../boardBackground'
import type { BlockElementId, ElementLayout, ElementRect } from '../elementLayout'
import { clamp, MIN_BLOCK_HEIGHT, MIN_BLOCK_WIDTH } from '../geometry'
import type { HeaderStyle, HeaderStyleTarget } from '../headerStyle'
import type { LoadingScreen } from '../loadingScreen'
import { CustomHtmlBlock } from '../blocks/CustomHtmlBlock'
import { DailyTaskListBlock } from '../blocks/DailyTaskListBlock'
import { ImageBlock } from '../blocks/ImageBlock'
import { NoteBlock } from '../blocks/NoteBlock'
import { OverdueTaskListBlock } from '../blocks/OverdueTaskListBlock'
import { WeeklyTaskListBlock } from '../blocks/WeeklyTaskListBlock'
import { BLOCK_PROP_KEYS, BLOCK_TYPES, HEADER_STYLE_BLOCK_TYPES, INPUT_STYLE_BLOCK_TYPES } from './tools'
import type { BlockTypeName } from './tools'
import type { ToolCallRequest } from './types'

const HEX_COLOR_RE = /^#(?:[0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/
const SAFE_IMAGE_URL_RE = /^https:\/\//i
const BACKGROUND_TYPES = new Set(['color', 'image', 'custom', 'html'])
const BACKGROUND_FITS = new Set(['cover', 'contain', 'repeat'])
const IMAGE_FITS = new Set(['cover', 'contain', 'fill', 'none'])
const IMAGE_FILTER_PRESETS = new Set(['none', 'cyberpunk', 'grayscale', 'sepia', 'vivid', 'soft'])
const MAX_NOTE_TEXT_LENGTH = 10000
const MAX_HTML_PROP_LENGTH = 20000
const MAX_BACKGROUND_HTML_LENGTH = 20000

const BLOCK_RENDERERS: Record<BlockTypeName, () => ReactElement> = {
  NoteBlock: () => <NoteBlock />,
  ImageBlock: () => <ImageBlock />,
  CustomHtmlBlock: () => <CustomHtmlBlock />,
  DailyTaskListBlock: () => <DailyTaskListBlock />,
  WeeklyTaskListBlock: () => <WeeklyTaskListBlock />,
  OverdueTaskListBlock: () => <OverdueTaskListBlock />,
}

export interface ApplyContext {
  actions: any
  query: any
  canvasWidth: number
  canvasHeight: number
  background: BoardBackground
  headerStyle: HeaderStyle
  loadingScreen: LoadingScreen
  allowCustomScripts: boolean
  setBackground: (next: BoardBackground) => void
  setHeaderStyle: (next: HeaderStyle) => void
  setLoadingScreen: (next: LoadingScreen) => void
}

export type SanitizeCheckKind = 'html' | 'customCss' | 'animationCss'

export interface SanitizeCheck {
  label: string
  kind: SanitizeCheckKind
  value: string
}

export interface ApplyResult {
  toolCall: ToolCallRequest
  summary: string
  error?: string
  checks?: SanitizeCheck[]
}

function styleChecks(label: string, style: BlockStyle | null): SanitizeCheck[] {
  if (!style) return []
  const checks: SanitizeCheck[] = []
  if (style.customCss) checks.push({ label: `${label}.customCss`, kind: 'customCss', value: style.customCss })
  if (style.animationCss) checks.push({ label: `${label}.animationCss`, kind: 'animationCss', value: style.animationCss })
  if (style.overlayHtml) checks.push({ label: `${label}.overlayHtml`, kind: 'html', value: style.overlayHtml })
  return checks
}

function partStyleChecks(partStyles: PartStyles): SanitizeCheck[] {
  return [
    ...styleChecks('body', partStyles.body),
    ...styleChecks('header', partStyles.header),
    ...styleChecks('input', partStyles.input),
    ...styleChecks('addButton', partStyles.addButton),
  ]
}

function cleanStyle(raw: unknown, allowCustomScripts: boolean): BlockStyle {
  if (!raw || typeof raw !== 'object') return {}
  const s = raw as Record<string, unknown>
  const out: BlockStyle = {}
  if (typeof s.background === 'string' && HEX_COLOR_RE.test(s.background)) out.background = s.background
  if (typeof s.textColor === 'string' && HEX_COLOR_RE.test(s.textColor)) out.textColor = s.textColor
  if (typeof s.borderColor === 'string' && HEX_COLOR_RE.test(s.borderColor)) out.borderColor = s.borderColor
  if (typeof s.borderWidth === 'number') out.borderWidth = clamp(s.borderWidth, 0, 12)
  if (typeof s.borderRadius === 'number') out.borderRadius = clamp(s.borderRadius, 0, 60)
  if (typeof s.opacity === 'number') out.opacity = clamp(s.opacity, 0.1, 1)
  if (typeof s.customCss === 'string') out.customCss = s.customCss.slice(0, 4000)
  if (typeof s.animationCss === 'string') out.animationCss = s.animationCss.slice(0, 4000)
  if (allowCustomScripts && typeof s.overlayHtml === 'string') out.overlayHtml = s.overlayHtml.slice(0, 20000)
  return out
}

function cleanProps(type: BlockTypeName, raw: unknown): Record<string, unknown> {
  if (!raw || typeof raw !== 'object') return {}
  const source = raw as Record<string, unknown>
  const out: Record<string, unknown> = {}
  for (const key of BLOCK_PROP_KEYS[type]) {
    if (!(key in source)) continue
    const value = source[key]
    if (key === 'imageUrl') {
      if (typeof value === 'string' && value.length <= 2000 && (value === '' || SAFE_IMAGE_URL_RE.test(value))) {
        out[key] = value
      }
      continue
    }
    if (key === 'html') {
      if (typeof value === 'string') out[key] = value.slice(0, MAX_HTML_PROP_LENGTH)
      continue
    }
    if (key === 'text') {
      if (typeof value === 'string') out[key] = value.slice(0, MAX_NOTE_TEXT_LENGTH)
      continue
    }
    if (key === 'imageFit') {
      if (typeof value === 'string' && IMAGE_FITS.has(value)) out[key] = value
      continue
    }
    if (key === 'filter') {
      if (typeof value === 'string' && IMAGE_FILTER_PRESETS.has(value)) out[key] = value
      continue
    }
    if (key === 'imageZoom') {
      if (typeof value === 'number') out[key] = clamp(value, 1, 4)
      continue
    }
    if (key === 'imageFocusX' || key === 'imageFocusY') {
      if (typeof value === 'number') out[key] = clamp(value, 0, 100)
      continue
    }
    out[key] = value
  }
  return out
}

interface PartStyles {
  body: BlockStyle | null
  header: BlockStyle | null
  input: BlockStyle | null
  addButton: BlockStyle | null
}

function readPartStyles(args: Record<string, unknown>, allowCustomScripts: boolean): PartStyles {
  const raw = args.partStyles
  const parts = raw && typeof raw === 'object' ? (raw as Record<string, unknown>) : {}
  return {
    body: parts.body !== undefined ? cleanStyle(parts.body, allowCustomScripts) : null,
    header: parts.header !== undefined ? cleanStyle(parts.header, allowCustomScripts) : null,
    input: parts.input !== undefined ? cleanStyle(parts.input, allowCustomScripts) : null,
    addButton: parts.addButton !== undefined ? cleanStyle(parts.addButton, allowCustomScripts) : null,
  }
}

function cleanElementRect(raw: unknown): ElementRect | null {
  if (!raw || typeof raw !== 'object') return null
  const r = raw as Record<string, unknown>
  if (
    typeof r.x !== 'number' ||
    typeof r.y !== 'number' ||
    typeof r.width !== 'number' ||
    typeof r.height !== 'number'
  ) {
    return null
  }
  const width = clamp(r.width, 5, 100)
  const height = clamp(r.height, 5, 100)
  const x = clamp(Math.min(r.x, 100 - width), 0, 100)
  const y = clamp(Math.min(r.y, 100 - height), 0, 100)
  const out: ElementRect = { x, y, width, height }
  if (r.hidden === true) out.hidden = true
  return out
}

function cleanElementLayout(raw: unknown, elementIds: BlockElementId[]): ElementLayout {
  if (!raw || typeof raw !== 'object') return {}
  const source = raw as Record<string, unknown>
  const out: ElementLayout = {}
  for (const id of elementIds) {
    if (!(id in source)) continue
    const rect = cleanElementRect(source[id])
    if (rect) out[id] = rect
  }
  return out
}

function elementIdsFor(blockType: BlockTypeName | undefined): BlockElementId[] {
  if (!blockType) return ['body']
  return [
    ...(HEADER_STYLE_BLOCK_TYPES.has(blockType) ? (['header'] as const) : []),
    'body' as const,
    ...(INPUT_STYLE_BLOCK_TYPES.has(blockType) ? (['addRow'] as const) : []),
  ]
}

function cleanGeometry(
  raw: Record<string, unknown>,
  canvasWidth: number,
  canvasHeight: number,
  fallback: { x: number; y: number; width: number; height: number },
) {
  const width = clamp(typeof raw.width === 'number' ? raw.width : fallback.width, MIN_BLOCK_WIDTH, canvasWidth)
  const height = clamp(
    typeof raw.height === 'number' ? raw.height : fallback.height,
    MIN_BLOCK_HEIGHT,
    canvasHeight,
  )
  const x = clamp(typeof raw.x === 'number' ? raw.x : fallback.x, 0, Math.max(0, canvasWidth - width))
  const y = clamp(typeof raw.y === 'number' ? raw.y : fallback.y, 0, Math.max(0, canvasHeight - height))
  return { x, y, width, height }
}

function applySetBackground(call: ToolCallRequest, ctx: ApplyContext): ApplyResult {
  const args = call.arguments
  const type = args.type
  if (typeof type !== 'string' || !BACKGROUND_TYPES.has(type)) {
    return { toolCall: call, summary: '', error: `Invalid background type "${String(type)}".` }
  }
  const next: BoardBackground = { type: type as BoardBackground['type'] }
  if (type === 'color' && typeof args.color === 'string' && HEX_COLOR_RE.test(args.color)) {
    next.color = args.color
  }
  if (type === 'image') {
    if (typeof args.imageUrl === 'string' && SAFE_IMAGE_URL_RE.test(args.imageUrl)) next.imageUrl = args.imageUrl
    if (typeof args.imageFit === 'string' && BACKGROUND_FITS.has(args.imageFit)) {
      next.imageFit = args.imageFit as BoardBackground['imageFit']
    }
  }
  if (type === 'html' && typeof args.html === 'string') next.html = args.html.slice(0, MAX_BACKGROUND_HTML_LENGTH)
  if (typeof args.customCss === 'string') next.customCss = args.customCss.slice(0, 4000)

  ctx.setBackground(next)
  return {
    toolCall: call,
    summary: `Set board background to type "${type}".`,
    checks: next.html ? [{ label: 'background.html', kind: 'html', value: next.html }] : [],
  }
}

function applySetHeaderStyle(call: ToolCallRequest, ctx: ApplyContext): ApplyResult {
  const args = call.arguments
  const target = args.target
  if (target !== 'edit' && target !== 'logout' && target !== 'username') {
    return { toolCall: call, summary: '', error: `Invalid header target "${String(target)}".` }
  }
  const style = cleanStyle(args.style, false)
  ctx.setHeaderStyle({ ...ctx.headerStyle, [target as HeaderStyleTarget]: style })
  return { toolCall: call, summary: `Styled the ${target} button/label.`, checks: styleChecks(target, style) }
}

function applyAddBlock(call: ToolCallRequest, ctx: ApplyContext): ApplyResult {
  const args = call.arguments
  const type = args.type
  if (typeof type !== 'string' || !(BLOCK_TYPES as readonly string[]).includes(type)) {
    return { toolCall: call, summary: '', error: `Unknown block type "${String(type)}".` }
  }
  const blockType = type as BlockTypeName
  const tree = ctx.query.parseReactElement(BLOCK_RENDERERS[blockType]()).toNodeTree()
  const rootId = tree.rootNodeId as string
  const nodeProps = tree.nodes[rootId].data.props as Record<string, unknown>

  const geometry = cleanGeometry(args, ctx.canvasWidth, ctx.canvasHeight, {
    x: (nodeProps.x as number) ?? 0,
    y: (nodeProps.y as number) ?? 0,
    width: (nodeProps.width as number) ?? 100,
    height: (nodeProps.height as number) ?? 100,
  })
  Object.assign(nodeProps, geometry, cleanProps(blockType, args.props))
  const partStyles = readPartStyles(args, ctx.allowCustomScripts)
  nodeProps.style = { ...(nodeProps.style as object), ...(partStyles.body ?? {}) }

  if (HEADER_STYLE_BLOCK_TYPES.has(blockType)) {
    if (partStyles.header) {
      nodeProps.headerStyle = { ...(nodeProps.headerStyle as object), ...partStyles.header }
    }
    if (typeof args.title === 'string') {
      nodeProps.titleOverride = args.title.slice(0, 80)
    }
  }
  if (INPUT_STYLE_BLOCK_TYPES.has(blockType)) {
    if (partStyles.input) {
      nodeProps.inputStyle = { ...(nodeProps.inputStyle as object), ...partStyles.input }
    }
    if (partStyles.addButton) {
      nodeProps.addButtonStyle = { ...(nodeProps.addButtonStyle as object), ...partStyles.addButton }
    }
    if (typeof args.addButtonIcon === 'string') {
      nodeProps.addButtonIcon = args.addButtonIcon.slice(0, 4)
    }
  }
  if (args.elementLayout !== undefined) {
    const elementLayoutUpdate = cleanElementLayout(args.elementLayout, elementIdsFor(blockType))
    if (Object.keys(elementLayoutUpdate).length > 0) nodeProps.elementLayout = elementLayoutUpdate
  }
  if (typeof args.zIndex === 'number') {
    nodeProps.zIndex = clamp(args.zIndex, 0, 100000)
  }

  ctx.actions.addNodeTree(tree, ROOT_NODE)
  const htmlCheck: SanitizeCheck[] =
    typeof nodeProps.html === 'string' && nodeProps.html ? [{ label: 'html', kind: 'html', value: nodeProps.html }] : []
  return {
    toolCall: call,
    summary: `Added a ${blockType} block (id ${rootId}).`,
    checks: [...htmlCheck, ...partStyleChecks(partStyles)],
  }
}

function applyUpdateBlock(call: ToolCallRequest, ctx: ApplyContext): ApplyResult {
  const args = call.arguments
  const id = args.id
  if (typeof id !== 'string') {
    return { toolCall: call, summary: '', error: 'Missing block id.' }
  }
  let existing: any = null
  try {
    existing = ctx.query.node(id).get()
  } catch {
    existing = null
  }
  if (!existing) {
    return { toolCall: call, summary: '', error: `Block "${id}" not found.` }
  }
  const blockType = existing.data.name as BlockTypeName | undefined
  const currentProps = existing.data.props as Record<string, unknown>

  const geometry = cleanGeometry(args, ctx.canvasWidth, ctx.canvasHeight, {
    x: (currentProps.x as number) ?? 0,
    y: (currentProps.y as number) ?? 0,
    width: (currentProps.width as number) ?? 100,
    height: (currentProps.height as number) ?? 100,
  })
  const propUpdates = blockType ? cleanProps(blockType, args.props) : {}
  const partStyles = readPartStyles(args, ctx.allowCustomScripts)
  const headerCapable = blockType != null && HEADER_STYLE_BLOCK_TYPES.has(blockType)
  const inputCapable = blockType != null && INPUT_STYLE_BLOCK_TYPES.has(blockType)
  const titleUpdate = headerCapable && typeof args.title === 'string' ? args.title.slice(0, 80) : null
  const addButtonIconUpdate =
    inputCapable && typeof args.addButtonIcon === 'string' ? args.addButtonIcon.slice(0, 4) : null
  const elementLayoutUpdate =
    args.elementLayout !== undefined ? cleanElementLayout(args.elementLayout, elementIdsFor(blockType)) : null
  const zIndexUpdate = typeof args.zIndex === 'number' ? clamp(args.zIndex, 0, 100000) : null

  ctx.actions.setProp(id, (props: Record<string, unknown>) => {
    Object.assign(props, geometry, propUpdates)
    if (partStyles.body) props.style = { ...(props.style as object), ...partStyles.body }
    if (headerCapable && partStyles.header) {
      props.headerStyle = { ...(props.headerStyle as object), ...partStyles.header }
    }
    if (titleUpdate !== null) props.titleOverride = titleUpdate
    if (inputCapable && partStyles.input) {
      props.inputStyle = { ...(props.inputStyle as object), ...partStyles.input }
    }
    if (inputCapable && partStyles.addButton) {
      props.addButtonStyle = { ...(props.addButtonStyle as object), ...partStyles.addButton }
    }
    if (addButtonIconUpdate !== null) props.addButtonIcon = addButtonIconUpdate
    if (elementLayoutUpdate && Object.keys(elementLayoutUpdate).length > 0) {
      props.elementLayout = elementLayoutUpdate
    }
    if (zIndexUpdate !== null) props.zIndex = zIndexUpdate
  })
  const htmlCheck: SanitizeCheck[] =
    typeof propUpdates.html === 'string' && propUpdates.html
      ? [{ label: 'html', kind: 'html', value: propUpdates.html }]
      : []
  return {
    toolCall: call,
    summary: `Updated block "${id}".`,
    checks: [...htmlCheck, ...partStyleChecks(partStyles)],
  }
}

const PART_STYLE_PROP: Record<string, string> = {
  body: 'style',
  header: 'headerStyle',
  input: 'inputStyle',
  addButton: 'addButtonStyle',
}

const STYLE_FIELD_LIMITS: Record<string, number> = { customCss: 4000, animationCss: 4000, overlayHtml: 20000 }

interface TextEdit {
  find: string
  replace: string
}

function readEdits(raw: unknown): TextEdit[] | string {
  if (!Array.isArray(raw) || raw.length === 0) return 'Missing "edits".'
  const edits: TextEdit[] = []
  for (const item of raw) {
    if (!item || typeof item !== 'object') return 'Each edit must be an object.'
    const { find, replace } = item as Record<string, unknown>
    if (typeof find !== 'string' || typeof replace !== 'string') return 'Each edit needs string "find" and "replace".'
    edits.push({ find, replace })
  }
  return edits
}

function applyTextEdits(current: string, edits: TextEdit[], label: string): string | { error: string } {
  let text = current
  for (const { find, replace } of edits) {
    if (find === '') {
      text = text && !text.endsWith('\n') ? `${text}\n${replace}` : `${text}${replace}`
      continue
    }
    const at = text.indexOf(find)
    if (at === -1) {
      return {
        error:
          `"find" text was not found in ${label}. Copy it exactly from the current board state ` +
          '(unescaped, same spaces and line breaks) or use a shorter unique fragment.',
      }
    }
    if (text.indexOf(find, at + 1) !== -1) {
      return { error: `"find" text occurs more than once in ${label}. Include more surrounding text so it is unique.` }
    }
    text = text.slice(0, at) + replace + text.slice(at + find.length)
  }
  return text
}

function checkKindForField(field: string): SanitizeCheckKind | null {
  if (field === 'html' || field.endsWith('.overlayHtml')) return 'html'
  if (field.endsWith('.customCss')) return 'customCss'
  if (field.endsWith('.animationCss')) return 'animationCss'
  return null
}

function applyPatchBlock(call: ToolCallRequest, ctx: ApplyContext): ApplyResult {
  const args = call.arguments
  const id = args.id
  if (typeof id !== 'string') return { toolCall: call, summary: '', error: 'Missing block id.' }
  let existing: any = null
  try {
    existing = ctx.query.node(id).get()
  } catch {
    existing = null
  }
  if (!existing) return { toolCall: call, summary: '', error: `Block "${id}" not found.` }
  const blockType = existing.data.name as BlockTypeName | undefined
  const currentProps = existing.data.props as Record<string, unknown>

  const field = args.field
  if (typeof field !== 'string') return { toolCall: call, summary: '', error: 'Missing "field".' }
  const edits = readEdits(args.edits)
  if (typeof edits === 'string') return { toolCall: call, summary: '', error: edits }

  let current: string
  let limit: number
  let write: (props: Record<string, unknown>, value: string) => void
  if (field === 'html' || field === 'text') {
    if (!blockType || !BLOCK_PROP_KEYS[blockType].includes(field)) {
      return { toolCall: call, summary: '', error: `A ${String(blockType)} block has no "${field}".` }
    }
    current = typeof currentProps[field] === 'string' ? (currentProps[field] as string) : ''
    limit = field === 'html' ? MAX_HTML_PROP_LENGTH : MAX_NOTE_TEXT_LENGTH
    write = (props, value) => {
      props[field] = value
    }
  } else {
    const [part, styleField] = field.split('.')
    const propKey = PART_STYLE_PROP[part]
    if (!propKey || !(styleField in STYLE_FIELD_LIMITS)) {
      return { toolCall: call, summary: '', error: `Unknown field "${field}".` }
    }
    if (styleField === 'overlayHtml' && !ctx.allowCustomScripts) {
      return { toolCall: call, summary: '', error: 'overlayHtml is disabled on this server.' }
    }
    if (part === 'header' && !(blockType && HEADER_STYLE_BLOCK_TYPES.has(blockType))) {
      return { toolCall: call, summary: '', error: `A ${String(blockType)} block has no header.` }
    }
    if ((part === 'input' || part === 'addButton') && !(blockType && INPUT_STYLE_BLOCK_TYPES.has(blockType))) {
      return { toolCall: call, summary: '', error: `A ${String(blockType)} block has no ${part}.` }
    }
    const style = (currentProps[propKey] as Record<string, unknown> | undefined) ?? {}
    current = typeof style[styleField] === 'string' ? (style[styleField] as string) : ''
    limit = STYLE_FIELD_LIMITS[styleField]
    write = (props, value) => {
      props[propKey] = { ...((props[propKey] as object) ?? {}), [styleField]: value }
    }
  }

  const next = applyTextEdits(current, edits, field)
  if (typeof next !== 'string') return { toolCall: call, summary: '', error: next.error }
  if (next.length > limit) {
    return { toolCall: call, summary: '', error: `${field} would be ${next.length} characters; the limit is ${limit}.` }
  }

  ctx.actions.setProp(id, (props: Record<string, unknown>) => write(props, next))
  const kind = checkKindForField(field)
  return {
    toolCall: call,
    summary: `Edited ${field} of block "${id}".`,
    checks: kind && next ? [{ label: field, kind, value: next }] : [],
  }
}

function applySetLoadingScreen(call: ToolCallRequest, ctx: ApplyContext): ApplyResult {
  const args = call.arguments
  const next: LoadingScreen = {}
  if (typeof args.html === 'string' && args.html) next.html = args.html.slice(0, MAX_BACKGROUND_HTML_LENGTH)
  if (typeof args.color === 'string' && HEX_COLOR_RE.test(args.color)) next.color = args.color
  ctx.setLoadingScreen(next)
  return {
    toolCall: call,
    summary: next.html || next.color ? 'Set the loading screen.' : 'Reset the loading screen to the default.',
    checks: next.html ? [{ label: 'loadingScreen.html', kind: 'html', value: next.html }] : [],
  }
}

function applyPatchLoadingScreen(call: ToolCallRequest, ctx: ApplyContext): ApplyResult {
  const edits = readEdits(call.arguments.edits)
  if (typeof edits === 'string') return { toolCall: call, summary: '', error: edits }
  const next = applyTextEdits(ctx.loadingScreen.html ?? '', edits, 'loadingScreen.html')
  if (typeof next !== 'string') return { toolCall: call, summary: '', error: next.error }
  if (next.length > MAX_BACKGROUND_HTML_LENGTH) {
    return {
      toolCall: call,
      summary: '',
      error: `loadingScreen.html would be ${next.length} characters; the limit is ${MAX_BACKGROUND_HTML_LENGTH}.`,
    }
  }
  ctx.setLoadingScreen({ ...ctx.loadingScreen, html: next })
  return {
    toolCall: call,
    summary: 'Edited the loading screen html.',
    checks: next ? [{ label: 'loadingScreen.html', kind: 'html', value: next }] : [],
  }
}

function applyPatchBackground(call: ToolCallRequest, ctx: ApplyContext): ApplyResult {
  if (ctx.background.type !== 'html') {
    return { toolCall: call, summary: '', error: 'The background is not an html background. Use set_background.' }
  }
  const edits = readEdits(call.arguments.edits)
  if (typeof edits === 'string') return { toolCall: call, summary: '', error: edits }
  const next = applyTextEdits(ctx.background.html ?? '', edits, 'background.html')
  if (typeof next !== 'string') return { toolCall: call, summary: '', error: next.error }
  if (next.length > MAX_BACKGROUND_HTML_LENGTH) {
    return {
      toolCall: call,
      summary: '',
      error: `background.html would be ${next.length} characters; the limit is ${MAX_BACKGROUND_HTML_LENGTH}.`,
    }
  }
  ctx.setBackground({ ...ctx.background, html: next })
  return {
    toolCall: call,
    summary: 'Edited the background html.',
    checks: next ? [{ label: 'background.html', kind: 'html', value: next }] : [],
  }
}

function applyRemoveBlock(call: ToolCallRequest, ctx: ApplyContext): ApplyResult {
  const args = call.arguments
  const id = args.id
  if (typeof id !== 'string' || id === 'ROOT') {
    return { toolCall: call, summary: '', error: 'Invalid block id.' }
  }
  try {
    ctx.query.node(id).get()
  } catch {
    return { toolCall: call, summary: '', error: `Block "${id}" not found.` }
  }
  ctx.actions.delete(id)
  return { toolCall: call, summary: `Removed block "${id}".` }
}

export function describeToolCall(call: ToolCallRequest): string {
  const args = call.arguments
  switch (call.name) {
    case 'set_background':
      return `Set board background to type "${String(args.type)}".`
    case 'set_header_style':
      return `Style the "${String(args.target)}" top bar element.`
    case 'add_block':
      return `Add a ${String(args.type)} block.`
    case 'update_block':
      return `Update block "${String(args.id)}".`
    case 'remove_block':
      return `Remove block "${String(args.id)}".`
    case 'patch_block':
      return `Edit ${String(args.field)} of block "${String(args.id)}".`
    case 'patch_background':
      return 'Edit the background html.'
    case 'set_loading_screen':
      return 'Set the loading screen.'
    case 'patch_loading_screen':
      return 'Edit the loading screen html.'
    default:
      return `Unknown action "${call.name}".`
  }
}

export function applyToolCall(call: ToolCallRequest, ctx: ApplyContext): ApplyResult {
  try {
    switch (call.name) {
      case 'set_background':
        return applySetBackground(call, ctx)
      case 'set_header_style':
        return applySetHeaderStyle(call, ctx)
      case 'add_block':
        return applyAddBlock(call, ctx)
      case 'update_block':
        return applyUpdateBlock(call, ctx)
      case 'remove_block':
        return applyRemoveBlock(call, ctx)
      case 'patch_block':
        return applyPatchBlock(call, ctx)
      case 'patch_background':
        return applyPatchBackground(call, ctx)
      case 'set_loading_screen':
        return applySetLoadingScreen(call, ctx)
      case 'patch_loading_screen':
        return applyPatchLoadingScreen(call, ctx)
      default:
        return { toolCall: call, summary: '', error: `Unknown tool "${call.name}".` }
    }
  } catch (err) {
    return { toolCall: call, summary: '', error: err instanceof Error ? err.message : 'Failed to apply.' }
  }
}
