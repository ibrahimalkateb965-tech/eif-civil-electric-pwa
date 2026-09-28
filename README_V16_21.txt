Engineer Islam Fouda Work Management System — V16.21
Built from V16.20.

Attachment lifecycle update:
- Uploader can delete/replace own attachments only inside a configurable grace window (default 120 minutes).
- Department manager can manage attachments of people under the same department when document edit authority permits.
- Responsible engineer can manage attachments on assigned work orders when document edit authority permits.
- Super Admin can manage attachments at any time.
- Approved evidence can be locked against uploader self-delete.
- Delete/replace/upload actions are recorded in accessAudit1617.
- Admin/company manager can configure delete and replace grace periods from Documents page.
- Delete is implemented as audited unlink/soft-delete metadata so history is retained.
