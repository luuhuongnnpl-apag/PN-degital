# PND – Direct GitHub Pages + Google Drive API

No Apps Script Web App and no intermediary backend. Browser uses Google Identity Services, Google Picker and Drive REST API.

## Before activation (owner action)
1. In Google Cloud Console create/select a project and enable Google Drive API and Google Picker API.
2. Configure OAuth consent screen and add permitted users.
3. Create OAuth Client ID (Web application); authorized JavaScript origin: https://luuhuongnnpl-apag.github.io
4. Create an API key restricted to the required Google APIs and HTTP referrer https://luuhuongnnpl-apag.github.io/*
5. Set CLIENT_ID and API_KEY in config.js. These are public identifiers; never add a client secret.
6. Sign in on PND and use Google Picker to select the provided source folder and a separate empty destination folder. The source ID is prefilled but Picker selection is still required to grant drive.file access.
7. Keep destination folder shared only with intended operators.

## Data boundaries
- OAuth scope is drive.file (least privilege); Picker selection is used to grant access to selected folders/files.
- Source scan reads metadata only; no source file is modified, moved or deleted.
- Uploads are created only in the separately selected destination.
- pnd-catalog.json stores categories, pinned state and activity metadata in destination folder.
- Access token stays in memory only, never localStorage or GitHub.

## Prototype limits
- 500 metadata files per recursive scan, 8 MB per upload.
- Single JSON catalog; simultaneous admin edits can conflict. Use one administrator at a time.
- Activity log is an operational log, not a binary revision-history browser.
- Actual OAuth/API testing requires owner-provided Client ID and API key. Do not claim production-ready until sign-in, Picker, source scan, upload and reload persistence pass.
