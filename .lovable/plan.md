
User found the "Snimaj" button in DailyStandupSheet but reports it doesn't work. They want toggle behavior (click to start, click again to stop) — not press-and-hold.

Looking at the existing code in `src/components/projects/DailyStandupSheet.tsx`:
- The button already IS toggle-style (separate `startRecording` / `stopRecording` handlers, swaps between Mic/MicOff buttons based on `recording` state).
- So the "moram držati" perception likely comes from: recognition silently failing → `onerror`/`onend` fires immediately → `recording` flips back to false → user thinks they need to hold.

Likely root causes for "ne radi":
1. **No mic permission** — `r.start()` throws or `onerror` fires with `not-allowed`; we silently set `recording=false` with no user feedback.
2. **iOS / unsupported browser** — `webkitSpeechRecognition` may exist but fail; no error shown.
3. **`continuous=true` + auto-stop** — some browsers stop after silence; we don't auto-restart.
4. **State race** — `recognition` stored in state but `stopRecording` may run before state is set.

## Plan

**File:** `src/components/projects/DailyStandupSheet.tsx`

1. **Robust toggle with proper error feedback**
   - Add explicit `navigator.mediaDevices.getUserMedia({ audio: true })` permission request before starting recognition → triggers native mic prompt clearly.
   - Show `showError` with translated message on permission denial / no support / start failure (instead of silent fail).
   - Show `showSuccess` ("Snimanje pokrenuto") when recording actually starts (`onstart` handler).

2. **Reliable start/stop toggle**
   - Move `recognition` to `useRef` instead of `useState` (avoids stale closures, ensures `stopRecording` always sees current instance).
   - On `onend`: if user hasn't manually stopped (track via `manualStopRef`), auto-restart to keep continuous dictation working on Chrome/Android (which auto-stops after pause).
   - On `onerror`: distinguish `no-speech` (ignore, keep going) from `not-allowed`/`audio-capture` (stop + show error).

3. **Visual recording indicator**
   - Add pulsing red dot on the "Zaustavi" button while recording so it's obvious it's listening.
   - Add small live transcription preview hint already exists via Textarea — keep, but make sure interim text is visible immediately.

4. **iOS guidance**
   - On iOS Safari (no Web Speech API), show clearer message: "Glasovni unos nije podržan na iPhone-u. Koristi tipkovnicu ili Chrome na Androidu."

5. **i18n keys** — add to `hr.json`, `en.json`, `de.json`:
   - `projects.standup.permissionDenied` — "Pristup mikrofonu odbijen. Dopusti mikrofon u postavkama preglednika."
   - `projects.standup.recordingStarted` — "Snimanje pokrenuto — govori..."
   - `projects.standup.recordingStopped` — "Snimanje zaustavljeno"
   - `projects.standup.iosNotSupported` — "Glasovni unos ne radi na iPhone Safariju. Koristi tipkovnicu."
   - `projects.standup.startFailed` — "Snimanje nije moglo započeti. Pokušaj ponovno."

**No DB changes, no new dependencies.** Pure UX fix in one component + 3 locale files.
