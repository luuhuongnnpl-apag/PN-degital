# PN Digital – Drive title-search pilot

The Apps Script pilot performs a bounded, read-only search for Law curriculum documents.

## Update
Replace `Code.gs` and `Admin.html` in the existing Apps Script project with the files in this folder. Keep the manifest scopes limited to:
- `https://www.googleapis.com/auth/drive.readonly`
- `https://www.googleapis.com/auth/userinfo.email`

## Runtime design
- Three independent filename-only searches for CTĐT / chương trình đào tạo.
- Maximum 60 results per query and 120 unique candidates overall.
- No fullText search, whole-Drive iteration, parent-folder lookups, modification-time or size calls.
- No Drive file/folder creation or mutation.
- Image/video and selected sensitive-name keywords are excluded.
- Classification is heuristic and requires manual review; this is not a complete Drive inventory.

Deploy as a private Apps Script web app (Only myself) only after the owner verifies the requested read-only OAuth scope. Never publish the resulting Drive URLs or index data to public GitHub Pages.
