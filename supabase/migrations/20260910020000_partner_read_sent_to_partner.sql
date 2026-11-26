-- Let content partners read submissions that have been sent to them for final
-- approval (previously they could only read already-approved ones).
DROP POLICY IF EXISTS "subs_partner_read_sent" ON public.submissions;
CREATE POLICY "subs_partner_read_sent" ON public.submissions FOR SELECT USING (
  public.has_role(auth.uid(), 'content_partner')
  AND status = 'sent_to_partner'
  AND EXISTS (
    SELECT 1 FROM public.tasks t
    JOIN public.contracts c ON c.id = t.contract_id
    WHERE t.id = submissions.task_id
      AND c.content_partner_id = public.current_partner_id(auth.uid())
  )
);
