// You — name, what you do, introduction, photo.
//
// The fields with structural consequence. An unnamed portfolio does not really
// render, which is why name comes first here as it does at first run.

import FocusPanel from '../FocusPanel';
import BilingualField from '../BilingualField';
import SuggestionOffer from '../SuggestionOffer';
import { studioStrings } from '../../../lib/studio/strings';
import { hasSuggestion } from '../../../lib/studio/editor';

// NOTE: there is no photo control here yet, deliberately. Media replacement and
// cropping arrive with the media pipeline; until then this panel shows nothing
// for the photo rather than a disabled button. A dead control teaches a client
// that the product is unfinished, and invites a click that cannot be answered.

export default function YouPanel({
  draft,
  lang,
  focus,
  onClose,
  onField,
  onKeepSuggestion,
  onAnotherSuggestion,
}) {
  const s = studioStrings(lang);

  return (
    <FocusPanel title={s.panelYou} onClose={onClose} footer={<span>✓ {s.saved}</span>}>
      <BilingualField
        label={s.fName}
        value={draft.name}
        uiLang={lang}
        autoFocus={focus === 'name'}
        onChange={(l, v) => onField('name', l, v)}
      />

      <BilingualField
        label={s.fTitle}
        value={draft.title}
        uiLang={lang}
        autoFocus={focus === 'title'}
        onChange={(l, v) => onField('title', l, v)}
      />

      <div className="withOffer">
        <BilingualField
          label={s.fBio}
          value={draft.bio}
          uiLang={lang}
          multiline
          autoFocus={focus === 'bio'}
          onChange={(l, v) => onField('bio', l, v)}
        />
        {/* The offer sits under the field it concerns, and is gone the moment
            the client keeps it or types their own. */}
        {hasSuggestion(draft, 'bio') && (
          <SuggestionOffer
            lang={lang}
            onKeep={() => onKeepSuggestion('bio')}
            onAnother={() => onAnotherSuggestion('bio')}
            onMine={() => onKeepSuggestion('bio')}
          />
        )}
      </div>

      {/* Beneath the introduction, because it annotates it. Ninety characters
          is about one clause — the cap is the mechanism that keeps this from
          becoming a second bio. */}
      <BilingualField
        label={s.fShortLine}
        value={draft.shortLine}
        uiLang={lang}
        maxLength={90}
        placeholder={s.fShortLineHint}
        autoFocus={focus === 'shortLine'}
        onChange={(l, v) => onField('shortLine', l, v)}
      />

      <style jsx>{`
        .withOffer { display: grid; gap: var(--space-2); }
      `}</style>
    </FocusPanel>
  );
}
