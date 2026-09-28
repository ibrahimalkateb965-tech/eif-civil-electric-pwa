Engineer Islam Fouda Professional Base — V16.23

Audit fixes:
- Core company departments are seeded per company: Permits, Quality, Execution, Reinstatement.
- Added direct-manager relationship for each person in company structure.
- A manager can manage only people below him/her in the hierarchy (direct/indirect), or members explicitly created by/assigned under that manager.
- Permission delegation remains capped by the grantor's own effective system permission and department ceiling.
- Department configuration is now also capped by the configuring manager's own effective permissions; a manager cannot raise a department/department manager above his/her own rights.
- V16.22 company-entry blank-page guard retained.
