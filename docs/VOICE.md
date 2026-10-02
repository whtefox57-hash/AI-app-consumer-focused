# Voice implementation and remaining acceptance

The implemented pipeline is MediaRecorder and local RMS voice activity detection → authenticated backend Gemini transcription → the selected project agent's real text response → authenticated Gemini synthesis → Web Audio playback. A single session automatically resumes listening after playback. Six named provider voice assignments are configured in the agent editor; their live availability still needs verification. No permanent provider key is sent to the browser.

The microphone requests echo cancellation and noise suppression. A turn needs roughly 250 ms of voiced input, ends after 1.1 seconds of silence, and is capped at 15 seconds. Voice sessions require one selected responder. The current session does not listen during speech playback. To bound audio cost, synthesis reads the first 1,600 characters of a reply; the complete reply remains in the conversation. Stop interrupts local capture/playback; separate microphone and speaker mute controls are available, and the transcript remains visible. Unsupported recording formats and provider failures stop the session and show useful errors. Speech stays disabled until live acceptance.

When the app becomes hidden, capture and playback stop; restarting requires the user to start the session again. Screen locks and background suspension vary by device, so physical testing is required. A provider request already accepted may complete and be billed after Stop. There is no background wake word, continuous background mic, or automatic access to other apps/location. Browser speech synthesis is a labeled device-dependent read-aloud fallback, not the stable assigned provider voice.

Actual microphone and playback were not exercised in this cloud. Chromium browser tests verify UI and state persistence but do not validate audio, VAD accuracy, Safari behavior or speech-provider availability. Complete these checks with the billed provider and hosted HTTPS app:

- On iPhone Safari and Android Chrome, grant microphone permission once; speak two successive turns without pressing Send; verify transcript and audible assigned-voice replies.
- Deny permission; stop during capture, transcription and playback; restart; verify that an old session cannot alter the new session or keep the mic active.
- Mute/unmute microphone and speaker independently, switch project/participants, and verify old playback/capture ends.
- Lock the screen or switch apps and return; verify pause explanation and explicit restart.
- Test quiet/noisy rooms, 15-second limits, browser recording formats, network failure and exhausted quotas.
- Check reported STT/text/TTS ledger entries and actual bill; no hidden fallback or invented transcript on failure.

Native mobile/live duplex speech is deferred until its provider support, pricing and platform policies are verified.
