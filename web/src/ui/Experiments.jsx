import { useState } from 'react';
import Badge, { STATUS } from './Badge.jsx';
import Src from './Src.jsx';
import { displayName, letter } from './useKenyon.js';
import { frac, pct, pm, dropAsChange } from './format.js';
import { useReducedMotion } from './useReducedMotion.js';
import { cap } from './copy.js';

/**
 * Ready-made experiments on the same circuit: reward, two memories at once, two memories in the same
 * compartment (a negative), and the controls that could have failed. Every number comes from the engine.
 */
export default function Experiments({ model, beta, announce, headlines, results, goToStep, setSelected }) {
  const { actions, modality, sim, masks } = model;
  const rewardTypes = sim && masks ? sim.mb.typesIn(masks.reward) : [];
  const rewardLabel = rewardTypes.length ? rewardTypes.join(', ') : 'the PAM compartments';
  const reduced = useReducedMotion();
  const v = modality === 'visual';
  const N = (x) => (v ? `v${x}` : x);
  const noun = v ? 'object' : 'smell';
  const gap = reduced ? 0 : 1500;

  const [reward, setReward] = useState(null);
  const [both, setBoth] = useState(null);
  const [same, setSame] = useState(null);
  const [busy, setBusy] = useState(false);

  // the Run buttons stay focusable while a run is going (aria-disabled, not disabled), so keyboard focus is not lost
  const runReward = async () => {
    if (busy) return;
    setBusy(true);
    await actions.runSequence([{ odour: N('C'), us: 'reward' }], N('C'));
    const r = actions.readout(N('C'));
    setReward(r);
    setSelected(N('C'));
    setBusy(false);
    announce(`${cap(displayName(N('C')))} paired with reward: drive onto the reward compartments ${dropAsChange(r.dropRewardCompartment)}, onto MBON11 ${dropAsChange(r.dropMBON11)}.`);
  };

  const runBoth = async () => {
    if (busy) return;
    setBusy(true);
    await actions.runSequence([{ odour: N('A'), us: 'punish' }, { odour: N('C'), us: 'reward' }], N('A'), { gapMs: gap });
    const a = actions.readout(N('A'));
    const c = actions.readout(N('C'));
    const ch = actions.choice(N('C'), N('A'), beta);
    const chD = actions.choice(N('D'), N('A'), beta);
    setBoth({ a, c, ch, chD });
    setSelected(N('A'));
    setBusy(false);
    announce(`${cap(displayName(N('A')))} punished and ${displayName(N('C'))} rewarded. Both memories kept: ${displayName(N('A'))} ${dropAsChange(a.dropPunishCompartment)} at MBON11, ${displayName(N('C'))} ${dropAsChange(c.dropRewardCompartment)} in the reward compartments.`);
  };

  const runSame = async () => {
    if (busy) return;
    setBusy(true);
    await actions.runSequence([{ odour: N('A'), us: 'punish' }], null);
    const alone = actions.readout(N('A')).dropMBON11;
    await actions.runSequence([{ odour: N('A'), us: 'punish' }, { odour: N('B'), us: 'punish' }], N('A'), { gapMs: gap });
    const a = actions.readout(N('A')).dropMBON11;
    const b = actions.readout(N('B')).dropMBON11;
    // the same two pairings with the recovery term switched off: a RULE CHANGE, run in its own session
    const s = await actions.runSequence([{ odour: N('A'), us: 'punish' }, { odour: N('B'), us: 'punish' }], null, { condition: 'no_recovery' });
    const aNoRec = s.readout(actions.odourObj(N('A'))).dropMBON11;
    setSame({ alone, a, b, aNoRec });
    setSelected(N('A'));
    setBusy(false);
    announce(`${cap(displayName(N('A')))} then ${displayName(N('B'))}, both punished: ${displayName(N('A'))} keeps ${pct(a / alone)} of its memory. A negative result of the published rule.`);
  };

  const h = headlines ? Object.fromEntries(headlines.items.map((i) => [i.id, i])) : null;

  return (
    <section className="panel-block experiments detail-block" aria-labelledby="exp-h">
      <h4 id="exp-h" className="panel-block__h">More experiments on the same circuit</h4>
      <p className="small muted">Each one resets the memory first, then runs on the {noun}s A to H of the lab.</p>

      <article className="exp">
        <header className="exp__head">
          <h5>Reward</h5>
          <Badge status={STATUS.WIRING} technical>wiring</Badge>
        </header>
        <p>
          Pair {displayName(N('C'))} with the reward signal, the dopamine neurons PAM. Reward also works by weakening synapses, but in
          other compartments (Owald et al. 2015).
        </p>
        <button type="button" className="btn btn--reward" onClick={runReward} aria-disabled={busy}>
          Pair {displayName(N('C'))} with reward
        </button>
        {reward && (
          <dl className="kv">
            <div><dt>Drive onto the reward compartments ({rewardLabel})</dt><dd className="mono">{dropAsChange(reward.dropRewardCompartment)}</dd></div>
            <div><dt>Drive onto MBON11 (the punishment compartment)</dt><dd className="mono">{dropAsChange(reward.dropMBON11)}</dd></div>
          </dl>
        )}
      </article>

      <article className="exp">
        <header className="exp__head">
          <h5>Two memories at once</h5>
          <Badge status={STATUS.WIRING} technical>wiring</Badge>
        </header>
        <p>
          Punish {displayName(N('A'))}, then reward {displayName(N('C'))}. They land in different compartments, so both are kept.
        </p>
        <button type="button" className="btn" onClick={runBoth} aria-disabled={busy}>
          Run: {displayName(N('A'))} + punishment, then {displayName(N('C'))} + reward
        </button>
        {both && (
          <>
            <dl className="kv">
              <div><dt>{cap(displayName(N('A')))}, drive onto MBON11</dt><dd className="mono">{dropAsChange(both.a.dropPunishCompartment)}</dd></div>
              <div><dt>{cap(displayName(N('C')))}, drive onto the reward compartments</dt><dd className="mono">{dropAsChange(both.c.dropRewardCompartment)}</dd></div>
              <div><dt>Modelled P(choose {letter(N('C'))} over {letter(N('A'))}), β {beta}</dt><dd className="mono">{frac(both.ch.PUntrained)} → {frac(both.ch.P)}</dd></div>
              <div><dt>Modelled P(choose {letter(N('D'))}, untouched, over {letter(N('A'))})</dt><dd className="mono">{frac(both.chD.PUntrained)} → {frac(both.chD.P)}</dd></div>
            </dl>
            <p className="small muted">
              {results && !v && (
                <>
                  Over {results.seeds.n} odour draws: A / C = {frac(results.seeds.coexistA.mean)} / {frac(results.seeds.coexistC.mean)}{' '}
                  (<Src path={results.seeds.src} />).{' '}
                </>
              )}
              The order of the choices comes from the wiring with no extra fitting; their size from the fitted β.
            </p>
          </>
        )}
      </article>

      <article className="exp exp--negative">
        <header className="exp__head">
          <h5>Two memories in the same compartment (the same place)</h5>
          <Badge status={STATUS.NEGATIVE} technical>negative</Badge>
        </header>
        <p>
          Punish {displayName(N('A'))}, then punish {displayName(N('B'))}. Both memories want MBON11, and under the published
          rule the second overwrites the first. Real flies hold several.
        </p>
        <button type="button" className="btn" onClick={runSame} aria-disabled={busy}>
          Run: {displayName(N('A'))} + punishment, then {displayName(N('B'))} + punishment
        </button>
        {same && (
          <>
            <dl className="kv">
              <div><dt>{cap(displayName(N('A')))}&apos;s drop at MBON11, alone</dt><dd className="mono">{frac(same.alone)}</dd></div>
              <div><dt>… after {displayName(N('B'))} is trained too</dt><dd className="mono">{frac(same.a)} (keeps {pct(same.a / same.alone)})</dd></div>
              <div><dt>{cap(displayName(N('B')))}&apos;s drop at MBON11</dt><dd className="mono">{frac(same.b)}</dd></div>
            </dl>
            <p className="callout callout--rule">
              <Badge status={STATUS.RULE_CHANGE} technical>rule change</Badge>
              <span>
                With the rule&apos;s recovery term switched off, {displayName(N('A'))} keeps a drop of {frac(same.aNoRec)}. That fixes
                it, but it is no longer the published rule (Gkanias et al. 2022), so it is shown only to explain the failure.
              </span>
            </p>
            {results && (
              <p className="small muted">
                Over {results.seeds.n} draws, {v ? 'object' : 'odour'} A keeps{' '}
                {pm(v ? results.seeds.visual.retained : results.seeds.retained)} of its memory. <Src path={results.seeds.src} />
              </p>
            )}
          </>
        )}
      </article>

      {h && (
        <article className="exp">
          <header className="exp__head">
            <h5>Controls that could have failed</h5>
            <Badge status={STATUS.CONTROL} technical>control</Badge>
          </header>
          <p className="small">
            Computed by the engine when the page loaded, on the results&apos; own odours (A to H; the lesions on A to D, as in
            the write-up&apos;s lesion runs). The learning rate stays at its intact calibration.
          </p>
          <table className="table table--compact">
            <caption>Scramble or remove a piece of the wiring and see whether the result goes away</caption>
            <thead><tr><th scope="col">Change</th><th scope="col">Result</th></tr></thead>
            <tbody>
              <tr>
                <th scope="row">Dopamine-to-MBON map shuffled</th>
                <td>T-maze index at β {h.shuffled_map_control.beta}: <span className="mono">{frac(h.shuffled_map_control.value[0])} → {frac(h.shuffled_map_control.value[1])}</span>; punishment lands on {h.shuffled_map_control.punishLandsOn.join(', ')}</td>
              </tr>
              <tr>
                <th scope="row">APL removed (every driven Kenyon cell fires)</th>
                <td>Unpaired odours&apos; drop at MBON11: <span className="mono">{frac(h.lesion_APL.value[0])} → {frac(h.lesion_APL.value[1])}</span>; the memory leaks, as in flies (Lin et al. 2014)</td>
              </tr>
              <tr>
                <th scope="row">KCg-m Kenyon cells silenced</th>
                <td>Share of the modelled avoidance left: <span className="mono">{pct(h.lesion_KCgm.value)}</span>; a mild impairment, as in flies (Aso et al. 2014)</td>
              </tr>
            </tbody>
          </table>
        </article>
      )}

      <p className="small">
        <button type="button" className="linkbtn" onClick={() => { goToStep(2); }}>
          Go to step 2 (Test other {noun}s) to test them against whatever is in memory now
        </button>
      </p>
    </section>
  );
}

