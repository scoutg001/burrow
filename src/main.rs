//! burrow: a live node-map of a Pangolin WireGuard mesh.
//!
//! A poll thread fetches topology from Pangolin's integration API and
//! publishes the assembled graph; the HTTP server serves it at /graph plus
//! the static web page. Configuration is environment variables only:
//!
//!   PANGOLIN_API_URL      e.g. http://pangolin:3003/v1  (required)
//!   PANGOLIN_API_TOKEN    "<apiKeyId>.<apiKeySecret>"   (required)
//!   PANGOLIN_ORG_ID       the org to draw               (required)
//!   BURROW_POLL_INTERVAL  seconds between polls          (default 10)
//!   BURROW_LISTEN         bind address                   (default 0.0.0.0:2700)
//!   BURROW_WEBROOT        static files dir               (default ./web)

mod collect;
mod graph;
mod model;
mod server;
mod topology;

use std::path::PathBuf;
use std::sync::{Arc, Mutex};
use std::thread;
use std::time::Duration;

use anyhow::{Context, Result};

use collect::TopologyCollector;
use server::SharedGraph;

fn env_required(name: &str) -> Result<String> {
    std::env::var(name).with_context(|| format!("{name} must be set"))
}

fn poll_loop(collector: Box<dyn TopologyCollector>, graph: SharedGraph, interval: Duration) {
    loop {
        match collector.collect() {
            Ok(t) => {
                let model = graph::assemble(&t);
                *graph.lock().unwrap() = Some(model);
            }
            Err(e) => eprintln!("burrow: poll failed: {e:#}"),
        }
        thread::sleep(interval);
    }
}

fn main() -> Result<()> {
    let api_url = env_required("PANGOLIN_API_URL")?;
    let token = env_required("PANGOLIN_API_TOKEN")?;
    let org_id = env_required("PANGOLIN_ORG_ID")?;
    let interval = Duration::from_secs(
        std::env::var("BURROW_POLL_INTERVAL").ok().and_then(|v| v.parse().ok()).unwrap_or(10),
    );
    let listen = std::env::var("BURROW_LISTEN").unwrap_or_else(|_| "0.0.0.0:2700".into());
    let webroot = PathBuf::from(std::env::var("BURROW_WEBROOT").unwrap_or_else(|_| "./web".into()));

    let collector = Box::new(topology::HttpTopologyCollector::new(&api_url, &token, &org_id));
    let graph: SharedGraph = Arc::new(Mutex::new(None));
    {
        let graph = Arc::clone(&graph);
        thread::spawn(move || poll_loop(collector, graph, interval));
    }
    server::serve(&listen, graph, Some(webroot))
}
