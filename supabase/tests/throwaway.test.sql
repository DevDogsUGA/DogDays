begin;
select plan(2);
select has_table('dogdays', 'throwaway', 'the table exists');
select policies_are('dogdays', 'throwaway', array['throwaway_owner'], 'only the owner policy');
select * from finish();
rollback;
