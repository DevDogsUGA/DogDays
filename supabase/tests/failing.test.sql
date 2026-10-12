begin;
select plan(1);
select is(1, 2, 'a deliberately failing assertion');
select * from finish();
rollback;
