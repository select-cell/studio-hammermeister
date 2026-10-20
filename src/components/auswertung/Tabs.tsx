export interface TabDef<T extends string> {
  id: T
  label: string
}

/** Umschalter in einer Zeile (Ansicht, Tabs der Detailtabelle, Monate). */
export default function Tabs<T extends string>({
  tabs,
  aktiv,
  onWahl,
  label,
  klein = false,
}: {
  tabs: TabDef<T>[]
  aktiv: T
  onWahl: (id: T) => void
  label: string
  klein?: boolean
}) {
  return (
    <div className={`au-tabs${klein ? ' au-tabs-klein' : ''}`} role="group" aria-label={label}>
      {tabs.map((t) => (
        <button key={t.id} type="button" className="au-tab" aria-pressed={t.id === aktiv} onClick={() => onWahl(t.id)}>
          {t.label}
        </button>
      ))}
    </div>
  )
}
