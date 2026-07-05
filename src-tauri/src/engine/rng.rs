use std::f64::consts::PI;
pub struct SmallRng {
    state: u64,
    cached_gaussian: Option<f64>,
}

impl SmallRng {
    pub fn new() -> Self {
        let t = std::time::SystemTime::now()
            .duration_since(std::time::UNIX_EPOCH)
            .map(|d| d.subsec_nanos() as u64 ^ d.as_secs())
            .unwrap_or(12345);
        let seed = (t ^ (std::process::id() as u64).wrapping_mul(0x9e3779b97f4a7c15)) | 1;
        Self {
            state: seed,
            cached_gaussian: None,
        }
    }

    #[inline]
    pub fn next_u64(&mut self) -> u64 {
        self.state ^= self.state << 13;
        self.state ^= self.state >> 7;
        self.state ^= self.state << 17;
        self.state
    }

    #[inline]
    pub fn next_f64(&mut self) -> f64 {
        (self.next_u64() >> 11) as f64 / (1u64 << 53) as f64
    }

    pub fn next_gaussian(&mut self, mean: f64, std_dev: f64) -> f64 {
        let z = if let Some(cached) = self.cached_gaussian.take() {
            cached
        } else {
            let u1 = (self.next_f64() + 1e-10).min(1.0);
            let u2 = self.next_f64();
            let mag = (-2.0 * u1.ln()).sqrt();
            self.cached_gaussian = Some(mag * (2.0 * PI * u2).sin());
            mag * (2.0 * PI * u2).cos()
        };
        (mean + z * std_dev).max(0.001)
    }
}
