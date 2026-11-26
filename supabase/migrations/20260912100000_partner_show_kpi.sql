-- KPI metrics are hidden from partners by DEFAULT. A super-admin / manager can
-- toggle visibility per partner (content_partners.show_kpi_data). Enforced in
-- RLS: with the flag off, a partner simply gets no KPI rows back.
ALTER TABLE public.content_partners
  ADD COLUMN IF NOT EXISTS show_kpi_data boolean NOT NULL DEFAULT false;

-- Partners can read qc-approved KPI snapshots for their own contracts ONLY when
-- their partner record has show_kpi_data = true.
DROP POLICY IF EXISTS "kpi_partner_read_qc" ON public.kpi_snapshots;
CREATE POLICY "kpi_partner_read_qc" ON public.kpi_snapshots FOR SELECT USING (
  public.has_role(auth.uid(), 'content_partner')
  AND status = 'qc_approved'
  AND EXISTS (
    SELECT 1
    FROM public.submissions s
    JOIN public.tasks t ON t.id = s.task_id
    JOIN public.contracts c ON c.id = t.contract_id
    JOIN public.content_partners cp ON cp.id = c.content_partner_id
    WHERE s.id = kpi_snapshots.submission_id
      AND c.content_partner_id = public.current_partner_id(auth.uid())
      AND cp.show_kpi_data = true
  )
);
