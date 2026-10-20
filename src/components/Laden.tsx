export default function Laden({ text = 'Einen Moment …' }: { text?: string }) {
  return (
    <div className="laden" role="status" aria-live="polite">
      <span className="spinner" aria-hidden="true" />
      <span>{text}</span>
    </div>
  )
}
