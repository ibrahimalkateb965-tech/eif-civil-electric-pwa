Engineer Islam Fouda Work Management System — V16.19

Changes:
- Delegated Permission Hierarchy: users can only grant permissions they themselves own.
- Scope ceiling: a user cannot grant a scope equal to or higher than their own authority.
- Module ceiling: Viewer/Edit/Approver grants are capped by the grantor's own module level.
- WO delegation checks the grantor's authority on the actual Work Order.
- Team Room managers can add subordinate members/foremen and then manage their permissions.
- New subordinate starts with Assigned Only scope and View-only access only in modules visible to the creator.
- Managers receive people.manage + access.delegate role defaults; engineers receive access.delegate by default.
- Delegation/create changes are written to access audit history.

Security note: this remains the local/offline frontend application architecture. Production remote/mobile security still requires server-side authentication and authorization.
