// Landing page: a minimal front door shown once before the tool starts.
// What it is, three short steps, the warning signs, then a "Let's begin" CTA.

const STEPS = [
  { n: '01', label: 'Baseline', text: 'Where you start' },
  { n: '02', label: 'Rate personas', text: 'Would you flag them?' },
  { n: '03', label: 'Reveal & compare', text: 'The AI, then a retake' },
]

// The six warning signs, each paired with its icon from /badges/assets.
const SIGNS = [
  {
    img: '/badges/assets/ICONS-01.jpg',
    label: 'Surfing radical websites frequently',
  },
  {
    img: '/badges/assets/ICONS-02.jpg',
    label:
      'Sharing extremist views on social media, expressing support or admiration for terrorists or terrorist groups, and the use of violence',
  },
  {
    img: '/badges/assets/ICONS-03.jpg',
    label: 'Sharing extremist views with friends and relatives',
  },
  {
    img: '/badges/assets/ICONS-04.jpg',
    label:
      'Making remarks that promote ill-will or hatred towards people of other races or religions',
  },
  {
    img: '/badges/assets/ICONS-05.jpg',
    label:
      'Expressing intent to participate in acts of violence overseas or in Singapore',
  },
  {
    img: '/badges/assets/ICONS-06.jpg',
    label: 'Inciting others to participate in acts of violence',
  },
]

export default function Landing({ onBegin }) {
  return (
    <div className="landing">
      <header className="landing-header">
        <span className="landing-brand">
          <span className="landing-brand-mark">ISD</span>
          <span className="landing-brand-sub">Internal Security Department</span>
        </span>
        <span className="landing-tag">Public-education prototype</span>
      </header>

      <section className="landing-hero">
        <p className="landing-kicker">Spotting the signs of radicalisation</p>
        <h1 className="landing-title">Would you know it when you see it?</h1>
        <p className="landing-lead">
          Practise telling genuine warning signs apart from ordinary grumbles on synthetic personas.
        </p>
        <button type="button" className="landing-cta" onClick={onBegin}>
          Let&rsquo;s begin →
        </button>
        <p className="landing-meta">Takes about 5 minutes</p>
      </section>

      <section className="landing-steps" aria-label="How it works">
        {STEPS.map((step) => (
          <div key={step.n} className="landing-step">
            <div className="landing-step-num">{step.n}</div>
            <div className="landing-step-label">{step.label}</div>
            <div className="landing-step-text">{step.text}</div>
          </div>
        ))}
      </section>

      <section className="landing-signs">
        <h2 className="landing-signs-title">The warning signs</h2>
        <p className="landing-signs-note">
          Concrete behaviours that signal possible radicalisation risk.
        </p>
        <div className="landing-sign-grid">
          {SIGNS.map((sign) => (
            <div key={sign.img} className="landing-sign">
              <img
                src={sign.img}
                alt={sign.label}
                loading="lazy"
                className="landing-sign-img"
              />
              <div className="landing-sign-label">{sign.label}</div>
            </div>
          ))}
        </div>
      </section>

      <p className="landing-note">
        Synthetic personas · not a diagnosis · anonymised session data
      </p>
    </div>
  )
}
