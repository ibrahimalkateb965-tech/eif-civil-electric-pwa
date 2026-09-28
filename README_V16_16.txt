Engineer Islam Fouda Work Management System — V16.16

Changes:
- Fixed company-entry blank-page flow: workspace is revealed before rendering and rendered on the next animation frame.
- Added admin "View as User" from Teams & Permissions with return-to-admin mode.
- Team Room now strictly shows only Work Orders assigned to the person's team/group/name; unassigned WOs are no longer exposed.
- Removed legacy Work Order filters from the operational UI (kept hidden internally for backward compatibility).
- Removed Site/Reinstatement requirements from Work Order entry.
- Site requirements are now captured during Field Survey, with multiple dynamic surface/requirement types, expected quantity, unit and notes.
- Survey requirements automatically seed Reinstatement expected items while preserving Actual quantity separately.
- Team Room displays the site/reinstatement requirements captured by the survey.

Compatibility:
- Existing data/storage is preserved.
- V16.15 remains the recommended rollback point.
