-- =====================================================================
-- Supplier receipts: 10 MB, PNG / JPG / PDF only
-- ---------------------------------------------------------------------
-- The supplier upload screen already refuses bigger files and other
-- types, but that check only runs in the browser. This makes Storage
-- itself refuse them, so it can't be skipped.
-- =====================================================================

update storage.buckets
set file_size_limit    = 10485760, -- 10 MB
    allowed_mime_types = array['image/jpeg', 'image/png', 'application/pdf']
where id = 'supplierReceipt';

-- check: should show 10485760 and the three types
select id, file_size_limit, allowed_mime_types
from storage.buckets
where id = 'supplierReceipt';
