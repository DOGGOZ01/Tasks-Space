import { useEditor, useNode } from '@craftjs/core'
import { BlockShell } from '../BlockShell'
import type { BlockStyle } from '../blockStyle'
import { applyGeometry } from '../geometry'

export function NoteBlock() {
  const {
    id,
    connectors: { connect },
    x,
    y,
    width,
    height,
    text,
    style,
    headerStyle,
    titleOverride,
    actions: { setProp },
  } = useNode((node) => ({
    x: node.data.props.x as number,
    y: node.data.props.y as number,
    width: node.data.props.width as number,
    height: node.data.props.height as number,
    text: (node.data.props.text ?? '') as string,
    style: (node.data.props.style ?? {}) as BlockStyle,
    headerStyle: (node.data.props.headerStyle ?? {}) as BlockStyle,
    titleOverride: (node.data.props.titleOverride ?? '') as string,
  }))
  const { actions } = useEditor()

  return (
    <BlockShell
      craftRef={connect}
      title="Note"
      x={x}
      y={y}
      width={width}
      height={height}
      style={style}
      onStyleChange={(next) => setProp((props: Record<string, any>) => { props.style = next })}
      titleOverride={titleOverride}
      onTitleChange={(next) => setProp((props: Record<string, any>) => { props.titleOverride = next })}
      headerStyle={headerStyle}
      onHeaderStyleChange={(next) => setProp((props: Record<string, any>) => { props.headerStyle = next })}
      onGeometryChange={(geometry) => applyGeometry(setProp, geometry)}
      onRemove={() => actions.delete(id)}
    >
      <textarea
        className="note-block-textarea"
        value={text}
        onChange={(e) => {
          const value = e.target.value
          setProp((props: Record<string, any>) => {
            props.text = value
          })
        }}
        placeholder="Write a reminder..."
      />
    </BlockShell>
  )
}

NoteBlock.craft = {
  displayName: 'NoteBlock',
  props: { x: 40, y: 40, width: 260, height: 160, text: '', style: {}, headerStyle: {}, titleOverride: '' },
}
