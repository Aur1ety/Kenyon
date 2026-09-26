import { useEffect, useRef, useState } from 'react';
import Src from './Src.jsx';
import { frac, pct, dropAsChange } from './format.js';

const BASE = import.meta.env.BASE_URL || '/';

/** The video's on-screen captions (kenyon/viz/video.py), in order, with the corrections listed under the transcript:
 * "the fly" is the modelled two-arm choice (README, "Video"), the resting choice has a small innate preference
 * (RESULTS 1.5), and the unpaired odour barely moves rather than being untouched (RESULTS 1.3). */
function transcript(wild, dropB) {
  return [
    ['The resting circuit', 'The circuit can take several odours; at rest the modelled choice has only a small innate preference.'],
    ['Present odour A', 'A specific sparse set of Kenyon cells fires for odour A.'],
    ['Present odour B', 'A different set fires for odour B; the code is odour-specific.'],
    ['Pair odour A with punishment', 'Dopamine (PPL1) arrives with odour A; the Kenyon-cell-to-MBON synapses weaken.'],
    ['Test: the memory is specific', `Odour A barely drives its output cell now; the unpaired odour B barely moves${dropB != null ? ` (${dropAsChange(dropB)} on this page)` : ''}.`],
    ['The choice has changed', `The modelled two-arm choice now avoids A${wild ? `; wild-type flies score an index of ${frac(wild[0])} to ${frac(wild[1])}` : ''}.`],
    ['Reward works too', 'Pairing odour C with reward (PAM), the modelled choice comes to prefer C.'],
    ['One circuit, several memories', 'Specific, in the right compartment, and it changes the modelled choice.'],
  ];
}

export default function VideoSection({ headlines, results }) {
  const [seconds, setSeconds] = useState(null);
  // nothing is fetched until the section comes near the screen; then the metadata (and a first frame) loads
  const [near, setNear] = useState(false);
  const sectionRef = useRef(null);
  useEffect(() => {
    const el = sectionRef.current;
    if (!el || near) return undefined;
    if (typeof IntersectionObserver === 'undefined') { setNear(true); return undefined; }
    const io = new IntersectionObserver((entries) => {
      if (entries.some((e) => e.isIntersecting)) setNear(true);
    }, { rootMargin: '600px 0px' });
    io.observe(el);
    return () => io.disconnect();
  }, [near]);
  const paired = headlines?.items.find((i) => i.id === 'paired_drop')?.value;
  const dropB = headlines?.items.find((i) => i.id === 'unpaired_drop')?.perOdour?.B;
  const wild = results?.q?.behaviour.wildType || null;
  return (
    <section id="video" className="section section--sub" aria-labelledby="video-h" ref={sectionRef}>
      <div className="section__inner section__inner--narrow">
        <p className="eyebrow">The video</p>
        <h3 id="video-h" className="section__h">The same model, rendered by the Python code</h3>
        <p className="section__lede">
          An odour lights up its Kenyon cells at their scanned positions, punishment dopamine arrives, the output
          cell&apos;s response to that odour drops{paired != null ? <> to about {pct(1 - paired)}</> : null} while an
          unpaired odour barely moves, then a reward memory on a third odour.
        </p>
        <figure className="video">
          <video
            controls
            preload={near ? 'metadata' : 'none'}
            playsInline
            muted
            width="1280"
            height="720"
            aria-describedby="video-transcript"
            onLoadedMetadata={(e) => setSeconds(e.currentTarget.duration)}
          >
            <source src={`${BASE}media/mb_memory.mp4`} type="video/mp4" />
            Your browser cannot play this video. <a href={`${BASE}media/mb_memory.mp4`}>Download it</a>.
          </video>
          <figcaption>
            {Number.isFinite(seconds) ? `${Math.round(seconds)} s, no sound. ` : 'No sound. '}
            The choice bar is read through the valence rule of thumb, not through the simulated descending neurons, so the
            last caption (&ldquo;it changes what the fly does&rdquo;) means that modelled readout. The drop&apos;s size is
            the calibration to Hige et al. 2015. Rendered by <Src path="kenyon/viz/video.py" />.
          </figcaption>
        </figure>
        <details className="more" id="video-transcript">
          <summary>Transcript of the on-screen captions</summary>
          <ol className="list">
            {transcript(wild, dropB).map(([a, b]) => <li key={a}><strong>{a}.</strong> {b}</li>)}
          </ol>
          <p className="small muted">
            The transcript follows the video&apos;s captions with three corrections. Where they say &ldquo;the fly&rdquo;, it
            says &ldquo;the modelled choice&rdquo;, since that is what the bar shows. Where they say the resting circuit has
            &ldquo;no preference&rdquo;, it says a small innate preference (RESULTS 1.5). Where they say the unpaired odour
            is &ldquo;untouched&rdquo;, it says it barely moves: it loses a little of its drive, through the Kenyon cells it
            shares with A (RESULTS 1.3).
          </p>
        </details>
      </div>
    </section>
  );
}
