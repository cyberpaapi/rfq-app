const positions = {
  mark: [0, 0], dashboard: [1, 0], rfq: [2, 0], items: [3, 0],
  ai: [0, 1], assign: [1, 1], suppliers: [2, 1], compare: [3, 1],
  award: [0, 2], portal: [1, 2], reports: [2, 2], audit: [3, 2],
  accounts: [0, 3], bell: [1, 3], search: [2, 3], create: [3, 3],
}

export default function BrandIcon({ name, size = 32, className = '' }) {
  const [column, row] = positions[name] || positions.mark
  return <span aria-hidden="true" className={`inline-block shrink-0 ${className}`} style={{
    width: size, height: size,
    backgroundImage: 'url(/brand/opro-icon-grid.png)',
    backgroundSize: '400% 400%',
    backgroundPosition: `${column * 100 / 3}% ${row * 100 / 3}%`,
    backgroundRepeat: 'no-repeat',
  }} />
}
