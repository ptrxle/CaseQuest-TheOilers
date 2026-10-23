# HSE action details update

This update uses the attached Lone-Mesa-Energy v4 application. Only HSE record details change. Dashboard, charts, workbook data, page roles, filters, exports, setup/training, parts and the workbook guide retain their existing behavior.

## Demo

1. Select Mesa, open HSE Actions, and View H007.
2. In the HSE dialog, choose the Technician **Demo role**. Add a clearly simulated completion note and an optional evidence reference; submit for review.
3. Switch the dialog's Demo role to HSE Supervisor. Enter a verification note, then Verify closure. H008 keeps the Mesa hold active.
4. Select H008 and repeat submission and verification. Only then does the critical HSE hold clear.
5. Reset demo restores all HSE demo statuses, notes, evidence references and activity across sites. It does not change page filters or workbook records.

Open → In progress → Awaiting verification → Verified closed. Start work is optional; submitting a completed note can go directly to review. Supervisors can return a submission for rework with a note. Source-closed actions remain read-only.

The dialog role is an independent simulation control. It does not change application roles or financial visibility. Browser-local storage is separate from the source dataset; this is not production authentication, a protected audit system, or equipment control. Evidence is a text reference, not a file upload. Source status and headline totals stay unchanged after demo updates.

## Files

- `dist/hse-demo.js`: isolated workflow, demo persistence and site-wide critical hold.
- `dist/hse-details.css`: styles limited to the HSE dialog.
- `dist/index.html`: loads these two files.
- `dist/interactions.js`: delegates the HSE record branch to the new dialog.

All other application assets match the attached version byte-for-byte. Browser checks verified the original dashboard pixel-for-pixel, all eight chart views, all three page roles, seven site scopes, the guide and mobile layouts. HSE checks verified required notes, permission controls, two-action hold, rework, persistence, reset, source immutability and escaped user-entered text.
