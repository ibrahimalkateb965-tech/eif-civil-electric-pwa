Engineer Islam Fouda Work Management System — V16.20

New: Dynamic Department Permission Hierarchy
- Create any department/team dynamically using the existing Teams & Permissions page.
- Configure a Department Manager for each department.
- Configure the department permission ceiling per module: No Access / Viewer / Editor / Approver.
- Department Manager inherits the department ceiling when assigned.
- Department Manager can build/manage the team inside that department only.
- Manager can grant subordinates only permissions that are BOTH:
  1) within the department permission ceiling, and
  2) not higher than the manager's own personal permission.
- Department managers cannot manage members of another department.
- Existing delegated WO access remains supported and is still bounded by the grantor's authority.
- Department/member permission changes are logged in the existing access audit data.

Compatibility:
- Keeps orgTeams/orgPeople and EIF_DATA_MASTER_V1 to preserve existing V16.19 data.
- V16.19 should be retained as rollback.
