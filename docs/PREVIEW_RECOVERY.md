# Preview startup recovery

The user reported a blank or loading preview. A damaged saved record with a missing `boot.memberships` field reproduced an empty page and an uncaught rendering error. Storage denial previously sent the design preview to an unusable account form. The exact failure on the user's device was not observed.

The correction validates required saved arrays, displays a preview recovery screen, catches React rendering failures, and keeps an independent HTML startup screen available when app assets fail. Its retry URL requests a fresh page. Temporary mode (`?session=1`) isolates records, files, and backgrounds in memory, preserves saved data, and clearly states that edits expire at reload or page closure.

Local production-base-path validation passed all seven Chromium browser tests, including four recovery cases: incomplete saved state with data preserved, denied localStorage and IndexedDB with actual file download/background upload/map search, aborted app-bundle download followed by successful retry, and an unexpected component rendering failure. The three existing durable preview flows also passed. All eight preview storage unit tests and the shared TypeScript check passed.

The public deployment still requires a successful GitHub Pages workflow and readback. A successful local build alone does not establish that the user's browser has received the correction.
