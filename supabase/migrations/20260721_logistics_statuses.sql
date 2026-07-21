alter table public.inquiries drop constraint if exists inquiries_status_check;
alter table public.inquiry_status_history drop constraint if exists inquiry_status_history_status_check;

update public.inquiries set status = 'scheduled' where status = 'booked';
update public.inquiries set status = 'delivered' where status = 'completed';
update public.inquiry_status_history set status = 'scheduled' where status = 'booked';
update public.inquiry_status_history set status = 'delivered' where status = 'completed';

alter table public.inquiries add constraint inquiries_status_check
  check (status in ('new', 'reviewing', 'quoted', 'accepted', 'scheduled', 'for_pickup', 'picked_up', 'in_transit', 'delivered', 'cancelled'));

alter table public.inquiry_status_history add constraint inquiry_status_history_status_check
  check (status in ('new', 'reviewing', 'quoted', 'accepted', 'scheduled', 'for_pickup', 'picked_up', 'in_transit', 'delivered', 'cancelled'));
