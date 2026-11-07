// Test-only: a drawn tree as the person reads it. A row Box with a gap puts a
// space between its children, a column Box a line break; a link reads as its
// label and an icon as `[alt]`.
type Node = { type: string; props?: Record<string, unknown>; children?: unknown[] } | string

const MD_LINK = /\[([^\]]*)\]\([^)]*\)/g

export function shown(node: unknown): string {
  if (typeof node === 'string') return node
  if (typeof node === 'number') return String(node)
  if (!node || typeof node !== 'object') return ''
  const { type, props = {}, children = [] } = node as Exclude<Node, string>
  const kids = children.map(shown)
  switch (type) {
    case 'Svg':
      return `[${String(props.alt)}]`
    case 'Markdown':
      return String(props.text).replace(MD_LINK, '$1')
    case 'Box': {
      if (props.flexDirection === 'column') return kids.filter(Boolean).join('\n')
      const isGapless = !props.gap && !props.columnGap

      return kids.filter(Boolean).join(isGapless ? '' : ' ')
    }
    default:
      return kids.join('')
  }
}

export const lines = (node: unknown) => shown(node).split('\n')
