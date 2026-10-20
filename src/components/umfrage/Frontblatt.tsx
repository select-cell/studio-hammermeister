/** Einstiegsseite der Umfrage (Text aus der bestehenden Umfrage). */
export default function Frontblatt({ salon, monatsname, onStart }: { salon: string; monatsname: string; onStart: () => void }) {
  return (
    <div className="um-seite">
      <div className="hero hero-gross">
        <div className="hero-innen">
          <div className="hero-tag">
            Monatliche Reflexion · {salon} · {monatsname}
          </div>
          <p className="hero-frage">Eine Frage zum Einstieg</p>
          <h1 className="hero-titel kursiv">Woran merken Gäste eigentlich, ob sie vor einem echten Profi sitzen?</h1>
          <div className="hero-trenner" />
        </div>
      </div>

      <div className="karte">
        <p className="text-gedimmt">
          Ein Friseursalon verkauft heute nicht nur Haare. Der Wert eines Salons entsteht nicht nur durch das Resultat – sondern vor
          allem durch das Erlebnis.
        </p>
        <div className="hervorhebung">
          <strong>Das Resultat</strong> entsteht durch unser Handwerk.
          <br />
          <strong>Das Erlebnis</strong> entsteht durch unser Verhalten, unsere Haltung und unseren Umgang mit Gästen und miteinander.
        </div>
        <p className="text-gedimmt">
          Gäste spüren sehr genau, wie sie empfangen werden, wie aufmerksam gearbeitet wird und wie ein Team miteinander umgeht. Dieses
          Zusammenspiel entscheidet darüber, welchen Wert Gäste in einem Salon wahrnehmen – und welchen Preis sie bereit sind zu bezahlen.
        </p>
        <p className="text-gedimmt">
          Deshalb entwickeln wir Professionalität und Verhalten genauso bewusst wie unser Handwerk. Jede Person im Salon bringt ihre
          eigene Persönlichkeit, ihren Stil und ihre Wirkung ein – und ist gleichzeitig eine eigene Personenmarke.
        </p>
        <p className="text-gedimmt">
          Dieses Feedback hilft dabei, Verhalten bewusster wahrzunehmen und weiterzuentwickeln. Durch Selbstreflexion und 360°-Feedback
          wird sichtbar, wie wir auf Gäste und im Team wirken.
        </p>
        <div className="hervorhebung">
          Das Kassensystem zeigt den wirtschaftlichen Erfolg.
          <br />
          <strong>Dieses Feedbacksystem</strong> zeigt monatlich, wie sich Verhalten, Professionalität und Zusammenarbeit entwickeln.
        </div>
        <p className="text-gedimmt">
          Denn Verhalten formt das Erlebnis – und das Erlebnis entscheidet darüber, welchen Wert Gäste sehen und welchen Preis sie bereit
          sind zu bezahlen.
        </p>
      </div>

      <button type="button" className="btn btn-primaer btn-voll" onClick={onStart}>
        Verstanden – Umfrage starten
        <svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <line x1="5" y1="12" x2="19" y2="12" />
          <polyline points="12 5 19 12 12 19" />
        </svg>
      </button>
    </div>
  )
}
