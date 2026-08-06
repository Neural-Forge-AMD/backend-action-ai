create extension if not exists pgtap with schema extensions;

begin;
select extensions.plan(6);

delete from public.biggie_price_history
where competitor_name = '__trigger_test_coyote__';

insert into public.biggie_price_history
  (competitor_name, item_name, price, currency, scraped_at)
values
  ('__trigger_test_coyote__', 'Latte', 4.50, 'USD', '2026-08-06 10:00:00+00');

select extensions.is(
  (select count(*) from public.competitor_price_change_events
    where competitor_name = '__trigger_test_coyote__'),
  0::bigint,
  'the first observation stays quiet'
);

insert into public.biggie_price_history
  (competitor_name, item_name, price, currency, scraped_at)
values
  ('__trigger_test_coyote__', 'Latte', 4.50, 'USD', '2026-08-06 10:05:00+00');

select extensions.is(
  (select count(*) from public.competitor_price_change_events
    where competitor_name = '__trigger_test_coyote__'),
  0::bigint,
  'an unchanged price stays quiet'
);

insert into public.biggie_price_history
  (competitor_name, item_name, price, currency, scraped_at)
values
  ('__trigger_test_coyote__', 'Latte', 5.00, 'USD', '2026-08-06 10:10:00+00');

select extensions.is(
  (select count(*) from public.competitor_price_change_events
    where competitor_name = '__trigger_test_coyote__'),
  1::bigint,
  'a changed price creates one event'
);

select extensions.is(
  (select old_price from public.competitor_price_change_events
    where competitor_name = '__trigger_test_coyote__'),
  4.50::numeric,
  'the event stores the previous price'
);

select extensions.is(
  (select new_price from public.competitor_price_change_events
    where competitor_name = '__trigger_test_coyote__'),
  5.00::numeric,
  'the event stores the new price'
);

-- Backfilled history must not create a new live event.
insert into public.biggie_price_history
  (competitor_name, item_name, price, currency, scraped_at)
values
  ('__trigger_test_coyote__', 'Latte', 3.75, 'USD', '2026-08-06 09:00:00+00');

select extensions.is(
  (select count(*) from public.competitor_price_change_events
    where competitor_name = '__trigger_test_coyote__'),
  1::bigint,
  'a late backfill does not emit a live event'
);

select * from extensions.finish();
rollback;
