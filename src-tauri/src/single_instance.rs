pub struct SingleInstanceGuard;

pub fn acquire() -> Option<SingleInstanceGuard> {
    Some(SingleInstanceGuard)
}